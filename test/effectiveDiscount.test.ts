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

// guideHtml escapes with the page's own esc(), which lives above the slice.
// A stand-in is enough here: what is under test is which words and which band
// come out, not how an ampersand is spelt.
const ESC = 'const esc = (v) => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;");\n';

const run = new Function(
  ESC + src.slice(0, src.lastIndexOf("/**")) +
  "\nreturn { visitsPerReward, rewardShare, effectiveDiscount, discountBand," +
  " guidance, guideHtml, suggestedTarget };",
)() as {
  visitsPerReward: (t: number, w: number, p: number) => number;
  rewardShare: (type: string, percent: number, value?: number, basket?: number) => number;
  effectiveDiscount: (r: Record<string, unknown>) => number;
  discountBand: (pct: number) => { key: string; label: string; advice: string };
  guidance: (r: Record<string, unknown>) => {
    pct: number | null;
    band: { key: string; label: string; advice: string } | null;
    headline: string;
    detail: string;
    advice: string | null;
  };
  guideHtml: (g: unknown, open: boolean) => string;
  suggestedTarget: (days: number) => number;
};

describe("visits per reward", () => {
  /**
   * Eight stamps, two welcome: sign up (1), six visits to fill the card, and
   * the one they walk in and claim on. Eight.
   *
   * THE SIGN-UP VISIT USED TO BE MISSING, which priced every card one visit
   * short and so overstated what the shop was giving away. Signing up is a
   * visit — they were in the shop to scan the poster — and it is ONE visit
   * whether the welcome hands over one stamp or two.
   */
  it("counts the sign-up, the earning visits and the claim", () => {
    expect(run.visitsPerReward(8, 2, 1)).toBe(8);
  });

  it("takes one more visit at the new default of one welcome stamp", () => {
    expect(run.visitsPerReward(8, 1, 1)).toBe(9);
  });

  /**
   * The rate is fixed at one now, but the argument is still honoured for cards
   * issued while two-a-visit was offered.
   */
  it("still divides by the rate a card was made with", () => {
    expect(run.visitsPerReward(8, 1, 2)).toBe(6);
  });

  it("never claims a reward costs nothing", () => {
    // Welcome stamps at or above the target fill the card on sign-up. That is
    // the sign-up visit and the claim: two, and never fewer.
    expect(run.visitsPerReward(5, 5, 1)).toBe(2);
    expect(run.visitsPerReward(5, 9, 1)).toBe(2);
  });
});

describe("what a reward is worth", () => {
  /**
   * Against the till, now that the rules form asks for it.
   *
   * A free coffee worth RM12 on a RM20 average order is 60% of a visit. It was
   * assumed to be a whole one, which made every item-reward card read as more
   * generous than it is.
   */
  it("measures an item and money off against the average order", () => {
    expect(run.rewardShare("item", 0, 12, 20)).toBeCloseTo(60, 5);
    expect(run.rewardShare("amount", 0, 5, 20)).toBeCloseTo(25, 5);
  });

  it("cannot make a reward worth more than the visit it comes off", () => {
    expect(run.rewardShare("item", 0, 40, 20)).toBe(100);
  });

  it("falls back to a whole visit when the shop has not said what it takes", () => {
    // A confident zero would be worse than the old assumption: it would tell a
    // shop its card costs nothing.
    expect(run.rewardShare("item", 0)).toBe(100);
    expect(run.rewardShare("amount", 0)).toBe(100);
    expect(run.rewardShare("item", 0, 12, 0)).toBe(100);
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

  it("is one free visit in every nine on the default card", () => {
    // Nine visits, not eight: the sign-up is one of them.
    expect(at({})).toBeCloseTo(100 / 9, 5);
  });

  it("falls as the card gets longer", () => {
    expect(at({ target: 10 })).toBeCloseTo(100 / 11, 5);
    expect(at({ target: 4 })).toBeCloseTo(20, 5);
  });

  it("is a fraction of a visit when the reward is a percentage", () => {
    // 20% off, once every nine visits.
    expect(at({ rewardType: "percent", percent: 20 })).toBeCloseTo(20 / 9, 5);
  });

  /** The average order value changes it, which is the point of asking for it. */
  it("falls when the reward is small against the average order", () => {
    const rich = at({ value: 12, basket: 20 });   // 60% of a visit, every 9
    const poor = at({ value: 12, basket: 12 });   // a whole visit, every 9
    expect(rich).toBeCloseTo(60 / 9, 5);
    expect(poor).toBeCloseTo(100 / 9, 5);
    expect(rich).toBeLessThan(poor);
  });

  it("rises when welcome stamps do, because the card is shorter to fill", () => {
    expect(at({ welcome: 4 })).toBeGreaterThan(at({ welcome: 1 }));
  });
});

describe("the band a shop is told it is in", () => {
  it("names the four, at their edges", () => {
    // The edges are what matter: a shop tuning its card sits on them.
    expect(run.discountBand(3.99).label).toBe("Low reward");
    expect(run.discountBand(4).label).toBe("Good reward");
    expect(run.discountBand(9.99).label).toBe("Good reward");
    expect(run.discountBand(10).label).toBe("Generous reward");
    expect(run.discountBand(14.99).label).toBe("Generous reward");
    expect(run.discountBand(15).label).toBe("Very generous reward");
  });

  /**
   * Semantic colours, which DESIGN.md keeps separate from the neon accent —
   * that separation is what lets this pill be coloured while Next stays the
   * only neon thing on the screen.
   */
  it("uses the semantic keys and never the accent", () => {
    for (const pct of [0, 4, 10, 15, 40]) {
      expect(["good", "warn", "bad"]).toContain(run.discountBand(pct).key);
    }
  });

  /**
   * BOTH ENDS ARE A WARNING, and that is the whole point of the rework.
   *
   * This used to run one way — the more a shop gave away the greener it went,
   * topping out in green above 15%. That reading is right for the customer and
   * backwards for the person paying for it. Red now means too much, amber means
   * too little, and green is only ever the middle.
   */
  it("warns at both ends and is green only in the middle", () => {
    expect(run.discountBand(1).key).toBe("warn");
    expect(run.discountBand(6).key).toBe("good");
    expect(run.discountBand(12).key).toBe("good");
    expect(run.discountBand(25).key).toBe("bad");
  });

  /** Every band carries its own advice, or the box has a heading and no text. */
  it("always has something to advise", () => {
    for (const pct of [0, 2, 5, 12, 18, 90]) {
      expect(run.discountBand(pct).advice.length).toBeGreaterThan(20);
    }
  });
});

describe("the guidance box", () => {
  const stamps = { target: 8, welcome: 1, perVisit: 1, rewardType: "item" };

  it("leads with the figure and says it again in visits", () => {
    const g = run.guidance(stamps);
    expect(g.headline).toContain("11.1%");
    expect(g.detail).toContain("9 times");
  });

  /**
   * The caveat the old info bubble carried, and the one way this figure
   * flatters the shop: it describes a FIRST card, and welcome stamps are handed
   * over once, so every card after it takes a little longer.
   */
  it("keeps the first-card caveat, and drops it when there are no welcome stamps", () => {
    expect(run.guidance(stamps).detail).toContain("first card");
    expect(run.guidance({ ...stamps, welcome: 0 }).detail).not.toContain("first card");
  });

  it("carries the band's own advice into the open half", () => {
    const g = run.guidance(stamps);
    expect(g.band!.label).toBe("Generous reward");
    expect(g.band!.advice).toBe(run.discountBand(12.5).advice);
  });

  /**
   * A shop we cannot price gets the box with no number and no verdict.
   * Inventing a figure would be worse than saying we do not have one — this is
   * the shape a manual points card and a percentage-off spend card both take.
   */
  it("shows no percentage and no band when there is no rate to divide by", () => {
    const g = run.guidance({
      blockedHeadline: "Your staff decide each amount.",
      blockedReason: "There is no rate for us to work from.",
      blockedAdvice: "Keep an eye on what you are handing out.",
    });
    expect(g.pct).toBe(null);
    expect(g.band).toBe(null);
    expect(g.headline).toBe("Your staff decide each amount.");
  });
});

describe("the guidance box, as markup", () => {
  const stamps = { target: 8, welcome: 1, perVisit: 1, rewardType: "item" };

  it("tints itself with the band and carries the pill", () => {
    const html = run.guideHtml(run.guidance(stamps), false);
    expect(html).toContain("guide-good");
    expect(html).toContain("pill pill-good");
    expect(html).toContain("Generous reward");
  });

  /** The heading is the product's name, spelt the way the product spells it. */
  it("heads the advice with PunchMe guidance", () => {
    expect(run.guideHtml(run.guidance(stamps), false)).toContain("PunchMe guidance");
  });

  it("stays open across a repaint when it was open", () => {
    expect(run.guideHtml(run.guidance(stamps), true)).toContain("<details");
    expect(run.guideHtml(run.guidance(stamps), true)).toContain(" open>");
    expect(run.guideHtml(run.guidance(stamps), false)).not.toContain(" open>");
  });

  /** No verdict means no pill at all, not a grey one. */
  it("renders no pill when there is nothing to rank", () => {
    const html = run.guideHtml(run.guidance({
      blockedHeadline: "Your staff decide each amount.",
      blockedReason: "There is no rate for us to work from.",
      blockedAdvice: "Keep an eye on what you are handing out.",
    }), false);
    expect(html).toContain("guide-none");
    expect(html).not.toContain("pill pill-");
    expect(html).toContain("Keep an eye on what you are handing out.");
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
