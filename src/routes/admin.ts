/**
 * Platform-admin console — for the person who RUNS Stampy (not café owners).
 * Gated by the owner session AND `owner.email` being in `config.adminEmails`
 * (ADMIN_EMAIL may list several, comma-separated). When ADMIN_EMAIL is unset the
 * whole console is closed (403).
 *
 *   GET  /admin                          the console page
 *   GET  /admin/api/overview             every café + owner email(s) + metrics
 *   POST /admin/api/owner/:id/reset-password  set a NEW temp password (never reveals the old)
 *
 * Security: passwords are scrypt-hashed one-way — there is nothing to "view".
 * Reset = replace the hash with a fresh temp password, returned once.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { hashPassword, sessionOwnerId } from "../auth.js";
import { hexToRgb } from "../color.js";
import { config } from "../config.js";
import {
  allCafesWithStats,
  allOwners,
  createCafe,
  createOwner,
  getOwner,
  getOwnerByEmail,
  linkOwnerCafe,
  setCafeBanner,
  setStampStrips,
  updateCafe,
  updateOwnerPassword,
  type OwnerRow,
} from "../db.js";
import { ensureClass } from "../googleWallet.js";
import { validateLogoPng } from "../imageValidate.js";
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

adminRouter.get("/api/overview", requireAdmin, async (_req, res) => {
  const [cafes, owners] = await Promise.all([allCafesWithStats(), allOwners()]);
  res.json({ cafes, owners });
});

/**
 * Done-for-you onboarding: the platform operator creates a fully-designed café
 * AND a ready-to-use owner account in one shot (temp password returned once).
 * The design (colours, banner, stamp grid) is rendered in the admin's browser
 * and posted here — no server-side image work, same as the owner dashboard.
 */
adminRouter.post("/api/cafe", requireAdmin, async (req, res) => {
  const b = (req.body ?? {}) as {
    cafeName?: string; ownerEmail?: string; reward?: string;
    bg?: string; fg?: string; label?: string; stampStyle?: string;
    banner?: string; strips?: { filled?: number; png?: string }[];
  };
  const cafeName = (b.cafeName ?? "").trim();
  const ownerEmail = (b.ownerEmail ?? "").trim().toLowerCase();
  if (!cafeName) return void res.status(400).json({ error: "missing-cafe-name" });
  if (!ownerEmail.includes("@")) return void res.status(400).json({ error: "bad-email" });
  if (await getOwnerByEmail(ownerEmail)) return void res.status(409).json({ error: "email-taken" });

  const reward = (b.reward ?? "Free reward").trim().slice(0, 60) || "Free reward";
  const cafe = await createCafe({
    name: cafeName.slice(0, 60),
    reward,
    stampsTarget: 10,
    stampsStart: 2,
    staffPin: String(randomInt(1000, 10000)), // per-café, not the shared 1234
  });

  // Apply the chosen design. Colours arrive as hex; stored as rgb(...) for PassKit.
  const fresh = await updateCafe(cafe.id, {
    reward,
    ...(typeof b.bg === "string" ? { background_color: hexToRgb(b.bg) } : {}),
    ...(typeof b.fg === "string" ? { foreground_color: hexToRgb(b.fg) } : {}),
    ...(typeof b.label === "string" ? { label_color: hexToRgb(b.label) } : {}),
    stamp_style: (b.stampStyle ?? "").slice(0, 40),
  });

  if (typeof b.banner === "string" && b.banner) {
    const bytes = Buffer.from(b.banner, "base64");
    if (!validateLogoPng(bytes)) await setCafeBanner(cafe.id, bytes);
  }
  if (Array.isArray(b.strips) && b.strips.length) {
    const decoded: { filled: number; png: Buffer }[] = [];
    let ok = true;
    for (const s of b.strips) {
      if (typeof s?.png !== "string" || typeof s?.filled !== "number") { ok = false; break; }
      const bytes = Buffer.from(s.png, "base64");
      if (validateLogoPng(bytes)) { ok = false; break; }
      decoded.push({ filled: Math.trunc(s.filled), png: bytes });
    }
    if (ok) await setStampStrips(cafe.id, decoded);
  }

  // Create the owner account with a readable temp password, then link them.
  const tempPassword = "Stampy-" + randomBytes(4).toString("hex");
  const owner = await createOwner(randomUUID(), ownerEmail, hashPassword(tempPassword));
  await linkOwnerCafe(owner.id, cafe.id);
  void ensureClass(fresh ?? cafe).then((r) => {
    if (!r.ok && r.reason !== "google-not-configured") console.error("[admin] google sync failed:", r);
  });
  res.json({ ok: true, cafeId: cafe.id, ownerEmail: owner.email, tempPassword });
});

adminRouter.post("/api/owner/:id/reset-password", requireAdmin, async (req, res) => {
  const owner = await getOwner(req.params.id!);
  if (!owner) return void res.status(404).json({ error: "no-such-owner" });
  // A readable temp password; the owner logs in and changes it in the dashboard.
  const tempPassword = "Stampy-" + randomBytes(4).toString("hex");
  await updateOwnerPassword(owner.id, hashPassword(tempPassword));
  res.json({ ok: true, email: owner.email, tempPassword });
});
