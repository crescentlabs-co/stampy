/**
 * The triage rules decide what the operator looks at each morning, so the thing
 * that matters most is what they DON'T fire on. A rule that flags every merchant
 * trains you to ignore the list, which is worse than not having the rule.
 *
 * `now` is injected, so none of this depends on the wall clock.
 */
import { describe, expect, it } from "vitest";
import {
  CHURN_DAYS, FLAG_GUIDE, STAGE_LABEL, planAllows, stageOf, triage, triageScore,
  trialDaysLeft, trialEndsAt, trialExpired, value,
} from "../src/health.js";
import type { MerchantHealthRow } from "../src/db.js";

const NOW = Date.UTC(2026, 7, 1, 12, 0, 0);
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000);

/** A merchant doing everything right: live, stamping, mid-trial, nothing broken. */
function healthy(over: Partial<MerchantHealthRow> = {}): MerchantHealthRow {
  return {
    id: "m1", name: "Kopi Corner", owners: "a@shop.my",
    contact_phone: "", contact_note: "",
    created_at: daysAgo(10), signed_up_at: daysAgo(10), archived_at: null,
    has_owner: true, owner_id: "o1", claimed_at: daysAgo(10), claim_expires: null,
    claim_token: null, unclaimed_at: null, paid_at: null, plan: "free", trial_ends_at: null,
    trial_day: 9, days_since_signup: 10,
    cards: 1, card_ids: ["c1"], basket_cents: 450, currency: "RM", stamps_target: 10,
    first_stamp_at: daysAgo(9), first_redeem_at: daysAgo(2), first_customer_at: daysAgo(9),
    poster_views: 3,
    last_stamp_at: daysAgo(0), last_owner_login: daysAgo(1), logins_30d: 6,
    stamps: 120, stamps_7d: 40, stamps_30d: 120, stamps_prev_7d: 38,
    customers: 30, active_7d: 18, active_30d: 26, redemptions: 6, unclaimed_rewards: 1,
    scanned: 60, opened_poster: 45, opened_link: 10, opened_other: 5,
    clicked: 40, made: 35, landed: 30, removed: 2, dropped: 0,
    card_edits: 3, last_card_edit_at: daysAgo(4), nudges: 2, nudged: 2, nudge_returned: 1,
    has_art: true, staff_devices: 3,
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
      trial_day: 0, days_since_signup: 1, stamps: 0, stamps_7d: 0, stamps_30d: 0, stamps_prev_7d: 0,
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

  // The key is `went-quiet` and the label is "Churning". That is not a mix-up:
  // this is the SHOP going silent, and `churning` below is CUSTOMERS deleting
  // the card. The keys are what the console's help and these tests are keyed
  // on, so they stay put whatever the words say.
  it("catches a merchant that was working and stopped", () => {
    const f = triage(healthy({ stamps_7d: 0, last_stamp_at: daysAgo(12) }), NOW);
    expect(f.map((x) => x.key)).toContain("went-quiet");
    expect(f.find((x) => x.key === "went-quiet")!.label).toBe("Churning");
  });

  // Off the LAST STAMP, not off a 7-day bucket. A shop that stamped last
  // Saturday and nothing since used to read as healthy for the rest of the week.
  it("calls it churning after three silent days, not seven", () => {
    expect(CHURN_DAYS).toBe(3);
    expect(keys(healthy({ last_stamp_at: daysAgo(CHURN_DAYS) }))).toContain("went-quiet");
    expect(keys(healthy({ last_stamp_at: daysAgo(CHURN_DAYS - 1) }))).not.toContain("went-quiet");
  });

  // Churning and slowing are the same story at different stages; raising both
  // would double-count one merchant in the work list.
  it("reports slowing OR churning, never both", () => {
    const k = keys(healthy({ stamps_7d: 0, last_stamp_at: daysAgo(9), stamps_prev_7d: 38 }));
    expect(k).toContain("went-quiet");
    expect(k).not.toContain("slowing");
  });

  it("notices customers walking away from a card that landed", () => {
    expect(keys(healthy({ landed: 20, removed: 8, dropped: 2 }))).toContain("churning");
  });

  it("notices cards that never reach a wallet", () => {
    expect(keys(healthy({ made: 40, landed: 6 }))).toContain("not-landing");
  });

  // The Apple/Google asymmetry is real and permanent, so the advice has to name it.
  it("warns that the not-landing figure is Apple-only", () => {
    const f = triage(healthy({ made: 40, landed: 6 }), NOW);
    expect(f.find((x) => x.key === "not-landing")!.action).toContain("Apple-only");
  });

  /**
   * Eight rules were cut, and every one of them is still reported somewhere it
   * belongs — as a stage, on a shop's "wrong right now" line, in its funnel, or
   * in its header. What must not happen is them coming back to the work list:
   * fourteen flags meant the list was never empty, and a list that is never
   * empty is a list nobody reads.
   */
  it("no longer raises the eight that were only ever restating something else", () => {
    const gone = ["unclaimed", "never-activated", "one-phone", "codes-failing",
                  "signup-leak", "rewards-owed", "trial-ending", "trial-expired"];
    const loud = healthy({
      has_owner: false, claimed_at: null, first_stamp_at: null, last_stamp_at: null,
      stamps: 0, stamps_7d: 0, stamps_prev_7d: 0, days_since_signup: 40, trial_day: 44,
      poster_views: 0, staff_devices: 1, lookup_failed_7d: 22, scanned: 200, clicked: 4,
      unclaimed_rewards: 12,
    });
    for (const key of gone) expect(keys(loud), `${key} came back`).not.toContain(key);
  });
});

describe("the trial clock", () => {
  // It still counts — a shop's own header prints it — it just no longer files
  // itself as a problem. Two info flags on every shop in its final week is a
  // calendar, not a work list.
  it("counts down from signup", () => {
    expect(trialDaysLeft({ trial_day: 10 })).toBe(20);
    expect(trialDaysLeft({ trial_day: 34 })).toBe(-4);
  });

  it("raises nothing on its own", () => {
    expect(keys(healthy({ trial_day: 27 }))).toEqual([]);
    expect(keys(healthy({ trial_day: 44 }))).toEqual([]);
  });
});

/**
 * One word, one meaning. `paid` used to be a stage ranked above everything
 * else, so a paying shop that had not stamped in a month read as the healthiest
 * state on the board — the one shop whose silence matters most was the one the
 * console could not report.
 */
describe("what stage a shop is at", () => {
  it("names the four states of a live shop", () => {
    expect(stageOf(healthy({ has_owner: false }), NOW)).toBe("not-claimed");
    expect(stageOf(healthy({ first_stamp_at: null, last_stamp_at: null }), NOW)).toBe("activated");
    expect(stageOf(healthy(), NOW)).toBe("stamping");
    expect(stageOf(healthy({ last_stamp_at: daysAgo(9) }), NOW)).toBe("churning");
    expect(stageOf(healthy({ archived_at: daysAgo(1) }), NOW)).toBe("closed");
  });

  // The bug the old axis hid, now a test.
  it("still calls a paying shop churning when it has stopped stamping", () => {
    const paying = healthy({ paid_at: daysAgo(30), last_stamp_at: daysAgo(9) });
    expect(stageOf(paying, NOW)).toBe("churning");
    expect(paying.paid_at).not.toBeNull();
  });

  it("uses the same silence threshold as the Churning flag", () => {
    expect(stageOf(healthy({ last_stamp_at: daysAgo(CHURN_DAYS - 1) }), NOW)).toBe("stamping");
    expect(stageOf(healthy({ last_stamp_at: daysAgo(CHURN_DAYS) }), NOW)).toBe("churning");
  });

  it("has a human label for every stage it can return", () => {
    for (const s of ["not-claimed", "activated", "stamping", "churning", "closed"] as const) {
      expect(STAGE_LABEL[s].length).toBeGreaterThan(3);
    }
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

// The console's legend is generated from FLAG_GUIDE. A rule that can fire with
// no entry there is a chip on screen that nothing on the page explains.
describe("every flag is documented", () => {
  const documented = new Set(FLAG_GUIDE.map((g) => g.key));

  it("has a guide entry for every key the rules can raise", () => {
    // Deliberately extreme: one merchant tripping as many rules at once as the
    // mutually-exclusive branches allow.
    const raised = new Set<string>();
    const cases: Partial<MerchantHealthRow>[] = [
      { pin_failed_24h: 9, last_stamp_at: daysAgo(4) },
      { messages_failed: 3 },
      { stamps_7d: 0, last_stamp_at: daysAgo(11) },
      { stamps_7d: 3, stamps_prev_7d: 40 },
      { made: 90, landed: 3 },
      { landed: 30, removed: 20, dropped: 4 },
    ];
    for (const c of cases) for (const f of triage(healthy(c), NOW)) raised.add(f.key);
    for (const key of raised) expect(documented, `${key} is undocumented`).toContain(key);
    // And the guide has no entries for rules that no longer exist.
    expect(raised.size).toBe(documented.size);
  });

  it("gives every entry a rule and a reason, not just a name", () => {
    for (const g of FLAG_GUIDE) {
      expect(g.rule.length, `${g.key} has no rule`).toBeGreaterThan(10);
      expect(g.why.length, `${g.key} has no reason`).toBeGreaterThan(10);
    }
  });
});

describe("sorting the work list", () => {
  it("puts broken merchants above quiet ones and healthy ones last", () => {
    const broken = triageScore(triage(healthy({ pin_failed_24h: 4, last_stamp_at: daysAgo(2) }), NOW));
    const warned = triageScore(triage(healthy({ made: 40, landed: 6 }), NOW));
    const fine = triageScore(triage(healthy(), NOW));
    expect(broken).toBeLessThan(warned);
    expect(warned).toBeLessThan(fine);
  });
});

describe("what a plan unlocks", () => {
  // These four are the whole rule: pro always, free until the trial ends, and
  // a shop that never started a trial is not treated as having finished one.
  it("gives pro everything, trial or no trial", () => {
    const m = healthy({ plan: "pro", first_stamp_at: daysAgo(200), trial_day: 200 });
    expect(planAllows("pro", m, NOW).campaigns).toBe(true);
  });

  it("gives free everything while the trial is still running", () => {
    const m = healthy({ plan: "free", first_stamp_at: daysAgo(3), trial_day: 3 });
    expect(planAllows("free", m, NOW).campaigns).toBe(true);
  });

  it("switches campaigns off once a free trial has run out", () => {
    const m = healthy({ plan: "free", first_stamp_at: daysAgo(60), trial_day: 60 });
    expect(trialExpired(m, NOW)).toBe(true);
    expect(planAllows("free", m, NOW).campaigns).toBe(false);
  });

  it("does not expire a shop that has never been stamped at", () => {
    // Never started is not the same as finished. Expiring these would switch
    // features off for the shops that have not managed to get going at all.
    const m = healthy({ plan: "free", first_stamp_at: null, trial_day: 0 });
    expect(trialEndsAt(m, NOW)).toBeNull();
    expect(trialExpired(m, NOW)).toBe(false);
    expect(planAllows("free", m, NOW).campaigns).toBe(true);
  });

  it("lets one shop be given a longer trial than the rule", () => {
    // The entire reason trial_ends_at is stored rather than derived.
    const past = healthy({ plan: "free", first_stamp_at: daysAgo(60), trial_day: 60 });
    expect(planAllows("free", past, NOW).campaigns).toBe(false);
    const extended = healthy({
      plan: "free", first_stamp_at: daysAgo(60), trial_day: 60,
      trial_ends_at: new Date(NOW + 14 * 86_400_000),
    });
    expect(planAllows("free", extended, NOW).campaigns).toBe(true);
    expect(trialEndsAt(extended, NOW)!.getTime()).toBe(NOW + 14 * 86_400_000);
  });
});
