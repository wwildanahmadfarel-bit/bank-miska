"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { PageHeader, Card, Btn, Field, inputCls, EmptyState, Skeleton, StatCard, TableShell } from "../components/ui";
import ExportButtons from "../components/ExportButtons";
import RoleGuard from "../components/RoleGuard";
import { rupiah } from "@/lib/format";
import { useToast } from "../components/Toast";

type Rincian = { kode: string; jumlah: string };
type SaldoInfo = { nama: string; saldo: number };
type StrukItem = { kode: string; nama: string; jumlah: number; sisa: number; waktu: string };
type Struk = { id: number; tanggal: string; bukti: string; total: number; items: StrukItem[] };
type HRow = {
  id_jurnal: number; tanggal: string; waktu: string; no_bukti: string; keterangan: string; tipe: string;
  kode_akun: string; nama_akun: string; kode_bantu: string; debet: number; kredit: number;
};
type NotaDetail = {
  kode_akun: string; nama_akun: string; kode_bantu: string; nama_bantu: string;
  debet: number; kredit: number; sisa: number | null;
};
type Nota = {
  id: number; tanggal: string; waktu: string; no_bukti: string;
  keterangan: string; tipe: string; details: NotaDetail[];
};
type StrukTarik = {
  id: number; tanggal: string; waktu: string; bukti: string;
  kode: string; nama: string; jumlah: number; sisa: number;
};

const TIPE_JURNAL = ["SEMUA", "SETORAN", "PENARIKAN", "PINJAMAN-CAIR", "ANGSURAN", "BAYAR-MERCHANT", "PENUTUP"];

// Kepala + kaki slip nota Bank Miska (dipakai semua nota agar konsisten).
function KopNota() {
  return (
    <>
      <p className="text-base font-bold tracking-[0.2em]">BANK MISKA</p>
      <p className="text-[10px] text-muted">Praktik Sekolah</p>
    </>
  );
}

function GarisNota() {
  return <div className="my-1 border-t border-dashed border-slate-300" />;
}

function KakiNota({ status }: { status: string }) {
  return (
    <>
      <p className="mt-2 font-bold">{status}</p>
      <p>TERIMA KASIH</p>
      <p className="mt-1 text-[10px] text-muted">Simpan nota ini sebagai bukti transaksi yang sah.</p>
    </>
  );
}

// Popup nota: slip 57mm di tengah layar (tutup via tombol, klik luar, atau Esc).
function ModalNota({ onTutup, children }: { onTutup: () => void; children: ReactNode }) {
  useEffect(() => {
    const tutup = (e: KeyboardEvent) => {
      if (e.key === "Escape") onTutup();
    };
    window.addEventListener("keydown", tutup);
    return () => window.removeEventListener("keydown", tutup);
  }, [onTutup]);
  return (
    <div
      className="nota-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onTutup}
    >
      <div className="max-h-[90vh] w-full max-w-xs overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function JurnalPageInner() {
  const toast = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [sTanggal, setSTanggal] = useState(today);
  const [sBukti, setSBukti] = useState("1");
  const [rincian, setRincian] = useState<Rincian[]>([{ kode: "", jumlah: "" }]);
  const [busySetor, setBusySetor] = useState(false);
  const [sError, setSError] = useState("");
  const [tError, setTError] = useState("");
  const [scanS, setScanS] = useState("");
  const [saldoMap, setSaldoMap] = useState<Record<string, SaldoInfo>>({});
  const [struk, setStruk] = useState<Struk | null>(null);
  const [strukTarik, setStrukTarik] = useState<StrukTarik | null>(null);
  const [nota, setNota] = useState<Nota | null>(null);
  const [busyNota, setBusyNota] = useState<number | null>(null);

  // Buka nota detail satu jurnal (cetak ulang dari histori).
  async function bukaNota(idJurnal: number) {
    setBusyNota(idJurnal);
    try {
      const r = await fetch(`/api/jurnal-nota?id=${idJurnal}`);
      const data = await r.json();
      if (!data.sukses) return toast(data.pesan, true);
      setStruk(null);
      setStrukTarik(null);
      setNota(data.nota);
    } catch (e) {
      toast("Gagal: " + (e as Error).message, true);
    } finally {
      setBusyNota(null);
    }
  }

  function judulNota(tipe: string) {
    if (tipe === "PENARIKAN") return "PENARIKAN DARI TABUNGAN";
    if (tipe === "SETORAN") return "SETORAN KE TABUNGAN";
    return tipe.replace(/-/g, " ");
  }
  const scanRef = useRef<HTMLInputElement>(null);
  const [tTanggal, setTTanggal] = useState(today);
  const [tBukti, setTBukti] = useState("2");
  const [tKode, setTKode] = useState("");
  const [tJumlah, setTJumlah] = useState("");
  const [busyTarik, setBusyTarik] = useState(false);
  const [tScan, setTScan] = useState("");
  const [tInfo, setTInfo] = useState<{ kode: string; nama: string; saldo: number } | null>(null);
  const tScanRef = useRef<HTMLInputElement>(null);
  const bulanIni = today.slice(0, 7);
  const [hBulan, setHBulan] = useState(bulanIni);
  const [hTipe, setHTipe] = useState("SEMUA");
  const [hRows, setHRows] = useState<HRow[]>([]);
  const [hMasuk, setHMasuk] = useState(0);
  const [hKeluar, setHKeluar] = useState(0);
  const [hBalance, setHBalance] = useState(true);
  const [hLoading, setHLoading] = useState(false);

  const total = rincian.reduce((a, r) => a + (parseFloat(r.jumlah) || 0), 0);

  // Histori bulan/periode: tanggal + rincian + total Kas masuk/keluar.
  // Muat ulang tiap filter berubah atau tiap ada setoran/penarikan baru (segarkan).
  const [segarkan, setSegarkan] = useState(0);
  useEffect(() => {
    let aktif = true;
    (async () => {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(hBulan)) return;
      setHLoading(true);
      try {
        const r = await fetch(`/api/jurnal?bulan=${encodeURIComponent(hBulan)}&tipe=${encodeURIComponent(hTipe)}`);
        const data = await r.json();
        if (!aktif) return;
        if (!data.sukses) {
          setHRows([]);
          toast(data.pesan, true);
          return;
        }
        // Terbaru di atas, paling lama di bawah: tanggal DESC, lalu waktu DESC, lalu id DESC.
        const terurut = [...(data.rows as HRow[])].sort((a, b) => {
          const t = String(b.tanggal ?? "").localeCompare(String(a.tanggal ?? ""));
          if (t !== 0) return t;
          const w = String(b.waktu ?? "").localeCompare(String(a.waktu ?? ""));
          if (w !== 0) return w;
          return Number(b.id_jurnal) - Number(a.id_jurnal);
        });
        setHRows(terurut);
        setHMasuk(Number(data.masuk));
        setHKeluar(Number(data.keluar));
        setHBalance(Boolean(data.balance));
      } catch (e) {
        if (aktif) toast("Gagal: " + (e as Error).message, true);
      } finally {
        if (aktif) setHLoading(false);
      }
    })();
    return () => {
      aktif = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hBulan, hTipe, segarkan]);

  async function kirimSetoran() {
    const bersih = rincian
      .map((r) => ({ kode_bantu: r.kode.trim().toUpperCase(), jumlah: parseFloat(r.jumlah) || 0 }))
      .filter((r) => r.kode_bantu && r.jumlah > 0);
    setSError("");
    if (!sTanggal) {
      setSError("Tanggal wajib diisi.");
      return toast("Tanggal wajib diisi.", true);
    }
    if (bersih.length === 0) {
      setSError("Isi minimal 1 baris: kode nasabah (mis. H2412) dan jumlah lebih dari 0.");
      return toast("Tambah minimal 1 rincian valid.", true);
    }
    setBusySetor(true);
    try {
      const r = await fetch("/api/jurnal-setoran", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tanggal: sTanggal, bukti: sBukti || "1", rincian: bersih }),
      });
      const data = await r.json();
      if (!data.sukses) return toast(data.pesan, true);
      toast(`Setoran tersimpan. ID jurnal #${data.id_jurnal}, total ${rupiah(data.total)}`);
      // Susun struk: ambil sisa saldo tiap nasabah
      const items: StrukItem[] = [];
      for (const b of bersih) {
        try {
          const rr = await fetch(`/api/riwayat?kode=${encodeURIComponent(b.kode_bantu)}`);
          const dd = await rr.json();
          const rows = Array.isArray(dd.rows) ? dd.rows : [];
          const last = rows.length > 0 ? rows[rows.length - 1] : null;
          items.push({
            kode: b.kode_bantu,
            nama: dd.sukses ? String(dd.pembantu.nama) : saldoMap[b.kode_bantu]?.nama || "-",
            jumlah: b.jumlah,
            sisa: dd.sukses ? Number(dd.saldo_akhir) : 0,
            waktu: last ? String(last.waktu ?? "") : "",
          });
        } catch {
          items.push({ kode: b.kode_bantu, nama: saldoMap[b.kode_bantu]?.nama || "-", jumlah: b.jumlah, sisa: 0, waktu: "" });
        }
      }
      setStruk({ id: data.id_jurnal, tanggal: sTanggal, bukti: sBukti || "1", total: data.total, items });
      setStrukTarik(null);
      setNota(null);
      setRincian([{ kode: "", jumlah: "" }]);
      setSaldoMap({});
      setSegarkan((k) => k + 1);
    } catch (e) {
      toast("Gagal: " + (e as Error).message, true);
    } finally {
      setBusySetor(false);
    }
  }

  // Tap kartu RFID di form setoran: isi baris + tampilkan saldo buku vs sistem
  async function tapSetoran(uidMentah: string) {
    const uid = uidMentah.trim();
    if (!uid) return;
    try {
      const r = await fetch(`/api/pembantu-by-uid?uid=${encodeURIComponent(uid)}`);
      const data = await r.json();
      if (!data.sukses) return toast(data.pesan, true);
      const kode = String(data.data.kode);
      setSaldoMap((m) => ({ ...m, [kode]: { nama: String(data.data.nama), saldo: Number(data.data.saldo_akhir) } }));
      setRincian((rs) => {
        const idx = rs.findIndex((x) => !x.kode.trim());
        if (idx >= 0) return rs.map((x, j) => (j === idx ? { ...x, kode } : x));
        return [...rs, { kode, jumlah: "" }];
      });
      toast(`${kode} ${data.data.nama} — saldo ${rupiah(data.data.saldo_akhir)}`);
    } catch (e) {
      toast("Gagal lookup: " + (e as Error).message, true);
    } finally {
      setScanS("");
      setTimeout(() => scanRef.current?.focus(), 50);
    }
  }

  // Tap kartu RFID di form penarikan: isi kode + tampilkan saldo
  async function tapTarik(uidMentah: string) {
    const uid = uidMentah.trim();
    if (!uid) return;
    try {
      const r = await fetch(`/api/pembantu-by-uid?uid=${encodeURIComponent(uid)}`);
      const data = await r.json();
      if (!data.sukses) return toast(data.pesan, true);
      setTKode(String(data.data.kode));
      setTInfo({ kode: String(data.data.kode), nama: String(data.data.nama), saldo: Number(data.data.saldo_akhir) });
      toast(`${data.data.kode} ${data.data.nama} — saldo ${rupiah(data.data.saldo_akhir)}`);
    } catch (e) {
      toast("Gagal lookup: " + (e as Error).message, true);
    } finally {
      setTScan("");
      setTimeout(() => tScanRef.current?.focus(), 50);
    }
  }

  async function kirimPenarikan() {
    const body = { tanggal: tTanggal, bukti: tBukti || "2", kode_bantu: tKode.trim().toUpperCase(), jumlah: parseFloat(tJumlah) || 0 };
    setTError("");
    if (!body.tanggal || !body.kode_bantu || body.jumlah <= 0) {
      setTError("Lengkapi tanggal, kode nasabah (mis. H2412), dan jumlah lebih dari 0.");
      return toast("Tanggal, kode, dan jumlah > 0 wajib diisi.", true);
    }
    setBusyTarik(true);
    try {
      const r = await fetch("/api/jurnal-penarikan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!data.sukses) return toast(data.pesan, true);
      toast(`Penarikan tersimpan. ID jurnal #${data.id_jurnal}`);
      setStrukTarik({
        id: data.id_jurnal,
        tanggal: String(data.tanggal ?? tTanggal),
        waktu: String(data.waktu ?? ""),
        bukti: String(data.bukti ?? tBukti),
        kode: String(data.kode ?? ""),
        nama: String(data.nama ?? ""),
        jumlah: Number(data.jumlah),
        sisa: Number(data.sisa),
      });
      setTKode("");
      setTJumlah("");
      setTInfo(null);
      setStruk(null);
      setNota(null);
      setSegarkan((k) => k + 1);
    } catch (e) {
      toast("Gagal: " + (e as Error).message, true);
    } finally {
      setBusyTarik(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Jurnal" sub="Setoran tunai (Bukti 1) dan penarikan tunai (Bukti 2) nasabah." />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <h3 className="font-semibold text-ink">Setoran (Bukti 1)</h3>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Tanggal">
              <input type="date" className={inputCls} value={sTanggal} onChange={(e) => setSTanggal(e.target.value)} />
            </Field>
            <Field label="No Bukti">
              <input className={inputCls} value={sBukti} onChange={(e) => setSBukti(e.target.value)} />
            </Field>
          </div>
          <div className="mt-3">
            <Field label="Tap kartu RFID (cek saldo — Enter)">
              <input
                ref={scanRef}
                className={inputCls}
                value={scanS}
                onChange={(e) => setScanS(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") tapSetoran(scanS);
                }}
                placeholder="Tempel kartu siswa di sini…"
              />
            </Field>
          </div>
          <div className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-2 text-xs font-semibold text-muted">
            <span>Kode Pembantu (Hxxx)</span>
            <span>Jumlah</span>
            <span />
          </div>
          {rincian.map((r, i) => (
            <div key={i} className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-2">
              <input
                className={inputCls}
                placeholder="H2412"
                value={r.kode}
                onChange={(e) =>
                  setRincian(rincian.map((x, j) => (j === i ? { ...x, kode: e.target.value.toUpperCase() } : x)))
                }
              />
              <input
                className={inputCls}
                type="number"
                min={1}
                placeholder="200000"
                value={r.jumlah}
                onChange={(e) => setRincian(rincian.map((x, j) => (j === i ? { ...x, jumlah: e.target.value } : x)))}
              />
              <Btn variant="secondary" size="sm" title="Hapus baris ini" onClick={() => setRincian(rincian.filter((_, j) => j !== i))}>
                ×
              </Btn>
            </div>
          ))}
          <div className="mt-3 flex items-center justify-between">
            <Btn variant="ghost" onClick={() => setRincian([...rincian, { kode: "", jumlah: "" }])}>
              + Tambah Nasabah
            </Btn>
            <span className="text-sm text-muted">
              Total: <strong className="num text-ink">{rupiah(total)}</strong>
            </span>
          </div>
          {Object.keys(saldoMap).length > 0 && (
            <div className="mt-2 space-y-1 rounded-lg bg-slate-50 px-3 py-2 text-xs">
              {Object.entries(saldoMap).map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span>
                    <strong>{k}</strong> {v.nama}
                  </span>
                  <span className="num font-semibold">saldo {rupiah(v.saldo)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3">
            <Btn onClick={kirimSetoran} disabled={busySetor}>
              {busySetor ? "Menyimpan..." : "Simpan Setoran"}
            </Btn>
            {sError && <p className="mt-2 text-xs font-medium text-red-600">{sError}</p>}
          </div>
        </Card>
        <Card>
          <h3 className="font-semibold text-ink">Penarikan (Bukti 2)</h3>
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tanggal">
                <input type="date" className={inputCls} value={tTanggal} onChange={(e) => setTTanggal(e.target.value)} />
              </Field>
              <Field label="No Bukti">
                <input className={inputCls} value={tBukti} onChange={(e) => setTBukti(e.target.value)} />
              </Field>
            </div>
            <Field label="Tap kartu RFID (cek saldo — Enter)">
              <input
                ref={tScanRef}
                className={inputCls}
                value={tScan}
                onChange={(e) => setTScan(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") tapTarik(tScan);
                }}
                placeholder="Tempel kartu siswa di sini…"
              />
            </Field>
            <Field label="Kode Pembantu (Hxxx)">
              <input className={inputCls} value={tKode} onChange={(e) => setTKode(e.target.value.toUpperCase())} placeholder="H2412" />
            </Field>
            {tInfo && (
              <div className="mt-2 space-y-1 rounded-lg bg-slate-50 px-3 py-2 text-xs">
                <div className="flex justify-between">
                  <span>
                    <strong>{tInfo.kode}</strong> {tInfo.nama}
                  </span>
                  <span className="num font-semibold">saldo {rupiah(tInfo.saldo)}</span>
                </div>
              </div>
            )}
            <Field label="Jumlah">
              <input className={inputCls} type="number" min={1} value={tJumlah} onChange={(e) => setTJumlah(e.target.value)} placeholder="200000" />
            </Field>
            <Btn onClick={kirimPenarikan} disabled={busyTarik}>
              {busyTarik ? "Menyimpan..." : "Simpan Penarikan"}
            </Btn>
            {tError && <p className="mt-2 text-xs font-medium text-red-600">{tError}</p>}
          </div>
        </Card>
      </div>
      <Card className="mt-5">
        <h3 className="font-semibold text-ink">Histori Periode</h3>
        <p className="mt-1 text-sm text-muted">
          Transaksi terbaru di atas. Kas Masuk = uang masuk, Kas Keluar = uang keluar.
          {!hBalance && <strong> Perhatian: Debet ≠ Kredit.</strong>}
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
          <Field label="Bulan (1 periode = 1 bulan)">
            <input type="month" className={inputCls} value={hBulan} onChange={(e) => setHBulan(e.target.value)} />
          </Field>
          <Field label="Tipe">
            <select className={inputCls} value={hTipe} onChange={(e) => setHTipe(e.target.value)}>
              {TIPE_JURNAL.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-end">
            <Btn variant="secondary" onClick={() => setSegarkan((k) => k + 1)} disabled={hLoading}>
              {hLoading ? "Memuat…" : "⟳ Refresh"}
            </Btn>
          </div>
          <div className="flex items-end">
            <ExportButtons
              href={`/api/ekspor?laporan=paket-periode&bulan=${encodeURIComponent(hBulan)}`}
              disabled={hLoading || hRows.length === 0}
            />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatCard label="Kas Masuk" value={rupiah(hMasuk)} accent="bg-emerald-500" />
          <StatCard label="Kas Keluar" value={rupiah(hKeluar)} accent="bg-amber-500" />
        </div>
        <div className="mt-4">
          {hLoading ? (
            <Skeleton />
          ) : hRows.length === 0 ? (
            <EmptyState text="Tidak ada jurnal di periode ini — coba ganti bulan/tipe atau tekan Refresh." />
          ) : (
            <TableShell head={["Tanggal", "Bukti", "Keterangan", "Debet", "Kredit", "Aksi"]}>
              {hRows.map((r, i) => (
                <tr key={i}>
                  <td className="px-3 py-2.5">
                    {r.tanggal.slice(0, 10)}
                    <div className="text-xs text-muted">{r.waktu || "-"}</div>
                  </td>
                  <td className="px-3 py-2.5">{r.no_bukti}</td>
                  <td className="px-3 py-2.5">
                    {r.keterangan}
                    <div className="text-xs text-muted">
                      {r.tipe} • {r.kode_akun}
                      {r.kode_bantu ? ` • ${r.kode_bantu}` : ""}
                    </div>
                  </td>
                  <td className="num px-3 py-2.5">{Number(r.debet) > 0 ? rupiah(r.debet) : "-"}</td>
                  <td className="num px-3 py-2.5">{Number(r.kredit) > 0 ? rupiah(r.kredit) : "-"}</td>
                  <td className="px-3 py-2.5">
                    <Btn variant="ghost" onClick={() => bukaNota(r.id_jurnal)} disabled={busyNota !== null}>
                      {busyNota === r.id_jurnal ? "…" : "Nota"}
                    </Btn>
                  </td>
                </tr>
              ))}
            </TableShell>
          )}
        </div>
      </Card>
      {struk && (
        <ModalNota onTutup={() => setStruk(null)}>
          <Card className="print-nota">
          <div className="mx-auto w-[57mm] max-w-full text-center font-mono text-xs text-ink">
            <KopNota />
            <p className="mt-2">
              {struk.tanggal} {struk.items[0]?.waktu ?? ""}
            </p>
            <p className="text-xs text-muted">
              Bukti {struk.bukti} • #{struk.id}
            </p>
            <p className="mt-2 font-bold">SETORAN KE TABUNGAN</p>
            <GarisNota />
            {struk.items.map((it) => (
              <div key={it.kode} className="mt-1 text-left">
                <p>
                  <strong>{it.kode}</strong> — {it.nama}
                </p>
                <div className="flex justify-between">
                  <span>SETOR</span>
                  <span className="num">: {rupiah(it.jumlah)}</span>
                </div>
                <div className="flex justify-between">
                  <span>SISA</span>
                  <span className="num">: {rupiah(it.sisa)}</span>
                </div>
              </div>
            ))}
            <GarisNota />
            <div className="flex justify-between font-bold">
              <span>TOTAL</span>
              <span className="num">: {rupiah(struk.total)}</span>
            </div>
            <KakiNota status="SETORAN BERHASIL" />
          </div>
          <div className="no-print mt-3 flex justify-center gap-2">
            <Btn variant="secondary" onClick={() => window.print()}>
              🖨️ Cetak
            </Btn>
            <Btn variant="ghost" onClick={() => setStruk(null)}>
              Tutup
            </Btn>
          </div>
          </Card>
        </ModalNota>
      )}
      {strukTarik && (
        <ModalNota onTutup={() => setStrukTarik(null)}>
          <Card className="print-nota">
          <div className="mx-auto w-[57mm] max-w-full text-center font-mono text-xs text-ink">
            <KopNota />
            <p className="mt-2">
              {strukTarik.tanggal} {strukTarik.waktu}
            </p>
            <p>
              {strukTarik.kode}
              {strukTarik.nama ? ` — ${strukTarik.nama}` : ""}
            </p>
            <p className="text-xs text-muted">
              Bukti {strukTarik.bukti} • #{strukTarik.id}
            </p>
            <p className="mt-2 font-bold">PENARIKAN DARI TABUNGAN</p>
            <GarisNota />
            <div className="mt-1 flex justify-between">
              <span>JUMLAH</span>
              <span className="num">: {rupiah(strukTarik.jumlah)}</span>
            </div>
            <div className="flex justify-between">
              <span>SISA</span>
              <span className="num">: {rupiah(strukTarik.sisa)}</span>
            </div>
            <GarisNota />
            <KakiNota status="PENARIKAN BERHASIL" />
          </div>
          <div className="no-print mt-3 flex justify-center gap-2">
            <Btn variant="secondary" onClick={() => window.print()}>
              🖨️ Cetak
            </Btn>
            <Btn variant="ghost" onClick={() => setStrukTarik(null)}>
              Tutup
            </Btn>
          </div>
          </Card>
        </ModalNota>
      )}
      {nota && (
        <ModalNota onTutup={() => setNota(null)}>
          <Card className="print-nota">
          <div className="mx-auto w-[57mm] max-w-full text-center font-mono text-xs text-ink">
            <KopNota />
            <p className="mt-2">
              {nota.tanggal} {nota.waktu}
            </p>
            <p className="text-xs text-muted">
              Bukti {nota.no_bukti} • #{nota.id} • {nota.tipe}
            </p>
            <p className="mt-1">{nota.keterangan}</p>
            <p className="mt-2 font-bold">{judulNota(nota.tipe)}</p>
            <GarisNota />
            {nota.details.map((d, i) => (
              <div key={i} className="mt-1 text-left">
                <p>
                  <strong>{d.kode_bantu || d.kode_akun}</strong>
                  {(d.nama_bantu || d.nama_akun) && ` — ${d.nama_bantu || d.nama_akun}`}
                </p>
                <div className="flex justify-between">
                  <span>{Number(d.debet) > 0 ? "DB" : "KR"}</span>
                  <span className="num">: {rupiah(Number(d.debet) > 0 ? d.debet : d.kredit)}</span>
                </div>
                {d.sisa !== null && (
                  <div className="flex justify-between">
                    <span>SISA</span>
                    <span className="num">: {rupiah(d.sisa)}</span>
                  </div>
                )}
              </div>
            ))}
            <GarisNota />
            <KakiNota status={nota.tipe === "PENARIKAN" ? "PENARIKAN BERHASIL" : "TRANSAKSI TERSIMPAN"} />
          </div>
          <div className="no-print mt-3 flex justify-center gap-2">
            <Btn variant="secondary" onClick={() => window.print()}>
              🖨️ Cetak
            </Btn>
            <Btn variant="ghost" onClick={() => setNota(null)}>
              Tutup
            </Btn>
          </div>
          </Card>
        </ModalNota>
      )}
    </div>
  );
}

export default function JurnalPage() {
  return (
    <RoleGuard allow={["teller", "admin"]}>
      <JurnalPageInner />
    </RoleGuard>
  );
}
