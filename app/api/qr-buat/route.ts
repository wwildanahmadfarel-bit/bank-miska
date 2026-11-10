import { randomBytes } from "crypto";
import pool, { gagal, ok, fail } from "@/lib/db";
import { batasNominal, requireRole } from "@/lib/auth";
import type { RowDataPacket } from "mysql2/promise";

// POST /api/qr-buat {id_merchant, nominal} — teller/admin, QR dinamis 5 menit
export async function POST(req: Request) {
  const gate = await requireRole(req, ["teller", "admin"], fail);
  if (gate instanceof Response) return gate;
  let input: Record<string, unknown>;
  try {
    input = await req.json();
  } catch {
    return fail("Body JSON tidak valid");
  }
  const idMerchant = Number(input.id_merchant ?? 0);
  const nominal = Number(input.nominal ?? 0);
  if (!Number.isInteger(idMerchant) || idMerchant < 1) return fail("id_merchant tidak valid");
  const errNom = batasNominal(nominal);
  if (errNom) return fail(errNom);

  try {
    const [m] = await pool.execute<RowDataPacket[]>(
      "SELECT id, kode, nama FROM tb_merchant WHERE id = ? AND aktif = 1 LIMIT 1",
      [idMerchant]
    );
    if (m.length === 0) return fail("Merchant tidak dikenal / nonaktif", 404);

    const kodeQr = randomBytes(8).toString("hex").toUpperCase().slice(0, 16);
    // Pakai jam DB (NOW) agar konsisten dengan kolom dibuat/kedaluwarsa —
    // jangan kirim string UTC dari JS karena mysql2 membacanya sebagai waktu lokal.
    await pool.execute(
      "INSERT INTO tb_bayar_merchant (kode_qr, id_merchant, nominal, kedaluwarsa) VALUES (?,?,?, DATE_ADD(NOW(), INTERVAL 5 MINUTE))",
      [kodeQr, idMerchant, nominal]
    );
    const [exp] = await pool.execute<RowDataPacket[]>(
      "SELECT kedaluwarsa FROM tb_bayar_merchant WHERE kode_qr = ? LIMIT 1",
      [kodeQr]
    );
    if (exp.length === 0) return fail("Gagal baca QR baru, coba lagi", 500);
    const rawExp = (exp[0] as { kedaluwarsa: string | Date }).kedaluwarsa;
    const expDate = new Date(rawExp);
    if (!Number.isFinite(expDate.getTime())) return fail("Waktu kedaluwarsa QR tidak valid", 500);
    const payload = `MISKA:${kodeQr}:${idMerchant}:${nominal}:${Math.floor(expDate.getTime() / 1000)}`;
    return ok({ kode_qr: kodeQr, payload, kedaluwarsa: expDate.toISOString(), nominal });
  } catch (e) {
    return gagal("Gagal buat QR: ", e);
  }
}

