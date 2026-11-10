import { NextRequest } from "next/server";
import pool, { gagal, ok, fail } from "@/lib/db";
import { requireRole } from "@/lib/auth";

// GET /api/coa — admin only
export async function GET(req: NextRequest) {
  const gate = await requireRole(req, ["admin"], fail);
  if (gate instanceof Response) return gate;
  try {
    const [rows] = await pool.execute(
      "SELECT kode_akun, nama, pos_saldo, pos_laporan FROM tb_coa ORDER BY kode_akun ASC"
    );
    return ok({ data: rows });
  } catch (e) {
    return gagal("Gagal baca COA: ", e);
  }
}

