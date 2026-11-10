import pool, { gagal, ok, fail } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import type { ResultSetHeader } from "mysql2/promise";

// POST /api/pembantu-lepas-uid {kode} — cabut kartu (hilang/rusak).
// Hanya mengosongkan uid_kartu; saldo & histori tidak tersentuh.
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
  if (!kode) return fail("Kode wajib diisi");
  try {
    const [r] = await pool.execute<ResultSetHeader>(
      "UPDATE tb_pembantu SET uid_kartu = NULL WHERE kode = ? AND uid_kartu IS NOT NULL",
      [kode]
    );
    if (r.affectedRows === 0) return fail("Kode tidak dikenal atau sudah tanpa kartu", 404);
    return ok({ kode });
  } catch (e) {
    return gagal("Gagal lepas kartu: ", e);
  }
}

