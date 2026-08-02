/**
 * Platform-admin console — for the person who RUNS Stampy (not café owners).
 * Gated by the owner session AND `owner.email` being in `config.adminEmails`
 * (ADMIN_EMAIL may list several, comma-separated). When ADMIN_EMAIL is unset the
 * whole console is closed (403).
 *
 *   GET    /admin                          the console page
 *   GET    /admin/api/overview             every café + owner email(s) + metrics
 *   POST   /admin/api/card/:id/archive     retire a card (reversible; nothing deleted)
 *   POST   /admin/api/card/:id/unarchive   put it back
 *   POST   /admin/api/owner/:id/reset-password  set a NEW temp password (never reveals the old)
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
  allCardsWithStats,
  allOwners,
  createCard,
  createOwner,
  adminRetention,
  adminStaffAudit,
  businessNameForCard,
  archiveCard,
  createDesignTemplate,
  deleteDesignTemplate,
  setDesignTemplateArt,
  updateDesignTemplate,
  unarchiveCard,
  deleteStampStrips,
  ensureMerchantForOwner,
  generateStaffPin,
  getCard,
  getDesignTemplate,
  listDesignTemplates,
  merchantEdits,
  merchantHealth,
  setMerchantArchived,
  setMerchantContact,
  setStaffPin,
  getOwner,
  getOwnerByEmail,
  linkOwnerCard,
  setCardBanner,
  setCardLogo,
  setStampStrips,
  updateCard,
  updateOwnerPassword,
  type OwnerRow,
} from "../db.js";
import { ensureClass } from "../googleWallet.js";
import { triage, trialDaysLeft, value } from "../health.js";
import { validateArtPng, validateLogoPng } from "../imageValidate.js";
import { BAND_TEXTURES, adminPage, counterSheetPage } from "../pages.js";

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
adminRouter.get("/card/:id/sheet", requireAdmin, async (req, res) => {
  const card = await getCard(req.params.id!);
  if (!card) return void res.status(404).type("html").send("<p>No such card.</p>");
  res.type("html").send(counterSheetPage(card, await businessNameForCard(card)));
});

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
  const [merchants, cards, owners, retention, staff] = await Promise.all([
    merchantHealth(),
    allCardsWithStats(),
    allOwners(),
    adminRetention(),
    adminStaffAudit(),
  ]);
  const withFlags = merchants.map((m) => ({
    ...m,
    flags: triage(m),
    value: value(m),
    trialLeft: trialDaysLeft(m),
  }));
  res.json({ merchants: withFlags, cards, owners, retention, staff });
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
 * Done-for-you onboarding: the platform operator creates a fully-designed café
 * AND a ready-to-use owner account in one shot (temp password returned once).
 * The design (colours, banner, stamp grid) is rendered in the admin's browser
 * and posted here — no server-side image work, same as the owner dashboard.
 */
adminRouter.post("/api/card", requireAdmin, async (req, res) => {
  const b = (req.body ?? {}) as {
    cafeName?: string; ownerEmail?: string; reward?: string;
    bg?: string; fg?: string; label?: string; stampStyle?: string;
    banner?: string; strips?: { filled?: number; png?: string }[];
  };
  const cafeName = (b.cafeName ?? "").trim();
  const ownerEmail = (b.ownerEmail ?? "").trim().toLowerCase();
  if (!cafeName) return void res.status(400).json({ error: "missing-card-name" });
  if (!ownerEmail.includes("@")) return void res.status(400).json({ error: "bad-email" });
  if (await getOwnerByEmail(ownerEmail)) return void res.status(409).json({ error: "email-taken" });

  const reward = (b.reward ?? "Free reward").trim().slice(0, 60) || "Free reward";
  // Owner → merchant → card, in that order: a card belongs to a business, and a
  // business belongs to a login. (This used to create the card first, back when
  // one row was all three things.)
  const tempPassword = "Stampy-" + randomBytes(4).toString("hex");
  const owner = await createOwner(randomUUID(), ownerEmail, hashPassword(tempPassword));
  const merchant = await ensureMerchantForOwner(owner.id, cafeName);
  const card = await createCard({
    merchantId: merchant.id,
    name: cafeName.slice(0, 60),
    reward,
    stampsTarget: 10,
    stampsStart: 2,
  });

  // Apply the chosen design. Colours arrive as hex; stored as rgb(...) for PassKit.
  const fresh = await updateCard(card.id, {
    reward,
    ...(typeof b.bg === "string" ? { background_color: hexToRgb(b.bg) } : {}),
    ...(typeof b.fg === "string" ? { foreground_color: hexToRgb(b.fg) } : {}),
    ...(typeof b.label === "string" ? { label_color: hexToRgb(b.label) } : {}),
    // The stamp fill follows the label colour here: these done-for-you designs
    // predate the accent being its own field, and that is what they rendered with.
    ...(typeof b.label === "string" ? { accent_color: hexToRgb(b.label) } : {}),
    stamp_style: (b.stampStyle ?? "").slice(0, 40),
  });

  if (typeof b.banner === "string" && b.banner) {
    const bytes = Buffer.from(b.banner, "base64");
    if (!validateArtPng(bytes)) await setCardBanner(card.id, bytes);
  }
  if (Array.isArray(b.strips) && b.strips.length) {
    // The console renders the grid at the card's own target, so that is the key
    // it is stored under — the browser has no separate number to send.
    const decoded: { target: number; filled: number; png: Buffer }[] = [];
    let ok = true;
    for (const s of b.strips) {
      if (typeof s?.png !== "string" || typeof s?.filled !== "number") { ok = false; break; }
      const bytes = Buffer.from(s.png, "base64");
      if (validateArtPng(bytes)) { ok = false; break; }
      decoded.push({ target: card.stamps_target, filled: Math.trunc(s.filled), png: bytes });
    }
    if (ok) await setStampStrips(card.id, decoded);
  }

  await linkOwnerCard(owner.id, card.id);
  // One staff PIN per owner, never the shared "1234". Only its hash is stored,
  // so this response is the one chance to hand it over — the console shows it
  // beside the temp password.
  const staffPin = generateStaffPin();
  await setStaffPin(owner.id, staffPin);
  void ensureClass(fresh ?? card).then((r) => {
    if (!r.ok && r.reason !== "google-not-configured") console.error("[admin] google sync failed:", r);
  });
  res.json({ ok: true, cardId: card.id, ownerEmail: owner.email, tempPassword, staffPin });
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

// ------------------------------------------------------- design templates ----
// The sales flow: mock a card up for a prospect BEFORE they have an account,
// then push the design onto their card once they sign up, so all they have to
// do afterwards is tweak the wording and colours.

adminRouter.get("/api/templates", requireAdmin, async (_req, res) => {
  res.json({ templates: await listDesignTemplates() });
});

/** A new, empty design. The shared designer fills it in save by save. */
adminRouter.post("/api/templates", requireAdmin, async (req, res) => {
  const name = String((req.body ?? {}).name ?? "").trim().slice(0, 60);
  if (!name) return void res.status(400).json({ error: "missing-name" });
  res.json({ ok: true, template: await createDesignTemplate(name) });
});

adminRouter.delete("/api/templates/:id", requireAdmin, async (req, res) => {
  await deleteDesignTemplate(req.params.id!);
  res.json({ ok: true });
});

/** Template art, for the designer's preview. Admin-gated like everything here. */
adminRouter.get("/api/templates/:id/:kind.png", requireAdmin, async (req, res) => {
  const tpl = await getDesignTemplate(req.params.id!);
  const png = req.params.kind === "logo" ? tpl?.logo : req.params.kind === "banner" ? tpl?.banner : null;
  if (!png) return void res.status(404).end();
  res.type("png").set("Cache-Control", "no-store").send(png);
});

// --- the design routes the shared designer drives ---------------------------
// Deliberately the same request shapes as the dashboard's `/api/card/:id`
// family, because it is the same browser code sending them (DESIGN_PANEL_JS).
// If one of these drifts from its dashboard twin, the console's designer breaks
// in exactly the way the old hand-written copy did.

adminRouter.post("/api/design/:id", requireAdmin, async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const fields: Record<string, string | number> = {};
  const str = (v: unknown, max: number) => String(v).trim().slice(0, max);
  // A design has no merchant, so `shopName` — which on a real card renames the
  // business — is stored as the design's own name and goes no further.
  if (typeof body.shopName === "string" && body.shopName.trim()) fields.name = str(body.shopName, 60);
  else if (typeof body.name === "string" && body.name.trim()) fields.name = str(body.name, 60);
  if (typeof body.reward === "string" && body.reward.trim()) fields.reward = str(body.reward, 60);
  if (body.stampsTarget !== undefined) {
    fields.stamps_target = Math.max(1, Math.min(20, Math.trunc(Number(body.stampsTarget)) || 10));
  }
  if (body.stampsStart !== undefined) {
    fields.stamps_start = Math.max(0, Math.min(19, Math.trunc(Number(body.stampsStart)) || 0));
  }
  if (typeof body.signupMessage === "string") fields.signup_message = str(body.signupMessage, 120);
  if (typeof body.bg === "string") fields.bg = hexToRgb(body.bg);
  if (typeof body.fg === "string") fields.fg = hexToRgb(body.fg);
  if (typeof body.label === "string") fields.label_color = hexToRgb(body.label);
  if (typeof body.accent === "string") fields.accent_color = hexToRgb(body.accent);
  if (typeof body.bandColor === "string") fields.band_color = hexToRgb(body.bandColor);
  // Same fixed vocabulary the dashboard enforces: an unknown texture reaches the
  // renderer and falls through to a flat fill without ever saying so.
  if (typeof body.bandTexture === "string" && BAND_TEXTURES.includes(body.bandTexture)) {
    fields.band_texture = body.bandTexture;
  }
  const tpl = await updateDesignTemplate(req.params.id!, fields);
  if (!tpl) return void res.status(404).json({ error: "no-such-template" });
  res.json({ ok: true });
});

adminRouter.post("/api/design/:id/:kind(logo|banner)", requireAdmin, async (req, res) => {
  const kind = req.params.kind as "logo" | "banner";
  const { png } = (req.body ?? {}) as { png?: string };
  if (typeof png !== "string" || !png) return void res.status(400).json({ error: "missing-png" });
  const bytes = Buffer.from(png, "base64");
  // A band is a photo and dwarfs a logo, so the two caps differ — same split as
  // the dashboard.
  const reject = kind === "logo" ? validateLogoPng(bytes) : validateArtPng(bytes);
  if (reject) return void res.status(400).json({ error: reject });
  if (!(await getDesignTemplate(req.params.id!))) {
    return void res.status(404).json({ error: "no-such-template" });
  }
  await setDesignTemplateArt(req.params.id!, kind, bytes);
  res.json({ ok: true });
});

adminRouter.delete("/api/design/:id/:kind(logo|banner)", requireAdmin, async (req, res) => {
  await setDesignTemplateArt(req.params.id!, req.params.kind as "logo" | "banner", null);
  res.json({ ok: true });
});

/**
 * Stamp strips for a DESIGN are accepted and thrown away.
 *
 * The designer renders and posts them on every change, because for a real card
 * that pre-generated set IS the card art. A design has no stamp count of its
 * own that any customer holds — the grid is re-rendered for the target card's
 * real target at push time — so storing them here would only be storing a
 * picture that can never be the right one. The style is kept; the pixels are
 * not. Answering `ok` rather than 404 keeps the shared designer on one path.
 */
adminRouter.post("/api/design/:id/stamps", requireAdmin, async (req, res) => {
  const { style } = (req.body ?? {}) as { style?: string };
  const tpl = await updateDesignTemplate(req.params.id!, { stamp_style: (style ?? "").slice(0, 40) });
  if (!tpl) return void res.status(404).json({ error: "no-such-template" });
  res.json({ ok: true });
});

/**
 * Push a saved design onto a merchant's card. **Look only.**
 *
 * Colours (all five), band texture, stamp style and art copy across. The
 * reward wording and the stamps-to-reward number deliberately do NOT: a pass
 * carries the ruleset it was issued with, so pushing a target would leave old
 * and new customers on different promises, and pushing a reward would let this
 * console silently contradict what staff have been telling people at the
 * counter. A design changes how a card looks and never what it promises.
 * (It used to write `reward`. That line is gone.)
 *
 * The stamp strips are re-rendered by the admin's browser for THIS card's stamp
 * count and posted alongside, because a design cannot know what that count will
 * be — and after this push it still does not set it.
 *
 * The card's name and its links are left alone — this changes how it looks, not
 * what it is or where it points.
 */
adminRouter.post("/api/card/:id/apply-template", requireAdmin, async (req, res) => {
  const b = (req.body ?? {}) as { templateId?: string; strips?: { filled: number; png: string }[] };
  const tpl = await getDesignTemplate(String(b.templateId ?? ""));
  if (!tpl) return void res.status(404).json({ error: "no-such-template" });
  const card = await updateCard(req.params.id!, {
    background_color: tpl.bg,
    foreground_color: tpl.fg,
    label_color: tpl.label_color,
    accent_color: tpl.accent_color,
    band_color: tpl.band_color,
    band_texture: tpl.band_texture,
    stamp_style: tpl.stamp_style,
  });
  if (!card) return void res.status(404).json({ error: "no-such-card" });

  if (tpl.logo) await setCardLogo(card.id, tpl.logo);
  if (tpl.banner) await setCardBanner(card.id, tpl.banner);

  // Strips are all-or-nothing: a half-applied grid would show the old art for
  // some stamp counts and the new art for others.
  if (Array.isArray(b.strips) && b.strips.length) {
    const decoded: { target: number; filled: number; png: Buffer }[] = [];
    let ok = true;
    for (const s of b.strips) {
      if (typeof s?.png !== "string" || typeof s?.filled !== "number") { ok = false; break; }
      const bytes = Buffer.from(s.png, "base64");
      if (validateArtPng(bytes)) { ok = false; break; }
      decoded.push({ target: card.stamps_target, filled: Math.trunc(s.filled), png: bytes });
    }
    if (ok) await setStampStrips(card.id, decoded);
    else await deleteStampStrips(card.id);
  }

  void ensureClass(card).then((r) => {
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
