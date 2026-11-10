import { NextRequest } from "next/server";
import pool, { gagal, ok, fail } from "@/lib/db";
import { getSessionUser, normalisasiUid } from "@/lib/auth";

// GET /api/pembantu-by-uid?uid=0067305985 — butuh login (semua role)
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return fail("Belum login", 401);
  const uid = normalisasiUid(req.nextUrl.searchParams.get("uid") ?? "");
  if (!uid) return fail("UID wajib diisi");
  try {
    const [rows] = await pool.execute(
      `SELECT p.kode, p.nama, p.no_rek, p.status, p.saldo_awal, p.uid_kartu,
        (p.saldo_awal + COALESCE((SELECT SUM(
            CASE WHEN c.pos_saldo = 'Db' THEN (d.debet - d.kredit) ELSE (d.kredit - d.debet) END
          ) FROM tb_jurnal_detail d JOIN tb_coa c ON c.kode_akun = d.kode_akun WHERE d.kode_bantu = p.kode), 0)) AS saldo_akhir
        FROM tb_pembantu p WHERE p.uid_kartu = ? LIMIT 1`,
      [uid]
    );
    const list = rows as Record<string, unknown>[];
    if (list.length === 0) return fail("Kartu tidak terdaftar", 404);
    return ok({ data: list[0] });
  } catch (e) {
    return gagal("Gagal lookup UID: ", e);
  }
}

