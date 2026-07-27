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
  await db.updateCard("default", { average_spend_cents: 450, currency: "RM" });
  // Signup mints a random staff PIN (never the guessable default), so pin it to
  // a known one here — the PIN belongs to the owner, not the café.
  const devOwner = (await db.getOwnerByEmail("dev@stampy.test"))!;
  await db.setStaffPin(devOwner.id, "1234");
  const merchant = (await db.merchantForOwner(devOwner.id))!;
  console.log("Merchant:", merchant.name, "→ join link http://localhost:3010/j/" + merchant.id);

  // Customers spread across every recency cohort, each with a real visit
  // HISTORY rather than a single stamp — otherwise every retention figure on
  // the admin page reads zero and the screen can't be judged.
  const sql = db.getPool();
  const backdate = (serial: string, days: number, type: string) =>
    sql.query(
      `UPDATE events SET created_at = now() - ($2 || ' days')::interval
        WHERE id = (SELECT max(id) FROM events WHERE serial = $1 AND type = $3)`,
      [serial, String(days), type],
    );

  // [days since last visit, how many visits, did they claim a reward]
  const people: [number, number, boolean][] = [
    [0, 6, false], [0, 1, false], [2, 11, true], [3, 3, false],
    [9, 2, false], [11, 1, false], [18, 4, true], [22, 2, false],
    [40, 8, false], [55, 1, false], [120, 3, false],
  ];
  const phones = ["staff:aaaaaaaaaa", "staff:bbbbbbbbbb"];
  let i = 0;
  for (const [age, visits, redeemed] of people) {
    const serial = crypto.randomUUID();
    // Joined a few weeks before their first visit, so time-to-value is visible.
    const joinedDaysAgo = age + visits * 7 + 3;
    const customer = await db.createCustomer(merchant.id);
    const p = await db.createPass({
      serial, cardId: "default", customerId: customer.id, platform: "apple",
      shortCode: db.generateShortCode(), authToken: "t".repeat(24),
      stampCount: redeemed ? 2 : Math.min(visits, 9), stampsTarget: 10, reward: "Free coffee",
    });
    await sql.query(
      `UPDATE passes SET created_at = now() - ($2 || ' days')::interval WHERE serial = $1`,
      [serial, String(joinedDaysAgo)],
    );
    await db.logEvent("default", p.serial, "enroll", { actor: "customer" });
    await backdate(serial, joinedDaysAgo, "enroll");
    await db.upsertRegistration("dev-device-" + i, p.serial, "tok");
    await backdate(serial, joinedDaysAgo, "pass_added");

    // Visits, oldest first, landing on `age` days ago. The third phone does the
    // occasional stamp so the counter audit has more than one row.
    for (let v = 0; v < visits; v++) {
      const when = age + (visits - 1 - v) * 7;
      await db.logEvent("default", p.serial, "stamp", {
        actor: phones[(i + v) % phones.length],
        forced: v > 0 && i % 5 === 0,
      });
      await backdate(serial, when, "stamp");
    }
    if (redeemed) {
      await db.logEvent("default", p.serial, "redeem", { actor: phones[i % phones.length] });
      await backdate(serial, age, "redeem");
    }
    if (age > 30) {
      for (let n = 0; n < 3; n++) await db.logEvent("default", p.serial, "nudge", { actor: "auto" });
      await backdate(serial, 2, "nudge");
    }
    i++;
  }

  // One customer who added the card and then deleted it — the only hard churn
  // signal either wallet gives us, and Apple-only. Without one the admin page
  // can't show what that column looks like.
  const goneSerial = crypto.randomUUID();
  await db.createPass({
    serial: goneSerial, cardId: "default", customerId: (await db.createCustomer(merchant.id)).id,
    platform: "apple",
    shortCode: db.generateShortCode(), authToken: "t".repeat(24),
    stampCount: 3, stampsTarget: 10, reward: "Free coffee",
  });
  await db.logEvent("default", goneSerial, "enroll", { actor: "customer" });
  await db.logEvent("default", goneSerial, "stamp", { actor: phones[0] });
  await backdate(goneSerial, 26, "stamp");
  await db.upsertRegistration("dev-device-gone", goneSerial, "tok");
  await db.deleteRegistration("dev-device-gone", goneSerial);

  // And one that never made it into a wallet at all (a cancelled Add sheet).
  await db.createPass({
    serial: crypto.randomUUID(), cardId: "default", customerId: (await db.createCustomer(merchant.id)).id,
    platform: "apple",
    shortCode: db.generateShortCode(), authToken: "t".repeat(24),
    stampCount: 0, stampsTarget: 10, reward: "Free coffee",
  });

  // One person who added the card on an iPhone AND on an Android — two passes,
  // two barcodes, one human. They must appear once in Customers and be messaged
  // once, which is the whole point of the customers table.
  const bothWallets = await db.createCustomer(merchant.id);
  for (const platform of ["apple", "google"] as const) {
    const serial = crypto.randomUUID();
    const p = await db.createPass({
      serial, cardId: "default", customerId: bothWallets.id, platform,
      shortCode: db.generateShortCode(), authToken: "t".repeat(24),
      stampCount: 4, stampsTarget: 10, reward: "Free coffee",
    });
    await db.logEvent("default", p.serial, "stamp", { actor: phones[0] });
    await backdate(serial, 9, "stamp");
    if (platform === "apple") await db.upsertRegistration("dev-both", p.serial, "tok");
  }
  console.log("DEV READY on " + base + " — login dev@stampy.test / password123");
}

main().catch((e) => { console.error(e); process.exit(1); });
