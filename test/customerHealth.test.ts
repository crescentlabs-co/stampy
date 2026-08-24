/**
 * The four customer-health groups, exercised as a pure ladder.
 *
 * These decide what an owner is told about their own shop, so the boundaries
 * matter more than the middles: every one of them is a place where a customer
 * silently changes category, and a shop that reads "3 regulars" when it has two
 * is worse than one that reads nothing.
 *
 * The rule lives beside `bucketOf` in routes/dashboard.ts on purpose — the two
 * are different axes over the same people (may they be messaged / are they any
 * good to the shop) and keeping them adjacent is what stops the next person
 * collapsing one into the other.
 */
import { describe, expect, it } from "vitest";
import { HEALTH, healthOf, RETURN_CYCLES, returnCycleOf, RETURN_CYCLE_FALLBACK } from "../src/routes/dashboard.js";

/** Visits needed to be a Regular, per cycle — fewer as the cycle lengthens. */
const REGULAR_AT: Record<number, number> = { 14: 5, 21: 4, 28: 3 };

describe("the return cycle", () => {
  it("accepts only the three the dashboard offers", () => {
    for (const days of RETURN_CYCLES) expect(returnCycleOf(days)).toBe(days);
  });

  /**
   * A shop that has never answered still has to get sensible groups — the
   * section cannot be blank on day one, and the setup banner is what asks.
   */
  it("falls back for null, and for anything that is not on the list", () => {
    for (const junk of [null, undefined, 0, 7, 30, 999, Number.NaN]) {
      expect(returnCycleOf(junk as never)).toBe(RETURN_CYCLE_FALLBACK);
    }
  });
});

describe("healthOf", () => {
  it("puts every customer in exactly one of the four", () => {
    const keys = HEALTH.map((h) => h.key).sort();
    expect(keys).toEqual(["lost", "new", "regular", "returning"]);
    // Exhaustive over a realistic grid: no combination falls through.
    for (const cycle of RETURN_CYCLES) {
      for (let visits = 0; visits <= 30; visits++) {
        for (let days = 0; days <= 200; days += 7) {
          expect(keys).toContain(healthOf(visits, days, cycle));
        }
      }
    }
  });

  /**
   * Lost is checked FIRST, so it wins over everything — including a long
   * history. That is the deliberate choice: it leaves Lost as the single number
   * that moves when a shop starts losing people, instead of spreading the bad
   * news over two groups that each still look half-healthy.
   */
  describe("lost", () => {
    it("takes anyone overdue by more than two cycles, however loyal", () => {
      for (const cycle of RETURN_CYCLES) {
        expect(healthOf(50, cycle * 2 + 1, cycle)).toBe("lost");
        expect(healthOf(0, cycle * 2 + 1, cycle)).toBe("lost");
      }
    });

    /** The boundary itself is NOT lost — two cycles exactly is still in touch. */
    it("does not take someone exactly two cycles out", () => {
      for (const cycle of RETURN_CYCLES) {
        expect(healthOf(50, cycle * 2, cycle)).not.toBe("lost");
      }
    });
  });

  describe("regular", () => {
    it("needs fewer visits the longer the cycle", () => {
      for (const cycle of RETURN_CYCLES) {
        const bar = REGULAR_AT[cycle]!;
        expect(healthOf(bar, 0, cycle)).toBe("regular");
        expect(healthOf(bar - 1, 0, cycle)).not.toBe("regular");
      }
    });

    /**
     * The founder's point, and the reason the bar moves at all: five visits is
     * a month at a cafe and most of a year at a barber. One fixed number would
     * make "regular" mean loyal in one trade and unreachable in the other.
     */
    it("calls the same customer regular at a slow cycle and not at a fast one", () => {
      expect(healthOf(3, 0, 28)).toBe("regular");
      expect(healthOf(3, 0, 14)).toBe("returning");
    });

    /**
     * A regular who goes quiet keeps the badge until they are Lost. Confirmed
     * with the founder over dropping to Returning: "Returning" would then mean
     * two opposite things — building a habit, and losing one.
     */
    it("keeps a lapsing regular until they cross into lost", () => {
      expect(healthOf(8, 5, 14)).toBe("regular");
      expect(healthOf(8, 27, 14)).toBe("regular");
      expect(healthOf(8, 29, 14)).toBe("lost");
    });
  });

  describe("returning and new", () => {
    it("separates a second visit from a first", () => {
      expect(healthOf(2, 0, 14)).toBe("returning");
      expect(healthOf(1, 0, 14)).toBe("new");
    });

    /**
     * Nobody is counted as Returning on the strength of stamps they were GIVEN.
     * Welcome stamps write no event, so a card issued today holding two of them
     * is zero visits — New. Getting this wrong would have every shop's groups
     * report a base of returning customers it had never served.
     */
    it("counts a freshly issued card with welcome stamps as new", () => {
      expect(healthOf(0, 0, 14)).toBe("new");
    });
  });
});
