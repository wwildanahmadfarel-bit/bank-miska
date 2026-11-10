import pool, { gagal, ok, fail } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { hashPassword, verifikasiPassword } from "@/lib/password";
import type { RowDataPacket } from "mysql2/promise";

// POST /api/password {lama, baru} — ganti password milik sendiri (wajib login).
export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return fail("Belum login", 401);
  let input: Record<string, unknown>;
  try {
    input = await req.json();
  } catch {
    return fail("Body JSON tidak valid");
  }
  const lama = String(input.lama ?? "");
  const baru = String(input.baru ?? "");
  if (!lama || !baru) return fail("Password lama dan baru wajib diisi");
  if (baru.length < 6) return fail("Password baru minimal 6 karakter");

  try {
    const [rows] = await pool.execute<RowDataPacket[]>("SELECT password_hash FROM tb_user WHERE id = ? LIMIT 1", [
      user.id,
    ]);
    if (rows.length === 0) return fail("Akun tidak ditemukan", 404);
    const cocok = await verifikasiPassword(lama, (rows[0] as { password_hash: string }).password_hash);
    if (!cocok) return fail("Password lama salah", 401);
    await pool.execute("UPDATE tb_user SET password_hash = ? WHERE id = ?", [
      await hashPassword(baru),
      user.id,
    ]);
    return ok({});
  } catch (e) {
    return gagal("Gagal ubah password: ", e);
  }
}

