"use client";

import { useEffect, useState } from "react";
import { ChartColumn } from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Btn, Skeleton, inputCls } from "./ui";
import { useToast } from "./Toast";

type BulanKas = {
  bulan: string;
  periode: string;
  setoran: number;
  penarikan: number;
  tren: number;
};

const PERIODE = [
  { label: "TA Berjalan", mode: "ta" },
  { label: "6 Bulan Terakhir", mode: "6bulan" },
] as const;

type Mode = (typeof PERIODE)[number]["mode"];

const rupiahPenuh = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
});

/** Sumbu Y kiri: 10000000 → "Rp10 jt" agar ringkas. */
function rupiahSingkat(v: number): string {
  if (v >= 1000000) return `Rp${(v / 1000000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  if (v >= 1000) return `Rp${Math.round(v / 1000)} rb`;
  return `Rp${v}`;
}

function TooltipKas({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number | string; color?: string }[]; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-bold text-ink">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-slate-600">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />
            {p.name}
          </span>
          <strong className="num text-ink">
            {p.name === "Tren Kelancaran" ? `${p.value}%` : rupiahPenuh.format(Number(p.value))}
          </strong>
        </div>
      ))}
    </div>
  );
}

export default function AnalitikKas() {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>("ta");
  const [label, setLabel] = useState("");
  const [data, setData] = useState<BulanKas[]>([]);
  const [loading, setLoading] = useState(true);
  const [gagal, setGagal] = useState(false);
  const [coba, setCoba] = useState(0);

  useEffect(() => {
    let aktif = true;
    (async () => {
      setLoading(true);
      setGagal(false);
      try {
        const r = await fetch(`/api/analitik-kas?mode=${mode}`);
        const d = await r.json();
        if (!aktif) return;
        if (!d.sukses) throw new Error(String(d.pesan || "Gagal memuat"));
        setData(d.data);
        setLabel(String(d.label ?? ""));
      } catch (e) {
        if (!aktif) return;
        setGagal(true);
        toast("Gagal memuat grafik: " + (e as Error).message, true);
      } finally {
        if (aktif) setLoading(false);
      }
    })();
    return () => {
      aktif = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, coba]);

  const kosong = !loading && !gagal && data.length > 0 && data.every((d) => d.setoran === 0 && d.penarikan === 0);

  return (
    <section className="mb-8 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm" aria-label="Analisis arus kas">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <ChartColumn size={20} />
          </span>
          <div>
            <h2 className="font-bold text-ink">Analisis Arus Kas &amp; Tabungan</h2>
            <p className="mt-0.5 text-xs text-muted">
              Tren bulanan setoran, penarikan, dan rata-rata saldo{label ? ` (${label})` : ""}
            </p>
          </div>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-600">Periode</span>
          <select className={`${inputCls} w-44`} value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            {PERIODE.map((p) => (
              <option key={p.mode} value={p.mode}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {loading ? (
        <Skeleton rows={4} />
      ) : gagal ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
          <p className="text-sm text-muted">Grafik tidak dapat dimuat.</p>
          <div className="mt-3">
            <Btn variant="secondary" onClick={() => setCoba((c) => c + 1)}>
              Coba lagi
            </Btn>
          </div>
        </div>
      ) : kosong ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-muted">
          Belum ada transaksi kas pada periode ini.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={350}>
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }} barCategoryGap="28%">
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="bulan" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
            <YAxis
              yAxisId="kiri"
              tick={{ fontSize: 12, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={rupiahSingkat}
              width={64}
            />
            <YAxis
              yAxisId="kanan"
              orientation="right"
              domain={[0, 100]}
              tick={{ fontSize: 12, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `${v}%`}
              width={48}
            />
            <Tooltip content={<TooltipKas />} cursor={{ fill: "#f1f5f9", opacity: 0.6 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="kiri" dataKey="setoran" name="Setoran Kas Masuk" fill="#2563eb" radius={[6, 6, 0, 0]} maxBarSize={28} />
            <Bar yAxisId="kiri" dataKey="penarikan" name="Penarikan Kas Keluar" fill="#f59e0b" radius={[6, 6, 0, 0]} maxBarSize={28} />
            <Line
              yAxisId="kanan"
              dataKey="tren"
              name="Tren Kelancaran"
              stroke="#10b981"
              strokeWidth={3}
              dot={{ r: 3, fill: "#10b981" }}
              type="monotone"
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}
