import { NextRequest } from "next/server";
import pool, { gagal, ok, fail } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import type { RowDataPacket } from "mysql2/promise";

export const runtime = "nodejs";

// GET /api/jurnal-nota?id=101 — teller/admin only
// Detail satu jurnal untuk nota: header + rincian + sisa saldo tiap pembantu
// dihitung s/d jurnal tersebut (untuk dicek ulang / cetak ulang nota).
export async function GET(req: NextRequest) {
  const gate = await requireRole(req, ["teller", "admin"], fail);
  if (gate instanceof Response) return gate;
  const id = Number(req.nextUrl.searchParams.get("id") ?? 0);
  if (!Number.isInteger(id) || id <= 0) return fail("Parameter id jurnal wajib diisi");
  try {
    const [hrows] = await pool.execute<RowDataPacket[]>(
      `SELECT j.id, j.tanggal, DATE_FORMAT(j.dibuat, '%H:%i:%s') AS waktu,
        j.no_bukti, j.keterangan, j.tipe
       FROM tb_jurnal j WHERE j.id = ? LIMIT 1`,
      [id]
    );
    const h = hrows[0] as unknown as
      | { id: number; tanggal: Date | string; waktu: string | null; no_bukti: string; keterangan: string; tipe: string }
      | undefined;
    if (!h) return fail("Jurnal tidak ditemukan", 404);
    const tanggal = h.tanggal instanceof Date ? h.tanggal.toISOString().slice(0, 10) : String(h.tanggal);

    const [drows] = await pool.execute<RowDataPacket[]>(
      `SELECT d.kode_akun, c.nama AS nama_akun, d.kode_bantu, pb.nama AS nama_bantu,
        d.debet, d.kredit
       FROM tb_jurnal_detail d
       JOIN tb_coa c ON c.kode_akun = d.kode_akun
       LEFT JOIN tb_pembantu pb ON pb.kode = d.kode_bantu
       WHERE d.id_jurnal = ? ORDER BY d.id ASC`,
      [id]
    );
    const details = drows as unknown as {
      kode_akun: string; nama_akun: string; kode_bantu: string | null;
      nama_bantu: string | null; debet: string | number; kredit: string | number;
    }[];

    // Sisa saldo tiap pembantu pada baris ini = saldo s/d jurnal ini (inklusif).
    const kodes = [...new Set(details.map((d) => d.kode_bantu).filter((k): k is string => !!k))];
    const saldoMap: Record<string, number> = {};
    if (kodes.length > 0) {
      const marka = kodes.map(() => "?").join(",");
      const [srows] = await pool.execute<RowDataPacket[]>(
        `SELECT p.kode,
          (p.saldo_awal + COALESCE((SELECT SUM(
            CASE WHEN c.pos_saldo = 'Db' THEN (d.debet - d.kredit) ELSE (d.kredit - d.debet) END
          ) FROM tb_jurnal_detail d
            JOIN tb_coa c ON c.kode_akun = d.kode_akun
            JOIN tb_jurnal j2 ON j2.id = d.id_jurnal
            WHERE d.kode_bantu = p.kode AND (j2.tanggal < ? OR (j2.tanggal = ? AND j2.id <= ?))), 0)) AS saldo
         FROM tb_pembantu p WHERE p.kode IN (${marka})`,
        [tanggal, tanggal, id, ...kodes]
      );
      for (const s of srows as unknown as { kode: string; saldo: string | number }[]) {
        saldoMap[String(s.kode)] = Math.round(Number(s.saldo) * 100) / 100;
      }
    }

    const bulat = (n: number) => Math.round(n * 100) / 100;
    const out = details.map((d) => ({
      kode_akun: String(d.kode_akun),
      nama_akun: String(d.nama_akun ?? ""),
      kode_bantu: d.kode_bantu ? String(d.kode_bantu) : "",
      nama_bantu: d.nama_bantu ? String(d.nama_bantu) : "",
      debet: Number(d.debet),
      kredit: Number(d.kredit),
      sisa: d.kode_bantu && saldoMap[String(d.kode_bantu)] !== undefined ? saldoMap[String(d.kode_bantu)] : null,
    }));
    return ok({
      nota: {
        id: Number(h.id),
        tanggal,
        waktu: h.waktu ? String(h.waktu) : "",
        no_bukti: String(h.no_bukti ?? ""),
        keterangan: String(h.keterangan ?? ""),
        tipe: String(h.tipe ?? ""),
        details: out,
        tot_debet: bulat(out.reduce((a, r) => a + r.debet, 0)),
        tot_kredit: bulat(out.reduce((a, r) => a + r.kredit, 0)),
      },
    });
  } catch (e) {
    return gagal("Gagal baca nota: ", e);
  }
}

