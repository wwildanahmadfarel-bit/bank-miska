import pool, { ok } from "@/lib/db";
import { clearSessionCookieHeader, readSessionToken } from "@/lib/auth";
import { jtiDariToken, tokenLegacy } from "@/lib/jwt";

// POST /api/logout — hapus sesi (via jti untuk JWT) + cookie
export async function POST(req: Request) {
  const token = await readSessionToken(req);
  if (token) {
    try {
      // JWT: yang tersimpan di tb_session adalah jti, bukan token utuh.
      // Legacy 64-hex: token itu sendiri yang tersimpan.
      const kunci = tokenLegacy(token) ? token.toLowerCase() : await jtiDariToken(token);
      if (kunci) await pool.execute("DELETE FROM tb_session WHERE token = ?", [kunci]);
    } catch {
      /* abaikan */
    }
  }
  const res = ok({});
  res.headers.set("Set-Cookie", clearSessionCookieHeader());
  return res;
}
