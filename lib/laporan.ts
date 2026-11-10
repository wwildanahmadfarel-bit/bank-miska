import pool from "./db";
import type { RowDataPacket } from "mysql2/promise";

// Query kanonis laporan — SQL disalin verbatim dari masing-masing route
// agar angka ekspor CSV/XLSX identik dengan tampilan layar.

export type RowObj = Record<string, unknown>;

function tgl(x: unknown): unknown {
  return x instanceof Date ? x.toISOString().slice(0, 10) : x;
}

export async function ambilNeracaLajur(bulan: string) {
  // Cutoff = hari terakhir benar (batasBulan), bukan bulan+"-31" yang merupakan
  // tanggal invalid untuk Feb/Apr/Jun/Sep/Nov dan hasilnya bergantung pada
  // koersi implisit server DB (MariaDB lolos leksikal, MySQL ketat → NULL).
  const { sampai } = batasBulan(bulan);
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT c.kode_akun, c.nama, c.pos_saldo, c.pos_laporan,
      COALESCE(SUM(d.debet),0) AS tot_debet, COALESCE(SUM(d.kredit),0) AS tot_kredit
     FROM tb_coa c LEFT JOIN (
       tb_jurnal_detail d JOIN tb_jurnal j ON j.id = d.id_jurnal AND j.tanggal <= ?
     ) ON d.kode_akun = c.kode_akun
     GROUP BY c.kode_akun ORDER BY c.kode_akun ASC`,
    [sampai]
  );
  let tDebet = 0;
  let tKredit = 0;
  const out = (rows as RowObj[]).map((r) => {
    const ns =
      r.pos_saldo === "Db" ? Number(r.tot_debet) - Number(r.tot_kredit) : Number(r.tot_kredit) - Number(r.tot_debet);
    const row: RowObj = { kode_akun: r.kode_akun, nama: r.nama, pos_saldo: r.pos_saldo, ns_debet: 0, ns_kredit: 0 };
    if (r.pos_saldo === "Db" && ns > 0) {
      row.ns_debet = Math.round(ns * 100) / 100;
      tDebet += Number(row.ns_debet);
    } else if (r.pos_saldo === "Kr" && ns > 0) {
      row.ns_kredit = Math.round(ns * 100) / 100;
      tKredit += Number(row.ns_kredit);
    } else if (ns < 0) {
      if (r.pos_saldo === "Db") {
        row.ns_kredit = Math.round(Math.abs(ns) * 100) / 100;
        tKredit += Number(row.ns_kredit);
      } else {
        row.ns_debet = Math.round(Math.abs(ns) * 100) / 100;
        tDebet += Number(row.ns_debet);
      }
    }
    return row;
  });
  return { rows: out, totalD: Math.round(tDebet * 100) / 100, totalK: Math.round(tKredit * 100) / 100 };
}

export async function ambilLabaRugi(bulan: string) {
  // Lihat catatan cutoff di ambilNeracaLajur: pakai hari terakhir benar.
  const { sampai } = batasBulan(bulan);
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT c.kode_akun, c.nama, c.pos_saldo,
      COALESCE(SUM(d.debet),0) AS tot_debet, COALESCE(SUM(d.kredit),0) AS tot_kredit
     FROM tb_coa c LEFT JOIN (
       tb_jurnal_detail d JOIN tb_jurnal j ON j.id = d.id_jurnal AND j.tanggal <= ?
     ) ON d.kode_akun = c.kode_akun
     WHERE c.pos_laporan = 'LR' AND c.pos_saldo != '-'
     GROUP BY c.kode_akun ORDER BY c.kode_akun ASC`,
    [sampai]
  );
  let pendapatan = 0;
  let biaya = 0;
  const out = (rows as RowObj[]).map((r) => {
    const saldo =
      r.pos_saldo === "Kr" ? Number(r.tot_kredit) - Number(r.tot_debet) : Number(r.tot_debet) - Number(r.tot_kredit);
    const s = Math.round(saldo * 100) / 100;
    if (String(r.kode_akun).startsWith("4-")) pendapatan += s;
    if (String(r.kode_akun).startsWith("6-")) biaya += s;
    return { kode_akun: r.kode_akun, nama: r.nama, saldo: s };
  });
  pendapatan = Math.round(pendapatan * 100) / 100;
  biaya = Math.round(biaya * 100) / 100;
  return { rows: out, pendapatan, biaya, laba: Math.round((pendapatan - biaya) * 100) / 100 };
}

export async function ambilBukuBesar(kode: string, mulai: string, sampai: string) {
  const [crows] = await pool.execute<RowDataPacket[]>("SELECT nama, pos_saldo FROM tb_coa WHERE kode_akun = ?", [
    kode,
  ]);
  const coa = crows[0] as unknown as { nama: string; pos_saldo: string } | undefined;
  if (!coa) throw new Error("Kode akun tidak dikenal");
  const where: string[] = ["d.kode_akun = ?"];
  const params: string[] = [kode];
  if (/^\d{4}-\d{2}-\d{2}$/.test(mulai)) {
    where.push("j.tanggal >= ?");
    params.push(mulai);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(sampai)) {
    where.push("j.tanggal <= ?");
    params.push(sampai);
  }
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT j.tanggal AS tanggal, j.no_bukti, j.keterangan, d.debet, d.kredit
     FROM tb_jurnal_detail d JOIN tb_jurnal j ON j.id = d.id_jurnal
     WHERE ${where.join(" AND ")} ORDER BY j.tanggal ASC, j.id ASC LIMIT 1000`,
    params
  );
  let saldo = 0;
  const out = (rows as RowObj[]).map((r) => {
    const mut = coa.pos_saldo === "Db" ? Number(r.debet) - Number(r.kredit) : Number(r.kredit) - Number(r.debet);
    saldo += mut;
    return { ...r, tanggal: tgl(r.tanggal), saldo: Math.round(saldo * 100) / 100 };
  });
  return { coa: { kode, ...coa }, rows: out };
}

async function mutasiPembantu(kode: string, mulai: string, sampai: string, kolomTipe: boolean) {
  const [prows] = await pool.execute<RowDataPacket[]>(
    "SELECT kode, nama, status, saldo_awal FROM tb_pembantu WHERE kode = ?",
    [kode]
  );
  const pb = prows[0] as unknown as { kode: string; nama: string; status: string; saldo_awal: number } | undefined;
  if (!pb) throw new Error("Kode pembantu tidak dikenal: " + kode);
  const where: string[] = ["d.kode_bantu = ?"];
  const params: string[] = [kode];
  if (/^\d{4}-\d{2}-\d{2}$/.test(mulai)) {
    where.push("j.tanggal >= ?");
    params.push(mulai);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(sampai)) {
    where.push("j.tanggal <= ?");
    params.push(sampai);
  }
  const [rows] = await pool.execute<RowDataPacket[]>(
    kolomTipe
      ? `SELECT j.tanggal AS tanggal, DATE_FORMAT(j.dibuat, '%H:%i:%s') AS waktu,
           j.no_bukti, j.keterangan, j.tipe, d.kode_akun, d.debet, d.kredit
         FROM tb_jurnal_detail d JOIN tb_jurnal j ON j.id = d.id_jurnal
         WHERE ${where.join(" AND ")} ORDER BY j.tanggal ASC, j.id ASC LIMIT 1000`
      : `SELECT j.tanggal AS tanggal, DATE_FORMAT(j.dibuat, '%H:%i:%s') AS waktu,
           j.no_bukti, j.keterangan, d.kode_akun, d.debet, d.kredit
         FROM tb_jurnal_detail d JOIN tb_jurnal j ON j.id = d.id_jurnal
         WHERE ${where.join(" AND ")} ORDER BY j.tanggal ASC, j.id ASC LIMIT 1000`,
    params
  );
  let saldo = Number(pb.saldo_awal);
  let masuk = 0;
  let keluar = 0;
  const out = (rows as RowObj[]).map((r) => {
    const mut = pb.status === "PIUTANG" ? Number(r.debet) - Number(r.kredit) : Number(r.kredit) - Number(r.debet);
    saldo += mut;
    if (kolomTipe) {
      if (mut >= 0) masuk += mut;
      else keluar += -mut;
    }
    return { ...r, tanggal: tgl(r.tanggal), saldo: Math.round(saldo * 100) / 100 };
  });
  return {
    pembantu: pb,
    rows: out,
    saldo_akhir: Math.round(saldo * 100) / 100,
    total_masuk: Math.round(masuk * 100) / 100,
    total_keluar: Math.round(keluar * 100) / 100,
  };
}

export const ambilBbPembantu = (kode: string, mulai: string, sampai: string) =>
  mutasiPembantu(kode, mulai, sampai, false);

export const ambilRiwayat = (kode: string, mulai: string, sampai: string) =>
  mutasiPembantu(kode, mulai, sampai, true);

export async function ambilDaftarSaldo(tipe: "TABUNGAN" | "PIUTANG") {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT p.kode, p.nama, p.no_rek, p.status, p.saldo_awal,
      (p.saldo_awal + COALESCE((SELECT SUM(
        CASE WHEN c.pos_saldo = 'Db' THEN (d.debet - d.kredit) ELSE (d.kredit - d.debet) END
      ) FROM tb_jurnal_detail d JOIN tb_coa c ON c.kode_akun = d.kode_akun WHERE d.kode_bantu = p.kode), 0)) AS saldo_akhir
     FROM tb_pembantu p WHERE p.status = ? ORDER BY p.nama ASC`,
    [tipe]
  );
  const list = rows as unknown as RowObj[];
  const total = Math.round(list.reduce((a, r) => a + Number(r.saldo_akhir), 0) * 100) / 100;
  return { rows: list, total };
}

// Semua kegiatan (baris jurnal) dalam 1 bulan — bahan sheet Jurnal paket periode.
export async function ambilJurnalPeriode(bulan: string) {
  const { mulai, sampai } = batasBulan(bulan);
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT j.id AS id_jurnal, j.tanggal AS tanggal, DATE_FORMAT(j.dibuat, '%H:%i:%s') AS waktu,
        j.no_bukti, j.keterangan, j.tipe,
       d.kode_akun, c.nama AS nama_akun, d.kode_bantu, d.debet, d.kredit
      FROM tb_jurnal_detail d
      JOIN tb_jurnal j ON j.id = d.id_jurnal
      JOIN tb_coa c ON c.kode_akun = d.kode_akun
      WHERE j.tanggal >= ? AND j.tanggal <= ?
      ORDER BY j.tanggal DESC, j.id DESC, d.id DESC LIMIT 5000`,
    [mulai, sampai]
  );
  const list: RowObj[] = (rows as unknown as RowObj[]).map((r) => ({
    ...r,
    tanggal: tgl(r.tanggal),
    waktu: r.waktu === null || r.waktu === undefined ? "" : String(r.waktu),
  }));
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const totDb = round2(list.reduce((a, r) => a + Number(r.debet), 0));
  const totKr = round2(list.reduce((a, r) => a + Number(r.kredit), 0));
  return { rows: list, totDb, totKr, balance: Math.abs(totDb - totKr) < 0.01, mulai, sampai };
}

// =====================================================================
// PAKET SEKOLAH — laporan gaya workbook contoh (kop + saldo awal)
// Basis "pra-tutup" = semua jurnal ≤ akhir bulan KECUALI jurnal PENUTUP
// bulan itu. Basis "sudah-tutup" = semua jurnal ≤ akhir bulan.
// =====================================================================

/** Validasi YYYY-MM + rentang tanggal bulan itu (hari terakhir benar). */
export function batasBulan(bulan: string): { mulai: string; sampai: string } {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(bulan)) throw new Error("bulan harus YYYY-MM (01-12)");
  const [th, bl] = bulan.split("-").map(Number);
  const lastDay = new Date(th, bl, 0).getDate();
  return { mulai: `${bulan}-01`, sampai: `${bulan}-${String(lastDay).padStart(2, "0")}` };
}

/** Saldo awal tiap akun = Σ mutasi SEBELUM bulan (signed), dipecah sisi Db/Kr. */
export async function ambilSaldoAwalAkun(bulan: string) {
  const { mulai } = batasBulan(bulan);
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT c.kode_akun, c.nama, c.pos_saldo, c.pos_laporan,
      COALESCE(SUM(CASE WHEN j.id IS NULL THEN 0
        WHEN c.pos_saldo = 'Db' THEN (d.debet - d.kredit) ELSE (d.kredit - d.debet) END), 0) AS signed
     FROM tb_coa c LEFT JOIN (
       tb_jurnal_detail d JOIN tb_jurnal j ON j.id = d.id_jurnal AND j.tanggal < ?
     ) ON d.kode_akun = c.kode_akun
     GROUP BY c.kode_akun ORDER BY c.kode_akun ASC`,
    [mulai]
  );
  const round2 = (n: number) => Math.round(n * 100) / 100;
  let totD = 0;
  let totK = 0;
  const list = (rows as unknown as RowObj[]).map((r) => {
    const s = round2(Number(r.signed));
    let bukaDb = 0;
    let bukaKr = 0;
    if (r.pos_saldo === "Db") {
      if (s >= 0) bukaDb = s;
      else bukaKr = -s;
    } else if (r.pos_saldo === "Kr") {
      if (s >= 0) bukaKr = s;
      else bukaDb = -s;
    }
    totD = round2(totD + bukaDb);
    totK = round2(totK + bukaKr);
    return { kode_akun: r.kode_akun, nama: r.nama, pos_saldo: r.pos_saldo, pos_laporan: r.pos_laporan, buka_debet: bukaDb, buka_kredit: bukaKr };
  });
  return { rows: list, totD, totK, balance: Math.abs(totD - totK) < 0.01 };
}

/** Buku Besar 1 akun sebulan: saldo awal (pra-bulan) + mutasi + running. */
export async function ambilBBBulanan(kode: string, bulan: string) {
  const { mulai, sampai } = batasBulan(bulan);
  const [crows] = await pool.execute<RowDataPacket[]>("SELECT kode_akun, nama, pos_saldo FROM tb_coa WHERE kode_akun = ?", [kode]);
  const coa = crows[0] as unknown as { kode_akun: string; nama: string; pos_saldo: string } | undefined;
  if (!coa) throw new Error("Kode akun tidak dikenal: " + kode);
  const [orows] = await pool.execute<RowDataPacket[]>(
    `SELECT COALESCE(SUM(${coa.pos_saldo === "Db" ? "d.debet - d.kredit" : "d.kredit - d.debet"}), 0) AS signed
     FROM tb_jurnal_detail d JOIN tb_jurnal j ON j.id = d.id_jurnal
     WHERE d.kode_akun = ? AND j.tanggal < ?`,
    [kode, mulai]
  );
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const opening = round2(Number((orows[0] as unknown as { signed: number }).signed));
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT j.tanggal AS tanggal, j.no_bukti, j.keterangan, d.debet, d.kredit
     FROM tb_jurnal_detail d JOIN tb_jurnal j ON j.id = d.id_jurnal
     WHERE d.kode_akun = ? AND j.tanggal >= ? AND j.tanggal <= ?
     ORDER BY j.tanggal ASC, j.id ASC, d.id ASC LIMIT 2000`,
    [kode, mulai, sampai]
  );
  let saldo = opening;
  const list = (rows as unknown as RowObj[]).map((r, i) => {
    const mut = coa.pos_saldo === "Db" ? Number(r.debet) - Number(r.kredit) : Number(r.kredit) - Number(r.debet);
    saldo = round2(saldo + mut);
    return { no: i + 1, tanggal: tgl(r.tanggal), no_bukti: r.no_bukti, keterangan: r.keterangan, debet: Number(r.debet), kredit: Number(r.kredit), saldo };
  });
  return { coa, opening, rows: list, closing: saldo };
}

/** Buku Besar Pembantu 1 nasabah sebulan (aturan sisi = status TABUNGAN/PIUTANG). */
export async function ambilBBPembantuBulanan(kode: string, bulan: string) {
  const { mulai, sampai } = batasBulan(bulan);
  const [prows] = await pool.execute<RowDataPacket[]>(
    "SELECT kode, nama, status, saldo_awal FROM tb_pembantu WHERE kode = ?",
    [kode.toUpperCase()]
  );
  const pb = prows[0] as unknown as { kode: string; nama: string; status: string; saldo_awal: number } | undefined;
  if (!pb) throw new Error("Kode pembantu tidak dikenal: " + kode);
  const sisi = (debet: number, kredit: number) =>
    pb.status === "PIUTANG" ? debet - kredit : kredit - debet;
  const [orows] = await pool.execute<RowDataPacket[]>(
    `SELECT COALESCE(SUM(CASE WHEN c.pos_saldo = 'Db' THEN (d.debet - d.kredit) ELSE (d.kredit - d.debet) END), 0) AS mut
     FROM tb_jurnal_detail d JOIN tb_jurnal j ON j.id = d.id_jurnal
     JOIN tb_coa c ON c.kode_akun = d.kode_akun
     WHERE d.kode_bantu = ? AND j.tanggal < ?`,
    [pb.kode, mulai]
  );
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const opening = round2(Number(pb.saldo_awal) + Number((orows[0] as unknown as { mut: number }).mut));
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT j.tanggal AS tanggal, j.no_bukti, j.keterangan, d.debet, d.kredit
     FROM tb_jurnal_detail d JOIN tb_jurnal j ON j.id = d.id_jurnal
     WHERE d.kode_bantu = ? AND j.tanggal >= ? AND j.tanggal <= ?
     ORDER BY j.tanggal ASC, j.id ASC, d.id ASC LIMIT 2000`,
    [pb.kode, mulai, sampai]
  );
  let saldo = opening;
  const list = (rows as unknown as RowObj[]).map((r, i) => {
    saldo = round2(saldo + sisi(Number(r.debet), Number(r.kredit)));
    return { no: i + 1, tanggal: tgl(r.tanggal), no_bukti: r.no_bukti, keterangan: r.keterangan, debet: Number(r.debet), kredit: Number(r.kredit), saldo };
  });
  const pos = pb.status === "PIUTANG" ? "Db" : "Kr";
  return { pembantu: pb, pos, opening, rows: list, closing: saldo };
}

/** Neraca Lajur 10-kolom pra-tutup + baris laba (4-300) penyeimbang. */
export async function ambilNLPenuh(bulan: string) {
  const { mulai, sampai } = batasBulan(bulan);
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT c.kode_akun, c.nama, c.pos_saldo, c.pos_laporan,
      COALESCE(SUM(CASE WHEN j.id IS NULL THEN 0
        WHEN c.pos_saldo = 'Db' THEN (d.debet - d.kredit) ELSE (d.kredit - d.debet) END), 0) AS signed
     FROM tb_coa c LEFT JOIN (
       tb_jurnal_detail d JOIN tb_jurnal j ON j.id = d.id_jurnal
         AND j.tanggal <= ? AND NOT (j.tipe = 'PENUTUP' AND j.tanggal >= ?)
     ) ON d.kode_akun = c.kode_akun
     GROUP BY c.kode_akun ORDER BY c.kode_akun ASC`,
    [sampai, mulai]
  );
  const round2 = (n: number) => Math.round(n * 100) / 100;
  let nsD = 0;
  let nsK = 0;
  let lrD = 0;
  let lrK = 0;
  let neD = 0;
  let neK = 0;
  const list = (rows as unknown as RowObj[]).map((r) => {
    const s = round2(Number(r.signed));
    const nsDb = r.pos_saldo === "Db" ? Math.max(s, 0) : Math.max(-s, 0);
    const nsKr = r.pos_saldo === "Kr" ? Math.max(s, 0) : Math.max(-s, 0);
    const isLR = r.pos_laporan === "LR" && r.pos_saldo !== "-";
    const lrDb = isLR ? nsDb : 0;
    const lrKr = isLR ? nsKr : 0;
    const isNRC = r.pos_laporan === "NRC" && r.pos_saldo !== "-";
    const neDb = isNRC ? nsDb : 0;
    const neKr = isNRC ? nsKr : 0;
    nsD = round2(nsD + nsDb); nsK = round2(nsK + nsKr);
    lrD = round2(lrD + lrDb); lrK = round2(lrK + lrKr);
    neD = round2(neD + neDb); neK = round2(neK + neKr);
    return { kode_akun: r.kode_akun, nama: r.nama, pos_saldo: r.pos_saldo, ns_debet: nsDb, ns_kredit: nsKr, pos_laporan: r.pos_laporan, lr_debet: lrDb, lr_kredit: lrKr, ne_debet: neDb, ne_kredit: neKr };
  });
  // Laba ekonomi = Neraca Db - Neraca Kr (= LR Kr - LR Db): + = laba, - = rugi.
  // Laba dikredit ke modal (4-300 Kr), rugi didebet (4-300 Db) agar Neraca balance.
  const laba = round2(neD - neK);
  const labaRow = {
    kode_akun: "4-300", nama: "Laba/Rugi usaha", pos_saldo: "Kr",
    ns_debet: 0, ns_kredit: 0, pos_laporan: "LR",
    lr_debet: 0, lr_kredit: 0,
    ne_debet: laba < 0 ? -laba : 0, ne_kredit: laba > 0 ? laba : 0,
  };
  list.push(labaRow);
  neD = round2(neD + (labaRow.ne_debet as number));
  neK = round2(neK + (labaRow.ne_kredit as number));
  return {
    rows: list, nsD, nsK, lrD, lrK, neD, neK, laba,
    balanceNS: Math.abs(nsD - nsK) < 0.01,
    balanceNe: Math.abs(neD - neK) < 0.01,
  };
}

/** Laba Rugi berseksi pra-tutup (pendapatan 4-xxx, biaya 6-xxx). */
export async function ambilLabaRugiSeksi(bulan: string) {
  const nl = await ambilNLPenuh(bulan);
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const pend = nl.rows.filter((r) => String(r.kode_akun).startsWith("4-") && r.pos_laporan === "LR" && String(r.kode_akun) !== "4-300")
    .map((r) => ({ kode_akun: r.kode_akun, nama: r.nama, saldo: round2(Number(r.lr_kredit) - Number(r.lr_debet)) }));
  const biaya = nl.rows.filter((r) => String(r.kode_akun).startsWith("6-"))
    .map((r) => ({ kode_akun: r.kode_akun, nama: r.nama, saldo: round2(Number(r.lr_debet) - Number(r.lr_kredit)) }));
  const totPend = round2(pend.reduce((a, r) => a + r.saldo, 0));
  const totBiaya = round2(biaya.reduce((a, r) => a + r.saldo, 0));
  return { pend, biaya, totPend, totBiaya, laba: round2(totPend - totBiaya) };
}

/** Jurnal penutup bulan itu (kosong bila belum tutup). */
export async function ambilPenutupPeriode(bulan: string) {
  const { mulai, sampai } = batasBulan(bulan);
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT j.tanggal AS tanggal, j.no_bukti, j.keterangan, d.kode_akun, c.nama AS nama_akun,
       d.kode_bantu, d.debet, d.kredit
     FROM tb_jurnal_detail d
     JOIN tb_jurnal j ON j.id = d.id_jurnal
     JOIN tb_coa c ON c.kode_akun = d.kode_akun
     WHERE j.tipe = 'PENUTUP' AND j.tanggal >= ? AND j.tanggal <= ?
     ORDER BY j.id ASC, d.id ASC LIMIT 1000`,
    [mulai, sampai]
  );
  const list: RowObj[] = (rows as unknown as RowObj[]).map((r) => ({ ...r, tanggal: tgl(r.tanggal) }));
  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    rows: list,
    totDb: round2(list.reduce((a, r) => a + Number(r.debet), 0)),
    totKr: round2(list.reduce((a, r) => a + Number(r.kredit), 0)),
  };
}

/** Neraca Setelah Penutup: semua jurnal ≤ akhir bulan, sisi Db/Kr + JUMLAH. */
export async function ambilNeracaSetelahPenutup(bulan: string) {
  const { sampai } = batasBulan(bulan);
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT c.kode_akun, c.nama, c.pos_saldo,
      COALESCE(SUM(CASE WHEN j.id IS NULL THEN 0
        WHEN c.pos_saldo = 'Db' THEN (d.debet - d.kredit) ELSE (d.kredit - d.debet) END), 0) AS signed
     FROM tb_coa c LEFT JOIN (
       tb_jurnal_detail d JOIN tb_jurnal j ON j.id = d.id_jurnal AND j.tanggal <= ?
     ) ON d.kode_akun = c.kode_akun
     GROUP BY c.kode_akun ORDER BY c.kode_akun ASC`,
    [sampai]
  );
  const round2 = (n: number) => Math.round(n * 100) / 100;
  let totD = 0;
  let totK = 0;
  const list = (rows as unknown as RowObj[]).map((r) => {
    const s = round2(Number(r.signed));
    let db = 0;
    let kr = 0;
    if (r.pos_saldo === "Db") {
      if (s >= 0) db = s;
      else kr = -s;
    } else if (r.pos_saldo === "Kr") {
      if (s >= 0) kr = s;
      else db = -s;
    }
    totD = round2(totD + db);
    totK = round2(totK + kr);
    return { kode_akun: r.kode_akun, nama: r.nama, pos_saldo: r.pos_saldo, debet: db, kredit: kr };
  });
  return { rows: list, totD, totK, balance: Math.abs(totD - totK) < 0.01 };
}

/** Daftar saldo s/d akhir bulan (arsip stabil untuk bulan tutup). */
export async function ambilDaftarSaldoPeriode(tipe: "TABUNGAN" | "PIUTANG", bulan: string) {
  const { sampai } = batasBulan(bulan);
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT p.kode, p.nama, p.no_rek, p.status, p.saldo_awal,
      (p.saldo_awal + COALESCE((SELECT SUM(
        CASE WHEN c.pos_saldo = 'Db' THEN (d.debet - d.kredit) ELSE (d.kredit - d.debet) END
      ) FROM tb_jurnal_detail d JOIN tb_coa c ON c.kode_akun = d.kode_akun
        JOIN tb_jurnal j ON j.id = d.id_jurnal
        WHERE d.kode_bantu = p.kode AND j.tanggal <= ?), 0)) AS saldo_akhir
     FROM tb_pembantu p WHERE p.status = ? ORDER BY p.kode ASC`,
    [sampai, tipe]
  );
  const list = rows as unknown as RowObj[];
  const pos = tipe === "PIUTANG" ? "Db" : "Kr";
  const total = Math.round(list.reduce((a, r) => a + Number(r.saldo_akhir), 0) * 100) / 100;
  return { rows: list.map((r): RowObj => ({ ...r, pos })), total };
}

/** Daftar kode pembantu + saldo awal (pra-bulan) ala sheet kode-SA. */
export async function ambilKodePembantu(bulan: string) {
  const { mulai } = batasBulan(bulan);
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT p.kode, p.nama, p.no_rek, p.status, p.saldo_awal,
      (p.saldo_awal + COALESCE((SELECT SUM(
        CASE WHEN c.pos_saldo = 'Db' THEN (d.debet - d.kredit) ELSE (d.kredit - d.debet) END
      ) FROM tb_jurnal_detail d JOIN tb_coa c ON c.kode_akun = d.kode_akun
        JOIN tb_jurnal j ON j.id = d.id_jurnal
        WHERE d.kode_bantu = p.kode AND j.tanggal < ?), 0)) AS saldo_awal_hit
     FROM tb_pembantu p ORDER BY p.kode ASC`,
    [mulai]
  );
  const list: RowObj[] = (rows as unknown as RowObj[]).map((r) => ({
    ...r,
    pos: r.status === "PIUTANG" ? "Db" : "Kr",
    saldo_awal_hit: Math.round(Number(r.saldo_awal_hit) * 100) / 100,
  }));
  return { rows: list };
}
