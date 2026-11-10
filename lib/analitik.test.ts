import { describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import {
  ambilAnalitikKas,
  daftarBulan,
  rentang6Bulan,
  rentangTahunAjaran,
} from "./analitik";

function stub(baris: unknown[]) {
  return {
    execute: async () => [[...baris] as RowDataPacket[], []] as [RowDataPacket[], unknown],
  };
}

describe("daftarBulan", () => {
  it("menghasilkan semua YYYY-MM inklusif, lewat tahun baru", () => {
    expect(daftarBulan("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
});

describe("rentang periode", () => {
  it("tahun ajaran mulai Juli", () => {
    expect(rentangTahunAjaran(new Date(2025, 9, 4))).toEqual({
      mulai: "2025-07",
      sampai: "2026-06",
      label: "TA 2025/2026",
    });
    expect(rentangTahunAjaran(new Date(2026, 2, 4)).mulai).toBe("2025-07");
  });

  it("6 bulan terakhir = 6 entri berakhir bulan berjalan", () => {
    const r = rentang6Bulan(new Date(2026, 2, 4));
    expect(r.sampai).toBe("2026-03");
    expect(r.mulai).toBe("2025-10");
  });
});

describe("ambilAnalitikKas", () => {
  it("mengisi bulan kosong dengan nol + label Indonesia + tren benar", async () => {
    const out = await ambilAnalitikKas(
      stub([{ periode: "2025-11", masuk: 2000000, keluar: 500000 }]),
      "2025-10",
      "2025-12"
    );
    expect(out).toEqual([
      { bulan: "Okt", periode: "2025-10", setoran: 0, penarikan: 0, tren: 0 },
      { bulan: "Nov", periode: "2025-11", setoran: 2000000, penarikan: 500000, tren: 80 },
      { bulan: "Des", periode: "2025-12", setoran: 0, penarikan: 0, tren: 0 },
    ]);
  });

  it("menolak rentang tak valid", async () => {
    await expect(ambilAnalitikKas(stub([]), "2025-13", "2025-12")).rejects.toThrow();
    await expect(ambilAnalitikKas(stub([]), "2025-12", "2025-10")).rejects.toThrow();
  });
});
