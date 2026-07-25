/**
 * Staff-facing routes. A device types the café PIN once at /staff/api/login and
 * gets a signed, HttpOnly, expiring session cookie; every later request is
 * authorised by that cookie, not by replaying the PIN. Multi-café: requests
 * carry x-cafe-id (or ?c= on the page); the session is scoped to that café.
 *
 *   GET  /staff                    login form, or the stamper once signed in
 *   POST /staff/api/login          { pin } → staff session cookie
 *   POST /staff/api/logout         drop this device's session
 *   GET  /staff/api/passes         recent cards as JSON
 *   GET  /staff/api/lookup?code=   find one card by its printed code
 *   POST /staff/api/stamp          { serial } → +1 stamp → push   (scanner path)
 *   POST /staff/api/stamp-by-code  { code }   → resolve short code → +1 stamp (typed fallback)
 *   POST /staff/api/undo           { serial } → −1 stamp → push   (fix a mis-scan)
 *   POST /staff/api/redeem         { serial } → restart the card → push
 *
 * Every card change records which device did it (`actor`), so a busy counter is
 * auditable after the fact. Nudges are an OWNER action — dashboard, not here.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  clearStaffCookie,
  newStaffDeviceId,
  readStaffCookie,
  setStaffCookie,
} from "../auth.js";
import { applyAndPush } from "../cardActions.js";
import { clear, hit, peek } from "../rateLimit.js";
import {
  addStamps,
  DEFAULT_CAFE_ID,
  getCafe,
  getPass,
  getPassByShortCode,
  lastStampAt,
  listRecentPasses,
  redeemPass,
  verifyStaffPin,
  type CafeRow,
  type EventType,
  type PassRow,
} from "../db.js";
import { isRewardReady, stampDots } from "../passModel.js";
import { staffPage } from "../pages.js";

export const staffRouter = Router();

/**
 * Anti-spam: after a card is stamped, a repeat stamp on the SAME card inside
 * this window is refused unless the staff explicitly confirm (force:true). Stops
 * accidental/abusive rapid taps while still allowing a genuine "two coffees"
 * with a deliberate second tap. A forced stamp is flagged in the audit log.
 * Only stamping is throttled — redeem/undo aren't.
 */
const STAMP_COOLDOWN_MS = 60_000;

// PIN attempts, deliberately loose and failure-only: only a WRONG PIN counts, so
// a busy shift never approaches the limit. A café's wifi often shares one IP
// across every staff phone — we just want to stop an automated script.
const PIN_TRIES = 20;
const PIN_WINDOW_MS = 10 * 60_000;

interface StaffRequest extends Request {
  cafe?: CafeRow;
  /** Which staff phone this is — recorded as the actor on every event it causes. */
  deviceId?: string;
}

/** The café this request is about: the API header, or ?c= when loading the page. */
function cafeIdOf(req: Request): string {
  return req.get("x-cafe-id") || String(req.query.c ?? "") || DEFAULT_CAFE_ID;
}

/**
 * Seconds left in the cooldown for this card, or 0 if it's clear. Returns 0 for
 * a card that isn't this café's (or doesn't exist) so the stamp path proceeds to
 * applyAndPush, which is the one place that maps that to a 404.
 */
async function stampCooldownLeft(serial: string, cafeId: string): Promise<number> {
  const pass = await getPass(serial);
  if (!pass || pass.cafe_id !== cafeId) return 0;
  const last = await lastStampAt(serial);
  if (!last) return 0;
  const left = STAMP_COOLDOWN_MS - (Date.now() - new Date(last).getTime());
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

/** Gate for everything that touches cards: a valid staff session for this café. */
async function requireStaff(req: StaffRequest, res: Response, next: NextFunction): Promise<void> {
  const cafeId = cafeIdOf(req);
  const session = readStaffCookie(req, cafeId);
  if (!session) return void res.status(401).json({ error: "not-signed-in" });
  const cafe = await getCafe(cafeId);
  if (!cafe) return void res.status(404).json({ error: "no-such-cafe" });
  // A PIN change bumps the café's epoch, which strands every older cookie —
  // that's how the owner revokes a phone or a leaked stamper link.
  if (session.epoch !== cafe.staff_session_epoch) {
    return void res.status(401).json({ error: "session-revoked" });
  }
  req.cafe = cafe;
  req.deviceId = session.deviceId;
  next();
}

/** Everything this device does is attributed to it in the events log. */
const actorOf = (req: StaffRequest) => `staff:${req.deviceId}`;

/** Exchange the café PIN for a session cookie. The only place the PIN is read. */
staffRouter.post("/api/login", async (req, res) => {
  const cafeId = cafeIdOf(req);
  const rlKey = `pin:${cafeId}:${req.ip}`;
  const peeked = peek(rlKey, PIN_TRIES, PIN_WINDOW_MS);
  if (!peeked.ok) {
    return void res
      .status(429)
      .json({ error: "too-many-attempts", retryAfterSeconds: peeked.retryAfterSeconds });
  }
  const cafe = await getCafe(cafeId);
  if (!cafe) return void res.status(404).json({ error: "no-such-cafe" });
  const pin = String((req.body ?? {}).pin ?? "");
  if (!verifyStaffPin(cafe, pin)) {
    hit(rlKey, PIN_TRIES, PIN_WINDOW_MS); // record only the failed attempt
    return void res.status(401).json({ error: "wrong-pin" });
  }
  clear(rlKey); // a correct PIN clears the counter
  setStaffCookie(res, cafeId, newStaffDeviceId(), cafe.staff_session_epoch);
  res.json({ ok: true });
});

staffRouter.post("/api/logout", (req, res) => {
  clearStaffCookie(res, cafeIdOf(req));
  res.json({ ok: true });
});

/**
 * The stamper page is only served to a signed-in device; everyone else gets the
 * PIN form. So a leaked /staff link on its own reveals nothing about the café —
 * no card list, no codes, no customer count.
 */
staffRouter.get("/", async (req, res) => {
  const cafeId = cafeIdOf(req);
  const session = readStaffCookie(req, cafeId);
  const cafe = session ? await getCafe(cafeId) : null;
  const signedIn = Boolean(session && cafe && session.epoch === cafe.staff_session_epoch);
  // A cookie that survived a PIN change would otherwise get the stamper shell,
  // fail its first API call, reload, and loop. Drop it here instead.
  if (session && !signedIn) clearStaffCookie(res, cafeId);
  res.type("html").send(staffPage(signedIn));
});

// QR-decoder fallback for browsers without BarcodeDetector (iPhone Safari).
// Served from our own node_modules — no CDN, works offline in the café.
staffRouter.get("/jsqr.js", (_req, res) => {
  res.type("application/javascript").send(loadJsQr());
});

let jsQrCache: string | null = null;
function loadJsQr(): string {
  if (jsQrCache === null) {
    const path = fileURLToPath(new URL("../../node_modules/jsqr/dist/jsQR.js", import.meta.url));
    jsQrCache = readFileSync(path, "utf8");
  }
  return jsQrCache;
}

function passView(row: PassRow) {
  return {
    serial: row.serial,
    shortId: row.serial.slice(0, 8),
    code: row.short_code,
    stamps: row.stamp_count,
    target: row.stamps_target,
    dots: stampDots(row.stamp_count, row.stamps_target),
    rewardReady: isRewardReady(row),
    reward: row.reward,
    createdAt: row.created_at,
  };
}

staffRouter.get("/api/passes", requireStaff, async (req: StaffRequest, res) => {
  const rows = await listRecentPasses(req.cafe!.id, 20);
  res.json({ passes: rows.map(passView) });
});

/** Look a card up by its printed 6-char code, without stamping it. The staff
 *  list only holds the 20 most recent cards, so filtering that list client-side
 *  could never find an older regular — this searches every card of the café. */
staffRouter.get("/api/lookup", requireStaff, async (req: StaffRequest, res) => {
  const code = String(req.query.code ?? "").trim();
  if (!code) return void res.status(400).json({ error: "missing-code" });
  const row = await getPassByShortCode(req.cafe!.id, code);
  if (!row) return void res.status(404).json({ error: "no-such-card" });
  res.json({ pass: passView(row) });
});

/** Thin HTTP wrapper over applyAndPush (src/cardActions.ts) for the staff routes. */
async function updateAndPush(
  req: StaffRequest,
  res: Response,
  serial: string,
  eventType: EventType,
  update: () => Promise<PassRow | null>,
  forced = false,
): Promise<void> {
  const result = await applyAndPush(req.cafe!, serial, eventType, update, {
    actor: actorOf(req),
    forced,
  });
  if (!result) return void res.status(404).json({ error: "no-such-card" });
  res.json({ pass: passView(result.row), push: result.push });
}

staffRouter.post("/api/stamp", requireStaff, async (req: StaffRequest, res) => {
  const { serial, force } = (req.body ?? {}) as { serial?: string; force?: boolean };
  if (!serial) return void res.status(400).json({ error: "missing-serial" });
  if (!force) {
    const secondsLeft = await stampCooldownLeft(serial, req.cafe!.id);
    if (secondsLeft > 0) return void res.status(409).json({ error: "too-soon", secondsLeft });
  }
  await updateAndPush(req, res, serial, "stamp", () => addStamps(serial, 1), force === true);
});

/** Typed-code fallback: staff keys in the short code printed on the card. */
staffRouter.post("/api/stamp-by-code", requireStaff, async (req: StaffRequest, res) => {
  const { code, force } = (req.body ?? {}) as { code?: string; force?: boolean };
  if (!code?.trim()) return void res.status(400).json({ error: "missing-code" });
  const row = await getPassByShortCode(req.cafe!.id, code);
  if (!row) return void res.status(404).json({ error: "no-such-card" });
  if (!force) {
    const secondsLeft = await stampCooldownLeft(row.serial, req.cafe!.id);
    if (secondsLeft > 0) return void res.status(409).json({ error: "too-soon", secondsLeft });
  }
  await updateAndPush(req, res, row.serial, "stamp", () => addStamps(row.serial, 1), force === true);
});

/**
 * Undo one stamp — the fix for a mis-scan. Before this, the only way to take a
 * stamp back was to redeem the card, which handed out a free reward. Logged as
 * its own event type so corrections are visible and net stamp counts stay true.
 */
staffRouter.post("/api/undo", requireStaff, async (req: StaffRequest, res) => {
  const { serial } = (req.body ?? {}) as { serial?: string };
  if (!serial) return void res.status(400).json({ error: "missing-serial" });
  await updateAndPush(req, res, serial, "undo", () => addStamps(serial, -1));
});

staffRouter.post("/api/redeem", requireStaff, async (req: StaffRequest, res) => {
  const { serial } = (req.body ?? {}) as { serial?: string };
  if (!serial) return void res.status(400).json({ error: "missing-serial" });
  await updateAndPush(req, res, serial, "redeem", () => redeemPass(serial));
});
