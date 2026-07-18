/**
 * Postgres access layer. Two tables:
 *
 *   passes         — one row per issued card (serial, auth token, stamp count)
 *   registrations  — one row per (device, pass) pair that Apple registered for
 *                    push updates; stores the APNs push token
 *
 * Schema is created automatically on boot (idempotent), so the founder never
 * runs SQL by hand — adding the Postgres plugin in Railway is enough.
 */
import pg from "pg";
import { config } from "./config.js";

const { Pool } = pg;

export interface PassRow {
  serial: string;
  auth_token: string;
  stamp_count: number;
  stamps_target: number;
  reward: string;
  /** Free-form message surfaced on the pass back + pushed to the lock screen. */
  message: string;
  created_at: Date;
  updated_at: Date;
}

export interface RegistrationRow {
  device_library_id: string;
  push_token: string;
  serial: string;
}

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    if (!config.databaseUrl) {
      throw new Error("DATABASE_URL is not set — add the Postgres plugin in Railway.");
    }
    pool = new Pool({
      connectionString: config.databaseUrl,
      // Railway Postgres requires TLS from outside its private network but the
      // proxy uses a self-signed chain; internal URLs don't use TLS at all.
      ssl: config.databaseUrl.includes("railway.internal")
        ? undefined
        : { rejectUnauthorized: false },
      max: 5,
    });
  }
  return pool;
}

export async function migrate(): Promise<void> {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS passes (
      serial        text PRIMARY KEY,
      auth_token    text NOT NULL,
      stamp_count   integer NOT NULL DEFAULT 0,
      stamps_target integer NOT NULL DEFAULT 10,
      reward        text NOT NULL DEFAULT '',
      message       text NOT NULL DEFAULT '',
      created_at    timestamptz NOT NULL DEFAULT now(),
      updated_at    timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS registrations (
      device_library_id text NOT NULL,
      push_token        text NOT NULL,
      serial            text NOT NULL REFERENCES passes(serial) ON DELETE CASCADE,
      created_at        timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (device_library_id, serial)
    );
    CREATE INDEX IF NOT EXISTS idx_registrations_serial ON registrations(serial);
  `);
}

// ---------------------------------------------------------------- passes ----

export async function createPass(row: {
  serial: string;
  authToken: string;
  stampCount: number;
  stampsTarget: number;
  reward: string;
}): Promise<PassRow> {
  const res = await getPool().query<PassRow>(
    `INSERT INTO passes (serial, auth_token, stamp_count, stamps_target, reward)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [row.serial, row.authToken, row.stampCount, row.stampsTarget, row.reward],
  );
  return res.rows[0]!;
}

export async function getPass(serial: string): Promise<PassRow | null> {
  const res = await getPool().query<PassRow>(`SELECT * FROM passes WHERE serial = $1`, [serial]);
  return res.rows[0] ?? null;
}

export async function listRecentPasses(limit = 20): Promise<PassRow[]> {
  const res = await getPool().query<PassRow>(
    `SELECT * FROM passes ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return res.rows;
}

/** Adds stamps (may be negative to correct mistakes); clamps to [0, target]. */
export async function addStamps(serial: string, delta: number): Promise<PassRow | null> {
  const res = await getPool().query<PassRow>(
    `UPDATE passes
       SET stamp_count = LEAST(GREATEST(stamp_count + $2, 0), stamps_target),
           updated_at  = now()
     WHERE serial = $1
     RETURNING *`,
    [serial, delta],
  );
  return res.rows[0] ?? null;
}

/** Resets the card after redemption. */
export async function redeemPass(serial: string): Promise<PassRow | null> {
  const res = await getPool().query<PassRow>(
    `UPDATE passes SET stamp_count = 0, updated_at = now() WHERE serial = $1 RETURNING *`,
    [serial],
  );
  return res.rows[0] ?? null;
}

/** Sets the free-form message (win-back nudge) and bumps updated_at. */
export async function setMessage(serial: string, message: string): Promise<PassRow | null> {
  const res = await getPool().query<PassRow>(
    `UPDATE passes SET message = $2, updated_at = now() WHERE serial = $1 RETURNING *`,
    [serial, message],
  );
  return res.rows[0] ?? null;
}

// --------------------------------------------------------- registrations ----

export async function upsertRegistration(
  deviceLibraryId: string,
  serial: string,
  pushToken: string,
): Promise<{ created: boolean }> {
  const res = await getPool().query(
    `INSERT INTO registrations (device_library_id, serial, push_token)
     VALUES ($1, $2, $3)
     ON CONFLICT (device_library_id, serial)
     DO UPDATE SET push_token = EXCLUDED.push_token
     RETURNING (xmax = 0) AS created`,
    [deviceLibraryId, serial, pushToken],
  );
  return { created: Boolean(res.rows[0]?.created) };
}

export async function deleteRegistration(deviceLibraryId: string, serial: string): Promise<void> {
  await getPool().query(
    `DELETE FROM registrations WHERE device_library_id = $1 AND serial = $2`,
    [deviceLibraryId, serial],
  );
}

/** Serials on this device whose passes changed after `updatedSince` (epoch ms tag). */
export async function serialsUpdatedSince(
  deviceLibraryId: string,
  updatedSince: string | undefined,
): Promise<{ serialNumbers: string[]; lastUpdated: string }> {
  const sinceMs = updatedSince ? Number.parseInt(updatedSince, 10) : 0;
  const res = await getPool().query<{ serial: string; updated_ms: string }>(
    `SELECT p.serial, floor(extract(epoch FROM p.updated_at) * 1000)::bigint::text AS updated_ms
       FROM passes p
       JOIN registrations r ON r.serial = p.serial
      WHERE r.device_library_id = $1`,
    [deviceLibraryId],
  );
  const changed = res.rows.filter((r) => Number(r.updated_ms) > (Number.isFinite(sinceMs) ? sinceMs : 0));
  const lastUpdated = res.rows.reduce((max, r) => Math.max(max, Number(r.updated_ms)), 0);
  return {
    serialNumbers: changed.map((r) => r.serial),
    lastUpdated: String(lastUpdated || Date.now()),
  };
}

/** Push tokens registered for a pass (usually one device, can be several). */
export async function pushTokensForSerial(serial: string): Promise<string[]> {
  const res = await getPool().query<{ push_token: string }>(
    `SELECT DISTINCT push_token FROM registrations WHERE serial = $1`,
    [serial],
  );
  return res.rows.map((r) => r.push_token);
}
