/**
 * Staff-facing routes, gated by the café's PIN (sent as the x-staff-pin header;
 * the page remembers it in localStorage after first entry). Multi-café: requests
 * carry x-cafe-id (default "default"); the PIN is checked against that café row.
 *
 *   GET  /staff                    the stamper page (camera scanner + recent cards)
 *   GET  /staff/api/passes         recent cards as JSON
 *   POST /staff/api/stamp          { serial } → +1 stamp → APNs push   (scanner path)
 *   POST /staff/api/stamp-by-code  { code }   → resolve short code → +1 stamp (typed fallback)
 *   POST /staff/api/redeem         { serial } → reset card to 0 → APNs push
 *   POST /staff/api/message        { serial, message } → win-back nudge → APNs push
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { pushPassUpdate } from "../apns.js";
import { addMessage, patchBalance } from "../googleWallet.js";
import {
  addStamps,
  DEFAULT_CAFE_ID,
  getCafe,
  getPass,
  getPassByShortCode,
  listRecentPasses,
  logEvent,
  pushTokensForSerial,
  redeemPass,
  setMessage,
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

/**
 * Updates the card (must belong to this café), logs the event, then delivers
 * the update to the phone — per platform:
 *   apple  → empty APNs push; the device re-fetches the pass and iOS renders
 *            the changeMessage banner.
 *   google → PATCH the LoyaltyObject (NOTIFY_ON_UPDATE) or addMessage
 *            (TEXT_AND_NOTIFY for nudges); Google delivers it.
 */
async function updateAndPush(
  req: StaffRequest,
  res: Response,
  serial: string,
  eventType: EventType,
  update: () => Promise<PassRow | null>,
  nudgeText?: string,
): Promise<void> {
  const cafe = req.cafe!;
  const existing = await getPass(serial);
  if (!existing || existing.cafe_id !== cafe.id) {
    return void res.status(404).json({ error: "no-such-card" });
  }
  const row = await update();
  if (!row) return void res.status(404).json({ error: "no-such-card" });
  await logEvent(cafe.id, serial, eventType);

  let push: {
    sent: number;
    failed: number;
    registeredDevices: number;
    detail: { status?: number; reason?: string }[];
  };
  if (row.platform === "google") {
    const result =
      eventType === "nudge" && nudgeText
        ? await addMessage(row, cafe, nudgeText)
        : await patchBalance(row, cafe);
    push = {
      sent: result.ok ? 1 : 0,
      failed: result.ok ? 0 : 1,
      registeredDevices: 1, // Google hosts the card — no per-device registrations.
      detail: [{ status: result.status, reason: result.reason }],
    };
  } else {
    const pushResults = await pushPassUpdate(await pushTokensForSerial(serial));
    push = {
      sent: pushResults.filter((r) => r.ok).length,
      failed: pushResults.filter((r) => !r.ok).length,
      // A card that was never opened on a phone has no registrations yet.
      registeredDevices: pushResults.length,
      detail: pushResults.map((r) => ({ status: r.status, reason: r.reason })),
    };
  }
  res.json({ pass: passView(row), push });
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

staffRouter.post("/api/message", requirePin, async (req: StaffRequest, res) => {
  const { serial, message } = (req.body ?? {}) as { serial?: string; message?: string };
  if (!serial || !message?.trim()) {
    return void res.status(400).json({ error: "missing-serial-or-message" });
  }
  const text = message.trim().slice(0, 200);
  await updateAndPush(req, res, serial, "nudge", () => setMessage(serial, text), text);
});
