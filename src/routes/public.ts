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
import {
  readCustomerCookie,
  readEnrollCookie,
  setCustomerCookie,
  setEnrollCookie,
} from "../auth.js";
import { config, setupStatus } from "../config.js";
import {
  createCustomer,
  createPass,
  DEFAULT_CARD_ID,
  generateShortCode,
  getCard,
  getCardBanner,
  getCardLogo,
  getCustomer,
  getPass,
  getStampStrip,
  logEvent,
  businessNameForCard,
  cardsForMerchant,
  getMerchantByRef,
  joinTargetCard,
  merchantForCard,
  passForCustomer,
  resolveCustomer,
  type CardRow,
  type CustomerRecord,
  type MerchantRow,
  type Platform,
} from "../db.js";
import { createObject, ensureClass, saveJwtUrl } from "../googleWallet.js";
import { buildPkpass, NotConfiguredError } from "../passBuilder.js";
import {
  cardPickerPage,
  landingPage,
  marketingPage,
  notReadyPage,
  privacyPage,
  privacyPageBm,
  termsPage,
} from "../pages.js";

export const publicRouter = Router();

/** null = café doesn't exist (404); "no-db" = setup mode, database not connected yet (503). */
async function findCafe(cardId: string): Promise<CardRow | null | "no-db"> {
  try {
    return await getCard(cardId);
  } catch {
    return "no-db";
  }
}

/**
 * Which wallet this phone can actually use, guessed from the User-Agent.
 *
 * Only ever used to label a `join_view`, never to decide anything: the customer
 * picks their own wallet button a moment later, and `wallet_click` records that
 * choice for real. The guess is what makes "iPhones scan but don't add" a
 * question you can ask at all — at view time nobody has chosen yet.
 */
function guessPlatform(ua: string): string {
  if (/iPhone|iPad|iPod|Mac OS X/i.test(ua)) return "apple";
  if (/Android/i.test(ua)) return "google";
  return "";
}

/** Crawlers and link-preview bots hit the join page too; keep them filterable. */
function viewMeta(req: import("express").Request): { ua: string; bot: boolean } {
  const ua = (req.get("user-agent") ?? "").slice(0, 200);
  return { ua, bot: /bot|crawler|spider|preview|facebookexternalhit|slackbot|curl|wget/i.test(ua) };
}

/**
 * The top of the funnel, and the one moment that is genuinely unrecoverable: a
 * scan nobody wrote down cannot be reconstructed from anything later. Logged
 * here rather than in each route because /j/:ref and /c/:cardId both land here,
 * so neither path can be added later without picking this up for free.
 *
 * The customer is attached only if this browser already has a cookie. A page
 * view deliberately does NOT mint a customer — every crawler that ever hits a
 * poster URL would become one, and the customer list is a real thing people
 * look at.
 */
async function landing(
  cardId: string,
  req: import("express").Request,
  res: import("express").Response,
): Promise<void> {
  const card = await findCafe(cardId);
  if (card === "no-db") return void res.status(503).type("html").send(notReadyPage());
  if (!card) return void res.status(404).type("html").send(notReadyPage());

  const s = setupStatus();
  const { ua, bot } = viewMeta(req);
  const merchant = await merchantForCard(card.id).catch(() => null);
  await logEvent(card.id, "", "join_view", {
    actor: "customer",
    source: sourceOf(req),
    merchantId: merchant?.id ?? null,
    customerId: merchant ? readCustomerCookie(req, merchant.id) : null,
    platform: guessPlatform(ua),
    metadata: { ua, bot, ref: (req.get("referer") ?? "").slice(0, 200) },
  }).catch((err) => console.error("[join_view] not logged:", err));

  res.type("html").send(landingPage(card, s.canSignPasses, s.canGoogleWallet, cardId));
}

async function newPass(card: CardRow, platform: Platform, customerId: string | null, source: string) {
  const row = await createPass({
    serial: randomUUID(),
    cardId: card.id,
    customerId,
    platform,
    shortCode: generateShortCode(),
    authToken: randomBytes(24).toString("base64url"), // Apple requires ≥16 chars
    stampCount: Math.min(card.stamps_start, card.stamps_target), // endowed progress
    stampsTarget: card.stamps_target,
    reward: card.reward,
  });
  await logEvent(card.id, row.serial, "enroll", { actor: "customer", source });
  return row;
}

/**
 * Who is this browser at this merchant? In order:
 *
 *  1. the current customer cookie;
 *  2. **the legacy per-card cookie** — a returning customer from before v1.3,
 *     whose serial we follow back to the customer that pass was backfilled onto.
 *     Skipping this step would mint everyone a duplicate card on their next
 *     scan, so it is load-bearing, not a nicety;
 *  3. a new customer.
 */
async function identifyCustomer(
  req: import("express").Request,
  res: import("express").Response,
  merchant: MerchantRow,
  card: CardRow,
): Promise<CustomerRecord> {
  const { customer, writeCookie } = await resolveCustomer(
    merchant.id,
    readCustomerCookie(req, merchant.id),
    readEnrollCookie(req, card.id),
  );
  if (writeCookie) setCustomerCookie(res, merchant.id, customer.id);
  return customer;
}

/**
 * The card to serve this browser: the one this customer already holds for this
 * card and wallet, otherwise a fresh one.
 *
 * Reuse deliberately logs no `enroll` event and re-grants no welcome stamps — it
 * is the same card being handed back, not a new signup.
 *
 * The unclaimed env-seeded card has no merchant (nobody has signed up yet), so
 * it falls back to the old per-card cookie and issues a pass with no customer.
 */
async function reuseOrCreatePass(
  req: import("express").Request,
  res: import("express").Response,
  card: CardRow,
  platform: Platform,
  source = "",
) {
  const merchant = await merchantForCard(card.id);
  if (!merchant) {
    const known = readEnrollCookie(req, card.id);
    if (known) {
      const existing = await getPass(known);
      if (existing && existing.card_id === card.id && existing.platform === platform) return existing;
    }
    const row = await newPass(card, platform, null, source);
    setEnrollCookie(res, card.id, row.serial);
    return row;
  }

  const customer = await identifyCustomer(req, res, merchant, card);
  const existing = await passForCustomer(customer.id, card.id, platform);
  if (existing) return existing;
  return newPass(card, platform, customer.id, source);
}

/** Where they came from, if the join link carried ?s= — recorded, not yet reported on. */
function sourceOf(req: import("express").Request): string {
  return String(req.query.s ?? "").trim().slice(0, 40);
}

/**
 * They tapped Add to Apple/Google Wallet. The middle of the funnel: between
 * this and `enroll` sits pass signing, and between it and `pass_added` sits the
 * customer deciding at the wallet's own Add sheet.
 *
 * Logged before anything can fail, so a 503 from unconfigured signing still
 * leaves a record that somebody tried — which is exactly the case where the
 * funnel is the thing you want to look at.
 */
async function logWalletClick(
  req: import("express").Request,
  card: CardRow,
  platform: Platform,
): Promise<void> {
  const merchant = await merchantForCard(card.id).catch(() => null);
  await logEvent(card.id, "", "wallet_click", {
    actor: "customer",
    source: sourceOf(req),
    merchantId: merchant?.id ?? null,
    customerId: merchant ? readCustomerCookie(req, merchant.id) : null,
    platform,
    metadata: { wallet: platform },
  }).catch((err) => console.error("[wallet_click] not logged:", err));
}

async function enroll(
  cardId: string,
  req: import("express").Request,
  res: import("express").Response,
): Promise<void> {
  const card = await findCafe(cardId);
  if (card === "no-db" || !card) {
    return void res.status(card === "no-db" ? 503 : 404).type("html").send(notReadyPage());
  }
  await logWalletClick(req, card, "apple");
  if (!setupStatus().canSignPasses) {
    return void res.status(503).type("html").send(notReadyPage());
  }

  const row = await reuseOrCreatePass(req, res, card, "apple", sourceOf(req));
  try {
    const filled = Math.max(0, Math.min(row.stamp_count, row.stamps_target));
    const [logo, banner, strip] = await Promise.all([
      getCardLogo(card.id).catch(() => null),
      getCardBanner(card.id).catch(() => null),
      getStampStrip(card.id, row.stamps_target, filled).catch(() => null),
    ]);
    const business = await businessNameForCard(card);
    const pkpass = buildPkpass(row, card, logo?.png, banner?.png, strip?.png, business);
    res
      .status(200)
      .set("Content-Type", "application/vnd.apple.pkpass")
      .set("Content-Disposition", `attachment; filename="${business.replace(/[^\w ]/g, "")}.pkpass"`)
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
  const card = await findCafe(cardId);
  if (card === "no-db" || !card) {
    return void res.status(card === "no-db" ? 503 : 404).type("html").send(notReadyPage());
  }
  await logWalletClick(req, card, "google");
  if (!setupStatus().canGoogleWallet) {
    return void res.status(503).type("html").send(notReadyPage());
  }

  const row = await reuseOrCreatePass(req, res, card, "google", sourceOf(req));
  const clsResult = await ensureClass(card);
  const objResult = await createObject(row, card);
  const url = saveJwtUrl(row, card);
  if (!clsResult.ok || !objResult.ok || !url) {
    console.error("[enroll-google] failed:", clsResult, objResult);
    return void res.status(502).type("html").send(notReadyPage());
  }
  res.redirect(302, url);
}

async function qrFor(path: string, res: import("express").Response): Promise<void> {
  const target = `${config.baseUrl || ""}${path}` || path;
  const png = await QRCode.toBuffer(target, {
    type: "png",
    width: 900,
    margin: 2,
    errorCorrectionLevel: "M",
  });
  res.set("Content-Type", "image/png").send(png);
}

/**
 * The card's own QR. Still generated, still points at /c/:id, and can never be
 * retired — these are printed on counters and their URL is baked into the art
 * links inside every issued Google card.
 */
const cardQr = (cardId: string, res: import("express").Response) => qrFor(`/c/${cardId}`, res);

/**
 * The MERCHANT's QR — what goes on a poster from now on.
 *
 * It encodes the merchant's permanent id rather than a name, so a rebrand, a
 * typo fix or a change of ownership can never kill a poster that is already on a
 * counter. It also survives the merchant adding a second card, which a per-card
 * QR does not: that is the whole reason it exists.
 */
const merchantQr = (merchantId: string, res: import("express").Response) =>
  qrFor(`/j/${merchantId}`, res);

publicRouter.get("/", (_req, res) => res.type("html").send(marketingPage()));
// PDPA s.7(3) wants the notice in English AND Bahasa Malaysia. One route, one
// query param, a plain <a> to switch — no JS, so the page stays script-free.
publicRouter.get("/privacy", (req, res) =>
  res
    .type("html")
    .send(
      req.query.lang === "bm" ? privacyPageBm(config.contactEmail) : privacyPage(config.contactEmail),
    ),
);
publicRouter.get("/terms", (_req, res) => res.type("html").send(termsPage(config.contactEmail)));
/**
 * The merchant join link — the one that goes on a poster.
 *
 * `:ref` is the merchant's permanent id, or any slug they have ever held: old
 * slugs keep resolving forever and redirect to the canonical form, because one
 * of them may be printed on something nobody is going to reprint.
 *
 * It then picks which card to issue — their default, or their only one — and
 * hands off to the existing per-card landing page, so nothing about how a pass
 * is minted changes. With more than one card and no default it renders a picker;
 * V1 ships one card per merchant, so that path is unreachable for now.
 */
publicRouter.get("/j/:ref", async (req, res) => {
  const ref = String(req.params.ref ?? "");
  let found: Awaited<ReturnType<typeof getMerchantByRef>>;
  try {
    found = await getMerchantByRef(ref);
  } catch {
    return void res.status(503).type("html").send(notReadyPage());
  }
  if (!found) return void res.status(404).type("html").send(notReadyPage());

  const query = req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : "";
  // A retired name still works, but shouldn't linger in the address bar.
  if (found.viaSlug) return void res.redirect(301, `/j/${found.merchant.id}${query}`);

  const card = await joinTargetCard(found.merchant);
  if (!card) {
    const cards = await cardsForMerchant(found.merchant.id);
    return void res.type("html").send(cardPickerPage(found.merchant, cards, query));
  }
  await landing(card.id, req, res);
});

publicRouter.get("/j/:ref/qr", async (req, res) => {
  const found = await getMerchantByRef(String(req.params.ref ?? ""));
  if (!found) return void res.status(404).end();
  await merchantQr(found.merchant.id, res);
});

publicRouter.get("/c/:cardId", (req, res) => landing(req.params.cardId!, req, res));
publicRouter.get("/enroll", (req, res) => enroll(DEFAULT_CARD_ID, req, res));
publicRouter.get("/c/:cardId/enroll", (req, res) => enroll(req.params.cardId!, req, res));
publicRouter.get("/enroll/google", (req, res) => enrollGoogle(DEFAULT_CARD_ID, req, res));
publicRouter.get("/c/:cardId/enroll/google", (req, res) =>
  enrollGoogle(req.params.cardId!, req, res),
);
publicRouter.get("/qr", (_req, res) => cardQr(DEFAULT_CARD_ID, res));
publicRouter.get("/c/:cardId/qr", (req, res) => cardQr(req.params.cardId!, res));

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

// Rendered stamp-grid strip for a given filled count. Apple embeds the bytes
// directly and never comes here; this URL is baked into Android cards issued
// before the hero image became the plain band (see buildLoyaltyPatch), so it is
// permanent and must keep serving something sensible.
//
// It carries no target, so it can only answer for the card's CURRENT one — which
// is right for every card except one issued under an older ruleset. Those are
// exactly the legacy Android cards above, and they stop asking on their next
// stamp, when Google is re-sent a hero URI pointing at the band instead.
async function serveStampStrip(cardId: string, filled: number, res: import("express").Response): Promise<void> {
  const card = await getCard(cardId).catch(() => null);
  if (!card) return void res.status(404).end();
  const strip = await getStampStrip(cardId, card.stamps_target, filled).catch(() => null);
  if (!strip) return void res.status(404).end();
  res.set("Content-Type", "image/png").set("Cache-Control", "public, max-age=86400").send(strip.png);
}

publicRouter.get("/art/stamps/:filled.png", (req, res) =>
  serveStampStrip(DEFAULT_CARD_ID, Number(req.params.filled) || 0, res));
publicRouter.get("/c/:cardId/art/stamps/:filled.png", (req, res) =>
  serveStampStrip(req.params.cardId!, Number(req.params.filled) || 0, res));
