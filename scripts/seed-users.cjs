/* eslint-disable @typescript-eslint/no-require-imports */
// Seed akun inti dengan bcrypt. Dipakai db:init, db:seed-prod, dan db:migrate.
const bcrypt = require("bcryptjs");

const SEED = [
  { username: "admin", env: "SEED_ADMIN_PASSWORD", demo: "admin123", role: "admin", kode: null },
  { username: "teller", env: "SEED_TELLER_PASSWORD", demo: "teller123", role: "teller", kode: null },
  { username: "siswa", env: "SEED_SISWA_PASSWORD", demo: "siswa123", role: "nasabah", kode: "H2478" },
];

const POLA_BCRYPT = /^\$2[aby]\$\d{2}\$/;

async function seedUsers(conn, { demoFallback = false } = {}) {
  const hasil = [];

  for (const s of SEED) {
    const dariEnv = (process.env[s.env] || "").trim();
    if (!dariEnv && !demoFallback) {
      throw new Error(
        `${s.env} wajib diisi di .env.local (password production tidak boleh hardcoded)`
      );
    }
    if (dariEnv && dariEnv.length < 8) {
      throw new Error(`${s.env} minimal 8 karakter`);
    }
    const password = dariEnv || s.demo;
    const hash = await bcrypt.hash(password, 10);

    const [rows] = await conn.execute(
      "SELECT id, password_hash FROM tb_user WHERE username = ? LIMIT 1",
      [s.username]
    );

    if (rows.length === 0) {
      await conn.execute(
        "INSERT INTO tb_user (username, password_hash, role, kode_bantu, aktif) VALUES (?,?,?,?,1)",
        [s.username, hash, s.role, s.kode]
      );
      hasil.push(`${s.username}: dibuat (${s.role})`);
      continue;
    }

    const lama = String(rows[0].password_hash || "");
    const perluSet = Boolean(dariEnv) || !POLA_BCRYPT.test(lama) || lama.length < 50;
    if (perluSet) {
      await conn.execute(
        "UPDATE tb_user SET password_hash = ?, role = ?, kode_bantu = ?, aktif = 1 WHERE id = ?",
        [hash, s.role, s.kode, rows[0].id]
      );
      hasil.push(`${s.username}: password bcrypt diperbarui (${s.role})`);
    } else {
      hasil.push(`${s.username}: dipertahankan (sudah bcrypt)`);
    }
  }

  return hasil;
}

module.exports = { seedUsers, SEED };
