/* eslint-disable @typescript-eslint/no-require-imports */
// npm run db:migrate — siapkan/rapikan DB lokal yang sudah ada.
// - Menjalankan docs/schema-baru.sql (idempotent) agar semua tabel ada.
// - Menambah kolom tb_user.aktif bila DB lama belum punya (MySQL 8 tidak
//   mendukung ADD COLUMN IF NOT EXISTS ala MariaDB).
// - Memastikan enum tb_jurnal.tipe memuat BAYAR-MERCHANT.
// - Meng-upgrade password seed lama (teks polos) menjadi bcrypt; password
//   yang sudah bcrypt tidak di-reset kecuali SEED_* diisi di .env.local.
const { koneksi, namaDatabase, bacaSchema, pastikanDatabase } = require("./lib-db.cjs");
const { seedUsers } = require("./seed-users.cjs");

(async () => {
  const db = namaDatabase();
  const conn = await koneksi({ database: false, multipleStatements: true });
  try {
    await pastikanDatabase(conn, db);

    await conn.query(bacaSchema());
    console.log("OK: schema-baru.sql dijalankan (idempotent)");

    const [kolAktif] = await conn.query(
      `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'tb_user' AND COLUMN_NAME = 'aktif'`,
      [db]
    );
    if (Number(kolAktif[0]?.n ?? 0) === 0) {
      await conn.query(
        "ALTER TABLE tb_user ADD COLUMN aktif TINYINT NOT NULL DEFAULT 1 COMMENT '0=dinonaktifkan, tidak bisa login'"
      );
      console.log("OK: kolom tb_user.aktif ditambahkan");
    }

    const [kolTipe] = await conn.query(
      `SELECT COLUMN_TYPE AS t FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'tb_jurnal' AND COLUMN_NAME = 'tipe' LIMIT 1`,
      [db]
    );
    if (kolTipe.length > 0 && !String(kolTipe[0].t).includes("BAYAR-MERCHANT")) {
      await conn.query(
        `ALTER TABLE tb_jurnal MODIFY tipe ENUM(
          'SETORAN','PENARIKAN','PINJAMAN-CAIR','ANGSURAN','BIAYA','PENUTUP','BAYAR-MERCHANT'
        ) NOT NULL`
      );
      console.log("OK: enum tb_jurnal.tipe diperbarui");
    }

    const hasil = await seedUsers(conn, { demoFallback: true });
    for (const baris of hasil) console.log("  -", baris);

    const [users] = await conn.query(
      "SELECT username, role, aktif, CHAR_LENGTH(password_hash) AS hash_len FROM tb_user ORDER BY id"
    );
    console.log("OK migrasi selesai. tb_user:", JSON.stringify(users));
  } finally {
    await conn.end();
  }
})().catch((e) => {
  console.error("MIGRATE GAGAL: " + e.message);
  process.exit(1);
});
