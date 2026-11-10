/* eslint-disable @typescript-eslint/no-require-imports */
// npm run db:init — siapkan database cloud/lokal dari nol:
//   1) buat database (DB_NAME)
//   2) jalankan docs/schema-baru.sql (idempotent)
//   3) set password admin/teller/siswa dari SEED_* di .env.local (bcrypt)
const { koneksi, namaDatabase, bacaSchema, pastikanDatabase, normalisasiTimezone } = require("./lib-db.cjs");
const { seedUsers } = require("./seed-users.cjs");

(async () => {
  const db = namaDatabase();
  console.log(
    `DB target: ${process.env.DB_HOST || "localhost"}:${process.env.DB_PORT || 3306}/${db} ` +
      `(SSL=${process.env.DB_SSL === "true"}, TZ=${normalisasiTimezone(process.env.DB_TIMEZONE || "+07:00")})`
  );

  const conn = await koneksi({ database: false, multipleStatements: true });
  try {
    await pastikanDatabase(conn, db);
    console.log("OK: database siap");

    await conn.query(bacaSchema());
    console.log("OK: schema-baru.sql dijalankan");

    const hasil = await seedUsers(conn, { demoFallback: false });
    for (const baris of hasil) console.log("  -", baris);

    const [users] = await conn.query("SELECT COUNT(*) AS n FROM tb_user");
    const [tabel] = await conn.query("SHOW TABLES");
    console.log(`OK: ${tabel.length} tabel, ${Number(users[0]?.n ?? 0)} user`);

    if ((process.env.JWT_SECRET || "").length < 32) {
      console.warn("PERINGATAN: JWT_SECRET belum diisi minimal 32 karakter — login production akan gagal.");
    } else {
      console.log("OK: JWT_SECRET terpasang (>= 32 karakter)");
    }
  } finally {
    await conn.end();
  }
})().catch((e) => {
  console.error("DB INIT GAGAL: " + e.message);
  process.exit(1);
});
