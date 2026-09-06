import { MAX_POINTS_COST } from "./db.js";

export const MAX_COUNTER_SPEND_CENTS = 100_000_000; // RM1,000,000

export type SpendPointsResult =
  | { ok: true; spendCents: number; points: number }
  | { ok: false; error: "invalid-spend" | "invalid-points-rule" };

/**
 * Calculate a spend award from the programme's stored rule.
 *
 * The browser supplies only the bill total. Both preview and confirmation call
 * this function, so changing a preview response or adding an `amount` field to
 * the final request can never mint extra points.
 */
export function pointsForSpend(
  spend: unknown,
  earnSpendCents: number,
  earnPoints: number,
): SpendPointsResult {
  const rate = Math.trunc(earnSpendCents);
  const per = Math.trunc(earnPoints);
  if (rate < 1 || per < 1) return { ok: false, error: "invalid-points-rule" };

  const raw = typeof spend === "number" ? String(spend) : typeof spend === "string" ? spend.trim() : "";
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(raw)) return { ok: false, error: "invalid-spend" };
  const [whole, fraction = ""] = raw.split(".");
  const spendCents = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
  if (!Number.isSafeInteger(spendCents) || spendCents < 1 || spendCents > MAX_COUNTER_SPEND_CENTS) {
    return { ok: false, error: "invalid-spend" };
  }

  // Keep the counter's established behaviour: partial units still earn one
  // point, complete units round down, and no single action can exceed the
  // programme-wide balance ceiling.
  const points = Math.max(1, Math.min(MAX_POINTS_COST, Math.floor((spendCents / rate) * per)));
  return { ok: true, spendCents, points };
}

export function fixedVisitPoints(earnPoints: number): number {
  return Math.max(1, Math.min(MAX_POINTS_COST, Math.trunc(earnPoints) || 1));
}
