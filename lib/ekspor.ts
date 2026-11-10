import ExcelJS from "exceljs";
import type { RowObj } from "./laporan";

export type Kolom = { key: string; head: string; num?: boolean; width?: number };

export type SheetPaket = {
  nama: string;
  kolom: Kolom[];
  rows: RowObj[];
  judul: string;
  sub?: string;
  total?: (string | number)[];
};

function sel(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// CSV ramah Excel Indonesia: BOM + delimiter ';' agar angka/tanggal langsung benar.
export function keCSV(kolom: Kolom[], rows: RowObj[]): string {
  const head = kolom.map((k) => sel(k.head)).join(";");
  const lines = rows.map((r) => kolom.map((k) => sel(r[k.key])).join(";"));
  return "﻿" + [head, ...lines].join("\r\n") + "\r\n";
}

export async function keXLSX(
  kolom: Kolom[],
  rows: RowObj[],
  opts: { judul: string; sub?: string; total?: (string | number)[] }
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Bank Miska";
  isiSheet(wb.addWorksheet("Laporan", { properties: { defaultRowHeight: 18 } }), {
    nama: "Laporan",
    kolom,
    rows,
    judul: opts.judul,
    sub: opts.sub,
    total: opts.total,
  });
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// Workbook paket periode: beberapa sheet (Jurnal + Neraca Lajur + Laba Rugi + Daftar Saldo).

function isiSheet(ws: ExcelJS.Worksheet, opts: SheetPaket) {
  const kolom = opts.kolom;
  const rows = opts.rows;
  ws.addRow([opts.judul]);
  ws.mergeCells(1, 1, 1, kolom.length);
  const t = ws.getRow(1);
  t.font = { bold: true, size: 14, color: { argb: "FF0F172A" } };
  if (opts.sub) {
    ws.addRow([opts.sub]);
    ws.mergeCells(2, 1, 2, kolom.length);
    ws.getRow(2).font = { size: 10, color: { argb: "FF64748B" } };
  }
  ws.addRow([]);
  const headIdx = ws.rowCount + 1;
  ws.addRow(kolom.map((k) => k.head));
  const head = ws.getRow(headIdx);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.alignment = { vertical: "middle" };
  head.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
    c.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  });

  for (const r of rows) {
    ws.addRow(
      kolom.map((k) => {
        const v = r[k.key];
        if (k.num) {
          const n = Number(v);
          return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
        }
        return v === null || v === undefined ? "" : String(v);
      })
    );
  }
  const first = headIdx + 1;
  const last = ws.rowCount;
  if (last >= first) {
    ws.autoFilter = { from: { row: headIdx, column: 1 }, to: { row: last, column: kolom.length } };
    ws.views = [{ state: "frozen", ySplit: headIdx }];
    for (let i = first; i <= last; i++) {
      ws.getRow(i).eachCell((c, n) => {
        if (kolom[n - 1]?.num) c.numFmt = "#,##0";
        c.border = {
          top: { style: "thin", color: { argb: "FFE2E8F0" } },
          left: { style: "thin", color: { argb: "FFE2E8F0" } },
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          right: { style: "thin", color: { argb: "FFE2E8F0" } },
        };
      });
    }
  }
  if (opts.total) {
    const tr = ws.addRow(opts.total);
    tr.font = { bold: true };
  }
  kolom.forEach((k, i) => {
    const col = ws.getColumn(i + 1);
    let w = k.width ?? 16;
    if (!k.width) {
      for (const r of rows.slice(0, 200)) {
        w = Math.max(w, Math.min(42, String(r[k.key] ?? "").length + 3));
      }
    }
    col.width = w;
  });
}

export function namaFile(laporan: string, suffix: string, ext: "csv" | "xlsx"): string {
  const aman = `${laporan}-${suffix}`.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 80);
  return `${aman}.${ext}`;
}

// =====================================================================
// PAKET SEKOLAH — workbook gaya contoh (kop + tabel berbingkai + JUMLAH)
// Nol tampil "-" namun tetap numerik via format #,##0;-#,##0;"-".
// =====================================================================

export const KOP_SEKOLAH = "BANK MISKA SMK NEGERI 9 SEMARANG";

const NAMA_BULAN_ID = [
  "JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI",
  "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER",
];

/** "2026-10" → "BULAN OKTOBER 2026" ala contoh. */
export function judulBulan(bulan: string): string {
  const m = bulan.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (!m) return bulan;
  return `BULAN ${NAMA_BULAN_ID[Number(m[2]) - 1]} ${m[1]}`;
}

const FILL_KUNING = "FFFFFF00";
const FILL_HIJAU = "FF92D050";
// Warna tab sheet per kategori (rapi & profesional).
const TAB_JURNAL = "FF2563EB"; // biru: jurnal harian
const TAB_BUKU = "FF16A34A"; // hijau: buku besar + pembantu
const TAB_LAPORAN = "FF7C3AED"; // ungu: neraca + laba rugi + penutup
const TAB_MASTER = "FF64748B"; // abu: master + daftar saldo
const FMT_RP = '#,##0;-#,##0;"-"';
const GARIS_HITAM = {
  top: { style: "thin", color: { argb: "FF000000" } },
  left: { style: "thin", color: { argb: "FF000000" } },
  bottom: { style: "thin", color: { argb: "FF000000" } },
  right: { style: "thin", color: { argb: "FF000000" } },
} as const;

export type HeadDef = { text: string; fill?: string };

/** 3 baris kop (nama sekolah + judul + bulan), merge selebar tabel. */
function tulisKop(ws: ExcelJS.Worksheet, judul: string, bulan: string, nKol: number) {
  const kop = [KOP_SEKOLAH, judul, judulBulan(bulan)];
  kop.forEach((t, i) => {
    const r = ws.getRow(i + 1);
    r.getCell(1).value = t;
    r.getCell(1).font = { bold: true, size: i === 0 ? 12 : 11 };
    if (nKol > 1) ws.mergeCells(i + 1, 1, i + 1, nKol);
  });
}

function bingkai(cell: ExcelJS.Cell) {
  cell.border = { ...GARIS_HITAM };
}

/** Tabel berbingkai ala contoh. numIdx = indeks kolom numerik (format Rp/-). */
function tulisTabel(
  ws: ExcelJS.Worksheet,
  mulaiBaris: number,
  heads: HeadDef[],
  rows: (string | number)[][],
  opts: { numIdx?: number[]; total?: (string | number)[]; merah?: boolean } = {}
): number {
  let r = mulaiBaris;
  const hr = ws.getRow(r);
  heads.forEach((h, i) => {
    const c = hr.getCell(i + 1);
    c.value = h.text;
    c.font = { bold: true };
    c.alignment = { horizontal: "center", vertical: "middle" };
    if (h.fill) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: h.fill } };
    bingkai(c);
  });
  r++;
  for (const row of rows) {
    const wr = ws.getRow(r);
    row.forEach((v, i) => {
      const c = wr.getCell(i + 1);
      c.value = v === null || v === undefined ? "" : v;
      if (opts.numIdx?.includes(i)) c.numFmt = FMT_RP;
      if (opts.merah) c.font = { color: { argb: "FFFF0000" } };
      bingkai(c);
    });
    r++;
  }
  if (opts.total) {
    const tr = ws.getRow(r);
    opts.total.forEach((v, i) => {
      const c = tr.getCell(i + 1);
      c.value = v === null || v === undefined ? "" : v;
      c.font = { bold: true };
      if (opts.numIdx?.includes(i)) c.numFmt = FMT_RP;
      bingkai(c);
    });
    r++;
  }
  return r;
}

function namaSheetAman(nama: string): string {
  return nama.replace(/[\\/*?:[\]]/g, "-").slice(0, 31) || "Sheet";
}

export type BBRow = { no: number; tanggal: unknown; no_bukti: unknown; keterangan: unknown; debet: number; kredit: number; saldo: number };

export type PaketSekolah = {
  bulan: string;
  jurnal: { rows: RowObj[]; totDb: number; totKr: number; balance: boolean };
  akun: { rows: RowObj[]; totD: number; totK: number };
  nl: { rows: RowObj[]; nsD: number; nsK: number; neD: number; neK: number; laba: number };
  laba: { pend: RowObj[]; biaya: RowObj[]; totPend: number; totBiaya: number; laba: number };
  penutup: { rows: RowObj[]; totDb: number; totKr: number };
  nsp: { rows: RowObj[]; totD: number; totK: number };
  debitur: { rows: RowObj[]; total: number };
  saldoTab: { rows: RowObj[]; total: number };
  kode: { rows: RowObj[] };
  bbAkun: { kode: string; nama: string; pos: string; opening: number; rows: BBRow[]; closing: number }[];
  bbPem: { kode: string; nama: string; pos: string; opening: number; rows: BBRow[]; closing: number }[];
};

// =====================================================================
// BB SATU SHEET INTERAKTIF — replika sheet contoh "b besar" / "BB Pem debt/tab":
// 1 sheet visible (dropdown kode di C5 + header + tabel rumus)
// + 2 sheet helper veryHidden (ref daftar kode, data flat mutasi).
// Dipakai 3x: "Buku Besar" (per kode akun), "BB Pem Tab" (H/Kr),
// "BB Pem Debt" (P/Db). Rumus sengaja VLOOKUP + INDEX + MATCH + IFERROR
// (tanpa XLOOKUP/FILTER) agar jalan di Excel lama. Kosong tampil "".
// Data kolom helper: A=Kunci(Kode|No) B=Kode C=No D=Tanggal E=Bukti
//   F=Keterangan G=Debet H=Kredit I=Saldo
// =====================================================================
export type BBRefItem = { kode: string; nama: string; pos: string; opening: number };
export type BBDataItem = { kode: string; rows: BBRow[] };
function tulisBBInteraktif(
  wb: ExcelJS.Workbook,
  bulan: string,
  opts: {
    sheet: string; refSheet: string; dataSheet: string;
    judul: string; labelKode: string; labelNama: string; tab: string;
    // ref = daftar LENGKAP untuk dropdown + header (dari Neraca Lajur / master
    // pembantu), data = mutasi bulan itu saja (hanya yang gerak).
    ref: BBRefItem[];
    data: BBDataItem[];
  }
) {
  const ref = wb.addWorksheet(opts.refSheet);
  ref.addRow(["Kode", "Nama", "Pos", "Saldo Awal"]);
  const hr = ref.getRow(1);
  hr.font = { bold: true };
  hr.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    bingkai(c);
  });
  for (const b of opts.ref) {
    const r = ref.addRow([b.kode, b.nama, b.pos, b.opening]);
    r.getCell(4).numFmt = FMT_RP;
    r.eachCell((c) => bingkai(c));
  }
  ref.columns = [{ width: 12 }, { width: 34 }, { width: 8 }, { width: 20 }];
  ref.state = "veryHidden";

  const data = wb.addWorksheet(opts.dataSheet);
  data.addRow(["Kunci", "Kode", "No", "Tanggal", "Bukti", "Keterangan", "Debet", "Kredit", "Saldo"]);
  data.getRow(1).font = { bold: true };
  for (const d of opts.data) {
    for (const r of d.rows) {
      data.addRow([
        `${d.kode}|${r.no}`,
        d.kode,
        r.no,
        String(r.tanggal ?? ""),
        String(r.no_bukti ?? ""),
        String(r.keterangan ?? ""),
        Number(r.debet),
        Number(r.kredit),
        Number(r.saldo),
      ]);
    }
  }
  data.state = "veryHidden";

  const ws = wb.addWorksheet(opts.sheet);
  ws.properties.tabColor = { argb: opts.tab };
  tulisKop(ws, opts.judul, bulan, 7);

  const nRef = opts.ref.length;
  const totalBaris = opts.data.reduce((a, b) => a + b.rows.length, 0);
  const akhirRef = Math.max(nRef + 1, 2);
  const akhirData = Math.max(totalBaris + 1, 2);
  const rentangKunci = `'${opts.dataSheet}'!$A$2:$A$${akhirData}`;

  // Blok info ala contoh: A5 label, C5 dropdown | F5 label, G5 rumus (sama baris 6).
  const r5 = ws.getRow(5);
  r5.getCell(1).value = opts.labelKode;
  r5.getCell(1).font = { bold: true };
  r5.getCell(6).value = "Pos Saldo :";
  r5.getCell(6).font = { bold: true };
  const r6 = ws.getRow(6);
  r6.getCell(1).value = opts.labelNama;
  r6.getCell(1).font = { bold: true };
  r6.getCell(6).value = "Saldo Awal :";
  r6.getCell(6).font = { bold: true };

  const c5 = ws.getCell("C5");
  c5.value = nRef > 0 ? opts.ref[0].kode : "";
  if (nRef > 0) {
    c5.dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: [`'${opts.refSheet}'!$A$2:$A$${akhirRef}`],
      showErrorMessage: true,
      errorTitle: "Kode tidak dikenal",
      error: "Pilih kode dari panah dropdown.",
    } as unknown as ExcelJS.Cell["dataValidation"];
  }
  bingkai(ws.getCell("C5"));
  ws.getCell("G5").value = {
    formula: `IF($C$5="","",IFERROR(VLOOKUP($C$5,'${opts.refSheet}'!$A:$D,3,FALSE),""))`,
  } as unknown as string | number;
  bingkai(ws.getCell("G5"));
  ws.getCell("C6").value = {
    formula: `IF($C$5="","",IFERROR(VLOOKUP($C$5,'${opts.refSheet}'!$A:$D,2,FALSE),""))`,
  } as unknown as string | number;
  bingkai(ws.getCell("C6"));
  ws.getCell("G6").value = {
    formula: `IF($C$5="","",IFERROR(VLOOKUP($C$5,'${opts.refSheet}'!$A:$D,4,FALSE),""))`,
  } as unknown as string | number;
  ws.getCell("G6").numFmt = FMT_RP;
  bingkai(ws.getCell("G6"));

  // Baris 7 dikosongkan seperti contoh. Header digabung baris 8-9, data mulai baris 10.
  const heads: HeadDef[] = [
    { text: "No" }, { text: "Tanggal" }, { text: "Bukti" }, { text: "Keterangan" },
    { text: "Debet" }, { text: "Kredit" }, { text: "Saldo" },
  ];
  const hr8 = ws.getRow(8);
  const hr9 = ws.getRow(9);
  heads.forEach((h, i) => {
    const c = hr8.getCell(i + 1);
    c.value = h.text;
    c.font = { bold: true };
    c.alignment = { horizontal: "center", vertical: "middle" };
    bingkai(c);
    bingkai(hr9.getCell(i + 1));
    ws.mergeCells(8, i + 1, 9, i + 1);
  });

  // Baris rumus: MATCH dibatasi ke rentang data (bukan 1 juta baris) agar ringan.
  const maks = Math.min(Math.max(...opts.data.map((b) => b.rows.length), 0, 10), 500);
  const kolomData = ["C", "D", "E", "F", "G", "H", "I"];
  for (let i = 0; i < maks; i++) {
    const n = i + 1;
    const wr = ws.getRow(10 + i);
    kolomData.forEach((kol, ci) => {
      const c = wr.getCell(ci + 1);
      c.value = {
        formula: `IF($C$5="","",IFERROR(INDEX('${opts.dataSheet}'!$${kol}$2:$${kol}$${akhirData},MATCH($C$5&"|"&${n},${rentangKunci},0)),""))`,
      } as unknown as string | number;
      if (ci >= 4) c.numFmt = FMT_RP;
      bingkai(c);
    });
  }
  ws.columns = [{ width: 6 }, { width: 13 }, { width: 10 }, { width: 36 }, { width: 18 }, { width: 18 }, { width: 18 }];
  ws.views = [{ state: "frozen", ySplit: 9 }];
}

export async function kePaketSekolahXLSX(p: PaketSekolah): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Bank Miska";
  const JB = p.bulan;

  // ---- Jurnal ----
  {
    const ws = wb.addWorksheet("Jurnal");
    ws.properties.tabColor = { argb: TAB_JURNAL };
    const heads: HeadDef[] = [
      { text: "TANGGAL" }, { text: "BUKTI" }, { text: "KETERANGAN" },
      { text: "KODE AKUN" }, { text: "KODE BANTU" },
      { text: "DEBET", fill: FILL_KUNING }, { text: "KREDIT", fill: FILL_HIJAU },
    ];
    tulisKop(ws, "JURNAL UMUM", JB, heads.length);
    const rows = p.jurnal.rows.map((r) => [
      String(r.tanggal ?? ""), String(r.no_bukti ?? ""), String(r.keterangan ?? ""),
      String(r.kode_akun ?? ""), String(r.kode_bantu ?? ""),
      Number(r.debet), Number(r.kredit),
    ]);
    tulisTabel(ws, 5, heads, rows, {
      numIdx: [5, 6],
      total: ["", "", "", "", `JUMLAH (${rows.length} baris)`, p.jurnal.totDb, p.jurnal.totKr],
    });
    ws.columns = [{ width: 13 }, { width: 10 }, { width: 36 }, { width: 11 }, { width: 11 }, { width: 18 }, { width: 18 }];
  }

  // ---- Buku Besar grup (langsung setelah Jurnal, mengikuti siklus akuntansi) ----
  // Dropdown diambil dari Neraca Lajur / master kode (LENGKAP, bukan cuma yang gerak).
  // Saldo awal pra-bulan per akun dari sheet "akun" (buka_debet/buka_kredit).
  const bukaAkun = new Map(p.akun.rows.map((r) => [String(r.kode_akun), r]));
  const bukaSigned = (kode: string): number => {
    const b = bukaAkun.get(kode);
    if (!b) return 0;
    return String(b.pos_saldo) === "Db"
      ? Number(b.buka_debet) - Number(b.buka_kredit)
      : Number(b.buka_kredit) - Number(b.buka_debet);
  };
  // Semua kode akun di Neraca Lajur (buang duplikat baris laba 4-300 + akun header '-').
  const refAkunSemua: BBRefItem[] = [];
  {
    const lihat = new Set<string>();
    for (const r of p.nl.rows) {
      const kode = String(r.kode_akun);
      if (lihat.has(kode) || String(r.pos_saldo) === "-") continue;
      lihat.add(kode);
      refAkunSemua.push({ kode, nama: String(r.nama), pos: String(r.pos_saldo), opening: bukaSigned(kode) });
    }
  }
  const refPent = refAkunSemua.filter((a) => String(bukaAkun.get(a.kode)?.pos_laporan) === "LR");
  const dataAkun: BBDataItem[] = p.bbAkun.map((b) => ({ kode: b.kode, rows: b.rows }));

  // Semua kode pembantu dari master kode-SA + mutasi bulan itu.
  const refTab: BBRefItem[] = [];
  const refDebt: BBRefItem[] = [];
  for (const k of p.kode.rows) {
    const item: BBRefItem = {
      kode: String(k.kode),
      nama: String(k.nama),
      pos: String(k.pos ?? (k.status === "PIUTANG" ? "Db" : "Kr")),
      opening: Math.round(Number(k.saldo_awal_hit) * 100) / 100,
    };
    (String(k.status) === "PIUTANG" ? refDebt : refTab).push(item);
  }
  const dataTab: BBDataItem[] = [];
  const dataDebt: BBDataItem[] = [];
  for (const b of p.bbPem) {
    (b.pos === "Db" ? dataDebt : dataTab).push({ kode: b.kode, rows: b.rows });
  }

  // ---- Buku Besar: SATU sheet interaktif (dropdown kode akun C5) ----
  tulisBBInteraktif(wb, JB, {
    sheet: "Buku Besar",
    refSheet: "Ref-Akun",
    dataSheet: "Data-BB-Akun",
    judul: "BUKU BESAR",
    labelKode: "Kode Akun :",
    labelNama: "Nama Akun :",
    tab: TAB_BUKU,
    ref: refAkunSemua,
    data: dataAkun,
  });

  // ---- Buku Besar (Pent): khusus akun LR (4-xxx/6-xxx) ----
  tulisBBInteraktif(wb, JB, {
    sheet: "Buku Besar (Pent)",
    refSheet: "Ref-Pent",
    dataSheet: "Data-BB-Pent",
    judul: "BUKU BESAR",
    labelKode: "Kode Akun :",
    labelNama: "Nama Akun :",
    tab: TAB_BUKU,
    ref: refPent,
    data: dataAkun,
  });

  // ---- BB Pembantu: 2 sheet interaktif (dropdown kode pembantu C5) ----
  tulisBBInteraktif(wb, JB, {
    sheet: "BB Pem Tab",
    refSheet: "Ref-Pem-Tab",
    dataSheet: "Data-BB-Tab",
    judul: "BUKU BESAR PEMBANTU",
    labelKode: "Kode Pembantu :",
    labelNama: "Nama Relasi :",
    tab: TAB_BUKU,
    ref: refTab,
    data: dataTab,
  });
  tulisBBInteraktif(wb, JB, {
    sheet: "BB Pem Debt",
    refSheet: "Ref-Pem-Debt",
    dataSheet: "Data-BB-Debt",
    judul: "BUKU BESAR PEMBANTU",
    labelKode: "Kode Pembantu :",
    labelNama: "Nama Relasi :",
    tab: TAB_BUKU,
    ref: refDebt,
    data: dataDebt,
  });

  // ---- Neraca Saldo (semua akun + JUMLAH, Debet wajib = Kredit) ----
  {
    const ws = wb.addWorksheet("Neraca Saldo");
    ws.properties.tabColor = { argb: TAB_LAPORAN };
    tulisKop(ws, "NERACA SALDO", JB, 5);
    const heads: HeadDef[] = [
      { text: "Kode Akun" }, { text: "Nama Akun" }, { text: "Pos Saldo" },
      { text: "Debet" }, { text: "Kredit" },
    ];
    const rows = p.nl.rows.map((r) => [
      String(r.kode_akun), String(r.nama), String(r.pos_saldo),
      Number(r.ns_debet), Number(r.ns_kredit),
    ]);
    tulisTabel(ws, 5, heads, rows, {
      numIdx: [3, 4],
      total: ["", "JUMLAH", "", p.nl.nsD, p.nl.nsK],
    });
    ws.columns = [{ width: 12 }, { width: 36 }, { width: 11 }, { width: 18 }, { width: 18 }];
  }

  // ---- Neraca Lajur 10 kolom ----
  {
    const ws = wb.addWorksheet("NL");
    ws.properties.tabColor = { argb: TAB_LAPORAN };
    tulisKop(ws, "NERACA LAJUR", JB, 10);
    const heads: HeadDef[] = [
      { text: "Kode Akun" }, { text: "Nama Akun" }, { text: "Pos Saldo" },
      { text: "NS Debet" }, { text: "NS Kredit" }, { text: "Pos Laporan" },
      { text: "LR Debet" }, { text: "LR Kredit" }, { text: "Neraca Debet" }, { text: "Neraca Kredit" },
    ];
    const rows = p.nl.rows.map((r) => [
      String(r.kode_akun), String(r.nama), String(r.pos_saldo),
      Number(r.ns_debet), Number(r.ns_kredit), String(r.pos_laporan),
      Number(r.lr_debet), Number(r.lr_kredit), Number(r.ne_debet), Number(r.ne_kredit),
    ]);
    tulisTabel(ws, 5, heads, rows, {
      numIdx: [3, 4, 6, 7, 8, 9],
      total: ["", "", "JUMLAH", p.nl.nsD, p.nl.nsK, "", 0, 0, p.nl.neD, p.nl.neK],
    });
    ws.columns = [{ width: 12 }, { width: 34 }, { width: 10 }, { width: 16 }, { width: 16 }, { width: 11 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 16 }];
  }

  // ---- Laba Rugi berseksi (4 kolom ala contoh: rincian di C, subtotal di D) ----
  {
    const ws = wb.addWorksheet("laba R");
    ws.properties.tabColor = { argb: TAB_LAPORAN };
    tulisKop(ws, "LAPORAN LABA RUGI", JB, 4);
    // Kepala 2 baris ala contoh: A5=KODE, A6=AKUN, B6=Nama Akun.
    const k5 = ws.getRow(5);
    k5.getCell(1).value = "KODE";
    k5.getCell(1).font = { bold: true };
    const k6 = ws.getRow(6);
    k6.getCell(1).value = "AKUN";
    k6.getCell(1).font = { bold: true };
    k6.getCell(2).value = "Nama Akun";
    k6.getCell(2).font = { bold: true };
    for (let i = 1; i <= 4; i++) {
      bingkai(k5.getCell(i));
      bingkai(k6.getCell(i));
    }
    const rows: (string | number)[][] = [["PENDAPATAN", "", "", ""]];
    p.laba.pend.forEach((r) => rows.push([String(r.kode_akun), String(r.nama), Number(r.saldo), ""]));
    rows.push(["", "Jumlah Pendapatan", "", p.laba.totPend]);
    rows.push(["BIAYA", "", "", ""]);
    p.laba.biaya.forEach((r) => rows.push([String(r.kode_akun), String(r.nama), Number(r.saldo), ""]));
    rows.push(["", "Jumlah Biaya", "", p.laba.totBiaya]);
    rows.push(["", "Jumlah Laba bersih/Rugi bersih", "", p.laba.laba]);
    let lr = 7;
    for (const row of rows) {
      const wr = ws.getRow(lr++);
      const tebal = row[0] === "" || (row[2] === "" && row[3] === "");
      row.forEach((v, i) => {
        const c = wr.getCell(i + 1);
        c.value = v === null || v === undefined ? "" : v;
        if (tebal) c.font = { bold: true };
        if (i >= 2) c.numFmt = FMT_RP;
        bingkai(c);
      });
    }
    ws.columns = [{ width: 12 }, { width: 40 }, { width: 20 }, { width: 20 }];
  }

  // ---- Jurnal Penutup ----
  {
    const ws = wb.addWorksheet("Penutup");
    ws.properties.tabColor = { argb: TAB_LAPORAN };
    tulisKop(ws, "JURNAL PENUTUP", JB, 7);
    const heads: HeadDef[] = [
      { text: "Tanggal" }, { text: "Bukti" }, { text: "Keterangan" },
      { text: "KodeAkun" }, { text: "Kode Bantu" }, { text: "Debet" }, { text: "Kredit" },
    ];
    const rows = p.penutup.rows.map((r) => [
      String(r.tanggal ?? ""), String(r.no_bukti ?? ""), String(r.keterangan ?? ""),
      String(r.kode_akun ?? ""), String(r.kode_bantu ?? ""),
      Number(r.debet), Number(r.kredit),
    ]);
    if (rows.length === 0) {
      const nr = ws.getRow(5);
      nr.getCell(1).value = "Belum ada jurnal penutup bulan ini.";
      ws.mergeCells(5, 1, 5, heads.length);
    } else {
      tulisTabel(ws, 5, heads, rows, {
        numIdx: [5, 6],
        total: ["", "", "", "", "JUMLAH", p.penutup.totDb, p.penutup.totKr],
      });
    }
    ws.columns = [{ width: 13 }, { width: 10 }, { width: 36 }, { width: 11 }, { width: 11 }, { width: 18 }, { width: 18 }];
  }

  // ---- Neraca Setelah Penutup ----
  {
    const ws = wb.addWorksheet("Neraca S PNTUP");
    ws.properties.tabColor = { argb: TAB_LAPORAN };
    tulisKop(ws, "NERACA SETELAH PENUTUP", JB, 5);
    const heads: HeadDef[] = [
      { text: "Kode Akun" }, { text: "Nama Akun" }, { text: "Pos Saldo" },
      { text: "Debet" }, { text: "Kredit" },
    ];
    const rows = p.nsp.rows.map((r) => [
      String(r.kode_akun), String(r.nama), String(r.pos_saldo),
      Number(r.debet), Number(r.kredit),
    ]);
    tulisTabel(ws, 5, heads, rows, {
      numIdx: [3, 4],
      total: ["", "JUMLAH", "", p.nsp.totD, p.nsp.totK],
    });
    ws.columns = [{ width: 12 }, { width: 36 }, { width: 11 }, { width: 18 }, { width: 18 }];
  }

  // ---- Akun (master COA + saldo awal, ditaruh setelah laporan) ----
  {
    const ws = wb.addWorksheet("akun");
    ws.properties.tabColor = { argb: TAB_MASTER };
    const heads: HeadDef[] = [
      { text: "Kode Akun", fill: FILL_KUNING }, { text: "Nama Akun", fill: FILL_KUNING },
      { text: "Pos Saldo", fill: FILL_KUNING }, { text: "Pos Laporan", fill: FILL_KUNING },
      { text: "Saldo Awal Debet", fill: FILL_KUNING }, { text: "Saldo Awal Kredit", fill: FILL_KUNING },
    ];
    tulisKop(ws, "DAFTAR AKUN", JB, heads.length);
    const rows = p.akun.rows.map((r) => [
      String(r.kode_akun), String(r.nama), String(r.pos_saldo), String(r.pos_laporan),
      Number(r.buka_debet), Number(r.buka_kredit),
    ]);
    tulisTabel(ws, 5, heads, rows, {
      numIdx: [4, 5], merah: true,
      total: ["", "JUMLAH", "", "", p.akun.totD, p.akun.totK],
    });
    ws.columns = [{ width: 12 }, { width: 36 }, { width: 11 }, { width: 13 }, { width: 18 }, { width: 18 }];
  }

  // ---- Daftar saldo (Debitur + Saldo Tab) & kode pembantu ----
  const tulisDaftar = (
    nama: string, judul: string,
    rows: RowObj[], total: number, awalNotAkhir: boolean
  ) => {
    const ws = wb.addWorksheet(namaSheetAman(nama));
    ws.properties.tabColor = { argb: TAB_MASTER };
    tulisKop(ws, judul, JB, 7);
    const heads: HeadDef[] = [
      { text: "Kode" }, { text: "Nama" }, { text: "Pos" }, { text: "NO REK" },
      { text: "Status" }, { text: "Rp" }, { text: awalNotAkhir ? "Saldo Awal" : "Saldo" },
    ];
    const key = awalNotAkhir ? "saldo_awal_hit" : "saldo_akhir";
    const body = rows.map((r) => [
      String(r.kode), String(r.nama), String(r.pos ?? (r.status === "PIUTANG" ? "Db" : "Kr")),
      String(r.no_rek ?? ""), String(r.status), "Rp", Number(r[key] ?? 0),
    ]);
    tulisTabel(ws, 5, heads, body, {
      numIdx: [6],
      total: ["", "", "", "", "", "Rp", total],
    });
    ws.columns = [{ width: 10 }, { width: 34 }, { width: 7 }, { width: 12 }, { width: 11 }, { width: 5 }, { width: 20 }];
  };
  tulisDaftar("Debitur", "DAFTAR DEBITUR PEMBANTU", p.debitur.rows, p.debitur.total, false);
  tulisDaftar("Saldo Tab", "DAFTAR SALDO TABUNGAN NASABAH", p.saldoTab.rows, p.saldoTab.total, false);
  // ---- kode-SA (saldo awal TABUNGAN) + Debitur-SA (saldo awal PIUTANG) ala contoh ----
  // Dipisah per status agar tiap JUMLAH bisa dicek balance ke akunnya
  // (total Tabungan ↔ 3-200, total Piutang ↔ 1-130).
  const tulisKodeSA = (namaSheet: string, judul: string, list: RowObj[]) => {
    const ws = wb.addWorksheet(namaSheet);
    ws.properties.tabColor = { argb: TAB_MASTER };
    tulisKop(ws, judul, JB, 6);
    const heads: HeadDef[] = [
      { text: "Kode" }, { text: "Nama" }, { text: "Pos" }, { text: "NO REK" },
      { text: "Status" }, { text: "Saldo Awal" },
    ];
    const body = list.map((r) => [
      String(r.kode), String(r.nama), String(r.pos ?? (r.status === "PIUTANG" ? "Db" : "Kr")),
      String(r.no_rek ?? ""), String(r.status), Math.round(Number(r.saldo_awal_hit) * 100) / 100,
    ]);
    const total = Math.round(body.reduce((a, r) => a + Number(r[5]), 0) * 100) / 100;
    tulisTabel(ws, 5, heads, body, {
      numIdx: [5],
      total: ["", "JUMLAH", "", "", "", total],
    });
    ws.columns = [{ width: 12 }, { width: 34 }, { width: 8 }, { width: 14 }, { width: 12 }, { width: 20 }];
  };
  tulisKodeSA("kode-SA", "DAFTAR KODE PEMBANTU", p.kode.rows.filter((r) => String(r.status) !== "PIUTANG"));
  tulisKodeSA("Debitur-SA", "DAFTAR DEBITUR PEMBANTU (SALDO AWAL)", p.kode.rows.filter((r) => String(r.status) === "PIUTANG"));

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
