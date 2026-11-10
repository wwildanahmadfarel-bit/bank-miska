import { NextRequest } from "next/server";
import pool, { gagal, ok, fail } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { batasBulan } from "@/lib/laporan";
import type { RowDataPacket } from "mysql2/promise";

// GET /api/laba-rugi?bulan=2019-12 — teller/admin only
export async function GET(req: NextRequest) {
  const gate = await requireRole(req, ["teller", "admin"], fail);
  if (gate instanceof Response) return gate;
  const bulan = (req.nextUrl.searchParams.get("bulan") ?? "").trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(bulan)) return fail("bulan harus YYYY-MM (01-12)");
  // Cutoff hari terakhir benar — jangan bulan+"-31" (invalid untuk bulan pendek).
  const { sampai } = batasBulan(bulan);

  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT c.kode_akun, c.nama, c.pos_saldo,
        COALESCE(SUM(d.debet),0) AS tot_debet, COALESCE(SUM(d.kredit),0) AS tot_kredit
       FROM tb_coa c LEFT JOIN (
         tb_jurnal_detail d JOIN tb_jurnal j ON j.id = d.id_jurnal AND j.tanggal <= ?
       ) ON d.kode_akun = c.kode_akun
       WHERE c.pos_laporan = 'LR' AND c.pos_saldo != '-'
       GROUP BY c.kode_akun ORDER BY c.kode_akun ASC`,
      [sampai]
    );

    let pendapatan = 0;
    let biaya = 0;
    const out = (rows as Record<string, unknown>[]).map((r) => {
      const saldo =
        r.pos_saldo === "Kr" ? Number(r.tot_kredit) - Number(r.tot_debet) : Number(r.tot_debet) - Number(r.tot_kredit);
      const s = Math.round(saldo * 100) / 100;
      if (String(r.kode_akun).startsWith("4-")) pendapatan += s;
      if (String(r.kode_akun).startsWith("6-")) biaya += s;
      return { ...r, saldo: s };
    });
    pendapatan = Math.round(pendapatan * 100) / 100;
    biaya = Math.round(biaya * 100) / 100;
    return ok({ bulan, pendapatan, biaya, laba: Math.round((pendapatan - biaya) * 100) / 100, rows: out });
  } catch (e) {
    return gagal("Gagal baca laba rugi: ", e);
  }
}

