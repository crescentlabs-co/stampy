/**
 * Platform-admin console — for the person who RUNS PunchMe (not café owners).
 * Gated by the owner session AND `owner.email` being in `config.adminEmails`
 * (ADMIN_EMAIL may list several, comma-separated). When ADMIN_EMAIL is unset the
 * whole console is closed (403).
 *
 *   GET    /admin                          the console page
 *   GET    /admin/api/overview             every café + owner email(s) + metrics
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
import { hashPassword, sessionOwnerId } from "../auth.js";
import { CLAIM_TTL_MS, hashClaimToken } from "../claim.js";
import { config, setupStatus } from "../config.js";
import {
  allCards,
  allCardsWithStats,
  allOwners,
  createCard,
  adminRetention,
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
  merchantEdits,
  merchantHealth,
  platformRetention,
  setMerchantArchived,
  setMerchantContact,
  getOwner,
  merchantForCard,
  updateMerchant,
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
import { ensureClass } from "../googleWallet.js";
import { stageOf, triage, trialDaysLeft, value } from "../health.js";
import { validateArtPng } from "../imageValidate.js";
import { adminPage } from "../pages.js";

export const adminRouter = Router();

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
 * business: its permanent id, its NFC/sign-up link, and archiving it.
 *
 * `flags` is computed server-side so the rules live in one place (src/health.ts)
 * and are unit-tested without a browser or a database.
 */
adminRouter.get("/api/overview", requireAdmin, async (_req, res) => {
  const [merchants, cards, owners, retention, platform, staff] = await Promise.all([
    merchantHealth(),
    allCardsWithStats(),
    allOwners(),
    adminRetention(),
    // The portfolio figure, recomputed over everyone rather than averaged from
    // the rows above — a rate over 3 customers and a rate over 300 do not
    // average into anything meaningful.
    platformRetention(),
    adminStaffAudit(),
  ]);
  const withFlags = merchants.map((m) => ({
    ...m,
    flags: triage(m),
    value: value(m),
    trialLeft: trialDaysLeft(m),
    // Derived, never stored — see stageOf. The only stored lifecycle fact is
    // paid_at, because nothing else in the database implies it.
    stage: stageOf(m),
  }));
  res.json({ merchants: withFlags, cards, owners, retention, platform, staff });
});

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
 * Re-send every card's Google Wallet class.
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
 * Safe to press repeatedly: a class PATCH carries no notifyPreference, so it
 * notifies nobody (invariant 3), and it touches no object, so no stamp count
 * can move. Sequential rather than parallel — a burst of writes against one
 * issuer is how you find a rate limit you did not know about.
 */
adminRouter.post("/api/google-resync", requireAdmin, async (_req, res) => {
  if (!setupStatus().canGoogleWallet) {
    return void res.status(409).json({ error: "google-not-configured" });
  }
  const cards = await allCards();
  const results: { id: string; name: string; ok: boolean; reason: string }[] = [];
  for (const card of cards) {
    const r = await ensureClass(card);
    results.push({ id: card.id, name: card.name, ok: r.ok, reason: r.ok ? "" : (r.reason ?? "") });
  }
  res.json({
    ok: true,
    total: results.length,
    failed: results.filter((r) => !r.ok).length,
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
  res.json({ ok: true, cards: out.cards, ownerEmail: out.ownerEmail });
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
