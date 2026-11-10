import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>{children}</section>
  );
}

export function PageHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <header className="mb-5">
      <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
      {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
    </header>
  );
}

export function Field({
  label,
  children,
  hint,
  error,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs font-medium text-red-600">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-slate-500">{hint}</span>
      ) : null}
    </label>
  );
}

export const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

export function Btn({
  children,
  onClick,
  type = "button",
  variant = "primary",
  disabled = false,
  size = "md",
  title,
  block = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
  size?: "md" | "sm";
  title?: string;
  block?: boolean;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60";
  const sizes: Record<string, string> = {
    md: "min-h-[44px] px-4 py-2 text-sm",
    sm: "min-h-[36px] px-3 py-1.5 text-[13px]",
  };
  const styles: Record<string, string> = {
    primary: "bg-brand-500 text-white shadow-sm hover:bg-brand-600",
    secondary: "bg-slate-100 text-slate-700 hover:bg-slate-200",
    danger: "bg-red-600 text-white shadow-sm hover:bg-red-700",
    ghost: "text-brand-600 hover:bg-brand-50",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${base} ${sizes[size]} ${styles[variant]} ${block ? "w-full" : ""}`}
    >
      {children}
    </button>
  );
}

// Tautan bergaya tombol (untuk navigasi, agar tidak ada <button> di dalam <a>).
export function BtnLink({
  href,
  children,
  variant = "primary",
  size = "md",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "md" | "sm";
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition active:scale-[0.98]";
  const sizes: Record<string, string> = {
    md: "min-h-[44px] px-4 py-2 text-sm",
    sm: "min-h-[36px] px-3 py-1.5 text-[13px]",
  };
  const styles: Record<string, string> = {
    primary: "bg-brand-500 text-white shadow-sm hover:bg-brand-600",
    secondary: "bg-slate-100 text-slate-700 hover:bg-slate-200",
    danger: "bg-red-600 text-white shadow-sm hover:bg-red-700",
    ghost: "text-brand-600 hover:bg-brand-50",
  };
  return (
    <a href={href} className={`${base} ${sizes[size]} ${styles[variant]}`}>
      {children}
    </a>
  );
}

const badgeStyles: Record<string, string> = {
  TABUNGAN: "bg-emerald-100 text-emerald-800",
  PIUTANG: "bg-sky-100 text-sky-800",
  Db: "bg-sky-100 text-sky-800",
  Kr: "bg-emerald-100 text-emerald-800",
  berjalan: "bg-amber-100 text-amber-800",
  buka: "bg-amber-100 text-amber-800",
  tutup: "bg-slate-200 text-slate-700",
  lunas: "bg-emerald-100 text-emerald-800",
  diajukan: "bg-slate-200 text-slate-700",
  ditolak: "bg-red-100 text-red-800",
};

export function Badge({ value }: { value: string }) {
  const cls = badgeStyles[value] ?? "bg-slate-200 text-slate-700";
  return (
    <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-bold uppercase ${cls}`}>{value}</span>
  );
}

export function EmptyState({ text = "Tidak ada data." }: { text?: string }) {
  return <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-muted">{text}</div>;
}

export function Skeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-2" aria-label="Memuat...">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-9 rounded-lg bg-slate-200" />
      ))}
    </div>
  );
}

export function StatCard({ label, value, accent = "bg-brand-500" }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className={`mb-2 h-1 w-10 rounded-full ${accent}`} />
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="num mt-1 text-xl font-bold text-ink">{value}</div>
    </div>
  );
}

export function TableShell({ head, children }: { head: string[]; children: ReactNode }) {
  const cell = "px-3 py-2.5";
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[640px] border-collapse bg-white text-sm">
        <thead className="sticky top-0">
          <tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
            {head.map((h, i) => (
              <th key={i} className={`border-b border-slate-200 ${cell} ${i >= 3 ? "num" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr:hover]:bg-slate-50 [&>tr]:border-b [&>tr]:border-slate-100 [&>tr:last-child]:border-0">
          {children}
        </tbody>
      </table>
    </div>
  );
}
