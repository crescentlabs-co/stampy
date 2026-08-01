/**
 * The triage rules decide what the operator looks at each morning, so the thing
 * that matters most is what they DON'T fire on. A rule that flags every merchant
 * trains you to ignore the list, which is worse than not having the rule.
 *
 * `now` is injected, so none of this depends on the wall clock.
 */
import { describe, expect, it } from "vitest";
import { triage, triageScore, trialDaysLeft, value } from "../src/health.js";
import type { MerchantHealthRow } from "../src/db.js";

const NOW = Date.UTC(2026, 7, 1, 12, 0, 0);
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000);

/** A merchant doing everything right: live, stamping, mid-trial, nothing broken. */
function healthy(over: Partial<MerchantHealthRow> = {}): MerchantHealthRow {
  return {
    id: "m1", name: "Kopi Corner", owners: "a@shop.my",
    contact_phone: "", contact_note: "",
    created_at: daysAgo(10), archived_at: null, trial_day: 10,
    cards: 1, card_ids: ["c1"], basket_cents: 450, currency: "RM", stamps_target: 10,
    first_stamp_at: daysAgo(9), first_redeem_at: daysAgo(2), poster_views: 3,
    last_stamp_at: daysAgo(0), last_owner_login: daysAgo(1), logins_30d: 6,
    stamps: 120, stamps_7d: 40, stamps_30d: 120, stamps_prev_7d: 38,
    customers: 30, active_7d: 18, redemptions: 6, unclaimed_rewards: 1,
    scanned: 60, clicked: 40, made: 35, landed: 30, removed: 2, dropped: 0,
    card_edits: 3, nudges: 2, has_art: true, staff_devices: 3,
    pin_failed_24h: 0, lookup_failed_7d: 0, messages_failed: 0,
    ...over,
  };
}

const keys = (m: MerchantHealthRow) => triage(m, NOW).map((f) => f.key);

describe("a healthy merchant is left alone", () => {
  it("raises nothing at all", () => {
    expect(triage(healthy(), NOW)).toEqual([]);
  });

  // Each of these sits just inside a threshold. If any of them starts flagging,
  // the rule has drifted into firing on normal merchants.
  it("does not flag ordinary wobbles", () => {
    expect(keys(healthy({ pin_failed_24h: 2 }))).toEqual([]); // a staff typo
    expect(keys(healthy({ unclaimed_rewards: 2 }))).toEqual([]); // two slow redeemers
    expect(keys(healthy({ lookup_failed_7d: 4 }))).toEqual([]); // occasional mistypes
    expect(keys(healthy({ stamps_7d: 20, stamps_prev_7d: 38 }))).toEqual([]); // a quiet week, not a cliff
    expect(keys(healthy({ scanned: 9, clicked: 0 }))).toEqual([]); // too little data to judge
    expect(keys(healthy({ made: 9, landed: 0 }))).toEqual([]); // ditto
  });

  // A merchant that signed up yesterday has not failed at anything yet.
  it("gives a brand-new merchant time before calling it dead", () => {
    expect(keys(healthy({
      trial_day: 1, stamps: 0, stamps_7d: 0, stamps_30d: 0, stamps_prev_7d: 0,
      poster_views: 0, last_stamp_at: null, first_stamp_at: null,
      customers: 0, redemptions: 0, unclaimed_rewards: 0,
      scanned: 0, clicked: 0, made: 0, landed: 0, removed: 0, staff_devices: 0,
    }))).toEqual([]);
  });

  // You cannot slow down from a standstill. Without the guard this reported a
  // never-activated merchant as "slowing", which is the wrong conversation.
  it("never calls a merchant with no stamps 'slowing down'", () => {
    expect(keys(healthy({ stamps: 0, stamps_7d: 0, stamps_prev_7d: 38, trial_day: 1 })))
      .not.toContain("slowing");
  });

  // Archived means closed, not broken. It must never appear in the work list.
  it("never triages an archived merchant", () => {
    expect(triage(healthy({ archived_at: daysAgo(1), stamps: 0, trial_day: 40 }), NOW)).toEqual([]);
  });
});

describe("the signals that mean intervene now", () => {
  // The highest-value unread signal in the log: this looks identical to apathy
  // from every other number, and it is a two-minute fix.
  it("catches a counter whose staff cannot sign in", () => {
    const f = triage(healthy({ pin_failed_24h: 5, last_stamp_at: daysAgo(3) }), NOW);
    expect(f[0]!.key).toBe("locked-out");
    expect(f[0]!.severity).toBe("critical");
  });

  // ...but not when they are plainly getting in fine.
  it("ignores failed PINs on a counter that is still stamping", () => {
    expect(keys(healthy({ pin_failed_24h: 5 }))).not.toContain("locked-out");
  });

  it("separates 'never set up' from 'set up but nobody stamping'", () => {
    const noPoster = triage(healthy({ trial_day: 6, stamps: 0, stamps_7d: 0, poster_views: 0 }), NOW);
    expect(noPoster[0]!.label).toBe("Never set up");
    expect(noPoster[0]!.action).toContain("counter");

    const posterSeen = triage(healthy({ trial_day: 6, stamps: 0, stamps_7d: 0, poster_views: 4 }), NOW);
    expect(posterSeen[0]!.label).toBe("No stamps yet");
    expect(posterSeen[0]!.action).toContain("staff");
  });

  it("catches a merchant that was working and stopped", () => {
    expect(keys(healthy({ stamps_7d: 0, last_stamp_at: daysAgo(12) }))).toContain("went-quiet");
  });

  // Quiet and slowing are the same story at different stages; raising both would
  // double-count one merchant in the work list.
  it("reports slowing OR quiet, never both", () => {
    const k = keys(healthy({ stamps_7d: 0, last_stamp_at: daysAgo(9), stamps_prev_7d: 38 }));
    expect(k).toContain("went-quiet");
    expect(k).not.toContain("slowing");
  });

  it("notices a whole programme running on one phone", () => {
    expect(keys(healthy({ staff_devices: 1 }))).toContain("one-phone");
    expect(keys(healthy({ staff_devices: 1, stamps: 5 }))).not.toContain("one-phone");
  });

  it("notices customers walking away from a card that landed", () => {
    expect(keys(healthy({ landed: 20, removed: 8, dropped: 2 }))).toContain("churning");
  });

  // Not an accounting line: these people did everything asked and got nothing.
  it("notices rewards nobody is handing over", () => {
    const f = triage(healthy({ unclaimed_rewards: 7 }), NOW);
    expect(f.find((x) => x.key === "rewards-owed")!.label).toBe("7 rewards owed");
  });

  it("splits a sign-up leak from a wallet-add failure", () => {
    expect(keys(healthy({ scanned: 100, clicked: 12 }))).toContain("signup-leak");
    expect(keys(healthy({ made: 40, landed: 6 }))).toContain("not-landing");
  });

  // The Apple/Google asymmetry is real and permanent, so the advice has to name it.
  it("warns that the not-landing figure is Apple-only", () => {
    const f = triage(healthy({ made: 40, landed: 6 }), NOW);
    expect(f.find((x) => x.key === "not-landing")!.action).toContain("Apple-only");
  });
});

describe("the trial clock", () => {
  it("counts down from signup", () => {
    expect(trialDaysLeft({ trial_day: 10 })).toBe(20);
    expect(trialDaysLeft({ trial_day: 34 })).toBe(-4);
  });

  // The advice has to differ: a busy merchant at day 25 is a sale, a dead one
  // is a decision about whether to spend any more time on them.
  it("says something different depending on whether they are actually using it", () => {
    const busy = triage(healthy({ trial_day: 25 }), NOW).find((f) => f.key === "trial-ending")!;
    expect(busy.action).toContain("make the ask");
    const dead = triage(healthy({ trial_day: 25, stamps_7d: 0, last_stamp_at: daysAgo(9) }), NOW)
      .find((f) => f.key === "trial-ending")!;
    expect(dead.action).not.toContain("make the ask");
  });

  it("keeps the clock as info, never above something broken", () => {
    const f = triage(healthy({ trial_day: 28, pin_failed_24h: 4, last_stamp_at: daysAgo(2) }), NOW);
    expect(f[0]!.key).toBe("locked-out");
    expect(f[f.length - 1]!.key).toBe("trial-ending");
  });
});

describe("the value figures a merchant could check themselves", () => {
  // 120 net staff stamps at a RM4.50 basket. Welcome stamps and post-reward
  // resets never reach the event log, so they are not in this number.
  it("multiplies real counter visits by the self-reported basket", () => {
    expect(value(healthy()).spendThroughCard).toBe(540);
  });

  it("prices a reward at the merchant's own target times their own basket", () => {
    expect(value(healthy()).spendPerReward).toBe(45);
  });

  it("says when there is no basket rather than showing a confident zero", () => {
    expect(value(healthy({ basket_cents: 0 })).hasBasket).toBe(false);
  });
});

describe("sorting the work list", () => {
  it("puts broken merchants above quiet ones and healthy ones last", () => {
    const broken = triageScore(triage(healthy({ pin_failed_24h: 4, last_stamp_at: daysAgo(2) }), NOW));
    const warned = triageScore(triage(healthy({ staff_devices: 1 }), NOW));
    const fine = triageScore(triage(healthy(), NOW));
    expect(broken).toBeLessThan(warned);
    expect(warned).toBeLessThan(fine);
  });
});
