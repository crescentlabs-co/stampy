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

/** Wraps a payload as "payload.signature". Every cookie we issue has this shape. */
function seal(payload: string): string {
  return `${payload}.${sign(payload)}`;
}

/**
 * Checks the signature on a "payload.signature" cookie and returns the payload,
 * or null if it was forged or tampered with. The expiry lives INSIDE the payload
 * so rewriting it invalidates the signature — callers check it after unsealing.
 */
function unseal(value: string | undefined): string | null {
  if (!value) return null;
  const i = value.lastIndexOf(".");
  if (i < 0) return null;
  const payload = value.slice(0, i);
  const sig = Buffer.from(value.slice(i + 1));
  const expected = Buffer.from(sign(payload));
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return null;
  return payload;
}

/** True when an expiry field from a payload is present and still in the future. */
function fresh(expiresStr: string | undefined): boolean {
  return Boolean(expiresStr) && Number(expiresStr) >= Date.now();
}

export function createSessionCookie(ownerId: string): string {
  return seal(`${ownerId}.${Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000}`);
}

export function parseSessionCookie(value: string | undefined): string | null {
  const payload = unseal(value);
  if (payload === null) return null;
  const [ownerId, expiresStr] = payload.split(".");
  if (!ownerId || !fresh(expiresStr)) return null;
  return ownerId;
}

// -------------------------------------------------------- customer cookie ----

/**
 * Who this browser is at one merchant.
 *
 * This replaces a per-CARD cookie that held a serial, and fixes two things at
 * once. A browser that adds the card on Apple and then on Google used to become
 * two unrelated customers at the same shop; and a merchant running two cards
 * used to see one person as two. Now both resolve to one `customers` row.
 *
 * It identifies a BROWSER, not a person — a new phone reads as a new customer.
 * That is the deliberate cost of collecting no name, email or phone, which is
 * what the privacy page promises.
 *
 * Signed like every other cookie here: an unsigned one could be edited to claim
 * somebody else's customer id and, with it, their card.
 */
const ENROLL_DAYS = 400;

export function customerCookieName(merchantId: string): string {
  return `stampy_cust_${safeId(merchantId)}`;
}

export function createCustomerCookie(customerId: string): string {
  return seal(`${customerId}.${Date.now() + ENROLL_DAYS * 24 * 60 * 60 * 1000}`);
}

/** The customer this browser already is at `merchantId`, or null. */
export function readCustomerCookie(req: Request, merchantId: string): string | null {
  const payload = unseal(readCookie(req, customerCookieName(merchantId)));
  if (payload === null) return null;
  const [customerId, expiresStr] = payload.split(".");
  if (!customerId || !fresh(expiresStr)) return null;
  return customerId;
}

export function setCustomerCookie(res: Response, merchantId: string, customerId: string): void {
  const value = createCustomerCookie(customerId);
  res.append(
    "Set-Cookie",
    `${customerCookieName(merchantId)}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ENROLL_DAYS * 24 * 60 * 60}`,
  );
}

// ------------------------------------------------- site analytics cookie ----

/**
 * An anonymous per-browser id for marketing-page traffic, and an opt-out beside
 * it.
 *
 * NOT sealed, unlike every other cookie in this file. The others authorise
 * something, so a forged one would matter; this one names nobody and grants
 * nothing, and signing it would only imply it carries more than it does. It is
 * a random string that means nothing anywhere else — there is no lookup that
 * turns it into a person, which is what lets the privacy page keep its promise.
 *
 * Names are new, so they are free of the stampy_ prefix that CLAUDE.md pins.
 * They still must never be renamed once shipped: a rename resets every
 * returning-visitor count and silently un-opts-out anyone who had opted out.
 */
const DEVICE_COOKIE = "pm_device";
const OPTOUT_COOKIE = "pm_noanalytics";
const DEVICE_DAYS = 400;

export function readDeviceId(req: Request): string | null {
  const raw = readCookie(req, DEVICE_COOKIE);
  return raw && /^[a-z0-9]{8,40}$/.test(raw) ? raw : null;
}

export function setDeviceId(res: Response, deviceId: string): void {
  res.append(
    "Set-Cookie",
    `${DEVICE_COOKIE}=${deviceId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${DEVICE_DAYS * 24 * 60 * 60}`,
  );
}

/** True when this browser asked not to be counted. Checked before anything is written. */
export function hasAnalyticsOptOut(req: Request): boolean {
  return readCookie(req, OPTOUT_COOKIE) === "1";
}

/**
 * Opting out also clears the device id, so the cookie left behind says only
 * "do not count me" and holds nothing else.
 */
export function setAnalyticsOptOut(res: Response): void {
  res.append(
    "Set-Cookie",
    `${OPTOUT_COOKIE}=1; Path=/; HttpOnly; SameSite=Lax; Max-Age=${10 * 365 * 24 * 60 * 60}`,
  );
  res.append("Set-Cookie", `${DEVICE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

// ----------------------------------------------- LEGACY enrollment cookie ----

/**
 * The pre-v1.3 cookie: one per card, holding a serial, 400 days long.
 *
 * **Do not delete this reader.** Customers are still walking around with these,
 * and they outlive any release. If a returning browser's old cookie is ignored,
 * it mints a brand-new card on its next scan — silently, for everyone at once,
 * stranding the card already in their wallet. The join flow reads it to adopt
 * the existing customer, then writes the new cookie instead.
 */

/** Strips anything unsafe in a Set-Cookie name; café ids are alphanumeric anyway. */
function safeId(cardId: string): string {
  return cardId.replace(/[^A-Za-z0-9_-]/g, "");
}

export function enrollCookieName(cardId: string): string {
  return `stampy_card_${safeId(cardId)}`;
}

export function createEnrollCookie(serial: string): string {
  return seal(`${serial}.${Date.now() + ENROLL_DAYS * 24 * 60 * 60 * 1000}`);
}

/** The serial previously issued to this browser for `cardId`, or null. */
export function readEnrollCookie(req: Request, cardId: string): string | null {
  const payload = unseal(readCookie(req, enrollCookieName(cardId)));
  if (payload === null) return null;
  const [serial, expiresStr] = payload.split(".");
  if (!serial || !fresh(expiresStr)) return null;
  return serial;
}

export function setEnrollCookie(res: Response, cardId: string, serial: string): void {
  const value = createEnrollCookie(serial);
  res.append(
    "Set-Cookie",
    `${enrollCookieName(cardId)}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ENROLL_DAYS * 24 * 60 * 60}`,
  );
}

// ---------------------------------------------------------- staff session ----

/**
 * A staff device's proof that it typed the PIN, replacing the old scheme where
 * the PIN itself was replayed in a header on every request and kept in
 * localStorage forever. Three things change:
 *
 *  - the PIN crosses the wire once, at sign-in, instead of on every stamp;
 *  - the cookie is HttpOnly, so page scripts can't read it back out;
 *  - it expires, so a phone that leaves the café stops working on its own.
 *
 * The payload carries a per-device id, which becomes the `actor` on every event
 * that device causes — that's what makes counter abuse attributable — plus the
 * owner's session epoch, so changing the PIN signs every phone out at once.
 *
 * The session is scoped to the OWNER, not to one café: a counter running two
 * cards is still one counter, and the staff there typed one PIN. Which card is
 * being stamped travels separately, on each request, and is checked against the
 * owner's cards.
 */
const STAFF_DAYS = 14;

export interface StaffSession {
  deviceId: string;
  /** Must still match the owner's `staff_session_epoch`; the caller checks it. */
  epoch: number;
}

export function staffCookieName(ownerId: string): string {
  return `stampy_staff_${safeId(ownerId)}`;
}

/** A short, non-guessable id for one staff phone. Recorded on its events. */
export function newStaffDeviceId(): string {
  return randomBytes(5).toString("hex");
}

export function createStaffCookie(ownerId: string, deviceId: string, epoch: number): string {
  return seal(`${ownerId}.${deviceId}.${epoch}.${Date.now() + STAFF_DAYS * 24 * 60 * 60 * 1000}`);
}

/**
 * This device's staff session for `ownerId`, or null. The owner id is inside the
 * signed payload as well as the cookie name, so a valid cookie for one owner
 * can't be renamed and replayed against another.
 */
export function readStaffCookie(req: Request, ownerId: string): StaffSession | null {
  const payload = unseal(readCookie(req, staffCookieName(ownerId)));
  if (payload === null) return null;
  const [signedOwnerId, deviceId, epochStr, expiresStr] = payload.split(".");
  if (signedOwnerId !== ownerId || !deviceId || !epochStr || !fresh(expiresStr)) return null;
  const epoch = Number(epochStr);
  return Number.isInteger(epoch) ? { deviceId, epoch } : null;
}

export function setStaffCookie(res: Response, ownerId: string, deviceId: string, epoch: number): void {
  const value = createStaffCookie(ownerId, deviceId, epoch);
  res.append(
    "Set-Cookie",
    `${staffCookieName(ownerId)}=${encodeURIComponent(value)}; Path=/staff; HttpOnly; SameSite=Lax; Max-Age=${STAFF_DAYS * 24 * 60 * 60}`,
  );
}

export function clearStaffCookie(res: Response, ownerId: string): void {
  res.append("Set-Cookie", `${staffCookieName(ownerId)}=; Path=/staff; HttpOnly; SameSite=Lax; Max-Age=0`);
}

/**
 * Which owners this device already holds a valid staff session for.
 *
 * Needed because a staff phone can arrive at a bare `/staff` — bookmarked, typed,
 * or an old link — with no café in the URL, and we must NOT fall back to "whatever
 * café is called default", which on a multi-merchant deployment belongs to a
 * stranger. The owner id is read out of the SIGNED payload, never from the cookie
 * name, and the name is then required to match, so a renamed cookie proves nothing.
 */
export function staffCookieOwners(req: Request): string[] {
  const header = req.get("cookie") ?? "";
  const owners: string[] = [];
  for (const part of header.split(";")) {
    const name = part.trim().split("=")[0] ?? "";
    if (!name.startsWith("stampy_staff_")) continue;
    const payload = unseal(readCookie(req, name));
    if (payload === null) continue;
    const [ownerId, deviceId, epochStr, expiresStr] = payload.split(".");
    if (!ownerId || !deviceId || !epochStr || !fresh(expiresStr)) continue;
    if (staffCookieName(ownerId) !== name) continue; // renamed → not this owner's
    owners.push(ownerId);
  }
  return owners;
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

// ------------------------------------------------------- test-card links ----

/** Half an hour: long enough to walk to a phone, short enough not to be shared. */
const TEST_LINK_MS = 30 * 60 * 1000;

/**
 * A signed, expiring link that mints a TEST pass for one card.
 *
 * Signed rather than a plain `?test=1`, because a test pass is excluded from
 * every customer count — an open query parameter would let anybody issue
 * themselves a card that the shop never sees, which is a hole in the numbers
 * dressed up as a feature. Only the dashboard and the console can mint one, and
 * only for a card they are already authorised to open.
 */
export function createTestPassToken(cardId: string): string {
  return seal(`${cardId}.${Date.now() + TEST_LINK_MS}`);
}

/** The card this token is good for, or null if it is forged, stale or for another card. */
export function readTestPassToken(token: string | undefined, cardId: string): boolean {
  const payload = unseal(token);
  if (payload === null) return false;
  const dot = payload.lastIndexOf(".");
  if (dot < 1) return false;
  const [id, expiresStr] = [payload.slice(0, dot), payload.slice(dot + 1)];
  return id === cardId && fresh(expiresStr);
}
