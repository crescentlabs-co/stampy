/**
 * Platform-admin console — for the person who RUNS PunchMe (not café owners).
 * Gated by the owner session AND `owner.email` being in `config.adminEmails`
 * (ADMIN_EMAIL may list several, comma-separated). When ADMIN_EMAIL is unset the
 * whole console is closed (403).
 *
 *   GET    /admin                          the console page
 *   GET    /admin/m/:id                    the same page, opened on one shop
 *   GET    /admin/api/overview             every café + owner email(s) + metrics
 *   GET    /admin/api/merchant/:id/series  that shop, week by week
 *   POST   /admin/api/card/:id/archive     retire a card (reversible; nothing deleted)
 *   POST   /admin/api/card/:id/unarchive   put it back
 *   POST   /admin/api/card                 build a shop with NO login attached
 *   POST   /admin/api/merchant/:id/claim-link  mint the link that hands it over
 *   POST   /admin/api/owner/:id/reset-password  set a NEW temp password (never reveals the old)
 *
 * Accounts are NOT created here. Merchants are onboarded done-for-you: we build
 * the shop, send a claim link, and they make their own login (src/routes/claim.ts).
 *
 * Security: passwords are scrypt-hashed one-way — there is nothing to "view".
 * Reset = replace the hash with a fresh temp password, returned once.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import { createTestPassToken, hashPassword, sessionOwnerId } from "../auth.js";
import { CLAIM_TTL_MS, hashClaimToken } from "../claim.js";
import { config, setupStatus } from "../config.js";
import {
  allCards,
  allCardsWithStats,
  allOwners,
  createCard,
  adminStaffAudit,
  businessNameForCard,
  cardCounts,
  archiveCard,
  createUnclaimedMerchant,
  detachOwnerFromMerchant,
  clearClaimToken,
  getMerchant,
  hardDeleteMerchant,
  setClaimToken,
  setMerchantPaid,
  unarchiveCard,
  getCard,
  getPass,
  merchantEdits,
  demoCardFunnel,
  merchantHealth,
  siteTraffic,
  merchantSeries,
  platformSeries,
  returningRate,
  setMerchantArchived,
  setMerchantContact,
  getOwner,
  merchantForCard,
  updateMerchant,
  googleSerialsForCard,
  oldestGoogleSerials,
  cardsForMerchant,
  setStampStrips,
  updateCard,
  updateOwnerPassword,
  type OwnerRow,
} from "../db.js";
import {
  artBytes,
  ART_KIND_PATTERN,
  ART_KINDS,
  cardFieldsFromBody,
  designerCard,
  type ArtKind,
} from "../cardView.js";
import { refreshCardArt } from "../cardActions.js";
import { clearObjectHero, createObject, ensureClass, readClass, readObject } from "../googleWallet.js";
import { passBarcode } from "../passModel.js";
import { stageOf, triage, trialDaysLeft, value } from "../health.js";
import { validateArtPng } from "../imageValidate.js";
import { adminPage } from "../pages.js";

export const adminRouter = Router();

/** The widest range the console's switch offers; every shorter one is a slice. */
const SERIES_WEEKS = 26;

interface AdminRequest extends Request {
  admin?: OwnerRow;
}

async function requireAdmin(req: AdminRequest, res: Response, next: NextFunction): Promise<void> {
  if (config.adminEmails.length === 0) return void res.status(403).json({ error: "admin-closed" });
  const ownerId = sessionOwnerId(req);
  const owner = ownerId ? await getOwner(ownerId) : null;
  if (!owner || !config.adminEmails.includes(owner.email.toLowerCase())) {
    return void res.status(403).json({ error: "not-admin" });
  }
  req.admin = owner;
  next();
}

adminRouter.get("/", (_req, res) => {
  res.type("html").send(adminPage());
});

/**
 * One shop, on its own address.
 *
 * The SAME page — the console reads `location.pathname` on load and pushes
 * state thereafter, so there is one document to maintain rather than two that
 * drift. A shop's detail used to unfold inside its own table row, which meant it
 * could not be linked, bookmarked or reopened after a refresh, and browser-back
 * left the console entirely.
 *
 * An unknown id still serves the page; the browser says so once it has the list.
 */
adminRouter.get("/m/:id", (_req, res) => {
  res.type("html").send(adminPage());
});

// The counter sheet used to live here: a second printable, plain white, whose QR
// pointed at /c/:cardId. It was strictly worse than the poster — unbranded, and
// pinned to one card, so a rename or a second card broke it while the poster's
// /j/:ref kept working. Two unlabelled buttons side by side made choosing wrong
// the default. One printable now: /c/:cardId/poster.

/**
 * Everything the console renders, in one round trip.
 *
 * All four datasets are keyed on the MERCHANT, which is the unit the console
 * acts on. It used to return six, with `funnel`, `retention` and `staff` keyed
 * on the card and filtered in the browser by a merchant's `card_ids` — which
 * rendered the same facts twice on one page and had two live bugs in it: the
 * funnel existed in two implementations free to drift, and the browser read
 * only the FIRST card's retention for anyone running two.
 *
 * `cards` survives for what genuinely belongs to a programme rather than a
 * business: its permanent id, its sign-up link, and archiving it.
 *
 * `flags` is computed server-side so the rules live in one place (src/health.ts)
 * and are unit-tested without a browser or a database.
 */
adminRouter.get("/api/overview", requireAdmin, async (_req, res) => {
  const [merchants, cards, owners, returning, staff, series, traffic, demo] = await Promise.all([
    merchantHealth(),
    allCardsWithStats(),
    allOwners(),
    // ONE rate, recomputed over everyone rather than averaged from per-shop
    // rows — a rate over 3 customers and a rate over 300 do not average into
    // anything meaningful. It replaced six rates that between them answered no
    // question anybody was asking.
    returningRate(),
    adminStaffAudit(),
    // The longest range the console offers, fetched once. 26 rows of five small
    // integers is nothing on the wire, and the 4w/12w switch is then a slice
    // rather than a round trip — a range control that waits on the network
    // stops being something you flick between.
    platformSeries(SERIES_WEEKS),
    // The landing page's own numbers. Two windows fetched together, because the
    // 7-day figure alone cannot tell a quiet week from a dead page.
    Promise.all([siteTraffic(7), siteTraffic(30)]),
    Promise.all([demoCardFunnel(config.demoCardId, 7), demoCardFunnel(config.demoCardId, 30)]),
  ]);
  const withFlags = merchants.map((m) => ({
    ...m,
    flags: triage(m),
    value: value(m),
    trialLeft: trialDaysLeft(m),
    // Derived, never stored — see stageOf. Paying is NOT part of the stage:
    // paid_at travels on its own, because a shop can be paying and churning at
    // the same time and that pair is the whole point of this page.
    stage: stageOf(m),
  }));
  res.json({
    merchants: withFlags,
    cards,
    owners,
    returning,
    staff,
    series,
    traffic: { week: traffic[0], month: traffic[1] },
    demo: { week: demo[0], month: demo[1] },
  });
});

/** One shop's own weekly lines and its own returning rate, when its page opens. */
adminRouter.get("/api/merchant/:id/series", requireAdmin, async (req, res) => {
  const [series, returning] = await Promise.all([
    merchantSeries(req.params.id!, SERIES_WEEKS),
    returningRate(req.params.id!),
  ]);
  res.json({ series, returning });
});

/**
 * What Google is actually holding for this shop, and whether it can be fetched.
 *
 * The band across the bottom of an Android card is Google's `heroImage`, and
 * every way it can be blank looks identical from here: the class write silently
 * failed (every caller is `void ensureClass(...)`, so a 400 reaches Railway's
 * log and nowhere else); the class is fine but an OLD object carries its own
 * hero, which shadows it; or the URI Google holds no longer serves an image.
 * This asks Google which, instead of inferring it from our side of the wire.
 *
 * Read-only — no POST, no PATCH, so it cannot notify anyone or move a count,
 * and it is safe to press as often as you like. Secrets never come back: see
 * GoogleClassReport, which names every field it returns precisely because the
 * class holds the callback token.
 */
adminRouter.get("/api/merchant/:id/google", requireAdmin, async (req, res) => {
  const cards = await cardsForMerchant(req.params.id!);
  const report = [];
  for (const card of cards) {
    const cls = await readClass(card);
    const serials = await oldestGoogleSerials(card.id).catch(() => []);
    const objects = [];
    for (const serial of serials) objects.push(await readObject(serial));
    // The URI GOOGLE holds, fetched the way Google would fetch it. A version
    // stamp we never sent is the tell for a class that stopped updating, and a
    // 404 here is the tell for art removed after the class was written.
    report.push({ cardId: card.id, name: card.name, class: cls, objects, hero: await headArt(cls.heroUri) });
  }
  res.json({ cards: report });
});

/** HEAD the art URI Google holds. `null` when there is no URI to check. */
async function headArt(uri?: string): Promise<{ status: number; type: string; bytes: number } | null> {
  if (!uri) return null;
  try {
    const r = await fetch(uri, { method: "GET" });
    const buf = Buffer.from(await r.arrayBuffer());
    return { status: r.status, type: r.headers.get("content-type") ?? "", bytes: buf.length };
  } catch (err) {
    return { status: 0, type: String(err).slice(0, 80), bytes: 0 };
  }
}

/** What this merchant has changed about their card — the WTP signal. */
adminRouter.get("/api/merchant/:id/edits", requireAdmin, async (req, res) => {
  res.json({ edits: await merchantEdits(req.params.id!) });
});

/** Retire a business. Nothing is deleted; passes in wallets keep working. */
adminRouter.post("/api/merchant/:id/archive", requireAdmin, async (req, res) => {
  await setMerchantArchived(req.params.id!, true);
  res.json({ ok: true });
});

adminRouter.post("/api/merchant/:id/unarchive", requireAdmin, async (req, res) => {
  await setMerchantArchived(req.params.id!, false);
  res.json({ ok: true });
});

/**
 * Re-send every card's Google Wallet class, and unstick any card in a wallet
 * that is drawing its own band over the shop's.
 *
 * The class carries the things built from BASE_URL — the hosted logo and banner
 * URLs, the Terms and Privacy links, and the issuer callback URL — and none of
 * them move when the domain does. Class data renders on every object already
 * issued, so this is what makes an Android card in a wallet today pick up a new
 * domain without touching that customer's object.
 *
 * It lives here rather than only in scripts/google-resync.ts because the
 * credentials are in Railway, not on anyone's laptop: the script needs
 * GOOGLE_SERVICE_ACCOUNT_B64 exported locally, which means a private key in a
 * shell history, and invariant 2 says secrets stay in Railway's UI. Pressing a
 * button runs it where the key already is.
 *
 * Safe to press repeatedly: neither the class PATCH nor the object repair below
 * carries a notifyPreference, so both notify nobody (invariant 3), and the
 * repair sends only `heroImage`, so no stamp count can move. Sequential rather
 * than parallel — a burst of writes against one issuer is how you find a rate
 * limit you did not know about.
 */
/**
 * Push the demo card's barcode onto passes that were issued before it changed.
 *
 * The demo card's QR is a link to the landing page rather than a serial (see
 * passBarcode, src/passModel.ts). New passes get that from the moment they are
 * issued; already-issued ones do not, and the two platforms fail differently:
 *
 *  - Apple regenerates pass.json from scratch on every device fetch, so it only
 *    needs waking. refreshCardArt does that and nothing else is required.
 *  - Google writes `barcode` ONCE, at createObject. Every stamp since is a
 *    PATCH that omits it, so an existing object keeps the old serial forever
 *    unless something deliberately rewrites it. That is what makes this button
 *    exist: without it the change is live on iPhones and silently absent on
 *    Android, which is precisely the platforms-disagree state invariant 4 is
 *    there to prevent.
 *
 * createObject already answers a 409 with a full-object PATCH, which does carry
 * the barcode — so the repair is just "create it again" and needs no new Google
 * call. Each object is read first and skipped if it already holds the right
 * value, which makes the button idempotent, free to press on a healthy card,
 * and lets `fixed` mean "was wrong, now is not". Sequential, for the same
 * reason the resync below is: a burst against one issuer finds rate limits.
 *
 * Notifies nobody. createObject carries no notifyPreference (invariant 3) and
 * the stamp count is untouched.
 */
adminRouter.post("/api/demo-barcode-resync", requireAdmin, async (_req, res) => {
  const card = await getCard(config.demoCardId);
  if (!card) return void res.status(404).json({ error: "no-demo-card", id: config.demoCardId });

  // Apple first and on its own: it is a wake-up, not a write, and it cannot fail
  // in a way that should stop the Google half from running.
  const apple = await refreshCardArt(card).catch(() => null);

  const want = passBarcode(
    { serial: "", short_code: "" },
    card,
  ).message;
  let checked = 0, fixed = 0, failed = 0, skipped = 0;
  if (setupStatus().canGoogleWallet) {
    for (const serial of await googleSerialsForCard(card.id).catch(() => [])) {
      checked++;
      const obj = await readObject(serial);
      if (!obj.found) { failed++; continue; }
      if (obj.barcodeValue === want) { skipped++; continue; }
      const row = await getPass(serial);
      if (!row) { failed++; continue; }
      if ((await createObject(row, card)).ok) fixed++;
      else failed++;
    }
  }
  res.json({
    ok: true,
    cardId: card.id,
    want,
    google: { checked, fixed, skipped, failed, configured: setupStatus().canGoogleWallet },
    applePushed: apple?.sent ?? 0,
  });
});

adminRouter.post("/api/google-resync", requireAdmin, async (_req, res) => {
  if (!setupStatus().canGoogleWallet) {
    return void res.status(409).json({ error: "google-not-configured" });
  }
  const cards = await allCards();
  const results: { id: string; name: string; ok: boolean; reason: string; cleared: number }[] = [];
  for (const card of cards) {
    const r = await ensureClass(card);
    // The class is only half of it. An object's own heroImage renders OVER the
    // class's band, and every Google pass issued or stamped before c53cc79
    // still carries one — so this button could rewrite a perfect design, report
    // success, and change nothing a customer could see. Read each object first
    // and only write to the ones actually holding a stale image: that makes the
    // repair idempotent, keeps a resync of a healthy shop free, and lets the
    // count below mean "something was wrong and is now fixed".
    let cleared = 0;
    if (r.ok) {
      for (const serial of await googleSerialsForCard(card.id).catch(() => [])) {
        const obj = await readObject(serial);
        if (!obj.ownHeroUri) continue;
        if ((await clearObjectHero(serial)).ok) cleared++;
      }
    }
    results.push({
      id: card.id,
      name: card.name,
      ok: r.ok,
      reason: r.ok ? "" : (r.reason ?? ""),
      cleared,
    });
  }
  res.json({
    ok: true,
    total: results.length,
    failed: results.filter((r) => !r.ok).length,
    cleared: results.reduce((n, r) => n + r.cleared, 0),
    results,
  });
});

/** Operator-kept contact details — owners.email is a login, not a person. */
adminRouter.post("/api/merchant/:id/contact", requireAdmin, async (req, res) => {
  const b = (req.body ?? {}) as { phone?: string; note?: string };
  await setMerchantContact(req.params.id!, {
    phone: typeof b.phone === "string" ? b.phone : undefined,
    note: typeof b.note === "string" ? b.note : undefined,
  });
  res.json({ ok: true });
});

/**
 * Set a shop up: the owner account, their business and a plain card, in one
 * step. The temp password and the staff PIN come back once and are never
 * retrievable again.
 *
 * It no longer takes a design. It used to accept a colour set, a banner and a
 * whole stamp grid rendered from one of six hard-coded "business type" presets
 * (Coffee / Bubble tea / Bakery…), which was a second, poorer designer living
 * inside a signup form. The console now opens the REAL designer on the card
 * this creates — the routes below — so there is one way to design a card.
 */
adminRouter.post("/api/card", requireAdmin, async (req, res) => {
  const b = (req.body ?? {}) as { cafeName?: string; reward?: string };
  const cafeName = (b.cafeName ?? "").trim();
  if (!cafeName) return void res.status(400).json({ error: "missing-card-name" });

  const reward = (b.reward ?? "Free reward").trim().slice(0, 60) || "Free reward";
  // Merchant → card, and NO owner. The shop exists in full — its id (which the
  // /j/ poster QR encodes and can never change), its slug, its card — before
  // anybody can log into it. A claim link adds the login later.
  //
  // This used to create an owner here with a temp password, which meant we
  // invented an account for a merchant who had not given us an email yet, and
  // handed over a password nobody chose. The claim link replaces both.
  const merchant = await createUnclaimedMerchant(cafeName);
  const card = await createCard({
    merchantId: merchant.id,
    name: cafeName.slice(0, 60),
    reward,
    stampsTarget: 10,
    stampsStart: 2,
  });
  void ensureClass(card).then((r) => {
    if (!r.ok && r.reason !== "google-not-configured") console.error("[admin] google sync failed:", r);
  });
  res.json({ ok: true, cardId: card.id, merchantId: merchant.id });
});

/**
 * Mint a claim link for an unclaimed shop.
 *
 * Issuing REPLACES any link already out — that is what makes "revoke" simply
 * "issue another", and it is also why `replaced` comes back: the console has to
 * be able to warn before doing it, because the link already sitting in the
 * merchant's DM stops working the moment this runs.
 *
 * It is a credential in a DM: single-use, short-lived, and not derivable from
 * the merchant id, so knowing a shop exists tells you nothing about how to
 * claim it. It is stored readable as well as hashed — see src/claim.ts for what
 * that buys and what it costs.
 */
adminRouter.post("/api/merchant/:id/claim-link", requireAdmin, async (req, res) => {
  const merchant = await getMerchant(req.params.id!);
  if (!merchant) return void res.status(404).json({ error: "no-such-merchant" });
  if (merchant.owner_id) return void res.status(409).json({ error: "already-claimed" });
  const replaced = Boolean(merchant.claim_token_hash);
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + CLAIM_TTL_MS);
  await setClaimToken(merchant.id, token, hashClaimToken(token), expires);
  const base = config.baseUrl || `${req.protocol}://${req.get("host")}`;
  res.json({ ok: true, url: `${base}/claim/${token}`, expires, replaced });
});

/** Withdraw a link that was sent to the wrong person and not yet used. */
adminRouter.delete("/api/merchant/:id/claim-link", requireAdmin, async (req, res) => {
  await clearClaimToken(req.params.id!);
  res.json({ ok: true });
});

/**
 * Take a shop back off its owner — a link that reached the wrong person, or a
 * handover. The shop returns to unclaimed keeping its card id, its slug and its
 * /j/ poster QR, so a fresh link makes it somebody else's without any of the
 * printed things pointing at a shop that no longer exists.
 *
 * Not a delete. The owner's account survives owning nothing (see
 * detachOwnerFromMerchant) — a mis-click here must be recoverable.
 */
adminRouter.post("/api/merchant/:id/unclaim", requireAdmin, async (req, res) => {
  const merchant = await getMerchant(req.params.id!);
  if (!merchant) return void res.status(404).json({ error: "no-such-merchant" });
  // Nobody holds it, so there is nothing to take back. A clean refusal rather
  // than a silent no-op that looks like it worked.
  if (!merchant.owner_id) return void res.status(409).json({ error: "not-claimed" });
  const row = await detachOwnerFromMerchant(merchant.id);
  if (!row) return void res.status(409).json({ error: "not-claimed" });
  res.json({ ok: true });
});

/**
 * Delete a shop that never traded, owner login and all.
 *
 * The escape hatch for a demo shop, a typo, or a merchant who never showed up —
 * cases where archiving leaves an owner row holding an email address hostage:
 * login refuses it (archived) and the claim form refuses it (already an owner),
 * so the address is stuck with no console action that frees it.
 *
 * `name` must match the shop exactly. Not decoration: this is the one
 * irreversible button in the console, and the two-tap arm() on the client is
 * about mis-clicks, not about deleting the wrong row. hardDeleteMerchant
 * re-checks every guard inside its transaction regardless.
 */
adminRouter.delete("/api/merchant/:id", requireAdmin, async (req, res) => {
  const merchant = await getMerchant(req.params.id!);
  if (!merchant) return void res.status(404).json({ error: "no-such-merchant" });
  const typed = ((req.body ?? {}) as { name?: string }).name ?? "";
  if (typed.trim().toLowerCase() !== merchant.name.trim().toLowerCase()) {
    return void res.status(400).json({ error: "name-mismatch" });
  }
  const out = await hardDeleteMerchant(merchant.id);
  if (!out.ok) return void res.status(409).json({ error: out.reason });
  res.json({ ok: true, cards: out.cards, passes: out.passes, ownerEmail: out.ownerEmail });
});

/** Whether this shop is paying. The one lifecycle fact nothing else implies. */
adminRouter.post("/api/merchant/:id/paid", requireAdmin, async (req, res) => {
  const { paid } = (req.body ?? {}) as { paid?: boolean };
  await setMerchantPaid(req.params.id!, paid === true);
  res.json({ ok: true });
});

// ------------------------------------ the designer, on a merchant's own card ----
// The console renders the owner dashboard's designer (DESIGN_PANEL_JS) and can
// point it at any merchant's live card. These are the admin-gated twins of the
// dashboard's /api/card/:id family, and they are thin on purpose: the coercion
// (cardFieldsFromBody) and the response shape (designerCard) are shared, so the
// two cannot clamp a value differently and land a design that does not match
// the preview it was built against.
//
// Authorisation here is requireAdmin — NOT ownerHasCard. That is the whole
// point: the operator sets cards up on merchants' behalf.

/**
 * The console's twin of the dashboard's test link — any card, claimed or not.
 *
 * Under /design, not beside it. The shared panel builds every URL it calls from
 * env.path, which on this side is `/card/:id/design…` — so these two sat at a
 * path the panel never asks for, 404'd into an HTML page, and surfaced as
 * "Couldn't make a link" with nothing to say why. The dashboard's env.path has
 * no such segment, which is why the same code worked there.
 */
adminRouter.get("/api/card/:id/design/test-link", requireAdmin, async (req, res) => {
  const card = await getCard(req.params.id!);
  if (!card) return void res.status(404).json({ error: "no-such-card" });
  const base = config.baseUrl || `${req.protocol}://${req.get("host")}`;
  const token = createTestPassToken(card.id);
  res.json({
    ok: true,
    apple: `${base}/c/${card.id}/enroll?t=${encodeURIComponent(token)}`,
    google: `${base}/c/${card.id}/enroll/google?t=${encodeURIComponent(token)}`,
  });
});

/** The console's twin of the test QR — same path rule as above. */
adminRouter.get("/api/card/:id/design/test-qr.png", requireAdmin, async (req, res) => {
  const card = await getCard(req.params.id!);
  if (!card) return void res.status(404).end();
  const wallet = req.query.wallet === "google" ? "enroll/google" : "enroll";
  const base = config.baseUrl || `${req.protocol}://${req.get("host")}`;
  const url = `${base}/c/${card.id}/${wallet}?t=${encodeURIComponent(createTestPassToken(card.id))}`;
  const png = await QRCode.toBuffer(url, { type: "png", width: 640, margin: 2, errorCorrectionLevel: "M" });
  res.set("Content-Type", "image/png").set("Cache-Control", "no-store").send(png);
});

/** Everything the designer needs to open on this card. */
adminRouter.get("/api/card/:id/design-state", requireAdmin, async (req, res) => {
  const card = await getCard(req.params.id!);
  if (!card) return void res.status(404).json({ error: "no-such-card" });
  res.json({ ok: true, card: await designerCard(card, await businessNameForCard(card)) });
});

/**
 * How many people this card actually reaches — the number the designer's save
 * confirmation names. Same shape as the dashboard's /api/customers so the
 * shared panel can read either without knowing which page it is on.
 */
adminRouter.get("/api/card/:id/counts", requireAdmin, async (req, res) => {
  res.json({ counts: await cardCounts(req.params.id!) });
});

adminRouter.post("/api/card/:id/design", requireAdmin, async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const card = await updateCard(req.params.id!, cardFieldsFromBody(body), `admin:${(req as AdminRequest).admin!.id}`);
  if (!card) return void res.status(404).json({ error: "no-such-card" });
  // The shop name belongs to the merchant, not the card. Renaming keeps every
  // previous slug resolving, so a printed poster can never be killed by it.
  if (typeof body.shopName === "string" && body.shopName.trim()) {
    const merchant = await merchantForCard(card.id);
    if (merchant) await updateMerchant(merchant.id, { name: body.shopName.trim().slice(0, 60) });
  }
  // Both platforms, not just Google: an iPhone has to be told to come back for
  // the new art, or it keeps the old look until that customer's next stamp.
  void refreshCardArt(card);
  res.json({ ok: true });
});

// The admin twins of the dashboard's art uploads — same four kinds, same
// contract, same ART_KINDS table, so neither console can grow an image the
// other cannot set.
adminRouter.post(
  `/api/card/:id/design/:kind(${ART_KIND_PATTERN})`,
  requireAdmin,
  async (req, res) => {
    const kind = req.params.kind as ArtKind;
    const bytes = artBytes(kind, (req.body ?? {}).png);
    if (typeof bytes === "string") return void res.status(400).json({ error: bytes });
    const card = await getCard(req.params.id!);
    if (!card) return void res.status(404).json({ error: "no-such-card" });
    await ART_KINDS[kind].set(card.id, bytes);
    // Both platforms, not just Google: an iPhone has to be told to come back for
    // the new art, or it keeps the old look until that customer's next stamp.
    void refreshCardArt(card);
    res.json({ ok: true });
  },
);

adminRouter.delete(
  `/api/card/:id/design/:kind(${ART_KIND_PATTERN})`,
  requireAdmin,
  async (req, res) => {
    const card = await getCard(req.params.id!);
    if (!card) return void res.status(404).json({ error: "no-such-card" });
    await ART_KINDS[req.params.kind as ArtKind].del(card.id);
    // Both platforms, not just Google: an iPhone has to be told to come back for
    // the new art, or it keeps the old look until that customer's next stamp.
    void refreshCardArt(card);
    res.json({ ok: true });
  },
);

/**
 * The rendered stamp grid — one PNG per stamp count, per target still in play.
 *
 * `target` is required on every strip: a grid drawn for 8 and a grid drawn for
 * 10 are different pictures at the same filled count, and storing them under
 * one key is what used to blank a customer's grid when the target changed.
 */
adminRouter.post("/api/card/:id/design/stamps", requireAdmin, async (req, res) => {
  const { style, strips } = (req.body ?? {}) as {
    style?: string;
    strips?: { target?: number; filled?: number; png?: string }[];
  };
  if (!Array.isArray(strips) || strips.length === 0) {
    return void res.status(400).json({ error: "missing-strips" });
  }
  const decoded: { target: number; filled: number; png: Buffer }[] = [];
  for (const s of strips) {
    if (typeof s?.png !== "string" || typeof s?.filled !== "number" || typeof s?.target !== "number") {
      return void res.status(400).json({ error: "bad-strip" });
    }
    const bytes = Buffer.from(s.png, "base64");
    const reject = validateArtPng(bytes); // strips carry the band image too
    if (reject) return void res.status(400).json({ error: reject });
    decoded.push({ target: Math.trunc(s.target), filled: Math.trunc(s.filled), png: bytes });
  }
  await setStampStrips(req.params.id!, decoded);
  const card = await updateCard(req.params.id!, { stamp_style: (style ?? "").slice(0, 40) });
  if (!card) return void res.status(404).json({ error: "no-such-card" });
  // Both platforms, not just Google: an iPhone has to be told to come back for
  // the new art, or it keeps the old look until that customer's next stamp.
  void refreshCardArt(card);
  res.json({ ok: true });
});

/**
 * Operator cleanup: retire a card — a test card, or a second one added back
 * when the dashboard still offered that button.
 *
 * Archiving, not deleting. A card id is printed on posters and baked into every
 * Android card ever issued from it, and its events are append-only, so there is
 * no version of "delete" that is safe. Archiving takes the card out of the
 * owner's dashboard and off their join link while every pass already in a
 * wallet carries on being stamped — and it is reversible, which delete never
 * was. Owners can NOT do this; it is a decision that touches printed material.
 *
 * archiveCard() re-checks its conditions inside a transaction, so the overview
 * being a few seconds stale can't archive a shop's only remaining card.
 */
adminRouter.post("/api/card/:id/archive", requireAdmin, async (req, res) => {
  const result = await archiveCard(req.params.id!);
  if (result.ok) return void res.json({ ok: true });
  res.status(result.reason === "no-such-card" ? 404 : 409).json({ error: result.reason });
});

/** Put one back. Nothing was destroyed, so this needs no guards of its own. */
adminRouter.post("/api/card/:id/unarchive", requireAdmin, async (req, res) => {
  const result = await unarchiveCard(req.params.id!);
  if (result.ok) return void res.json({ ok: true });
  res.status(404).json({ error: result.reason });
});

adminRouter.post("/api/owner/:id/reset-password", requireAdmin, async (req, res) => {
  const owner = await getOwner(req.params.id!);
  if (!owner) return void res.status(404).json({ error: "no-such-owner" });
  // A readable temp password; the owner logs in and changes it in the dashboard.
  const tempPassword = "PunchMe-" + randomBytes(4).toString("hex");
  await updateOwnerPassword(owner.id, hashPassword(tempPassword));
  res.json({ ok: true, email: owner.email, tempPassword });
});
