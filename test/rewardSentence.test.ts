/**
 * The one line a customer reads, and where it comes from.
 *
 * `cards.reward` is still a plain sentence, and it is still the only thing the
 * Apple card, the Google card, the staff phone, the poster and the pass
 * snapshot ever read. That is deliberate and it is what keeps reward types
 * cheap: none of those has to learn that a reward can be a percentage. Only
 * this function knows, and it runs once, on save.
 *
 * So these tests are really about a boundary — if the sentence is right, every
 * surface downstream is right for free.
 */
import { describe, expect, it } from "vitest";
import { rewardSentence } from "../src/cardView.js";
import { moneyLabel, asRewardType } from "../src/db.js";

describe("rewardSentence", () => {
  it("keeps the owner's own words for an item", () => {
    // Better than anything generated, and it is what every card written before
    // reward types already holds — so nothing existing changes wording.
    expect(rewardSentence("item", "Free coffee", 1200, 0, 0)).toBe("Free coffee");
  });

  it("writes money off as money", () => {
    expect(rewardSentence("amount", "ignored", 500, 0, 0)).toBe("RM5 off");
    expect(rewardSentence("amount", "", 750, 0, 0)).toBe("RM7.50 off");
  });

  it("writes a percentage with its ceiling", () => {
    expect(rewardSentence("percent", "", 0, 20, 1000)).toBe("20% off up to RM10");
  });

  it("leaves the ceiling out when there isn't one", () => {
    // A flat 20% off with no cap must not print "up to RM0", which reads as a
    // reward worth nothing.
    expect(rewardSentence("percent", "", 0, 20, 0)).toBe("20% off");
  });

  it("trims an item name to what a card can show", () => {
    expect(rewardSentence("item", "  Free coffee  ", 0, 0, 0)).toBe("Free coffee");
    expect(rewardSentence("item", "x".repeat(90), 0, 0, 0)).toHaveLength(60);
  });
});

describe("moneyLabel", () => {
  it("drops the pennies when there are none", () => {
    // "RM5.00 off" is two characters of noise on the line with least room.
    expect(moneyLabel(500)).toBe("RM5");
    expect(moneyLabel(0)).toBe("RM0");
  });
  it("keeps them when there are", () => {
    expect(moneyLabel(550)).toBe("RM5.50");
    expect(moneyLabel(505)).toBe("RM5.05");
  });
  it("never renders a negative", () => {
    expect(moneyLabel(-500)).toBe("RM0");
  });
});

describe("asRewardType", () => {
  it("accepts the three, and falls back to an item", () => {
    // An item is what every reward was before this existed, so an unrecognised
    // value degrades to the owner's own words rather than to a broken sentence.
    expect(asRewardType("amount")).toBe("amount");
    expect(asRewardType("percent")).toBe("percent");
    expect(asRewardType("item")).toBe("item");
    expect(asRewardType("nonsense")).toBe("item");
    expect(asRewardType(undefined)).toBe("item");
  });
});
