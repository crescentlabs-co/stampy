/**
 * `pnpm test:migration` — proves migrate() upgrades a REAL v1.2 database.
 *
 * The e2e suite only ever runs migrate() against an empty database, so the one
 * path that actually matters on deploy — the upgrade — had no coverage. This
 * builds the pre-v1.3 schema by hand (that fixture IS production's shape),
 * fills it with the kind of rows a live café has, then runs migrate() and checks
 * the things that would be catastrophic to get wrong:
 *
 *   - card ids survive byte-for-byte (printed QRs, Google class ids, art URLs)
 *   - every pass keeps the card it was issued for
 *   - every owner gains exactly one merchant, holding their cards
 *   - every pass gains a customer
 *   - the staff PIN still verifies
 *   - it is idempotent — running it twice changes nothing
 */
import EmbeddedPostgres from "embedded-postgres";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dataDir = mkdtempSync(path.join(tmpdir(), "stampy-mig-"));
const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "s",
  password: "s",
  port: 5477,
  persistent: false,
});

let failures = 0;
function expect(cond: boolean, label: string): void {
  if (cond) console.log("OK:", label);
  else {
    console.error("FAIL:", label);
    failures++;
  }
}

/** The schema exactly as v1.2 left it — cafés, not cards. */
const LEGACY_SCHEMA = `
  CREATE TABLE cafes (
    id text PRIMARY KEY,
    name text NOT NULL,
    reward text NOT NULL DEFAULT 'Free coffee',
    stamps_target integer NOT NULL DEFAULT 10,
    stamps_start integer NOT NULL DEFAULT 2,
    background_color text NOT NULL DEFAULT 'rgb(59, 32, 22)',
    foreground_color text NOT NULL DEFAULT 'rgb(255, 250, 240)',
    label_color text NOT NULL DEFAULT 'rgb(214, 178, 120)',
    staff_pin text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    auto_winback_enabled boolean NOT NULL DEFAULT false,
    auto_winback_days integer NOT NULL DEFAULT 14,
    auto_winback_message text NOT NULL DEFAULT 'We miss you!',
    stamp_style text NOT NULL DEFAULT '',
    staff_pin_hash text NOT NULL DEFAULT '',
    staff_session_epoch integer NOT NULL DEFAULT 1,
    average_spend_cents integer NOT NULL DEFAULT 0,
    currency text NOT NULL DEFAULT 'RM'
  );
  CREATE TABLE owners (
    id text PRIMARY KEY,
    email text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    reset_token_hash text,
    reset_expires timestamptz,
    staff_pin_hash text NOT NULL DEFAULT '',
    staff_session_epoch integer NOT NULL DEFAULT 1
  );
  CREATE TABLE owner_cafes (
    owner_id text NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
    cafe_id text NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
    PRIMARY KEY (owner_id, cafe_id)
  );
  CREATE TABLE passes (
    serial text PRIMARY KEY,
    cafe_id text NOT NULL REFERENCES cafes(id),
    platform text NOT NULL DEFAULT 'apple',
    short_code text NOT NULL UNIQUE,
    auth_token text NOT NULL,
    stamp_count integer NOT NULL DEFAULT 0,
    stamps_target integer NOT NULL DEFAULT 10,
    reward text NOT NULL DEFAULT '',
    message text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX idx_passes_cafe ON passes(cafe_id);
  CREATE TABLE registrations (
    device_library_id text NOT NULL,
    push_token text NOT NULL,
    serial text NOT NULL REFERENCES passes(serial) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (device_library_id, serial)
  );
  CREATE TABLE events (
    id bigserial PRIMARY KEY,
    cafe_id text NOT NULL REFERENCES cafes(id),
    serial text NOT NULL,
    type text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    actor text NOT NULL DEFAULT '',
    forced boolean NOT NULL DEFAULT false
  );
  CREATE INDEX idx_events_cafe_time ON events(cafe_id, created_at);
  CREATE TABLE cafe_logos (
    cafe_id text PRIMARY KEY REFERENCES cafes(id) ON DELETE CASCADE,
    png bytea NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE cafe_banners (
    cafe_id text PRIMARY KEY REFERENCES cafes(id) ON DELETE CASCADE,
    png bytea NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE cafe_stamp_strips (
    cafe_id text NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
    filled integer NOT NULL, png bytea NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (cafe_id, filled)
  );
  CREATE TABLE owner_logins (
    owner_id text NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now()
  );
`;

async function main(): Promise<void> {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("stampy");
  process.env.DATABASE_URL = "postgresql://s:s@localhost:5477/stampy";
  process.env.BASE_URL = "http://localhost:3000";

  const db = await import("../src/db.js");
  const { hashPassword, verifyPassword } = await import("../src/auth.js");
  const sql = db.getPool();

  // --- Build a live-looking v1.2 database -----------------------------------
  await sql.query(LEGACY_SCHEMA);
  const pinHash = hashPassword("4821");
  await sql.query(
    `INSERT INTO cafes (id, name, reward, stamps_target, staff_pin_hash, average_spend_cents, currency)
     VALUES ('default','Kopi Corner','Free coffee',10,$1,450,'RM'),
            ('ab12cd34','Pastry card','Free pastry',8,$1,0,'RM'),
            ('zz99yy88','Someone Else','Free tea',6,$1,0,'RM')`,
    [pinHash],
  );
  await sql.query(
    `INSERT INTO owners (id, email, password_hash, created_at) VALUES
       ('own-1','a@shop.my','x', now() - interval '200 days'),
       ('own-2','b@shop.my','x', now() - interval '150 days')`,
  );
  await sql.query(
    `INSERT INTO owner_cafes (owner_id, cafe_id) VALUES
       ('own-1','default'), ('own-1','ab12cd34'), ('own-2','zz99yy88')`,
  );
  await sql.query(
    `INSERT INTO passes (serial, cafe_id, platform, short_code, auth_token, stamp_count, stamps_target, reward)
     VALUES ('s-apple','default','apple','AAA111','t',3,10,'Free coffee'),
            ('s-google','default','google','BBB222','t',1,10,'Free coffee'),
            ('s-pastry','ab12cd34','apple','CCC333','t',5,8,'Free pastry'),
            ('s-other','zz99yy88','apple','DDD444','t',2,6,'Free tea')`,
  );
  await sql.query(
    `INSERT INTO events (cafe_id, serial, type) VALUES
       ('default','s-apple','enroll'), ('default','s-apple','stamp'),
       ('ab12cd34','s-pastry','stamp')`,
  );
  await sql.query(`INSERT INTO cafe_logos (cafe_id, png) VALUES ('default','\\x89504e47')`);
  // A rendered stamp grid from before the target was part of its key. Kopi Corner
  // runs a 10-stamp card, so these eleven strips were drawn for 10 and the
  // upgrade has to say so — otherwise every one of them is filed under target 0
  // and no pass ever finds its picture again.
  await sql.query(
    `INSERT INTO cafe_stamp_strips (cafe_id, filled, png)
     SELECT 'default', n, '\\x89504e47' FROM generate_series(0, 10) AS n`,
  );

  const beforeIds = (await sql.query<{ id: string }>(`SELECT id FROM cafes ORDER BY id`)).rows.map((r) => r.id);

  // --- The upgrade ----------------------------------------------------------
  await db.migrate();
  await db.migrate(); // idempotency: a second boot must be a no-op

  // --- The things that would be catastrophic to get wrong --------------------
  const afterIds = (await sql.query<{ id: string }>(`SELECT id FROM cards ORDER BY id`)).rows.map((r) => r.id);
  expect(
    JSON.stringify(afterIds) === JSON.stringify(beforeIds),
    `every card id survives the rename byte-for-byte (${afterIds.join(", ")})`,
  );

  const { classId } = await import("../src/googleModel.js");
  expect(
    classId({ id: "ab12cd34" }).endsWith(".stampy-ab12cd34"),
    "the Google class id still derives from the unchanged card id",
  );

  const passes = (await sql.query<{ serial: string; card_id: string; customer_id: string | null }>(
    `SELECT serial, card_id, customer_id FROM passes ORDER BY serial`,
  )).rows;
  expect(
    passes.find((p) => p.serial === "s-pastry")?.card_id === "ab12cd34",
    "every pass keeps the card it was issued for",
  );
  expect(passes.every((p) => p.customer_id), "every pass gained a customer");
  expect(
    new Set(passes.map((p) => p.customer_id)).size === passes.length,
    "one customer per pass — the Apple/Google pair cannot be merged retroactively",
  );

  // v1.4: the denormalised event columns. The backfill reads cards.merchant_id
  // and passes.customer_id, so it MUST run after the two backfills that create
  // them — the first version of it ran earlier in migrate() and silently
  // attributed every historical event to nobody, then never retried because
  // its guard had already been satisfied by the one column it did fill.
  const attributed = (await sql.query<{
    serial: string;
    merchant_id: string | null;
    customer_id: string | null;
    platform: string;
    stamps_target: number | null;
  }>(`SELECT serial, merchant_id, customer_id, platform, stamps_target FROM events ORDER BY id`)).rows;
  expect(attributed.length === 3, `all ${attributed.length} historical events survived`);
  expect(
    attributed.every((e) => e.merchant_id),
    "every historical event was attributed to a merchant",
  );
  expect(
    attributed.every((e) => e.customer_id),
    "every historical event was attributed to a customer",
  );
  expect(
    attributed.every((e) => e.platform === "apple"),
    "every historical event knows which platform it happened on",
  );
  expect(
    attributed.find((e) => e.serial === "s-pastry")?.stamps_target === 8,
    "historical events carry the target that applied to that card, not the default",
  );

  const merchants = (await sql.query<{ id: string; owner_id: string; name: string; average_spend_cents: number }>(
    `SELECT id, owner_id, name, average_spend_cents FROM merchants ORDER BY owner_id`,
  )).rows;
  expect(merchants.length === 2, `one merchant per owner (got ${merchants.length})`);
  expect(
    merchants[0]?.name === "Kopi Corner" && merchants[0]?.average_spend_cents === 450,
    "the merchant inherits its name and money settings from the owner's oldest card",
  );

  const linked = (await sql.query<{ id: string; merchant_id: string | null }>(
    `SELECT id, merchant_id FROM cards ORDER BY id`,
  )).rows;
  const byId = Object.fromEntries(linked.map((c) => [c.id, c.merchant_id]));
  expect(
    byId["default"] === byId["ab12cd34"] && byId["default"] != null,
    "both of owner 1's cards hang off the same merchant",
  );
  expect(
    byId["zz99yy88"] !== byId["default"],
    "another owner's card belongs to a different merchant",
  );

  const slugs = (await sql.query<{ slug: string }>(`SELECT slug FROM merchant_slugs ORDER BY slug`)).rows;
  expect(slugs.some((s) => s.slug === "kopi-corner"), `a readable slug is reserved (${slugs.map((s) => s.slug).join(", ")})`);

  const owner1 = (await sql.query<{ staff_pin_hash: string }>(
    `SELECT staff_pin_hash FROM owners WHERE id = 'own-1'`,
  )).rows[0]!;
  expect(verifyPassword("4821", owner1.staff_pin_hash), "the staff PIN still works after the upgrade");

  const logo = (await sql.query(`SELECT png FROM card_logos WHERE card_id = 'default'`)).rowCount;
  expect(logo === 1, "uploaded art follows its card through the rename");

  // The stamp grid gained the target in its key. These rows were drawn for a
  // 10-stamp card, and every pass on that card asks for its picture by target —
  // so a backfill that left them at 0 would blank the grid on every card in a
  // wallet. This is the only cover for that, since it is a live upgrade path.
  const grid = (await sql.query<{ target: number; n: string }>(
    `SELECT target, count(*) AS n FROM card_stamp_strips WHERE card_id = 'default' GROUP BY target`,
  )).rows;
  expect(grid.length === 1 && grid[0]!.target === 10, "old stamp grids are filed under the target they were drawn for");
  expect(Number(grid[0]?.n) === 11, `all 11 strips survived the key change (got ${grid[0]?.n})`);
  const gridKey = (await sql.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.key_column_usage
      WHERE table_name = 'card_stamp_strips' ORDER BY column_name`,
  )).rows.map((r) => r.column_name);
  expect(
    ["card_id", "filled", "target"].every((c) => gridKey.includes(c)),
    `the primary key now includes the target (${gridKey.join(", ")})`,
  );

  // A merchant BACKFILLED from an old owner must carry that owner's signup date,
  // not the migration's. backfillMerchants inserts no created_at, so the column
  // defaulted to now() and every pre-v1.3 merchant was stamped with the deploy
  // date — which made every trial in the console appear to start the same day.
  // This is the only place that path is exercised.
  const dated = (await sql.query<{ owner_id: string; drift_seconds: number }>(
    `SELECT m.owner_id,
            extract(epoch FROM (m.created_at - o.created_at))::float8 AS drift_seconds
       FROM merchants m JOIN owners o ON o.id = m.owner_id
      ORDER BY m.owner_id`,
  )).rows;
  expect(dated.length === 2, `both owners got a merchant (${dated.length})`);
  expect(
    dated.every((d) => Math.abs(d.drift_seconds) < 1),
    `each merchant is dated from its owner's signup, not the migration (drift: ${dated.map((d) => Math.round(d.drift_seconds)).join(", ")}s)`,
  );
  // 200 days ago, so a trial derived from it is long over rather than "day 0".
  const oldest = (await sql.query<{ age_days: number }>(
    `SELECT floor(extract(epoch FROM (now() - created_at)) / 86400.0)::int AS age_days
       FROM merchants WHERE owner_id = 'own-1'`,
  )).rows[0]!;
  expect(oldest.age_days >= 199, `the oldest merchant reads as ${oldest.age_days} days old, not brand new`);

  const custCount = (await sql.query<{ n: string }>(`SELECT count(*) AS n FROM customers`)).rows[0]!.n;
  expect(Number(custCount) === 4, `running migrate twice does not duplicate customers (got ${custCount})`);

  // --- v2.0: a shop can exist before anybody can log into it ----------------
  // owner_id going nullable is the FIRST non-additive change to a live column in
  // this schema, so this is the only cover for the path a deploy actually takes.
  // It only ever widens what the column accepts, which is why an existing row
  // cannot be invalidated — and that is what these three assert.
  const ownerCol = (await sql.query<{ is_nullable: string }>(
    `SELECT is_nullable FROM information_schema.columns
      WHERE table_name = 'merchants' AND column_name = 'owner_id'`,
  )).rows[0]!;
  expect(ownerCol.is_nullable === "YES", "owner_id accepts NULL after the upgrade");
  const stillOwned = (await sql.query<{ n: string }>(
    `SELECT count(*) AS n FROM merchants WHERE owner_id IS NULL`,
  )).rows[0]!.n;
  expect(Number(stillOwned) === 0, "every merchant that HAD an owner still has one");

  // The uniqueness it used to carry survives as a partial index: one merchant
  // per login still holds, and unclaimed shops are simply not in it.
  await sql.query(`INSERT INTO merchants (id, owner_id, name) VALUES ('unclaimed-a', NULL, 'Unclaimed A')`);
  await sql.query(`INSERT INTO merchants (id, owner_id, name) VALUES ('unclaimed-b', NULL, 'Unclaimed B')`);
  expect(true, "two unclaimed shops can coexist — NULL is not a duplicate");
  let refusedSecond = false;
  try {
    await sql.query(`INSERT INTO merchants (id, owner_id, name) VALUES ('dupe', 'own-1', 'Second Shop')`);
  } catch {
    refusedSecond = true;
  }
  expect(refusedSecond, "...but one login still cannot hold two shops");

  // The claim columns exist and are empty for everything that predates them.
  // claim_token (the readable copy) and unclaimed_at (a hand-back) arrived
  // later than the rest, so they are listed here rather than assumed: a column
  // that only exists on a freshly-created schema is exactly the shape of bug
  // this suite is for, and src/backup.ts refuses a dump whose columns do not
  // match the target — so missing one turns a restore into a second outage.
  const claimCols = (await sql.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name = 'merchants'
        AND column_name IN ('claim_token_hash', 'claim_token', 'claim_expires',
                            'claimed_at', 'unclaimed_at', 'paid_at')`,
  )).rows.map((r) => r.column_name).sort();
  expect(claimCols.length === 6, `the claim columns are present (${claimCols.join(", ")})`);
  // Nothing that predates the hand-back can have been handed back, and no
  // upgraded row may arrive holding a readable token it never had.
  const invented = (await sql.query<{ n: string }>(
    `SELECT count(*) AS n FROM merchants WHERE claim_token IS NOT NULL OR unclaimed_at IS NOT NULL`,
  )).rows[0]!.n;
  expect(invented === "0", "an upgraded merchant carries no invented link and no invented hand-back");
  const preClaimed = (await sql.query<{ n: string }>(
    `SELECT count(*) AS n FROM merchants WHERE claimed_at IS NOT NULL OR claim_token_hash IS NOT NULL`,
  )).rows[0]!.n;
  expect(Number(preClaimed) === 0, "an upgraded merchant carries no invented claim history");

  console.log(failures === 0 ? "\nMIGRATION OK ✅" : `\n${failures} FAILURE(S) ❌`);

  // Close the pool BEFORE stopping Postgres. Otherwise the server terminates
  // connections that pg still holds, pg emits an 'error' with no listener, and
  // node kills the process — so a fully passing run still exits 1.
  await sql.end();
}

main()
  .catch((e) => {
    console.error(e);
    failures++;
  })
  .finally(async () => {
    await pg.stop();
    process.exit(failures === 0 ? 0 : 1);
  });
