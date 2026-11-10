"use client";

import { useState } from "react";
import { PageHeader, Card, Btn, Field, inputCls, EmptyState, Skeleton, TableShell } from "../components/ui";
import ExportButtons from "../components/ExportButtons";
import RoleGuard from "../components/RoleGuard";
import { rupiah } from "@/lib/format";
import { useToast } from "../components/Toast";

type BBPRow = { tanggal: string; no_bukti: string; keterangan: string; kode_akun: string; debet: number; kredit: number; saldo: number };

function BbPembantuPageInner() {
  const toast = useToast();
  const [kode, setKode] = useState("");
  const [mulai, setMulai] = useState("");
  const [sampai, setSampai] = useState("");
  const [info, setInfo] = useState("");
  const [rows, setRows] = useState<BBPRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function muat() {
    if (!kode.trim()) return toast("Isi kode pembantu dulu.", true);
    setLoading(true);
    setSearched(true);
    try {
      const r = await fetch(`/api/bb-pembantu?kode=${encodeURIComponent(kode.trim().toUpperCase())}&mulai=${encodeURIComponent(mulai)}&sampai=${encodeURIComponent(sampai)}`);
      const data = await r.json();
      if (!data.sukses) return toast(data.pesan, true);
      setInfo(`${data.pembantu.kode} ${data.pembantu.nama} (${data.pembantu.status}) — saldo awal ${rupiah(Number(data.pembantu.saldo_awal))}`);
      setRows(data.rows);
    } catch (e) {
      toast("Gagal: " + (e as Error).message, true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="BB Pembantu" sub="Rincian mutasi + saldo berjalan per nasabah." />
      <Card>
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
          <Field label="Kode nasabah" hint="Hxxx tabungan / Pxxx pinjaman — mis. H2375">
            <input className={inputCls} value={kode} onChange={(e) => setKode(e.target.value.toUpperCase())} placeholder="H2375 / P124" />
          </Field>
          <Field label="Dari">
            <input type="date" className={inputCls} value={mulai} onChange={(e) => setMulai(e.target.value)} />
          </Field>
          <Field label="Sampai">
            <input type="date" className={inputCls} value={sampai} onChange={(e) => setSampai(e.target.value)} />
          </Field>
          <div className="flex flex-wrap items-end gap-2">
            <Btn onClick={muat} disabled={loading}>
              {loading ? "Memuat…" : "Tampilkan"}
            </Btn>
            <Btn variant="secondary" onClick={muat} disabled={loading}>
              ⟳ Refresh
            </Btn>
            <ExportButtons
              href={`/api/ekspor?laporan=bb-pembantu&kode=${encodeURIComponent(kode.trim().toUpperCase())}&mulai=${encodeURIComponent(mulai)}&sampai=${encodeURIComponent(sampai)}`}
              disabled={loading || rows.length === 0}
            />
          </div>
        </div>
        {info && <p className="mb-3 text-sm text-muted">{info}</p>}
        {loading ? (
          <Skeleton />
        ) : !searched ? (
          <EmptyState text="Isi kode nasabah lalu Tampilkan — mis. H2375." />
        ) : rows.length === 0 ? (
          <EmptyState text="Tidak ada mutasi pada rentang ini — coba ubah tanggal atau tekan Refresh." />
        ) : (
          <TableShell head={["Tanggal", "Bukti", "Keterangan", "Akun", "Debet", "Kredit", "Saldo"]}>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="whitespace-nowrap px-3 py-2.5">{r.tanggal}</td>
                <td className="px-3 py-2.5">{r.no_bukti}</td>
                <td className="px-3 py-2.5">{r.keterangan}</td>
                <td className="px-3 py-2.5">{r.kode_akun}</td>
                <td className="num px-3 py-2.5">{Number(r.debet) > 0 ? rupiah(r.debet) : "-"}</td>
                <td className="num px-3 py-2.5">{Number(r.kredit) > 0 ? rupiah(r.kredit) : "-"}</td>
                <td className="num px-3 py-2.5 font-semibold">{rupiah(r.saldo)}</td>
              </tr>
            ))}
          </TableShell>
        )}
      </Card>
    </div>
  );
}

export default function BbPembantuPage() {
  return (
    <RoleGuard allow={["teller", "admin"]}>
      <BbPembantuPageInner />
    </RoleGuard>
  );
}
