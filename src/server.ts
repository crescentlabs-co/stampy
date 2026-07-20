/**
 * Stampy — digital loyalty stamp cards in Apple Wallet.
 * Boots with or without Apple secrets; /setup shows what's still missing.
 */
import express from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { config, setupStatus } from "./config.js";
import { migrate } from "./db.js";
import { setupPage } from "./pages.js";
import { adminRouter } from "./routes/admin.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { publicRouter } from "./routes/public.js";
import { staffRouter } from "./routes/staff.js";
import { walletRouter } from "./routes/wallet.js";

const app = express();
// 600kb: room for a base64-encoded café logo (≤256KB binary → ~342KB JSON);
// everything else stays tiny. Express still hard-rejects bodies beyond this.
app.use(express.json({ limit: "600kb" }));

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
