/**
 * Stampy — digital loyalty stamp cards in Apple Wallet.
 * Boots with or without Apple secrets; /setup shows what's still missing.
 */
import express from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { config, setupStatus } from "./config.js";
import { migrate } from "./db.js";
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
// 600kb: room for a base64-encoded café logo (≤256KB binary → ~342KB JSON);
// everything else stays tiny. Express still hard-rejects bodies beyond this.
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

async function main(): Promise<void> {
  if (config.databaseUrl) {
    await migrate();
    console.log("Database ready.");
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
