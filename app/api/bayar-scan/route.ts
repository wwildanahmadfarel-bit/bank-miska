import pool, { tangkap, gagal, ok, fail, periodeTertutup } from "@/lib/db";
import { requireRole, saldoAkhir, normalisasiUid, tanggalHariIni } from "@/lib/auth";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

// POST /api/bayar-scan {kode_qr, uid_kartu? | kode_bantu?}
// Potong saldo tabungan: Db 3-200/Hxxx / Kr <kode_akun merchant>. Teller/admin only.
export async function POST(req: Request) {
  const gate = await requireRole(req, ["teller", "admin"], fail);
  if (gate instanceof Response) return gate;

  let input: Record<string, unknown>;
  try {
    input = await req.json();
  } catch {
    return fail("Body JSON tidak valid");
  }
  const kodeQr = String(input.kode_qr ?? "").toUpperCase().trim();
  const uidRaw = normalisasiUid(input.uid_kartu ?? "");
  const kodeRaw = String(input.kode_bantu ?? "").toUpperCase().trim();
  if (!kodeQr) return fail("kode_qr wajib diisi");
  if (!uidRaw && !kodeRaw) return fail("Tempel kartu (uid_kartu) atau isi kode_bantu");

  let conn: Awaited<ReturnType<typeof pool.getConnection>> | null = null;
  try {
    try {
      conn = await pool.getConnection();
    } catch (e) {
      return gagal("Database tidak terjangkau", e);
    }
    // 1. Resolve pembayar
    let kodeBantu = kodeRaw;
    if (uidRaw) {
      const [u] = await conn.execute<RowDataPacket[]>(
        "SELECT kode FROM tb_pembantu WHERE uid_kartu = ? LIMIT 1",
        [uidRaw]
      );
      if (u.length === 0) return fail("Kartu tidak terdaftar", 404);
      kodeBantu = String((u[0] as { kode: string }).kode).toUpperCase();
    }

    // 2. Ambil tagihan QR
    const [tagihan] = await conn.execute<RowDataPacket[]>(
      `SELECT b.id, b.nominal, b.status, b.kedaluwarsa, b.id_merchant, m.nama AS merchant, m.kode_akun
       FROM tb_bayar_merchant b JOIN tb_merchant m ON m.id = b.id_merchant
       WHERE b.kode_qr = ? LIMIT 1`,
      [kodeQr]
    );
    if (tagihan.length === 0) return fail("QR tidak dikenal", 404);
    const t = tagihan[0] as unknown as {
      id: number; nominal: string | number; status: string;
      kedaluwarsa: string | Date; merchant: string; kode_akun: string;
    };
    if (t.status === "lunas") return fail("QR sudah lunas (double-scan ditolak)");
    if (t.status !== "menunggu") return fail("QR tidak berlaku: " + t.status);
    const expMs = new Date(t.kedaluwarsa).getTime();
    if (!Number.isFinite(expMs) || expMs < Date.now()) {
      await conn.execute("UPDATE tb_bayar_merchant SET status = 'kedaluwarsa' WHERE kode_qr = ?", [kodeQr]);
      return fail("QR kedaluwarsa, buat QR baru");
    }
    const nominal = Number(t.nominal);

    // 3. Cek saldo pembayar (harus TABUNGAN & cukup)
    const info = await saldoAkhir(conn, kodeBantu);
    if (!info) return fail("Kode pembantu tidak dikenal: " + kodeBantu);
    if (info.status !== "TABUNGAN") return fail("Hanya tabungan yang bisa bayar merchant");
    if (info.saldo < nominal) return fail(`Saldo kurang: ${info.nama} sisa ${info.saldo}`);

    // 4. Jurnal double-entry dalam transaksi
    const today = tanggalHariIni();
    if (await periodeTertutup(conn, today)) return fail("Periode sudah ditutup");
    await conn.beginTransaction();
    try {
      const [jh] = await conn.execute<ResultSetHeader>(
        "INSERT INTO tb_jurnal (tanggal, no_bukti, keterangan, tipe) VALUES (?,?,?,?)",
        [today, "M", `Bayar ${t.merchant} ${kodeBantu}`, "BAYAR-MERCHANT"]
      );
      const idJurnal = jh.insertId;
      await conn.execute(
        "INSERT INTO tb_jurnal_detail (id_jurnal, kode_akun, kode_bantu, debet, kredit) VALUES (?, '3-200', ?, ?, 0)",
        [idJurnal, kodeBantu, nominal]
      );
      await conn.execute(
        "INSERT INTO tb_jurnal_detail (id_jurnal, kode_akun, kode_bantu, debet, kredit) VALUES (?, ?, NULL, 0, ?)",
        [idJurnal, t.kode_akun, nominal]
      );
      const [upd] = await conn.execute<ResultSetHeader>(
        `UPDATE tb_bayar_merchant SET status = 'lunas', kode_bantu = ?, id_jurnal = ?, dibayar = NOW()
         WHERE kode_qr = ? AND status = 'menunggu'`,
        [kodeBantu, idJurnal, kodeQr]
      );
      if (upd.affectedRows !== 1) throw new Error("QR sudah dipakai (race ditolak)");
      await conn.commit();
      let sisa: number | null = null;
      try {
        const s = await saldoAkhir(pool, kodeBantu);
        sisa = s?.saldo ?? null;
      } catch {
        sisa = null;
      }
      return ok({ id_jurnal: idJurnal, sisa, merchant: t.merchant });
    } catch (e) {
      try {
        await conn.rollback();
      } catch {
        /* abaikan */
      }
      return tangkap("Gagal bayar", e);
    }
  } catch (e) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {
        /* abaikan */
      }
    }
    return tangkap("Gagal bayar", e);
  } finally {
    if (conn) conn.release();
  }
}

