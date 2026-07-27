/**
 * Public routes. `/` is the product marketing page. Each café has its own
 * Add-to-Wallet landing/enroll/QR under /c/:cardId (the default café lives at
 * /c/default); the bare /enroll and /qr still target the default café.
 *
 *   GET /            Stampy marketing landing page
 *   GET /c/:cardId   Add-to-Wallet landing page for a café (default = /c/default)
 *   GET /enroll      issues a brand-new card and streams the signed .pkpass
 *   GET /qr          PNG QR code of the default café's Add-to-Wallet page
 *
 * Enrolling twice from the same browser re-serves the SAME card (see
 * reuseOrCreatePass) — Apple and Google key a pass on its serial, so reusing it
 * refreshes the wallet card instead of adding a duplicate one.
 */
import { Router } from "express";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import { readEnrollCookie, setEnrollCookie } from "../auth.js";
import { config, setupStatus } from "../config.js";
import {
  createPass,
  DEFAULT_CARD_ID,
  generateShortCode,
  getCard,
  getCardBanner,
  getCardLogo,
  getPass,
  getStampStrip,
  logEvent,
  type CardRow,
  type Platform,
} from "../db.js";
import { createObject, ensureClass, saveJwtUrl } from "../googleWallet.js";
import { buildPkpass, NotConfiguredError } from "../passBuilder.js";
import { landingPage, marketingPage, notReadyPage, privacyPage, termsPage } from "../pages.js";

export const publicRouter = Router();

/** null = café doesn't exist (404); "no-db" = setup mode, database not connected yet (503). */
async function findCafe(cardId: string): Promise<CardRow | null | "no-db"> {
  try {
    return await getCard(cardId);
  } catch {
    return "no-db";
  }
}

async function landing(cardId: string, res: import("express").Response): Promise<void> {
  const card = await findCafe(cardId);
  if (card === "no-db") return void res.status(503).type("html").send(notReadyPage());
  if (!card) return void res.status(404).type("html").send(notReadyPage());
  const s = setupStatus();
  res.type("html").send(landingPage(card, s.canSignPasses, s.canGoogleWallet, cardId));
}

async function newPass(card: CardRow, platform: Platform) {
  const row = await createPass({
    serial: randomUUID(),
    cardId: card.id,
    platform,
    shortCode: generateShortCode(),
    authToken: randomBytes(24).toString("base64url"), // Apple requires ≥16 chars
    stampCount: Math.min(card.stamps_start, card.stamps_target), // endowed progress
    stampsTarget: card.stamps_target,
    reward: card.reward,
  });
  await logEvent(card.id, row.serial, "enroll");
  return row;
}

/**
 * The card to serve this browser: the one we already issued it for this café if
 * the signed cookie still resolves to a live pass, otherwise a fresh one.
 *
 * Reuse deliberately logs no `enroll` event and re-grants no welcome stamps —
 * it is the same card being handed back, not a new signup. Scoped per browser,
 * so cleared cookies or another browser still mint a new card; this is data
 * hygiene (and stops duplicate cards in one wallet), not fraud prevention.
 */
async function reuseOrCreatePass(
  req: import("express").Request,
  res: import("express").Response,
  card: CardRow,
  platform: Platform,
) {
  const known = readEnrollCookie(req, card.id);
  if (known) {
    const existing = await getPass(known);
    if (existing && existing.card_id === card.id && existing.platform === platform) {
      return existing;
    }
  }
  const row = await newPass(card, platform);
  setEnrollCookie(res, card.id, row.serial);
  return row;
}

async function enroll(
  cardId: string,
  req: import("express").Request,
  res: import("express").Response,
): Promise<void> {
  if (!setupStatus().canSignPasses) {
    return void res.status(503).type("html").send(notReadyPage());
  }
  const card = await findCafe(cardId);
  if (card === "no-db" || !card) {
    return void res.status(card === "no-db" ? 503 : 404).type("html").send(notReadyPage());
  }

  const row = await reuseOrCreatePass(req, res, card, "apple");
  try {
    const filled = Math.max(0, Math.min(row.stamp_count, row.stamps_target));
    const [logo, banner, strip] = await Promise.all([
      getCardLogo(card.id).catch(() => null),
      getCardBanner(card.id).catch(() => null),
      getStampStrip(card.id, filled).catch(() => null),
    ]);
    const pkpass = buildPkpass(row, card, logo?.png, banner?.png, strip?.png);
    res
      .status(200)
      .set("Content-Type", "application/vnd.apple.pkpass")
      .set("Content-Disposition", `attachment; filename="${card.name.replace(/[^\w ]/g, "")}.pkpass"`)
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
async function enrollGoogle(
  cardId: string,
  req: import("express").Request,
  res: import("express").Response,
): Promise<void> {
  if (!setupStatus().canGoogleWallet) {
    return void res.status(503).type("html").send(notReadyPage());
  }
  const card = await findCafe(cardId);
  if (card === "no-db" || !card) {
    return void res.status(card === "no-db" ? 503 : 404).type("html").send(notReadyPage());
  }

  const row = await reuseOrCreatePass(req, res, card, "google");
  const clsResult = await ensureClass(card);
  const objResult = await createObject(row, card);
  const url = saveJwtUrl(row, card);
  if (!clsResult.ok || !objResult.ok || !url) {
    console.error("[enroll-google] failed:", clsResult, objResult);
    return void res.status(502).type("html").send(notReadyPage());
  }
  res.redirect(302, url);
}

async function qrPng(cardId: string, res: import("express").Response): Promise<void> {
  // `/` is now the marketing page, so every café's counter QR (incl. the
  // default) points at its own Add-to-Wallet page under /c/:id.
  const path = `/c/${cardId}`;
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
publicRouter.get("/c/:cardId", (req, res) => landing(req.params.cardId!, res));
publicRouter.get("/enroll", (req, res) => enroll(DEFAULT_CARD_ID, req, res));
publicRouter.get("/c/:cardId/enroll", (req, res) => enroll(req.params.cardId!, req, res));
publicRouter.get("/enroll/google", (req, res) => enrollGoogle(DEFAULT_CARD_ID, req, res));
publicRouter.get("/c/:cardId/enroll/google", (req, res) =>
  enrollGoogle(req.params.cardId!, req, res),
);
publicRouter.get("/qr", (_req, res) => qrPng(DEFAULT_CARD_ID, res));
publicRouter.get("/c/:cardId/qr", (req, res) => qrPng(req.params.cardId!, res));

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

async function serveLogo(cardId: string, res: import("express").Response): Promise<void> {
  // Any failure (no DB yet, no upload) falls back to the default art — the
  // route must work in setup mode too.
  const uploaded = await getCardLogo(cardId).catch(() => null);
  res
    .set("Content-Type", "image/png")
    .set("Cache-Control", "public, max-age=86400")
    .send(uploaded?.png ?? defaultLogo());
}

publicRouter.get("/art/logo.png", (_req, res) => serveLogo(DEFAULT_CARD_ID, res));
publicRouter.get("/c/:cardId/art/logo.png", (req, res) => serveLogo(req.params.cardId!, res));

// Banner is optional — 404 when the café hasn't set one (Google only fetches
// it when the class references it, which it only does when a banner exists).
async function serveBanner(cardId: string, res: import("express").Response): Promise<void> {
  const banner = await getCardBanner(cardId).catch(() => null);
  if (!banner) return void res.status(404).end();
  res.set("Content-Type", "image/png").set("Cache-Control", "public, max-age=86400").send(banner.png);
}

publicRouter.get("/art/banner.png", (_req, res) => serveBanner(DEFAULT_CARD_ID, res));
publicRouter.get("/c/:cardId/art/banner.png", (req, res) => serveBanner(req.params.cardId!, res));

// Rendered stamp-grid strip for a given filled count — Google fetches this as
// the hero image (Apple embeds the bytes directly). 404 when the café hasn't
// set a stamp style (Google only references it when strips exist).
async function serveStampStrip(cardId: string, filled: number, res: import("express").Response): Promise<void> {
  const strip = await getStampStrip(cardId, filled).catch(() => null);
  if (!strip) return void res.status(404).end();
  res.set("Content-Type", "image/png").set("Cache-Control", "public, max-age=86400").send(strip.png);
}

publicRouter.get("/art/stamps/:filled.png", (req, res) =>
  serveStampStrip(DEFAULT_CARD_ID, Number(req.params.filled) || 0, res));
publicRouter.get("/c/:cardId/art/stamps/:filled.png", (req, res) =>
  serveStampStrip(req.params.cardId!, Number(req.params.filled) || 0, res));
