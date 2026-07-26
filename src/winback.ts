/**
 * Automated win-back — the background half of the manual dashboard nudge.
 *
 * For every café that opted in, message customers who haven't stamped in
 * `auto_winback_days`, but skip anyone already nudged (auto OR manual) within
 * that same window so nobody gets spammed. Runs hourly from server.ts; the
 * "already nudged" guard makes frequent polling safe. Delivery goes through the
 * same `applyAndPush` as everything else, so Google's 3/card/24h cap is
 * respected and an unconfigured platform degrades gracefully (never throws).
 */
import { applyAndPush } from "./cardActions.js";
import {
  cafesWithAutoWinback,
  lapsingSerials,
  lastNudgeAt,
  nudgeState,
  setMessage,
  type CafeRow,
  type NudgeState,
} from "./db.js";

/**
 * Give up after this many messages with no visit in between. Someone who ignored
 * six win-backs has churned: another reads as spam, and on Google each one burns
 * a notification from the three a card is allowed per day. The job goes quiet on
 * its own, and so does the dashboard — this is not advisory.
 */
export const MAX_UNANSWERED_NUDGES = 6;

/**
 * And never more than this many in any 7-day window, however the nudge was
 * triggered. Well under Google's hard 3/card/24h cap, and it is the limit that
 * actually stops an owner tapping "Nudge all" twice on a Monday.
 */
export const MAX_NUDGES_PER_WEEK = 2;

export type NudgeRefusal = "rate-limited" | "ignored" | "removed";

/**
 * The single place both nudge paths — the owner's dashboard button and the hourly
 * job — decide whether a card may be messaged. Kept as a pure function over
 * `nudgeState` so the two can't drift apart, which is exactly what happened when
 * the cap lived only in the job and the dashboard asked a browser dialog instead.
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

async function runForCafe(cafe: CafeRow): Promise<{ sent: number; skipped: number; givenUp: number }> {
  const days = Math.max(1, cafe.auto_winback_days);
  const windowMs = days * 86_400_000;
  const serials = await lapsingSerials(cafe.id, days);
  let sent = 0;
  let skipped = 0;
  let givenUp = 0;
  for (const serial of serials) {
    // The café's own window is usually wider than the shared 2-per-week limit
    // (a 30-day win-back must not fire fortnightly), so it is checked as well.
    const last = await lastNudgeAt(serial);
    if (last && Date.now() - new Date(last).getTime() < windowMs) {
      skipped++;
      continue; // already reached out this window
    }
    const state = await nudgeState(serial);
    if (!state) continue;
    const allowed = canNudge(state);
    if (!allowed.ok) {
      if (allowed.reason === "ignored") givenUp++;
      else skipped++;
      continue; // churned, rate-limited, or the card is gone from their wallet
    }
    const r = await applyAndPush(cafe, serial, "nudge", () => setMessage(serial, cafe.auto_winback_message), {
      nudgeText: cafe.auto_winback_message,
      actor: "auto",
    });
    if (r) sent++;
  }
  return { sent, skipped, givenUp };
}

/** One pass over all opted-in cafés. Isolates per-café errors; never throws. */
export async function runAutoWinback(): Promise<void> {
  let cafes: CafeRow[];
  try {
    cafes = await cafesWithAutoWinback();
  } catch (err) {
    console.error("[winback] could not load cafés:", err);
    return;
  }
  for (const cafe of cafes) {
    try {
      const { sent, skipped, givenUp } = await runForCafe(cafe);
      if (sent > 0 || givenUp > 0) {
        console.log(`[winback] ${cafe.id}: sent ${sent}, skipped ${skipped}, gave up on ${givenUp}`);
      }
    } catch (err) {
      console.error(`[winback] café ${cafe.id} failed:`, err);
    }
  }
}
