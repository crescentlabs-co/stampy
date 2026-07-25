import { describe, expect, it } from "vitest";
import type { Request } from "express";
import {
  createEnrollCookie,
  createSessionCookie,
  createStaffCookie,
  enrollCookieName,
  hashPassword,
  newStaffDeviceId,
  parseSessionCookie,
  readEnrollCookie,
  readStaffCookie,
  staffCookieName,
  verifyPassword,
} from "../src/auth.js";
import { generateShortCode } from "../src/db.js";

describe("password hashing", () => {
  it("verifies the right password and rejects the wrong one", () => {
    const stored = hashPassword("correct horse battery");
    expect(verifyPassword("correct horse battery", stored)).toBe(true);
    expect(verifyPassword("wrong password", stored)).toBe(false);
  });

  it("produces a unique salt per hash", () => {
    expect(hashPassword("same")).not.toBe(hashPassword("same"));
  });

  it("rejects malformed stored hashes", () => {
    expect(verifyPassword("anything", "not-a-real-hash")).toBe(false);
    expect(verifyPassword("anything", "")).toBe(false);
  });
});

describe("session cookies", () => {
  it("round-trips a valid session", () => {
    const cookie = createSessionCookie("owner-123");
    expect(parseSessionCookie(cookie)).toBe("owner-123");
  });

  it("rejects tampered cookies", () => {
    const cookie = createSessionCookie("owner-123");
    expect(parseSessionCookie(cookie.replace("owner-123", "owner-999"))).toBeNull();
    expect(parseSessionCookie(cookie + "x")).toBeNull();
    expect(parseSessionCookie("garbage")).toBeNull();
    expect(parseSessionCookie(undefined)).toBeNull();
  });
});

describe("enrollment cookie", () => {
  // Fake just enough of Request for readEnrollCookie (it only calls req.get).
  const reqWith = (cookieHeader: string) =>
    ({ get: (h: string) => (h.toLowerCase() === "cookie" ? cookieHeader : undefined) }) as unknown as Request;

  const cookieFor = (cafeId: string, serial: string) =>
    `${enrollCookieName(cafeId)}=${encodeURIComponent(createEnrollCookie(serial))}`;

  it("round-trips the serial it issued for a café", () => {
    const serial = "b690eedc-3700-4711-b8ef-3b2d350f0386";
    expect(readEnrollCookie(reqWith(cookieFor("default", serial)), "default")).toBe(serial);
  });

  it("is scoped per café, so another café's cookie is not reused", () => {
    const cookie = cookieFor("default", "serial-a");
    expect(readEnrollCookie(reqWith(cookie), "other-cafe")).toBeNull();
  });

  // The serial is the pass barcode, so an unsigned cookie would let anyone who
  // saw a customer's barcode fetch that customer's pass and its auth token.
  it("rejects a forged or tampered cookie", () => {
    const cookie = cookieFor("default", "serial-a");
    expect(readEnrollCookie(reqWith(cookie.replace("serial-a", "serial-b")), "default")).toBeNull();
    expect(readEnrollCookie(reqWith(`${enrollCookieName("default")}=serial-a.99999999999999.nope`), "default")).toBeNull();
    expect(readEnrollCookie(reqWith(`${enrollCookieName("default")}=garbage`), "default")).toBeNull();
    expect(readEnrollCookie(reqWith(""), "default")).toBeNull();
  });

  // The expiry is inside the signed payload, so it cannot be rewritten to
  // extend a cookie's life — editing it invalidates the signature.
  it("rejects a cookie whose expiry has been rewritten", () => {
    const rewritten = createEnrollCookie("serial-a").replace(/\.(\d+)\./, ".1.");
    expect(readEnrollCookie(reqWith(`${enrollCookieName("default")}=${encodeURIComponent(rewritten)}`), "default")).toBeNull();
  });

  it("keeps the cookie name safe for a Set-Cookie header", () => {
    expect(enrollCookieName("has space/and;semi")).toBe("stampy_card_hasspaceandsemi");
  });
});

describe("staff session cookie", () => {
  const reqWith = (cookieHeader: string) =>
    ({ get: (h: string) => (h.toLowerCase() === "cookie" ? cookieHeader : undefined) }) as unknown as Request;

  const cookieFor = (nameCafe: string, signedCafe: string, device: string, epoch: number) =>
    `${staffCookieName(nameCafe)}=${encodeURIComponent(createStaffCookie(signedCafe, device, epoch))}`;

  it("round-trips the device id and epoch", () => {
    expect(readStaffCookie(reqWith(cookieFor("default", "default", "abc123", 7)), "default")).toEqual({
      deviceId: "abc123",
      epoch: 7,
    });
  });

  it("mints a distinct device id each time, so events are attributable per phone", () => {
    const ids = new Set(Array.from({ length: 20 }, newStaffDeviceId));
    expect(ids.size).toBe(20);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{10}$/);
  });

  // The café id is signed as well as being in the cookie name, so a cookie for
  // one café can't be renamed and replayed against another.
  it("rejects a cookie whose signed café doesn't match the café asked about", () => {
    expect(readStaffCookie(reqWith(cookieFor("other", "default", "abc123", 1)), "other")).toBeNull();
    expect(readStaffCookie(reqWith(cookieFor("default", "default", "abc123", 1)), "other")).toBeNull();
  });

  it("rejects a forged, tampered or absent cookie", () => {
    const cookie = cookieFor("default", "default", "abc123", 1);
    expect(readStaffCookie(reqWith(cookie.replace("abc123", "beef99")), "default")).toBeNull();
    expect(readStaffCookie(reqWith(`${staffCookieName("default")}=default.abc123.1.99999999999999.nope`), "default")).toBeNull();
    expect(readStaffCookie(reqWith(""), "default")).toBeNull();
  });

  it("rejects a cookie whose expiry has been rewritten", () => {
    const rewritten = createStaffCookie("default", "abc123", 1).replace(/\.\d{10,}\./, ".1.");
    expect(readStaffCookie(reqWith(`${staffCookieName("default")}=${encodeURIComponent(rewritten)}`), "default")).toBeNull();
  });

  // The epoch is returned rather than enforced here — requireStaff compares it
  // against the café row, which is what makes a PIN change revoke every phone.
  it("returns the epoch it was issued with so a PIN change can strand it", () => {
    const old = readStaffCookie(reqWith(cookieFor("default", "default", "abc123", 3)), "default");
    expect(old?.epoch).toBe(3);
    expect(old?.epoch).not.toBe(4);
  });
});

describe("generateShortCode", () => {
  it("makes 6-char codes from the unambiguous alphabet", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateShortCode();
      expect(code).toHaveLength(6);
      expect(code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]+$/); // no 0/O/1/I/L
    }
  });
});
