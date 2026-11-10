import { NextRequest } from "next/server";
import pool, { gagal, ok, fail } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import type { RowDataPacket } from "mysql2/promise";

// GET /api/v1/pinjaman-saya — mobile banking, read-only milik sendiri.
// Nasabah: kode dipaksa dari JWT (parameter kode diabaikan).
// Teller/admin: boleh isi ?kode=Pxxx untuk bantu nasabah di loket.
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

  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT u.id, u.kode_bantu, p.nama, u.plafon, u.bunga_persen, u.total_harus_dibayar,
              u.sisa, u.tenor, u.status,
              (SELECT COUNT(*) FROM tb_angsuran a WHERE a.id_piutang = u.id AND a.dibayar IS NOT NULL) AS lunas_ke,
              (SELECT COUNT(*) FROM tb_angsuran a WHERE a.id_piutang = u.id) AS total_angsuran
       FROM tb_piutang u JOIN tb_pembantu p ON p.kode = u.kode_bantu
       WHERE u.kode_bantu = ?
       ORDER BY u.id DESC LIMIT 50`,
      [kode]
    );
    return ok({ kode, data: rows });
  } catch (e) {
    return gagal("Gagal baca pinjaman", e);
  }
}
