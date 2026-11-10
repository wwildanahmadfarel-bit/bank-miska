"use client";

import Link from "next/link";
import { useState } from "react";
import { PageHeader, Card, Btn, Field, inputCls } from "../components/ui";
import { useToast } from "../components/Toast";

export default function RegisterPage() {
  const toast = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [kode, setKode] = useState("");
  const [lihat, setLihat] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sukses, setSukses] = useState(false);

  async function daftar(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password || !kode.trim()) return toast("Lengkapi semua kolom.", true);
    if (password.length < 6) return toast("Password minimal 6 karakter.", true);
    setBusy(true);
    try {
      const r = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password, kode: kode.trim() }),
      });
      const data = await r.json();
      if (!data.sukses) return toast(data.pesan, true);
      setSukses(true);
    } catch (e) {
      toast("Gagal: " + (e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Daftar Akun" sub="Khusus yang sudah punya rekening (kode Hxxx/Pxxx). Akun aktif setelah verifikasi petugas." />
      <Card>
        {sukses ? (
          <div className="space-y-3 text-sm">
            <p>
              Pendaftaran <strong>{username.trim()}</strong> diterima. Akun Anda <strong>belum aktif</strong> — hubungi
              teller/admin di loket untuk verifikasi.
            </p>
            <p className="text-muted">Setelah diaktifkan, masuk melalui halaman login.</p>
            <Link href="/login">
              <Btn>Ke Halaman Masuk</Btn>
            </Link>
          </div>
        ) : (
          <form onSubmit={daftar} className="space-y-3">
            <Field label="Username (3-50 karakter)">
              <input
                className={inputCls}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="siswa2"
                autoFocus
              />
            </Field>
            <Field label="Password (min 6)">
              <div className="flex gap-2">
                <input
                  className={inputCls}
                  type={lihat ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••"
                />
                <Btn variant="secondary" onClick={() => setLihat(!lihat)}>
                  {lihat ? "🙈" : "👁️"}
                </Btn>
              </div>
            </Field>
            <Field label="Kode rekening (Hxxx/Pxxx)">
              <input
                className={inputCls}
                value={kode}
                onChange={(e) => setKode(e.target.value.toUpperCase())}
                placeholder="H2412"
              />
            </Field>
            <Btn type="submit" disabled={busy}>
              {busy ? "Memeriksa..." : "Daftar"}
            </Btn>
            <p className="text-sm text-muted">
              Sudah punya akun?{" "}
              <Link href="/login" className="font-semibold text-brand-600 hover:underline">
                Masuk di sini
              </Link>
            </p>
          </form>
        )}
      </Card>
    </div>
  );
}
