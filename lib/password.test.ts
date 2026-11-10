import { describe, expect, it } from "vitest";
import {
  adalahHashBcrypt,
  BIAYA_BCRYPT,
  hashPassword,
  perluMigrasiPassword,
  verifikasiPassword,
} from "./password";

describe("hashPassword", () => {
  it("menghasilkan bcrypt cost 10 dan salt berbeda tiap hash", async () => {
    const a = await hashPassword("rahasia123");
    const b = await hashPassword("rahasia123");
    expect(adalahHashBcrypt(a)).toBe(true);
    expect(a.startsWith(`$2b$${BIAYA_BCRYPT}$`)).toBe(true);
    expect(a).not.toBe(b);
  });
});

describe("verifikasiPassword", () => {
  it("menerima password benar dan menolak yang salah", async () => {
    const hash = await hashPassword("rahasia123");
    expect(await verifikasiPassword("rahasia123", hash)).toBe(true);
    expect(await verifikasiPassword("salah", hash)).toBe(false);
  });

  it("tetap menerima password lama yang masih teks polos", async () => {
    expect(await verifikasiPassword("admin123", "admin123")).toBe(true);
    expect(await verifikasiPassword("admin124", "admin123")).toBe(false);
  });

  it("menolak hash kosong", async () => {
    expect(await verifikasiPassword("apa saja", "")).toBe(false);
  });
});

describe("perluMigrasiPassword", () => {
  it("true hanya untuk password lama non-bcrypt", async () => {
    expect(perluMigrasiPassword("admin123")).toBe(true);
    expect(perluMigrasiPassword(await hashPassword("admin123"))).toBe(false);
    expect(perluMigrasiPassword("")).toBe(false);
  });
});
