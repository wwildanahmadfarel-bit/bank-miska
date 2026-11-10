"use client";

import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { PageHeader, Card, Btn, Field, inputCls } from "../components/ui";
import RoleGuard from "../components/RoleGuard";
import { rupiah } from "@/lib/format";
import { useToast } from "../components/Toast";

type Merchant = { id: number; kode: string; nama: string };
type Qr = { kode_qr: string; payload: string; kedaluwarsa: string; nominal: number };
type Preview = { kode: string; nama: string; status: string; saldo_akhir: number } | null;

/** Sisa detik menuju waktu kedaluwarsa "YYYY-MM-DD HH:mm:ss". */
function sisaDetik(kedaluwarsa: string, sekarang: number): number {
  const t = new Date(kedaluwarsa.replace(" ", "T")).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((t - sekarang) / 1000));
}

function fmtSisa(detik: number): string {
  const m = Math.floor(detik / 60);
  const s = detik % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function BayarPageInner() {
  const toast = useToast();

  // ---- Panel 1: Biaya & QR (pemilik kantin) ----
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [idMerchant, setIdMerchant] = useState("");
  const [nominal, setNominal] = useState("");
  const [qr, setQr] = useState<Qr | null>(null);
  const [statusQr, setStatusQr] = useState("");
  const [busyQr, setBusyQr] = useState(false);
  const [sekarang, setSekarang] = useState(() => Date.now());

  // ---- Panel 2: Tap / Scan & Bayar (pembeli) ----
  const scanRef = useRef<HTMLInputElement>(null);
  const [scan, setScan] = useState("");
  const [kodeQr, setKodeQr] = useState("");
  const [uid, setUid] = useState("");
  const [kode, setKode] = useState("");
  const [preview, setPreview] = useState<Preview>(null);
  const [busy, setBusy] = useState(false);

  function fokus() {
    setTimeout(() => scanRef.current?.focus(), 50);
  }

  /** Reset transaksi untuk pembeli berikutnya (kasir antrean). */
  function resetTransaksi() {
    setQr(null);
    setStatusQr("");
    setNominal("");
    setKodeQr("");
    setUid("");
    setKode("");
    setPreview(null);
    setScan("");
    fokus();
  }

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/merchant");
        const data = await r.json();
        if (!data.sukses) return;
        setMerchants(data.data);
        if (data.data.length > 0) setIdMerchant(String(data.data[0].id));
      } catch {
        /* abaikan — dropdown merchant tetap tampil kosong */
      }
    })();
    fokus();
  }, []);

  // Detik countdown QR.
  useEffect(() => {
    if (!qr) return;
    const t = setInterval(() => setSekarang(Date.now()), 1000);
    return () => clearInterval(t);
  }, [qr]);

  // Polling status QR tiap 2 detik; lunas/kedaluwarsa → auto-reset.
  useEffect(() => {
    if (!qr) return;
    let aktif = true;
    const t = setInterval(async () => {
      try {
        const r = await fetch(`/api/bayar-status?kode_qr=${encodeURIComponent(qr.kode_qr)}`);
        const data = await r.json();
        if (!aktif || !data.sukses) return;
        const st = String(data.data.status);
        setStatusQr(st);
        if (st === "lunas") {
          clearInterval(t);
          toast(`Lunas ${rupiah(qr.nominal)} — siap pembeli berikutnya`);
          resetTransaksi();
        } else if (st === "kedaluwarsa") {
          clearInterval(t);
          toast("QR kedaluwarsa — buat QR baru", true);
          resetTransaksi();
        }
      } catch {
        /* abaikan — coba lagi interval berikut */
      }
    }, 2000);
    return () => {
      aktif = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qr]);

  async function buatQr() {
    const nom = parseFloat(nominal) || 0;
    if (!idMerchant || nom <= 0) return toast("Pilih merchant dan nominal > 0.", true);
    setBusyQr(true);
    try {
      const r = await fetch("/api/qr-buat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_merchant: Number(idMerchant), nominal: nom }),
      });
      const data = await r.json();
      if (!data.sukses) return toast(data.pesan, true);
      setQr(data);
      setStatusQr("menunggu");
      setKodeQr(String(data.kode_qr)); // langsung terisi ke panel bayar
      setUid("");
      setKode("");
      setPreview(null);
      fokus();
    } catch (e) {
      toast("Gagal: " + (e as Error).message, true);
    } finally {
      setBusyQr(false);
    }
  }

  /** USB wedge: tempelan kartu (UID) atau scan QR (MISKA:...) masuk ke satu kolom. */
  function onScanEnter(e: React.KeyboardEvent) {
    if (e.key !== "Enter") return;
    const v = scan.trim();
    if (!v) return;
    if (v.toUpperCase().startsWith("MISKA:")) {
      const part = v.split(":");
      if (part[1]) {
        setKodeQr(part[1].toUpperCase());
        toast("QR terbaca: " + part[1].toUpperCase());
      }
    } else if (/^[A-Z0-9]{4,}$/i.test(v) && !kodeQr) {
      // heuristik: UID kartu langsung tanpa QR — isi UID
      setUid(v);
      lookupUid(v);
    } else {
      setUid(v);
      lookupUid(v);
    }
    setScan("");
    fokus();
  }

  async function lookupUid(u: string) {
    const v = (u || uid).trim();
    if (!v) return;
    try {
      const r = await fetch(`/api/pembantu-by-uid?uid=${encodeURIComponent(v)}`);
      const data = await r.json();
      if (!data.sukses) {
        setPreview(null);
        return toast(data.pesan, true);
      }
      setPreview(data.data);
      setKode(String(data.data.kode));
    } catch (e) {
      toast("Gagal lookup: " + (e as Error).message, true);
    }
  }

  async function bayar() {
    if (!kodeQr.trim()) return toast("Buat QR dulu di panel 1 (atau scan QR).", true);
    if (!uid.trim() && !kode.trim()) return toast("Tempel kartu atau isi kode Hxxx.", true);
    if (preview && qr && qr.nominal > Number(preview.saldo_akhir)) {
      return toast(`Saldo tidak cukup (butuh ${rupiah(qr.nominal)}, ada ${rupiah(preview.saldo_akhir)}).`, true);
    }
    setBusy(true);
    try {
      const r = await fetch("/api/bayar-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kode_qr: kodeQr.trim().toUpperCase(),
          uid_kartu: uid.trim() || undefined,
          kode_bantu: uid.trim() ? undefined : kode.trim().toUpperCase(),
        }),
      });
      const data = await r.json();
      if (!data.sukses) return toast(data.pesan, true);
      toast(`Lunas! Jurnal #${data.id_jurnal} — ${data.merchant}, sisa ${rupiah(data.sisa ?? 0)}`);
      resetTransaksi();
    } catch (e) {
      toast("Gagal: " + (e as Error).message, true);
    } finally {
      setBusy(false);
      fokus();
    }
  }

  const detik = qr ? sisaDetik(qr.kedaluwarsa, sekarang) : 0;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Kasir Kantin" sub="1 halaman: input biaya + buat QR, lalu tap kartu / scan barcode pembeli, bayar." />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <h3 className="font-semibold text-ink">1. Biaya &amp; QR</h3>
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
            <Field label="Biaya yang harus dibayar (Rp)">
              <input
                className={inputCls}
                type="number"
                min={1}
                value={nominal}
                onChange={(e) => setNominal(e.target.value)}
                placeholder="15000"
              />
            </Field>
            <Btn onClick={buatQr} disabled={busyQr}>
              {busyQr ? "Membuat..." : "Buat QR"}
            </Btn>
            {qr && (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <QRCodeSVG value={qr.payload} size={200} />
                <div className="num text-sm font-bold">{qr.kode_qr}</div>
                <div className="text-sm">
                  {rupiah(qr.nominal)} • status: <strong>{statusQr || "menunggu"}</strong>
                </div>
                <div className={`num text-sm font-bold ${detik <= 60 ? "text-red-600" : "text-ink"}`}>
                  Berlaku {fmtSisa(detik)}
                </div>
                <details className="w-full text-center">
                  <summary className="cursor-pointer text-xs font-semibold text-brand-600">Detail teknis QR</summary>
                  <div className="mt-1 break-all text-center text-xs text-muted">{qr.payload}</div>
                </details>
              </div>
            )}
          </div>
        </Card>
        <Card>
          <h3 className="font-semibold text-ink">2. Tap / Scan &amp; Bayar</h3>
          <div className="mt-3 space-y-3">
            <Field label="Kolom scan cepat" hint="Tempel kartu atau scan barcode di sini lalu Enter — otomatis terisi ke bawah">
              <input
                ref={scanRef}
                className={inputCls}
                value={scan}
                onChange={(e) => setScan(e.target.value)}
                onKeyDown={onScanEnter}
                placeholder="Tempel kartu / scan barcode…"
                autoFocus
              />
            </Field>
            <Field label="Identitas pembeli (isi salah satu)" hint="Tempel kartu mengisi otomatis, atau ketik kode Hxxx bila kartu tertinggal">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  className={inputCls}
                  value={uid}
                  onChange={(e) => setUid(e.target.value)}
                  onBlur={() => uid.trim() && lookupUid(uid)}
                  placeholder="UID kartu (otomatis)"
                  aria-label="UID kartu"
                />
                <input className={inputCls} value={kode} onChange={(e) => setKode(e.target.value.toUpperCase())} placeholder="Kode Hxxx manual" aria-label="Kode nasabah manual" />
              </div>
            </Field>
            <Field label="Kode QR belanja" hint="Terisi otomatis dari QR yang baru dibuat">
              <input className={inputCls} value={kodeQr} onChange={(e) => setKodeQr(e.target.value.toUpperCase())} placeholder="A9F3…" />
            </Field>
            {preview && (
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <strong>{preview.kode}</strong> — {preview.nama} • {preview.status} • saldo{" "}
                <strong className="num">{rupiah(preview.saldo_akhir)}</strong>
              </div>
            )}
            <Btn onClick={bayar} disabled={busy}>
              {busy ? "Memproses..." : "Bayar Sekarang"}
            </Btn>
          </div>
        </Card>
      </div>
      <Card className="mt-5">
        <p className="text-sm text-muted">
          <strong className="text-ink">Alur cepat:</strong> input biaya → Buat QR → pembeli tap kartu
          <em> atau </em> scan barcode → Bayar → otomatis reset untuk antrean berikutnya.
          Satu QR hanya berlaku 5 menit dan tidak bisa dipakai 2x.
        </p>
      </Card>
    </div>
  );
}

export default function BayarPage() {
  return (
    <RoleGuard allow={["teller", "admin"]}>
      <BayarPageInner />
    </RoleGuard>
  );
}
