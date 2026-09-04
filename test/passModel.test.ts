import { describe, expect, it } from "vitest";
import type { CardRow, PassRow } from "../src/db.js";

// Set BASE_URL BEFORE importing the module under test (config reads env at
// import). The policy links on the back of the card are absolute URLs built
// from it — a relative path in a pass back field is not tappable.
process.env.BASE_URL = "https://stampy.example.test";
// The demo card is picked out by id, so it needs one no other fixture uses.
process.env.DEMO_CARD_ID = "demo-card";

const {
  affordableRewards, benefitLines, benefitsText, buildPassJson, cardTerms, catalogueSummary,
  cheapestReward, getHeaderFieldValue, isFinalReward, isRewardReady, memberSince,
  legalText, membershipTerms, messageFieldValue, milestoneSummary, nextMilestone, passBarcode,
  pointsTerms, progressText, rewardFor, rewardTerms, stampDots, stampGrid, stripKey,
  targetFor, visibleMessage,
} = await import("../src/passModel.js");

function card(overrides: Partial<CardRow> = {}): CardRow {
  return {
    id: "default",
    merchant_id: null,
    name: "Kopi Corner",
    kind: "stamp",
    benefits: "",
    milestones: [],
    reward_type: "item",
    reward_value_cents: 0,
    reward_percent: 0,
    reward_cap_cents: 0,
    stamps_per_visit: 1,
    point_presets: "",
    member_label: "Member",
    earn_mode: "visit",
    earn_spend_cents: 0,
    earn_points: 0,
    reward: "Free coffee",
    stamps_target: 10,
    stamps_start: 2,
    background_color: "rgb(59, 32, 22)",
    foreground_color: "rgb(255, 250, 240)",
    label_color: "rgb(214, 178, 120)",
    accent_color: "rgb(214, 178, 120)",
    band_color: "rgb(90, 52, 38)",
    band_texture: "gradient",
    staff_pin: "",
    staff_pin_hash: "",
    staff_session_epoch: 1,
    created_at: new Date(),
    average_spend_cents: 0,
    currency: "RM",
    auto_winback_enabled: false,
    auto_winback_days: 14,
    auto_winback_message: "We miss you!",
    stamp_style: "",
    logo_tint: "",
    logo_has_name: false,
    signup_message: "",
    archived_at: null,
    published_at: new Date(),
    ended_at: null,
    ...overrides,
  };
}

function row(overrides: Partial<PassRow> = {}): PassRow {
  return {
    serial: "11111111-2222-3333-4444-555555555555",
    card_id: "default",
    customer_id: null,
    platform: "apple",
    short_code: "ABC234",
    auth_token: "a".repeat(32),
    stamp_count: 3,
    stamps_target: 10,
    kind: "stamp",
    milestones: [],
    rewards_claimed: 0,
    stamps_per_visit: 1,
    reward: "Free coffee",
    message: "",
    message_sent_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    is_test: false,
    ...overrides,
  };
}

describe("stampDots", () => {
  // Two rows, spaced — the same 2×N grid stampGrid has always described for the
  // Apple strip image. On Android these are TEXT in a field whose size and
  // alignment Google owns, so the shape of the string is the only lever there
  // is, and one unbroken run of ten was something you counted rather than read.
  it("renders filled and empty slots as a spaced two-row grid", () => {
    expect(stampDots(3, 10)).toBe("⬤ ⬤ ⬤ ◯ ◯\n◯ ◯ ◯ ◯ ◯");
  });
  it("clamps below zero and above target", () => {
    expect(stampDots(-2, 5)).toBe("◯ ◯ ◯\n◯ ◯");
    expect(stampDots(9, 5)).toBe("⬤ ⬤ ⬤\n⬤ ⬤");
  });
  // An odd target leaves the SHORT row underneath, matching the way the strip
  // image centres its last row rather than its first.
  it("puts the longer row on top when the target is odd", () => {
    expect(stampDots(0, 7)).toBe("◯ ◯ ◯ ◯\n◯ ◯ ◯");
  });
  /**
   * Below five, two rows of one or two circles is a stack, not a grid — the
   * break costs more than it gives. A target of 1 must also not produce a
   * trailing empty line, which is what a naive halving does.
   */
  it("stays on one line for a small card", () => {
    expect(stampDots(1, 4)).toBe("⬤ ◯ ◯ ◯");
    expect(stampDots(1, 1)).toBe("⬤");
    expect(stampDots(0, 0)).toBe("");
    for (const t of [0, 1, 2, 3, 4]) expect(stampDots(1, t)).not.toContain("\n");
  });
  /**
   * Large circles, and monochrome ones. On Android these are TEXT in a field
   * whose size and alignment Google owns, so the characters are the only lever
   * there is. The emoji circles are bigger still and are the trap: the emoji
   * font paints them black-and-white whatever the card colour is, so ⚫ on a
   * dark brand card is a row of holes.
   */
  it("uses no emoji, which would ignore the card's colour", () => {
    expect(stampDots(2, 4)).not.toMatch(/[⚫⚪]/);
  });
});

describe("isRewardReady", () => {
  it("is ready only at/after target", () => {
    expect(isRewardReady({ stamp_count: 9, stamps_target: 10, kind: "stamp" })).toBe(false);
    expect(isRewardReady({ stamp_count: 10, stamps_target: 10, kind: "stamp" })).toBe(true);
  });
});

describe("getHeaderFieldValue", () => {
  it("counts up until halfway, then counts down", () => {
    expect(getHeaderFieldValue(0, 10)).toBe("0 earned");
    expect(getHeaderFieldValue(4, 10)).toBe("4 earned");
    // The crossover: at 5/10 the remaining count is no larger than the earned
    // count, so "5 left" takes over.
    expect(getHeaderFieldValue(5, 10)).toBe("5 left");
    expect(getHeaderFieldValue(9, 10)).toBe("1 left");
  });

  it("crosses over correctly on an odd target", () => {
    expect(getHeaderFieldValue(3, 7)).toBe("3 earned"); // 4 remaining > 3 earned
    expect(getHeaderFieldValue(4, 7)).toBe("3 left"); // 3 remaining <= 4 earned
  });

  it("announces the reward at target, and clamps past it", () => {
    expect(getHeaderFieldValue(10, 10)).toBe("Reward ready");
    expect(getHeaderFieldValue(12, 10)).toBe("Reward ready");
    expect(getHeaderFieldValue(-3, 10)).toBe("0 earned");
  });

  // This is what makes the lock-screen banner fire on every stamp: iOS only
  // shows one when the field's value actually changed. Two counts sharing a
  // string would silently swallow a notification.
  it("gives every count from 0..target a distinct string", () => {
    for (const total of [1, 2, 5, 6, 7, 8, 10, 15, 20]) {
      const seen = new Set<string>();
      for (let n = 0; n <= total; n++) seen.add(getHeaderFieldValue(n, total));
      expect(seen.size, `target ${total} produced a duplicate header value`).toBe(total + 1);
    }
  });
});

describe("stampGrid", () => {
  it("is always two rows, splitting the total across them", () => {
    expect(stampGrid(6)).toEqual({ rows: 2, cols: 3 });
    expect(stampGrid(8)).toEqual({ rows: 2, cols: 4 });
    expect(stampGrid(10)).toEqual({ rows: 2, cols: 5 });
  });
  it("rounds an odd total up, leaving the last row one short", () => {
    expect(stampGrid(7)).toEqual({ rows: 2, cols: 4 });
    expect(stampGrid(9)).toEqual({ rows: 2, cols: 5 });
  });
  it("never returns zero columns", () => {
    expect(stampGrid(1)).toEqual({ rows: 2, cols: 1 });
  });
});

describe("progressText", () => {
  it("is the plain tally", () => {
    expect(progressText(3, 10)).toBe("3/10");
  });
});

describe("buildPassJson", () => {
  it("includes the PassKit essentials", () => {
    const p = buildPassJson(row(), card()) as any;
    expect(p.formatVersion).toBe(1);
    expect(p.serialNumber).toBe(row().serial);
    expect(p.authenticationToken.length).toBeGreaterThanOrEqual(16);
    expect(p.barcodes[0].message).toBe(row().serial);
    expect(p.storeCard.headerFields[0].value).toBe("3 earned");
  });

  /*
   * The demo card is handed out at pitches and passed around afterwards, so its
   * QR opens the landing page rather than carrying a serial nobody but a staff
   * scanner can use. Every other card is untouched — that is the half worth
   * testing, because getting it wrong would break stamping for real shops.
   */
  it("puts a link in the demo card's barcode, and a serial in everyone else's", () => {
    const demo = buildPassJson(row(), card({ id: "demo-card" })) as any;
    expect(demo.barcodes[0].message).toBe("https://stampy.example.test/?s=card");
    expect(demo.barcodes[0].altText).toBe("Scan for more info");

    const shop = buildPassJson(row(), card({ id: "some-real-shop" })) as any;
    expect(shop.barcodes[0].message).toBe(row().serial);
    expect(shop.barcodes[0].altText).toBe("Code ABC234");
  });

  // The serial still identifies the pass everywhere ELSE on it. Only what the
  // camera reads changed — a demo pass is still a real pass, and the web
  // service, the push registration and the staff typed-code path all key on
  // these, not on the barcode.
  it("still carries the demo card's serial and short code on the pass itself", () => {
    const demo = buildPassJson(row(), card({ id: "demo-card" })) as any;
    expect(demo.serialNumber).toBe(row().serial);
    const back = demo.storeCard.backFields.find((f: any) => f.key === "code");
    expect(back.value).toContain("ABC234");
  });

  // The line under the barcode must never name a code that is not in it. That
  // is the whole reason altText moved: "Code ABC234" under a URL sends staff
  // hunting for a card that does not exist.
  it("never prints a code or an address under the demo card's QR", () => {
    const alt = passBarcode(row(), { id: "demo-card" }).altText;
    expect(alt).not.toContain("Code");
    expect(alt).not.toContain("ABC234");
    expect(alt).not.toContain("//");
    expect(alt).not.toContain(row().serial);
  });

  // The stamp grid lives in the strip IMAGE, so nothing may be laid over it and
  // the header must read as a bare status line with no label beside it.
  it("keeps the strip clear: no primary or auxiliary content, unlabelled header", () => {
    const p = buildPassJson(row(), card()) as any;
    expect(p.storeCard.primaryFields).toEqual([]);
    expect(p.storeCard.auxiliaryFields).toEqual([]);
    expect(p.storeCard.headerFields).toHaveLength(1);
    expect(p.storeCard.headerFields[0].label).toBeUndefined();
  });

  it("carries the reward and the tally as the two secondary fields", () => {
    const p = buildPassJson(row(), card()) as any;
    expect(p.storeCard.secondaryFields).toHaveLength(2);
    const [reward, tally] = p.storeCard.secondaryFields;
    expect(reward.label).toBe("Reward");
    expect(reward.value).toBe("Free coffee");
    expect(tally.label).toBe("Progress");
    expect(tally.value).toBe("3/10");
  });

  it("brands the pass from the café row", () => {
    const p = buildPassJson(row(), card({ name: "Teh Tarik Place", background_color: "rgb(1, 2, 3)" })) as any;
    expect(p.organizationName).toBe("Teh Tarik Place");
    expect(p.logoText).toBe("Teh Tarik Place");
    expect(p.backgroundColor).toBe("rgb(1, 2, 3)");
  });

  // Apple draws logoText BESIDE the logo image, so a shop whose logo is a brand
  // lockup — mark and wordmark together, which is the file most shops actually
  // have — got its name printed twice on the front of the card.
  describe("a logo that already carries the shop's name", () => {
    it("drops the text beside the logo when the owner says it is in there", () => {
      const p = buildPassJson(row(), card({ logo_has_name: true }), "Teh Tarik Place") as any;
      expect("logoText" in p).toBe(false);
    });

    // Omitted, not blanked: Wallet keeps the slot for an empty string and leaves
    // a gap where the text was.
    it("omits the key rather than sending an empty string", () => {
      const p = buildPassJson(row(), card({ logo_has_name: true })) as any;
      expect(p.logoText).toBeUndefined();
      expect(JSON.stringify(p)).not.toContain("logoText");
    });

    // The Add sheet and every notification read from these two. A card whose
    // notifications say nothing about who sent them is the worse trade.
    it("still names the shop where the name is the only identifier", () => {
      const p = buildPassJson(row(), card({ logo_has_name: true }), "Teh Tarik Place") as any;
      expect(p.organizationName).toBe("Teh Tarik Place");
      expect(p.description).toBe("Teh Tarik Place loyalty card");
    });

    it("leaves every existing card alone — the flag defaults off", () => {
      const p = buildPassJson(row(), card(), "Teh Tarik Place") as any;
      expect(p.logoText).toBe("Teh Tarik Place");
    });
  });

  it("surfaces the short code for the staff typed fallback", () => {
    const p = buildPassJson(row(), card()) as any;
    expect(p.barcodes[0].altText).toBe("Code ABC234");
    const codeField = p.storeCard.backFields.find((f: any) => f.key === "code");
    expect(codeField.value).toBe("ABC234");
    expect(codeField.changeMessage).toBeUndefined(); // must not add a third banner
  });

  it("puts changeMessage on exactly two fields (one banner per event)", () => {
    const p = buildPassJson(row(), card()) as any;
    const all = [
      ...p.storeCard.headerFields,
      ...p.storeCard.primaryFields,
      ...p.storeCard.secondaryFields,
      ...p.storeCard.auxiliaryFields,
      ...p.storeCard.backFields,
    ];
    const withChange = all.filter((f: any) => f.changeMessage);
    expect(withChange.map((f: any) => f.key).sort()).toEqual(["message", "progress"]);
    // %@ is required for iOS to substitute the new value into the banner.
    for (const f of withChange) expect(f.changeMessage).toContain("%@");
  });

  /**
   * iOS only banners a changeMessage field whose VALUE differs from the pass
   * already on the phone. The send box is pre-filled with the shop's stored
   * message, so most sends are the SAME wording — and identical wording used
   * to mean an identical value, so the second send updated the card silently:
   * no banner, no error, and an owner concluding notifications were broken.
   * The sent time folded into the value is what makes every send a new one.
   */
  it("re-sending the same wording still produces a different message value", () => {
    const at = (t: string) =>
      buildPassJson(row({ message: "We miss you!", message_sent_at: new Date(t) }), card()) as any;
    const value = (p: any) =>
      p.storeCard.backFields.find((f: any) => f.key === "message").value;
    const first = value(at("2026-08-25T02:00:00Z"));
    const second = value(at("2026-08-25T05:30:00Z"));
    expect(first).not.toBe(second);
    // ...and the difference is INVISIBLE. changeMessage is "%@", so the whole
    // value is the banner text: whatever separates two sends is read out to the
    // customer, which is why it cannot be a date line or a counter.
    expect(visibleMessage(first)).toBe("We miss you!");
    expect(visibleMessage(second)).toBe("We miss you!");
  });

  /** One second apart is still two sends, so the marker has to be that fine. */
  it("distinguishes two sends a second apart", () => {
    const value = (t: string) =>
      messageFieldValue({ message: "Hi", message_sent_at: new Date(t) });
    expect(value("2026-08-25T02:00:00Z")).not.toBe(value("2026-08-25T02:00:01Z"));
  });

  /** Rows from before the column existed still render — just without the line. */
  it("a message with no sent time is shown bare, and no message means the welcome", () => {
    const value = (r: any) =>
      (buildPassJson(row(r), card()) as any).storeCard.backFields
        .find((f: any) => f.key === "message").value;
    expect(value({ message: "Hello", message_sent_at: null })).toBe("Hello");
    expect(value({ message: "", message_sent_at: null })).toContain("Welcome to");
  });

  it("prints the reward terms and the policy links on the back", () => {
    const p = buildPassJson(row(), card()) as any;
    const back = Object.fromEntries(p.storeCard.backFields.map((f: any) => [f.key, f]));

    // Expiry is a reserved right, not an automated behaviour — nothing in the
    // code expires a stamp, so the card must not claim that it does.
    expect(back.terms.value).toContain("may expire");
    expect(back.terms.value).toContain("One stamp per visit");
    expect(back.terms.value).toContain("Kopi Corner"); // the shop honours it, not PunchMe

    expect(back.legal.value).toContain("https://stampy.example.test/terms");
    expect(back.legal.value).toContain("https://stampy.example.test/privacy");
    // The opt-out is a LINK now, per pass, and it carries this card's serial so
    // it resolves to the person rather than to one of their cards. Deleting the
    // card is no longer the only way to stop being messaged, and the privacy
    // notice stopped saying it was in the same change.
    expect(back.legal.value).toContain("https://stampy.example.test/stop/" + row().serial);
    expect(back.legal.value).not.toContain("delete this card from your wallet");
  });

  it("omits the stop link rather than printing a broken one", () => {
    // legalText() is exported and called with no serial in a couple of places;
    // a bare /stop/ would be a dead link on the back of a real card.
    expect(legalText()).not.toContain("/stop/");
    expect(legalText()).toContain("/privacy");
  });

  it("adds no lock-screen banner for the terms fields", () => {
    const p = buildPassJson(row(), card()) as any;
    const back = Object.fromEntries(p.storeCard.backFields.map((f: any) => [f.key, f]));
    // Static text that never changes must never carry changeMessage: iOS would
    // fire a banner for it, breaking one-notification-per-event.
    expect(back.terms.changeMessage).toBeUndefined();
    expect(back.legal.changeMessage).toBeUndefined();
  });

  it("switches to reward-ready copy when full", () => {
    const p = buildPassJson(row({ stamp_count: 10 }), card()) as any;
    expect(p.storeCard.headerFields[0].value).toBe("Reward ready");
    expect(p.storeCard.headerFields[0].changeMessage).toContain("waiting");
    expect(p.storeCard.secondaryFields[0].value).toContain("show this to staff");
  });

  // iOS substitutes %@ with the field's NEW value, so the banner has to read
  // correctly for every shape getHeaderFieldValue can return.
  it("reads correctly once %@ is substituted, at every stage", () => {
    for (const [count, expected] of [
      [3, "3 earned — free coffee at 10"],
      [7, "3 left — free coffee at 10"],
    ] as const) {
      const p = buildPassJson(row({ stamp_count: count }), card()) as any;
      const h = p.storeCard.headerFields[0];
      expect(h.changeMessage.replace("%@", h.value)).toBe(expected);
    }
    const full = buildPassJson(row({ stamp_count: 10 }), card()) as any;
    const fh = full.storeCard.headerFields[0];
    expect(fh.changeMessage.replace("%@", fh.value)).toBe("Reward ready — your free coffee is waiting 🎉");
  });

  // `cards.name` is an internal label with no field in the dashboard, so it can
  // be years stale. Apple shows `description` on the Add sheet and again in the
  // pass's info panel, where a shop that had renamed was still introducing
  // itself to its own customers as whatever the card was called on day one.
  it("names the pass after the shop, never after the card row", () => {
    const p = buildPassJson(row(), card({ name: "Pastry card" }), "Kopi Corner") as any;
    expect(p.organizationName).toBe("Kopi Corner");
    expect(p.logoText).toBe("Kopi Corner");
    expect(p.description).toBe("Kopi Corner loyalty card");
    expect(p.description).not.toContain("Pastry card");
  });

  it("falls back to the card's name when there is no business yet", () => {
    const p = buildPassJson(row(), card({ name: "Kopi Corner" })) as any;
    expect(p.organizationName).toBe("Kopi Corner");
  });
});

// ---------------------------------------------------------------------------
// Membership cards. The counter is hidden, but every rule about NOT breaking a
// promise already in somebody's wallet still applies, so these lock the shape
// of the card rather than only its wording.
// ---------------------------------------------------------------------------
describe("membership cards", () => {
  const memberCard = (o = {}) => card({ kind: "membership", benefits: "10% off\nFree birthday drink", ...o });
  const memberRow = (o = {}) => row({ kind: "membership", ...o });

  it("is never reward-ready, however many visits are banked", () => {
    // A membership counter has no ceiling — it is a lifetime visit tally. Left
    // to the stamp rule, every long-standing member would light up the staff
    // phone's redeem button forever.
    expect(isRewardReady({ stamp_count: 0, stamps_target: 10, kind: "membership" })).toBe(false);
    expect(isRewardReady({ stamp_count: 10, stamps_target: 10, kind: "membership" })).toBe(false);
    expect(isRewardReady({ stamp_count: 999, stamps_target: 10, kind: "membership" })).toBe(false);
  });

  it("says Member instead of counting towards a target", () => {
    expect(getHeaderFieldValue(0, 10, "membership")).toBe("Member");
    expect(getHeaderFieldValue(7, 10, "membership")).toBe("Member");
    // The stamp card is untouched by the new argument.
    expect(getHeaderFieldValue(7, 10)).toBe("3 left");
  });

  // The value never changes, which is why this card never fires a lock-screen
  // banner of its own. That is correct — there is no event to announce — but
  // the pass must still carry exactly the documented changeMessage pair, or the
  // invariant that governs notifications stops being checkable.
  it("still carries exactly two changeMessage fields", () => {
    const p = buildPassJson(memberRow(), memberCard()) as any;
    const all = [
      ...p.storeCard.headerFields, ...p.storeCard.primaryFields,
      ...p.storeCard.secondaryFields, ...p.storeCard.auxiliaryFields,
      ...p.storeCard.backFields,
    ];
    const withMsg = all.filter((f: any) => f.changeMessage);
    expect(withMsg.map((f: any) => f.key).sort()).toEqual(["message", "progress"]);
  });

  it("shows who the holder is, not how far along they are", () => {
    const p = buildPassJson(memberRow({ short_code: "ZZ9K2Q" }), memberCard()) as any;
    expect(p.storeCard.headerFields[0].value).toBe("Member");
    const secondary = p.storeCard.secondaryFields;
    // The same two KEYS as a stamp card on purpose: Apple diffs field by field,
    // so a card that changes kind updates in place rather than leaving two
    // dead slots behind on every phone that already has it.
    expect(secondary.map((f: any) => f.key)).toEqual(["reward", "tally"]);
    expect(secondary[0]).toMatchObject({ label: "Member no.", value: "ZZ9K2Q" });
    expect(secondary[1].label).toBe("Member since");
  });

  it("prints the perks on the back, and no empty field when there are none", () => {
    const withPerks = buildPassJson(memberRow(), memberCard()) as any;
    const perks = withPerks.storeCard.backFields.find((f: any) => f.key === "benefits");
    expect(perks.value).toBe("• 10% off\n• Free birthday drink");

    // A labelled blank on the back of a card reads as something we failed to
    // fill in, so the field is absent rather than empty.
    const none = buildPassJson(memberRow(), memberCard({ benefits: "" })) as any;
    expect(none.storeCard.backFields.find((f: any) => f.key === "benefits")).toBeUndefined();
  });

  it("carries membership terms, never the stamp ones", () => {
    const p = buildPassJson(memberRow(), memberCard()) as any;
    const terms = p.storeCard.backFields.find((f: any) => f.key === "terms");
    expect(terms.label).toBe("Membership terms");
    expect(terms.value).toBe(membershipTerms("Kopi Corner"));
    // "One stamp per visit" on a card with no stamps is a term about nothing.
    expect(terms.value).not.toContain("stamp");
    expect(cardTerms("Kopi Corner", "stamp")).toBe(rewardTerms("Kopi Corner"));
  });

  it("keeps the barcode and the typed code working", () => {
    // Invariant 4: one scanner, both platforms, whatever the card kind.
    const r = memberRow();
    expect(passBarcode(r, memberCard()).message).toBe(r.serial);
    expect(passBarcode(r, memberCard()).altText).toBe("Code " + r.short_code);
  });
});

describe("benefitLines / benefitsText", () => {
  it("drops blank lines and surrounding space", () => {
    expect(benefitLines("  10% off \n\n  Free drink\n")).toEqual(["10% off", "Free drink"]);
  });
  it("is empty when nothing was typed", () => {
    expect(benefitsText("")).toBe("");
    expect(benefitsText("\n  \n")).toBe("");
  });
});

/**
 * What a shop calls its regulars, and who is holding the card.
 *
 * Both go in slots the card already had. The header was the fixed word
 * "Member"; the slot under the banner was the member NUMBER, and it still is —
 * nothing collects a name yet, and the privacy page promises we never ask for
 * one. The argument exists so that turning it on later is one line rather than
 * a redesign.
 */
describe("a membership card's own words", () => {
  const memberCard = (o = {}) => card({ kind: "membership", ...o });
  const memberRow = (o = {}) => row({ kind: "membership", ...o });

  it("prints the shop's word for a regular in the header", () => {
    const p = buildPassJson(memberRow(), memberCard({ member_label: "VIP" })) as any;
    expect(p.storeCard.headerFields[0].value).toBe("VIP");
  });

  it("falls back to Member when the shop has not said", () => {
    expect(getHeaderFieldValue(0, 0, "membership")).toBe("Member");
    expect(getHeaderFieldValue(0, 0, "membership", "   ")).toBe("Member");
    expect(getHeaderFieldValue(0, 0, "membership", "Friend")).toBe("Friend");
  });

  it("shows the member number while nothing has a name", () => {
    const p = buildPassJson(memberRow({ short_code: "4KJ9PT" }), memberCard()) as any;
    expect(p.storeCard.secondaryFields[0]).toMatchObject({
      key: "reward", label: "Member no.", value: "4KJ9PT",
    });
  });

  /** Same KEY either way, so a card that gains a name updates in place. */
  it("shows the name instead once there is one", () => {
    const p = buildPassJson(memberRow(), memberCard(), "Kopi Corner", "Sarah") as any;
    expect(p.storeCard.secondaryFields[0]).toMatchObject({
      key: "reward", label: "Member", value: "Sarah",
    });
    expect(p.storeCard.secondaryFields[1].label).toBe("Member since");
  });
});

describe("memberSince", () => {
  it("reads as a month and a year", () => {
    expect(memberSince(new Date("2026-08-14T09:00:00Z"))).toBe("Aug 2026");
  });
  // The wallet renders whatever string it is handed, so a server with different
  // locale data must not print a different card for the same customer.
  it("does not depend on the machine's locale data", () => {
    expect(memberSince("2026-01-02T00:00:00Z")).toBe("Jan 2026");
  });
  it("survives a date it cannot read", () => {
    expect(memberSince("not a date")).toBe("");
  });
});

describe("stripKey", () => {
  // Strips are keyed (card_id, target, filled) because a stamp card needs one
  // picture per count. A membership tally has no ceiling, so there is no count
  // to key on and it stores exactly one band.
  it("asks for the picture matching the count on a stamp card", () => {
    expect(stripKey("stamp", 10, 3)).toEqual({ target: 10, filled: 3 });
  });
  it("clamps a count that somehow sits above the target", () => {
    expect(stripKey("stamp", 10, 40)).toEqual({ target: 10, filled: 10 });
    expect(stripKey("stamp", 10, -4)).toEqual({ target: 10, filled: 0 });
  });
  it("always asks for the one band on a membership card", () => {
    expect(stripKey("membership", 10, 0)).toEqual({ target: 0, filled: 0 });
    expect(stripKey("membership", 10, 873)).toEqual({ target: 0, filled: 0 });
  });
});

// ---------------------------------------------------------------------------
// Cards with several rewards up the ladder. The counter is the same as a stamp
// card's; what changes is WHEN a reward is ready and what happens after it is
// given. These lock both, plus the rule that matters most — a card that pays
// out part-way must not take back the stamps the customer is still holding.
// ---------------------------------------------------------------------------
describe("milestone cards", () => {
  const LADDER = [
    { at: 2, reward: "Free cookie" },
    { at: 5, reward: "Pastry" },
    { at: 10, reward: "Free coffee" },
  ];
  const mCard = (o = {}) => card({ kind: "milestones", milestones: LADDER, stamps_target: 10, ...o });
  const mRow = (o = {}) =>
    row({ kind: "milestones", milestones: LADDER, stamps_target: 10, rewards_claimed: 0, ...o });

  it("counts to the NEXT rung, not the top of the ladder", () => {
    // A customer three stamps into a 2/5/10 card is two away from a pastry.
    // Telling them they are seven away from a coffee buries the prize they can
    // nearly reach.
    expect(targetFor(mRow({ stamp_count: 3, rewards_claimed: 1 }))).toBe(5);
    expect(rewardFor(mRow({ stamp_count: 3, rewards_claimed: 1 }))).toBe("Pastry");
    // A plain stamp card is untouched by any of this.
    expect(targetFor(row({ stamp_count: 3 }))).toBe(10);
    expect(rewardFor(row())).toBe("Free coffee");
  });

  it("is ready at each rung in turn", () => {
    expect(isRewardReady(mRow({ stamp_count: 1, rewards_claimed: 0 }))).toBe(false);
    expect(isRewardReady(mRow({ stamp_count: 2, rewards_claimed: 0 }))).toBe(true);
    // Claimed the cookie, now three short of the pastry.
    expect(isRewardReady(mRow({ stamp_count: 2, rewards_claimed: 1 }))).toBe(false);
    expect(isRewardReady(mRow({ stamp_count: 5, rewards_claimed: 1 }))).toBe(true);
    expect(isRewardReady(mRow({ stamp_count: 10, rewards_claimed: 2 }))).toBe(true);
  });

  it("stops being ready once the ladder is finished", () => {
    // Nothing left to claim and the card has not restarted yet. Without this
    // the redeem button would keep handing out the top prize on every visit.
    expect(isRewardReady(mRow({ stamp_count: 10, rewards_claimed: 3 }))).toBe(false);
  });

  it("knows which rung restarts the card", () => {
    expect(isFinalReward(mRow({ rewards_claimed: 0 }))).toBe(false);
    expect(isFinalReward(mRow({ rewards_claimed: 1 }))).toBe(false);
    expect(isFinalReward(mRow({ rewards_claimed: 2 }))).toBe(true);
    // Every other kind has exactly one reward, and it always restarts.
    expect(isFinalReward(row())).toBe(true);
  });

  it("names the next prize on the front of the card", () => {
    const p = buildPassJson(mRow({ stamp_count: 3, rewards_claimed: 1 }), mCard()) as any;
    expect(p.storeCard.headerFields[0].value).toBe("2 left");
    const secondary = p.storeCard.secondaryFields;
    expect(secondary[0]).toMatchObject({ label: "Next reward", value: "Pastry" });
    expect(secondary[1].value).toBe("3/5");
  });

  it("promises the next prize in the notification, not the top one", () => {
    const p = buildPassJson(mRow({ stamp_count: 1, rewards_claimed: 0 }), mCard()) as any;
    const h = p.storeCard.headerFields[0];
    expect(h.changeMessage.replace("%@", h.value)).toBe("1 left — free cookie at 2");
  });

  it("spells the whole ladder out on the back", () => {
    const p = buildPassJson(mRow(), mCard()) as any;
    const how = p.storeCard.backFields.find((f: any) => f.key === "howto");
    // The front only has room for the next rung, which on its own never tells
    // anybody the card has three prizes on it.
    expect(how.value).toContain("Free cookie at 2 · Pastry at 5 · Free coffee at 10");
  });

  it("still carries exactly two changeMessage fields", () => {
    const p = buildPassJson(mRow(), mCard()) as any;
    const all = [
      ...p.storeCard.headerFields, ...p.storeCard.primaryFields,
      ...p.storeCard.secondaryFields, ...p.storeCard.auxiliaryFields,
      ...p.storeCard.backFields,
    ];
    expect(all.filter((f: any) => f.changeMessage).map((f: any) => f.key).sort())
      .toEqual(["message", "progress"]);
  });

  it("falls back to the pass's own reward if the ladder is empty", () => {
    // A card saved as milestones with nothing in the list must still render.
    const r = mRow({ milestones: [], rewards_claimed: 0 });
    expect(nextMilestone(r)).toBeNull();
    expect(targetFor(r)).toBe(10);
    expect(rewardFor(r)).toBe("Free coffee");
  });
});

describe("milestoneSummary", () => {
  it("reads as a list a customer could act on", () => {
    expect(milestoneSummary([{ at: 2, reward: "Cookie" }, { at: 5, reward: "Pastry" }]))
      .toBe("Cookie at 2 · Pastry at 5");
  });
  it("is empty when there is no ladder", () => {
    expect(milestoneSummary([])).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Points cards. The balance is saved UP and spent DOWN, which is the one thing
// no other kind does — so these lock what "ready" means, what the card counts
// towards, and that spending never wipes what is left over.
// ---------------------------------------------------------------------------
describe("points cards", () => {
  const SHOP = [
    { at: 200, reward: "Free coffee" },
    { at: 500, reward: "T-shirt" },
  ];
  const pCard = (o = {}) => card({ kind: "points", milestones: SHOP, ...o });
  const pRow = (o = {}) => row({ kind: "points", milestones: SHOP, stamps_target: 500, ...o });

  it("is ready as soon as the CHEAPEST thing is affordable", () => {
    expect(isRewardReady(pRow({ stamp_count: 199 }))).toBe(false);
    expect(isRewardReady(pRow({ stamp_count: 200 }))).toBe(true);
    expect(isRewardReady(pRow({ stamp_count: 4000 }))).toBe(true);
    // Nothing to buy: never ready, or the counter would offer a reward the shop
    // has not defined.
    expect(isRewardReady(pRow({ stamp_count: 900, milestones: [] }))).toBe(false);
  });

  it("counts towards the next thing out of reach", () => {
    // A price list is not a sequence — the tally is what they are saving for.
    expect(targetFor(pRow({ stamp_count: 50 }))).toBe(200);
    expect(targetFor(pRow({ stamp_count: 250 }))).toBe(500);
  });

  it("names what they can actually buy, not what they are saving for", () => {
    // Nothing affordable yet: name the thing being saved for.
    expect(rewardFor(pRow({ stamp_count: 50 }))).toBe("Free coffee");
    // 340 buys the coffee and not the shirt. Naming the shirt here — which is
    // what "next" means for the tally — told customers to show staff something
    // they could not have.
    expect(rewardFor(pRow({ stamp_count: 340 }))).toBe("Free coffee");
    // Everything affordable: the best of them.
    expect(rewardFor(pRow({ stamp_count: 900 }))).toBe("T-shirt");
  });

  it("lists only what the balance can actually pay for", () => {
    expect(affordableRewards(pRow({ stamp_count: 199 }))).toEqual([]);
    expect(affordableRewards(pRow({ stamp_count: 200 })).map((m: any) => m.reward))
      .toEqual(["Free coffee"]);
    expect(affordableRewards(pRow({ stamp_count: 500 })).map((m: any) => m.reward))
      .toEqual(["Free coffee", "T-shirt"]);
    // Only ever a points question — a stamp card redeems, it does not shop.
    expect(affordableRewards(row({ stamp_count: 10 }))).toEqual([]);
  });

  it("is never a card that restarts", () => {
    // "Give reward & restart" on a points card would tell a customer their
    // leftover points were about to be wiped. They are not.
    expect(isFinalReward(pRow({ stamp_count: 900 }))).toBe(false);
  });

  /**
   * The headline counts the shorter road, exactly as a stamp card's does.
   *
   * It read "340 points" before: true, and it never once told anybody how far
   * they still had to go. Same rule as stamps now — count up while that is the
   * encouraging number, count down once the reward is closer than the start.
   */
  it("counts up, then down, and changes on every visit", () => {
    expect(getHeaderFieldValue(0, 200, "points")).toBe("0 points earned");
    expect(getHeaderFieldValue(1, 200, "points")).toBe("1 point earned");
    expect(getHeaderFieldValue(199, 200, "points")).toBe("1 point to reward");
    expect(getHeaderFieldValue(340, 500, "points")).toBe("160 points to reward");
    // Both platforms notify off a value CHANGE, so a distinct string per
    // balance is what makes an Android and an iPhone card buzz at all.
    const seen = new Set(
      Array.from({ length: 60 }, (_, i) => getHeaderFieldValue(i, 500, "points")),
    );
    expect(seen.size).toBe(60);
  });

  /**
   * Past the dearest thing on the list, back to the plain balance.
   *
   * A points balance has no ceiling. "Reward ready" would freeze the header at
   * the top of the catalogue and every stamp after that would be silent, which
   * is the one thing this field exists to prevent.
   */
  it("keeps moving once everything on the list is affordable", () => {
    expect(getHeaderFieldValue(500, 500, "points")).toBe("500 points");
    expect(getHeaderFieldValue(650, 500, "points")).toBe("650 points");
    expect(getHeaderFieldValue(651, 500, "points")).toBe("651 points");
  });

  it("puts the balance on the front and the next thing beside it", () => {
    const p = buildPassJson(pRow({ stamp_count: 340 }), pCard()) as any;
    expect(p.storeCard.headerFields[0].value).toBe("160 points to reward");
    expect(p.storeCard.secondaryFields[0]).toMatchObject({
      label: "Next reward", value: "Free coffee — show this to staff!",
    });
    expect(p.storeCard.secondaryFields[1]).toMatchObject({ label: "Balance", value: "340/500" });
  });

  it("still carries exactly two changeMessage fields", () => {
    const p = buildPassJson(pRow({ stamp_count: 340 }), pCard()) as any;
    const all = [
      ...p.storeCard.headerFields, ...p.storeCard.primaryFields,
      ...p.storeCard.secondaryFields, ...p.storeCard.auxiliaryFields,
      ...p.storeCard.backFields,
    ];
    expect(all.filter((f: any) => f.changeMessage).map((f: any) => f.key).sort())
      .toEqual(["message", "progress"]);
  });

  it("carries points terms that mention spending, not stamps", () => {
    const p = buildPassJson(pRow(), pCard()) as any;
    const terms = p.storeCard.backFields.find((f: any) => f.key === "terms");
    expect(terms.value).toBe(pointsTerms("Kopi Corner"));
    expect(terms.value).toContain("come off when you spend them");
    expect(cardTerms("Kopi Corner", "points")).toBe(pointsTerms("Kopi Corner"));
  });

  it("stores one band, not a picture per balance", () => {
    // A balance climbs past any ceiling and is spent back down, so there is no
    // finite set of counts to pre-render.
    expect(stripKey("points", 500, 0)).toEqual({ target: 0, filled: 0 });
    expect(stripKey("points", 500, 4820)).toEqual({ target: 0, filled: 0 });
  });

  it("cheapestReward finds the floor whatever order the list is in", () => {
    expect(cheapestReward(pRow())?.at).toBe(200);
    expect(cheapestReward(pRow({ milestones: [{ at: 900, reward: "A" }, { at: 5, reward: "B" }] }))?.at)
      .toBe(5);
    expect(cheapestReward(pRow({ milestones: [] }))).toBeNull();
  });
});

describe("catalogueSummary", () => {
  it("prices each thing in points", () => {
    expect(catalogueSummary([{ at: 200, reward: "Free coffee" }, { at: 500, reward: "T-shirt" }]))
      .toBe("Free coffee — 200 points · T-shirt — 500 points");
  });
});
