/**
 * `pnpm dev:local` — the whole app on your own machine, no Railway and no
 * secrets: embedded Postgres, the real server, and demo customers spread across
 * every recency group so the Customers screen has something to show.
 *
 * Nothing here touches production. The database is thrown away on exit.
 *
 *   open http://localhost:3010/dashboard   log in dev@stampy.test / password123
 *   open http://localhost:3010/staff       staff PIN 1234
 */
import EmbeddedPostgres from "embedded-postgres";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dataDir = mkdtempSync(path.join(tmpdir(), "stampy-dev-"));
const pg = new EmbeddedPostgres({ databaseDir: dataDir, user: "s", password: "s", port: 5488, persistent: false });

async function main() {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("stampy");
  process.env.DATABASE_URL = "postgresql://s:s@localhost:5488/stampy";
  process.env.BASE_URL = "http://localhost:3010";
  process.env.PORT = "3010";
  process.env.SESSION_SECRET = "dev-secret";
  process.env.ADMIN_EMAIL = "dev@stampy.test";

  const db = await import("../src/db.js");
  await db.migrate();
  await import("../src/server.js");
  await new Promise((r) => setTimeout(r, 1200));

  const base = "http://localhost:3010";
  await fetch(base + "/dashboard/api/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "dev@stampy.test", password: "password123" }),
  });
  await db.updateCafe("default", { average_spend_cents: 450, currency: "RM" });

  // Customers spread across every recency group so the grouping is visible.
  const ages = [0, 0, 2, 3, 9, 11, 18, 22, 40, 55, 120];
  let i = 0;
  for (const age of ages) {
    const serial = crypto.randomUUID();
    const p = await db.createPass({
      serial, cafeId: "default", platform: "apple",
      shortCode: db.generateShortCode(), authToken: "t".repeat(24),
      stampCount: (i % 9) + 1, stampsTarget: 10, reward: "Free coffee",
    });
    await db.logEvent("default", p.serial, "enroll", { actor: "customer" });
    await db.logEvent("default", p.serial, "stamp", { actor: "staff:aaaaaaaaaa" });
    await db.upsertRegistration("dev-device-" + i, p.serial, "tok");
    const joined = age < 7 ? age : age + 20;
    await db.getPool().query(
      `UPDATE passes SET created_at = now() - ($2 || ' days')::interval WHERE serial = $1`, [serial, String(joined)]);
    await db.getPool().query(
      `UPDATE events SET created_at = now() - ($2 || ' days')::interval WHERE serial = $1`, [serial, String(age)]);
    if (age > 30) for (let n = 0; n < 3; n++) await db.logEvent("default", p.serial, "nudge", { actor: "auto" });
    i++;
  }
  console.log("DEV READY on " + base + " — login dev@stampy.test / password123");
}

main().catch((e) => { console.error(e); process.exit(1); });
