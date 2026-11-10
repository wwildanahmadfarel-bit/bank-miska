import { describe, expect, it } from "vitest";
import { rupiah } from "./format";

describe("rupiah", () => {
  it("memformat ribuan ala Indonesia tanpa desimal", () => {
    expect(rupiah(2120000)).toBe("Rp 2.120.000");
  });

  it("menerima string angka", () => {
    expect(rupiah("340000")).toBe("Rp 340.000");
  });

  it("nilai nol dan non-angka menjadi Rp 0", () => {
    expect(rupiah(0)).toBe("Rp 0");
    expect(rupiah("rusak")).toBe("Rp 0");
  });
});
