/**
 * Stampy — digital loyalty stamp cards in Apple Wallet.
 * Boots with or without Apple secrets; /setup shows what's still missing.
 */
import express from "express";
import { config, setupStatus } from "./config.js";
import { migrate } from "./db.js";
import { setupPage } from "./pages.js";
import { publicRouter } from "./routes/public.js";
import { staffRouter } from "./routes/staff.js";
import { walletRouter } from "./routes/wallet.js";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/setup", (_req, res) => res.type("html").send(setupPage(setupStatus(), config.baseUrl)));

app.use("/wallet", walletRouter);
app.use("/staff", staffRouter);
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
