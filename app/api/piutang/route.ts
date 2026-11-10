import { NextRequest } from "next/server";
import pool, { gagal, ok, fail } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import type { RowDataPacket } from "mysql2/promise";

// GET /api/piutang?status=berjalan — daftar piutang + nama + progres angsuran.
// status=berjalan/diajukan/ditolak/lunas/semua. Teller/admin only.
export async function GET(req: NextRequest) {
  const gate = await requireRole(req, ["teller", "admin"], fail);
  if (gate instanceof Response) return gate;
  const st = (req.nextUrl.searchParams.get("status") ?? "berjalan").toLowerCase();
  const valid = ["diajukan", "ditolak", "berjalan", "lunas"];
  const filter = st === "semua" ? "" : valid.includes(st) ? st : "berjalan";

  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT u.id, u.kode_bantu, p.nama, u.plafon, u.bunga_persen, u.total_harus_dibayar,
              u.sisa, u.tenor, u.status,
              (SELECT COUNT(*) FROM tb_angsuran a WHERE a.id_piutang = u.id AND a.dibayar IS NOT NULL) AS lunas_ke,
              (SELECT COUNT(*) FROM tb_angsuran a WHERE a.id_piutang = u.id) AS total_angsuran
       FROM tb_piutang u JOIN tb_pembantu p ON p.kode = u.kode_bantu
       ${filter ? "WHERE u.status = ?" : ""}
       ORDER BY u.id DESC LIMIT 200`,
      filter ? [filter] : []
    );
    return ok({ status: filter || "semua", data: rows });
  } catch (e) {
    return gagal("Gagal baca piutang: ", e);
  }
}

