/**
 * `pnpm db:restore <file.json> [--force]` — replay a dump from `pnpm db:backup`.
 *
 *   DATABASE_URL='postgresql://…' pnpm db:restore ~/Stampy-backups/stampy-….json
 *
 * The target database must ALREADY have the schema the dump was taken from —
 * this restores data, not structure. In a real recovery that means: check out
 * the commit that was live when the backup was taken, point it at an empty
 * database so its migrate() builds that schema, then restore into it.
 *
 * A dump is refused if the target's tables or columns don't match, which is what
 * stops the one genuinely dangerous move: replaying a pre-v1.3 (`cafes`) dump
 * into a v1.3 (`cards`) database.
 *
 * A non-empty target is refused unless --force, which erases it first.
 */
import { readFileSync } from "node:fs";
import { getPool } from "../src/db.js";
import { restoreDatabase, type Dump } from "../src/backup.js";

const args = process.argv.slice(2);
const force = args.includes("--force");
const file = args.find((a) => !a.startsWith("--"));

if (!process.env.DATABASE_URL || !file) {
  console.error("Usage:  DATABASE_URL='postgresql://…' pnpm db:restore <backup.json> [--force]");
  console.error("\n  --force erases every row in the target database first.");
  process.exit(1);
}

const dump = JSON.parse(readFileSync(file, "utf8")) as Dump;
const rows = dump.tables.reduce((n, t) => n + t.rows.length, 0);
console.log(`Restoring ${rows} rows from a backup taken ${dump.takenAt}${force ? " (--force: erasing first)" : ""}\n`);

const pool = getPool();
const client = await pool.connect();
try {
  await restoreDatabase(client, dump, {
    force,
    onTable: (name, n) => console.log(`  ${name.padEnd(22)} ${String(n).padStart(7)} rows`),
  });
  console.log("\nRESTORE OK ✅");
} catch (err) {
  console.error("\nRESTORE FAILED — nothing was changed (the whole restore is one transaction).\n");
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
