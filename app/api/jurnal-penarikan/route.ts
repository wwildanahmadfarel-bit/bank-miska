import pool, { tangkap, gagal, ok, fail, periodeTertutup } from "@/lib/db";
import { batas, batasNominal, requireRole, saldoAkhir } from "@/lib/auth";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

// POST /api/jurnal-penarikan — teller/admin only
// Db 3-200 pembantu / Kr 1-110 Kas
export async function POST(req: Request) {
  const gate = await requireRole(req, ["teller", "admin"], fail);
  if (gate instanceof Response) return gate;
  let input: Record<string, unknown>;
  try {
    input = await req.json();
  } catch {
    return fail("Body JSON tidak valid");
  }

  const tanggal = String(input.tanggal ?? "").trim();
  const bukti = String(input.bukti ?? "2").trim() || "2";
  const kode = String(input.kode_bantu ?? "").toUpperCase().trim();
  const jumlah = Number(input.jumlah ?? 0);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return fail("Tanggal harus YYYY-MM-DD");
  if (!kode || !Number.isFinite(jumlah) || jumlah <= 0)
    return fail("kode_bantu dan jumlah > 0 wajib diisi");
  const errKode = batas(kode, 10, "Kode");
  if (errKode) return fail(errKode);
  const errNom = batasNominal(jumlah);
  if (errNom) return fail(errNom);

  let conn: Awaited<ReturnType<typeof pool.getConnection>> | null = null;
  try {
    try {
      conn = await pool.getConnection();
    } catch (e) {
      return gagal("Database tidak terjangkau", e);
    }
    if (await periodeTertutup(conn, tanggal)) return fail("Periode sudah ditutup");
    // Cegah overdraft tabungan
    const info = await saldoAkhir(conn, kode);
    if (!info) return fail("Kode pembantu tidak dikenal: " + kode);
    if (info.status === "TABUNGAN" && info.saldo < jumlah)
      return fail(`Saldo kurang: ${info.nama} sisa ${info.saldo}`);
    // Cegah Kas negatif: penarikan tidak boleh melebihi saldo Kas 1-110
    const [kasRows] = await conn.execute<RowDataPacket[]>(
      "SELECT COALESCE(SUM(debet - kredit), 0) AS kas FROM tb_jurnal_detail WHERE kode_akun = '1-110'"
    );
    const kasSaldo = Number((kasRows[0] as unknown as { kas: number } | undefined)?.kas ?? 0);
    if (kasSaldo < jumlah) return fail("Kas tidak cukup untuk penarikan " + jumlah);
    await conn.beginTransaction();

    const ket = "Penarikan " + kode;
    const [jh] = await conn.execute<ResultSetHeader>(
      "INSERT INTO tb_jurnal (tanggal, no_bukti, keterangan, tipe) VALUES (?,?,?,?)",
      [tanggal, bukti, ket, "PENARIKAN"]
    );
    const idJurnal = jh.insertId;

    try {
      await conn.execute(
        "INSERT INTO tb_jurnal_detail (id_jurnal, kode_akun, kode_bantu, debet, kredit) VALUES (?, '3-200', ?, ?, 0)",
        [idJurnal, kode, jumlah]
      );
    } catch {
      throw new Error("Kode pembantu tidak dikenal: " + kode);
    }
    await conn.execute(
      "INSERT INTO tb_jurnal_detail (id_jurnal, kode_akun, kode_bantu, debet, kredit) VALUES (?, '1-110', NULL, 0, ?)",
      [idJurnal, jumlah]
    );

    await conn.commit();
    // Data nota: nama + sisa saldo setelah tarik + jam transaksi.
    const akhir = await saldoAkhir(conn, kode);
    const [jrows] = await conn.execute<RowDataPacket[]>(
      "SELECT DATE_FORMAT(dibuat, '%H:%i:%s') AS waktu FROM tb_jurnal WHERE id = ? LIMIT 1",
      [idJurnal]
    );
    const waktu = String((jrows[0] as unknown as { waktu: string | null } | undefined)?.waktu ?? "");
    return ok({
      id_jurnal: idJurnal,
      kode,
      nama: info.nama,
      jumlah,
      sisa: akhir ? Math.round(akhir.saldo * 100) / 100 : 0,
      tanggal,
      bukti,
      waktu,
    });
  } catch (e) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {
        /* abaikan */
      }
    }
    return tangkap("Gagal simpan penarikan", e);
  } finally {
    if (conn) conn.release();
  }
}

