import { beforeAll, describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import jwt from "jsonwebtoken";
import type { CafeRow, PassRow } from "../src/db.js";

// Set the Google env BEFORE importing the modules under test (config reads env at import).
process.env.GOOGLE_ISSUER_ID = "3388000000012345678";
process.env.BASE_URL = "https://stampy.example.test";

const { buildLoyaltyClass, buildLoyaltyObject, buildSaveJwtClaims, logoUrl } = await import(
  "../src/googleModel.js"
);
const { rgbToHex } = await import("../src/color.js");

function cafe(overrides: Partial<CafeRow> = {}): CafeRow {
  return {
    id: "default",
    name: "Kopi Corner",
    reward: "Free coffee",
    stamps_target: 10,
    stamps_start: 2,
    background_color: "rgb(59, 32, 22)",
    foreground_color: "rgb(255, 250, 240)",
    label_color: "rgb(214, 178, 120)",
    staff_pin: "1234",
    created_at: new Date(),
    ...overrides,
  };
}

function row(overrides: Partial<PassRow> = {}): PassRow {
  return {
    serial: "11111111-2222-3333-4444-555555555555",
    cafe_id: "default",
    platform: "google",
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
    const cls = buildLoyaltyClass(cafe()) as any;
    expect(cls.id).toBe("3388000000012345678.stampy-default");
    expect(cls.issuerName).toBe("Kopi Corner");
    expect(cls.hexBackgroundColor).toBe("#3b2016");
    expect(cls.programLogo.sourceUri.uri).toBe("https://stampy.example.test/art/logo.png");
    expect(cls.reviewStatus).toBe("UNDER_REVIEW");
  });

  it("points the logo at the café's own route, version-stamped after an upload", () => {
    expect(logoUrl(cafe())).toBe("https://stampy.example.test/art/logo.png");
    expect(logoUrl(cafe({ id: "kopi2" }))).toBe("https://stampy.example.test/c/kopi2/art/logo.png");
    expect(logoUrl(cafe({ id: "kopi2" }), 1700000000000)).toBe(
      "https://stampy.example.test/c/kopi2/art/logo.png?v=1700000000000",
    );
    const cls = buildLoyaltyClass(cafe({ id: "kopi2" }), 42) as any;
    expect(cls.programLogo.sourceUri.uri).toBe(
      "https://stampy.example.test/c/kopi2/art/logo.png?v=42",
    );
  });
});

describe("buildLoyaltyObject", () => {
  it("carries the SAME barcode content as the Apple pass (serial) so one scanner works", () => {
    const obj = buildLoyaltyObject(row(), cafe()) as any;
    expect(obj.barcode.type).toBe("QR_CODE");
    expect(obj.barcode.value).toBe(row().serial);
    expect(obj.barcode.alternateText).toBe("Code ABC234");
  });

  it("shows stamp progress as the points balance", () => {
    const obj = buildLoyaltyObject(row(), cafe()) as any;
    expect(obj.loyaltyPoints.balance.string).toBe("3/10");
    const stamps = obj.textModulesData.find((t: any) => t.id === "stamps");
    expect(stamps.body).toBe("●●●○○○○○○○");
  });

  it("switches to reward-ready copy when full", () => {
    const obj = buildLoyaltyObject(row({ stamp_count: 10 }), cafe()) as any;
    const stamps = obj.textModulesData.find((t: any) => t.id === "stamps");
    expect(stamps.header).toContain("REWARD READY");
    const reward = obj.textModulesData.find((t: any) => t.id === "reward");
    expect(reward.body).toContain("show this to staff");
  });

  it("includes the win-back message module only when a message exists", () => {
    const without = buildLoyaltyObject(row(), cafe()) as any;
    expect(without.textModulesData.find((t: any) => t.id === "message")).toBeUndefined();
    const withMsg = buildLoyaltyObject(row({ message: "We miss you!" }), cafe()) as any;
    expect(withMsg.textModulesData.find((t: any) => t.id === "message").body).toBe("We miss you!");
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
    const claims = buildSaveJwtClaims(row(), cafe(), "svc@project.iam.gserviceaccount.com");
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
});
