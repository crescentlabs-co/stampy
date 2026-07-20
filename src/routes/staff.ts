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
import {
  addStamps,
  DEFAULT_CAFE_ID,
  getCafe,
  getPassByShortCode,
  listRecentPasses,
  redeemPass,
  type CafeRow,
  type EventType,
  type PassRow,
} from "../db.js";
import { isRewardReady, stampDots } from "../passModel.js";
import { staffPage } from "../pages.js";

export const staffRouter = Router();

interface StaffRequest extends Request {
  cafe?: CafeRow;
}

/** Looks up the request's café and verifies the PIN against its row (constant-time). */
async function requirePin(req: StaffRequest, res: Response, next: NextFunction): Promise<void> {
  const cafeId = req.get("x-cafe-id") || DEFAULT_CAFE_ID;
  const cafe = await getCafe(cafeId);
  if (!cafe) return void res.status(404).json({ error: "no-such-cafe" });
  const given = Buffer.from(req.get("x-staff-pin") ?? "");
  const expected = Buffer.from(cafe.staff_pin);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return void res.status(401).json({ error: "wrong-pin" });
  }
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
  const { serial } = (req.body ?? {}) as { serial?: string };
  if (!serial) return void res.status(400).json({ error: "missing-serial" });
  await updateAndPush(req, res, serial, "stamp", () => addStamps(serial, 1));
});

/** Typed-code fallback: staff keys in the short code printed on the card. */
staffRouter.post("/api/stamp-by-code", requirePin, async (req: StaffRequest, res) => {
  const { code } = (req.body ?? {}) as { code?: string };
  if (!code?.trim()) return void res.status(400).json({ error: "missing-code" });
  const row = await getPassByShortCode(req.cafe!.id, code);
  if (!row) return void res.status(404).json({ error: "no-such-card" });
  await updateAndPush(req, res, row.serial, "stamp", () => addStamps(row.serial, 1));
});

staffRouter.post("/api/redeem", requirePin, async (req: StaffRequest, res) => {
  const { serial } = (req.body ?? {}) as { serial?: string };
  if (!serial) return void res.status(400).json({ error: "missing-serial" });
  await updateAndPush(req, res, serial, "redeem", () => redeemPass(serial));
});
