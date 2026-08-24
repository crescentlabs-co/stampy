/**
 * Owner dashboard: login, café metrics, edit card content, add cafés.
 *
 *   GET  /dashboard                 the dashboard page (login or app)
 *   POST /dashboard/api/signup      open self-serve signup → owner + their own card
 *   POST /dashboard/api/login       { email, password } → session cookie
 *   POST /dashboard/api/logout
 *   GET  /dashboard/api/overview    cafés + metrics for the logged-in owner
 *   POST /dashboard/api/cards       create a new café
 *   POST /dashboard/api/card/:id    update café fields (name, reward, target, PIN…)
 *
 * Signup is open (Stage 2): any café owner can create an account and gets a
 * fresh, isolated starter card. The very first signup on a deployment instead
 * claims the env-seeded default café (bootstrap). Owners only ever see cafés
 * linked to them via owner_cards.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import QRCode from "qrcode";
import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import {
  clearSessionCookie,
  createTestPassToken,
  hashPassword,
  sessionOwnerId,
  setSessionCookie,
  verifyPassword,
} from "../auth.js";
import {
  cafeBannerVersion,
  cardCounts,
  cardCustomers,
  cafeLogoVersion,
  cardMetrics,
  cardsForMerchant,
  cardsForOwner,
  counterActivity,
  ensureMerchantForOwner,
  currentSlug,
  merchantForOwner,
  clearResetToken,
  countOwners,
  createCard,
  createOwner,
  DEFAULT_CARD_ID,
  getCard,
  deleteStampStrips,
  generateStaffPin,
  getOwner,
  getOwnerByEmail,
  getOwnerByResetToken,
  linkOwnerCard,
  logOwnerLogin,
  ownerHasCard,
  ownerIsArchived,
  setMessage,
  setResetToken,
  setStaffPin,
  setStampStrips,
  stampStripsVersion,
  targetsInUse,
  updateCard,
  updateMerchant,
  updateOwnerPassword,
  type CardRow,
  type OwnerRow,
} from "../db.js";
import { applyAndPush, refreshCardArt } from "../cardActions.js";
import { clear, hit, peek } from "../rateLimit.js";
import { config, setupStatus, signupOpen } from "../config.js";
import { rgbToHex } from "../color.js";
import {
  artBytes,
  ART_KIND_PATTERN,
  ART_KINDS,
  cardFieldsFromBody,
  designerCard,
  touchesLook,
  type ArtKind,
} from "../cardView.js";
import { resetEmailHtml, sendEmail, welcomeEmailHtml } from "../email.js";
import { ensureClass } from "../googleWallet.js";
import { validateArtPng } from "../imageValidate.js";
import { dashboardPage, resetPage } from "../pages.js";
import { canNudge, MAX_NUDGES_PER_WEEK } from "../winback.js";

export const dashboardRouter = Router();

interface OwnerRequest extends Request {
  owner?: OwnerRow;
}

async function requireOwner(req: OwnerRequest, res: Response, next: NextFunction): Promise<void> {
  const ownerId = sessionOwnerId(req);
  const owner = ownerId ? await getOwner(ownerId) : null;
  if (!owner) return void res.status(401).json({ error: "not-logged-in" });
  // An archived shop is closed. Archiving used to be a flag the admin console
  // filtered on while every door stayed open — the owner could still log in and
  // their staff could still stamp. Nothing is deleted and unarchiving restores
  // this instantly, so the refusal is 403, not a 404 pretending they never
  // existed.
  if (await ownerIsArchived(owner.id)) {
    return void res.status(403).json({ error: "account-closed" });
  }
  req.owner = owner;
  next();
}

dashboardRouter.get("/", (_req, res) => {
  // The page needs to know whether email works, so it can offer a reset link or
  // point the owner at a human instead of promising mail that won't arrive.
  res.type("html").send(dashboardPage(setupStatus().canEmail, config.contactEmail, signupOpen()));
});

/** Tells the page whether a session is already active. */
dashboardRouter.get("/api/state", async (req, res) => {
  const ownerId = sessionOwnerId(req);
  const owner = ownerId ? await getOwner(ownerId) : null;
  // An archived owner is not logged in as far as this page is concerned: every
  // call behind requireOwner would 403, so saying "logged in" only lands a
  // stale cookie on a dashboard that cannot load. The login form instead, which
  // then says plainly that the account is closed.
  const live = Boolean(owner) && !(await ownerIsArchived(owner!.id));
  res.json({ loggedIn: live });
});

dashboardRouter.post("/api/signup", async (req, res) => {
  // Closed unless a deployment opens it. Shops are built in admin and handed
  // over with a claim link; the only reason this route still exists is the
  // first-owner bootstrap that claims the env-seeded card, which is why it
  // stays reachable when there are no owners at all.
  if (!signupOpen() && (await countOwners()) > 0) {
    return void res.status(403).json({ error: "signup-closed" });
  }
  const { email, password, cafeName } = (req.body ?? {}) as {
    email?: string;
    password?: string;
    cafeName?: string;
  };
  // Slow down automated account-spam from one source.
  const rl = hit(`signup:${req.ip}`, 5, 60 * 60_000);
  if (!rl.ok) {
    return void res.status(429).json({ error: "too-many-attempts", retryAfterSeconds: rl.retryAfterSeconds });
  }
  if (!email?.includes("@") || !password || password.length < 8) {
    return void res.status(400).json({ error: "need-valid-email-and-8-char-password" });
  }
  // Unlike login (which stays enumeration-safe), signup legitimately reveals
  // that an email is taken — the alternative is a confusing duplicate-key 500.
  if (await getOwnerByEmail(email)) {
    return void res.status(409).json({ error: "email-taken" });
  }

  const isFirstOwner = (await countOwners()) === 0;
  const owner = await createOwner(randomUUID(), email, hashPassword(password));
  // No staff PIN. One used to be minted here at random, with a comment saying
  // the owner could see it under Shop — they could not, and never could: the
  // Shop tab deliberately never paints a PIN back (src/pages.ts, accountPanel),
  // because only a scrypt hash is stored. So every self-signup owner has been
  // carrying a live PIN that nothing on earth could read, while `hasStaffPin`
  // said they were set up and the button offered to "Reset" it.
  //
  // They set their own under Shop. Until they do, the dashboard says the counter
  // cannot stamp — which is true, and used to be true silently.
  // The business, distinct from the card it runs. Its id is what the /j/ poster
  // QR encodes, so it is minted here and never changes. The first owner on a
  // deployment claims the env-seeded card, so take its name rather than a
  // placeholder — that card was configured to be this shop.
  const seeded = isFirstOwner ? await getCard(DEFAULT_CARD_ID) : null;
  const shopName = (cafeName ?? "").trim().slice(0, 60) || seeded?.name || "My shop";
  const merchant = await ensureMerchantForOwner(owner.id, shopName);

  if (isFirstOwner) {
    // Bootstrap: the first account on a deployment claims the env-seeded card.
    await linkOwnerCard(owner.id, DEFAULT_CARD_ID);
    await updateCard(DEFAULT_CARD_ID, { merchant_id: merchant.id });
  } else {
    // Every later signup gets its own isolated starter card.
    const card = await createCard({
      merchantId: merchant.id,
      name: shopName,
      reward: "Free coffee",
      stampsTarget: 10,
      stampsStart: 2,
    });
    await linkOwnerCard(owner.id, card.id);
    // Mirror the new card into Google's system (graceful no-op until configured).
    void ensureClass(card).then((r) => {
      if (!r.ok && r.reason !== "google-not-configured") {
        console.error("[signup] google class sync failed:", r);
      }
    });
  }

  setSessionCookie(res, owner.id);
  // Best-effort welcome email (no-op until Resend is configured; never blocks).
  const dashUrl = (config.baseUrl || `${req.protocol}://${req.get("host")}`) + "/dashboard";
  void sendEmail({ to: email, subject: "Welcome to PunchMe", html: welcomeEmailHtml(dashUrl) });
  res.json({ ok: true });
});

dashboardRouter.post("/api/login", async (req, res) => {
  const { email, password } = (req.body ?? {}) as { email?: string; password?: string };
  // Brute-force guard, keyed by email so one attacker can't lock out everyone.
  // Failure-only: a correct password never counts and clears the counter.
  const rlKey = `login:${(email ?? "").toLowerCase()}`;
  const peeked = peek(rlKey, 8, 15 * 60_000);
  if (!peeked.ok) {
    return void res.status(429).json({ error: "too-many-attempts", retryAfterSeconds: peeked.retryAfterSeconds });
  }
  const owner = email ? await getOwnerByEmail(email) : null;
  // Verify against a dummy hash when the owner doesn't exist so response time
  // doesn't reveal which emails are registered.
  const ok = owner
    ? verifyPassword(password ?? "", owner.password_hash)
    : (verifyPassword(password ?? "", hashPassword("dummy-password")), false);
  if (!ok || !owner) {
    hit(rlKey, 8, 15 * 60_000); // record only the failed attempt
    return void res.status(401).json({ error: "wrong-email-or-password" });
  }
  clear(rlKey);
  // Closed shops are refused at the door, the same way staff sign-in refuses
  // them (src/routes/staff.ts). Checked AFTER the password verifies so it can
  // never be used to work out which emails have accounts, and before the
  // cookie is set so a closed account never holds a session at all — it used
  // to log in successfully and land on a dashboard that 403s on every call.
  if (await ownerIsArchived(owner.id)) {
    return void res.status(403).json({ error: "account-closed" });
  }
  setSessionCookie(res, owner.id);
  // "Does this merchant ever open their dashboard?" had no answer before,
  // because nothing recorded a sign-in. Best-effort; never blocks the login.
  void logOwnerLogin(owner.id);
  res.json({ ok: true });
});

dashboardRouter.post("/api/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

/** Change the logged-in owner's password (verifies the current one first). */
dashboardRouter.post("/api/change-password", requireOwner, async (req: OwnerRequest, res) => {
  const { current, next } = (req.body ?? {}) as { current?: string; next?: string };
  if (!next || next.length < 8) {
    return void res.status(400).json({ error: "new-password-needs-8-chars" });
  }
  if (!current || !verifyPassword(current, req.owner!.password_hash)) {
    return void res.status(401).json({ error: "current-password-wrong" });
  }
  await updateOwnerPassword(req.owner!.id, hashPassword(next));
  res.json({ ok: true });
});

// -------------------------------------------------- self-serve password reset ----

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

/**
 * Start a reset: emails a one-time link. Always returns 200 (never reveals
 * whether the email is registered). The token is stored only as a sha256 hash.
 */
dashboardRouter.post("/api/forgot", async (req, res) => {
  const { email } = (req.body ?? {}) as { email?: string };
  // Rate-limited, but still returns ok:true when blocked so it leaks nothing —
  // we simply stop sending further reset emails for this address for a while.
  const rl = hit(`forgot:${(email ?? "").toLowerCase()}`, 3, 60 * 60_000);
  if (!rl.ok) return void res.json({ ok: true });
  const owner = email?.includes("@") ? await getOwnerByEmail(email) : null;
  if (owner) {
    const token = randomBytes(32).toString("hex");
    await setResetToken(owner.id, hashToken(token), new Date(Date.now() + RESET_TTL_MS));
    const base = config.baseUrl || `${req.protocol}://${req.get("host")}`;
    const link = `${base}/dashboard/reset?token=${token}`;
    const r = await sendEmail({
      to: owner.email,
      subject: "Reset your PunchMe password",
      html: resetEmailHtml(link),
    });
    if (!r.ok && r.reason !== "email-not-configured") {
      console.error("[dashboard] reset email failed:", r.reason);
    }
  }
  res.json({ ok: true });
});

/** The page the reset link opens (set a new password). */
dashboardRouter.get("/reset", (_req, res) => {
  res.type("html").send(resetPage());
});

/** Complete a reset: consume the token, set the new password, log the owner in. */
dashboardRouter.post("/api/reset", async (req, res) => {
  const { token, password } = (req.body ?? {}) as { token?: string; password?: string };
  if (!password || password.length < 8) {
    return void res.status(400).json({ error: "new-password-needs-8-chars" });
  }
  const owner = token ? await getOwnerByResetToken(hashToken(token)) : null;
  if (!owner) return void res.status(400).json({ error: "invalid-or-expired-link" });
  await updateOwnerPassword(owner.id, hashPassword(password));
  await clearResetToken(owner.id);
  setSessionCookie(res, owner.id);
  res.json({ ok: true });
});

dashboardRouter.get("/api/overview", requireOwner, async (req: OwnerRequest, res) => {
  const cards = await cardsForOwner(req.owner!.id);
  // The shop name lives on the merchant, not the card — it's what the pass shows
  // as logoText, so the designer edits it alongside the card's own fields.
  const merchant = await merchantForOwner(req.owner!.id);
  // designerCard() is shared with the admin console, which renders the same
  // designer against any merchant's card — see src/cardView.ts. The PIN is
  // never in it: only its scrypt hash is stored, so there is nothing to reveal.
  const out = [];
  for (const card of cards) {
    out.push({
      ...(await designerCard(card, merchant?.name)),
      metrics: await cardMetrics(card.id),
    });
  }
  // Whether a PIN exists, never the PIN. It is stored as a scrypt hash and
  // cannot be read back — this only lets Shop say "Reset" instead of "Set", so
  // an owner replacing a PIN isn't shown a first-time-setup control.
  res.json({
    email: req.owner!.email,
    cards: out,
    hasStaffPin: (req.owner!.staff_pin_hash ?? "") !== "",
    // Null until they choose. The dashboard reads it the same way it reads
    // hasStaffPin — as "is this set-up step still outstanding".
    returnCycleDays: merchant?.expected_return_days ?? null,
    // What goes in a /j/ link: the poster and the shareable sign-up link both
    // use it, because a merchant ref survives a rename, a second card and a
    // change of ownership in a way a card link does not.
    joinRef: merchant ? await currentSlug(merchant.id) : "",
  });
});

/**
 * Add a card — capped at ONE per merchant for V1.
 *
 * The cap is here rather than in the schema on purpose: merchants, owner_cards
 * and merchants.default_card_id are all already shaped for several cards, and a
 * CHECK constraint would only have to be migrated away again. What is missing
 * for multi-card is the dashboard UI to choose which card a /j/ link issues —
 * without it a second card silently turns every printed poster into a card
 * picker, which is how this cap came to be needed.
 */
dashboardRouter.post("/api/cards", requireOwner, async (req: OwnerRequest, res) => {
  const { name, reward, stampsTarget, stampsStart } = (req.body ?? {}) as {
    name?: string;
    reward?: string;
    stampsTarget?: number;
    stampsStart?: number;
  };
  if (!name?.trim()) return void res.status(400).json({ error: "missing-name" });
  const merchant = await ensureMerchantForOwner(req.owner!.id, name.trim());
  if ((await cardsForMerchant(merchant.id)).length > 0) {
    return void res.status(409).json({ error: "one-card-per-merchant" });
  }
  const card = await createCard({
    merchantId: merchant.id,
    name: name.trim().slice(0, 60),
    reward: (reward ?? "Free coffee").trim().slice(0, 60),
    stampsTarget: clampInt(stampsTarget, 1, 20, 10),
    stampsStart: clampInt(stampsStart, 0, 19, 2),
  });
  await linkOwnerCard(req.owner!.id, card.id);
  res.json({ ok: true, id: card.id });
});

/**
 * Set or replace THE staff PIN — one per owner, covering every card they run.
 * Returns it once: it is stored only as a scrypt hash, so this response is the
 * single chance to write it down. Every staff phone has to sign in again with
 * it, on every card.
 *
 * Was per-café (`/api/card/:id/rotate-pin`), which gave an owner with two cards
 * two PINs and two stamper links for one counter.
 */
dashboardRouter.post("/api/staff-pin", requireOwner, async (req: OwnerRequest, res) => {
  const given = String((req.body ?? {}).pin ?? "").trim().slice(0, 12);
  // Blank means "pick one for me" — never the shared, guessable "1234".
  if (given && given.length < 4) return void res.status(400).json({ error: "pin-too-short" });
  const pin = given || generateStaffPin();
  await setStaffPin(req.owner!.id, pin);
  res.json({ ok: true, staffPin: pin });
});

dashboardRouter.post("/api/card/:id", requireOwner, async (req: OwnerRequest, res) => {
  const cardId = req.params.id!;
  if (!(await ownerHasCard(req.owner!.id, cardId))) {
    return void res.status(403).json({ error: "not-your-card" });
  }
  // The ownership check above is what authorises this; cardFieldsFromBody
  // deliberately does no authorisation of its own, because the console calls it
  // after a completely different check (requireAdmin).
  const body = (req.body ?? {}) as Record<string, unknown>;
  const fields = cardFieldsFromBody(body);
  const card = await updateCard(cardId, fields, `owner:${req.owner!.id}`);
  if (!card) return void res.status(404).json({ error: "no-such-card" });
  // The shop name belongs to the merchant, not the card — it is what the pass
  // prints as logoText. Renaming keeps every previous slug resolving, so a
  // printed poster can never be killed by a rename (see updateMerchant).
  if (typeof body.shopName === "string" && body.shopName.trim()) {
    const merchant = await merchantForOwner(req.owner!.id);
    if (merchant) await updateMerchant(merchant.id, { name: body.shopName.trim().slice(0, 60) });
  }
  // This route takes BOTH saves the designer makes — the look and the rules —
  // so what happens next depends on which one arrived. A look change is drawn
  // on cards already in wallets, so every phone is told to come and refetch. A
  // rules change is not: a pass carries the ruleset it was issued with, so
  // waking anyone for it would be pure noise. touchesLook draws that line once,
  // where it can be read, instead of at each call site.
  if (touchesLook(fields, body)) void refreshCardArt(card);
  else {
    void ensureClass(card).then((r) => {
      if (!r.ok && r.reason !== "google-not-configured") {
        console.error("[dashboard] google class sync failed:", r);
      }
    });
  }
  res.json({ ok: true });
});

/**
 * A link that puts THIS card in your own wallet, without becoming a customer.
 *
 * The sign-up link with the sign-up removed: no landing page, no cookie, and a
 * pass flagged `is_test` so it stays out of every count the owner reads. Signed
 * and short-lived — see createTestPassToken for why it cannot be a plain flag.
 *
 * Returns both wallets. Which one is useful depends on the phone in the owner's
 * hand, and they are the only person who knows that.
 */
dashboardRouter.get("/api/card/:id/test-link", requireOwner, async (req: OwnerRequest, res) => {
  const cardId = req.params.id!;
  if (!(await ownerHasCard(req.owner!.id, cardId))) {
    return void res.status(403).json({ error: "not-your-card" });
  }
  const base = config.baseUrl || `${req.protocol}://${req.get("host")}`;
  const token = createTestPassToken(cardId);
  res.json({
    ok: true,
    apple: `${base}/c/${cardId}/enroll?t=${encodeURIComponent(token)}`,
    google: `${base}/c/${cardId}/enroll/google?t=${encodeURIComponent(token)}`,
  });
});

/**
 * The same link as a QR, because the designer is usually open on a laptop and
 * the wallet is on a phone. Minted per request: the token is short-lived, so a
 * QR that sat in a screenshot stops working on its own.
 */
dashboardRouter.get("/api/card/:id/test-qr.png", requireOwner, async (req: OwnerRequest, res) => {
  const cardId = req.params.id!;
  if (!(await ownerHasCard(req.owner!.id, cardId))) {
    return void res.status(403).json({ error: "not-your-card" });
  }
  const wallet = req.query.wallet === "google" ? "enroll/google" : "enroll";
  const base = config.baseUrl || `${req.protocol}://${req.get("host")}`;
  const url = `${base}/c/${cardId}/${wallet}?t=${encodeURIComponent(createTestPassToken(cardId))}`;
  const png = await QRCode.toBuffer(url, { type: "png", width: 640, margin: 2, errorCorrectionLevel: "M" });
  res.set("Content-Type", "image/png").set("Cache-Control", "no-store").send(png);
});

/**
 * Card art upload — logo, banner, the square Android mark, and the owner's own
 * stamp shape. One handler for all four: the designer sends them through the
 * same browser code, and separate copies are how the banner came to be checked
 * against the logo's size cap. `kind` is also the art path, so the URL an
 * upload goes to and the URL it comes back from are built from one string.
 *
 * The browser canvas-normalises every image to a PNG and sends it base64 in
 * JSON; the server re-checks magic bytes + size before storing. Google's hosted
 * card re-syncs via ensureClass (art URLs are version-stamped, so Google
 * re-fetches). Apple cards pick it up on their next pass re-fetch.
 */
dashboardRouter.post(
  `/api/card/:id/:kind(${ART_KIND_PATTERN})`,
  requireOwner,
  async (req: OwnerRequest, res) => {
    const cardId = req.params.id!;
    if (!(await ownerHasCard(req.owner!.id, cardId))) {
      return void res.status(403).json({ error: "not-your-card" });
    }
    const kind = req.params.kind as ArtKind;
    const bytes = artBytes(kind, (req.body ?? {}).png);
    if (typeof bytes === "string") return void res.status(400).json({ error: bytes });
    await ART_KINDS[kind].set(cardId, bytes);
    await syncArt(cardId);
    res.json({ ok: true });
  },
);


dashboardRouter.delete(
  `/api/card/:id/:kind(${ART_KIND_PATTERN})`,
  requireOwner,
  async (req: OwnerRequest, res) => {
    const cardId = req.params.id!;
    if (!(await ownerHasCard(req.owner!.id, cardId))) {
      return void res.status(403).json({ error: "not-your-card" });
    }
    await ART_KINDS[req.params.kind as ArtKind].del(cardId);
    await syncArt(cardId);
    res.json({ ok: true });
  },
);

/**
 * Rich stamp grid. The dashboard renders one strip PNG per stamp count in the
 * browser (canvas) and posts the whole set here. `style` records which preset
 * icon is selected (for restoring the designer); the PNGs are what the card
 * shows. Stored transactionally so a card never has a half-updated grid.
 */
dashboardRouter.post("/api/card/:id/stamps", requireOwner, async (req: OwnerRequest, res) => {
  const cardId = req.params.id!;
  if (!(await ownerHasCard(req.owner!.id, cardId))) {
    return void res.status(403).json({ error: "not-your-card" });
  }
  const { style, strips } = (req.body ?? {}) as {
    style?: string;
    strips?: { target?: number; filled?: number; png?: string }[];
  };
  if (!Array.isArray(strips) || strips.length === 0) {
    return void res.status(400).json({ error: "missing-strips" });
  }
  // `target` is required: a grid drawn for 8 and a grid drawn for 10 are
  // different pictures at the same filled count, and storing them under one key
  // is what used to blank a customer's grid when the owner lowered the target.
  const decoded: { target: number; filled: number; png: Buffer }[] = [];
  for (const s of strips) {
    if (typeof s?.png !== "string" || typeof s?.filled !== "number" || typeof s?.target !== "number") {
      return void res.status(400).json({ error: "bad-strip" });
    }
    const bytes = Buffer.from(s.png, "base64");
    const reject = validateArtPng(bytes); // strips carry the banner photo too
    if (reject) return void res.status(400).json({ error: reject });
    decoded.push({ target: Math.trunc(s.target), filled: Math.trunc(s.filled), png: bytes });
  }
  await setStampStrips(cardId, decoded);
  await updateCard(cardId, { stamp_style: (style ?? "").slice(0, 40) });
  await syncArt(cardId); // refresh the Google hero image (version-stamped)
  res.json({ ok: true });
});

dashboardRouter.delete("/api/card/:id/stamps", requireOwner, async (req: OwnerRequest, res) => {
  const cardId = req.params.id!;
  if (!(await ownerHasCard(req.owner!.id, cardId))) {
    return void res.status(403).json({ error: "not-your-card" });
  }
  await deleteStampStrips(cardId);
  await updateCard(cardId, { stamp_style: "" });
  await syncArt(cardId);
  res.json({ ok: true });
});

// ----------------------------------------------- owner-level customers / nudge ----
// The redesigned Customers view spans ALL of an owner's cards (not one selected
// card), so these aggregate across cardsForOwner and let the owner target which
// card(s) to message. Isolation still holds — only the owner's own cards.

/** Which of the owner's cards a request targets: the given ids, filtered to owned; else all. */
async function targetedCards(ownerId: string, cardIds: unknown): Promise<CardRow[]> {
  const owned = await cardsForOwner(ownerId);
  if (!Array.isArray(cardIds) || cardIds.length === 0) return owned;
  const wanted = new Set(cardIds.map(String));
  return owned.filter((c) => wanted.has(c.id));
}

/**
 * The three groups the Customers tab is built around. There is one rule —
 * a customer can be messaged twice every 7 days — so the only division that
 * matters is whether their cooldown has run out.
 *
 * This replaced five weekly lapse cohorts. Those grouped by *when someone last
 * visited*, which was a second, invisible rule on top of the cooldown: an owner
 * could not tell why a customer they wanted to reach was not in any nudgeable
 * group. Now the group and the rule are the same thing.
 *
 * Defined here, server-side, so the group the owner *sees* and the group the
 * Nudge button *sends to* are computed by the same code. `removed` wins: the
 * card is gone from their wallet, so no message can reach them either way.
 */
const BUCKETS = [
  {
    key: "ready",
    label: "Can be messaged",
    // Worded FROM the constant, all of it. The cap has moved twice, and each
    // time a hard-coded "two" somewhere told an owner a rule the server was no
    // longer applying.
    hint: `had fewer than ${MAX_NUDGES_PER_WEEK} messages in the last 7 days`,
    nudgeable: true,
  },
  {
    key: "cooling",
    label: `Had their ${MAX_NUDGES_PER_WEEK} this week`,
    hint: `at the ${MAX_NUDGES_PER_WEEK}-a-week cap — they move back up on their own`,
    nudgeable: false,
  },
  {
    key: "removed",
    label: "Deleted the card",
    hint: "removed it from their wallet — nothing can reach them",
    nudgeable: false,
  },
] as const;

type BucketKey = (typeof BUCKETS)[number]["key"];

function bucketOf(nudges7d: number, removed: boolean): BucketKey {
  if (removed) return "removed";
  return nudges7d >= MAX_NUDGES_PER_WEEK ? "cooling" : "ready";
}

/**
 * ============================ A DIFFERENT AXIS ============================
 *
 * BUCKETS above answer "can this customer be messaged" — a fact about our
 * cooldown. HEALTH below answers "is this customer any good to the shop" — a
 * fact about their visiting. They are not alternatives and neither replaces the
 * other: the Slipping-shaped question ("who should I chase") is the two of them
 * read together, which is why the nudge dropdown targets a HEALTH group and
 * then lets canNudge filter it.
 *
 * Both are computed over the same onePerCustomer() array, so they can never
 * disagree about who exists — the failure that has bitten this codebase twice.
 */
export const RETURN_CYCLES = [14, 21, 28] as const;
export type ReturnCycle = (typeof RETURN_CYCLES)[number];

/**
 * What a shop gets before it has answered. Fourteen days, because the groups
 * have to say something on day one and the commonest trade here is a cafe.
 * The dashboard asks for the real answer in its setup banner.
 */
export const RETURN_CYCLE_FALLBACK: ReturnCycle = 14;

export function returnCycleOf(days: number | null | undefined): ReturnCycle {
  return (RETURN_CYCLES as readonly number[]).includes(days ?? -1)
    ? (days as ReturnCycle)
    : RETURN_CYCLE_FALLBACK;
}

/**
 * A regular's average gap between visits, at each cycle.
 *
 * A COUNT alone said the wrong thing: three stamps in one afternoon and three
 * stamps over three months are the same number and completely different
 * customers, and a shop a fortnight old was reporting Regulars it had served
 * three times in a week. The rhythm is the claim "Regular" actually makes, so
 * the rhythm is what it is measured on — a count of three, and an average gap
 * inside the cycle the shop chose.
 *
 * Each figure is the top of the shop's own range, with a few days of slack:
 * 1-2 weeks allows 11 days, 2-3 allows 18, 3-4 allows 25. Someone who is a day
 * or two late every time is still a regular, and everybody knows it.
 */
export const REGULAR_GAP: Record<ReturnCycle, number> = { 14: 11, 21: 18, 28: 25 };

/**
 * Stamps from the counter — NOT visits — before anyone is a Regular. The
 * sign-up is visit 1, so this is four visits on screen; the bar is written in
 * stamps so that counting the sign-up did not silently move it.
 */
export const REGULAR_STAMPS = 3;

/**
 * Silence that means gone: twice the MIDDLE of the shop's range, so a shop that
 * says "every 1-2 weeks" writes somebody off after three weeks rather than
 * after two or after four.
 */
export const LOST_AFTER: Record<ReturnCycle, number> = { 14: 21, 21: 35, 28: 49 };

/**
 * What each cycle is CALLED, once. The Shop buttons, the Customer health hint
 * and anything else naming a cadence read it from here — three copies of
 * "3-4 weeks" is how a screen ends up describing a rule the server no longer
 * applies.
 */
export const CYCLE_LABEL: Record<ReturnCycle, string> = {
  14: "1\u20132 weeks",
  21: "2\u20133 weeks",
  28: "3\u20134 weeks",
};

/**
 * Four groups, FIRST MATCH WINS, one per person.
 *
 * Lost is checked before everything else on purpose: someone overdue by two
 * whole cycles is gone whatever their history, and a lapsed regular keeping
 * their badge until that point is the deliberate choice — it leaves Lost as the
 * single number that moves when a shop starts losing people, rather than
 * spreading the bad news across two groups that each look half-fine.
 *
 * `visits` is lifetime and net (CUSTOMER_VISITS_SQL), never the card balance,
 * so claiming a reward does not demote anybody.
 */
export const HEALTH = [
  {
    key: "regular",
    label: "Regulars",
    hint: "3+ stamps, and typically back inside your cycle",
  },
  {
    key: "returning",
    label: "Returning",
    hint: "has come back — but not yet at a regular's rhythm",
  },
  {
    key: "new",
    label: "New",
    hint: "signed up, and not back since",
  },
  {
    key: "lost",
    label: "Lost",
    hint: "not in for more than twice your cycle",
  },
] as const;

export type HealthKey = (typeof HEALTH)[number]["key"];

/**
 * @param visits      lifetime, net, per person — the sign-up itself is visit 1
 * @param lastDays    days since their last stamp
 * @param avgGapDays  mean days between their visits; Infinity with fewer than two
 */
export function healthOf(
  visits: number,
  lastDays: number,
  avgGapDays: number,
  cycle: ReturnCycle,
): HealthKey {
  if (lastDays > LOST_AFTER[cycle]) return "lost";
  // Before Regular on purpose: somebody who has only taken the card has no
  // rhythm to judge, and "New" says more about them than "Returning" would.
  // Since the sign-up is visit 1, ONE visit is exactly that person: they have
  // the card, they have their welcome stamps, they have not been back.
  if (visits <= 1) return "new";
  // Three stamps FROM THE COUNTER, which is four visits now that the sign-up is
  // one of them. Expressed in stamps because that is the bar the founder set,
  // and because counting the sign-up towards it would have quietly loosened
  // Regular to two stamps in the same change that started counting it.
  if (visits - 1 >= REGULAR_STAMPS && avgGapDays <= REGULAR_GAP[cycle]) return "regular";
  // The catch-all, so the four partition everybody: been back at least once,
  // not yet often enough or not yet regularly enough.
  return "returning";
}

interface CustomerView {
  serial: string;
  /** Null only for a pass on the unclaimed seeded card. */
  customerId: string | null;
  code: string;
  cardId: string;
  cardName: string;
  /** The card's balance — what their progress chip shows. Resets on redeem. */
  stamps: number;
  /** Lifetime visits, net, per person. What health is judged on. */
  visits: number;
  /** Mean days between their visits. Infinity with fewer than two. */
  avgGapDays: number;
  target: number;
  lastDays: number;
  joinedDays: number;
  unanswered: number;
  nudges7d: number;
  removed: boolean;
  bucket: BucketKey;
  /** Which health group they are in — a different axis to `bucket`. */
  health: HealthKey;
  /** False when a limit blocks a message — the reason is in `blocked`. */
  canNudge: boolean;
  blocked: string;
}

/**
 * Every active card of the owner's targeted cafés, decorated for the Customers
 * view. `cycle` is the shop's expected days between visits — it decides the
 * health group and nothing else.
 */
async function customerViews(cards: CardRow[], cycle: ReturnCycle = RETURN_CYCLE_FALLBACK): Promise<CustomerView[]> {
  const now = Date.now();
  const out: CustomerView[] = [];
  for (const card of cards) {
    for (const c of await cardCustomers(card.id)) {
      // last_visit, not updated_at — a nudge must not reset the lapse clock.
      const lastDays = Math.floor((now - new Date(c.last_visit).getTime()) / 86400000);
      // The rhythm: their whole span divided by the gaps in it, so three visits
      // give two gaps. The span runs from the day they took the card (visit 1)
      // to their last stamp. Infinity — not zero — when there is no second
      // visit to measure against, because a missing rhythm must never read as a
      // perfect one. Floored at zero for the same reason netStamps is: a clock
      // that ran backwards must not hand somebody a negative rhythm.
      const firstMs = c.first_visit ? new Date(c.first_visit).getTime() : 0;
      const avgGapDays = c.visits >= 2 && firstMs
        ? Math.max(0, (new Date(c.last_visit).getTime() - firstMs) / 86400000 / (c.visits - 1))
        : Infinity;
      const allowed = canNudge({
        nudges7d: c.nudges_7d,
        unanswered: c.unanswered_nudges,
        removed: c.removed,
      });
      out.push({
        serial: c.serial,
        customerId: c.customer_id,
        code: c.code,
        cardId: card.id,
        cardName: card.name,
        stamps: c.stamps,
        visits: c.visits,
        avgGapDays,
        target: c.target,
        lastDays,
        /** Days since the card was issued — independent of visits. */
        joinedDays: Math.floor((now - new Date(c.created_at).getTime()) / 86400000),
        /** Messages sent since their last visit; at the cap we stop entirely. */
        unanswered: c.unanswered_nudges,
        nudges7d: c.nudges_7d,
        removed: c.removed,
        bucket: bucketOf(c.nudges_7d, c.removed),
        health: healthOf(c.visits, lastDays, avgGapDays, cycle),
        canNudge: allowed.ok,
        blocked: allowed.ok ? "" : allowed.reason,
      });
    }
  }
  out.sort((a, b) => a.lastDays - b.lastDays);
  return out;
}

/**
 * One row per PERSON, not per pass.
 *
 * Somebody who added the card on Apple and again on Google, or who holds two of
 * the shop's cards, is one customer — counting them twice would inflate every
 * cohort and, worse, send them one message per card they hold. The most recently
 * active pass represents them, which is also the pass a nudge is delivered to.
 *
 * Passes with no customer (only possible on the unclaimed seeded card) each
 * stand alone.
 */
function onePerCustomer(views: CustomerView[]): CustomerView[] {
  const byCustomer = new Map<string, CustomerView>();
  const out: CustomerView[] = [];
  for (const v of views) {
    if (!v.customerId) {
      out.push(v);
      continue;
    }
    const seen = byCustomer.get(v.customerId);
    // views arrive most-recently-visited first, so the first one wins.
    if (!seen) {
      byCustomer.set(v.customerId, v);
      out.push(v);
    }
  }
  return out;
}

/**
 * GET /api/counter — what happened at this shop's counter.
 *
 * Read-only, and scoped to the owner's own cards through `cardsForOwner`, which
 * already excludes archived ones. There is no per-staff identity in this system
 * — one PIN per owner, any signed-in device stamps — so nothing here is
 * attributed to a person and nothing is judged. See `counterActivity`.
 */
dashboardRouter.get("/api/counter", requireOwner, async (req: OwnerRequest, res) => {
  const owned = await cardsForOwner(req.owner!.id);
  res.json({ ok: true, counter: await counterActivity(owned.map((c) => c.id)) });
});

/** GET /api/customers?cardId=all|<id> — cohort summary, counts, and the searchable list. */
dashboardRouter.get("/api/customers", requireOwner, async (req: OwnerRequest, res) => {
  const owned = await cardsForOwner(req.owner!.id);
  const cardId = String(req.query.cardId ?? "all");
  const cards = cardId === "all" ? owned : owned.filter((c) => c.id === cardId);
  const merchant = await merchantForOwner(req.owner!.id);
  const cycle = returnCycleOf(merchant?.expected_return_days);
  // Cohorts count PEOPLE. Someone holding an Apple and a Google card at the same
  // shop must not appear — or be messaged — twice.
  const customers = onePerCustomer(await customerViews(cards, cycle));

  // Live sums over whoever is in the bucket right now. Nothing is averaged and
  // nothing is stored per group: a card that ages out of one week and into the
  // next carries its own nudge history with it, because that history lives on the
  // card in `events`.
  const buckets = BUCKETS.map((b) => {
    const members = customers.filter((c) => c.bucket === b.key);
    return {
      key: b.key,
      label: b.label,
      hint: b.hint,
      nudgeable: b.nudgeable,
      customers: members.length,
      // With the cooldown as the only rule, everyone in the nudgeable group is
      // sendable — except a card that has left its wallet, which no message can
      // reach either way.
      eligible: b.nudgeable ? members.filter((c) => c.canNudge).length : 0,
    };
  });

  // Counts across the targeted cards, so the gap between "cards issued" and
  // "customers" is explained on screen instead of showing as two numbers that
  // contradict each other.
  let active = 0;
  let issuedNeverAdded = 0;
  let removed = 0;
  for (const card of cards) {
    const n = await cardCounts(card.id);
    active += n.active;
    issuedNeverAdded += n.issuedNeverAdded;
    removed += n.removed;
  }

  // The health groups, over the SAME array the buckets came from — so the two
  // can never disagree about who exists, and the four counts always add up to
  // `customers.length`. `eligible` is how many of the group a message could
  // actually reach right now, which is the pair of axes read together.
  const health = HEALTH.map((h) => {
    const members = customers.filter((c) => c.health === h.key);
    return {
      key: h.key,
      label: h.label,
      hint: h.hint,
      customers: members.length,
      eligible: members.filter((c) => c.canNudge).length,
    };
  });

  res.json({
    customers,
    buckets,
    health,
    // What the groups were computed with, and whether the owner ever said so.
    // The dashboard asks for it in the setup banner while `chosen` is false.
    cycle: {
      days: cycle,
      chosen: merchant?.expected_return_days != null,
      label: CYCLE_LABEL[cycle],
      // The two numbers the groups actually turn on. Sent rather than
      // recomputed in the browser, so the hint on screen cannot describe a
      // rule the server has stopped using.
      regularStamps: REGULAR_STAMPS,
      regularGapDays: REGULAR_GAP[cycle],
      lostAfterDays: LOST_AFTER[cycle],
    },
    counts: { active, issuedNeverAdded, removed },
    limits: { perWeek: MAX_NUDGES_PER_WEEK },
    cards: owned.map((c) => ({ id: c.id, name: c.name })),
  });
});

/**
 * How often this shop expects a customer back. The one input the health groups
 * need, and the only thing that makes "5 visits" mean loyal at a cafe and
 * remarkable at a barber.
 */
dashboardRouter.post("/api/return-cycle", requireOwner, async (req: OwnerRequest, res) => {
  const days = Number((req.body ?? {}).days);
  if (!(RETURN_CYCLES as readonly number[]).includes(days)) {
    return void res.status(400).json({ error: "bad-cycle" });
  }
  const merchant = await merchantForOwner(req.owner!.id);
  if (!merchant) return void res.status(404).json({ error: "no-shop" });
  await updateMerchant(merchant.id, { expected_return_days: days });
  res.json({ ok: true, days });
});

/**
 * POST /api/nudge { message, cardIds?:[], target:"all"|<health key>|<bucket key>|serial[] }.
 *
 * The limits are enforced HERE, not in the browser. They used to live in a
 * `confirm()` dialog, which meant a determined tap could message a customer any
 * number of times a day and walk straight into Google's 3/card/24h ceiling. The
 * response reports what actually went out so the UI never claims more.
 */
dashboardRouter.post("/api/nudge", requireOwner, async (req: OwnerRequest, res) => {
  const body = (req.body ?? {}) as {
    message?: string;
    cardIds?: string[];
    target?: string | string[];
  };
  const message = (body.message ?? "").trim().slice(0, 200);
  if (!message) return void res.status(400).json({ error: "missing-message" });

  const cards = await targetedCards(req.owner!.id, body.cardIds);
  const cardById = new Map(cards.map((c) => [c.id, c]));
  // The same cycle the counts were computed with, so a group named here holds
  // exactly the people the owner was looking at when they chose it.
  const nudgeMerchant = await merchantForOwner(req.owner!.id);
  const allPasses = await customerViews(cards, returnCycleOf(nudgeMerchant?.expected_return_days));
  // One entry per PERSON, represented by their most recently active pass — which
  // is also the only pass the message goes to. Someone holding an Apple and a
  // Google card at one shop must not get two notifications.
  const everyone = onePerCustomer(allPasses);
  const whoever = (c: CustomerView) => c.customerId ?? c.serial;

  const bucketKeys = new Set<string>(BUCKETS.map((b) => b.key));
  const healthKeys = new Set<string>(HEALTH.map((h) => h.key));
  let targets = everyone;
  if (Array.isArray(body.target)) {
    const wanted = new Set(body.target.map(String));
    // A serial names a PERSON, not a pass: whichever of their cards was asked
    // for, the message goes to the one pass representing them. Only serials
    // belonging to this owner survive the lookup.
    const people = new Set(allPasses.filter((c) => wanted.has(c.serial)).map(whoever));
    targets = everyone.filter((c) => people.has(whoever(c)));
  } else if (typeof body.target === "string" && healthKeys.has(body.target)) {
    // A health group: "chase the Lost", "thank the Regulars". Narrowing to a
    // group never widens what may be sent — canNudge still filters every one of
    // them below, and the reply says how many it actually reached.
    targets = everyone.filter((c) => c.health === body.target);
  } else if (typeof body.target === "string" && bucketKeys.has(body.target)) {
    targets = everyone.filter((c) => c.bucket === body.target);
  }

  const skipped = { rateLimited: 0, removed: 0 };
  const eligible = targets.filter((c) => {
    if (c.canNudge) return true;
    if (c.blocked === "rate-limited") skipped.rateLimited++;
    else skipped.removed++;
    return false;
  });

  const serials = eligible.slice(0, 1000);
  let sent = 0;
  let failed = 0;
  for (const c of serials) {
    const card = cardById.get(c.cardId)!;
    const r = await applyAndPush(card, c.serial, "nudge", () => setMessage(c.serial, message), {
      nudgeText: message,
      actor: `owner:${req.owner!.id}`,
    });
    if (r && r.push.sent > 0) sent++;
    else failed++;
  }
  res.json({ ok: true, total: serials.length, sent, failed, skipped });
});

/**
 * Re-sync a card's art to BOTH wallets after a branding change.
 *
 * Named syncGoogle when it only patched the Google class, which is what left an
 * iPhone showing yesterday's colours until that customer's next stamp. Now it
 * also wakes every Apple device holding the card; silently, since no field with
 * a changeMessage moved. Graceful no-op on either platform when unconfigured.
 */
async function syncArt(cardId: string): Promise<void> {
  const card = await updateCard(cardId, {}); // fetch fresh row
  if (!card) return;
  void refreshCardArt(card);
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? Math.trunc(v) : Number.parseInt(String(v), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
