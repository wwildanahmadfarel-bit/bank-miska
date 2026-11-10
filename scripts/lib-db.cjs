/* eslint-disable @typescript-eslint/no-require-imports */
// Utilitas bersama untuk skrip DB (migrate / init / seed).
// Tanpa dotenv: .env.local dibaca manual agar tidak menambah dependensi.
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

function loadEnv() {
  // ENV_FILE memungkinkan file kredensial cloud terpisah, mis.
  //   PowerShell: $env:ENV_FILE=".env.aiven"; npm run db:init
  const f = process.env.ENV_FILE
    ? path.resolve(process.cwd(), process.env.ENV_FILE)
    : path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || m[1].startsWith("#")) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}

function normalisasiTimezone(v) {
  const s = String(v || "").trim();
  if (/^(?:local|Z|[+-]\d{2}:\d{2})$/.test(s)) return s;
  if (s === "Asia/Jakarta" || s === "WIB") return "+07:00";
  if (s === "UTC" || s === "GMT") return "Z";
  return "+07:00";
}

function sslOptions() {
  if (process.env.DB_SSL !== "true") return {};
  const caRaw = (process.env.DB_SSL_CA || "").trim();
  if (!caRaw) return { ssl: { rejectUnauthorized: false } };
  const ca = caRaw.includes("BEGIN CERTIFICATE")
    ? caRaw.replace(/\\n/g, "\n")
    : Buffer.from(caRaw, "base64").toString("utf8");
  return { ssl: { ca, rejectUnauthorized: true } };
}

async function koneksi({ database = true, multipleStatements = false } = {}) {
  loadEnv();
  const timezone = normalisasiTimezone(process.env.DB_TIMEZONE || "+07:00");
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASS || "",
    ...(database ? { database: process.env.DB_NAME || "db_ukkcashless" } : {}),
    multipleStatements,
    connectTimeout: 20000,
    charset: "utf8mb4",
    timezone,
    ...sslOptions(),
  });
  await conn.query("SET time_zone = ?", [timezone]);
  return conn;
}

function namaDatabase() {
  const db = process.env.DB_NAME || "db_ukkcashless";
  if (!/^[A-Za-z0-9_]+$/.test(db)) {
    throw new Error("DB_NAME hanya boleh huruf/angka/underscore");
  }
  return db;
}

/** Baca schema-baru.sql tanpa baris CREATE DATABASE / USE (pakai DB aktif). */
function bacaSchema() {
  const f = path.join(__dirname, "..", "..", "docs", "schema-baru.sql");
  if (!fs.existsSync(f)) throw new Error(`File schema tidak ada: ${f}`);
  return fs
    .readFileSync(f, "utf8")
    .replace(/^\s*CREATE\s+DATABASE[^;]*;\s*/im, "")
    .replace(/^\s*USE\s+[^;]*;\s*/im, "");
}

async function pastikanDatabase(conn, db) {
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${db}\` CHARACTER SET utf8mb4`);
  await conn.changeUser({ database: db });
}

module.exports = { loadEnv, koneksi, namaDatabase, bacaSchema, pastikanDatabase, normalisasiTimezone };
