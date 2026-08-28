/**
 * `pnpm db:backup` — dump the whole database to a JSON file.
 *
 * Railway only offers snapshots on a paid plan, so this is the project's backup.
 * Connects with DATABASE_URL from the environment (never a file, never an
 * argument — arguments end up in shell history), and writes to ~/Stampy-backups.
 *
 * Deliberately outside the repository: the dump holds password hashes, staff PIN
 * hashes and pass auth tokens, and nothing that sensitive should sit anywhere a
 * `git add -A` could reach (CLAUDE.md invariant 2).
 *
 *   DATABASE_URL='postgresql://…' pnpm db:backup
 *
 * From your Mac, use Railway's DATABASE_PUBLIC_URL — the plain DATABASE_URL
 * points at `.railway.internal`, which only resolves inside Railway's network.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { getPool } from "../src/db.js";
import { dumpDatabase } from "../src/backup.js";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.\n");
  console.error("  Railway → your project → the Postgres service → Variables tab");
  console.error("  → copy DATABASE_PUBLIC_URL, then run:\n");
  console.error("  DATABASE_URL='<paste it here>' pnpm db:backup\n");
  process.exit(1);
}

const dir = path.join(homedir(), "Stampy-backups");
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

const pool = getPool();
const client = await pool.connect();

// The environment stamp (ensureEnvStamp, src/db.ts) goes into the filename, so
// a staging dump and a live dump can never be mistaken for each other on disk.
// Databases from before the stamp existed simply keep the old name.
const env = await client
  .query<{ name: string }>(`SELECT name FROM app_env LIMIT 1`)
  .then((r) => r.rows[0]?.name ?? "")
  .catch(() => "");
const file = path.join(dir, `stampy-${env ? env + "-" : ""}${stamp}.json`);
try {
  let total = 0;
  const dump = await dumpDatabase(client, (name, rows) => {
    total += rows;
    console.log(`  ${name.padEnd(22)} ${String(rows).padStart(7)} rows`);
  });
  writeFileSync(file, JSON.stringify(dump), { mode: 0o600 });
  const mb = (Buffer.byteLength(JSON.stringify(dump)) / 1024 / 1024).toFixed(2);
  console.log(`\nBACKUP OK ✅  ${total} rows, ${mb} MB`);
  console.log(file);
  console.log("\nRestore with:  DATABASE_URL='…' pnpm db:restore " + JSON.stringify(file));
} finally {
  client.release();
  await pool.end();
}
