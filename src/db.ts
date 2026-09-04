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
import { config, envName, seedCard } from "./config.js";

const { Pool } = pg;

/**
 * What KIND of loyalty card this is.
 *
 * PunchMe began as one thing — collect N stamps, get a reward — and every
 * surface in the app was written against that shape. This is the single setting
 * the rest of the code branches on, so a new type is a new value here plus the
 * branches it needs, never a parallel table or a second app.
 *
 * 'stamp'      the original: a counter climbing to a target, one reward at the top.
 * 'membership' no counter the customer ever sees. A check-in still records a
 *              stamp, because every metric, customer group and nudge in the app
 *              is derived from stamps — a card that never stamped would read as
 *              a shop whose customers had all left.
 * 'milestones' the same counter, with several rewards up the ladder instead of
 *              one at the top. Reaching 2 pays out and the card CARRIES ON from
 *              2; only the last rung restarts it.
 * 'points'     a balance that goes up by whatever staff enter and DOWN when it
 *              is spent against a catalogue of rewards. No grid: it has no
 *              ceiling, and strip images are one picture per count.
 *
 * The strings are stored and are effectively permanent: they sit in a column on
 * every card and every pass, and renaming one means rewriting both tables and
 * every branch together.
 */
export type CardKind = "stamp" | "membership" | "milestones" | "points";

const CARD_KINDS: readonly CardKind[] = ["stamp", "membership", "milestones", "points"];

/**
 * The dearest a single reward may be.
 *
 * A milestone card is capped at 20 because that number is also its stamp
 * count, and the grid is a pre-rendered picture per count. A points card draws
 * no grid, so its only real limit is that the number has to fit on a card.
 */
export const MAX_MILESTONE = 20;
export const MAX_POINTS_COST = 100_000;

/** Guard for anything arriving from a request body or an older row. */
export function asCardKind(v: unknown): CardKind {
  return CARD_KINDS.includes(v as CardKind) ? (v as CardKind) : "stamp";
}

/**
 * What SHAPE a reward is, so the card can say it in the customer's words.
 *
 * `reward` itself stays a plain sentence and is what every wallet, the staff
 * phone and the poster read — these columns exist so the Create flow can load
 * the owner's answers back and re-word that sentence, never so anything
 * downstream has to branch on them.
 *
 * 'item'    something they hand over. The owner types the words.
 * 'amount'  money off, in cents  ->  "RM5 off"
 * 'percent' a share off, with a ceiling  ->  "20% off up to RM10"
 */
export type RewardType = "item" | "amount" | "percent";

const REWARD_TYPES: readonly RewardType[] = ["item", "amount", "percent"];

export function asRewardType(v: unknown): RewardType {
  return REWARD_TYPES.includes(v as RewardType) ? (v as RewardType) : "item";
}

/**
 * Money as a shop would write it: "RM5", "RM5.50".
 *
 * Whole ringgit lose the ".00" — a card reading "RM5.00 off" at arm's length is
 * two characters of noise on the line with least room on it.
 */
export function moneyLabel(cents: number): string {
  const n = Math.max(0, Math.round(cents));
  return n % 100 === 0 ? `RM${n / 100}` : `RM${(n / 100).toFixed(2)}`;
}

/**
 * One rung of a milestone card: a count, and what the customer gets for
 * reaching it.
 *
 * Stored as jsonb rather than its own table because it is only ever read and
 * written whole — and because the PASS needs a frozen copy of the same list,
 * which a child table would have had to duplicate row for row anyway.
 */
export interface Milestone {
  at: number;
  reward: string;
}

/**
 * Whatever came out of the database or off a request, as a usable ladder.
 *
 * Sorted, de-duplicated on `at`, and stripped of anything malformed. Every
 * reader assumes ascending order — `rewards_claimed` is an INDEX into this
 * list, so a list that arrived out of order would hand out the wrong prize.
 */
export function asMilestones(v: unknown, max = MAX_MILESTONE): Milestone[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<number>();
  return v
    .map((m) => {
      const at = Math.trunc(Number((m as Milestone)?.at));
      const reward = String((m as Milestone)?.reward ?? "").trim().slice(0, 60);
      return { at, reward };
    })
    .filter((m) => Number.isFinite(m.at) && m.at >= 1 && m.at <= max && m.reward)
    .sort((a, b) => a.at - b.at)
    .filter((m) => (seen.has(m.at) ? false : (seen.add(m.at), true)))
    .slice(0, 6);
}

/**
 * The amounts a points counter offers as one-tap buttons, e.g. "10,20,50".
 *
 * Presets rather than a free number pad because stamping is one tap today and
 * deliberately hard to get wrong; typing any number on a busy counter is how
 * 500 lands where 50 was meant. A custom amount is still reachable, behind a
 * second tap.
 */
export function asPointPresets(v: unknown): number[] {
  const raw = Array.isArray(v) ? v : String(v ?? "").split(",");
  const seen = new Set<number>();
  return raw
    .map((n) => Math.trunc(Number(String(n).trim())))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= MAX_POINTS_COST)
    .filter((n) => (seen.has(n) ? false : (seen.add(n), true)))
    .sort((a, b) => a - b)
    .slice(0, 4);
}

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
  /** Which kind of loyalty card this is — see CardKind. */
  kind: CardKind;
  /**
   * What a membership buys, one perk per line. Empty on a stamp card.
   *
   * Deliberately NOT snapshotted onto the pass the way reward and stamps_target
   * are. A stamp target is a promise with a number in it, and moving it under
   * someone mid-card is exactly what the snapshot exists to prevent; a perks
   * list is a description of what the shop offers today, so editing it updates
   * every member's card, which is what a shop expects when they add a perk.
   */
  benefits: string;
  /**
   * The reward ladder on a 'milestones' card, ascending. Empty on every other
   * kind. `stamps_target` is kept equal to the LAST rung, so the grid, the
   * strip images and every query that reads a target keep working unchanged.
   */
  milestones: Milestone[];
  /**
   * The reward's shape, and the numbers behind it. `reward` above is the
   * sentence built FROM these — see rewardSentence in src/cardView.ts. Nothing
   * that renders a card reads these; they exist so the Create flow can load the
   * owner's answers back and re-word the sentence.
   */
  reward_type: RewardType;
  reward_value_cents: number;
  reward_percent: number;
  reward_cap_cents: number;
  /**
   * How many stamps one visit is worth. Almost always 1.
   *
   * Snapshotted onto the pass at issue like stamps_target and reward, because
   * it is half of the promise: a shop dropping this from 2 to 1 would otherwise
   * double the visits somebody part-way through still owes.
   */
  stamps_per_visit: number;
  /**
   * One-tap amounts on a points counter, stored the way the owner typed them
   * ("10,20,50"). Text like `benefits`, for the same reason: it is a short list
   * the owner edits as one string, and asPointPresets is the single place it
   * becomes numbers.
   */
  point_presets: string;
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
  /** Unused — see migrate(). The column cannot be dropped, so the field stays. */
  logo_tint: string;
  /**
   * The uploaded logo already reads as the shop's name — a brand lockup, mark
   * and wordmark together. Apple draws logoText BESIDE the logo image, so
   * without this the name appears twice; with it the pass omits logoText and
   * the lockup owns the band. organizationName keeps the name either way.
   */
  logo_has_name: boolean;
  /** The owner's own line on the sign-up page; '' falls back to the generated one. */
  signup_message: string;
  /** Retired: hidden from the owner and off the join link. Issued passes still work. */
  archived_at: Date | null;
  /**
   * When the owner finished making this card. NULL means they are still in the
   * Create flow and have not finished — the card exists so it can be resumed on
   * any device, but nothing may hand it to a customer until this is set.
   */
  published_at: Date | null;
  /**
   * Finished: no NEW sign-ups, and nothing else changes.
   *
   * NOT archived_at, which means gone — cardsForMerchant filters those rows out
   * entirely and the owner stops seeing the card at all. An ENDED programme is
   * still listed, still stamped, still redeemed and still counted; the only door
   * that closes is the one new customers come through. Two states, two columns.
   * Never overload the one that hides things: a shop that ends a promotion has
   * not deleted the promise made to everyone already holding the card.
   */
  ended_at: Date | null;
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
  /**
   * The card's kind, frozen at issue alongside reward and stamps_target.
   *
   * Here rather than read from `cards` because it is the most load-bearing part
   * of the ruleset: flipping a live card from a stamp card to a membership card
   * would otherwise silently rewrite what every customer is already holding,
   * blanking targets people are part-way towards.
   */
  kind: CardKind;
  /** How many stamps a visit earns, frozen at issue with the rest of the deal. */
  stamps_per_visit: number;
  /**
   * The reward ladder this pass was ISSUED with, frozen like reward and
   * stamps_target. A shop that drops the 5-stamp prize must not un-give it to
   * somebody who has already collected it.
   */
  milestones: Milestone[];
  /**
   * How many rungs of that ladder have already been paid out — and therefore
   * the INDEX of the next one. Reset to 0 only when the last rung pays out and
   * the card restarts.
   */
  rewards_claimed: number;
  reward: string;
  /** Free-form message surfaced on the pass back + pushed to the lock screen. */
  message: string;
  /** When `message` was last set — folded into the pass so repeat sends still banner. */
  message_sent_at: Date | null;
  created_at: Date;
  updated_at: Date;
  /**
   * A card the owner or the operator added to their own wallet to look at it.
   * Behaves exactly like a real pass everywhere it is scanned or pushed, and is
   * excluded from every count anybody reads — see REAL_PASS_SQL.
   */
  is_test: boolean;
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
  /**
   * How much this event moved the counter. Left unset it is NULL, which every
   * query reads as 1 — the meaning every row written before points existed
   * already had. Only a points stamp, undo or redeem needs to say otherwise.
   */
  amount?: number | null;
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
  // Before anything else — even the rename: refuse a cross-wired database.
  await ensureEnvStamp(envName());
  // Must run before the tables below: everything below is written in the new names.
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
    -- resolving forever, because it may be printed on a poster
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
    -- v2.0: a shop can exist before anybody can log into it.
    --
    -- Merchants are onboarded done-for-you: we agree over DM, build their card
    -- here, and send a claim link. Until they claim it there is no login, so
    -- owner_id cannot be NOT NULL any more. The uniqueness it carried is kept
    -- as a PARTIAL index below — one merchant per login still holds for every
    -- claimed shop, and unclaimed ones simply are not in it.
    --
    -- This is the first non-additive change to a live column in this schema.
    -- It only ever WIDENS what the column accepts, so an existing row cannot be
    -- invalidated by it and a rollback needs no data repair. pnpm test:migration
    -- builds a real pre-v2.0 database and upgrades it.
    ALTER TABLE merchants ALTER COLUMN owner_id DROP NOT NULL;
    DROP INDEX IF EXISTS idx_merchants_owner;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_merchants_owner
      ON merchants(owner_id) WHERE owner_id IS NOT NULL;
    -- The claim link. It lives on the MERCHANT because there is no owner to
    -- hang it off yet, and no email is collected before the claim page.
    -- claim_token_hash is what a presented token is compared against; the link
    -- expires and is cleared the moment it is used.
    ALTER TABLE merchants ADD COLUMN IF NOT EXISTS claim_token_hash text;
    ALTER TABLE merchants ADD COLUMN IF NOT EXISTS claim_expires timestamptz;
    ALTER TABLE merchants ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
    -- v2.1: the token in PLAIN TEXT, so an operator can find a link they already
    -- sent instead of minting a replacement and killing the one in the DM.
    --
    -- This was hash-only on purpose and the trade is deliberate, so it is
    -- written down here rather than discovered later: while a link is out, this
    -- column holds a live credential for an unclaimed shop, and it is inside
    -- every backup dump taken in that window. Cleared the instant the link is
    -- claimed or withdrawn, so only outstanding links are ever readable, and
    -- the exposure is capped by CLAIM_TTL_MS (7 days). See src/claim.ts.
    ALTER TABLE merchants ADD COLUMN IF NOT EXISTS claim_token text;
    -- When a shop was taken back off an owner (a wrong claim, handed on). Paired
    -- with claimed_at rather than erasing it: both are history, and "claimed the
    -- 7th, handed back the 8th" is the answer to a dispute.
    ALTER TABLE merchants ADD COLUMN IF NOT EXISTS unclaimed_at timestamptz;
    -- The one lifecycle fact no data implies. Everything else the console shows
    -- as a stage — unclaimed, claimed, first stamp, archived — is derived from
    -- rows that already exist, because a stored status is a second source of
    -- truth that drifts the first time a write is missed.
    ALTER TABLE merchants ADD COLUMN IF NOT EXISTS paid_at timestamptz;
    -- What the shop has RIGHT NOW: 'free' or 'pro'. Text, not a boolean, because
    -- a second paid tier is expected and a yes/no column would have to be
    -- replaced to get one — this one only needs a new string.
    --
    -- It replaces paid_at as the thing anything READS. paid_at stays, and
    -- stays written, but it now means only "when they first went pro" —
    -- history, in the same spirit as the event log: a downgrade is a new fact,
    -- not an erasure of the old one. Nothing may branch on paid_at again, or
    -- the two can disagree about whether a shop is paying.
    ALTER TABLE merchants ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free';
    -- When this shop's trial runs out. NULL means "work it out" — TRIAL_DAYS
    -- from their first stamp, exactly as before — so every existing shop keeps
    -- the date it already had and nothing needed backfilling. Setting it is the
    -- only way to give ONE shop longer, which a derived date can never do.
    ALTER TABLE merchants ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;
    -- v2.3: how often this shop expects a customer back, in days.
    --
    -- NULLABLE on purpose, and it is the only nullable setting here. NULL means
    -- "not chosen yet", which is what the dashboard's setup banner reads to ask
    -- for it — a NOT NULL DEFAULT would make every existing shop indistinguishable
    -- from one that had answered, and the answer is the thing that makes the
    -- customer groups mean anything. Until it is set the groups fall back to 14
    -- days rather than showing nothing.
    ALTER TABLE merchants ADD COLUMN IF NOT EXISTS expected_return_days integer;
    -- v2.2: a logo that already says the shop's name.
    --
    -- Apple draws logoText BESIDE the logo image, so a proper brand lockup —
    -- mark and wordmark together, which is what a shop actually has a file of —
    -- put the name on the card twice. This says the picture carries the name, so
    -- the pass leaves logoText out and lets the lockup own the band.
    -- organizationName and description keep the name regardless: those are the
    -- Add sheet and the notification, where an unnamed card is worse.
    -- Defaults false, so every card already issued is unchanged.
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS logo_has_name boolean NOT NULL DEFAULT false;
    -- v2.5: a pass the shop owner (or the operator) added to their OWN wallet to
    -- see how the card looks. It is a real pass — a real wallet has to accept
    -- it — but it is not a customer, and it must never reach a number anybody
    -- reads. Every counting query excludes it (grep REAL_PASS_SQL); the
    -- operational ones that resolve a scan or push an update deliberately do
    -- not, because a test card has to behave exactly like a real one or it is
    -- not a test. Defaults false, so nothing already issued moves.
    ALTER TABLE passes ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
    CREATE INDEX IF NOT EXISTS idx_passes_test ON passes(card_id) WHERE is_test;
    -- v2.6: when the pass's message was last SET. Apple only banners a field
    -- whose VALUE changed, so re-sending the same wording used to update the
    -- card silently — no notification, ever, for a repeated message. The sent
    -- time is folded into the field's value (passModel) so every send differs.
    -- Deliberately not updated_at, which moves on every stamp: that would fire
    -- a second banner per stamp and break the one-notification-per-event rule.
    ALTER TABLE passes ADD COLUMN IF NOT EXISTS message_sent_at timestamptz;
    -- Mirrored onto customers so a person created only to hold a test card is
    -- excluded by the same rule, and onto events so the funnel and the counter
    -- log can filter without joining back to the pass on every row.
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
    -- v2.9: the customer said stop. A DATE rather than a flag, because when they
    -- asked is worth keeping and a boolean throws it away.
    --
    -- On the CUSTOMER, not the pass: a person holding an Apple and a Google card
    -- at one shop opted out once, not once per card (invariant 5). The one pass
    -- with a null customer_id is the unclaimed seeded card, which belongs to
    -- nobody and can therefore never opt out — optedOutSerial() answers false
    -- for it rather than failing.
    --
    -- It stops MARKETING only. A stamp still notifies: that push carries no
    -- wording of ours (Apple gets an EMPTY payload and the phone renders the
    -- card's own text), it is the service they asked for, and silencing it
    -- would leave their card showing stale progress until they happened to open
    -- it — breaking the product for them rather than respecting them.
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS opted_out_at timestamptz;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
    -- v2.2: a square version of the logo, for Google only.
    --
    -- Google's programLogo slot is small and near-square, so the wide lockup
    -- Apple wants shrinks to a sliver on Android. Optional: with no row here the
    -- class falls back to the main logo, which is exactly today's behaviour.
    CREATE TABLE IF NOT EXISTS card_logo_marks (
      card_id    text PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
      png        bytea NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    -- v2.2: the owner's own stamp shape.
    --
    -- This upload already existed in the designer and was never stored anywhere:
    -- it lived in one browser variable, so a reload — or a colour change, or a
    -- band tap — silently redrew every stamp as a plain circle. Only the word
    -- 'custom' in cards.stamp_style survived, which described an image nothing
    -- had kept. The alpha channel IS the shape (see shapeStamp), so what is
    -- stored here is the source art, not the rendered grid.
    CREATE TABLE IF NOT EXISTS card_stamp_icons (
      card_id    text PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
      png        bytea NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    -- v2.3: added for a logo-recolouring control (Original/White/Black) that was
    -- built and then removed — too fiddly for what it bought. The COLUMNS stay:
    -- migrations here are additive only, and src/backup.ts refuses a restore
    -- whose dump names a column the target lacks, so dropping these would
    -- strand every dump taken while they existed. Nothing reads or writes
    -- either one. Reuse them if the idea comes back; do not drop them.
    ALTER TABLE card_logos ADD COLUMN IF NOT EXISTS png_original bytea;
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS logo_tint text NOT NULL DEFAULT '';
    -- v2.6: marketing-site traffic.
    --
    -- Deliberately NOT in the events table. Its card_id is NOT NULL and
    -- references cards, and a visit to the landing page belongs to no card —
    -- there is nothing truthful to put there. It also keeps the two apart on
    -- purpose: events is the product's own append-only log, and a marketing
    -- page view is not a thing that happened to a customer's card.
    -- (No backticks anywhere in here: this whole block is inside a template
    -- literal, and one would end the string. CLAUDE.md 12.)
    --
    -- Anonymous by construction. device_id is a random string minted in the
    -- visitor's browser and means nothing anywhere else; there is no column here
    -- that could identify a person, which is what lets the privacy page keep
    -- saying what it says. Bots are RECORDED and flagged rather than dropped, so
    -- the filter can be tightened later without the history being already gone.
    CREATE TABLE IF NOT EXISTS site_views (
      id         bigserial PRIMARY KEY,
      kind       text NOT NULL DEFAULT 'view',
      path       text NOT NULL DEFAULT '/',
      device_id  text NOT NULL,
      source     text NOT NULL DEFAULT '',
      referrer   text NOT NULL DEFAULT '',
      ua         text NOT NULL DEFAULT '',
      is_bot     boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_site_views_time ON site_views(created_at);
    CREATE INDEX IF NOT EXISTS idx_site_views_device ON site_views(device_id, created_at);
    -- v2.7: the card's KIND, and what a membership buys.
    --
    -- On BOTH tables on purpose. A pass carries the ruleset it was issued with
    -- (see redeemPass), and the kind is the most load-bearing part of that
    -- ruleset: flipping a live card from a stamp card to a membership card must
    -- not rewrite what customers are already holding. Both default to 'stamp',
    -- so every card and every pass already out there is exactly what it was.
    ALTER TABLE cards  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'stamp';
    ALTER TABLE passes ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'stamp';
    -- One perk per line. Unlike reward and stamps_target this is NOT copied onto
    -- the pass: a perks list describes what the shop offers today, so editing it
    -- reaches every member rather than only the next person to sign up.
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS benefits text NOT NULL DEFAULT '';
    -- The reward ladder on a milestones card: [{at, reward}, ...], ascending.
    -- On the pass too, and for the same reason reward and stamps_target are —
    -- a shop that drops its 5-stamp prize must not un-give it to somebody who
    -- already collected it. rewards_claimed is the INDEX of the next rung, so
    -- the list has to stay in the order it was issued in.
    ALTER TABLE cards  ADD COLUMN IF NOT EXISTS milestones jsonb NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE passes ADD COLUMN IF NOT EXISTS milestones jsonb NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE passes ADD COLUMN IF NOT EXISTS rewards_claimed integer NOT NULL DEFAULT 0;
    -- The one-tap amounts a points counter offers, e.g. "10,20,50".
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS point_presets text NOT NULL DEFAULT '';
    -- v2.8: when the owner FINISHED making this card. NULL means they are still
    -- in the Create flow — the row exists so the flow can be left and picked up
    -- on another device, and nothing hands the card to a customer until this is
    -- set (liveCardsForMerchant, joinTargetCard, and shopOpen in public.ts).
    --
    -- DEFAULT now() on purpose, and it is the whole safety of this column.
    -- Adding it stamps every card that already exists, so nobody's live card
    -- turns into a draft on deploy; and every OTHER insert path — the seeded
    -- default card, the admin console, a future one nobody has written yet —
    -- keeps producing a live card without knowing this column exists. Only an
    -- explicit NULL is a draft, and only createCard({draft:true}) writes one.
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS published_at timestamptz DEFAULT now();
    -- v2.8: the reward's shape and its numbers. The reward column stays the
    -- sentence every wallet reads; these are what the Create flow asks for and
    -- re-words it from, so nothing downstream learns a reward can be a percent.
    -- 'item' is the default because that is what every existing reward is: a
    -- line of the owner's own words.
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS reward_type        text    NOT NULL DEFAULT 'item';
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS reward_value_cents integer NOT NULL DEFAULT 0;
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS reward_percent     integer NOT NULL DEFAULT 0;
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS reward_cap_cents   integer NOT NULL DEFAULT 0;
    -- How many stamps one visit earns. On the PASS as well, frozen at issue:
    -- halving the rate must not double what somebody part-way through owes.
    ALTER TABLE cards  ADD COLUMN IF NOT EXISTS stamps_per_visit integer NOT NULL DEFAULT 1;
    ALTER TABLE passes ADD COLUMN IF NOT EXISTS stamps_per_visit integer NOT NULL DEFAULT 1;
    -- How much this event MOVED.
    --
    -- Every metric in this file counts events: one stamp row is one stamp. On a
    -- points card one row can be fifty points, so a shop handing out fifty
    -- would read as having handed out one. NULL means one, which is what every
    -- row written before today meant and still means — so nothing historical
    -- has to be rewritten, and COALESCE(amount, 1) is the rule everywhere.
    ALTER TABLE events ADD COLUMN IF NOT EXISTS amount integer;
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
    `ALTER TABLE cards ADD COLUMN IF NOT EXISTS band_texture text NOT NULL DEFAULT 'flat'`,
  );
  // v2.10: a programme can be finished without being deleted. NULL — every
  // existing card — means running, which is the only honest default: a shop
  // that has never had the control cannot have used it.
  await getPool().query(`ALTER TABLE cards ADD COLUMN IF NOT EXISTS ended_at timestamptz`);
  // The default was 'gradient' — one of ten textures that no longer exist — so
  // every card created since they were removed was born holding a dead value.
  // Harmless to draw (the flatten below catches it on the next boot) but it
  // meant a brand-new card and a migrated one disagreed about the same band.
  await getPool().query(`ALTER TABLE cards ALTER COLUMN band_texture SET DEFAULT 'flat'`);
  // v2.4: the band is one flat colour, and the ten textures are gone. The column
  // stays (additive-only), but every row carrying a dead texture is flattened,
  // because leaving the old value is not harmless: the renderer's fall-through
  // for an unrecognised style was GRADIENT, not flat, so a card stored as
  // 'chevron' would have come back as a gradient — a look its owner never chose
  // and could no longer change.
  //
  // It must NEVER touch the two values that are alive. This ran as
  // `WHERE band_texture <> 'flat'` on the strength of "runs once; after it there
  // is nothing left to flatten", and that stopped being true the day 'image'
  // was introduced to mean *the banner is the owner's uploaded artwork, do not
  // regenerate over it*. Every restart then erased that flag, and the next
  // colour save would have painted a generated band over artwork with no other
  // copy. Name the live values; never write a predicate that means "everything
  // I did not think of".
  const flattened = await getPool().query(
    `UPDATE cards SET band_texture = 'flat' WHERE band_texture NOT IN ('flat', 'image')`,
  );
  if (flattened.rowCount) {
    console.log(`[migrate] band flattened on ${flattened.rowCount} card(s)`);
  }
  // A dated one-off, not a pattern. These two cards hold an uploaded banner
  // whose 'image' flag a restart erased before the predicate above was fixed;
  // nothing in the stored PNG says whether it was uploaded or generated, so the
  // repair cannot be derived and has to name them. Guarded on 'flat' so it is a
  // no-op the moment an owner legitimately presses Remove.
  const repaired = await getPool().query(
    `UPDATE cards SET band_texture = 'image'
      WHERE id IN ('b29zgjvm', 'fbe9ghdk') AND band_texture = 'flat'`,
  );
  if (repaired.rowCount) {
    console.log(`[migrate] band-upload flag restored on ${repaired.rowCount} card(s)`);
  }

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

  // Every shop already marked paying becomes 'pro'. One-time and idempotent:
  // once plan is set the predicate matches nothing, and a shop later moved back
  // to free is not dragged forward again because paid_at is history now.
  const planned = await getPool().query(
    `UPDATE merchants SET plan = 'pro' WHERE paid_at IS NOT NULL AND plan = 'free'`,
  );
  if (planned.rowCount) console.log(`[migrate] ${planned.rowCount} paying shop(s) moved to plan 'pro'`);

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
 * The safety catch between live and staging: the database remembers which copy
 * of the app it belongs to, and boot refuses a database stamped with a
 * different name. Pasting the LIVE database URL into the STAGING service's
 * Railway variables would otherwise let a test site quietly write to real
 * merchants' data — this turns that mistake into a refusal that names itself.
 *
 * First boot writes ENV_NAME into the empty table ("live" when nothing is
 * set, so production stamps itself correctly with no variable). The name is a
 * parameter so the e2e suite can prove the refusal without a second process.
 * Deliberately invisible to backups: app_env is excluded in src/backup.ts,
 * because the stamp describes the DEPLOYMENT a database serves, not the data
 * in it — a live dump restored into staging must not smuggle "live" along.
 */
export async function ensureEnvStamp(name: string): Promise<void> {
  await getPool().query(`CREATE TABLE IF NOT EXISTS app_env (name text PRIMARY KEY)`);
  const existing = await getPool().query<{ name: string }>(`SELECT name FROM app_env LIMIT 1`);
  const stamped = existing.rows[0]?.name;
  if (!stamped) {
    await getPool().query(`INSERT INTO app_env (name) VALUES ($1)`, [name]);
    console.log(`[migrate] stamped this database as "${name}"`);
    return;
  }
  if (stamped !== name) {
    throw new Error(
      `REFUSING TO START: this database belongs to "${stamped}" but this service is running as "${name}" (ENV_NAME). ` +
        `The wrong DATABASE_URL is almost certainly pasted into this service's Railway variables — ` +
        `each copy of PunchMe must point at its own database. Fix the variable; never edit the app_env table.`,
    );
  }
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
  /**
   * The login that runs this shop. **Null until they claim it** — we build a
   * merchant done-for-you before anybody has an account. A null owner is what
   * makes the staff page unreachable (no owner, no PIN) and what the console
   * reads as "unclaimed".
   */
  owner_id: string | null;
  /** The BUSINESS name — this is what customers see as the pass issuer. */
  name: string;
  /** Which card a bare /j/ link issues. Null = the merchant's only card. */
  default_card_id: string | null;
  average_spend_cents: number;
  currency: string;
  /** What they have now: 'free' or 'pro'. The only field that says so — see the
   *  migration note on why paid_at must never be read for this again. */
  plan: MerchantPlan;
  /** When their trial runs out. NULL = derive it (trialEndsAt, src/health.ts). */
  trial_ends_at: Date | null;
  /**
   * Days a shop expects between one customer's visits — 14, 21 or 28.
   *
   * NULL until the owner picks one; `RETURN_CYCLE_FALLBACK` stands in meanwhile.
   * It is what turns "5 visits" into a judgement: five visits is a regular at a
   * cafe and an unusually good year at a barber, and one number cannot be right
   * for both without the shop saying which it is.
   */
  expected_return_days: number | null;
  created_at: Date;
  archived_at: Date | null;
  /** Set when the claim link is used. Left standing after a hand-back. */
  claimed_at: Date | null;
  /** When the shop was last taken back off an owner. Beside claimed_at, not instead. */
  unclaimed_at: Date | null;
  claim_expires: Date | null;
  /** What a presented token is checked against. Present = a link is outstanding. */
  claim_token_hash: string | null;
  /** The outstanding link, readable so one already sent can be found again.
   *  Cleared on claim and on withdrawal — see src/claim.ts for the trade. */
  claim_token: string | null;
  paid_at: Date | null;
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
 * printed on a poster that nobody is going to reprint.
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

/**
 * Every card, archived ones included, oldest first.
 *
 * Archived is deliberate: retiring a card does not take its passes out of
 * anybody's wallet, so its Google class still has to carry working art URLs.
 * Shared by the admin console's Google resync and scripts/google-resync.ts so
 * the two cannot end up refreshing different sets.
 */
export async function allCards(): Promise<CardRow[]> {
  const res = await getPool().query<CardRow>(`SELECT * FROM cards ORDER BY created_at`);
  return res.rows;
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
// ------------------------------------------------- marketing-site traffic ----

/**
 * One visit to a public marketing page, or one press of its call to action.
 *
 * `kind` is 'view' or 'cta' and those two strings are permanent — every query
 * below keys off them, so renaming one means rewriting stored rows and every
 * query together (the same rule `events` types live under).
 *
 * Never throws into a request. A page that fails to serve because analytics
 * could not be written would be a straight downgrade on the thing being
 * measured, so the caller logs and moves on.
 */
export async function recordSiteView(row: {
  kind: "view" | "cta";
  path: string;
  deviceId: string;
  source?: string;
  referrer?: string;
  ua?: string;
  isBot?: boolean;
}): Promise<void> {
  await getPool().query(
    `INSERT INTO site_views (kind, path, device_id, source, referrer, ua, is_bot)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      row.kind,
      row.path.slice(0, 200),
      row.deviceId.slice(0, 64),
      (row.source ?? "").slice(0, 40),
      (row.referrer ?? "").slice(0, 200),
      (row.ua ?? "").slice(0, 200),
      row.isBot ?? false,
    ],
  );
}

export type SiteTraffic = {
  days: number;
  views: number;
  devices: number;
  returning: number;
  cta: number;
  ctaDevices: number;
  /** Landings from a demo card's own QR - see passBarcode in passModel.ts. */
  cardScans: number;
  referrers: { host: string; n: number }[];
};

/**
 * What the landing page did over the last `days`.
 *
 * Bots are excluded here, not at write time — see the table comment. Everything
 * is derived by query rather than kept as a running total, for the same reason
 * card metrics are: a stored count that drifts from its rows is how a headline
 * comes to disagree with the list under it.
 */
export async function siteTraffic(days: number): Promise<SiteTraffic> {
  const since = `now() - interval '${Number(days)} days'`;
  const real = `NOT is_bot AND created_at > ${since}`;
  const res = await getPool().query<{
    views: string;
    devices: string;
    returning: string;
    cta: string;
    cta_devices: string;
    card_scans: string;
  }>(
    `SELECT
       count(*) FILTER (WHERE kind = 'view')::text AS views,
       count(DISTINCT device_id) FILTER (WHERE kind = 'view')::text AS devices,
       -- A device that came back: more than one view inside the window. Not
       -- "seen before the window", which on a page this young would count
       -- almost nobody and read as a bug.
       (SELECT count(*) FROM (
          SELECT device_id FROM site_views
           WHERE ${real} AND kind = 'view'
           GROUP BY device_id HAVING count(*) > 1
        ) d)::text AS returning,
       count(*) FILTER (WHERE kind = 'cta')::text AS cta,
       count(DISTINCT device_id) FILTER (WHERE kind = 'cta')::text AS cta_devices,
       -- Somebody pointed a camera at a demo card. The barcode on that card is
       -- the landing page tagged ?s=card, so this needs no table and no event
       -- type of its own - sourceOf and countView were already storing it and
       -- nothing had ever read it back.
       count(*) FILTER (WHERE kind = 'view' AND source = 'card')::text AS card_scans
     FROM site_views WHERE ${real}`,
  );
  const refs = await getPool().query<{ host: string; n: string }>(
    `SELECT CASE WHEN referrer = '' THEN 'direct' ELSE referrer END AS host,
            count(*)::text AS n
       FROM site_views
      WHERE ${real} AND kind = 'view'
      GROUP BY 1 ORDER BY count(*) DESC LIMIT 5`,
  );
  const r = res.rows[0]!;
  return {
    days,
    views: Number(r.views),
    devices: Number(r.devices),
    returning: Number(r.returning),
    cta: Number(r.cta),
    ctaDevices: Number(r.cta_devices),
    cardScans: Number(r.card_scans),
    referrers: refs.rows.map((x) => ({ host: x.host, n: Number(x.n) })),
  };
}

/**
 * The demo card's own funnel over the same window: how many pressed a wallet
 * button on the landing page, and how many still hold the card.
 *
 * These live in `events`, not in site_views — the press of "Apple Wallet" is a
 * real thing that happened to a real card, and it was already being logged
 * before any of this existed.
 */
export async function demoCardFunnel(
  cardId: string,
  days: number,
): Promise<{ clicked: number; added: number }> {
  const res = await getPool().query<{ clicked: string; added: string }>(
    `SELECT
       count(*) FILTER (WHERE type = 'wallet_click')::text AS clicked,
       count(*) FILTER (WHERE type = 'pass_added')::text  AS added
     FROM events
     WHERE card_id = $1 AND NOT is_test AND created_at > now() - interval '${Number(days)} days'`,
    [cardId],
  );
  return { clicked: Number(res.rows[0]!.clicked), added: Number(res.rows[0]!.added) };
}

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

/**
 * A shop with no login yet — the done-for-you path.
 *
 * We agree over DM, build the card here, and send a claim link. Everything
 * about the business exists from this moment: its id (which the /j/ poster QR
 * encodes and can never change), its slug, its card. The only thing missing is
 * somebody to log in, and that is what the claim link adds.
 */
export async function createUnclaimedMerchant(name: string): Promise<MerchantRow> {
  const id = generateShortCode(8).toLowerCase();
  const clean = name.trim().slice(0, 60) || "My shop";
  const res = await getPool().query<MerchantRow>(
    `INSERT INTO merchants (id, owner_id, name) VALUES ($1, NULL, $2) RETURNING *`,
    [id, clean],
  );
  await claimSlug(id, clean);
  return res.rows[0]!;
}

/**
 * Attach a login to a shop we already built. The other half of the claim.
 *
 * Conditional on the merchant still being unclaimed, so two people opening the
 * same link cannot both win: the second UPDATE matches no row and the caller
 * sees null. That check has to be in the statement rather than around it —
 * read-then-write would let both pass.
 */
export async function attachOwnerToMerchant(
  merchantId: string,
  ownerId: string,
): Promise<MerchantRow | null> {
  const res = await getPool().query<MerchantRow>(
    `UPDATE merchants
        SET owner_id = $2, claimed_at = now(),
            claim_token = NULL, claim_token_hash = NULL, claim_expires = NULL
      WHERE id = $1 AND owner_id IS NULL
      RETURNING *`,
    [merchantId, ownerId],
  );
  return res.rows[0] ?? null;
}

/**
 * Take a shop back off its owner — a link that reached the wrong person, or a
 * handover to someone else. The shop returns to unclaimed keeping its id, its
 * slug and its /j/ poster QR, which is the whole point: rebuilding it would mint
 * a new card id, and a card id is printed on posters and baked into every
 * Android card ever issued from it.
 *
 * Three things have to move together or the ex-owner keeps a way in:
 *   - owner_id, so nothing resolves the shop to them;
 *   - their owner_cards rows, which are what `ownerHasCard` gates the dashboard
 *     on — leaving these is the difference between "handed back" and "still has
 *     the keys";
 *   - staff_session_epoch, which signs every staff phone out at once, the same
 *     lever setStaffPin and archiving already pull.
 *
 * The OWNER ROW SURVIVES. Deleting it would cascade their logins away, and a
 * mis-click on a real merchant must not destroy an account — they are left
 * owning nothing, which is recoverable, rather than gone, which is not.
 *
 * claimed_at is deliberately left standing beside unclaimed_at: both are
 * history, `stageOf` keys on has_owner, and "claimed the 7th, handed back the
 * 8th" is the answer to a dispute.
 */
export async function detachOwnerFromMerchant(merchantId: string): Promise<MerchantRow | null> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    // Who it belongs to, locked, BEFORE the update — a subselect inside
    // RETURNING would read the statement's own snapshot and is too subtle to
    // rest three revocations on.
    const before = await client.query<{ owner_id: string | null }>(
      `SELECT owner_id FROM merchants WHERE id = $1 FOR UPDATE`,
      [merchantId],
    );
    const previous = before.rows[0]?.owner_id ?? null;
    if (!previous) {
      await client.query("ROLLBACK");
      return null;
    }
    const res = await client.query<MerchantRow>(
      `UPDATE merchants
          SET owner_id = NULL, unclaimed_at = now(),
              claim_token = NULL, claim_token_hash = NULL, claim_expires = NULL
        WHERE id = $1
        RETURNING *`,
      [merchantId],
    );
    await client.query(
      `DELETE FROM owner_cards
        WHERE owner_id = $1
          AND card_id IN (SELECT id FROM cards WHERE merchant_id = $2)`,
      [previous, merchantId],
    );
    await client.query(
      `UPDATE owners SET staff_session_epoch = staff_session_epoch + 1 WHERE id = $1`,
      [previous],
    );
    await client.query("COMMIT");
    return res.rows[0] ?? null;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Store a claim link's token — the hash it is checked against, and the token
 * itself so the operator can find a link they have already sent.
 *
 * Keeping the plaintext is a deliberate trade, not an oversight: see the
 * migration note on `claim_token` and src/claim.ts. It is cleared the moment
 * the link is claimed or withdrawn, so only an outstanding link is readable.
 *
 * Issuing a new one replaces the old — which is what makes "revoke" a re-issue,
 * and also why the console has to warn before doing it.
 */
export async function setClaimToken(
  merchantId: string,
  token: string,
  tokenHash: string,
  expires: Date,
): Promise<void> {
  await getPool().query(
    `UPDATE merchants SET claim_token = $2, claim_token_hash = $3, claim_expires = $4
      WHERE id = $1 AND owner_id IS NULL`,
    [merchantId, token, tokenHash, expires],
  );
}

/** The unclaimed shop this token opens, or null if it is spent, stale or wrong. */
export async function merchantByClaimToken(tokenHash: string): Promise<MerchantRow | null> {
  const res = await getPool().query<MerchantRow>(
    `SELECT * FROM merchants
      WHERE claim_token_hash = $1 AND claim_expires > now()
        AND owner_id IS NULL AND archived_at IS NULL`,
    [tokenHash],
  );
  return res.rows[0] ?? null;
}

/** Withdraw a link that has been sent but not used. Takes the readable copy
 *  with it: a withdrawn link must not stay legible in a dump. */
export async function clearClaimToken(merchantId: string): Promise<void> {
  await getPool().query(
    `UPDATE merchants
        SET claim_token = NULL, claim_token_hash = NULL, claim_expires = NULL
      WHERE id = $1`,
    [merchantId],
  );
}

/**
 * What a shop is paying for. The one lifecycle fact no other row implies —
 * every other stage is derived from the event log.
 *
 * 'free' is the default and what a trial runs on; today only 'pro' unlocks
 * anything. Adding a tier means adding a string here and teaching `planAllows`
 * about it — no migration.
 */
export type MerchantPlan = "free" | "pro";

export function asPlan(v: unknown): MerchantPlan {
  return v === "pro" ? "pro" : "free";
}

/**
 * Move a shop between plans.
 *
 * `paid_at` is stamped the FIRST time they go pro and never cleared again: it
 * is the date they started paying, which stays true after a downgrade the same
 * way an undone stamp does not delete the stamp. `plan` is the only field that
 * answers "what do they have now".
 */
export async function setMerchantPlan(id: string, plan: MerchantPlan): Promise<void> {
  await getPool().query(
    `UPDATE merchants
        SET plan = $2,
            paid_at = CASE WHEN $2 = 'pro' AND paid_at IS NULL THEN now() ELSE paid_at END
      WHERE id = $1`,
    [id, plan],
  );
}

/**
 * One shop's account, for its OWN dashboard.
 *
 * Deliberately not `merchantHealth()`: that builds fifty derived columns for
 * every merchant on the platform to answer an operator's question, and an owner
 * opening their Shop tab must not pay for that.
 *
 * `first_stamp_at` and `trial_day` are computed the same way merchantHealth
 * computes them — from the first non-test stamp — so the owner's screen and the
 * console can never disagree about when a trial started.
 */
export interface MerchantAccount {
  plan: MerchantPlan;
  trial_ends_at: Date | null;
  archived_at: Date | null;
  first_stamp_at: Date | null;
  trial_day: number;
}

export async function merchantAccount(merchantId: string): Promise<MerchantAccount | null> {
  const res = await getPool().query<MerchantAccount>(
    `SELECT m.plan, m.trial_ends_at, m.archived_at,
            s.first_stamp_at,
            COALESCE(floor(extract(epoch FROM (now() - s.first_stamp_at)) / 86400.0), 0)::int AS trial_day
       FROM merchants m
       LEFT JOIN LATERAL (
         SELECT min(e.created_at) AS first_stamp_at
           FROM events e JOIN cards c ON c.id = e.card_id
          WHERE c.merchant_id = m.id AND e.type = 'stamp' AND NOT e.is_test
       ) s ON true
      WHERE m.id = $1`,
    [merchantId],
  );
  const row = res.rows[0];
  return row ? { ...row, plan: asPlan(row.plan) } : null;
}

/** Give one shop longer, or put it back on the derived date by passing null. */
export async function setMerchantTrialEnds(id: string, when: Date | null): Promise<void> {
  await getPool().query(`UPDATE merchants SET trial_ends_at = $2 WHERE id = $1`, [id, when]);
}

export async function updateMerchant(
  id: string,
  fields: Partial<Pick<MerchantRow,
    "name" | "default_card_id" | "average_spend_cents" | "currency" | "expected_return_days">>,
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
 * Every card the merchant owns, archived ones aside.
 *
 * This one DOES include unfinished cards (published_at IS NULL), on purpose:
 * the dashboard has to list a half-made card or the owner can never get back to
 * it. Everything that hands a card to a CUSTOMER filters them out instead —
 * liveCardsForMerchant and joinTargetCard below, and shopOpen in
 * src/routes/public.ts, which is the door both wallets knock on.
 */
export async function cardsForMerchant(merchantId: string): Promise<CardRow[]> {
  const res = await getPool().query<CardRow>(
    `SELECT * FROM cards WHERE merchant_id = $1 AND archived_at IS NULL ORDER BY created_at`,
    [merchantId],
  );
  return res.rows;
}

/**
 * Finish a programme, or start it again.
 *
 * One column and nothing else: no pass is touched, no event is rewritten, no
 * customer is told anything. Everything that closes hangs off `ended_at` being
 * read at the door — see shopOpen in src/routes/public.ts, which is the ONE
 * place both wallets and the landing page ask.
 */
export async function endCard(cardId: string): Promise<void> {
  await getPool().query(`UPDATE cards SET ended_at = now() WHERE id = $1`, [cardId]);
}

export async function reopenCard(cardId: string): Promise<void> {
  await getPool().query(`UPDATE cards SET ended_at = NULL WHERE id = $1`, [cardId]);
}

/**
 * The last step of the Create flow: this card is finished and may be handed out.
 *
 * Only ever sets the stamp, never clears it — re-running the wizard on a live
 * card must not take it off the shelf and strand a poster mid-print. Once
 * published, a card comes off through `ended_at`, which is a decision the owner
 * makes on purpose and which keeps every issued pass working.
 */
export async function publishCard(cardId: string): Promise<CardRow | null> {
  const res = await getPool().query<CardRow>(
    `UPDATE cards SET published_at = COALESCE(published_at, now())
      WHERE id = $1 RETURNING *`,
    [cardId],
  );
  return res.rows[0] ?? null;
}

/**
 * The merchant's cards that are actually taking sign-ups.
 *
 * Unfinished ones are not: a card still being made has no reward worth
 * promising and no design, and counting it would let a half-built card fill the
 * shop's slot and block the one they meant to make.
 */
export async function liveCardsForMerchant(merchantId: string): Promise<CardRow[]> {
  return (await cardsForMerchant(merchantId)).filter((c) => !c.ended_at && c.published_at);
}

/**
 * Which card a /j/ link should issue: the merchant's explicit choice, else their
 * only card. Null when they somehow have none, or several with no default set —
 * the route renders a picker for that, which V1 can never reach.
 *
 * A FINISHED programme is never the answer, even when it is the default. The
 * default is a preference; ending one is a decision, and a poster pointing at a
 * card that has closed must not keep minting it. If ending the default leaves
 * exactly one card still running, that one is issued — which is what an owner
 * replacing last season's card expects to happen without touching a setting.
 */
export async function joinTargetCard(merchant: MerchantRow): Promise<CardRow | null> {
  // Unfinished cards are invisible here for the same reason ended ones are: a
  // scan must never mint a card whose reward the owner has not settled on.
  const cards = (await cardsForMerchant(merchant.id)).filter((c) => !c.ended_at && c.published_at);
  if (merchant.default_card_id) {
    const chosen = cards.find((c) => c.id === merchant.default_card_id);
    if (chosen) return chosen;
  }
  return cards.length === 1 ? cards[0]! : null;
}

// ------------------------------------------------------------- customers ----

/** A person at one merchant. Holds no PII — see the customers table comment. */
export async function createCustomer(merchantId: string, isTest = false): Promise<CustomerRecord> {
  const res = await getPool().query<CustomerRecord>(
    `INSERT INTO customers (id, merchant_id, is_test) VALUES ($1, $2, $3) RETURNING *`,
    [randomUUID(), merchantId, isTest],
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
  /** Defaults to a stamp card, which is what every card was before v2.7. */
  kind?: CardKind;
  /** The reward ladder, on a milestones card. */
  milestones?: Milestone[];
  /**
   * True while the Create flow is still being walked through.
   *
   * Defaults to FALSE — published — so every existing call site (signup, the
   * admin console) keeps making a live card exactly as it did. Only the wizard
   * asks for a draft, and only the wizard's last step publishes one.
   */
  draft?: boolean;
}): Promise<CardRow> {
  // The id is generated here and then never changes: it is printed on posters,
  // baked into every issued Android card's Google class id, and used in the art
  // URLs inside live Google classes. See renameCafesToCards.
  const id = generateShortCode(8).toLowerCase();
  const res = await getPool().query<CardRow>(
    `INSERT INTO cards (id, merchant_id, name, reward, stamps_target, stamps_start, kind, milestones,
                        published_at, staff_pin, staff_pin_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, '', '') RETURNING *`,
    [id, row.merchantId, row.name, row.reward, row.stampsTarget, row.stampsStart, row.kind ?? "stamp",
     JSON.stringify(row.milestones ?? []),
     // Passed straight through, never COALESCEd: a draft's null IS the value,
     // and folding it into now() here would publish every draft on creation.
     // The column's own default covers the insert paths that never name it.
     row.draft === true ? null : new Date()],
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

export type MerchantDeletion =
  | { ok: true; cards: number; passes: number; ownerEmail: string | null }
  | { ok: false; reason: "no-such-merchant" | "paid-shop" };

/**
 * Remove a shop that never traded — completely, including its owner login.
 *
 * The one thing archiving cannot do. A shop built for a demo, a typo, or a
 * merchant who never showed up leaves an owner row behind, and that row holds
 * the email hostage: `getOwnerByEmail` makes the claim form refuse it
 * (src/routes/claim.ts), and an archived merchant makes login refuse it too
 * (`ownerIsArchived`). Between them, an address can end up unable to log in AND
 * unable to claim, with no way out of the console. This is that way out.
 *
 * **It deletes a shop that HAS traded, on purpose.** It began by refusing the
 * moment a pass, a customer or a message existed — archive anything real. That
 * made it useless for the job it is needed for: running the same onboarding
 * flow end to end, repeatedly, which issues cards every time. The only refusal
 * left is a PAID shop, re-checked inside the transaction against a locked row,
 * because the console's numbers being seconds stale must never turn into a live
 * business disappearing. Money is the one signal that says a real shop is on
 * the other end of this row, and no test shop has it.
 *
 * What that costs, plainly: `passes` holds the serial and auth token that are
 * inside cards already on customers' phones. Deleting them orphans every issued
 * card permanently and there is no way to tell the phone. Nothing here is
 * recoverable without a dump. Archiving stays the default in the console and is
 * what a real shop closing gets.
 *
 * NOTE — this DELETEs from `events`, which CLAUDE.md otherwise forbids
 * absolutely. The rule exists so a correction can never rewrite history and
 * leave a metric disagreeing with the log; here the shop and its entire log go
 * together, in one transaction, leaving nothing to disagree. That exception is
 * written down in CLAUDE.md and is limited to this function.
 */
export async function hardDeleteMerchant(id: string): Promise<MerchantDeletion> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    // `plan`, not `paid_at`: paid_at is history and stays set after a
    // downgrade, so guarding on it would refuse to delete a shop that stopped
    // paying two years ago. What must never be destroyed is a shop paying NOW.
    const merchant = await client.query<{ owner_id: string | null; plan: string }>(
      `SELECT owner_id, plan FROM merchants WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (!merchant.rows.length) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "no-such-merchant" };
    }
    const ownerId = merchant.rows[0]!.owner_id;

    // Every card the shop has ever held, archived ones included — an archived
    // card's passes are still in wallets and still count against deleting.
    const cardIds = (
      await client.query<{ id: string }>(`SELECT id FROM cards WHERE merchant_id = $1`, [id])
    ).rows.map((r) => r.id);

    // The only refusal, and it is checked on the locked row rather than on
    // whatever the console was showing a few seconds ago.
    if (merchant.rows[0]!.plan !== "free") {
      await client.query("ROLLBACK");
      return { ok: false, reason: "paid-shop" };
    }

    let ownerEmail: string | null = null;
    if (ownerId) {
      const o = await client.query<{ email: string }>(`SELECT email FROM owners WHERE id = $1`, [
        ownerId,
      ]);
      ownerEmail = o.rows[0]?.email ?? null;
    }

    // Child-first, and the order is the whole difficulty: passes.card_id,
    // events.card_id and messages.card_id reference cards with NO cascade, and
    // passes.customer_id references customers — so customers cannot go first.
    // The art tables, stamp strips, registrations, owner_cards and owner_logins
    // all cascade from cards or owners and are deliberately not listed.
    let passes = 0;
    if (cardIds.length) {
      await client.query(`DELETE FROM messages WHERE card_id = ANY($1::text[])`, [cardIds]);
      await client.query(`DELETE FROM events WHERE card_id = ANY($1::text[])`, [cardIds]);
      const gone = await client.query(`DELETE FROM passes WHERE card_id = ANY($1::text[])`, [cardIds]);
      passes = gone.rowCount ?? 0;
      await client.query(`DELETE FROM owner_cards WHERE card_id = ANY($1::text[])`, [cardIds]);
    }
    await client.query(`DELETE FROM events WHERE merchant_id = $1`, [id]);
    await client.query(`DELETE FROM customers WHERE merchant_id = $1`, [id]);
    await client.query(`DELETE FROM merchant_slugs WHERE merchant_id = $1`, [id]);
    if (cardIds.length) {
      await client.query(`DELETE FROM cards WHERE id = ANY($1::text[])`, [cardIds]);
    }
    // The merchant must go before the owner: merchants.owner_id references it.
    await client.query(`DELETE FROM merchants WHERE id = $1`, [id]);
    if (ownerId) await client.query(`DELETE FROM owners WHERE id = $1`, [ownerId]);

    await client.query("COMMIT");
    return { ok: true, cards: cardIds.length, passes, ownerEmail };
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
    kind: CardKind;
    benefits: string;
    milestones: Milestone[];
    reward_type: RewardType;
    reward_value_cents: number;
    reward_percent: number;
    reward_cap_cents: number;
    stamps_per_visit: number;
    point_presets: string;
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
    logo_has_name: boolean;
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
    // `milestones` is jsonb, and node-postgres turns a JS array into a POSTGRES
    // array literal ({a,b}) rather than JSON — which the column rejects. Every
    // jsonb value has to arrive as a string.
    [id, ...keys.map((k) => (k === "milestones" ? JSON.stringify(fields[k]) : fields[k]))],
  );
  const after = res.rows[0] ?? null;

  if (before && after) {
    const changed: Record<string, { from: unknown; to: unknown }> = {};
    for (const k of keys) {
      const from = (before as unknown as Record<string, unknown>)[k];
      const to = (after as unknown as Record<string, unknown>)[k];
      // Compared by value, not by reference: `milestones` comes back as a fresh
      // array on every read, so === would call every save an edit and write a
      // card_edited row for a card nobody touched.
      const same = k === "milestones"
        ? JSON.stringify(from) === JSON.stringify(to)
        : from === to;
      if (!same) changed[k] = { from, to };
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

// ------------------------------------------------------------- card art ----

/**
 * The four single-image art tables are byte-identical in shape — one PNG per
 * card, upserted, with an updated_at that doubles as a cache-buster. They get
 * one set of accessors rather than four hand-copied ones, because that is how
 * the banner came to be validated against the logo's size cap: the copies drift.
 *
 * `table` is a literal from the call sites just below and never user input; it
 * is interpolated because an identifier cannot be a bound parameter.
 */
function cardArtTable(table: string) {
  return {
    async get(cardId: string): Promise<{ png: Buffer; updated_at: Date } | null> {
      const res = await getPool().query<{ png: Buffer; updated_at: Date }>(
        `SELECT png, updated_at FROM ${table} WHERE card_id = $1`,
        [cardId],
      );
      return res.rows[0] ?? null;
    },
    async set(cardId: string, png: Buffer): Promise<void> {
      await getPool().query(
        `INSERT INTO ${table} (card_id, png, updated_at) VALUES ($1, $2, now())
         ON CONFLICT (card_id) DO UPDATE SET png = EXCLUDED.png, updated_at = now()`,
        [cardId, png],
      );
    },
    async del(cardId: string): Promise<void> {
      await getPool().query(`DELETE FROM ${table} WHERE card_id = $1`, [cardId]);
    },
    /** Epoch-ms of the last change, or 0 when none — cache-busts Google's fetch. */
    async version(cardId: string): Promise<number> {
      const res = await getPool().query<{ updated_at: Date }>(
        `SELECT updated_at FROM ${table} WHERE card_id = $1`,
        [cardId],
      );
      const row = res.rows[0];
      return row ? new Date(row.updated_at).getTime() : 0;
    },
  };
}

const logoArt = cardArtTable("card_logos");
const bannerArt = cardArtTable("card_banners");
/** The square logo, Google's programLogo only. Absent ⇒ fall back to the logo. */
const markArt = cardArtTable("card_logo_marks");
/** The owner's own stamp shape. Its ALPHA is the shape; see shapeStamp. */
const stampIconArt = cardArtTable("card_stamp_icons");

export const getCardLogo = logoArt.get;
export const setCardLogo = logoArt.set;
export const deleteCardLogo = logoArt.del;
export const cafeLogoVersion = logoArt.version;

// Banner image (optional): Apple strip.png / Google heroImage.
export const getCardBanner = bannerArt.get;
export const setCardBanner = bannerArt.set;
export const deleteCardBanner = bannerArt.del;
export const cafeBannerVersion = bannerArt.version;

export const getCardLogoMark = markArt.get;
export const setCardLogoMark = markArt.set;
export const deleteCardLogoMark = markArt.del;
export const cardLogoMarkVersion = markArt.version;

export const getCardStampIcon = stampIconArt.get;
export const setCardStampIcon = stampIconArt.set;
export const deleteCardStampIcon = stampIconArt.del;
export const cardStampIconVersion = stampIconArt.version;

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
      WHERE p.card_id = $1 AND ${REAL_PASS_SQL} AND ${ACTIVE_PASS_SQL}
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
  /** The card's BALANCE — what their progress chip shows. Resets on redeem. */
  stamps: number;
  /**
   * How many times this PERSON has been served, ever. Net of undos, free of
   * welcome stamps, untouched by a redemption, and counting the sign-up itself
   * as visit 1 — see CUSTOMER_VISITS_SQL. This is the one to judge a customer
   * by; `stamps` above is the one to show them.
   */
  visits: number;
  target: number;
  updated_at: Date;
  created_at: Date;
  /** Last visit by this PERSON — the last stamp on any pass they hold. */
  last_visit: Date;
  /** First visit by this PERSON — when they took their earliest card. */
  first_visit: Date | null;
  /** Messages sent to this person since their last visit, across every pass. */
  unanswered_nudges: number;
  /** Messages to this person in the last 7 days — gates the "2 per week" limit. */
  nudges_7d: number;
  /** True once the customer deleted the card from their wallet (Apple only). */
  removed: boolean;
  /** True when this PERSON asked us to stop messaging them. Marketing only —
   *  they still get a notification when they are stamped. */
  opted_out: boolean;
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
         WHERE e.serial IN ${CUSTOMER_SERIALS_SQL} AND e.type = 'stamp' AND NOT e.is_test),
       p.created_at
     )`;

/**
 * "This pass belongs to a real person."
 *
 * A test pass is one the shop owner or the operator added to their own wallet to
 * see the card. It is a genuine pass — a wallet has to accept it — so it must be
 * scannable, stampable and pushable like any other. It is simply not a
 * CUSTOMER, and every number anybody reads has to agree about that.
 *
 * Spelled out at each counting site rather than folded into ACTIVE_PASS_SQL,
 * because two of those sites use `NOT ACTIVE_PASS_SQL` to find abandoned passes
 * — a test pass would have fallen straight into the abandoned bucket instead of
 * out of the report. Grep this name to see the full set: if a new query counts
 * passes and does not mention it, it is wrong.
 *
 * Assumes the passes table is aliased `p`.
 */
const REAL_PASS_SQL = `p.is_test = false`;

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

/**
 * Stamps actually GIVEN: every stamp, minus every correction.
 *
 * A staff `undo` reverses a mis-scan, and `events` is append-only, so the stamp
 * row stays behind. Any number that means "how much has this shop done" has to
 * take the correction off, or a counter that fat-fingers twice a day reads as
 * busier than one that does not.
 *
 * ONE implementation, because there were five: a constant used by a single
 * query plus four hand-written copies, which is how `stamps` and `stamps_30d`
 * came to sit in the same SELECT with opposite rules. Everything net goes
 * through here.
 *
 * `NOT e.is_test` is part of the rule, not an extra: a card the owner put in
 * their own wallet is not activity. This constant used to be the one net
 * implementation WITHOUT that filter, while the four copies had it.
 *
 * The floor at zero is for the same reason `addStamps` clamps: undos can
 * outnumber stamps in a window that starts mid-correction, and a negative
 * "stamps given" is not a fact about anything.
 *
 * @param scope  SQL that picks the events — usually a card or merchant clause.
 * @param since  a Postgres interval ('7 days'), or "" for all time.
 */
function netStamps(scope: string, since = ""): string {
  const window = since ? ` AND e.created_at > now() - interval '${since}'` : "";
  // HOW MUCH, not how many rows. One stamp is one, and always was — which is
  // why a NULL amount reads as 1 and no historical row needs rewriting. One
  // points event can be fifty, and counting rows would report a shop that gave
  // away fifty points as having given away one.
  const when = (type: string) =>
    `COALESCE(sum(COALESCE(e.amount, 1)) FILTER (WHERE e.type = '${type}'${window}), 0)`;
  return `(SELECT GREATEST(${when("stamp")} - ${when("undo")}, 0)::int
             FROM events e WHERE ${scope} AND NOT e.is_test)`;
}

/** Net stamps for the card aliased `c`. */
const NET_STAMPS_SQL = netStamps("e.card_id = c.id");

/**
 * Every event under the merchant aliased `m`. Assumes events are aliased `e`.
 *
 * EVERY card the shop has ever had, archived ones included — those stamps were
 * given and retiring a card does not unhappen them.
 *
 * That is one card-set wider than the owner's own dashboard, which sums
 * `cardsForOwner` and therefore sees live cards only. The two agree today
 * because they cannot disagree: a merchant is capped at one card
 * (routes/dashboard.ts, POST /api/cards) and archiving a shop's last live card
 * is refused (archiveCard below), so no live shop can hold an archived card.
 * The console's total and the owner's tile are the same number by construction,
 * and an e2e assertion holds them to it.
 *
 * If multi-card ever ships, this is the first thing that breaks: the console
 * would count a retired card's stamps and the owner's dashboard would not.
 * Decide then which one "stamps" means — do not let it drift.
 */
const MERCHANT_EVENTS_SQL = `e.card_id IN (SELECT id FROM cards WHERE merchant_id = m.id)`;

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

/**
 * Has the PERSON holding this pass asked us to stop messaging them?
 *
 * Reads the customer, not the pass, so one opt-out covers every card they hold.
 * A pass with no customer (only the unclaimed seeded card) is not opted out —
 * there is nobody to have asked.
 */
const OPTED_OUT_SQL = `(
       p.customer_id IS NOT NULL AND EXISTS (
         SELECT 1 FROM customers cu
          WHERE cu.id = p.customer_id AND cu.opted_out_at IS NOT NULL)
     )`;

const REMOVED_PASS_SQL = `(
       EXISTS (SELECT 1 FROM events e WHERE e.serial = p.serial AND e.type = 'pass_removed')
   AND NOT EXISTS (SELECT 1 FROM registrations r WHERE r.serial = p.serial)
     )`;

/**
 * How many times this PERSON has actually been served, ever.
 *
 * Not `p.stamp_count`, which sits beside it as `stamps`. That is the card's
 * BALANCE — what the customer's progress chip shows — and `redeemPass` rewrites
 * it back to the welcome count every time a reward is handed over. Judging
 * loyalty by the balance would demote a shop's best customers the moment they
 * claimed something, which is the exact opposite of what it is for.
 *
 * Counted from the log instead, across every serial the person holds, which
 * gets three things right for free:
 *
 *   welcome stamps        no event, so they are not visits
 *   a redeem and restart  no stamp event, so the count does not move
 *   an undo               its own event, so a mis-scan comes back off
 *
 * Plus ONE for getting the card at all. Somebody was standing in the shop when
 * they scanned the poster — that is a visit, and the welcome stamps are what it
 * was worth. The +1 is per PERSON, not per pass and not per welcome stamp: a
 * card handing out two welcome stamps did not see them twice, and someone
 * holding an Apple and a Google card did not walk in twice either.
 *
 * `NOT e.is_test` for the same reason netStamps carries it: the owner's own
 * card in their own wallet is not a customer visiting. It matters here even
 * though cardCustomers filters test PASSES out of the list — an owner who
 * added a test card and then a real one in the same browser is one CUSTOMER
 * row holding both serials, and without this their own testing would push
 * them into Regulars.
 *
 * Same floor at zero as netStamps, and the same reason: a window can begin
 * mid-correction, and a negative visit count is not a fact about anybody.
 */
const CUSTOMER_VISITS_SQL = `(1 + (
       SELECT GREATEST(count(*) FILTER (WHERE e.type = 'stamp')
                     - count(*) FILTER (WHERE e.type = 'undo'), 0)::int
         FROM events e WHERE e.serial IN ${CUSTOMER_SERIALS_SQL} AND NOT e.is_test
     ))`;

/**
 * The FIRST time this person was in, ever — the day they took the card.
 *
 * Their first stamp would be the wrong end of the span now that signing up is
 * visit 1: a customer who joined in June and was first stamped in August has
 * been coming for two months, and measuring from the stamp would throw the
 * first gap away and flatter their rhythm. The earliest pass they hold is the
 * earliest they can possibly have been in, and unlike a first stamp it always
 * exists.
 *
 * With `last_visit` and `visits` it gives the average gap between visits, which
 * is what "Regular" turns on: three visits in one afternoon and three visits
 * over three months are the same count and very different customers.
 */
const FIRST_VISIT_SQL = `(SELECT min(q.created_at) FROM passes q
       WHERE q.serial IN ${CUSTOMER_SERIALS_SQL})`;

const CUSTOMER_COLUMNS_SQL = `p.serial, p.customer_id, p.short_code AS code, p.stamp_count AS stamps,
            p.stamps_target AS target, p.updated_at, p.created_at,
            ${CUSTOMER_VISITS_SQL} AS visits,
            ${LAST_VISIT_SQL} AS last_visit,
            ${FIRST_VISIT_SQL} AS first_visit,
            ${UNANSWERED_NUDGES_SQL} AS unanswered_nudges,
            ${NUDGES_7D_SQL} AS nudges_7d,
            ${REMOVED_PASS_SQL} AS removed,
            ${OPTED_OUT_SQL} AS opted_out`;

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
      WHERE p.card_id = $1 AND ${REAL_PASS_SQL} ${activeOnly ? `AND ${ACTIVE_PASS_SQL}` : ""}
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
       FROM passes p WHERE p.card_id = $1 AND ${REAL_PASS_SQL}`,
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
              WHERE p.card_id = c.id AND ${REAL_PASS_SQL} AND ${ACTIVE_PASS_SQL}) AS active,
            (SELECT count(*)::int FROM passes p WHERE p.card_id = c.id AND ${REAL_PASS_SQL}) AS cards,
            ${NET_STAMPS_SQL} AS stamps,
            (SELECT count(*)::int FROM events e
              WHERE e.card_id = c.id AND e.type = 'redeem' AND NOT e.is_test) AS redemptions,
            (SELECT count(*)::int FROM passes p WHERE p.card_id = c.id AND ${REAL_PASS_SQL}
              AND EXISTS (SELECT 1 FROM events e WHERE e.serial = p.serial AND e.type = 'nudge')) AS nudged,
            (SELECT count(*)::int FROM passes p WHERE p.card_id = c.id AND ${REAL_PASS_SQL}
              AND EXISTS (SELECT 1 FROM events s WHERE s.serial = p.serial AND s.type = 'stamp'
                            AND s.created_at > (SELECT max(n.created_at) FROM events n
                                                 WHERE n.serial = p.serial AND n.type = 'nudge'))) AS nudge_returned,
            -- forced is a flag on a stamp, so this needs the type filter too:
            -- without it any future forced-anything event lands in a column the
            -- console reads as "stamps the counter overrode".
            (SELECT count(*)::int FROM events e
              WHERE e.card_id = c.id AND e.type = 'stamp' AND e.forced AND NOT e.is_test) AS forced_stamps,
            (SELECT count(*)::int FROM events e
              WHERE e.card_id = c.id AND e.type = 'undo' AND NOT e.is_test) AS undos,
            (SELECT max(e.created_at) FROM events e
              WHERE e.card_id = c.id AND e.type = 'stamp' AND NOT e.is_test) AS last_stamp_at,
            (SELECT max(l.created_at) FROM owner_logins l
               JOIN owner_cards oc ON oc.owner_id = l.owner_id
              WHERE oc.card_id = c.id) AS last_owner_login,
            ${netStamps("e.card_id = c.id", "7 days")} AS stamps_7d,
            ${netStamps("e.card_id = c.id", "30 days")} AS stamps_30d,
            (SELECT count(*)::int FROM passes p WHERE p.card_id = c.id AND ${REAL_PASS_SQL}
               AND EXISTS (SELECT 1 FROM events e WHERE e.serial = p.serial AND e.type = 'pass_added')) AS added,
            (SELECT count(*)::int FROM passes p WHERE p.card_id = c.id AND ${REAL_PASS_SQL} AND ${REMOVED_PASS_SQL}) AS removed,
            (SELECT count(*)::int FROM passes p WHERE p.card_id = c.id AND ${REAL_PASS_SQL} AND NOT ${ACTIVE_PASS_SQL}
               AND NOT EXISTS (SELECT 1 FROM events e
                                WHERE e.serial = p.serial AND e.type = 'pass_added')) AS never_added,
            (SELECT count(DISTINCT ${PERSON_KEY_SQL})::int FROM passes p WHERE p.card_id = c.id AND ${REAL_PASS_SQL}
               AND ${LAST_VISIT_SQL} > now() - interval '7 days'
               AND EXISTS (SELECT 1 FROM events e WHERE e.serial = p.serial AND e.type = 'stamp')) AS active_7d,
            (SELECT count(DISTINCT ${PERSON_KEY_SQL})::int FROM passes p WHERE p.card_id = c.id AND ${REAL_PASS_SQL}
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
  /**
   * Can anyone log into this shop? The real claimed/unclaimed state.
   *
   * NOT `claimed_at`, which only records when a claim LINK was used — an owner
   * created by signup or by the bootstrap has one without the other, and would
   * otherwise read as unclaimed forever.
   */
  has_owner: boolean;
  /**
   * Who to reset a password for, straight from this row. The console used to
   * carry a separate "Reset a password" section with a dropdown of every owner
   * on the platform, which meant picking a shop out of the table and then
   * picking its owner out of a second list to act on the shop you were already
   * looking at. NULL for an unclaimed shop, which has no login to reset.
   */
  owner_id: string | null;
  /** When the claim link was used, if it was. History, not state. */
  claimed_at: Date | null;
  /** A live claim link is outstanding, and when it lapses. */
  claim_expires: Date | null;
  /**
   * The outstanding link itself, so the console can show one already sent
   * instead of making you mint a replacement and kill it. NULL unless a link is
   * out — claiming or withdrawing clears it. See the migration note.
   */
  claim_token: string | null;
  /** When the shop was last taken back off an owner. History, beside claimed_at. */
  unclaimed_at: Date | null;
  /** When they FIRST went pro. History — never branch on it; read `plan`. */
  paid_at: Date | null;
  /** What they are on now. The one lifecycle fact nothing else implies. */
  plan: MerchantPlan;
  /** Set only when a shop was given a different deadline; NULL = derived. */
  trial_ends_at: Date | null;
  /**
   * Days since the trial STARTED, which is the first stamp at a real counter —
   * not signup, and not the claim.
   *
   * A shop we built but nobody has stamped at has not started anything, so
   * there is nothing to count down: `trial_day` is 0 and `first_stamp_at` is
   * null, and the console says "never stamped" rather than running a clock they
   * are losing. `triage` gates both trial flags on activation for the same
   * reason — otherwise the merchants most at risk would be the only ones a
   * trial warning never reached.
   */
  trial_day: number;
  /**
   * Days since the shop existed at all. This is what `trial_day` used to mean,
   * and the flags about NOT starting hang off it — a merchant who has never
   * stamped has no trial clock, so without this the "never set up" warning
   * would be the one warning they could never trigger.
   */
  days_since_signup: number;
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
  /** First staff stamp anywhere on this merchant. Null = never stamped. */
  first_stamp_at: Date | null;
  first_redeem_at: Date | null;
  /** First card issued to any real customer. Null = nobody has ever signed up. */
  first_customer_at: Date | null;
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
  /** Distinct people stamped in 30 days — the window the merchant table reads. */
  active_30d: number;
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
  // NOT e.is_test on every event-derived column at once: the funnel, the stamp
  // counts, the nudge counts. A card the owner added to their own wallet writes
  // a real enroll and a real wallet_click, and those would otherwise show up as
  // demand in the one report used to judge whether a shop is working.
  const ev = (filter: string, since = "") =>
    `(SELECT count(*)::int FROM events e
       WHERE ${MERCHANT_EVENTS_SQL}
         AND NOT e.is_test
         AND ${filter}${since ? ` AND e.created_at > now() - interval '${since}'` : ""})`;
  const res = await getPool().query<MerchantHealthRow>(
    `SELECT m.id, m.name, m.created_at, m.archived_at, m.contact_phone, m.contact_note,
            (SELECT string_agg(DISTINCT o.email, ', ')
               FROM owners o WHERE o.id = m.owner_id) AS owners,
            LEAST(m.created_at, COALESCE(
              (SELECT o.created_at FROM owners o WHERE o.id = m.owner_id), m.created_at
            )) AS signed_up_at,
            (m.owner_id IS NOT NULL) AS has_owner,
            m.owner_id,
            m.claimed_at, m.claim_expires, m.claim_token, m.unclaimed_at, m.paid_at,
            m.plan, m.trial_ends_at,
            floor(extract(epoch FROM (now() - LEAST(m.created_at, COALESCE(
              (SELECT o.created_at FROM owners o WHERE o.id = m.owner_id), m.created_at
            )))) / 86400.0)::int AS days_since_signup,
            -- The trial runs from the FIRST STAMP, not from signup: a shop that
            -- has never served a customer has not begun. Derived rather than
            -- stored, like every other metric here, so it cannot drift from the
            -- event that defines it. Zero until then.
            COALESCE(floor(extract(epoch FROM (now() -
              (SELECT min(e.created_at) FROM events e
                WHERE ${MERCHANT_EVENTS_SQL}
                  AND e.type = 'stamp' AND NOT e.is_test))) / 86400.0), 0)::int AS trial_day,
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
              WHERE ${MERCHANT_EVENTS_SQL}
                AND e.type = 'stamp' AND NOT e.is_test) AS first_stamp_at,
            (SELECT min(e.created_at) FROM events e
              WHERE ${MERCHANT_EVENTS_SQL}
                AND e.type = 'redeem' AND NOT e.is_test) AS first_redeem_at,
            -- The first card ever issued to anybody. Sits between the login
            -- existing and the first stamp on the activation timeline, and it
            -- is the step that separates "nobody has scanned the poster" from
            -- "people are signing up and staff are not stamping them".
            (SELECT min(e.created_at) FROM events e
              WHERE e.card_id IN (SELECT id FROM cards WHERE merchant_id = m.id)
                AND e.type = 'enroll' AND NOT e.is_test) AS first_customer_at,
            ${ev("e.type = 'poster_view'")} AS poster_views,

            (SELECT max(e.created_at) FROM events e
              WHERE ${MERCHANT_EVENTS_SQL}
                AND e.type = 'stamp' AND NOT e.is_test) AS last_stamp_at,
            (SELECT max(l.created_at) FROM owner_logins l WHERE l.owner_id = m.owner_id) AS last_owner_login,
            (SELECT count(*)::int FROM owner_logins l
              WHERE l.owner_id = m.owner_id AND l.created_at > now() - interval '30 days') AS logins_30d,
            -- All four net, through the one helper. The all-time figure was net
            -- and the three windowed ones were not, in this same SELECT — so the
            -- number nobody scans obeyed the rule and the ones in the merchants
            -- table did not. stamps_7d and stamps_prev_7d are compared against
            -- each other for the "slowing down" flag, where two differently
            -- inflated numbers are worse than two wrong ones.
            ${netStamps(MERCHANT_EVENTS_SQL)} AS stamps,
            ${netStamps(MERCHANT_EVENTS_SQL, "7 days")} AS stamps_7d,
            ${netStamps(MERCHANT_EVENTS_SQL, "30 days")} AS stamps_30d,
            -- The week before last, so the table can show a direction rather
            -- than a number that could mean anything.
            (SELECT GREATEST(
                      count(*) FILTER (WHERE e.type = 'stamp')
                    - count(*) FILTER (WHERE e.type = 'undo'), 0)::int
               FROM events e
              WHERE ${MERCHANT_EVENTS_SQL} AND NOT e.is_test
                AND e.created_at > now() - interval '14 days'
                AND e.created_at <= now() - interval '7 days') AS stamps_prev_7d,
            (SELECT count(DISTINCT ${PERSON_KEY_SQL})::int FROM passes p
              WHERE p.card_id IN (SELECT id FROM cards WHERE merchant_id = m.id)
                AND ${REAL_PASS_SQL} AND ${ACTIVE_PASS_SQL}) AS customers,
            (SELECT count(DISTINCT ${PERSON_KEY_SQL})::int FROM passes p
              WHERE p.card_id IN (SELECT id FROM cards WHERE merchant_id = m.id)
                AND ${REAL_PASS_SQL}
                AND ${LAST_VISIT_SQL} > now() - interval '7 days'
                AND EXISTS (SELECT 1 FROM events e WHERE e.serial = p.serial AND e.type = 'stamp')) AS active_7d,
            -- The same figure over 30 days, which is the window the merchant
            -- table reads: a week is short enough that a shop open four days a
            -- week reads as half-dead, and stamps_30d had no customer count
            -- beside it to divide by.
            (SELECT count(DISTINCT ${PERSON_KEY_SQL})::int FROM passes p
              WHERE p.card_id IN (SELECT id FROM cards WHERE merchant_id = m.id)
                AND ${REAL_PASS_SQL}
                AND ${LAST_VISIT_SQL} > now() - interval '30 days'
                AND EXISTS (SELECT 1 FROM events e WHERE e.serial = p.serial AND e.type = 'stamp')) AS active_30d,
            ${ev("e.type = 'redeem'")} AS redemptions,
            (SELECT count(*)::int FROM passes p
              WHERE p.card_id IN (SELECT id FROM cards WHERE merchant_id = m.id)
                AND ${REAL_PASS_SQL}
                AND p.kind <> 'membership'
                AND CASE
                      WHEN p.kind = 'milestones' THEN
                        p.rewards_claimed < COALESCE(jsonb_array_length(p.milestones), 0)
                        AND p.stamp_count >=
                            COALESCE((p.milestones -> p.rewards_claimed ->> 'at')::int, 2147483647)
                      -- Points: affordable means the CHEAPEST thing on the list
                      -- is within reach, not that a particular rung is.
                      WHEN p.kind = 'points' THEN
                        p.stamp_count >= COALESCE(
                          (SELECT min((m ->> 'at')::int)
                             FROM jsonb_array_elements(p.milestones) m), 2147483647)
                      ELSE p.stamp_count >= p.stamps_target
                    END) AS unclaimed_rewards,

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
                AND ${REAL_PASS_SQL}
                AND EXISTS (SELECT 1 FROM events e
                             WHERE e.serial = p.serial AND e.type = 'nudge')) AS nudged,
            (SELECT count(DISTINCT ${PERSON_KEY_SQL})::int FROM passes p
              WHERE p.card_id IN (SELECT id FROM cards WHERE merchant_id = m.id)
                AND ${REAL_PASS_SQL}
                AND EXISTS (SELECT 1 FROM events s
                             WHERE s.serial = p.serial AND s.type = 'stamp'
                               AND s.created_at > (SELECT max(n.created_at) FROM events n
                                                    WHERE n.serial = p.serial
                                                      AND n.type = 'nudge'))) AS nudge_returned,
            EXISTS (SELECT 1 FROM card_logos l
                     WHERE l.card_id IN (SELECT id FROM cards WHERE merchant_id = m.id)) AS has_art,
            (SELECT count(DISTINCT e.actor)::int FROM events e
              WHERE ${MERCHANT_EVENTS_SQL}
                AND e.actor LIKE 'staff:%' AND NOT e.is_test) AS staff_devices,

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
/**
 * Retire a business, or bring it back.
 *
 * Archiving REVOKES, it does not just hide. Until v2.0 this only set a
 * timestamp the admin console filtered on — the owner could still log in, their
 * staff could still stamp, and their sign-up page still issued cards. "Soft
 * delete" that leaves every door open is a label, not a state.
 *
 * What it does now: the owner's dashboard refuses, every counter phone is
 * signed out (the epoch bump, same mechanism as changing the PIN), and the
 * sign-up page stops offering a card. What it deliberately does NOT do is touch
 * a single pass, stamp or event — cards already in wallets keep their stamps,
 * the history stays queryable, and unarchiving restores all three doors at once.
 */
export async function setMerchantArchived(id: string, archived: boolean): Promise<void> {
  await getPool().query(`UPDATE merchants SET archived_at = $2 WHERE id = $1`, [
    id,
    archived ? new Date() : null,
  ]);
  // Sign the counter out. Bumping the epoch invalidates every staff cookie this
  // owner has issued; it is the same lever setStaffPin pulls, and it is
  // deliberately NOT reversed on unarchive — staff type the PIN again, which is
  // a fair price for a shop coming back from closed.
  if (archived) {
    await getPool().query(
      `UPDATE owners SET staff_session_epoch = staff_session_epoch + 1
        WHERE id = (SELECT owner_id FROM merchants WHERE id = $1)`,
      [id],
    );
  }
}

/** Is this owner's shop archived? The dashboard gate. */
export async function ownerIsArchived(ownerId: string): Promise<boolean> {
  const res = await getPool().query(
    `SELECT 1 FROM merchants WHERE owner_id = $1 AND archived_at IS NOT NULL`,
    [ownerId],
  );
  return (res.rowCount ?? 0) > 0;
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

// ------------------------------------------------ design templates, gone ----
// The design_templates table is still in the schema and NOTHING reads it.
// Saved designs -- a card look mocked up before a shop existed, then pushed
// onto its card once it did -- went with the console rework: you build the
// shop first now, so there is always a real card to design straight onto.
// The TABLE stays because migrations here are additive only and dropping one
// is not. src/backup.ts discovers tables rather than listing them, so it
// keeps round-tripping.

/** Record an owner sign-in. Best-effort — never block a login on analytics. */
export async function logOwnerLogin(ownerId: string): Promise<void> {
  try {
    await getPool().query(`INSERT INTO owner_logins (owner_id) VALUES ($1)`, [ownerId]);
  } catch (err) {
    console.error("[db] could not record owner login:", err);
  }
}

// -------------------------------------------------------- returning rate ----
//
// This replaced six rates: second visit, third visit, completion, median gap,
// median days to reward, and still-alive at 30/60/90. They were all real, and
// together they answered nothing — six numbers behind a "not enough data" gate
// is five more than the question needs. The question is one question: **do
// customers come back?**
//
// Two rules make the answer honest, and both were missing before:
//
//   - **Eligibility.** Somebody stamped yesterday has not failed to return;
//     they have not had the chance. Only people whose FIRST stamp is at least
//     RETURNING_ELIGIBLE_DAYS old are counted, so the denominator is people who
//     could have come back rather than everyone who ever walked in. Without
//     this the rate falls every time a shop has a good week for new sign-ups,
//     which is the exact opposite of what it should do.
//   - **A comparison computed the same way.** The rate as it stood
//     TREND_DAYS ago, from the same CTE with a different cutoff — not a
//     different query, and not a stored number from last month.
//
// Per PERSON (invariant 5) and net of undos, like every other customer figure.

/**
 * How long ago somebody's first stamp has to be before they count either way.
 *
 * NOT the same thing as `RETURN_WINDOW_DAYS` further down this file, which is
 * 7 and gates the OWNER dashboard's return rate on the age of the CARD. This
 * one gates the console's rate on the age of the first STAMP. Two windows, two
 * questions, two names — do not merge them.
 */
const RETURNING_ELIGIBLE_DAYS = 14;
/** How far back the comparison rate is taken. Four weeks: long enough to move. */
const TREND_DAYS = 28;

export interface ReturningRate {
  /** People whose first stamp is old enough to judge. */
  eligible: number;
  /** Of those, how many have been stamped 2+ times. */
  returned: number;
  /** returned / eligible, 0..1. Null when nobody is eligible — not zero. */
  rate: number | null;
  /** The same three, as they stood TREND_DAYS ago. */
  prev_eligible: number;
  prev_returned: number;
  prev_rate: number | null;
}

/**
 * Do customers come back? Platform-wide, or for one shop.
 *
 * With no argument this is recomputed across every LIVE merchant's customers at
 * once — never averaged from per-shop rates, because a rate over 3 customers
 * and a rate over 300 do not average into anything. Archived shops are out: a
 * closed account's customers are not evidence about whether the product works.
 */
export async function returningRate(merchantId?: string): Promise<ReturningRate> {
  const scope = merchantId
    ? `c.merchant_id = $1`
    : `EXISTS (SELECT 1 FROM merchants mm WHERE mm.id = c.merchant_id AND mm.archived_at IS NULL)`;
  // Net stamps as of a cutoff: the same count(stamp) - count(undo) rule as
  // NET_STAMPS_SQL, with the clock wound back. Both windows come off one pass
  // over the events so the rate and its comparison cannot drift apart.
  const netBy = (cutoff: string) =>
    `GREATEST(count(*) FILTER (WHERE e.type = 'stamp' AND e.created_at <= ${cutoff})
            - count(*) FILTER (WHERE e.type = 'undo'  AND e.created_at <= ${cutoff}), 0)`;
  const rate = (eligible: string, returned: string) =>
    `CASE WHEN count(*) FILTER (${eligible}) = 0 THEN NULL
          ELSE count(*) FILTER (${returned})::float8
             / count(*) FILTER (${eligible}) END`;

  const then = `now() - interval '${TREND_DAYS} days'`;
  const eligibleNow = `WHERE first_stamp <= now() - interval '${RETURNING_ELIGIBLE_DAYS} days'`;
  const eligibleThen =
    `WHERE first_stamp <= ${then} - interval '${RETURNING_ELIGIBLE_DAYS} days'`;

  const res = await getPool().query<ReturningRate>(
    `WITH person AS (
       SELECT min(e.created_at) FILTER (WHERE e.type = 'stamp') AS first_stamp,
              ${netBy("now()")} AS n_now,
              ${netBy(then)} AS n_then
         FROM passes p
         JOIN cards c ON c.id = p.card_id
         LEFT JOIN events e ON e.serial = p.serial
        WHERE ${REAL_PASS_SQL} AND ${scope}
        GROUP BY c.merchant_id, ${PERSON_KEY_SQL}
     ),
     started AS (SELECT * FROM person WHERE first_stamp IS NOT NULL)
     SELECT count(*) FILTER (${eligibleNow})::int AS eligible,
            count(*) FILTER (${eligibleNow} AND n_now >= 2)::int AS returned,
            ${rate(eligibleNow, `${eligibleNow} AND n_now >= 2`)} AS rate,
            count(*) FILTER (${eligibleThen})::int AS prev_eligible,
            count(*) FILTER (${eligibleThen} AND n_then >= 2)::int AS prev_returned,
            ${rate(eligibleThen, `${eligibleThen} AND n_then >= 2`)} AS prev_rate
       FROM started`,
    merchantId ? [merchantId] : [],
  );
  return res.rows[0]!;
}

// ------------------------------------------------------------ time series ----
//
// Everything else the console reports is a snapshot: what is true right now, or
// a count over a trailing window. That answers "how is it" and never "which
// way is it going", which is the only question worth asking in the first
// months. The console's one time comparison was this week vs last week — two
// numbers, which is a difference, not a direction.
//
// Derived by query off the append-only log, like every other metric here. There
// is no stored weekly aggregate and there must not be: a cache that drifts from
// the log is exactly what made the Home headline disagree with the list under it.

export interface WeekRow {
  /** Monday 00:00 of the bucket, in the database's timezone. */
  week: Date;
  /** Net of undos, the NET_STAMPS_SQL rule, floored at zero. */
  stamps: number;
  /** Distinct people stamped that week — per PERSON, invariant 5. */
  active_customers: number;
  rewards: number;
}

export interface PlatformWeekRow extends WeekRow {
  /** Shops that gave at least one stamp that week. */
  active_merchants: number;
  new_merchants: number;
}

export interface MerchantWeekRow extends WeekRow {
  /** People whose first stamp at this shop landed that week. */
  new_customers: number;
}

/**
 * The week buckets themselves, empty ones included.
 *
 * generate_series, not a GROUP BY over the events: a week nobody stamped has no
 * rows to group, so grouping alone silently closes the gap up and draws a flat
 * line through a dead fortnight.
 */
const weeksCte = (param: string) => `weeks AS (
       SELECT generate_series(
                date_trunc('week', now()) - (${param}::int - 1) * interval '1 week',
                date_trunc('week', now()),
                interval '1 week') AS week
     )`;

/**
 * One row per week of events, joined up to the shop that owns them.
 *
 * The join runs through `cards.merchant_id` rather than `events.merchant_id`:
 * the column is backfilled, but the join is true of every row regardless of when
 * it was written, which the backfill cannot promise about rows that predate it.
 *
 * `NOT e.is_test` for the reason every counting query says it — a card the owner
 * added to their own wallet writes real events, and this is the report used to
 * decide whether the product works.
 */
const eventWeeksCte = (scope: string) => `ev AS (
       SELECT date_trunc('week', e.created_at) AS week,
              e.type,
              c.merchant_id,
              COALESCE(p.customer_id, p.serial) AS person
         FROM events e
         JOIN cards c ON c.id = e.card_id
         LEFT JOIN passes p ON p.serial = e.serial
        WHERE NOT e.is_test
          AND e.created_at >= (SELECT min(week) FROM weeks)
          AND ${scope}
     )`;

// The netStamps rule, spelled out rather than called: `ev` has already dropped
// test events and does not carry the column to filter on again, so the helper
// cannot be pointed at it. Same arithmetic, same floor — if one changes, both do.
const WEEK_COLUMNS_SQL = `COALESCE((SELECT GREATEST(count(*) FILTER (WHERE e.type = 'stamp')
                                    - count(*) FILTER (WHERE e.type = 'undo'), 0)::int
                        FROM ev e WHERE e.week = w.week), 0) AS stamps,
            COALESCE((SELECT count(DISTINCT e.person)::int FROM ev e
                       WHERE e.week = w.week AND e.type = 'stamp'), 0) AS active_customers,
            COALESCE((SELECT count(*)::int FROM ev e
                       WHERE e.week = w.week AND e.type = 'redeem'), 0) AS rewards`;

/**
 * The whole book, week by week.
 *
 * Archived shops are left out throughout — the same exclusion platformRetention
 * makes, for the same reason: a closed account is not evidence about the
 * product, and leaving it in drags every line down for a reason that has nothing
 * to do with whether the thing works.
 */
export async function platformSeries(weeks = 26): Promise<PlatformWeekRow[]> {
  const live = `EXISTS (SELECT 1 FROM merchants mm
                         WHERE mm.id = c.merchant_id AND mm.archived_at IS NULL)`;
  const res = await getPool().query<PlatformWeekRow>(
    `WITH ${weeksCte("$1")},
          ${eventWeeksCte(live)},
          signups AS (
            SELECT date_trunc('week',
                     LEAST(m.created_at, COALESCE(o.created_at, m.created_at))) AS week
              FROM merchants m
              LEFT JOIN owners o ON o.id = m.owner_id
             WHERE m.archived_at IS NULL
          )
     SELECT w.week,
            ${WEEK_COLUMNS_SQL},
            COALESCE((SELECT count(DISTINCT e.merchant_id)::int FROM ev e
                       WHERE e.week = w.week AND e.type = 'stamp'), 0) AS active_merchants,
            (SELECT count(*)::int FROM signups s WHERE s.week = w.week) AS new_merchants
       FROM weeks w
      ORDER BY w.week`,
    [Math.max(2, Math.min(104, Math.round(weeks)))],
  );
  return res.rows;
}

/** The same shape for one shop. Archived or not — you asked for this one. */
export async function merchantSeries(merchantId: string, weeks = 26): Promise<MerchantWeekRow[]> {
  const res = await getPool().query<MerchantWeekRow>(
    `WITH ${weeksCte("$1")},
          ${eventWeeksCte("c.merchant_id = $2")},
          joined AS (
            SELECT date_trunc('week', min(e.created_at)) AS week
              FROM events e
              JOIN cards c ON c.id = e.card_id
              LEFT JOIN passes p ON p.serial = e.serial
             WHERE e.type = 'stamp' AND NOT e.is_test AND c.merchant_id = $2
             GROUP BY COALESCE(p.customer_id, p.serial)
          )
     SELECT w.week,
            ${WEEK_COLUMNS_SQL},
            (SELECT count(*)::int FROM joined j WHERE j.week = w.week) AS new_customers
       FROM weeks w
      ORDER BY w.week`,
    [Math.max(2, Math.min(104, Math.round(weeks))), merchantId],
  );
  return res.rows;
}

// ---------------------------------------------------------------------------
// The owner's Home chart and its two headline tiles.
//
// Everything here is derived by query off the append-only log, like every other
// metric — there is no stored daily aggregate and there must not be one.
//
// The window is 7 days, 30 days, or every day the shop has traded. Seven and
// thirty bucket by DAY; all-time buckets by week, because a shop trading two
// years would otherwise be 730 points in a chart 340 pixels wide, and a point
// you cannot tap is not interactive.

/** 7, 30, or 0 meaning every day the shop has traded. */
export type ShopWindow = 7 | 30 | 0;

export interface ShopSeriesPoint {
  /** Bucket start, midnight in the database's timezone. */
  at: Date;
  /** Net stamps in the bucket — a visit to the counter. Undos come off. */
  visits: number;
  rewards: number;
}

export interface ShopSeries {
  window: ShopWindow;
  /** 1 for the day windows, 7 for all-time. The chart labels itself from this. */
  bucketDays: number;
  points: ShopSeriesPoint[];
  /**
   * The two headline tiles: where the number stands NOW, and where it stood at
   * the start of the window, so the tile can show the change between them.
   *
   * A stock, not a flow. "Customers" on this dashboard has one meaning
   * everywhere (invariant 5, ACTIVE_PASS_SQL) and it is a running total; making
   * the headline "customers this week" would quietly give the word a second
   * meaning on the one screen that shows it biggest. `before` is null for
   * all-time, which has nothing before it to compare against.
   */
  customers: { now: number; before: number | null };
  /** Net stamps × the shop's own basket. Same stock-not-flow rule. */
  revenueCents: { now: number; before: number | null };
  currency: string;
}

/**
 * When each PERSON became a customer, for counting the total as at a date.
 *
 * Their first event on any pass they hold, falling back to when the pass row
 * was written. Every customer under ACTIVE_PASS_SQL has been stamped, has a
 * registration, or has a `pass_added` — the first and third are events, and the
 * fallback covers the second, whose only timestamp is the pass itself.
 *
 * Per PERSON and not per pass (invariant 5): somebody holding an Apple card and
 * a Google card became a customer once, on the earlier of the two.
 */
const BECAME_CUSTOMER_SQL = `SELECT ${PERSON_KEY_SQL} AS person,
              min(COALESCE(ev.first_at, p.created_at)) AS became_at
         FROM passes p
         JOIN cards c ON c.id = p.card_id
         LEFT JOIN LATERAL (
           SELECT min(e.created_at) AS first_at
             FROM events e WHERE e.serial = p.serial AND NOT e.is_test
         ) ev ON true
        WHERE c.merchant_id = $1 AND ${REAL_PASS_SQL} AND ${ACTIVE_PASS_SQL}
        GROUP BY 1`;

export async function shopSeries(merchantId: string, window: ShopWindow = 7): Promise<ShopSeries> {
  const days = window === 30 ? 30 : window === 0 ? 0 : 7;
  const unit = days ? "day" : "week";
  const bucketDays = days ? 1 : 7;

  // How many buckets to draw. A day window is exactly its own length; all-time
  // runs from the shop's first event, capped at two years so one very old shop
  // cannot ask for an unbounded chart. Two buckets minimum: one point is not a
  // line, and sparkline() draws nothing for it.
  let buckets = days;
  if (!days) {
    const span = await getPool().query<{ buckets: string }>(
      `SELECT GREATEST(2, LEAST(104,
         COALESCE(ceil(extract(epoch FROM (now() - min(e.created_at))) / 604800.0), 2) + 1))::text AS buckets
         FROM events e JOIN cards c ON c.id = e.card_id
        WHERE c.merchant_id = $1 AND NOT e.is_test`,
      [merchantId],
    );
    buckets = Math.max(2, Number(span.rows[0]?.buckets ?? 2));
  }

  // generate_series, not a GROUP BY over the events: a day nobody stamped has
  // no rows to group, so grouping alone closes the gap up and draws a straight
  // line through a closed week as though it were trading.
  const res = await getPool().query<{ at: Date; visits: number; rewards: number }>(
    `WITH buckets AS (
       SELECT generate_series(
                date_trunc($2, now()) - ($3::int - 1) * ($4 || ' days')::interval,
                date_trunc($2, now()),
                ($4 || ' days')::interval) AS at
     ),
     ev AS (
       SELECT date_trunc($2, e.created_at) AS at, e.type,
              COALESCE(e.amount, 1) AS amount
         FROM events e
         JOIN cards c ON c.id = e.card_id
        WHERE NOT e.is_test
          AND c.merchant_id = $1
          AND e.created_at >= (SELECT min(at) FROM buckets)
     )
     SELECT b.at,
            -- The netStamps rule, spelled out: ev has already dropped test rows
            -- and no longer carries the column to filter on, so the helper
            -- cannot be pointed at it. Same arithmetic, same floor at zero.
            COALESCE((SELECT GREATEST(
                        COALESCE(sum(amount) FILTER (WHERE type = 'stamp'), 0)
                      - COALESCE(sum(amount) FILTER (WHERE type = 'undo'), 0), 0)::int
                        FROM ev WHERE ev.at = b.at), 0) AS visits,
            COALESCE((SELECT count(*)::int FROM ev
                       WHERE ev.at = b.at AND ev.type = 'redeem'), 0) AS rewards
       FROM buckets b
      ORDER BY b.at`,
    [merchantId, unit, String(buckets), String(bucketDays)],
  );

  // The two tiles. `before` is the same number as it stood at the start of the
  // window, so the tile subtracts rather than comparing two different measures.
  const cut = days ? `now() - interval '${days} days'` : "NULL::timestamptz";
  const totals = await getPool().query<{
    cnow: string; cbefore: string | null; snow: string; sbefore: string | null; basket: string;
  }>(
    `WITH person AS (${BECAME_CUSTOMER_SQL}),
     ev AS (
       SELECT e.created_at, e.type, COALESCE(e.amount, 1) AS amount
         FROM events e JOIN cards c ON c.id = e.card_id
        WHERE NOT e.is_test AND c.merchant_id = $1
     )
     SELECT (SELECT count(*) FROM person)::text AS cnow,
            (SELECT CASE WHEN ${cut} IS NULL THEN NULL
                         ELSE count(*) FILTER (WHERE became_at <= ${cut}) END
               FROM person)::text AS cbefore,
            (SELECT GREATEST(
                      COALESCE(sum(amount) FILTER (WHERE type = 'stamp'), 0)
                    - COALESCE(sum(amount) FILTER (WHERE type = 'undo'), 0), 0)::int
               FROM ev)::text AS snow,
            (SELECT CASE WHEN ${cut} IS NULL THEN NULL ELSE GREATEST(
                      COALESCE(sum(amount) FILTER (WHERE type = 'stamp' AND created_at <= ${cut}), 0)
                    - COALESCE(sum(amount) FILTER (WHERE type = 'undo' AND created_at <= ${cut}), 0), 0)::int
               END FROM ev)::text AS sbefore,
            -- The CARD's basket, not the merchant's: only the card column is
            -- written by the dashboard. merchants.average_spend_cents is a v1.3
            -- leftover and is not kept up to date.
            COALESCE((SELECT max(average_spend_cents) FROM cards WHERE merchant_id = $1), 0)::text AS basket`,
    [merchantId],
  );
  const t = totals.rows[0]!;
  const basket = Number(t.basket);
  const currency = await getPool().query<{ currency: string }>(
    `SELECT COALESCE(max(currency), 'RM') AS currency FROM cards WHERE merchant_id = $1`,
    [merchantId],
  );

  return {
    window: days === 30 ? 30 : days === 7 ? 7 : 0,
    bucketDays,
    points: res.rows.map((r) => ({ at: r.at, visits: Number(r.visits), rewards: Number(r.rewards) })),
    customers: { now: Number(t.cnow), before: t.cbefore === null ? null : Number(t.cbefore) },
    revenueCents: {
      now: Number(t.snow) * basket,
      before: t.sbefore === null ? null : Number(t.sbefore) * basket,
    },
    currency: currency.rows[0]?.currency || "RM",
  };
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
      WHERE e.actor LIKE 'staff:%' AND NOT e.is_test
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
  /** Frozen at issue with the rest of the ruleset. Defaults to a stamp card. */
  kind?: CardKind;
  /** The reward ladder, frozen at issue alongside reward and stamps_target. */
  milestones?: Milestone[];
  /** How many stamps a visit earns, frozen at issue. Defaults to one. */
  stampsPerVisit?: number;
  /** The owner or the operator looking at their own card — never a customer. */
  isTest?: boolean;
}): Promise<PassRow> {
  const res = await getPool().query<PassRow>(
    `INSERT INTO passes (serial, card_id, customer_id, platform, short_code, auth_token, stamp_count, stamps_target, reward, kind, milestones, stamps_per_visit, is_test)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
    [row.serial, row.cardId, row.customerId ?? null, row.platform, row.shortCode, row.authToken,
     row.stampCount, row.stampsTarget, row.reward, row.kind ?? "stamp",
     JSON.stringify(row.milestones ?? []), row.stampsPerVisit ?? 1, row.isTest === true],
  );
  return res.rows[0]!;
}

/**
 * The card's test pass for one wallet, if it has one.
 *
 * At most one per card per platform, on purpose: pressing "Add to my wallet"
 * twice hands back the SAME card rather than piling up test passes nobody will
 * ever delete. Reissued on each press, so it always shows today's design.
 */
export async function testPassFor(cardId: string, platform: Platform): Promise<PassRow | null> {
  const res = await getPool().query<PassRow>(
    `SELECT * FROM passes WHERE card_id = $1 AND platform = $2 AND is_test LIMIT 1`,
    [cardId, platform],
  );
  return res.rows[0] ?? null;
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

/**
 * Adds stamps (may be negative to correct mistakes); never goes below zero.
 *
 * A STAMP card also clamps at its target: the grid has that many circles and a
 * count above it would ask for a strip image that was never rendered.
 *
 * A MEMBERSHIP card does not. Its count is a lifetime visit tally that the
 * customer never sees, and it has no target to stop at — capping it at the
 * card's nominal `stamps_target` would freeze every regular member at the same
 * number and quietly flatten the visit history that the customer groups and
 * "last visit" are built from.
 *
 * A POINTS balance does not either: it is saved up and spent down, so a ceiling
 * would silently discard points a customer had earned.
 *
 * The ceiling reads the PASS's own kind, not the card's, so changing a live
 * card's kind cannot retroactively clamp counts that are already banked.
 */
export async function addStamps(serial: string, delta: number): Promise<PassRow | null> {
  const res = await getPool().query<PassRow>(
    `UPDATE passes
       SET stamp_count = CASE
             WHEN kind IN ('membership', 'points') THEN GREATEST(stamp_count + $2, 0)
             ELSE LEAST(GREATEST(stamp_count + $2, 0), stamps_target)
           END,
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
 * 1. It restarts at ZERO — always, whatever the card's welcome-stamp setting.
 *    It used to restart at `stamps_start` so a returning customer was never
 *    behind a first-timer; the founder's call, and the clearer reading, is that
 *    the visit which earned the reward IS the stamp they would otherwise be
 *    handed, so starting them above zero pays for the same visit twice.
 *    `stamps_start` is now exactly what its label says: stamps a NEW card
 *    starts with.
 * 2. It takes the card's CURRENT reward and target. A pass otherwise keeps the
 *    ruleset it was issued with forever, which is right while the promise is
 *    outstanding — but the promise has just been kept, so this is the honest
 *    moment to move them on, and it is the only one that doesn't require the
 *    customer to delete their card and rescan the QR. A shop that raised its
 *    target from 10 to 12 this morning restarts this afternoon's redeemer at
 *    0 of 12, on this morning's reward.
 *
 * One statement so a pass can never be observed half-way between two rulesets.
 * Callers that log this must read the pass AFTER it, not before: `logEvent`
 * takes the target in force from the pass row.
 */
export async function redeemPass(serial: string, cost = 0): Promise<PassRow | null> {
  // A POINTS card is spent DOWN, not restarted: the customer keeps whatever is
  // left over, which is the whole idea of saving points up. Nothing else about
  // the pass moves — the catalogue is a price list, not a sequence, so there is
  // no rung to advance and no ruleset to roll onto.
  if (cost > 0) {
    const spent = await getPool().query<PassRow>(
      `UPDATE passes
          SET stamp_count = GREATEST(stamp_count - $2, 0),
              updated_at  = now()
        WHERE serial = $1 AND kind = 'points' AND stamp_count >= $2
        RETURNING *`,
      [serial, cost],
    );
    // No row means they could not afford it — the caller must not report a
    // reward given. Never falls through to the restart below, which would zero
    // a balance somebody had been saving.
    return spent.rows[0] ?? null;
  }
  const res = await getPool().query<PassRow>(
    // `more` is "this card has another rung above the one being paid out now".
    //
    // A milestones card that still has one CARRIES ON: the customer keeps the
    // stamps they have and the ladder they were issued with, and only the index
    // moves. Restarting them at zero after the 2-stamp cookie would take back
    // the two stamps they are already holding towards the 5.
    //
    // Every other case is the original behaviour, unchanged: back to zero on
    // today's rules, which is the one honest moment to move somebody onto a
    // ruleset the shop has since changed.
    `WITH cur AS (
       SELECT p.serial,
              (p.kind = 'milestones'
               AND p.rewards_claimed + 1 < COALESCE(jsonb_array_length(p.milestones), 0)) AS more
         FROM passes p WHERE p.serial = $1
     )
     UPDATE passes p
        SET rewards_claimed = CASE WHEN cur.more THEN p.rewards_claimed + 1 ELSE 0 END,
            stamp_count     = CASE WHEN cur.more THEN p.stamp_count    ELSE 0 END,
            stamps_target   = CASE WHEN cur.more THEN p.stamps_target  ELSE c.stamps_target END,
            reward          = CASE WHEN cur.more THEN p.reward         ELSE c.reward END,
            kind            = CASE WHEN cur.more THEN p.kind           ELSE c.kind END,
            milestones      = CASE WHEN cur.more THEN p.milestones     ELSE c.milestones END,
            stamps_per_visit = CASE WHEN cur.more THEN p.stamps_per_visit
                                    ELSE c.stamps_per_visit END,
            updated_at      = now()
       FROM cards c, cur
      WHERE p.serial = $1 AND c.id = p.card_id AND cur.serial = p.serial
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
            kind          = c.kind,
            milestones    = c.milestones,
            stamps_per_visit = c.stamps_per_visit,
            -- Re-enrolling is the customer asking for today's card, so the
            -- ladder starts again from the bottom rung along with everything
            -- else. Their stamps are kept either way.
            rewards_claimed = 0,
            stamp_count   = CASE
              WHEN c.kind = 'membership' THEN p.stamp_count
              ELSE LEAST(p.stamp_count, c.stamps_target)
            END,
            updated_at    = now()
       FROM cards c
      WHERE p.serial = $1 AND c.id = p.card_id
        AND (p.stamps_target <> c.stamps_target OR p.reward <> c.reward
             OR p.kind <> c.kind
             OR p.milestones IS DISTINCT FROM c.milestones
             OR (c.kind <> 'membership' AND p.stamp_count > c.stamps_target))
      RETURNING p.*`,
    [serial],
  );
  // No row means nothing needed changing — the caller keeps what it had.
  return res.rows[0] ?? null;
}

/** Sets the free-form message (win-back nudge) and bumps updated_at. */
export async function setMessage(serial: string, message: string): Promise<PassRow | null> {
  const res = await getPool().query<PassRow>(
    `UPDATE passes SET message = $2, message_sent_at = now(), updated_at = now()
      WHERE serial = $1 RETURNING *`,
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
       stamps_after, stamps_target, amount, metadata, is_test
     )
     SELECT $1, $2, $3, $4, $5, $6,
            COALESCE($7, c.merchant_id),
            COALESCE($8, p.customer_id),
            COALESCE(NULLIF($9, ''), p.platform, ''),
            $10, $11,
            COALESCE($12, p.stamp_count),
            COALESCE($13, p.stamps_target),
            $14::int,
            $15::jsonb,
            -- Off the pass, exactly like the columns above it. A caller cannot
            -- pass it and cannot forget it: every event a test card produces is
            -- a test event, and the ones with no pass (join_view, poster_view)
            -- are real by definition — nobody has a test card yet at that point.
            COALESCE(p.is_test, false)
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
      meta.amount ?? null,
      JSON.stringify(meta.metadata ?? {}),
    ],
  );
  return res.rows[0] ? Number(res.rows[0].id) : null;
}

/**
 * How much the last stamp on this card was worth — what an undo has to reverse.
 *
 * Read from the log rather than taken from the request: on a points card one
 * tap can be fifty points, so a fixed "minus one" would leave forty-nine
 * behind, and a number sent by a stale browser could reverse an amount that was
 * never given. NULL amounts (every row before points existed) mean one.
 *
 * An `undo` already reversed is skipped, so tapping undo twice takes back the
 * two stamps before it rather than the same one twice.
 */
export async function lastStampAmount(serial: string): Promise<number> {
  const res = await getPool().query<{ amount: string }>(
    `WITH ev AS (
       SELECT type, COALESCE(amount, 1) AS amount, id
         FROM events WHERE serial = $1 AND type IN ('stamp', 'undo')
        ORDER BY id DESC LIMIT 50
     )
     SELECT amount::text FROM ev WHERE type = 'stamp'
      OFFSET (SELECT count(*) FROM ev WHERE type = 'undo') LIMIT 1`,
    [serial],
  );
  const n = Number(res.rows[0]?.amount);
  return Number.isFinite(n) && n > 0 ? n : 1;
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
  optedOut: boolean;
}

/** One round trip for the three numbers that gate a nudge. Unknown serial → null. */
export async function nudgeState(serial: string): Promise<NudgeState | null> {
  const res = await getPool().query<{
    nudges_7d: number; unanswered_nudges: number; removed: boolean; opted_out: boolean;
  }>(
    `SELECT ${NUDGES_7D_SQL} AS nudges_7d,
            ${UNANSWERED_NUDGES_SQL} AS unanswered_nudges,
            ${REMOVED_PASS_SQL} AS removed,
            ${OPTED_OUT_SQL} AS opted_out
       FROM passes p WHERE p.serial = $1`,
    [serial],
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    nudges7d: row.nudges_7d,
    unanswered: row.unanswered_nudges,
    removed: row.removed,
    optedOut: row.opted_out,
  };
}

/**
 * Stop, or resume, messaging this person. Idempotent: opting out twice keeps
 * the FIRST date, because that is when they asked.
 *
 * Keyed by serial because that is all the customer has — the card in their
 * hand. It resolves to the person, so one press covers every card they hold.
 * Returns false when the pass has no customer behind it (the unclaimed seeded
 * card), which is the one case with nobody to opt out.
 */
export async function setOptedOut(serial: string, optOut: boolean): Promise<boolean> {
  const res = await getPool().query(
    `UPDATE customers SET opted_out_at = CASE
        WHEN $2::boolean THEN COALESCE(opted_out_at, now()) ELSE NULL END
      WHERE id = (SELECT customer_id FROM passes WHERE serial = $1)`,
    [serial, optOut],
  );
  return (res.rowCount ?? 0) > 0;
}

/** Is the person holding this pass opted out? Unknown or ownerless ⇒ false. */
export async function optedOutSerial(serial: string): Promise<boolean> {
  const res = await getPool().query<{ opted_out: boolean }>(
    `SELECT ${OPTED_OUT_SQL} AS opted_out FROM passes p WHERE p.serial = $1`,
    [serial],
  );
  return res.rows[0]?.opted_out === true;
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
         FROM passes p WHERE p.card_id = $1 AND ${REAL_PASS_SQL}
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
  /**
   * The average gap between one customer's visits, in days, across this card.
   *
   * Null — never 0 — when nobody has been in twice: there is no rhythm to
   * report yet, and a confident zero would read as "they come in every day".
   */
  avgGapDays: number | null;
}

export async function cardMetrics(cardId: string): Promise<CafeMetrics> {
  // Same definition of "customer" as the headline beside it — ACTIVE_PASS_SQL,
  // counted per PERSON. A different one here is exactly how the Home headline
  // came to disagree with the list under it, twice.
  const MATURE_PASS_SQL = `p.card_id = $1 AND ${REAL_PASS_SQL} AND ${ACTIVE_PASS_SQL}
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
    avgGapDays: string | null;
  }>(
    `SELECT
       (SELECT count(DISTINCT ${PERSON_KEY_SQL}) FROM passes p
          WHERE p.card_id = $1 AND ${REAL_PASS_SQL} AND ${ACTIVE_PASS_SQL})::text AS active,
       (SELECT count(*) FROM passes p WHERE p.card_id = $1 AND ${REAL_PASS_SQL})::text AS cards,
       -- The owner's Home tile, and the number their "spend influenced" figure
       -- is multiplied out of. Net through the shared helper: an undo is a
       -- correction, so it comes off. The counter fold one tab away is
       -- deliberately NOT net — see counterActivity, where the take-back is its
       -- own cell and both numbers are facts about the day.
       ${netStamps("e.card_id = $1")}::text AS stamps,
       count(*) FILTER (WHERE type = 'redeem')::text AS redemptions,
       ${netStamps("e.card_id = $1", "30 days")}::text AS "stamps30d",
       count(*) FILTER (WHERE type = 'redeem' AND created_at > now() - interval '30 days')::text AS "redemptions30d",
       (SELECT count(DISTINCT ${PERSON_KEY_SQL}) FROM passes p
          WHERE ${MATURE_PASS_SQL})::text AS matured,
       (SELECT count(DISTINCT ${PERSON_KEY_SQL}) FROM passes p
          WHERE ${MATURE_PASS_SQL}
            AND EXISTS (SELECT 1 FROM events e
                         WHERE e.serial IN ${CUSTOMER_SERIALS_SQL} AND e.type = 'stamp'))::text AS returned,
       -- The shop's rhythm on this card, built from the SAME three fragments
       -- the Customers screen reads per person (see customerViews): their whole
       -- span divided by the gaps in it, so three visits give two gaps. Written
       -- out of the shared SQL rather than reimplemented, because a second
       -- definition of "how often do they come in" would drift from the first
       -- and the two screens would quietly disagree.
       --
       -- DISTINCT ON per PERSON, not per pass (invariant 5): somebody holding
       -- an Apple and a Google card has one rhythm, not two.
       --
       -- Anyone with fewer than two visits is left OUT rather than counted as
       -- zero. A shop where nine people came once and one comes weekly has one
       -- rhythm worth reporting, and averaging in nine zeroes would report a
       -- daily one.
       (SELECT avg(GREATEST(
                 EXTRACT(epoch FROM (q.last_visit - q.first_visit)) / 86400.0 / (q.visits - 1), 0))
          FROM (
            SELECT DISTINCT ON (${PERSON_KEY_SQL})
                   ${CUSTOMER_VISITS_SQL} AS visits,
                   ${LAST_VISIT_SQL} AS last_visit,
                   ${FIRST_VISIT_SQL} AS first_visit
              FROM passes p
             WHERE p.card_id = $1 AND ${REAL_PASS_SQL} AND ${ACTIVE_PASS_SQL}
             ORDER BY ${PERSON_KEY_SQL}
          ) q
         WHERE q.visits >= 2 AND q.first_visit IS NOT NULL)::text AS "avgGapDays"
     FROM events WHERE card_id = $1 AND NOT is_test`,
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
    avgGapDays: r.avgGapDays === null ? null : Number(r.avgGapDays),
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

export interface CounterEvent {
  at: Date;
  /** `stamp`, `undo` or `redeem`. Named, never interpreted. */
  type: string;
  /** The printed short code, so the owner can match it to a card if they want. */
  code: string | null;
}

/** Stamps that landed on one card in quick succession. See `counterActivity`. */
export interface CounterBurst {
  at: Date;
  /** How many stamps, and over how many seconds. Two plain facts. */
  stamps: number;
  seconds: number;
  code: string | null;
  /** How many runs there are in total, if more than the returned page. */
  total: number;
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
  /** Runs of stamps on one card inside a minute — the same thing `bursts`
   *  lists, counted. Derived from the SAME query so the number on the screen
   *  and the list behind it can never disagree. */
  stampedAgain: number;
  rewards: number;
  takenBack: number;
  phones: number;
  lastStampAt: Date | null;
  /** Today's stamps, undos and redeems, newest first — the exact times. */
  events: CounterEvent[];
  bursts: CounterBurst[];
  devices: CounterDevice[];
}

/**
 * What happened at this shop's counter — facts, and only facts.
 *
 * The screen this feeds is deliberately not a staff-performance tool: there is
 * no per-staff identity in this system (one PIN per owner, any signed-in device
 * can stamp), so nothing here is attributed to a person and nothing is judged.
 * It returns counts and the times behind them; the owner decides whether any of
 * it means anything.
 *
 * Three things are true of this data that the UI must not get wrong:
 *
 * 1. **Welcome stamps are already excluded, for free.** A card's starting
 *    stamps and the restart after a reward are written straight to
 *    `passes.stamp_count` (`createPass`, `redeemPass`) and emit no event — so
 *    `type = 'stamp'` has only ever meant "somebody stamped at the counter".
 *    There is nothing to filter out, and nothing that could drift.
 * 2. **`forced` is the literal "stamped again" event**, not an inference. The
 *    stamper refuses a second stamp on the same card inside 60s
 *    (STAMP_COOLDOWN_MS, src/routes/staff.ts) unless staff confirm, and the
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
    phones: 0, lastStampAt: null, events: [], bursts: [], devices: [],
  };
  if (cardIds.length === 0) return empty;

  const sql = getPool();
  // "Today" is the server's day, which is the day boundary staff work to.
  const today = `e.created_at >= date_trunc('day', now())`;
  const [totals, events, bursts, devices] = await Promise.all([
    sql.query<{
      stamps: string; customers: string; rewards: string;
      taken_back: string; phones: string; last_stamp: Date | null;
    }>(
      `SELECT count(*) FILTER (WHERE e.type = 'stamp' AND ${today})::text AS stamps,
              count(DISTINCT COALESCE(e.customer_id, e.serial))
                FILTER (WHERE e.type = 'stamp' AND ${today})::text AS customers,
                      count(*) FILTER (WHERE e.type = 'redeem' AND ${today})::text AS rewards,
              count(*) FILTER (WHERE e.type = 'undo' AND ${today})::text AS taken_back,
              count(DISTINCT e.device_id)
                FILTER (WHERE e.type = 'stamp' AND e.device_id <> '' AND ${today})::text AS phones,
              max(e.created_at) FILTER (WHERE e.type = 'stamp') AS last_stamp
         FROM events e WHERE e.card_id = ANY($1) AND NOT e.is_test`,
      [cardIds],
    ),
    // Every counter action today with its exact time. The time is the point:
    // a count tells you something happened, the clock tells you when.
    sql.query<CounterEvent>(
      `SELECT e.created_at AS at, e.type, p.short_code AS code
         FROM events e LEFT JOIN passes p ON p.serial = e.serial
        WHERE e.card_id = ANY($1) AND NOT e.is_test
          AND e.type IN ('stamp', 'undo', 'redeem') AND ${today}
        ORDER BY e.created_at DESC
        LIMIT 300`,
      [cardIds],
    ),
    // Runs of stamps on ONE card with under a minute between them, collapsed to
    // a single line: when it started, how many, over how long. That is what
    // "stamped again within a minute" actually looked like, and a list of
    // individual stamps a few seconds apart would make the reader do the
    // grouping themselves. A run of one is not a run, hence HAVING count > 1.
    //
    // The COUNT ON THE SCREEN comes from this query too (`total`), not from
    // `events.forced`. Both describe the same thing — the stamper refuses a
    // second stamp inside 60s unless staff confirm, and that confirmation sets
    // `forced` — but they can drift apart at a day boundary, where the first
    // stamp of a run falls yesterday and only the confirmation lands today.
    // A number whose drill-down is empty reads as broken, so there is one
    // source for both.
    sql.query<CounterBurst>(
      `WITH stamps AS (
         SELECT e.serial, e.created_at, p.short_code,
                lag(e.created_at) OVER (PARTITION BY e.serial ORDER BY e.created_at) AS prev
           FROM events e LEFT JOIN passes p ON p.serial = e.serial
          WHERE e.card_id = ANY($1) AND NOT e.is_test AND e.type = 'stamp' AND ${today}
       ),
       marked AS (
         SELECT *, CASE WHEN prev IS NULL OR created_at - prev > interval '60 seconds'
                        THEN 1 ELSE 0 END AS starts
           FROM stamps
       ),
       runs AS (
         SELECT *, sum(starts) OVER (PARTITION BY serial ORDER BY created_at) AS run
           FROM marked
       ),
       grouped AS (
         SELECT min(created_at) AS at,
                count(*)::int AS stamps,
                GREATEST(0, round(extract(epoch FROM (max(created_at) - min(created_at)))))::int AS seconds,
                max(short_code) AS code
           FROM runs
          GROUP BY serial, run
         HAVING count(*) > 1
       )
       SELECT at, stamps, seconds, code, count(*) OVER ()::int AS total
         FROM grouped
        ORDER BY at DESC
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
        WHERE e.card_id = ANY($1) AND NOT e.is_test AND e.device_id <> ''
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
    stampedAgain: bursts.rows[0]?.total ?? 0,
    rewards: Number(t?.rewards ?? 0),
    takenBack: Number(t?.taken_back ?? 0),
    phones: Number(t?.phones ?? 0),
    lastStampAt: t?.last_stamp ?? null,
    events: events.rows,
    bursts: bursts.rows,
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

/**
 * Mark every pass on this card as changed, so Apple comes back for a new one.
 *
 * This is the other half of `serialsUpdatedSince` below, and it exists because
 * the two halves disagreed for months. Changing a card's LOOK writes to
 * `cards`; it touches no pass row. `refreshCardArt` would send the APNs
 * wake-up, the phone would dutifully ask what changed, and `serialsUpdatedSince`
 * — which answers that question purely from `passes.updated_at` — would say
 * "nothing". The route returned 204 and the phone went back to sleep still
 * holding the old art. The new look only ever appeared at that customer's NEXT
 * STAMP, because `addStamps` is one of the three writes that does bump the
 * column. Android had no such problem: its look is class data and renders on
 * every object already issued, so the two platforms silently disagreed.
 *
 * NOT an event, deliberately. `events` is append-only and describes things that
 * happened to a customer; this is a cache-invalidation timestamp and nothing
 * more. Nothing reads this column as a visit clock either — `LAST_VISIT_SQL`
 * comes off stamp EVENTS with a `p.created_at` fallback — so bumping it cannot
 * disturb the lapse clock, the nudge limits or any churn figure. `setPassMessage`
 * already sets the same precedent for a nudge.
 */
export async function touchPassesForCard(cardId: string): Promise<number> {
  const res = await getPool().query(
    `UPDATE passes SET updated_at = now() WHERE card_id = $1`,
    [cardId],
  );
  return res.rowCount ?? 0;
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

/**
 * Every device holding any pass of this card.
 *
 * An Apple pass is a downloaded file: changing the card's art changes what the
 * web service would hand back, but nothing tells the phone to come and ask.
 * Without this, a redesign reached Android in seconds (the Google class is
 * patched in place) and an iPhone only at that customer's next stamp — which on
 * a quiet card is a week later, with the two platforms visibly disagreeing in
 * the meantime. See refreshCardArt in src/cardActions.ts.
 */
export async function pushTokensForCard(cardId: string): Promise<string[]> {
  const res = await getPool().query<{ push_token: string }>(
    `SELECT DISTINCT r.push_token
       FROM registrations r
       JOIN passes p ON p.serial = r.serial
      WHERE p.card_id = $1`,
    [cardId],
  );
  return res.rows.map((r) => r.push_token);
}

/** Push tokens registered for a pass (usually one device, can be several). */
export async function pushTokensForSerial(serial: string): Promise<string[]> {
  const res = await getPool().query<{ push_token: string }>(
    `SELECT DISTINCT push_token FROM registrations WHERE serial = $1`,
    [serial],
  );
  return res.rows.map((r) => r.push_token);
}

/**
 * The OLDEST Google passes on a card, for the console's "Check Google Wallet".
 *
 * Oldest, not newest, because that is where the evidence is. An object created
 * today carries no heroImage — buildLoyaltyObject sends none — so reading a
 * fresh one proves nothing. The failure worth finding is historical: an object
 * written back when the stamp path carried a picture still holds that
 * heroImage, it shadows the class's band for as long as it exists, and every
 * stamp since has been a PATCH, which leaves an omitted field alone.
 */
export async function oldestGoogleSerials(cardId: string, limit = 5): Promise<string[]> {
  const res = await getPool().query<{ serial: string }>(
    `SELECT serial FROM passes
      WHERE card_id = $1 AND platform = 'google'
      ORDER BY created_at ASC
      LIMIT $2`,
    [cardId, limit],
  );
  return res.rows.map((r) => r.serial);
}

/**
 * Every Google pass on a card — the objects a repair has to walk.
 *
 * Separate from `oldestGoogleSerials`, which caps at 5 because it answers a
 * diagnostic question ("is anything shadowing the band?"). A repair that
 * stopped at 5 would report success while leaving customers 6 and up looking at
 * the wrong picture, which is the failure mode this whole change exists to end.
 */
export async function googleSerialsForCard(cardId: string): Promise<string[]> {
  const res = await getPool().query<{ serial: string }>(
    `SELECT serial FROM passes
      WHERE card_id = $1 AND platform = 'google'
      ORDER BY created_at ASC`,
    [cardId],
  );
  return res.rows.map((r) => r.serial);
}
