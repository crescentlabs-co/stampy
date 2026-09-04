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
import { buildLoyaltyPatch } from "../src/googleModel.js";
import { DESIGN_PANEL_JS, MODAL_JS, PALETTE_JS, POPOVER_JS, SEG_JS } from "../src/pages.js";
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
    kind: "stamp",
    benefits: "",
    milestones: [],
    pointPresets: "",
    ...overrides,
  };
}

let build: (
  c: Record<string, unknown>,
  h: ReturnType<typeof makeHarness>,
  extra?: Record<string, unknown>,
) => FakeEl;

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
  const src = `${PALETTE_JS}\n${MODAL_JS}\n${SEG_JS}\n${POPOVER_JS}\n${escJs}\n${DESIGN_PANEL_JS}\nreturn designPanel;`;
  build = (c, h, extra) => {
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
      ...(extra || {}),
    });
  };
});

/**
 * previewOnly, the flag the Manage carousel mounts this panel with.
 *
 * It matters that this is the SAME panel: it is the one thing that knows how to
 * draw an Apple or an Android pass, and it is shared verbatim with the admin
 * console so the two cannot drift. A simpler second card face built beside it
 * would be exactly that drift.
 *
 * So what has to hold is a pair: the preview survives whole, and the editor is
 * gone — no save, no uploads, nothing an owner could press by accident in a
 * strip of cards they are only swiping through.
 */
describe("the panel as a preview tile", () => {
  /**
   * The trim throws the fields away, and the artwork finishes decoding AFTER
   * it. renderPreview reads those fields, so the late repaint used to read a
   * colour input that was no longer there — one unhandled rejection per tile,
   * and that tile never repainted again.
   *
   * It never failed a test because it happens in a promise nobody awaited: the
   * assertions had already passed by the time it threw. Awaiting settle() is
   * what makes it visible, so this test has to keep doing that.
   */
  it("survives its artwork finishing after the editor is gone", async () => {
    const h = makeHarness();
    const div = build(card({ bannerVersion: 3, stampIconVersion: 2 }), h,
      { previewOnly: true, customersPath: null });
    await h.settle();
    // Still painted, and still holding the face it was built to show.
    expect(div.querySelector("[data-pv]")).not.toBeNull();
    expect(div.querySelector("[data-pv-progress]")!.textContent).toBeTruthy();
  });

  it("keeps the card faces and drops the editor", () => {
    const h = makeHarness();
    const div = build(card(), h, { previewOnly: true, customersPath: null });
    // Both faces are there, which is the whole reason to reuse this panel.
    expect(div.querySelector("[data-pv]")).not.toBeNull();
    expect(div.querySelector("[data-pvg]")).not.toBeNull();
    // ...and nothing that changes anything is.
    for (const gone of ["[data-save]", "[data-f=reward]", "[data-a=emoji]", "[data-stampimg]"]) {
      expect(div.querySelector(gone), gone + " survived into a preview tile").toBeNull();
    }
    // The test-card bar goes too — this tile has its own three actions.
    expect(div.querySelector("[data-a=test]")).toBeNull();
    // The surface tabs go, because the carousel drives the face from outside.
    // DISPLAY, not the hidden attribute: .seg sets display:flex, and an
    // element's own display beats [hidden] every time — so the strip stayed on
    // screen above every tile, three of them saying iPhone / Android / Sign-up
    // poster next to a control that already switches the face.
    const tabs = div.querySelector("[data-surfaces]") as
      { hidden?: boolean; style?: { display?: string } } | null;
    expect(tabs?.hidden).toBe(true);
    expect(tabs?.style?.display).toBe("none");
    // ...through the panel's own switcher, handed out rather than copied.
    expect(typeof (div as unknown as { setSurface?: unknown }).setSurface).toBe("function");
  });

  /** The console and the programme page pass no flag and must be untouched. */
  it("leaves the full panel alone", () => {
    const h = makeHarness();
    const div = build(card(), h);
    expect(div.querySelector("[data-stampimg]")).not.toBeNull();
    expect(div.querySelector("[data-a=test]")).not.toBeNull();
    expect((div.querySelector("[data-surfaces]") as { hidden?: boolean } | null)?.hidden).toBeFalsy();
    expect((div as unknown as { setSurface?: unknown }).setSurface).toBeUndefined();
  });

  /** Switching the face is the panel's own showSurface, not a copy. */
  it("switches every face through the panel's own switcher", () => {
    const h = makeHarness();
    const div = build(card(), h, { previewOnly: true, customersPath: null });
    (div as unknown as { setSurface: (n: string) => void }).setSurface("google");
    expect((div.querySelector("[data-pv]") as { hidden?: boolean }).hidden).toBe(true);
    expect((div.querySelector("[data-pvg]") as { hidden?: boolean }).hidden).toBe(false);
  });
});

describe("the design panel, mounted", () => {
  it("renders its controls", async () => {
    const h = makeHarness();
    const div = build(card(), h);
    await h.settle();
    expect(div.querySelector("[data-stampimg]")).not.toBeNull();
    expect(div.querySelector("[data-pv]")).not.toBeNull();
  });

  /**
   * Stamps is three buttons, and the emoji field is not one of them.
   *
   * It was an input between two buttons — four controls for one choice of
   * three — and the field read as something you had to fill in before anything
   * would work. It moved into a dialog, where a field is obviously a field.
   */
  /**
   * One list, not three buttons.
   *
   * They answered a single question — dots, a ready-made shape, or your own
   * picture — and a row of buttons made them read as three separate things you
   * could do, with the current answer written underneath in a fourth place. A
   * list says what it is set to by being set to it.
   */
  it("sets the stamp from one list, and says which is chosen", () => {
    const h = makeHarness();
    const div = build(card(), h);
    const sel = div.querySelector("[data-stamppick]")!;
    expect(sel).not.toBeNull();
    // The old three-button bar is gone.
    expect(div.querySelector("[data-a=emoji]")).toBeNull();
    expect(div.querySelector("[data-a=rmstamp]")).toBeNull();
    // The file input survives — the list opens it — but is not a visible third
    // control any more.
    expect(div.querySelector("[data-stampimg]")).not.toBeNull();
    const values = sel.children.map((o) => o.getAttribute("value"));
    expect(values).toContain("dot");
    expect(values).toContain("emoji");
    expect(values).toContain("custom");
    // Dots is what a new card is on, so that is what the list shows.
    expect(sel.children.find((o) => "selected" in o.attrs)!.getAttribute("value")).toBe("dot");
  });

  it("shows the emoji a card is already using as the chosen one", () => {
    const h = makeHarness();
    const div = build(card({ stampStyle: "\u2605" }), h);
    const sel = div.querySelector("[data-stamppick]")!;
    expect(sel.children.find((o) => "selected" in o.attrs)!.getAttribute("value")).toBe("\u2605");
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

    // STAGED, not sent: nothing an owner uploads reaches the card until Save.
    expect(h.requests.some((r) => r.url.includes("/stamp-icon") && r.method === "POST")).toBe(false);
    await div.querySelector("[data-a=save]")!.onclick!();
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
      expect(div.querySelector('[data-surface="notify"]')!.hidden).toBe(true);
    });

    /**
     * The strip belongs to the preview, not to the editor.
     *
     * It used to move the editor with it, because the editor was one section per
     * wallet — which asked a merchant to design the same logo three times. The
     * editor is Brand and Loyalty programme now, so there is nothing per-surface
     * left for a tab to switch to.
     */
    it("sits on the preview box, above the mocks and outside the editor", async () => {
      const h = makeHarness();
      const div = build(card(), h);
      await h.settle();
      const order = div.all();
      const at = (sel: string) => order.indexOf(div.querySelector(sel)!);
      const seg = div.querySelector("[data-surfaces]")!;
      let inBox = false;
      for (let n = seg.parent; n; n = n.parent) if ("pvbox" in n.dataset) inBox = true;
      expect(inBox, "the strip is inside the preview box").toBe(true);
      expect(at("[data-surfaces]")).toBeLessThan(at("[data-pv]"));
      expect(at("[data-surfaces]")).toBeLessThan(at("[data-logo]"));
    });

    /**
     * Open the menu and pick one — the same two taps a merchant makes.
     *
     * It was a strip of three tabs. Three tabs and the card under them were two
     * rows of chrome above the thing being looked at, and the dashboard already
     * spends its one filled pill on the nav.
     */
    const pickSurface = (div: FakeEl, name: string) => {
      div.querySelector("[data-surfbtn]")!.onclick!();
      const opt = div.querySelectorAll("[data-set]").find((b) => b.dataset.set === "surf:" + name)!;
      expect(opt, "no option for " + name).not.toBeUndefined();
      // The menu delegates one click handler rather than binding each option,
      // so this is the event that really reaches it.
      opt.closest(".pop")!.onclick!({ target: opt } as never);
    };

    it("switches the preview and leaves the editor alone", async () => {
      const h = makeHarness();
      const div = build(card(), h);
      await h.settle();
      // Nothing in the editor is per-surface any more, so there is nothing for
      // the switch to hide — a stray [data-pane] would mean the split crept back.
      expect(div.querySelectorAll("[data-pane]")).toEqual([]);

      pickSurface(div, "google");
      expect(div.querySelector('[data-surface="google"]')!.hidden).toBe(false);
      expect(div.querySelector('[data-surface="apple"]')!.hidden).toBe(true);
      // The editor is untouched by the switch.
      expect(div.querySelector("[data-logo]")).not.toBeNull();
      expect(div.querySelector("[data-stampimg]")).not.toBeNull();

      pickSurface(div, "notify");
      expect(div.querySelector('[data-surface="notify"]')!.hidden).toBe(false);
      expect(div.querySelector('[data-surface="google"]')!.hidden).toBe(true);
    });

    /**
     * All three stay reachable, and the button says which one you are on.
     *
     * The strip this replaced had a bug worth remembering: its buttons carried
     * data-surface, the same attribute that marks a preview pane, and switching
     * hid every pane that was not current — so picking iPhone hid the other two
     * BUTTONS and the strip collapsed to one tab that appeared to do nothing.
     * A menu built fresh on each open cannot rot that way, and the button's
     * label is now the thing that has to keep up.
     */
    /**
     * Closing is the half a dropdown gets wrong.
     *
     * Both of these are registered on the DOCUMENT, not on the menu, so neither
     * is reachable from the element under test — which is why the harness grew
     * a way to fire them. A menu that stays open over the card it is meant to
     * be switching is the bug worth holding shut.
     */
    it("closes on a tap outside, and on Escape", async () => {
      const h = makeHarness();
      const div = build(card(), h);
      await h.settle();
      const open = () => div.querySelector("[data-surfbtn]")!.onclick!();
      const options = () => div.querySelectorAll("[data-set]").length;

      open();
      expect(options()).toBe(3);
      h.fireDoc("pointerdown", { target: div.querySelector("[data-pv]") });
      expect(options(), "a tap on the card left the menu open").toBe(0);

      open();
      expect(options()).toBe(3);
      h.fireDoc("keydown", { key: "Escape", preventDefault: () => {} });
      expect(options(), "Escape left the menu open").toBe(0);
    });

    it("keeps all three reachable, and names the one showing", async () => {
      const h = makeHarness();
      const div = build(card(), h);
      await h.settle();
      const label = () => div.querySelector("[data-surfname]")!.textContent;
      expect(label()).toBe("iPhone");
      for (const [key, name] of [["google", "Android"], ["notify", "Notification"], ["apple", "iPhone"]]) {
        pickSurface(div, key!);
        expect(label(), key).toBe(name);
        // Re-opening still offers all three, whichever one is showing. The
        // button TOGGLES, so it has to be closed again before the next pass or
        // the next open would shut it instead.
        const btn = div.querySelector("[data-surfbtn]")!;
        btn.onclick!();
        expect(div.querySelectorAll("[data-set]").length, key).toBe(3);
        btn.onclick!();
        expect(div.querySelectorAll("[data-set]").length, "menu left open").toBe(0);
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

      pickSurface(div, "google");
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

    /**
     * The Android mock says what the wire says.
     *
     * Its captions were invented here — "STAMPS" beside an inline balance, with
     * the reward on a row of its own below the dots — while the card Google
     * actually renders takes its rows, their order and their headers from
     * cardTemplateOverride and textModulesData. Two people writing the same copy
     * twice is how a preview drifts, so this compares the mock against the real
     * payload rather than against a second list of strings.
     */
    describe("against the real Google payload", () => {
      const headers = (stampCount: number, target: number): Record<string, string> =>
        Object.fromEntries(
          (buildLoyaltyPatch(
            { stamp_count: stampCount, stamps_target: target, reward: "Free coffee", message: "" } as never,
            { name: "Kopi Corner" } as never,
          ).textModulesData as { id: string; header: string; body: string }[])
            .map((m) => [m.id, m.header + "|" + m.body]),
        );

      it("uses the captions and values Android is actually sent", async () => {
        const h = makeHarness();
        const div = build(card({ stampsStart: 2, stampsTarget: 10, reward: "Free coffee" }), h);
        await h.settle();
        const sent = headers(2, 10);
        // Both halves read off the DOM. Writing the caption into the assertion
        // instead is the same duplication this test exists to prevent: it passed
        // happily against a mock captioned "STAMPS" while the phone said
        // "PROGRESS".
        const pair = (lbl: string, val: string) =>
          div.querySelector(lbl)!.textContent + "|" + div.querySelector(val)!.textContent;
        expect(pair("[data-pvg-clbl]", "[data-pvg-bal]")).toBe(sent.earned);
        expect(pair("[data-pvg-rlbl]", "[data-pvg-reward]")).toBe(sent.reward);
        // The dot grid and its row are gone from BOTH, together. A template path
        // naming a module that no longer exists renders an empty row rather than
        // failing, so the mock keeping it would have been invisible on the phone.
        expect(sent.stamps).toBeUndefined();
        expect(div.querySelector("[data-pvg-dots]")).toBeNull();
      });

      /**
       * The one state the card exists for. The mock only ever drew the ordinary
       * one, so the moment a customer earns something — the copy changing to
       * REWARD READY and telling them to show it — could not be checked at all.
       */
      it("switches to the reward-ready copy at the target, as the payload does", async () => {
        const h = makeHarness();
        const div = build(card({ stampsStart: 6, stampsTarget: 6, reward: "Free coffee" }), h);
        await h.settle();
        const sent = headers(6, 6);
        expect(
          div.querySelector("[data-pvg-rlbl]")!.textContent + "|" +
            div.querySelector("[data-pvg-reward]")!.textContent,
        ).toBe(sent.reward);
        // ...and the top-right line says so too, rather than counting on.
        expect(
          div.querySelector("[data-pvg-clbl]")!.textContent + "|" +
            div.querySelector("[data-pvg-bal]")!.textContent,
        ).toBe(sent.earned);
      });

      /**
       * The mock builds this line itself — browser JS inside a template literal
       * has no module system — so the wording exists twice, and this is what
       * stops the two copies drifting apart.
       */
      it("matches the earned line at every stage of a card", async () => {
        for (const [n, t] of [[0, 10], [1, 8], [6, 8], [8, 8]] as const) {
          const h = makeHarness();
          const div = build(card({ stampsStart: n, stampsTarget: t }), h);
          await h.settle();
          expect(div.querySelector("[data-pvg-bal]")!.textContent, `${n}/${t}`)
            .toBe(headers(n, t).earned!.split("|")[1]);
        }
      });

      /**
       * Progress and reward share a row because they ARE the template's twoItems
       * row — the only row left. Get the grouping wrong and the mock describes a
       * layout Google will not produce, however right the words are.
       */
      it("pairs progress with reward on one row", () => {
        const h = makeHarness();
        const div = build(card(), h);
        const bal = div.querySelector("[data-pvg-bal]")!;
        const reward = div.querySelector("[data-pvg-reward]")!;
        expect(bal.parent!.parent).toBe(reward.parent!.parent);
      });
    });

    it("draws all three previews from the same inputs", async () => {
      const h = makeHarness();
      const div = build(card({ shopName: "Kopi Corner", reward: "Free coffee" }), h);
      await h.settle();
      // Android is two text lines — never the rendered grid, which it is never
      // sent, and no longer a row of characters pretending to be one.
      expect(div.querySelector("[data-pvg-bal]")!.textContent).toBe("2/10 earned");
      expect(div.querySelector("[data-pvg-dots]")).toBeNull();
      // The shop's name once, on the issuer line; the title says what it is.
      expect(div.querySelector("[data-pvg-issuer]")!.textContent).toBe("Kopi Corner");
      expect(div.querySelector("[data-pvg-prog]")!.textContent).toBe("Loyalty card");
      // The lock screen shows what iOS actually shows: the header field's
      // changeMessage with %@ substituted. The poster mock this replaced was a
      // drawing of a sheet the owner can simply print and hold; the banner is
      // the one surface they never otherwise see.
      expect(div.querySelector("[data-pvn-body]")!.textContent)
        .toBe("2 earned — free coffee at 10");
      expect(div.querySelector("[data-pvn-app]")!.textContent).toBe("Kopi Corner");
      // And the sentence the poster used to headline is still derived — it is
      // the placeholder under the sign-up field, which drifted once before.
      expect(div.querySelector("[data-f=signupMessage]")!.placeholder)
        .toBe("Collect 10 stamps, get a free coffee.");
    });

    /** A card at its target says so, in the words iOS will use. */
    it("shows the reward-ready banner once the card is full", async () => {
      const h = makeHarness();
      const div = build(card({ stampsStart: 10, stampsTarget: 10, reward: "Free coffee" }), h);
      await h.settle();
      expect(div.querySelector("[data-pvn-body]")!.textContent)
        .toBe("Reward ready — your free coffee is waiting 🎉");
    });

    /** Counting DOWN once past halfway, which is what the pass does. */
    it("counts down when the reward is close", async () => {
      const h = makeHarness();
      const div = build(card({ stampsStart: 8, stampsTarget: 10, reward: "Free coffee" }), h);
      await h.settle();
      expect(div.querySelector("[data-pvn-body]")!.textContent)
        .toBe("2 left — free coffee at 10");
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
      // Icon-only, so the name has to come from somewhere both a screen reader
      // and a hover can reach — a button announced as "button" is not a control.
      for (const b of div.querySelectorAll("[data-a=test]")) {
        expect(b.attrs["aria-label"], b.dataset.w).toBeTruthy();
        expect(b.attrs.title, b.dataset.w).toBe(b.attrs["aria-label"]);
      }
      // The poster is a public page, so it is a plain link — pressing it mints
      // nothing and needs no round trip to become pressable.
      const poster = div.querySelectorAll("a").find((a) => (a.attrs.href ?? "").endsWith("/poster"));
      expect(poster, "a link to the printed poster").not.toBeUndefined();
      // "Sign-up poster" — the same words the surface tab and the Shop tab use
      // for it, because it is the same sheet in all three places.
      expect(poster!.textContent).toBe("Sign-up poster");
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
   * Everything about the logo, in the Logo section.
   *
   * The upload was here, the "already includes my name" tick was inside the
   * iPhone pane — though it governs the card, the poster AND the sign-up page —
   * and the Android square was in a different tab below the colours. Three parts
   * of one decision, in three places.
   */
  describe("the Logo section", () => {
    /**
     * Three things, three rows, in the order they are decided: the logo, the
     * square version Android crops to, and whether that logo already says the
     * shop's name.
     *
     * They used to be interleaved — upload, then the tick, then a
     * differently-shaped Android block — so the tick read as a property of the
     * upload directly above it and the square one as an afterthought. Each row
     * is now the same shape: a label, then its control.
     */
    /**
     * Two boxes in ONE row, not two full-width rows.
     *
     * They asked the same question twice and buried the Android one below the
     * fold on a phone. As a pair they read as one decision, which is what they
     * are — and each wears its platform's mark, so neither needs a name.
     */
    it("puts both logos in one row, each marked with its platform", () => {
      const h = makeHarness();
      const div = build(card(), h);
      const pair = div.querySelector(".logopair")!;
      expect(pair).not.toBeNull();
      const boxes = pair.querySelectorAll(".logobox");
      expect(boxes.length).toBe(2);
      expect(boxes[0]!.querySelector("[data-logo]")).not.toBeNull();
      expect(boxes[1]!.querySelector("[data-mark]")).not.toBeNull();
      // Neither owns the other's control.
      expect(boxes[0]!.querySelector("[data-mark]")).toBeNull();
      expect(boxes[1]!.querySelector("[data-logo]")).toBeNull();
      // The mark on the frame is what says which is which.
      for (const b of boxes) expect(b.querySelector(".lbplat")).not.toBeNull();
      // The name switch is its own row, below the pair.
      expect(div.querySelector("[data-lname]")).not.toBeNull();
      expect(pair.querySelector("[data-lname]")).toBeNull();
    });

    /**
     * Removing is an X ON the picture, and only once there is one.
     *
     * It used to be a permanently-visible "Remove logo" button that was
     * disabled until there was something to remove — two controls for a thing
     * that did not exist yet.
     */
    it("hides each thumbnail until its picture exists", () => {
      const h = makeHarness();
      const bare = build(card(), h);
      for (const k of ["logo", "mark", "banner"]) {
        expect(bare.querySelector('[data-lbthumb="' + k + '"]')!.hidden, k).toBe(true);
      }
      const withArt = build(card({ logoVersion: 2, markVersion: 3, bandTexture: "image" }), makeHarness());
      for (const k of ["logo", "mark", "banner"]) {
        expect(withArt.querySelector('[data-lbthumb="' + k + '"]')!.hidden, k).toBe(false);
        expect(withArt.querySelector('[data-lbthumb="' + k + '"]')!.querySelector(".lbx"), k)
          .not.toBeNull();
      }
    });

    it("keeps the name tick beside the logo, not inside a surface", () => {
      const h = makeHarness();
      const div = build(card(), h);
      const tick = div.querySelector("[data-lname]")!;
      for (let n = tick.parent; n; n = n.parent) expect(n.dataset.pane).toBeUndefined();
      // It governs the card, the poster and the sign-up page, so it sits with
      // the logo it is about — between the upload and the colours.
      const order = div.all();
      const at = (sel: string) => order.indexOf(div.querySelector(sel)!);
      expect(at("[data-lname]")).toBeGreaterThan(at("[data-logo]"));
      expect(at("[data-lname]")).toBeLessThan(at("[data-swatches]"));
    });

    /**
     * The switch was dead for months, and this is why.
     *
     * A <label> binds to its FIRST LABELABLE DESCENDANT, and <button> is
     * labelable. With the ⓘ inside the label, the label's control was the info
     * dot — never the checkbox. The visible track paints over an opacity:0
     * input, so every click landed on the track, fell through to label
     * activation, and popped the info bubble instead of flipping the switch.
     *
     * Structural, not a click: the harness does not implement label activation,
     * so a click test here would only be testing the harness. What can be
     * asserted is the shape that caused it.
     */
    it("gives the name switch a label that can only mean the checkbox", () => {
      const h = makeHarness();
      const div = build(card(), h);
      const tick = div.querySelector("[data-lname]")!;
      // Every label around the switch resolves to it, explicitly.
      for (let n = tick.parent; n; n = n.parent) {
        if (n.tag === "label") expect(n.getAttribute("for")).toBe("lname-tg");
      }
      expect(tick.getAttribute("id")).toBe("lname-tg");
      // And no label in this row contains a button — the actual defect.
      for (const lab of div.querySelectorAll(".tgrow label")) {
        expect(lab.querySelectorAll("button").length).toBe(0);
      }
      // The row itself is no longer a label, which is what let the ⓘ capture it.
      expect(div.querySelector(".tgrow")!.tag).not.toBe("label");
    });

    /**
     * "Upload logo" sat on the button whether or not a logo was already there,
     * so a merchant looking at their own logo was invited to upload one. The
     * Android row below it had been doing this correctly all along, which is
     * exactly what made the difference visible.
     */
    it("says Replace once a logo is already there", async () => {
      const open = async (c: Record<string, unknown>) => {
        const h = makeHarness({ imageSize: { w: 480, h: 120 } });
        const div = build(c, h);
        await h.settle();
        return div;
      };
      const bare = await open(card({ logoVersion: 0 }));
      expect(bare.querySelector("[data-logobtn]")!.textContent).toBe("Upload logo");
      const withLogo = await open(card({ logoVersion: 7 }));
      expect(withLogo.querySelector("[data-logobtn]")!.textContent).toBe("Replace logo");
    });

    /**
     * The row is always here; only its warning is conditional.
     *
     * It used to appear based on the shape of the logo, so that a merchant whose
     * logo was already square was never asked for anything. That reads fine once
     * there IS a logo — and not at all on a brand-new shop, where there is none,
     * the condition cannot be true, and one of three rows the section promises
     * is simply absent. Missing is not the same as not-yet-needed, and only one
     * of those can be understood from the screen.
     *
     * So the relevance moved inside the row: the line appears only when there is
     * a wide logo being cropped, which is the one state where anything is
     * actually being lost.
     */
    describe("the Android square logo", () => {
      const mounted = async (c: Record<string, unknown>, imageSize: number | { w: number; h: number }) => {
        const h = makeHarness({ imageSize });
        const div = build(c, h);
        await h.settle();
        return div;
      };

      it("is one of the three rows whatever state the logo is in", async () => {
        for (const [c, size] of [
          [card({ logoVersion: 0 }), 64],
          [card({ logoVersion: 5 }), { w: 200, h: 200 }],
          [card({ logoVersion: 5 }), { w: 480, h: 120 }],
        ] as const) {
          const div = await mounted(c, size);
          expect(div.querySelector("[data-markbox]")!.hidden).toBe(false);
        }
      });

      it("warns only while a wide logo is being cropped", async () => {
        const wide = await mounted(card({ logoVersion: 5 }), { w: 480, h: 120 });
        expect(wide.querySelector("[data-markhint]")!.hidden).toBe(false);
        // Square logo: nothing is lost, so nothing is said.
        const square = await mounted(card({ logoVersion: 5 }), { w: 200, h: 200 });
        expect(square.querySelector("[data-markhint]")!.hidden).toBe(true);
        // No logo yet — the row is offered, but there is nothing to crop.
        const none = await mounted(card({ logoVersion: 0 }), 64);
        expect(none.querySelector("[data-markhint]")!.hidden).toBe(true);
      });

      // The buttons say Upload/Replace/Remove "logo", the same words as the row
      // above — the row's own label ("Square logo for Android") is what says
      // WHICH logo, so repeating it on the control left the two rows reading as
      // different kinds of thing when they are the same action on two files.
      it("stops warning once a square version is there to use instead", async () => {
        const div = await mounted(card({ logoVersion: 5, markVersion: 9 }), { w: 480, h: 120 });
        expect(div.querySelector("[data-markhint]")!.hidden).toBe(true);
        expect(div.querySelector("[data-markbtn]")!.textContent).toBe("Replace logo");
      });

      it("says on the button whether one is already there", async () => {
        const div = await mounted(card({ logoVersion: 5 }), { w: 480, h: 120 });
        expect(div.querySelector("[data-markbtn]")!.textContent).toBe("Upload logo");
      });

    });
  });

  /**
   * Colours are DERIVED — a logo upload sets all five — so the section rests as
   * a read-out, and changing one happens on the CARD.
   *
   * There used to be a Customize button revealing five named rows. It asked the
   * owner to name the part they meant before they could point at it, when the
   * part was on screen the whole time.
   */
  describe("tap a swatch to recolour that part", () => {
    /** Press the swatch for a role, the way a thumb would. */
    const tap = (div: FakeEl, role: string) =>
      div.querySelector('[data-swatches] [data-role="' + role + '"]')!.onclick!();

    it("rests as a read-out with no palette open", async () => {
      const h = makeHarness();
      const div = build(card(), h);
      await h.settle();
      expect(div.querySelector("[data-palette]")!.hidden).toBe(true);
      // Five BOXES, not a strip. Edge-to-edge swatches with their names on a
      // second line meant counting along to tell which was which.
      expect(div.querySelectorAll("[data-swatches] .swbox").length).toBe(5);
      // Each box carries its own colour, name and value.
      const first = div.querySelectorAll("[data-swatches] .swbox")[0]!;
      expect(first.querySelector(".swchip")).not.toBeNull();
      expect(first.querySelector(".swname")!.textContent).toBeTruthy();
      expect(first.querySelector(".swval")!.textContent).toContain("#");
      // The button and the five rows it revealed are gone entirely.
      expect(div.querySelector("[data-a=customise]")).toBeNull();
      expect(div.querySelector("[data-roles]")).toBeNull();
    });

    /**
     * The strip is the ONE way in. The preview briefly carried hit regions too,
     * which is the "chip row plus five colour squares" mistake this section has
     * already made once: two controls for one job read as two different jobs.
     */
    it("leaves the preview a preview", async () => {
      const h = makeHarness();
      const div = build(card(), h);
      await h.settle();
      expect(div.querySelector("[data-pv]")!.onclick).toBeNull();
    });

    it("opens the palette for the swatch that was tapped", async () => {
      const h = makeHarness();
      const div = build(card(), h);
      await h.settle();
      tap(div, "bandColor");
      const pal = div.querySelector("[data-palette]")!;
      expect(pal.hidden).toBe(false);
      expect(pal.querySelector(".crpal-n")!.textContent).toBe("Band");
      // The band's own picker is the one moved in, so "Custom…" edits the band.
      expect(pal.querySelector('[data-f="bandColor"]')).not.toBeNull();
      // Tapping the same swatch again closes it.
      tap(div, "bandColor");
      expect(div.querySelector("[data-palette]")!.hidden).toBe(true);
    });

    /**
     * The invariant this control could most plausibly break, and the reason the
     * old row list carried a comment about it. The open palette physically HOLDS
     * one of the five <input type="color"> elements, and every function in the
     * panel reads its colours through f("bg") and friends — so rebuilding with a
     * picker still inside would leave those reads pointing at a node nobody can
     * reach or open.
     */
    it("never loses a colour picker, whatever is opened or closed", async () => {
      const h = makeHarness();
      const div = build(card(), h);
      await h.settle();
      const keys = ["bg", "fg", "label", "accent", "bandColor"];
      const present = () => keys.every((k) => div.querySelector('[data-f="' + k + '"]') !== null);
      expect(present()).toBe(true);
      tap(div, "bandColor");
      expect(present()).toBe(true);
      // Straight from one part to another, so a picker is moved while another
      // is already out of the park.
      tap(div, "accent");
      expect(present()).toBe(true);
      expect(div.querySelector(".crpal-n")!.textContent).toBe("Stamps");
      // ...and closed on top of it.
      tap(div, "accent");
      expect(present()).toBe(true);
      expect(div.querySelector("[data-palette]")!.hidden).toBe(true);
    });
  });

  /**
   * The band behind the stamps.
   *
   * card_banners holds one of two things — the flat band we generate, or the
   * owner's uploaded artwork — and cards.band_texture is the only thing that
   * says which. Get that wrong and a colour save paints a flat rectangle over
   * somebody's upload, silently, with no undo and no copy of the file.
   */
  describe("band artwork", () => {
    it("draws the artwork behind the stamps once it has decoded", async () => {
      const h = makeHarness();
      build(card({ bandTexture: "image", bannerVersion: 1700000000000 }), h);
      // Asked for the stored band...
      expect(h.images.some((im) => im.src.includes("banner"))).toBe(true);
      // ...and at this instant it has not decoded, so nothing is composited yet.
      await h.settle();
      // ...and painted it. The stamp style here is dots, so a drawImage can
      // only have come from the band.
      expect(h.drawn().some((d) => d.op === "drawImage")).toBe(true);
    });

    it("leaves the band flat when there is no artwork", async () => {
      const h = makeHarness();
      build(card(), h);
      await h.settle();
      expect(h.images.some((im) => im.src.includes("banner"))).toBe(false);
      expect(h.drawn().some((d) => d.op === "drawImage")).toBe(false);
    });

    /**
     * The one that silently eats an upload. saveLook() regenerated the flat
     * band on EVERY save, so touching a colour picker once would have
     * overwritten the artwork.
     */
    it("does not regenerate the band over an upload when a colour is saved", async () => {
      const h = makeHarness();
      const div = build(card({ bandTexture: "image", bannerVersion: 1700000000000 }), h);
      await h.settle();
      const before = h.requests.length;
      await div.querySelector("[data-a=save]")!.onclick!();
      await h.settle();
      const posts = h.requests.slice(before)
        .filter((r) => r.method === "POST" && r.url.endsWith("/banner"));
      expect(posts.length).toBe(0);
    });

    /** ...and a flat card still regenerates it, because Google reads that PNG. */
    it("does regenerate the band when it is a flat colour", async () => {
      const h = makeHarness();
      const div = build(card(), h);
      await h.settle();
      const before = h.requests.length;
      await div.querySelector("[data-a=save]")!.onclick!();
      await h.settle();
      const posts = h.requests.slice(before)
        .filter((r) => r.method === "POST" && r.url.endsWith("/banner"));
      expect(posts.length).toBeGreaterThan(0);
    });

    /**
     * Remove has to put a flat band BACK. That PNG is Google's hero image
     * whenever a card has no stamp strips, so deleting the upload and leaving
     * the row empty would point the class at nothing.
     */
    it("puts a flat band back when the artwork is removed", async () => {
      const h = makeHarness();
      const div = build(card({ bandTexture: "image", bannerVersion: 1700000000000 }), h);
      await h.settle();
      const before = h.requests.length;
      await div.querySelector("[data-a=rmband]")!.onclick!();
      await h.settle();
      const after = h.requests.slice(before);
      expect(after.some((r) => r.method === "DELETE" && r.url.endsWith("/banner"))).toBe(true);
      expect(after.some((r) => r.method === "POST" && r.url.endsWith("/banner"))).toBe(true);
      // And the flag goes back, or the next save would skip regenerating.
      expect(after.some((r) => r.body && (r.body as { bandTexture?: string }).bandTexture === "flat")).toBe(true);
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

/**
 * Nothing an owner uploads reaches the card until they press Save.
 *
 * Uploads used to POST the instant a file was chosen, so a logo, a band or a
 * stamp shape landed on the LIVE card — and, because the art URLs are what an
 * Android wallet re-fetches, on customers' phones — while the colours beside
 * them still waited for the button. Half the panel saved itself and half did
 * not, which is how an operator designing in the admin console watched their
 * half-finished work appear in a merchant's dashboard.
 *
 * These run the panel and watch the wire.
 */
describe("nothing syncs until Save", () => {
  const posts = (h: ReturnType<typeof makeHarness>, path: string) =>
    h.requests.filter((r) => r.method === "POST" && r.url.includes(path));

  const upload = async (div: FakeEl, sel: string, h: ReturnType<typeof makeHarness>) => {
    const input = div.querySelector(sel)!;
    input.files = [{ name: "art.png" }];
    await input.onchange?.();
    await h.settle();
  };

  it("stages a logo instead of posting it", async () => {
    const h = makeHarness();
    const div = build(card(), h);
    await h.settle();
    await upload(div, "[data-logo]", h);
    expect(posts(h, "/logo").length).toBe(0);

    await div.querySelector("[data-a=save]")!.onclick!();
    await h.settle();
    expect(posts(h, "/logo").length).toBe(1);
  });

  it("stages the Android square logo too", async () => {
    const h = makeHarness();
    const div = build(card(), h);
    await h.settle();
    await upload(div, "[data-mark]", h);
    expect(posts(h, "/mark").length).toBe(0);

    await div.querySelector("[data-a=save]")!.onclick!();
    await h.settle();
    expect(posts(h, "/mark").length).toBe(1);
  });

  /**
   * The band carries a second write with it — band_texture — or the next colour
   * save regenerates a flat band straight over the upload. The two have to land
   * together, so they are staged together.
   */
  it("stages band artwork and its texture flag together", async () => {
    const h = makeHarness();
    const c = card();
    const div = build(c, h);
    await h.settle();
    const before = h.requests.length;
    await upload(div, "[data-band]", h);
    expect(h.requests.slice(before).filter((r) => r.method === "POST").length).toBe(0);

    await div.querySelector("[data-a=save]")!.onclick!();
    await h.settle();
    expect(posts(h, "/banner").length).toBeGreaterThan(0);
    expect(c.bandTexture).toBe("image");
  });

  /** The name tick changes what the card looks like, so it waits with the rest. */
  it("stages the my-logo-already-says-my-name tick", async () => {
    const h = makeHarness();
    const c = card();
    const div = build(c, h);
    await h.settle();
    const before = h.requests.length;
    const box = div.querySelector("[data-lname]")! as FakeEl & { checked: boolean };
    box.checked = true;
    await box.onchange?.();
    await h.settle();
    expect(h.requests.slice(before).filter((r) => r.method === "POST").length).toBe(0);
    expect(c.logoHasName).toBe(false);

    await div.querySelector("[data-a=save]")!.onclick!();
    await h.settle();
    expect(c.logoHasName).toBe(true);
  });

  /**
   * A card with no strips still repairs itself on mount. A repair is not an
   * edit: it commits, or a card that renders no stamps at all would stay broken
   * until its owner happened to press Save.
   */
  it("still self-heals a card that has no stamp strips, without a save", async () => {
    const h = makeHarness();
    build(card({ stampsVersion: 0 }), h);
    await h.settle();
    expect(posts(h, "/stamps").length).toBeGreaterThan(0);
  });

  /** And a card that already has them posts nothing just for being opened. */
  it("posts nothing at all when the panel is merely opened", async () => {
    const h = makeHarness();
    build(card(), h);
    await h.settle();
    expect(h.requests.filter((r) => r.method === "POST").length).toBe(0);
  });
});

/**
 * The card TYPE, actually switched.
 *
 * These matter more than the rest of this file: none of the panel's branching
 * on kind is type-checked, the three previews are redrawn from it, and getting
 * it wrong shows an owner a card no customer will ever receive. The failure
 * mode is silent — a preview that draws the wrong thing looks exactly like a
 * preview that draws the right thing.
 */
describe("switching the card type", () => {
  const kindSel = (div: FakeEl) => div.querySelector('[data-f="kind"]')!;
  const setKind = async (div: FakeEl, h: ReturnType<typeof makeHarness>, k: string) => {
    const sel = kindSel(div);
    sel.value = k;
    // The panel binds every [data-f] control with addEventListener("input"),
    // which the harness stores as oninput — the same handler a real change runs.
    sel.oninput!();
    await h.settle();
  };

  it("offers all four kinds", () => {
    const h = makeHarness();
    const div = build(card(), h);
    const values = kindSel(div).children.map((o) => o.getAttribute("value"));
    expect(values).toEqual(["stamp", "milestones", "points", "membership"]);
  });

  it("shows one set of rules at a time", async () => {
    const h = makeHarness();
    const div = build(card(), h);
    await h.settle();
    const block = (k: string) => div.querySelector('[data-rules="' + k + '"]')!;
    expect(block("stamp").hidden).toBe(false);
    expect(block("membership").hidden).toBe(true);

    await setKind(div, h, "membership");
    expect(block("stamp").hidden).toBe(true);
    expect(block("membership").hidden).toBe(false);
    expect(block("points").hidden).toBe(true);

    await setKind(div, h, "points");
    expect(block("points").hidden).toBe(false);
    expect(block("milestones").hidden).toBe(true);
  });

  // The inputs are HIDDEN, never removed: renderPreview and drawStampStrip read
  // stampsTarget to draw anything at all, so removing them leaves the designer
  // unable to render the card it is designing. Same rule the console follows.
  it("keeps the stamp inputs in the document on every kind", async () => {
    const h = makeHarness();
    const div = build(card(), h);
    for (const k of ["membership", "milestones", "points", "stamp"]) {
      await setKind(div, h, k);
      expect(div.querySelector('[data-f="stampsTarget"]'), k).not.toBeUndefined();
      expect(div.querySelector('[data-f="reward"]'), k).not.toBeUndefined();
    }
  });

  it("redraws the iPhone preview as a membership card", async () => {
    const h = makeHarness();
    const div = build(card(), h);
    await setKind(div, h, "membership");
    expect(div.querySelector("[data-pv-progress]")!.textContent).toBe("Member");
    expect(div.querySelector("[data-pv-rlbl]")!.textContent).toBe("MEMBER NO.");
    expect(div.querySelector("[data-pv-clbl]")!.textContent).toBe("MEMBER SINCE");
    // And Android says the same thing, from the same switch.
    expect(div.querySelector("[data-pvg-prog]")!.textContent).toBe("Membership");
  });

  it("redraws both previews as a points card, showing a balance", async () => {
    const h = makeHarness();
    const div = build(card({ kind: "points", milestones: [{ at: 200, reward: "Free coffee" }] }), h);
    await h.settle();
    // Previewed at half the cheapest reward: what somebody part-way there sees.
    expect(div.querySelector("[data-pv-progress]")!.textContent).toBe("100 points");
    expect(div.querySelector("[data-pv-clbl]")!.textContent).toBe("BALANCE");
    expect(div.querySelector("[data-pvg-prog]")!.textContent).toBe("Points card");
    expect(div.querySelector("[data-pvg-bal]")!.textContent).toBe("100 points");
  });

  it("counts to the next rung on a milestones card, not the top", async () => {
    const h = makeHarness();
    const div = build(card({
      kind: "milestones",
      stampsStart: 3,
      milestones: [{ at: 2, reward: "Cookie" }, { at: 5, reward: "Pastry" }, { at: 10, reward: "Coffee" }],
    }), h);
    await h.settle();
    // Three stamps in: two away from the pastry, not seven from the coffee.
    expect(div.querySelector("[data-pv-tally]")!.textContent).toBe("3/5");
    expect(div.querySelector("[data-pv-reward]")!.textContent).toBe("Pastry");
    expect(div.querySelector("[data-pv-rlbl]")!.textContent).toBe("NEXT REWARD");
  });

  it("moves the reward editor into whichever block is on screen", async () => {
    const h = makeHarness();
    const div = build(card({ kind: "milestones", milestones: [{ at: 4, reward: "Cookie" }] }), h);
    await h.settle();
    expect(div.querySelector("[data-ladder]")!.children.length).toBeGreaterThan(0);

    // A points card edits the same list from the same code, in the other block.
    await setKind(div, h, "points");
    expect(div.querySelector("[data-ladder-points]")!.children.length).toBeGreaterThan(0);
  });

  it("sends the type and the reward list when it saves", async () => {
    const h = makeHarness();
    const div = build(card({ kind: "milestones", milestones: [{ at: 4, reward: "Cookie" }] }), h);
    await h.settle();
    div.querySelector('[data-a=save]')!.onclick!();
    await h.settle();
    // One press sends TWO posts to this URL — the look first, because it
    // re-renders the band the rest of the card is composited over, then the
    // rules. The rules one is the last, and the only one carrying a kind.
    const saves = h.requests.filter(
      (r) => r.method === "POST" && String(r.url).endsWith("/card/default"),
    );
    const save = saves[saves.length - 1];
    expect(save, "the rules save request").not.toBeUndefined();
    // The harness records the parsed body, not the string it was sent as.
    const body = save!.body as { kind: string; milestones: unknown };
    expect(body.kind).toBe("milestones");
    expect(body.milestones).toEqual([{ at: 4, reward: "Cookie" }]);
  });
});
