/**
 * Owner dashboard: login, café metrics, edit card content, add cafés.
 *
 *   GET  /dashboard                 the dashboard page (login or app)
 *   POST /dashboard/api/signup      open self-serve signup → owner + their own card
 *   POST /dashboard/api/login       { email, password } → session cookie
 *   POST /dashboard/api/logout
 *   GET  /dashboard/api/overview    cafés + metrics for the logged-in owner
 *   POST /dashboard/api/cafes       create a new café
 *   POST /dashboard/api/cafe/:id    update café fields (name, reward, target, PIN…)
 *
 * Signup is open (Stage 2): any café owner can create an account and gets a
 * fresh, isolated starter card. The very first signup on a deployment instead
 * claims the env-seeded default café (bootstrap). Owners only ever see cafés
 * linked to them via owner_cafes.
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
  cafeCustomers,
  cafeLogoVersion,
  cafeMetrics,
  cafesForOwner,
  clearResetToken,
  countOwners,
  createCafe,
  createOwner,
  DEFAULT_CAFE_ID,
  deleteCafeBanner,
  deleteCafeLogo,
  deleteStampStrips,
  generateStaffPin,
  getOwner,
  getOwnerByEmail,
  getOwnerByResetToken,
  lapsingSerials,
  linkOwnerCafe,
  ownerHasCafe,
  setCafeBanner,
  setCafeLogo,
  setMessage,
  setResetToken,
  setStaffPin,
  setStampStrips,
  stampStripsVersion,
  updateCafe,
  updateOwnerPassword,
  type CafeRow,
  type OwnerRow,
} from "../db.js";
import { applyAndPush } from "../cardActions.js";
import { clear, hit, peek } from "../rateLimit.js";
import { config, setupStatus } from "../config.js";
import { hexToRgb, rgbToHex } from "../color.js";
import { resetEmailHtml, sendEmail, welcomeEmailHtml } from "../email.js";
import { ensureClass } from "../googleWallet.js";
import { validateLogoPng } from "../imageValidate.js";
import { dashboardPage, resetPage } from "../pages.js";
import { MAX_UNANSWERED_NUDGES } from "../winback.js";

export const dashboardRouter = Router();

interface OwnerRequest extends Request {
  owner?: OwnerRow;
}

async function requireOwner(req: OwnerRequest, res: Response, next: NextFunction): Promise<void> {
  const ownerId = sessionOwnerId(req);
  const owner = ownerId ? await getOwner(ownerId) : null;
  if (!owner) return void res.status(401).json({ error: "not-logged-in" });
  req.owner = owner;
  next();
}

dashboardRouter.get("/", (_req, res) => {
  // The page needs to know whether email works, so it can offer a reset link or
  // point the owner at a human instead of promising mail that won't arrive.
  res.type("html").send(dashboardPage(setupStatus().canEmail, config.contactEmail));
});

/** Tells the page whether a session is already active. */
dashboardRouter.get("/api/state", async (req, res) => {
  const ownerId = sessionOwnerId(req);
  res.json({ loggedIn: Boolean(ownerId && (await getOwner(ownerId))) });
});

dashboardRouter.post("/api/signup", async (req, res) => {
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

  if (isFirstOwner) {
    // Bootstrap: the first account on a deployment claims the env-seeded café.
    await linkOwnerCafe(owner.id, DEFAULT_CAFE_ID);
  } else {
    // Every later signup gets its own isolated starter card with a random PIN
    // (never the shared default "1234").
    const cafe = await createCafe({
      name: (cafeName ?? "").trim().slice(0, 60) || "My Café",
      reward: "Free coffee",
      stampsTarget: 10,
      stampsStart: 2,
      staffPin: String(randomInt(0, 10000)).padStart(4, "0"),
    });
    await linkOwnerCafe(owner.id, cafe.id);
    // Mirror the new card into Google's system (graceful no-op until configured).
    void ensureClass(cafe).then((r) => {
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
  const cafes = await cafesForOwner(req.owner!.id);
  const out = [];
  for (const cafe of cafes) {
    const [logoVersion, bannerVersion, stampsVersion] = await Promise.all([
      cafeLogoVersion(cafe.id),
      cafeBannerVersion(cafe.id),
      stampStripsVersion(cafe.id),
    ]);
    out.push({
      id: cafe.id,
      name: cafe.name,
      reward: cafe.reward,
      stampsTarget: cafe.stamps_target,
      stampsStart: cafe.stamps_start,
      // The PIN is never sent back: only its scrypt hash is stored, so there is
      // nothing to reveal. A forgotten PIN is replaced via /rotate-pin.
      averageSpend: cafe.average_spend_cents / 100,
      currency: cafe.currency,
      // Colours cross the API as hex — that's what <input type="color"> speaks.
      bg: rgbToHex(cafe.background_color),
      fg: rgbToHex(cafe.foreground_color),
      label: rgbToHex(cafe.label_color),
      logoVersion, // 0 = no upload; used to cache-bust the preview image
      bannerVersion,
      stampStyle: cafe.stamp_style,
      stampsVersion, // 0 = no rendered stamp grid (plain text dots)
      autoWinbackEnabled: cafe.auto_winback_enabled,
      autoWinbackDays: cafe.auto_winback_days,
      autoWinbackMessage: cafe.auto_winback_message,
      metrics: await cafeMetrics(cafe.id),
    });
  }
  res.json({ email: req.owner!.email, cafes: out });
});

dashboardRouter.post("/api/cafes", requireOwner, async (req: OwnerRequest, res) => {
  const { name, reward, stampsTarget, stampsStart, staffPin } = (req.body ?? {}) as {
    name?: string;
    reward?: string;
    stampsTarget?: number;
    stampsStart?: number;
    staffPin?: string;
  };
  if (!name?.trim()) return void res.status(400).json({ error: "missing-name" });
  // A random PIN by default — never the shared, guessable "1234". Returned once
  // here because the hash is all we keep; after this it can only be replaced.
  const pin = (staffPin ?? "").trim().slice(0, 12) || generateStaffPin();
  const cafe = await createCafe({
    name: name.trim().slice(0, 60),
    reward: (reward ?? "Free coffee").trim().slice(0, 60),
    stampsTarget: clampInt(stampsTarget, 1, 30, 10),
    stampsStart: clampInt(stampsStart, 0, 29, 2),
    staffPin: pin,
  });
  await linkOwnerCafe(req.owner!.id, cafe.id);
  res.json({ ok: true, id: cafe.id, staffPin: pin });
});

/**
 * Replace a card's staff PIN. Returns the new PIN once — it is stored only as a
 * scrypt hash, so this response is the single chance to write it down. Every
 * staff phone has to sign in again with it.
 */
dashboardRouter.post("/api/cafe/:id/rotate-pin", requireOwner, async (req: OwnerRequest, res) => {
  const cafeId = req.params.id!;
  if (!(await ownerHasCafe(req.owner!.id, cafeId))) {
    return void res.status(403).json({ error: "not-your-cafe" });
  }
  const pin = generateStaffPin();
  await setStaffPin(cafeId, pin);
  res.json({ ok: true, staffPin: pin });
});

dashboardRouter.post("/api/cafe/:id", requireOwner, async (req: OwnerRequest, res) => {
  const cafeId = req.params.id!;
  if (!(await ownerHasCafe(req.owner!.id, cafeId))) {
    return void res.status(403).json({ error: "not-your-cafe" });
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const fields: Parameters<typeof updateCafe>[1] = {};
  if (typeof body.name === "string" && body.name.trim()) fields.name = body.name.trim().slice(0, 60);
  if (typeof body.reward === "string" && body.reward.trim()) fields.reward = body.reward.trim().slice(0, 60);
  if (body.stampsTarget !== undefined) fields.stamps_target = clampInt(body.stampsTarget, 1, 30, 10);
  if (body.stampsStart !== undefined) fields.stamps_start = clampInt(body.stampsStart, 0, 29, 2);
  // Average spend crosses the API in major units ("4.50") and is stored in cents.
  if (body.averageSpend !== undefined) {
    const major = Number(body.averageSpend);
    fields.average_spend_cents = Number.isFinite(major)
      ? Math.max(0, Math.min(1_000_000, Math.round(major * 100)))
      : 0;
  }
  if (typeof body.currency === "string") fields.currency = body.currency.trim().slice(0, 4) || "RM";
  // Colours arrive as hex from the pickers; stored as rgb(...) for PassKit.
  if (typeof body.bg === "string") fields.background_color = hexToRgb(body.bg);
  if (typeof body.fg === "string") fields.foreground_color = hexToRgb(body.fg);
  if (typeof body.label === "string") fields.label_color = hexToRgb(body.label);
  // Automated win-back settings.
  if (typeof body.autoWinbackEnabled === "boolean") fields.auto_winback_enabled = body.autoWinbackEnabled;
  if (body.autoWinbackDays !== undefined) fields.auto_winback_days = clampInt(body.autoWinbackDays, 1, 3650, 14);
  if (typeof body.autoWinbackMessage === "string" && body.autoWinbackMessage.trim()) {
    fields.auto_winback_message = body.autoWinbackMessage.trim().slice(0, 200);
  }
  // The PIN is stored only as a hash, so it goes through its own helper rather
  // than the generic field updater.
  if (typeof body.staffPin === "string" && body.staffPin.trim()) {
    await setStaffPin(cafeId, body.staffPin.trim().slice(0, 12));
  }
  const cafe = await updateCafe(cafeId, fields);
  if (!cafe) return void res.status(404).json({ error: "no-such-cafe" });
  // Mirror branding/name changes into the Google-hosted card class (no-op
  // result until Google credentials are configured).
  void ensureClass(cafe).then((r) => {
    if (!r.ok && r.reason !== "google-not-configured") {
      console.error("[dashboard] google class sync failed:", r);
    }
  });
  res.json({ ok: true });
});

/**
 * Logo upload. The dashboard canvas-normalises every image to a ~320×320 PNG
 * and sends it base64-encoded in JSON; the server re-checks magic bytes + size
 * before storing. Google's hosted card re-syncs via ensureClass (the logo URL
 * is version-stamped, so Google re-fetches). Apple cards pick the logo up on
 * their next pass re-fetch.
 */
dashboardRouter.post("/api/cafe/:id/logo", requireOwner, async (req: OwnerRequest, res) => {
  const cafeId = req.params.id!;
  if (!(await ownerHasCafe(req.owner!.id, cafeId))) {
    return void res.status(403).json({ error: "not-your-cafe" });
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
  await setCafeLogo(cafeId, bytes);
  const cafe = await updateCafe(cafeId, {}); // fetch fresh row
  if (cafe) {
    void ensureClass(cafe).then((r) => {
      if (!r.ok && r.reason !== "google-not-configured") {
        console.error("[dashboard] google logo sync failed:", r);
      }
    });
  }
  res.json({ ok: true });
});

dashboardRouter.delete("/api/cafe/:id/logo", requireOwner, async (req: OwnerRequest, res) => {
  const cafeId = req.params.id!;
  if (!(await ownerHasCafe(req.owner!.id, cafeId))) {
    return void res.status(403).json({ error: "not-your-cafe" });
  }
  await deleteCafeLogo(cafeId);
  await syncGoogle(cafeId);
  res.json({ ok: true });
});

/** Banner image (Apple strip / Google hero) — same upload contract as the logo. */
dashboardRouter.post("/api/cafe/:id/banner", requireOwner, async (req: OwnerRequest, res) => {
  const cafeId = req.params.id!;
  if (!(await ownerHasCafe(req.owner!.id, cafeId))) {
    return void res.status(403).json({ error: "not-your-cafe" });
  }
  const { png } = (req.body ?? {}) as { png?: string };
  if (typeof png !== "string" || !png) return void res.status(400).json({ error: "missing-png" });
  const bytes = Buffer.from(png, "base64");
  const reject = validateLogoPng(bytes);
  if (reject) return void res.status(400).json({ error: reject });
  await setCafeBanner(cafeId, bytes);
  await syncGoogle(cafeId);
  res.json({ ok: true });
});

dashboardRouter.delete("/api/cafe/:id/banner", requireOwner, async (req: OwnerRequest, res) => {
  const cafeId = req.params.id!;
  if (!(await ownerHasCafe(req.owner!.id, cafeId))) {
    return void res.status(403).json({ error: "not-your-cafe" });
  }
  await deleteCafeBanner(cafeId);
  await syncGoogle(cafeId);
  res.json({ ok: true });
});

/**
 * Rich stamp grid. The dashboard renders one strip PNG per stamp count in the
 * browser (canvas) and posts the whole set here. `style` records which preset
 * icon is selected (for restoring the designer); the PNGs are what the card
 * shows. Stored transactionally so a card never has a half-updated grid.
 */
dashboardRouter.post("/api/cafe/:id/stamps", requireOwner, async (req: OwnerRequest, res) => {
  const cafeId = req.params.id!;
  if (!(await ownerHasCafe(req.owner!.id, cafeId))) {
    return void res.status(403).json({ error: "not-your-cafe" });
  }
  const { style, strips } = (req.body ?? {}) as {
    style?: string;
    strips?: { filled?: number; png?: string }[];
  };
  if (!Array.isArray(strips) || strips.length === 0) {
    return void res.status(400).json({ error: "missing-strips" });
  }
  const decoded: { filled: number; png: Buffer }[] = [];
  for (const s of strips) {
    if (typeof s?.png !== "string" || typeof s?.filled !== "number") {
      return void res.status(400).json({ error: "bad-strip" });
    }
    const bytes = Buffer.from(s.png, "base64");
    const reject = validateLogoPng(bytes); // same magic-byte + size guard
    if (reject) return void res.status(400).json({ error: reject });
    decoded.push({ filled: Math.trunc(s.filled), png: bytes });
  }
  await setStampStrips(cafeId, decoded);
  await updateCafe(cafeId, { stamp_style: (style ?? "").slice(0, 40) });
  await syncGoogle(cafeId); // refresh the Google hero image (version-stamped)
  res.json({ ok: true });
});

dashboardRouter.delete("/api/cafe/:id/stamps", requireOwner, async (req: OwnerRequest, res) => {
  const cafeId = req.params.id!;
  if (!(await ownerHasCafe(req.owner!.id, cafeId))) {
    return void res.status(403).json({ error: "not-your-cafe" });
  }
  await deleteStampStrips(cafeId);
  await updateCafe(cafeId, { stamp_style: "" });
  await syncGoogle(cafeId);
  res.json({ ok: true });
});

// ----------------------------------------------- owner-level customers / nudge ----
// The redesigned Customers view spans ALL of an owner's cards (not one selected
// card), so these aggregate across cafesForOwner and let the owner target which
// card(s) to message. Isolation still holds — only the owner's own cards.

/** Which of the owner's cards a request targets: the given ids, filtered to owned; else all. */
async function targetedCafes(ownerId: string, cardIds: unknown): Promise<CafeRow[]> {
  const owned = await cafesForOwner(ownerId);
  if (!Array.isArray(cardIds) || cardIds.length === 0) return owned;
  const wanted = new Set(cardIds.map(String));
  return owned.filter((c) => wanted.has(c.id));
}

/** GET /api/customers?cardId=all|<id>&lapsedDays=N — merged, card-tagged customer list. */
dashboardRouter.get("/api/customers", requireOwner, async (req: OwnerRequest, res) => {
  const owned = await cafesForOwner(req.owner!.id);
  const cardId = String(req.query.cardId ?? "all");
  const cards = cardId === "all" ? owned : owned.filter((c) => c.id === cardId);
  const lapsedDays = clampInt(req.query.lapsedDays, 0, 3650, 14);
  const now = Date.now();
  const customers = [];
  for (const cafe of cards) {
    for (const c of await cafeCustomers(cafe.id)) {
      // last_visit, not updated_at — a nudge must not reset the lapse clock.
      const lastDays = Math.floor((now - new Date(c.last_visit).getTime()) / 86400000);
      customers.push({
        serial: c.serial,
        code: c.code,
        cardId: cafe.id,
        cardName: cafe.name,
        stamps: c.stamps,
        target: c.target,
        lastDays,
        /** Days since the card was issued — how "New" is decided, independent of visits. */
        joinedDays: Math.floor((now - new Date(c.created_at).getTime()) / 86400000),
        /** Messages sent since their last visit; at the cap they count as churned. */
        unanswered: c.unanswered_nudges,
        lapsing: lapsedDays > 0 && lastDays >= lapsedDays,
      });
    }
  }
  customers.sort((a, b) => a.lastDays - b.lastDays);
  res.json({
    customers,
    lapsedDays,
    nudgeCap: MAX_UNANSWERED_NUDGES,
    cards: owned.map((c) => ({ id: c.id, name: c.name })),
  });
});

/** POST /api/nudge { message, cardIds?:[], target:"all"|"lapsing"|serial[], lapsedDays? }. */
dashboardRouter.post("/api/nudge", requireOwner, async (req: OwnerRequest, res) => {
  const body = (req.body ?? {}) as {
    message?: string;
    cardIds?: string[];
    target?: string | string[];
    lapsedDays?: number;
  };
  const message = (body.message ?? "").trim().slice(0, 200);
  if (!message) return void res.status(400).json({ error: "missing-message" });

  const cafes = await targetedCafes(req.owner!.id, body.cardIds);
  // Map every eligible serial → its café (also enforces ownership for serial[] targets).
  const serialCafe = new Map<string, CafeRow>();
  for (const cafe of cafes) {
    const days = clampInt(body.lapsedDays, 1, 3650, 14);
    const serials =
      body.target === "lapsing"
        ? await lapsingSerials(cafe.id, days)
        : (await cafeCustomers(cafe.id)).map((c) => c.serial);
    for (const s of serials) serialCafe.set(s, cafe);
  }
  let serials = [...serialCafe.keys()];
  if (Array.isArray(body.target)) {
    const wanted = new Set(body.target.map(String));
    serials = serials.filter((s) => wanted.has(s)); // only owned serials survive
  }
  serials = serials.slice(0, 1000);
  if (!serials.length) return void res.json({ ok: true, total: 0, sent: 0, failed: 0 });

  let sent = 0;
  let failed = 0;
  for (const serial of serials) {
    const cafe = serialCafe.get(serial)!;
    const r = await applyAndPush(cafe, serial, "nudge", () => setMessage(serial, message), {
      nudgeText: message,
      actor: `owner:${req.owner!.id}`,
    });
    if (r && r.push.sent > 0) sent++;
    else failed++;
  }
  res.json({ ok: true, total: serials.length, sent, failed });
});

/** Re-sync a café's Google-hosted class after a branding/art change (graceful no-op unconfigured). */
async function syncGoogle(cafeId: string): Promise<void> {
  const cafe = await updateCafe(cafeId, {}); // fetch fresh row
  if (!cafe) return;
  void ensureClass(cafe).then((r) => {
    if (!r.ok && r.reason !== "google-not-configured") {
      console.error("[dashboard] google class sync failed:", r);
    }
  });
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? Math.trunc(v) : Number.parseInt(String(v), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
