// Zona waktu tunggal aplikasi. Vercel berjalan di UTC, sedangkan sekolah
// memakai WIB. Semua tanggal "hari ini" dan DATETIME MySQL harus memakai
// zona ini agar transaksi sekitar tengah malam tidak geser tanggal.
export const ZONA_WAKTU = process.env.APP_TIMEZONE ?? "Asia/Jakarta";

const fmtTanggal = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA_WAKTU,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const fmtWaktu = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONA_WAKTU,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function bagian(d: Date, fmt: Intl.DateTimeFormat): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) out[p.type] = p.value;
  return out;
}

/** Tanggal hari ini di zona aplikasi, format YYYY-MM-DD. */
export function tanggalHariIni(d = new Date()): string {
  const p = bagian(d, fmtTanggal);
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * Format DATETIME MySQL (YYYY-MM-DD HH:mm:ss) di zona aplikasi.
 * Dipakai untuk kolom DATETIME agar tidak bergantung zona waktu server.
 */
export function mysqlDateTime(d = new Date()): string {
  const p = bagian(d, fmtWaktu);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

/** Offset numerik MySQL untuk zona aplikasi, mis. "+07:00". */
export function offsetMysql(d = new Date()): string {
  const p = bagian(d, fmtWaktu);
  const sebagaiUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second)
  );
  const menit = Math.round((sebagaiUtc - Math.floor(d.getTime() / 1000) * 1000) / 60000);
  const tanda = menit >= 0 ? "+" : "-";
  const abs = Math.abs(menit);
  const jam = String(Math.floor(abs / 60)).padStart(2, "0");
  const sisa = String(abs % 60).padStart(2, "0");
  return `${tanda}${jam}:${sisa}`;
}
