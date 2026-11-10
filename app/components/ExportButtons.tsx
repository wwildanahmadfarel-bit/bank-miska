"use client";

import { useState } from "react";
import { Btn } from "./ui";
import { useToast } from "./Toast";

// Tombol unduh CSV + Excel untuk halaman laporan.
// href: URL /api/ekspor?... yang sudah berisi filter aktif halaman tersebut.
export default function ExportButtons({ href, disabled = false }: { href: string; disabled?: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState<"csv" | "xlsx" | null>(null);

  async function unduh(format: "csv" | "xlsx") {
    if (disabled || busy) return;
    setBusy(format);
    try {
      const r = await fetch(`${href}${href.includes("?") ? "&" : "?"}format=${format}`);
      if (!r.ok) {
        let pesan = `HTTP ${r.status}`;
        try {
          const j = await r.json();
          if (j.pesan) pesan = String(j.pesan);
        } catch {
          /* abaikan */
        }
        return toast(`Gagal ekspor: ${pesan}`, true);
      }
      const blob = await r.blob();
      const cd = r.headers.get("content-disposition") ?? "";
      const m = cd.match(/filename="?([^";]+)"?/);
      const nama = m ? m[1] : `laporan.${format}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nama;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast(`Terunduh: ${nama}`);
    } catch (e) {
      toast("Gagal ekspor: " + (e as Error).message, true);
    } finally {
      setBusy(null);
    }
  }

  const alasan = disabled ? "Tampilkan data dulu agar bisa diunduh." : undefined;
  return (
    <div className="flex items-end gap-2" title={alasan}>
      <Btn variant="secondary" onClick={() => unduh("csv")} disabled={disabled || busy !== null} title={alasan}>
        {busy === "csv" ? "CSV..." : "CSV"}
      </Btn>
      <Btn variant="primary" onClick={() => unduh("xlsx")} disabled={disabled || busy !== null} title={alasan}>
        {busy === "xlsx" ? "Excel..." : "Excel"}
      </Btn>
    </div>
  );
}
