/* eslint-disable @typescript-eslint/no-require-imports */
// npm run db:import -- [path-dump.sql]
// Mengimpor dump penuh lokal (default C:/Temp/backup-lokal.sql) ke database
// yang ditunjuk .env.local (lokal maupun cloud/Aiven). Tanpa dependensi baru:
// env dibaca dengan pola yang sama seperti migrate.cjs (tanpa dotenv).
//
// Contoh:
//   npm run db:import
//   npm run db:import -- C:/Temp/backup-lokal.sql
//   BACKUP_FILE=D:/cadangan.sql npm run db:import
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

function loadEnv() {
  const f = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (!m || m[1].startsWith("#")) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}

(async () => {
  loadEnv();
  const db = process.env.DB_NAME || "db_ukkcashless";
  const useSsl = process.env.DB_SSL === "true";
  const dumpFile =
    process.argv[2] || process.env.BACKUP_FILE || "C:/Temp/backup-lokal.sql";

  if (!fs.existsSync(dumpFile)) {
    console.error(`FILE TIDAK ADA: ${dumpFile}`);
    console.error("Buat dulu via: mysqldump -u root --single-transaction --set-gtid-purged=OFF db_ukkcashless > C:/Temp/backup-lokal.sql");
    process.exit(1);
  }
  const sizeMB = fs.statSync(dumpFile).size / 1024 / 1024;
  if (sizeMB > 50) {
    console.error(`Dump terlalu besar (${sizeMB.toFixed(1)} MB). Import via mysql CLI saja agar tidak kehabisan memori.`);
    process.exit(1);
  }

  console.log(`Menghubungkan ke ${process.env.DB_HOST || "localhost"}:${process.env.DB_PORT || 3306} (SSL=${useSsl})...`);
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASS || "",
    multipleStatements: true,
    connectTimeout: 15000,
    ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  });
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${db}\` CHARACTER SET utf8mb4`);
  await conn.changeUser({ database: db });

  console.log(`Membaca ${dumpFile} (${sizeMB.toFixed(2)} MB)...`);
  const sql = fs.readFileSync(dumpFile, "utf8");

  console.log("Mengunggah data ke database...");
  await conn.query("SET FOREIGN_KEY_CHECKS=0");
  try {
    await conn.query(sql);
  } finally {
    await conn.query("SET FOREIGN_KEY_CHECKS=1");
  }

  const [tables] = await conn.query("SHOW TABLES");
  const names = tables.map((r) => Object.values(r)[0]);
  let user = 0;
  let jurnal = 0;
  if (names.includes("tb_user")) {
    const [u] = await conn.query("SELECT COUNT(*) AS n FROM tb_user");
    user = Number(u[0]?.n ?? 0);
  }
  if (names.includes("tb_jurnal")) {
    const [j] = await conn.query("SELECT COUNT(*) AS n FROM tb_jurnal");
    jurnal = Number(j[0]?.n ?? 0);
  }
  console.log(`OK import selesai. tabel=${names.length} tb_user=${user} tb_jurnal=${jurnal}`);
  await conn.end();
})().catch((e) => {
  console.error("IMPORT GAGAL: " + e.message);
  process.exit(1);
});
