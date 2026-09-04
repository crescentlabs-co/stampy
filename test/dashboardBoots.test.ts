/**
 * The dashboard's script, EVALUATED.
 *
 * Every other test of this file compiles it, greps it, or slices a function out
 * of it. None of them can see the failure that actually reaches an owner: a
 * const read before its declaration is a ReferenceError thrown while the script
 * is still evaluating — before boot() and its try/catch exist to run — so the
 * page stays on the word "Loading…" forever.
 *
 * It has valid syntax, so tsc and `node --check` both pass it. Every name it
 * uses IS defined, so the "references nothing undefined" test passes it too.
 * The only thing that catches it is running it.
 *
 * This has now happened twice in this file: once when a comparison spec read
 * REWARD_TYPES at build time (fixed by making it a function), and once when the
 * Create wizard's icons were declared below the array that uses them.
 */
import { describe, expect, it } from "vitest";
import { dashboardPage } from "../src/dashboardV2.js";

/** Enough of a browser to get through evaluation. Nothing here is asserted on. */
function browserStubs(): Record<string, unknown> {
  const node = (): unknown =>
    new Proxy(function () {}, {
      get: (_t, k) => {
        if (k === "children" || k === "childNodes") return [];
        if (k === "textContent" || k === "innerHTML" || k === "value" || k === "className") return "";
        if (k === Symbol.toPrimitive) return () => "";
        return node();
      },
      set: () => true,
      apply: () => node(),
    });
  const document = new Proxy({}, {
    get: (_t, k) => {
      if (k === "querySelectorAll") return () => [];
      if (k === "readyState") return "complete";
      return node();
    },
  });
  return {
    document,
    window: {
      addEventListener() {}, removeEventListener() {},
      location: { pathname: "/dashboard" },
      matchMedia: () => ({ matches: false, addEventListener() {} }),
    },
    location: { pathname: "/dashboard", origin: "https://x", href: "https://x/dashboard", search: "" },
    history: { pushState() {}, replaceState() {} },
    // Never resolves: boot() is deliberately left hanging so the test measures
    // EVALUATION only, and no screen-rendering path runs against these stubs.
    fetch: () => new Promise(() => {}),
    navigator: { userAgent: "node", clipboard: {} },
    requestAnimationFrame: () => 0,
    setTimeout: () => 0,
    setInterval: () => 0,
    clearInterval: () => {},
    Image: function () {},
    URL,
    console: { log() {}, warn() {}, error() {} },
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
  };
}

function scriptOf(html: string): string {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
  expect(scripts.length, "the dashboard should ship exactly one inline script").toBe(1);
  return scripts[0]!;
}

describe("the dashboard script", () => {
  for (const [name, opts] of [
    ["email on", { emailConfigured: true }],
    ["email off", { emailConfigured: false }],
  ] as const) {
    it(`evaluates top to bottom without throwing (${name})`, () => {
      const src = scriptOf(dashboardPage(opts as never));
      const g = browserStubs();
      expect(() => {
        new Function(...Object.keys(g), src)(...Object.values(g));
      }).not.toThrow();
    });
  }

  /**
   * The specific shape of it, named so the next person recognises it.
   *
   * A const array whose literal reads another const declared further down is
   * the trap; both times it has bitten, it looked exactly like this.
   */
  it("declares the Create wizard's icons before the array that reads them", () => {
    const src = scriptOf(dashboardPage({ emailConfigured: true } as never));
    for (const icon of ["ICON_STAMP", "ICON_POINTS", "ICON_MEMBER"]) {
      expect(src.indexOf("const " + icon), icon + " is declared after it is used")
        .toBeLessThan(src.indexOf("const REWARD_TYPES"));
    }
    // The same trap, one array further down: how a points card earns.
    for (const icon of ["ICON_VISIT", "ICON_SPEND", "ICON_MANUAL"]) {
      expect(src.indexOf("const " + icon), icon + " is declared after it is used")
        .toBeLessThan(src.indexOf("const EARN_MODES"));
    }
  });
});
