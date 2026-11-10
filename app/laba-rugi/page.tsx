"use client";

import { useState } from "react";
import { PageHeader, Card, Btn, Field, inputCls, EmptyState, Skeleton, TableShell, StatCard } from "../components/ui";
import ExportButtons from "../components/ExportButtons";
import RoleGuard from "../components/RoleGuard";
import { rupiah } from "@/lib/format";
import { useToast } from "../components/Toast";

type LRRow = { kode_akun: string; nama: string; saldo: number };

function LabaRugiPageInner() {
  const toast = useToast();
  const [bulan, setBulan] = useState("");
  const [rows, setRows] = useState<LRRow[]>([]);
  const [pend, setPend] = useState(0);
  const [biaya, setBiaya] = useState(0);
  const [laba, setLaba] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function muat() {
    if (!/^\d{4}-\d{2}$/.test(bulan)) return toast("Bulan harus format YYYY-MM.", true);
    setLoading(true);
    setSearched(true);
    try {
      const r = await fetch(`/api/laba-rugi?bulan=${encodeURIComponent(bulan)}`);
      const data = await r.json();
      if (!data.sukses) return toast(data.pesan, true);
      setRows(data.rows);
      setPend(data.pendapatan);
      setBiaya(data.biaya);
      setLaba(data.laba);
    } catch (e) {
      toast("Gagal: " + (e as Error).message, true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Laba Rugi" sub="Pendapatan vs biaya — laba bersih per bulan." />
      <Card>
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
          <Field label="Bulan">
            <input type="month" className={inputCls} value={bulan} onChange={(e) => setBulan(e.target.value)} />
          </Field>
          <div className="flex items-end">
            <Btn onClick={muat} disabled={loading}>
              {loading ? "Memuat…" : "Tampilkan"}
            </Btn>
          </div>
          <div className="flex items-end">
            <Btn variant="secondary" onClick={muat} disabled={loading}>
              ⟳ Refresh
            </Btn>
          </div>
          <div className="flex items-end">
            <ExportButtons
              href={`/api/ekspor?laporan=laba-rugi&bulan=${encodeURIComponent(bulan)}`}
              disabled={loading || rows.length === 0}
            />
          </div>
        </div>
        <p className="mb-4 text-xs text-muted">
          Periode yang sudah ditutup bersifat arsip (read-only) — angka per bulan murni dan tidak berubah oleh
          transaksi bulan berikutnya. Unduh via CSV / Excel di atas.
        </p>
        {loading ? (
          <Skeleton />
        ) : !searched ? (
          <EmptyState text="Pilih bulan lalu Tampilkan." />
        ) : rows.length === 0 ? (
          <EmptyState text="Tidak ada data bulan ini — coba bulan lain atau tekan Refresh." />
        ) : (
          <>
            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatCard label="Pendapatan" value={rupiah(pend)} accent="bg-emerald-500" />
              <StatCard label="Biaya" value={rupiah(biaya)} accent="bg-red-500" />
              <StatCard label={laba >= 0 ? "Laba bersih" : "Rugi bersih"} value={rupiah(laba)} accent={laba >= 0 ? "bg-brand-500" : "bg-red-500"} />
            </div>
            <TableShell head={["Kode", "Nama", "Saldo"]}>
              {rows.map((r) => (
                <tr key={r.kode_akun}>
                  <td className="px-3 py-2.5">
                    <strong>{r.kode_akun}</strong>
                  </td>
                  <td className="px-3 py-2.5">{r.nama}</td>
                  <td className="num px-3 py-2.5">{rupiah(r.saldo)}</td>
                </tr>
              ))}
            </TableShell>
          </>
        )}
      </Card>
    </div>
  );
}

export default function LabaRugiPage() {
  return (
    <RoleGuard allow={["teller", "admin"]}>
      <LabaRugiPageInner />
    </RoleGuard>
  );
}
