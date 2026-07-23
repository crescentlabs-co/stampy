/**
 * Owner-dashboard auth, dependency-free (node:crypto only):
 *
 *  - Passwords: scrypt with a random salt, stored as "scrypt$<saltB64>$<hashB64>".
 *  - Sessions: HMAC-signed cookie "ownerId.expiryMs.signature" — no session
 *    table needed; the signature proves we issued it.
 */
import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import type { Request, Response } from "express";
import { config } from "./config.js";

// Stable if SESSION_SECRET is set; otherwise random per boot (logins reset on deploy).
const secret = config.sessionSecret || randomBytes(32).toString("hex");

// ------------------------------------------------------------- passwords ----

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64url");
  const actual = scryptSync(password, Buffer.from(saltB64, "base64url"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// -------------------------------------------------------------- sessions ----

const COOKIE = "stampy_session";
const SESSION_DAYS = 30;

function sign(payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSessionCookie(ownerId: string): string {
  const expires = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const payload = `${ownerId}.${expires}`;
  return `${payload}.${sign(payload)}`;
}

export function parseSessionCookie(value: string | undefined): string | null {
  if (!value) return null;
  const i = value.lastIndexOf(".");
  if (i < 0) return null;
  const payload = value.slice(0, i);
  const sig = Buffer.from(value.slice(i + 1));
  const expected = Buffer.from(sign(payload));
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return null;
  const [ownerId, expiresStr] = payload.split(".");
  if (!ownerId || !expiresStr || Number(expiresStr) < Date.now()) return null;
  return ownerId;
}

/** Minimal cookie-header parser (we only ever read our own cookie). */
export function readCookie(req: Request, name = COOKIE): string | undefined {
  const header = req.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

// Path=/ (not /dashboard): the same owner session also gates /admin for
// platform-admin emails (src/routes/admin.ts requireAdmin), so the cookie must
// reach both. Scoping it to /dashboard silently hid it from /admin requests —
// an owner could be fully logged in yet /admin would see no cookie at all.
export function setSessionCookie(res: Response, ownerId: string): void {
  const value = createSessionCookie(ownerId);
  res.append(
    "Set-Cookie",
    `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 24 * 60 * 60}`,
  );
}

export function clearSessionCookie(res: Response): void {
  res.append("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

/** The logged-in owner id, or null. */
export function sessionOwnerId(req: Request): string | null {
  return parseSessionCookie(readCookie(req));
}
