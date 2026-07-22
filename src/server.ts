/**
 * Stampy — digital loyalty stamp cards in Apple Wallet.
 * Boots with or without Apple secrets; /setup shows what's still missing.
 */
import express from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { hashPassword } from "./auth.js";
import { config, setupStatus } from "./config.js";
import { createOwner, getOwnerByEmail, migrate, updateOwnerPassword } from "./db.js";
import { runAutoWinback } from "./winback.js";
import { setupPage } from "./pages.js";
import { adminRouter } from "./routes/admin.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { publicRouter } from "./routes/public.js";
import { staffRouter } from "./routes/staff.js";
import { walletRouter } from "./routes/wallet.js";

const app = express();
// Railway terminates TLS at its edge proxy and forwards X-Forwarded-For, so
// trust it — otherwise req.ip is the proxy for every request and IP-keyed rate
// limits (signup, staff PIN) would bucket the whole platform together.
app.set("trust proxy", true);
// 2mb covers a full set of rendered stamp-grid strips (one PNG per count, up to
// ~31) in one transactional POST; logo/banner uploads are far smaller. All
// mutation routes are auth-gated + rate-limited, so the larger cap is low-risk.
app.use(express.json({ limit: "2mb" }));

// Static assets (self-hosted fonts + their stylesheet). Long-cached; these are
// public, content-hashed-by-name files — no secrets.
const assetsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "assets");
app.use("/assets", express.static(assetsDir, { maxAge: "30d", immutable: true }));

app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/setup", (_req, res) => res.type("html").send(setupPage(setupStatus(), config.baseUrl)));

app.use("/wallet", walletRouter);
app.use("/staff", staffRouter);
app.use("/dashboard", dashboardRouter);
app.use("/admin", adminRouter);
app.use("/", publicRouter);

// Log-and-500 fallback so one bad request never kills the demo.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[error]", err);
  res.status(500).json({ error: "internal" });
});

/**
 * Break-glass account recovery, entirely through Railway's Variables UI (no
 * terminal, no email needed). If BOTH BOOTSTRAP_OWNER_EMAIL and
 * BOOTSTRAP_OWNER_PASSWORD are set, on boot we CREATE that owner — or reset its
 * password if it already exists — to the given password. Use it to get back in
 * when you're locked out and email isn't configured, then DELETE both variables
 * (it re-runs harmlessly on every boot while they're present). To actually reach
 * /admin the email must also be listed in ADMIN_EMAIL.
 */
async function bootstrapOwner(): Promise<void> {
  const email = (process.env.BOOTSTRAP_OWNER_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.BOOTSTRAP_OWNER_PASSWORD ?? "";
  if (!email.includes("@") || password.length < 8) return;
  const existing = await getOwnerByEmail(email);
  if (existing) {
    await updateOwnerPassword(existing.id, hashPassword(password));
    console.log(`[bootstrap] reset password for existing owner ${email}`);
  } else {
    await createOwner(randomUUID(), email, hashPassword(password));
    console.log(`[bootstrap] created owner ${email}`);
  }
  console.log("[bootstrap] done — remove BOOTSTRAP_OWNER_EMAIL/PASSWORD from Railway now.");
}

async function main(): Promise<void> {
  if (config.databaseUrl) {
    await migrate();
    console.log("Database ready.");
    await bootstrapOwner().catch((err) => console.error("[bootstrap] failed:", err));
    // Automated win-back: sweep once on boot, then hourly. Sends are throttled
    // by the per-card "already nudged this window" guard, so this can't spam.
    void runAutoWinback();
    const wb = setInterval(() => void runAutoWinback(), 60 * 60_000);
    if (typeof wb.unref === "function") wb.unref();
  } else {
    console.warn("DATABASE_URL not set — running without a database (setup mode).");
  }
  app.listen(config.port, () => {
    console.log(`Stampy listening on :${config.port}`);
    console.log("Setup status:", setupStatus());
  });
}

main().catch((err) => {
  console.error("Fatal boot error:", err);
  process.exit(1);
});
