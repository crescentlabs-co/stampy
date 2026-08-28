/**
 * Whole-database dump and restore, in plain Node.
 *
 * Railway only offers snapshots on a paid plan, and this Mac has no `pg_dump`
 * or `psql` (embedded-postgres ships only initdb/pg_ctl/postgres). Since `pg`
 * is already a dependency, a dump/restore pair costs nothing extra and — unlike
 * a Railway snapshot on the free plan — can actually be restored and verified
 * before anyone relies on it. See test/backup.test.ts.
 *
 * The dump carries DATA ONLY. Schema, constraints and indexes come from
 * migrate() running first against an empty database, which is also what makes
 * the format survive schema changes: tables and columns are read from the
 * catalogue, never hardcoded.
 *
 * What is in here is highly sensitive — password hashes, staff PIN hashes and
 * pass auth tokens. Callers must write it outside the repository.
 */
import type { ClientBase } from "pg";

/** Bumped only if the shape below changes incompatibly. */
export const BACKUP_FORMAT = 1;

/**
 * A `bytea` value. JSON has no bytes, and the pass artwork
 * (card_logos/card_banners/card_stamp_strips) is raw PNG — encoding it as a
 * plain string would silently mangle it. Self-describing rather than driven by
 * a column-type table, so a bytea column added later needs no change here.
 */
interface Bytes {
  b64: string;
}

function isBytes(v: unknown): v is Bytes {
  return typeof v === "object" && v !== null && typeof (v as Bytes).b64 === "string" && Object.keys(v).length === 1;
}

/**
 * A value that came out of a `json`/`jsonb` column.
 *
 * node-postgres hands these back as plain objects and arrays — and, handed one
 * back, serialises it as a POSTGRES ARRAY LITERAL rather than as JSON. So an
 * empty list restores as an empty object ({} instead of []), and a list with
 * anything in it fails the insert outright. Every JSON value has to travel to
 * the database as a string.
 *
 * This was latent for as long as `events.metadata` has existed: a dump
 * containing any event metadata restored it wrong, silently, and the only
 * reason nobody hit it is that the round-trip test never wrote one. The
 * milestones columns are NOT NULL, so every card and pass now carries a JSON
 * value and the bug became unmissable.
 *
 * Safe to detect by shape rather than by column type because a dump has been
 * through JSON.parse before it is restored: dates are already strings, bytea is
 * a self-describing {b64}, and nothing else arrives object-shaped. The Date and
 * Buffer guards are belt-and-braces for a caller that skipped the file.
 */
function isJsonValue(v: unknown): boolean {
  return typeof v === "object" && v !== null
    && !isBytes(v) && !(v instanceof Date) && !Buffer.isBuffer(v);
}

export interface TableDump {
  name: string;
  columns: string[];
  rows: unknown[][];
}

export interface Dump {
  stampyBackup: number;
  takenAt: string;
  tables: TableDump[];
}

/** Every ordinary table in `public`, alphabetically so two dumps are comparable. */
async function tableNames(client: ClientBase): Promise<string[]> {
  const res = await client.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name`,
  );
  return res.rows.map((r) => r.table_name);
}

/** Identifiers come from the catalogue, but quote them anyway — belt and braces. */
function quote(ident: string): string {
  return `"${ident.replace(/"/g, '""')}"`;
}

/**
 * Read every row of every table. `onTable` reports progress — for a live dump
 * that row count is the only answer anyone has to "how much data is at stake".
 */
export async function dumpDatabase(
  client: ClientBase,
  onTable?: (name: string, rows: number) => void,
): Promise<Dump> {
  const tables: TableDump[] = [];
  for (const name of await tableNames(client)) {
    // No ORDER BY: some tables have no unique ordering column, and restore
    // order within a table never matters.
    const res = await client.query(`SELECT * FROM ${quote(name)}`);
    const columns = res.fields.map((f) => f.name);
    const rows = res.rows.map((row: Record<string, unknown>) =>
      columns.map((c) => {
        const v = row[c];
        return Buffer.isBuffer(v) ? { b64: v.toString("base64") } : v;
      }),
    );
    tables.push({ name, columns, rows });
    onTable?.(name, rows.length);
  }
  return { stampyBackup: BACKUP_FORMAT, takenAt: new Date().toISOString(), tables };
}

/**
 * Order tables so a parent is always inserted before its children, using the
 * TARGET database's foreign keys. Insert order is the whole difficulty of
 * restoring: get it wrong and the first FK violation aborts everything.
 */
async function insertOrder(client: ClientBase, names: string[]): Promise<string[]> {
  const res = await client.query<{ child: string; parent: string }>(
    `SELECT conrelid::regclass::text AS child, confrelid::regclass::text AS parent
       FROM pg_constraint
      WHERE contype = 'f' AND connamespace = 'public'::regnamespace`,
  );
  const want = new Set(names);
  const parents = new Map<string, Set<string>>(names.map((n) => [n, new Set<string>()]));
  for (const { child, parent } of res.rows) {
    // regclass renders as a bare name for public schema; self-references
    // (none today) would deadlock the sort, so drop them.
    if (child === parent || !want.has(child) || !want.has(parent)) continue;
    parents.get(child)!.add(parent);
  }
  const done: string[] = [];
  const placed = new Set<string>();
  while (done.length < names.length) {
    const ready = names.filter((n) => !placed.has(n) && [...parents.get(n)!].every((p) => placed.has(p)));
    if (ready.length === 0) {
      const stuck = names.filter((n) => !placed.has(n));
      throw new Error(`restore: circular foreign keys between ${stuck.join(", ")} — cannot order inserts`);
    }
    for (const n of ready) {
      done.push(n);
      placed.add(n);
    }
  }
  return done;
}

/** Postgres caps a statement at 65535 parameters; stay well under it. */
function batchSize(columns: number): number {
  return Math.max(1, Math.floor(60000 / Math.max(1, columns)));
}

/**
 * Fast-forward every sequence past the ids just inserted.
 *
 * Without this a restore looks perfectly successful and then the next INSERT
 * fails on a duplicate key — `events.id` is a bigserial, so that would be the
 * next stamp anyone takes. The restore itself supplies ids explicitly, which
 * never advances the sequence behind them.
 */
async function resyncSequences(client: ClientBase, tables: string[]): Promise<void> {
  const res = await client.query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND column_default LIKE 'nextval(%'`,
  );
  for (const { table_name, column_name } of res.rows) {
    if (!tables.includes(table_name)) continue;
    // is_called=false on an empty table so the sequence still hands out 1.
    await client.query(
      `SELECT setval(
         pg_get_serial_sequence($1, $2),
         COALESCE((SELECT max(${quote(column_name)}) FROM ${quote(table_name)}), 1),
         (SELECT count(*) > 0 FROM ${quote(table_name)})
       )`,
      [`public.${table_name}`, column_name],
    );
  }
}

export interface RestoreOptions {
  /** Empty every target table first. Without it, a non-empty target is refused. */
  force?: boolean;
  onTable?: (name: string, rows: number) => void;
}

/**
 * Replay a dump into a database whose schema already matches it.
 *
 * The schema check is the point of this function, not a nicety: replaying a
 * `cafes`-era dump into a `cards`-era database is the one move that could turn
 * a recovery into a second outage. It refuses, and names what doesn't match.
 */
export async function restoreDatabase(client: ClientBase, dump: Dump, opts: RestoreOptions = {}): Promise<void> {
  if (dump.stampyBackup !== BACKUP_FORMAT) {
    throw new Error(`restore: backup format ${dump.stampyBackup}, this build understands ${BACKUP_FORMAT}`);
  }
  const present = new Set(await tableNames(client));
  const missing = dump.tables.map((t) => t.name).filter((n) => !present.has(n));
  if (missing.length) {
    throw new Error(
      `restore: the target database has no ${missing.join(", ")}. ` +
        "This dump was taken from a different schema — check out the commit that was live when it was " +
        "taken, let migrate() build that schema in an EMPTY database, and restore into that.",
    );
  }
  // Columns must match too: a dump predating an ADD COLUMN would otherwise
  // restore silently, leaving the new column at its default everywhere.
  for (const t of dump.tables) {
    const cols = new Set(
      (
        await client.query<{ column_name: string }>(
          `SELECT column_name FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = $1`,
          [t.name],
        )
      ).rows.map((r) => r.column_name),
    );
    const gone = t.columns.filter((c) => !cols.has(c));
    if (gone.length) throw new Error(`restore: ${t.name} in the target has no column ${gone.join(", ")}`);
  }

  const order = await insertOrder(
    client,
    dump.tables.map((t) => t.name),
  );
  const byName = new Map(dump.tables.map((t) => [t.name, t]));

  await client.query("BEGIN");
  try {
    const counts = await client.query<{ n: string }>(
      `SELECT sum(c) AS n FROM (${order.map((n) => `SELECT count(*) AS c FROM ${quote(n)}`).join(" UNION ALL ")}) t`,
    );
    const existing = Number(counts.rows[0]?.n ?? 0);
    if (existing > 0) {
      if (!opts.force) {
        throw new Error(
          `restore: the target database already holds ${existing} rows. ` +
            "Restore into an empty database, or pass --force to erase it first.",
        );
      }
      await client.query(`TRUNCATE ${order.map(quote).join(", ")} CASCADE`);
    }

    for (const name of order) {
      const t = byName.get(name)!;
      if (t.rows.length === 0) {
        opts.onTable?.(name, 0);
        continue;
      }
      const cols = t.columns.map(quote).join(", ");
      const size = batchSize(t.columns.length);
      for (let i = 0; i < t.rows.length; i += size) {
        const slice = t.rows.slice(i, i + size);
        const values: unknown[] = [];
        const tuples = slice.map(
          (row) =>
            `(${row
              .map((v) => {
                values.push(
                  isBytes(v) ? Buffer.from(v.b64, "base64")
                    : isJsonValue(v) ? JSON.stringify(v)
                    : v,
                );
                return `$${values.length}`;
              })
              .join(", ")})`,
        );
        await client.query(`INSERT INTO ${quote(name)} (${cols}) VALUES ${tuples.join(", ")}`, values);
      }
      opts.onTable?.(name, t.rows.length);
    }
    await resyncSequences(client, order);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}
