import { describe, expect, it } from "vitest";
import {
  createSessionCookie,
  hashPassword,
  parseSessionCookie,
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

describe("generateShortCode", () => {
  it("makes 6-char codes from the unambiguous alphabet", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateShortCode();
      expect(code).toHaveLength(6);
      expect(code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]+$/); // no 0/O/1/I/L
    }
  });
});
