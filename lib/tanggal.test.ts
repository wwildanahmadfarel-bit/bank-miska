import { describe, expect, it } from "vitest";
import { mysqlDateTime, tanggalHariIni, ZONA_WAKTU } from "./tanggal";

describe("tanggalHariIni", () => {
  it("memakai zona Asia/Jakarta, bukan UTC server", () => {
    expect(ZONA_WAKTU).toBe("Asia/Jakarta");
    // 4 Nov 2026 17:30 UTC = 5 Nov 2026 00:30 WIB.
    expect(tanggalHariIni(new Date("2026-11-04T17:30:00.000Z"))).toBe("2026-11-05");
    expect(tanggalHariIni(new Date("2026-11-04T16:59:59.000Z"))).toBe("2026-11-04");
  });
});

describe("mysqlDateTime", () => {
  it("memformat DATETIME MySQL dalam WIB", () => {
    expect(mysqlDateTime(new Date("2026-11-04T17:30:45.000Z"))).toBe("2026-11-05 00:30:45");
  });
});
