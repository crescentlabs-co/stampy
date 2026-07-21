/**
 * Public routes. `/` is the product marketing page. Each café has its own
 * Add-to-Wallet landing/enroll/QR under /c/:cafeId (the default café lives at
 * /c/default); the bare /enroll and /qr still target the default café.
 *
 *   GET /            Stampy marketing landing page
 *   GET /c/:cafeId   Add-to-Wallet landing page for a café (default = /c/default)
 *   GET /enroll      issues a brand-new card and streams the signed .pkpass
 *   GET /qr          PNG QR code of the default café's Add-to-Wallet page
 *
 * Every enroll hit creates a fresh card (no dedupe; a returning customer just
 * keeps using the card already in their Wallet).
 */
import { Router } from "express";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import { config, setupStatus } from "../config.js";
import {
  createPass,
  DEFAULT_CAFE_ID,
  generateShortCode,
  getCafe,
  getCafeBanner,
  getCafeLogo,
  logEvent,
  type CafeRow,
  type Platform,
} from "../db.js";
import { createObject, ensureClass, saveJwtUrl } from "../googleWallet.js";
import { buildPkpass, NotConfiguredError } from "../passBuilder.js";
import { landingPage, marketingPage, notReadyPage, privacyPage, termsPage } from "../pages.js";

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
  const s = setupStatus();
  res.type("html").send(landingPage(cafe, s.canSignPasses, s.canGoogleWallet, cafeId));
}

async function newPass(cafe: CafeRow, platform: Platform) {
  const row = await createPass({
    serial: randomUUID(),
    cafeId: cafe.id,
    platform,
    shortCode: generateShortCode(),
    authToken: randomBytes(24).toString("base64url"), // Apple requires ≥16 chars
    stampCount: Math.min(cafe.stamps_start, cafe.stamps_target), // endowed progress
    stampsTarget: cafe.stamps_target,
    reward: cafe.reward,
  });
  await logEvent(cafe.id, row.serial, "enroll");
  return row;
}

async function enroll(cafeId: string, res: import("express").Response): Promise<void> {
  if (!setupStatus().canSignPasses) {
    return void res.status(503).type("html").send(notReadyPage());
  }
  const cafe = await findCafe(cafeId);
  if (cafe === "no-db" || !cafe) {
    return void res.status(cafe === "no-db" ? 503 : 404).type("html").send(notReadyPage());
  }

  const row = await newPass(cafe, "apple");
  try {
    const [logo, banner] = await Promise.all([
      getCafeLogo(cafe.id).catch(() => null),
      getCafeBanner(cafe.id).catch(() => null),
    ]);
    const pkpass = buildPkpass(row, cafe, logo?.png, banner?.png);
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

/** Android path: create the pass, mirror it into Google's system, then redirect
 * the phone to the "Save to Google Wallet" URL. */
async function enrollGoogle(cafeId: string, res: import("express").Response): Promise<void> {
  if (!setupStatus().canGoogleWallet) {
    return void res.status(503).type("html").send(notReadyPage());
  }
  const cafe = await findCafe(cafeId);
  if (cafe === "no-db" || !cafe) {
    return void res.status(cafe === "no-db" ? 503 : 404).type("html").send(notReadyPage());
  }

  const row = await newPass(cafe, "google");
  const clsResult = await ensureClass(cafe);
  const objResult = await createObject(row, cafe);
  const url = saveJwtUrl(row, cafe);
  if (!clsResult.ok || !objResult.ok || !url) {
    console.error("[enroll-google] failed:", clsResult, objResult);
    return void res.status(502).type("html").send(notReadyPage());
  }
  res.redirect(302, url);
}

async function qrPng(cafeId: string, res: import("express").Response): Promise<void> {
  // `/` is now the marketing page, so every café's counter QR (incl. the
  // default) points at its own Add-to-Wallet page under /c/:id.
  const path = `/c/${cafeId}`;
  const target = `${config.baseUrl || ""}${path}` || path;
  const png = await QRCode.toBuffer(target, {
    type: "png",
    width: 900,
    margin: 2,
    errorCorrectionLevel: "M",
  });
  res.set("Content-Type", "image/png").send(png);
}

publicRouter.get("/", (_req, res) => res.type("html").send(marketingPage()));
publicRouter.get("/privacy", (_req, res) => res.type("html").send(privacyPage(config.contactEmail)));
publicRouter.get("/terms", (_req, res) => res.type("html").send(termsPage(config.contactEmail)));
publicRouter.get("/c/:cafeId", (req, res) => landing(req.params.cafeId!, res));
publicRouter.get("/enroll", (_req, res) => enroll(DEFAULT_CAFE_ID, res));
publicRouter.get("/c/:cafeId/enroll", (req, res) => enroll(req.params.cafeId!, res));
publicRouter.get("/enroll/google", (_req, res) => enrollGoogle(DEFAULT_CAFE_ID, res));
publicRouter.get("/c/:cafeId/enroll/google", (req, res) => enrollGoogle(req.params.cafeId!, res));
publicRouter.get("/qr", (_req, res) => qrPng(DEFAULT_CAFE_ID, res));
publicRouter.get("/c/:cafeId/qr", (req, res) => qrPng(req.params.cafeId!, res));

// Publicly served logo — Google Wallet requires a hosted programLogo URL.
// Per-café: an uploaded logo from the database, else the bundled default.
let defaultLogoCache: Buffer | null = null;
function defaultLogo(): Buffer {
  if (!defaultLogoCache) {
    defaultLogoCache = readFileSync(
      fileURLToPath(new URL("../../assets/pass/logo@2x.png", import.meta.url)),
    );
  }
  return defaultLogoCache;
}

async function serveLogo(cafeId: string, res: import("express").Response): Promise<void> {
  // Any failure (no DB yet, no upload) falls back to the default art — the
  // route must work in setup mode too.
  const uploaded = await getCafeLogo(cafeId).catch(() => null);
  res
    .set("Content-Type", "image/png")
    .set("Cache-Control", "public, max-age=86400")
    .send(uploaded?.png ?? defaultLogo());
}

publicRouter.get("/art/logo.png", (_req, res) => serveLogo(DEFAULT_CAFE_ID, res));
publicRouter.get("/c/:cafeId/art/logo.png", (req, res) => serveLogo(req.params.cafeId!, res));

// Banner is optional — 404 when the café hasn't set one (Google only fetches
// it when the class references it, which it only does when a banner exists).
async function serveBanner(cafeId: string, res: import("express").Response): Promise<void> {
  const banner = await getCafeBanner(cafeId).catch(() => null);
  if (!banner) return void res.status(404).end();
  res.set("Content-Type", "image/png").set("Cache-Control", "public, max-age=86400").send(banner.png);
}

publicRouter.get("/art/banner.png", (_req, res) => serveBanner(DEFAULT_CAFE_ID, res));
publicRouter.get("/c/:cafeId/art/banner.png", (req, res) => serveBanner(req.params.cafeId!, res));
