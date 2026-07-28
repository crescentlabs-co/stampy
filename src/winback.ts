/**
 * The nudge limits — the one place both the count on screen and the send itself
 * decide whether a customer may be messaged.
 *
 * There is no scheduler. Automated win-back existed until v1.5 and was removed:
 * a message going out on a timer, on the owner's behalf but without them
 * present, is not something a café owner can supervise, and it made the rules
 * ("their window" vs "the shared cap") impossible to state in one sentence.
 * Nudging is now an owner action, taken from the dashboard, with one rule.
 *
 * That rule is a per-customer cooldown. Delivery still goes through the same
 * `applyAndPush` as everything else, so Google's 3/card/24h cap is respected and
 * an unconfigured platform degrades gracefully (never throws).
 */
import { nudgeState, type NudgeState } from "./db.js";

/**
 * Give up after this many messages with no visit in between. Someone who ignored
 * six nudges has churned: another reads as spam, and on Google each one burns a
 * notification from the three a card is allowed per day. The dashboard goes
 * quiet on its own — this is not advisory.
 */
export const MAX_UNANSWERED_NUDGES = 6;

/**
 * One message per customer per 7 days, however it was triggered. This is THE
 * rule: a customer messaged on Monday cannot be messaged again until the
 * following Monday, whichever button was pressed and however many of the shop's
 * cards they hold.
 */
export const MAX_NUDGES_PER_WEEK = 1;

export type NudgeRefusal = "rate-limited" | "ignored" | "removed";

/**
 * Kept as a pure function over `nudgeState` so the group the owner *sees* and
 * the group the Nudge button *sends to* cannot drift apart — which is exactly
 * what happened when the cap lived in a browser dialog instead.
 */
export function canNudge(state: NudgeState): { ok: true } | { ok: false; reason: NudgeRefusal } {
  if (state.removed) return { ok: false, reason: "removed" };
  if (state.unanswered >= MAX_UNANSWERED_NUDGES) return { ok: false, reason: "ignored" };
  if (state.nudges7d >= MAX_NUDGES_PER_WEEK) return { ok: false, reason: "rate-limited" };
  return { ok: true };
}

/** Same decision, straight from a serial. Unknown serial is not nudgeable. */
export async function canNudgeSerial(
  serial: string,
): Promise<{ ok: true } | { ok: false; reason: NudgeRefusal }> {
  const state = await nudgeState(serial);
  if (!state) return { ok: false, reason: "removed" };
  return canNudge(state);
}
