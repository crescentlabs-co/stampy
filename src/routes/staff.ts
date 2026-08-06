/**
 * Staff-facing routes. A device types the café PIN once at /staff/api/login and
 * gets a signed, HttpOnly, expiring session cookie; every later request is
 * authorised by that cookie, not by replaying the PIN. Multi-café: requests
 * carry x-card-id (or ?c= on the page); the session is scoped to that café.
 *
 *   GET  /staff                    login form, or the stamper once signed in
 *   POST /staff/api/login          { pin } → staff session cookie
 *   POST /staff/api/logout         drop this device's session
 *   GET  /staff/api/passes         recent cards as JSON
 *   GET  /staff/api/lookup?code=   find one card by its printed code
 *   POST /staff/api/stamp          { serial } → +1 stamp → push   (scanner path)
 *   POST /staff/api/stamp-by-code  { code }   → resolve short code → +1 stamp (typed fallback)
 *   POST /staff/api/undo           { serial } → −1 stamp → push   (fix a mis-scan)
 *   POST /staff/api/redeem         { serial } → restart the card → push
 *
 * Every card change records which device did it (`actor`), so a busy counter is
 * auditable after the fact. Nudges are an OWNER action — dashboard, not here.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  clearStaffCookie,
  newStaffDeviceId,
  readStaffCookie,
  sessionOwnerId,
  setStaffCookie,
  staffCookieOwners,
} from "../auth.js";
import { applyAndPush } from "../cardActions.js";
import { clear, hit, peek } from "../rateLimit.js";
import {
  addStamps,
  cardsForOwner,
  DEFAULT_CARD_ID,
  getCard,
  getOwner,
  merchantForOwner,
  ownerForCard,
  ownerIsArchived,
  type OwnerRow,
  getPass,
  getPassByShortCodeForMerchant,
  logEvent,
  lastStampAt,
  listRecentPasses,
  redeemPass,
  verifyStaffPin,
  type CardRow,
  type MerchantRow,
  type EventType,
  type PassRow,
} from "../db.js";
import { isRewardReady, stampDots } from "../passModel.js";
import { staffPage } from "../pages.js";

export const staffRouter = Router();

/**
 * Anti-spam: after a card is stamped, a repeat stamp on the SAME card inside
 * this window is refused unless the staff explicitly confirm (force:true). Stops
 * accidental/abusive rapid taps while still allowing a genuine "two coffees"
 * with a deliberate second tap. A forced stamp is flagged in the audit log.
 * Only stamping is throttled — redeem/undo aren't.
 */
const STAMP_COOLDOWN_MS = 60_000;

// PIN attempts, deliberately loose and failure-only: only a WRONG PIN counts, so
// a busy shift never approaches the limit. A café's wifi often shares one IP
// across every staff phone — we just want to stop an automated script.
const PIN_TRIES = 20;
const PIN_WINDOW_MS = 10 * 60_000;

interface StaffRequest extends Request {
  card?: CardRow;
  owner?: OwnerRow;
  /** The business. Scanning is scoped to this, not to `card`. */
  merchant?: MerchantRow;
  /** Which staff phone this is — recorded as the actor on every event it causes. */
  deviceId?: string;
}

/** Which card this request names explicitly: the API header, or ?c= on the page. */
function cafeIdOf(req: Request): string {
  return req.get("x-card-id") || String(req.query.c ?? "");
}

/**
 * Resolve the card and the owner who runs it. The staff session belongs to the
 * owner (one PIN, one counter, however many cards), so every path needs both.
 */
async function cardAndOwner(cardId: string): Promise<{ card: CardRow; owner: OwnerRow } | null> {
  const card = await getCard(cardId);
  if (!card) return null;
  const owner = await ownerForCard(cardId);
  if (!owner) return null; // an unclaimed café (the env-seeded default) has no PIN to type
  return { card, owner };
}

/**
 * Which counter is this? Falling straight back to DEFAULT_CARD_ID was fine when
 * one deployment meant one café, and became a cross-merchant bug the moment it
 * didn't: an owner opening a bare `/staff` landed on whoever happened to own the
 * café named "default", saw THEIR cards, and — since PINs are only 4-6 digits and
 * can collide by chance — could have signed into a stranger's counter.
 *
 * So a bare `/staff` is answered from who the visitor demonstrably is, in order:
 *   1. the card named in the URL / header,
 *   2. the owner logged into the dashboard in this browser — the strongest
 *      signal of whose counter this is, and it beats a stale staff cookie left
 *      over from signing into the wrong shop,
 *   3. a staff session this phone already holds (the bookmarked-/staff case,
 *      where there is no dashboard session at all),
 *   4. only then the seeded default, which is all a fresh deployment has.
 */
async function resolveCard(req: Request): Promise<{ card: CardRow; owner: OwnerRow } | null> {
  const named = cafeIdOf(req);
  if (named) return cardAndOwner(named);

  const firstCardOf = async (ownerId: string) => {
    const cards = await cardsForOwner(ownerId);
    const owner = await getOwner(ownerId);
    return cards[0] && owner ? { card: cards[0], owner } : null;
  };
  const sessionOwner = sessionOwnerId(req);
  if (sessionOwner) {
    const found = await firstCardOf(sessionOwner);
    if (found) return found;
  }
  for (const ownerId of staffCookieOwners(req)) {
    const found = await firstCardOf(ownerId);
    if (found) return found;
  }
  return cardAndOwner(DEFAULT_CARD_ID);
}

/**
 * Seconds left in the cooldown for this card, or 0 if it's clear. Returns 0 for
 * a card that isn't this café's (or doesn't exist) so the stamp path proceeds to
 * applyAndPush, which is the one place that maps that to a 404.
 */
async function stampCooldownLeft(serial: string, merchantId: string | undefined): Promise<number> {
  const pass = await getPass(serial);
  if (!pass) return 0;
  const card = await getCard(pass.card_id);
  if (!card || !merchantId || card.merchant_id !== merchantId) return 0;
  const last = await lastStampAt(serial);
  if (!last) return 0;
  const left = STAMP_COOLDOWN_MS - (Date.now() - new Date(last).getTime());
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

/**
 * Gate for everything that touches cards. The session proves this phone typed
 * the owner's PIN; the card it names must be one of that owner's, which is what
 * stops a signed-in phone stamping a stranger's card by editing a header.
 */
async function requireStaff(req: StaffRequest, res: Response, next: NextFunction): Promise<void> {
  const found = await resolveCard(req);
  if (!found) return void res.status(404).json({ error: "no-such-card" });
  const session = readStaffCookie(req, found.owner.id);
  if (!session) return void res.status(401).json({ error: "not-signed-in" });
  // A PIN change bumps the owner's epoch, which strands every older cookie —
  // that's how the owner revokes a phone or a leaked stamper link, across all
  // of their cards at once.
  if (await ownerIsArchived(found.owner.id)) {
    return void res.status(403).json({ error: "account-closed" });
  }
  if (session.epoch !== found.owner.staff_session_epoch) {
    return void res.status(401).json({ error: "session-revoked" });
  }
  req.card = found.card;
  req.owner = found.owner;
  req.merchant = (await merchantForOwner(found.owner.id)) ?? undefined;
  req.deviceId = session.deviceId;
  next();
}

/** Everything this device does is attributed to it in the events log. */
const actorOf = (req: StaffRequest) => `staff:${req.deviceId}`;

/** Exchange the owner's staff PIN for a session cookie. The only place it's read. */
staffRouter.post("/api/login", async (req, res) => {
  const found = await resolveCard(req);
  if (!found) return void res.status(404).json({ error: "no-such-card" });
  // Keyed on the OWNER: the PIN being guessed is theirs, whichever of their cards
  // the phone happens to be pointed at.
  // A closed shop's PIN still verifies — the hash is untouched by archiving —
  // so the epoch bump that signs every phone out would otherwise be undone by
  // one re-entry. Checked before the rate limiter so a closed shop's counter
  // cannot burn an owner's attempt budget either.
  if (await ownerIsArchived(found.owner.id)) {
    return void res.status(403).json({ error: "account-closed" });
  }
  const rlKey = `pin:${found.owner.id}:${req.ip}`;
  const peeked = peek(rlKey, PIN_TRIES, PIN_WINDOW_MS);
  if (!peeked.ok) {
    return void res
      .status(429)
      .json({ error: "too-many-attempts", retryAfterSeconds: peeked.retryAfterSeconds });
  }
  const pin = String((req.body ?? {}).pin ?? "");
  if (!verifyStaffPin(found.owner, pin)) {
    hit(rlKey, PIN_TRIES, PIN_WINDOW_MS); // record only the failed attempt
    // The rate limiter counts these in memory and forgets them on the next
    // deploy. A shop with forty failures a week has a problem worth seeing,
    // and it can only be seen if the attempts outlive the process.
    // The PIN itself is never recorded — only that one was wrong.
    await logEvent(found.card.id, "", "pin_failed", {
      actor: "staff",
      metadata: {},
    }).catch(() => {});
    return void res.status(401).json({ error: "wrong-pin" });
  }
  clear(rlKey); // a correct PIN clears the counter
  // One sign-in covers every card this owner runs — the phone picks which one
  // it's stamping, it doesn't type the PIN again per card.
  setStaffCookie(res, found.owner.id, newStaffDeviceId(), found.owner.staff_session_epoch);
  res.json({ ok: true });
});

staffRouter.post("/api/logout", async (req, res) => {
  const found = await resolveCard(req);
  if (found) clearStaffCookie(res, found.owner.id);
  res.json({ ok: true });
});

/** The cards this signed-in phone may stamp — populates the card switcher. */
staffRouter.get("/api/cards", requireStaff, async (req: StaffRequest, res) => {
  const cards = await cardsForOwner(req.owner!.id);
  res.json({ cards: cards.map((c) => ({ id: c.id, name: c.name })), selected: req.card!.id });
});

/**
 * The stamper page is only served to a signed-in device; everyone else gets the
 * PIN form. So a leaked /staff link on its own reveals nothing about the café —
 * no card list, no codes, no customer count.
 */
staffRouter.get("/", async (req, res) => {
  const found = await resolveCard(req);
  const session = found ? readStaffCookie(req, found.owner.id) : null;
  const signedIn = Boolean(session && found && session.epoch === found.owner.staff_session_epoch);
  // A cookie that survived a PIN change would otherwise get the stamper shell,
  // fail its first API call, reload, and loop. Drop it here instead.
  if (session && !signedIn && found) clearStaffCookie(res, found.owner.id);
  // The page is TOLD which card it is for. It used to re-derive that from the
  // URL, so a bare /staff had the browser send x-card-id:"default" no matter
  // which counter the server had actually resolved.
  res.type("html").send(staffPage(signedIn, found?.card.id ?? DEFAULT_CARD_ID));
});

// QR-decoder fallback for browsers without BarcodeDetector (iPhone Safari).
// Served from our own node_modules — no CDN, works offline in the café.
staffRouter.get("/jsqr.js", (_req, res) => {
  res.type("application/javascript").send(loadJsQr());
});

let jsQrCache: string | null = null;
function loadJsQr(): string {
  if (jsQrCache === null) {
    const path = fileURLToPath(new URL("../../node_modules/jsqr/dist/jsQR.js", import.meta.url));
    jsQrCache = readFileSync(path, "utf8");
  }
  return jsQrCache;
}

function passView(row: PassRow) {
  return {
    serial: row.serial,
    shortId: row.serial.slice(0, 8),
    code: row.short_code,
    stamps: row.stamp_count,
    target: row.stamps_target,
    dots: stampDots(row.stamp_count, row.stamps_target),
    rewardReady: isRewardReady(row),
    reward: row.reward,
    createdAt: row.created_at,
  };
}

staffRouter.get("/api/passes", requireStaff, async (req: StaffRequest, res) => {
  const rows = await listRecentPasses(req.card!.id, 20);
  res.json({ passes: rows.map(passView) });
});

/** Look a card up by its printed 6-char code, without stamping it. The staff
 *  list only holds the 20 most recent cards, so filtering that list client-side
 *  could never find an older regular — this searches every card of the café. */
staffRouter.get("/api/lookup", requireStaff, async (req: StaffRequest, res) => {
  const code = String(req.query.code ?? "").trim();
  if (!code) return void res.status(400).json({ error: "missing-code" });
  const row = await getPassByShortCodeForMerchant(req.merchant?.id, code);
  if (!row) {
    // A typed code that matched nothing: a worn poster, a deleted pass, a
    // customer at the wrong shop, or staff mistyping. All four are worth
    // knowing about and none of them leave any other trace.
    await logEvent(req.card!.id, "", "lookup_failed", {
      actor: actorOf(req),
      merchantId: req.merchant?.id ?? null,
      metadata: { code },
    }).catch(() => {});
    return void res.status(404).json({ error: "no-such-card" });
  }
  res.json({ pass: passView(row) });
});

/** Thin HTTP wrapper over applyAndPush (src/cardActions.ts) for the staff routes. */
async function updateAndPush(
  req: StaffRequest,
  res: Response,
  serial: string,
  eventType: EventType,
  update: () => Promise<PassRow | null>,
  forced = false,
): Promise<void> {
  const result = await applyAndPush(req.card!, serial, eventType, update, {
    actor: actorOf(req),
    forced,
    // A customer hands over whichever card they have; the phone shouldn't have
    // to be showing that one already.
    merchantId: req.merchant?.id,
    // The counter must not wait on a wallet. Google can take many seconds to
    // reach an Android phone, and holding the queue for it helps nobody: the
    // stamp is already committed, and this screen is the receipt.
    deferPush: true,
  });
  if (!result) return void res.status(404).json({ error: "no-such-card" });
  res.json({
    pass: passView(result.row),
    push: result.push,
    // Which card it landed on — the staff page names it when it isn't the one
    // currently on screen.
    card: { id: result.card.id, name: result.card.name },
  });
}

staffRouter.post("/api/stamp", requireStaff, async (req: StaffRequest, res) => {
  const { serial, force } = (req.body ?? {}) as { serial?: string; force?: boolean };
  if (!serial) return void res.status(400).json({ error: "missing-serial" });
  if (!force) {
    const secondsLeft = await stampCooldownLeft(serial, req.merchant?.id);
    if (secondsLeft > 0) return void res.status(409).json({ error: "too-soon", secondsLeft });
  }
  await updateAndPush(req, res, serial, "stamp", () => addStamps(serial, 1), force === true);
});

/** Typed-code fallback: staff keys in the short code printed on the card. */
staffRouter.post("/api/stamp-by-code", requireStaff, async (req: StaffRequest, res) => {
  const { code, force } = (req.body ?? {}) as { code?: string; force?: boolean };
  if (!code?.trim()) return void res.status(400).json({ error: "missing-code" });
  const row = await getPassByShortCodeForMerchant(req.merchant?.id, code);
  if (!row) return void res.status(404).json({ error: "no-such-card" });
  if (!force) {
    const secondsLeft = await stampCooldownLeft(row.serial, req.merchant?.id);
    if (secondsLeft > 0) return void res.status(409).json({ error: "too-soon", secondsLeft });
  }
  await updateAndPush(req, res, row.serial, "stamp", () => addStamps(row.serial, 1), force === true);
});

/**
 * Undo one stamp — the fix for a mis-scan. Before this, the only way to take a
 * stamp back was to redeem the card, which handed out a free reward. Logged as
 * its own event type so corrections are visible and net stamp counts stay true.
 */
staffRouter.post("/api/undo", requireStaff, async (req: StaffRequest, res) => {
  const { serial } = (req.body ?? {}) as { serial?: string };
  if (!serial) return void res.status(400).json({ error: "missing-serial" });
  await updateAndPush(req, res, serial, "undo", () => addStamps(serial, -1));
});

staffRouter.post("/api/redeem", requireStaff, async (req: StaffRequest, res) => {
  const { serial } = (req.body ?? {}) as { serial?: string };
  if (!serial) return void res.status(400).json({ error: "missing-serial" });
  await updateAndPush(req, res, serial, "redeem", () => redeemPass(serial));
});
