"use client";

import { useState, type ReactNode } from "react";
import { Btn } from "./ui";

export default function ConfirmButton({
  children,
  title = "Yakin?",
  body = "Tindakan ini tidak bisa dibatalkan.",
  confirmLabel = "Ya, lanjutkan",
  variant = "danger" as const,
  onConfirm,
  disabled = false,
  size = "md",
  block = false,
}: {
  children: ReactNode;
  title?: string;
  body?: string;
  confirmLabel?: string;
  variant?: "danger" | "primary";
  onConfirm: () => void | Promise<void>;
  disabled?: boolean;
  size?: "md" | "sm";
  block?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  return (
    <>
      <Btn variant={variant} size={size} block={block} onClick={() => setOpen(true)} disabled={disabled}>
        {children}
      </Btn>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-ink">{title}</h3>
            <p className="mt-2 text-sm text-muted">{body}</p>
            <div className="mt-5 flex justify-end gap-2">
              <Btn variant="secondary" onClick={() => setOpen(false)}>
                Batal
              </Btn>
              <Btn variant={variant} onClick={go} disabled={busy}>
                {busy ? "Memproses..." : confirmLabel}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
