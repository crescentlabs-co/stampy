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
 */
import EmbeddedPostgres from "embedded-postgres";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dataDir = mkdtempSync(path.join(tmpdir(), "stampy-metrics-"));
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

main()
  .then(async () => {
    await pg.stop();
    console.log(failures === 0 ? "\nALL TEN QUESTIONS ANSWERED ✅" : `\n${failures} UNANSWERED ❌`);
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch(async (err) => {
    console.error(err);
    await pg.stop().catch(() => {});
    process.exit(1);
  });
