/**
 * Owner dashboard: login, café metrics, edit card content, add cafés.
 *
 *   GET  /dashboard                 the dashboard page (login or app)
 *   POST /dashboard/api/signup      first-owner bootstrap (only while no owners exist)
 *   POST /dashboard/api/login       { email, password } → session cookie
 *   POST /dashboard/api/logout
 *   GET  /dashboard/api/overview    cafés + metrics for the logged-in owner
 *   POST /dashboard/api/cafes       create a new café
 *   POST /dashboard/api/cafe/:id    update café fields (name, reward, target, PIN…)
 *
 * Signup is intentionally closed after the first owner (they can invite/add
 * partners later — deferred). This avoids strangers claiming the dashboard.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { randomUUID } from "node:crypto";
import {
  clearSessionCookie,
  hashPassword,
  sessionOwnerId,
  setSessionCookie,
  verifyPassword,
} from "../auth.js";
import {
  cafeMetrics,
  cafesForOwner,
  countOwners,
  createCafe,
  createOwner,
  DEFAULT_CAFE_ID,
  getOwner,
  getOwnerByEmail,
  linkOwnerCafe,
  ownerHasCafe,
  updateCafe,
  type OwnerRow,
} from "../db.js";
import { ensureClass } from "../googleWallet.js";
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

/** Tells the page whether to show signup (first boot) or login. */
dashboardRouter.get("/api/state", async (req, res) => {
  const owners = await countOwners();
  const ownerId = sessionOwnerId(req);
  res.json({ needsSignup: owners === 0, loggedIn: Boolean(ownerId && (await getOwner(ownerId))) });
});

dashboardRouter.post("/api/signup", async (req, res) => {
  const { email, password } = (req.body ?? {}) as { email?: string; password?: string };
  if (!email?.includes("@") || !password || password.length < 8) {
    return void res.status(400).json({ error: "need-valid-email-and-8-char-password" });
  }
  if ((await countOwners()) > 0) {
    return void res.status(403).json({ error: "signup-closed" });
  }
  const owner = await createOwner(randomUUID(), email, hashPassword(password));
  await linkOwnerCafe(owner.id, DEFAULT_CAFE_ID); // first owner manages the default café
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

dashboardRouter.get("/api/overview", requireOwner, async (req: OwnerRequest, res) => {
  const cafes = await cafesForOwner(req.owner!.id);
  const out = [];
  for (const cafe of cafes) {
    out.push({
      id: cafe.id,
      name: cafe.name,
      reward: cafe.reward,
      stampsTarget: cafe.stamps_target,
      stampsStart: cafe.stamps_start,
      staffPin: cafe.staff_pin,
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

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? Math.trunc(v) : Number.parseInt(String(v), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
