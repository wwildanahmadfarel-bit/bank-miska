"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Role = "teller" | "admin" | "nasabah";
const ALL: Role[] = ["teller", "admin", "nasabah"];
const STAF: Role[] = ["teller", "admin"];

const NAV: { href: string; label: string; icon: string; group: string; roles: Role[] }[] = [
  { href: "/", label: "Menu", icon: "🏠", group: "Utama", roles: ALL },
  { href: "/riwayat", label: "Riwayat Saya", icon: "📜", group: "Utama", roles: ALL },
  { href: "/coa", label: "COA", icon: "🗂️", group: "Master", roles: ["admin"] },
  { href: "/nasabah", label: "Pembantu", icon: "👥", group: "Master", roles: STAF },
  { href: "/pengguna", label: "Pengguna", icon: "🔑", group: "Master", roles: STAF },
  { href: "/jurnal", label: "Jurnal", icon: "✍️", group: "Transaksi", roles: STAF },
  { href: "/pinjaman", label: "Pinjaman", icon: "💰", group: "Transaksi", roles: STAF },
  { href: "/angsuran", label: "Angsuran", icon: "🧾", group: "Transaksi", roles: STAF },
  { href: "/merchant", label: "Merchant", icon: "🏪", group: "Kantin", roles: STAF },
  { href: "/bayar", label: "Bayar", icon: "💳", group: "Kantin", roles: STAF },
  { href: "/buku-besar", label: "Buku Besar", icon: "📖", group: "Laporan", roles: STAF },
  { href: "/bb-pembantu", label: "BB Pembantu", icon: "📒", group: "Laporan", roles: STAF },
  { href: "/daftar-saldo", label: "Daftar Saldo", icon: "📋", group: "Laporan", roles: ALL },
  { href: "/neraca-lajur", label: "Neraca Lajur", icon: "⚖️", group: "Laporan", roles: STAF },
  { href: "/laba-rugi", label: "Laba Rugi", icon: "📈", group: "Laporan", roles: STAF },
  { href: "/penutup", label: "Penutup", icon: "🔒", group: "Laporan", roles: ["admin"] },
  { href: "/ubah-password", label: "Ubah Password", icon: "🔐", group: "Akun", roles: ALL },
  { href: "/bantuan", label: "Bantuan", icon: "❓", group: "Akun", roles: ALL },
];

const GROUPS: { name: string; items: typeof NAV }[] = (() => {
  const out: { name: string; items: typeof NAV }[] = [];
  for (const n of NAV) {
    const g = out.find((x) => x.name === n.group);
    if (g) g.items.push(n);
    else out.push({ name: n.group, items: [n] });
  }
  return out;
})();

export default function Sidebar() {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState<{ username: string; role: string } | null>(null);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.sukses) setMe(d.user);
      })
      .catch(() => {});
  }, [path]);

  async function keluar() {
    await fetch("/api/logout", { method: "POST" });
    setMe(null);
    router.push("/login");
    router.refresh();
  }

  const links = (
    <div className="space-y-4">
      {GROUPS.map((g) => {
        const items = g.items.filter((n) => me && n.roles.includes(me.role as Role));
        if (items.length === 0) return null;
        return (
          <div key={g.name}>
            <div className="px-3 pt-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">{g.name}</div>
            {items.map((n) => {
            const active = path === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className={`mt-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  active ? "bg-brand-500 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <span>{n.icon}</span>
                {n.label}
              </Link>
            );
          })}
        </div>
        );
      })}
    </div>
  );

  return (
    <>
      <div className="sticky top-0 z-40 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 md:hidden">
        <button onClick={() => setOpen(!open)} aria-label="Menu" className="rounded-lg bg-slate-100 px-3 py-1.5 text-lg">
          ☰
        </button>
        <span className="font-bold text-ink">
          <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500 text-sm text-white">M</span>
          Bank Miska
        </span>
      </div>
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white p-4 md:flex">
        <div className="mb-4 flex items-center gap-2 px-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-lg font-bold text-white">M</span>
          <div>
            <div className="font-bold text-ink">Bank Miska</div>
            <div className="text-[11px] text-muted">Praktik Sekolah</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto">{links}</nav>
        <div className="border-t border-slate-200 pt-3 text-xs">
          {me ? (
            <div className="flex items-center justify-between px-2">
              <span className="font-semibold text-slate-600">
                {me.username} <span className="text-slate-400">({me.role})</span>
              </span>
              <button onClick={keluar} className="rounded-lg bg-slate-100 px-2 py-1 font-bold hover:bg-slate-200">
                Keluar
              </button>
            </div>
          ) : (
            <Link href="/login" className="block rounded-lg bg-slate-100 px-3 py-2 text-center font-bold text-slate-600 hover:bg-slate-200">
              Masuk
            </Link>
          )}
        </div>
      </aside>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 md:hidden" onClick={() => setOpen(false)}>
          <div className="h-full w-64 overflow-y-auto bg-white p-4" onClick={(e) => e.stopPropagation()}>
            <nav>{links}</nav>
          </div>
        </div>
      )}
    </>
  );
}
