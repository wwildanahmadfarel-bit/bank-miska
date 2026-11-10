import pool, { tangkap, gagal, ok, fail, periodeTertutup } from "@/lib/db";
import { batasNominal, requireRole } from "@/lib/auth";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

// POST /api/angsuran-bayar — teller/admin only
// Db 1-110 total / Kr 1-130 pokok + Kr 4-100 bunga (proporsional)
export async function POST(req: Request) {
  const gate = await requireRole(req, ["teller", "admin"], fail);
  if (gate instanceof Response) return gate;
  let input: Record<string, unknown>;
  try {
    input = await req.json();
  } catch {
    return fail("Body JSON tidak valid");
  }

  const idPiutang = Number(input.id_piutang ?? 0);
  const bayar = Number(input.bayar ?? 0);
  const tanggal = String(input.tanggal ?? new Date().toISOString().slice(0, 10)).trim();

  if (!Number.isInteger(idPiutang) || idPiutang <= 0 || !Number.isFinite(bayar) || bayar <= 0)
    return fail("id_piutang dan bayar > 0 wajib diisi");
  const errBayar = batasNominal(bayar, "Bayar");
  if (errBayar) return fail(errBayar);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return fail("Tanggal harus YYYY-MM-DD");

  let conn: Awaited<ReturnType<typeof pool.getConnection>> | null = null;
  try {
    try {
      conn = await pool.getConnection();
    } catch (e) {
      return gagal("Database tidak terjangkau", e);
    }
    if (await periodeTertutup(conn, tanggal)) return fail("Periode sudah ditutup");
    await conn.beginTransaction();

    const [prows] = await conn.execute<RowDataPacket[]>(
      "SELECT kode_bantu, plafon, total_harus_dibayar, sisa, status FROM tb_piutang WHERE id = ? FOR UPDATE",
      [idPiutang]
    );
    const p = prows[0] as
      | { kode_bantu: string; plafon: number; total_harus_dibayar: number; sisa: number; status: string }
      | undefined;
    if (!p) throw new Error("Piutang tidak ditemukan");
    if (p.status !== "berjalan") throw new Error("Piutang tidak dalam status berjalan");
    if (bayar > Number(p.sisa) + 0.009) throw new Error("Bayar melebihi sisa");

    const total = Number(p.total_harus_dibayar);
    const porsiPokok = total > 0 ? Number(p.plafon) / total : 1;
    // Jamin Db = Kr persis: jika bunga hasil round 0/negatif, serap ke pokok.
    let pokok = Math.round(bayar * porsiPokok * 100) / 100;
    let bunga = Math.round((bayar - pokok) * 100) / 100;
    if (bunga <= 0) {
      bunga = 0;
      pokok = bayar;
    }
    let sisaBaru = Math.round((Number(p.sisa) - bayar) * 100) / 100;
    let statusBaru = "berjalan";
    if (sisaBaru <= 0.009) {
      sisaBaru = 0;
      statusBaru = "lunas";
    }

    await conn.execute("UPDATE tb_piutang SET sisa = ?, status = ? WHERE id = ?", [sisaBaru, statusBaru, idPiutang]);

    // Tandai 1 angsuran terawal yang belum dibayar (portable, tanpa UPDATE...LIMIT)
    const [arows] = await conn.execute<RowDataPacket[]>(
      "SELECT id FROM tb_angsuran WHERE id_piutang = ? AND dibayar IS NULL ORDER BY angsuran_ke ASC LIMIT 1",
      [idPiutang]
    );
    if (arows.length > 0) {
      await conn.execute("UPDATE tb_angsuran SET dibayar = NOW() WHERE id = ?", [(arows[0] as { id: number }).id]);
    }

    const [jh] = await conn.execute<ResultSetHeader>(
      "INSERT INTO tb_jurnal (tanggal, no_bukti, keterangan, tipe) VALUES (?,?,?,?)",
      [tanggal, "4", "Angsuran piutang #" + idPiutang, "ANGSURAN"]
    );
    const idJurnal = jh.insertId;

    await conn.execute(
      "INSERT INTO tb_jurnal_detail (id_jurnal, kode_akun, kode_bantu, debet, kredit) VALUES (?, '1-110', NULL, ?, 0)",
      [idJurnal, bayar]
    );
    await conn.execute(
      "INSERT INTO tb_jurnal_detail (id_jurnal, kode_akun, kode_bantu, debet, kredit) VALUES (?, '1-130', ?, 0, ?)",
      [idJurnal, p.kode_bantu, pokok]
    );
    if (bunga > 0) {
      await conn.execute(
        "INSERT INTO tb_jurnal_detail (id_jurnal, kode_akun, kode_bantu, debet, kredit) VALUES (?, '4-100', NULL, 0, ?)",
        [idJurnal, bunga]
      );
    }

    await conn.commit();
    return ok({ id_jurnal: idJurnal, pokok, bunga, sisa: sisaBaru, status: statusBaru });
  } catch (e) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {
        /* abaikan */
      }
    }
    return tangkap("Gagal bayar angsuran", e);
  } finally {
    if (conn) conn.release();
  }
}

