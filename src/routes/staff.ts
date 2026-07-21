/**
 * Staff-facing routes, gated by the café's PIN (sent as the x-staff-pin header;
 * the page remembers it in localStorage after first entry). Multi-café: requests
 * carry x-cafe-id (default "default"); the PIN is checked against that café row.
 *
 *   GET  /staff                    the stamper page (camera scanner + recent cards)
 *   GET  /staff/api/passes         recent cards as JSON
 *   POST /staff/api/stamp          { serial } → +1 stamp → push   (scanner path)
 *   POST /staff/api/stamp-by-code  { code }   → resolve short code → +1 stamp (typed fallback)
 *   POST /staff/api/redeem         { serial } → reset card to 0 → push
 *
 * Nudges are an OWNER action — they live on the dashboard, not here.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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
 * with a deliberate second tap. Only stamping is throttled — redeem/nudge aren't.
 */
const STAMP_COOLDOWN_MS = 60_000;

interface StaffRequest extends Request {
  cafe?: CafeRow;
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

/** Looks up the request's café and verifies the PIN against its row (constant-time). */
async function requirePin(req: StaffRequest, res: Response, next: NextFunction): Promise<void> {
  const cafeId = req.get("x-cafe-id") || DEFAULT_CAFE_ID;
  // Brute-force guard, deliberately loose and failure-only: only a WRONG PIN
  // counts, so a busy shift stamping correctly never approaches the limit. A PIN
  // is reachable only by someone at the counter, and a café's wifi often shares
  // one IP across every staff phone — we just want to stop an automated script.
  const rlKey = `pin:${cafeId}:${req.ip}`;
  const peeked = peek(rlKey, 20, 10 * 60_000);
  if (!peeked.ok) {
    return void res.status(429).json({ error: "too-many-attempts", retryAfterSeconds: peeked.retryAfterSeconds });
  }
  const cafe = await getCafe(cafeId);
  if (!cafe) return void res.status(404).json({ error: "no-such-cafe" });
  const given = Buffer.from(req.get("x-staff-pin") ?? "");
  const expected = Buffer.from(cafe.staff_pin);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    hit(rlKey, 20, 10 * 60_000); // record only the failed attempt
    return void res.status(401).json({ error: "wrong-pin" });
  }
  clear(rlKey); // a correct PIN clears the counter
  req.cafe = cafe;
  next();
}

staffRouter.get("/", (_req, res) => {
  res.type("html").send(staffPage());
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

staffRouter.get("/api/passes", requirePin, async (req: StaffRequest, res) => {
  const rows = await listRecentPasses(req.cafe!.id, 20);
  res.json({ passes: rows.map(passView) });
});

/** Thin HTTP wrapper over applyAndPush (src/cardActions.ts) for the staff routes. */
async function updateAndPush(
  req: StaffRequest,
  res: Response,
  serial: string,
  eventType: EventType,
  update: () => Promise<PassRow | null>,
): Promise<void> {
  const result = await applyAndPush(req.cafe!, serial, eventType, update);
  if (!result) return void res.status(404).json({ error: "no-such-card" });
  res.json({ pass: passView(result.row), push: result.push });
}

staffRouter.post("/api/stamp", requirePin, async (req: StaffRequest, res) => {
  const { serial, force } = (req.body ?? {}) as { serial?: string; force?: boolean };
  if (!serial) return void res.status(400).json({ error: "missing-serial" });
  if (!force) {
    const secondsLeft = await stampCooldownLeft(serial, req.cafe!.id);
    if (secondsLeft > 0) return void res.status(409).json({ error: "too-soon", secondsLeft });
  }
  await updateAndPush(req, res, serial, "stamp", () => addStamps(serial, 1));
});

/** Typed-code fallback: staff keys in the short code printed on the card. */
staffRouter.post("/api/stamp-by-code", requirePin, async (req: StaffRequest, res) => {
  const { code, force } = (req.body ?? {}) as { code?: string; force?: boolean };
  if (!code?.trim()) return void res.status(400).json({ error: "missing-code" });
  const row = await getPassByShortCode(req.cafe!.id, code);
  if (!row) return void res.status(404).json({ error: "no-such-card" });
  if (!force) {
    const secondsLeft = await stampCooldownLeft(row.serial, req.cafe!.id);
    if (secondsLeft > 0) return void res.status(409).json({ error: "too-soon", secondsLeft });
  }
  await updateAndPush(req, res, row.serial, "stamp", () => addStamps(row.serial, 1));
});

staffRouter.post("/api/redeem", requirePin, async (req: StaffRequest, res) => {
  const { serial } = (req.body ?? {}) as { serial?: string };
  if (!serial) return void res.status(400).json({ error: "missing-serial" });
  await updateAndPush(req, res, serial, "redeem", () => redeemPass(serial));
});
