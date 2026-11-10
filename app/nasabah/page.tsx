"use client";

import { useEffect, useState } from "react";
import { PageHeader, Card, Badge, Btn, EmptyState, Skeleton, TableShell, Field, inputCls } from "../components/ui";
import ConfirmButton from "../components/ConfirmButton";
import { rupiah } from "@/lib/format";
import RoleGuard from "../components/RoleGuard";
import { useToast } from "../components/Toast";

type Pembantu = { kode: string; nama: string; no_rek: string | null; status: string; saldo_akhir: number; uid_kartu: string | null };

function NasabahPageInner() {
  const toast = useToast();
  const [rows, setRows] = useState<Pembantu[]>([]);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ kode: "", nama: "", status: "TABUNGAN", no_rek: "", saldo_awal: "0", uid_kartu: "" });
  const [tapUid, setTapUid] = useState("");
  const [tapKode, setTapKode] = useState("");
  const [tapBusy, setTapBusy] = useState(false);

  // Tap kartu di kolom UID form: isi otomatis + peringatan bila dipakai orang lain
  async function tapForm(uidMentah: string) {
    const uid = uidMentah.trim();
    if (!uid) return;
    try {
      const r = await fetch(`/api/pembantu-by-uid?uid=${encodeURIComponent(uid)}`);
      const data = await r.json();
      if (data.sukses) {
        toast(`UID sudah dipakai oleh ${data.data.kode} ${data.data.nama}`, true);
        return;
      }
      setForm((f) => ({ ...f, uid_kartu: uid.toUpperCase() }));
      toast("UID bebas, terisi ke form. Lanjutkan isi Kode + Nama.");
    } catch (e) {
      toast("Gagal lookup: " + (e as Error).message, true);
    } finally {
      setTapUid("");
    }
  }

  // Pasang kartu susulan ke baris yang sudah ada
  async function pasangUid() {
    if (!tapKode.trim() || !tapUid.trim()) return toast("Pilih baris (kode) dan tempel kartu dulu.", true);
    setTapBusy(true);
    try {
      const r = await fetch("/api/pembantu-pasang-uid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kode: tapKode.trim().toUpperCase(), uid_kartu: tapUid.trim() }),
      });
      const data = await r.json();
      if (!data.sukses) return toast(data.pesan, true);
      toast(`Kartu terpasang ke ${data.kode}`);
      setTapUid("");
      setTapKode("");
      muat();
    } catch (e) {
      toast("Gagal: " + (e as Error).message, true);
    } finally {
      setTapBusy(false);
    }
  }

  async function muat(s = status, query = q) {
    setLoading(true);
    try {
      const r = await fetch(`/api/pembantu?status=${encodeURIComponent(s)}&q=${encodeURIComponent(query)}`);
      if (!r.ok) throw new Error("HTTP " + r.status);
      const data = await r.json();
      if (!data.sukses) throw new Error(data.pesan);
      setRows(data.data);
    } catch (e) {
      toast("Gagal memuat: " + (e as Error).message, true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => muat(), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, q]);

  async function lepasUid(kode: string) {
    try {
      const r = await fetch("/api/pembantu-lepas-uid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kode }),
      });
      const data = await r.json();
      if (!data.sukses) return toast(data.pesan, true);
      toast(`Kartu dilepas dari ${kode}`);
      muat();
    } catch (e) {
      toast("Gagal: " + (e as Error).message, true);
    }
  }

  async function tambah(e: React.FormEvent) {
    e.preventDefault();
    if (!form.kode.trim() || !form.nama.trim()) return toast("Kode dan Nama wajib diisi.", true);
    setSaving(true);
    try {
      const r = await fetch("/api/pembantu-tambah", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, saldo_awal: parseFloat(form.saldo_awal) || 0 }),
      });
      const data = await r.json();
      if (!data.sukses) return toast(data.pesan, true);
      toast("Tersimpan: " + data.kode);
      setForm({ kode: "", nama: "", status: "TABUNGAN", no_rek: "", saldo_awal: "0", uid_kartu: "" });
      muat();
    } catch (e) {
      toast("Gagal: " + (e as Error).message, true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Master Pembantu" sub="Kode Hxxx tabungan / Pxxx piutang beserta saldo akhir." />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[380px_1fr]">
        <Card>
          <h3 className="font-semibold text-ink">Tambah Pembantu</h3>
          <form onSubmit={tambah} className="mt-3 space-y-3">
            <Field label="Kode (mis. H999 / P999)">
              <input className={inputCls} value={form.kode} onChange={(e) => setForm({ ...form, kode: e.target.value })} placeholder="H999" />
            </Field>
            <Field label="Nama">
              <input className={inputCls} value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} placeholder="Nama nasabah" />
            </Field>
            <Field label="Jenis rekening" hint="Tabungan = simpanan siswa, Piutang = pinjaman siswa">
              <select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="TABUNGAN">TABUNGAN — simpanan siswa</option>
                <option value="PIUTANG">PIUTANG — pinjaman siswa</option>
              </select>
            </Field>
            <Field label="No Rek (opsional)">
              <input className={inputCls} value={form.no_rek} onChange={(e) => setForm({ ...form, no_rek: e.target.value })} placeholder="6415" />
            </Field>
            <Field label="Saldo Awal">
              <input className={inputCls} type="number" min={0} value={form.saldo_awal} onChange={(e) => setForm({ ...form, saldo_awal: e.target.value })} />
            </Field>
            <Field label="UID Kartu RFID — tempel kartu lalu Enter (opsional)">
              <input
                className={inputCls}
                value={form.uid_kartu}
                onChange={(e) => setForm({ ...form, uid_kartu: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    tapForm(form.uid_kartu);
                  }
                }}
                placeholder="Tempel kartu di sini…"
              />
            </Field>
            <Btn type="submit" disabled={saving}>
              {saving ? "Menyimpan..." : "Simpan"}
            </Btn>
          </form>
        </Card>
        <Card>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row">
            <select className={`${inputCls} sm:w-44`} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Semua</option>
              <option value="TABUNGAN">TABUNGAN</option>
              <option value="PIUTANG">PIUTANG</option>
            </select>
            <input className={inputCls} placeholder="🔍 Cari kode / nama..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="mb-3 flex flex-col gap-2 rounded-lg bg-slate-50 p-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Field label={`Pasang kartu susulan ${tapKode ? `ke ${tapKode}` : "(pilih tombol Pasang di baris)"} — tempel + Enter`}>
                <input
                  className={inputCls}
                  value={tapUid}
                  onChange={(e) => setTapUid(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") pasangUid();
                  }}
                  placeholder="Tempel kartu…"
                />
              </Field>
            </div>
            <Btn onClick={pasangUid} disabled={tapBusy}>
              {tapBusy ? "Memasang..." : "Pasang"}
            </Btn>
          </div>
          {loading ? (
            <Skeleton />
          ) : rows.length === 0 ? (
            <EmptyState text="Tidak ketemu — coba kata kunci lain." />
          ) : (
            <TableShell head={["Kode", "Nama", "Status", "UID RFID", "Saldo Akhir"]}>
              {rows.map((r) => (
                <tr key={r.kode}>
                  <td className="px-3 py-2.5">
                    <strong>{r.kode}</strong>
                    <div className="text-xs text-muted">{r.no_rek || "-"}</div>
                  </td>
                  <td className="px-3 py-2.5">{r.nama}</td>
                  <td className="px-3 py-2.5">
                    <Badge value={r.status} />
                  </td>
                  <td className="num px-3 py-2.5 text-xs">
                    <div className="flex flex-wrap justify-end gap-1">
                      {!r.uid_kartu && (
                        <Btn
                          size="sm"
                          variant={tapKode === r.kode ? "primary" : "secondary"}
                          title="Pilih baris ini untuk dipasangi kartu"
                          onClick={() => setTapKode(r.kode)}
                        >
                          {tapKode === r.kode ? "✓ dipilih" : "Pasang"}
                        </Btn>
                      )}
                      {r.uid_kartu && (
                        <ConfirmButton
                          title={`Lepas kartu dari ${r.kode}?`}
                          body="Saldo & histori tetap aman. Lanjutkan bila kartu hilang/rusak."
                          confirmLabel="Ya, lepas"
                          onConfirm={() => lepasUid(r.kode)}
                        >
                          Lepas
                        </ConfirmButton>
                      )}
                    </div>
                  </td>
                  <td className="num px-3 py-2.5 font-semibold">{rupiah(r.saldo_akhir)}</td>
                </tr>
              ))}
            </TableShell>
          )}
        </Card>
      </div>
    </div>
  );
}

export default function NasabahPage() {
  return (
    <RoleGuard allow={["teller", "admin"]}>
      <NasabahPageInner />
    </RoleGuard>
  );
}
