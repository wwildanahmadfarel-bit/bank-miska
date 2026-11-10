import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { tokenLegacy, verifikasiJwt } from "@/lib/jwt";

const SESSION_COOKIE = "miska_session";

// Halaman yang wajib login (API menegakkan role detail via requireRole).
const PROTECTED = [
  "/coa",
  "/nasabah",
  "/pengguna",
  "/jurnal",
  "/pinjaman",
  "/angsuran",
  "/buku-besar",
  "/bb-pembantu",
  "/daftar-saldo",
  "/neraca-lajur",
  "/laba-rugi",
  "/penutup",
  "/merchant",
  "/bayar",
  "/riwayat",
  "/ubah-password",
];

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const perluLogin = PROTECTED.some((p) => path === p || path.startsWith(p + "/"));
  if (!perluLogin) return NextResponse.next();
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  // JWT diverifikasi di edge request agar cookie rusak/kedaluwarsa tidak
  // sempat merender halaman. Token legacy 64-hex tetap diloloskan (validitas
  // sesinya diperiksa API); token JWT yang tidak valid langsung dibersihkan.
  if (!tokenLegacy(token)) {
    const payload = await verifikasiJwt(token);
    if (!payload) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", path);
      const res = NextResponse.redirect(url);
      res.cookies.delete(SESSION_COOKIE);
      return res;
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/login|api/logout|api/me).*)"],
};
