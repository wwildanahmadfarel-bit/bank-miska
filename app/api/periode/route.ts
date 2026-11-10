import { NextRequest } from "next/server";
import pool, { gagal, ok, fail } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import type { RowDataPacket } from "mysql2/promise";

export const runtime = "nodejs";

// GET /api/periode — admin only
// Daftar periode (1 bulan = 1 periode): bulan YYYY-MM + status buka/tutup + jumlah jurnal.
export async function GET(req: NextRequest) {
  const gate = await requireRole(req, ["admin"], fail);
  if (gate instanceof Response) return gate;
  void req;
  try {
    const [jrows] = await pool.execute<RowDataPacket[]>(
      `SELECT DATE_FORMAT(tanggal, '%Y-%m') AS bulan, COUNT(*) AS jumlah
       FROM tb_jurnal GROUP BY bulan ORDER BY bulan DESC LIMIT 24`
    );
    const [trows] = await pool.execute<RowDataPacket[]>(
      `SELECT bulan, ditutup FROM tb_periode_tutup ORDER BY bulan DESC LIMIT 24`
    );
    const tutup = new Map(
      (trows as { bulan: string; ditutup: string | Date }[]).map((r) => [
        String(r.bulan),
        r.ditutup instanceof Date ? r.ditutup.toISOString().slice(0, 19).replace("T", " ") : String(r.ditutup),
      ])
    );
    const ada = new Set<string>();
    const out: { bulan: string; status: string; ditutup: string | null; jumlah_jurnal: number }[] = [];
    for (const r of jrows as unknown as { bulan: string; jumlah: string | number }[]) {
      const b = String(r.bulan);
      ada.add(b);
      out.push({
        bulan: b,
        status: tutup.has(b) ? "tutup" : "buka",
        ditutup: tutup.get(b) ?? null,
        jumlah_jurnal: Number(r.jumlah),
      });
    }
    // Bulan berjalan selalu tampil meski belum ada jurnal.
    const now = new Date();
    const berjalan = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    if (!ada.has(berjalan)) {
      out.unshift({
        bulan: berjalan,
        status: tutup.has(berjalan) ? "tutup" : "buka",
        ditutup: tutup.get(berjalan) ?? null,
        jumlah_jurnal: 0,
      });
    }
    // Bulan yang ditutup tapi tak ada jurnal (edge) ikut tampil.
    for (const [b, d] of tutup) {
      if (!ada.has(b) && b !== berjalan) {
        out.push({ bulan: b, status: "tutup", ditutup: d, jumlah_jurnal: 0 });
      }
    }
    out.sort((a, z) => (a.bulan < z.bulan ? 1 : -1));
    const tutupTerbaru = tutup.size > 0 ? [...tutup.keys()].sort().reverse()[0] : null;
    return ok({ periode: out.slice(0, 24), tutup_terbaru: tutupTerbaru });
  } catch (e) {
    return gagal("Gagal baca periode: ", e);
  }
}

