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
  // `esc` is not the panel's own — both hosts define the same one line for line
  // (src/pages.ts, dashboardPage and adminPage), and the panel uses it for the
  // few fragments it builds by concatenation. Repeated verbatim here rather than
  // stubbed, because a lenient stand-in would let a real escaping bug through.
  const escJs = `const esc = (s) => String(s == null ? "" : s)
      .replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);`;
  const src = `${PALETTE_JS}\n${MODAL_JS}\n${SEG_JS}\n${escJs}\n${DESIGN_PANEL_JS}\nreturn designPanel;`;
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
      apiBase: "/dashboard/api",
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

    /**
     * The strip is the first thing inside Design, above the logo and the
     * colours. Below them it was three-quarters of the way down a scrolling
     * panel, far from the preview it drives, so it read as a setting for the
     * block beside it rather than as the frame for the whole panel.
     */
    it("puts the strip at the top of the fold, above everything shared", async () => {
      const h = makeHarness();
      const div = build(card(), h);
      await h.settle();
      const order = div.all();
      const at = (sel: string) => order.indexOf(div.querySelector(sel)!);
      expect(at("[data-surfaces]")).toBeGreaterThan(at("summary"));
      expect(at("[data-surfaces]")).toBeLessThan(at("[data-logo]"));
      expect(at("[data-surfaces]")).toBeLessThan(at("[data-roles]"));
      // And still inside the fold — outside it, it would scroll away from the
      // panes it switches.
      expect(at("[data-surfaces]")).toBeGreaterThan(at("details"));
    });

    it("moves the editor and the preview together", async () => {
      const h = makeHarness();
      const div = build(card(), h);
      await h.settle();
      const tab = (name: string) =>
        div.querySelectorAll("[data-surfaces] button").find((b) => b.dataset.tab === name)!;

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
     * The strip must still HAVE three tabs after you use it.
     *
     * The buttons carried data-surface, the same attribute that marks a preview
     * pane — and showSurface hides every pane that is not current. So picking
     * iPhone hid the Android and Sign-up buttons, and the strip collapsed to a
     * single tab sitting under "Design" that appeared to do nothing at all. The
     * grep-and-compile tests could not see it, and neither could an assertion
     * written as querySelector('[data-surface="google"]'): the preview pane
     * comes first in document order, so it answered for the button.
     */
    it("keeps all three tabs on screen through every switch", async () => {
      const h = makeHarness();
      const div = build(card(), h);
      await h.settle();
      const tabs = () => div.querySelectorAll("[data-surfaces] button");
      for (const name of ["apple", "google", "signup", "apple"]) {
        tabs().find((b) => b.dataset.tab === name)!.onclick!();
        expect(tabs().length).toBe(3);
        expect(tabs().filter((b) => b.hidden).map((b) => b.dataset.tab)).toEqual([]);
        expect(tabs().filter((b) => b.classList.contains("on")).map((b) => b.dataset.tab)).toEqual([name]);
      }
    });

    /**
     * The console re-parents the preview box into a sticky right-hand rail
     * (mountDesigner). Every lookup in the panel goes through
     * div.querySelector, so the rail has to stay INSIDE the panel — appended to
     * an aside that is itself a child of it. Hoist it any higher and the tabs
     * switch the editor while the mock beside them stays where it was, and
     * renderPreview throws on the first repaint.
     */
    it("still switches the previews once the console re-parents them into its rail", async () => {
      const h = makeHarness();
      const div = build(card(), h);
      await h.settle();
      const box = div.querySelector("[data-pvbox]")!;
      const aside = (h.globals.document as { createElement: (t: string) => FakeEl }).createElement("aside");
      div.appendChild(aside);
      box.remove();
      aside.appendChild(box);

      div.querySelectorAll("[data-surfaces] button").find((b) => b.dataset.tab === "google")!.onclick!();
      expect(box.querySelector('[data-surface="google"]')!.hidden).toBe(false);
      expect(box.querySelector('[data-surface="apple"]')!.hidden).toBe(true);
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

  /**
   * "Add a test card" — a title and three buttons, no reveal step.
   *
   * It used to be one button that, when pressed, produced three buttons. On a
   * laptop the first two of those then did nothing anybody could see: the iPhone
   * link hands the browser a .pkpass, which a desktop downloads silently and
   * cannot open. So the owner pressed twice to reach a button that appeared
   * broken.
   */
  describe("the test-card buttons", () => {
    const links = { ok: true, apple: "https://x.test/apple", google: "https://x.test/google" };

    it("offers all three at rest, with nothing to press first", async () => {
      const h = makeHarness();
      const div = build(card(), h);
      await h.settle();
      const wallets = div.querySelectorAll("[data-a=test]").map((b) => b.dataset.w);
      expect(wallets).toEqual(["apple", "google"]);
      // The sign-up page is a public page, so it is a plain link — pressing it
      // mints nothing, and it needs no round trip to become pressable.
      expect(div.querySelector('[data-a=test][data-w="apple"]')!.textContent).toBe("iPhone");
      // Nothing revealed yet, and no stale QR sitting in the markup.
      expect(div.querySelector(".testqr")).toBeNull();
    });

    it("shows a QR on a laptop instead of a link that cannot open", async () => {
      const h = makeHarness({ fetchJson: links });
      const div = build(card(), h);
      await h.settle();
      await div.querySelector('[data-a=test][data-w="google"]')!.onclick!();

      expect(h.navigated.href).toBe("");
      const qr = div.querySelector(".testqr")!;
      // Per wallet: one QR for both would send an Android phone to Apple's pass.
      expect(qr.src).toContain("wallet=google");
      expect(qr.src).toContain("/dashboard/api/card/default/test-qr.png");
      expect(div.querySelector("[data-testout]")!.hidden).toBe(false);
    });

    it("sends a phone straight to the wallet, since it can actually open it", async () => {
      const h = makeHarness({ fetchJson: links, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)" });
      const div = build(card(), h);
      await h.settle();
      await div.querySelector('[data-a=test][data-w="apple"]')!.onclick!();

      expect(h.navigated.href).toBe(links.apple);
      expect(div.querySelector(".testqr")).toBeNull();
    });
  });

  /**
   * Android crops the logo to a circle, and the mock now crops with it.
   *
   * The mock drew it `contain`, so a wide brand lockup shrank politely to fit
   * and looked correct — while the phone was cutting both ends off. This note
   * names what the owner is now looking at, and only while it is true: with no
   * logo nothing is being cropped, and with a square mark uploaded there is
   * nothing left to fix.
   */
  describe("the Android logo note", () => {
    const shown = (c: Record<string, unknown>) => {
      const h = makeHarness();
      const div = build(c, h);
      return div.querySelector("[data-marknote]")!.style.display !== "none";
    };

    it("appears while a wide logo is standing in for a square one", () => {
      expect(shown(card({ logoVersion: 5, markVersion: 0 }))).toBe(true);
    });

    it("goes away once a square logo is uploaded", () => {
      expect(shown(card({ logoVersion: 5, markVersion: 9 }))).toBe(false);
    });

    it("stays away when there is no logo at all to crop", () => {
      expect(shown(card({ logoVersion: 0, markVersion: 0 }))).toBe(false);
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
