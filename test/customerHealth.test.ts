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
import {
  HEALTH,
  healthOf,
  LOST_AFTER,
  REGULAR_GAP,
  REGULAR_STAMPS,
  RETURN_CYCLES,
  returnCycleOf,
  RETURN_CYCLE_FALLBACK,
} from "../src/routes/dashboard.js";

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

  /** The two thresholds a shop is judged on, at every cycle it can pick. */
  it("has a regular gap and a lost window for each of the three", () => {
    expect(REGULAR_GAP).toEqual({ 14: 11, 21: 18, 28: 25 });
    expect(LOST_AFTER).toEqual({ 14: 21, 21: 35, 28: 49 });
    expect(REGULAR_STAMPS).toBe(3);
  });
});

describe("healthOf", () => {
  it("puts every customer in exactly one of the four", () => {
    const keys = HEALTH.map((h) => h.key).sort();
    expect(keys).toEqual(["lost", "new", "regular", "returning"]);
    // Exhaustive over a realistic grid, gaps included: nothing falls through,
    // and nothing lands in two groups. Infinity is in the gaps on purpose — it
    // is what a customer with one visit actually carries.
    for (const cycle of RETURN_CYCLES) {
      for (let visits = 0; visits <= 30; visits++) {
        for (let days = 0; days <= 200; days += 7) {
          for (const gap of [0, 3, 11, 18, 25, 60, Infinity]) {
            expect(keys).toContain(healthOf(visits, days, gap, cycle));
          }
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
    it("takes anyone past the window, however loyal", () => {
      for (const cycle of RETURN_CYCLES) {
        const out = LOST_AFTER[cycle] + 1;
        expect(healthOf(50, out, 1, cycle)).toBe("lost");
        expect(healthOf(0, out, Infinity, cycle)).toBe("lost");
      }
    });

    /** The boundary itself is NOT lost — exactly the window is still in touch. */
    it("does not take someone sitting exactly on the boundary", () => {
      for (const cycle of RETURN_CYCLES) {
        expect(healthOf(50, LOST_AFTER[cycle], 1, cycle)).not.toBe("lost");
      }
    });

    /** Three weeks, five weeks, seven weeks — twice the middle of each range. */
    it("waits longer the longer the shop's cycle", () => {
      expect(healthOf(9, 22, 1, 14)).toBe("lost");
      expect(healthOf(9, 22, 1, 21)).toBe("regular");
      expect(healthOf(9, 36, 1, 21)).toBe("lost");
      expect(healthOf(9, 36, 1, 28)).toBe("regular");
    });
  });

  describe("regular", () => {
    /**
     * The whole reason this rule changed. A count on its own said a shop a
     * fortnight old had three Regulars, because three stamps in one afternoon
     * and three stamps over three months were the same number. Regular is a
     * claim about RHYTHM, so it is judged on the rhythm.
     */
    it("needs three COUNTER stamps AND a gap inside the cycle", () => {
      // The sign-up is visit 1, so three stamps is four visits. The bar is
      // written in stamps precisely so that counting the sign-up towards it
      // could not quietly loosen Regular to two stamps.
      const visitsFor = (stamps: number) => stamps + 1;
      for (const cycle of RETURN_CYCLES) {
        const ok = REGULAR_GAP[cycle];
        expect(healthOf(visitsFor(REGULAR_STAMPS), 0, ok, cycle)).toBe("regular");
        expect(healthOf(visitsFor(REGULAR_STAMPS), 0, ok + 1, cycle)).toBe("returning");
        // Three stamps in one day is a rhythm of nothing, and used to be enough.
        expect(healthOf(visitsFor(REGULAR_STAMPS), 0, 0, cycle)).toBe("regular");
        // Two stamps at a perfect rhythm is still not three.
        expect(healthOf(visitsFor(REGULAR_STAMPS - 1), 0, ok, cycle)).toBe("returning");
      }
    });

    /**
     * The sign-up counts as a visit but must NOT count towards the stamp bar —
     * that would have made Regular reachable on two counter stamps in the same
     * change that started counting it.
     */
    it("does not let the sign-up itself pay for a third stamp", () => {
      expect(healthOf(3, 0, 1, 14)).toBe("returning");
      expect(healthOf(4, 0, 1, 14)).toBe("regular");
    });

    /**
     * The founder's point, and the reason the threshold moves at all: a
     * fortnight between visits is a regular at a barber and a stranger at a
     * cafe. One fixed number would make "regular" mean loyal in one trade and
     * unreachable in the other.
     */
    it("calls the same customer regular at a slow cycle and not at a fast one", () => {
      expect(healthOf(5, 0, 17, 28)).toBe("regular");
      expect(healthOf(5, 0, 17, 14)).toBe("returning");
    });

    /**
     * A regular who goes quiet keeps the badge until they are Lost. Confirmed
     * with the founder over dropping to Returning: "Returning" would then mean
     * two opposite things — building a habit, and losing one.
     */
    it("keeps a lapsing regular until they cross into lost", () => {
      expect(healthOf(8, 5, 7, 14)).toBe("regular");
      expect(healthOf(8, 21, 7, 14)).toBe("regular");
      expect(healthOf(8, 22, 7, 14)).toBe("lost");
    });
  });

  describe("returning and new", () => {
    it("separates a customer who came back from one who only signed up", () => {
      expect(healthOf(2, 0, 3, 14)).toBe("returning");
      expect(healthOf(1, 0, Infinity, 14)).toBe("new");
    });

    /**
     * Nobody is counted as Returning on the strength of stamps they were GIVEN.
     * Welcome stamps write no event, so a card issued today holding two of them
     * is zero visits — New. Getting this wrong would have every shop's groups
     * report a base of returning customers it had never served.
     */
    it("counts a freshly issued card with welcome stamps as new", () => {
      // One visit — the sign-up — however many welcome stamps it was worth.
      expect(healthOf(1, 0, Infinity, 14)).toBe("new");
    });

    /**
     * One stamp carries no gap at all, and a missing rhythm must never read as
     * a perfect one — Infinity, not zero. If it were zero, the arithmetic would
     * say "inside the cycle" about somebody who has been in once.
     */
    it("never makes a just-signed-up customer regular, whatever the cycle", () => {
      for (const cycle of RETURN_CYCLES) {
        expect(healthOf(1, 0, Infinity, cycle)).toBe("new");
        expect(healthOf(0, 0, Infinity, cycle)).toBe("new");
      }
    });
  });
});
