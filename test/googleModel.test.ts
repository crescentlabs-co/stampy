import { beforeAll, describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import jwt from "jsonwebtoken";
import type { CardRow, PassRow } from "../src/db.js";

// Set the Google env BEFORE importing the modules under test (config reads env at import).
process.env.GOOGLE_ISSUER_ID = "3388000000012345678";
process.env.BASE_URL = "https://stampy.example.test";

const { buildLoyaltyClass, buildLoyaltyObject, buildLoyaltyPatch, buildSaveJwtClaims, logoUrl } =
  await import("../src/googleModel.js");
const { rgbToHex } = await import("../src/color.js");

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
    platform: "google",
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

  it("shows stamp progress as the points balance", () => {
    const obj = buildLoyaltyObject(row(), card()) as any;
    expect(obj.loyaltyPoints.balance.string).toBe("3/10");
    const stamps = obj.textModulesData.find((t: any) => t.id === "stamps");
    expect(stamps.body).toBe("●●●○○○○○○○");
  });

  it("switches to reward-ready copy when full", () => {
    const obj = buildLoyaltyObject(row({ stamp_count: 10 }), card()) as any;
    const stamps = obj.textModulesData.find((t: any) => t.id === "stamps");
    expect(stamps.header).toContain("REWARD READY");
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
    expect(cls.programName).toBe("Kopi Corner loyalty card");
    expect(JSON.stringify(cls)).not.toContain("Pastry card");
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
