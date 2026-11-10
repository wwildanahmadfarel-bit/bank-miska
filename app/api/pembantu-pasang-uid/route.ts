import pool, { gagal, ok, fail } from "@/lib/db";
import { normalisasiUid, requireRole, validasiUid } from "@/lib/auth";
import type { RowDataPacket } from "mysql2/promise";

// POST /api/pembantu-pasang-uid {kode, uid_kartu}
// Pasang kartu susulan ke nasabah yang sudah ada (teller/admin only).
export async function POST(req: Request) {
  const gate = await requireRole(req, ["teller", "admin"], fail);
  if (gate instanceof Response) return gate;
  let input: Record<string, unknown>;
  try {
    input = await req.json();
  } catch {
    return fail("Body JSON tidak valid");
  }
  const kode = String(input.kode ?? "").toUpperCase().trim();
  const uid = normalisasiUid(input.uid_kartu ?? "");
  if (!kode) return fail("Kode wajib diisi");
  const uidError = validasiUid(uid);
  if (uidError) return fail(uidError);
  if (!uid) return fail("UID kartu wajib diisi");

  try {
    const [t] = await pool.execute<RowDataPacket[]>("SELECT kode FROM tb_pembantu WHERE kode = ? LIMIT 1", [kode]);
    if (t.length === 0) return fail("Kode pembantu tidak dikenal: " + kode, 404);
    const [ada] = await pool.execute<RowDataPacket[]>("SELECT kode FROM tb_pembantu WHERE uid_kartu = ? LIMIT 1", [uid]);
    if (ada.length > 0 && String((ada[0] as { kode: string }).kode).toUpperCase() !== kode)
      return fail(`UID sudah dipakai oleh ${(ada[0] as { kode: string }).kode}`, 409);
    await pool.execute("UPDATE tb_pembantu SET uid_kartu = ? WHERE kode = ?", [uid, kode]);
    return ok({ kode, uid_kartu: uid });
  } catch (e) {
    return gagal("Gagal pasang kartu: ", e);
  }
}

