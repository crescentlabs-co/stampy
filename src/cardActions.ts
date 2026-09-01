/**
 * Card mutation + cross-platform delivery — the one place a card change turns
 * into a phone notification. Shared by the staff stamper (stamp/redeem) and the
 * owner dashboard (nudge / bulk win-back), so both platforms behave identically.
 *
 *   apple  → empty APNs push; the device re-fetches the pass and iOS renders the
 *            changeMessage banner.
 *   google → PATCH the LoyaltyObject (NOTIFY_ON_UPDATE) or addMessage
 *            (TEXT_AND_NOTIFY for nudges); Google delivers it.
 *
 * Every mutation logs an `events` row (dashboard metrics + win-back depend on it).
 */
import { pushPassUpdate } from "./apns.js";
import { addMessage, ensureClass, patchBalance } from "./googleWallet.js";
import {
  dropDeadRegistration,
  getCard,
  getPass,
  logEvent,
  logMessage,
  optedOutSerial,
  pushTokensForCard,
  pushTokensForSerial,
  touchPassesForCard,
  type CardRow,
  type EventMeta,
  type EventType,
  type PassRow,
} from "./db.js";

export interface PushSummary {
  sent: number;
  failed: number;
  registeredDevices: number;
  detail: { status?: number; reason?: string }[];
  /** Round trip to the platform in ms. Absent when the push hasn't run yet. */
  ms?: number;
  /** True when delivery was handed to the background and nothing is known yet. */
  pending?: boolean;
}

/** Per-call extras: the nudge body (Google shows it as a message) plus audit fields. */
export interface ApplyOptions extends EventMeta {
  nudgeText?: string;
  /**
   * Widen the scope from one card to a whole merchant. The staff stamper sets
   * this so a customer can present ANY of the shop's cards and it just works —
   * without it, whatever card the phone happened to be showing would refuse.
   */
  merchantId?: string;
  /**
   * Return as soon as the stamp is committed and logged, and deliver to the
   * wallet in the background. The staff stamper sets this: at a counter the
   * staff screen is the receipt, and making it wait on Google — which can take
   * many seconds to reach an Android phone — holds up the queue for something
   * neither the customer nor the till is looking at.
   *
   * Never set for a nudge: logMessage records whether the message actually
   * arrived, and that row is the only history of what was sent.
   */
  deferPush?: boolean;
}

/**
 * Serialises background pushes per pass. Two quick stamps would otherwise race,
 * and the loser could land last and put a stale count back on the phone.
 */
const pushQueue = new Map<string, Promise<unknown>>();

function queuePush(serial: string, run: () => Promise<unknown>): void {
  const next = (pushQueue.get(serial) ?? Promise.resolve())
    .catch(() => {})
    .then(run)
    .catch((err) => console.error("[push] background delivery failed:", serial, err));
  pushQueue.set(serial, next);
  void next.finally(() => {
    if (pushQueue.get(serial) === next) pushQueue.delete(serial);
  });
}

/**
 * Applies `update()` to a pass, logs the event, and pushes the change to the
 * phone. Returns null when the pass is missing or out of scope (callers map that
 * to 404). Never throws on a delivery failure — the push result is in the summary.
 *
 * Scope is `card` alone, unless `merchantId` is given, in which case any card of
 * that merchant is accepted. Either way the event and the Google patch are
 * written against the pass's OWN card, never the one the caller guessed at — get
 * that wrong and stamps land on the wrong programme's metrics.
 */
export async function applyAndPush(
  card: CardRow,
  serial: string,
  eventType: EventType,
  update: () => Promise<PassRow | null>,
  opts: ApplyOptions = {},
): Promise<{ row: PassRow; push: PushSummary; card: CardRow } | null> {
  const { nudgeText, merchantId, deferPush, ...meta } = opts;
  const existing = await getPass(serial);
  if (!existing) return null;

  // A customer who asked us to stop gets no marketing, whichever way the send
  // was started. `canNudge` already filters the dashboard's list, but that is a
  // PRE-FILTER in the route — this is the gate, and it is here because every
  // nudge in the product passes through this function and nothing else does.
  //
  // Refused BEFORE update(): the mutation for a nudge is setMessage(), so
  // running it would write wording onto a card nobody is allowed to message and
  // Apple would banner it on the pass's next fetch. Only marketing is stopped;
  // a stamp, an undo and a redeem all fall straight through.
  if (eventType === "nudge" && (await optedOutSerial(serial))) return null;

  let onCard = card;
  if (existing.card_id !== card.id) {
    if (!merchantId) return null;
    const other = await getCard(existing.card_id);
    if (!other || other.merchant_id !== merchantId) return null;
    onCard = other;
  }
  card = onCard;

  const row = await update();
  if (!row) return null;

  // The card filled up on this action. Replayable in principle — walk every
  // stamp in order against the target — but only until someone edits the
  // target, so it is written down at the moment it is true instead.
  // Neither of the two kinds without a card to fill can complete one. A
  // membership tally has no target, and a points balance is spent down rather
  // than finished — logging `completed` on either would put a milestone in the
  // shop's history that never happened.
  const fillable = row.kind !== "membership" && row.kind !== "points";
  const justCompleted =
    eventType === "stamp" && fillable && row.stamp_count >= row.stamps_target;

  const eventId = await logEvent(card.id, serial, eventType, {
    ...meta,
    stampsAfter: row.stamp_count,
    stampsTarget: row.stamps_target,
  });

  // Sits right after the stamp that caused it, which is the order that matters.
  // It used to be logged after delivery, which now happens on another timeline.
  if (justCompleted) {
    await logEvent(card.id, serial, "completed", {
      ...meta,
      stampsAfter: row.stamp_count,
      stampsTarget: row.stamps_target,
    }).catch((err) => console.error("[completed] not logged:", err));
  }

  if (deferPush) {
    // The stamp is committed and logged by now, so a delivery that never
    // succeeds loses a notification, never the stamp itself — and the next
    // stamp re-sends the whole current state anyway.
    queuePush(serial, () => deliver(serial, card, eventType));
    return { row, push: { sent: 0, failed: 0, registeredDevices: 0, detail: [], pending: true }, card };
  }

  const push = await deliver(serial, card, eventType, nudgeText, row);

  // What was ACTUALLY sent, and whether it arrived. passes.message keeps only
  // the latest wording and the next nudge overwrites it, so without this row
  // the text is gone — and "did this message work" is not answerable about a
  // message you can no longer read. Delivery matters just as much: 40 sent with
  // 12 undelivered is a different response rate from 40 sent.
  if (eventType === "nudge" && nudgeText) {
    await logMessage({
      eventId,
      serial,
      customerId: row.customer_id ?? null,
      cardId: card.id,
      kind: meta.actor === "auto" ? "auto-winback" : "manual-nudge",
      body: nudgeText,
      platform: row.platform,
      delivered: push.sent > 0 ? true : push.failed > 0 ? false : null,
      failReason: push.detail.find((d) => d.reason)?.reason ?? "",
    }).catch((err) => console.error("[message] not recorded:", err));
  }

  return { row, push, card };
}

/**
 * Send the pass's CURRENT state to whichever platform holds it.
 *
 * `fresh` is the row the caller already has; background callers omit it and the
 * pass is re-read here instead, so a delivery that waited behind another one
 * sends what is true now rather than what was true when it was queued.
 *
 * Retries a failure once — most are transient — and never throws.
 */
async function deliver(
  serial: string,
  card: CardRow,
  eventType: EventType,
  nudgeText?: string,
  fresh?: PassRow,
): Promise<PushSummary> {
  const row = fresh ?? (await getPass(serial));
  if (!row) return { sent: 0, failed: 0, registeredDevices: 0, detail: [] };

  if (row.platform === "google") {
    let result =
      eventType === "nudge" && nudgeText
        ? await addMessage(row, card, nudgeText)
        : await patchBalance(row, card);
    if (!result.ok && result.reason !== "google-not-configured" && !nudgeText) {
      await new Promise((r) => setTimeout(r, 1000));
      result = await patchBalance(row, card);
    }
    return {
      sent: result.ok ? 1 : 0,
      failed: result.ok ? 0 : 1,
      registeredDevices: 1, // Google hosts the card — no per-device registrations.
      detail: [{ status: result.status, reason: result.reason }],
      ms: result.ms,
    };
  }

  const started = Date.now();
  const pushResults = await pushPassUpdate(await pushTokensForSerial(serial));
  // 410 Unregistered: Apple is telling us the card is off that device.
  // Free churn evidence that used to be read once and thrown away.
  for (const dead of pushResults.filter((r) => r.status === 410)) {
    await dropDeadRegistration(dead.token).catch((err) =>
      console.error("[pass_dropped] not recorded:", err),
    );
  }
  return {
    sent: pushResults.filter((r) => r.ok).length,
    failed: pushResults.filter((r) => !r.ok).length,
    registeredDevices: pushResults.length,
    detail: pushResults.map((r) => ({ status: r.status, reason: r.reason })),
    ms: Date.now() - started,
  };
}

/**
 * A card's LOOK changed — colours, logo, band, stamp grid — so tell both
 * platforms to come and get it.
 *
 * This is not `applyAndPush`. Nothing about a pass has changed here: no stamp,
 * no event, no audit row, and nobody's progress moved. It is a re-fetch, not a
 * mutation, which is why it lives beside that function rather than inside it.
 *
 *   google → PATCH the LoyaltyClass, which every object of this card inherits,
 *            so Android updates in place.
 *   apple  → an EMPTY APNs push to every device holding a pass of this card;
 *            the phone comes back and downloads the new .pkpass.
 *
 * **No notification appears on anybody's phone.** iOS raises a banner only when
 * a field carrying `changeMessage` changes value, and exactly two do — progress
 * and message (invariant 3, with a test holding it). A colour is neither. So
 * this is a silent refresh, which is the distinction invariant 3 exists to
 * protect: one *notification* per event, not one push.
 *
 * Fire-and-forget from a route: it must never make an owner wait, and a wallet
 * that cannot be reached is not a reason to fail a save that already succeeded.
 */
export async function refreshCardArt(card: CardRow): Promise<PushSummary> {
  const started = Date.now();
  // FIRST, and awaited on its own before anything is pushed. The APNs push is
  // only a doorbell: the phone answers it by asking `serialsUpdatedSince` what
  // changed, and that question is answered purely from `passes.updated_at`. Push
  // before bumping and the phone can arrive to be told "nothing" — which is not
  // a hypothetical race, it is what this whole function did until now, because
  // nothing bumped the column at all. See touchPassesForCard in src/db.ts.
  await touchPassesForCard(card.id);
  const [, pushResults] = await Promise.all([
    ensureClass(card).then((r) => {
      if (!r.ok && r.reason !== "google-not-configured") {
        console.error("[refreshCardArt] google class sync failed:", r);
      }
    }),
    pushTokensForCard(card.id).then(pushPassUpdate),
  ]);
  // 410 Unregistered: the same free churn evidence a stamp push collects, and
  // it must not be thrown away just because this push carried no stamp.
  for (const dead of pushResults.filter((r) => r.status === 410)) {
    await dropDeadRegistration(dead.token).catch((err) =>
      console.error("[pass_dropped] not recorded:", err),
    );
  }
  return {
    sent: pushResults.filter((r) => r.ok).length,
    failed: pushResults.filter((r) => !r.ok).length,
    registeredDevices: pushResults.length,
    detail: pushResults.map((r) => ({ status: r.status, reason: r.reason })),
    ms: Date.now() - started,
  };
}
