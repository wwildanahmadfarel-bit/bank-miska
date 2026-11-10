import { Children, cloneElement, isValidElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AnalitikKas from "./AnalitikKas";

// jsdom tak punya ukuran layout sehingga ComposedChart me-render kosong.
// Mock meneruskan width/height tetap seperti perilaku ResponsiveContainer asli.
vi.mock("recharts", async (importOriginal) => {
  const mod = await importOriginal<typeof import("recharts")>();
  return {
    ...mod,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div>
        {Children.map(children, (c) =>
          isValidElement(c) ? cloneElement(c as React.ReactElement, { width: 800, height: 350 } as object) : c
        )}
      </div>
    ),
  };
});
vi.mock("./Toast", () => ({ useToast: () => vi.fn() }));

const DATA_MOCK = {
  sukses: true,
  mode: "ta",
  label: "TA 2025/2026",
  data: [
    { bulan: "Jul", periode: "2025-07", setoran: 1250000, penarikan: 400000, tren: 76 },
    { bulan: "Agu", periode: "2025-08", setoran: 1800000, penarikan: 650000, tren: 73 },
  ],
};

function mockFetch(data: unknown, ok = true) {
  global.fetch = vi.fn().mockResolvedValue({ ok, json: async () => data });
}

describe("AnalitikKas", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("memuat data asli lalu menampilkan judul + legenda", async () => {
    mockFetch(DATA_MOCK);
    render(<AnalitikKas />);
    expect(await screen.findByText("Analisis Arus Kas & Tabungan")).toBeInTheDocument();
    expect(await screen.findByText("Setoran Kas Masuk")).toBeInTheDocument();
    expect(await screen.findByText("Penarikan Kas Keluar")).toBeInTheDocument();
    expect(await screen.findByText("Tren Kelancaran")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith("/api/analitik-kas?mode=ta");
  });

  it("ganti periode memicu fetch mode=6bulan", async () => {
    mockFetch(DATA_MOCK);
    render(<AnalitikKas />);
    await screen.findByText("Setoran Kas Masuk");
    (global.fetch as ReturnType<typeof vi.fn>).mockClear();
    fireEvent.change(screen.getByLabelText("Periode"), { target: { value: "6bulan" } });
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/analitik-kas?mode=6bulan");
    });
  });

  it("menampilkan tombol coba-lagi saat API gagal", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("putus"));
    render(<AnalitikKas />);
    expect(await screen.findByText("Coba lagi")).toBeInTheDocument();
  });

  it("menampilkan pesan kosong bila semua nol", async () => {
    mockFetch({
      sukses: true,
      mode: "ta",
      label: "TA 2025/2026",
      data: [{ bulan: "Jul", periode: "2025-07", setoran: 0, penarikan: 0, tren: 0 }],
    });
    render(<AnalitikKas />);
    expect(await screen.findByText("Belum ada transaksi kas pada periode ini.")).toBeInTheDocument();
  });
});
