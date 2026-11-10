import pool, { tangkap, gagal, ok, fail, periodeTertutup } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import type { ResultSetHeader } from "mysql2/promise";

// POST /api/jurnal-setoran — teller/admin only
// Db 1-110 Kas total / Kr 3-200 per pembantu
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
  const bukti = String(input.bukti ?? "1").trim() || "1";
  const rincianRaw = input.rincian;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return fail("Tanggal harus YYYY-MM-DD");
  if (!Array.isArray(rincianRaw) || rincianRaw.length === 0) return fail("Rincian setoran kosong");

  const bersih: { kode: string; jumlah: number }[] = [];
  let total = 0;
  for (const r of rincianRaw as Record<string, unknown>[]) {
    const kode = String(r?.kode_bantu ?? "").toUpperCase().trim();
    const jumlah = Number(r?.jumlah ?? 0);
    if (!kode || !Number.isFinite(jumlah) || jumlah <= 0)
      return fail("Setiap rincian butuh kode_bantu dan jumlah > 0");
    if (kode.length > 10) return fail("Kode maksimal 10 karakter: " + kode);
    if (jumlah > 999999999999) return fail("Nominal terlalu besar: " + kode);
    total += jumlah;
    bersih.push({ kode, jumlah });
  }
  if (total > 999999999999) return fail("Total setoran terlalu besar");

  let conn: Awaited<ReturnType<typeof pool.getConnection>> | null = null;
  try {
    try {
      conn = await pool.getConnection();
    } catch (e) {
      return gagal("Database tidak terjangkau", e);
    }
    if (await periodeTertutup(conn, tanggal)) return fail("Periode sudah ditutup");
    await conn.beginTransaction();

    const ket = `Setoran ${bersih.length} nasabah`;
    const [jh] = await conn.execute<ResultSetHeader>(
      "INSERT INTO tb_jurnal (tanggal, no_bukti, keterangan, tipe) VALUES (?,?,?,?)",
      [tanggal, bukti, ket, "SETORAN"]
    );
    const idJurnal = jh.insertId;

    await conn.execute(
      "INSERT INTO tb_jurnal_detail (id_jurnal, kode_akun, kode_bantu, debet, kredit) VALUES (?, '1-110', NULL, ?, 0)",
      [idJurnal, total]
    );

    for (const r of bersih) {
      try {
        await conn.execute(
          "INSERT INTO tb_jurnal_detail (id_jurnal, kode_akun, kode_bantu, debet, kredit) VALUES (?, '3-200', ?, 0, ?)",
          [idJurnal, r.kode, r.jumlah]
        );
      } catch {
        throw new Error("Kode pembantu tidak dikenal: " + r.kode);
      }
    }

    await conn.commit();
    return ok({ id_jurnal: idJurnal, total });
  } catch (e) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {
        /* abaikan */
      }
    }
    return tangkap("Gagal simpan setoran", e);
  } finally {
    if (conn) conn.release();
  }
}

