"use client";

import { useEffect, useState } from "react";
import { PageHeader, Card, Btn, Field, inputCls, Badge, EmptyState, Skeleton, TableShell } from "../components/ui";
import RoleGuard from "../components/RoleGuard";
import { rupiah } from "@/lib/format";
import { useToast } from "../components/Toast";

type Piutang = { id: number; kode_bantu: string; nama: string; plafon: number; total_harus_dibayar: number; sisa: number; tenor: number; status: string; lunas_ke: number; total_angsuran: number };

function PinjamanPageInner() {
  const toast = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [tanggal, setTanggal] = useState(today);
  const [kode, setKode] = useState("");
  const [plafon, setPlafon] = useState("");
  const [bunga, setBunga] = useState("1");
  const [tenor, setTenor] = useState("10");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("berjalan");
  const [daftar, setDaftar] = useState<Piutang[]>([]);
  const [loading, setLoading] = useState(true);

  const plafonNum = parseFloat(plafon) || 0;
  const bungaNum = parseFloat(bunga) || 0;
  const estimasi = plafonNum + (plafonNum * bungaNum) / 100;

  async function muat(f = filter) {
    setLoading(true);
    try {
      const r = await fetch(`/api/piutang?status=${encodeURIComponent(f)}`);
      const data = await r.json();
      if (!data.sukses) {
        toast(data.pesan, true);
        return;
      }
      setDaftar(data.data);
    } catch (e) {
      toast("Gagal muat piutang: " + (e as Error).message, true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      await muat();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cairkan() {
    const body = { tanggal, kode_bantu: kode.trim().toUpperCase(), plafon: plafonNum, bunga: bungaNum, tenor: parseInt(tenor, 10) || 0 };
    if (!body.tanggal || !body.kode_bantu || body.plafon <= 0 || body.tenor < 1)
      return toast("Tanggal, kode Pxxx, plafon > 0, tenor >= 1 wajib diisi.", true);
    setBusy(true);
    try {
      const r = await fetch("/api/pinjaman-cair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!data.sukses) return toast(data.pesan, true);
      toast(`Cair! ID piutang #${data.id_piutang}, jurnal #${data.id_jurnal}, total ${rupiah(data.total)}`);
      setKode("");
      setPlafon("");
      muat();
    } catch (e) {
      toast("Gagal: " + (e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Pencairan Pinjaman" sub="Cairkan ke rekening Pxxx — jadwal angsuran dibuat otomatis." />
      <Card>
        <div className="space-y-3">
          <Field label="Tanggal Cair">
            <input type="date" className={inputCls} value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
          </Field>
          <Field label="Kode nasabah pinjaman" hint="Awalan P, mis. P124">
            <input className={inputCls} value={kode} onChange={(e) => setKode(e.target.value.toUpperCase())} placeholder="P124" />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Plafon (Rp)">
              <input className={inputCls} type="number" min={1} value={plafon} onChange={(e) => setPlafon(e.target.value)} />
            </Field>
            <Field label="Bunga (%)">
              <input className={inputCls} type="number" min={0} value={bunga} onChange={(e) => setBunga(e.target.value)} />
            </Field>
            <Field label="Tenor (bln)">
              <input className={inputCls} type="number" min={1} value={tenor} onChange={(e) => setTenor(e.target.value)} />
            </Field>
          </div>
          <p className="text-sm text-muted">
            Estimasi total kembali: <strong className="num text-ink">{rupiah(estimasi)}</strong>
            {parseInt(tenor, 10) > 0 && (
              <> • cicilan per bulan <strong className="num text-ink">{rupiah(estimasi / (parseInt(tenor, 10) || 1))}</strong></>
            )}
          </p>
          <Btn onClick={cairkan} disabled={busy}>
            {busy ? "Memproses..." : "Cairkan Pinjaman"}
          </Btn>
        </div>
      </Card>
      <Card className="mt-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-ink">Daftar Piutang</h3>
          <div className="flex gap-2">
            <select
              className={`${inputCls} w-40`}
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                muat(e.target.value);
              }}
            >
              <option value="berjalan">Berjalan</option>
              <option value="lunas">Lunas</option>
              <option value="semua">Semua</option>
            </select>
            <Btn variant="secondary" onClick={() => muat()} disabled={loading}>
              {loading ? "Memuat…" : "⟳ Refresh"}
            </Btn>
          </div>
        </div>
        {loading ? (
          <Skeleton />
        ) : daftar.length === 0 ? (
          <EmptyState text="Tidak ada piutang pada filter ini — coba filter lain atau tekan Refresh." />
        ) : (
          <TableShell head={["ID", "Nasabah", "Plafon", "Sisa", "Progres", "Status"]}>
            {daftar.map((d) => (
              <tr key={d.id}>
                <td className="px-3 py-2.5 font-bold">#{d.id}</td>
                <td className="px-3 py-2.5">
                  <strong>{d.kode_bantu}</strong> {d.nama}
                </td>
                <td className="num px-3 py-2.5">{rupiah(d.plafon)}</td>
                <td className="num px-3 py-2.5 font-semibold">{rupiah(d.sisa)}</td>
                <td className="px-3 py-2.5 text-xs">
                  {d.lunas_ke}/{d.total_angsuran} lunas
                </td>
                <td className="px-3 py-2.5">
                  <Badge value={d.status} />
                </td>
              </tr>
            ))}
          </TableShell>
        )}
      </Card>
    </div>
  );
}

export default function PinjamanPage() {
  return (
    <RoleGuard allow={["teller", "admin"]}>
      <PinjamanPageInner />
    </RoleGuard>
  );
}
