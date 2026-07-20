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
import { getPass, logEvent, pushTokensForSerial, type CafeRow, type EventType, type PassRow } from "./db.js";

export interface PushSummary {
  sent: number;
  failed: number;
  registeredDevices: number;
  detail: { status?: number; reason?: string }[];
}

/**
 * Applies `update()` to a card that must belong to `cafe`, logs the event, and
 * pushes the change to the phone. Returns null when the card is missing or not
 * this café's (callers map that to 404). Never throws on a delivery failure —
 * the push result is reported in the summary.
 */
export async function applyAndPush(
  cafe: CafeRow,
  serial: string,
  eventType: EventType,
  update: () => Promise<PassRow | null>,
  nudgeText?: string,
): Promise<{ row: PassRow; push: PushSummary } | null> {
  const existing = await getPass(serial);
  if (!existing || existing.cafe_id !== cafe.id) return null;
  const row = await update();
  if (!row) return null;
  await logEvent(cafe.id, serial, eventType);

  let push: PushSummary;
  if (row.platform === "google") {
    const result =
      eventType === "nudge" && nudgeText
        ? await addMessage(row, cafe, nudgeText)
        : await patchBalance(row, cafe);
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
  return { row, push };
}
