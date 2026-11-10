// Pembatas laju in-memory per kunci (IP + aksi) — anti brute-force & spam.
// Tanpa dependensi (tanpa Redis): cukup untuk skala sekolah/praktik.
// Batasan: hitungan hilang saat server restart; di balik multi-instance,
// setiap instance menghitung sendiri. Untuk produksi serius, ganti dengan
// store eksternal (Redis/Upstash) tanpa mengubah signature fungsi ini.

type Catatan = { gagal: number[]; kunciSampai: number };

const simpan = new Map<string, Catatan>();

function bersih(kunci: string, sekarang: number, jendelaMs: number): Catatan {
  let c = simpan.get(kunci);
  if (!c) {
    c = { gagal: [], kunciSampai: 0 };
    simpan.set(kunci, c);
  }
  c.gagal = c.gagal.filter((t) => sekarang - t < jendelaMs);
  return c;
}

/** Cek apakah kunci sedang dikunci. Return sisa detik kunci, atau 0 bila bebas. */
export function sisaKunci(kunci: string): number {
  const c = simpan.get(kunci);
  if (!c) return 0;
  const sisa = Math.ceil((c.kunciSampai - Date.now()) / 1000);
  return sisa > 0 ? sisa : 0;
}

/**
 * Catat satu kegagalan. Bila jumlah gagal dalam jendela >= maksGagal,
 * kunci selama kunciMs. Return sisa detik kunci (0 bila belum dikunci).
 */
export function catatGagal(kunci: string, maksGagal: number, jendelaMs: number, kunciMs: number): number {
  const sekarang = Date.now();
  const c = bersih(kunci, sekarang, jendelaMs);
  c.gagal.push(sekarang);
  if (c.gagal.length >= maksGagal) {
    c.kunciSampai = sekarang + kunciMs;
  }
  return sisaKunci(kunci);
}

/** Reset hitungan setelah aksi sukses (mis. login benar). */
export function resetKunci(kunci: string): void {
  simpan.delete(kunci);
}

/** Ambil IP client dari header proxy umum, atau 'lokal' bila tak ada. */
export function ipClient(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const ip = fwd.split(",")[0].trim();
    if (ip) return ip;
  }
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  return "lokal";
}
