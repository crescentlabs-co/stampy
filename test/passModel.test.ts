import { describe, expect, it } from "vitest";
import type { CardRow, PassRow } from "../src/db.js";

// Set BASE_URL BEFORE importing the module under test (config reads env at
// import). The policy links on the back of the card are absolute URLs built
// from it — a relative path in a pass back field is not tappable.
process.env.BASE_URL = "https://stampy.example.test";
// The demo card is picked out by id, so it needs one no other fixture uses.
process.env.DEMO_CARD_ID = "demo-card";

const {
  buildPassJson, getHeaderFieldValue, isRewardReady, passBarcode, progressText, stampDots, stampGrid,
} = await import("../src/passModel.js");

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
