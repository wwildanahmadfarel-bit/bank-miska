import { NextRequest } from "next/server";
import pool, { gagal, ok, fail } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import type { RowDataPacket } from "mysql2/promise";

// GET /api/buku-besar?kode=1-110&mulai=&sampai= — teller/admin only
export async function GET(req: NextRequest) {
  const gate = await requireRole(req, ["teller", "admin"], fail);
  if (gate instanceof Response) return gate;
  const sp = req.nextUrl.searchParams;
  const kode = (sp.get("kode") ?? "").trim();
  const mulai = (sp.get("mulai") ?? "").trim();
  const sampai = (sp.get("sampai") ?? "").trim();
  if (!kode) return fail("Parameter kode wajib diisi");

  try {
    const [crows] = await pool.execute<RowDataPacket[]>("SELECT nama, pos_saldo FROM tb_coa WHERE kode_akun = ?", [kode]);
    const coa = crows[0] as { nama: string; pos_saldo: string } | undefined;
    if (!coa) return fail("Kode akun tidak dikenal");

    const where: string[] = ["d.kode_akun = ?"];
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
      `SELECT j.tanggal AS tanggal, j.no_bukti, j.keterangan, d.debet, d.kredit
       FROM tb_jurnal_detail d JOIN tb_jurnal j ON j.id = d.id_jurnal
       WHERE ${where.join(" AND ")} ORDER BY j.tanggal ASC, j.id ASC LIMIT 1000`,
      params
    );

    let saldo = 0;
    const out = (rows as Record<string, unknown>[]).map((r) => {
      const mut =
        coa.pos_saldo === "Db" ? Number(r.debet) - Number(r.kredit) : Number(r.kredit) - Number(r.debet);
      saldo += mut;
      const t = r.tanggal;
      return { ...r, tanggal: t instanceof Date ? t.toISOString().slice(0, 10) : t, saldo: Math.round(saldo * 100) / 100 };
    });
    return ok({ kode, nama: coa.nama, pos_saldo: coa.pos_saldo, rows: out });
  } catch (e) {
    return gagal("Gagal baca buku besar: ", e);
  }
}

