/* eslint-disable @typescript-eslint/no-require-imports */
// npm run db:seed-prod — ganti password akun inti dengan bcrypt dari
// SEED_ADMIN_PASSWORD / SEED_TELLER_PASSWORD / SEED_SISWA_PASSWORD.
// Jalankan setelah schema diimpor; aman diulang (idempotent).
const { koneksi } = require("./lib-db.cjs");
const { seedUsers } = require("./seed-users.cjs");

(async () => {
  const conn = await koneksi();
  try {
    const hasil = await seedUsers(conn, { demoFallback: false });
    for (const baris of hasil) console.log("  -", baris);
    console.log("OK: password production tersimpan sebagai bcrypt.");
  } finally {
    await conn.end();
  }
})().catch((e) => {
  console.error("SEED GAGAL: " + e.message);
  process.exit(1);
});
