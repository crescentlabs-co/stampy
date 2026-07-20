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
import { randomInt, randomUUID } from "node:crypto";
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
  countOwners,
  createCafe,
  createOwner,
  DEFAULT_CAFE_ID,
  deleteCafeBanner,
  deleteCafeLogo,
  getCafe,
  getOwner,
  getOwnerByEmail,
  lapsingSerials,
  linkOwnerCafe,
  ownerHasCafe,
  setCafeBanner,
  setCafeLogo,
  setMessage,
  updateCafe,
  updateOwnerPassword,
  type OwnerRow,
} from "../db.js";
import { applyAndPush } from "../cardActions.js";
import { hexToRgb, rgbToHex } from "../color.js";
import { ensureClass } from "../googleWallet.js";
import { validateLogoPng } from "../imageValidate.js";
import { dashboardPage } from "../pages.js";

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
  res.type("html").send(dashboardPage());
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
  res.json({ ok: true });
});

dashboardRouter.post("/api/login", async (req, res) => {
  const { email, password } = (req.body ?? {}) as { email?: string; password?: string };
  const owner = email ? await getOwnerByEmail(email) : null;
  // Verify against a dummy hash when the owner doesn't exist so response time
  // doesn't reveal which emails are registered.
  const ok = owner
    ? verifyPassword(password ?? "", owner.password_hash)
    : (verifyPassword(password ?? "", hashPassword("dummy-password")), false);
  if (!ok || !owner) return void res.status(401).json({ error: "wrong-email-or-password" });
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

dashboardRouter.get("/api/overview", requireOwner, async (req: OwnerRequest, res) => {
  const cafes = await cafesForOwner(req.owner!.id);
  const out = [];
  for (const cafe of cafes) {
    const [logoVersion, bannerVersion] = await Promise.all([
      cafeLogoVersion(cafe.id),
      cafeBannerVersion(cafe.id),
    ]);
    out.push({
      id: cafe.id,
      name: cafe.name,
      reward: cafe.reward,
      stampsTarget: cafe.stamps_target,
      stampsStart: cafe.stamps_start,
      staffPin: cafe.staff_pin,
      // Colours cross the API as hex — that's what <input type="color"> speaks.
      bg: rgbToHex(cafe.background_color),
      fg: rgbToHex(cafe.foreground_color),
      label: rgbToHex(cafe.label_color),
      logoVersion, // 0 = no upload; used to cache-bust the preview image
      bannerVersion,
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
  const cafe = await createCafe({
    name: name.trim().slice(0, 60),
    reward: (reward ?? "Free coffee").trim().slice(0, 60),
    stampsTarget: clampInt(stampsTarget, 1, 30, 10),
    stampsStart: clampInt(stampsStart, 0, 29, 2),
    staffPin: (staffPin ?? "1234").trim().slice(0, 12) || "1234",
  });
  await linkOwnerCafe(req.owner!.id, cafe.id);
  res.json({ ok: true, id: cafe.id });
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
  if (typeof body.staffPin === "string" && body.staffPin.trim()) {
    fields.staff_pin = body.staffPin.trim().slice(0, 12);
  }
  // Colours arrive as hex from the pickers; stored as rgb(...) for PassKit.
  if (typeof body.bg === "string") fields.background_color = hexToRgb(body.bg);
  if (typeof body.fg === "string") fields.foreground_color = hexToRgb(body.fg);
  if (typeof body.label === "string") fields.label_color = hexToRgb(body.label);
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

/** Customers of a card, with days-since-last-activity + a lapsing flag. */
dashboardRouter.get("/api/cafe/:id/customers", requireOwner, async (req: OwnerRequest, res) => {
  const cafeId = req.params.id!;
  if (!(await ownerHasCafe(req.owner!.id, cafeId))) {
    return void res.status(403).json({ error: "not-your-cafe" });
  }
  const lapsedDays = clampInt(req.query.lapsedDays, 0, 3650, 14);
  const now = Date.now();
  const customers = (await cafeCustomers(cafeId)).map((c) => {
    const lastDays = Math.floor((now - new Date(c.updated_at).getTime()) / 86400000);
    return {
      serial: c.serial,
      code: c.code,
      stamps: c.stamps,
      target: c.target,
      lastDays,
      lapsing: lapsedDays > 0 && lastDays >= lapsedDays,
    };
  });
  res.json({ customers, lapsedDays });
});

/**
 * Owner win-back nudge: sends a lock-screen message to one card, a list, all,
 * or the lapsing set. Each goes through applyAndPush (same platform dispatch as
 * a stamp). Reports counts; Google's 3/card/24h cap applies (best-effort).
 */
dashboardRouter.post("/api/cafe/:id/nudge", requireOwner, async (req: OwnerRequest, res) => {
  const cafeId = req.params.id!;
  if (!(await ownerHasCafe(req.owner!.id, cafeId))) {
    return void res.status(403).json({ error: "not-your-cafe" });
  }
  const body = (req.body ?? {}) as { message?: string; target?: string | string[]; lapsedDays?: number };
  const message = (body.message ?? "").trim().slice(0, 200);
  if (!message) return void res.status(400).json({ error: "missing-message" });

  let serials: string[];
  if (Array.isArray(body.target)) serials = body.target.slice(0, 500);
  else if (body.target === "lapsing") serials = await lapsingSerials(cafeId, clampInt(body.lapsedDays, 1, 3650, 14));
  else serials = (await cafeCustomers(cafeId)).map((c) => c.serial); // "all"
  if (!serials.length) return void res.json({ ok: true, total: 0, sent: 0, failed: 0 });

  const cafe = await getCafe(cafeId);
  if (!cafe) return void res.status(404).json({ error: "no-such-cafe" });

  let sent = 0;
  let failed = 0;
  for (const serial of serials) {
    const r = await applyAndPush(cafe, serial, "nudge", () => setMessage(serial, message), message);
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
