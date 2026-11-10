"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { PageHeader, Card, Btn, Field, inputCls } from "../components/ui";
import RoleGuard from "../components/RoleGuard";
import { rupiah } from "@/lib/format";
import { useToast } from "../components/Toast";

type Merchant = { id: number; kode: string; nama: string };
type Qr = { kode_qr: string; payload: string; kedaluwarsa: string; nominal: number };

function MerchantPageInner() {
  const toast = useToast();
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [idMerchant, setIdMerchant] = useState("");
  const [nominal, setNominal] = useState("");
  const [qr, setQr] = useState<Qr | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [mKode, setMKode] = useState("");
  const [mNama, setMNama] = useState("");
  const [mBusy, setMBusy] = useState(false);

  async function muatMerchant() {
    try {
      const r = await fetch("/api/merchant");
      const data = await r.json();
      if (!data.sukses) {
        toast(data.pesan, true);
        return;
      }
      setMerchants(data.data);
      if (data.data.length > 0) setIdMerchant(String(data.data[0].id));
    } catch (e) {
      toast("Gagal muat merchant: " + (e as Error).message, true);
    }
  }

  useEffect(() => {
    (async () => {
      await muatMerchant();
      try {
        const m = await fetch("/api/me").then((r) => r.json());
        if (m.sukses && m.user.role === "admin") setIsAdmin(true);
      } catch {
        /* abaikan */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Polling status QR tiap 2 detik
  useEffect(() => {
    if (!qr) return;
    const t = setInterval(async () => {
      try {
        const r = await fetch(`/api/bayar-status?kode_qr=${encodeURIComponent(qr.kode_qr)}`);
        const data = await r.json();
        if (!data.sukses) return;
        setStatus(String(data.data.status));
        if (data.data.status === "lunas") {
          clearInterval(t);
          toast(`Lunas ${rupiah(qr.nominal)} — ${data.data.merchant}`);
        }
        if (data.data.status === "kedaluwarsa") clearInterval(t);
      } catch {
        /* abaikan */
      }
    }, 2000);
    return () => clearInterval(t);
  }, [qr, toast]);

  async function buatQr() {
    const nom = parseFloat(nominal) || 0;
    if (!idMerchant || nom <= 0) return toast("Pilih merchant dan nominal > 0.", true);
    setBusy(true);
    try {
      const r = await fetch("/api/qr-buat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_merchant: Number(idMerchant), nominal: nom }),
      });
      const data = await r.json();
      if (!data.sukses) return toast(data.pesan, true);
      setQr(data);
      setStatus("menunggu");
      setNominal("");
    } catch (e) {
      toast("Gagal: " + (e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  async function tambahMerchant() {
    if (!mKode.trim() || !mNama.trim()) return toast("Kode dan nama merchant wajib diisi.", true);
    setMBusy(true);
    try {
      const r = await fetch("/api/merchant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kode: mKode.trim(), nama: mNama.trim() }),
      });
      const data = await r.json();
      if (!data.sukses) return toast(data.pesan, true);
      toast("Merchant tersimpan: " + data.kode);
      setMKode("");
      setMNama("");
      muatMerchant();
    } catch (e) {
      toast("Gagal: " + (e as Error).message, true);
    } finally {
      setMBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Merchant Kantin" sub="Buat QR per transaksi (berlaku 5 menit). Pembeli tap kartu / scan di halaman Bayar." />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <h3 className="font-semibold text-ink">Buat QR Bayar</h3>
          <div className="mt-3 space-y-3">
            <Field label="Merchant">
              <select className={inputCls} value={idMerchant} onChange={(e) => setIdMerchant(e.target.value)}>
                {merchants.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nama} ({m.kode})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Nominal (Rp)">
              <input className={inputCls} type="number" min={1} value={nominal} onChange={(e) => setNominal(e.target.value)} placeholder="15000" />
            </Field>
            <Btn onClick={buatQr} disabled={busy}>
              {busy ? "Membuat..." : "Buat QR"}
            </Btn>
          </div>
        </Card>
        <Card>
          <h3 className="font-semibold text-ink">QR Transaksi</h3>
          {!qr ? (
            <p className="mt-3 text-sm text-muted">Belum ada QR. Isi merchant + nominal lalu klik Buat QR.</p>
          ) : (
            <div className="mt-3 flex flex-col items-center gap-2">
              <QRCodeSVG value={qr.payload} size={220} />
              <div className="num text-sm font-bold">{qr.kode_qr}</div>
              <div className="text-sm">
                {rupiah(qr.nominal)} • status: <strong>{status || "menunggu"}</strong>
              </div>
              <p className="text-xs text-muted">Berlaku 5 menit — status diperbarui otomatis tiap 2 detik.</p>
              <details className="w-full text-center">
                <summary className="cursor-pointer text-xs font-semibold text-brand-600">Detail teknis QR</summary>
                <div className="mt-1 break-all text-center text-xs text-muted">{qr.payload}</div>
              </details>
            </div>
          )}
        </Card>
      </div>
      {isAdmin && (
        <Card className="mt-5">
          <h3 className="font-semibold text-ink">Tambah Merchant (admin)</h3>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_2fr_auto]">
            <Field label="Kode (mis. KNTN-03)">
              <input className={inputCls} value={mKode} onChange={(e) => setMKode(e.target.value.toUpperCase())} placeholder="KNTN-03" />
            </Field>
            <Field label="Nama">
              <input className={inputCls} value={mNama} onChange={(e) => setMNama(e.target.value)} placeholder="Kantin 3" />
            </Field>
            <div className="flex items-end">
              <Btn onClick={tambahMerchant} disabled={mBusy}>
                {mBusy ? "Menyimpan..." : "Simpan"}
              </Btn>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

export default function MerchantPage() {
  return (
    <RoleGuard allow={["teller", "admin"]}>
      <MerchantPageInner />
    </RoleGuard>
  );
}
