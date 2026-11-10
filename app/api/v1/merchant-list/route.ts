import pool, { gagal, ok, fail } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// GET /api/v1/merchant-list — daftar kantin aktif untuk mobile.
// Sengaja tanpa kode_akun internal (itu urusan akuntansi web).
// Semua role login boleh (termasuk nasabah); tanpa login → 401.
export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return fail("Belum login", 401);
  try {
    const [rows] = await pool.execute(
      "SELECT id, kode, nama FROM tb_merchant WHERE aktif = 1 ORDER BY nama ASC"
    );
    return ok({ data: rows });
  } catch (e) {
    return gagal("Gagal baca merchant", e);
  }
}
