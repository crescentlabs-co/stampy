/**
 * Customer-facing routes. Multi-café: each café has its own landing/enroll/QR
 * under /c/:cafeId; the bare paths (/, /enroll, /qr) serve the default café so
 * v0.1 links and printed QRs keep working.
 *
 *   GET /            landing page for the default café
 *   GET /c/:cafeId   landing page for a café
 *   GET /enroll      issues a brand-new card and streams the signed .pkpass
 *   GET /qr          PNG QR code of the landing URL — print this for the counter
 *
 * Every enroll hit creates a fresh card (no dedupe; a returning customer just
 * keeps using the card already in their Wallet).
 */
import { Router } from "express";
import { randomBytes, randomUUID } from "node:crypto";
import QRCode from "qrcode";
import { config, setupStatus } from "../config.js";
import {
  createPass,
  DEFAULT_CAFE_ID,
  generateShortCode,
  getCafe,
  logEvent,
  type CafeRow,
} from "../db.js";
import { buildPkpass, NotConfiguredError } from "../passBuilder.js";
import { landingPage, notReadyPage } from "../pages.js";

export const publicRouter = Router();

/** null = café doesn't exist (404); "no-db" = setup mode, database not connected yet (503). */
async function findCafe(cafeId: string): Promise<CafeRow | null | "no-db"> {
  try {
    return await getCafe(cafeId);
  } catch {
    return "no-db";
  }
}

async function landing(cafeId: string, res: import("express").Response): Promise<void> {
  const cafe = await findCafe(cafeId);
  if (cafe === "no-db") return void res.status(503).type("html").send(notReadyPage());
  if (!cafe) return void res.status(404).type("html").send(notReadyPage());
  res.type("html").send(landingPage(cafe, setupStatus().canSignPasses, cafeId));
}

async function enroll(cafeId: string, res: import("express").Response): Promise<void> {
  if (!setupStatus().canSignPasses) {
    return void res.status(503).type("html").send(notReadyPage());
  }
  const cafe = await findCafe(cafeId);
  if (cafe === "no-db" || !cafe) {
    return void res.status(cafe === "no-db" ? 503 : 404).type("html").send(notReadyPage());
  }

  const row = await createPass({
    serial: randomUUID(),
    cafeId: cafe.id,
    shortCode: generateShortCode(),
    authToken: randomBytes(24).toString("base64url"), // Apple requires ≥16 chars
    stampCount: Math.min(cafe.stamps_start, cafe.stamps_target), // endowed progress
    stampsTarget: cafe.stamps_target,
    reward: cafe.reward,
  });
  await logEvent(cafe.id, row.serial, "enroll");
  try {
    const pkpass = buildPkpass(row, cafe);
    res
      .status(200)
      .set("Content-Type", "application/vnd.apple.pkpass")
      .set("Content-Disposition", `attachment; filename="${cafe.name.replace(/[^\w ]/g, "")}.pkpass"`)
      .send(pkpass);
  } catch (err) {
    if (err instanceof NotConfiguredError) {
      return void res.status(503).type("html").send(notReadyPage());
    }
    throw err;
  }
}

async function qrPng(cafeId: string, res: import("express").Response): Promise<void> {
  const path = cafeId === DEFAULT_CAFE_ID ? "/" : `/c/${cafeId}`;
  const target = `${config.baseUrl || ""}${path}` || path;
  const png = await QRCode.toBuffer(target, {
    type: "png",
    width: 900,
    margin: 2,
    errorCorrectionLevel: "M",
  });
  res.set("Content-Type", "image/png").send(png);
}

publicRouter.get("/", (_req, res) => landing(DEFAULT_CAFE_ID, res));
publicRouter.get("/c/:cafeId", (req, res) => landing(req.params.cafeId!, res));
publicRouter.get("/enroll", (_req, res) => enroll(DEFAULT_CAFE_ID, res));
publicRouter.get("/c/:cafeId/enroll", (req, res) => enroll(req.params.cafeId!, res));
publicRouter.get("/qr", (_req, res) => qrPng(DEFAULT_CAFE_ID, res));
publicRouter.get("/c/:cafeId/qr", (req, res) => qrPng(req.params.cafeId!, res));
