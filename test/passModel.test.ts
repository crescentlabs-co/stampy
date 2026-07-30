import { describe, expect, it } from "vitest";
import type { CardRow, PassRow } from "../src/db.js";

// Set BASE_URL BEFORE importing the module under test (config reads env at
// import). The policy links on the back of the card are absolute URLs built
// from it — a relative path in a pass back field is not tappable.
process.env.BASE_URL = "https://stampy.example.test";

const { buildPassJson, getHeaderFieldValue, isRewardReady, progressText, stampDots, stampGrid } =
  await import("../src/passModel.js");

function card(overrides: Partial<CardRow> = {}): CardRow {
  return {
    id: "default",
    merchant_id: null,
    name: "Kopi Corner",
    reward: "Free coffee",
    stamps_target: 10,
    stamps_start: 2,
    background_color: "rgb(59, 32, 22)",
    foreground_color: "rgb(255, 250, 240)",
    label_color: "rgb(214, 178, 120)",
    accent_color: "rgb(214, 178, 120)",
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
    signup_message: "",
    archived_at: null,
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
    reward: "Free coffee",
    message: "",
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe("stampDots", () => {
  it("renders filled and empty slots", () => {
    expect(stampDots(3, 10)).toBe("●●●○○○○○○○");
  });
  it("clamps below zero and above target", () => {
    expect(stampDots(-2, 5)).toBe("○○○○○");
    expect(stampDots(9, 5)).toBe("●●●●●");
  });
});

describe("isRewardReady", () => {
  it("is ready only at/after target", () => {
    expect(isRewardReady({ stamp_count: 9, stamps_target: 10 })).toBe(false);
    expect(isRewardReady({ stamp_count: 10, stamps_target: 10 })).toBe(true);
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

  it("prints the reward terms and the policy links on the back", () => {
    const p = buildPassJson(row(), card()) as any;
    const back = Object.fromEntries(p.storeCard.backFields.map((f: any) => [f.key, f]));

    // Expiry is a reserved right, not an automated behaviour — nothing in the
    // code expires a stamp, so the card must not claim that it does.
    expect(back.terms.value).toContain("may expire");
    expect(back.terms.value).toContain("One stamp per visit");
    expect(back.terms.value).toContain("Kopi Corner"); // the shop honours it, not Stampy

    expect(back.legal.value).toContain("https://stampy.example.test/terms");
    expect(back.legal.value).toContain("https://stampy.example.test/privacy");
    expect(back.legal.value).toContain("delete this card from your wallet"); // the opt-out
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

  // The shop's name and the card's name are two different things the moment a
  // merchant runs more than one card. The pass is issued BY the shop.
  it("puts the business on the issuer fields and the card on the programme", () => {
    const p = buildPassJson(row(), card({ name: "Pastry card" }), "Kopi Corner") as any;
    expect(p.organizationName).toBe("Kopi Corner");
    expect(p.logoText).toBe("Kopi Corner");
    expect(p.description).toContain("Pastry card");
  });

  it("falls back to the card's name when there is no business yet", () => {
    const p = buildPassJson(row(), card({ name: "Kopi Corner" })) as any;
    expect(p.organizationName).toBe("Kopi Corner");
  });
});
