import { describe, expect, it } from "vitest";

// passArt is pure and cert-free on purpose: buildPkpass throws
// NotConfiguredError without Apple certificates, so the slot mapping — the part
// that decides what a customer actually sees — would otherwise be untestable.
const { passArt } = await import("../src/passBuilder.js");

const logo = Buffer.from("fake-logo-png");
const strip = Buffer.from("fake-strip-png");

describe("passArt", () => {
  it("always supplies the three icon slots", () => {
    // icon.png is REQUIRED by PassKit — a pass without one is rejected outright.
    const art = passArt();
    for (const slot of ["icon.png", "icon@2x.png", "icon@3x.png"]) {
      expect(art[slot], `${slot} missing`).toBeInstanceOf(Buffer);
      expect(art[slot]!.length).toBeGreaterThan(0);
    }
  });

  it("omits the logo entirely when the merchant hasn't uploaded one", () => {
    // Wallet then renders logoText (the shop name) on its own. The alternative
    // was shipping a placeholder that had another café's name drawn into it.
    const art = passArt();
    expect(art["logo.png"]).toBeUndefined();
    expect(art["logo@2x.png"]).toBeUndefined();
    expect(art["logo@3x.png"]).toBeUndefined();
  });

  it("uses an uploaded logo for the logo slots only", () => {
    const art = passArt(logo);
    expect(art["logo.png"]).toBe(logo);
    expect(art["logo@2x.png"]).toBe(logo);
    expect(art["logo@3x.png"]).toBe(logo);
  });

  it("never lets an uploaded logo overwrite the icon", () => {
    // It used to. A wide wordmark then became the lock-screen notification
    // icon, squashed into a square.
    const bare = passArt();
    const withLogo = passArt(logo);
    for (const slot of ["icon.png", "icon@2x.png", "icon@3x.png"]) {
      expect(withLogo[slot]).toEqual(bare[slot]);
      expect(withLogo[slot]).not.toBe(logo);
    }
  });

  it("fans one strip buffer across all three strip slots", () => {
    const art = passArt(null, strip);
    expect(art["strip.png"]).toBe(strip);
    expect(art["strip@2x.png"]).toBe(strip);
    expect(art["strip@3x.png"]).toBe(strip);
  });

  it("omits the strip slots when there is no strip", () => {
    const art = passArt(logo, null);
    expect(art["strip.png"]).toBeUndefined();
    expect(art["strip@2x.png"]).toBeUndefined();
    expect(art["strip@3x.png"]).toBeUndefined();
  });

  it("does not leak state between calls", () => {
    // The icon buffers are cached and shared; a caller mutating the returned
    // map must not poison the next pass built.
    const first = passArt(logo, strip);
    const second = passArt();
    expect(second["logo.png"]).toBeUndefined();
    expect(second["strip.png"]).toBeUndefined();
    expect(first["logo.png"]).toBe(logo);
  });
});
