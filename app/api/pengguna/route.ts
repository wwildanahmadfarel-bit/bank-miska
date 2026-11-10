import { NextRequest } from "next/server";
import pool, { gagal, ok, fail } from "@/lib/db";
import { getSessionUser, requireRole } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

const ROLES = ["teller", "admin", "nasabah"] as const;
type Role = (typeof ROLES)[number];

// GET /api/pengguna — admin: semua; teller: hanya role nasabah.
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return fail("Belum login", 401);
  if (user.role !== "admin" && user.role !== "teller") return fail("Akses ditolak", 403);
  try {
    const filter = user.role === "admin" ? "" : "WHERE u.role = 'nasabah'";
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT u.id, u.username, u.role, u.kode_bantu, u.aktif, p.nama AS nama_nasabah
       FROM tb_user u LEFT JOIN tb_pembantu p ON p.kode = u.kode_bantu ${filter} ORDER BY u.id ASC LIMIT 200`
    );
    return ok({ data: rows, role_saya: user.role });
  } catch (e) {
    return gagal("Gagal baca pengguna: ", e);
  }
}

// POST /api/pengguna {username, password, role, kode_bantu?}
// Admin: role apa pun. Teller: hanya role nasabah + kode_bantu wajib.
export async function POST(req: NextRequest) {
  const gate = await requireRole(req, ["teller", "admin"], fail);
  if (gate instanceof Response) return gate;
  const saya = gate.user;
  let input: Record<string, unknown>;
  try {
    input = await req.json();
  } catch {
    return fail("Body JSON tidak valid");
  }
  const username = String(input.username ?? "").trim();
  let role = String(input.role ?? "nasabah").toLowerCase() as Role;
  const password = String(input.password ?? "");
  const kodeRaw = String(input.kode_bantu ?? "").toUpperCase().trim();
  if (!/^[a-zA-Z0-9_.-]{3,50}$/.test(username)) return fail("Username 3-50 karakter (huruf/angka/._-)");
  if (password.length < 6) return fail("Password minimal 6 karakter");
  if (!ROLES.includes(role)) return fail("Role harus teller/admin/nasabah");
  if (saya.role === "teller") {
    if (role !== "nasabah") return fail("Teller hanya boleh membuat user nasabah", 403);
    role = "nasabah";
  }
  const kode = kodeRaw === "" ? null : kodeRaw;
  if (role === "nasabah" && !kode) return fail("User nasabah wajib ditautkan ke kode Hxxx/Pxxx");
  if (kode && kode.length > 10) return fail("Kode maksimal 10 karakter");

  try {
    if (kode) {
      const [cek] = await pool.execute<RowDataPacket[]>("SELECT 1 FROM tb_pembantu WHERE kode = ? LIMIT 1", [kode]);
      if (cek.length === 0) return fail("Kode pembantu tidak dikenal: " + kode, 404);
    }
    const [r] = await pool.execute<ResultSetHeader>(
      "INSERT INTO tb_user (username, password_hash, role, kode_bantu) VALUES (?,?,?,?)",
      [username, await hashPassword(password), role, kode]
    );
    return ok({ id: r.insertId, username });
  } catch (e) {
    const msg = String((e as { message?: unknown })?.message ?? e ?? "");
    if (msg.includes("Duplicate")) return fail("Username sudah dipakai", 409);
    return fail("Gagal simpan: " + msg, 500);
  }
}

// PATCH /api/pengguna {id, password?, role?, kode_bantu?, aktif?} — admin only.
// Proteksi: tidak bisa ubah akun sendiri (role/aktif) & tidak bisa utak-atik sesama admin.
export async function PATCH(req: NextRequest) {
  const gate = await requireRole(req, ["admin"], fail);
  if (gate instanceof Response) return gate;
  const saya = gate.user;
  let input: Record<string, unknown>;
  try {
    input = await req.json();
  } catch {
    return fail("Body JSON tidak valid");
  }
  const id = Number(input.id ?? 0);
  if (!Number.isInteger(id) || id < 1) return fail("id tidak valid");
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      "SELECT id, username, role FROM tb_user WHERE id = ? LIMIT 1",
      [id]
    );
    if (rows.length === 0) return fail("User tidak ditemukan", 404);
    const target = rows[0] as { id: number; username: string; role: string };
    const isSelf = target.id === saya.id;
    const isAdminTarget = target.role === "admin";

    const sets: string[] = [];
    const params: (string | number | null)[] = [];
    if (input.password !== undefined) {
      const pw = String(input.password);
      if (pw !== "" && pw.length < 6) return fail("Password minimal 6 karakter");
      if (pw !== "") {
        sets.push("password_hash = ?");
        params.push(await hashPassword(pw));
      }
    }
    if (input.role !== undefined) {
      const r = String(input.role).toLowerCase();
      if (!ROLES.includes(r as Role)) return fail("Role harus teller/admin/nasabah");
      if (isSelf) return fail("Tidak bisa mengubah role akun sendiri", 403);
      if (isAdminTarget) return fail("Tidak bisa mengubah role sesama admin", 403);
      sets.push("role = ?");
      params.push(r);
    }
    if (input.kode_bantu !== undefined) {
      const k = String(input.kode_bantu).toUpperCase().trim() || null;
      if (k && k.length > 10) return fail("Kode maksimal 10 karakter");
      if (k) {
        const [cek] = await pool.execute<RowDataPacket[]>("SELECT 1 FROM tb_pembantu WHERE kode = ? LIMIT 1", [k]);
        if (cek.length === 0) return fail("Kode pembantu tidak dikenal: " + k, 404);
      }
      sets.push("kode_bantu = ?");
      params.push(k);
    }
    if (input.aktif !== undefined) {
      const aktif = Number(input.aktif) ? 1 : 0;
      if (isSelf && !aktif) return fail("Tidak bisa menonaktifkan akun sendiri", 403);
      if (isAdminTarget && !aktif) return fail("Tidak bisa menonaktifkan sesama admin", 403);
      sets.push("aktif = ?");
      params.push(aktif);
      if (!aktif) await pool.execute("DELETE FROM tb_session WHERE id_user = ?", [id]);
    }
    if (sets.length === 0) return fail("Tidak ada perubahan");
    params.push(id);
    await pool.execute(`UPDATE tb_user SET ${sets.join(", ")} WHERE id = ?`, params);
    return ok({ id });
  } catch (e) {
    return gagal("Gagal ubah: ", e);
  }
}

// DELETE /api/pengguna {id} — admin only, bukan akun sendiri & bukan admin.
export async function DELETE(req: NextRequest) {
  const gate = await requireRole(req, ["admin"], fail);
  if (gate instanceof Response) return gate;
  const saya = gate.user;
  let input: Record<string, unknown>;
  try {
    input = await req.json();
  } catch {
    return fail("Body JSON tidak valid");
  }
  const id = Number(input.id ?? 0);
  if (!Number.isInteger(id) || id < 1) return fail("id tidak valid");
  try {
    const [rows] = await pool.execute<RowDataPacket[]>("SELECT id, role FROM tb_user WHERE id = ? LIMIT 1", [id]);
    if (rows.length === 0) return fail("User tidak ditemukan", 404);
    const target = rows[0] as { id: number; role: string };
    if (target.id === saya.id) return fail("Tidak bisa menghapus akun sendiri", 403);
    if (target.role === "admin") return fail("Tidak bisa menghapus sesama admin", 403);
    await pool.execute("DELETE FROM tb_session WHERE id_user = ?", [id]);
    await pool.execute("DELETE FROM tb_user WHERE id = ?", [id]);
    return ok({ id });
  } catch (e) {
    return gagal("Gagal hapus: ", e);
  }
}

