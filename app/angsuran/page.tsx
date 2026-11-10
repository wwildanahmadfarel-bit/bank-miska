"use client";

import { useEffect, useState } from "react";
import { PageHeader, Card, Btn, Field, inputCls } from "../components/ui";
import ConfirmButton from "../components/ConfirmButton";
import RoleGuard from "../components/RoleGuard";
import { rupiah } from "@/lib/format";
import { useToast } from "../components/Toast";

type Piutang = { id: number; kode_bantu: string; nama: string; sisa: number; tenor: number; status: string; lunas_ke: number; total_angsuran: number };

function AngsuranPageInner() {
  const toast = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [tanggal, setTanggal] = useState(today);
  const [daftar, setDaftar] = useState<Piutang[]>([]);
  const [id, setId] = useState("");
  const [bayar, setBayar] = useState("");
  const [busy, setBusy] = useState(false);
  const [hasil, setHasil] = useState("");
  const [memuat, setMemuat] = useState(true);

  const pilih = daftar.find((d) => String(d.id) === id);

  async function muat() {
    setMemuat(true);
    try {
      const r = await fetch("/api/piutang?status=berjalan");
      const data = await r.json();
      if (!data.sukses) return toast(data.pesan, true);
      setDaftar(data.data);
      if (data.data.length > 0 && !id) {
        setId(String(data.data[0].id));
        setBayar(String(data.data[0].sisa));
      }
    } catch (e) {
      toast("Gagal muat piutang: " + (e as Error).message, true);
    } finally {
      setMemuat(false);
    }
  }

  useEffect(() => {
    (async () => {
      await muat();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function bayarAngsuran() {
    const body = { tanggal, id_piutang: parseInt(id, 10) || 0, bayar: parseFloat(bayar) || 0 };
    if (!body.tanggal || body.id_piutang <= 0 || body.bayar <= 0)
      return toast("Tanggal, ID piutang, dan bayar > 0 wajib diisi.", true);
    setBusy(true);
    try {
      const r = await fetch("/api/angsuran-bayar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!data.sukses) return toast(data.pesan, true);
      toast(`Tersimpan. Jurnal #${data.id_jurnal}`);
      setHasil(`Pokok ${rupiah(data.pokok)} — Bunga ${rupiah(data.bunga)} — Sisa ${rupiah(data.sisa)} (${data.status})`);
      setBayar("");
      muat();
    } catch (e) {
      toast("Gagal: " + (e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Bayar Angsuran" sub="Catat pembayaran cicilan — sisa otomatis berkurang." />
      <Card>
        <div className="space-y-3">
          <Field label="Tanggal Bayar">
            <input type="date" className={inputCls} value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
          </Field>
          <Field label="Pilih pinjaman" hint="Sisa otomatis terisi — boleh diubah bila bayar sebagian">
            <select
              className={inputCls}
              value={id}
              disabled={memuat}
              onChange={(e) => {
                setId(e.target.value);
                const p = daftar.find((d) => String(d.id) === e.target.value);
                if (p) setBayar(String(p.sisa));
              }}
            >
              <option value="">{memuat ? "Memuat daftar…" : "— pilih pinjaman —"}</option>
              {daftar.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.kode_bantu} {d.nama} • sisa {rupiah(d.sisa)} ({d.lunas_ke}/{d.total_angsuran})
                </option>
              ))}
            </select>
          </Field>
          {!memuat && daftar.length === 0 && (
            <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-muted">
              Tidak ada pinjaman berjalan — cairkan dulu di halaman Pinjaman.
            </p>
          )}
          {pilih && (
            <p className="text-xs text-muted">
              Cicilan ke-{pilih.lunas_ke + 1} dari {pilih.total_angsuran} • tenor {pilih.tenor} bln
            </p>
          )}
          <Field label="Jumlah bayar (Rp)">
            <input className={inputCls} type="number" min={1} value={bayar} onChange={(e) => setBayar(e.target.value)} placeholder="808000" />
          </Field>
          {pilih && bayar && Number(bayar) >= pilih.sisa ? (
            <ConfirmButton
              title="Lunasi pinjaman?"
              body={`${pilih.kode_bantu} ${pilih.nama} — bayar ${rupiah(Number(bayar))} akan melunasi pinjaman ini. Lanjutkan?`}
              confirmLabel="Ya, lunasi"
              variant="primary"
              onConfirm={bayarAngsuran}
              disabled={busy}
            >
              {busy ? "Memproses..." : "Simpan Pembayaran"}
            </ConfirmButton>
          ) : (
            <Btn onClick={bayarAngsuran} disabled={busy}>
              {busy ? "Memproses..." : "Simpan Pembayaran"}
            </Btn>
          )}
          {hasil && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{hasil}</div>}
        </div>
      </Card>
    </div>
  );
}

export default function AngsuranPage() {
  return (
    <RoleGuard allow={["teller", "admin"]}>
      <AngsuranPageInner />
    </RoleGuard>
  );
}
