import pool, { tangkap, gagal, ok, fail } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

// POST /api/periode-buka — admin only
// Membuka kembali periode tutup TERBARU untuk koreksi kesalahan:
// hapus kunci tb_periode_tutup + hapus jurnal PENUTUP bulan itu
// (tutup ulang nanti generate ulang dari angka terkoreksi).
export async function POST(req: Request) {
  const gate = await requireRole(req, ["admin"], fail);
  if (gate instanceof Response) return gate;
  let input: Record<string, unknown>;
  try {
    input = await req.json();
  } catch {
    return fail("Body JSON tidak valid");
  }

  const bulan = String(input.bulan ?? "").trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(bulan)) return fail("bulan harus YYYY-MM (01-12)");

  let conn: Awaited<ReturnType<typeof pool.getConnection>> | null = null;
  try {
    try {
      conn = await pool.getConnection();
    } catch (e) {
      return gagal("Database tidak terjangkau", e);
    }
    await conn.beginTransaction();

    const [trows] = await conn.execute<RowDataPacket[]>("SELECT bulan FROM tb_periode_tutup WHERE bulan = ?", [
      bulan,
    ]);
    if (trows.length === 0) throw new Error("Periode " + bulan + " tidak dalam status tutup");

    // Hanya periode tutup terbaru yang boleh dibuka (jaga urutan kronologis).
    const [mrows] = await conn.execute<RowDataPacket[]>("SELECT MAX(bulan) AS maks FROM tb_periode_tutup");
    const maks = (mrows[0] as { maks: string | null } | undefined)?.maks ?? null;
    if (maks && maks !== bulan)
      throw new Error(`Buka dari periode tutup terbaru dulu (${maks}), bukan ${bulan}`);

    // Hapus jurnal penutup bulan itu (detail ikut via CASCADE).
    const [dj] = await conn.execute<ResultSetHeader>(
      "DELETE FROM tb_jurnal WHERE tipe = 'PENUTUP' AND DATE_FORMAT(tanggal, '%Y-%m') = ?",
      [bulan]
    );
    await conn.execute("DELETE FROM tb_periode_tutup WHERE bulan = ?", [bulan]);

    await conn.commit();
    return ok({ bulan, status: "buka", penutup_dihapus: dj.affectedRows });
  } catch (e) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {
        /* abaikan */
      }
    }
    return tangkap("Gagal buka periode", e);
  } finally {
    if (conn) conn.release();
  }
}

