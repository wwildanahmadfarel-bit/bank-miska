"use client";

import { useEffect, useState } from "react";
import { PageHeader, Card, Btn, Field, inputCls, EmptyState, Skeleton, TableShell } from "../components/ui";
import ExportButtons from "../components/ExportButtons";
import RoleGuard from "../components/RoleGuard";
import { rupiah } from "@/lib/format";
import { useToast } from "../components/Toast";

type BBRow = { tanggal: string; no_bukti: string; keterangan: string; debet: number; kredit: number; saldo: number };

function BukuBesarPageInner() {
  const toast = useToast();
  const [coas, setCoas] = useState<{ kode_akun: string; nama: string; pos_saldo: string }[]>([]);
  const [kode, setKode] = useState("1-110");
  const [mulai, setMulai] = useState("");
  const [sampai, setSampai] = useState("");
  const [info, setInfo] = useState("");
  const [rows, setRows] = useState<BBRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/coa")
      .then((r) => r.json())
      .then((d) => d.sukses && setCoas(d.data.filter((x: { pos_saldo: string }) => x.pos_saldo !== "-")))
      .catch(() => {});
  }, []);

  // Muat otomatis Kas 1-110 saat pertama dibuka agar teller langsung melihat angka.
  useEffect(() => {
    muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function muat() {
    if (!kode) return toast("Pilih kode akun dulu.", true);
    setLoading(true);
    try {
      const r = await fetch(`/api/buku-besar?kode=${encodeURIComponent(kode)}&mulai=${encodeURIComponent(mulai)}&sampai=${encodeURIComponent(sampai)}`);
      const data = await r.json();
      if (!data.sukses) return toast(data.pesan, true);
      setInfo(`${data.kode} ${data.nama} (Pos ${data.pos_saldo}) — ${data.rows.length} baris.`);
      setRows(data.rows);
    } catch (e) {
      toast("Gagal: " + (e as Error).message, true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Buku Besar" sub="Mutasi + saldo berjalan per akun." />
      <Card>
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
          <Field label="Kode Akun">
            <select className={inputCls} value={kode} onChange={(e) => setKode(e.target.value)}>
              <option value="">-- pilih --</option>
              {coas.map((c) => (
                <option key={c.kode_akun} value={c.kode_akun}>
                  {c.kode_akun} — {c.nama}
                </option>
              ))}
            </select>
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
              href={`/api/ekspor?laporan=buku-besar&kode=${encodeURIComponent(kode)}&mulai=${encodeURIComponent(mulai)}&sampai=${encodeURIComponent(sampai)}`}
              disabled={loading || rows.length === 0}
            />
          </div>
        </div>
        {info && <p className="mb-3 text-sm text-muted">{info}</p>}
        {loading ? (
          <Skeleton />
        ) : rows.length === 0 ? (
          <EmptyState text="Pilih akun lalu Tampilkan." />
        ) : (
          <TableShell head={["Tanggal", "Bukti", "Keterangan", "Debet", "Kredit", "Saldo"]}>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="whitespace-nowrap px-3 py-2.5">{r.tanggal}</td>
                <td className="px-3 py-2.5">{r.no_bukti}</td>
                <td className="px-3 py-2.5">{r.keterangan}</td>
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

export default function BukuBesarPage() {
  return (
    <RoleGuard allow={["teller", "admin"]}>
      <BukuBesarPageInner />
    </RoleGuard>
  );
}
