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
 * TWO messages per customer per 7 days, however they were triggered. This is
 * THE rule, and the only one: a customer who has had two messages inside a
 * rolling week cannot have a third, whichever button was pressed and however
 * many of the shop's cards they hold.
 *
 * It was one a week. Two is still a long way under Google's own ceiling of
 * three notifications per card per 24 hours, and the window is rolling rather
 * than a calendar week — two on Monday means nothing more until the following
 * Monday, two spread across the week means the next is due as the first ages
 * out. Nothing else in the product knows this number: change it here and the
 * cap, the groups on screen and the button that sends all move together.
 *
 * There used to be a second rule — give up after six messages with no visit in
 * between. It was removed because it read a run of silence as proof somebody
 * had churned, which it is not: people ignore messages and come back anyway,
 * and a weekly cooldown is already restraint enough. Two rules also meant an
 * owner could see a customer they wanted to reach and not be able to tell which
 * one was stopping them. The unanswered count is still shown on the customer —
 * it is a useful thing to know, it just no longer decides anything.
 */
export const MAX_NUDGES_PER_WEEK = 2;

export type NudgeRefusal = "rate-limited" | "removed";

/**
 * Kept as a pure function over `nudgeState` so the group the owner *sees* and
 * the group the Nudge button *sends to* cannot drift apart — which is exactly
 * what happened when the cap lived in a browser dialog instead.
 */
export function canNudge(state: NudgeState): { ok: true } | { ok: false; reason: NudgeRefusal } {
  if (state.removed) return { ok: false, reason: "removed" };
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
