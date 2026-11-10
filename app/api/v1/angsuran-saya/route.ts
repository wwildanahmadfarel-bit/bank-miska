import { NextRequest } from "next/server";
import pool, { gagal, ok, fail } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import type { RowDataPacket } from "mysql2/promise";

// GET /api/v1/angsuran-saya[?id_piutang=] — jadwal angsuran milik sendiri.
// Nasabah: hanya piutang dengan kode_bantu miliknya (id_piutang opsional
// untuk filter satu pinjaman). Teller/admin: boleh isi ?kode=Pxxx.
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
  const idRaw = (sp.get("id_piutang") ?? "").trim();
  const idPiutang = idRaw === "" ? null : Number(idRaw);
  if (idPiutang !== null && (!Number.isInteger(idPiutang) || idPiutang <= 0))
    return fail("id_piutang harus bilangan bulat > 0");

  try {
    const params: (string | number)[] = [kode];
    let extra = "";
    if (idPiutang !== null) {
      extra = "AND u.id = ?";
      params.push(idPiutang);
    }
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT a.id, a.id_piutang, a.angsuran_ke, a.nominal,
              DATE_FORMAT(a.jatuh_tempo, '%Y-%m-%d') AS jatuh_tempo,
              a.dibayar, u.sisa AS sisa_piutang, u.status AS status_piutang
       FROM tb_angsuran a JOIN tb_piutang u ON u.id = a.id_piutang
       WHERE u.kode_bantu = ? ${extra}
       ORDER BY a.jatuh_tempo ASC, a.angsuran_ke ASC LIMIT 500`,
      params
    );
    return ok({ kode, data: rows });
  } catch (e) {
    return gagal("Gagal baca angsuran", e);
  }
}
