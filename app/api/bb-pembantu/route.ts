import { NextRequest } from "next/server";
import pool, { gagal, ok, fail } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import type { RowDataPacket } from "mysql2/promise";

// GET /api/bb-pembantu?kode=H2375&mulai=&sampai= — teller/admin only
export async function GET(req: NextRequest) {
  const gate = await requireRole(req, ["teller", "admin"], fail);
  if (gate instanceof Response) return gate;
  const sp = req.nextUrl.searchParams;
  const kode = (sp.get("kode") ?? "").toUpperCase().trim();
  const mulai = (sp.get("mulai") ?? "").trim();
  const sampai = (sp.get("sampai") ?? "").trim();
  if (!kode) return fail("Parameter kode wajib diisi");

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
      `SELECT j.tanggal AS tanggal, j.no_bukti, j.keterangan, d.kode_akun, d.debet, d.kredit
       FROM tb_jurnal_detail d JOIN tb_jurnal j ON j.id = d.id_jurnal
       WHERE ${where.join(" AND ")} ORDER BY j.tanggal ASC, j.id ASC LIMIT 1000`,
      params
    );

    let saldo = Number(pb.saldo_awal);
    const out = (rows as Record<string, unknown>[]).map((r) => {
      const mut =
        pb.status === "PIUTANG" ? Number(r.debet) - Number(r.kredit) : Number(r.kredit) - Number(r.debet);
      saldo += mut;
      const t = r.tanggal;
      return { ...r, tanggal: t instanceof Date ? t.toISOString().slice(0, 10) : t, saldo: Math.round(saldo * 100) / 100 };
    });
    return ok({ pembantu: pb, rows: out });
  } catch (e) {
    return gagal("Gagal baca BB pembantu: ", e);
  }
}

