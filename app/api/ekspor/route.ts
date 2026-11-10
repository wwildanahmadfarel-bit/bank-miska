import { NextRequest } from "next/server";
import { gagal, fail } from "@/lib/db";
import { getSessionUser, requireRole } from "@/lib/auth";
import {
  ambilBBBulanan,
  ambilBBPembantuBulanan,
  ambilBbPembantu,
  ambilBukuBesar,
  ambilDaftarSaldo,
  ambilDaftarSaldoPeriode,
  ambilJurnalPeriode,
  ambilKodePembantu,
  ambilLabaRugi,
  ambilLabaRugiSeksi,
  ambilNeracaLajur,
  ambilNeracaSetelahPenutup,
  ambilNLPenuh,
  ambilPenutupPeriode,
  ambilRiwayat,
  ambilSaldoAwalAkun,
} from "@/lib/laporan";
import { keCSV, kePaketSekolahXLSX, keXLSX, namaFile, type Kolom } from "@/lib/ekspor";

export const runtime = "nodejs";

const LAPORAN = ["neraca-lajur", "laba-rugi", "buku-besar", "bb-pembantu", "daftar-saldo", "riwayat", "paket-periode"] as const;
type Nama = (typeof LAPORAN)[number];

const KOLOM: Record<Nama, Kolom[]> = {
  "neraca-lajur": [
    { key: "kode_akun", head: "Kode", width: 12 },
    { key: "nama", head: "Nama Akun", width: 34 },
    { key: "pos_saldo", head: "Pos", width: 8 },
    { key: "ns_debet", head: "NS Debet", num: true, width: 18 },
    { key: "ns_kredit", head: "NS Kredit", num: true, width: 18 },
  ],
  "laba-rugi": [
    { key: "kode_akun", head: "Kode", width: 12 },
    { key: "nama", head: "Nama Akun", width: 38 },
    { key: "saldo", head: "Saldo", num: true, width: 20 },
  ],
  "buku-besar": [
    { key: "tanggal", head: "Tanggal", width: 13 },
    { key: "no_bukti", head: "Bukti", width: 10 },
    { key: "keterangan", head: "Keterangan", width: 40 },
    { key: "debet", head: "Debet", num: true, width: 18 },
    { key: "kredit", head: "Kredit", num: true, width: 18 },
    { key: "saldo", head: "Saldo", num: true, width: 18 },
  ],
  "bb-pembantu": [
    { key: "tanggal", head: "Tanggal", width: 13 },
    { key: "no_bukti", head: "Bukti", width: 10 },
    { key: "keterangan", head: "Keterangan", width: 36 },
    { key: "kode_akun", head: "Akun", width: 10 },
    { key: "debet", head: "Debet", num: true, width: 16 },
    { key: "kredit", head: "Kredit", num: true, width: 16 },
    { key: "saldo", head: "Saldo", num: true, width: 18 },
  ],
  "daftar-saldo": [
    { key: "kode", head: "Kode", width: 12 },
    { key: "nama", head: "Nama", width: 32 },
    { key: "no_rek", head: "No Rek", width: 12 },
    { key: "saldo_akhir", head: "Saldo Akhir", num: true, width: 20 },
  ],
  riwayat: [
    { key: "tanggal", head: "Tanggal", width: 13 },
    { key: "no_bukti", head: "Bukti", width: 10 },
    { key: "keterangan", head: "Keterangan", width: 34 },
    { key: "tipe", head: "Tipe", width: 16 },
    { key: "kode_akun", head: "Akun", width: 10 },
    { key: "debet", head: "Debet", num: true, width: 16 },
    { key: "kredit", head: "Kredit", num: true, width: 16 },
    { key: "saldo", head: "Saldo", num: true, width: 18 },
  ],
  "paket-periode": [
    { key: "tanggal", head: "Tanggal", width: 13 },
    { key: "no_bukti", head: "Bukti", width: 10 },
    { key: "keterangan", head: "Keterangan", width: 34 },
    { key: "tipe", head: "Tipe", width: 16 },
    { key: "kode_akun", head: "Akun", width: 10 },
    { key: "nama_akun", head: "Nama Akun", width: 30 },
    { key: "kode_bantu", head: "Bantu", width: 10 },
    { key: "debet", head: "Debet", num: true, width: 18 },
    { key: "kredit", head: "Kredit", num: true, width: 18 },
  ],
};

// GET /api/ekspor?laporan=neraca-lajur&format=xlsx&bulan=2024-01&...
// Format: csv (delimiter ';' + BOM) atau xlsx (styled via exceljs).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const laporan = (sp.get("laporan") ?? "") as Nama;
  const format = (sp.get("format") ?? "xlsx").toLowerCase();
  if (!(LAPORAN as readonly string[]).includes(laporan)) return fail("laporan harus: " + LAPORAN.join(", "));
  if (format !== "csv" && format !== "xlsx") return fail("format harus csv atau xlsx");

  try {
    let rows: Record<string, unknown>[] = [];
    let judul: string = laporan;
    let sub: string = "";
    let total: (string | number)[] | undefined;
    let suffix = "";

    if (laporan === "neraca-lajur" || laporan === "laba-rugi") {
      const gate = await requireRole(req, ["teller", "admin"], fail);
      if (gate instanceof Response) return gate;
      const bulan = (sp.get("bulan") ?? "").trim();
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(bulan)) return fail("bulan harus YYYY-MM (01-12)");
      suffix = bulan;
      if (laporan === "neraca-lajur") {
        const d = await ambilNeracaLajur(bulan);
        rows = d.rows;
        judul = "Neraca Lajur";
        sub = `Periode ${bulan} — Total Debet ${d.totalD.toLocaleString("id-ID")} = Kredit ${d.totalK.toLocaleString("id-ID")}`;
        total = ["", "", `TOTAL (${rows.length} akun)`, d.totalD, d.totalK];
      } else {
        const d = await ambilLabaRugi(bulan);
        rows = d.rows;
        judul = "Laba Rugi";
        sub = `Periode ${bulan} — Pendapatan ${d.pendapatan.toLocaleString("id-ID")}, Biaya ${d.biaya.toLocaleString("id-ID")}, Laba ${d.laba.toLocaleString("id-ID")}`;
        total = ["", "TOTAL LABA", d.laba];
      }
    } else if (laporan === "paket-periode") {
      // Paket sekolah 1 bulan gaya workbook contoh (kop + saldo awal + JUMLAH).
      const gate = await requireRole(req, ["teller", "admin"], fail);
      if (gate instanceof Response) return gate;
      const bulan = (sp.get("bulan") ?? "").trim();
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(bulan)) return fail("bulan harus YYYY-MM (01-12)");
      suffix = bulan;
      const jr = await ambilJurnalPeriode(bulan);
      const kolomJurnal = KOLOM["paket-periode"];
      if (format === "csv") {
        const csv = keCSV(kolomJurnal, jr.rows);
        return new Response(csv, {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${namaFile(laporan, suffix, "csv")}"`,
          },
        });
      }
      const [akun, nl, lr, pen, nsp, deb, tab, kode] = await Promise.all([
        ambilSaldoAwalAkun(bulan),
        ambilNLPenuh(bulan),
        ambilLabaRugiSeksi(bulan),
        ambilPenutupPeriode(bulan),
        ambilNeracaSetelahPenutup(bulan),
        ambilDaftarSaldoPeriode("PIUTANG", bulan),
        ambilDaftarSaldoPeriode("TABUNGAN", bulan),
        ambilKodePembantu(bulan),
      ]);
      // BB per akun: yang punya saldo awal / mutasi / saldo bulan itu.
      const gerakAkun = new Set(jr.rows.map((r) => String(r.kode_akun)));
      const tutupAkun = new Map(nsp.rows.map((r) => [String(r.kode_akun), Number(r.debet) + Number(r.kredit)]));
      const bbAkun = [];
      for (const a of akun.rows) {
        const kode = String(a.kode_akun);
        const buka = Number(a.buka_debet) + Number(a.buka_kredit);
        if (buka === 0 && !gerakAkun.has(kode) && (tutupAkun.get(kode) ?? 0) === 0) continue;
        const bb = await ambilBBBulanan(kode, bulan);
        bbAkun.push({ kode, nama: String(a.nama), pos: String(a.pos_saldo), opening: bb.opening, rows: bb.rows, closing: bb.closing });
      }
      // BB per nasabah: yang punya saldo awal / mutasi / saldo s/d akhir bulan.
      const gerakPem = new Set(jr.rows.map((r) => String(r.kode_bantu ?? "")));
      const tutupPem = new Map<string, number>();
      for (const r of [...deb.rows, ...tab.rows]) tutupPem.set(String(r.kode), Number(r.saldo_akhir));
      const bbPem = [];
      for (const k of kode.rows) {
        const kodeP = String(k.kode);
        if (Number(k.saldo_awal_hit) === 0 && !gerakPem.has(kodeP) && (tutupPem.get(kodeP) ?? 0) === 0) continue;
        const bb = await ambilBBPembantuBulanan(kodeP, bulan);
        bbPem.push({ kode: kodeP, nama: String(k.nama), pos: bb.pos, opening: bb.opening, rows: bb.rows, closing: bb.closing });
      }
      const buf = await kePaketSekolahXLSX({
        bulan,
        jurnal: { rows: jr.rows, totDb: jr.totDb, totKr: jr.totKr, balance: jr.balance },
        akun: { rows: akun.rows, totD: akun.totD, totK: akun.totK },
        nl: { rows: nl.rows, nsD: nl.nsD, nsK: nl.nsK, neD: nl.neD, neK: nl.neK, laba: nl.laba },
        laba: { pend: lr.pend, biaya: lr.biaya, totPend: lr.totPend, totBiaya: lr.totBiaya, laba: lr.laba },
        penutup: { rows: pen.rows, totDb: pen.totDb, totKr: pen.totKr },
        nsp: { rows: nsp.rows, totD: nsp.totD, totK: nsp.totK },
        debitur: { rows: deb.rows, total: deb.total },
        saldoTab: { rows: tab.rows, total: tab.total },
        kode: { rows: kode.rows },
        bbAkun,
        bbPem,
      });
      return new Response(new Uint8Array(buf), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${namaFile(laporan, suffix, "xlsx")}"`,
        },
      });
    } else if (laporan === "buku-besar") {
      const gate = await requireRole(req, ["teller", "admin"], fail);
      if (gate instanceof Response) return gate;
      const kode = (sp.get("kode") ?? "").trim();
      if (!kode) return fail("Parameter kode wajib diisi");
      const mulai = (sp.get("mulai") ?? "").trim();
      const sampai = (sp.get("sampai") ?? "").trim();
      const d = await ambilBukuBesar(kode, mulai, sampai);
      rows = d.rows;
      judul = `Buku Besar ${d.coa.kode} ${d.coa.nama}`;
      sub = `${d.rows.length} baris${mulai ? ` dari ${mulai}` : ""}${sampai ? ` s/d ${sampai}` : ""}`;
      suffix = `${kode}${mulai ? `-${mulai}` : ""}${sampai ? `-sd-${sampai}` : ""}`;
    } else if (laporan === "bb-pembantu") {
      const gate = await requireRole(req, ["teller", "admin"], fail);
      if (gate instanceof Response) return gate;
      const kode = (sp.get("kode") ?? "").toUpperCase().trim();
      if (!kode) return fail("Parameter kode wajib diisi");
      const mulai = (sp.get("mulai") ?? "").trim();
      const sampai = (sp.get("sampai") ?? "").trim();
      const d = await ambilBbPembantu(kode, mulai, sampai);
      rows = d.rows;
      judul = `BB Pembantu ${d.pembantu.kode} ${d.pembantu.nama}`;
      sub = `${d.pembantu.status} — saldo awal ${Number(d.pembantu.saldo_awal).toLocaleString("id-ID")}, ${d.rows.length} baris`;
      suffix = kode;
    } else if (laporan === "daftar-saldo") {
      // Nasabah: hanya baris milik sendiri (sama seperti /api/daftar-saldo).
      const user = await getSessionUser(req);
      if (!user) return fail("Belum login", 401);
      if (user.role === "nasabah" && !user.kode_bantu)
        return fail("Akun belum ditautkan ke rekening, hubungi teller", 403);
      const tipe = (sp.get("tipe") ?? "TABUNGAN").toUpperCase();
      if (tipe !== "TABUNGAN" && tipe !== "PIUTANG") return fail("tipe harus TABUNGAN atau PIUTANG");
      const d = await ambilDaftarSaldo(tipe);
      rows =
        user.role === "nasabah"
          ? d.rows.filter((r) => String(r.kode).toUpperCase() === String(user.kode_bantu ?? "").toUpperCase())
          : d.rows;
      judul = `Daftar Saldo ${tipe}`;
      sub = `${d.rows.length} rekening — TOTAL ${d.total.toLocaleString("id-ID")}`;
      total = ["", "", `TOTAL (${d.rows.length} rekening)`, d.total];
      suffix = tipe.toLowerCase();
    } else {
      const user = await getSessionUser(req);
      if (!user) return fail("Belum login", 401);
      let kode = (sp.get("kode") ?? "").toUpperCase().trim();
      if (user.role === "nasabah") {
        if (!user.kode_bantu) return fail("Akun belum ditautkan ke rekening, hubungi teller", 403);
        kode = user.kode_bantu.toUpperCase();
      }
      if (!kode) return fail("Parameter kode wajib diisi");
      const mulai = (sp.get("mulai") ?? "").trim();
      const sampai = (sp.get("sampai") ?? "").trim();
      const d = await ambilRiwayat(kode, mulai, sampai);
      rows = d.rows;
      judul = `Riwayat ${d.pembantu.kode} ${d.pembantu.nama}`;
      sub = `${d.pembantu.status} — saldo ${d.saldo_akhir.toLocaleString("id-ID")}, masuk ${d.total_masuk.toLocaleString("id-ID")}, keluar ${d.total_keluar.toLocaleString("id-ID")}`;
      suffix = kode;
    }

    const kolom = KOLOM[laporan];
    if (format === "csv") {
      const csv = keCSV(kolom, rows);
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${namaFile(laporan, suffix || "laporan", "csv")}"`,
        },
      });
    }
    const buf = await keXLSX(kolom, rows, { judul, sub, total });
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${namaFile(laporan, suffix || "laporan", "xlsx")}"`,
      },
    });
  } catch (e) {
    return gagal("Gagal ekspor: ", e);
  }
}

