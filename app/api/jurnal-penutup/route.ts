import pool, { tangkap, gagal, ok, fail } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

// POST /api/jurnal-penutup — admin only (tutup buku)
// Tutup akun LR (kecuali 4-300) ke 4-300 + kunci periode
export async function POST(req: Request) {
  const gate = await requireRole(req, ["admin"], fail);
  if (gate instanceof Response) return gate;
  let input: Record<string, unknown>;
  try {
    input = await req.json();
  } catch {
    return fail("Body JSON tidak valid");
  }

  const bulan = String(input.bulan ?? "").trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(bulan)) return fail("bulan harus YYYY-MM (01-12)");
  // Tutup s/d hari TERAKHIR bulan (bukan tgl 28) agar transaksi 29-31 ikut tertutup.
  const [th, bl] = bulan.split("-").map(Number);
  const lastDay = new Date(th, bl, 0).getDate();
  const tanggal = `${bulan}-${String(lastDay).padStart(2, "0")}`;
  const nextFirst = bl === 12 ? `${th + 1}-01-01` : `${th}-${String(bl + 1).padStart(2, "0")}-01`;

  let conn: Awaited<ReturnType<typeof pool.getConnection>> | null = null;
  try {
    try {
      conn = await pool.getConnection();
    } catch (e) {
      return gagal("Database tidak terjangkau", e);
    }
    await conn.beginTransaction();

    const [trows] = await conn.execute<RowDataPacket[]>("SELECT 1 FROM tb_periode_tutup WHERE bulan = ?", [bulan]);
    if (trows.length > 0) throw new Error("Periode sudah ditutup");

    const [crows] = await conn.execute<RowDataPacket[]>(
      "SELECT kode_akun FROM tb_coa WHERE pos_laporan = 'LR' AND pos_saldo != '-' AND kode_akun != '4-300' ORDER BY kode_akun ASC"
    );
    const akuns = (crows as { kode_akun: string }[]).map((r) => r.kode_akun);
    if (akuns.length === 0) throw new Error("Tidak ada akun LR untuk ditutup");

    const [jh] = await conn.execute<ResultSetHeader>(
      "INSERT INTO tb_jurnal (tanggal, no_bukti, keterangan, tipe) VALUES (?,?,?,?)",
      [tanggal, "9", "Jurnal penutup " + bulan, "PENUTUP"]
    );
    const idJurnal = jh.insertId;

    for (const kode of akuns) {
      const [srows] = await conn.execute<RowDataPacket[]>(
        `SELECT COALESCE(SUM(d.debet),0) AS td, COALESCE(SUM(d.kredit),0) AS tk, c.pos_saldo
         FROM tb_jurnal_detail d JOIN tb_jurnal j ON j.id = d.id_jurnal
         JOIN tb_coa c ON c.kode_akun = d.kode_akun
         WHERE d.kode_akun = ? AND j.tanggal < ?`,
        [kode, nextFirst]
      );
      const s = srows[0] as { td: number; tk: number; pos_saldo: string } | undefined;
      if (!s) continue;
      const saldo = s.pos_saldo === "Kr" ? Number(s.tk) - Number(s.td) : Number(s.td) - Number(s.tk);
      if (Math.abs(saldo) < 0.005) continue;

      if (saldo > 0 && s.pos_saldo === "Kr") {
        // Pendapatan: Db akun, Kr 4-300
        await conn.execute("INSERT INTO tb_jurnal_detail (id_jurnal, kode_akun, debet, kredit) VALUES (?, ?, ?, 0)", [
          idJurnal,
          kode,
          saldo,
        ]);
        await conn.execute("INSERT INTO tb_jurnal_detail (id_jurnal, kode_akun, debet, kredit) VALUES (?, '4-300', 0, ?)", [
          idJurnal,
          saldo,
        ]);
      } else {
        // Biaya (atau pendapatan bersaldo lawan arah): Kr akun, Db 4-300
        const abs = Math.abs(saldo);
        await conn.execute("INSERT INTO tb_jurnal_detail (id_jurnal, kode_akun, debet, kredit) VALUES (?, ?, 0, ?)", [
          idJurnal,
          kode,
          abs,
        ]);
        await conn.execute("INSERT INTO tb_jurnal_detail (id_jurnal, kode_akun, debet, kredit) VALUES (?, '4-300', ?, 0)", [
          idJurnal,
          abs,
        ]);
      }
    }

    await conn.execute("INSERT INTO tb_periode_tutup (bulan) VALUES (?)", [bulan]);

    await conn.commit();
    return ok({ id_jurnal: idJurnal, bulan });
  } catch (e) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {
        /* abaikan */
      }
    }
    return tangkap("Gagal tutup periode", e);
  } finally {
    if (conn) conn.release();
  }
}

