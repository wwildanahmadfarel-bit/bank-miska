import { NextRequest } from "next/server";
import pool, { gagal, ok, fail } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { batasBulan } from "@/lib/laporan";
import type { RowDataPacket } from "mysql2/promise";

// GET /api/neraca-lajur?bulan=2019-12 — teller/admin only
export async function GET(req: NextRequest) {
  const gate = await requireRole(req, ["teller", "admin"], fail);
  if (gate instanceof Response) return gate;
  const bulan = (req.nextUrl.searchParams.get("bulan") ?? "").trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(bulan)) return fail("bulan harus YYYY-MM (01-12)");
  // Cutoff hari terakhir benar — jangan bulan+"-31" (invalid untuk bulan pendek).
  const { sampai } = batasBulan(bulan);

  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT c.kode_akun, c.nama, c.pos_saldo, c.pos_laporan,
        COALESCE(SUM(d.debet),0) AS tot_debet, COALESCE(SUM(d.kredit),0) AS tot_kredit
       FROM tb_coa c LEFT JOIN (
         tb_jurnal_detail d JOIN tb_jurnal j ON j.id = d.id_jurnal AND j.tanggal <= ?
       ) ON d.kode_akun = c.kode_akun
       GROUP BY c.kode_akun ORDER BY c.kode_akun ASC`,
      [sampai]
    );

    let tDebet = 0;
    let tKredit = 0;
    const out = (rows as Record<string, unknown>[]).map((r) => {
      const ns =
        r.pos_saldo === "Db" ? Number(r.tot_debet) - Number(r.tot_kredit) : Number(r.tot_kredit) - Number(r.tot_debet);
      const row = { ...r, ns_debet: 0, ns_kredit: 0 };
      if (r.pos_saldo === "Db" && ns > 0) {
        row.ns_debet = Math.round(ns * 100) / 100;
        tDebet += Number(row.ns_debet);
      } else if (r.pos_saldo === "Kr" && ns > 0) {
        row.ns_kredit = Math.round(ns * 100) / 100;
        tKredit += Number(row.ns_kredit);
      } else if (ns < 0) {
        // Saldo lawan arah (mis. Kas negatif) — tampil di sisi berlawanan
        if (r.pos_saldo === "Db") {
          row.ns_kredit = Math.round(Math.abs(ns) * 100) / 100;
          tKredit += Number(row.ns_kredit);
        } else {
          row.ns_debet = Math.round(Math.abs(ns) * 100) / 100;
          tDebet += Number(row.ns_debet);
        }
      }
      return row;
    });
    return ok({
      bulan,
      total_ns_debet: Math.round(tDebet * 100) / 100,
      total_ns_kredit: Math.round(tKredit * 100) / 100,
      rows: out,
    });
  } catch (e) {
    return gagal("Gagal baca neraca lajur: ", e);
  }
}

