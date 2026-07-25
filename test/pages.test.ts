/**
 * The pages are template strings and there is no build step, so a typo in a
 * page's inline <script> would ship silently and break that screen in the
 * browser with nothing failing here. These tests compile every inline script
 * (compile only — nothing runs, so no DOM is needed) and check the handful of
 * structural promises the server relies on.
 */
import { describe, expect, it } from "vitest";
import { adminPage, dashboardPage, landingPage, marketingPage, resetPage, staffPage } from "../src/pages.js";

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
  ["dashboard", dashboardPage()],
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
});

describe("dashboard information architecture", () => {
  const html = dashboardPage();

  it("has one tab per job", () => {
    for (const tab of ["home", "customers", "card", "access", "account"]) {
      expect(html).toContain(`data-tab="${tab}"`);
    }
    expect(html).not.toContain('data-tab="share"');
  });

  it("keeps the staff PIN out of the card designer", () => {
    expect(html).not.toContain('data-f="staffPin"');
  });
});
