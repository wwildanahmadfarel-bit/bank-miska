import { NextRequest } from "next/server";
import pool, { gagal, ok, fail } from "@/lib/db";

// GET /api/bayar-status?kode_qr=A9F3... — polling kasir
export async function GET(req: NextRequest) {
  const kodeQr = (req.nextUrl.searchParams.get("kode_qr") ?? "").toUpperCase().trim();
  if (!kodeQr) return fail("kode_qr wajib diisi");
  try {
    const [rows] = await pool.execute(
      `SELECT b.kode_qr, b.nominal, b.status, b.dibayar, m.nama AS merchant
       FROM tb_bayar_merchant b JOIN tb_merchant m ON m.id = b.id_merchant
       WHERE b.kode_qr = ? LIMIT 1`,
      [kodeQr]
    );
    const list = rows as Record<string, unknown>[];
    if (list.length === 0) return fail("QR tidak dikenal", 404);
    return ok({ data: list[0] });
  } catch (e) {
    return gagal("Gagal baca status: ", e);
  }
}

