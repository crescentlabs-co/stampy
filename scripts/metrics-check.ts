/**
 * `pnpm metrics:check` — proves the event log can answer the questions it was
 * widened for, and doubles as the reference SQL for each one.
 *
 * Every query below runs against a real Postgres seeded with a small but
 * awkward shop: two platforms, a person holding two passes, a completed card, a
 * churned customer, a messaged group and an unmessaged control. If one of these
 * stops returning a sane number, the log has lost a column something depended
 * on — which is the failure this exists to catch, because it is otherwise
 * invisible until the day someone asks.
 *
 * These are deliberately plain SQL against `events`, not helpers in db.ts:
 * metrics are meant to be derivable by query rather than maintained as stored
 * aggregates, and this file is the standing evidence that they are.
 *
 * ---------------------------------------------------------------------------
 * `pnpm metrics:check --merchant <name-or-id>` is a different job: point it at
 * a REAL database and it prints one shop's console row beside the raw event
 * counts underneath it, so "is that number actually right?" can be answered
 * rather than argued about. It reads and never writes.
 *
 *   DATABASE_URL='<Railway DATABASE_PUBLIC_URL>' pnpm metrics:check --merchant "Kopi Corner"
 *
 * DATABASE_PUBLIC_URL, not DATABASE_URL — the latter is .railway.internal and
 * only resolves inside Railway.
 */
import EmbeddedPostgres from "embedded-postgres";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dataDir = mkdtempSync(path.join(tmpdir(), "stampy-metrics-"));
import { startupHint, stopPg } from "./pgStop.js";

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "s",
  password: "s",
  port: 5486,
  persistent: false,
});

let failures = 0;
function expect(cond: boolean, label: string): void {
  if (cond) console.log("  OK:", label);
  else {
    console.error("  FAIL:", label);
    failures++;
  }
}

/**
 * Reconcile one shop's console row against the raw log.
 *
 * Everything the console shows is derived by query, so every figure has a
 * countable thing underneath it. This prints both columns side by side. Where
 * they can legitimately differ, it says why in the same breath — Value is a
 * count times a self-reported basket, and Customers deliberately keeps people
 * who have since deleted their card.
 */
async function reconcile(needle: string): Promise<number> {
  if (!process.env.DATABASE_URL) {
    console.error("Set DATABASE_URL to the database you want to read, e.g.\n" +
      "  DATABASE_URL='<Railway DATABASE_PUBLIC_URL>' pnpm metrics:check --merchant \"Kopi Corner\"");
    return 1;
  }
  const db = await import("../src/db.js");
  const sql = db.getPool();
  const rows = await db.merchantHealth();
  const key = needle.toLowerCase();
  const m = rows.find((r) => r.id === needle) ?? rows.find((r) => r.name.toLowerCase().includes(key));
  if (!m) {
    console.error(`No merchant matching "${needle}". Known: ` + rows.map((r) => r.name).join(", "));
    await sql.end();
    return 1;
  }
  const ret = await db.returningRate(m.id);
  const one = async (text: string): Promise<number> => {
    const r = await sql.query<{ n: string }>(text, [m.card_ids]);
    return Number(r.rows[0]?.n ?? 0);
  };
  const evt = (type: string) =>
    one(`SELECT count(*)::text AS n FROM events WHERE card_id = ANY($1) AND type = '${type}'`);

  console.log(`\n${m.name}  (${m.id})`);
  console.log(`signed up ${new Date(m.signed_up_at).toISOString().slice(0, 10)} · day ${m.trial_day} · ` +
    `${m.cards} card(s): ${m.card_ids.join(", ")}`);

  const stamps = await evt("stamp"), undos = await evt("undo");
  const basket = m.basket_cents / 100;
  const people = await one(
    `SELECT count(DISTINCT COALESCE(p.customer_id, p.serial))::text AS n FROM passes p WHERE p.card_id = ANY($1)`,
  );
  console.log("\nWhat the console says, and what the log says:");
  console.table([
    { figure: "Counter visits", console: m.stamps, log: `${stamps} stamp − ${undos} undo = ${stamps - undos}` },
    { figure: "Rewards given", console: m.redemptions, log: `${await evt("redeem")} redeem events` },
    { figure: "Customers", console: m.customers,
      log: `${people} pass-holders, of whom ${m.customers} ever stamped or reached a wallet` },
    { figure: "Value", console: m.basket_cents ? `${m.currency}${Math.round(m.stamps * basket)}` : "—",
      log: m.basket_cents ? `${m.stamps} visits × ${m.currency}${basket.toFixed(2)} basket (self-reported)` : "no basket set" },
    { figure: "Opened sign-up page", console: m.scanned,
      log: `poster ${m.opened_poster} + link ${m.opened_link} + untagged ${m.opened_other}` },
    { figure: "Tapped Add", console: m.clicked, log: `${await evt("wallet_click")} wallet_click events` },
    { figure: "Card made", console: m.made, log: `${await evt("enroll")} enroll events` },
    { figure: "Landed in wallet", console: m.landed, log: `${await evt("pass_added")} pass_added (Apple always, Google since the callback)` },
    { figure: "Returning customers", console: ret.rate === null ? "—" : Math.round(ret.rate * 100) + "%",
      log: `${ret.returned} of ${ret.eligible} people whose first stamp is 14+ days old` },
  ]);

  // The two figures that are not a plain count, spelled out rather than assumed.
  console.log("\nRead these two carefully:");
  console.log("  Value is a countable number times ONE assumption — the shop's own average basket,");
  console.log("  typed by them and never re-checked. It is not incremental: some of these people");
  console.log("  would have come in anyway, and nothing here can see the counterfactual.");
  console.log("  Customers counts anyone who ever stamped or reached a wallet, INCLUDING people who");
  console.log("  have since deleted the card. That is deliberate — churn must not erase its own evidence.");
  if (new Date(m.signed_up_at) < new Date(db.FUNNEL_SINCE)) {
    console.log(`\n  This shop predates the funnel (${db.FUNNEL_SINCE_LABEL}), so page opens and Add`);
    console.log("  taps are missing for anything issued before then. Zeroes there are absent history.");
  }
  await sql.end();
  return 0;
}

async function main() {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("stampy");
  process.env.DATABASE_URL = "postgresql://s:s@localhost:5486/stampy";

  const db = await import("../src/db.js");
  await db.migrate();
  const sql = db.getPool();
  const q = async <T extends Record<string, unknown>>(text: string, params: unknown[] = []) =>
    (await sql.query<T>(text, params)).rows;

  // ---- A small shop with awkward customers -------------------------------
  await sql.query(`INSERT INTO owners (id, email, password_hash) VALUES ('o1','a@b.my','x')`);
  await sql.query(`INSERT INTO merchants (id, owner_id, name) VALUES ('m1','o1','Kopi Corner')`);
  await sql.query(`UPDATE cards SET merchant_id='m1', stamps_target=5 WHERE id='default'`);
  // c1 holds BOTH an Apple and a Google pass — one person, two cards.
  // c2 completed and redeemed. c3 was messaged then deleted. c4 is the control.
  await sql.query(
    `INSERT INTO customers (id, merchant_id) VALUES ('c1','m1'),('c2','m1'),('c3','m1'),('c4','m1')`,
  );
  await sql.query(
    `INSERT INTO passes (serial, card_id, platform, short_code, auth_token, stamp_count, stamps_target, customer_id, created_at)
     VALUES ('s1','default','apple','AAA111','t',3,5,'c1', now() - interval '40 days'),
            ('s1g','default','google','AAA112','t',3,5,'c1', now() - interval '40 days'),
            ('s2','default','apple','BBB222','t',1,5,'c2', now() - interval '30 days'),
            ('s3','default','google','CCC333','t',2,5,'c3', now() - interval '20 days'),
            ('s4','default','apple','DDD444','t',2,5,'c4', now() - interval '20 days')`,
  );

  const ev = async (
    serial: string,
    type: string,
    daysAgo: number,
    extra: { customer?: string; platform?: string; device?: string; after?: number } = {},
  ) =>
    sql.query(
      `INSERT INTO events (card_id, serial, type, created_at, merchant_id, customer_id, platform, device_id, stamps_after, stamps_target)
       VALUES ('default',$1,$2, now() - ($3||' days')::interval, 'm1',$4,$5,$6,$7,5)`,
      [serial, type, String(daysAgo), extra.customer ?? null, extra.platform ?? "apple", extra.device ?? "", extra.after ?? null],
    );

  // Funnel: 10 views, 6 clicks, 5 enrols.
  for (let i = 0; i < 6; i++) await ev("", "join_view", 45, { platform: "apple" });
  for (let i = 0; i < 4; i++) await ev("", "join_view", 45, { platform: "google" });
  for (let i = 0; i < 4; i++) await ev("", "wallet_click", 45, { platform: "apple" });
  for (let i = 0; i < 2; i++) await ev("", "wallet_click", 45, { platform: "google" });

  await ev("s1", "enroll", 40, { customer: "c1" });
  await ev("s1g", "enroll", 40, { customer: "c1", platform: "google" });
  await ev("s2", "enroll", 30, { customer: "c2" });
  await ev("s3", "enroll", 20, { customer: "c3", platform: "google" });
  await ev("s4", "enroll", 20, { customer: "c4" });

  // Visits. c1 came back three times; c2 completed and redeemed; c4 came once.
  await ev("s1", "stamp", 40, { customer: "c1", device: "till-1", after: 1 });
  await ev("s1", "stamp", 30, { customer: "c1", device: "till-1", after: 2 });
  await ev("s1", "stamp", 12, { customer: "c1", device: "till-2", after: 3 });
  await ev("s2", "stamp", 30, { customer: "c2", device: "till-1", after: 4 });
  await ev("s2", "stamp", 25, { customer: "c2", device: "till-1", after: 5 });
  await ev("s2", "completed", 25, { customer: "c2", device: "till-1", after: 5 });
  await ev("s2", "redeem", 25, { customer: "c2", device: "till-1", after: 1 });
  await ev("s2", "stamp", 10, { customer: "c2", device: "till-2", after: 2 });
  await ev("s3", "stamp", 20, { customer: "c3", platform: "google", device: "till-1", after: 2 });
  await ev("s4", "stamp", 20, { customer: "c4", device: "till-1", after: 2 });

  // c3 was messaged, then deleted the card two days later. c4 never messaged.
  await ev("s3", "nudge", 9, { customer: "c3", platform: "google" });
  await ev("s3", "pass_removed", 7, { customer: "c3", platform: "google" });
  await ev("s1", "nudge", 9, { customer: "c1" });
  await ev("s1", "stamp", 5, { customer: "c1", device: "till-1", after: 4 }); // answered it
  await sql.query(
    `INSERT INTO messages (serial, customer_id, card_id, kind, body, platform, delivered, created_at)
     VALUES ('s3','c3','default','manual-nudge','We miss you','google',true, now() - interval '9 days'),
            ('s1','c1','default','manual-nudge','We miss you','apple',true, now() - interval '9 days')`,
  );

  console.log("\n1. Scan → add conversion, by platform");
  const funnel = await q<{ platform: string; views: string; clicks: string; enrols: string }>(
    `SELECT platform,
            count(*) FILTER (WHERE type='join_view')::text    AS views,
            count(*) FILTER (WHERE type='wallet_click')::text AS clicks,
            count(*) FILTER (WHERE type='enroll')::text       AS enrols
       FROM events WHERE merchant_id='m1' AND platform <> '' GROUP BY platform ORDER BY platform`,
  );
  console.table(funnel);
  expect(funnel.length === 2, "answers per platform");
  expect(funnel.find((r) => r.platform === "apple")?.views === "6", "apple views counted");

  console.log("\n2. Second-visit rate (people who came back at least once more)");
  const second = await q<{ customers: string; returned: string }>(
    `WITH visits AS (
       SELECT customer_id, count(*) n FROM events
        WHERE type='stamp' AND merchant_id='m1' AND customer_id IS NOT NULL
        GROUP BY customer_id)
     SELECT count(*)::text customers, count(*) FILTER (WHERE n >= 2)::text returned FROM visits`,
  );
  console.table(second);
  expect(second[0]?.returned === "2", `2 of ${second[0]?.customers} came back (c1, c2)`);

  console.log("\n3. Median days between visits");
  const median = await q<{ median_days: string | null }>(
    `WITH gaps AS (
       SELECT customer_id,
              EXTRACT(epoch FROM created_at - lag(created_at) OVER (PARTITION BY customer_id ORDER BY created_at))/86400 AS days
         FROM events WHERE type='stamp' AND merchant_id='m1' AND customer_id IS NOT NULL)
     SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY days)::numeric, 1)::text AS median_days
       FROM gaps WHERE days IS NOT NULL`,
  );
  console.table(median);
  expect(median[0]?.median_days != null, `median gap = ${median[0]?.median_days} days`);

  console.log("\n4. Card completion rate");
  const completion = await q<{ enrolled: string; completed: string }>(
    `SELECT count(DISTINCT serial) FILTER (WHERE type='enroll')::text    AS enrolled,
            count(DISTINCT serial) FILTER (WHERE type='completed')::text AS completed
       FROM events WHERE merchant_id='m1'`,
  );
  console.table(completion);
  expect(completion[0]?.completed === "1", "one card was completed");

  console.log("\n5. Second-card rate after redemption (kept going after the reward)");
  const secondCard = await q<{ redeemed: string; carried_on: string }>(
    `WITH r AS (SELECT DISTINCT customer_id, min(created_at) redeemed_at FROM events
                 WHERE type='redeem' AND merchant_id='m1' GROUP BY customer_id)
     SELECT count(*)::text AS redeemed,
            count(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM events e WHERE e.customer_id = r.customer_id
                AND e.type='stamp' AND e.created_at > r.redeemed_at))::text AS carried_on
       FROM r`,
  );
  console.table(secondCard);
  expect(secondCard[0]?.carried_on === "1", "the redeemer started a second card");

  console.log("\n6. Pass deletions within 7 days of a message");
  const churn = await q<{ platform: string; deleted_after_message: string }>(
    `SELECT d.platform, count(*)::text AS deleted_after_message
       FROM events d
      WHERE d.type IN ('pass_removed','pass_dropped') AND d.merchant_id='m1'
        AND EXISTS (SELECT 1 FROM events n
                     WHERE n.customer_id = d.customer_id AND n.type='nudge'
                       AND n.created_at BETWEEN d.created_at - interval '7 days' AND d.created_at)
      GROUP BY d.platform`,
  );
  console.table(churn);
  expect(churn[0]?.deleted_after_message === "1", "caught the Android deletion after a message");

  console.log("\n7. Visits within 7 days of a message vs an unmessaged control");
  const control = await q<{ group_name: string; people: string; visited: string }>(
    `WITH messaged AS (SELECT DISTINCT customer_id, max(created_at) at FROM events
                        WHERE type='nudge' AND merchant_id='m1' GROUP BY customer_id),
          everyone AS (SELECT DISTINCT customer_id FROM events
                        WHERE merchant_id='m1' AND customer_id IS NOT NULL)
     SELECT 'messaged' AS group_name, count(*)::text AS people,
            count(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM events e WHERE e.customer_id = m.customer_id AND e.type='stamp'
                AND e.created_at BETWEEN m.at AND m.at + interval '7 days'))::text AS visited
       FROM messaged m
     UNION ALL
     SELECT 'control', count(*)::text,
            count(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM events e WHERE e.customer_id = c.customer_id AND e.type='stamp'
                AND e.created_at > now() - interval '7 days'))::text
       FROM everyone c WHERE c.customer_id NOT IN (SELECT customer_id FROM messaged)`,
  );
  console.table(control);
  expect(control.length === 2, "both the treated group and a control are countable");

  console.log("\n8. Redemption-to-stamp ratio per till");
  const perTill = await q<{ device_id: string; stamps: string; redeems: string }>(
    `SELECT device_id,
            count(*) FILTER (WHERE type='stamp')::text  AS stamps,
            count(*) FILTER (WHERE type='redeem')::text AS redeems
       FROM events WHERE merchant_id='m1' AND device_id <> '' GROUP BY device_id ORDER BY device_id`,
  );
  console.table(perTill);
  expect(perTill.length === 2, "splits by the phone that did it (per person once staff are named)");

  console.log("\n9. Retention by join cohort (week they joined)");
  const cohort = await q<{ cohort: string; joined: string; still_active: string }>(
    `WITH joined AS (
       SELECT customer_id, date_trunc('week', min(created_at)) AS cohort
         FROM events WHERE type='enroll' AND merchant_id='m1' AND customer_id IS NOT NULL
         GROUP BY customer_id)
     SELECT to_char(cohort,'YYYY-MM-DD') AS cohort, count(*)::text AS joined,
            count(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM events e WHERE e.customer_id = j.customer_id AND e.type='stamp'
                AND e.created_at > now() - interval '14 days'))::text AS still_active
       FROM joined j GROUP BY cohort ORDER BY cohort`,
  );
  console.table(cohort);
  expect(cohort.length >= 1, "customers group into join cohorts");

  console.log("\n10. Days since each merchant's last stamp");
  const quiet = await q<{ merchant_id: string; days_quiet: string }>(
    `SELECT merchant_id, round(EXTRACT(epoch FROM now() - max(created_at))/86400)::text AS days_quiet
       FROM events WHERE type='stamp' AND merchant_id IS NOT NULL GROUP BY merchant_id`,
  );
  console.table(quiet);
  expect(quiet[0]?.merchant_id === "m1", "answered straight off the merchant index, no join");

  // The one that motivated the whole exercise: a person, not a pass.
  console.log("\nBonus: one person holding two passes is one customer");
  const people = await q<{ people: string; passes: string }>(
    `SELECT count(DISTINCT customer_id)::text AS people, count(DISTINCT serial)::text AS passes
       FROM events WHERE merchant_id='m1' AND type='enroll'`,
  );
  console.table(people);
  expect(people[0]?.people === "4" && people[0]?.passes === "5",
    "4 people, 5 passes — the Apple/Google pair is one person");

  await sql.end();
}

// --merchant reads a real database and never starts the embedded one.
const mi = process.argv.indexOf("--merchant");
if (mi !== -1) {
  const needle = process.argv[mi + 1];
  if (!needle) {
    console.error('Usage: pnpm metrics:check --merchant "<shop name or id>"');
    process.exit(1);
  }
  reconcile(needle)
    .then((code) => process.exit(code))
    .catch((err) => { console.error(err); process.exit(1); });
} else {
  main()
    .then(async () => {
      process.exitCode = failures === 0 ? 0 : 1;
      await stopPg(pg);
      console.log(failures === 0 ? "\nALL TEN QUESTIONS ANSWERED ✅" : `\n${failures} UNANSWERED ❌`);
      process.exit(process.exitCode);
    })
    .catch(async (err) => {
      process.exitCode = 1;
      console.error(startupHint(err, 5486));
      await stopPg(pg);
      process.exit(1);
    });
}
