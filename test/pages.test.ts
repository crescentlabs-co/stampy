/**
 * The pages are template strings and there is no build step, so a typo in a
 * page's inline <script> would ship silently and break that screen in the
 * browser with nothing failing here. These tests compile every inline script
 * (compile only — nothing runs, so no DOM is needed) and check the handful of
 * structural promises the server relies on.
 */
import { describe, expect, it } from "vitest";
import {
  adminPage,
  dashboardPage,
  landingPage,
  marketingPage,
  PALETTE_JS,
  resetPage,
  staffPage,
} from "../src/pages.js";

/** Every <script>…</script> body in a page (skipping src-only tags). */
function inlineScripts(html: string): string[] {
  const out: string[] = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) if (m[1]!.trim()) out.push(m[1]!);
  return out;
}

const pages: [string, string][] = [
  ["marketing", marketingPage()],
  ["staff (signed out)", staffPage(false)],
  ["staff (signed in)", staffPage(true)],
  ["dashboard (email on)", dashboardPage(true, "hello@stampy.test")],
  ["dashboard (email off)", dashboardPage(false, "hello@stampy.test")],
  ["dashboard (email off, no contact)", dashboardPage(false, "")],
  ["admin", adminPage()],
  ["reset", resetPage()],
  [
    "landing",
    landingPage(
      { name: "Kopi Corner", reward: "Free coffee", stamps_target: 10 } as never,
      true,
      true,
      "default",
    ),
  ],
];

describe("inline page scripts parse", () => {
  for (const [name, html] of pages) {
    it(`${name} page has syntactically valid inline JS`, () => {
      const scripts = inlineScripts(html);
      // Guard the guard: if the extraction ever stops matching, this test would
      // otherwise pass by checking nothing.
      expect(scripts.length).toBeGreaterThan(0);
      for (const src of scripts) {
        // Function() compiles the body without executing it — a syntax error throws.
        expect(() => new Function(src), src.slice(0, 120)).not.toThrow();
      }
    });
  }
});

describe("staff page is a gate, not a hidden panel", () => {
  // A leaked /staff link must not hand the stamper to a device that hasn't typed
  // the PIN — including its JavaScript, which would reveal the API shape.
  it("sends no stamper code to a signed-out device", () => {
    const anon = staffPage(false);
    expect(anon).toContain("Staff login");
    for (const marker of ["Scan card", "/stamp-by-code", "startScanner", "jsqr.js"]) {
      expect(anon).not.toContain(marker);
    }
  });

  it("sends the stamper and its camera fallback once signed in", () => {
    const signedIn = staffPage(true);
    expect(signedIn).toContain("Scan card");
    expect(signedIn).toContain("jsqr.js");
    expect(signedIn).not.toContain("Staff login");
  });

  it("never keeps a credential in browser storage", () => {
    for (const html of [staffPage(false), staffPage(true)]) {
      expect(html).not.toContain("localStorage");
      expect(html).not.toContain("x-staff-pin");
    }
  });

  // Browsers let a user suppress further dialogs after a few in a row. A counter
  // hits that in one shift, and from then on confirm() returns false without
  // asking — "Give reward & restart" would silently do nothing until a reload.
  // The confirmation has to live in the button, not in a dialog.
  it("gates destructive actions without confirm()", () => {
    const signedIn = staffPage(true);
    expect(signedIn).not.toContain("confirm(");
    expect(signedIn).toContain("Confirm — give reward?");
    expect(signedIn).toContain("Confirm — undo?");
  });

  // A card at its target is what the customer is standing there waiting for, so
  // it gets its own always-visible section rather than a place in a list of 20.
  it("surfaces reward-ready cards above the searchable list", () => {
    const signedIn = staffPage(true);
    expect(signedIn).toContain("Ready to redeem");
    expect(signedIn.indexOf("readywrap")).toBeLessThan(signedIn.indexOf('id="find"'));
  });
});

// Promising a reset link with no email service configured left owners waiting
// for mail that never came. The page must only make the promise it can keep.
describe("forgot-password offer matches what the deployment can do", () => {
  it("offers to send a reset link when email is configured", () => {
    const html = dashboardPage(true, "hello@stampy.test");
    expect(html).toContain("Send reset link");
    expect(html).not.toContain("aren’t set up yet");
  });

  it("points at a human when email is not configured", () => {
    const html = dashboardPage(false, "hello@stampy.test");
    expect(html).toContain("aren’t set up yet");
    expect(html).toContain("mailto:hello@stampy.test");
    expect(html).not.toContain("Send reset link");
  });

  it("still explains what to do when no contact address is set", () => {
    const html = dashboardPage(false, "");
    expect(html).toContain("message whoever set up your Stampy account");
    expect(html).not.toContain("mailto:");
  });

  // The address is an env var interpolated into an inline script, so a stray
  // backtick or ${ would break every screen on the page.
  it("strips anything unsafe from the contact address", () => {
    const html = dashboardPage(false, 'a@b.com`;alert(1);//${x}');
    expect(html).not.toContain("alert(1)");
    expect(html).toContain("mailto:a@b.com");
  });

  it("keeps the reset flow enumeration-safe when it is offered", () => {
    // Still no hint about whether the address exists — only that mail was sent.
    expect(dashboardPage(true, "")).toContain("If that email has an account");
  });
});

describe("dashboard information architecture", () => {
  const html = dashboardPage(true, "");

  it("has one tab per job", () => {
    for (const tab of ["customers", "card", "account"]) {
      expect(html).toContain(`data-tab="${tab}"`);
    }
    expect(html).not.toContain('data-tab="share"');
  });

  // Home was folded into Customers: with one card per merchant its headline row
  // was too thin to be a page, and it left the numbers on one tab and the people
  // they described on another.
  it("has no separate Home tab", () => {
    expect(html).not.toContain('data-tab="home"');
    expect(html).toContain(">Customers<");
  });

  // The Access tab existed only because the PIN hung off each café row, giving
  // an owner with two cards two PINs and two stamper links for one counter.
  it("has no Access tab — one PIN in Settings, links under the card", () => {
    expect(html).not.toContain('data-tab="access"');
    expect(html).toContain(">Settings<");
    expect(html).toContain("/staff-pin");
    expect(html).toContain("Share this card");
  });

  it("keeps the staff PIN out of the card designer", () => {
    expect(html).not.toContain('data-f="staffPin"');
  });

  // The designer used to guess at the brand with six "verticals" and twelve
  // colour themes. It now reads the colours out of the owner's own logo.
  it("has no themes or vertical templates left to guess with", () => {
    expect(html).not.toContain("data-presets");
    expect(html).not.toContain("data-vtpl");
    expect(html).toContain("Use these colours");
  });

  // Colours come from the logo they are uploading anyway — a second "brand
  // photo" upload was one more thing to explain for the same result.
  it("takes its palette from the logo, with no second image to upload", () => {
    expect(html).not.toContain("data-brandpic");
    expect(html).toContain("readPalette(url)");
  });

  // Matching a shade by hand in a colour picker is the fiddliest thing on the
  // page, and never what the owner wants: they want a colour already in play,
  // just somewhere else.
  it("lets any colour be swapped into any role", () => {
    expect(html).toContain("data-roles");
    expect(html).toContain("activeRole");
    expect(html).toContain("NEUTRALS");
  });

  // The band is drawn from the picker, not from the stored PNG — otherwise
  // dragging the colour changes nothing until it has been round-tripped.
  it("paints the band from the live picker value", () => {
    expect(html).toContain("paintBand(x, bandTexture");
    expect(html).not.toContain("bannerReady && bannerImg.naturalWidth");
  });

  // Padding a square logo into a wide frame made the wallets shrink the frame,
  // and the mark with it.
  it("keeps an uploaded logo's own shape", () => {
    expect(html).toContain('fit === "keep"');
    expect(html).toContain('}, "keep");');
  });

  it("builds the band from a colour and a texture, not an uploaded photo", () => {
    expect(html).toContain('data-f="bandColor"');
    expect(html).toContain("data-bandtex");
    expect(html).not.toContain("data-banner]"); // the photo upload input
    expect(html).not.toContain("rmbanner");
  });

  it("takes any emoji as the stamp", () => {
    expect(html).toContain("data-emoji");
    expect(html).toContain("firstGrapheme");
  });

  // A PIN is only ever stored hashed, so it can never be read back out — the
  // one place it appears is the response to setting it.
  it("never asks for a PIN per card", () => {
    expect(html).not.toContain("rotate-pin");
    expect(html).not.toContain("Staff PIN: \" + r.staffPin");
  });
});

/**
 * The colour maths is shipped to the browser as a source string, so evaluating
 * that same string here tests the code the dashboard actually runs rather than
 * a second copy of it.
 */
describe("palette maths", () => {
  const P = new Function(
    PALETTE_JS +
      "; return { contrastRatio, pickTextColor, firstGrapheme, paletteFrom, relLuminance, separate };",
  )() as {
    contrastRatio: (a: string, b: string) => number;
    pickTextColor: (bg: string) => string;
    firstGrapheme: (s: string) => string;
    paletteFrom: (d: number[]) => { bg: string; band: string; accent: string; label: string; fg: string } | null;
    relLuminance: (hex: string) => number;
    separate: (hex: string, from: string, min: number) => string;
  };

  /** A flat RGBA array, `n` pixels of each colour given. */
  const pixels = (...runs: [string, number][]) => {
    const out: number[] = [];
    for (const [hex, n] of runs) {
      const h = hex.replace("#", "");
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
      for (let k = 0; k < n; k++) out.push(r!, g!, b!, 255);
    }
    return out;
  };

  it("computes WCAG contrast at the known extremes", () => {
    expect(P.contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(P.contrastRatio("#3b2016", "#3b2016")).toBeCloseTo(1, 5);
  });

  // The whole reason text is computed rather than sampled: a logo can easily be
  // two dark colours, and "brand-coloured" text on a dark card is unreadable at
  // arm's length in a shop.
  it("always picks readable text, whatever the card colour", () => {
    for (const bg of ["#3b2016", "#ffffff", "#000000", "#7f7f7f", "#c0392b", "#f1c40f", "#123047"]) {
      const fg = P.pickTextColor(bg);
      expect(P.contrastRatio(fg, bg), `text on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("pulls a brand palette out of pixels, and keeps every part legible", () => {
    // A logo that is mostly deep green with a gold mark on it.
    const pal = P.paletteFrom(pixels(["#14402c", 900], ["#d4af37", 120], ["#8a6f2a", 40]))!;
    expect(pal).not.toBeNull();
    expect(P.contrastRatio(pal.fg, pal.bg)).toBeGreaterThanOrEqual(4.5);
    // Stamps are drawn ON the band, so that is the pair that has to separate.
    expect(P.contrastRatio(pal.accent, pal.band)).toBeGreaterThanOrEqual(2);
    expect(P.contrastRatio(pal.band, pal.bg)).toBeGreaterThan(1.2);
  });

  it("still returns something usable from a one-colour logo", () => {
    const pal = P.paletteFrom(pixels(["#c0392b", 500]))!;
    expect(pal).not.toBeNull();
    expect(P.contrastRatio(pal.fg, pal.bg)).toBeGreaterThanOrEqual(4.5);
    expect(pal.band).not.toBe(pal.bg);
  });

  it("darkens a pale logo rather than putting text on near-white", () => {
    const pal = P.paletteFrom(pixels(["#f7f3e8", 400], ["#e8d9a0", 100]))!;
    expect(P.relLuminance(pal.bg)).toBeLessThan(0.5);
    expect(P.contrastRatio(pal.fg, pal.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("gives up rather than inventing a palette from a blank image", () => {
    expect(P.paletteFrom(pixels(["#ffffff", 200]))).toBeNull();
  });

  // Slicing by character would leave half a glyph: ❤️ is two code points and
  // 🧑‍🍳 is five, joined by zero-width joiners.
  it("takes one whole emoji, not one code unit", () => {
    expect(P.firstGrapheme("☕")).toBe("☕");
    expect(P.firstGrapheme("❤️")).toBe("❤️");
    expect(P.firstGrapheme("🧑‍🍳")).toBe("🧑‍🍳");
    expect(P.firstGrapheme("🍩🍪🍫")).toBe("🍩");
    expect(P.firstGrapheme("  ⭐  ")).toBe("⭐");
    expect(P.firstGrapheme("")).toBe("");
  });
});
