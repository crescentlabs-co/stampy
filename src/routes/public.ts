/**
 * Customer-facing routes:
 *   GET /            landing page ("Add to Apple Wallet")
 *   GET /enroll      issues a brand-new card and streams the signed .pkpass
 *   GET /qr          PNG QR code of the landing URL — print this for the counter
 *
 * Every /enroll hit creates a fresh card (thin slice: no dedupe; a returning
 * customer just keeps using the card already in their Wallet).
 */
import { Router } from "express";
import { randomBytes, randomUUID } from "node:crypto";
import QRCode from "qrcode";
import { CAFE, config, setupStatus } from "../config.js";
import { createPass } from "../db.js";
import { buildPkpass, NotConfiguredError } from "../passBuilder.js";
import { landingPage, notReadyPage } from "../pages.js";

export const publicRouter = Router();

publicRouter.get("/", (_req, res) => {
  res.type("html").send(landingPage(CAFE, setupStatus().canSignPasses));
});

publicRouter.get("/enroll", async (_req, res) => {
  if (!setupStatus().canSignPasses) {
    return void res.status(503).type("html").send(notReadyPage());
  }
  const row = await createPass({
    serial: randomUUID(),
    authToken: randomBytes(24).toString("base64url"), // Apple requires ≥16 chars
    stampCount: Math.min(CAFE.stampsStart, CAFE.stampsTarget), // endowed progress
    stampsTarget: CAFE.stampsTarget,
    reward: CAFE.reward,
  });
  try {
    const pkpass = buildPkpass(row);
    res
      .status(200)
      .set("Content-Type", "application/vnd.apple.pkpass")
      .set("Content-Disposition", `attachment; filename="${CAFE.name.replace(/[^\w ]/g, "")}.pkpass"`)
      .send(pkpass);
  } catch (err) {
    if (err instanceof NotConfiguredError) {
      return void res.status(503).type("html").send(notReadyPage());
    }
    throw err;
  }
});

publicRouter.get("/qr", async (_req, res) => {
  const target = `${config.baseUrl || ""}/` || "/";
  const png = await QRCode.toBuffer(target, {
    type: "png",
    width: 900,
    margin: 2,
    errorCorrectionLevel: "M",
  });
  res.set("Content-Type", "image/png").send(png);
});
