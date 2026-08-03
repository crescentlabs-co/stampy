/**
 * Postgres access layer.
 *
 *   merchants      — the business (one per login), and its name on the pass
 *   cards          — one loyalty programme (branding, reward, target)
 *   customers      — a person at one merchant; deliberately holds no PII
 *   owners         — dashboard logins (email + scrypt password hash, staff PIN)
 *   owner_cards    — which owners manage which cards
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
  /** Fill colour of an earned stamp in the rendered grid. Seeded from label_color. */
  accent_color: string;
  /** The band across the middle — its own colour, and which texture fills it. */
  band_color: string;
  band_texture: string;
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
  /**
   * Dead since v1.5, when automated win-back was removed: nudging is an owner
   * action with a 7-day per-customer cooldown, nothing scheduled. The columns
   * stay because migrations here are additive only.
   */
  auto_winback_enabled: boolean;
  auto_winback_days: number;
  /** Still live: the default text the Customers tab pre-fills a nudge with. */
  auto_winback_message: string;
  /** Which stamp-grid icon preset is selected ('' = plain text dots, 'custom' = uploaded). */
  stamp_style: string;
  /** The owner's own line on the sign-up page; '' falls back to the generated one. */
  signup_message: string;
  /** Retired: hidden from the owner and off the join link. Issued passes still work. */
  archived_at: Date | null;
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
  | "pass_removed"
  // v1.4 — the funnel above `enroll`. A scan that was never recorded cannot be
  // reconstructed from anything, so these two are the difference between
  // knowing and never knowing where people drop out.
  | "join_view"
  | "wallet_click"
  // v1.9 — the owner opened their printable poster. The step ABOVE join_view,
  // and the only evidence that anything was ever put on a counter: a merchant
  // who has never opened this has no poster up, so no scan can happen and no
  // amount of waiting will change that. It separates "not working" from "not
  // started", which look identical in every other number.
  | "poster_view"
  // The stamp that filled the card. Replayable in principle, but only by
  // walking every stamp in order against a target that may have been edited
  // since — so it is written down at the moment it is true.
  | "completed"
  // APNs answered 410 Unregistered: that device no longer holds the pass.
  // A second, independent churn signal, free and previously discarded.
  | "pass_dropped"
  // The owner changed the reward, the target or the design. Without this, a
  // completion rate that moves in May has no explanation in the database.
  | "card_edited"
  // A typed code that matched nothing, and a staff PIN that failed. Worn
  // posters, deleted passes, confused staff, and people guessing at the door.
  | "lookup_failed"
  | "pin_failed";

/**
 * `metadata` keys, kept in one place because renaming one later is the same
 * problem as renaming an event type: every stored row and every query that
 * reads it has to change together.
 */
export interface EventMetadata {
  /** `apple-webservice` | `google-callback` — which platform told us. */
  platform_source?: string;
  /** APNs/Google status code and reason, on delivery events. */
  status?: number;
  reason?: string;
  /** Devices the push reached, and how many refused it. */
  sent?: number;
  failed?: number;
  /** Card edits: only the fields that actually changed, before → after. */
  changed?: Record<string, { from: unknown; to: unknown }>;
  /** The code someone typed that matched nothing. */
  code?: string;
  /** Which wallet button was tapped, before any pass exists. */
  wallet?: string;
  [key: string]: unknown;
}

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
  /**
   * The business and the person. Both are derivable by joining through
   * `passes`, and both are written here anyway — see the migration note. Left
   * unset, `logEvent` fills them in from the pass itself.
   */
  merchantId?: string | null;
  customerId?: string | null;
  /** `apple` | `google`. Filled from the pass when not given. */
  platform?: string;
  /** The staff phone, and (later) the person on it. */
  deviceId?: string;
  staffId?: string | null;
  /** Progress after this event, and the target that applied at the time. */
  stampsAfter?: number | null;
  stampsTarget?: number | null;
  metadata?: EventMetadata;
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
 * v1.3: `cafes` becomes `cards`.
 *
 * A row in that table was never a café — it is ONE loyalty programme, and a
 * merchant can run several. Calling it `cafes` is what produced a separate staff
 * PIN per card, and a stamper that resolved to another merchant's counter: both
 * bugs read the name and believed it. Every future reader would too.
 *
 * This is the one non-additive migration in the project (see CLAUDE.md). Two
 * things make it safe:
 *
 *  - **The ids do not change.** Today's `cafes.id` becomes `cards.id` verbatim.
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
    -- v1.6: the grid is keyed by the TARGET it was drawn for, not only by how
    -- many are filled. It used to be (card_id, filled), and saving the card
    -- replaced the whole set at whatever the target now was — so lowering
    -- 8 → 6 left a customer sitting at 7 of 8 requesting a strip that no longer
    -- existed (404, grid gone), and raising 6 → 10 redrew their 5-of-6 card as
    -- 5 of 10, understating their own progress. Each pass keeps the target it
    -- was issued with, so the picture has to be keyed the same way.
    ALTER TABLE card_stamp_strips ADD COLUMN IF NOT EXISTS target integer NOT NULL DEFAULT 0;
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
    -- v1.6: a design now carries everything the OWNER's designer can set, because
    -- it is literally that designer pointed at this row instead of a card. Three
    -- columns short of it and the console would silently drop the accent, the
    -- band colour and the band texture on every push — a design that looked right
    -- while you built it and wrong once it landed.
    ALTER TABLE design_templates ADD COLUMN IF NOT EXISTS accent_color text NOT NULL DEFAULT 'rgb(214,178,120)';
    ALTER TABLE design_templates ADD COLUMN IF NOT EXISTS band_color   text NOT NULL DEFAULT 'rgb(90,52,38)';
    ALTER TABLE design_templates ADD COLUMN IF NOT EXISTS band_texture text NOT NULL DEFAULT 'gradient';
    -- Preview-only fields. The shared designer draws its mock-up from a card's
    -- shape, so a design has to have that shape too — but none of these are
    -- pushed onto a real card. A push changes how a card LOOKS and never what it
    -- promises, so a design can never contradict what staff have been telling
    -- customers about their reward.
    ALTER TABLE design_templates ADD COLUMN IF NOT EXISTS stamps_target  integer NOT NULL DEFAULT 10;
    ALTER TABLE design_templates ADD COLUMN IF NOT EXISTS stamps_start   integer NOT NULL DEFAULT 0;
    ALTER TABLE design_templates ADD COLUMN IF NOT EXISTS signup_message text NOT NULL DEFAULT '';
    -- Bumped on every art write, so the designer's preview can cache-bust the
    -- logo and band it just uploaded instead of showing the previous one.
    ALTER TABLE design_templates ADD COLUMN IF NOT EXISTS art_version integer NOT NULL DEFAULT 0;
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
    -- v1.3: a person, scoped to one merchant. Holds NO name, email or phone:
    -- identity comes from a signed cookie instead, so this identifies a BROWSER,
    -- not a human — a new phone reads as a new customer, and that is accepted
    -- rather than fixed by collecting PII.
    --
    -- The promise we make is that we never ASK the customer for those things
    -- (the join page and the privacy notice both say exactly that) — not that a
    -- column can never exist. So a customer list with optional names is a
    -- one-line additive migration here whenever it is wanted:
    --   ALTER TABLE customers ADD COLUMN IF NOT EXISTS name text;
    -- Nothing SELECTs * from this table into a fixed-shape type, and
    -- src/backup.ts tolerates columns the dump predates (they restore at their
    -- default), so an old dump still restores into the newer schema. Adding one
    -- is a privacy-notice update, not a rework — keep it that way.
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

    -- v1.4: make the event log answer questions nobody has asked yet.
    --
    -- merchant_id / customer_id / platform are DENORMALISED on purpose. All
    -- three can be reached by joining through passes today, but that join is
    -- the thing that breaks first: a pass row that goes away takes the path
    -- with it, and every person-level question needs it. Writing them at
    -- insert time costs nothing at a few hundred rows and is a long backfill
    -- at a few million — so it happens now, not later.
    ALTER TABLE events ADD COLUMN IF NOT EXISTS merchant_id text REFERENCES merchants(id);
    ALTER TABLE events ADD COLUMN IF NOT EXISTS customer_id text REFERENCES customers(id);
    ALTER TABLE events ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT '';
    -- The till that did it. The actor column already carries "staff:<deviceId>";
    -- this pulls the id out so it can be grouped and indexed without string surgery.
    ALTER TABLE events ADD COLUMN IF NOT EXISTS device_id text NOT NULL DEFAULT '';
    -- Ships nullable and unused. There is ONE PIN per owner today, so every
    -- counter action is attributable to a phone, not a person. When named staff
    -- arrive this column is already here and already indexed, which makes that
    -- a UI feature instead of a migration plus a rewrite of every historic query.
    ALTER TABLE events ADD COLUMN IF NOT EXISTS staff_id text;
    -- The state AFTER this event, and the terms in force when it happened.
    -- Without these, "what was the completion rate last March" means replaying
    -- every stamp in order against a target that may since have been edited.
    ALTER TABLE events ADD COLUMN IF NOT EXISTS stamps_after integer;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS stamps_target integer;
    -- The escape hatch: whatever the next unforeseen field turns out to be, it
    -- goes in here rather than becoming another migration. APNs status codes,
    -- callback nonces, a card edit's before/after, the User-Agent.
    ALTER TABLE events ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

    CREATE INDEX IF NOT EXISTS idx_events_merchant_time ON events(merchant_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_events_customer_time ON events(customer_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_events_type_time ON events(type, created_at);
    -- Replay protection for Google Wallet callbacks: a captured callback must
    -- not be re-postable to fake repeated churn. See routes/googleCallback.ts.
    CREATE INDEX IF NOT EXISTS idx_events_nonce ON events((metadata->>'nonce'));

    -- v1.4: what was ACTUALLY sent, and whether it arrived.
    --
    -- passes.message holds only the latest nudge and is overwritten by the next
    -- one, so every earlier message was being destroyed. The nudge event
    -- recorded that a message happened but never its wording — which makes
    -- "did the discount wording beat the plain reminder" unanswerable forever.
    -- Delivery outcome is the other half: applyAndPush already computes exactly
    -- how many devices took the push and why the rest didn't, then throws it
    -- away, so "we sent 40" is recorded while "12 never arrived" is not.
    CREATE TABLE IF NOT EXISTS messages (
      id          bigserial PRIMARY KEY,
      event_id    bigint REFERENCES events(id) ON DELETE SET NULL,
      serial      text NOT NULL,
      customer_id text REFERENCES customers(id),
      card_id     text NOT NULL REFERENCES cards(id),
      kind        text NOT NULL,
      body        text NOT NULL,
      platform    text NOT NULL DEFAULT '',
      delivered   boolean,
      fail_reason text NOT NULL DEFAULT '',
      created_at  timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_messages_customer_time ON messages(customer_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_card_time ON messages(card_id, created_at);
    -- v1.5: the one line the owner writes on their own sign-up page. Blank means
    -- fall back to the generated "Collect N stamps, get a X".
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS signup_message text NOT NULL DEFAULT '';
    -- v1.5: retiring a card without destroying it. A card id is printed on
    -- posters and baked into every Android card issued from it, and its events
    -- are append-only, so deleting one is not available to us. Archiving takes
    -- it out of the owner's dashboard and off the join link while every pass
    -- already in a wallet keeps working.
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS archived_at timestamptz;
    -- v1.9: merchant-level admin. Archiving a MERCHANT retires the business and
    -- everything under it; archiving a card only retired one programme, which is
    -- the wrong unit when a merchant walks away. Same rules as a card: nothing
    -- is deleted, every pass in a wallet keeps working, and it can be undone.
    ALTER TABLE merchants ADD COLUMN IF NOT EXISTS archived_at timestamptz;
    -- The only contact detail we had was owners.email, which is a login, not a
    -- person to ring when their counter has been dark for a week.
    ALTER TABLE merchants ADD COLUMN IF NOT EXISTS contact_phone text NOT NULL DEFAULT '';
    ALTER TABLE merchants ADD COLUMN IF NOT EXISTS contact_note text NOT NULL DEFAULT '';
  `);

  // v1.6: accent colour — the fill of an earned stamp in the rendered grid. Added
  // separately from the block above because a plain ADD COLUMN would stamp every
  // existing card with the literal default; the ones already out there should
  // inherit the colour their owner actually picked. Only ever runs once, since
  // after this the column exists.
  const hadAccent = await getPool().query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_name = 'cards' AND column_name = 'accent_color'`,
  );
  if (!hadAccent.rowCount) {
    await getPool().query(
      `ALTER TABLE cards ADD COLUMN accent_color text NOT NULL DEFAULT 'rgb(214, 178, 120)'`,
    );
    const seeded = await getPool().query(`UPDATE cards SET accent_color = label_color`);
    console.log(`[migrate] accent_color seeded from label_color on ${seeded.rowCount} card(s)`);
  }

  // v1.7: the band across the middle of the card — the strip the stamps sit on,
  // in its own colour and texture. It replaces the uploaded banner photo, and is
  // still rendered to a PNG and stored in card_banners, so Google's hero image
  // and Apple's strip backdrop are unaffected.
  //
  // Seeded from each card's own background rather than the literal default, for
  // the same reason as accent_color above: an existing card must look exactly as
  // it did until its owner chooses otherwise. The differentiated band is what a
  // NEW card, or a freshly extracted palette, starts from.
  const hadBand = await getPool().query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_name = 'cards' AND column_name = 'band_color'`,
  );
  if (!hadBand.rowCount) {
    await getPool().query(
      `ALTER TABLE cards ADD COLUMN band_color text NOT NULL DEFAULT 'rgb(90, 52, 38)'`,
    );
    const bands = await getPool().query(`UPDATE cards SET band_color = background_color`);
    console.log(`[migrate] band_color seeded from background_color on ${bands.rowCount} card(s)`);
  }
  await getPool().query(
    `ALTER TABLE cards ADD COLUMN IF NOT EXISTS band_texture text NOT NULL DEFAULT 'gradient'`,
  );

  // v1.8: put the target into the stamp-grid key. See the ALTER above for what
  // this fixes. The existing rows were rendered at whatever each card's target
  // is now — saving the card always re-renders the whole set — so seeding from
  // cards.stamps_target reproduces exactly what is on disk.
  //
  // The primary key genuinely changes here, which is not the additive-only rule
  // this file otherwise holds to. It is allowed for this one table because it is
  // a pure render cache: every row can be regenerated by re-saving a design, so
  // the worst outcome is a card falling back to a plain band until then. No
  // other table may be treated this way.
  const keyedByTarget = await getPool().query(
    `SELECT 1 FROM information_schema.key_column_usage
      WHERE table_name = 'card_stamp_strips' AND column_name = 'target'`,
  );
  if (!keyedByTarget.rowCount) {
    const seeded = await getPool().query(
      `UPDATE card_stamp_strips s SET target = c.stamps_target
         FROM cards c WHERE c.id = s.card_id AND s.target = 0`,
    );
    // Not card_stamp_strips_pkey by name: this table was renamed from
    // cafe_stamp_strips in v1.3, and renaming a table leaves its constraints
    // under the old name. Ask Postgres what the key is actually called.
    const pk = await getPool().query<{ conname: string }>(
      `SELECT conname FROM pg_constraint
        WHERE conrelid = 'card_stamp_strips'::regclass AND contype = 'p'`,
    );
    for (const row of pk.rows) {
      await getPool().query(`ALTER TABLE card_stamp_strips DROP CONSTRAINT "${row.conname}"`);
    }
    await getPool().query(
      `ALTER TABLE card_stamp_strips ADD PRIMARY KEY (card_id, target, filled)`,
    );
    console.log(`[migrate] stamp grids keyed by target (${seeded.rowCount} strip(s) seeded)`);
  }

  // The till id already sitting inside the actor string as "staff:<id>".
  // Independent of merchants and customers, so it can run here.
  const devices = await getPool().query(
    `UPDATE events SET device_id = substring(actor from 7)
      WHERE actor LIKE 'staff:%' AND device_id = ''`,
  );
  if (devices.rowCount) console.log(`[migrate] pulled ${devices.rowCount} till id(s) out of actor`);

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
  await backfillEventAttribution();
  await backfillMerchantSignupDates();
}

/**
 * Give backfilled merchants their real signup date.
 *
 * `backfillMerchants` mints a merchant row for every pre-v1.3 owner and inserts
 * no `created_at`, so the column defaulted to `now()` — the moment the migration
 * ran. Every merchant that predates the merchants table was therefore stamped
 * with the deploy date, which made every trial look like it started the same
 * day. The owner account's date was never touched and is the real signup.
 *
 * Only ever moves a date EARLIER, so a merchant legitimately created after their
 * owner (an operator adding a second business later) is left alone. Idempotent:
 * once it has run the predicate matches nothing.
 */
async function backfillMerchantSignupDates(): Promise<void> {
  const fixed = await getPool().query(
    `UPDATE merchants m SET created_at = o.created_at
       FROM owners o
      WHERE o.id = m.owner_id AND m.created_at > o.created_at`,
  );
  if (fixed.rowCount) {
    console.log(`[migrate] dated ${fixed.rowCount} merchant(s) from their owner's signup`);
  }
}

/**
 * Fill in the denormalised event columns from the pass each event points at.
 *
 * **Runs last, and that ordering is load-bearing.** It reads `cards.merchant_id`
 * and `passes.customer_id`, which the two backfills above are what create — run
 * it any earlier and every row is attributed to nobody.
 *
 * Each column is conditioned separately rather than behind one combined guard.
 * A single `WHERE everything IS NULL` looks equivalent and is not: fill one
 * column on an early boot and the guard stops matching, so the other two stay
 * empty for good. Written this way, a partly-filled row is completed on the
 * next boot and a fully-filled one is left alone.
 *
 * Doing this now, while every pass still exists, is the only cheap moment — an
 * event whose pass is later pruned can never be attributed to anyone.
 */
async function backfillEventAttribution(): Promise<void> {
  const res = await getPool().query(
    `UPDATE events e
        SET merchant_id = COALESCE(e.merchant_id, c.merchant_id),
            customer_id = COALESCE(e.customer_id, p.customer_id),
            platform    = CASE WHEN e.platform = '' THEN COALESCE(p.platform, '') ELSE e.platform END,
            stamps_target = COALESCE(e.stamps_target, p.stamps_target)
       FROM passes p
       JOIN cards c ON c.id = p.card_id
      WHERE e.serial = p.serial
        AND (e.merchant_id IS NULL AND c.merchant_id IS NOT NULL
          OR e.customer_id IS NULL AND p.customer_id IS NOT NULL
          OR e.platform = '' AND COALESCE(p.platform, '') <> ''
          OR e.stamps_target IS NULL)`,
  );
  if (res.rowCount) {
    console.log(`[migrate] attributed ${res.rowCount} event(s) to a merchant, customer and platform`);
  }
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

/**
 * The readable ref to hand out for this merchant: their newest slug, or their
 * id when they somehow have none.
 *
 * Newest, because `claimSlug` only ever ADDS — a rename reserves a new slug and
 * keeps every older one resolving forever, so the last one claimed is the one
 * that matches the shop's current name. Every earlier slug still works, which is
 * what makes a printed poster safe to rename behind.
 */
export async function currentSlug(merchantId: string): Promise<string> {
  const res = await getPool().query<{ slug: string }>(
    `SELECT slug FROM merchant_slugs WHERE merchant_id = $1 ORDER BY created_at DESC, slug LIMIT 1`,
    [merchantId],
  );
  return res.rows[0]?.slug ?? merchantId;
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

/**
 * The name customers see as the pass issuer — the BUSINESS, not the card.
 *
 * Falls back to the card's own name for the unclaimed seeded card, which has no
 * merchant yet. In V1 the two are identical anyway; they diverge the moment a
 * merchant adds a second card, where the pass should still say the shop's name.
 */
export async function businessNameForCard(card: CardRow): Promise<string> {
  if (!card.merchant_id) return card.name;
  const merchant = await getMerchant(card.merchant_id);
  return merchant?.name?.trim() || card.name;
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

/**
 * A merchant's live cards. Archived ones are excluded, which is what makes the
 * /j/ join link skip a retired card and what lets a shop that archived its
 * spare create a fresh one under the one-card-per-merchant cap.
 */
export async function cardsForMerchant(merchantId: string): Promise<CardRow[]> {
  const res = await getPool().query<CardRow>(
    `SELECT * FROM cards WHERE merchant_id = $1 AND archived_at IS NULL ORDER BY created_at`,
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

/** Why a card could not be archived — each maps to a sentence the admin console shows. */
export type CardArchival =
  | { ok: true }
  | { ok: false; reason: "no-such-card" | "last-card" | "already" };

/**
 * Retire a card without destroying anything — operator cleanup for a test card
 * or a mis-click, never something a café owner can do.
 *
 * Deleting is not on the table, and that is not caution: a card id is printed
 * on posters, baked into the Google class id of every Android card issued from
 * it, and sits inside those cards' art URLs, while its `events` rows are
 * append-only. A DELETE would either be blocked by the log or would have to
 * take the log with it. Archiving sidesteps both — the row stays, the history
 * stays, and every pass already in a wallet keeps being stamped.
 *
 * What changes: the card leaves the owner's dashboard, their staff card
 * switcher, and the merchant's /j/ join link. Passes already issued from it
 * keep stamping — `applyAndPush` resolves a pass's OWN card by id, so a
 * customer is never turned away at the counter for holding a retired card.
 *
 * Refuses the merchant's last un-archived card, which would leave a shop with
 * a login, a printed poster and nothing to hand out. Since creation is capped
 * at one live card per merchant, that also means a shop cannot swap its card
 * for a new one — editing the card it has is the path, and rules changes only
 * ever apply to customers who join afterwards.
 */
export async function archiveCard(id: string): Promise<CardArchival> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const card = await client.query<{ merchant_id: string | null; archived_at: Date | null }>(
      `SELECT merchant_id, archived_at FROM cards WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (!card.rows.length) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "no-such-card" };
    }
    const { merchant_id: merchantId, archived_at: already } = card.rows[0]!;
    if (already) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "already" };
    }
    // A card with no merchant predates the split and belongs to no shop, so
    // "would this leave them with nothing" does not apply to it.
    if (merchantId) {
      const siblings = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM cards
          WHERE merchant_id = $1 AND id <> $2 AND archived_at IS NULL`,
        [merchantId, id],
      );
      if (Number(siblings.rows[0]!.n) === 0) {
        await client.query("ROLLBACK");
        return { ok: false, reason: "last-card" };
      }
    }
    await client.query(`UPDATE cards SET archived_at = now() WHERE id = $1`, [id]);
    await client.query("COMMIT");
    return { ok: true };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Put an archived card back. Always safe — nothing was lost to begin with. */
export async function unarchiveCard(id: string): Promise<CardArchival> {
  const res = await getPool().query(
    `UPDATE cards SET archived_at = NULL WHERE id = $1 AND archived_at IS NOT NULL`,
    [id],
  );
  return res.rowCount ? { ok: true } : { ok: false, reason: "no-such-card" };
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
    accent_color: string;
    auto_winback_enabled: boolean;
    auto_winback_days: number;
    auto_winback_message: string;
    stamp_style: string;
    signup_message: string;
    band_color: string;
    band_texture: string;
    average_spend_cents: number;
    currency: string;
  }>,
  actor = "",
): Promise<CardRow | null> {
  const keys = Object.keys(fields) as (keyof typeof fields)[];
  if (!keys.length) return getCard(id);

  // Read the old values first, so the audit row can say what actually changed.
  // Without this, a completion rate that moves in May has no explanation in the
  // database — the reward could have been changed on the 3rd and nothing would
  // remember. Logged from inside updateCard rather than from the dashboard so a
  // new call site cannot silently skip it.
  const before = await getCard(id);

  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  const res = await getPool().query<CardRow>(
    `UPDATE cards SET ${sets} WHERE id = $1 RETURNING *`,
    [id, ...keys.map((k) => fields[k])],
  );
  const after = res.rows[0] ?? null;

  if (before && after) {
    const changed: Record<string, { from: unknown; to: unknown }> = {};
    for (const k of keys) {
      const from = (before as unknown as Record<string, unknown>)[k];
      const to = (after as unknown as Record<string, unknown>)[k];
      if (from !== to) changed[k] = { from, to };
    }
    // A save that changed nothing is not an edit worth a row.
    if (Object.keys(changed).length) {
      await logEvent(id, "", "card_edited", {
        actor,
        merchantId: after.merchant_id ?? null,
        stampsTarget: after.stamps_target,
        metadata: { changed },
      }).catch((err) => console.error("[card_edited] not logged:", err));
    }
  }
  return after;
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

/**
 * The strip for one filled count of one target. null ⇒ fall back to text dots.
 *
 * **The target is not optional.** A pass keeps the target it was issued with, so
 * "7 filled" means nothing on its own — 7 of 8 and 7 of 10 are different
 * pictures. Passing the card's current target for a pass issued under an older
 * ruleset is exactly the bug this key exists to stop.
 */
export async function getStampStrip(
  cardId: string,
  target: number,
  filled: number,
): Promise<{ png: Buffer } | null> {
  const res = await getPool().query<{ png: Buffer }>(
    `SELECT png FROM card_stamp_strips WHERE card_id = $1 AND target = $2 AND filled = $3`,
    [cardId, target, filled],
  );
  return res.rows[0] ?? null;
}

/**
 * Replaces every strip a card has, across every target, in one transaction.
 *
 * The caller sends the complete set it rendered — the current target plus any
 * older one still held by a live pass (see `targetsInUse`). Because the write is
 * a replace, that also prunes: a target nobody holds any more simply isn't in the
 * payload and stops existing. Partial writes per target would leak grids forever.
 */
export async function setStampStrips(
  cardId: string,
  strips: { target: number; filled: number; png: Buffer }[],
): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM card_stamp_strips WHERE card_id = $1`, [cardId]);
    for (const s of strips) {
      await client.query(
        `INSERT INTO card_stamp_strips (card_id, target, filled, png, updated_at)
         VALUES ($1, $2, $3, $4, now())`,
        [cardId, s.target, s.filled, s.png],
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

/**
 * Every stamp target still held by a live pass of this card, ascending.
 *
 * The owner's browser is the only thing that can render a grid (canvas, no
 * server-side image library), so it has to be told which older targets it still
 * owes a set for. Normally one number; two for as long as it takes everyone
 * issued under the old ruleset to earn their next reward.
 */
export async function targetsInUse(cardId: string): Promise<number[]> {
  const res = await getPool().query<{ target: number }>(
    `SELECT DISTINCT p.stamps_target AS target
       FROM passes p
      WHERE p.card_id = $1 AND ${ACTIVE_PASS_SQL}
      ORDER BY target`,
    [cardId],
  );
  return res.rows.map((r) => r.target);
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
  /** Who holds it. Two rows sharing this are one person with two passes. */
  customer_id: string | null;
  code: string;
  stamps: number;
  target: number;
  updated_at: Date;
  created_at: Date;
  /** Last visit by this PERSON — the last stamp on any pass they hold. */
  last_visit: Date;
  /** Messages sent to this person since their last visit, across every pass. */
  unanswered_nudges: number;
  /** Messages to this person in the last 7 days — gates the "2 per week" limit. */
  nudges_7d: number;
  /** True once the customer deleted the card from their wallet (Apple only). */
  removed: boolean;
}

// ---- shared SQL fragments (both assume the passes table is aliased `p`) ----

// "Last visit" must be the last *stamp*, never passes.updated_at: setMessage()
// bumps updated_at, so measuring lapse off it meant nudging a lapsed customer
// marked them freshly-active — nobody ever appeared to lapse.
// Every pass held by the same PERSON as `p`. A customer who added the card on
// Apple and again on Google, or who holds two of the shop's cards, is one human
// — so "when did they last come in" and "how often have we messaged them" have
// to be asked across all of it, not per card. Falls back to the pass itself for
// the unclaimed seeded card, which has no customer.
const CUSTOMER_SERIALS_SQL = `(
       SELECT q.serial FROM passes q
        WHERE (p.customer_id IS NOT NULL AND q.customer_id = p.customer_id)
           OR (p.customer_id IS NULL AND q.serial = p.serial)
     )`;

const LAST_VISIT_SQL = `COALESCE(
       (SELECT max(e.created_at) FROM events e
         WHERE e.serial IN ${CUSTOMER_SERIALS_SQL} AND e.type = 'stamp'),
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
        WHERE e.serial IN ${CUSTOMER_SERIALS_SQL} AND e.type = 'nudge'
          AND e.created_at > ${LAST_VISIT_SQL}
     )`;

// Nudges in the last 7 days, for the "at most 2 per week" limit. Counted off the
// clock rather than off the last visit, so a customer who came in yesterday still
// can't be messaged three times this week.
const NUDGES_7D_SQL = `(
       SELECT count(*)::int FROM events e
        WHERE e.serial IN ${CUSTOMER_SERIALS_SQL} AND e.type = 'nudge'
          AND e.created_at > now() - interval '7 days'
     )`;

// The customer deleted the card from their wallet: iOS told us so, and no device
// has since re-registered it (re-adding writes a fresh registrations row, which
// is what makes this recover on its own). Apple-only — see EventType.
// A person, not a pass. Someone holding an Apple and a Google card at one shop
// is one customer — count passes instead and the Home headline says 14 while the
// list under it shows 13, which is exactly the bug this replaced.
const PERSON_KEY_SQL = `COALESCE(p.customer_id, p.serial)`;

const REMOVED_PASS_SQL = `(
       EXISTS (SELECT 1 FROM events e WHERE e.serial = p.serial AND e.type = 'pass_removed')
   AND NOT EXISTS (SELECT 1 FROM registrations r WHERE r.serial = p.serial)
     )`;

const CUSTOMER_COLUMNS_SQL = `p.serial, p.customer_id, p.short_code AS code, p.stamp_count AS stamps,
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
    `SELECT count(DISTINCT ${PERSON_KEY_SQL}) FILTER (WHERE ${ACTIVE_PASS_SQL})::text AS active,
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
  /**
   * Wallet cards confirmed added, deleted, and never seen in one. Apple reports
   * both via its PassKit web service; Google reports them too, but only since
   * the issuer callback was configured — so rows predating that are Apple-only.
   */
  added: number;
  removed: number;
  never_added: number;
  /** Customers with a stamp in the last 7 / 30 days. */
  active_7d: number;
  active_30d: number;
  /** Set once retired: off the join link and out of the owner's dashboard. */
  archived_at: Date | null;
}

/** Every café on the platform with its owner email(s), metrics, and art flags.
 *  Archived cards are INCLUDED and flagged: the operator console is the one
 *  place a retired card is still visible, and the only place to bring it back.
 *  Never selects a password or a PIN — only hashes exist and neither is surfaced. */
export async function allCardsWithStats(): Promise<AdminCardRow[]> {
  const res = await getPool().query<AdminCardRow>(
    `SELECT c.id, c.name, c.created_at, c.stamps_target, c.archived_at,
            (SELECT string_agg(o.email, ', ' ORDER BY o.email)
               FROM owner_cards oc JOIN owners o ON o.id = oc.owner_id
              WHERE oc.card_id = c.id) AS owners,
            EXISTS (SELECT 1 FROM card_logos l WHERE l.card_id = c.id) AS has_logo,
            EXISTS (SELECT 1 FROM card_banners b WHERE b.card_id = c.id) AS has_banner,
            (SELECT count(DISTINCT ${PERSON_KEY_SQL})::int FROM passes p
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
            (SELECT count(DISTINCT ${PERSON_KEY_SQL})::int FROM passes p WHERE p.card_id = c.id
               AND ${LAST_VISIT_SQL} > now() - interval '7 days'
               AND EXISTS (SELECT 1 FROM events e WHERE e.serial = p.serial AND e.type = 'stamp')) AS active_7d,
            (SELECT count(DISTINCT ${PERSON_KEY_SQL})::int FROM passes p WHERE p.card_id = c.id
               AND ${LAST_VISIT_SQL} > now() - interval '30 days'
               AND EXISTS (SELECT 1 FROM events e WHERE e.serial = p.serial AND e.type = 'stamp')) AS active_30d
       FROM cards c
      ORDER BY c.created_at DESC`,
  );
  return res.rows;
}

// ---------------------------------------------------- merchant health ----

/** Days a merchant gets before the trial is up. Derived from signup, not stored:
 *  adding a `trial_ends_at` column later is additive, and until money changes
 *  hands a stored date is a second thing to keep true for no benefit. */
export const TRIAL_DAYS = 30;

/**
 * When `join_view` and `wallet_click` started being recorded.
 *
 * Anything issued before this has no funnel rows and never will — a scan nobody
 * wrote down cannot be reconstructed from anything later. Kept here as a fact
 * about the data so the console can say "missing history" instead of showing
 * four zeroes that read as a broken sign-up flow.
 */
export const FUNNEL_SINCE = "2026-07-28";
export const FUNNEL_SINCE_LABEL = "28 July 2026";

export interface MerchantHealthRow {
  id: string;
  name: string;
  /** Every owner email on the account, comma-joined. The login, not a person. */
  owners: string | null;
  contact_phone: string;
  contact_note: string;
  created_at: Date;
  /**
   * When this business actually signed up — the earlier of the merchant row and
   * the owner account. NOT `created_at` alone: merchants backfilled in v1.3 were
   * stamped with the migration's timestamp, which made every trial appear to
   * start on the same day. `backfillMerchantSignupDates` repairs the stored
   * column; this keeps the number right even if a row is ever created without
   * one again.
   */
  signed_up_at: Date;
  archived_at: Date | null;
  /** Days since signup. `TRIAL_DAYS - trial_day` is what is left. */
  trial_day: number;
  /** Cards they run. One, for every merchant created since the V1 cap. */
  cards: number;
  /** Their card ids, so the console can filter the existing per-card panels
   *  (retention, funnel, staff audit) down to this merchant without those
   *  queries needing to be rewritten merchant-first. */
  card_ids: string[];
  /** The card's self-reported basket, in cents, and its symbol. */
  basket_cents: number;
  currency: string;
  stamps_target: number;

  // --- activation ---
  /** First staff stamp anywhere on this merchant. Null = never activated. */
  first_stamp_at: Date | null;
  first_redeem_at: Date | null;
  /** Has the owner ever opened their printable poster? Nothing can happen before this. */
  poster_views: number;

  // --- liveness ---
  last_stamp_at: Date | null;
  last_owner_login: Date | null;
  logins_30d: number;
  /** Net staff stamps = real counter visits. Welcome stamps and post-reward
   *  resets are written to passes.stamp_count and emit no event, so they have
   *  never been in this number. */
  stamps: number;
  stamps_7d: number;
  stamps_30d: number;
  stamps_prev_7d: number;
  customers: number;
  active_7d: number;
  redemptions: number;
  unclaimed_rewards: number;

  // --- funnel (see adminFunnel for the Google caveat on `landed`) ---
  /** Join pages opened, however they got there. A QR scan and a tapped link
   *  both arrive as a plain page view, so this was never "scans". */
  scanned: number;
  /** The same, split by the `?s=` tag the poster QR and share link now carry.
   *  Anything untagged — including every poster printed before this — counts as
   *  `opened_other`: unattributed, not lost. */
  opened_poster: number;
  opened_link: number;
  opened_other: number;
  clicked: number;
  made: number;
  landed: number;
  removed: number;
  dropped: number;

  // --- engagement / willingness to pay ---
  card_edits: number;
  /** When they last changed their own card. Null = never made it theirs. */
  last_card_edit_at: Date | null;
  nudges: number;
  /** Win-back, per PERSON: people messaged at least once, and how many then
   *  came back in. Lived only in the per-card table before, which is why it was
   *  the one thing the merchant drill-down could not show. */
  nudged: number;
  nudge_returned: number;
  has_art: boolean;
  staff_devices: number;

  // --- breakage ---
  pin_failed_24h: number;
  lookup_failed_7d: number;
  /** Nudges that were attempted and did not arrive. */
  messages_failed: number;
}

/**
 * One row per merchant, with everything the console triages on.
 *
 * Merchant-keyed on purpose. Every existing admin query groups by `cards`,
 * which is the programme, not the business — with one card per merchant that is
 * usually the same row, but it is the wrong unit to think in and it breaks the
 * moment a merchant runs two.
 *
 * All of it is derived from `events` and `passes`; nothing new is tracked except
 * `poster_view`. Archived merchants are INCLUDED and flagged, because the
 * console is the one place a retired merchant is still visible.
 */
export async function merchantHealth(): Promise<MerchantHealthRow[]> {
  // Their cards, as a scalar subquery source. Every per-merchant aggregate below
  // sums over this rather than assuming a single card.
  const ev = (filter: string, since = "") =>
    `(SELECT count(*)::int FROM events e
       WHERE e.card_id IN (SELECT id FROM cards WHERE merchant_id = m.id)
         AND ${filter}${since ? ` AND e.created_at > now() - interval '${since}'` : ""})`;
  const res = await getPool().query<MerchantHealthRow>(
    `SELECT m.id, m.name, m.created_at, m.archived_at, m.contact_phone, m.contact_note,
            (SELECT string_agg(DISTINCT o.email, ', ')
               FROM owners o WHERE o.id = m.owner_id) AS owners,
            LEAST(m.created_at, COALESCE(
              (SELECT o.created_at FROM owners o WHERE o.id = m.owner_id), m.created_at
            )) AS signed_up_at,
            floor(extract(epoch FROM (now() - LEAST(m.created_at, COALESCE(
              (SELECT o.created_at FROM owners o WHERE o.id = m.owner_id), m.created_at
            )))) / 86400.0)::int AS trial_day,
            (SELECT count(*)::int FROM cards WHERE merchant_id = m.id) AS cards,
            COALESCE((SELECT array_agg(id ORDER BY created_at) FROM cards WHERE merchant_id = m.id),
                     ARRAY[]::text[]) AS card_ids,
            -- The card's basket, not the merchant's: only the card column is
            -- written by the dashboard; merchants.average_spend_cents is a v1.3
            -- backfill artefact that nothing keeps current.
            COALESCE((SELECT max(average_spend_cents) FROM cards WHERE merchant_id = m.id), 0) AS basket_cents,
            COALESCE((SELECT max(currency) FROM cards WHERE merchant_id = m.id), 'RM') AS currency,
            COALESCE((SELECT max(stamps_target) FROM cards WHERE merchant_id = m.id), 0) AS stamps_target,

            (SELECT min(e.created_at) FROM events e
              WHERE e.card_id IN (SELECT id FROM cards WHERE merchant_id = m.id)
                AND e.type = 'stamp') AS first_stamp_at,
            (SELECT min(e.created_at) FROM events e
              WHERE e.card_id IN (SELECT id FROM cards WHERE merchant_id = m.id)
                AND e.type = 'redeem') AS first_redeem_at,
            ${ev("e.type = 'poster_view'")} AS poster_views,

            (SELECT max(e.created_at) FROM events e
              WHERE e.card_id IN (SELECT id FROM cards WHERE merchant_id = m.id)
                AND e.type = 'stamp') AS last_stamp_at,
            (SELECT max(l.created_at) FROM owner_logins l WHERE l.owner_id = m.owner_id) AS last_owner_login,
            (SELECT count(*)::int FROM owner_logins l
              WHERE l.owner_id = m.owner_id AND l.created_at > now() - interval '30 days') AS logins_30d,
            GREATEST(${ev("e.type = 'stamp'")} - ${ev("e.type = 'undo'")}, 0) AS stamps,
            ${ev("e.type = 'stamp'", "7 days")} AS stamps_7d,
            ${ev("e.type = 'stamp'", "30 days")} AS stamps_30d,
            -- The week before last, so the table can show a direction rather
            -- than a number that could mean anything.
            (SELECT count(*)::int FROM events e
              WHERE e.card_id IN (SELECT id FROM cards WHERE merchant_id = m.id)
                AND e.type = 'stamp'
                AND e.created_at > now() - interval '14 days'
                AND e.created_at <= now() - interval '7 days') AS stamps_prev_7d,
            (SELECT count(DISTINCT ${PERSON_KEY_SQL})::int FROM passes p
              WHERE p.card_id IN (SELECT id FROM cards WHERE merchant_id = m.id)
                AND ${ACTIVE_PASS_SQL}) AS customers,
            (SELECT count(DISTINCT ${PERSON_KEY_SQL})::int FROM passes p
              WHERE p.card_id IN (SELECT id FROM cards WHERE merchant_id = m.id)
                AND ${LAST_VISIT_SQL} > now() - interval '7 days'
                AND EXISTS (SELECT 1 FROM events e WHERE e.serial = p.serial AND e.type = 'stamp')) AS active_7d,
            ${ev("e.type = 'redeem'")} AS redemptions,
            (SELECT count(*)::int FROM passes p
              WHERE p.card_id IN (SELECT id FROM cards WHERE merchant_id = m.id)
                AND p.stamp_count >= p.stamps_target) AS unclaimed_rewards,

            ${ev("e.type = 'join_view' AND COALESCE(e.metadata->>'bot', 'false') <> 'true'")} AS scanned,
            ${ev("e.type = 'join_view' AND COALESCE(e.metadata->>'bot','false') <> 'true' AND e.source = 'poster'")} AS opened_poster,
            ${ev("e.type = 'join_view' AND COALESCE(e.metadata->>'bot','false') <> 'true' AND e.source = 'link'")} AS opened_link,
            ${ev("e.type = 'join_view' AND COALESCE(e.metadata->>'bot','false') <> 'true' AND e.source NOT IN ('poster','link')")} AS opened_other,
            ${ev("e.type = 'wallet_click'")} AS clicked,
            ${ev("e.type = 'enroll'")} AS made,
            ${ev("e.type = 'pass_added'")} AS landed,
            ${ev("e.type = 'pass_removed'")} AS removed,
            ${ev("e.type = 'pass_dropped'")} AS dropped,

            ${ev("e.type = 'card_edited'")} AS card_edits,
            (SELECT max(e.created_at) FROM events e
              WHERE e.card_id IN (SELECT id FROM cards WHERE merchant_id = m.id)
                AND e.type = 'card_edited') AS last_card_edit_at,
            ${ev("e.type = 'nudge'")} AS nudges,
            -- Win-back, counted per PERSON like every other customer figure: two
            -- wallet cards belonging to one person who was messaged once must not
            -- read as two people messaged.
            (SELECT count(DISTINCT ${PERSON_KEY_SQL})::int FROM passes p
              WHERE p.card_id IN (SELECT id FROM cards WHERE merchant_id = m.id)
                AND EXISTS (SELECT 1 FROM events e
                             WHERE e.serial = p.serial AND e.type = 'nudge')) AS nudged,
            (SELECT count(DISTINCT ${PERSON_KEY_SQL})::int FROM passes p
              WHERE p.card_id IN (SELECT id FROM cards WHERE merchant_id = m.id)
                AND EXISTS (SELECT 1 FROM events s
                             WHERE s.serial = p.serial AND s.type = 'stamp'
                               AND s.created_at > (SELECT max(n.created_at) FROM events n
                                                    WHERE n.serial = p.serial
                                                      AND n.type = 'nudge'))) AS nudge_returned,
            EXISTS (SELECT 1 FROM card_logos l
                     WHERE l.card_id IN (SELECT id FROM cards WHERE merchant_id = m.id)) AS has_art,
            (SELECT count(DISTINCT e.actor)::int FROM events e
              WHERE e.card_id IN (SELECT id FROM cards WHERE merchant_id = m.id)
                AND e.actor LIKE 'staff:%') AS staff_devices,

            ${ev("e.type = 'pin_failed'", "24 hours")} AS pin_failed_24h,
            ${ev("e.type = 'lookup_failed'", "7 days")} AS lookup_failed_7d,
            (SELECT count(*)::int FROM messages g
              WHERE g.card_id IN (SELECT id FROM cards WHERE merchant_id = m.id)
                AND g.delivered = false) AS messages_failed
       FROM merchants m
      ORDER BY m.created_at DESC`,
  );
  return res.rows;
}

export interface MerchantEditRow {
  created_at: Date;
  actor: string;
  /** `{ field: { from, to } }` — only what actually changed. */
  changed: Record<string, { from: unknown; to: unknown }> | null;
}

/**
 * What this merchant has changed about their card, newest first.
 *
 * The best willingness-to-pay signal in the log, and it was being written and
 * read by nothing. An owner who edits their reward or lowers their target
 * mid-trial is reacting to something — usually poor completion — and that is a
 * conversation you would otherwise never know to have. Unprompted configuration
 * is also the clearest evidence a merchant considers the thing theirs.
 */
export async function merchantEdits(merchantId: string, limit = 20): Promise<MerchantEditRow[]> {
  const res = await getPool().query<MerchantEditRow>(
    `SELECT e.created_at, e.actor, e.metadata->'changed' AS changed
       FROM events e
      WHERE e.card_id IN (SELECT id FROM cards WHERE merchant_id = $1)
        AND e.type = 'card_edited'
      ORDER BY e.created_at DESC
      LIMIT $2`,
    [merchantId, limit],
  );
  return res.rows;
}

/** Merchant-level archive: retires the business, not one programme. Nothing is
 *  deleted and every pass already in a wallet keeps working, exactly as with a
 *  card — this only takes them out of the operator's working list. */
export async function setMerchantArchived(id: string, archived: boolean): Promise<void> {
  await getPool().query(`UPDATE merchants SET archived_at = $2 WHERE id = $1`, [
    id,
    archived ? new Date() : null,
  ]);
}

/** Operator-kept contact details. `owners.email` is a login, not someone to ring. */
export async function setMerchantContact(
  id: string,
  contact: { phone?: string; note?: string },
): Promise<void> {
  await getPool().query(
    `UPDATE merchants
        SET contact_phone = COALESCE($2, contact_phone),
            contact_note  = COALESCE($3, contact_note)
      WHERE id = $1`,
    [id, contact.phone?.slice(0, 40) ?? null, contact.note?.slice(0, 500) ?? null],
  );
}

// ------------------------------------------------------- design templates ----

export interface DesignTemplateRow {
  id: string;
  name: string;
  reward: string;
  bg: string;
  fg: string;
  label_color: string;
  accent_color: string;
  band_color: string;
  band_texture: string;
  stamp_style: string;
  /** Preview-only. A push never writes these onto a real card. */
  stamps_target: number;
  stamps_start: number;
  signup_message: string;
  art_version: number;
  created_at: Date;
  has_logo: boolean;
  has_banner: boolean;
}

/** Every column except the image bytes, which stream separately. */
const TEMPLATE_COLUMNS_SQL = `id, name, reward, bg, fg, label_color, accent_color,
            band_color, band_texture, stamp_style, stamps_target, stamps_start,
            signup_message, art_version, created_at,
            logo IS NOT NULL AS has_logo, banner IS NOT NULL AS has_banner`;

/** Templates, newest first. Never selects the image bytes — those stream separately. */
export async function listDesignTemplates(): Promise<DesignTemplateRow[]> {
  const res = await getPool().query<DesignTemplateRow>(
    `SELECT ${TEMPLATE_COLUMNS_SQL} FROM design_templates ORDER BY created_at DESC`,
  );
  return res.rows;
}

/**
 * A new design, with nothing set but a name.
 *
 * Created empty on purpose: the shared designer edits a row that already exists,
 * exactly as it edits a card, and saves each change as it is made. Building a
 * whole design in the browser and posting it once would be a second save path
 * that has to stay in step with the owner's — which is the duplication this
 * whole change is removing.
 */
export async function createDesignTemplate(name: string): Promise<DesignTemplateRow> {
  const id = generateShortCode(8).toLowerCase();
  const res = await getPool().query<DesignTemplateRow>(
    `INSERT INTO design_templates (id, name) VALUES ($1, $2)
     RETURNING ${TEMPLATE_COLUMNS_SQL}`,
    [id, name],
  );
  return res.rows[0]!;
}

/** Column allowlist for `updateDesignTemplate` — never interpolate a caller's key. */
const TEMPLATE_WRITABLE = new Set([
  "name", "reward", "bg", "fg", "label_color", "accent_color",
  "band_color", "band_texture", "stamp_style", "stamps_target",
  "stamps_start", "signup_message",
]);

/** Patch a design. Mirrors `updateCard`, so the shared designer drives both. */
export async function updateDesignTemplate(
  id: string,
  fields: Record<string, string | number>,
): Promise<DesignTemplateRow | null> {
  const keys = Object.keys(fields).filter((k) => TEMPLATE_WRITABLE.has(k));
  if (keys.length === 0) return getDesignTemplate(id);
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  const res = await getPool().query<DesignTemplateRow>(
    `UPDATE design_templates SET ${sets} WHERE id = $1 RETURNING ${TEMPLATE_COLUMNS_SQL}`,
    [id, ...keys.map((k) => fields[k]!)],
  );
  return res.rows[0] ?? null;
}

/** Store a design's logo or band. Bumps `art_version` so the preview refetches. */
export async function setDesignTemplateArt(
  id: string,
  kind: "logo" | "banner",
  png: Buffer | null,
): Promise<void> {
  await getPool().query(
    `UPDATE design_templates SET ${kind} = $2, art_version = art_version + 1 WHERE id = $1`,
    [id, png],
  );
}

export async function getDesignTemplate(id: string): Promise<
  (DesignTemplateRow & { logo: Buffer | null; banner: Buffer | null }) | null
> {
  const res = await getPool().query(
    `SELECT ${TEMPLATE_COLUMNS_SQL}, logo, banner FROM design_templates WHERE id = $1`,
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
  /** MERCHANT id, not a card. One business, however many programmes it runs. */
  id: string;
  name: string;
  /** People who ever got a stamp — the denominator for the two rates below. */
  started: number;
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
  /** Of customers old enough to judge, the share still visiting. Retention, plainly. */
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
// One row per PERSON per MERCHANT, not per pass per card. Both changes fix real
// under-counting:
//
//   - Keyed on COALESCE(customer_id, serial) like every other customer figure
//     (invariant 5). Keyed on the pass, someone holding an Apple and a Google
//     card at one shop read as two customers who each came once and never came
//     back — which is how a shop with regulars could show a 2nd-visit rate of
//     zero.
//   - Visits are NET stamps, so an `undo` correcting a mis-scan takes its stamp
//     back off. Counting raw stamp events made a scan-then-undo look like a
//     returning customer.
//
// Shared verbatim by the per-merchant rows and the platform total below. The
// platform figure cannot be averaged from the merchant rows — a rate over 3
// customers and a rate over 300 do not average — so it is recomputed over
// everyone, and this constant is what stops the two definitions drifting.
const RETENTION_CTE = `WITH person AS (
       SELECT c.merchant_id,
              ${PERSON_KEY_SQL} AS person,
              min(p.created_at) AS joined,
              GREATEST(count(*) FILTER (WHERE e.type = 'stamp')
                     - count(*) FILTER (WHERE e.type = 'undo'), 0)::int AS n,
              min(e.created_at) FILTER (WHERE e.type = 'stamp') AS first_stamp,
              max(e.created_at) FILTER (WHERE e.type = 'stamp') AS last_stamp,
              min(e.created_at) FILTER (WHERE e.type = 'redeem') AS first_redeem
         FROM passes p
         JOIN cards c ON c.id = p.card_id
         LEFT JOIN events e ON e.serial = p.serial
        GROUP BY c.merchant_id, ${PERSON_KEY_SQL}
     ),
     started AS (SELECT * FROM person WHERE n > 0)`;

/**
 * The retention columns, over whichever population `scope` selects.
 *
 * `scope` is SQL this file writes, never anything a caller supplies — it is
 * either "s.merchant_id = m.id" for one business or a live-merchant filter for
 * the platform.
 */
function retentionColumnsSql(scope: string, aliveScope: string): string {
  const rate = (filter: string) =>
    `COALESCE((SELECT count(*) FILTER (${filter})::numeric / NULLIF(count(*), 0)
                 FROM started s WHERE ${scope}), 0)::float8`;
  const alive = (days: number) => `COALESCE((
       SELECT count(*) FILTER (WHERE s.last_stamp > now() - interval '${days} days')::numeric
              / NULLIF(count(*), 0)
         FROM person s
        WHERE ${aliveScope} AND s.joined < now() - interval '${days} days'
     ), 0)::float8`;
  return `(SELECT count(*)::int FROM started s WHERE ${scope}) AS started,
            ${rate("WHERE n >= 2")} AS second_visit_rate,
            ${rate("WHERE n >= 3")} AS third_visit_rate,
            (SELECT percentile_cont(0.5) WITHIN GROUP (
                      ORDER BY extract(epoch FROM (last_stamp - first_stamp)) / 86400.0 / (n - 1))
               FROM started s WHERE ${scope} AND n >= 2)::float8 AS median_gap_days,
            ${rate("WHERE first_redeem IS NOT NULL")} AS completion_rate,
            (SELECT percentile_cont(0.5) WITHIN GROUP (
                      ORDER BY extract(epoch FROM (first_redeem - s.joined)) / 86400.0)
               FROM started s WHERE ${scope} AND first_redeem IS NOT NULL)::float8 AS median_days_to_reward,
            (SELECT percentile_cont(0.5) WITHIN GROUP (
                      ORDER BY extract(epoch FROM (first_stamp - s.joined)) / 86400.0)
               FROM started s WHERE ${scope})::float8 AS median_days_to_first_stamp,
            ${alive(30)} AS alive_30,
            ${alive(60)} AS alive_60,
            ${alive(90)} AS alive_90`;
}

/**
 * Retention per merchant. Grouped by business because that is the unit you act
 * on, and because rates and medians cannot be merged across cards afterwards.
 */
export async function adminRetention(): Promise<AdminRetentionRow[]> {
  const res = await getPool().query<AdminRetentionRow>(
    `${RETENTION_CTE}
     SELECT m.id, m.name,
            ${retentionColumnsSql("s.merchant_id = m.id", "s.merchant_id = m.id")}
       FROM merchants m
      ORDER BY m.created_at DESC`,
  );
  return res.rows;
}

/**
 * The same figures across every LIVE merchant at once — the portfolio view.
 *
 * Archived shops are excluded: a closed account's customers are not evidence
 * about whether the product retains people, and leaving them in would drag the
 * platform number down for a reason that has nothing to do with the product.
 */
export async function platformRetention(): Promise<AdminRetentionRow> {
  const live = `EXISTS (SELECT 1 FROM merchants mm
                         WHERE mm.id = s.merchant_id AND mm.archived_at IS NULL)`;
  const res = await getPool().query<AdminRetentionRow>(
    `${RETENTION_CTE}
     SELECT 'platform'::text AS id, 'Everyone'::text AS name,
            ${retentionColumnsSql(live, live)}`,
  );
  return res.rows[0]!;
}

export interface AdminStaffRow {
  /** MERCHANT id. There is one staff PIN per owner covering every card they
   *  run, so a counter phone was never card-scoped — grouping by card split one
   *  phone into two rows the moment a merchant ran two programmes. */
  merchant_id: string;
  /** `staff:<deviceId>` — a PHONE, not a person. A re-sign-in mints a new one. */
  actor: string;
  stamps: number;
  redeems: number;
  undos: number;
  forced: number;
  first_seen: Date;
  last_seen: Date;
}

// `adminFunnel()` used to live here: one row per card of
// scanned → tapped Add → card made → landed. It was deleted, not moved.
// `merchantHealth` already computes every one of those figures per merchant
// (plus the `?s=` channel split, plus removed/dropped) off the same events, and
// two implementations of one funnel is how the two of them drift. The console
// rendered both and they were always the same rows twice.
//
// The reasoning it carried is worth keeping, because it still governs the
// surviving copy:
//
//   - Derived entirely from `events`, never from `passes` rows. The original
//     counted passes, which meant `pruneAbandonedPasses` quietly erased the
//     evidence of a leak 30 days after it happened. `events.serial` has no
//     foreign key to `passes`, so a pruned card leaves its join_view,
//     wallet_click and enroll rows exactly where they were.
//   - `landed` comes from `pass_added`, which Apple has always reported and
//     Google only reports since the issuer callback was configured, so it reads
//     low for older Android sign-ups. The console must keep saying so.

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
    `SELECT c.merchant_id, e.actor,
            count(*) FILTER (WHERE e.type = 'stamp')::int AS stamps,
            count(*) FILTER (WHERE e.type = 'redeem')::int AS redeems,
            count(*) FILTER (WHERE e.type = 'undo')::int AS undos,
            count(*) FILTER (WHERE e.forced)::int AS forced,
            min(e.created_at) AS first_seen, max(e.created_at) AS last_seen
       FROM events e JOIN cards c ON c.id = e.card_id
      WHERE e.actor LIKE 'staff:%'
      GROUP BY c.merchant_id, e.actor
      ORDER BY count(*) FILTER (WHERE e.type = 'stamp') DESC
      LIMIT 200`,
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

/**
 * The cards an owner actually runs. Archived ones are excluded everywhere this
 * is used — the dashboard, the staff card switcher, the customer list — which
 * is the whole point of archiving. Their passes still stamp: `applyAndPush`
 * resolves the pass's OWN card by id, so a customer holding a retired card is
 * never turned away at the counter.
 */
export async function cardsForOwner(ownerId: string): Promise<CardRow[]> {
  const res = await getPool().query<CardRow>(
    `SELECT c.* FROM cards c JOIN owner_cards oc ON oc.card_id = c.id
      WHERE oc.owner_id = $1 AND c.archived_at IS NULL ORDER BY c.created_at`,
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

/**
 * Restarts the card after a reward, on today's rules.
 *
 * Two things happen in one statement, and they belong together:
 *
 * 1. It restarts at the café's welcome-stamp count, not 0, so a loyal returning
 *    customer is never worse off than someone walking in for the first time.
 * 2. It takes the card's CURRENT reward and target. A pass otherwise keeps the
 *    ruleset it was issued with forever, which is right while the promise is
 *    outstanding — but the promise has just been kept, so this is the honest
 *    moment to move them on, and it is the only one that doesn't require the
 *    customer to delete their card and rescan the QR.
 *
 * One statement so a pass can never be observed half-way between two rulesets.
 * Callers that log this must read the pass AFTER it, not before: `logEvent`
 * takes the target in force from the pass row.
 */
export async function redeemPass(serial: string): Promise<PassRow | null> {
  const res = await getPool().query<PassRow>(
    `UPDATE passes p
        SET stamp_count   = LEAST(GREATEST(c.stamps_start, 0), c.stamps_target),
            stamps_target = c.stamps_target,
            reward        = c.reward,
            updated_at    = now()
       FROM cards c
      WHERE p.serial = $1 AND c.id = p.card_id
      RETURNING p.*`,
    [serial],
  );
  return res.rows[0] ?? null;
}

/**
 * Bring a pass that is being RE-ISSUED onto today's reward and target.
 *
 * A pass snapshots its ruleset when it is created, and that is right while it
 * sits in a wallet: a promise already made shouldn't change under the customer.
 * But re-enrolling is the customer explicitly asking for the card again — they
 * deleted it and scanned the poster, or tapped Add a second time — and handing
 * them a card advertising a reward the shop stopped offering is worse than
 * moving them on. Delete-and-re-add otherwise returned the identical old card,
 * which reads as the site being broken.
 *
 * Their stamps are kept, clamped to the new target: a lower target must not
 * leave someone sitting above their own goal.
 */
export async function reissuePass(serial: string): Promise<PassRow | null> {
  const res = await getPool().query<PassRow>(
    `UPDATE passes p
        SET stamps_target = c.stamps_target,
            reward        = c.reward,
            stamp_count   = LEAST(p.stamp_count, c.stamps_target),
            updated_at    = now()
       FROM cards c
      WHERE p.serial = $1 AND c.id = p.card_id
        AND (p.stamps_target <> c.stamps_target OR p.reward <> c.reward
             OR p.stamp_count > c.stamps_target)
      RETURNING p.*`,
    [serial],
  );
  // No row means nothing needed changing — the caller keeps what it had.
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

/**
 * Append one row to the log. Returns its id so a caller can hang a related row
 * off it (see `logMessage`).
 *
 * Anything the caller leaves out is filled in from the pass itself, in the same
 * statement — merchant, customer, platform, progress and the target in force.
 * That is deliberate: these columns exist precisely because they must be true
 * for every row, and a call site that forgets one would leave a hole that only
 * shows up months later in a query that silently under-counts. The only way to
 * get it wrong is to pass a wrong value, not to omit one.
 *
 * `serial` may name a pass that does not exist yet — `join_view` happens before
 * anyone has a card — in which case the pass-derived columns stay null and the
 * caller's own values (merchantId, platform) are what get written.
 */
export async function logEvent(
  cardId: string,
  serial: string,
  type: EventType,
  meta: EventMeta = {},
): Promise<number | null> {
  const deviceId =
    meta.deviceId ?? (meta.actor?.startsWith("staff:") ? meta.actor.slice("staff:".length) : "");
  const res = await getPool().query<{ id: string }>(
    `INSERT INTO events (
       card_id, serial, type, actor, forced, source,
       merchant_id, customer_id, platform, device_id, staff_id,
       stamps_after, stamps_target, metadata
     )
     SELECT $1, $2, $3, $4, $5, $6,
            COALESCE($7, c.merchant_id),
            COALESCE($8, p.customer_id),
            COALESCE(NULLIF($9, ''), p.platform, ''),
            $10, $11,
            COALESCE($12, p.stamp_count),
            COALESCE($13, p.stamps_target),
            $14::jsonb
       FROM (SELECT $1::text AS id) k
       LEFT JOIN passes p ON p.serial = $2
       LEFT JOIN cards  c ON c.id = k.id
     RETURNING id`,
    [
      cardId,
      serial,
      type,
      meta.actor ?? "",
      meta.forced === true,
      meta.source ?? "",
      meta.merchantId ?? null,
      meta.customerId ?? null,
      meta.platform ?? "",
      deviceId,
      meta.staffId ?? null,
      meta.stampsAfter ?? null,
      meta.stampsTarget ?? null,
      JSON.stringify(meta.metadata ?? {}),
    ],
  );
  return res.rows[0] ? Number(res.rows[0].id) : null;
}

/**
 * Has this Google callback nonce already been recorded? Replay protection for
 * the one endpoint a stranger could otherwise POST to repeatedly.
 */
export async function seenGoogleNonce(nonce: string): Promise<boolean> {
  if (!nonce) return false;
  const res = await getPool().query(
    `SELECT 1 FROM events WHERE metadata->>'nonce' = $1 LIMIT 1`,
    [nonce],
  );
  return (res.rowCount ?? 0) > 0;
}

/** What was actually sent, and whether it landed. See the `messages` table. */
export interface MessageRecord {
  eventId: number | null;
  serial: string;
  customerId: string | null;
  cardId: string;
  /** `auto-winback` (the hourly job) or `manual-nudge` (the dashboard button). */
  kind: string;
  body: string;
  platform: string;
  /** null when the platform is unconfigured and nothing was attempted. */
  delivered: boolean | null;
  failReason?: string;
}

export async function logMessage(m: MessageRecord): Promise<void> {
  await getPool().query(
    `INSERT INTO messages (event_id, serial, customer_id, card_id, kind, body, platform, delivered, fail_reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      m.eventId,
      m.serial,
      m.customerId,
      m.cardId,
      m.kind,
      m.body,
      m.platform,
      m.delivered,
      m.failReason ?? "",
    ],
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

/**
 * The maturity window for return rate: a card younger than this is not counted
 * either way. Without it, handing out 100 cards on a Saturday would crater the
 * number on Sunday and then quietly climb back over a fortnight — motion that
 * says nothing about the shop.
 */
export const RETURN_WINDOW_DAYS = 7;

export interface CafeMetrics {
  /** Real customers: cards that were stamped at least once, or confirmed added to a wallet. */
  active: number;
  /** Every pass row ever minted, including ones that never reached a wallet. */
  cards: number;
  stamps: number;
  redemptions: number;
  stamps30d: number;
  redemptions30d: number;
  /**
   * Customers old enough to judge, and how many of them ever came back for a
   * scan. Null rate — never 0 — when nobody is old enough yet: a shop in its
   * first week has no answer, and a confident 0% would read as one.
   *
   * Enrolment gives its welcome stamps by setting stamp_count and logs an
   * `enroll`, never a `stamp` (routes/public.ts), so a stamp event here always
   * means staff actually scanned somebody.
   */
  matured: number;
  returned: number;
  returnRate: number | null;
}

export async function cardMetrics(cardId: string): Promise<CafeMetrics> {
  // Same definition of "customer" as the headline beside it — ACTIVE_PASS_SQL,
  // counted per PERSON. A different one here is exactly how the Home headline
  // came to disagree with the list under it, twice.
  const MATURE_PASS_SQL = `p.card_id = $1 AND ${ACTIVE_PASS_SQL}
          AND p.created_at < now() - interval '${RETURN_WINDOW_DAYS} days'`;
  const res = await getPool().query<{
    active: string;
    cards: string;
    stamps: string;
    redemptions: string;
    stamps30d: string;
    redemptions30d: string;
    matured: string;
    returned: string;
  }>(
    `SELECT
       (SELECT count(DISTINCT ${PERSON_KEY_SQL}) FROM passes p
          WHERE p.card_id = $1 AND ${ACTIVE_PASS_SQL})::text AS active,
       (SELECT count(*) FROM passes WHERE card_id = $1)::text AS cards,
       GREATEST(count(*) FILTER (WHERE type = 'stamp')
              - count(*) FILTER (WHERE type = 'undo'), 0)::text AS stamps,
       count(*) FILTER (WHERE type = 'redeem')::text AS redemptions,
       GREATEST(count(*) FILTER (WHERE type = 'stamp' AND created_at > now() - interval '30 days')
              - count(*) FILTER (WHERE type = 'undo'  AND created_at > now() - interval '30 days'), 0)::text AS "stamps30d",
       count(*) FILTER (WHERE type = 'redeem' AND created_at > now() - interval '30 days')::text AS "redemptions30d",
       (SELECT count(DISTINCT ${PERSON_KEY_SQL}) FROM passes p
          WHERE ${MATURE_PASS_SQL})::text AS matured,
       (SELECT count(DISTINCT ${PERSON_KEY_SQL}) FROM passes p
          WHERE ${MATURE_PASS_SQL}
            AND EXISTS (SELECT 1 FROM events e
                         WHERE e.serial IN ${CUSTOMER_SERIALS_SQL} AND e.type = 'stamp'))::text AS returned
     FROM events WHERE card_id = $1`,
    [cardId],
  );
  const r = res.rows[0]!;
  const matured = Number(r.matured);
  const returned = Number(r.returned);
  return {
    active: Number(r.active),
    cards: Number(r.cards),
    stamps: Number(r.stamps),
    redemptions: Number(r.redemptions),
    stamps30d: Number(r.stamps30d),
    redemptions30d: Number(r.redemptions30d),
    matured,
    returned,
    returnRate: matured ? returned / matured : null,
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

// ------------------------------------------------------ counter activity ----

/** How long a staff device stays in the list. See `counterActivity`. */
const DEVICE_WINDOW_DAYS = 14;

export interface CounterDay {
  /** ISO date, in the server's timezone — the same day boundary staff work to. */
  day: string;
  stamps: number;
  customers: number;
  rewards: number;
}

export interface CounterCorrection {
  at: Date;
  /** `undo` or `redeem`. Named, never interpreted. */
  type: string;
  /** The printed short code, so the owner can match it to a card if they want. */
  code: string | null;
}

export interface CounterDevice {
  /** `events.device_id` — a PHONE, and only since it last signed in. */
  device_id: string;
  first_seen: Date;
  last_seen: Date;
  stamps: number;
}

export interface CounterActivity {
  stamps: number;
  customers: number;
  /** Stamps staff confirmed past the 60s same-card cooldown. See below. */
  stampedAgain: number;
  rewards: number;
  takenBack: number;
  phones: number;
  lastStampAt: Date | null;
  days: CounterDay[];
  corrections: CounterCorrection[];
  devices: CounterDevice[];
}

/**
 * What happened at this shop's counter — facts, and only facts.
 *
 * The screen this feeds is deliberately not a staff-performance tool: there is
 * no per-staff identity in this system (one PIN per owner, any signed-in device
 * can stamp), so nothing here is attributed to a person and nothing is judged.
 * It returns counts; the owner decides whether any of them mean anything.
 *
 * Three things are true of this data that the UI must not get wrong:
 *
 * 1. **Welcome stamps are already excluded, for free.** A card's starting
 *    stamps and the restart after a reward are written straight to
 *    `passes.stamp_count` (`createPass`, `redeemPass`) and emit no event — so
 *    `type = 'stamp'` has only ever meant "somebody stamped at the counter".
 *    There is nothing to filter out, and nothing that could drift.
 * 2. **`forced` is the literal "stamped again in one interaction" event**, not
 *    an inference. The stamper refuses a second stamp on the same card inside
 *    60s (STAMP_COOLDOWN_MS, src/routes/staff.ts) unless staff confirm, and the
 *    confirmation is what sets this column. A forced stamp is still one stamp:
 *    it counts once in `stamps` and once in `stampedAgain`, never twice in
 *    either.
 * 3. **Customers are PEOPLE** (invariant 5). Someone holding an Apple and a
 *    Google card is one customer stamped, not two.
 *
 * `undo` is the only correction that exists. There is no "stamp added" edit —
 * adding a stamp IS the ordinary action — so the caller must not present one.
 */
export async function counterActivity(cardIds: string[]): Promise<CounterActivity> {
  const empty: CounterActivity = {
    stamps: 0, customers: 0, stampedAgain: 0, rewards: 0, takenBack: 0,
    phones: 0, lastStampAt: null, days: [], corrections: [], devices: [],
  };
  if (cardIds.length === 0) return empty;

  const sql = getPool();
  // "Today" is the server's day, which is the day boundary staff work to.
  const today = `e.created_at >= date_trunc('day', now())`;
  const [totals, days, corrections, devices] = await Promise.all([
    sql.query<{
      stamps: string; customers: string; stamped_again: string; rewards: string;
      taken_back: string; phones: string; last_stamp: Date | null;
    }>(
      `SELECT count(*) FILTER (WHERE e.type = 'stamp' AND ${today})::text AS stamps,
              count(DISTINCT COALESCE(e.customer_id, e.serial))
                FILTER (WHERE e.type = 'stamp' AND ${today})::text AS customers,
              count(*) FILTER (WHERE e.type = 'stamp' AND e.forced AND ${today})::text AS stamped_again,
              count(*) FILTER (WHERE e.type = 'redeem' AND ${today})::text AS rewards,
              count(*) FILTER (WHERE e.type = 'undo' AND ${today})::text AS taken_back,
              count(DISTINCT e.device_id)
                FILTER (WHERE e.type = 'stamp' AND e.device_id <> '' AND ${today})::text AS phones,
              max(e.created_at) FILTER (WHERE e.type = 'stamp') AS last_stamp
         FROM events e WHERE e.card_id = ANY($1)`,
      [cardIds],
    ),
    // One row per day for the last week, including days with nothing on them —
    // a missing Sunday reads as an error, a Sunday with 0 reads as a Sunday.
    sql.query<CounterDay>(
      `SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
              count(*) FILTER (WHERE e.type = 'stamp')::int AS stamps,
              count(DISTINCT COALESCE(e.customer_id, e.serial))
                FILTER (WHERE e.type = 'stamp')::int AS customers,
              count(*) FILTER (WHERE e.type = 'redeem')::int AS rewards
         FROM generate_series(date_trunc('day', now()) - interval '6 days',
                              date_trunc('day', now()), interval '1 day') AS d(day)
         LEFT JOIN events e
                ON e.card_id = ANY($1)
               AND e.created_at >= d.day
               AND e.created_at < d.day + interval '1 day'
        GROUP BY d.day
        ORDER BY d.day DESC`,
      [cardIds],
    ),
    // Corrections and rewards together: one list is the whole picture of what
    // was changed at the counter today, and two popups for it would be worse.
    sql.query<CounterCorrection>(
      `SELECT e.created_at AS at, e.type, p.short_code AS code
         FROM events e LEFT JOIN passes p ON p.serial = e.serial
        WHERE e.card_id = ANY($1) AND e.type IN ('undo', 'redeem') AND ${today}
        ORDER BY e.created_at DESC
        LIMIT 100`,
      [cardIds],
    ),
    // Phones that have STAMPED in the window — there is no device registry, so a
    // device first exists here when it does something. The window matches
    // STAFF_DAYS (src/auth.ts): a device that has not stamped in that long has
    // an expired session anyway, so listing it would overstate the counter.
    sql.query<CounterDevice>(
      `SELECT e.device_id,
              min(e.created_at) AS first_seen,
              max(e.created_at) AS last_seen,
              count(*) FILTER (WHERE e.type = 'stamp')::int AS stamps
         FROM events e
        WHERE e.card_id = ANY($1) AND e.device_id <> ''
          AND e.created_at > now() - interval '${DEVICE_WINDOW_DAYS} days'
        GROUP BY e.device_id
        ORDER BY max(e.created_at) DESC
        LIMIT 50`,
      [cardIds],
    ),
  ]);

  const t = totals.rows[0];
  return {
    stamps: Number(t?.stamps ?? 0),
    customers: Number(t?.customers ?? 0),
    stampedAgain: Number(t?.stamped_again ?? 0),
    rewards: Number(t?.rewards ?? 0),
    takenBack: Number(t?.taken_back ?? 0),
    phones: Number(t?.phones ?? 0),
    lastStampAt: t?.last_stamp ?? null,
    days: days.rows,
    corrections: corrections.rows,
    devices: devices.rows,
  };
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

/**
 * APNs answered 410 Unregistered for this token: that device no longer holds
 * the pass. Apple hands this over for free on the next push and it was being
 * discarded — a second, independent churn signal alongside the web service's
 * DELETE, and the only one that catches a pass removed while the phone was
 * offline.
 *
 * Deliberately does NOT log `pass_removed` (which `deleteRegistration` does):
 * that event gates whether a customer may be nudged, and a delivery failure
 * quietly changing who gets messaged is a behaviour change, not a logging one.
 * The dead row still goes, because pushing to it forever is pure waste.
 */
export async function dropDeadRegistration(pushToken: string): Promise<void> {
  const gone = await getPool().query<{ serial: string; card_id: string }>(
    `DELETE FROM registrations r USING passes p
      WHERE r.push_token = $1 AND p.serial = r.serial
      RETURNING r.serial, p.card_id`,
    [pushToken],
  );
  for (const row of gone.rows) {
    await logEvent(row.card_id, row.serial, "pass_dropped", {
      actor: "customer",
      platform: "apple",
      metadata: { platform_source: "apns", status: 410, reason: "Unregistered" },
    });
  }
}

/** Push tokens registered for a pass (usually one device, can be several). */
export async function pushTokensForSerial(serial: string): Promise<string[]> {
  const res = await getPool().query<{ push_token: string }>(
    `SELECT DISTINCT push_token FROM registrations WHERE serial = $1`,
    [serial],
  );
  return res.rows.map((r) => r.push_token);
}
