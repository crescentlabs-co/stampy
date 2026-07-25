import { describe, expect, it } from "vitest";
import type { Request } from "express";
import {
  createEnrollCookie,
  createSessionCookie,
  enrollCookieName,
  hashPassword,
  parseSessionCookie,
  readEnrollCookie,
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

describe("generateShortCode", () => {
  it("makes 6-char codes from the unambiguous alphabet", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateShortCode();
      expect(code).toHaveLength(6);
      expect(code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]+$/); // no 0/O/1/I/L
    }
  });
});
