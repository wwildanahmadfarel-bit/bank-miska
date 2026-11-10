"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader, StatCard, Skeleton, Card, BtnLink } from "./components/ui";
import AnalitikKas from "./components/AnalitikKas";
import { rupiah } from "@/lib/format";
import { useToast } from "./components/Toast";

const MASTER = [
  { href: "/riwayat", judul: "Riwayat", desc: "Nasabah: mutasi + saldo milik sendiri. Teller: cek milik nasabah di loket.", icon: "📜", roles: ["teller", "admin", "nasabah"] },
  { href: "/coa", judul: "Master COA", desc: "Daftar akun Kas, Piutang, dan Tabungan.", icon: "🗂️", roles: ["admin"] },
  { href: "/nasabah", judul: "Master Pembantu", desc: "Kode Hxxx tabungan & Pxxx piutang + saldo akhir.", icon: "👥", roles: ["teller", "admin"] },
  { href: "/jurnal", judul: "Jurnal Setoran & Tarik", desc: "Setoran & penarikan tunai nasabah.", icon: "✍️", roles: ["teller", "admin"] },
  { href: "/pinjaman", judul: "Pencairan Pinjaman", desc: "Cairkan pinjaman, angsuran dibuat otomatis.", icon: "💰", roles: ["teller", "admin"] },
  { href: "/angsuran", judul: "Bayar Angsuran", desc: "Catat pembayaran cicilan nasabah.", icon: "🧾", roles: ["teller", "admin"] },
  { href: "/merchant", judul: "Merchant Kantin", desc: "Buat QR bayar per transaksi (5 menit).", icon: "🏪", roles: ["teller", "admin"] },
  { href: "/bayar", judul: "Bayar RFID/QR", desc: "Kasir kantin: tap kartu / scan QR.", icon: "💳", roles: ["teller", "admin"] },
];

const LAPORAN = [  { href: "/buku-besar", judul: "Buku Besar", desc: "Mutasi + saldo berjalan per akun.", icon: "📖", roles: ["teller", "admin"] },
  { href: "/bb-pembantu", judul: "BB Pembantu", desc: "Rincian per nasabah Hxxx / Pxxx.", icon: "📒", roles: ["teller", "admin"] },
  { href: "/daftar-saldo", judul: "Daftar Saldo", desc: "Total tabungan & piutang.", icon: "📋", roles: ["teller", "admin", "nasabah"] },
  { href: "/neraca-lajur", judul: "Neraca Lajur", desc: "Neraca saldo per bulan + cek balance.", icon: "⚖️", roles: ["teller", "admin"] },
  { href: "/laba-rugi", judul: "Laba Rugi", desc: "Pendapatan vs biaya + laba bersih.", icon: "📈", roles: ["teller", "admin"] },
  { href: "/penutup", judul: "Jurnal Penutup", desc: "Tutup LR ke 4-300 + kunci periode.", icon: "🔒", roles: ["admin"] },
];

// Tampilan dompet digital khusus nasabah (ala OVO/DANA/GoPay).
const AKSI_CEPAT = [
  { href: "/riwayat", label: "Riwayat", icon: "📜" },
  { href: "/daftar-saldo", label: "Saldo", icon: "📋" },
  { href: "/ubah-password", label: "Password", icon: "🔐" },
  { href: "/bantuan", label: "Bantuan", icon: "❓" },
];

const MENU_WALLET = [
  { href: "/riwayat", judul: "Riwayat Saya", desc: "Mutasi + saldo rekeningmu.", icon: "📜" },
  { href: "/daftar-saldo", judul: "Daftar Saldo", desc: "Saldo tabungan & piutang.", icon: "📋" },
  { href: "/ubah-password", judul: "Ubah Password", desc: "Ganti password akunmu.", icon: "🔐" },
  { href: "/bantuan", judul: "Bantuan", desc: "Panduan memakai aplikasi.", icon: "❓" },
];

function Kartu({
  href,
  judul,
  desc,
  icon,
  className = "",
}: {
  href: string;
  judul: string;
  desc: string;
  icon: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-1 hover:border-brand-100 hover:shadow-lg lg:aspect-square ${className}`}
    >
      <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-lg">{icon}</div>
      <h3 className="text-sm font-semibold text-ink">{judul}</h3>
      <p className="mt-1 text-xs text-muted">{desc}</p>
      <span className="mt-auto inline-block pt-2 text-xs font-semibold text-brand-600 transition group-hover:translate-x-1">
        Buka →
      </span>
    </Link>
  );
}

export default function Home() {
  const toast = useToast();
  const [stats, setStats] = useState<{ kas: number; tabungan: number; piutang: number } | null>(null);
  const [role, setRole] = useState("");
  const [siap, setSiap] = useState(false);
  const [dompet, setDompet] = useState<{ nama: string; kode: string; saldo: number } | null>(null);
  const [dompetPesan, setDompetPesan] = useState("");
  const [lihatSaldo, setLihatSaldo] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const m = await fetch("/api/me").then((r) => r.json());
        if (!m.sukses) return; // tamu: tidak tampilkan menu/angka (fail-closed)
        const r = String(m.user.role);
        setRole(r);
        if (r !== "teller" && r !== "admin") {
          // nasabah: saldo milik sendiri (server memaksa kode sendiri)
          try {
            const w = await fetch("/api/riwayat?kode=&mulai=&sampai=").then((x) => x.json());
            if (!w.sukses) {
              setDompetPesan(String(w.pesan || "Gagal memuat saldo."));
              return;
            }
            setDompet({ nama: String(w.pembantu.nama), kode: String(w.pembantu.kode), saldo: Number(w.saldo_akhir) });
          } catch {
            setDompetPesan("Gagal memuat saldo.");
          }
          return;
        }
        const [bb, tab, piu] = await Promise.all([
          fetch("/api/buku-besar?kode=1-110").then((x) => x.json()),
          fetch("/api/daftar-saldo?tipe=TABUNGAN").then((x) => x.json()),
          fetch("/api/daftar-saldo?tipe=PIUTANG").then((x) => x.json()),
        ]);
        if (!bb.sukses || !tab.sukses || !piu.sukses) return;
        const last = bb.rows[bb.rows.length - 1];
        setStats({ kas: last ? last.saldo : 0, tabungan: tab.total, piutang: piu.total });
      } catch {
        toast("Gagal memuat ringkasan.", true);
      } finally {
        setSiap(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Sistem Bank Miska" sub="Praktik merchant sekolah: tabungan, pinjaman, dan akuntansi." />
      {!siap ? (
        <Skeleton rows={2} />
      ) : !role ? (
        <Card>
          <p className="text-sm text-muted">Silakan masuk untuk memakai aplikasi.</p>
          <div className="mt-3">
            <BtnLink href="/login">Masuk</BtnLink>
          </div>
        </Card>
      ) : role === "nasabah" ? (
        <div className="mx-auto max-w-md pb-20 md:pb-0">
          <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-brand-500 via-brand-600 to-brand-700 p-5 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <p className="text-sm text-white/80">Halo, {dompet?.nama || "Nasabah"}</p>
              <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-bold">{dompet?.kode || "…"}</span>
            </div>
            <p className="mt-3 text-xs font-medium text-white/70">Saldo Tabungan</p>
            <div className="mt-1 flex items-center gap-2">
              <p className="text-3xl font-extrabold tracking-tight tabular-nums">
                {dompet ? (lihatSaldo ? rupiah(dompet.saldo) : "••••••") : "…"}
              </p>
              <button
                onClick={() => setLihatSaldo(!lihatSaldo)}
                aria-label="Intip saldo"
                className="rounded-full bg-white/20 px-2 py-1 text-sm"
              >
                {lihatSaldo ? "🙈" : "👁️"}
              </button>
            </div>
          </div>
          {dompetPesan && !dompet && (
            <Card className="mt-4">
              <p className="text-sm text-muted">{dompetPesan}</p>
            </Card>
          )}
          <div className="mt-5 grid grid-cols-4 gap-2 text-center">
            {AKSI_CEPAT.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="flex flex-col items-center gap-1.5 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-2xl">
                  {a.icon}
                </span>
                <span className="text-[11px] font-semibold text-ink">{a.label}</span>
              </Link>
            ))}
          </div>
          <h2 className="mb-3 mt-6 text-sm font-bold uppercase tracking-wide text-muted">Menu</h2>
          <div className="grid grid-cols-2 gap-3">
            {MENU_WALLET.map((m) => (
              <Link key={m.href} href={m.href} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-2xl">{m.icon}</div>
                <h3 className="mt-2 text-sm font-bold text-ink">{m.judul}</h3>
                <p className="mt-0.5 text-xs text-muted">{m.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <>
          {!stats ? (
            <Skeleton rows={2} />
          ) : (
            <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatCard label="Kas (1-110)" value={rupiah(stats.kas)} />
              <StatCard label="Total Tabungan" value={rupiah(stats.tabungan)} accent="bg-emerald-500" />
              <StatCard label="Total Piutang" value={rupiah(stats.piutang)} accent="bg-amber-500" />
            </div>
          )}
          <AnalitikKas />
          <h2 className="mb-3 font-bold text-ink">Master & Transaksi</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {MASTER.filter((m) => role && (m.roles as string[]).includes(role)).map((m) => (
          <Kartu key={m.href} {...m} />
        ))}
      </div>
      <h2 className="mb-3 mt-8 font-bold text-ink">Laporan</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {LAPORAN.filter((m) => role && (m.roles as string[]).includes(role)).map((m) => (
          <Kartu key={m.href} {...m} />
        ))}
      </div>
        </>
      )}
    </div>
  );
}
