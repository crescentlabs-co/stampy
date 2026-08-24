/**
 * The pages are template strings and there is no build step, so a typo in a
 * page's inline <script> would ship silently and break that screen in the
 * browser with nothing failing here. These tests compile every inline script
 * (compile only — nothing runs, so no DOM is needed) and check the handful of
 * structural promises the server relies on.
 */
import { describe, expect, it } from "vitest";
import ts from "typescript";
import { CHURN_DAYS, FLAG_GUIDE } from "../src/health.js";
import {
  adminPage,
  cardPickerPage,
  claimPage,
  dashboardPage,
  HEALTH_JS,
  landingPage,
  marketingPage,
  MODAL_JS,
  notReadyPage,
  PALETTE_JS,
  posterPage,
  privacyPage,
  privacyPageBm,
  supportPage,
  resetPage,
  shopNotOpenPage,
  staffPage,
  termsPage,
} from "../src/pages.js";

/** Every <script>…</script> body in a page (skipping src-only tags). */
function inlineScripts(html: string): string[] {
  const out: string[] = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) if (m[1]!.trim()) out.push(m[1]!);
  return out;
}

/** A card as the poster sees it: colours in the DB's rgb() form. */
const POSTER_CARD = {
  id: "default",
  reward: "Free coffee",
  stamps_target: 10,
  signup_message: "",
  background_color: "rgb(59, 32, 22)",
  accent_color: "rgb(214, 178, 120)",
  label_color: "rgb(214, 178, 120)",
} as never as Parameters<typeof posterPage>[0];

const pages: [string, string][] = [
  ["marketing", marketingPage("hello@punchme.test")],
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
  // The poster is deliberately absent: it carries no inline <script> at all, so
  // there is nothing here to compile. It gets its own block below instead.
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

/*
 * Syntax is not the bug that actually shipped. The dashboard called a helper
 * named esc() that existed twice in src/pages.ts — once as server-side
 * TypeScript, once inside the ADMIN console's script — and not once in the
 * dashboard's own. That parses perfectly. In a browser it threw
 * ReferenceError mid-render, so the screen it was building (the "this account
 * has no shop" screen, and the log out button inside it) never painted, and
 * the owner was left on the server-rendered word "Loading…" with no way back
 * to the login form.
 *
 * So: resolve every name too, not just the grammar. Each script is checked as
 * its own module, because that is what a <script> tag is here — a global
 * defined by one page must NOT satisfy a reference on another, which is the
 * precise mistake being guarded against. Only TS2304 ("Cannot find name") is
 * asserted on; every other diagnostic is noise from untyped browser code.
 */

/** Globals that genuinely arrive from somewhere else at runtime. */
const EXTERNAL_GLOBALS = [
  "jsQR", // served from node_modules by a src-only <script> the extractor skips
  "BarcodeDetector", // a real browser API, absent from TS's DOM lib; the stamper
                     // feature-detects it and falls back to jsQR (iPhone Safari)
];

/** TS2304 diagnostics for one inline script, checked in isolation. */
function undefinedNames(src: string): string[] {
  const file = "/inline-script.js";
  // The trailing export makes it a module: declarations stay local to this one
  // script instead of leaking into the next page's check.
  const text = `${EXTERNAL_GLOBALS.map((g) => `declare const ${g}: any;`).join("\n")}\n${src}\nexport {};\n`;
  const options: ts.CompilerOptions = {
    allowJs: true,
    checkJs: true,
    noEmit: true,
    target: ts.ScriptTarget.ESNext,
    lib: ["lib.esnext.d.ts", "lib.dom.d.ts"],
    types: [],
  };
  const host = ts.createCompilerHost(options, true);
  const original = host.getSourceFile.bind(host);
  host.getSourceFile = (name, ...rest) =>
    name === file ? ts.createSourceFile(name, text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS) : original(name, ...rest);
  host.fileExists = (name) => (name === file ? true : ts.sys.fileExists(name));
  host.readFile = (name) => (name === file ? text : ts.sys.readFile(name));

  return ts
    .getPreEmitDiagnostics(ts.createProgram([file], options, host))
    .filter((d) => d.code === 2304 && d.file?.fileName === file)
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, " "));
}

describe("inline page scripts reference nothing undefined", () => {
  for (const [name, html] of pages) {
    it(`${name} page defines every name its JS calls`, () => {
      for (const src of inlineScripts(html)) expect(undefinedNames(src)).toEqual([]);
    });
  }
});

// The Shop tab used to link at /c/:id/qr, which serves a bare PNG. Printing
// that gives a black square on white paper with no shop name, no offer, and
// nothing saying there is no app to download — the one objection a poster has
// to answer.
describe("the printable sign-up poster", () => {
  const html = posterPage(POSTER_CARD, "Kopi Corner", "kopi-corner", 3);

  it("names the shop and the offer, not just a code", () => {
    expect(html).toContain("Kopi Corner");
    expect(html).toContain("Collect 10 stamps, get a free coffee.");
    expect(html).toContain("no app to download");
  });

  // A poster on a counter has to outlive a rename or a second card, which is
  // exactly what /j/ is for and what a card link is not.
  it("encodes the merchant join link, never the card link", () => {
    expect(html).toContain('src="/j/kopi-corner/qr"');
    expect(html).not.toContain('src="/c/default/qr"');
  });

  it("uses the card's own colours and prints them", () => {
    expect(html).toContain("#3b2016"); // the card background, on the header band
    expect(html).toContain("#d6b278"); // the accent, framing the QR
    // Browsers drop background colours when printing unless told otherwise, and
    // the brand colour IS the poster.
    expect(html).toContain("print-color-adjust: exact");
  });

  it("carries the product footer and hides its own controls on paper", () => {
    expect(html).toContain("Powered by PunchMe");
    expect(html).toContain(".noprint { display: none; }");
  });

  // Owner-supplied text, printed and served to the public.
  it("escapes a shop name and a sign-up line that contain markup", () => {
    const nasty = posterPage(
      { ...POSTER_CARD, signup_message: '<img src=x onerror=alert(1)>' },
      '<script>alert(1)</script>',
      "kopi-corner",
      0,
    );
    // Escaped, so it renders as the daft text it is rather than as a tag. The
    // title is covered too: a shop named "</title><script>…" used to close the
    // element and inject after it, on a page every customer loads.
    expect(nasty).not.toContain("<script>alert(1)</script>");
    expect(nasty).not.toContain("<img src=x");
    expect(nasty).toContain("&lt;script&gt;");
    expect(nasty).toContain("&lt;img src=x");
  });

  /**
   * The poster is printed, which is the one output nobody can nudge afterwards.
   * Each of these was a real way for it to come out wrong on paper.
   */
  describe("survives the shop it belongs to", () => {
    it("wraps a long unbroken name instead of clipping it", () => {
      // .poster is overflow:hidden, so without this the name is cut mid-word.
      const html = posterPage(POSTER_CARD, "Kopitiam@BukitBintangSS15Petaling", "k", 0);
      expect(html).toMatch(/\.phead h1 \{[^}]*overflow-wrap: anywhere/);
      expect(html).toContain("Kopitiam@BukitBintangSS15Petaling");
    });

    it("shrinks the name and the offer rather than pushing the QR off the sheet", () => {
      const html = posterPage(POSTER_CARD, "Kopi Corner", "k", 0);
      expect(html).toMatch(/\.phead h1 \{[^}]*font-size: clamp\(/);
      expect(html).toMatch(/\.poffer \{ font-size: clamp\(/);
      // And if it still runs long, it may not split across two pages.
      expect(html).toMatch(/\.poster \{ break-inside: avoid/);
    });

    // The frame is printed on white paper. A pale brand colour framed white in
    // white — the QR looked unfinished and nobody could tell why.
    it("keeps the QR frame visible when the accent is nearly white", () => {
      const pale = { ...POSTER_CARD, accent_color: "rgb(252, 252, 250)" } as typeof POSTER_CARD;
      const html = posterPage(pale, "Kopi Corner", "k", 0);
      expect(html).not.toContain("border: 6px solid #fcfcfa");
      // Falls back to the card colour, which here is the dark brown.
      expect(html).toContain("border: 6px solid #3b2016");
    });

    it("falls back to ink when the card colour is pale too", () => {
      const washed = {
        ...POSTER_CARD, accent_color: "rgb(252, 252, 250)", background_color: "rgb(255, 255, 255)",
      } as typeof POSTER_CARD;
      expect(posterPage(washed, "Kopi Corner", "k", 0)).toContain("border: 6px solid #111111");
    });

    // Same rule the wallet card follows: a lockup that already reads as the
    // name must not have the name printed beside it.
    it("prints the name once when the logo already carries it", () => {
      const withName = posterPage(POSTER_CARD, "Kopi Corner", "k", 7, true);
      expect(withName).toContain("art/logo.png");
      expect(withName).not.toContain("<h1>Kopi Corner</h1>");
      // ...but a logo-less shop still gets its name, or nothing identifies it.
      expect(posterPage(POSTER_CARD, "Kopi Corner", "k", 0, true)).toContain("<h1>Kopi Corner</h1>");
      expect(posterPage(POSTER_CARD, "Kopi Corner", "k", 7, false)).toContain("<h1>Kopi Corner</h1>");
    });
  });

  it("drops the logo slot entirely when none is uploaded", () => {
    expect(posterPage(POSTER_CARD, "Kopi Corner", "kopi-corner", 0)).not.toContain("art/logo.png");
  });

  // The poster exists to get someone to the sign-up page; a poster promising
  // one thing and a page promising another is worse than no poster.
  it("uses the same sign-up line the landing page shows", () => {
    const own = { ...POSTER_CARD, signup_message: "Ten kopis, one free." };
    expect(posterPage(own, "Kopi Corner", "kopi-corner", 0)).toContain("Ten kopis, one free.");
    expect(
      landingPage({ ...own, name: "Kopi Corner" } as never, true, true, "default"),
    ).toContain("Ten kopis, one free.");
  });

  /**
   * The sign-up page follows the same name rule as the card and the poster.
   *
   * It did not, and it is the page a customer actually meets — the QR on the
   * poster opens it — so a logo with the shop's name in it introduced the shop
   * twice, in two different typefaces, at the one moment somebody is deciding
   * whether to add the card.
   */
  describe("the sign-up page and a logo that already says the name", () => {
    const page = (logoHasName: boolean, logoVersion: number) =>
      landingPage(
        { ...POSTER_CARD, name: "Kopi Corner", logo_has_name: logoHasName } as never,
        true, true, "default", "Kopi Corner", logoVersion,
      );

    it("prints the name once when the logo carries it", () => {
      const html = page(true, 7);
      expect(html).toContain("art/logo.png?v=7");
      expect(html).not.toContain("<h1>Kopi Corner</h1>");
    });

    it("still prints it when the logo is just a symbol", () => {
      expect(page(false, 7)).toContain("<h1>Kopi Corner</h1>");
    });

    /**
     * With no logo at all there is nothing carrying the name, so hiding it
     * would leave the page anonymous — the tick is about a DUPLICATE, and
     * without an image there is nothing to duplicate.
     */
    it("keeps the name when there is no logo, whatever the tick says", () => {
      expect(page(true, 0)).toContain("<h1>Kopi Corner</h1>");
    });
  });
});

/**
 * Handing somebody their shop is not a memory test.
 *
 * The claim page used to end on "your staff PIN — write it down now", which was
 * the only moment it could ever be read: a PIN is stored as a scrypt hash and
 * nothing can reverse it. So the one screen that welcomes a new owner also
 * handed them something to lose. They pick their own under Shop instead, and
 * the dashboard says the counter is waiting on it.
 */
describe("the claim page hands over a shop, not a PIN", () => {
  const html = claimPage("tok", "Kopi Corner", null, 0);

  it("never prints a PIN, or the machinery for showing one", () => {
    expect(html).not.toContain("cl-pin");
    expect(html).not.toContain("staffPin");
    expect(html).not.toContain("write it down");
  });

  it("still creates the login, and points at the step that is left", () => {
    expect(html).toContain("/finish");
    expect(html).toContain("staff PIN");
  });
});

// A <title> is RCDATA, so a script inside it does not run — but "</title>"
// closes it and everything after lands in the head as live markup. Several
// titles carry a shop name, so the escape belongs in the shell, not at each
// call site where the next page to be added would forget it.
describe("a shop name can never break out of a page title", () => {
  const evil = "</title><script>alert(1)</script>";

  it("escapes it on the sign-up page customers load", () => {
    const html = landingPage(
      { name: evil, reward: "Free coffee", stamps_target: 10 } as never,
      true,
      true,
      "default",
    );
    expect(html).not.toContain("</title><script>");
    expect(html).toContain("&lt;/title&gt;");
  });

  it("escapes it on the printed poster", () => {
    expect(posterPage(POSTER_CARD, evil, "kopi-corner", 0)).not.toContain("</title><script>");
  });
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

  // A repeat stamp used to mean scanning the card AGAIN, which on the camera
  // path meant reopening it and lining the phone up for something staff had
  // already decided. It is a popup now — ours, built in the page, so it is not
  // the browser dialog the test above forbids and cannot be suppressed.
  it("asks about a repeat stamp in a popup rather than a second scan", () => {
    const signedIn = staffPage(true);
    expect(signedIn).toContain("Stamp it again?");
    expect(signedIn).toContain("Add another");
    expect(signedIn).toContain("force: true");
    expect(signedIn).not.toContain("forceArmed");
    expect(signedIn).not.toContain("scan or tap again");
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
    expect(html).toContain("message whoever set up your PunchMe account");
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

/**
 * The console renders the SAME designer the owners get, not a copy of it.
 *
 * The copy it used to carry had three colours, one band and ten fixed icons,
 * and every improvement to the real designer skipped it — a design built in the
 * console looked nothing like one the owner could build. These tests fail if
 * the two ever diverge again, which is the only thing keeping them together:
 * browser code inside template literals is not type-checked.
 */
describe("one designer, two pages", () => {
  const dash = dashboardPage(true, "");
  const admin = adminPage();
  /** The designer as it actually reaches the browser, from the served page. */
  const panelOf = (html: string) => {
    const i = html.indexOf("function designPanel(c, env)");
    expect(i).toBeGreaterThan(-1);
    // Up to the sentinel that only exists once, at the end of the shared block.
    const j = html.indexOf("env.onRulesSaved();", i);
    expect(j).toBeGreaterThan(i);
    return html.slice(i, j);
  };

  it("ships the identical designer to both pages", () => {
    expect(panelOf(admin)).toBe(panelOf(dash));
    expect(panelOf(dash).length).toBeGreaterThan(10_000);
  });

  it("renders exactly one stamp and band renderer per page", () => {
    for (const html of [dash, admin]) {
      expect(html.match(/function drawStampStrip/g)!.length).toBe(1);
      expect(html.match(/function paintBand/g)!.length).toBe(1);
      // Anchored to the start of a line so it counts the base rule and not the
      // descendant overrides ("  .fold .crlist { ... }") declared beside it.
      expect(html.match(/\n\s*\.crpal \{/g)!.length).toBe(1);
    }
  });

  // The designer emits class="fold", so the styling for it has to travel with
  // the panel. It used to live only in the dashboard's stylesheet, which left
  // every fold on the console as a bare <details>: no border, no tint, no
  // caret. Both pages, or neither.
  it("styles the fold it emits, on both pages", () => {
    for (const html of [dash, admin]) {
      expect(html).toMatch(/\n\s*\.fold \{/);
      expect(html).toContain(".fold[open] summary::before");
    }
  });

  // The tint does not nest (DESIGN.md rule 9). An open fold is --surface, so
  // the boxes inside it step back to --bg; when they did not, the whole panel
  // read as one grey slab with the controls dissolved into it.
  it("puts the fold's own boxes back on the page colour", () => {
    for (const html of [dash, admin]) {
      expect(html).toContain(".fold .crpal { background: var(--bg); }");
      expect(html).toMatch(/:is\(\.fold, \.grp, \.bucket, \.mdetail\) \.btn-ghost \{/);
    }
  });

  /**
   * The numbered steps became three surfaces. Steps implied an order that does
   * not exist — nobody does the logo before the colours because a number said
   * so — while the real division is which wallet, or the poster, a control
   * affects. What is SHARED must stay out of the tabs: a pane is hidden, and
   * the five colour pickers are the source of truth every render reads.
   */
  /**
   * The editor is Brand and Loyalty programme; the three surfaces are previews.
   *
   * It used to be one editor section per wallet, which asked a merchant to
   * design the same logo three times and filed the "my logo has my name in it"
   * tick under a wallet it does not belong to. A merchant has one brand and one
   * programme that happen to show up in three places — so the tabs switch what
   * you are LOOKING at, and nothing else.
   */
  it("organises the editor by brand and programme, not by wallet", () => {
    for (const html of [dash, admin]) {
      for (const name of ["apple", "google", "signup"]) {
        expect(html).toContain(`data-surface="${name}"`);
      }
      // The design controls now live behind a CLOSED fold, so the words are on
      // its summary rather than in a heading. On the console this panel is
      // already inside its own "Design their card" fold, so it adds none.
      expect(html).toContain("Customise the design");
      // The second heading is named for what is under it, so it is a ternary in
      // the source rather than a literal: the console cannot set the rules, and
      // heading a lone shop-name field "Loyalty programme" there would promise
      // something the page does not do.
      expect(html).toContain('env.showDetails ? "Loyalty programme" : "Shop"');
      // No per-surface editor sections left anywhere in the panel. (The console
      // page has data-pane of its own for its two tabs, hence the slice.)
      expect(panelOf(html)).not.toMatch(/data-pane="(apple|google|signup)"/);
      expect(html).toContain("function showSurface(name)");
      expect(html).toContain('showSurface("apple")');
      // A hidden .seg measures zero, so the thumb is seated after the pane shows.
      expect(html).toMatch(/showSurface[\s\S]{0,400}moveThumb\(surfaceSeg\)/);
      expect(html).toContain('<div class="colorpark" data-park>');
    }
  });

  // Android is sent one colour, a near-square logo and the count as TEXT — no
  // rendered grid and no custom shape, ever. A mock that drew them would be a
  // lie the owner only discovers on somebody else's phone.
  it("previews all three surfaces, and Google as Google", () => {
    for (const html of [dash, admin]) {
      expect(html).toContain("data-pvg");   // the Android card
      expect(html).toContain("data-pvp");   // the printed sheet
      expect(html).toContain("function renderGoogle");
      expect(html).toContain("function renderPoster");
      // No band and no strip on the Android mock.
      expect(html).not.toContain("data-pvg-banner");
    }
  });

  // DESIGN.md rule 1: neon marks the next action, and one thing on a screen is
  // the next action. Both save buttons were .btn-dark, so the panel marked
  // nothing at all; making both neon would break the rule the other way.
  // DESIGN.md rule 1: neon marks the next action, and exactly one thing on a
  // screen is the next action. With one save there is one candidate, on both.
  it("marks exactly one next action in the designer", () => {
    for (const html of [dash, admin]) {
      expect((panelOf(html).match(/btn-neon/g) ?? []).length).toBe(1);
    }
  });

  // Rule 9, which this panel was breaking by name: --ghost-bg on --surface is
  // one shade apart, and eight ghost buttons live inside this fold.
  it("steps the fold's ghost buttons back to the page colour", () => {
    for (const html of [dash, admin]) {
      expect(html).toMatch(/\.fold \.btn-ghost \{ background: var\(--bg\)/);
    }
  });

  it("points both copies at a real card, from either side", () => {
    expect(dash).toContain('path: (suffix) => "/card/" + card.id + suffix');
    expect(admin).toContain('path: (suffix) => "/card/" + card.id + "/design" + suffix');
  });

  /**
   * The uploaded stamp shape used to live in one browser variable and nowhere
   * else, so a reload — or any re-render — replaced it with plain circles and
   * wrote that over the owner's grid. Three things have to hold together for it
   * to survive, and each is easy to remove while the others still look right.
   */
  it("stores the stamp shape, and loads it back before drawing", () => {
    for (const html of [dash, admin]) {
      // It reaches an endpoint at all. Passing a null kind to wireUpload is what
      // made this a no-op for as long as the feature existed.
      expect(html).toContain('api(P("/stamp-icon")');
      // It is fetched again at mount...
      expect(html.match(/function loadStampIcon/g)!.length).toBe(1);
      expect(html).toContain('env.artUrl("stamp-icon", c.stampIconVersion)');
      // ...and every re-render waits for it. Without this the first save after a
      // page load bakes circles over the shape, in storage, for every count.
      expect(html).toContain("await stampIconReadyPromise");
      // Removing the shape removes the stored one too, not just the copy in memory.
      expect(html).toContain('api(P("/stamp-icon"), { method: "DELETE" })');
    }
  });

  // Uploads are cut out and trimmed in the browser so a shop can send the file
  // it actually has — a logo on a white square — rather than being told to go
  // and make a transparent one. One copy per page, like the renderers above.
  it("lifts a flat backdrop and trims the margin, once per page", () => {
    for (const html of [dash, admin]) {
      expect(html.match(/function liftBackdrop/g)!.length).toBe(1);
      expect(html.match(/function flatBackdrop/g)!.length).toBe(1);
      // It has to run before the scale, or the size cap is spent on the padding
      // instead of the artwork — which is what made an uploaded stamp look tiny.
      expect(html).toContain("const src = liftBackdrop(img);");
      expect(html).not.toContain("drawImage(img, 0, 0, dw, dh)");
    }
  });

  // Two unlabelled printables, one of them unbranded and pinned to a card id
  // that a rename strands. There is one now, and nothing may link the old one.
  it("offers one printable, and never links the retired counter sheet", () => {
    for (const html of [dash, admin]) {
      expect(html).not.toContain("/sheet");
      expect(html).not.toContain("Counter sheet");
    }
    expect(admin).toContain("Print poster");
  });

  // Deleting a shop is the only irreversible thing in the console. The typed
  // name is the gate; arm() only guards a mis-click. Invariant 8: no confirm().
  it("gates shop deletion on the typed name, with no browser dialog", () => {
    expect(admin).toContain("data-mdelete");
    expect(admin).toContain("data-delname");
    expect(admin).toContain("Tap again — this cannot be undone");
    // Comments stripped first: the prose in this console names confirm() several
    // times precisely to say it is never called (same idiom as the claim panel).
    const code = admin
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
      .replace(/<!--[\s\S]*?-->/g, "");
    for (const dialog of ["confirm(", "alert("]) expect(code).not.toContain(dialog);
    // Every refusal has to say WHY, or an operator retries the one thing that
    // will never work. There is one refusal left — a paying shop — because a
    // shop that has merely traded is now deletable on purpose: setting the same
    // onboarding flow up repeatedly issues a card every time.
    expect(admin).toContain("paid-shop");
    for (const gone of ["has-passes", "has-customers", "has-messages"]) {
      expect(admin).not.toContain(gone);
    }
    // The damage has to be on screen before the button is armed.
    expect(admin).toContain("cannot be restored");
  });

  // The same poster is being scanned either way: a customer who gets a generic
  // white page today and a branded one tomorrow cannot tell it was one shop.
  it("brands the coming-soon page and stops crushing a wide logo", () => {
    const branded = shopNotOpenPage("Kopi Corner", 7, "kopi", {
      background_color: "rgb(59, 32, 22)",
    } as never);
    expect(branded).toContain("#3b2016");
    expect(branded).toContain("lhero");
    expect(branded).toContain("/c/kopi/art/logo.png?v=7");
    // The 72x72 rounded square letterboxed the wide lockup most shops upload.
    expect(branded).not.toContain("width:72px;height:72px");
    // With no card it still renders — the route can reach it before a card does.
    expect(shopNotOpenPage("Kopi Corner")).toContain("Kopi Corner");
  });

  // Taking the plate off is only safe if something notices when it leaves the
  // mark invisible. Both entry points have to run the check: an upload, and
  // "Use these colours" — which sets a card colour sampled FROM the logo, so it
  // can land right on top of the logo's own ink.
  // The colours are taken from the logo automatically now, so the readability
  // check is the LAST step of one awaited sequence rather than a second thing
  // fired alongside it: the card colour it checks against is sampled from the
  // very logo it is checking, so running the two unordered let one overwrite
  // the other's answer.
  it("checks a stripped logo still reads, after taking its colours", () => {
    for (const html of [dash, admin]) {
      expect(html.match(/async function ensureLogoReadable/g)!.length).toBe(1);
      expect(html.match(/function artworkColor/g)!.length).toBe(1);
      expect(html).toContain("await ensureLogoReadable(dataUrl, true);");
      expect(html).toContain("void applyLogoColours(url);");
      // Nothing may fire it unawaited beside the palette read any more.
      expect(html).not.toContain("void ensureLogoReadable(url);");
      // Alpha-weighted, or the transparent margin liftBackdrop just made would
      // drag the measured ink toward nothing and the check would never fire.
      expect(html).toContain("const k = d[i + 3] / 255;");
    }
  });

  // The progress field is hard right on a wallet card. In the preview it was
  // held there by the shop name's flex:1 — so hiding the name for a logo that
  // already carries it silently un-aligned it.
  it("keeps the preview's progress on the right with no name beside it", () => {
    for (const html of [dash, admin]) {
      expect(html).toMatch(/\.pv-hdr \{[^}]*margin-left: auto/);
    }
  });

  /**
   * The console's second target — a saved design, mocked up before a shop
   * existed and pushed onto its card later — is gone. It was the whole reason
   * the section had a switcher and a second panel, and the shop is built first
   * now, so there is always a real card to design straight onto.
   */
  it("has no saved-design library left", () => {
    for (const gone of [
      'data-mode="design"', 'data-mode="card"', "Start a design", "apply-template",
      "ds-push", "ds-target", "drawDesignSection", "pushStrip", "A saved design",
    ]) {
      expect(admin).not.toContain(gone);
    }
  });

  /**
   * One button in the console, two on the dashboard. The owner's split is real
   * — their look reaches every card already in a wallet and their rules do not,
   * and those are two different sentences. The console sets no rules at all
   * (showDetails is false), so there the second button could only rename the
   * shop: two buttons for one job.
   */
  /**
   * One save, on both pages.
   *
   * There were two — Save design inside the collapsed section, Save rules
   * outside it — because the look and the rules reach different people. They
   * still do; that distinction moved into the confirmation, where it is read at
   * the moment it matters, instead of asking a merchant to sort their own change
   * into the right half of the panel before they could keep it.
   */
  it("saves the look and the rules with one button", () => {
    expect(dash).toContain('saveLabel: "Save changes"');
    expect(admin).toContain('saveLabel: "Save card"');
    for (const html of [dash, admin]) {
      const panel = panelOf(html);
      expect(panel).not.toContain("savedesign");
      expect(panel).not.toContain("saverules");
      expect(panel).not.toContain("singleSave");
      expect((panel.match(/data-a="save"/g) ?? []).length).toBe(1);
      // The look first: it re-bakes the band PNG the rest of the card is
      // composited over, so the order is not arbitrary.
      expect(panel).toMatch(/await saveLook\(\);[\s\S]{0,120}await save\(\{/);
    }
  });

  /**
   * Both halves of that one save have to name their own blast radius, because
   * the button no longer does: the look reaches every card already in a wallet,
   * the rules only reach new ones.
   */
  /**
   * The look and the rules reach completely different people, so they are two
   * labelled ROWS. As consecutive sentences in one paragraph, "reaches all 5
   * customers" and "their stamps and reward are untouched" described the same
   * five people and read as a contradiction — which is exactly how it was
   * reported.
   */
  it("says in the confirmation what each half of a save reaches", () => {
    const panel = panelOf(dash);
    expect(panel).toContain('<dl class="mdlblast">');
    expect(panel).toContain("<dt>Design</dt>");
    // It used to say the design arrives "next time their phone checks in",
    // which was true only while a design save touched no pass row. It lands in
    // seconds now, and the stale wording was reported as confusing.
    expect(panel).toContain("usually within seconds");
    expect(panel).not.toContain("next time their phone checks in");
    expect(panel).toContain("<dt>Reward<br>&amp; stamps</dt>");
    // Kept clear of the string-concatenation boundaries in the source: this
    // reads the panel's SOURCE, not what the browser ends up rendering.
    expect(panel).toContain("They keep what they were promised until their next reward");
    expect(panel).toContain("New customers get them today");
    expect(panel).toContain("does</strong> reach cards already in a wallet");
    // The count is ACTIVE_PASS_SQL, which keeps counting somebody after they
    // delete the card so churn cannot erase its own evidence. Some of them no
    // longer hold anything, so the sentence must not say they do.
    expect(panel).toContain("who have taken a card");
    expect(panel).not.toContain("who already hold a card");
  });

  /**
   * The rail is appended to the panel's OWN root before the preview moves into
   * it. Every lookup inside designPanel is div.querySelector, so a preview
   * parked outside the panel would break renderPreview in the browser — the
   * same shape as the `base` bug: silent to tsc, fatal on the page.
   */
  it("keeps the moved preview inside the panel that queries it", () => {
    const i = admin.indexOf("panel.appendChild(aside)");
    const j = admin.indexOf('aside.appendChild(panel.querySelector("[data-pvbox]"))');
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
    // ONE node, and it is the box rather than the card inside it: moving the
    // card alone left its label, the other two previews and the test links
    // behind in the left column.
    expect(admin).not.toContain('aside.appendChild(panel.querySelector(".pv"))');
    expect((admin.match(/aside\.appendChild\(/g) ?? []).length).toBe(1);
  });

  /**
   * The extraction replaced designPanel's own `base` (the card's art path) with
   * env.artUrl, and one use of it survived — on the banner-preview line, which
   * only runs for a card that HAS a banner. It threw ReferenceError and took the
   * whole designer down with it, on both pages, and nothing caught it: tsc
   * happily compiles a free identifier in a non-module script.
   *
   * So: no identifier the panel does not define may be read inside it, beyond
   * the handful it is documented to take from the page.
   */
  it("reads nothing from the page it does not declare", () => {
    // Comments are stripped ONLY for the must-not-appear half: prose may mention
    // a name the code must not use. The stripper is crude — an accept="image/*"
    // opens a block comment as far as it is concerned, and it duly swallowed the
    // save button — so the must-appear half below reads the panel as written.
    const stripped = panelOf(dash)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    for (const gone of [/\bbase\b/, /\bS\.cards\b/, /\bartBase\b/]) {
      expect(gone.test(stripped), `the panel still reads ${gone}`).toBe(false);
    }
    const panel = panelOf(dash);
    // Everything that leaves the panel goes through env. (onRulesSaved is the
    // sentinel panelOf slices at, so it sits just past the end by construction.)
    for (const via of ["env.artUrl(", "env.path(", "env.customersPath", "env.saveLabel", "env.showDetails"]) {
      expect(panel).toContain(via);
    }
  });

  it("counts the same live customers from both sides", () => {
    // Both now edit a real card with real holders, so the "this reaches N
    // customers" confirmation has a number to name on either page.
    expect(dash).toContain("customersPath: \"/customers?cardId=\"");
    expect(admin).toContain('customersPath: "/card/" + card.id + "/counts"');
  });
});

/**
 * The console is one path down the page. It used to render every fact twice —
 * once per merchant, once again in five "platform-wide" tables keyed on the
 * programme — and explain each one in a paragraph of grey text nobody read.
 */
describe("the console says things once", () => {
  const html = adminPage();

  it("has no second, programme-keyed copy of the merchant view", () => {
    expect(html).not.toContain("Platform-wide");
    expect(html).not.toContain("All programmes");
    expect(html).not.toContain("Counter audit");
    expect(html).not.toContain("Win-back</h2>");
  });

  it("moved its prose onto info icons", () => {
    expect(html).not.toContain('<p class="muted">');
    expect(html).toContain("data-info=");
  });

  /**
   * A shop's page runs in the order you would ask: is anything broken, how far
   * did they get, are they using it, are people signing up, do those people
   * come back, and is any of it worth money. Four of those are the three
   * questions this console exists for; the rest is context for them.
   */
  it("asks its questions in the order you would ask them", () => {
    const order = [
      "How far did they get?", "This shop, week by week", "Are people signing up?",
      "Do customers come back?", "Customer value",
    ];
    let at = html.indexOf("function detailHtml(m)");
    expect(at).toBeGreaterThan(-1);
    for (const q of order) {
      const i = html.indexOf(q, at);
      expect(i, `${q} is missing or out of order`).toBeGreaterThan(at);
      at = i;
    }
    // The framings that went with the six-rate retention block.
    expect(html).not.toContain("Is it worth anything?");
    expect(html).not.toContain("Still active 30/60/90");
    expect(html).not.toContain("second_visit_rate");
  });

  it("does not paint the drill-down as disabled", () => {
    // Grey-on-grey made the most detailed part of the page read as switched off.
    expect(html).not.toContain(".mdetail td { background: var(--ghost-bg)");
  });

  /**
   * The designer must be ON SCREEN, not one click away behind an empty pane.
   * The first version shipped the shared panel but rendered "Name a design on
   * the left to start one" until you typed a name — so the only design-looking
   * thing on the page was the six business-type presets underneath it, and the
   * console read as though nothing had changed at all.
   */
  it("puts the whole designer on screen", () => {
    expect(html).toContain("function designPanel(c, env)");
    expect(html).not.toContain("Name a design on the left");
  });

  /**
   * The console mounts the panel in two places, and BOTH already sit under a
   * heading that says "Design their card" — step 2 of New shop, and the summary
   * on a shop's own row. The panel titling itself again put DESIGN directly
   * under one of those, which is what a page looks like when it has not been
   * updated.
   */
  it("does not title the designer twice", () => {
    expect(html).toContain("titled: false");
    expect(html).toContain("Design their card");
  });

  /**
   * The console cannot set a card's terms, so the programme block is hidden —
   * which left the shop's name as the one field on the panel with no heading
   * over it, sitting between Colours and Save as though it were another colour.
   */
  it("still heads the shop name, even with the rules hidden", () => {
    expect(html).toContain('env.showDetails ? "Loyalty programme" : "Shop"');
    // Never display:none'd back out: that is what left it headingless.
    expect(html).not.toContain('">Loyalty programme</label>');
  });

  /**
   * Two panes, because the console does two unrelated jobs: a book you read and
   * a sequence you walk. Setting a shop up used to mean visiting four sections
   * at four heights of one page, in an order nothing on screen told you.
   */
  it("splits the book you read from the sequence you walk", () => {
    for (const p of ["overview", "merchants", "new"]) {
      expect(html).toContain('data-pane="' + p + '"');
      expect(html).toContain('id="pane-' + p + '"');
    }
    // Overview is what you land on: the console is opened to check, not to build.
    expect(html).toContain('let pane = "overview"');
  });

  it("walks New shop in the only order that works", () => {
    // The numbers are not decoration: you cannot design a card for a shop that
    // does not exist, or hand over one you have not designed.
    const order = ["Name it", "Design their card", "Hand it over"];
    let at = html.indexOf('id="pane-new"');
    expect(at).toBeGreaterThan(-1);
    for (const step of order) {
      const i = html.indexOf(step, at);
      expect(i, `${step} is missing or out of order`).toBeGreaterThan(at);
      at = i;
    }
    // All three live in the one pane; none of them is a page section any more.
    for (const h2 of ["Reset a password", "Build a shop", "Card designs"]) {
      expect(html).not.toContain("<h2>" + h2);
      expect(html).not.toContain('<h2 style="margin-top:34px">' + h2);
    }
  });

  /**
   * One claim panel, rendered by the shop's row and by step 3 of New shop.
   * They were two implementations of one thing, which is why they disagreed:
   * the row knew a link was out and the pane did not, and neither said that
   * minting again kills the link already sitting in the merchant's DM.
   */
  it("writes the claim link once and reads it in both places", () => {
    expect(html.match(/function claimPanelHtml\(m\)/g)!.length).toBe(1);
    expect(html.match(/function wireClaim\(scope, m, done\)/g)!.length).toBe(1);
    // Step 3 and the row both go through it.
    expect(html).toContain("cl.innerHTML = claimPanelHtml(building.merchant)");
    expect(html).toContain("wireClaim(scope, m)");
    // And nothing mints outside it.
    expect(html.match(/\/claim-link", \{ method: "POST" \}/g)!.length).toBe(1);
  });

  /**
   * Minting replaces the link already sent, which is invisible and lands on
   * somebody else — they find out by clicking a dead link. So it goes behind
   * the two-tap arm, never a browser dialog (invariant 8: a suppressed
   * confirm() returns false and the button silently stops working).
   */
  it("warns before it kills a link that is already out", () => {
    expect(html).toContain("Replace the link that’s out");
    expect(html).toContain('armBtn(mk, "Tap again — the sent one dies", mint)');
    expect(html).toContain("The link you sent before no longer works.");
    // Readable, so a link already sent can be found rather than replaced.
    expect(html).toContain("esc(m.claim_token");
    // And the promise the founder asked about, said out loud.
    expect(html).toContain("You can keep changing the card after you send");
    // Sliced to the claim code and stripped of comments, because the prose
    // around it names confirm() precisely to say it is never called.
    const claim = html
      .slice(html.indexOf("function claimPanelHtml"), html.indexOf("// ---- New shop"))
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    for (const dialog of ["confirm(", "alert("]) expect(claim).not.toContain(dialog);
  });

  /**
   * A claim link is only ever offered for a shop with no login. It briefly
   * appeared, folded shut, on claimed shops too — where the panel said "nobody
   * has claimed this shop" under an owner's own email address, and its one
   * button was refused by the server with already-claimed. A link that mints a
   * login cannot be handed out for a login that already exists.
   */
  it("offers a claim link only where there is nobody holding the shop", () => {
    expect(html).toContain('m.stage === "not-claimed"');
    expect(html).toContain('if (m.stage === "not-claimed") wireClaim(scope, m)');
    // Never behind a fold on a shop that has an owner.
    expect(html).not.toContain('m.stage !== "not-claimed"');
    expect(html).not.toContain("<summary>Claim link</summary>");
    // The one copy line that assumes it, rendered in the one place that holds.
    expect(html.match(/Nobody has claimed this shop/g)!.length).toBe(1);
  });

  /** The way back from a link that reached the wrong person. */
  it("can hand a claimed shop to somebody else", () => {
    expect(html).toContain("data-unclaim=");
    expect(html).toContain('armBtn(hand, "Tap again — they lose it"');
    expect(html).toContain('/unclaim", { method: "POST" }');
    // Offered only where there is an owner to take it off.
    expect(html).toMatch(/m\.has_owner[\s\S]{0,600}data-unclaim=/);
  });

  /**
   * A shop's page carries everything about that shop. Posters and counter
   * sheets were built from every card it had EVER held, unnamed — so an
   * archived programme left a dead poster and a dead counter sheet looking
   * exactly like the working pair beside them. That is what "why are there
   * two?" was.
   */
  it("builds a shop's links from live cards only", () => {
    expect(html).toContain("const liveCards = cards.filter((c) => !c.archived_at)");
    expect(html).toMatch(/liveCards\.map\(\(c\) => '<a target="_blank" href="\/c\/'/);
    expect(html).not.toMatch(/cards\.map\(\(c\) => '<a class="btn btn-ghost cbtn" target="_blank" href="\/c\/'/);
    // And resetting a password happens on the shop you already have open.
    expect(html).toContain("data-resetpw=");
    expect(html).not.toContain('<select id="who">');
  });

  it("has no trace of the preset card builder", () => {
    for (const gone of ["VERTICALS", "data-vpick", "Business type", "Chicken rice", "Bubble tea"]) {
      expect(html).not.toContain(gone);
    }
  });

  it("edits a card's look but never its terms", () => {
    expect(html).toContain("showDetails: false");
    // The shop name is the one detail the console does set.
    expect(html).toContain('data-f="shopName"');
  });

  /**
   * Exactly one hero, and it is a question about adoption. There were four
   * hero numbers, then four panels of numbers under them — both made you read
   * everything to find the one thing that mattered.
   */
  it("opens on one number and a trend, not on a wall of them", () => {
    // The hero, the stage chips and the Churning flag all read CHURN_DAYS, so
    // the console can never quote three different silence thresholds.
    expect(html).toContain("Shops stamping in the last ");
    expect(html).toContain(`const CHURN_DAYS = ${CHURN_DAYS}`);
    expect(html.match(/class="hero"/g)!.length).toBe(1);
    expect(html).toContain("lifebar");
    // The four panels the numbers used to live in.
    expect(html).not.toContain("How everyone is doing");
    expect(html).not.toContain('class="pstrip"');
    expect(html).not.toContain("Spend through cards");
  });

  /**
   * Four words about USE, and paying is not one of them. It used to be a stage
   * ranked above everything else, so a paying shop that had not stamped in a
   * month read as the healthiest state on the board — the one shop whose
   * silence matters most was the one the console could not report.
   */
  it("says what stage a shop is at, and counts paying separately", () => {
    for (const s of ["Not claimed", "Activated", "Stamping", "Churning"]) {
      expect(html, `${s} is missing from the stage vocabulary`).toContain(s);
    }
    expect(html).toContain("const STAGE_LABEL = ");
    expect(html).toContain('m.paid_at ? \'<span class="paypill">Paying</span>\'');
    // The old vocabulary, gone from the browser entirely.
    expect(html).not.toContain('.stage.paid {');
    expect(html).not.toContain('m.stage === "active"');
  });

  /**
   * One rate, and a comparison computed the same way. Six retention rates
   * behind a gate is five more than "are customers becoming loyal?" needs.
   */
  it("answers loyalty with one rate and its direction", () => {
    expect(html).toContain("function returningHtml(r, where)");
    expect(html).toContain("pts vs four weeks ago");
    expect(html).toContain("first stamp was 14+ days ago");
    // Percentage POINTS, not a percent change: 20% to 25% is five points, and
    // calling that "+25%" is the oldest way there is to overstate a rate.
    expect(html).toContain("Math.round((r.rate - r.prev_rate) * 100)");
    // The comparison is held to the SAME floor as the rate. A shop four weeks
    // younger had a handful of eligible customers, and "▲ 5 pts" off a base of
    // four is the very thing the gate exists to stop, laundered through the
    // word "trend".
    expect(html).toContain("r.prev_eligible >= RET_FLOOR");
    expect(html).toContain("too few customers four weeks ago to compare");
    expect(html).not.toContain("function retentionHtml");
    expect(html).not.toContain("Came back a 2nd time");
  });

  /** Deleted is a subtraction from Landed, not a further step down the funnel. */
  it("draws the deleted bar without calling it a funnel drop", () => {
    expect(html).toContain('["Deleted again", m.removed + m.dropped]');
    expect(html).toContain("const last = i === steps.length - 1");
    expect(html).toContain("const drop = !last && prev");
  });

  /** The first step that is missing is the answer, so it is dashed, not red. */
  it("shows how far a shop got as four steps in order", () => {
    const order = ["Signed up", "Activated", "First customer", "First stamp"];
    let at = html.indexOf("How far did they get?");
    expect(at).toBeGreaterThan(-1);
    for (const step of order) {
      const i = html.indexOf('tstep("' + step, at);
      expect(i, `${step} is missing or out of order`).toBeGreaterThan(at);
      at = i;
    }
    expect(html).toContain('class="tstep todo"');
    expect(html).toContain(".tstep.todo { border-style: dashed; }");
  });

  it("draws the sign-up funnel as a funnel", () => {
    expect(html).toContain('class="fnl"');
    expect(html).toContain("function funnelHtml(m)");
  });

  /**
   * The fourteen-row rule table came off the page. The rules did not go with
   * it — every one is behind the chip that raises it, keyed on the flag's KEY
   * rather than its label, because half the labels are templated ("3 rewards
   * owed") and would never match a fixed string.
   */
  /**
   * A shop opens at its own address instead of unfolding inside its own table
   * row. The row version could not be linked or bookmarked, did not survive a
   * refresh or a re-render, and browser-back left the console entirely.
   */
  it("gives a shop its own address rather than a row that unfolds", () => {
    expect(html).toContain('const MPATH = "/admin/m/"');
    expect(html).toContain("history.pushState");
    expect(html).toContain('addEventListener("popstate"');
    // The row is now a link to that address, and nothing expands in place.
    expect(html).toContain("tr.onclick = () => goMerchant(tr.dataset.m)");
    expect(html).not.toContain('class="mdetail"');
    expect(html).not.toContain("row.style.display = opening");
  });

  /**
   * Nine loose buttons across three boxes became one menu — and it closed a
   * hole while it was at it: "mark paid" was a route with no button anywhere,
   * so the delete refusal told you to do something the console could not do.
   */
  it("puts every action on a shop behind one menu", () => {
    expect(html.match(/<details class="menu">/g)!.length).toBe(1);
    for (const act of ["Reset their password", "Hand it to someone else",
                       "Mark as paying", "Archive shop", "Delete this shop…"]) {
      expect(html, `${act} is missing from the menu`).toContain(act);
    }
    // Two taps, never a browser dialog: a suppressed confirm() returns false
    // and the button silently stops working (invariant 8).
    expect(html).toContain('armBtn(paid, "Tap again to confirm"');
    expect(html).toContain('armBtn(arch, "Tap again to archive"');
    // Delete OPENS the gate; the typed name is what actually fires it.
    expect(html).toContain("data-showdelete");
    expect(html).toContain("delBtn.disabled = delName.value.trim().toLowerCase() !== shopName");
  });

  /**
   * A rate over a handful of people is noise dressed as a measurement.
   * COALESCE(…, 0) rendered a confident 0% for a shop nobody had ever stamped,
   * which was the single most misleading thing on the page.
   */
  it("says how few there are rather than inventing a 0%", () => {
    expect(html).toContain("const RET_FLOOR = 10");
    expect(html).toContain("if (eligible < RET_FLOOR)");
    expect(html).toContain("Not enough data yet");
    expect(html).toContain("is noise, so it is not shown");
  });

  /**
   * The week we are standing in has run for a day or for six. Drawn beside
   * finished weeks it draws a crash every Monday morning, so it is held out of
   * every chart and reported as itself.
   */
  /**
   * The week now running is out of the TILES and in the TABLE.
   *
   * A tile states a change against the week before, so a Tuesday measured
   * against a full week points down every Monday and recovers by Sunday — for
   * reasons that say nothing about the shop. It used to be dropped outright
   * instead, and on a shop's own page it was not reported anywhere at all, so a
   * shop stamped only today read as zero with nothing explaining why.
   */
  it("keeps the part-week out of the tiles and in the table", () => {
    expect(html).toContain("const doneWeeks = allWeeks.slice(0, -1)");
    expect(html).toContain("The tiles compare finished weeks only");
    // Both sections hand it to the table, which marks it and totals it.
    expect(html).toContain("seriesTable(rows, P_TILES, partWeek)");
    expect(html).toContain("seriesTable(weeks, M_TILES, mPart)");
    expect(html).toContain("still running");
    // An average over nobody at all is not zero.
    expect(html).toContain("r.active_customers ? r.stamps / r.active_customers : null");
    expect(html).toContain("no shops stamped");
  });

  /**
   * A rate cannot be summed: six weekly "stamps per customer" figures added up
   * is not the stamps per customer over six weeks. Those columns total as a
   * dash rather than as a number that would be quietly wrong.
   */
  it("does not add up a rate in the weekly total", () => {
    expect(html).toContain('const total = (d) => d.dp\n        ? "<td>—</td>"');
  });

  /** The six tiles, and only these six. Each answers one of the three questions. */
  it("carries the six weekly measures and nothing else", () => {
    const at = html.indexOf("const P_TILES = [");
    const tiles = html.slice(at, html.indexOf("const M_TILES = [", at));
    for (const label of ["Stamps", "Customers stamped", "Stamping shops",
                         "Stamps per customer", "New shops", "Rewards given"]) {
      expect(tiles, `${label} is missing`).toContain(`label: "${label}"`);
    }
    expect(tiles.match(/key: "/g)!.length).toBe(6);
    // The one it replaced, and the series column nothing reads any more.
    expect(html).not.toContain("Stamps per stamping shop");
    expect(html).not.toContain("per_shop");
  });

  /**
   * Emphasis is weight, not colour. DESIGN.md rule 1 gives the neon exactly one
   * job — marking the next thing to press — so a lime bar in a chart is
   * decoration, and rule 2 says weight comes from the near-black.
   */
  it("draws its charts in ink and grey, never in the accent", () => {
    const spark = html.slice(html.indexOf("function spark(rows, key, fmt)"),
                             html.indexOf("function tile(rows, def)"));
    expect(spark).toContain('i === n - 1 ? "var(--ink)" : "var(--field-border)"');
    expect(spark).not.toContain("var(--accent)");
    // Hairline, solid — a dashed grid reads as a threshold when it is a grid.
    expect(spark).toContain('stroke="var(--line)" stroke-width="1"');
    expect(spark).not.toContain("stroke-dasharray");
    // A tooltip is never the only way to read a value: hover does not exist on
    // a phone and does not answer to a keyboard, so the numbers are also a table.
    expect(html).toContain("function seriesTable(rows, defs, part)");
    expect(html).toContain("Every week, as numbers");
    // One range control for everything it scopes, never one per chart.
    expect(html.match(/data-range/g)!.length).toBeGreaterThan(0);
    expect(html).toContain("function rangeRow(note)");
  });

  it("explains every problem it can raise, behind the chip that raises it", () => {
    expect(html).not.toContain("What these problems mean");
    expect(html).not.toContain("<th>Fires when</th>");
    const at = html.indexOf("const FLAG_HELP = ");
    expect(at).toBeGreaterThan(-1);
    const help = JSON.parse(html.slice(html.indexOf("{", at), html.indexOf(";\n", at)));
    for (const g of FLAG_GUIDE) {
      expect(help[g.key], `${g.key} has no explanation`).toContain(g.rule);
      expect(help[g.key]).toContain(g.why);
    }
    expect(Object.keys(help).length).toBe(FLAG_GUIDE.length);
  });
});

/**
 * "Today's Activity" states facts and stops.
 *
 * There is no per-staff identity in this product — one PIN per owner, any
 * signed-in device stamps — so nothing on this screen can say who did anything,
 * and it must not imply that anything is wrong. Almost every pattern it shows
 * has an ordinary explanation: a customer transferred from a paper card, an
 * honest mistake corrected, a quiet Tuesday.
 *
 * That constraint is a matter of wording and styling, which is exactly the kind
 * of thing that erodes one well-meaning edit at a time. So it is a test.
 */
describe("the counter view judges nothing", () => {
  const html = dashboardPage(true, "");
  // The block lives below the message box on the Customers tab, folded away.
  const block = html.slice(
    html.indexOf("// ---- At the counter"),
    html.indexOf("/** Send. The server decides"),
  );

  it("is actually on the page", () => {
    expect(block.length).toBeGreaterThan(500);
    expect(html).toContain("Today's Activity");
    expect(html).toContain("data-counter");
    // Folded, and above Find a customer: it is the thing an owner checks
    // first. Folded is what keeps it from pushing the message box off screen —
    // being last was never what did that.
    expect(html.indexOf("data-counter")).toBeLessThan(html.indexOf("data-find"));
  });

  /**
   * Six numbers in two rows of three, and nothing else. The first version was a
   * six-row list plus a seven-day table, which is what "way too long" meant —
   * so the shape is the requirement, not a preference, and a character count is
   * a poor proxy for it. This counts what actually reaches the screen.
   */
  it("is six numbers in two rows, and no daily table", () => {
    const cells = block.match(/^\s*cell\(/gm) || [];
    expect(cells.length).toBe(6);
    expect(block).toContain("cact"); // the three-column grid, not a list of rows
    // The seven-day rollup is gone and must not creep back.
    expect(block).not.toContain("Last 7 days");
    expect(block).not.toMatch(/\bdays\b\s*[:.]/);
    expect(block).not.toContain("cweek");
  });

  it("gives every cell one weight, at metric size, on the page colour", () => {
    // --display is a 400–900 variable face, so a number that sets the family
    // and forgets the weight renders at 400 and reads as body text. These are
    // metrics: 800, like the hero numbers. One rule for all six — the styling
    // says "this is a number", never "this number is the interesting one".
    expect(html).toMatch(/\.cact \.cn \{[^}]*font-weight: 800/);
    // The grid opens inside a tinted fold, so the cells step back to --bg
    // (DESIGN.md rule 9). On --surface they were six invisible boxes.
    expect(html).toMatch(/\.cact \.ccell \{ background: var\(--bg\)/);
    expect((html.match(/\n\s*\.cact \.ccell \{/g) || []).length).toBe(1);
  });

  it("uses no word that implies something is wrong", () => {
    for (const word of [
      "suspicious", "unusual", "warning", "alert", "abnormal", "anomal",
      "flagged", "irregular", "excessive", "too many", "review this",
    ]) {
      expect(block.toLowerCase()).not.toContain(word);
    }
  });

  it("computes no ratio, rate or percentage", () => {
    // A ratio is an opinion about two numbers. The screen shows both instead.
    expect(block).not.toMatch(/\/\s*(k\.stamps|k\.customers|stamps|customers)\b/);
    expect(block).not.toContain("toFixed");
    expect(block).not.toContain("Math.round(");
    expect(block).not.toContain("%");
  });

  it("styles no row differently from another", () => {
    // No severity class, no alarm colour, no conditional emphasis. Matched as
    // styling rather than as substrings — "cleared" contains "red".
    for (const cls of [/class="[^"]*\bbad\b/, /class="[^"]*\bwarn\b/, /class="[^"]*\bcritical\b/,
                       /class="[^"]*\bdanger\b/, /#9a3412/, /color:\s*red/]) {
      expect(cls.test(block), `the counter block styles something with ${cls}`).toBe(false);
    }
    // And no class chosen by a value — that is a verdict rendered as CSS.
    expect(block).not.toMatch(/\?\s*"[a-z-]*(bad|warn|alarm)/);
  });

  it("does not invent a stamps-added edit", () => {
    // Adding a stamp is the ordinary action; only `undo` is a correction.
    // "Stamps added" would be the stamps-given number under a darker label.
    expect(block).toContain("Stamps taken back");
    expect(block).not.toMatch(/stamps added/i);
  });

  it("names the forced stamp for what happened, not what it might mean", () => {
    expect(block).toContain("Stamped again within a minute");
  });

  it("says what the device list actually is", () => {
    // Both of these mislead if left unsaid: it is not a list of signed-in
    // phones, and a cleared browser reappears as a new one.
    expect(block).toContain("not phones signed in");
    expect(block).toContain("browser data is");
    // The only device control that exists is the PIN reset directly above it.
    expect(block).toContain("reset the staff PIN under Shop");
  });

  it("opens its drill-downs in the read-only sheet, not a browser dialog", () => {
    // Invariant 8: a suppressed confirm() returns false silently.
    expect(block).toContain("sheet(");
    expect(block).not.toContain("confirm(");
    expect(block).not.toContain("alert(");
  });
});

describe("dashboard information architecture", () => {
  const html = dashboardPage(true, "");

  /**
   * The dashboard used to open on "Dashboard" over the login email — a title
   * naming the software, addressed to nobody — with nothing between it and the
   * tab strip. The welcome block replaced it and doubles as that rule.
   */
  describe("the welcome block", () => {
    /** The builder as it reaches the browser, so these read the real source. */
    const greet = html.slice(html.indexOf("function greetHtml()"),
                             html.indexOf("// Three tabs, each one job"));

    it("greets the SHOP and says which login you are on", () => {
      expect(greet).toContain('(S.cards[0] || {}).shopName');
      expect(greet).toContain('"<h1>Hello, " + esc(shop)');
      // The email is the only thing on screen answering "which account is
      // this?", which starts mattering the moment somebody runs two shops.
      expect(greet).toContain('esc(S.email)');
      // The SHELL no longer carries the old title. Scoped to the shell on
      // purpose: deadEnd() still uses a plain "Dashboard" heading, and rightly
      // — it is the screen shown when there is no shop to greet.
      // Anchored BACKWARDS from #pinwarn: several screens assign #app, and
      // indexOf would have found the login form's.
      const at = html.indexOf('id="pinwarn"');
      const shell = html.slice(html.lastIndexOf('$("#app").innerHTML', at), at);
      expect(shell).toContain("greetHtml()");
      expect(shell).not.toContain("Dashboard</h1>");
    });

    /**
     * The counts and the share link are NOT here any more.
     *
     * Both were third copies: the numbers belong to the Customers tab this
     * block opens on, and the link to the Shop tab, which is where a person
     * goes looking for it. A header that restates the page under it is a
     * header nobody reads.
     */
    it("greets, names the account, and counts nothing", () => {
      expect(greet).toContain("Hello, ");
      expect(greet).toContain("S.email");
      expect(greet).not.toContain("Nobody has taken a card yet");
      expect(greet).not.toContain("Share your sign-up link");
      expect(greet).not.toContain('class="stat"');
    });

    /**
     * The navigation lives INSIDE the header, so the shop, the account and the
     * tabs are one fixed object that the panel changes underneath — rather
     * than two stacked blocks that looked like they might both scroll away.
     */
    it("carries the tab strip inside itself, not as a sibling", () => {
      expect(greet).toContain('id="tabs"');
      // The shell renders the greeting and then the panel: no loose tab strip
      // in between any more.
      const at = html.indexOf('id="pinwarn"');
      const shell = html.slice(html.lastIndexOf('$("#app").innerHTML', at), at);
      expect(shell).not.toContain('id="tabs"');
    });

    /**
     * The ONE neon surface on the dashboard, and DESIGN.md rule 1's single
     * named exception — see the carve-out written into the rule.
     *
     * Text is --on-accent and never white: #c9f73d is a pale green, so white
     * on it lands near 1.3:1. The tab thumb inside goes WHITE for the mirror
     * reason — neon on neon is invisible.
     */
    it("is the one neon surface, dark-texted, with a white thumb", () => {
      expect(html).toContain(".greet { background: var(--accent)");
      expect(html).toContain("color: var(--on-accent)");
      expect(html).toContain(".greet #tabs .thumb { background: #fff");
      // Never white text on the neon.
      expect(html).not.toContain(".greet h1 { font-size: 1.45rem; margin: 0; color: var(--on-slab)");
    });
  });

  /**
   * The Card tab's iPhone/Android/Poster switch had a dark hairline for its
   * active state, which read as no marker at all beside the neon tab strip
   * above it. Neon UNDERLINE against the tabs' neon PILL: one hue, two shapes,
   * so neither control needs a second palette to be told apart.
   */
  it("marks the open preview with a neon underline, never neon text", () => {
    expect(html).toContain("border-bottom-color: var(--accent);");
    expect(html).toContain("border-bottom: 3px solid transparent;");
    // Rule 1's "never text": the mark goes under the word, not on it.
    expect(html).toContain(".dseg button.on { color: var(--ink); font-weight: 700;");
  });

  it("has one tab per job", () => {
    for (const tab of ["customers", "card", "shop"]) {
      expect(html).toContain(`data-tab="${tab}"`);
    }
    expect(html).not.toContain('data-tab="share"');
    // Renamed from "account": the tab holds the shop's links and its counter,
    // not just a login, and the key follows the label so the code reads the way
    // the screen does.
    expect(html).not.toContain('data-tab="account"');
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
  it("has no Access tab — one PIN in Shop, with every link you hand out", () => {
    expect(html).not.toContain('data-tab="access"');
    expect(html).toContain(">Shop<");
    expect(html).toContain("/staff-pin");
  });

  // The links were under the card designer, which put "print this for the
  // counter" on the page you open to change a colour. They live in Shop now:
  // the stamper link sits with the PIN that unlocks it, the customer-facing
  // ones under Share.
  it("keeps every shareable link in Shop, beside what it needs", () => {
    expect(html).toContain(">Share<");
    expect(html).toContain(">Staff stamper<");
    expect(html).not.toContain("Share this card");
    // The card id must stay on the staff link: a bare /staff once resolved to
    // whoever owned the café literally named "default" — a stranger's counter.
    expect(html).toContain('href="/staff?c=');
    // The PIN comes before the links it gates, not in a section below them.
    expect(html.indexOf("data-pinlabel")).toBeLessThan(html.indexOf(">Share<"));
  });

  // One way to set a PIN, not two. The generator went, and with it the page's
  // only use of the two-tap arm() helper.
  it("has one PIN control and never echoes a PIN back", () => {
    expect(html).not.toContain("data-newpin");
    expect(html).not.toContain("New staff PIN: ");
    expect(html).not.toContain("function armBtn");
    // Only the one PIN button remains. (The phrase itself still appears in two
    // comments explaining what went and why, which is worth keeping.)
    expect(html).not.toContain(">Generate a new PIN<");
  });

  // Subtext nobody reads became a popup on the action it describes, and an ⓘ
  // beside the field it explains. Tappable, not hover — this is used on a phone.
  it("moves what matters into the action and the rest behind an info button", () => {
    expect(html).toContain("Save these changes?");
    expect(html).toContain("function info(text)");
    expect(html).toContain("wireInfo(panel)");
  });

  // Two fields, one checkbox: they were two adjacent boxes doing the same job.
  it("reveals both password fields from one toggle", () => {
    expect(html).toContain('data-eye="[data-cur],[data-new]"');
    expect(html).not.toContain("Show current password");
  });

  // A card name and a shop name were indistinguishable, and the card's only
  // visible use is the programme name on an Android card — which is the shop.
  it("has one name for the shop and no separate card name", () => {
    expect(html).not.toContain('data-f="name"');
    expect(html).toContain('data-f="shopName"');
  });

  /**
   * Design, then the programme, then one Save.
   *
   * Inside Design the order is what a merchant actually does: upload the logo,
   * pick the stamp, and only then argue with the colours the logo produced —
   * which is why Colours is last and starts as a read-out rather than five
   * fields.
   */
  it("orders the editor design-first, and the programme after it", () => {
    const at = (s: string) => html.indexOf(s);
    expect(at("Customise the design")).toBeLessThan(at("data-logo"));
    expect(at("data-logo")).toBeLessThan(at("data-stampimg"));
    expect(at("data-stampimg")).toBeLessThan(at("data-swatches"));
    expect(at("data-swatches")).toBeLessThan(at('data-f="shopName"'));
    expect(at('data-f="shopName"')).toBeLessThan(at('data-a="save"'));
    // The old per-wallet Design fold is still gone; the fold here is the new
    // one, and it is named for the action rather than the section.
    expect(html).not.toContain("<summary>Design</summary>");
  });

  // Two headings, one weight. Everything under them is a plain label, so a
  // merchant reads one level of structure rather than three.
  it("heads the two sections and nothing else", () => {
    // From the end of the preview box to the save button: the editor exactly.
    // Slicing from ">Design<" would start AFTER that heading's own class
    // attribute and quietly count one heading instead of two.
    const editor = html.slice(html.indexOf("data-testout"), html.indexOf('data-a="save"'));
    // ONE heading now, not two: the design half is a fold, and its summary is
    // its title. "Loyalty programme" below it is the only .sec left.
    expect((editor.match(/class="sec/g) ?? []).length).toBe(1);
    expect(editor).toContain("Customise the design");
    for (const name of ["Apple logo", "Android logo", "Colours", "Stamp logo"]) {
      expect(editor).toContain(`>${name}`);
    }
    expect(html).not.toContain("Band texture");
    expect(html).not.toContain("Stamp icon");
  });

  // Three cohort rows and a card dropdown said what one line under the button
  // says. The limit was never enforced here anyway — canNudge decides.
  it("sends notifications from one box with one button", () => {
    expect(html).toContain("Notifications");
    expect(html).toContain("Push notification");
    // Built from the server's cap, not typed here — the number has moved twice.
    expect(html).toContain('already had their " + perWeek + " this week');
    expect(html).not.toMatch(/already had their (one|two|three) this week/);
    expect(html).not.toContain("data-buckets");
    expect(html).not.toContain("Bring people back");
    expect(html).toContain("Find a customer");
    // The rule is the thing people ask about, so it is on the heading — and it
    // is TWO a week now, everywhere it is stated.
    expect(html).toContain("twice every 7 days");
    expect(html).not.toContain("once every 7 days");
    // Who first, then what: the audience picker drives the count under the
    // button, so the promise is always about the people actually being sent to.
    expect(html).toContain("data-audience");
    expect(html).toContain(">Send to<");
    // "Also issued: N deleted the card" is gone — an owner can do nothing about
    // it, and it read as a scoreline against them.
    expect(html).not.toContain("Also issued");
  });

  // Two controls set the same five fields: a chip row and a row of five colour
  // squares. Two controls for one job read as two different jobs.
  it("picks colours by tapping the swatch for that part", () => {
    // The strip already named all five parts, so it was the obvious thing to
    // press long before it did anything. Each swatch is a button; its palette
    // opens directly underneath, in the same column.
    expect(html).toContain("data-palette");
    expect(html).toContain('sw.setAttribute("data-role", r.k)');
    expect(html).toContain('sw.setAttribute("aria-expanded"');
    // And the preview stays a preview — one control for one job.
    expect(html).not.toContain("pvhit");
    expect(html).toContain("Custom…");
    expect(html).not.toContain("rolebtn");
    expect(html).not.toContain("crhead");
    // The native pickers stay in the DOM as the source of truth every other
    // function reads through f("bg"). They are PARKED and moved into the open
    // row — never hidden and clicked from a proxy, because .click() on a
    // display:none colour input does not reliably open the OS picker.
    expect(html).toContain('class="colorpark"');
    expect(html).toContain("park.appendChild(f(r.k))");
    expect(html).toContain('data-f="bandColor"');
  });

  // The OS picker fires input on every frame of a drag. Rebuilding the list
  // there would move the very input the picker is attached to.
  it("does not rebuild the colour list while the native picker is open", () => {
    expect(html).toContain("function refreshSwatches()");
    expect(html).toContain("applyRole(r.k, f(r.k).value.toLowerCase())");
  });

  // A texture the browser can draw but the server rejects saves as flat with no
  // error, so the two lists have to be checked against each other.
  // The ten band textures are gone — they were ten variations of a surface the
  // stamps are drawn on top of, each tuned to be barely visible so it could not
  // fight them. The band is the Band colour in the Colours list and nothing
  // else, so neither the picker nor the server has a vocabulary to disagree on.
  it("offers no band textures at all", () => {
    for (const t of ["stripes", "dots", "chevron", "grain", "rays", "gradient"]) {
      expect(html).not.toContain(`style: "${t}"`);
    }
    expect(html).not.toContain("data-bandtex");
  });

  // Six preset tiles did what the emoji field does, and every card starts on
  // dots anyway. Three routes remain, each a different kind of answer.
  it("offers dots, any emoji or your own shape — no preset tiles", () => {
    expect(html).not.toContain("data-stamptpl");
    expect(html).not.toContain("STAMP_ICONS");
    expect(html).toContain("data-emoji");
    // All three on one row now, so the labels are short.
    expect(html).toContain('data-a="rmstamp"');
    expect(html).toContain('data-stampimg');
  });

  // A hint that pushes the form down is a paragraph with extra steps.
  it("shows hints as a bubble, on hover and on tap", () => {
    expect(html).toContain('infoTip.className = "itip"');
    expect(html).not.toContain('className = "ibody"');
    expect(html).toContain('addEventListener("mouseover"');
    // Tap matters more than hover: on a phone there is no hover at all.
    expect(html).toContain('addEventListener("click"');
    // wireInfo runs again on every tab switch. The bubble's state is shared and
    // the document-level listeners attach once, or an outside click would clear
    // a stale reference and leave the current icon lit.
    expect(html).toContain("document.body.dataset.infoWired");
    expect(html).toContain("var infoTip = null, infoFor = null;");
  });

  it("keeps the staff PIN out of the card designer", () => {
    expect(html).not.toContain('data-f="staffPin"');
  });

  // The designer used to guess at the brand with six "verticals" and twelve
  // colour themes. It now reads the colours out of the owner's own logo.
  it("has no themes or vertical templates left to guess with", () => {
    expect(html).not.toContain("data-presets");
    expect(html).not.toContain("data-vtpl");
    // Nor a palette to opt into: the logo's colours are simply taken.
    expect(html).toContain("applyLogoColours");
  });

  // Colours come from the logo they are uploading anyway — a second "brand
  // photo" upload was one more thing to explain for the same result.
  it("takes its palette from the logo, automatically and with no second upload", () => {
    expect(html).not.toContain("data-brandpic");
    expect(html).toContain("await readPalette(dataUrl);");
    // The button and its swatch block are gone — nobody pressed it, and the
    // alternative was matching a brand by eye in five colour pickers.
    expect(html).not.toContain("data-a=usepal");
    expect(html).not.toContain("Use these colours");
    // The strip that DID come back is a read-out, not a control: it shows what
    // the logo produced. Changing one happens on the CARD — the Customize
    // button and the five named rows it revealed are gone, because they asked
    // you to name the part you meant before you could point at it.
    expect(html).toContain("data-swatches");
    expect(html).toContain("data-palette");
    expect(html).not.toContain('data-a="customise"');
    expect(html).not.toContain("data-roles");
  });

  /**
   * The Android sub-label is one line; the reason Google needs a square logo
   * lives in the ⓘ beside it. It used to be two sentences in a bordered box,
   * which cost four times the height to say the same thing — in the one section
   * whose length was the complaint.
   */
  it("keeps the Android explanation behind its info button", () => {
    expect(html).toContain("Android crops your logo to a small circle");
    expect(html).not.toContain('class="marknote"');
  });

  // Matching a shade by hand in a colour picker is the fiddliest thing on the
  // page, and never what the owner wants: they want a colour already in play,
  // just somewhere else.
  it("lets any colour be swapped into any role", () => {
    expect(html).toContain("data-palette");
    expect(html).toContain("activeRole");
    expect(html).toContain("NEUTRALS");
  });

  // The band is drawn from the picker, not from the stored PNG — otherwise
  // dragging the colour changes nothing until it has been round-tripped.
  it("paints the band from the live picker value", () => {
    expect(html).toContain('paintBand(x, f("bandColor").value');
    expect(html).not.toContain("bannerReady && bannerImg.naturalWidth");
  });

  // Padding a square logo into a wide frame made the wallets shrink the frame,
  // and the mark with it.
  it("keeps an uploaded logo's own shape", () => {
    expect(html).toContain('fit === "keep"');
    expect(html).toContain('}, "keep");');
  });

  it("builds the band from one colour, not a texture and not an uploaded photo", () => {
    expect(html).toContain('data-f="bandColor"');
    expect(html).not.toContain("data-bandtex");
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
 * The ⓘ markup is built by string concatenation and dropped into innerHTML, so
 * an unescaped quote in a hint would break out of the attribute and swallow the
 * rest of the field. Evaluated from the shipped source, like the palette below.
 */
describe("info hints", () => {
  const M = new Function(MODAL_JS + "; return { info, mdlEsc };")() as {
    info: (t: string) => string;
    mdlEsc: (s: unknown) => string;
  };

  it("escapes a hint that contains quotes or markup", () => {
    const out = M.info('a "quoted" <b>bold</b> hint');
    expect(out).toContain("&quot;quoted&quot;");
    expect(out).toContain("&lt;b&gt;");
    // The only tag in the result is the button itself.
    expect(out.match(/</g)).toHaveLength(2); // <button …> and </button>
  });

  it("renders a button, not a hover-only tooltip", () => {
    const out = M.info("plain");
    expect(out).toContain('type="button"');
    expect(out).toContain('data-info="plain"');
    expect(out).not.toContain("title=");
  });

  it("survives a null or missing hint rather than printing undefined", () => {
    expect(M.mdlEsc(null)).toBe("");
    expect(M.mdlEsc(undefined)).toBe("");
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
    // Stamps are measured against the CARD: the band is a near neighbour of it
    // by construction, so holding them off the band held them off the card twice
    // and put a floor under how dark a stamp could be.
    expect(P.contrastRatio(pal.accent, pal.bg)).toBeGreaterThanOrEqual(1.6);
    expect(P.contrastRatio(pal.band, pal.bg)).toBeGreaterThan(1.2);
  });

  // The bug this pair exists for: a black stamp on a dark card came out mid-grey.
  // separate() chose its direction from the SURFACE, so "dark surface" meant
  // "step toward white" — which dragged a black mark up through the card colour,
  // losing contrast before it gained any, six times over.
  it("leaves a dark colour dark when it already reads on the card", () => {
    // Black stamps on a dark-but-not-black card: visible, so untouched.
    expect(P.separate("#000000", "#4a4a4a", 1.6)).toBe("#000000");
    expect(P.separate("#111111", "#555555", 1.6)).toBe("#111111");
  });

  it("moves a colour the way that actually gains contrast", () => {
    // Nowhere to go down from black, so it must go up — and far enough to read.
    const onBlack = P.separate("#000000", "#000000", 1.6);
    expect(P.contrastRatio(onBlack, "#000000")).toBeGreaterThanOrEqual(1.6);
    // White on white must go DOWN, not clamp at white.
    const onWhite = P.separate("#ffffff", "#ffffff", 1.6);
    expect(P.contrastRatio(onWhite, "#ffffff")).toBeGreaterThanOrEqual(1.6);
    // And it takes the shorter road: a near-black mark on a light card darkens.
    expect(P.relLuminance(P.separate("#2b2b2b", "#f0f0f0", 3))).toBeLessThan(
      P.relLuminance("#2b2b2b") + 0.01,
    );
  });

  it("keeps a dark brand colour EXACTLY, when it already reads on the card", () => {
    // A cream page with a dark navy mark — the shape of most real logo files.
    // Navy clears the card comfortably, so nothing should touch it. Under the
    // old rule the accent was held 2.2:1 off the BAND, the band had settled on
    // navy too, and six steps toward white turned the brand colour into a
    // washed-out slate. This is that regression.
    const pal = P.paletteFrom(pixels(["#f0e6d2", 800], ["#12213f", 200]))!;
    expect(pal).not.toBeNull();
    expect(pal.accent).toBe("#12213f");
    expect(P.contrastRatio(pal.accent, pal.bg)).toBeGreaterThanOrEqual(1.6);
    expect(P.contrastRatio(pal.fg, pal.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("takes no palette from a logo that is only black and white", () => {
    // Neither is a brand colour, so paletteFrom declines and the dashboard asks
    // the owner to choose. That path matters here because the colour pickers are
    // literal — saveCard sends f("accent").value raw, with no separate() — so a
    // shop that wants pure black stamps sets them by hand and gets them.
    expect(P.paletteFrom(pixels(["#ffffff", 800], ["#000000", 200]))).toBeNull();
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

/**
 * The rebrand from Stampy to PunchMe, and the three things it must never touch.
 *
 * A name is a label. Cookie names, the Google Wallet class id and Apple's Pass
 * Type ID are IDENTIFIERS that happen to contain the old label, and each one is
 * held by something outside this codebase — a browser, Google, an issued
 * .pkpass. Renaming one is not a rename, it is an orphaning, and no deploy
 * repairs it. So it is a test rather than a paragraph.
 */
/*
 * Google refused Wallet publishing access with "please provide a valid website
 * and company name". The cause was on the marketing page: WhatsApp, Instagram
 * and Email were all href="#contact" — the section the reader was already in —
 * so the page's entire call to action did nothing when clicked, and nothing on
 * the page named the business behind it. A reviewer pressed Email, stayed put,
 * and said no. None of that could fail a test, because a link to an anchor is
 * perfectly valid HTML.
 */
describe("the marketing page can actually be contacted", () => {
  const html = marketingPage("hello@punchme.test");

  it("gives the contact call to action a destination off this page", () => {
    // The closing block that used to hold Email and Instagram has been removed,
    // so the nav's "Message us" is now the page's ONE contact button. It used to
    // scroll to #contact, which was defensible while that section existed and is
    // exactly the rejected shape now that it does not — a button claiming to be
    // a way of reaching us that leaves the reader where they were.
    const cta = /<a class="pbtn pbtn-glow"[^>]*>/.exec(html);
    expect(cta, "the contact CTA moved — this test is now checking nothing").toBeTruthy();
    expect(cta![0], "the contact CTA goes nowhere").not.toContain("#contact");
    // Either straight out, or through the redirect that counts the press first.
    // /go/start is not a cop-out destination: the e2e asserts it answers 302 to
    // an https URL, which is the half this test cannot see.
    expect(cta![0], "the contact CTA has no real href").toMatch(
      /href="(mailto:|https?:|\/go\/start)/,
    );
    // And nothing anywhere may still point at the section that was deleted.
    expect(html, "a link still points at the removed #contact section").not.toContain('href="#contact"');
  });

  it("offers a real mailto and a real Instagram link", () => {
    expect(html).toContain('href="mailto:hello@punchme.test"');
    expect(html).toContain("https://instagram.com/punchme.my");
  });

  // A button with nowhere to go is removed, not left in as decoration — that is
  // what got us rejected. WhatsApp had no number, so it does not appear.
  it("shows no WhatsApp button while there is no number for it", () => {
    expect(html).not.toContain(">WhatsApp<");
  });

  it("names the business and its address in the footer, plus Support", () => {
    expect(html).toContain("PunchMe");
    expect(html).toContain("hello@punchme.test");
    expect(html).toContain('href="/support"');
  });

  // With no CONTACT_EMAIL the email button must vanish rather than render a
  // mailto: to nothing — a broken button is the thing being fixed here.
  it("drops the email button entirely when no address is configured", () => {
    const bare = marketingPage("");
    expect(bare).not.toContain("mailto:");
    expect(bare).toContain("https://instagram.com/punchme.my");
  });
});

describe("the rebrand renamed the label, not the identifiers", () => {
  const surfaces = [
    marketingPage(),
    dashboardPage(true, "hello@punchme.test"),
    adminPage(),
    staffPage(true),
    resetPage(),
  ];

  it("shows the new name and nowhere shows the old one", () => {
    for (const html of surfaces) {
      expect(html).toContain("PunchMe");
      // Capital-S only: the lowercase identifiers are checked separately below,
      // and they are supposed to still be there.
      expect(/Stampy/.test(html), "an old brand string survived").toBe(false);
    }
  });

  /**
   * The footer belongs to the page SHELL, not to pages.
   *
   * The first pass at this signed the dashboard tabs and the console by hand
   * and silently missed seven others — the customer sign-up page, the login
   * form, the claim page, the stamper, the counter sheet, setup and reset. A
   * per-page footer is a thing every future page has to remember; a shell
   * footer is a thing a future page has to deliberately turn off.
   */
  it("signs every page it serves, from the shell", () => {
    const seen = (html: string) =>
      html
        .replace(/<head>[\s\S]*?<\/head>/i, "")
        .replace(/<style>[\s\S]*?<\/style>/gi, "")
        .replace(/<script>[\s\S]*?<\/script>/gi, "");
    // EVERY page, not the subset that happens to carry an inline script — the
    // ones missed the first time were mostly the script-less ones.
    // POSTER_CARD has no `name` — the poster takes the business separately —
    // and the pages below print the card's own name, so they get a whole one.
    const named = { ...POSTER_CARD, name: "Kopi Corner" } as never;
    const everything: [string, string][] = [
      ["sign-up /c/:id", landingPage(named, true, true, "default")],
      ["card picker /j/:ref", cardPickerPage({ name: "Kopi Corner" }, [
        { id: "a", name: "Coffee", reward: "Free coffee", stamps_target: 10 },
      ])],
      ["not ready", notReadyPage()],
      ["shop not open yet", shopNotOpenPage("Kopi Corner", 0, "default")],
      ["claim (hand-over)", claimPage("tok", "Kopi Corner", named, 0)],
      ["privacy", privacyPage("hi@x.com")],
      ["privacy (BM)", privacyPageBm("hi@x.com")],
      ["support", supportPage("hi@x.com")],
      ["terms", termsPage("hi@x.com")],
      ["staff signed out", staffPage(false)],
      ["staff signed in", staffPage(true)],
      ["login + dashboard", dashboardPage(true, "hi@x.com")],
      ["admin console", adminPage()],
      ["reset password", resetPage()],
    ];
    for (const [name, html] of everything) {
      expect(seen(html), `${name} carries no Powered by line`).toContain("Powered by PunchMe");
    }
    expect(dashboardPage(true, "").includes(".pby { text-align: center")).toBe(true);
    // A footnote, not a masthead: what an owner is looking at is their shop.
    expect(dashboardPage(true, "")).not.toContain("<h1>PunchMe");
  });

  it("keeps it out of the two pages that carry their own", () => {
    // Both opt out explicitly. The poster's own footer is INSIDE the printed
    // area, which is the only place it would survive onto paper.
    expect(marketingPage().match(/Powered by PunchMe/g)).toBeNull();
    const poster = posterPage(POSTER_CARD, "Kopi Corner", "kopi-corner", 0);
    expect(poster.match(/Powered by PunchMe/g)!.length).toBe(1);
    expect(poster).toContain('class="pfoot"');
  });

  it("keeps the cookie names customers and staff are already carrying", async () => {
    const auth = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("../src/auth.ts", import.meta.url), "utf8"),
    );
    for (const cookie of ["stampy_session", "stampy_cust_", "stampy_card_", "stampy_staff_"]) {
      expect(auth.includes(cookie), `${cookie} was renamed — every holder is logged out`).toBe(true);
    }
  });

  it("keeps the Google Wallet class id every Android card is bound to", async () => {
    const model = await import("../src/googleModel.js");
    // Re-sent on every stamp. Change the prefix and Google treats it as a new
    // class, leaving every issued card pointed at one nothing updates.
    expect(model.classId({ id: "abc123" })).toContain(".stampy-abc123");
  });
});

/**
 * Customer health, running the shipped source.
 *
 * The four counts sit under a heading that promises they add up, and the
 * percentages sit beside them making the same promise a second time. Naive
 * rounding breaks the second one silently — four groups of three read 25% each
 * and total 100, four of one-third read 33 and total 99 — so the arithmetic is
 * worth running rather than eyeballing.
 */
describe("customer health tiles", () => {
  const H = new Function(
    'function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){' +
      'return {"&":"&amp;","<":"&lt;",">":"&gt;",\'"\':"&quot;"}[c];});}' +
      'function info(t){return \'<button data-info="\' + esc(t) + \'"></button>\';}' +
      HEALTH_JS +
      "; return { drawHealth, shares };",
  )() as {
    drawHealth: (host: { innerHTML: string }, body: unknown) => void;
    shares: (counts: number[]) => number[];
  };

  const group = (key: string, label: string, customers: number) =>
    ({ key, label, customers, eligible: customers, hint: "" });
  const body = (counts: number[], cycle: Record<string, unknown> = {}) => ({
    health: [
      group("regular", "Regulars", counts[0]!),
      group("returning", "Returning", counts[1]!),
      group("new", "New", counts[2]!),
      group("lost", "Lost", counts[3]!),
    ],
    cycle: { days: 28, chosen: true, label: "3-4 weeks", regularGapDays: 25, regularStamps: 3, lostAfterDays: 49, ...cycle },
  });

  const render = (counts: number[], cycle?: Record<string, unknown>) => {
    const host = { innerHTML: "" };
    H.drawHealth(host, body(counts, cycle));
    return host.innerHTML;
  };

  it("shares always total exactly 100", () => {
    for (const counts of [[1, 1, 1, 0], [1, 1, 1, 1], [2, 3, 5, 7], [0, 0, 0, 9], [1, 2, 2, 2]]) {
      expect(H.shares(counts).reduce((a, n) => a + n, 0)).toBe(100);
    }
  });

  it("gives the leftover point to the group that lost most in rounding", () => {
    // 1/3 each: 33.33 floors to 33 and leaves one point over.
    expect(H.shares([1, 1, 1, 0])).toEqual([34, 33, 33, 0]);
  });

  it("says nothing at all rather than 0% four times when a shop is empty", () => {
    expect(H.shares([0, 0, 0, 0])).toEqual([0, 0, 0, 0]);
    expect(render([0, 0, 0, 0])).toBe("");
  });

  it("colours each group and prints its share beside the count", () => {
    const html = render([3, 1, 4, 2]);
    for (const key of ["regular", "returning", "new", "lost"]) {
      expect(html).toContain('class="metric h-' + key + '"');
    }
    expect(html).toContain("<b>3<i>30%</i></b>");
    expect(html).toContain("<b>4<i>40%</i></b>");
  });

  it("no longer asks for the cycle in the tiles - the hint carries it", () => {
    const html = render([3, 1, 4, 2]);
    expect(html).not.toContain("data-gocycle");
    expect(html).not.toContain("Tell us how often");
  });

  it("spells each rule out in the shop's own numbers", () => {
    const hint = /data-info="([^"]*)"/.exec(render([1, 1, 1, 1]))![1]!;
    expect(hint).toContain("once every 3-4 weeks");
    expect(hint).toContain("New: signed up and hasn\u2019t been back yet.");
    expect(hint).toContain("Regulars: 3+ stamps from your counter (4+ visits with the sign-up)");
    // The sign-up is visit 1, and the welcome stamps are not visits 2 and 3.
    expect(hint).toContain("Signing up is visit 1");
    expect(hint).toContain("Welcome stamps fill their card but are not extra visits");
    expect(hint).toContain("average gap of 25 days or less");
    expect(hint).toContain("Returning: has come back, but doesn\u2019t yet meet the Regular criteria.");
    expect(hint).toContain("Lost: hasn\u2019t returned for more than 2\u00d7 your selected cycle (7 weeks).");
    // One line per rule, so it reads as a rule and not as a paragraph.
    expect(hint.split(String.fromCharCode(10)).length).toBeGreaterThan(6);
  });

  /**
   * The numbers in the hint come from the server, so a shop on a faster cycle
   * is told the faster shop's rule. A copy of the thresholds in the browser is
   * how a screen ends up describing a rule the server has stopped applying.
   */
  it("tightens the numbers when the shop picks a faster cycle", () => {
    const hint = /data-info="([^"]*)"/.exec(
      render([1, 1, 1, 1], { days: 14, label: "1-2 weeks", regularGapDays: 11, lostAfterDays: 21 }),
    )![1]!;
    expect(hint).toContain("average gap of 11 days or less");
    expect(hint).toContain("2\u00d7 your selected cycle (3 weeks)");
  });

  /** New before Regular before Returning before Lost — one stamp before three. */
  it("reads the rules in the order a customer meets them", () => {
    const hint = /data-info="([^"]*)"/.exec(render([1, 1, 1, 1]))![1]!;
    const at = (s: string) => hint.indexOf(s);
    expect(at("New:")).toBeLessThan(at("Regulars:"));
    expect(at("Regulars:")).toBeLessThan(at("Returning:"));
    expect(at("Returning:")).toBeLessThan(at("Lost:"));
  });

  it("owns up to the fallback until the shop has answered", () => {
    const hint = /data-info="([^"]*)"/.exec(render([1, 1, 1, 1], { chosen: false }))![1]!;
    expect(hint).toContain("set it in Shop");
  });
});
