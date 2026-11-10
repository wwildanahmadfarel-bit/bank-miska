"use client";

import { useEffect, useState } from "react";
import { PageHeader, Card, Btn, Field, inputCls, Badge, EmptyState, Skeleton, TableShell } from "../components/ui";
import ConfirmButton from "../components/ConfirmButton";
import RoleGuard from "../components/RoleGuard";
import { useToast } from "../components/Toast";

type User = { id: number; username: string; role: string; kode_bantu: string | null; aktif: number; nama_nasabah: string | null };

function PenggunaPageInner() {
  const toast = useToast();
  const [rows, setRows] = useState<User[]>([]);
  const [roleSaya, setRoleSaya] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ username: "", password: "", role: "nasabah", kode_bantu: "" });
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [pwBaru, setPwBaru] = useState("");
  const [pwLihat, setPwLihat] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [tautTarget, setTautTarget] = useState<User | null>(null);
  const [tautKode, setTautKode] = useState("");
  const [tautBusy, setTautBusy] = useState(false);
  const [cari, setCari] = useState("");

  const isAdmin = roleSaya === "admin";

  const katakunci = cari.trim().toLowerCase();
  const tampil = katakunci
    ? rows.filter((u) =>
        [u.username, u.nama_nasabah ?? "", u.kode_bantu ?? "", u.role, `#${u.id}`]
          .join(" ")
          .toLowerCase()
          .includes(katakunci)
      )
    : rows;

  async function muat() {
    setLoading(true);
    try {
      const r = await fetch("/api/pengguna");
      const data = await r.json();
      if (!data.sukses) {
        toast(data.pesan, true);
        return;
      }
      setRows(data.data);
      setRoleSaya(String(data.role_saya));
      if (data.role_saya !== "admin") setForm((f) => ({ ...f, role: "nasabah" }));
    } catch (e) {
      toast("Gagal memuat: " + (e as Error).message, true);
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

  async function tambah(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await fetch("/api/pengguna", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await r.json();
      if (!data.sukses) return toast(data.pesan, true);
      toast("User tersimpan: " + data.username);
      setForm({ username: "", password: "", role: "nasabah", kode_bantu: "" });
      muat();
    } catch (e) {
      toast("Gagal: " + (e as Error).message, true);
    } finally {
      setSaving(false);
    }
  }

  async function patch(id: number, body: Record<string, unknown>) {
    try {
      const r = await fetch("/api/pengguna", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });
      const data = await r.json();
      if (!data.sukses) return toast(data.pesan, true);
      toast("Tersimpan.");
      muat();
    } catch (e) {
      toast("Gagal: " + (e as Error).message, true);
    }
  }

  function resetPw(u: User) {
    setResetTarget(u);
    setPwBaru("");
    setPwLihat(false);
  }

  function tutupReset() {
    setResetTarget(null);
    setPwBaru("");
    setPwLihat(false);
  }

  async function kirimResetPw() {
    if (!resetTarget) return;
    if (pwBaru.length < 6) return toast("Password minimal 6 karakter.", true);
    setResetting(true);
    try {
      const r = await fetch("/api/pengguna", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: resetTarget.id, password: pwBaru }),
      });
      const data = await r.json();
      if (!data.sukses) return toast(data.pesan, true);
      toast(`Password ${resetTarget.username} direset.`);
      tutupReset();
      muat();
    } catch (e) {
      toast("Gagal: " + (e as Error).message, true);
    } finally {
      setResetting(false);
    }
  }

  function ubahTaut(u: User) {
    setTautTarget(u);
    setTautKode(u.kode_bantu || "");
  }

  async function kirimTaut() {
    if (!tautTarget) return;
    setTautBusy(true);
    try {
      await patch(tautTarget.id, { kode_bantu: tautKode.trim().toUpperCase() });
      setTautTarget(null);
      setTautKode("");
    } finally {
      setTautBusy(false);
    }
  }

  async function hapus(u: User) {
    try {
      const r = await fetch("/api/pengguna", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: u.id }),
      });
      const data = await r.json();
      if (!data.sukses) return toast(data.pesan, true);
      toast("Terhapus: " + u.username);
      muat();
    } catch (e) {
      toast("Gagal: " + (e as Error).message, true);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Kelola Pengguna"
        sub={isAdmin ? "Admin: CRUD semua role + reset password + aktif/nonaktif." : "Teller: buat/lihat user nasabah + reset password nasabah."}
      />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[380px_1fr]">
        <Card>
          <h3 className="font-semibold text-ink">Tambah User</h3>
          <form onSubmit={tambah} className="mt-3 space-y-3">
            <Field label="Username">
              <input className={inputCls} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="siswa2" />
            </Field>
            <Field label="Password (min 6)">
              <input className={inputCls} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••" />
            </Field>
            <Field label="Role">
              <select
                className={inputCls}
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                disabled={!isAdmin}
              >
                <option value="nasabah">Nasabah (siswa)</option>
                {isAdmin && <option value="teller">Teller (petugas)</option>}
                {isAdmin && <option value="admin">Admin (guru)</option>}
              </select>
            </Field>
            <Field label="Taut ke kode (Hxxx/Pxxx, wajib untuk nasabah)">
              <input
                className={inputCls}
                value={form.kode_bantu}
                onChange={(e) => setForm({ ...form, kode_bantu: e.target.value.toUpperCase() })}
                placeholder="H2412"
              />
            </Field>
            <Btn type="submit" disabled={saving}>
              {saving ? "Menyimpan..." : "Simpan"}
            </Btn>
          </form>
        </Card>
        <Card>
          {loading ? (
            <Skeleton />
          ) : (
            <>
              <div className="mb-3 flex gap-2">
                <input
                  className={inputCls}
                  value={cari}
                  onChange={(e) => setCari(e.target.value)}
                  placeholder="🔍 Cari username / nama / kode (Hxxx/Pxxx)..."
                />
                {cari && (
                  <Btn variant="secondary" onClick={() => setCari("")}>
                    Bersihkan
                  </Btn>
                )}
              </div>
              {katakunci && (
                <p className="mb-2 text-xs text-muted">
                  Menampilkan {tampil.length} dari {rows.length} pengguna.
                </p>
              )}
              {tampil.length === 0 ? (
                <EmptyState text={katakunci ? `Tidak ketemu "${cari.trim()}".` : undefined} />
              ) : (
                <TableShell head={["User", "Role", "Tautan", "Aktif", "Aksi"]}>
                  {tampil.map((u) => (
                <tr key={u.id}>
                  <td className="px-3 py-2.5">
                    <strong>{u.username}</strong>
                    <div className="text-xs text-muted">#{u.id}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge value={u.role} />
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    {u.kode_bantu ? (
                      <>
                        <strong>{u.kode_bantu}</strong> {u.nama_nasabah || ""}
                      </>
                    ) : (
                      "-"
                    )}
                    {isAdmin && (
                      <Btn size="sm" variant="secondary" onClick={() => ubahTaut(u)}>
                        Ubah
                      </Btn>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-bold uppercase ${
                        u.aktif ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                      }`}
                    >
                      {u.aktif ? "aktif" : "nonaktif"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    <div className="grid min-w-[228px] grid-cols-3 gap-1.5">
                      {isAdmin && (
                        <Btn size="sm" block variant="secondary" onClick={() => resetPw(u)}>
                          Reset PW
                        </Btn>
                      )}
                      {isAdmin && (
                        <ConfirmButton
                          title={`${u.aktif ? "Nonaktifkan" : "Aktifkan"} ${u.username}?`}
                          body={u.aktif ? "User tidak bisa masuk sampai diaktifkan lagi." : "User bisa masuk kembali."}
                          confirmLabel={u.aktif ? "Ya, nonaktifkan" : "Ya, aktifkan"}
                          variant="primary"
                          size="sm"
                          block
                          onConfirm={() => patch(u.id, { aktif: u.aktif ? 0 : 1 })}
                        >
                          {u.aktif ? "Nonaktif" : "Aktifkan"}
                        </ConfirmButton>
                      )}
                      {isAdmin && (
                        <ConfirmButton
                          title={`Hapus permanen ${u.username}?`}
                          body="Lebih aman menonaktifkan. Penghapusan tidak bisa dibatalkan."
                          confirmLabel="Ya, hapus"
                          size="sm"
                          block
                          onConfirm={() => hapus(u)}
                        >
                          Hapus
                        </ConfirmButton>
                      )}
                    </div>
                  </td>
                </tr>
                  ))}
                </TableShell>
              )}
            </>
          )}
        </Card>
      </div>
      {tautTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setTautTarget(null)}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-ink">Tautkan {tautTarget.username}</h3>
            <p className="mt-1 text-sm text-muted">Ke kode rekening Hxxx/Pxxx — kosongkan untuk melepas tautan.</p>
            <div className="mt-4">
              <Field label="Kode rekening">
                <input
                  className={inputCls}
                  value={tautKode}
                  onChange={(e) => setTautKode(e.target.value.toUpperCase())}
                  placeholder="H2412"
                  autoFocus
                />
              </Field>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Btn variant="secondary" onClick={() => setTautTarget(null)}>
                Batal
              </Btn>
              <Btn onClick={kirimTaut} disabled={tautBusy}>
                {tautBusy ? "Menyimpan..." : "Simpan"}
              </Btn>
            </div>
          </div>
        </div>
      )}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={tutupReset}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-ink">Reset password {resetTarget.username}</h3>
            <p className="mt-1 text-sm text-muted">
              Role: {resetTarget.role}. Password lama langsung tidak berlaku setelah direset.
            </p>
            <div className="mt-4">
              <Field label="Password baru (min 6)">
                <div className="flex gap-2">
                  <input
                    className={inputCls}
                    type={pwLihat ? "text" : "password"}
                    value={pwBaru}
                    onChange={(e) => setPwBaru(e.target.value)}
                    placeholder="••••••"
                    autoFocus
                  />
                  <Btn variant="secondary" onClick={() => setPwLihat(!pwLihat)}>
                    {pwLihat ? "🙈" : "👁️"}
                  </Btn>
                </div>
              </Field>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Btn variant="secondary" onClick={tutupReset}>
                Batal
              </Btn>
              <ConfirmButton
                title={`Reset password ${resetTarget.username}?`}
                body="Password lama langsung tidak berlaku. Lanjutkan?"
                confirmLabel="Ya, reset"
                onConfirm={kirimResetPw}
                disabled={pwBaru.length < 6 || resetting}
              >
                {resetting ? "Memproses..." : "Reset"}
              </ConfirmButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PenggunaPage() {
  return (
    <RoleGuard allow={["teller", "admin"]}>
      <PenggunaPageInner />
    </RoleGuard>
  );
}
