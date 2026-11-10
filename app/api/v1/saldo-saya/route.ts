import { NextRequest } from "next/server";
import { gagal, ok, fail } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ambilRiwayat } from "@/lib/laporan";

// GET /api/v1/saldo-saya — mobile banking (nasabah: milik sendiri).
// Teller/admin boleh isi ?kode=Hxxx untuk bantu nasabah di loket.
// Auth: cookie miska_session (web) ATAU Authorization: Bearer (HP).
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return fail("Belum login", 401);

  let kode = (req.nextUrl.searchParams.get("kode") ?? "").toUpperCase().trim();
  if (user.role === "nasabah") {
    if (!user.kode_bantu) return fail("Akun belum ditautkan ke rekening, hubungi teller", 403);
    kode = user.kode_bantu.toUpperCase();
  }
  if (!kode) return fail("Parameter kode wajib diisi");

  try {
    const d = await ambilRiwayat(kode, "", "");
    return ok({
      pembantu: d.pembantu,
      saldo_akhir: d.saldo_akhir,
      total_masuk: d.total_masuk,
      total_keluar: d.total_keluar,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal baca saldo";
    if (msg.startsWith("Kode pembantu")) return fail(msg, 404);
    return gagal("Gagal baca saldo", e);
  }
}
