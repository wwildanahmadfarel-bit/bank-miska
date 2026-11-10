import { NextRequest } from "next/server";
import { gagal, fail, ok } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ambilJurnalPeriode } from "@/lib/laporan";

export const runtime = "nodejs";

const TIPE = ["SETORAN", "PENARIKAN", "PINJAMAN-CAIR", "ANGSURAN", "PENUTUP", "BAYAR-MERCHANT"] as const;

// GET /api/jurnal?bulan=YYYY-MM&tipe=SEMUA — teller/admin only
// Histori baris jurnal sebulan untuk halaman /jurnal + total Kas masuk/keluar.
export async function GET(req: NextRequest) {
  const gate = await requireRole(req, ["teller", "admin"], fail);
  if (gate instanceof Response) return gate;
  const sp = req.nextUrl.searchParams;
  const bulan = (sp.get("bulan") ?? "").trim();
  const tipe = (sp.get("tipe") ?? "SEMUA").toUpperCase().trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(bulan)) return fail("bulan harus YYYY-MM (01-12)");
  if (tipe !== "SEMUA" && !(TIPE as readonly string[]).includes(tipe)) {
    return fail("tipe harus SEMUA atau: " + TIPE.join(", "));
  }
  try {
    const d = await ambilJurnalPeriode(bulan);
    const rows = (tipe === "SEMUA" ? d.rows : d.rows.filter((r) => String(r.tipe) === tipe)).map((r) => ({
      id_jurnal: Number(r.id_jurnal),
      tanggal: String(r.tanggal ?? ""),
      waktu: String(r.waktu ?? ""),
      no_bukti: String(r.no_bukti ?? ""),
      keterangan: String(r.keterangan ?? ""),
      tipe: String(r.tipe ?? ""),
      kode_akun: String(r.kode_akun ?? ""),
      nama_akun: String(r.nama_akun ?? ""),
      kode_bantu: r.kode_bantu === null || r.kode_bantu === undefined ? "" : String(r.kode_bantu),
      debet: Number(r.debet),
      kredit: Number(r.kredit),
    }));
    const bulat = (n: number) => Math.round(n * 100) / 100;
    const totDb = bulat(rows.reduce((a, r) => a + r.debet, 0));
    const totKr = bulat(rows.reduce((a, r) => a + r.kredit, 0));
    // Uang masuk/keluar = mutasi Kas 1-110 pada baris yang tampil.
    let masuk = 0;
    let keluar = 0;
    for (const r of rows) {
      if (r.kode_akun === "1-110") {
        masuk += r.debet;
        keluar += r.kredit;
      }
    }
    return ok({
      bulan,
      tipe,
      rows,
      jumlah: rows.length,
      tot_debet: totDb,
      tot_kredit: totKr,
      masuk: bulat(masuk),
      keluar: bulat(keluar),
      balance: Math.abs(totDb - totKr) < 0.01,
    });
  } catch (e) {
    return gagal("Gagal baca histori: ", e);
  }
}

