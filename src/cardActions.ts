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
import { addMessage, patchBalance } from "./googleWallet.js";
import {
  getCard,
  getPass,
  logEvent,
  pushTokensForSerial,
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
  const { nudgeText, merchantId, ...meta } = opts;
  const existing = await getPass(serial);
  if (!existing) return null;

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
  await logEvent(card.id, serial, eventType, meta);

  let push: PushSummary;
  if (row.platform === "google") {
    const result =
      eventType === "nudge" && nudgeText
        ? await addMessage(row, card, nudgeText)
        : await patchBalance(row, card);
    push = {
      sent: result.ok ? 1 : 0,
      failed: result.ok ? 0 : 1,
      registeredDevices: 1, // Google hosts the card — no per-device registrations.
      detail: [{ status: result.status, reason: result.reason }],
    };
  } else {
    const pushResults = await pushPassUpdate(await pushTokensForSerial(serial));
    push = {
      sent: pushResults.filter((r) => r.ok).length,
      failed: pushResults.filter((r) => !r.ok).length,
      registeredDevices: pushResults.length,
      detail: pushResults.map((r) => ({ status: r.status, reason: r.reason })),
    };
  }
  return { row, push, card };
}
