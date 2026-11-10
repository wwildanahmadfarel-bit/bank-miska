import pool, { gagal, ok } from "@/lib/db";
import { JWT_MIN_SECRET } from "@/lib/jwt";
import { ZONA_WAKTU } from "@/lib/tanggal";

// GET /api/health — cek koneksi DB + tabel + konfigurasi runtime.
// Dipakai untuk memastikan "sudah terhubung atau belum" tanpa tebak-tebakan.
export async function GET() {
  try {
    const [ver] = await pool.execute("SELECT VERSION() AS v");
    const version = (ver as Record<string, string>[])[0]?.v ?? "?";
    const [waktu] = await pool.execute(
      "SELECT DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s') AS sekarang, @@session.time_zone AS zona"
    );
    const jamDb = (waktu as Record<string, string>[])[0] ?? {};
    const [tables] = await pool.execute("SHOW TABLES");
    const names = (tables as Record<string, string>[]).map((r) => Object.values(r)[0]);
    const perlu = ["tb_coa", "tb_pembantu", "tb_jurnal", "tb_user", "tb_merchant", "tb_bayar_merchant", "tb_session"];
    const hilang = perlu.filter((t) => !names.includes(t));
    let user = 0;
    let merchant = 0;
    if (names.includes("tb_user")) {
      const [u] = await pool.execute("SELECT COUNT(*) AS n FROM tb_user");
      user = Number((u as Record<string, number>[])[0]?.n ?? 0);
    }
    if (names.includes("tb_merchant")) {
      const [m] = await pool.execute("SELECT COUNT(*) AS n FROM tb_merchant");
      merchant = Number((m as Record<string, number>[])[0]?.n ?? 0);
    }
    return ok({
      db: true,
      version,
      tabel: names.length,
      hilang,
      user,
      merchant,
      jwt: (process.env.JWT_SECRET ?? "").length >= JWT_MIN_SECRET,
      zona_aplikasi: ZONA_WAKTU,
      db_waktu: jamDb.sekarang ?? null,
      db_zona: jamDb.zona ?? null,
    });
  } catch (e) {
    return gagal("DB tidak terhubung: ", e);
  }
}
