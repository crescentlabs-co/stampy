import { beforeAll, describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import jwt from "jsonwebtoken";
import type { CardRow, PassRow } from "../src/db.js";

// Set the Google env BEFORE importing the modules under test (config reads env at import).
process.env.GOOGLE_ISSUER_ID = "3388000000012345678";
process.env.BASE_URL = "https://stampy.example.test";
// The demo card is picked out by id, so the tests need one that is not the id
// every other fixture here uses.
process.env.DEMO_CARD_ID = "demo-card";

const {
  buildHeroClearPatch, buildLoyaltyClass, buildLoyaltyObject, buildLoyaltyPatch,
  buildSaveJwtClaims, classId, logoUrl,
} = await import("../src/googleModel.js");
// Imported here on purpose: the point of the block below is to compare the two
// platforms against each other, which no single-platform test file can do.
const { buildPassJson } = await import("../src/passModel.js");
const { rgbToHex } = await import("../src/color.js");

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
    band_opacity: 100,
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
    platform: "google",
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

describe("rgbToHex", () => {
  it("converts our PassKit rgb() strings to Google's hex", () => {
    expect(rgbToHex("rgb(59, 32, 22)")).toBe("#3b2016");
    expect(rgbToHex("rgb(255, 250, 240)")).toBe("#fffaf0");
  });
  it("falls back to the default brown on junk", () => {
    expect(rgbToHex("not-a-color")).toBe("#3b2016");
  });
});

describe("buildLoyaltyClass", () => {
  it("builds the per-café class with hosted logo and branding", () => {
    const cls = buildLoyaltyClass(card()) as any;
    expect(cls.id).toBe("3388000000012345678.stampy-default");
    expect(cls.issuerName).toBe("Kopi Corner");
    expect(cls.hexBackgroundColor).toBe("#3b2016");
    expect(cls.programLogo.sourceUri.uri).toBe("https://stampy.example.test/art/logo.png");
    expect(cls.reviewStatus).toBe("UNDER_REVIEW");
  });

  it("points the logo at the café's own route, version-stamped after an upload", () => {
    expect(logoUrl(card())).toBe("https://stampy.example.test/art/logo.png");
    expect(logoUrl(card({ id: "kopi2" }))).toBe("https://stampy.example.test/c/kopi2/art/logo.png");
    expect(logoUrl(card({ id: "kopi2" }), 1700000000000)).toBe(
      "https://stampy.example.test/c/kopi2/art/logo.png?v=1700000000000",
    );
    const cls = buildLoyaltyClass(card({ id: "kopi2" }), 42) as any;
    expect(cls.programLogo.sourceUri.uri).toBe(
      "https://stampy.example.test/c/kopi2/art/logo.png?v=42",
    );
  });

  // Google's programLogo slot is small and close to square, so the wide brand
  // lockup Apple's logo band wants comes out as a sliver on Android. The square
  // upload is optional, and skipping it has to change nothing.
  it("uses the square mark for programLogo, and only when one was uploaded", () => {
    const none = buildLoyaltyClass(card({ id: "kopi2" }), 42) as any;
    expect(none.programLogo.sourceUri.uri).toBe(
      "https://stampy.example.test/c/kopi2/art/logo.png?v=42",
    );
    const marked = buildLoyaltyClass(card({ id: "kopi2" }), 42, 0, "Kopi Corner", 77) as any;
    expect(marked.programLogo.sourceUri.uri).toBe(
      "https://stampy.example.test/c/kopi2/art/mark.png?v=77",
    );
    // The wide logo is untouched by any of this — Apple still gets it.
    expect(logoUrl(card({ id: "kopi2" }), 42, 77)).toBe(
      "https://stampy.example.test/c/kopi2/art/mark.png?v=77",
    );
    expect(logoUrl(card({ id: "kopi2" }), 42, 0)).toBe(
      "https://stampy.example.test/c/kopi2/art/logo.png?v=42",
    );
  });

  it("adds a heroImage only when a banner exists (version > 0)", () => {
    expect((buildLoyaltyClass(card()) as any).heroImage).toBeUndefined();
    const withBanner = buildLoyaltyClass(card({ id: "kopi2" }), 0, 99) as any;
    expect(withBanner.heroImage.sourceUri.uri).toBe(
      "https://stampy.example.test/c/kopi2/art/banner.png?v=99",
    );
  });

  /**
   * The band across the bottom of the Android card — the slot that is otherwise
   * a bare white strip nobody can account for.
   *
   * It is the ALL-FILLED grid and it points at full.png, which resolves the
   * target server-side. A URL carrying the count would have to be re-sent on
   * every stamp, and Google fetches hero images itself: that is the delay the
   * patch above is tested to avoid. Static, on the class, it costs a stamp
   * nothing.
   */
  it("prefers the stamp band over the banner, and never carries a count", () => {
    const withGrid = buildLoyaltyClass(card({ id: "kopi2" }), 0, 99, undefined, 0, 1234) as any;
    expect(withGrid.heroImage.sourceUri.uri).toBe(
      "https://stampy.example.test/c/kopi2/art/stamps/full.png?v=1234",
    );
    // The banner is composited into every strip, so the grid carries both —
    // falling back to it would drop the stamps for nothing.
    expect(withGrid.heroImage.sourceUri.uri).not.toContain("banner");
    // No count anywhere in the URL: that is what makes it static.
    for (const n of ["/0.png", "/3.png", "/10.png"]) {
      expect(withGrid.heroImage.sourceUri.uri).not.toContain(n);
    }
  });

  it("carries the terms and privacy links, so existing cards inherit them", () => {
    // On the CLASS, not the object: class data renders on every object already
    // issued, which is the only way an Android card in a wallet today can gain
    // a link without touching that customer's object.
    const cls = buildLoyaltyClass(card()) as any;
    const uris = Object.fromEntries(cls.linksModuleData.uris.map((u: any) => [u.id, u.uri]));
    expect(uris.terms).toBe("https://stampy.example.test/terms");
    expect(uris.privacy).toBe("https://stampy.example.test/privacy");
  });

  it("shows the SAME reward terms as the Apple pass", async () => {
    const { rewardTerms } = await import("../src/passModel.js");
    const cls = buildLoyaltyClass(card()) as any;
    const terms = cls.textModulesData.find((t: any) => t.id === "terms");
    // One wording, one source. An Android and an iPhone customer of the same
    // shop must never be shown different terms.
    expect(terms.body).toBe(rewardTerms("Kopi Corner"));
    expect(terms.body).toContain("may expire");
  });

  it("omits the links when no baseUrl is configured (boots with zero secrets)", async () => {
    // Google rejects a relative uri, and invariant 1 says the app must still
    // start and build content with no env at all. The terms text has no URL in
    // it, so it survives; the links drop out.
    const { config } = await import("../src/config.js");
    const saved = config.baseUrl;
    config.baseUrl = "";
    try {
      const cls = buildLoyaltyClass(card()) as any;
      expect(cls.linksModuleData).toBeUndefined();
      expect(cls.textModulesData.find((t: any) => t.id === "terms")).toBeTruthy();
    } finally {
      config.baseUrl = saved;
    }
  });
});

describe("buildLoyaltyObject", () => {
  it("carries the SAME barcode content as the Apple pass (serial) so one scanner works", () => {
    const obj = buildLoyaltyObject(row(), card()) as any;
    expect(obj.barcode.type).toBe("QR_CODE");
    expect(obj.barcode.value).toBe(row().serial);
    expect(obj.barcode.alternateText).toBe("Code ABC234");
  });

  /*
   * The barcode is the one field where Apple and Google MUST agree: one staff
   * scanner reads both, so a difference between them is a card that cannot be
   * stamped on one platform. It used to be kept in step by writing row.serial
   * out in two files and hoping. These tests compare the two builders against
   * each other rather than each against a literal, so a change to one that is
   * not made to the other fails here instead of at somebody's counter.
   */
  it("gives an ordinary card the same barcode on both platforms", () => {
    const g = buildLoyaltyObject(row(), card()) as any;
    const a = buildPassJson(row(), card()) as any;
    expect(g.barcode.value).toBe(a.barcodes[0].message);
    expect(g.barcode.alternateText).toBe(a.barcodes[0].altText);
    expect(g.barcode.value).toBe(row().serial);
  });

  it("gives the DEMO card the same barcode on both platforms, and it is a link", () => {
    const demo = card({ id: "demo-card" });
    const g = buildLoyaltyObject(row(), demo) as any;
    const a = buildPassJson(row(), demo) as any;
    expect(g.barcode.value).toBe(a.barcodes[0].message);
    expect(g.barcode.alternateText).toBe(a.barcodes[0].altText);
    // The landing page, tagged so the scan is counted apart from ordinary
    // web traffic. Not the serial: this card is handed out, and a stranger
    // scanning it should reach the pitch.
    expect(g.barcode.value).toBe("https://stampy.example.test/?s=card");
    // What a human reads under the QR. "Code ABC234" here would name a code
    // that is not in the barcode, and an address is not typeable with that
    // query string on it - so it says why to scan instead.
    expect(g.barcode.alternateText).toBe("Scan for more info");
    expect(g.barcode.type).toBe("QR_CODE");
  });

  it("leaves every OTHER card alone when the demo card is configured", () => {
    const other = buildLoyaltyObject(row(), card({ id: "some-real-shop" })) as any;
    expect(other.barcode.value).toBe(row().serial);
    expect(other.barcode.alternateText).toBe("Code ABC234");
  });

  it("shows stamp progress as the points balance", () => {
    const obj = buildLoyaltyObject(row(), card()) as any;
    // Still sent, and must be: loyaltyPoints.balance is the field whose change
    // triggers Google's update notification. Drop it and Android stops telling
    // anyone a stamp landed, with every card still looking right when opened.
    expect(obj.loyaltyPoints.balance.string).toBe("3/10");
    // And on the front of the card, where the dot grid used to be.
    expect(obj.textModulesData.find((t: any) => t.id === "earned").body).toBe("3/10 earned");
    expect(obj.textModulesData.find((t: any) => t.id === "stamps")).toBeUndefined();
  });

  it("switches to reward-ready copy when full", () => {
    const obj = buildLoyaltyObject(row({ stamp_count: 10 }), card()) as any;
    // The shout moved to the line that survived. It used to sit on the dot
    // row's header, which is gone.
    expect(obj.textModulesData.find((t: any) => t.id === "earned").body).toContain("reward ready");
    const reward = obj.textModulesData.find((t: any) => t.id === "reward");
    expect(reward.body).toContain("show this to staff");
  });

  it("includes the win-back message module only when a message exists", () => {
    const without = buildLoyaltyObject(row(), card()) as any;
    expect(without.textModulesData.find((t: any) => t.id === "message")).toBeUndefined();
    const withMsg = buildLoyaltyObject(row({ message: "We miss you!" }), card()) as any;
    expect(withMsg.textModulesData.find((t: any) => t.id === "message").body).toBe("We miss you!");
  });

  // The look lives on the class, which is per-shop and renders on every object
  // beneath it. An object-level image would shadow it AND have to be re-sent to
  // change — which is exactly how the stamp path came to carry a picture.
  it("carries no image of its own — the class holds the banner", () => {
    const obj = buildLoyaltyObject(row({ stamp_count: 3 }), card()) as any;
    expect(obj.heroImage).toBeUndefined();
    expect(JSON.stringify(obj)).not.toContain("/art/");
  });
});

describe("save-to-wallet JWT", () => {
  let privateKey: string;
  let publicKey: string;

  beforeAll(() => {
    const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
    privateKey = pair.privateKey.export({ type: "pkcs8", format: "pem" }) as string;
    publicKey = pair.publicKey.export({ type: "spki", format: "pem" }) as string;
  });

  it("signs claims Google will accept (aud/typ/iss/payload)", () => {
    const claims = buildSaveJwtClaims(row(), card(), "svc@project.iam.gserviceaccount.com");
    const token = jwt.sign(claims, privateKey, { algorithm: "RS256" });
    const decoded = jwt.verify(token, publicKey, { algorithms: ["RS256"] }) as any;
    expect(decoded.aud).toBe("google");
    expect(decoded.typ).toBe("savetowallet");
    expect(decoded.iss).toBe("svc@project.iam.gserviceaccount.com");
    expect(decoded.payload.loyaltyObjects[0].id).toBe(
      "3388000000012345678.11111111-2222-3333-4444-555555555555",
    );
    expect(decoded.payload.loyaltyObjects[0].classId).toBe("3388000000012345678.stampy-default");
    expect(decoded.origins).toEqual(["https://stampy.example.test"]);
  });

  // Same rule as Apple's description: the customer only ever reads the SHOP's
  // name. cards.name has no field in the dashboard and goes stale silently.
  it("names the programme after the shop, never after the card row", () => {
    const cls = buildLoyaltyClass(card({ name: "Pastry card" }), 0, 0, "Kopi Corner") as any;
    expect(cls.issuerName).toBe("Kopi Corner");
    // Google prints BOTH lines at the top, always. The shop's name on both said
    // it twice; "Kopi Corner loyalty card" said it twice in one line. The name
    // belongs on the issuer line, and this one says what the thing is.
    expect(cls.programName).toBe("Loyalty card");
    expect(JSON.stringify(cls)).not.toContain("Pastry card");
  });

  /**
   * The front of the Android card.
   *
   * Google's default template shows programName, loyaltyPoints and the barcode,
   * and files every textModulesData entry in a details view. So the dots, the
   * reward and "REWARD READY" — everything a customer opens the card to see —
   * were one screen away, and the designer's Android preview drew them on the
   * front, promising a card Google does not render.
   */
  describe("the card front template", () => {
    const rows = (): any[] =>
      ((buildLoyaltyClass(card()) as any).classTemplateInfo.cardTemplateOverride
        .cardRowTemplateInfos as any[]);

    const paths = (node: unknown): string[] =>
      JSON.stringify(node).match(/"fieldPath":"([^"]+)"/g)?.map((s) => s.slice(13, -1)) ?? [];

    /**
     * The override REPLACES the default rows rather than adding to them, so the
     * count has to be listed here or it vanishes from the card entirely — the
     * one thing that was on the front to begin with.
     */
    /**
     * The override REPLACES the default rows, so the count has to be somewhere
     * or it leaves the card entirely — it was the one thing the default template
     * showed for free. It used to ride in the dot row's header; with that row
     * gone it is the PROGRESS line itself, which is why that line says the
     * number rather than a phrase derived from it.
     */
    it("keeps the stamp count now that the dots are gone", () => {
      const mods = buildLoyaltyPatch(row({ stamp_count: 1, stamps_target: 8 }), card())
        .textModulesData as { id: string; header: string; body: string }[];
      expect(mods.find((m) => m.id === "earned")?.body).toBe("1/8 earned");
      // The module and the template path that pointed at it went together: a
      // path naming a module that does not exist renders an EMPTY ROW rather
      // than failing, so half a removal is silent on the phone.
      expect(mods.find((m) => m.id === "stamps")).toBeUndefined();
      expect(paths(rows())).not.toContain("object.textModulesData['stamps']");
    });

    /**
     * The count at every stage of a card, and the one state it exists for.
     *
     * It used to borrow the iPhone's phrasing ("1 earned" / "3 left"), which
     * reads well beside a grid of dots showing the whole card at a glance. With
     * the dots gone this is the only place the number appears on the front, so
     * it says the number.
     */
    it("says how many of how many, and shouts at the target", () => {
      expect(paths(rows())).toContain("object.textModulesData['earned']");
      const earned = (n: number, t: number) =>
        (buildLoyaltyPatch(row({ stamp_count: n, stamps_target: t }), card())
          .textModulesData as { id: string; body: string }[]).find((m) => m.id === "earned")?.body;
      for (const [n, t] of [[0, 10], [1, 8], [6, 8]] as const) {
        expect(earned(n, t), `${n}/${t}`).toBe(`${n}/${t} earned`);
      }
      expect(earned(8, 8)).toBe("8/8 — reward ready 🎉");
    });

    /**
     * Reward on the left, where you are on the right — the order the Apple card
     * reads in. It was the other way round, so a customer holding both had two
     * cards to learn.
     */
    it("puts reward before progress, as the iPhone does", () => {
      const first = JSON.stringify(rows()[0]);
      expect(first.indexOf("'reward'")).toBeLessThan(first.indexOf("'earned'"));
    });

    /**
     * The bug this whole round is about, in one assertion.
     *
     * `FieldSelector.fields` is a FALLBACK chain — Google renders the first
     * reference that is not empty and stops. Written as
     * `[loyaltyPoints.label, loyaltyPoints.balance]` in the belief it meant
     * "label, then value", it rendered "Stamps" and dropped the number, and the
     * card shipped to a real phone saying nothing about how many stamps anyone
     * had. Any second entry in one of these arrays is either dead weight or the
     * same misreading again.
     */
    it("never lists a second fieldPath, which would be a fallback and not a value", () => {
      const selectors = JSON.stringify(rows()).match(/"fields":\[[^\]]*\]/g) ?? [];
      expect(selectors.length).toBeGreaterThan(0);
      for (const sel of selectors) {
        expect((sel.match(/fieldPath/g) ?? []).length, sel).toBe(1);
      }
    });

    /**
     * Nothing on the front points at loyaltyPoints now, which makes it look
     * deletable. It is not: its balance is the field whose change triggers
     * Google's update notification, so removing it would end Android
     * notifications while every card still looked right when opened by hand.
     */
    it("still sends loyaltyPoints, which is what makes a stamp notify", () => {
      const patch = buildLoyaltyPatch(row({ stamp_count: 1, stamps_target: 8 }), card()) as any;
      expect(patch.loyaltyPoints.balance.string).toBe("1/8");
    });

    /**
     * The binding that cannot be checked anywhere else. Google accepts a
     * fieldPath naming a module that does not exist and renders an empty row —
     * so a renamed id loses the reward line on every Android card with nothing
     * failing, here or on the wire. This asserts the class points only at ids
     * the object actually writes.
     */
    it("points only at text modules the object really sends", () => {
      const sent = new Set(
        (buildLoyaltyPatch(row(), card()).textModulesData as { id: string }[]).map((m) => m.id),
      );
      const referenced = paths(rows())
        .map((p) => /^object\.textModulesData\['(.+)'\]$/.exec(p)?.[1])
        .filter((id): id is string => Boolean(id));
      expect(referenced.length).toBeGreaterThan(0);
      for (const id of referenced) expect(sent, `class points at "${id}"`).toContain(id);
    });

    // The dots are one character per stamp; a 20-stamp card sharing a row would
    // be cut in half.
    /**
     * One row, and nothing pointing at a module that no longer exists. Google
     * renders an empty row for a dangling fieldPath rather than rejecting it,
     * so a half-removal shows up only on a real phone.
     */
    it("has no row left pointing at the dots", () => {
      expect(rows().length).toBe(1);
      expect(paths(rows())).not.toContain("object.textModulesData['stamps']");
    });
  });
});

describe("buildLoyaltyPatch", () => {
  // A stamp happens several times a day per customer. PATCH leaves omitted
  // fields alone, so re-sending the card's identity every time is pure weight
  // on the slowest hop in the product.
  it("carries only what a stamp changes", () => {
    const patch = buildLoyaltyPatch(row({ stamp_count: 7 }), card()) as any;
    expect(Object.keys(patch).sort()).toEqual(["loyaltyPoints", "textModulesData"]);
    expect(patch.loyaltyPoints.balance.string).toBe("7/10");
  });

  it("omits the fields that never change", () => {
    const patch = buildLoyaltyPatch(row(), card()) as any;
    for (const frozen of ["id", "classId", "barcode", "accountId", "accountName", "state"]) {
      expect(patch[frozen]).toBeUndefined();
    }
  });

  // THE fix for the 20-second Android stamp, in its strongest form. The hero
  // image once carried the stamp count in its URL, so every stamp handed Google
  // an image it had never seen and had to fetch before the card could render.
  // Moving it to the shop's banner fixed that and left a quieter version of the
  // same cost — an unchanged picture re-sent several times a day per customer,
  // on the one call somebody is waiting on. A stamp now mentions no image at
  // all. Any URL reappearing here brings some amount of that delay back.
  it("mentions no image at all, at any stamp count", () => {
    for (const n of [0, 3, 7, 10]) {
      const patch = buildLoyaltyPatch(row({ stamp_count: n }), card()) as any;
      expect(patch.heroImage, `heroImage at ${n} stamps`).toBeUndefined();
      expect(JSON.stringify(patch), `a URL at ${n} stamps`).not.toContain("http");
    }
    // Progress still moves — in text, which is the part that arrives fast.
    const at3 = buildLoyaltyPatch(row({ stamp_count: 3 }), card()) as any;
    const at7 = buildLoyaltyPatch(row({ stamp_count: 7 }), card()) as any;
    expect(at3.loyaltyPoints.balance.string).toBe("3/10");
    expect(at7.loyaltyPoints.balance.string).toBe("7/10");
    expect(at3.textModulesData[0].body).not.toBe(at7.textModulesData[0].body);
  });

  // Dropping it from the stamp must not mean losing it: uploading a banner
  // calls ensureClass, and class art renders on every object already issued.
  // If this stops being true, the banner silently disappears from Android.
  it("still delivers the banner — via the class, scoped to the card", () => {
    const cls = buildLoyaltyClass(card({ id: "abc12345" }), 0, 99) as any;
    expect(cls.heroImage.sourceUri.uri).toBe(
      "https://stampy.example.test/c/abc12345/art/banner.png?v=99",
    );
  });

  // The full object is the patch plus identity: build them separately and they
  // drift, and a card that renders one way on save renders another on a stamp.
  it("is a strict subset of the full object", () => {
    const r = row({ stamp_count: 4, message: "See you soon" });
    const patch = buildLoyaltyPatch(r, card(), "Kopi Corner") as any;
    const full = buildLoyaltyObject(r, card(), "Kopi Corner") as any;
    for (const key of Object.keys(patch)) {
      expect(full[key]).toEqual(patch[key]);
    }
  });

  // The shop name only reaches the wire as a nudge's header, which is why
  // patchBalance skips the database lookup for it on an ordinary stamp. If the
  // name starts appearing elsewhere in the patch, that shortcut is wrong.
  it("uses the shop name only for a nudge header", () => {
    const plain = buildLoyaltyPatch(row(), card(), "Some Other Shop") as any;
    expect(JSON.stringify(plain)).not.toContain("Some Other Shop");
    const nudged = buildLoyaltyPatch(row({ message: "Miss you" }), card(), "Some Other Shop") as any;
    expect(nudged.textModulesData.find((t: any) => t.id === "message").header).toBe("Some Other Shop");
  });
});

// The repair that unsticks an Android card. Both halves of this patch are load
// bearing and neither is obvious from reading it, so both are pinned.
describe("buildHeroClearPatch", () => {
  // Omitting the field is what froze these images in the first place: PATCH
  // leaves an omitted field alone, so "stop sending it" never removed anything.
  it("sends heroImage as an explicit null, not an absent key", () => {
    const patch = buildHeroClearPatch();
    expect("heroImage" in patch).toBe(true);
    expect(patch.heroImage).toBeNull();
    expect(JSON.stringify(patch)).toContain('"heroImage":null');
  });

  // A repair is not an event. Google notifies only when asked, and an operator
  // tidying up artwork must not buzz a customer's phone (invariant 3).
  it("asks for no notification", () => {
    expect(buildHeroClearPatch()).not.toHaveProperty("notifyPreference");
  });

  // It must touch NOTHING else. A stray loyaltyPoints or textModulesData here
  // would overwrite a real customer's progress with whatever this file guessed.
  it("carries nothing but the image", () => {
    expect(Object.keys(buildHeroClearPatch())).toEqual(["heroImage"]);
  });
});

// ---------------------------------------------------------------------------
// Membership on Android. The two platforms have to agree — a customer holding
// an iPhone card and a friend holding an Android one are looking at the same
// promise, so these check the payload against buildPassJson where they overlap.
// ---------------------------------------------------------------------------
describe("membership cards on Google", () => {
  const memberCard = (o: Partial<CardRow> = {}) =>
    card({ kind: "membership", benefits: "10% off\nFree birthday drink", ...o });
  const memberRow = (o: Partial<PassRow> = {}) => row({ kind: "membership", ...o });

  it("keeps loyaltyPoints present, holding the member's code", () => {
    // The field must never be dropped: it is the one whose change triggers
    // Google's notification. On a membership card it is a constant, so no
    // notification ever fires — correct, because nothing happened worth one.
    const p = buildLoyaltyPatch(memberRow({ short_code: "ZZ9K2Q" }), memberCard()) as any;
    expect(p.loyaltyPoints).toBeDefined();
    expect(p.loyaltyPoints.label).toBe("Member no.");
    expect(p.loyaltyPoints.balance.string).toBe("ZZ9K2Q");
  });

  it("shows the same two facts the iPhone card shows", () => {
    const r = memberRow({ short_code: "ZZ9K2Q" });
    const g = buildLoyaltyPatch(r, memberCard()) as any;
    const a = buildPassJson(r, memberCard(), "Kopi Corner") as any;

    const front = (id: string) =>
      g.textModulesData.find((m: any) => m.id === id);
    // Left item on Google is the reward slot on Apple; right is the progress
    // slot. Both carry the member's number and join month respectively.
    expect(front("reward").body).toBe("ZZ9K2Q");
    expect(front("reward").body).toBe(a.storeCard.secondaryFields[0].value);
    expect(front("earned").body).toBe(a.storeCard.secondaryFields[1].value);
  });

  /**
   * The slot under the banner says WHO, or failing that WHICH card.
   *
   * Both platforms have to move together or the same customer's two cards
   * disagree about what is printed on them — which is exactly the drift the
   * mock-vs-payload pair above exists to prevent.
   */
  it("names the member once there is a name, on both platforms at once", () => {
    const r = memberRow({ short_code: "ZZ9K2Q" });
    const g = buildLoyaltyPatch(r, memberCard(), "Kopi Corner", "Sarah") as any;
    const a = buildPassJson(r, memberCard(), "Kopi Corner", "Sarah") as any;
    const front = g.textModulesData.find((m: any) => m.id === "reward");
    expect(front.header).toBe("MEMBER");
    expect(front.body).toBe("Sarah");
    expect(front.body).toBe(a.storeCard.secondaryFields[0].value);
    expect(a.storeCard.secondaryFields[0].label).toBe("Member");
  });

  /** Nothing collects a name yet, so this is what every member sees today. */
  it("falls back to the member number, headed as one", () => {
    const g = buildLoyaltyPatch(memberRow({ short_code: "ZZ9K2Q" }), memberCard()) as any;
    const front = g.textModulesData.find((m: any) => m.id === "reward");
    expect(front.header).toBe("MEMBER NO.");
    expect(front.body).toBe("ZZ9K2Q");
  });

  it("puts the perks on the CLASS, so adding one reaches every member", () => {
    // On the class rather than the object for the same reason the terms are:
    // class data renders on every object already issued, so a shop adding a
    // perk updates every Android member without touching a single object —
    // and without the notification an object patch would carry.
    const cls = buildLoyaltyClass(memberCard(), 0, 0, "Kopi Corner") as any;
    const perks = cls.textModulesData.find((m: any) => m.id === "benefits");
    expect(perks.header).toBe("What you get");
    expect(perks.body).toBe("• 10% off\n• Free birthday drink");

    // And never on the stamp path, which sends one on every stamp.
    const patch = buildLoyaltyPatch(memberRow(), memberCard()) as any;
    expect(patch.textModulesData.find((m: any) => m.id === "benefits")).toBeUndefined();
  });

  it("omits the perks block when the shop has typed none", () => {
    const cls = buildLoyaltyClass(memberCard({ benefits: "" }), 0, 0, "Kopi Corner") as any;
    expect(cls.textModulesData.find((m: any) => m.id === "benefits")).toBeUndefined();
  });

  it("names the programme Membership and carries membership terms", () => {
    const cls = buildLoyaltyClass(memberCard(), 0, 0, "Kopi Corner") as any;
    expect(cls.programName).toBe("Membership");
    const terms = cls.textModulesData.find((m: any) => m.id === "terms");
    expect(terms.header).toBe("Membership terms");
    expect(terms.body).not.toContain("stamp");
  });

  it("leaves a stamp card exactly as it was", () => {
    const p = buildLoyaltyPatch(row({ stamp_count: 3, stamps_target: 8 }), card()) as any;
    expect(p.loyaltyPoints.label).toBe("Stamps");
    expect(p.loyaltyPoints.balance.string).toBe("3/8");
    expect(buildLoyaltyClass(card(), 0, 0, "Kopi Corner").programName).toBe("Loyalty card");
  });
});

describe("the class id prefix — invariant 13's guard", () => {
  it("is exactly 'stampy' when GOOGLE_CLASS_PREFIX is unset", () => {
    // Every Android card ever issued re-sends this string on every stamp.
    // Production sets no variable, so this default IS the live behaviour —
    // change it and every issued card stops updating, forever.
    delete process.env.GOOGLE_CLASS_PREFIX;
    expect(classId(card())).toBe("3388000000012345678.stampy-default");
  });

  it("lets a staging deployment move its classes out of live's namespace", () => {
    // The card id "default" exists in BOTH databases (migrate() seeds it), so
    // without a different prefix staging and live map onto the same Google
    // class — and staging would overwrite the live card template.
    process.env.GOOGLE_CLASS_PREFIX = "stampy-stg";
    try {
      expect(classId(card())).toBe("3388000000012345678.stampy-stg-default");
    } finally {
      delete process.env.GOOGLE_CLASS_PREFIX;
    }
  });

  it("treats a blank variable as unset, not as an empty prefix", () => {
    process.env.GOOGLE_CLASS_PREFIX = "   ";
    try {
      expect(classId(card())).toBe("3388000000012345678.stampy-default");
    } finally {
      delete process.env.GOOGLE_CLASS_PREFIX;
    }
  });
});
