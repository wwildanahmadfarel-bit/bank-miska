import pool, { gagal, ok, fail } from "@/lib/db";
import { batas, normalisasiUid, requireRole, validasiUid } from "@/lib/auth";
import type { RowDataPacket } from "mysql2/promise";

// POST /api/pembantu-tambah — teller/admin only
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
  const nama = String(input.nama ?? "").trim();
  const status = String(input.status ?? "").toUpperCase().trim();
  const noRekRaw = String(input.no_rek ?? "").trim();
  const saldoAwal = Number(input.saldo_awal ?? 0);
  const uidRaw = String(input.uid_kartu ?? "").trim();

  if (!kode || !nama) return fail("Kode dan Nama wajib diisi");
  for (const e of [batas(kode, 10, "Kode"), batas(nama, 100, "Nama"), noRekRaw ? batas(noRekRaw, 20, "No Rek") : null]) {
    if (e) return fail(e);
  }
  if (status !== "TABUNGAN" && status !== "PIUTANG") return fail("Status harus TABUNGAN atau PIUTANG");
  if (!Number.isFinite(saldoAwal) || saldoAwal < 0) return fail("Saldo awal tidak boleh negatif");
  if (saldoAwal > 999999999999) return fail("Saldo awal terlalu besar");

  const noRek = noRekRaw === "" ? null : noRekRaw;
  const uid = normalisasiUid(uidRaw);
  const uidError = validasiUid(uid);
  if (uidError) return fail(uidError);

  try {
    if (uid) {
      const [ada] = await pool.execute<RowDataPacket[]>(
        "SELECT kode FROM tb_pembantu WHERE uid_kartu = ? LIMIT 1",
        [uid]
      );
      if (ada.length > 0)
        return fail(`UID sudah dipakai oleh ${(ada[0] as { kode: string }).kode}`, 409);
    }
    try {
      await pool.execute(
        "INSERT INTO tb_pembantu (kode, nama, no_rek, status, saldo_awal, uid_kartu) VALUES (?,?,?,?,?,?)",
        [kode, nama, noRek, status, saldoAwal, uid]
      );
    } catch {
      return fail("Gagal simpan (mungkin kode ganda): " + kode, 409);
    }
    return ok({ kode });
  } catch (e) {
    return gagal("Gagal simpan: ", e);
  }
}

