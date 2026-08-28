/**
 * `pnpm test:backup` — proves the backup can actually be restored.
 *
 * A backup that has never been restored is not a backup, and on Railway's free
 * plan `pnpm db:backup` is the only backup this project has. So this boots a
 * real Postgres, builds the real schema with migrate(), fills it with the kinds
 * of rows a live shop has — including raw PNG bytes, the one thing JSON can
 * silently corrupt — then dumps, erases, restores, and checks the database came
 * back byte-for-byte.
 *
 * It also covers the refusals that make the restore safe to run during an
 * outage: a dump whose schema doesn't match the target, and a target that still
 * has rows in it.
 *
 * A script rather than a vitest file because it needs a real database — same as
 * scripts/migration-test.ts, and for the same reason.
 */
import EmbeddedPostgres from "embedded-postgres";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { startupHint, stopPg } from "./pgStop.js";

/** Its own port. 5488 is dev:local's, and a test must not need it stopped. */
const PORT = 5487;

const dataDir = mkdtempSync(path.join(tmpdir(), "stampy-backup-"));
const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "s",
  password: "s",
  port: PORT,
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

/** Assert a call is refused, and refused for the stated reason. */
async function refuses(label: string, why: RegExp, run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
    console.error("FAIL:", label, "— it went ahead instead of refusing");
    failures++;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    expect(why.test(msg), `${label} (${msg.slice(0, 60)}…)`);
  }
}

/** A real 1×1 PNG — bytes that must survive base64 exactly. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/** What the dump looks like after a trip through a file: the honest comparison. */
function normalise(dump: unknown): string {
  const copy = JSON.parse(JSON.stringify(dump)) as { takenAt?: string; tables: { rows: unknown[][] }[] };
  delete copy.takenAt;
  // Row order within a table is not meaningful and Postgres doesn't promise it.
  for (const t of copy.tables) t.rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return JSON.stringify(copy);
}

async function main() {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("stampy");
  process.env.DATABASE_URL = `postgresql://s:s@localhost:${PORT}/stampy`;

  const db = await import("../src/db.js");
  const { dumpDatabase, restoreDatabase } = await import("../src/backup.js");
  type Dump = import("../src/backup.js").Dump;
  await db.migrate();
  console.log("MIGRATE OK");

  const pool = db.getPool();
  const client = await pool.connect();

  // One owner → one merchant → one card; a customer holding an Apple AND a
  // Google pass; an event; an uploaded logo.
  await client.query(`INSERT INTO owners (id, email, password_hash) VALUES ('o1', 'a@b.my', 'hash')`);
  await client.query(`INSERT INTO merchants (id, owner_id, name) VALUES ('m1', 'o1', 'Kopi Corner')`);
  await client.query(`INSERT INTO merchant_slugs (slug, merchant_id) VALUES ('kopi-corner', 'm1')`);
  await client.query(`UPDATE cards SET merchant_id = 'm1' WHERE id = 'default'`);
  await client.query(`INSERT INTO customers (id, merchant_id) VALUES ('c1', 'm1')`);
  await client.query(
    `INSERT INTO passes (serial, card_id, platform, short_code, auth_token, stamp_count, customer_id)
     VALUES ('s-apple', 'default', 'apple', 'ABC234', 'tok1', 3, 'c1'),
            ('s-google', 'default', 'google', 'XYZ789', 'tok2', 3, 'c1')`,
  );
  await client.query(`INSERT INTO registrations (device_library_id, push_token, serial) VALUES ('dev1', 'push1', 's-apple')`);
  await client.query(`INSERT INTO events (card_id, serial, type) VALUES ('default', 's-apple', 'stamp')`);
  // An event WITH metadata, and a card with a reward ladder. Both are jsonb,
  // and a restore used to hand node-postgres the parsed object straight back —
  // which it serialises as a Postgres array literal, not as JSON. An empty list
  // came back as an empty object and a real one failed the insert outright.
  // Nothing caught it because nothing here ever dumped a non-null jsonb value.
  await client.query(
    `INSERT INTO events (card_id, serial, type, metadata)
     VALUES ('default', 's-apple', 'nudge', $1)`,
    [JSON.stringify({ wallet: "apple", body: "We miss you", nested: { n: 1 } })],
  );
  await client.query(
    `UPDATE cards SET kind = 'milestones', milestones = $1 WHERE id = 'default'`,
    [JSON.stringify([{ at: 2, reward: "Free cookie" }, { at: 5, reward: "Pastry" }])],
  );
  await client.query(`INSERT INTO card_logos (card_id, png) VALUES ('default', $1)`, [PNG]);
  await client.query(`INSERT INTO card_stamp_strips (card_id, filled, png) VALUES ('default', 3, $1)`, [PNG]);

  const before = await dumpDatabase(client);
  expect(before.tables.length >= 14, `dumped every table (${before.tables.length})`);
  expect(
    before.tables.find((t) => t.name === "passes")?.rows.length === 2,
    "both of one customer's passes are in the dump",
  );

  // Go through a string: that is what gets written to disk, and where a Buffer
  // would quietly become "[object Object]".
  const onDisk = JSON.parse(JSON.stringify(before)) as Dump;

  await restoreDatabase(client, onDisk, { force: true });
  const after = await dumpDatabase(client);
  expect(normalise(after) === normalise(before), "the database came back exactly as it was");

  // Named separately from the whole-database compare above, because that one
  // says only that something differs. A jsonb column restoring as the wrong
  // SHAPE is the failure worth being told about by name.
  {
    const ladder = await client.query<{ milestones: unknown }>(
      `SELECT milestones FROM cards WHERE id = 'default'`,
    );
    const got = ladder.rows[0]?.milestones;
    expect(
      Array.isArray(got) && got.length === 2 && (got[0] as { at: number }).at === 2,
      `a reward ladder survives the round trip as a LIST (got ${JSON.stringify(got)})`,
    );
    const meta = await client.query<{ metadata: { nested?: { n?: number } } | null }>(
      `SELECT metadata FROM events WHERE type = 'nudge' LIMIT 1`,
    );
    expect(
      meta.rows[0]?.metadata?.nested?.n === 1,
      `event metadata survives the round trip (got ${JSON.stringify(meta.rows[0]?.metadata)})`,
    );
  }

  const png = await client.query<{ png: Buffer }>(`SELECT png FROM card_logos WHERE card_id = 'default'`);
  expect(png.rows[0]?.png.equals(PNG) === true, "logo PNG survived byte-for-byte");
  const strip = await client.query<{ png: Buffer }>(`SELECT png FROM card_stamp_strips WHERE card_id = 'default'`);
  expect(strip.rows[0]?.png.equals(PNG) === true, "stamp strip PNG survived byte-for-byte");

  // The restore inserts events.id explicitly, which does NOT advance the
  // bigserial behind it. Without a resync this is a duplicate key — i.e. the
  // next stamp anyone takes after a recovery.
  await client.query(`INSERT INTO events (card_id, serial, type) VALUES ('default', 's-apple', 'stamp')`);
  expect(true, "sequences fast-forwarded — the next stamp doesn't collide");
  await client.query(`DELETE FROM events WHERE id = (SELECT max(id) FROM events)`);

  // Replaying a pre-v1.3 (`cafes`) dump into a v1.3 (`cards`) database is the
  // one move that would turn a recovery into a second outage.
  const wrongSchema = await dumpDatabase(client);
  wrongSchema.tables.push({ name: "cafes", columns: ["id"], rows: [["default"]] });
  await refuses("refuses a dump from a different schema", /no cafes/, () =>
    restoreDatabase(client, wrongSchema, { force: true }),
  );

  const wrongColumn = await dumpDatabase(client);
  wrongColumn.tables.push({ name: "passes", columns: ["serial", "invented_column"], rows: [] });
  await refuses("refuses a dump naming a column the target lacks", /invented_column/, () =>
    restoreDatabase(client, wrongColumn, { force: true }),
  );

  const good = await dumpDatabase(client);
  await refuses("refuses to overwrite a database that still has rows", /already holds/, () =>
    restoreDatabase(client, good),
  );

  // A failed restore must change nothing — the whole thing is one transaction.
  expect(normalise(await dumpDatabase(client)) === normalise(good), "three refused restores changed nothing");

  // The real recovery shape: an empty database with the matching schema.
  await client.query(`TRUNCATE ${good.tables.map((t) => `"${t.name}"`).join(", ")} CASCADE`);
  await restoreDatabase(client, good);
  expect(normalise(await dumpDatabase(client)) === normalise(good), "restored into an empty database without --force");

  const card = await db.getCard("default");
  expect(card?.merchant_id === "m1", "the restored card still belongs to its merchant");
  const pass = await db.getPass("s-apple");
  expect(pass?.customer_id === "c1", "the restored pass still belongs to its customer");

  client.release();
  await pool.end();
}

main()
  .then(async () => {
    // The verdict is decided BEFORE the database is touched again — see stopPg.
    process.exitCode = failures ? 1 : 0;
    await stopPg(pg);
    if (failures) console.error(`\n${failures} CHECK(S) FAILED ❌`);
    else console.log("\nBACKUP ROUND-TRIP OK ✅");
    process.exit(process.exitCode);
  })
  .catch(async (err) => {
    process.exitCode = 1;
    console.error(startupHint(err, PORT));
    await stopPg(pg);
    process.exit(1);
  });
