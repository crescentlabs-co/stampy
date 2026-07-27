/**
 * Postgres access layer.
 *
 *   cards          — one row per café (branding, reward, staff PIN)
 *   owners         — dashboard logins (email + scrypt password hash)
 *   owner_cards    — which owners manage which cafés
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
import { randomInt, randomUUID } from "node:crypto";
import { hashPassword, verifyPassword } from "./auth.js";
import { config, seedCard } from "./config.js";

const { Pool } = pg;

export interface CardRow {
  /**
   * Permanent. It is printed on QR posters, forms the Google class id, and
   * appears in the art URLs inside every issued Android card — see
   * renameCafesToCards for what changing one would do.
   */
  id: string;
  /** The business that runs this card. Null only for the unclaimed seeded card. */
  merchant_id: string | null;
  /** The CARD's name ("Coffee card"), not the shop's — that lives on merchants. */
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
  /**
   * The staff PIN, scrypt-hashed — ONE per owner, covering every card they run.
   * A PIN used to hang off each café row, so an owner with a coffee card and a
   * pastry card had two PINs and two stamper links for one counter. That was an
   * accident of the data model, not a decision.
   */
  staff_pin_hash: string;
  /** Bumped by setOwnerStaffPin; strands every staff cookie the owner ever issued. */
  staff_session_epoch: number;
}

export type Platform = "apple" | "google";

export interface PassRow {
  serial: string;
  card_id: string;
  /** Which person holds it. Null only for a pass on the unclaimed seeded card. */
  customer_id: string | null;
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
  /** Which poster or link they came from, when the join URL carried ?s=. */
  source?: string;
}

/** Default café id — seeded from env on first boot so v0.1 behavior is unchanged. */
export const DEFAULT_CARD_ID = "default";

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

/**
 * v1.3: `cards` becomes `cards`.
 *
 * A row in that table was never a café — it is ONE loyalty programme, and a
 * merchant can run several. Calling it `cards` is what produced a separate staff
 * PIN per card, and a stamper that resolved to another merchant's counter: both
 * bugs read the name and believed it. Every future reader would too.
 *
 * This is the one non-additive migration in the project (see CLAUDE.md). Two
 * things make it safe:
 *
 *  - **The ids do not change.** Today's `cards.id` becomes `cards.id` verbatim.
 *    That id is baked into printed QR posters, into every issued Android card's
 *    Google class id, into the art URLs inside live Google classes, and into
 *    enrolment cookie names. Re-keying would silently stop every Android card
 *    from ever updating again.
 *  - **Postgres DDL is transactional.** The whole rename is one transaction, so
 *    it either fully applies or fully rolls back — there is no half-migrated
 *    state to wake up to.
 *
 * Guarded on the catalogue, so it runs exactly once and a fresh database skips
 * it entirely and creates `cards` directly below.
 */
async function renameCafesToCards(): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const exists = async (t: string) =>
      (await client.query<{ r: string | null }>(`SELECT to_regclass($1) AS r`, [t])).rows[0]?.r != null;
    // NOTE TO ANY FUTURE SEARCH-AND-REPLACE: the legacy names below are DATA,
    // not identifiers to be modernised. Rewriting them turns this into a no-op,
    // and then the schema block underneath creates an EMPTY `cards` table beside
    // the real rows. `pnpm test:migration` exists to catch exactly that.
    const legacy = await exists("cafes");
    const modern = await exists("cards");
    if (legacy && modern) {
      throw new Error(
        "migrate: both `cafes` and `cards` exist — a previous upgrade half-applied. " +
          "Restore the pre-upgrade snapshot rather than letting this continue.",
      );
    }
    if (legacy) {
      await client.query(`
        ALTER TABLE cafes RENAME TO cards;
        ALTER TABLE IF EXISTS passes RENAME COLUMN cafe_id TO card_id;
        ALTER TABLE IF EXISTS events RENAME COLUMN cafe_id TO card_id;
        ALTER TABLE IF EXISTS owner_cafes RENAME TO owner_cards;
        ALTER TABLE IF EXISTS owner_cards RENAME COLUMN cafe_id TO card_id;
        ALTER TABLE IF EXISTS cafe_logos RENAME TO card_logos;
        ALTER TABLE IF EXISTS card_logos RENAME COLUMN cafe_id TO card_id;
        ALTER TABLE IF EXISTS cafe_banners RENAME TO card_banners;
        ALTER TABLE IF EXISTS card_banners RENAME COLUMN cafe_id TO card_id;
        ALTER TABLE IF EXISTS cafe_stamp_strips RENAME TO card_stamp_strips;
        ALTER TABLE IF EXISTS card_stamp_strips RENAME COLUMN cafe_id TO card_id;
        ALTER INDEX IF EXISTS idx_passes_cafe RENAME TO idx_passes_card;
        ALTER INDEX IF EXISTS idx_events_cafe_time RENAME TO idx_events_card_time;
      `);
      console.log("[migrate] renamed cafes → cards (every id unchanged)");
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function migrate(): Promise<void> {
  // Must run before anything else: everything below is written in the new names.
  await renameCafesToCards();
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS cards (
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
    CREATE TABLE IF NOT EXISTS owner_cards (
      owner_id text NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
      card_id  text NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      PRIMARY KEY (owner_id, card_id)
    );
    CREATE TABLE IF NOT EXISTS passes (
      serial        text PRIMARY KEY,
      card_id       text NOT NULL REFERENCES cards(id),
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
    CREATE INDEX IF NOT EXISTS idx_passes_card ON passes(card_id);
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
      card_id    text NOT NULL REFERENCES cards(id),
      serial     text NOT NULL,
      type       text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_events_card_time ON events(card_id, created_at);
    -- v0.3: pre-existing deployments get the platform column added in place.
    ALTER TABLE passes ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'apple';
    -- v0.4: per-card uploaded logos. Bytes live in Postgres (Railway's disk is
    -- ephemeral) and in their own table so SELECTs on cards stay lightweight.
    CREATE TABLE IF NOT EXISTS card_logos (
      card_id    text PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
      png        bytea NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    -- v0.7: optional per-card banner image (Apple strip.png / Google heroImage).
    CREATE TABLE IF NOT EXISTS card_banners (
      card_id    text PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
      png        bytea NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    -- v0.8: self-serve password reset. The token is single-use and stored only
    -- as a hash (like a password), so a DB leak can't be replayed to reset.
    ALTER TABLE owners ADD COLUMN IF NOT EXISTS reset_token_hash text;
    ALTER TABLE owners ADD COLUMN IF NOT EXISTS reset_expires timestamptz;
    -- v0.9: opt-in automated win-back — a background job messages customers who
    -- haven't stamped in N days. Off by default so behaviour is unchanged.
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS auto_winback_enabled boolean NOT NULL DEFAULT false;
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS auto_winback_days integer NOT NULL DEFAULT 14;
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS auto_winback_message text NOT NULL DEFAULT 'We miss you! Your next stamp is waiting ☕️';
    -- v1.0: rich rendered stamp grid. The owner's browser renders one strip PNG
    -- per stamp count (0..target); Apple uses it as the strip image, Google as
    -- the hero image. Bytes live in Postgres (ephemeral disk) keyed by count.
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS stamp_style text NOT NULL DEFAULT '';
    CREATE TABLE IF NOT EXISTS card_stamp_strips (
      card_id    text NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      filled     integer NOT NULL,
      png        bytea NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (card_id, filled)
    );
    -- v1.1: the staff PIN is stored only as a scrypt hash, like a password, so a
    -- database leak can't be replayed at the counter. The old plaintext column
    -- stays (additive migrations only) but is blanked by the backfill below.
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS staff_pin_hash text NOT NULL DEFAULT '';
    -- Bumped whenever the PIN changes. It is baked into each staff session
    -- cookie, so changing the PIN signs every staff phone out — that's the
    -- break-glass control when a stamper link or PIN gets out.
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS staff_session_epoch integer NOT NULL DEFAULT 1;
    -- v1.1: value tracking — stamps × average spend gives the owner a money figure.
    -- Cents, not numeric: pg returns numeric as a string, integers as numbers.
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS average_spend_cents integer NOT NULL DEFAULT 0;
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'RM';
    -- v1.1: audit trail — who caused each event, and whether a stamp was forced
    -- past the anti-spam cooldown. Empty actor = written before this existed.
    ALTER TABLE events ADD COLUMN IF NOT EXISTS actor text NOT NULL DEFAULT '';
    ALTER TABLE events ADD COLUMN IF NOT EXISTS forced boolean NOT NULL DEFAULT false;
    -- Every "last stamp / last nudge for this card" lookup hits this.
    CREATE INDEX IF NOT EXISTS idx_events_serial_type ON events(serial, type);
    -- v1.2: the staff PIN moves up to the OWNER. One counter, one PIN, one
    -- stamper link, however many cards they run — the per-café PIN was an
    -- accident of "+ Add card" creating a whole new card row. The cards columns
    -- stay (additive only) but are no longer read; the backfill below lifts each
    -- owner's existing PIN up so nobody has to be told a new one.
    ALTER TABLE owners ADD COLUMN IF NOT EXISTS staff_pin_hash text NOT NULL DEFAULT '';
    ALTER TABLE owners ADD COLUMN IF NOT EXISTS staff_session_epoch integer NOT NULL DEFAULT 1;
    -- v1.2: one row per owner sign-in. "Do they ever open the dashboard?" was
    -- unanswerable — nothing recorded it at all. Kept out of the events table,
    -- which is per-card; a login isn't about any one card.
    CREATE TABLE IF NOT EXISTS owner_logins (
      owner_id   text NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_owner_logins ON owner_logins(owner_id, created_at DESC);
    -- v1.2: reusable card designs. The sales flow is "we mock a card up for a
    -- prospect, they sign up, we push the design onto their card" — so a design
    -- has to exist before the café that will wear it. Stamp strips are NOT
    -- stored: they depend on the target's stamp count, and are re-rendered in
    -- the browser at apply time, the same way the done-for-you flow does it.
    CREATE TABLE IF NOT EXISTS design_templates (
      id          text PRIMARY KEY,
      name        text NOT NULL,
      reward      text NOT NULL DEFAULT 'Free reward',
      bg          text NOT NULL DEFAULT 'rgb(59,32,22)',
      fg          text NOT NULL DEFAULT 'rgb(255,250,240)',
      label_color text NOT NULL DEFAULT 'rgb(214,178,120)',
      stamp_style text NOT NULL DEFAULT '',
      logo        bytea,
      banner      bytea,
      created_at  timestamptz NOT NULL DEFAULT now()
    );
    -- v1.3: the BUSINESS, finally distinct from the card it runs. One merchant
    -- per login for now; the unique index is what enforces that, and dropping it
    -- is how you'd allow several later.
    CREATE TABLE IF NOT EXISTS merchants (
      id                  text PRIMARY KEY,
      owner_id            text NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
      name                text NOT NULL,
      default_card_id     text,
      average_spend_cents integer NOT NULL DEFAULT 0,
      currency            text NOT NULL DEFAULT 'RM',
      created_at          timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_merchants_owner ON merchants(owner_id);
    -- Rows are only ever ADDED. A merchant who renames keeps their old slug
    -- resolving forever, because it may be printed on a poster or an NFC tag
    -- that nobody is going to reprint.
    CREATE TABLE IF NOT EXISTS merchant_slugs (
      slug        text PRIMARY KEY,
      merchant_id text NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      created_at  timestamptz NOT NULL DEFAULT now()
    );
    -- v1.3: a person, scoped to one merchant. Deliberately holds NO name, email
    -- or phone — the privacy page promises exactly that, and the identity comes
    -- from a signed cookie instead. That means it identifies a BROWSER, not a
    -- human: a new phone reads as a new customer and there is no fixing that
    -- without asking for something we have promised not to ask for.
    CREATE TABLE IF NOT EXISTS customers (
      id          text PRIMARY KEY,
      merchant_id text NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      created_at  timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_customers_merchant ON customers(merchant_id);
    -- Nullable: the env-seeded default card has no owner, so no merchant, until
    -- somebody signs up and claims it.
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS merchant_id text REFERENCES merchants(id);
    ALTER TABLE passes ADD COLUMN IF NOT EXISTS customer_id text REFERENCES customers(id);
    CREATE INDEX IF NOT EXISTS idx_passes_customer ON passes(customer_id);
    -- Which poster/link they scanned, when the join URL carries ?s=. Recorded
    -- now so the history exists; nothing reports on it yet.
    ALTER TABLE events ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT '';
  `);

  // Seed the default card from env vars on first boot (v0.1 compatibility).
  await getPool().query(
    `INSERT INTO cards (id, name, reward, stamps_target, stamps_start, staff_pin)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO NOTHING`,
    [
      DEFAULT_CARD_ID,
      seedCard.name,
      seedCard.reward,
      seedCard.stampsTarget,
      seedCard.stampsStart,
      config.staffPin,
    ],
  );

  // One-time backfill: hash any PIN still sitting in plaintext (including the
  // seed row just inserted), then blank the plaintext so it stops existing.
  // Hashing needs scrypt, so it can't be done in SQL. Runs on every boot but
  // matches nothing once every card is migrated.
  const stale = await getPool().query<{ id: string; staff_pin: string }>(
    `SELECT id, staff_pin FROM cards WHERE staff_pin_hash = '' AND staff_pin <> ''`,
  );
  for (const row of stale.rows) {
    await getPool().query(`UPDATE cards SET staff_pin_hash = $2, staff_pin = '' WHERE id = $1`, [
      row.id,
      hashPassword(row.staff_pin),
    ]);
  }
  if (stale.rows.length) console.log(`[migrate] hashed ${stale.rows.length} staff PIN(s)`);

  // Lift each owner's PIN up from their oldest card, so an existing counter
  // keeps working with the PIN it already knows. Owners with several cards had
  // several PINs; the first card's wins, and the others simply stop being read.
  const lifted = await getPool().query(
    `UPDATE owners o
        SET staff_pin_hash = c.staff_pin_hash
       FROM (SELECT DISTINCT ON (oc.owner_id) oc.owner_id, ca.staff_pin_hash
               FROM owner_cards oc JOIN cards ca ON ca.id = oc.card_id
              WHERE ca.staff_pin_hash <> ''
              ORDER BY oc.owner_id, ca.created_at) c
      WHERE c.owner_id = o.id AND o.staff_pin_hash = ''`,
  );
  if (lifted.rowCount) console.log(`[migrate] moved ${lifted.rowCount} staff PIN(s) to the owner`);

  await backfillMerchants();
  await backfillCustomers();
}

/**
 * v1.3: give every existing owner a merchant, and hang their cards off it.
 *
 * The business name and its money settings come from the owner's OLDEST card,
 * because that is the row that was doubling as the business until now. Runs on
 * every boot and matches nothing once everyone has one.
 */
async function backfillMerchants(): Promise<void> {
  const orphans = await getPool().query<{
    owner_id: string;
    name: string | null;
    average_spend_cents: number | null;
    currency: string | null;
  }>(
    `SELECT o.id AS owner_id, c.name, c.average_spend_cents, c.currency
       FROM owners o
       LEFT JOIN LATERAL (
         SELECT ca.name, ca.average_spend_cents, ca.currency
           FROM owner_cards oc JOIN cards ca ON ca.id = oc.card_id
          WHERE oc.owner_id = o.id
          ORDER BY ca.created_at LIMIT 1
       ) c ON true
      WHERE NOT EXISTS (SELECT 1 FROM merchants m WHERE m.owner_id = o.id)`,
  );
  for (const row of orphans.rows) {
    const id = generateShortCode(8).toLowerCase();
    const name = row.name?.trim() || "My shop";
    await getPool().query(
      `INSERT INTO merchants (id, owner_id, name, average_spend_cents, currency)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, row.owner_id, name, row.average_spend_cents ?? 0, row.currency ?? "RM"],
    );
    await claimSlug(id, name);
  }
  // Attach cards to their owner's merchant. Left alone if a card has no owner —
  // that is the env-seeded default card before anyone has signed up.
  const linked = await getPool().query(
    `UPDATE cards c SET merchant_id = m.id
       FROM owner_cards oc JOIN merchants m ON m.owner_id = oc.owner_id
      WHERE oc.card_id = c.id AND c.merchant_id IS NULL`,
  );
  if (orphans.rows.length) {
    console.log(`[migrate] created ${orphans.rows.length} merchant(s), linked ${linked.rowCount} card(s)`);
  }
}

/**
 * v1.3: every existing pass gets a customer.
 *
 * The id is derived from the serial rather than random, which makes this
 * idempotent and lets it run as one statement instead of a loop over every pass.
 *
 * One customer per PASS, not per person: someone who already holds an Apple and
 * a Google card at the same shop becomes two customers here. There is no signal
 * in the data to do better retroactively — the cookie that could have linked
 * them was scoped per card and per platform. From now on it links them.
 */
async function backfillCustomers(): Promise<void> {
  const res = await getPool().query(
    `WITH need AS (
       SELECT p.serial, c.merchant_id, p.created_at,
              md5(p.serial || ':customer') AS cid
         FROM passes p JOIN cards c ON c.id = p.card_id
        WHERE p.customer_id IS NULL AND c.merchant_id IS NOT NULL
     ), ins AS (
       INSERT INTO customers (id, merchant_id, created_at)
       SELECT cid, merchant_id, created_at FROM need
       ON CONFLICT (id) DO NOTHING
       RETURNING id
     )
     UPDATE passes p SET customer_id = n.cid FROM need n WHERE p.serial = n.serial`,
  );
  if (res.rowCount) console.log(`[migrate] gave ${res.rowCount} pass(es) a customer`);
}

// ------------------------------------------------------------- merchants ----

export interface MerchantRow {
  id: string;
  owner_id: string;
  /** The BUSINESS name — this is what customers see as the pass issuer. */
  name: string;
  /** Which card a bare /j/ link issues. Null = the merchant's only card. */
  default_card_id: string | null;
  average_spend_cents: number;
  currency: string;
  created_at: Date;
}

export interface CustomerRecord {
  id: string;
  merchant_id: string;
  created_at: Date;
}

/** A readable URL fragment. Never trusted to be unique — `claimSlug` settles that. */
function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
  return s || "shop";
}

/**
 * Reserve a readable alias for a merchant. Slugs are only ever ADDED — a merchant
 * who renames keeps every older slug pointing at them, because one of them may be
 * printed on a poster or written to an NFC tag that nobody is going to redo.
 * Returns the slug actually taken, which may carry a numeric suffix.
 */
export async function claimSlug(merchantId: string, name: string): Promise<string> {
  const base = slugify(name);
  for (let n = 1; n <= 50; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const taken = await getPool().query<{ merchant_id: string }>(
      `INSERT INTO merchant_slugs (slug, merchant_id) VALUES ($1, $2)
       ON CONFLICT (slug) DO NOTHING
       RETURNING merchant_id`,
      [slug, merchantId],
    );
    if (taken.rowCount) return slug;
    const mine = await getPool().query(
      `SELECT 1 FROM merchant_slugs WHERE slug = $1 AND merchant_id = $2`,
      [slug, merchantId],
    );
    if (mine.rowCount) return slug; // already ours from an earlier boot
  }
  return merchantId; // absurd collision count — the id always works as a fallback
}

export async function getMerchant(id: string): Promise<MerchantRow | null> {
  const res = await getPool().query<MerchantRow>(`SELECT * FROM merchants WHERE id = $1`, [id]);
  return res.rows[0] ?? null;
}

/**
 * Resolve whatever was in a /j/ link: the merchant's permanent id, or any slug it
 * has ever held. `viaSlug` tells the route whether to redirect to the canonical
 * form, so a retired name still works but doesn't linger in the address bar.
 */
export async function getMerchantByRef(
  ref: string,
): Promise<{ merchant: MerchantRow; viaSlug: boolean } | null> {
  const direct = await getMerchant(ref);
  if (direct) return { merchant: direct, viaSlug: false };
  const res = await getPool().query<MerchantRow>(
    `SELECT m.* FROM merchants m JOIN merchant_slugs s ON s.merchant_id = m.id WHERE s.slug = $1`,
    [ref.toLowerCase()],
  );
  return res.rows[0] ? { merchant: res.rows[0], viaSlug: true } : null;
}

export async function merchantForOwner(ownerId: string): Promise<MerchantRow | null> {
  const res = await getPool().query<MerchantRow>(
    `SELECT * FROM merchants WHERE owner_id = $1`,
    [ownerId],
  );
  return res.rows[0] ?? null;
}

/** The merchant that runs this card. Null only for the unclaimed seeded card. */
export async function merchantForCard(cardId: string): Promise<MerchantRow | null> {
  const res = await getPool().query<MerchantRow>(
    `SELECT m.* FROM merchants m JOIN cards c ON c.merchant_id = m.id WHERE c.id = $1`,
    [cardId],
  );
  return res.rows[0] ?? null;
}

/** Create the merchant for a brand-new owner, with its first slug. Idempotent. */
export async function ensureMerchantForOwner(ownerId: string, name: string): Promise<MerchantRow> {
  const existing = await merchantForOwner(ownerId);
  if (existing) return existing;
  const id = generateShortCode(8).toLowerCase();
  const clean = name.trim().slice(0, 60) || "My shop";
  const res = await getPool().query<MerchantRow>(
    `INSERT INTO merchants (id, owner_id, name) VALUES ($1, $2, $3) RETURNING *`,
    [id, ownerId, clean],
  );
  await claimSlug(id, clean);
  return res.rows[0]!;
}

export async function updateMerchant(
  id: string,
  fields: Partial<Pick<MerchantRow, "name" | "default_card_id" | "average_spend_cents" | "currency">>,
): Promise<MerchantRow | null> {
  const keys = Object.keys(fields) as (keyof typeof fields)[];
  if (!keys.length) return getMerchant(id);
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  const res = await getPool().query<MerchantRow>(
    `UPDATE merchants SET ${sets} WHERE id = $1 RETURNING *`,
    [id, ...keys.map((k) => fields[k])],
  );
  // A rename must not orphan a printed poster, so the new name gets a slug too
  // and every previous one keeps resolving.
  if (res.rows[0] && fields.name) await claimSlug(id, fields.name);
  return res.rows[0] ?? null;
}

export async function cardsForMerchant(merchantId: string): Promise<CardRow[]> {
  const res = await getPool().query<CardRow>(
    `SELECT * FROM cards WHERE merchant_id = $1 ORDER BY created_at`,
    [merchantId],
  );
  return res.rows;
}

/**
 * Which card a /j/ link should issue: the merchant's explicit choice, else their
 * only card. Null when they somehow have none, or several with no default set —
 * the route renders a picker for that, which V1 can never reach.
 */
export async function joinTargetCard(merchant: MerchantRow): Promise<CardRow | null> {
  const cards = await cardsForMerchant(merchant.id);
  if (merchant.default_card_id) {
    const chosen = cards.find((c) => c.id === merchant.default_card_id);
    if (chosen) return chosen;
  }
  return cards.length === 1 ? cards[0]! : null;
}

// ------------------------------------------------------------- customers ----

/** A person at one merchant. Holds no PII — see the customers table comment. */
export async function createCustomer(merchantId: string): Promise<CustomerRecord> {
  const res = await getPool().query<CustomerRecord>(
    `INSERT INTO customers (id, merchant_id) VALUES ($1, $2) RETURNING *`,
    [randomUUID(), merchantId],
  );
  return res.rows[0]!;
}

export async function getCustomer(id: string): Promise<CustomerRecord | null> {
  const res = await getPool().query<CustomerRecord>(`SELECT * FROM customers WHERE id = $1`, [id]);
  return res.rows[0] ?? null;
}

/**
 * Which customer a browser is, given whatever cookies it turned up with.
 *
 * The policy lives here rather than in the route so it can actually be tested:
 * the join routes can't be exercised without Apple/Google credentials, and the
 * legacy branch below is the single most expensive thing in v1.3 to get wrong.
 *
 * `writeCookie` tells the caller to (re)issue the current cookie — true when a
 * legacy customer was adopted or a new one created.
 */
export async function resolveCustomer(
  merchantId: string,
  cookieCustomerId: string | null,
  legacySerial: string | null,
): Promise<{ customer: CustomerRecord; writeCookie: boolean }> {
  if (cookieCustomerId) {
    const found = await getCustomer(cookieCustomerId);
    if (found && found.merchant_id === merchantId) return { customer: found, writeCookie: false };
  }
  // Pre-v1.3 browsers hold a per-card cookie naming a serial. Follow it back to
  // the customer that pass was backfilled onto, or they get a duplicate card.
  if (legacySerial) {
    const pass = await getPass(legacySerial);
    if (pass?.customer_id) {
      const adopted = await getCustomer(pass.customer_id);
      if (adopted && adopted.merchant_id === merchantId) return { customer: adopted, writeCookie: true };
    }
  }
  return { customer: await createCustomer(merchantId), writeCookie: true };
}

/** This customer's pass for a given card and platform, if they already have one. */
export async function passForCustomer(
  customerId: string,
  cardId: string,
  platform: Platform,
): Promise<PassRow | null> {
  const res = await getPool().query<PassRow>(
    `SELECT * FROM passes WHERE customer_id = $1 AND card_id = $2 AND platform = $3 LIMIT 1`,
    [customerId, cardId, platform],
  );
  return res.rows[0] ?? null;
}

// ----------------------------------------------------------------- cards ----

/** Human-typeable code alphabet — no 0/O/1/I/L confusion. */
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function generateShortCode(length = 6): string {
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}

export async function getCard(id: string): Promise<CardRow | null> {
  const res = await getPool().query<CardRow>(`SELECT * FROM cards WHERE id = $1`, [id]);
  return res.rows[0] ?? null;
}

/** A card. The staff PIN is NOT set here — it belongs to the owner (setStaffPin). */
export async function createCard(row: {
  merchantId: string;
  name: string;
  reward: string;
  stampsTarget: number;
  stampsStart: number;
}): Promise<CardRow> {
  // The id is generated here and then never changes: it is printed on posters,
  // baked into every issued Android card's Google class id, and used in the art
  // URLs inside live Google classes. See renameCafesToCards.
  const id = generateShortCode(8).toLowerCase();
  const res = await getPool().query<CardRow>(
    `INSERT INTO cards (id, merchant_id, name, reward, stamps_target, stamps_start, staff_pin, staff_pin_hash)
     VALUES ($1, $2, $3, $4, $5, $6, '', '') RETURNING *`,
    [id, row.merchantId, row.name, row.reward, row.stampsTarget, row.stampsStart],
  );
  return res.rows[0]!;
}

/** Verifies a PIN typed at the counter against the owner's stored hash (timing-safe). */
export function verifyStaffPin(owner: OwnerRow, given: string): boolean {
  return verifyPassword(given, owner.staff_pin_hash);
}

/**
 * Replaces an owner's staff PIN — the one PIN for every card they run. Stores
 * only the hash; the caller shows the PIN once. Bumping the epoch signs every
 * staff phone out across every card, so a changed PIN really does revoke access
 * rather than just changing what new devices must type.
 */
export async function setStaffPin(ownerId: string, pin: string): Promise<void> {
  await getPool().query(
    `UPDATE owners SET staff_pin_hash = $2,
            staff_session_epoch = staff_session_epoch + 1
      WHERE id = $1`,
    [ownerId, hashPassword(pin)],
  );
}

/**
 * Who runs this card. The staff session belongs to the owner, not the café, so
 * every staff request resolves this first. Null means an orphaned café (only
 * possible for the env-seeded default before anyone signs up).
 */
export async function ownerForCard(cardId: string): Promise<OwnerRow | null> {
  const res = await getPool().query<OwnerRow>(
    `SELECT o.* FROM owners o
       JOIN owner_cards oc ON oc.owner_id = o.id
      WHERE oc.card_id = $1
      ORDER BY o.created_at LIMIT 1`,
    [cardId],
  );
  return res.rows[0] ?? null;
}

/** A fresh 6-digit PIN — longer than the old 4 digits, still fast to type. */
export function generateStaffPin(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function updateCard(
  id: string,
  fields: Partial<{
    merchant_id: string;
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
): Promise<CardRow | null> {
  const keys = Object.keys(fields) as (keyof typeof fields)[];
  if (!keys.length) return getCard(id);
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  const res = await getPool().query<CardRow>(
    `UPDATE cards SET ${sets} WHERE id = $1 RETURNING *`,
    [id, ...keys.map((k) => fields[k])],
  );
  return res.rows[0] ?? null;
}

// ----------------------------------------------------------- café logos ----

export async function getCardLogo(
  cardId: string,
): Promise<{ png: Buffer; updated_at: Date } | null> {
  const res = await getPool().query<{ png: Buffer; updated_at: Date }>(
    `SELECT png, updated_at FROM card_logos WHERE card_id = $1`,
    [cardId],
  );
  return res.rows[0] ?? null;
}

export async function setCardLogo(cardId: string, png: Buffer): Promise<void> {
  await getPool().query(
    `INSERT INTO card_logos (card_id, png, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (card_id) DO UPDATE SET png = EXCLUDED.png, updated_at = now()`,
    [cardId, png],
  );
}

export async function deleteCardLogo(cardId: string): Promise<void> {
  await getPool().query(`DELETE FROM card_logos WHERE card_id = $1`, [cardId]);
}

/** Epoch-ms of the logo's last change, or 0 when none — used to cache-bust Google's fetch. */
export async function cafeLogoVersion(cardId: string): Promise<number> {
  const res = await getPool().query<{ updated_at: Date }>(
    `SELECT updated_at FROM card_logos WHERE card_id = $1`,
    [cardId],
  );
  const row = res.rows[0];
  return row ? new Date(row.updated_at).getTime() : 0;
}

// Banner image (optional): Apple strip.png / Google heroImage. Same shape as logos.
export async function getCardBanner(cardId: string): Promise<{ png: Buffer } | null> {
  const res = await getPool().query<{ png: Buffer }>(
    `SELECT png FROM card_banners WHERE card_id = $1`,
    [cardId],
  );
  return res.rows[0] ?? null;
}

export async function setCardBanner(cardId: string, png: Buffer): Promise<void> {
  await getPool().query(
    `INSERT INTO card_banners (card_id, png, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (card_id) DO UPDATE SET png = EXCLUDED.png, updated_at = now()`,
    [cardId, png],
  );
}

export async function deleteCardBanner(cardId: string): Promise<void> {
  await getPool().query(`DELETE FROM card_banners WHERE card_id = $1`, [cardId]);
}

export async function cafeBannerVersion(cardId: string): Promise<number> {
  const res = await getPool().query<{ updated_at: Date }>(
    `SELECT updated_at FROM card_banners WHERE card_id = $1`,
    [cardId],
  );
  const row = res.rows[0];
  return row ? new Date(row.updated_at).getTime() : 0;
}

// ---- stamp strips: one rendered PNG per stamp count (rich stamp grid) ----

/** The strip for a given filled count, clamped by the caller. null ⇒ fall back to text dots. */
export async function getStampStrip(cardId: string, filled: number): Promise<{ png: Buffer } | null> {
  const res = await getPool().query<{ png: Buffer }>(
    `SELECT png FROM card_stamp_strips WHERE card_id = $1 AND filled = $2`,
    [cardId, filled],
  );
  return res.rows[0] ?? null;
}

/** Replaces the whole set of strips for a café in one transaction (all counts change together). */
export async function setStampStrips(
  cardId: string,
  strips: { filled: number; png: Buffer }[],
): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM card_stamp_strips WHERE card_id = $1`, [cardId]);
    for (const s of strips) {
      await client.query(
        `INSERT INTO card_stamp_strips (card_id, filled, png, updated_at) VALUES ($1, $2, $3, now())`,
        [cardId, s.filled, s.png],
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

export async function deleteStampStrips(cardId: string): Promise<void> {
  await getPool().query(`DELETE FROM card_stamp_strips WHERE card_id = $1`, [cardId]);
}

export async function hasStampStrips(cardId: string): Promise<boolean> {
  const res = await getPool().query(
    `SELECT 1 FROM card_stamp_strips WHERE card_id = $1 LIMIT 1`,
    [cardId],
  );
  return res.rowCount! > 0;
}

/** Max updated_at epoch across a café's strips — feeds Google's ?v= cache-buster. */
export async function stampStripsVersion(cardId: string): Promise<number> {
  const res = await getPool().query<{ updated_at: Date }>(
    `SELECT max(updated_at) AS updated_at FROM card_stamp_strips WHERE card_id = $1`,
    [cardId],
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
// Assumes the cards table is aliased `c`.
const NET_STAMPS_SQL = `(
       SELECT GREATEST(count(*) FILTER (WHERE e.type = 'stamp')
                     - count(*) FILTER (WHERE e.type = 'undo'), 0)::int
         FROM events e WHERE e.card_id = c.id
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
export async function cardCustomers(cardId: string, activeOnly = true): Promise<CustomerRow[]> {
  const res = await getPool().query<CustomerRow>(
    `SELECT ${CUSTOMER_COLUMNS_SQL}
       FROM passes p
      WHERE p.card_id = $1 ${activeOnly ? `AND ${ACTIVE_PASS_SQL}` : ""}
      ORDER BY last_visit DESC`,
    [cardId],
  );
  return res.rows;
}

export interface CardCounts {
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
export async function cardCounts(cardId: string): Promise<CardCounts> {
  const res = await getPool().query<{ active: string; never_added: string; removed: string }>(
    `SELECT count(*) FILTER (WHERE ${ACTIVE_PASS_SQL})::text AS active,
            count(*) FILTER (WHERE NOT ${ACTIVE_PASS_SQL}
              AND NOT EXISTS (SELECT 1 FROM events e
                               WHERE e.serial = p.serial AND e.type = 'pass_added'))::text AS never_added,
            count(*) FILTER (WHERE ${REMOVED_PASS_SQL})::text AS removed
       FROM passes p WHERE p.card_id = $1`,
    [cardId],
  );
  const row = res.rows[0];
  return {
    active: Number(row?.active ?? 0),
    issuedNeverAdded: Number(row?.never_added ?? 0),
    removed: Number(row?.removed ?? 0),
  };
}

/** Serials whose card hasn't been stamped in `days` days — the lapsing set. */
export async function lapsingSerials(cardId: string, days: number): Promise<string[]> {
  const res = await getPool().query<{ serial: string }>(
    `SELECT p.serial FROM passes p
      WHERE p.card_id = $1
        AND ${LAST_VISIT_SQL} < now() - ($2 || ' days')::interval`,
    [cardId, String(Math.max(0, Math.trunc(days)))],
  );
  return res.rows.map((r) => r.serial);
}

// ----------------------------------------------------------------- admin ----

export interface AdminCardRow {
  id: string;
  name: string;
  owners: string | null;
  created_at: Date;
  /** Needed to re-render a template's stamp strips for THIS card. */
  stamps_target: number;
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
  /** Is this café alive? Nulls mean it has never been stamped / never signed in. */
  last_stamp_at: Date | null;
  last_owner_login: Date | null;
  stamps_7d: number;
  stamps_30d: number;
  /** Cards confirmed in a wallet, deleted from one, and never seen in one (Apple-only signals). */
  added: number;
  removed: number;
  never_added: number;
  /** Customers with a stamp in the last 7 / 30 days. */
  active_7d: number;
  active_30d: number;
}

/** Every café on the platform with its owner email(s), metrics, and art flags.
 *  Never selects a password or a PIN — only hashes exist and neither is surfaced. */
export async function allCardsWithStats(): Promise<AdminCardRow[]> {
  const res = await getPool().query<AdminCardRow>(
    `SELECT c.id, c.name, c.created_at, c.stamps_target,
            (SELECT string_agg(o.email, ', ' ORDER BY o.email)
               FROM owner_cards oc JOIN owners o ON o.id = oc.owner_id
              WHERE oc.card_id = c.id) AS owners,
            EXISTS (SELECT 1 FROM card_logos l WHERE l.card_id = c.id) AS has_logo,
            EXISTS (SELECT 1 FROM card_banners b WHERE b.card_id = c.id) AS has_banner,
            (SELECT count(*)::int FROM passes p
              WHERE p.card_id = c.id AND ${ACTIVE_PASS_SQL}) AS active,
            (SELECT count(*)::int FROM passes p WHERE p.card_id = c.id) AS cards,
            ${NET_STAMPS_SQL} AS stamps,
            (SELECT count(*)::int FROM events e WHERE e.card_id = c.id AND e.type = 'redeem') AS redemptions,
            (SELECT count(*)::int FROM passes p WHERE p.card_id = c.id
              AND EXISTS (SELECT 1 FROM events e WHERE e.serial = p.serial AND e.type = 'nudge')) AS nudged,
            (SELECT count(*)::int FROM passes p WHERE p.card_id = c.id
              AND EXISTS (SELECT 1 FROM events s WHERE s.serial = p.serial AND s.type = 'stamp'
                            AND s.created_at > (SELECT max(n.created_at) FROM events n
                                                 WHERE n.serial = p.serial AND n.type = 'nudge'))) AS nudge_returned,
            (SELECT count(*)::int FROM events e WHERE e.card_id = c.id AND e.forced) AS forced_stamps,
            (SELECT count(*)::int FROM events e WHERE e.card_id = c.id AND e.type = 'undo') AS undos,
            (SELECT max(e.created_at) FROM events e WHERE e.card_id = c.id AND e.type = 'stamp') AS last_stamp_at,
            (SELECT max(l.created_at) FROM owner_logins l
               JOIN owner_cards oc ON oc.owner_id = l.owner_id
              WHERE oc.card_id = c.id) AS last_owner_login,
            (SELECT count(*)::int FROM events e WHERE e.card_id = c.id AND e.type = 'stamp'
               AND e.created_at > now() - interval '7 days') AS stamps_7d,
            (SELECT count(*)::int FROM events e WHERE e.card_id = c.id AND e.type = 'stamp'
               AND e.created_at > now() - interval '30 days') AS stamps_30d,
            (SELECT count(*)::int FROM passes p WHERE p.card_id = c.id
               AND EXISTS (SELECT 1 FROM events e WHERE e.serial = p.serial AND e.type = 'pass_added')) AS added,
            (SELECT count(*)::int FROM passes p WHERE p.card_id = c.id AND ${REMOVED_PASS_SQL}) AS removed,
            (SELECT count(*)::int FROM passes p WHERE p.card_id = c.id AND NOT ${ACTIVE_PASS_SQL}
               AND NOT EXISTS (SELECT 1 FROM events e
                                WHERE e.serial = p.serial AND e.type = 'pass_added')) AS never_added,
            (SELECT count(*)::int FROM passes p WHERE p.card_id = c.id
               AND ${LAST_VISIT_SQL} > now() - interval '7 days'
               AND EXISTS (SELECT 1 FROM events e WHERE e.serial = p.serial AND e.type = 'stamp')) AS active_7d,
            (SELECT count(*)::int FROM passes p WHERE p.card_id = c.id
               AND ${LAST_VISIT_SQL} > now() - interval '30 days'
               AND EXISTS (SELECT 1 FROM events e WHERE e.serial = p.serial AND e.type = 'stamp')) AS active_30d
       FROM cards c
      ORDER BY c.created_at DESC`,
  );
  return res.rows;
}

// ------------------------------------------------------- design templates ----

export interface DesignTemplateRow {
  id: string;
  name: string;
  reward: string;
  bg: string;
  fg: string;
  label_color: string;
  stamp_style: string;
  created_at: Date;
  has_logo: boolean;
  has_banner: boolean;
}

/** Templates, newest first. Never selects the image bytes — those stream separately. */
export async function listDesignTemplates(): Promise<DesignTemplateRow[]> {
  const res = await getPool().query<DesignTemplateRow>(
    `SELECT id, name, reward, bg, fg, label_color, stamp_style, created_at,
            logo IS NOT NULL AS has_logo, banner IS NOT NULL AS has_banner
       FROM design_templates ORDER BY created_at DESC`,
  );
  return res.rows;
}

export async function createDesignTemplate(row: {
  name: string;
  reward: string;
  bg: string;
  fg: string;
  labelColor: string;
  stampStyle: string;
  logo: Buffer | null;
  banner: Buffer | null;
}): Promise<{ id: string }> {
  const id = generateShortCode(8).toLowerCase();
  await getPool().query(
    `INSERT INTO design_templates (id, name, reward, bg, fg, label_color, stamp_style, logo, banner)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [id, row.name, row.reward, row.bg, row.fg, row.labelColor, row.stampStyle, row.logo, row.banner],
  );
  return { id };
}

export async function getDesignTemplate(id: string): Promise<
  (DesignTemplateRow & { logo: Buffer | null; banner: Buffer | null }) | null
> {
  const res = await getPool().query(
    `SELECT id, name, reward, bg, fg, label_color, stamp_style, created_at, logo, banner,
            logo IS NOT NULL AS has_logo, banner IS NOT NULL AS has_banner
       FROM design_templates WHERE id = $1`,
    [id],
  );
  return res.rows[0] ?? null;
}

export async function deleteDesignTemplate(id: string): Promise<void> {
  await getPool().query(`DELETE FROM design_templates WHERE id = $1`, [id]);
}

/** Record an owner sign-in. Best-effort — never block a login on analytics. */
export async function logOwnerLogin(ownerId: string): Promise<void> {
  try {
    await getPool().query(`INSERT INTO owner_logins (owner_id) VALUES ($1)`, [ownerId]);
  } catch (err) {
    console.error("[db] could not record owner login:", err);
  }
}

export interface AdminRetentionRow {
  id: string;
  name: string;
  /** Of customers who ever got a stamp, the share who came back a second / third time. */
  second_visit_rate: number;
  third_visit_rate: number;
  /** Median days between consecutive visits, across customers who came more than once. */
  median_gap_days: number | null;
  /** Of started cards, the share that reached a reward — and how long that took. */
  completion_rate: number;
  median_days_to_reward: number | null;
  /** Time to value: median days from joining to the first stamp. */
  median_days_to_first_stamp: number | null;
  /** Cards at their target with no redeem yet — what the merchant owes. */
  unclaimed_rewards: number;
  /** Of cards old enough to judge, the share still visiting. Retention, plainly. */
  alive_30: number;
  alive_60: number;
  alive_90: number;
}

/**
 * The questions a merchant's survival actually turns on: do people come back a
 * second time, do they finish a card, and how long does any of it take.
 *
 * Everything here is derived from `events` — no new tracking. Rates are 0..1 and
 * medians are null when there isn't enough history to say, which the UI renders
 * as "—" rather than inventing a zero.
 */
export async function adminRetention(): Promise<AdminRetentionRow[]> {
  const res = await getPool().query<AdminRetentionRow>(
    `WITH visits AS (
       SELECT p.card_id, p.serial, p.created_at,
              count(*) FILTER (WHERE e.type = 'stamp')::int AS n,
              min(e.created_at) FILTER (WHERE e.type = 'stamp') AS first_stamp,
              max(e.created_at) FILTER (WHERE e.type = 'stamp') AS last_stamp,
              min(e.created_at) FILTER (WHERE e.type = 'redeem') AS first_redeem
         FROM passes p LEFT JOIN events e ON e.serial = p.serial
        GROUP BY p.card_id, p.serial, p.created_at
     ),
     started AS (SELECT * FROM visits WHERE n > 0)
     SELECT c.id, c.name,
            COALESCE((SELECT count(*) FILTER (WHERE n >= 2)::numeric / NULLIF(count(*), 0)
                        FROM started s WHERE s.card_id = c.id), 0)::float8 AS second_visit_rate,
            COALESCE((SELECT count(*) FILTER (WHERE n >= 3)::numeric / NULLIF(count(*), 0)
                        FROM started s WHERE s.card_id = c.id), 0)::float8 AS third_visit_rate,
            (SELECT percentile_cont(0.5) WITHIN GROUP (
                      ORDER BY extract(epoch FROM (last_stamp - first_stamp)) / 86400.0 / (n - 1))
               FROM started s WHERE s.card_id = c.id AND n >= 2)::float8 AS median_gap_days,
            COALESCE((SELECT count(*) FILTER (WHERE first_redeem IS NOT NULL)::numeric / NULLIF(count(*), 0)
                        FROM started s WHERE s.card_id = c.id), 0)::float8 AS completion_rate,
            (SELECT percentile_cont(0.5) WITHIN GROUP (
                      ORDER BY extract(epoch FROM (first_redeem - s.created_at)) / 86400.0)
               FROM started s WHERE s.card_id = c.id AND first_redeem IS NOT NULL)::float8 AS median_days_to_reward,
            (SELECT percentile_cont(0.5) WITHIN GROUP (
                      ORDER BY extract(epoch FROM (first_stamp - s.created_at)) / 86400.0)
               FROM started s WHERE s.card_id = c.id)::float8 AS median_days_to_first_stamp,
            (SELECT count(*)::int FROM passes p
              WHERE p.card_id = c.id AND p.stamp_count >= p.stamps_target) AS unclaimed_rewards,
            ${aliveRateSql(30)} AS alive_30,
            ${aliveRateSql(60)} AS alive_60,
            ${aliveRateSql(90)} AS alive_90
       FROM cards c
      ORDER BY c.created_at DESC`,
  );
  return res.rows;
}

// Of the cards old enough to judge (joined more than N days ago), the share that
// have been stamped within the last N days. Cards too young to have had the
// chance are excluded rather than counted as churned, which would make every
// young merchant look like a disaster.
function aliveRateSql(days: number): string {
  return `COALESCE((
       SELECT count(*) FILTER (
                WHERE EXISTS (SELECT 1 FROM events e
                               WHERE e.serial = p.serial AND e.type = 'stamp'
                                 AND e.created_at > now() - interval '${days} days')
              )::numeric / NULLIF(count(*), 0)
         FROM passes p
        WHERE p.card_id = c.id AND p.created_at < now() - interval '${days} days'
     ), 0)::float8`;
}

export interface AdminStaffRow {
  card_id: string;
  cafe_name: string;
  /** `staff:<deviceId>` — a PHONE, not a person. A re-sign-in mints a new one. */
  actor: string;
  stamps: number;
  redeems: number;
  undos: number;
  forced: number;
  first_seen: Date;
  last_seen: Date;
}

/**
 * Per-device counter activity. The outlier to look for is a device whose redeem
 * count is high relative to its stamps — free rewards handed to friends.
 *
 * Caveat the UI must repeat: `actor` identifies a PHONE. A device that signs out
 * and back in gets a new id, and a PIN change resets every one of them, so this
 * is "phone A vs phone B", never "Aisyah vs Danial".
 */
export async function adminStaffAudit(): Promise<AdminStaffRow[]> {
  const res = await getPool().query<AdminStaffRow>(
    `SELECT e.card_id, c.name AS cafe_name, e.actor,
            count(*) FILTER (WHERE e.type = 'stamp')::int AS stamps,
            count(*) FILTER (WHERE e.type = 'redeem')::int AS redeems,
            count(*) FILTER (WHERE e.type = 'undo')::int AS undos,
            count(*) FILTER (WHERE e.forced)::int AS forced,
            min(e.created_at) AS first_seen, max(e.created_at) AS last_seen
       FROM events e JOIN cards c ON c.id = e.card_id
      WHERE e.actor LIKE 'staff:%'
      GROUP BY e.card_id, c.name, e.actor
      ORDER BY count(*) FILTER (WHERE e.type = 'stamp') DESC
      LIMIT 100`,
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

export async function linkOwnerCard(ownerId: string, cardId: string): Promise<void> {
  await getPool().query(
    `INSERT INTO owner_cards (owner_id, card_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [ownerId, cardId],
  );
}

export async function cardsForOwner(ownerId: string): Promise<CardRow[]> {
  const res = await getPool().query<CardRow>(
    `SELECT c.* FROM cards c JOIN owner_cards oc ON oc.card_id = c.id
      WHERE oc.owner_id = $1 ORDER BY c.created_at`,
    [ownerId],
  );
  return res.rows;
}

export async function ownerHasCard(ownerId: string, cardId: string): Promise<boolean> {
  const res = await getPool().query(
    `SELECT 1 FROM owner_cards WHERE owner_id = $1 AND card_id = $2`,
    [ownerId, cardId],
  );
  return res.rows.length > 0;
}

// ---------------------------------------------------------------- passes ----

export async function createPass(row: {
  serial: string;
  cardId: string;
  customerId?: string | null;
  platform: Platform;
  shortCode: string;
  authToken: string;
  stampCount: number;
  stampsTarget: number;
  reward: string;
}): Promise<PassRow> {
  const res = await getPool().query<PassRow>(
    `INSERT INTO passes (serial, card_id, customer_id, platform, short_code, auth_token, stamp_count, stamps_target, reward)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [row.serial, row.cardId, row.customerId ?? null, row.platform, row.shortCode, row.authToken,
     row.stampCount, row.stampsTarget, row.reward],
  );
  return res.rows[0]!;
}

export async function getPass(serial: string): Promise<PassRow | null> {
  const res = await getPool().query<PassRow>(`SELECT * FROM passes WHERE serial = $1`, [serial]);
  return res.rows[0] ?? null;
}

export async function getPassByShortCode(cardId: string, shortCode: string): Promise<PassRow | null> {
  const res = await getPool().query<PassRow>(
    `SELECT * FROM passes WHERE card_id = $1 AND short_code = $2`,
    [cardId, shortCode.toUpperCase().trim()],
  );
  return res.rows[0] ?? null;
}

/**
 * A typed short code, looked up across everything the merchant runs.
 *
 * `short_code` is UNIQUE platform-wide, so widening from one card to the shop
 * adds no ambiguity — it only stops staff being told "no such card" because the
 * customer happened to hand over the pastry card while the phone showed coffee.
 */
export async function getPassByShortCodeForMerchant(
  merchantId: string | undefined,
  shortCode: string,
): Promise<PassRow | null> {
  if (!merchantId) return null;
  const res = await getPool().query<PassRow>(
    `SELECT p.* FROM passes p JOIN cards c ON c.id = p.card_id
      WHERE c.merchant_id = $1 AND p.short_code = $2`,
    [merchantId, shortCode.toUpperCase().trim()],
  );
  return res.rows[0] ?? null;
}

/** Cards for the staff list, most-recently-active first (last stamp, else created)
 *  — newest-enrolled ordering buried the customers staff actually serve. */
export async function listRecentPasses(cardId: string, limit = 20): Promise<PassRow[]> {
  const res = await getPool().query<PassRow>(
    `SELECT p.* FROM passes p
      WHERE p.card_id = $1
      ORDER BY ${LAST_VISIT_SQL} DESC LIMIT $2`,
    [cardId, limit],
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
       FROM cards c
      WHERE p.serial = $1 AND c.id = p.card_id
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
export async function cardsWithAutoWinback(): Promise<CardRow[]> {
  const res = await getPool().query<CardRow>(
    `SELECT * FROM cards WHERE auto_winback_enabled = true`,
  );
  return res.rows;
}

export async function logEvent(
  cardId: string,
  serial: string,
  type: EventType,
  meta: EventMeta = {},
): Promise<void> {
  await getPool().query(
    `INSERT INTO events (card_id, serial, type, actor, forced, source) VALUES ($1, $2, $3, $4, $5, $6)`,
    [cardId, serial, type, meta.actor ?? "", meta.forced === true, meta.source ?? ""],
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
export async function nudgeOutcomes(cardId: string): Promise<NudgeOutcomes> {
  const res = await getPool().query<{ returned: number; no_return: number; never_nudged: number }>(
    `WITH x AS (
       SELECT (SELECT max(created_at) FROM events e WHERE e.serial = p.serial AND e.type = 'nudge') AS last_nudge,
              (SELECT max(created_at) FROM events e WHERE e.serial = p.serial AND e.type = 'stamp') AS last_stamp
         FROM passes p WHERE p.card_id = $1
     )
     SELECT
       count(*) FILTER (WHERE last_nudge IS NOT NULL AND last_stamp IS NOT NULL AND last_stamp > last_nudge)::int AS returned,
       count(*) FILTER (WHERE last_nudge IS NOT NULL AND (last_stamp IS NULL OR last_stamp <= last_nudge))::int AS no_return,
       count(*) FILTER (WHERE last_nudge IS NULL)::int AS never_nudged
     FROM x`,
    [cardId],
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

export async function cardMetrics(cardId: string): Promise<CafeMetrics> {
  const res = await getPool().query<{
    active: string;
    cards: string;
    stamps: string;
    redemptions: string;
    stamps30d: string;
    redemptions30d: string;
  }>(
    `SELECT
       (SELECT count(*) FROM passes p WHERE p.card_id = $1 AND ${ACTIVE_PASS_SQL})::text AS active,
       (SELECT count(*) FROM passes WHERE card_id = $1)::text AS cards,
       GREATEST(count(*) FILTER (WHERE type = 'stamp')
              - count(*) FILTER (WHERE type = 'undo'), 0)::text AS stamps,
       count(*) FILTER (WHERE type = 'redeem')::text AS redemptions,
       GREATEST(count(*) FILTER (WHERE type = 'stamp' AND created_at > now() - interval '30 days')
              - count(*) FILTER (WHERE type = 'undo'  AND created_at > now() - interval '30 days'), 0)::text AS "stamps30d",
       count(*) FILTER (WHERE type = 'redeem' AND created_at > now() - interval '30 days')::text AS "redemptions30d"
     FROM events WHERE card_id = $1`,
    [cardId],
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
    `INSERT INTO events (card_id, serial, type, actor)
     SELECT p.card_id, p.serial, $2, 'customer' FROM passes p WHERE p.serial = $1`,
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
