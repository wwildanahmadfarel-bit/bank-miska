// @vitest-environment node
// jose memeriksa `instanceof Uint8Array`; jsdom punya realm Uint8Array
// berbeda sehingga token selalu dianggap kunci tidak valid di environment itu.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import {
  buatJwt,
  JWT_AUDIENCE,
  JWT_ISSUER,
  JWT_MASA_BERLAKU_DETIK,
  jtiDariToken,
  tokenLegacy,
  verifikasiJwt,
} from "./jwt";

const SECRET = "rahasia-uji-jwt-bank-miska-minimal-32-karakter";
const USER = { id: 7, username: "siswa", role: "nasabah" as const, kode_bantu: "H2478" };

beforeEach(() => {
  process.env.JWT_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.JWT_SECRET;
});

describe("buatJwt / verifikasiJwt", () => {
  it("membuat token HS256 yang valid dengan klaim lengkap", async () => {
    const { token, jti, berakhir } = await buatJwt(USER);
    const isi = await verifikasiJwt(token);

    expect(isi).not.toBeNull();
    expect(isi?.sub).toBe("7");
    expect(isi?.username).toBe("siswa");
    expect(isi?.role).toBe("nasabah");
    expect(isi?.kode_bantu).toBe("H2478");
    expect(isi?.jti).toBe(jti);
    expect(await jtiDariToken(token)).toBe(jti);
    expect(berakhir.getTime()).toBeGreaterThan(Date.now() + (JWT_MASA_BERLAKU_DETIK - 60) * 1000);
  });

  it("menolak token yang diubah", async () => {
    const { token } = await buatJwt(USER);
    const rusak = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");
    expect(await verifikasiJwt(rusak)).toBeNull();
  });

  it("menolak token dengan secret berbeda", async () => {
    const { token } = await buatJwt(USER);
    process.env.JWT_SECRET = "secret-lain-yang-juga-panjangnya-cukup-32";
    expect(await verifikasiJwt(token)).toBeNull();
  });

  it("menolak token kedaluwarsa", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ username: "siswa", role: "nasabah", kode_bantu: "H2478" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject("7")
      .setJti("a".repeat(64))
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setIssuedAt(now - 120)
      .setExpirationTime(now - 60)
      .sign(new TextEncoder().encode(SECRET));
    expect(await verifikasiJwt(token)).toBeNull();
  });

  it("menolak issuer/audience yang salah", async () => {
    const token = await new SignJWT({ username: "siswa", role: "nasabah", kode_bantu: null })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("7")
      .setJti("b".repeat(64))
      .setIssuer("penyusup")
      .setAudience(JWT_AUDIENCE)
      .setExpirationTime(Math.floor(Date.now() / 1000) + 60)
      .sign(new TextEncoder().encode(SECRET));
    expect(await verifikasiJwt(token)).toBeNull();
  });

  it("menolak token tanpa jti 64-hex", async () => {
    const token = await new SignJWT({ username: "siswa", role: "nasabah", kode_bantu: null })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("7")
      .setJti("pendek")
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setExpirationTime(Math.floor(Date.now() / 1000) + 60)
      .sign(new TextEncoder().encode(SECRET));
    expect(await verifikasiJwt(token)).toBeNull();
  });

  it("gagal menandatangani di production bila JWT_SECRET tidak ada", async () => {
    const lama = process.env.NODE_ENV;
    delete process.env.JWT_SECRET;
    // @ts-expect-error NODE_ENV memang bisa diubah di test
    process.env.NODE_ENV = "production";
    await expect(buatJwt(USER)).rejects.toThrow(/JWT_SECRET/);
    // @ts-expect-error kembalikan nilai asli
    process.env.NODE_ENV = lama;
  });
});

describe("tokenLegacy", () => {
  it("mengenali token opaque 64-hex", () => {
    expect(tokenLegacy("a".repeat(64))).toBe(true);
    expect(tokenLegacy("A".repeat(64))).toBe(true);
    expect(tokenLegacy("a".repeat(63))).toBe(false);
    expect(tokenLegacy("abc.def.ghi")).toBe(false);
  });
});
