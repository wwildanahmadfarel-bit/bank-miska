"use client";

import { useEffect, useState } from "react";
import { PageHeader, Card, Btn, EmptyState, Skeleton, TableShell } from "../components/ui";
import ExportButtons from "../components/ExportButtons";
import { rupiah } from "@/lib/format";
import { useToast } from "../components/Toast";

type SaldoRow = { kode: string; nama: string; no_rek: string | null; saldo_akhir: number };

export default function DaftarSaldoPage() {
  const toast = useToast();
  const [tipe, setTipe] = useState("TABUNGAN");
  const [rows, setRows] = useState<SaldoRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  async function muat(t: string) {
    setLoading(true);
    try {
      const r = await fetch(`/api/daftar-saldo?tipe=${encodeURIComponent(t)}`);
      const data = await r.json();
      if (!data.sukses) return toast(data.pesan, true);
      setRows(data.rows);
      setTotal(data.total);
    } catch (e) {
      toast("Gagal: " + (e as Error).message, true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch("/api/daftar-saldo?tipe=TABUNGAN");
        const data = await r.json();
        if (!data.sukses) throw new Error(data.pesan);
        if (cancelled) return;
        setRows(data.rows);
        setTotal(data.total);
      } catch (e) {
        if (!cancelled) toast("Gagal: " + (e as Error).message, true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setT(t: string) {
    setTipe(t);
    muat(t);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Daftar Saldo" sub="Saldo terkini per nasabah — Tabungan (H) dan Piutang (P)." />
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <Btn variant={tipe === "TABUNGAN" ? "primary" : "secondary"} onClick={() => setT("TABUNGAN")}>
              Tabungan (H)
            </Btn>
            <Btn variant={tipe === "PIUTANG" ? "primary" : "secondary"} onClick={() => setT("PIUTANG")}>
              Piutang (P)
            </Btn>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Btn variant="secondary" onClick={() => muat(tipe)} disabled={loading}>
              {loading ? "Memuat…" : "⟳ Refresh"}
            </Btn>
            <ExportButtons
              href={`/api/ekspor?laporan=daftar-saldo&tipe=${encodeURIComponent(tipe)}`}
              disabled={loading || rows.length === 0}
            />
          </div>
        </div>
        <p className="mb-4 text-xs text-muted">
          Angka posisi terkini — untuk arsip bulan yang sudah ditutup, unduh dari halaman laporan per periode.
        </p>
        {loading ? (
          <Skeleton />
        ) : rows.length === 0 ? (
          <EmptyState text="Belum ada data pada tipe ini — coba tipe lain atau tekan Refresh." />
        ) : (
          <>
            <TableShell head={["Kode", "Nama", "No Rek", "Saldo Akhir"]}>
              {rows.map((r) => (
                <tr key={r.kode}>
                  <td className="px-3 py-2.5">
                    <strong>{r.kode}</strong>
                  </td>
                  <td className="px-3 py-2.5">{r.nama}</td>
                  <td className="px-3 py-2.5">{r.no_rek ?? "-"}</td>
                  <td className="num px-3 py-2.5">{rupiah(r.saldo_akhir)}</td>
                </tr>
              ))}
            </TableShell>
            <div className="mt-3 flex justify-end rounded-xl bg-slate-50 px-4 py-3 text-sm">
              TOTAL&nbsp;<strong className="num">{rupiah(total)}</strong>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
