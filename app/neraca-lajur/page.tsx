"use client";

import { useState } from "react";
import { PageHeader, Card, Btn, Field, inputCls, Badge, EmptyState, Skeleton, TableShell } from "../components/ui";
import { rupiah } from "@/lib/format";
import ExportButtons from "../components/ExportButtons";
import RoleGuard from "../components/RoleGuard";
import { useToast } from "../components/Toast";

type NLRow = { kode_akun: string; nama: string; pos_saldo: string; ns_debet: number; ns_kredit: number };

function NeracaLajurPageInner() {
  const toast = useToast();
  const [bulan, setBulan] = useState("");
  const [rows, setRows] = useState<NLRow[]>([]);
  const [tD, setTD] = useState(0);
  const [tK, setTK] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function muat() {
    if (!/^\d{4}-\d{2}$/.test(bulan)) return toast("Bulan harus format YYYY-MM.", true);
    setLoading(true);
    setSearched(true);
    try {
      const r = await fetch(`/api/neraca-lajur?bulan=${encodeURIComponent(bulan)}`);
      const data = await r.json();
      if (!data.sukses) return toast(data.pesan, true);
      setRows(data.rows);
      setTD(data.total_ns_debet);
      setTK(data.total_ns_kredit);
    } catch (e) {
      toast("Gagal: " + (e as Error).message, true);
    } finally {
      setLoading(false);
    }
  }

  const balance = Math.abs(tD - tK) < 0.01;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Neraca Lajur" sub="Cek keseimbangan debet = kredit per bulan." />
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
              href={`/api/ekspor?laporan=neraca-lajur&bulan=${encodeURIComponent(bulan)}`}
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
            <TableShell head={["Kode", "Nama", "Pos", "NS Debet", "NS Kredit"]}>
              {rows.map((r) => (
                <tr key={r.kode_akun}>
                  <td className="px-3 py-2.5">
                    <strong>{r.kode_akun}</strong>
                  </td>
                  <td className="px-3 py-2.5">{r.nama}</td>
                  <td className="px-3 py-2.5">
                    <Badge value={r.pos_saldo} />
                  </td>
                  <td className="num px-3 py-2.5">{Number(r.ns_debet) > 0 ? rupiah(r.ns_debet) : "-"}</td>
                  <td className="num px-3 py-2.5">{Number(r.ns_kredit) > 0 ? rupiah(r.ns_kredit) : "-"}</td>
                </tr>
              ))}
            </TableShell>
            <div className={`mt-3 rounded-xl px-4 py-3 text-sm font-semibold ${balance ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
              TOTAL Debet {rupiah(tD)} = Kredit {rupiah(tK)}
              {balance ? " — BALANCE ✓" : " — TIDAK BALANCE!"}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

export default function NeracaLajurPage() {
  return (
    <RoleGuard allow={["teller", "admin"]}>
      <NeracaLajurPageInner />
    </RoleGuard>
  );
}
