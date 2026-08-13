/**
 * The design panel, actually RUN.
 *
 * Every other test of this code compiles it or greps it. These execute it,
 * because the bugs that reached an owner were about sequence: an image that had
 * not decoded when the preview painted, and a card object that was never told an
 * upload had happened. Both survived a green suite twice.
 *
 * The scenario each test reproduces is the real one — the owner dashboard builds
 * this panel from a card object it fetched ONCE at page load and then reuses on
 * every tab switch (src/pages.ts, cardsPanel → draw). So "mount, act, mount
 * again from the same object" is not a contrived case; it is what happens when
 * somebody uploads a stamp and then looks at their Customers list.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { DESIGN_PANEL_JS, MODAL_JS, PALETTE_JS, SEG_JS } from "../src/pages.js";
import { makeHarness, type FakeEl } from "./domHarness.js";

/** A card as the designer receives it, mid-life: colours set, nothing uploaded. */
function card(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "default",
    name: "Kopi Corner",
    shopName: "Kopi Corner",
    reward: "Free coffee",
    stampsTarget: 10,
    stampsStart: 2,
    averageSpend: 0,
    currency: "RM",
    bg: "#3b2016", fg: "#fffaf0", label: "#d6b278", accent: "#d6b278", bandColor: "#5a3426",
    bandTexture: "flat",
    stampStyle: "",
    logoHasName: false,
    logoVersion: 0,
    bannerVersion: 0,
    markVersion: 0,
    stampIconVersion: 0,
    stampsVersion: 1,
    targetsInUse: [10],
    winbackMessage: "",
    signupMessage: "",
    ...overrides,
  };
}

let build: (c: Record<string, unknown>, h: ReturnType<typeof makeHarness>) => FakeEl;

beforeAll(() => {
  // The page inlines these three in this order; so do we.
  // The same four the pages inline, in the same order — the panel calls
  // moveThumb from SEG_JS for its surface switch.
  const src = `${PALETTE_JS}\n${MODAL_JS}\n${SEG_JS}\n${DESIGN_PANEL_JS}\nreturn designPanel;`;
  build = (c, h) => {
    const names = Object.keys(h.globals);
    const make = new Function(...names, src)(...names.map((n) => h.globals[n])) as (
      c: unknown,
      env: unknown,
    ) => FakeEl;
    return make(c, {
      api: async (path: string, opts: { method?: string; body?: string } = {}) => {
        const res = await (h.globals.fetch as (u: string, i: unknown) => Promise<{ json: () => Promise<unknown> }>)(
          "/api" + path,
          opts,
        );
        return { status: 200, body: await res.json() };
      },
      toast: () => {},
      modal: async () => true,
      info: () => "",
      path: (suffix = "") => "/card/default" + suffix,
      artUrl: (kind: string, v: number) => "/c/default/art/" + kind + ".png" + (v ? "?v=" + v : ""),
      customersPath: "/customers?cardId=default",
      designOpen: true,
      showDetails: true,
      rulesSaveLabel: "Save rules",
      onRulesSaved: () => {},
    });
  };
});

describe("the design panel, mounted", () => {
  it("renders its controls", async () => {
    const h = makeHarness();
    const div = build(card(), h);
    await h.settle();
    expect(div.querySelector("[data-stampimg]")).not.toBeNull();
    expect(div.querySelector("[data-emoji]")).not.toBeNull();
    expect(div.querySelector("[data-pv]")).not.toBeNull();
  });

  /**
   * Defect A. The mount paints synchronously, microseconds after handing the
   * stored stamp image a src, so it has not decoded and the grid falls through
   * to plain circles. Nothing repainted afterwards, so an owner who opened the
   * designer and simply LOOKED at it saw dots over a shape that was safe in the
   * database — and concluded the upload had been lost.
   */
  it("repaints the grid once the stored stamp has decoded", async () => {
    const h = makeHarness();
    build(card({ stampStyle: "custom", stampIconVersion: 1700000000000 }), h);

    // It asks for the stored shape...
    expect(h.images.some((im) => im.src.includes("stamp-icon"))).toBe(true);
    // ...and at this instant it has not decoded, so the first paint is circles.
    // This is the state the panel used to be stuck in forever.
    expect(h.drawn().some((d) => d.op === "drawImage")).toBe(false);

    await h.settle();

    // After the decode it has repainted using the shape: drawImage, not arc.
    expect(h.drawn().some((d) => d.op === "drawImage")).toBe(true);
  });

  /**
   * Defect B, and the one that actually destroyed data. After a successful
   * upload the panel never wrote the new version back onto the card object it
   * was built from — so the dashboard's cached copy still said "no stamp", and
   * the next save posted a full set of plain-dot strips over the stored grid
   * and set stamp_style back to "dot".
   */
  it("tells the card object about an upload, so a re-mount still has the stamp", async () => {
    const h = makeHarness();
    const c = card();
    const div = build(c, h);
    await h.settle();

    // Simulate choosing a file: the panel reads input.files[0] through an Image.
    const input = div.querySelector("[data-stampimg]")!;
    input.files = [{ name: "stamp.png" }];
    await input.onchange?.();
    await h.settle();

    expect(h.requests.some((r) => r.url.includes("/stamp-icon") && r.method === "POST")).toBe(true);
    // The two fields a re-mount reads. Either one left stale loses the upload.
    expect(c.stampIconVersion).toBeTruthy();
    expect(c.stampStyle).toBe("custom");

    // Re-mount from the SAME object, exactly as a tab switch does.
    const again = makeHarness();
    build(c, again);
    await again.settle();
    expect(again.images.some((im) => im.src.includes("stamp-icon"))).toBe(true);
    expect(again.drawn().some((x) => x.op === "drawImage")).toBe(true);
  });

  /**
   * The inverse: a card with no stamp must not claim to have one, and must not
   * start posting strips that say it does.
   */
  it("leaves a card with no uploaded stamp on dots", async () => {
    const h = makeHarness({ imageSize: 0 }); // every decode fails, as a 404 would
    const c = card();
    const div = build(c, h);
    await h.settle();
    expect(c.stampIconVersion).toBeFalsy();
    expect(div.querySelector("[data-stampnow]")?.style.display).not.toBe("");
  });

  /**
   * Three surfaces, one switch. The tab moves the editor AND the preview
   * together, because they answer one question: the reason to look at the
   * Android card is that you are about to change something only Android sees.
   */
  describe("the surface switch", () => {
    it("opens on the iPhone card, with the other two out of the way", async () => {
      const h = makeHarness();
      const div = build(card(), h);
      await h.settle();
      expect(div.querySelector('[data-surface="apple"]')!.hidden).toBe(false);
      expect(div.querySelector('[data-surface="google"]')!.hidden).toBe(true);
      expect(div.querySelector('[data-surface="signup"]')!.hidden).toBe(true);
      expect(div.querySelector('[data-pane="apple"]')!.hidden).toBe(false);
      expect(div.querySelector('[data-pane="google"]')!.hidden).toBe(true);
    });

    it("moves the editor and the preview together", async () => {
      const h = makeHarness();
      const div = build(card(), h);
      await h.settle();
      const tab = (name: string) =>
        div.querySelectorAll("[data-surfaces] button").find((b) => b.dataset.surface === name)!;

      tab("google").onclick!();
      expect(div.querySelector('[data-surface="google"]')!.hidden).toBe(false);
      expect(div.querySelector('[data-pane="google"]')!.hidden).toBe(false);
      // ...and the one you are no longer editing is not still on screen.
      expect(div.querySelector('[data-surface="apple"]')!.hidden).toBe(true);
      expect(div.querySelector('[data-pane="apple"]')!.hidden).toBe(true);

      tab("signup").onclick!();
      expect(div.querySelector('[data-surface="signup"]')!.hidden).toBe(false);
      expect(div.querySelector('[data-surface="google"]')!.hidden).toBe(true);
    });

    /**
     * The five colour pickers are the single source of truth every function
     * reads through f(). Parked inside a pane, a tab switch would hide them and
     * the next render would read an element that is not there.
     */
    it("keeps the colour pickers and the rules inputs out of the panes", async () => {
      const h = makeHarness();
      const div = build(card(), h);
      await h.settle();
      for (const key of ["bg", "fg", "label", "accent", "bandColor", "stampsTarget", "reward"]) {
        const el = div.querySelector('[data-f="' + key + '"]')!;
        expect(el, key).not.toBeUndefined();
        // No ancestor may be a tab pane.
        let node = el.parent;
        let inPane = false;
        while (node) { if ("pane" in node.dataset) inPane = true; node = node.parent; }
        expect(inPane, key + " is inside a tab pane").toBe(false);
      }
    });

    it("draws all three previews from the same inputs", async () => {
      const h = makeHarness();
      const div = build(card({ shopName: "Kopi Corner", reward: "Free coffee" }), h);
      await h.settle();
      // Android is text dots and a balance — never the rendered grid, which it
      // is never sent.
      expect(div.querySelector("[data-pvg-bal]")!.textContent).toBe("2/10");
      expect(div.querySelector("[data-pvg-dots]")!.textContent).toBe("●●○○○○○○○○");
      expect(div.querySelector("[data-pvg-issuer]")!.textContent).toBe("Kopi Corner");
      // The poster headline falls back to the generated line, as posterPage does.
      expect(div.querySelector("[data-pvp-offer]")!.textContent)
        .toBe("Collect 10 stamps, get a free coffee.");
    });

    // The frame is printed on white paper, so a near-white accent prints as no
    // frame at all — the same fallback posterPage makes server-side.
    it("keeps the poster's QR frame visible when the accent is nearly white", async () => {
      const h = makeHarness();
      const div = build(card({ accent: "#fcfcfa" }), h);
      await h.settle();
      expect(div.querySelector("[data-pvp-qr]")!.style.borderColor).toBe("#3b2016");
    });
  });

  /** The state readout that was missing entirely — the grid was the only signal. */
  it("says on screen when a stored shape is in use", async () => {
    const h = makeHarness();
    const div = build(card({ stampStyle: "custom", stampIconVersion: 1700000000000 }), h);
    await h.settle();
    const row = div.querySelector("[data-stampnow]");
    expect(row).not.toBeNull();
    expect(row!.style.display).toBe("");
  });
});
