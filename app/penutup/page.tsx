"use client";

import { useEffect, useState } from "react";
import { PageHeader, Card, Field, inputCls, Badge, EmptyState, Skeleton, TableShell } from "../components/ui";
import ExportButtons from "../components/ExportButtons";
import RoleGuard from "../components/RoleGuard";
import ConfirmButton from "../components/ConfirmButton";
import { useToast } from "../components/Toast";

type Periode = { bulan: string; status: string; ditutup: string | null; jumlah_jurnal: number };

function bulanBerjalan(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function PenutupPageInner() {
  const toast = useToast();
  const [bulan, setBulan] = useState(bulanBerjalan());
  const [rows, setRows] = useState<Periode[]>([]);
  const [terbaru, setTerbaru] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function muat() {
    setLoading(true);
    try {
      const r = await fetch("/api/periode");
      const data = await r.json();
      if (!data.sukses) {
        toast(data.pesan, true);
        return;
      }
      setRows(data.periode);
      setTerbaru(data.tutup_terbaru ?? null);
    } catch (e) {
      toast("Gagal: " + (e as Error).message, true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let aktif = true;
    (async () => {
      try {
        const r = await fetch("/api/periode");
        const data = await r.json();
        if (!aktif) return;
        if (!data.sukses) {
          toast(data.pesan, true);
          return;
        }
        setRows(data.periode);
        setTerbaru(data.tutup_terbaru ?? null);
      } catch (e) {
        if (aktif) toast("Gagal: " + (e as Error).message, true);
      } finally {
        if (aktif) setLoading(false);
      }
    })();
    return () => {
      aktif = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function validBulan(b: string): boolean {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(b)) return false;
    // 1 bulan = 1 periode: tolak bulan depan agar tidak salah tutup.
    return b <= bulanBerjalan();
  }

  async function tutup(target: string) {
    if (!validBulan(target)) return toast("Bulan harus YYYY-MM (01-12) dan bukan bulan depan.", true);
    try {
      const r = await fetch("/api/jurnal-penutup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bulan: target }),
      });
      const data = await r.json();
      if (!data.sukses) return toast(data.pesan, true);
      toast(`Periode ${data.bulan} ditutup. Jurnal #${data.id_jurnal}`);
      muat();
    } catch (e) {
      toast("Gagal: " + (e as Error).message, true);
    }
  }

  async function buka(target: string) {
    try {
      const r = await fetch("/api/periode-buka", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bulan: target }),
      });
      const data = await r.json();
      if (!data.sukses) return toast(data.pesan, true);
      toast(`Periode ${data.bulan} dibuka kembali (${data.penutup_dihapus} jurnal penutup dihapus). Laporan terbarui otomatis.`);
      muat();
    } catch (e) {
      toast("Gagal: " + (e as Error).message, true);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Setting Periode" sub="1 bulan = 1 periode. Tutup akun LR ke 4-300 + kunci periode." />
      <Card>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Menutup akun <code>4-xxx, 6-xxx, 3-300</code> ke <code>4-300 Laba/Rugi</code> dan <strong>mengunci periode</strong> —
          jurnal baru di bulan itu akan ditolak.
        </div>
        <div className="mt-4 flex max-w-md gap-2">
          <div className="flex-1">
            <Field label="Bulan (1 periode = 1 bulan)">
              <input type="month" className={inputCls} value={bulan} max={bulanBerjalan()} onChange={(e) => setBulan(e.target.value)} />
            </Field>
          </div>
          <div className="flex items-end">
            <ConfirmButton
              title={`Tutup periode ${bulan || "?"}?`}
              body="Jurnal baru di bulan itu akan ditolak. Pastikan laporan sudah benar."
              confirmLabel="Ya, tutup periode"
              onConfirm={() => tutup(bulan)}
            >
              Tutup Periode
            </ConfirmButton>
          </div>
        </div>
      </Card>
      <Card className="mt-5">
        <h3 className="font-semibold text-ink">Daftar Periode</h3>
        <p className="mt-1 text-sm text-muted">Status tiap bulan. Periode tutup tidak bisa diisi jurnal baru.</p>
        <div className="mt-3">
          {loading ? (
            <Skeleton />
          ) : rows.length === 0 ? (
            <EmptyState text="Belum ada periode." />
          ) : (
            <TableShell head={["Bulan", "Jurnal", "Status", "Ditutup", "Aksi"]}>
              {rows.map((p) => (
                <tr key={p.bulan}>
                  <td className="px-3 py-2.5">
                    <strong>{p.bulan}</strong>
                  </td>
                  <td className="num px-3 py-2.5">{p.jumlah_jurnal}</td>
                  <td className="px-3 py-2.5">
                    <Badge value={p.status} />
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted">{p.ditutup ?? "-"}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <ExportButtons
                        href={`/api/ekspor?laporan=paket-periode&bulan=${encodeURIComponent(p.bulan)}`}
                      />
                      {p.status === "tutup" ? (
                        p.bulan === terbaru ? (
                          <ConfirmButton
                            title={`Buka periode ${p.bulan}?`}
                            body="Kunci dibuka + jurnal penutup bulan itu dihapus agar bisa koreksi. Tutup ulang setelah selesai."
                            confirmLabel="Ya, buka"
                            variant="primary"
                            onConfirm={() => buka(p.bulan)}
                          >
                            Buka
                          </ConfirmButton>
                        ) : (
                          <span className="text-xs text-muted" title="Buka dari periode tutup terbaru dulu">
                            Terkunci
                          </span>
                        )
                      ) : (
                        <ConfirmButton
                          title={`Tutup periode ${p.bulan}?`}
                          body="Jurnal baru di bulan itu akan ditolak. Pastikan laporan sudah benar."
                          confirmLabel="Ya, tutup"
                          onConfirm={() => tutup(p.bulan)}
                        >
                          Tutup
                        </ConfirmButton>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </TableShell>
          )}
        </div>
      </Card>
    </div>
  );
}

export default function PenutupPage() {
  return (
    <RoleGuard allow={["admin"]}>
      <PenutupPageInner />
    </RoleGuard>
  );
}
