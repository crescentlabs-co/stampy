import { describe, expect, it } from "vitest";
import { buildPassJson, isRewardReady, stampDots } from "../src/passModel.js";
import type { PassRow } from "../src/db.js";

function row(overrides: Partial<PassRow> = {}): PassRow {
  return {
    serial: "11111111-2222-3333-4444-555555555555",
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

describe("buildPassJson", () => {
  it("includes the PassKit essentials", () => {
    const p = buildPassJson(row()) as any;
    expect(p.formatVersion).toBe(1);
    expect(p.serialNumber).toBe(row().serial);
    expect(p.authenticationToken.length).toBeGreaterThanOrEqual(16);
    expect(p.barcodes[0].message).toBe(row().serial);
    expect(p.storeCard.headerFields[0].value).toBe("3/10");
  });

  it("puts changeMessage on exactly two fields (one banner per event)", () => {
    const p = buildPassJson(row()) as any;
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

  it("switches to reward-ready copy when full", () => {
    const p = buildPassJson(row({ stamp_count: 10 })) as any;
    expect(p.storeCard.secondaryFields[0].label).toContain("REWARD READY");
    expect(p.storeCard.headerFields[0].changeMessage).toContain("Card full");
  });
});
