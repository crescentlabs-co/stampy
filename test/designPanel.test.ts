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
    expect(div.querySelector("[data-pv]")).not.toBeNull();
  });

  /**
   * Stamps is three buttons, and the emoji field is not one of them.
   *
   * It was an input between two buttons — four controls for one choice of
   * three — and the field read as something you had to fill in before anything
   * would work. It moved into a dialog, where a field is obviously a field.
   */
  it("offers exactly three ways to set the stamp, and no field", () => {
    const h = makeHarness();
    const div = build(card(), h);
    expect(div.querySelector("[data-emoji]")).toBeNull();
    expect(div.querySelector("[data-a=emoji]")).not.toBeNull();
    expect(div.querySelector("[data-stampimg]")).not.toBeNull();
    // The way back, always present: a control that appears only once you no
    // longer need it is no control at all.
    expect(div.querySelector("[data-a=rmstamp]")!.textContent).toBe("Default");
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

    it("switches the preview and leaves the editor alone", async () => {
      const h = makeHarness();
      const div = build(card(), h);
      await h.settle();
      const tab = (name: string) =>
        div.querySelectorAll("[data-surfaces] button").find((b) => b.dataset.tab === name)!;
      // Nothing in the editor is per-surface any more, so there is nothing for a
      // tab to hide — and a stray [data-pane] would mean the split crept back.
      expect(div.querySelectorAll("[data-pane]")).toEqual([]);

      tab("google").onclick!();
      expect(div.querySelector('[data-surface="google"]')!.hidden).toBe(false);
      expect(div.querySelector('[data-surface="apple"]')!.hidden).toBe(true);
      // The editor is untouched by the switch.
      expect(div.querySelector("[data-logo]")).not.toBeNull();
      expect(div.querySelector("[data-stampimg]")).not.toBeNull();

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
        expect(pair("[data-pvg-clbl]", "[data-pvg-bal]")).toBe(sent.count);
        expect(pair("[data-pvg-rlbl]", "[data-pvg-reward]")).toBe(sent.reward);
        expect(pair("[data-pvg-slbl]", "[data-pvg-dots]")).toBe(sent.stamps);
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
        expect(div.querySelector("[data-pvg-slbl]")!.textContent).toBe(sent.stamps!.split("|")[0]);
        expect(
          div.querySelector("[data-pvg-rlbl]")!.textContent + "|" +
            div.querySelector("[data-pvg-reward]")!.textContent,
        ).toBe(sent.reward);
      });

      /**
       * Progress and reward share a row because they are the template's twoItems
       * row; the dots have their own because that row is oneItem. Get the
       * grouping wrong and the mock is describing a layout Google will not
       * produce, however right the words are.
       */
      it("pairs progress with reward, and gives the dots their own row", () => {
        const h = makeHarness();
        const div = build(card(), h);
        const bal = div.querySelector("[data-pvg-bal]")!;
        const reward = div.querySelector("[data-pvg-reward]")!;
        expect(bal.parent!.parent).toBe(reward.parent!.parent);
        const dots = div.querySelector("[data-pvg-dots]")!;
        expect(dots.parent).not.toBe(bal.parent!.parent);
      });
    });

    it("draws all three previews from the same inputs", async () => {
      const h = makeHarness();
      const div = build(card({ shopName: "Kopi Corner", reward: "Free coffee" }), h);
      await h.settle();
      // Android is text dots and a balance — never the rendered grid, which it
      // is never sent.
      expect(div.querySelector("[data-pvg-bal]")!.textContent).toBe("2/10");
      expect(div.querySelector("[data-pvg-dots]")!.textContent).toBe("⬤⬤◯◯◯◯◯◯◯◯");
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
      expect(poster!.textContent).toBe("Poster");
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
    it("lays the three logo decisions out as three rows, in order", () => {
      const h = makeHarness();
      const div = build(card(), h);
      const rows = div.querySelectorAll(".lrow");
      expect(rows.length).toBe(3);
      // Each owns exactly one of the three, and in this order.
      const owns = (row: FakeEl, sel: string) => row.querySelector(sel) !== null;
      expect(owns(rows[0]!, "[data-logo]")).toBe(true);
      expect(owns(rows[1]!, "[data-mark]")).toBe(true);
      expect(owns(rows[2]!, "[data-lname]")).toBe(true);
      // ...and none of them owns two, which is what interleaving looked like.
      expect(owns(rows[0]!, "[data-lname]")).toBe(false);
      expect(owns(rows[0]!, "[data-mark]")).toBe(false);
      // Every row is a label and its control, so they read as peers.
      for (const r of rows) expect(r.querySelector(".dlbl")).not.toBeNull();
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
      expect(at("[data-lname]")).toBeLessThan(at("[data-roles]"));
    });

    /**
     * The Android square is offered by the SHAPE of the logo, not by which tab
     * is open.
     *
     * Tab-driven, it looked like a second logo everyone has to supply. Google
     * crops programLogo to a circle: a square-ish logo comes through that
     * untouched and its owner should never be asked for anything at all, while a
     * wide lockup loses both ends and its owner should be told exactly that,
     * once, beside the logo in question.
     */
    describe("the Android square logo", () => {
      const box = async (c: Record<string, unknown>, imageSize: number | { w: number; h: number }) => {
        const h = makeHarness({ imageSize });
        const div = build(c, h);
        await h.settle();
        return div.querySelector("[data-markbox]")!;
      };

      it("is offered when the uploaded logo is wide enough to be cropped", async () => {
        const b = await box(card({ logoVersion: 5 }), { w: 480, h: 120 });
        expect(b.hidden).toBe(false);
        // The row's state is on its button, exactly as the Logo row's is — not
        // in a sentence beside it saying a third time what the label and the
        // button already say.
        expect(b.querySelector("[data-markbtn]")!.textContent).toBe("Upload square version");
      });

      it("is never mentioned when the logo is already square", async () => {
        expect((await box(card({ logoVersion: 5 }), { w: 200, h: 200 })).hidden).toBe(true);
      });

      it("stays away when there is no logo at all to crop", async () => {
        expect((await box(card({ logoVersion: 0 }), 64)).hidden).toBe(true);
      });

      /**
       * A square logo plus a square version already uploaded still has to show
       * the row — otherwise the only way back from an upload disappears with it.
       */
      it("stays reachable once one is uploaded, whatever the logo's shape", async () => {
        const b = await box(card({ logoVersion: 5, markVersion: 9 }), { w: 200, h: 200 });
        expect(b.hidden).toBe(false);
        expect(b.querySelector("[data-markbtn]")!.textContent).toBe("Replace square version");
      });

    });
  });

  /**
   * Colours are DERIVED — a logo upload sets all five — so the section rests as
   * a read-out and the editable rows are a choice.
   */
  describe("Customize colours", () => {
    const openIt = (div: FakeEl) => div.querySelector("[data-a=customise]")!.onclick!();

    it("shows the palette and hides the rows until asked", async () => {
      const h = makeHarness();
      const div = build(card(), h);
      await h.settle();
      expect(div.querySelector("[data-roles]")!.hidden).toBe(true);
      expect(div.querySelectorAll("[data-swatches] .sw").length).toBe(5);
      openIt(div);
      expect(div.querySelector("[data-roles]")!.hidden).toBe(false);
    });

    /**
     * The invariant this control could most plausibly break. The open row
     * physically HOLDS one of the five <input type="color"> elements, and every
     * function in the panel reads its colours through f("bg") and friends —
     * so closing the list with a picker still inside it would leave those reads
     * pointing at a node nobody can reach or open.
     */
    it("never loses a colour picker, opened or closed", async () => {
      const h = makeHarness();
      const div = build(card(), h);
      await h.settle();
      const keys = ["bg", "fg", "label", "accent", "bandColor"];
      const present = () => keys.every((k) => div.querySelector('[data-f="' + k + '"]') !== null);
      expect(present()).toBe(true);
      openIt(div);
      expect(present()).toBe(true);
      // Open a role, so one picker is genuinely moved out of the park...
      div.querySelectorAll("[data-roles] .crhead")[0]!.onclick!();
      expect(present()).toBe(true);
      // ...then close the whole thing on top of it.
      openIt(div);
      expect(present()).toBe(true);
      expect(div.querySelector("[data-roles]")!.hidden).toBe(true);
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
