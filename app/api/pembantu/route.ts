import { NextRequest } from "next/server";
import pool, { gagal, escapeLike, ok, fail } from "@/lib/db";
import { requireRole } from "@/lib/auth";

// GET /api/pembantu?status=TABUNGAN&q=aminah — teller/admin only
export async function GET(req: NextRequest) {
  const gate = await requireRole(req, ["teller", "admin"], fail);
  if (gate instanceof Response) return gate;
  try {
    const sp = req.nextUrl.searchParams;
    const status = (sp.get("status") ?? "").toUpperCase();
    const q = (sp.get("q") ?? "").trim();

    const where: string[] = [];
    const params: string[] = [];

    if (status === "TABUNGAN" || status === "PIUTANG") {
      where.push("p.status = ?");
      params.push(status);
    }
    if (q !== "") {
      where.push("(p.nama LIKE ? OR p.kode LIKE ?)");
      const pola = `%${escapeLike(q)}%`;
      params.push(pola, pola);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [rows] = await pool.execute(
      `SELECT p.kode, p.nama, p.no_rek, p.status, p.saldo_awal, p.uid_kartu,
        COALESCE((SELECT SUM(d.debet - d.kredit) FROM tb_jurnal_detail d WHERE d.kode_bantu = p.kode), 0) AS mutasi,
        (p.saldo_awal + COALESCE((SELECT SUM(
            CASE WHEN c.pos_saldo = 'Db' THEN (d.debet - d.kredit) ELSE (d.kredit - d.debet) END
          ) FROM tb_jurnal_detail d JOIN tb_coa c ON c.kode_akun = d.kode_akun WHERE d.kode_bantu = p.kode), 0)) AS saldo_akhir
        FROM tb_pembantu p ${whereSql} ORDER BY p.nama ASC LIMIT 200`,
      params
    );
    return ok({ data: rows });
  } catch (e) {
    return gagal("Gagal baca pembantu: ", e);
  }
}

