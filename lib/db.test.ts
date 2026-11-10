import { describe, expect, it } from "vitest";
import { escapeLike, gagal, tangkap } from "./db";

describe("escapeLike", () => {
  it("menetralkan %, _ dan backslash", () => {
    expect(escapeLike("100%_\\")).toBe("100\\%\\_\\\\");
  });

  it("teks biasa tidak berubah", () => {
    expect(escapeLike("H2412")).toBe("H2412");
  });
});

describe("gagal", () => {
  it("menyamarkan detail error (500, tanpa bocoran SQL)", async () => {
    const res = gagal("Gagal baca COA: ", new Error("Unknown column 'x' in tb_coa"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.sukses).toBe(false);
    expect(body.pesan).toBe("Gagal baca COA, coba lagi");
    expect(body.pesan).not.toContain("Unknown column");
  });
});

describe("tangkap", () => {
  it("error driver MySQL (ER_*) disamarkan menjadi 500", async () => {
    const dbErr = Object.assign(new Error("Duplicate entry 'X'"), { code: "ER_DUP_ENTRY" });
    const res = tangkap("Gagal simpan", dbErr);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.pesan).not.toContain("Duplicate entry");
  });

  it("pesan validasi bisnis diteruskan (400)", async () => {
    const res = tangkap("Gagal bayar", new Error("Bayar melebihi sisa"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.pesan).toBe("Bayar melebihi sisa");
  });
});
