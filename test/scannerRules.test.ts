import { describe, expect, it } from "vitest";
import { MAX_POINTS_COST } from "../src/db.js";
import { fixedVisitPoints, pointsForSpend } from "../src/scannerRules.js";

describe("scanner points rules", () => {
  it("calculates points from ringgit using integer cents", () => {
    expect(pointsForSpend("12.34", 100, 2)).toEqual({ ok: true, spendCents: 1234, points: 24 });
  });

  it("rounds complete earning units down and preserves the one-point minimum", () => {
    expect(pointsForSpend("4.99", 300, 5)).toEqual({ ok: true, spendCents: 499, points: 8 });
    expect(pointsForSpend("0.10", 100, 1)).toEqual({ ok: true, spendCents: 10, points: 1 });
  });

  it("rejects malformed, zero, negative, and implausibly large spend", () => {
    for (const spend of ["", "1.999", "-2", "nope", 0, 1_000_001, null]) {
      expect(pointsForSpend(spend, 100, 1)).toEqual({ ok: false, error: "invalid-spend" });
    }
  });

  it("refuses a broken programme rule instead of silently awarding points", () => {
    expect(pointsForSpend("10", 0, 1)).toEqual({ ok: false, error: "invalid-points-rule" });
    expect(pointsForSpend("10", 100, 0)).toEqual({ ok: false, error: "invalid-points-rule" });
  });

  it("caps fixed and spend awards at the shared points ceiling", () => {
    expect(fixedVisitPoints(MAX_POINTS_COST + 1)).toBe(MAX_POINTS_COST);
    expect(pointsForSpend("1000000", 1, MAX_POINTS_COST)).toEqual({
      ok: true,
      spendCents: 100_000_000,
      points: MAX_POINTS_COST,
    });
  });
});
