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
import { hashPassword, verifyPassword } from "./auth.js";
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
  /** Legacy plaintext column — blanked by the migration once hashed. Never read. */
  staff_pin: string;
  /** scrypt hash of the staff PIN (same format as a password hash). */
  staff_pin_hash: string;
  /** Bumped on every PIN change; invalidates all existing staff sessions. */
  staff_session_epoch: number;
  created_at: Date;
  /** Typical spend per visit, in cents — turns stamps into a money figure. */
  average_spend_cents: number;
  /** Currency symbol shown beside that figure (owner-editable, e.g. "RM", "$"). */
  currency: string;
  /** Opt-in automated win-back: message customers idle for `auto_winback_days`. */
  auto_winback_enabled: boolean;
  auto_winback_days: number;
  auto_winback_message: string;
  /** Which stamp-grid icon preset is selected ('' = plain text dots, 'custom' = uploaded). */
  stamp_style: string;
}

export interface OwnerRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: Date;
  /** Set while a self-serve password reset is pending; both cleared on use/expiry. */
  reset_token_hash?: string | null;
  reset_expires?: Date | null;
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

/**
 * `pass_added` / `pass_removed` are APPLE ONLY. iOS calls our PassKit web service
 * when a pass really lands in a wallet and again when it is deleted, so those two
 * moments are recordable. Google hosts its own objects and reports neither — an
 * Android card that was added and one that was never opened are indistinguishable,
 * and always will be. Never present these counts as platform-wide.
 */
export type EventType =
  | "enroll"
  | "stamp"
  | "redeem"
  | "nudge"
  | "undo"
  | "pass_added"
  | "pass_removed";

/**
 * Who caused an event, and whether a stamp was forced past the anti-spam
 * cooldown. Recorded so abuse at the counter is attributable after the fact —
 * the deliberate trade-off is "detectable", not "locked down".
 */
export interface EventMeta {
  /** `staff:<deviceId>`, `owner:<ownerId>`, `auto` (win-back job) or `customer` (self sign-up). */
  actor?: string;
  /** True when staff confirmed past the "just stamped" refusal. */
  forced?: boolean;
}

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
    -- v0.8: self-serve password reset. The token is single-use and stored only
    -- as a hash (like a password), so a DB leak can't be replayed to reset.
    ALTER TABLE owners ADD COLUMN IF NOT EXISTS reset_token_hash text;
    ALTER TABLE owners ADD COLUMN IF NOT EXISTS reset_expires timestamptz;
    -- v0.9: opt-in automated win-back — a background job messages customers who
    -- haven't stamped in N days. Off by default so behaviour is unchanged.
    ALTER TABLE cafes ADD COLUMN IF NOT EXISTS auto_winback_enabled boolean NOT NULL DEFAULT false;
    ALTER TABLE cafes ADD COLUMN IF NOT EXISTS auto_winback_days integer NOT NULL DEFAULT 14;
    ALTER TABLE cafes ADD COLUMN IF NOT EXISTS auto_winback_message text NOT NULL DEFAULT 'We miss you! Your next stamp is waiting ☕️';
    -- v1.0: rich rendered stamp grid. The owner's browser renders one strip PNG
    -- per stamp count (0..target); Apple uses it as the strip image, Google as
    -- the hero image. Bytes live in Postgres (ephemeral disk) keyed by count.
    ALTER TABLE cafes ADD COLUMN IF NOT EXISTS stamp_style text NOT NULL DEFAULT '';
    CREATE TABLE IF NOT EXISTS cafe_stamp_strips (
      cafe_id    text NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
      filled     integer NOT NULL,
      png        bytea NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (cafe_id, filled)
    );
    -- v1.1: the staff PIN is stored only as a scrypt hash, like a password, so a
    -- database leak can't be replayed at the counter. The old plaintext column
    -- stays (additive migrations only) but is blanked by the backfill below.
    ALTER TABLE cafes ADD COLUMN IF NOT EXISTS staff_pin_hash text NOT NULL DEFAULT '';
    -- Bumped whenever the PIN changes. It is baked into each staff session
    -- cookie, so changing the PIN signs every staff phone out — that's the
    -- break-glass control when a stamper link or PIN gets out.
    ALTER TABLE cafes ADD COLUMN IF NOT EXISTS staff_session_epoch integer NOT NULL DEFAULT 1;
    -- v1.1: value tracking — stamps × average spend gives the owner a money figure.
    -- Cents, not numeric: pg returns numeric as a string, integers as numbers.
    ALTER TABLE cafes ADD COLUMN IF NOT EXISTS average_spend_cents integer NOT NULL DEFAULT 0;
    ALTER TABLE cafes ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'RM';
    -- v1.1: audit trail — who caused each event, and whether a stamp was forced
    -- past the anti-spam cooldown. Empty actor = written before this existed.
    ALTER TABLE events ADD COLUMN IF NOT EXISTS actor text NOT NULL DEFAULT '';
    ALTER TABLE events ADD COLUMN IF NOT EXISTS forced boolean NOT NULL DEFAULT false;
    -- Every "last stamp / last nudge for this card" lookup hits this.
    CREATE INDEX IF NOT EXISTS idx_events_serial_type ON events(serial, type);
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

  // One-time backfill: hash any PIN still sitting in plaintext (including the
  // seed row just inserted), then blank the plaintext so it stops existing.
  // Hashing needs scrypt, so it can't be done in SQL. Runs on every boot but
  // matches nothing once every café is migrated.
  const stale = await getPool().query<{ id: string; staff_pin: string }>(
    `SELECT id, staff_pin FROM cafes WHERE staff_pin_hash = '' AND staff_pin <> ''`,
  );
  for (const row of stale.rows) {
    await getPool().query(`UPDATE cafes SET staff_pin_hash = $2, staff_pin = '' WHERE id = $1`, [
      row.id,
      hashPassword(row.staff_pin),
    ]);
  }
  if (stale.rows.length) console.log(`[migrate] hashed ${stale.rows.length} staff PIN(s)`);
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
    `INSERT INTO cafes (id, name, reward, stamps_target, stamps_start, staff_pin, staff_pin_hash)
     VALUES ($1, $2, $3, $4, $5, '', $6) RETURNING *`,
    [id, row.name, row.reward, row.stampsTarget, row.stampsStart, hashPassword(row.staffPin)],
  );
  return res.rows[0]!;
}

/** Verifies a PIN typed at the counter against the café's stored hash (timing-safe). */
export function verifyStaffPin(cafe: CafeRow, given: string): boolean {
  return verifyPassword(given, cafe.staff_pin_hash);
}

/**
 * Replaces a café's staff PIN. Stores only the hash; the caller shows the PIN
 * once. Bumping the epoch signs every staff phone out, so a changed PIN really
 * does revoke access rather than just changing what new devices must type.
 */
export async function setStaffPin(cafeId: string, pin: string): Promise<void> {
  await getPool().query(
    `UPDATE cafes SET staff_pin_hash = $2, staff_pin = '',
            staff_session_epoch = staff_session_epoch + 1
      WHERE id = $1`,
    [cafeId, hashPassword(pin)],
  );
}

/** A fresh 6-digit PIN — longer than the old 4 digits, still fast to type. */
export function generateStaffPin(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function updateCafe(
  id: string,
  fields: Partial<{
    name: string;
    reward: string;
    stamps_target: number;
    stamps_start: number;
    background_color: string;
    foreground_color: string;
    label_color: string;
    auto_winback_enabled: boolean;
    auto_winback_days: number;
    auto_winback_message: string;
    stamp_style: string;
    average_spend_cents: number;
    currency: string;
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

// ---- stamp strips: one rendered PNG per stamp count (rich stamp grid) ----

/** The strip for a given filled count, clamped by the caller. null ⇒ fall back to text dots. */
export async function getStampStrip(cafeId: string, filled: number): Promise<{ png: Buffer } | null> {
  const res = await getPool().query<{ png: Buffer }>(
    `SELECT png FROM cafe_stamp_strips WHERE cafe_id = $1 AND filled = $2`,
    [cafeId, filled],
  );
  return res.rows[0] ?? null;
}

/** Replaces the whole set of strips for a café in one transaction (all counts change together). */
export async function setStampStrips(
  cafeId: string,
  strips: { filled: number; png: Buffer }[],
): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM cafe_stamp_strips WHERE cafe_id = $1`, [cafeId]);
    for (const s of strips) {
      await client.query(
        `INSERT INTO cafe_stamp_strips (cafe_id, filled, png, updated_at) VALUES ($1, $2, $3, now())`,
        [cafeId, s.filled, s.png],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteStampStrips(cafeId: string): Promise<void> {
  await getPool().query(`DELETE FROM cafe_stamp_strips WHERE cafe_id = $1`, [cafeId]);
}

export async function hasStampStrips(cafeId: string): Promise<boolean> {
  const res = await getPool().query(
    `SELECT 1 FROM cafe_stamp_strips WHERE cafe_id = $1 LIMIT 1`,
    [cafeId],
  );
  return res.rowCount! > 0;
}

/** Max updated_at epoch across a café's strips — feeds Google's ?v= cache-buster. */
export async function stampStripsVersion(cafeId: string): Promise<number> {
  const res = await getPool().query<{ updated_at: Date }>(
    `SELECT max(updated_at) AS updated_at FROM cafe_stamp_strips WHERE cafe_id = $1`,
    [cafeId],
  );
  const row = res.rows[0];
  return row?.updated_at ? new Date(row.updated_at).getTime() : 0;
}

// ------------------------------------------------------- customers / win-back ----

export interface CustomerRow {
  serial: string;
  code: string;
  stamps: number;
  target: number;
  updated_at: Date;
  created_at: Date;
  /** Last real visit = last `stamp` event, falling back to when the card was created. */
  last_visit: Date;
  /** Nudges sent since this card's last visit — how many messages went unanswered. */
  unanswered_nudges: number;
  /** Nudges sent in the last 7 days — gates the "2 per week" limit. */
  nudges_7d: number;
  /** True once the customer deleted the card from their wallet (Apple only). */
  removed: boolean;
}

// ---- shared SQL fragments (both assume the passes table is aliased `p`) ----

// "Last visit" must be the last *stamp*, never passes.updated_at: setMessage()
// bumps updated_at, so measuring lapse off it meant nudging a lapsed customer
// marked them freshly-active — nobody ever appeared to lapse.
const LAST_VISIT_SQL = `COALESCE(
       (SELECT max(e.created_at) FROM events e WHERE e.serial = p.serial AND e.type = 'stamp'),
       p.created_at
     )`;

// A pass row alone proves nothing: it is written on the /enroll hit, before iOS
// even shows the Add sheet, so prefetches, bots and cancelled sheets all left
// permanent "customers". A real customer has been stamped, is sitting in a
// wallet now, or was sitting in one at some point.
//
// That last clause matters: deleting the pass removes the registrations row, and
// without the `pass_added` check someone who joined, got the card, then deleted
// it would silently vanish from the count — the churn would erase its own
// evidence. They stay counted, and show up in the "Deleted the card" cohort.
// Registrations and pass_added are Apple-only, hence the ORs.
const ACTIVE_PASS_SQL = `(
       EXISTS (SELECT 1 FROM events e WHERE e.serial = p.serial AND e.type = 'stamp')
    OR EXISTS (SELECT 1 FROM registrations r WHERE r.serial = p.serial)
    OR EXISTS (SELECT 1 FROM events e WHERE e.serial = p.serial AND e.type = 'pass_added')
     )`;

// Stamps actually given. A staff `undo` corrects a mis-scan, so it has to come
// back off the total — otherwise the headline number overstates real activity.
// Assumes the cafes table is aliased `c`.
const NET_STAMPS_SQL = `(
       SELECT GREATEST(count(*) FILTER (WHERE e.type = 'stamp')
                     - count(*) FILTER (WHERE e.type = 'undo'), 0)::int
         FROM events e WHERE e.cafe_id = c.id
     )`;

// How many nudges have gone out since this card's last visit. Non-zero means we
// messaged someone who then didn't come in — the signal for "stop chasing".
const UNANSWERED_NUDGES_SQL = `(
       SELECT count(*)::int FROM events e
        WHERE e.serial = p.serial AND e.type = 'nudge'
          AND e.created_at > ${LAST_VISIT_SQL}
     )`;

// Nudges in the last 7 days, for the "at most 2 per week" limit. Counted off the
// clock rather than off the last visit, so a customer who came in yesterday still
// can't be messaged three times this week.
const NUDGES_7D_SQL = `(
       SELECT count(*)::int FROM events e
        WHERE e.serial = p.serial AND e.type = 'nudge'
          AND e.created_at > now() - interval '7 days'
     )`;

// The customer deleted the card from their wallet: iOS told us so, and no device
// has since re-registered it (re-adding writes a fresh registrations row, which
// is what makes this recover on its own). Apple-only — see EventType.
const REMOVED_PASS_SQL = `(
       EXISTS (SELECT 1 FROM events e WHERE e.serial = p.serial AND e.type = 'pass_removed')
   AND NOT EXISTS (SELECT 1 FROM registrations r WHERE r.serial = p.serial)
     )`;

const CUSTOMER_COLUMNS_SQL = `p.serial, p.short_code AS code, p.stamp_count AS stamps,
            p.stamps_target AS target, p.updated_at, p.created_at,
            ${LAST_VISIT_SQL} AS last_visit,
            ${UNANSWERED_NUDGES_SQL} AS unanswered_nudges,
            ${NUDGES_7D_SQL} AS nudges_7d,
            ${REMOVED_PASS_SQL} AS removed`;

/**
 * A café's real customers, most-recently-visited first.
 *
 * Defaults to active cards only — the same definition the Home tile counts — so
 * the headline number and the list below it can never disagree again. Passing
 * `false` returns every pass row ever minted, including the ones abandoned at the
 * Add sheet; only the housekeeping/admin paths want that.
 */
export async function cafeCustomers(cafeId: string, activeOnly = true): Promise<CustomerRow[]> {
  const res = await getPool().query<CustomerRow>(
    `SELECT ${CUSTOMER_COLUMNS_SQL}
       FROM passes p
      WHERE p.cafe_id = $1 ${activeOnly ? `AND ${ACTIVE_PASS_SQL}` : ""}
      ORDER BY last_visit DESC`,
    [cafeId],
  );
  return res.rows;
}

export interface CafeCardCounts {
  /** Cards that reached a wallet or were stamped — the number we call "customers". */
  active: number;
  /** Minted but never stamped and never confirmed in a wallet: mostly abandoned Add sheets. */
  issuedNeverAdded: number;
  /** Added to a wallet, then deleted (Apple only). */
  removed: number;
}

/**
 * The three numbers behind the customer count, so the dashboard can explain a
 * gap instead of showing two contradictory totals. `removed` cards are still
 * counted in `active` when they were ever stamped — deleting the pass doesn't
 * un-happen the visits.
 */
export async function cafeCardCounts(cafeId: string): Promise<CafeCardCounts> {
  const res = await getPool().query<{ active: string; never_added: string; removed: string }>(
    `SELECT count(*) FILTER (WHERE ${ACTIVE_PASS_SQL})::text AS active,
            count(*) FILTER (WHERE NOT ${ACTIVE_PASS_SQL}
              AND NOT EXISTS (SELECT 1 FROM events e
                               WHERE e.serial = p.serial AND e.type = 'pass_added'))::text AS never_added,
            count(*) FILTER (WHERE ${REMOVED_PASS_SQL})::text AS removed
       FROM passes p WHERE p.cafe_id = $1`,
    [cafeId],
  );
  const row = res.rows[0];
  return {
    active: Number(row?.active ?? 0),
    issuedNeverAdded: Number(row?.never_added ?? 0),
    removed: Number(row?.removed ?? 0),
  };
}

/** Serials whose card hasn't been stamped in `days` days — the lapsing set. */
export async function lapsingSerials(cafeId: string, days: number): Promise<string[]> {
  const res = await getPool().query<{ serial: string }>(
    `SELECT p.serial FROM passes p
      WHERE p.cafe_id = $1
        AND ${LAST_VISIT_SQL} < now() - ($2 || ' days')::interval`,
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
  /** Real customers (stamped at least once, or confirmed in a wallet). */
  active: number;
  /** Every pass row minted, including ones that never reached a wallet. */
  cards: number;
  stamps: number;
  redemptions: number;
  /** Cards that have been nudged at least once, and how many then came back. */
  nudged: number;
  nudge_returned: number;
  /** Audit counters: stamps confirmed past the cooldown, and corrections made. */
  forced_stamps: number;
  undos: number;
}

/** Every café on the platform with its owner email(s), metrics, and art flags.
 *  Never selects a password or a PIN — only hashes exist and neither is surfaced. */
export async function allCafesWithStats(): Promise<AdminCafeRow[]> {
  const res = await getPool().query<AdminCafeRow>(
    `SELECT c.id, c.name, c.created_at,
            (SELECT string_agg(o.email, ', ' ORDER BY o.email)
               FROM owner_cafes oc JOIN owners o ON o.id = oc.owner_id
              WHERE oc.cafe_id = c.id) AS owners,
            EXISTS (SELECT 1 FROM cafe_logos l WHERE l.cafe_id = c.id) AS has_logo,
            EXISTS (SELECT 1 FROM cafe_banners b WHERE b.cafe_id = c.id) AS has_banner,
            (SELECT count(*)::int FROM passes p
              WHERE p.cafe_id = c.id AND ${ACTIVE_PASS_SQL}) AS active,
            (SELECT count(*)::int FROM passes p WHERE p.cafe_id = c.id) AS cards,
            ${NET_STAMPS_SQL} AS stamps,
            (SELECT count(*)::int FROM events e WHERE e.cafe_id = c.id AND e.type = 'redeem') AS redemptions,
            (SELECT count(*)::int FROM passes p WHERE p.cafe_id = c.id
              AND EXISTS (SELECT 1 FROM events e WHERE e.serial = p.serial AND e.type = 'nudge')) AS nudged,
            (SELECT count(*)::int FROM passes p WHERE p.cafe_id = c.id
              AND EXISTS (SELECT 1 FROM events s WHERE s.serial = p.serial AND s.type = 'stamp'
                            AND s.created_at > (SELECT max(n.created_at) FROM events n
                                                 WHERE n.serial = p.serial AND n.type = 'nudge'))) AS nudge_returned,
            (SELECT count(*)::int FROM events e WHERE e.cafe_id = c.id AND e.forced) AS forced_stamps,
            (SELECT count(*)::int FROM events e WHERE e.cafe_id = c.id AND e.type = 'undo') AS undos
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

/** Store a pending reset token (hashed) with an expiry. Replaces any prior one. */
export async function setResetToken(
  ownerId: string,
  tokenHash: string,
  expires: Date,
): Promise<void> {
  await getPool().query(
    `UPDATE owners SET reset_token_hash = $2, reset_expires = $3 WHERE id = $1`,
    [ownerId, tokenHash, expires],
  );
}

/** Look up an owner by an unexpired reset-token hash (single-use — caller clears it). */
export async function getOwnerByResetToken(tokenHash: string): Promise<OwnerRow | null> {
  const res = await getPool().query<OwnerRow>(
    `SELECT * FROM owners WHERE reset_token_hash = $1 AND reset_expires > now()`,
    [tokenHash],
  );
  return res.rows[0] ?? null;
}

export async function clearResetToken(ownerId: string): Promise<void> {
  await getPool().query(
    `UPDATE owners SET reset_token_hash = NULL, reset_expires = NULL WHERE id = $1`,
    [ownerId],
  );
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

/** Cards for the staff list, most-recently-active first (last stamp, else created)
 *  — newest-enrolled ordering buried the customers staff actually serve. */
export async function listRecentPasses(cafeId: string, limit = 20): Promise<PassRow[]> {
  const res = await getPool().query<PassRow>(
    `SELECT p.* FROM passes p
      WHERE p.cafe_id = $1
      ORDER BY ${LAST_VISIT_SQL} DESC LIMIT $2`,
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
/** Redeeming restarts the card at the café's welcome-stamp count (not 0), so a
 *  loyal returning customer is never worse off than a brand-new one. */
export async function redeemPass(serial: string): Promise<PassRow | null> {
  const res = await getPool().query<PassRow>(
    `UPDATE passes p
        SET stamp_count = LEAST(GREATEST(c.stamps_start, 0), p.stamps_target),
            updated_at  = now()
       FROM cafes c
      WHERE p.serial = $1 AND c.id = p.cafe_id
      RETURNING p.*`,
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

/** When this card was last stamped (for the staff anti-spam cooldown); null if never. */
export async function lastStampAt(serial: string): Promise<Date | null> {
  const res = await getPool().query<{ at: Date }>(
    `SELECT max(created_at) AS at FROM events WHERE serial = $1 AND type = 'stamp'`,
    [serial],
  );
  return res.rows[0]?.at ?? null;
}

/** When this card was last nudged (auto OR manual) — so auto win-back doesn't re-message. */
export async function lastNudgeAt(serial: string): Promise<Date | null> {
  const res = await getPool().query<{ at: Date }>(
    `SELECT max(created_at) AS at FROM events WHERE serial = $1 AND type = 'nudge'`,
    [serial],
  );
  return res.rows[0]?.at ?? null;
}

/** Every café that has opted into automated win-back. */
export async function cafesWithAutoWinback(): Promise<CafeRow[]> {
  const res = await getPool().query<CafeRow>(
    `SELECT * FROM cafes WHERE auto_winback_enabled = true`,
  );
  return res.rows;
}

export async function logEvent(
  cafeId: string,
  serial: string,
  type: EventType,
  meta: EventMeta = {},
): Promise<void> {
  await getPool().query(
    `INSERT INTO events (cafe_id, serial, type, actor, forced) VALUES ($1, $2, $3, $4, $5)`,
    [cafeId, serial, type, meta.actor ?? "", meta.forced === true],
  );
}

/** How many nudges this card has had since its last visit (0 = it answered, or was never nudged). */
export async function unansweredNudges(serial: string): Promise<number> {
  const res = await getPool().query<{ n: number }>(
    `SELECT ${UNANSWERED_NUDGES_SQL} AS n FROM passes p WHERE p.serial = $1`,
    [serial],
  );
  return res.rows[0]?.n ?? 0;
}

/** Everything the nudge limits are decided on. See `canNudge` in winback.ts. */
export interface NudgeState {
  nudges7d: number;
  unanswered: number;
  removed: boolean;
}

/** One round trip for the three numbers that gate a nudge. Unknown serial → null. */
export async function nudgeState(serial: string): Promise<NudgeState | null> {
  const res = await getPool().query<{ nudges_7d: number; unanswered_nudges: number; removed: boolean }>(
    `SELECT ${NUDGES_7D_SQL} AS nudges_7d,
            ${UNANSWERED_NUDGES_SQL} AS unanswered_nudges,
            ${REMOVED_PASS_SQL} AS removed
       FROM passes p WHERE p.serial = $1`,
    [serial],
  );
  const row = res.rows[0];
  if (!row) return null;
  return { nudges7d: row.nudges_7d, unanswered: row.unanswered_nudges, removed: row.removed };
}

export interface NudgeOutcomes {
  /** Nudged, then came in — the win-back worked. */
  returned: number;
  /** Nudged and still hasn't been back. */
  noReturn: number;
  /** Never messaged at all. */
  neverNudged: number;
}

/** Did win-back messages actually bring people back? Per café, all time. */
export async function nudgeOutcomes(cafeId: string): Promise<NudgeOutcomes> {
  const res = await getPool().query<{ returned: number; no_return: number; never_nudged: number }>(
    `WITH x AS (
       SELECT (SELECT max(created_at) FROM events e WHERE e.serial = p.serial AND e.type = 'nudge') AS last_nudge,
              (SELECT max(created_at) FROM events e WHERE e.serial = p.serial AND e.type = 'stamp') AS last_stamp
         FROM passes p WHERE p.cafe_id = $1
     )
     SELECT
       count(*) FILTER (WHERE last_nudge IS NOT NULL AND last_stamp IS NOT NULL AND last_stamp > last_nudge)::int AS returned,
       count(*) FILTER (WHERE last_nudge IS NOT NULL AND (last_stamp IS NULL OR last_stamp <= last_nudge))::int AS no_return,
       count(*) FILTER (WHERE last_nudge IS NULL)::int AS never_nudged
     FROM x`,
    [cafeId],
  );
  const r = res.rows[0];
  return {
    returned: r?.returned ?? 0,
    noReturn: r?.no_return ?? 0,
    neverNudged: r?.never_nudged ?? 0,
  };
}

export interface CafeMetrics {
  /** Real customers: cards that were stamped at least once, or confirmed added to a wallet. */
  active: number;
  /** Every pass row ever minted, including ones that never reached a wallet. */
  cards: number;
  stamps: number;
  redemptions: number;
  stamps30d: number;
  redemptions30d: number;
}

export async function cafeMetrics(cafeId: string): Promise<CafeMetrics> {
  const res = await getPool().query<{
    active: string;
    cards: string;
    stamps: string;
    redemptions: string;
    stamps30d: string;
    redemptions30d: string;
  }>(
    `SELECT
       (SELECT count(*) FROM passes p WHERE p.cafe_id = $1 AND ${ACTIVE_PASS_SQL})::text AS active,
       (SELECT count(*) FROM passes WHERE cafe_id = $1)::text AS cards,
       GREATEST(count(*) FILTER (WHERE type = 'stamp')
              - count(*) FILTER (WHERE type = 'undo'), 0)::text AS stamps,
       count(*) FILTER (WHERE type = 'redeem')::text AS redemptions,
       GREATEST(count(*) FILTER (WHERE type = 'stamp' AND created_at > now() - interval '30 days')
              - count(*) FILTER (WHERE type = 'undo'  AND created_at > now() - interval '30 days'), 0)::text AS "stamps30d",
       count(*) FILTER (WHERE type = 'redeem' AND created_at > now() - interval '30 days')::text AS "redemptions30d"
     FROM events WHERE cafe_id = $1`,
    [cafeId],
  );
  const r = res.rows[0]!;
  return {
    active: Number(r.active),
    cards: Number(r.cards),
    stamps: Number(r.stamps),
    redemptions: Number(r.redemptions),
    stamps30d: Number(r.stamps30d),
    redemptions30d: Number(r.redemptions30d),
  };
}

/** Housekeeping: drop pass rows that never reached a wallet and were never
 *  stamped. 30 days is deliberately generous — Google never reports a wallet
 *  add, so a real un-stamped Android card must not be pruned early.
 *
 *  A card that was added and then deleted is NOT abandoned — it is churn, and
 *  deleting the row would destroy the only evidence we have of it. */
export async function pruneAbandonedPasses(olderThanDays = 30): Promise<number> {
  const res = await getPool().query(
    `DELETE FROM passes p
      WHERE p.created_at < now() - ($1 || ' days')::interval
        AND NOT EXISTS (SELECT 1 FROM events e WHERE e.serial = p.serial AND e.type = 'stamp')
        AND NOT EXISTS (SELECT 1 FROM events e WHERE e.serial = p.serial AND e.type = 'pass_added')
        AND NOT EXISTS (SELECT 1 FROM registrations r WHERE r.serial = p.serial)`,
    [String(Math.max(1, Math.trunc(olderThanDays)))],
  );
  return res.rowCount ?? 0;
}

// --------------------------------------------------------- registrations ----

/**
 * The wallet-add moment. A `pass_added` event is logged on the FIRST registration
 * of a serial only — a refreshed push token is the same card, and a second device
 * (iPad, Watch) is the same customer. Re-adding after a delete does log again, so
 * the event stream reads as a true timeline.
 *
 * The logging lives here rather than in the route so the direct callers (tests,
 * scripts) can't bypass it.
 */
export async function upsertRegistration(
  deviceLibraryId: string,
  serial: string,
  pushToken: string,
): Promise<{ created: boolean }> {
  const had = await getPool().query(
    `SELECT 1 FROM registrations WHERE serial = $1 LIMIT 1`,
    [serial],
  );
  const res = await getPool().query(
    `INSERT INTO registrations (device_library_id, serial, push_token)
     VALUES ($1, $2, $3)
     ON CONFLICT (device_library_id, serial)
     DO UPDATE SET push_token = EXCLUDED.push_token
     RETURNING (xmax = 0) AS created`,
    [deviceLibraryId, serial, pushToken],
  );
  const created = Boolean(res.rows[0]?.created);
  if (created && had.rowCount === 0) {
    await logPassLifecycle(serial, "pass_added");
  }
  return { created };
}

/**
 * The wallet-delete moment — the only hard churn signal either platform gives us,
 * and it arrives exactly once, so it has to be recorded before the row goes.
 * Logged only when the LAST device drops the pass: someone who removes it from an
 * iPad but keeps it on their iPhone has not churned.
 */
export async function deleteRegistration(deviceLibraryId: string, serial: string): Promise<void> {
  const res = await getPool().query(
    `DELETE FROM registrations WHERE device_library_id = $1 AND serial = $2`,
    [deviceLibraryId, serial],
  );
  if (!res.rowCount) return;
  const left = await getPool().query(`SELECT 1 FROM registrations WHERE serial = $1 LIMIT 1`, [serial]);
  if (left.rowCount === 0) await logPassLifecycle(serial, "pass_removed");
}

/** Log an add/remove against the pass's café, skipping silently if the pass is gone. */
async function logPassLifecycle(serial: string, type: EventType): Promise<void> {
  await getPool().query(
    `INSERT INTO events (cafe_id, serial, type, actor)
     SELECT p.cafe_id, p.serial, $2, 'customer' FROM passes p WHERE p.serial = $1`,
    [serial, type],
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
