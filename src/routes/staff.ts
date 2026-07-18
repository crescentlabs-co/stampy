/**
 * Staff-facing routes, gated by a shared PIN (thin-slice auth — sent as the
 * x-staff-pin header; the page remembers it in localStorage after first entry).
 *
 *   GET  /staff                the stamper page (recent cards + buttons)
 *   GET  /staff/api/passes     recent cards as JSON
 *   POST /staff/api/stamp      { serial } → +1 stamp → APNs push
 *   POST /staff/api/redeem     { serial } → reset card to 0 → APNs push
 *   POST /staff/api/message    { serial, message } → win-back nudge → APNs push
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { timingSafeEqual } from "node:crypto";
import { pushPassUpdate } from "../apns.js";
import { config } from "../config.js";
import {
  addStamps,
  getPass,
  listRecentPasses,
  pushTokensForSerial,
  redeemPass,
  setMessage,
  type PassRow,
} from "../db.js";
import { isRewardReady, stampDots } from "../passModel.js";
import { staffPage } from "../pages.js";

export const staffRouter = Router();

function pinOk(req: Request): boolean {
  const given = Buffer.from(req.get("x-staff-pin") ?? "");
  const expected = Buffer.from(config.staffPin);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function requirePin(req: Request, res: Response, next: NextFunction): void {
  if (!pinOk(req)) return void res.status(401).json({ error: "wrong-pin" });
  next();
}

staffRouter.get("/", (_req, res) => {
  res.type("html").send(staffPage());
});

function passView(row: PassRow) {
  return {
    serial: row.serial,
    shortId: row.serial.slice(0, 8),
    stamps: row.stamp_count,
    target: row.stamps_target,
    dots: stampDots(row.stamp_count, row.stamps_target),
    rewardReady: isRewardReady(row),
    reward: row.reward,
    createdAt: row.created_at,
  };
}

staffRouter.get("/api/passes", requirePin, async (_req, res) => {
  const rows = await listRecentPasses(20);
  res.json({ passes: rows.map(passView) });
});

/** Updates the card then pushes to every registered device. */
async function updateAndPush(
  res: Response,
  serial: string,
  update: () => Promise<PassRow | null>,
): Promise<void> {
  const existing = await getPass(serial);
  if (!existing) return void res.status(404).json({ error: "no-such-card" });
  const row = await update();
  if (!row) return void res.status(404).json({ error: "no-such-card" });
  const pushResults = await pushPassUpdate(await pushTokensForSerial(serial));
  res.json({
    pass: passView(row),
    push: {
      sent: pushResults.filter((r) => r.ok).length,
      failed: pushResults.filter((r) => !r.ok).length,
      // A card that was never opened on a phone has no registrations yet.
      registeredDevices: pushResults.length,
      detail: pushResults.map((r) => ({ status: r.status, reason: r.reason })),
    },
  });
}

staffRouter.post("/api/stamp", requirePin, async (req, res) => {
  const { serial } = (req.body ?? {}) as { serial?: string };
  if (!serial) return void res.status(400).json({ error: "missing-serial" });
  await updateAndPush(res, serial, () => addStamps(serial, 1));
});

staffRouter.post("/api/redeem", requirePin, async (req, res) => {
  const { serial } = (req.body ?? {}) as { serial?: string };
  if (!serial) return void res.status(400).json({ error: "missing-serial" });
  await updateAndPush(res, serial, () => redeemPass(serial));
});

staffRouter.post("/api/message", requirePin, async (req, res) => {
  const { serial, message } = (req.body ?? {}) as { serial?: string; message?: string };
  if (!serial || !message?.trim()) {
    return void res.status(400).json({ error: "missing-serial-or-message" });
  }
  await updateAndPush(res, serial, () => setMessage(serial, message.trim().slice(0, 200)));
});
