import pool from "./db";
import { batasBulan } from "./laporan";
import type { RowDataPacket } from "mysql2/promise";

export type BulanKas = {
  bulan: string; // label singkat: Jan, Feb, ..., Des
  periode: string; // YYYY-MM (untuk key stabil)
  setoran: number; // total DEBET Kas 1-110 sebulan (kas masuk)
  penarikan: number; // total KREDIT Kas 1-110 sebulan (kas keluar)
  tren: number; // efektivitas koleksi 0-100 = masuk/(masuk+keluar)*100
};

export const NAMA_BULAN = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
] as const;

/** Daftar YYYY-MM dari mulai s/d sampai (inklusif). */
export function daftarBulan(mulai: string, sampai: string): string[] {
  const out: string[] = [];
  let [th, bl] = mulai.split("-").map(Number);
  const [thAkhir, blAkhir] = sampai.split("-").map(Number);
  while (th < thAkhir || (th === thAkhir && bl <= blAkhir)) {
    out.push(`${th}-${String(bl).padStart(2, "0")}`);
    bl += 1;
    if (bl > 12) {
      bl = 1;
      th += 1;
    }
  }
  return out;
}

/** Tahun ajaran berjalan: Jul–Jun. Jul 2025–Jun 2026 = TA 2025/2026. */
export function rentangTahunAjaran(sekarang = new Date()): { mulai: string; sampai: string; label: string } {
  const th = sekarang.getFullYear();
  const bl = sekarang.getMonth() + 1;
  const awal = bl >= 7 ? th : th - 1;
  return {
    mulai: `${awal}-07`,
    sampai: `${awal + 1}-06`,
    label: `TA ${awal}/${awal + 1}`,
  };
}

/** 6 bulan kalender terakhir termasuk bulan berjalan. */
export function rentang6Bulan(sekarang = new Date()): { mulai: string; sampai: string } {
  const akhir = `${sekarang.getFullYear()}-${String(sekarang.getMonth() + 1).padStart(2, "0")}`;
  const d = new Date(sekarang.getFullYear(), sekarang.getMonth() - 5, 1);
  const awal = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return { mulai: awal, sampai: akhir };
}

type Executor = {
  execute: (sql: string, params: unknown[]) => Promise<[RowDataPacket[], unknown]>;
};

type BarisAgregat = { periode: string; masuk: string | number; keluar: string | number };

/**
 * Agregat kas bulanan dari data asli. `exec` di-inject agar bisa di-unit-test
 * tanpa database (produksi: teruskan `pool`).
 */
export async function ambilAnalitikKas(
  exec: Executor,
  mulai: string,
  sampai: string
): Promise<BulanKas[]> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mulai) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(sampai)) {
    throw new Error("rentang harus YYYY-MM");
  }
  if (mulai > sampai) throw new Error("mulai harus <= sampai");
  // Batas atas = hari terakhir benar (batasBulan), bukan sampai+"-31" yang
  // invalid untuk bulan pendek. mulai+"-01" selalu valid.
  const atas = batasBulan(sampai).sampai;
  const [rows] = await exec.execute(
    `SELECT DATE_FORMAT(j.tanggal, '%Y-%m') AS periode,
       COALESCE(SUM(CASE WHEN d.kode_akun = '1-110' THEN d.debet ELSE 0 END), 0) AS masuk,
       COALESCE(SUM(CASE WHEN d.kode_akun = '1-110' THEN d.kredit ELSE 0 END), 0) AS keluar
      FROM tb_jurnal_detail d JOIN tb_jurnal j ON j.id = d.id_jurnal
      WHERE j.tanggal >= ? AND j.tanggal <= ?
      GROUP BY periode`,
    [mulai + "-01", atas]
  );
  const peta = new Map<string, { masuk: number; keluar: number }>();
  for (const r of rows as unknown as BarisAgregat[]) {
    peta.set(String(r.periode), { masuk: Number(r.masuk), keluar: Number(r.keluar) });
  }
  const bulat = (n: number) => Math.round(n * 100) / 100;
  return daftarBulan(mulai, sampai).map((periode) => {
    const bl = Number(periode.split("-")[1]);
    const masuk = bulat(peta.get(periode)?.masuk ?? 0);
    const keluar = bulat(peta.get(periode)?.keluar ?? 0);
    const total = masuk + keluar;
    return {
      bulan: NAMA_BULAN[bl - 1],
      periode,
      setoran: masuk,
      penarikan: keluar,
      tren: total > 0 ? Math.round((masuk / total) * 100) : 0,
    };
  });
}

/** Default produksi: pakai pool koneksi aplikasi. */
export const ambilAnalitikKasLive = (mulai: string, sampai: string) =>
  ambilAnalitikKas(pool as unknown as Executor, mulai, sampai);
