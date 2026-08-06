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
import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import {
  clearSessionCookie,
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
  deleteCardBanner,
  deleteCardLogo,
  deleteStampStrips,
  generateStaffPin,
  getOwner,
  getOwnerByEmail,
  getOwnerByResetToken,
  linkOwnerCard,
  logOwnerLogin,
  ownerHasCard,
  ownerIsArchived,
  setCardBanner,
  setCardLogo,
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
import { cardFieldsFromBody, designerCard, touchesLook } from "../cardView.js";
import { resetEmailHtml, sendEmail, welcomeEmailHtml } from "../email.js";
import { ensureClass } from "../googleWallet.js";
import { validateArtPng, validateLogoPng } from "../imageValidate.js";
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
  res.json({ loggedIn: Boolean(ownerId && (await getOwner(ownerId))) });
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
  // One staff PIN per owner, random from the start — never the shared,
  // guessable "1234". They see it under Shop and can replace it there.
  await setStaffPin(owner.id, generateStaffPin());
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
  void sendEmail({ to: email, subject: "Welcome to Stampy", html: welcomeEmailHtml(dashUrl) });
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
      subject: "Reset your Stampy password",
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
 * Logo upload. The dashboard canvas-normalises every image to a ~320×320 PNG
 * and sends it base64-encoded in JSON; the server re-checks magic bytes + size
 * before storing. Google's hosted card re-syncs via ensureClass (the logo URL
 * is version-stamped, so Google re-fetches). Apple cards pick the logo up on
 * their next pass re-fetch.
 */
dashboardRouter.post("/api/card/:id/logo", requireOwner, async (req: OwnerRequest, res) => {
  const cardId = req.params.id!;
  if (!(await ownerHasCard(req.owner!.id, cardId))) {
    return void res.status(403).json({ error: "not-your-card" });
  }
  const { png } = (req.body ?? {}) as { png?: string };
  if (typeof png !== "string" || !png) return void res.status(400).json({ error: "missing-png" });
  let bytes: Buffer;
  try {
    bytes = Buffer.from(png, "base64");
  } catch {
    return void res.status(400).json({ error: "bad-base64" });
  }
  const reject = validateLogoPng(bytes);
  if (reject) return void res.status(400).json({ error: reject });
  await setCardLogo(cardId, bytes);
  await syncArt(cardId);
  res.json({ ok: true });
});

dashboardRouter.delete("/api/card/:id/logo", requireOwner, async (req: OwnerRequest, res) => {
  const cardId = req.params.id!;
  if (!(await ownerHasCard(req.owner!.id, cardId))) {
    return void res.status(403).json({ error: "not-your-card" });
  }
  await deleteCardLogo(cardId);
  await syncArt(cardId);
  res.json({ ok: true });
});

/** Banner image (Apple strip / Google hero) — same upload contract as the logo. */
dashboardRouter.post("/api/card/:id/banner", requireOwner, async (req: OwnerRequest, res) => {
  const cardId = req.params.id!;
  if (!(await ownerHasCard(req.owner!.id, cardId))) {
    return void res.status(403).json({ error: "not-your-card" });
  }
  const { png } = (req.body ?? {}) as { png?: string };
  if (typeof png !== "string" || !png) return void res.status(400).json({ error: "missing-png" });
  const bytes = Buffer.from(png, "base64");
  // Art cap, not the logo cap: a banner is a photo and dwarfs a logo.
  const reject = validateArtPng(bytes);
  if (reject) return void res.status(400).json({ error: reject });
  await setCardBanner(cardId, bytes);
  await syncArt(cardId);
  res.json({ ok: true });
});

dashboardRouter.delete("/api/card/:id/banner", requireOwner, async (req: OwnerRequest, res) => {
  const cardId = req.params.id!;
  if (!(await ownerHasCard(req.owner!.id, cardId))) {
    return void res.status(403).json({ error: "not-your-card" });
  }
  await deleteCardBanner(cardId);
  await syncArt(cardId);
  res.json({ ok: true });
});

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
 * a customer can be messaged once every 7 days — so the only division that
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
    hint: "not messaged in the last 7 days",
    nudgeable: true,
  },
  {
    key: "cooling",
    label: "Messaged this week",
    hint: "on a 7-day cooldown — they will move up on their own",
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

interface CustomerView {
  serial: string;
  /** Null only for a pass on the unclaimed seeded card. */
  customerId: string | null;
  code: string;
  cardId: string;
  cardName: string;
  stamps: number;
  target: number;
  lastDays: number;
  joinedDays: number;
  unanswered: number;
  nudges7d: number;
  removed: boolean;
  bucket: BucketKey;
  /** False when a limit blocks a message — the reason is in `blocked`. */
  canNudge: boolean;
  blocked: string;
}

/** Every active card of the owner's targeted cafés, decorated for the Customers view. */
async function customerViews(cards: CardRow[]): Promise<CustomerView[]> {
  const now = Date.now();
  const out: CustomerView[] = [];
  for (const card of cards) {
    for (const c of await cardCustomers(card.id)) {
      // last_visit, not updated_at — a nudge must not reset the lapse clock.
      const lastDays = Math.floor((now - new Date(c.last_visit).getTime()) / 86400000);
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
        target: c.target,
        lastDays,
        /** Days since the card was issued — independent of visits. */
        joinedDays: Math.floor((now - new Date(c.created_at).getTime()) / 86400000),
        /** Messages sent since their last visit; at the cap we stop entirely. */
        unanswered: c.unanswered_nudges,
        nudges7d: c.nudges_7d,
        removed: c.removed,
        bucket: bucketOf(c.nudges_7d, c.removed),
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
  // Cohorts count PEOPLE. Someone holding an Apple and a Google card at the same
  // shop must not appear — or be messaged — twice.
  const customers = onePerCustomer(await customerViews(cards));

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

  res.json({
    customers,
    buckets,
    counts: { active, issuedNeverAdded, removed },
    limits: { perWeek: MAX_NUDGES_PER_WEEK },
    cards: owned.map((c) => ({ id: c.id, name: c.name })),
  });
});

/**
 * POST /api/nudge { message, cardIds?:[], target:"all"|<bucket key>|serial[] }.
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
  const allPasses = await customerViews(cards); // active cards of owned cards only
  // One entry per PERSON, represented by their most recently active pass — which
  // is also the only pass the message goes to. Someone holding an Apple and a
  // Google card at one shop must not get two notifications.
  const everyone = onePerCustomer(allPasses);
  const whoever = (c: CustomerView) => c.customerId ?? c.serial;

  const bucketKeys = new Set<string>(BUCKETS.map((b) => b.key));
  let targets = everyone;
  if (Array.isArray(body.target)) {
    const wanted = new Set(body.target.map(String));
    // A serial names a PERSON, not a pass: whichever of their cards was asked
    // for, the message goes to the one pass representing them. Only serials
    // belonging to this owner survive the lookup.
    const people = new Set(allPasses.filter((c) => wanted.has(c.serial)).map(whoever));
    targets = everyone.filter((c) => people.has(whoever(c)));
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
