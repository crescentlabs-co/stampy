/**
 * Platform-admin console — for the person who RUNS Stampy (not café owners).
 * Gated by the owner session AND `owner.email === config.adminEmail`; when
 * ADMIN_EMAIL is unset the whole console is closed (403).
 *
 *   GET  /admin                          the console page
 *   GET  /admin/api/overview             every café + owner email(s) + metrics
 *   POST /admin/api/owner/:id/reset-password  set a NEW temp password (never reveals the old)
 *
 * Security: passwords are scrypt-hashed one-way — there is nothing to "view".
 * Reset = replace the hash with a fresh temp password, returned once.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { randomBytes } from "node:crypto";
import { hashPassword, sessionOwnerId } from "../auth.js";
import { config } from "../config.js";
import { allCafesWithStats, allOwners, getOwner, updateOwnerPassword, type OwnerRow } from "../db.js";
import { adminPage } from "../pages.js";

export const adminRouter = Router();

interface AdminRequest extends Request {
  admin?: OwnerRow;
}

async function requireAdmin(req: AdminRequest, res: Response, next: NextFunction): Promise<void> {
  if (!config.adminEmail) return void res.status(403).json({ error: "admin-closed" });
  const ownerId = sessionOwnerId(req);
  const owner = ownerId ? await getOwner(ownerId) : null;
  if (!owner || owner.email.toLowerCase() !== config.adminEmail) {
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

adminRouter.post("/api/owner/:id/reset-password", requireAdmin, async (req, res) => {
  const owner = await getOwner(req.params.id!);
  if (!owner) return void res.status(404).json({ error: "no-such-owner" });
  // A readable temp password; the owner logs in and changes it in the dashboard.
  const tempPassword = "Stampy-" + randomBytes(4).toString("hex");
  await updateOwnerPassword(owner.id, hashPassword(tempPassword));
  res.json({ ok: true, email: owner.email, tempPassword });
});
