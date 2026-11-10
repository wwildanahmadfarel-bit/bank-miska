"use client";

import { useState } from "react";
import { PageHeader, Card, Btn, Field, inputCls } from "../components/ui";
import RoleGuard from "../components/RoleGuard";
import { useToast } from "../components/Toast";

function UbahPasswordInner() {
  const toast = useToast();
  const [lama, setLama] = useState("");
  const [baru, setBaru] = useState("");
  const [ulang, setUlang] = useState("");
  const [lihat, setLihat] = useState(false);
  const [busy, setBusy] = useState(false);

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    if (!lama || !baru || !ulang) return toast("Lengkapi semua kolom.", true);
    if (baru.length < 6) return toast("Password baru minimal 6 karakter.", true);
    if (baru !== ulang) return toast("Konfirmasi password tidak sama.", true);
    setBusy(true);
    try {
      const r = await fetch("/api/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lama, baru }),
      });
      const data = await r.json();
      if (!data.sukses) return toast(data.pesan, true);
      toast("Password berhasil diubah.");
      setLama("");
      setBaru("");
      setUlang("");
    } catch (e) {
      toast("Gagal: " + (e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Ubah Password" sub="Ganti password akun Anda sendiri." />
      <Card>
        <form onSubmit={simpan} className="space-y-3">
          <Field label="Password lama">
            <input
              className={inputCls}
              type={lihat ? "text" : "password"}
              value={lama}
              onChange={(e) => setLama(e.target.value)}
              placeholder="••••••"
              autoFocus
            />
          </Field>
          <Field label="Password baru (min 6)">
            <div className="flex gap-2">
              <input
                className={inputCls}
                type={lihat ? "text" : "password"}
                value={baru}
                onChange={(e) => setBaru(e.target.value)}
                placeholder="••••••"
              />
              <Btn variant="secondary" onClick={() => setLihat(!lihat)}>
                {lihat ? "🙈" : "👁️"}
              </Btn>
            </div>
          </Field>
          <Field label="Ulangi password baru">
            <input
              className={inputCls}
              type={lihat ? "text" : "password"}
              value={ulang}
              onChange={(e) => setUlang(e.target.value)}
              placeholder="••••••"
            />
          </Field>
          <Btn type="submit" disabled={busy}>
            {busy ? "Menyimpan..." : "Simpan"}
          </Btn>
        </form>
      </Card>
    </div>
  );
}

export default function UbahPasswordPage() {
  return (
    <RoleGuard allow={["teller", "admin", "nasabah"]}>
      <UbahPasswordInner />
    </RoleGuard>
  );
}
