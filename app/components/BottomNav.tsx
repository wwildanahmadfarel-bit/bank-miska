"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// Navigasi bawah ala dompet digital — khusus nasabah di layar kecil.
// Staf tetap memakai sidebar; disembunyikan saat cetak via .no-print.
const ITEMS = [
  { href: "/", label: "Menu", icon: "🏠" },
  { href: "/riwayat", label: "Riwayat", icon: "📜" },
  { href: "/daftar-saldo", label: "Saldo", icon: "📋" },
  { href: "/ubah-password", label: "Akun", icon: "🔐" },
];

export default function BottomNav() {
  const path = usePathname();
  const [tampil, setTampil] = useState(false);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.sukses && d.user.role === "nasabah") setTampil(true);
      })
      .catch(() => {});
  }, [path]);

  if (!tampil) return null;

  return (
    <>
      <div className="h-16 md:hidden" aria-hidden />
      <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden">
        <div className="grid grid-cols-4 pb-[env(safe-area-inset-bottom)]">
          {ITEMS.map((n) => {
            const active = path === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${
                  active ? "text-brand-600" : "text-slate-500"
                }`}
              >
                <span className="text-xl">{n.icon}</span>
                {n.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
