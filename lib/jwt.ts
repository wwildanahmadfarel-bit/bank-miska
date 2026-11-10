import { randomBytes } from "crypto";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

// JWT hybrid Bank Miska:
// - Token ditandatangani HS256 (stateless untuk verifikasi cepat).
// - `jti` tetap disimpan di tb_session sehingga logout / nonaktifkan akun
//   langsung mencabut sesi (bukan stateless penuh — ini disengaja).
export const JWT_ISSUER = "bank-miska";
export const JWT_AUDIENCE = "miska-app";
export const JWT_MASA_BERLAKU_DETIK = 7 * 24 * 60 * 60; // 7 hari
export const JWT_MIN_SECRET = 32;

// Hanya dipakai saat development. Production wajib JWT_SECRET >= 32 karakter,
// jika tidak, penandatanganan gagal (fail closed) alih-alih memakai secret publik.
const SECRET_DEV = "miska-dev-secret-hanya-untuk-lokal-jangan-dipakai-online";

function ambilSecret(): Uint8Array {
  const s = process.env.JWT_SECRET ?? "";
  if (s.length >= JWT_MIN_SECRET) return new TextEncoder().encode(s);
  if (process.env.NODE_ENV === "production") {
    throw new Error(`JWT_SECRET wajib diisi minimal ${JWT_MIN_SECRET} karakter`);
  }
  return new TextEncoder().encode(SECRET_DEV);
}

export type Role = "teller" | "admin" | "nasabah";

export type IsiJwt = {
  id: number;
  username: string;
  role: Role;
  kode_bantu: string | null;
};

export type JwtMiska = JWTPayload & {
  sub: string;
  username: string;
  role: Role;
  kode_bantu: string | null;
  jti: string;
};

export type HasilBuatJwt = {
  token: string;
  jti: string;
  berakhir: Date;
};

/** Buat JWT 7 hari. `jti` acak 64-hex disimpan pemanggil ke tb_session. */
export async function buatJwt(
  user: IsiJwt,
  opsi: { jti?: string; masaBerlakuDetik?: number } = {}
): Promise<HasilBuatJwt> {
  const jti = opsi.jti ?? randomBytes(32).toString("hex");
  const masa = opsi.masaBerlakuDetik ?? JWT_MASA_BERLAKU_DETIK;
  const sekarang = Math.floor(Date.now() / 1000);

  const token = await new SignJWT({
    username: user.username,
    role: user.role,
    kode_bantu: user.kode_bantu,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(String(user.id))
    .setJti(jti)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt(sekarang)
    .setExpirationTime(sekarang + masa)
    .sign(ambilSecret());

  return { token, jti, berakhir: new Date((sekarang + masa) * 1000) };
}

/**
 * Verifikasi signature + exp + issuer + audience.
 * Return null untuk token apa pun yang tidak valid (jangan melempar ke client).
 */
export async function verifikasiJwt(token: string): Promise<JwtMiska | null> {
  if (!token || token.length > 4096) return null;
  try {
    const { payload } = await jwtVerify(token, ambilSecret(), {
      algorithms: ["HS256"],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    if (
      typeof payload.sub !== "string" ||
      !/^\d+$/.test(payload.sub) ||
      typeof payload.jti !== "string" ||
      !/^[a-f0-9]{64}$/i.test(payload.jti) ||
      typeof payload.username !== "string" ||
      (payload.role !== "teller" && payload.role !== "admin" && payload.role !== "nasabah")
    ) {
      return null;
    }
    return payload as JwtMiska;
  } catch {
    return null;
  }
}

/** JTI dari JWT yang valid — dipakai logout untuk menghapus baris sesi. */
export async function jtiDariToken(token: string): Promise<string | null> {
  const payload = await verifikasiJwt(token);
  return payload?.jti ?? null;
}

/** Token lama (opaque 64-hex) tetap diterima sampai kedaluwarsa. */
export function tokenLegacy(token: string): boolean {
  return /^[a-f0-9]{64}$/i.test(token);
}
