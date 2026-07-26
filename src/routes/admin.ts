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
import { randomBytes, randomUUID } from "node:crypto";
import { hashPassword, sessionOwnerId } from "../auth.js";
import { hexToRgb } from "../color.js";
import { config } from "../config.js";
import {
  allCafesWithStats,
  allOwners,
  createCafe,
  createOwner,
  adminRetention,
  adminStaffAudit,
  createDesignTemplate,
  deleteDesignTemplate,
  deleteStampStrips,
  generateStaffPin,
  getCafe,
  getDesignTemplate,
  listDesignTemplates,
  setStaffPin,
  getOwner,
  getOwnerByEmail,
  linkOwnerCafe,
  setCafeBanner,
  setCafeLogo,
  setStampStrips,
  updateCafe,
  updateOwnerPassword,
  type OwnerRow,
} from "../db.js";
import { ensureClass } from "../googleWallet.js";
import { validateLogoPng } from "../imageValidate.js";
import { adminPage, counterSheetPage } from "../pages.js";

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

/** Print-ready counter sheet for one card: the QR, big, with the reward named. */
adminRouter.get("/cafe/:id/sheet", requireAdmin, async (req, res) => {
  const cafe = await getCafe(req.params.id!);
  if (!cafe) return void res.status(404).type("html").send("<p>No such card.</p>");
  res.type("html").send(counterSheetPage(cafe));
});

adminRouter.get("/api/overview", requireAdmin, async (_req, res) => {
  const [cafes, owners, retention, staff] = await Promise.all([
    allCafesWithStats(),
    allOwners(),
    adminRetention(),
    adminStaffAudit(),
  ]);
  res.json({ cafes, owners, retention, staff });
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
  // One staff PIN per owner, never the shared "1234". Only its hash is stored,
  // so this response is the one chance to hand it over — the console shows it
  // beside the temp password.
  const staffPin = generateStaffPin();
  await setStaffPin(owner.id, staffPin);
  void ensureClass(fresh ?? cafe).then((r) => {
    if (!r.ok && r.reason !== "google-not-configured") console.error("[admin] google sync failed:", r);
  });
  res.json({ ok: true, cafeId: cafe.id, ownerEmail: owner.email, tempPassword, staffPin });
});

// ------------------------------------------------------- design templates ----
// The sales flow: mock a card up for a prospect BEFORE they have an account,
// then push the design onto their card once they sign up, so all they have to
// do afterwards is tweak the wording and colours.

adminRouter.get("/api/templates", requireAdmin, async (_req, res) => {
  res.json({ templates: await listDesignTemplates() });
});

adminRouter.post("/api/templates", requireAdmin, async (req, res) => {
  const b = (req.body ?? {}) as {
    name?: string; reward?: string; bg?: string; fg?: string; label?: string;
    stampStyle?: string; logo?: string; banner?: string;
  };
  const name = (b.name ?? "").trim().slice(0, 60);
  if (!name) return void res.status(400).json({ error: "missing-name" });

  // Images arrive base64 from the admin's browser, same as the done-for-you
  // flow. validateLogoPng returns a REASON on failure, so truthy means bad.
  const decode = (s?: string): Buffer | null => {
    if (typeof s !== "string" || !s) return null;
    const bytes = Buffer.from(s, "base64");
    return validateLogoPng(bytes) ? null : bytes;
  };
  const { id } = await createDesignTemplate({
    name,
    reward: (b.reward ?? "Free reward").trim().slice(0, 60) || "Free reward",
    bg: hexToRgb(b.bg ?? "#3b2016"),
    fg: hexToRgb(b.fg ?? "#fffaf0"),
    labelColor: hexToRgb(b.label ?? "#d6b278"),
    stampStyle: (b.stampStyle ?? "").slice(0, 40),
    logo: decode(b.logo),
    banner: decode(b.banner),
  });
  res.json({ ok: true, id });
});

adminRouter.delete("/api/templates/:id", requireAdmin, async (req, res) => {
  await deleteDesignTemplate(req.params.id!);
  res.json({ ok: true });
});

/** Template art, for the preview thumbnails. Admin-gated like everything here. */
adminRouter.get("/api/templates/:id/:kind.png", requireAdmin, async (req, res) => {
  const tpl = await getDesignTemplate(req.params.id!);
  const png = req.params.kind === "logo" ? tpl?.logo : req.params.kind === "banner" ? tpl?.banner : null;
  if (!png) return void res.status(404).end();
  res.type("png").set("Cache-Control", "no-store").send(png);
});

/**
 * Push a saved design onto a merchant's card. Colours, stamp style, reward and
 * art all copy across; the stamp strips are re-rendered by the admin's browser
 * for THIS card's stamp count and posted alongside, because a template can't
 * know what that count will be.
 *
 * The card's name and its links are left alone — this changes how it looks, not
 * what it is or where it points.
 */
adminRouter.post("/api/cafe/:id/apply-template", requireAdmin, async (req, res) => {
  const b = (req.body ?? {}) as { templateId?: string; strips?: { filled: number; png: string }[] };
  const tpl = await getDesignTemplate(String(b.templateId ?? ""));
  if (!tpl) return void res.status(404).json({ error: "no-such-template" });
  const cafe = await updateCafe(req.params.id!, {
    reward: tpl.reward,
    background_color: tpl.bg,
    foreground_color: tpl.fg,
    label_color: tpl.label_color,
    stamp_style: tpl.stamp_style,
  });
  if (!cafe) return void res.status(404).json({ error: "no-such-cafe" });

  if (tpl.logo) await setCafeLogo(cafe.id, tpl.logo);
  if (tpl.banner) await setCafeBanner(cafe.id, tpl.banner);

  // Strips are all-or-nothing: a half-applied grid would show the old art for
  // some stamp counts and the new art for others.
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
    else await deleteStampStrips(cafe.id);
  }

  void ensureClass(cafe).then((r) => {
    if (!r.ok && r.reason !== "google-not-configured") console.error("[admin] google sync failed:", r);
  });
  res.json({ ok: true });
});

adminRouter.post("/api/owner/:id/reset-password", requireAdmin, async (req, res) => {
  const owner = await getOwner(req.params.id!);
  if (!owner) return void res.status(404).json({ error: "no-such-owner" });
  // A readable temp password; the owner logs in and changes it in the dashboard.
  const tempPassword = "Stampy-" + randomBytes(4).toString("hex");
  await updateOwnerPassword(owner.id, hashPassword(tempPassword));
  res.json({ ok: true, email: owner.email, tempPassword });
});
