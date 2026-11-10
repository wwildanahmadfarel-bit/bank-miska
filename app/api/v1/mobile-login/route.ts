import pool, { ok, fail } from "@/lib/db";
import { bersihkanSesiKedaluarsa, createSession, sessionCookieHeader } from "@/lib/auth";
import { hashPassword, perluMigrasiPassword, verifikasiPassword } from "@/lib/password";
import { catatGagal, ipClient, resetKunci, sisaKunci } from "@/lib/rate-limit";
import type { RowDataPacket } from "mysql2/promise";

// Batas brute-force disamakan dengan /api/login: 5x salah → kunci 5 menit.
// Kunci dipisah prefix v1: agar hitungan mobile & web tidak saling menelan.
const MAKS_GAGAL = 5;
const JENDELA_MS = 5 * 60 * 1000;
const KUNCI_MS = 5 * 60 * 1000;

// POST /api/v1/mobile-login {username, password}
// Sama seperti /api/login, tapi token dikembalikan di body JSON (untuk HP)
// sekaligus tetap dipasang sebagai cookie (untuk kompatibilitas web).
// Respons: {sukses:true, token, refresh, username, role, kode_bantu, berakhir}
export async function POST(req: Request) {
  let input: Record<string, unknown>;
  try {
    input = await req.json();
  } catch {
    return fail("Body JSON tidak valid");
  }
  const username = String(input.username ?? "").trim();
  const password = String(input.password ?? "");
  if (!username || !password) return fail("Username dan password wajib diisi");

  const kunci = `v1login:${ipClient(req)}:${username.toLowerCase()}`;
  const sisa = sisaKunci(kunci);
  if (sisa > 0) return fail(`Terlalu banyak percobaan. Coba lagi dalam ${sisa} detik`, 429);

  async function tolak(alasan: string): Promise<Response> {
    console.warn(`[v1login] ${alasan}: ${username}`);
    const dikunci = catatGagal(kunci, MAKS_GAGAL, JENDELA_MS, KUNCI_MS);
    if (dikunci > 0) return fail(`Terlalu banyak percobaan. Coba lagi dalam ${dikunci} detik`, 429);
    return fail("Username/password salah", 401);
  }

  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      "SELECT id, username, password_hash, role, kode_bantu, aktif FROM tb_user WHERE username = ? LIMIT 1",
      [username]
    );
    if (rows.length === 0) return tolak("user tidak ada");
    const u = rows[0] as unknown as {
      id: number; username: string; password_hash: string; role: "teller" | "admin" | "nasabah";
      kode_bantu: string | null; aktif: number;
    };
    if (!u.aktif) return tolak("akun nonaktif");
    if (!(await verifikasiPassword(password, u.password_hash))) return tolak("password salah");
    if (perluMigrasiPassword(u.password_hash)) {
      try {
        await pool.execute("UPDATE tb_user SET password_hash = ? WHERE id = ?", [
          await hashPassword(password),
          u.id,
        ]);
        console.info(`[v1login] password bcrypt di-upgrade untuk user id ${u.id}`);
      } catch (e) {
        console.error("[v1login] gagal upgrade bcrypt:", e);
      }
    }
    resetKunci(kunci);
    await bersihkanSesiKedaluarsa(u.id);
    const { token, berakhir } = await createSession(u);
    // MVP: refresh = token sesi yang sama (7 hari). Refresh-rotasi terpisah
    // bisa ditambah bila butuh (tb_refresh_token) tanpa mengubah kontrak.
    const res = ok({
      token,
      refresh: token,
      username: u.username,
      role: u.role,
      kode_bantu: u.kode_bantu,
      berakhir: berakhir.toISOString(),
    });
    res.headers.set("Set-Cookie", sessionCookieHeader(token));
    return res;
  } catch (e) {
    console.error("[v1login] error:", e);
    return fail("Gagal login, coba lagi", 500);
  }
}
