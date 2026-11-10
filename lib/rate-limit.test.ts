import { describe, expect, it, vi } from "vitest";
import { catatGagal, ipClient, resetKunci, sisaKunci } from "./rate-limit";

describe("rate-limit login (5x salah -> kunci 5 menit)", () => {
  it("bebas di awal, terkunci tepat pada kegagalan ke-5", () => {
    const k = `uji-${Date.now()}-a`;
    expect(sisaKunci(k)).toBe(0);
    for (let i = 1; i <= 4; i++) {
      expect(catatGagal(k, 5, 5 * 60 * 1000, 5 * 60 * 1000)).toBe(0);
    }
    const dikunci = catatGagal(k, 5, 5 * 60 * 1000, 5 * 60 * 1000);
    expect(dikunci).toBeGreaterThan(0);
    expect(dikunci).toBeLessThanOrEqual(300);
    expect(sisaKunci(k)).toBeGreaterThan(0);
  });

  it("sukses mereset hitungan", () => {
    const k = `uji-${Date.now()}-b`;
    catatGagal(k, 5, 5 * 60 * 1000, 5 * 60 * 1000);
    resetKunci(k);
    expect(sisaKunci(k)).toBe(0);
  });

  it("kegagalan lama di luar jendela tidak dihitung", () => {
    vi.useFakeTimers();
    try {
      const k = "uji-jendela";
      const now = Date.now();
      vi.setSystemTime(now);
      for (let i = 0; i < 4; i++) catatGagal(k, 5, 60 * 1000, 60 * 1000);
      vi.setSystemTime(now + 61 * 1000); // lewat jendela 60 dtk
      expect(catatGagal(k, 5, 60 * 1000, 60 * 1000)).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("ipClient", () => {
  it("memakai x-forwarded-for pertama", () => {
    const req = new Request("http://x/", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } });
    expect(ipClient(req)).toBe("1.2.3.4");
  });

  it("fallback ke lokal bila tanpa header", () => {
    expect(ipClient(new Request("http://x/"))).toBe("lokal");
  });
});
