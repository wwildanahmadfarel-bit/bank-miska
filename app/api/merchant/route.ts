import { NextRequest } from "next/server";
import pool, { gagal, ok, fail } from "@/lib/db";
import { batas, requireRole } from "@/lib/auth";

// GET /api/merchant — teller/admin only
export async function GET(req: NextRequest) {
  const gate = await requireRole(req, ["teller", "admin"], fail);
  if (gate instanceof Response) return gate;
  try {
    const [rows] = await pool.execute(
      "SELECT id, kode, nama, kode_akun, aktif FROM tb_merchant WHERE aktif = 1 ORDER BY nama ASC"
    );
    return ok({ data: rows });
  } catch (e) {
    return gagal("Gagal baca merchant: ", e);
  }
}

// POST /api/merchant {kode, nama} — admin only
export async function POST(req: NextRequest) {
  const gate = await requireRole(req, ["admin"], fail);
  if (gate instanceof Response) return gate;
  let input: Record<string, unknown>;
  try {
    input = await req.json();
  } catch {
    return fail("Body JSON tidak valid");
  }
  const kode = String(input.kode ?? "").toUpperCase().trim();
  const nama = String(input.nama ?? "").trim();
  if (!kode || !nama) return fail("Kode dan nama merchant wajib diisi");
  for (const e of [batas(kode, 20, "Kode merchant"), batas(nama, 100, "Nama merchant")]) {
    if (e) return fail(e);
  }
  try {
    await pool.execute("INSERT INTO tb_merchant (kode, nama) VALUES (?,?)", [kode, nama]);
    return ok({ kode });
  } catch (e) {
    const msg = String((e as { message?: unknown })?.message ?? e ?? "");
    if (msg.includes("Duplicate")) return fail("Kode merchant sudah dipakai", 409);
    return gagal("Gagal simpan merchant (mungkin kode ganda): ", e);
  }
}

