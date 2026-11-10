import { compare, hash } from "bcryptjs";
import { timingSafeEqual } from "crypto";

// Biaya bcrypt 10: cukup kuat untuk sekolah, tetap cepat di serverless.
export const BIAYA_BCRYPT = 10;

const POLA_BCRYPT = /^\$2[aby]\$\d{2}\$/;

export function adalahHashBcrypt(v: string): boolean {
  return POLA_BCRYPT.test(v);
}

export function hashPassword(password: string): Promise<string> {
  return hash(password, BIAYA_BCRYPT);
}

/**
 * Verifikasi password. Mendukung hash bcrypt baru dan password lama yang
 * masih tersimpan teks polos (migrasi otomatis saat login berhasil).
 */
export async function verifikasiPassword(password: string, tersimpan: string): Promise<boolean> {
  if (!tersimpan) return false;
  if (adalahHashBcrypt(tersimpan)) {
    try {
      return await compare(password, tersimpan);
    } catch {
      return false;
    }
  }
  // Perbandingan teks polos dengan waktu konstan agar tidak bocor lewat timing.
  const a = Buffer.from(password, "utf8");
  const b = Buffer.from(tersimpan, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** True bila hash lama perlu di-upgrade ke bcrypt setelah login sukses. */
export function perluMigrasiPassword(tersimpan: string): boolean {
  return Boolean(tersimpan) && !adalahHashBcrypt(tersimpan);
}
