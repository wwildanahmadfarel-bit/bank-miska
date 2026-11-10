"use client";

import { useEffect, useState } from "react";
import { PageHeader, Card, Btn, Field, inputCls, EmptyState, Skeleton, TableShell, StatCard } from "../components/ui";
import ExportButtons from "../components/ExportButtons";
import { rupiah } from "@/lib/format";
import { useToast } from "../components/Toast";

type Row = {
  tanggal: string; waktu: string; no_bukti: string; keterangan: string; tipe: string;
  kode_akun: string; debet: number; kredit: number; saldo: number;
};

export default function RiwayatPage() {
  const toast = useToast();
  const [role, setRole] = useState("");
  const [kode, setKode] = useState("");
  const [mulai, setMulai] = useState("");
  const [sampai, setSampai] = useState("");
  const [info, setInfo] = useState("");
  const [saldo, setSaldo] = useState(0);
  const [masuk, setMasuk] = useState(0);
  const [keluar, setKeluar] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  async function muat(kodeParam?: string) {
    setLoading(true);
    try {
      const k = kodeParam ?? kode;
      const r = await fetch(
        `/api/riwayat?kode=${encodeURIComponent(k)}&mulai=${encodeURIComponent(mulai)}&sampai=${encodeURIComponent(sampai)}`
      );
      const data = await r.json();
      if (!data.sukses) {
        setRows([]);
        setInfo("");
        toast(data.pesan, true);
        return;
      }
      setInfo(`${data.pembantu.kode} — ${data.pembantu.nama} (${data.pembantu.status})`);
      setSaldo(Number(data.saldo_akhir));
      setMasuk(Number(data.total_masuk));
      setKeluar(Number(data.total_keluar));
      setRows(data.rows);
    } catch (e) {
      toast("Gagal: " + (e as Error).message, true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const m = await fetch("/api/me").then((r) => r.json());
        if (m.sukses) {
          setRole(String(m.user.role));
          if (m.user.role === "nasabah") {
            muat(""); // kode dipaksa milik sendiri oleh server
            return;
          }
        }
      } catch {
        /* abaikan */
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isNasabah = role === "nasabah";

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={isNasabah ? "Riwayat Saya" : "Riwayat Nasabah"}
        sub={isNasabah ? "Saldo + mutasi rekening Anda." : "Teller/admin: isi kode untuk melihat riwayat nasabah di loket."}
      />
      {!isNasabah && (
        <Card className="mb-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
            <Field label="Kode nasabah" hint="Hxxx tabungan / Pxxx pinjaman">
              <input className={inputCls} value={kode} onChange={(e) => setKode(e.target.value.toUpperCase())} placeholder="H2478" />
            </Field>
            <Field label="Dari">
              <input type="date" className={inputCls} value={mulai} onChange={(e) => setMulai(e.target.value)} />
            </Field>
            <Field label="Sampai">
              <input type="date" className={inputCls} value={sampai} onChange={(e) => setSampai(e.target.value)} />
            </Field>
            <div className="flex flex-wrap items-end gap-2">
              <Btn onClick={() => muat()} disabled={loading}>
                {loading ? "Memuat…" : "Tampilkan"}
              </Btn>
              <Btn variant="secondary" onClick={() => muat()} disabled={loading}>
                ⟳ Refresh
              </Btn>
              <ExportButtons
                href={`/api/ekspor?laporan=riwayat&kode=${encodeURIComponent(kode)}&mulai=${encodeURIComponent(mulai)}&sampai=${encodeURIComponent(sampai)}`}
                disabled={loading || rows.length === 0}
              />
            </div>
          </div>
        </Card>
      )}
      {isNasabah && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Dari">
            <input type="date" className={inputCls} value={mulai} onChange={(e) => setMulai(e.target.value)} />
          </Field>
          <Field label="Sampai">
            <input type="date" className={inputCls} value={sampai} onChange={(e) => setSampai(e.target.value)} />
          </Field>
          <div className="flex flex-wrap items-end gap-2">
            <Btn onClick={() => muat("")}>Filter</Btn>
            <ExportButtons
              href={`/api/ekspor?laporan=riwayat&mulai=${encodeURIComponent(mulai)}&sampai=${encodeURIComponent(sampai)}`}
              disabled={loading || rows.length === 0}
            />
          </div>
        </div>
      )}
      {loading ? (
        <Skeleton />
      ) : !info ? (
        <EmptyState text={isNasabah ? "Memuat..." : "Isi kode nasabah lalu Tampilkan — mis. H2478."} />
      ) : (
        <>
          <p className="mb-3 text-sm font-semibold text-ink">{info}</p>
          <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Saldo Akhir" value={rupiah(saldo)} />
            <StatCard label="Total Masuk" value={rupiah(masuk)} accent="bg-emerald-500" />
            <StatCard label="Total Keluar" value={rupiah(keluar)} accent="bg-amber-500" />
          </div>
          {rows.length === 0 ? (
            <EmptyState text="Tidak ada mutasi." />
          ) : (
            <TableShell head={["Tanggal", "Bukti", "Keterangan", "Debet", "Kredit", "Saldo"]}>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="px-3 py-2.5">
                    {String(r.tanggal).slice(0, 10)}
                    <div className="text-xs text-muted">{r.waktu || "-"}</div>
                  </td>
                  <td className="px-3 py-2.5">{r.no_bukti}</td>
                  <td className="px-3 py-2.5">
                    {r.keterangan}
                    <div className="text-xs text-muted">
                      {r.tipe} • {r.kode_akun}
                    </div>
                  </td>
                  <td className="num px-3 py-2.5">{Number(r.debet) > 0 ? rupiah(r.debet) : "-"}</td>
                  <td className="num px-3 py-2.5">{Number(r.kredit) > 0 ? rupiah(r.kredit) : "-"}</td>
                  <td className="num px-3 py-2.5 font-semibold">{rupiah(r.saldo)}</td>
                </tr>
              ))}
            </TableShell>
          )}
        </>
      )}
    </div>
  );
}
