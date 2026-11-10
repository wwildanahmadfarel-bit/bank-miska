import pool, { tangkap, gagal, ok, fail, periodeTertutup } from "@/lib/db";
import { batas, batasNominal, requireRole } from "@/lib/auth";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

// POST /api/pinjaman-cair — teller/admin only
// Db 1-130-Pxxx plafon / Kr 1-110 Kas plafon + piutang + angsuran
export async function POST(req: Request) {
  const gate = await requireRole(req, ["teller", "admin"], fail);
  if (gate instanceof Response) return gate;
  let input: Record<string, unknown>;
  try {
    input = await req.json();
  } catch {
    return fail("Body JSON tidak valid");
  }

  const kode = String(input.kode_bantu ?? "").toUpperCase().trim();
  const plafon = Number(input.plafon ?? 0);
  const bunga = Number(input.bunga ?? 0);
  const tenor = Number(input.tenor ?? 0);
  const tanggal = String(input.tanggal ?? new Date().toISOString().slice(0, 10)).trim();

  if (!kode) return fail("kode_bantu wajib diisi");
  const errKode = batas(kode, 10, "Kode");
  if (errKode) return fail(errKode);
  if (!Number.isFinite(plafon) || plafon <= 0) return fail("Plafon harus > 0");
  const errPlafon = batasNominal(plafon, "Plafon");
  if (errPlafon) return fail(errPlafon);
  if (!Number.isFinite(bunga) || bunga < 0) return fail("Bunga tidak boleh negatif");
  if (!Number.isInteger(tenor) || tenor < 1) return fail("Tenor minimal 1 bulan");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return fail("Tanggal harus YYYY-MM-DD");

  const total = plafon + (plafon * bunga) / 100;
  const perAngsuran = Math.floor((total / tenor) * 100) / 100;

  let conn: Awaited<ReturnType<typeof pool.getConnection>> | null = null;
  try {
    try {
      conn = await pool.getConnection();
    } catch (e) {
      return gagal("Database tidak terjangkau", e);
    }
    if (await periodeTertutup(conn, tanggal)) return fail("Periode sudah ditutup");
    const [cek] = await conn.execute<RowDataPacket[]>("SELECT status FROM tb_pembantu WHERE kode = ? LIMIT 1", [kode]);
    if (cek.length === 0) return fail("Kode pembantu tidak dikenal: " + kode, 404);
    if ((cek[0] as { status: string }).status !== "PIUTANG")
      return fail("Kode pembantu bukan PIUTANG (gunakan kode Pxxx): " + kode);
    // Cegah Kas negatif: pencairan tidak boleh melebihi saldo Kas 1-110
    const [kasRows] = await conn.execute<RowDataPacket[]>(
      "SELECT COALESCE(SUM(debet - kredit), 0) AS kas FROM tb_jurnal_detail WHERE kode_akun = '1-110'"
    );
    const kasSaldo = Number((kasRows[0] as { kas: number } | undefined)?.kas ?? 0);
    if (kasSaldo < plafon) return fail("Kas tidak cukup untuk pencairan " + plafon);
    await conn.beginTransaction();

    const [ph] = await conn.execute<ResultSetHeader>(
      "INSERT INTO tb_piutang (kode_bantu, plafon, bunga_persen, total_harus_dibayar, sisa, tenor, status) VALUES (?,?,?,?,?,?,?)",
      [kode, plafon, bunga, total, total, tenor, "berjalan"]
    );
    const idPiutang = ph.insertId;

    let sisaBagi = total;
    for (let i = 1; i <= tenor; i++) {
      const nom = i === tenor ? Math.round(sisaBagi * 100) / 100 : perAngsuran;
      sisaBagi -= nom;
      const jt = new Date(tanggal + "T00:00:00");
      jt.setMonth(jt.getMonth() + i);
      const jtStr = jt.toISOString().slice(0, 10);
      try {
        await conn.execute("INSERT INTO tb_angsuran (id_piutang, angsuran_ke, nominal, jatuh_tempo) VALUES (?,?,?,?)", [
          idPiutang,
          i,
          nom,
          jtStr,
        ]);
      } catch {
        throw new Error("Gagal generate angsuran (cek kode pembantu FK)");
      }
    }

    const [jh] = await conn.execute<ResultSetHeader>(
      "INSERT INTO tb_jurnal (tanggal, no_bukti, keterangan, tipe) VALUES (?,?,?,?)",
      [tanggal, "3", "Pencairan pinjaman " + kode, "PINJAMAN-CAIR"]
    );
    const idJurnal = jh.insertId;

    try {
      await conn.execute(
        "INSERT INTO tb_jurnal_detail (id_jurnal, kode_akun, kode_bantu, debet, kredit) VALUES (?, '1-130', ?, ?, 0)",
        [idJurnal, kode, plafon]
      );
    } catch {
      throw new Error("Kode pembantu tidak dikenal: " + kode);
    }
    await conn.execute(
      "INSERT INTO tb_jurnal_detail (id_jurnal, kode_akun, kode_bantu, debet, kredit) VALUES (?, '1-110', NULL, 0, ?)",
      [idJurnal, plafon]
    );

    await conn.commit();
    return ok({ id_piutang: idPiutang, id_jurnal: idJurnal, total });
  } catch (e) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {
        /* abaikan */
      }
    }
    return tangkap("Gagal cairkan pinjaman", e);
  } finally {
    if (conn) conn.release();
  }
}

