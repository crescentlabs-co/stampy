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
  setMessage,
  type CafeRow,
} from "./db.js";

async function runForCafe(cafe: CafeRow): Promise<{ sent: number; skipped: number }> {
  const days = Math.max(1, cafe.auto_winback_days);
  const windowMs = days * 86_400_000;
  const serials = await lapsingSerials(cafe.id, days);
  let sent = 0;
  let skipped = 0;
  for (const serial of serials) {
    const last = await lastNudgeAt(serial);
    if (last && Date.now() - new Date(last).getTime() < windowMs) {
      skipped++;
      continue; // already reached out this window
    }
    const r = await applyAndPush(
      cafe,
      serial,
      "nudge",
      () => setMessage(serial, cafe.auto_winback_message),
      cafe.auto_winback_message,
    );
    if (r) sent++;
  }
  return { sent, skipped };
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
      const { sent, skipped } = await runForCafe(cafe);
      if (sent > 0) console.log(`[winback] ${cafe.id}: sent ${sent}, skipped ${skipped}`);
    } catch (err) {
      console.error(`[winback] café ${cafe.id} failed:`, err);
    }
  }
}
