import { NextRequest } from "next/server";
import { gagal, ok, fail } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ambilAnalitikKasLive, rentang6Bulan, rentangTahunAjaran } from "@/lib/analitik";

// GET /api/analitik-kas?mode=ta|6bulan — teller/admin only.
// Agregat kas bulanan (data asli tb_jurnal_detail × tb_jurnal) untuk
// grafik dashboard: kas masuk/keluar + tren efektivitas koleksi.
export async function GET(req: NextRequest) {
  const gate = await requireRole(req, ["teller", "admin"], fail);
  if (gate instanceof Response) return gate;
  const mode = (req.nextUrl.searchParams.get("mode") ?? "ta").toLowerCase();
  if (mode !== "ta" && mode !== "6bulan") return fail("mode harus ta atau 6bulan");
  try {
    const rentang = mode === "ta" ? rentangTahunAjaran() : rentang6Bulan();
    const data = await ambilAnalitikKasLive(rentang.mulai, rentang.sampai);
    return ok({
      mode,
      label: mode === "ta" ? rentangTahunAjaran().label : "6 Bulan Terakhir",
      mulai: rentang.mulai,
      sampai: rentang.sampai,
      data,
    });
  } catch (e) {
    return gagal("Gagal baca analitik kas", e);
  }
}
