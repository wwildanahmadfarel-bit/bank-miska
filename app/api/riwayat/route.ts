import { NextRequest } from "next/server";
import pool, { gagal, ok, fail } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import type { RowDataPacket } from "mysql2/promise";

// GET /api/riwayat?kode=H2478&mulai=&sampai=
// Nasabah: kode dipaksa milik sendiri (tb_user.kode_bantu), parameter diabaikan.
// Teller/admin: boleh query kode apa pun (untuk membantu nasabah di loket).
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

  try {
    const [prows] = await pool.execute<RowDataPacket[]>(
      "SELECT kode, nama, status, saldo_awal FROM tb_pembantu WHERE kode = ?",
      [kode]
    );
    const pb = prows[0] as
      | { kode: string; nama: string; status: string; saldo_awal: number }
      | undefined;
    if (!pb) return fail("Kode pembantu tidak dikenal");

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
      `SELECT j.tanggal AS tanggal, DATE_FORMAT(j.dibuat, '%H:%i:%s') AS waktu,
         j.no_bukti, j.keterangan, j.tipe, d.kode_akun, d.debet, d.kredit
       FROM tb_jurnal_detail d JOIN tb_jurnal j ON j.id = d.id_jurnal
       WHERE ${where.join(" AND ")} ORDER BY j.tanggal ASC, j.id ASC LIMIT 1000`,
      params
    );

    let saldo = Number(pb.saldo_awal);
    let totalMasuk = 0;
    let totalKeluar = 0;
    const out = (rows as Record<string, unknown>[]).map((r) => {
      const mut =
        pb.status === "PIUTANG" ? Number(r.debet) - Number(r.kredit) : Number(r.kredit) - Number(r.debet);
      saldo += mut;
      if (mut >= 0) totalMasuk += mut;
      else totalKeluar += -mut;
      const t = r.tanggal;
      return { ...r, tanggal: t instanceof Date ? t.toISOString().slice(0, 10) : t, saldo: Math.round(saldo * 100) / 100 };
    });
    return ok({
      pembantu: pb,
      saldo_akhir: Math.round(saldo * 100) / 100,
      total_masuk: Math.round(totalMasuk * 100) / 100,
      total_keluar: Math.round(totalKeluar * 100) / 100,
      rows: out,
    });
  } catch (e) {
    return gagal("Gagal baca riwayat: ", e);
  }
}

