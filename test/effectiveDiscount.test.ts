/**
 * The number a shop owner actually decides on, RUN rather than grepped.
 *
 * "Your effective discount is 12.5%" is the one figure in the Create flow that
 * a merchant will act on — it is what tells them whether their card is too mean
 * to work or too generous to survive. It lives inside a template string, so
 * nothing type-checks it and a wrong band or an off-by-one in the visit count
 * would ship looking completely normal.
 *
 * So these lift the four functions out of the page the dashboard actually
 * serves and execute them, the same way HEALTH_JS is tested.
 */
import { describe, expect, it } from "vitest";
import { dashboardPage } from "../src/dashboardV2.js";

const html = dashboardPage({ emailConfigured: true } as never);
const src = html.slice(
  html.indexOf("function visitsPerReward(target"),
  html.indexOf("* A campaign: choose, preview, send"),
);

const run = new Function(
  src.slice(0, src.lastIndexOf("/**")) +
  "\nreturn { visitsPerReward, rewardShare, effectiveDiscount, discountBand, suggestedTarget };",
)() as {
  visitsPerReward: (t: number, w: number, p: number) => number;
  rewardShare: (type: string, percent: number) => number;
  effectiveDiscount: (r: Record<string, unknown>) => number;
  discountBand: (pct: number) => { key: string; label: string };
  suggestedTarget: (days: number) => number;
};

describe("visits per reward", () => {
  /**
   * The founder's own worked example: eight stamps, two welcome, one a visit is
   * seven visits. Six to fill the card, plus the one they walk in and claim it
   * on.
   */
  it("matches the example the rule was written from", () => {
    expect(run.visitsPerReward(8, 2, 1)).toBe(7);
  });

  it("takes one more visit at the new default of one welcome stamp", () => {
    expect(run.visitsPerReward(8, 1, 1)).toBe(8);
  });

  it("halves the visits when a visit is worth two stamps", () => {
    // Seven stamps still to earn at two a visit is four visits, not 3.5 — you
    // cannot make half a visit, and rounding down would promise a reward a
    // visit earlier than it arrives.
    expect(run.visitsPerReward(8, 1, 2)).toBe(5);
  });

  it("never claims a reward costs nothing", () => {
    // Welcome stamps at or above the target fill the card on sign-up. That is
    // still one visit — they were in the shop to scan the poster.
    expect(run.visitsPerReward(5, 5, 1)).toBe(1);
    expect(run.visitsPerReward(5, 9, 1)).toBe(1);
  });
});

describe("what a reward is worth", () => {
  it("counts an item and money off as a whole visit", () => {
    // Deliberate: the alternative is asking every shop what a customer usually
    // spends, and one more money box buys a number that is still a guess.
    expect(run.rewardShare("item", 0)).toBe(100);
    expect(run.rewardShare("amount", 0)).toBe(100);
  });
  it("uses the percentage the owner typed", () => {
    expect(run.rewardShare("percent", 20)).toBe(20);
  });
  it("cannot be talked above a whole visit or below nothing", () => {
    expect(run.rewardShare("percent", 500)).toBe(100);
    expect(run.rewardShare("percent", -20)).toBe(0);
  });
});

describe("the effective discount", () => {
  const at = (o: Record<string, unknown>) =>
    run.effectiveDiscount({ target: 8, welcome: 1, perVisit: 1, rewardType: "item", percent: 0, ...o });

  it("is one free visit in every eight on the default card", () => {
    expect(at({})).toBeCloseTo(12.5, 5);
  });

  it("falls as the card gets longer", () => {
    expect(at({ target: 10 })).toBeCloseTo(10, 5);
    expect(at({ target: 4 })).toBeCloseTo(25, 5);
  });

  it("is a fraction of a visit when the reward is a percentage", () => {
    // 20% off, once every eight visits.
    expect(at({ rewardType: "percent", percent: 20 })).toBeCloseTo(2.5, 5);
  });

  it("rises when welcome stamps do, because the card is shorter to fill", () => {
    expect(at({ welcome: 4 })).toBeGreaterThan(at({ welcome: 1 }));
  });
});

describe("the band a shop is told it is in", () => {
  it("names the three, at their edges", () => {
    // The edges are what matter: a shop tuning its card sits on them.
    expect(run.discountBand(9.99).label).toBe("Low discount");
    expect(run.discountBand(10).label).toBe("Good discount");
    expect(run.discountBand(14.99).label).toBe("Good discount");
    expect(run.discountBand(15).label).toBe("Generous discount");
  });

  /**
   * Semantic colours, which DESIGN.md keeps separate from the neon accent —
   * that separation is what lets this pill be coloured while Next stays the
   * only neon thing on the screen.
   */
  it("uses the semantic keys and never the accent", () => {
    expect(run.discountBand(5).key).toBe("bad");
    expect(run.discountBand(12).key).toBe("warn");
    expect(run.discountBand(20).key).toBe("good");
  });
});

describe("the suggested number of stamps", () => {
  /** Aimed at a reward every month to six weeks, whatever the shop's rhythm. */
  it("follows how often the shop says customers come back", () => {
    expect(run.suggestedTarget(7)).toBe(8);
    expect(run.suggestedTarget(14)).toBe(6);
    expect(run.suggestedTarget(28)).toBe(4);
  });

  it("suggests a fortnight's answer for a shop that has not said", () => {
    expect(run.suggestedTarget(0)).toBe(6);
    // And for the retired cycle a few shops are still on.
    expect(run.suggestedTarget(21)).toBe(6);
  });
});
