/**
 * Postgres access layer.
 *
 *   cafes          — one row per café (branding, reward, staff PIN)
 *   owners         — dashboard logins (email + scrypt password hash)
 *   owner_cafes    — which owners manage which cafés
 *   passes         — one row per issued card (serial, auth token, stamp count)
 *   registrations  — one row per (device, pass) pair that Apple registered for
 *                    push updates; stores the APNs push token
 *   events         — append-only log (enroll/stamp/redeem/nudge) powering the
 *                    dashboard metrics and, later, automated win-back
 *
 * Schema is created automatically on boot (idempotent), so the founder never
 * runs SQL by hand — adding the Postgres plugin in Railway is enough.
 */
import pg from "pg";
import { randomInt } from "node:crypto";
import { config, seedCafe } from "./config.js";

const { Pool } = pg;

export interface CafeRow {
  id: string;
  name: string;
  reward: string;
  stamps_target: number;
  stamps_start: number;
  background_color: string;
  foreground_color: string;
  label_color: string;
  staff_pin: string;
  created_at: Date;
}

export interface OwnerRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: Date;
}

export type Platform = "apple" | "google";

export interface PassRow {
  serial: string;
  cafe_id: string;
  /** Which wallet the card lives in — decides how updates are delivered. */
  platform: Platform;
  /** Short human-typeable code printed on the card — staff fallback when the camera won't scan. */
  short_code: string;
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

export type EventType = "enroll" | "stamp" | "redeem" | "nudge";

/** Default café id — seeded from env on first boot so v0.1 behavior is unchanged. */
export const DEFAULT_CAFE_ID = "default";

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    if (!config.databaseUrl) {
      throw new Error("DATABASE_URL is not set — add the Postgres plugin in Railway.");
    }
    pool = new Pool({
      connectionString: config.databaseUrl,
      // Railway Postgres requires TLS from outside its private network but the
      // proxy uses a self-signed chain; internal URLs and local dev don't use
      // TLS at all.
      ssl: /railway\.internal|localhost|127\.0\.0\.1/.test(config.databaseUrl)
        ? undefined
        : { rejectUnauthorized: false },
      max: 5,
    });
  }
  return pool;
}

export async function migrate(): Promise<void> {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS cafes (
      id               text PRIMARY KEY,
      name             text NOT NULL,
      reward           text NOT NULL DEFAULT 'Free coffee',
      stamps_target    integer NOT NULL DEFAULT 10,
      stamps_start     integer NOT NULL DEFAULT 2,
      background_color text NOT NULL DEFAULT 'rgb(59, 32, 22)',
      foreground_color text NOT NULL DEFAULT 'rgb(255, 250, 240)',
      label_color      text NOT NULL DEFAULT 'rgb(214, 178, 120)',
      staff_pin        text NOT NULL DEFAULT '1234',
      created_at       timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS owners (
      id            text PRIMARY KEY,
      email         text NOT NULL UNIQUE,
      password_hash text NOT NULL,
      created_at    timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS owner_cafes (
      owner_id text NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
      cafe_id  text NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
      PRIMARY KEY (owner_id, cafe_id)
    );
    CREATE TABLE IF NOT EXISTS passes (
      serial        text PRIMARY KEY,
      cafe_id       text NOT NULL REFERENCES cafes(id),
      platform      text NOT NULL DEFAULT 'apple',
      short_code    text NOT NULL UNIQUE,
      auth_token    text NOT NULL,
      stamp_count   integer NOT NULL DEFAULT 0,
      stamps_target integer NOT NULL DEFAULT 10,
      reward        text NOT NULL DEFAULT '',
      message       text NOT NULL DEFAULT '',
      created_at    timestamptz NOT NULL DEFAULT now(),
      updated_at    timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_passes_cafe ON passes(cafe_id);
    CREATE TABLE IF NOT EXISTS registrations (
      device_library_id text NOT NULL,
      push_token        text NOT NULL,
      serial            text NOT NULL REFERENCES passes(serial) ON DELETE CASCADE,
      created_at        timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (device_library_id, serial)
    );
    CREATE INDEX IF NOT EXISTS idx_registrations_serial ON registrations(serial);
    CREATE TABLE IF NOT EXISTS events (
      id         bigserial PRIMARY KEY,
      cafe_id    text NOT NULL REFERENCES cafes(id),
      serial     text NOT NULL,
      type       text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_events_cafe_time ON events(cafe_id, created_at);
    -- v0.3: pre-existing deployments get the platform column added in place.
    ALTER TABLE passes ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'apple';
    -- v0.4: per-café uploaded logos. Bytes live in Postgres (Railway's disk is
    -- ephemeral) and in their own table so SELECTs on cafes stay lightweight.
    CREATE TABLE IF NOT EXISTS cafe_logos (
      cafe_id    text PRIMARY KEY REFERENCES cafes(id) ON DELETE CASCADE,
      png        bytea NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    -- v0.7: optional per-café banner image (Apple strip.png / Google heroImage).
    CREATE TABLE IF NOT EXISTS cafe_banners (
      cafe_id    text PRIMARY KEY REFERENCES cafes(id) ON DELETE CASCADE,
      png        bytea NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  // Seed the default café from env vars on first boot (v0.1 compatibility).
  await getPool().query(
    `INSERT INTO cafes (id, name, reward, stamps_target, stamps_start, staff_pin)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO NOTHING`,
    [
      DEFAULT_CAFE_ID,
      seedCafe.name,
      seedCafe.reward,
      seedCafe.stampsTarget,
      seedCafe.stampsStart,
      config.staffPin,
    ],
  );
}

// ----------------------------------------------------------------- cafes ----

/** Human-typeable code alphabet — no 0/O/1/I/L confusion. */
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function generateShortCode(length = 6): string {
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}

export async function getCafe(id: string): Promise<CafeRow | null> {
  const res = await getPool().query<CafeRow>(`SELECT * FROM cafes WHERE id = $1`, [id]);
  return res.rows[0] ?? null;
}

export async function createCafe(row: {
  name: string;
  reward: string;
  stampsTarget: number;
  stampsStart: number;
  staffPin: string;
}): Promise<CafeRow> {
  const id = generateShortCode(8).toLowerCase();
  const res = await getPool().query<CafeRow>(
    `INSERT INTO cafes (id, name, reward, stamps_target, stamps_start, staff_pin)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [id, row.name, row.reward, row.stampsTarget, row.stampsStart, row.staffPin],
  );
  return res.rows[0]!;
}

export async function updateCafe(
  id: string,
  fields: Partial<{
    name: string;
    reward: string;
    stamps_target: number;
    stamps_start: number;
    staff_pin: string;
    background_color: string;
    foreground_color: string;
    label_color: string;
  }>,
): Promise<CafeRow | null> {
  const keys = Object.keys(fields) as (keyof typeof fields)[];
  if (!keys.length) return getCafe(id);
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  const res = await getPool().query<CafeRow>(
    `UPDATE cafes SET ${sets} WHERE id = $1 RETURNING *`,
    [id, ...keys.map((k) => fields[k])],
  );
  return res.rows[0] ?? null;
}

// ----------------------------------------------------------- café logos ----

export async function getCafeLogo(
  cafeId: string,
): Promise<{ png: Buffer; updated_at: Date } | null> {
  const res = await getPool().query<{ png: Buffer; updated_at: Date }>(
    `SELECT png, updated_at FROM cafe_logos WHERE cafe_id = $1`,
    [cafeId],
  );
  return res.rows[0] ?? null;
}

export async function setCafeLogo(cafeId: string, png: Buffer): Promise<void> {
  await getPool().query(
    `INSERT INTO cafe_logos (cafe_id, png, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (cafe_id) DO UPDATE SET png = EXCLUDED.png, updated_at = now()`,
    [cafeId, png],
  );
}

export async function deleteCafeLogo(cafeId: string): Promise<void> {
  await getPool().query(`DELETE FROM cafe_logos WHERE cafe_id = $1`, [cafeId]);
}

/** Epoch-ms of the logo's last change, or 0 when none — used to cache-bust Google's fetch. */
export async function cafeLogoVersion(cafeId: string): Promise<number> {
  const res = await getPool().query<{ updated_at: Date }>(
    `SELECT updated_at FROM cafe_logos WHERE cafe_id = $1`,
    [cafeId],
  );
  const row = res.rows[0];
  return row ? new Date(row.updated_at).getTime() : 0;
}

// Banner image (optional): Apple strip.png / Google heroImage. Same shape as logos.
export async function getCafeBanner(cafeId: string): Promise<{ png: Buffer } | null> {
  const res = await getPool().query<{ png: Buffer }>(
    `SELECT png FROM cafe_banners WHERE cafe_id = $1`,
    [cafeId],
  );
  return res.rows[0] ?? null;
}

export async function setCafeBanner(cafeId: string, png: Buffer): Promise<void> {
  await getPool().query(
    `INSERT INTO cafe_banners (cafe_id, png, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (cafe_id) DO UPDATE SET png = EXCLUDED.png, updated_at = now()`,
    [cafeId, png],
  );
}

export async function deleteCafeBanner(cafeId: string): Promise<void> {
  await getPool().query(`DELETE FROM cafe_banners WHERE cafe_id = $1`, [cafeId]);
}

export async function cafeBannerVersion(cafeId: string): Promise<number> {
  const res = await getPool().query<{ updated_at: Date }>(
    `SELECT updated_at FROM cafe_banners WHERE cafe_id = $1`,
    [cafeId],
  );
  const row = res.rows[0];
  return row ? new Date(row.updated_at).getTime() : 0;
}

// ------------------------------------------------------- customers / win-back ----

export interface CustomerRow {
  serial: string;
  code: string;
  stamps: number;
  target: number;
  updated_at: Date;
}

/** Every card of a café, most-recently-active first (for the Customers view). */
export async function cafeCustomers(cafeId: string): Promise<CustomerRow[]> {
  const res = await getPool().query<CustomerRow>(
    `SELECT serial, short_code AS code, stamp_count AS stamps, stamps_target AS target, updated_at
       FROM passes WHERE cafe_id = $1 ORDER BY updated_at DESC`,
    [cafeId],
  );
  return res.rows;
}

/** Serials whose card hasn't changed (stamp/redeem) in `days` days — the lapsing set. */
export async function lapsingSerials(cafeId: string, days: number): Promise<string[]> {
  const res = await getPool().query<{ serial: string }>(
    `SELECT serial FROM passes
      WHERE cafe_id = $1 AND updated_at < now() - ($2 || ' days')::interval`,
    [cafeId, String(Math.max(0, Math.trunc(days)))],
  );
  return res.rows.map((r) => r.serial);
}

// ----------------------------------------------------------------- admin ----

export interface AdminCafeRow {
  id: string;
  name: string;
  owners: string | null;
  created_at: Date;
  has_logo: boolean;
  has_banner: boolean;
  cards: number;
  stamps: number;
  redemptions: number;
}

/** Every café on the platform with its owner email(s), metrics, and art flags.
 *  Never selects a password — only the hash exists and it is never surfaced. */
export async function allCafesWithStats(): Promise<AdminCafeRow[]> {
  const res = await getPool().query<AdminCafeRow>(
    `SELECT c.id, c.name, c.created_at,
            (SELECT string_agg(o.email, ', ' ORDER BY o.email)
               FROM owner_cafes oc JOIN owners o ON o.id = oc.owner_id
              WHERE oc.cafe_id = c.id) AS owners,
            EXISTS (SELECT 1 FROM cafe_logos l WHERE l.cafe_id = c.id) AS has_logo,
            EXISTS (SELECT 1 FROM cafe_banners b WHERE b.cafe_id = c.id) AS has_banner,
            (SELECT count(*)::int FROM passes p WHERE p.cafe_id = c.id) AS cards,
            (SELECT count(*)::int FROM events e WHERE e.cafe_id = c.id AND e.type = 'stamp') AS stamps,
            (SELECT count(*)::int FROM events e WHERE e.cafe_id = c.id AND e.type = 'redeem') AS redemptions
       FROM cafes c
      ORDER BY c.created_at DESC`,
  );
  return res.rows;
}

/** All owner accounts (id + email only) — for the admin's reset-password picker. */
export async function allOwners(): Promise<{ id: string; email: string }[]> {
  const res = await getPool().query<{ id: string; email: string }>(
    `SELECT id, email FROM owners ORDER BY email`,
  );
  return res.rows;
}

// ---------------------------------------------------------------- owners ----

export async function createOwner(id: string, email: string, passwordHash: string): Promise<OwnerRow> {
  const res = await getPool().query<OwnerRow>(
    `INSERT INTO owners (id, email, password_hash) VALUES ($1, $2, $3) RETURNING *`,
    [id, email.toLowerCase().trim(), passwordHash],
  );
  return res.rows[0]!;
}

export async function getOwnerByEmail(email: string): Promise<OwnerRow | null> {
  const res = await getPool().query<OwnerRow>(
    `SELECT * FROM owners WHERE email = $1`,
    [email.toLowerCase().trim()],
  );
  return res.rows[0] ?? null;
}

export async function getOwner(id: string): Promise<OwnerRow | null> {
  const res = await getPool().query<OwnerRow>(`SELECT * FROM owners WHERE id = $1`, [id]);
  return res.rows[0] ?? null;
}

export async function countOwners(): Promise<number> {
  const res = await getPool().query<{ n: string }>(`SELECT count(*)::text AS n FROM owners`);
  return Number(res.rows[0]?.n ?? 0);
}

export async function updateOwnerPassword(ownerId: string, passwordHash: string): Promise<void> {
  await getPool().query(`UPDATE owners SET password_hash = $2 WHERE id = $1`, [ownerId, passwordHash]);
}

export async function linkOwnerCafe(ownerId: string, cafeId: string): Promise<void> {
  await getPool().query(
    `INSERT INTO owner_cafes (owner_id, cafe_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [ownerId, cafeId],
  );
}

export async function cafesForOwner(ownerId: string): Promise<CafeRow[]> {
  const res = await getPool().query<CafeRow>(
    `SELECT c.* FROM cafes c JOIN owner_cafes oc ON oc.cafe_id = c.id
      WHERE oc.owner_id = $1 ORDER BY c.created_at`,
    [ownerId],
  );
  return res.rows;
}

export async function ownerHasCafe(ownerId: string, cafeId: string): Promise<boolean> {
  const res = await getPool().query(
    `SELECT 1 FROM owner_cafes WHERE owner_id = $1 AND cafe_id = $2`,
    [ownerId, cafeId],
  );
  return res.rows.length > 0;
}

// ---------------------------------------------------------------- passes ----

export async function createPass(row: {
  serial: string;
  cafeId: string;
  platform: Platform;
  shortCode: string;
  authToken: string;
  stampCount: number;
  stampsTarget: number;
  reward: string;
}): Promise<PassRow> {
  const res = await getPool().query<PassRow>(
    `INSERT INTO passes (serial, cafe_id, platform, short_code, auth_token, stamp_count, stamps_target, reward)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [row.serial, row.cafeId, row.platform, row.shortCode, row.authToken, row.stampCount, row.stampsTarget, row.reward],
  );
  return res.rows[0]!;
}

export async function getPass(serial: string): Promise<PassRow | null> {
  const res = await getPool().query<PassRow>(`SELECT * FROM passes WHERE serial = $1`, [serial]);
  return res.rows[0] ?? null;
}

export async function getPassByShortCode(cafeId: string, shortCode: string): Promise<PassRow | null> {
  const res = await getPool().query<PassRow>(
    `SELECT * FROM passes WHERE cafe_id = $1 AND short_code = $2`,
    [cafeId, shortCode.toUpperCase().trim()],
  );
  return res.rows[0] ?? null;
}

export async function listRecentPasses(cafeId: string, limit = 20): Promise<PassRow[]> {
  const res = await getPool().query<PassRow>(
    `SELECT * FROM passes WHERE cafe_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [cafeId, limit],
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

// ---------------------------------------------------------------- events ----

export async function logEvent(cafeId: string, serial: string, type: EventType): Promise<void> {
  await getPool().query(
    `INSERT INTO events (cafe_id, serial, type) VALUES ($1, $2, $3)`,
    [cafeId, serial, type],
  );
}

export interface CafeMetrics {
  cards: number;
  stamps: number;
  redemptions: number;
  stamps30d: number;
  redemptions30d: number;
}

export async function cafeMetrics(cafeId: string): Promise<CafeMetrics> {
  const res = await getPool().query<{
    cards: string;
    stamps: string;
    redemptions: string;
    stamps30d: string;
    redemptions30d: string;
  }>(
    `SELECT
       (SELECT count(*) FROM passes WHERE cafe_id = $1)::text AS cards,
       count(*) FILTER (WHERE type = 'stamp')::text AS stamps,
       count(*) FILTER (WHERE type = 'redeem')::text AS redemptions,
       count(*) FILTER (WHERE type = 'stamp' AND created_at > now() - interval '30 days')::text AS "stamps30d",
       count(*) FILTER (WHERE type = 'redeem' AND created_at > now() - interval '30 days')::text AS "redemptions30d"
     FROM events WHERE cafe_id = $1`,
    [cafeId],
  );
  const r = res.rows[0]!;
  return {
    cards: Number(r.cards),
    stamps: Number(r.stamps),
    redemptions: Number(r.redemptions),
    stamps30d: Number(r.stamps30d),
    redemptions30d: Number(r.redemptions30d),
  };
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
