import { NextRequest } from "next/server";
import { gagal, ok, fail } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ambilRiwayat } from "@/lib/laporan";

// GET /api/v1/riwayat-saya?mulai=YYYY-MM-DD&sampai=YYYY-MM-DD
// Mobile banking (nasabah: kode dipaksa milik sendiri, parameter kode diabaikan).
// Teller/admin boleh isi ?kode=Hxxx untuk bantu nasabah di loket.
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return fail("Belum login", 401);

  const sp = req.nextUrl.searchParams;
  let kode = (sp.get("kode") ?? "").toUpperCase().trim();
  if (user.role === "nasabah") {
    if (!user.kode_bantu) return fail("Akun belum ditautkan ke rekening, hubungi teller", 403);
    kode = user.kode_bantu.toUpperCase();
  }
  if (!kode) return fail("Parameter kode wajib diisi");
  const mulai = (sp.get("mulai") ?? "").trim();
  const sampai = (sp.get("sampai") ?? "").trim();
  if (mulai && !/^\d{4}-\d{2}-\d{2}$/.test(mulai)) return fail("mulai harus YYYY-MM-DD");
  if (sampai && !/^\d{4}-\d{2}-\d{2}$/.test(sampai)) return fail("sampai harus YYYY-MM-DD");

  try {
    const d = await ambilRiwayat(kode, mulai, sampai);
    // samakan bentuk dengan /api/riwayat agar mobile reuse parser yang sama
    return ok({
      pembantu: d.pembantu,
      saldo_akhir: d.saldo_akhir,
      total_masuk: d.total_masuk,
      total_keluar: d.total_keluar,
      rows: d.rows.slice(-1000),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal baca riwayat";
    if (msg.startsWith("Kode pembantu")) return fail(msg, 404);
    return gagal("Gagal baca riwayat", e);
  }
}
