import pool, { ok, fail } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { catatGagal, ipClient, sisaKunci } from "@/lib/rate-limit";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

// Anti spam akun: maks 3 pendaftaran per jam per IP (akun pun nonaktif
// sampai diverifikasi, tapi tabel tak boleh dibanjiri baris sampah).
const KUNCI_DAFTAR = "register";

// POST /api/register {username, password, kode} — publik, tanpa login.
// Membuat akun role nasabah dalam keadaan NONAKTIF (aktif=0); admin
// mengaktifkan via menu Pengguna setelah verifikasi data di loket.
// Pesan gagal dibuat generik agar tidak membocorkan kode mana yang ada.
export async function POST(req: Request) {
  const kunci = `${KUNCI_DAFTAR}:${ipClient(req)}`;
  const sisa = sisaKunci(kunci);
  if (sisa > 0) return fail("Batas pendaftaran tercapai. Coba lagi nanti", 429);
  let input: Record<string, unknown>;
  try {
    input = await req.json();
  } catch {
    return fail("Body JSON tidak valid");
  }
  const username = String(input.username ?? "").trim();
  const password = String(input.password ?? "");
  const kode = String(input.kode ?? "").toUpperCase().trim();
  if (!/^[a-zA-Z0-9_.-]{3,50}$/.test(username)) return fail("Username 3-50 karakter (huruf/angka/._-)");
  if (password.length < 6) return fail("Password minimal 6 karakter");
  if (!kode) return fail("Kode rekening wajib diisi");

  try {
    const [ada] = await pool.execute<RowDataPacket[]>("SELECT kode FROM tb_pembantu WHERE kode = ? LIMIT 1", [
      kode,
    ]);
    if (ada.length === 0) return fail("Pendaftaran gagal, periksa kembali data Anda");
    const [pakai] = await pool.execute<RowDataPacket[]>("SELECT id FROM tb_user WHERE kode_bantu = ? LIMIT 1", [
      kode,
    ]);
    if (pakai.length > 0) return fail("Kode rekening ini sudah terdaftar");
    // Sandi selalu disimpan sebagai hash bcrypt, bukan teks polos.
    await pool.execute<ResultSetHeader>(
      "INSERT INTO tb_user (username, password_hash, role, kode_bantu, aktif) VALUES (?,?, 'nasabah', ?, 0)",
      [username, await hashPassword(password), kode]
    );
    // Hitung kuota 1 jam tiap pendaftaran sukses (gagal validasi tak dihitung).
    catatGagal(kunci, 3, 60 * 60 * 1000, 60 * 60 * 1000);
    return ok({ username });
  } catch (e) {
    const msg = String((e as { message?: unknown })?.message ?? e ?? "");
    if (msg.includes("Duplicate")) return fail("Username sudah dipakai", 409);
    console.error("[register] error:", e);
    return fail("Pendaftaran gagal, coba lagi", 500);
  }
}
