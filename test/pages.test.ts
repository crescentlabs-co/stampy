/**
 * The pages are template strings and there is no build step, so a typo in a
 * page's inline <script> would ship silently and break that screen in the
 * browser with nothing failing here. These tests compile every inline script
 * (compile only — nothing runs, so no DOM is needed) and check the handful of
 * structural promises the server relies on.
 */
import { describe, expect, it } from "vitest";
import ts from "typescript";
import { readFileSync } from "node:fs";
import { CHURN_DAYS, FLAG_GUIDE } from "../src/health.js";
import { V2_SCREENS } from "../src/routes/dashboard.js";
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
  stopMessagesPage,
  supportPage,
  resetPage,
  shopNotOpenPage,
  staffPage,
  termsPage,
} from "../src/pages.js";
import { customerCardPage } from "../src/ui/customerPage.js";

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
  // No inline script on purpose: a consent control that needs a working
  // script is a consent control that can fail silently, so it is a form.
  ["stop messages (on)", stopMessagesPage("Kopi Corner", false)],
  ["stop messages (off)", stopMessagesPage("Kopi Corner", true)],
  [
    "landing",
    landingPage(
      { name: "Kopi Corner", reward: "Free coffee", stamps_target: 10 } as never,
      true,
      true,
      "default",
    ),
  ],
  // The poster carries one small script — print, and a share sheet for phones,
  // where print() is often a no-op. It gets its own block below as well.
  ["poster", posterPage(POSTER_CARD, "Kopi Corner", "kopi-corner", 3)],
  // The customer's own page, both ways round: a browser that already holds a
  // card for this shop, and one that does not.
  ["customer card", customerCardPage(POSTER_CARD as never, "Kopi Corner", 3, true)],
  ["customer card (no card yet)", customerCardPage(POSTER_CARD as never, "Kopi Corner", 0, false)],
];

/**
 * Pages that carry no inline script BY DESIGN, named one at a time.
 *
 * The suite below insists every other page has one, because if the extraction
 * ever stops matching, a silent zero would make the whole thing pass by
 * checking nothing. A page that genuinely has no script has to be listed here
 * rather than allowed to slip through that guard — so a page that LOSES its
 * script still fails.
 */
const SCRIPTLESS = new Set(["customer card", "customer card (no card yet)",
  "stop messages (on)", "stop messages (off)"]);

describe("inline page scripts parse", () => {
  for (const [name, html] of pages) {
    it(`${name} page has syntactically valid inline JS`, () => {
      const scripts = inlineScripts(html);
      // Guard the guard: if the extraction ever stops matching, this test would
      // otherwise pass by checking nothing.
      if (!SCRIPTLESS.has(name)) expect(scripts.length).toBeGreaterThan(0);
      else expect(scripts.length).toBe(0);
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
  /**
   * One poster, one card.
   *
   * This used to assert the opposite, and that was right while a shop could
   * hold only one card: the shop link then outlived a rename or a change of
   * ownership, and whichever card the shop had was the card it meant. With
   * several cards it stops being an answer — one link cannot say which of them
   * a printed sheet is for, so every poster in the shop handed out the same
   * one. /c/:cardId is just as permanent and does say.
   */
  it("encodes this card's own link, not the shop's", () => {
    expect(html).toContain('src="/c/default/qr?s=poster"');
    expect(html).not.toContain('src="/j/kopi-corner/qr"');
  });

  // A scan from a counter has to stay tellable from a tapped link — both are
  // otherwise an identical page view.
  it("marks a scan as coming from the printed sheet", () => {
    expect(html).toContain("?s=poster");
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
      for (const name of ["apple", "google", "notify"]) {
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
      expect(html).toContain('env.showDetails ? "Loyalty card" : "Shop"');
      // No per-surface editor sections left anywhere in the panel. (The console
      // page has data-pane of its own for its two tabs, hence the slice.)
      expect(panelOf(html)).not.toMatch(/data-pane="(apple|google|signup)"/);
      expect(html).toContain("function showSurface(name)");
      expect(html).toContain('showSurface("apple")');
      // Three icon buttons. Not the original sliding-thumb strip — a hidden
      // .seg measures zero, so the thumb sat at nothing until the first click
      // — and not the dropdown that briefly replaced it, which hid two of the
      // three behind a tap and named only the one you were on.
      expect(html).not.toContain("moveThumb(surfaceSeg)");
      expect(html).not.toContain("data-surfname");
      expect(html).toContain('data-surf="apple"');
      expect(html).toContain('data-surf="google"');
      expect(html).toContain('data-surf="notify"');
      // data-surf, NOT data-surface: that attribute marks a preview pane, and
      // switching hides every pane that is not current — which is how the
      // original strip once hid its own buttons.
      expect(html).not.toMatch(/<button[^>]*data-surface=/);
      expect(html).toContain('<div class="colorpark" data-park>');
    }
  });

  // Android is sent one colour, a near-square logo and the count as TEXT — no
  // rendered grid and no custom shape, ever. A mock that drew them would be a
  // lie the owner only discovers on somebody else's phone.
  it("previews all three surfaces, and Google as Google", () => {
    for (const html of [dash, admin]) {
      expect(html).toContain("data-pvg");   // the Android card
      // The lock screen, which replaced a mock of the printed sheet: an owner
      // can print the real poster and hold it, while the banner after a stamp
      // is the one surface they never otherwise see.
      expect(html).toContain("data-pvn");
      expect(html).toContain("function renderGoogle");
      expect(html).toContain("function renderNotify");
      expect(html).not.toContain("data-pvp");
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
      // Renamed when the cropper landed between the lift and the draw: the
      // lifted image is what the cropper is handed, and src is what comes back.
      expect(html).toContain("const lifted = liftBackdrop(img);");
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
    expect(html).toContain('env.showDetails ? "Loyalty card" : "Shop"');
    // Never display:none'd back out: that is what left it headingless.
    expect(html).not.toContain('">Loyalty card</label>');
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
    // The pill reads `plan`, never paid_at. paid_at keeps its value through a
    // downgrade — it is the date they FIRST paid — so a shop that left would
    // have gone on showing as paying for ever.
    expect(html).toContain('m.plan === "pro" ? \'<span class="paypill">Paying</span>\'');
    expect(html).not.toContain("m.paid_at ?");
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
                       "Move to pro", "Archive shop", "Delete this shop…"]) {
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
  // The block lives below the message box, folded away. The end anchor is the
  // send path's own comment, which is what starts the next thing on the panel.
  const block = html.slice(
    html.indexOf("// ---- At the counter"),
    html.indexOf("/** Send. The confirm and the POST"),
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
    expect(block).toContain("reset the staff access code under Shop");
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
   * A bar at the top saying whose shop this is, and a bar at the bottom that is
   * the whole of the navigation.
   *
   * They replaced a neon block that carried the shop name, the login email and
   * a three-tab strip at once. That block was DESIGN.md rule 1's third fenced
   * exception; both went together.
   */
  describe("the app chrome", () => {
    /** The builders as they reach the browser, so these read the real source. */
    const bars = html.slice(html.indexOf("function shopName()"),
                            html.indexOf("function wireChrome()"));

    it("names the shop at the top, and the account behind the menu", () => {
      expect(bars).toContain('(S.cards[0] || {}).shopName');
      // "Hi, <shop>", left of the bar — a dashboard greets the person running
      // the shop rather than labelling itself.
      expect(bars).toContain('<div class="shop">Hi, \' + esc(shopName())');
      expect(bars).toContain("data-menu");
      // The email moved into the menu, but it did not disappear: it is still the
      // only thing answering "which account am I in?", which starts mattering
      // the moment somebody runs two shops.
      const menu = html.slice(html.indexOf("function toggleMenu()"),
                              html.indexOf("// ---- the five screens"));
      expect(menu).toContain('class="mwho">\' + esc(S.email)');
      expect(menu).toContain("data-signout");
      // The SHELL no longer carries the old title. Scoped to the shell on
      // purpose: deadEnd() still uses a plain "Dashboard" heading, and rightly
      // — it is the screen shown when there is no shop to greet.
      // Anchored BACKWARDS from #pinwarn: several screens assign #app, and
      // indexOf would have found the login form's.
      const at = html.indexOf('id="pinwarn"');
      const shell = html.slice(html.lastIndexOf('$("#app").innerHTML', at), at);
      expect(shell).toContain("topBarHtml()");
      expect(shell).not.toContain("Dashboard</h1>");
    });

    /**
     * The chrome is built by the script, never sent in the body.
     *
     * authForm() and deadEnd() each take the whole of #app over. A nav bar in
     * the served body would be visible to a logged-out visitor who cannot use
     * any of it, and would still be sitting there on the one screen whose only
     * job is to offer a way out.
     */
    it("is drawn by the script, not served in the body", () => {
      const body = html.slice(html.indexOf("<body>"), html.indexOf("<script>"));
      expect(body).toContain('id="app"');
      expect(body).not.toContain("botnav");
      expect(body).not.toContain("topbar");
    });

    /** Five destinations, in order, and the shell renders the bar after the screen. */
    it("has one nav item per job", () => {
      for (const path of ["/", "/customers", "/create", "/manage", "/shop"]) {
        expect(bars).toContain(`p: "${path}"`);
      }
      for (const label of ["Home", "Customers", "Create", "Manage", "Shop"]) {
        expect(bars).toContain(`label: "${label}"`);
      }
      // Order is the reading order of the bar, and Create sits in the middle.
      const order = ["Home", "Customers", "Create", "Manage", "Shop"]
        .map((l) => bars.indexOf(`label: "${l}"`));
      expect(order).toEqual([...order].sort((a, b) => a - b));
      expect(order.every((i) => i > -1)).toBe(true);
    });

    /**
     * Two neon surfaces, and both of them earn it.
     *
     * The top bar is the shop's identity and DESIGN.md rule 1's one fenced
     * exception inside the app — the founder's call, the same one that was made
     * for the .greet header this bar replaced. The Create button is a primary
     * action, which rule 1 has always allowed. Nothing else may take the accent
     * as a fill.
     *
     * Text on both is --on-accent and NEVER white: #c9f73d is a pale green, so
     * white on it lands near 1.3:1.
     */
    /**
     * Neon is on Create alone now.
     *
     * The top bar carried it too, which made it one of DESIGN.md's fenced
     * exceptions. It is a thin bar that gets out of the way as you scroll, so
     * the accent has one job again: the next thing to press.
     *
     * It takes the PAGE's colour and carries no line under it. White over an
     * off-white page with a hairline between read as a band stuck across the
     * top rather than as the top of the app.
     */
    it("puts neon on Create, and nowhere else in the chrome", () => {
      const at = html.indexOf(".topbar { flex: none;");
      const bar = html.slice(at, html.indexOf("}", at));
      expect(bar).not.toContain("var(--accent)");
      expect(bar).toContain("background: var(--surface)");
      expect(bar).not.toContain("border-bottom");
      expect(bar).toContain("color: var(--ink)");
      expect(bar).not.toContain("#fff");

      const plus = html.slice(html.indexOf(".botnav .navadd .plus {"),
                              html.indexOf(".botnav .navadd.on"));
      expect(plus).toContain("background: var(--accent)");
      expect(plus).toContain("color: var(--on-accent)");
      expect(plus).not.toContain("#fff");

      // The old header is still gone; this bar is not it coming back.
      expect(html).not.toContain(".greet {");
      expect(html).not.toContain('class="greet"');
      // Active nav items are marked by weight, never by a third fill — the
      // bottom bar, Manage's pill and the designer's underline are three nav
      // controls on one screen, and DESIGN.md says they differ by shape.
      expect(html).toContain(".botnav a.on { color: var(--ink); font-weight: var(--type-navigation-weight); }");
      expect(html).not.toContain(".botnav a.on { background: var(--accent)");
    });

    /**
     * Rule 3: the focus ring is ink on light and neon on dark. #c9f73d is a
     * LIGHT ground, so the ring on the header goes ink — a neon ring on neon
     * is not a ring, and this is the one place that is easy to get backwards
     * because the bar used to be near-black.
     */
    it("rings the header's button in ink, not in neon", () => {
      expect(html).toContain(".topbar .dots:focus-visible { outline: 2px solid var(--ink);");
      expect(html).not.toContain(".topbar .dots:focus-visible { outline: 2px solid var(--accent)");
    });

    /**
     * The BOX is the content, not the bar.
     *
     * The bar is a flat neon block; the sheet under it is what has the rounded
     * corners, rounded at the TOP and tucked beneath it. That is the right way
     * round because the sheet is also the only thing that scrolls — a rounded
     * bar with the page sliding behind it showed content in the corner notches.
     */
    /**
     * The sheet runs edge to edge now.
     *
     * Its rounded top corners existed to sit against the neon bar, and the neon
     * behind #app existed only so those corners had something to show through.
     * With a white bar above a white-grounded sheet, both were describing a
     * seam that is not there.
     */
    it("runs the sheet to the edges, and floats the nav", () => {
      const sheetAt = html.indexOf(".sheet { flex: 1;");
      const sheet = html.slice(sheetAt, html.indexOf("}", sheetAt));
      expect(sheet).toContain("border-radius: 0");
      const at = html.indexOf(".topbar { flex: none;");
      const bar = html.slice(at, html.indexOf("}", at));
      expect(bar).not.toContain("border-radius");
      const nav = html.slice(html.indexOf(".botnav { position: fixed"),
                             html.indexOf(".botnav a {"));
      expect(nav).toContain("border-radius: 999px");
      expect(nav).toContain("width: calc(100% - 24px)");
      // A floating bar needs a lifted edge: content passes underneath it now,
      // and without one the two read as a single surface.
      expect(nav).toContain("box-shadow:");
      expect(nav).toContain("border: 1px solid var(--line)");
      expect(nav).not.toContain("border-top: 1px solid var(--line)");
    });

    /**
     * A fixed bar that the page does not make room for is a bar that covers the
     * last thing on every screen. The toast is the one that bites: baseCss pins
     * it 24px from the bottom, which is underneath this bar exactly.
     */
    it("reserves its own height, and lifts the toast above itself", () => {
      // The page does not scroll any more, so the SHEET carries the clearance.
      expect(html).toContain("padding: 0 var(--s3) calc(80px + env(safe-area-inset-bottom, 0px));");
      // The toast is fixed to the viewport, so the sheet's padding does nothing
      // for it — it has to be lifted on its own.
      expect(html).toContain("body.shelled .toast { bottom: calc(88px + env(safe-area-inset-bottom, 0px)); }");
      // The bar floats clear of the bottom edge, so the gap it floats in has to
      // clear the home bar as well as the bar itself.
      expect(html).toContain("bottom: calc(8px + env(safe-area-inset-bottom, 0px));");
      // The login form and the broken-page screen share #app and have no bars.
      // They keep the ordinary padded card, so the layout is scoped to a class
      // the script adds when the chrome mounts and removes when they take over.
      expect(html).toContain("function unshell()");
      const auth = html.slice(html.indexOf("function authForm(mode)"), html.indexOf("// Curated palettes"));
      expect(auth).toContain("unshell();");
      const dead = html.slice(html.indexOf("function deadEnd(email"), html.indexOf("async function app()"));
      expect(dead).toContain("unshell();");
    });

    /**
     * NOTHING scrolls behind the bar, because nothing outside the sheet scrolls
     * at all.
     *
     * A sticky bar was not enough: the page still slid behind it, and with a
     * rounded bottom you could watch content pass through the corner notches
     * and up into the staging strip. The app is a fixed-height column now — the
     * bar is locked, the sheet scrolls inside itself, and there is no "behind"
     * for anything to fall into.
     */
    it("locks the bar so nothing can scroll behind it", () => {
      expect(html).toContain("body.shelled { padding: 0; height: 100vh; height: 100dvh; overflow: hidden; }");
      expect(html).toContain(".topbar { flex: none;");
      expect(html).not.toContain(".topbar { position: sticky");
      // The sheet is the one scrolling thing.
      expect(html).toContain(".sheet { flex: 1; min-height: 0; overflow-y: auto;");
      expect(html).toContain("#app.shell { width: 100%; max-width: 480px; margin: 0 auto; padding: 0;");
      expect(html).toContain("flex: 1; min-height: 0; display: flex; flex-direction: column;");
      // 100vh first, then 100dvh: the second wins where it is understood and
      // the first is what a browser that does not understand it falls back to.
      expect(html.indexOf("height: 100vh;")).toBeLessThan(html.indexOf("height: 100dvh;"));
    });

    /**
     * The shared shell prints "Powered by PunchMe" as a sibling of #app. With
     * nothing outside the sheet scrolling, that strands it under the floating
     * nav, so it moves inside the thing that does scroll.
     */
    it("moves the footer into the part that scrolls", () => {
      expect(html).toContain('document.querySelector("body > .pby")');
      expect(html).toContain('$(".sheet").appendChild(pby)');
    });

    /** Going to a screen means the top of the SHEET; the window no longer moves. */
    it("scrolls the sheet to the top on a move, not the window", () => {
      const nav = html.slice(html.indexOf("function navigate(path, opts)"),
                             html.indexOf('window.addEventListener("popstate"'));
      expect(nav).toContain("sheet.scrollTop = 0");
      expect(nav).not.toContain("window.scrollTo");
    });
  });

  /**
   * Every screen has a real address, so the back button works and a screen can
   * be linked to. The three tabs all shared one address: back did nothing, and
   * a refresh dropped you at the first tab whatever you had been looking at.
   */
  describe("the address router", () => {
    const routes = html.slice(html.indexOf("const ROUTES = ["), html.indexOf("function matchRoute"));

    it("has a screen for every nav destination", () => {
      for (const path of ['"/"', '"/customers"', '"/create"', '"/manage"', '"/shop"']) {
        expect(routes).toContain(`[${path},`);
      }
    });

    it("matches the more specific address first", () => {
      // "/customers/:code" must be tried before "/customers", or a customer's
      // page never renders — the shorter pattern would claim it first.
      expect(routes.indexOf('"/customers/:code"')).toBeLessThan(routes.indexOf('["/customers",'));
      expect(routes.indexOf('"/manage/:tab/:id"')).toBeLessThan(routes.indexOf('["/manage",'));
      expect(routes.indexOf('"/create/:kind/:type"')).toBeLessThan(routes.indexOf('["/create",'));
    });

    it("pushes a real address and answers the back button", () => {
      expect(html).toContain("history.pushState");
      expect(html).toContain("history.replaceState");
      expect(html).toContain('window.addEventListener("popstate"');
    });

    /** An address nobody claims says so, rather than painting an empty page. */
    it("says so when an address matches nothing", () => {
      expect(html).toContain("function notFoundScreen()");
      expect(html).toContain("That address isn’t part of your dashboard.");
    });
  });

  /**
   * Every in-app link has to exist on the server too, or it 404s the moment
   * somebody refreshes on it — which is the whole reason for pushing real
   * addresses instead of hash fragments. One list, two consumers.
   */
  it("has a server route for every address it links to", () => {
    const links = new Set(
      [...html.matchAll(/data-nav="(\/[a-z/-]+)"/g)].map((m) => m[1]!),
    );
    // Built by hand in NAV and in the Create screen's markup, so read both.
    for (const m of html.matchAll(/p: "([^"]+)", label:/g)) links.add(m[1]!);
    expect(links.size).toBeGreaterThan(4);
    for (const link of links) {
      if (link === "/") continue; // dashboardRouter.get("/") — always there.
      const matched = V2_SCREENS.some((pattern) => {
        const pp = pattern.split("/"), lp = link.split("/");
        return pp.length === lp.length &&
          pp.every((seg, i) => seg.startsWith(":") || seg === lp[i]);
      });
      expect(matched, `${link} has no entry in V2_SCREENS`).toBe(true);
    }
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

  // The tab strip is gone entirely: five destinations, each with its own
  // address, replaced three that all shared one.
  it("has no tab strip left behind it", () => {
    for (const tab of ["customers", "card", "shop", "share", "account", "access", "home"]) {
      expect(html).not.toContain(`data-tab="${tab}"`);
    }
  });

  // Home is its own screen again, and it is the root address — the one thing
  // a bookmark of "/dashboard" should land on.
  it("makes Home the root address, not a tab", () => {
    expect(html).toContain('label: "Home"');
    expect(html).toContain('p: "/", label: "Home"');
  });

  // The Access tab existed only because the PIN hung off each café row, giving
  // an owner with two cards two PINs and two stamper links for one counter.
  it("keeps one PIN, under Shop", () => {
    expect(html).toContain('label: "Shop"');
    expect(html).toContain("/staff-pin");
  });

  /**
   * Each link sits with the thing it belongs to.
   *
   * The stamper link stays with the PIN that unlocks it, under Shop → Staff.
   * The customer-facing ones — sign-up page, poster, QR, customer page — moved
   * to the programme they share. A poster is a fact about one programme, and
   * once a shop can have more than one, "the" sign-up link stops meaning
   * anything. That is the V2 rule "multiple programmes means multiple QRs",
   * shown rather than written down.
   */
  it("keeps each link with the thing it belongs to", () => {
    // The card id must stay on the staff link: a bare /staff once resolved to
    // whoever owned the café literally named "default" — a stranger's counter.
    expect(html).toContain('href="/staff?c=');
    // The PIN comes first, then the link it gates.
    expect(html.indexOf("data-pinlabel")).toBeLessThan(html.indexOf('href="/staff?c='));
    // Sharing left Shop for the programme page.
    const shop = html.slice(html.indexOf("function accountPanel()"), html.indexOf("wireEyes(div)"));
    expect(shop).not.toContain("/poster");
    expect(shop).not.toContain("?s=link");
    const detail = html.slice(html.indexOf("function rewardDetailScreen(id)"),
                              html.indexOf("function dealLine(card)"));
    expect(detail).toContain("/poster");
    expect(detail).toContain("?s=link");
  });

  /**
   * Shop is configuration and nothing else: what the shop is, who stamps for
   * it, and the login that owns it.
   */
  it("splits Shop into shop, staff and account", () => {
    const shop = html.slice(html.indexOf("function accountPanel()"), html.indexOf("wireEyes(div)"));
    expect(shop).toContain('<h2 class="sec first">Shop information</h2>');
    expect(shop).toContain('<h2 class="sec">Staff</h2>');
    expect(shop).toContain('<h2 class="sec">Account</h2>');
    // The visit cycle and the PIN — the two set-once answers the setup banner
    // asks for — are both still here and still real.
    expect(shop).toContain("data-cycle");
    expect(shop).toContain("data-setpin");
    // Name and logo are SHOWN here and edited where the card is: two boxes
    // setting one value is how they come to disagree.
    expect(shop).toContain("Shop name");
    expect(shop).toContain("logothumb");
    expect(shop).toContain("data-golook");
    // The plan block is REAL now — merchants.plan, merchants.archived_at and
    // the trial deadline — so it carries no example chip and reads no mock.
    expect(shop).toContain('<h2 class="sec">Plan</h2>');
    expect(shop).toContain("planLabel()");
    expect(shop).toContain("statusLabel()");
    expect(shop).toContain("trialLabel()");
    // The chip and the mock are the two things that must NOT come back: either
    // one means the screen went back to inventing an owner's billing state.
    expect(shop).not.toContain("MOCK_ACCOUNT");
    expect(shop).not.toContain('Plan\${EG}');
  });

  /**
   * Whether campaigns are switched off is the SERVER's answer, read back.
   *
   * The gate exists twice on purpose — on the tile that links to campaigns and
   * on the campaign screen itself — because every campaign address is real and
   * refreshable, so a bookmark made during the trial would walk straight past a
   * tile-only check. Neither may compute the rule for itself.
   */
  it("reads the campaign gate from the server and never recomputes it", () => {
    const gate = html.slice(html.indexOf("function campaignsAllowed()"),
                            html.indexOf("function accountPanel()"));
    expect(gate).toContain("S.account.allows.campaigns");
    // No trial arithmetic in the browser: a date compared here is a second
    // rule, and the one the owner sees would drift from the one enforced.
    expect(gate).not.toContain("trialEndsAt");
    expect(gate).not.toContain("Date.now");
    // Both the tile and the screen behind it consult it.
    expect(html.slice(html.indexOf("function createScreen()"),
                      html.indexOf("function createPickScreen"))).toContain("campaignsAllowed()");
    expect(html.slice(html.indexOf("function createPickScreen"),
                      html.indexOf("function createStepScreen"))).toContain("campaignsAllowed()");
  });

  /** Signing out has one home now, and Shop points at it rather than repeating it. */
  it("signs out from the menu, and says where that is", () => {
    const shop = html.slice(html.indexOf("function accountPanel()"), html.indexOf("wireEyes(div)"));
    expect(shop).not.toContain("data-out");
    expect(shop).toContain("Signing out is in the ⋯ menu");
    expect(html).toContain("data-signout");
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
    // Re-run on every screen the router paints, exactly as it was re-run on
    // every tab switch — the hints are wired by delegation from their host.
    expect(html).toContain("wireInfo(host)");
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
    // From the preview box's close to the save button: the editor exactly.
    // It used to slice from data-testout, which was the test-card block — that
    // has moved to Manage, so the anchor moved to the fold that opens the
    // editor itself.
    const editor = html.slice(html.indexOf("Customise the design"), html.indexOf('data-a="save"'));
    expect(editor).toContain("Customise the design");
    // FOUR named sections now, plus the rules heading below them. The design
    // half was one long scroll of unrelated controls under a single heading —
    // a logo, a band, a stamp and five colours all reading as one list.
    for (const name of ["Personalize", "Stamps", "Banner", "Colours"]) {
      expect(editor).toContain(`>${name}`);
    }
    // The old row names are gone with the rows: the two logos are a pair of
    // boxes wearing their platform's mark, and the band is now the Banner
    // section rather than the third thing in a list about logos.
    for (const gone of ["Apple logo<", "Android logo<", "Stamp logo", "Band artwork"]) {
      expect(editor).not.toContain(gone);
    }
    expect(html).not.toContain("Band texture");
    expect(html).not.toContain("Stamp icon");
  });

  // Three cohort rows and a card dropdown said what one line under the button
  // says. The limit was never enforced here anyway — canNudge decides.
  it("sends notifications from one box with one button", () => {
    expect(html).toContain("Notifications");
    expect(html).toContain("Push notification");
    // The line accounts for the whole group, not just the sendable part.
    expect(html).toContain('</strong> of " + total');
    expect(html).toContain('" at the weekly limit"');
    expect(html).not.toContain("data-buckets");
    expect(html).not.toContain("Bring people back");
    expect(html).toContain("Find a customer");
    // The heading carries NO hint. The cap has moved four times, and a bubble
    // restating it in words is one more place for it to be written down wrongly
    // — the two lines under the button say who this reaches, in live numbers.
    expect(html).toContain('<h2 class="sec">Notifications</h2>');
    expect(html).not.toMatch(/every 7 days/);
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

  /**
   * The design page reads at the sizes the rest of the app uses.
   *
   * DESIGN.md gives the whole product three sizes and one exception. This
   * panel had eight of its own, set in raw rem, and the result was a screen
   * that looked a size larger than every other one — which is what the founder
   * actually noticed.
   *
   * The CARD MOCKS are deliberately not in this list. Their sizes transcribe
   * what Apple and Google really print, and putting them on our scale would
   * make the preview lie about the finished card.
   */
  it("sizes its own text from the scale, not from raw rem", () => {
    const css = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
    for (const sel of [
      ".dfold > summary", ".swbox .swname", ".swbox .swval",
      ".tgtext", ".chipcustom", ".stampnow", ".lbup", ".lbcap", ".crpal-n",
    ]) {
      const at = css.indexOf(sel + " {");
      expect(at, sel + " is gone from the stylesheet").toBeGreaterThan(-1);
      const rule = css.slice(at, css.indexOf("}", at));
      if (!rule.includes("font-size")) continue;
      expect(rule, sel + " sets a raw font size instead of a token")
        .toMatch(/font-size: var\(--t-/);
    }
  });

  /**
   * One list, not a row of buttons — and still not a grid of preset tiles,
   * which is the mistake this control has already made once.
   */
  it("sets the stamp from one list, with your own picture at the end of it", () => {
    expect(html).not.toContain("data-stamptpl");
    expect(html).not.toContain("STAMP_ICONS");
    expect(html).toContain("data-stamppick");
    expect(html).toContain("STAMP_PRESETS");
    expect(html).not.toContain('data-a="rmstamp"');
    expect(html).toContain("data-stampimg");
  });

  /**
   * Every ready-made shape obeys the card's Stamps colour, and a colour emoji
   * cannot: it ignores fillStyle, so a red heart stayed red on a green card and
   * no colour setting could touch it. So the type-your-own-emoji route is gone
   * and the presets are plain text glyphs.
   */
  it("offers no emoji route, and no shape that ignores the card's colour", () => {
    expect(html).not.toContain("data-emoji");
    expect(html).not.toContain("askEmoji");
    // The variation selector is what makes a glyph render as a colour emoji.
    const presets = html.slice(html.indexOf("const STAMP_PRESETS = ["),
                               html.indexOf("function stampNow()"));
    expect(presets).not.toContain("\uFE0F");
  });

  /**
   * The file input must be reachable by SCRIPT, and display:none is not.
   *
   * Safari ignores a scripted .click() on a display:none file input, so
   * "Upload your own" opened nothing at all. The five colour pickers further
   * down are parked for the same reason, and say so.
   */
  /**
   * The file input is opened by a LABEL, never by script.
   *
   * It used to be an option inside the stamp list, which called .click() on a
   * hidden input from the list's change handler. That cannot work on a phone:
   * iOS opens a select as a native sheet, change fires once it is dismissed,
   * and by then the tap that would have authorised opening a file picker is
   * gone — so the option was chosen and nothing happened at all. A label
   * wrapping the input is the same shape the logo and banner boxes use, and
   * those have always worked.
   */
  it("opens the stamp picker with a label, not a scripted click", () => {
    expect(html).toContain('<label class="lbup btn btn-ghost">Your own<input data-stampimg');
    expect(html).not.toContain('q("[data-stampimg]").click()');
    expect(html).toContain('accept="image/*"');
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
   * The look half explains itself, so it carries no ⓘ at all.
   *
   * Every control under Personalize, Stamps, Banner and Colours changes the
   * card in front of you the moment you touch it. A bubble of prose explaining
   * a picture you can see is jargon in front of a thing that needs none — and
   * it was on nearly every row.
   *
   * The one explanation that survives is the one that is CONDITIONAL: it says
   * something is being lost right now, so it is on screen only when something
   * is, in one plain line rather than behind a dot.
   */
  it("carries no info bubbles in the look half, and keeps the one real warning", () => {
    const look = html.slice(html.indexOf(">Personalize</label>"),
                            html.indexOf("================= LOYALTY CARD"));
    expect(look).not.toContain("info(");
    // And no standing warning either. The one that survived said a wide logo
    // gets cropped on Android — true, and the only remedy was to upload the
    // small one, which is the box beside it. A warning whose only answer is
    // the next control should have been that control's label.
    expect(html).not.toContain("Android is cropping the ends off it");
    expect(html).not.toContain('class="marknote"');
    expect(look).toContain(">Wide</span>");
    expect(look).toContain(">Small</span>");
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

  /**
   * The logo is CROPPED to the slot Apple actually gives it.
   *
   * It used to keep whatever shape was uploaded, which sounds kinder and was
   * not: the slot is 160×50pt whatever we send, so a tall picture arrived as a
   * tall picture scaled down into a wide gap and ended up a fraction of the
   * size it should have been. The cropper could do nothing about it either — a
   * frame the same shape as the image has nothing to move inside it.
   *
   * "keep" itself stays, because the stamp shape still uses it: that one is a
   * silhouette we trim and refill, so its own outline IS the thing.
   */
  it("crops the logo to Apple's logo band, and keeps the stamp's own shape", () => {
    expect(html).toContain('fit === "keep"');
    expect(html).toContain('}, "keep", false);');
    expect(html).not.toContain('}, "keep");');
    // 480x150 is Apple's logo band at full retina — the most the card can
    // possibly show. It was 1280x400, two and a half times more picture than
    // that, and 512,000 pixels: a flat logo squashes to nothing at that size
    // and a PHOTOGRAPH comes out over a megabyte and is refused outright.
    expect(html).toContain('wireUpload("[data-logo]", "logo", 480, 150');
  });

  it("builds the band from one colour, not a texture and not an uploaded photo", () => {
    expect(html).toContain('data-f="bandColor"');
    expect(html).not.toContain("data-bandtex");
    expect(html).not.toContain("data-banner]"); // the photo upload input
    expect(html).not.toContain("rmbanner");
  });

  /**
   * firstGrapheme stays, and is still tested on its own further down. It is a
   * general helper on the page, not the designer's — the emoji stamp route
   * that used to call it is gone, because a colour emoji cannot take the
   * card's Stamps colour.
   */
  it("keeps firstGrapheme, and no longer takes an emoji as the stamp", () => {
    expect(html).toContain("firstGrapheme");
    expect(html).not.toContain("data-emoji");
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
/**
 * The address router, running the shipped source.
 *
 * Compiling it proves it has no typos; it does not prove "/customers/K4M7XQ"
 * reaches the customer screen rather than being swallowed by "/customers". The
 * patterns are matched in order and the ordering is the whole correctness
 * argument, so it is worth running rather than eyeballing.
 *
 * matchRoute and here() are pulled out of the real page text — not retyped —
 * so this cannot drift from what ships.
 */
describe("the router, actually run", () => {
  const html = dashboardPage(true, "");
  const src = (from: string, to: string) => html.slice(html.indexOf(from), html.indexOf(to));

  const R = new Function(
    "location",
    src("const ROOT =", "/**\n     * Go somewhere.") +
      src("function matchRoute(", "function render()") +
      // The pattern list, with each screen replaced by its own name: this suite
      // is about which route wins, not what it paints.
      html.slice(html.indexOf("const ROUTES = ["), html.indexOf("/** Match one pattern"))
        .replace(/\(p?\) => [a-zA-Z]+\([^)]*\)/g, "0") +
      "return { here, matchRoute, ROUTES };",
  );

  const at = (path: string) => R({ pathname: "/dashboard" + path });

  it("reads the address inside the app, whatever the trailing slash", () => {
    expect(at("").here()).toBe("/");
    expect(at("/").here()).toBe("/");
    expect(at("/customers/").here()).toBe("/customers");
    expect(at("/manage/rewards").here()).toBe("/manage/rewards");
  });

  /** The pattern each address actually lands on, by the real first-match rule. */
  const resolve = (path: string) => {
    const { here, matchRoute, ROUTES } = at(path);
    for (const [pattern] of ROUTES) if (matchRoute(pattern, here())) return pattern;
    return null;
  };

  it("sends every nav destination to its own screen", () => {
    expect(resolve("")).toBe("/");
    expect(resolve("/customers")).toBe("/customers");
    expect(resolve("/create")).toBe("/create");
    expect(resolve("/manage")).toBe("/manage");
    expect(resolve("/shop")).toBe("/shop");
  });

  /**
   * The bug this ordering exists to prevent: a two-segment pattern claiming a
   * one-segment address, so a customer's page silently renders the list again.
   */
  it("prefers the deeper pattern over the shallower one", () => {
    expect(resolve("/customers/K4M7XQ")).toBe("/customers/:code");
    expect(resolve("/manage/rewards/default")).toBe("/manage/:tab/:id");
    expect(resolve("/manage/rewards")).toBe("/manage/:tab");
    expect(resolve("/create/reward/stamps")).toBe("/create/:kind/:type");
    expect(resolve("/create/reward")).toBe("/create/:kind");
    expect(resolve("/shop/staff")).toBe("/shop/:section");
  });

  it("pulls the placeholder out of the address", () => {
    const { matchRoute } = at("");
    expect(matchRoute("/customers/:code", "/customers/K4M7XQ")).toEqual({ code: "K4M7XQ" });
    expect(matchRoute("/manage/:tab/:id", "/manage/rewards/default"))
      .toEqual({ tab: "rewards", id: "default" });
    // A shop id can carry a space once it reaches an address.
    expect(matchRoute("/manage/:tab/:id", "/manage/rewards/a%20b").id).toBe("a b");
  });

  it("claims nothing it has no screen for", () => {
    expect(resolve("/nope")).toBe(null);
    expect(resolve("/customers/a/b")).toBe(null);
    // Every address the server serves must land somewhere, or a refresh shows
    // the not-found screen on a link the app itself printed.
    for (const path of ["/customers", "/customers/X", "/create", "/create/reward",
                        "/create/reward/stamps", "/manage", "/manage/rewards",
                        "/manage/rewards/default", "/shop", "/shop/staff"]) {
      expect(resolve(path), path + " resolves to no screen").not.toBe(null);
    }
  });
});

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

  /**
   * Shown at zero, not hidden. A section that appears only once it has
   * something to say is a section nobody knows exists — and this one has to be
   * found BEFORE a shop has customers, since it is half the reason to answer
   * the return-cycle question at all.
   */
  it("still renders the four groups when a shop has no customers yet", () => {
    const html = render([0, 0, 0, 0]);
    expect(html).toContain("Customer health");
    for (const key of ["regular", "returning", "new", "lost"]) {
      expect(html).toContain('class="metric h-' + key + '"');
    }
    // But no percentages: four tiles reading "0 0%" is noise, not information.
    expect(html).not.toContain("%</i>");
    expect(H.shares([0, 0, 0, 0])).toEqual([0, 0, 0, 0]);
  });

  /** Nothing to draw at all is still nothing — an API with no groups. */
  it("draws nothing when the server sent no groups", () => {
    const host = { innerHTML: "" };
    H.drawHealth(host, { health: [], cycle: {} });
    expect(host.innerHTML).toBe("");
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
    expect(hint).toContain("Signing up counts as visit 1");
    expect(hint).toContain("welcome stamps are not");
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

describe("the visit-cycle setting", () => {
  const html = dashboardPage({ emailConfigured: true } as never);

  /**
   * A dropdown, not a row of buttons. Three ranges as buttons wrapped to three
   * lines on a phone and read as three actions rather than one choice.
   */
  /**
   * A screen's title is the FIRST heading on it, and reads at the size Home's
   * do. Headings further down — Info, Status, Share it — stay a rank below:
   * making every one a title flattens the hierarchy rather than fixing it.
   */
  it("sets every screen's title at the size Home's headings are", () => {
    const css = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
    expect(css).toContain(".sec.first { margin-top: 0; font-size: var(--type-page-title-size); }");
    // A section heading further down a screen is still the smaller one.
    expect(css).toMatch(/\.sec \{ font-size: var\(--type-section-heading-size\)/);
  });

  it("is one dropdown holding the three ranges", () => {
    expect(html).toContain("<select data-cycle");
    expect(html).toContain('<option value="7">1–2 times a week</option>');
    expect(html).toContain('<option value="14">Once every 1–2 weeks</option>');
    expect(html).toContain('<option value="28">Once every 3–4 weeks</option>');
    // The old button row, and the CSS that only it used, are gone.
    expect(html).not.toContain("data-cycles");
    expect(html).not.toContain("cyclerow");
  });

  /**
   * "2-3 weeks" is not offered any more, but the shops that picked it are
   * still on it — the server still honours 21. Hiding the option outright
   * would show those shops an empty box and make their own answer look
   * unanswered, so it is present and hidden, and revealed for them alone.
   */
  it("keeps the retired range for the shops still on it", () => {
    expect(html).toContain('<option value="21" hidden>Once every 2–3 weeks</option>');
    expect(html).toContain("legacy.hidden = S.cycleDays !== 21");
  });

  /** Nothing is preselected until the shop has actually answered. */
  it("offers an unchosen option so the fallback is never shown as a choice", () => {
    expect(html).toContain('<option value="">Choose one…</option>');
  });

  /**
   * The hint has to tell a shop owner what the setting DOES and what it does
   * not touch. It is not the place to explain the segmentation maths.
   */
  it("explains itself in plain words, briefly", () => {
    // The panel is built in the browser, so this hint is still an info("…")
    // CALL in the page source rather than a rendered data-info attribute.
    const hint = /How often you'd expect a regular to come in\.[^"]*/.exec(html)?.[0] ?? "";
    expect(hint).toContain("New, Returning, Regular and Lost");
    expect(hint).toContain("changes nothing about your card");
    // Short enough to read in the bubble. It used to open with a line about
    // barbers and cafes that told an owner nothing about what the setting does.
    expect(hint.length).toBeLessThan(260);
    expect(hint).not.toContain("barber");
  });
});

describe("Home", () => {
  const html = dashboardPage({ emailConfigured: true } as never);
  const home = html.slice(html.indexOf("function homeScreen()"), html.indexOf("const ICON_CARET"));
  const cmp = html.slice(html.indexOf("const ICON_CARET"), html.indexOf("function shopChart(host, s)"));

  /**
   * Two figures and one chart, and nothing else on the screen.
   *
   * It carried four tiles, a sign-ups sparkline, a sentence of commentary, the
   * programme list and a campaigns block. The founder asked for the short
   * version. Manage still lists the programmes and the campaigns, so this
   * removed a duplicate view rather than the only way to reach anything.
   */
  it("shows two figures under one heading", () => {
    expect(home).toContain('<h2 class="sec first">Dashboard</h2>');
    expect(home).toContain('tile("Customers"');
    expect(home).toContain('tile("Loyalty revenue (');
    for (const gone of ["Rewards given", "How your shop is doing", "data-signups"]) {
      expect(home).not.toContain(gone);
    }
    expect(html).not.toContain("function drawInsight");
    expect(html).not.toContain("function campaignBlock");
    // The lists became charts. A list answers "what have I got"; the question a
    // shop with more than one programme has is which is doing better.
    expect(html).not.toContain("function summaryRow");
    expect(html).not.toContain("function homeProgrammes");
    expect(home).toContain("comparison(d.querySelector(\"[data-programs]\"), PROGRAMME_SPEC");
    expect(home).toContain("comparison(d.querySelector(\"[data-campaigns]\"), CAMPAIGN_SPEC");
  });

  /** The window governs the tiles as well as the chart, so there is one of it. */
  it("offers three windows and starts on seven days", () => {
    for (const w of ["7", "30", "all"]) expect(home).toContain('data-w="' + w + '"');
    expect(home).toMatch(/class="on" data-w="7"/);
    expect(home).toContain('load("7")');
  });

  /**
   * One request fills the whole screen. Two would let the tiles and the chart
   * answer the same question differently, which is the failure this codebase
   * has shipped twice.
   */
  it("fills the tiles and the chart from one request", () => {
    expect((home.match(/await api\(/g) || []).length).toBe(1);
    expect(home).toContain('api("/series?window=" + win)');
    // Tapping 7 -> 30 -> 7 can land out of order; the tiles must end up
    // agreeing with the tab that is lit, not with whichever reply was slowest.
    expect(home).toContain("if (mine !== live) return;");
  });

  /**
   * The change is a subtraction of one number from itself a week ago, so it
   * can be signed. All-time has nothing before it and says so, rather than
   * showing a confident zero.
   */
  it("colours the change by direction, and admits when there is none", () => {
    expect(home).toContain('const dir = diff > 0 ? "up" : diff < 0 ? "down" : "flat";');
    // The coloured part is the change and only the change. What it is measured
    // against goes on its own line, unshouted, and all-time says so there.
    expect(home).toContain('if (before === null || before === undefined) return "";');
    expect(home).toContain('"vs last week"');
    expect(home).toContain('"vs last month"');
    expect(home).toContain('"all time"');
    // Green up and rust down are the customer segments' own two hues, not a
    // fifth colour, and neither of them is the neon.
    const css = html.slice(html.indexOf(".delta {"), html.indexOf(".delta.flat"));
    expect(css).toContain("#15803d");
    expect(css).toContain("#9a3412");
    expect(css).not.toContain("--accent");
  });

  /**
   * The neon in the chart is a deliberate exception, granted by the founder,
   * and it is a FILL. Rule 1 still holds for everything else: #c9f73d on white
   * cannot be read, so nothing is drawn in it as a line on its own or as text.
   */
  it("puts the neon under the visits line and nowhere else in the chart", () => {
    const css = html.slice(html.indexOf(".chart .carea"), html.indexOf(".chartax {"));
    // A gradient, so the fill reads as depth under the line rather than a slab.
    expect(css).toContain(".carea { fill: url(#pmChartFade)");
    expect(css).toMatch(/\.cg0 \{ stop-color: var\(--accent\)/);
    expect(css).toMatch(/\.cg1 \{[^}]*stop-opacity: \.02/);
    expect(css).toMatch(/\.cvis \{[^}]*stroke: var\(--accent-2\)/);
    // The second series is ink, so the two are told apart by fill as well as
    // by colour — colour alone excludes anyone who cannot separate the hues.
    expect(css).toMatch(/\.crew \{[^}]*stroke: var\(--ink\)/);
    expect(css).toMatch(/\.crew \{[^}]*fill: none/);
  });

  /**
   * The fill closes on the ZERO line, not on the floor of the box. Closed at
   * the floor it hangs ten pixels below zero, which paints a green band under a
   * day that had nothing in it and reads as a negative number.
   */
  it("closes the filled area on zero, not below it", () => {
    const geo = html.slice(html.indexOf("function chartGeometry(rawVis, rawRew)"),
                           html.indexOf('/** "Mon 25 Aug"'));
    expect(geo).toContain('area: visLine + " L" + W + " " + yAt(0).toFixed(1)');
    expect(geo).not.toContain('area: visLine + " L" + W + " " + H');
  });

  /** A tap answers over the point, not in a line pinned to the top of the card. */
  it("answers a tap with a tooltip carrying the date and both figures", () => {
    const chart = html.slice(html.indexOf("function shopChart(host, s)"),
                             html.indexOf("function chartGeometry(rawVis, rawRew)"));
    expect(chart).toContain("bucketLabel(p.at, s.bucketDays)");
    expect(chart).toContain('<i class="sw v"></i>Visits<b>');
    expect(chart).toContain('<i class="sw r"></i>Rewards<b>');
    // Measured, not guessed: the card is wider than the gap at either end, so
    // an unclamped tooltip on the last point hangs off the side and is clipped.
    expect(chart).toContain("tip.offsetWidth");
    expect(chart).toContain("Math.max(half, Math.min(wide - half, wanted))");
    // A finger reports no buttons, so a drag is tracked with a flag.
    expect(chart).toContain('wrap.addEventListener("pointerdown"');
    expect(chart).toContain("if (down) pick(e);");
  });

  /**
   * Every name on this screen is set the same way — a tile's label, the chart's
   * two series, the chart's hint. They were three treatments, one of them
   * uppercase, which is what made them read as three different kinds of thing.
   */
  it("sets the screen in three sizes, each with a job", () => {
    // Home reached FIVE text sizes — 11, 13, 15, 18 and 24 — one sensible step
    // at a time, which is what made it read as generated. Three now: 24 for the
    // title, both headings and every number; 14 for a row's name and figure;
    // 12 for every other word.
    for (const cls of [".metrics .metric b {", ".cfig b {"]) {
      const rule = html.slice(html.indexOf(cls), html.indexOf("}", html.indexOf(cls)));
      expect(rule, cls + " is off the big size").toContain("var(--t-xl)");
    }
    for (const cls of [".cmpmetric {", ".popopt {"]) {
      const rule = html.slice(html.indexOf(cls), html.indexOf("}", html.indexOf(cls)));
      expect(rule, cls + " is off the row size").toContain("var(--t-md)");
    }
    for (const cls of [".mlabel {", ".mnote {", ".delta {", ".chartax {", ".vval {",
                       ".vnames span {", ".cmpfoot {", ".chartkey {", ".ctip .cd {",
                       ".ctip .cr {", ".winsel button {"]) {
      const rule = html.slice(html.indexOf(cls), html.indexOf("}", html.indexOf(cls)));
      expect(rule, cls + " is off the subtext size").toContain("var(--t-sm)");
    }
    // Home's headings are a rank above every other screen's, so the rule hangs
    // off the screen's own class rather than resizing .sec for everybody.
    expect(html).toContain(".sec.first { margin-top: 0; font-size: var(--type-page-title-size); }");
    expect(html).toContain(".sec { font-size: var(--type-section-heading-size)");
    const label = html.slice(html.indexOf(".mlabel {"), html.indexOf(".mnote {"));
    expect(label).not.toContain("uppercase");
    // The change beside a number is a colour, not a size and not a weight.
    const dAt = html.indexOf("\n    .delta {");
    expect(dAt, ".delta rule is gone").toBeGreaterThan(0);
    expect(html.slice(dAt, html.indexOf("}", dAt))).toContain("var(--t-sm)");
    // The hint line is gone; the tooltip is the answer.
    expect(html).not.toContain("Tap the chart to read a");
  });

  /**
   * The window highlight has to be right on arrival. moveThumb measures
   * offsetWidth, which is 0 for an element that is not in the document yet —
   * so calling it during the build drew the highlight zero pixels wide and the
   * selector looked like nothing was chosen until you tapped it.
   */
  it("lights the chosen window before anyone taps it", () => {
    expect(home).toContain("requestAnimationFrame(() => moveThumb(seg))");
    expect(home).not.toMatch(/\n {6}moveThumb\(seg\);/);
    for (const short of [">7d<", ">30d<", ">All<"]) expect(home).toContain(short);
  });

  /**
   * Two facts a side and no more. Manage still carries customers, stamps and
   * rewards per programme; Home answers how they compare and stops there.
   */
  /**
   * One metric at a time, so ONE series, so one colour and no legend. Bars are
   * never shaded by size: that would encode the order twice and make the colour
   * mean rank, which breaks the moment a filter changes who is in the chart.
   */
  it("compares programmes and campaigns in one chart each", () => {
    expect(cmp).toContain("of: (r) => (r.customers ? r.visits / r.customers : 0)");
    expect(cmp).toContain("of: (r) => (r.targeted ? (r.returned / r.targeted) * 100 : 0)");
    // Rows are never added together — comparing two versions of one card is the
    // entire point — and the order is recency, not size.
    expect(cmp).toContain("sort((a, b) => a.daysAgo - b.daysAgo).slice(0, CMP_MAX)");
    expect(cmp).toContain("const CMP_MAX = 5");
    // The type lists are READ from the arrays the Create screen already holds,
    // so a fifth type appears in the filter the day it is added...
    expect(cmp).toContain("REWARD_TYPES.map((t) => ({ k: t.k, name: t.name }))");
    expect(cmp).toContain("CAMPAIGN_TYPES.map((t) => ({ k: t.k, name: t.name }))");
    // ...as a FUNCTION. Both arrays are declared further down the same script,
    // so evaluating them where the spec is built reads a const in its temporal
    // dead zone: a ReferenceError at load that blanks the whole dashboard, with
    // valid syntax and a defined name, which no compile check can see.
    expect(cmp).toContain("types: () => REWARD_TYPES");
    expect(cmp).toContain("types: () => CAMPAIGN_TYPES");
    expect(cmp).not.toMatch(/types: REWARD_TYPES/);
    // The cap is visible: past five, the unticked options go disabled rather
    // than accepting a tap that silently does nothing.
    expect(cmp).toContain("!on && chosen >= CMP_MAX");
    /**
     * Hand-picking is its OWN control now, and it stays open.
     *
     * It was a third group inside the funnel, and the popover closes on every
     * tap — so choosing three cards was open-tap, open-tap, open-tap. Worse,
     * the two fought: picking cards made type and status do nothing, choosing a
     * type silently wiped the picks, and the ticks stayed on screen either way
     * showing a state that was not applied.
     */
    expect(cmp).toContain("data-picks");
    expect(cmp).toContain("function openPicks()");
    // The funnel stands down visibly while picks are on, rather than pretending.
    expect(cmp).toContain('(state.picked.length ? " disabled" : "")');
    expect(cmp).toContain("Clear, and use the filter");
    // ...and the funnel no longer lists the rows at all.
    const funnel = cmp.slice(cmp.indexOf("fBtn.onclick"), cmp.indexOf("pop.open(\"right\", groups"));
    expect(funnel).not.toContain("pick:");
    // One popover, opened by EITHER control — two would let both menus be open
    // at once, over each other. It counted the div this used to build inline;
    // popover now lives in the kit (the designer's surface switcher needs it
    // too), so the thing to hold is that both buttons share one instance.
    expect(cmp).toContain("popover(wrap, [mBtn, fBtn, pBtn])");
    expect((cmp.match(/popover\(/g) || []).length).toBe(1);
    const pop = html.slice(html.indexOf(".popopt.on::before"), html.indexOf(".popopt:disabled"));
    expect(pop).not.toContain("--accent");
    // Both figures ignore the window selector, and the card says so out loud.
    expect(cmp).toContain('"All time · newest first"');
  });

  /**
   * Bars STAND UP from a shared baseline. Five heights against one floor is
   * what makes them comparable at a glance; a fill running left to right is a
   * progress bar, and progress is a different question from "which is bigger".
   *
   * Nothing in the card is a link. It is a chart, not a menu — the founder
   * asked for the detail pages to come off it.
   */
  it("draws standing bars and nothing clickable", () => {
    expect(cmp).toContain('<div class="vcol" style="--h:');
    expect(cmp).toContain('<div class="vnames">');
    expect(cmp).not.toContain("cmpbar");
    // The BARS are not links — the detail pages came off this screen. The one
    // anchor in here is the empty state's create button, which is the whole
    // point of an empty state and is nowhere near a bar.
    const plot = cmp.slice(cmp.indexOf("const cols = rows.map"));
    expect(plot).not.toContain("data-nav");
    expect(plot).not.toContain("<a ");
    // A set of all-zero rows draws nothing rather than dividing by zero, and
    // the tallest stops short of the ceiling so its own value label fits above.
    expect(cmp).toContain("Math.max.apply(null, vals.concat([0])");
    expect(cmp).toContain("max > 0 && isFinite(v) && v > 0 ? (v / max) * 88 : 0");
    // TWO kinds of nothing, told apart. "Nothing matches that filter" in front
    // of a shop that has never made a programme blames them for a filter they
    // never set.
    expect(cmp).toContain("Nothing matches that filter.");
    expect(cmp).toContain("spec.empty.line");
    expect(cmp).toContain("all.length");
  });

  /**
   * The panel hung off the whole card, whose 100% is below the bars and the
   * footnote — so it opened a chart's height away from the button that opened
   * it. Anchored to the header row, it lands under the control you pressed.
   */
  it("opens the filter panel under the button that opens it", () => {
    expect(cmp).toContain('host.querySelector(".cmphead")');
    expect(cmp).not.toContain("cmpwrap");
    const rule = html.slice(html.indexOf(".cmphead {"), html.indexOf("}", html.indexOf(".cmphead {")));
    expect(rule, "the header row has to be the thing the panel is measured from")
      .toContain("position: relative");
  });

  /**
   * The health tiles must read as the same family as these. They carried their
   * own smaller type, which made the page look like two grids that had not been
   * designed together.
   */
  it("leaves every other metric grid at the size it was", () => {
    // .metric is Home's two tiles, the health tiles on Customers, and the
    // three-up grids on the detail screens. Only Home's went to hero size; the
    // health tiles take theirs from the shared rule and must keep doing so, or
    // four numbers across a phone stop fitting their own boxes.
    expect(html).not.toMatch(/\.totals\.health \.metric b \{[^}]*font-size/);
    const shared = html.slice(html.indexOf("\n    .metric b {"), html.indexOf(".metrics .metric b {"));
    expect(shared).toContain("var(--t-xl)");
    // And the label those grids use is a bare span, not .mlabel.
    expect(html).toContain(".metric span:not(.mlabel):not(.mnote)");
  });

  /**
   * Real data or an honest empty state — never a blend.
   *
   * Two example programmes used to be concatenated onto the owner's own rows
   * here, told apart only by a dimmed row and a small chip. An owner scanning
   * for "which of mine is winning" could read somebody's invention as their
   * own result, so they are gone from the product entirely.
   */
  it("charts real programmes only, and says so plainly when there are none", () => {
    expect(cmp).not.toContain("MOCK_");
    expect(html).not.toContain("MOCK_PROGRAMS");
    expect(html).not.toContain("MOCK_CAMPAIGNS");
    expect(html).not.toContain("mockCard");
    // Each chart states its own "nothing yet" line and the way out of it.
    expect(html).toContain("No programmes yet. Publish one and it shows up here.");
    expect(html).toContain("No campaign data yet.");
    // Campaigns have no table behind them at all, so that chart has no source
    // to read rather than an empty one — see CAMPAIGN_SPEC.
    expect(html).toContain("rows: () => [],");
    // The old row builders went with the lists they drew; nothing calls them.
    expect(html).not.toContain("function programRows()");
    expect(html).not.toContain("function progRow(");
    expect(html).not.toContain("function campaignRows()");
  });
});

/**
 * Anything drawn from the mock module says so on screen. A number an owner
 * cannot tell apart from their own is worse than no number at all.
 */
/**
 * Customers, and the one place the spec asked for something this product
 * refuses to hold.
 */
/**
 * The scale, policed.
 *
 * This dashboard grew 22 text sizes — twelve of them inside a 3.5px range — six
 * corner radii and twenty-odd paddings. Every one was a sensible decision made
 * on its own, with no reference to the others, and together they are what made
 * the screen read as generated rather than designed. A difference nobody can
 * perceive is not a hierarchy.
 *
 * So the scale is a rule the suite holds, not a intention in a comment. Reading
 * the SOURCE rather than the rendered page on purpose: the page also carries
 * the shared kit and the card designer, and the designer's sizes are mimicking
 * a real wallet pass, which is a different job with different constraints.
 *
 * If a new value is genuinely needed here, one of the tokens is wrong for the
 * job — fix the token. Do not add a seventh size.
 */
/**
 * Home's chart geometry, run rather than compiled.
 *
 * Every failure mode here is silent. A NaN anywhere in a path makes the WHOLE
 * svg disappear with no error in the console; a divide-by-zero on a window
 * where nothing happened is the easiest way to get one; and a second series
 * scaled separately from the first would draw two rewards the same height as
 * two hundred visits, which is a picture that lies rather than one that breaks.
 */
describe("the home chart, actually run", () => {
  const html = dashboardPage({ emailConfigured: true } as never);
  const S = new Function(
    html.slice(html.indexOf("function chartGeometry(rawVis, rawRew)"),
               html.indexOf("/** \"Mon 25 Aug\", or the week it starts.")) +
      "return { chartGeometry };",
  )();

  it("draws both series and the area under visits", () => {
    const g = S.chartGeometry([1, 4, 2, 7, 3], [0, 1, 0, 2, 1]);
    expect(g.vis.startsWith("M")).toBe(true);
    expect(g.rew.startsWith("M")).toBe(true);
    expect(g.area.endsWith("Z")).toBe(true);
    for (const d of [g.vis, g.rew, g.area]) {
      expect(d).not.toContain("NaN");
      expect(d).not.toContain("Infinity");
    }
  });

  /** The reason the two are in one chart at all. */
  it("scales both series against the same maximum", () => {
    const g = S.chartGeometry([100, 0], [1, 0]);
    // 1 out of a 100 maximum sits near the floor, not at the ceiling.
    expect(g.topR[0]).toBeGreaterThan(80);
    expect(g.topV[0]).toBeLessThan(20);
    // The zero ends of both series land on exactly the same line.
    expect(g.topR[1]).toBeCloseTo(g.topV[1], 6);
  });

  it("survives a window where nothing happened", () => {
    const g = S.chartGeometry([0, 0, 0], [0, 0, 0]);
    expect(g.vis).not.toContain("NaN");
    expect(g.topV.every((n: number) => isFinite(n))).toBe(true);
  });

  it("survives rubbish in the series rather than vanishing", () => {
    const g = S.chartGeometry([1, null, 3], [NaN, 2, undefined]);
    for (const d of [g.vis, g.rew, g.area]) expect(d).not.toContain("NaN");
  });

  /** The marker is HTML over a stretched viewBox, so it needs percentages. */
  it("puts the first and last points at the two ends", () => {
    const g = S.chartGeometry([1, 2, 3], [0, 0, 0]);
    expect(g.left[0]).toBe(0);
    expect(g.left[2]).toBe(100);
  });
});

/**
 * Three visual decisions that are easy to undo by accident and impossible to
 * see in a test that only reads text.
 */
/**
 * A handler wired to markup that does not exist.
 *
 * This shipped. The Log out button moved from Shop into the ⋯ menu and its
 * handler was left behind, so accountPanel ran
 * `div.querySelector("[data-out]").onclick = …` against null, threw, and never
 * returned — and the Shop screen rendered as a completely blank page.
 *
 * Nothing caught it. The name `div` is defined and the syntax is valid, so
 * both compile suites passed; the failure is a runtime null. This is the
 * cheap static check that would have.
 */
describe("no handler is wired to markup that isn't there", () => {
  const src = readFileSync(new URL("../src/dashboardV2.ts", import.meta.url), "utf8");
  const js = src.slice(src.indexOf("const js = /* js */ `"));

  /**
   * Judged per top-level function, and only for elements that function BUILT
   * itself — `const div = document.createElement(…)`, then `div.innerHTML = …`,
   * then `div.querySelector(…)`. A helper handed a root element queries markup
   * somebody else rendered, and rightly, so those are not its business.
   *
   * Scoping matters both ways: a whole-file check passes this bug, because
   * [data-out] does exist — in deadEnd(), a different screen.
   */
  it("only looks up data- attributes on elements it renders itself", () => {
    const starts = [...js.matchAll(/\n    (?:async )?function [A-Za-z0-9_]+\(/g)].map((m) => m.index!);
    const bad: string[] = [];
    starts.forEach((from, i) => {
      const body = js.slice(from, starts[i + 1] ?? js.length);
      const name = body.match(/function ([A-Za-z0-9_]+)\(/)![1]!;
      const built = [...new Set(
        [...body.matchAll(/(?:const|let)\s+([A-Za-z0-9_]+)\s*=\s*document\.createElement/g)].map((m) => m[1]!),
      )];
      if (!built.length) return;
      const looked = new Set(
        [...body.matchAll(new RegExp(
          "\\b(?:" + built.join("|") + ")\\.querySelector(?:All)?\\(\"\\[(data-[a-z0-9-]+)\\]\"\\)", "g"),
        )].map((m) => m[1]!),
      );
      const declared = new Set([...body.matchAll(/[\s"'](data-[a-z0-9-]+)[\s=>"']/g)].map((m) => m[1]!));
      for (const a of looked) {
        if (!declared.has(a)) bad.push(`${name}() looks up [${a}] but never renders it`);
      }
    });
    expect(bad, bad.join("; ")).toEqual([]);
  });

  /**
   * And a screen that throws anyway must not leave a blank page. "Nothing on
   * screen" and "this screen is empty" look identical, which is how the Shop
   * screen sat blank without anybody noticing it was an error.
   */
  it("says a screen broke rather than rendering nothing", () => {
    expect(js).toContain("function brokenScreen()");
    expect(js).toContain("This screen didn’t load");
    const render = js.slice(js.indexOf("function render()"), js.indexOf("function brokenScreen()"));
    expect(render).toContain("try {");
    expect(render).toContain("el = brokenScreen();");
  });
});

describe("the surfaces and the edges", () => {
  const html = dashboardPage({ emailConfigured: true } as never);

  /**
   * Inverted: a grey ground with white cards on it, so WHITE is what the eye
   * reads as content. It was a white page with grey boxes, which made every
   * card read as a hole punched in the page rather than a thing sitting on it.
   */
  /**
   * The bar gets out of the way as you scroll.
   *
   * It listens on .sheet, not the window — body.shelled sets overflow hidden
   * and the window never scrolls at all, so a window listener would be a
   * handler that could not fire.
   */
  it("tucks the bar away on scroll, and brings it back", () => {
    const fn = html.slice(html.indexOf("function tuckOnScroll()"),
                          html.indexOf("function shopName()"));
    expect(fn).toContain('document.querySelector(".sheet")');
    expect(fn).not.toContain("window.addEventListener");
    // A dead zone, so the bar cannot flicker while you are barely moving.
    expect(fn).toContain("last + 6");
    expect(fn).toContain("last - 6");
    // And nothing to hide behind: on a list that can barely scroll, the bar
    // would go and never be asked back.
    expect(fn).toContain("sheet.scrollHeight - sheet.clientHeight < 120");
    // Height and opacity only — the bar keeps its box, so the list below does
    // not jump under your thumb as it goes.
    // It THINS rather than leaving: the logo and the ⋯ stay put and only the
    // greeting fades, so the two things you might reach for are still there.
    // It used to vanish outright, which meant scrolling up to find the menu.
    expect(html).toContain("#app.shell.tucked .topbar");
    expect(html).toContain("#app.shell.tucked .topbar .shop { opacity: 0; }");
    expect(html).not.toContain("#app.shell.tucked .topbar { min-height: 0;");
    // The bottom bar rides the SAME class: one scroll listener, two bars, and
    // no second mechanism to get out of step with the first.
    expect(html).toContain("#app.shell.tucked .botnav a span:not(.plus) { max-height: 0; opacity: 0; }");
    // Its rows stay 44px even shrunk — what goes is the label, not the target.
    expect(html).toContain("#app.shell.tucked .botnav a { min-height: 44px; }");
    // A new screen starts at the top, so it starts with the bar showing.
    expect(html).toContain('if (shell) shell.classList.remove("tucked")');
  });

  it("puts white cards on a grey ground, not grey boxes on white", () => {
    expect(html).toContain("background: var(--surface); border-radius: 0;");
    for (const card of [".metric {", ".chart {", ".acts {", ".cmp {"]) {
      const at = html.indexOf(card);
      expect(at, card + " is missing").toBeGreaterThan(-1);
      expect(html.slice(at, html.indexOf("}", at)), card + " is not white").toContain("var(--bg)");
    }
    // Rule 9 inverts with it: a box inside a WHITE card steps to grey, not to
    // white again, which would be no step at all.
    expect(html).toContain("body.shelled :is(.fold, .grp, .bucket, .mdetail) .btn-ghost { background: var(--surface); }");
  });

  /**
   * The green runs to the very top of the phone.
   *
   * Without viewport-fit=cover the page stops below the status bar, the strip
   * above it paints in the body colour, and the neon reads as a band stuck
   * across the screen rather than as the top of the app.
   */
  it("paints into the notch, and pays for it exactly once", () => {
    expect(html).toContain("viewport-fit=cover");
    expect(html).toContain("padding-top: calc(var(--s1) + env(safe-area-inset-top, 0px));");
    // On staging the "not the real site" strip is above the bar and already
    // carries the notch. Both adding it would leave a gap the height of the
    // status bar.
    expect(html).toContain(".envstrip ~ #app.shell .topbar { padding-top: var(--s2); }");
    const staging = dashboardPage({ emailConfigured: true } as never);
    expect(staging).toContain("env(safe-area-inset-top, 0px)");
  });

  /**
   * viewport-fit=cover is set in the SHARED shell, so every page paints into
   * the home-bar area — including the marketing page, whose ticker is pinned
   * to the bottom and would otherwise sit underneath it.
   */
  it("keeps the marketing ticker clear of the home bar", () => {
    const mkt = marketingPage("hello@punchme.test");
    expect(mkt).toContain("viewport-fit=cover");
    const at = mkt.indexOf(".ticker { position: fixed");
    expect(mkt.slice(at, mkt.indexOf("}", at))).toContain("padding-bottom: env(safe-area-inset-bottom, 0px)");
    // ...and the page reserves the band plus the inset, so it can never cover
    // the footer.
    expect(mkt).toContain("padding: 0 0 calc(46px + env(safe-area-inset-bottom, 0px));");
  });

  /**
   * 16px on a field, and not the body size, which is smaller. iOS Safari zooms
   * the whole page when you focus anything under 16px and does not zoom back
   * out — the page is left scrolled sideways with the nav off screen.
   */
  it("keeps form fields at 16px so iOS does not zoom", () => {
    const at = html.indexOf("input, textarea, select {");
    expect(html.slice(at, html.indexOf("}", at))).toContain("font-size: 1rem");
  });
});

describe("the dashboard keeps to one scale", () => {
  const src = readFileSync(new URL("../src/dashboardV2.ts", import.meta.url), "utf8");
  const css = src.slice(src.indexOf("const css = /* css */ `"), src.indexOf("const js = /* js */ `"));
  const values = (prop: string) =>
    [...new Set([...css.matchAll(new RegExp(prop + ": ([^;}]+)", "g"))].map((m) => m[1]!.trim()))];

  it("names a font family in one place, the :root tokens", () => {
    // Swapping the product's type must stay a two-line edit. Inter variable is
    // now the one face for every role, and the only way that stays true is if
    // no rule anywhere spells a family out. Monospace is exempt: it is a stack
    // of whatever the machine has, not a face we ship, and there is no token
    // for it because nothing about it is a design decision.
    const kit = readFileSync(new URL("../src/ui/kit.ts", import.meta.url), "utf8");
    for (const [name, text] of [["dashboardV2.ts", css], ["kit.ts", kit], ["pages.ts", readFileSync(new URL("../src/pages.ts", import.meta.url), "utf8")]] as const) {
      const named = [...text.matchAll(/font-family: (?!var\(--|inherit|ui-monospace)([^;}\n]+)/g)].map((m) => m[1]!.trim());
      // kit.ts declares the @font-face blocks themselves, which is where the
      // names are allowed to appear, and the two tokens that point at them.
      const stray = named.filter((v) => !/^"(Inter|Figtree|Bricolage Grotesque|Instrument Serif)"[,;]?$/.test(v));
      expect(stray, name + " spells out a font family: " + stray.join(" | ")).toEqual([]);
    }
    expect(kit).not.toContain('font-family: "Inter Tight"');
    expect(kit).toContain(`--display: "Inter",`);
    expect(kit).toContain(`--body: "Inter",`);
  });

  it("defines Inter variable roles without global tracking", () => {
    const kit = readFileSync(new URL("../src/ui/kit.ts", import.meta.url), "utf8");
    const base = kit.slice(kit.indexOf("export const baseCss"), kit.indexOf("export function esc"));
    const role = (name: string, value: string) =>
      expect(base, name + " is missing").toContain(name + ": " + value);

    role("--type-page-title-size", "44px");
    role("--type-page-title-weight", "700");
    role("--type-page-title-leading", "1.05");
    role("--type-page-title-tracking", "-.04em");
    role("--type-section-heading-size", "28px");
    role("--type-section-heading-weight", "700");
    role("--type-section-heading-leading", "1.1");
    role("--type-section-heading-tracking", "-.025em");
    role("--type-card-title-size", "22px");
    role("--type-card-title-weight", "600");
    role("--type-card-title-leading", "1.2");
    role("--type-card-title-tracking", "-.015em");
    role("--type-body-size", "17px");
    role("--type-body-weight", "400");
    role("--type-body-leading", "1.45");
    role("--type-navigation-size", "10px");
    role("--type-navigation-weight", "600");
    role("--type-eyebrow-size", "16px");
    role("--type-eyebrow-weight", "600");
    role("--type-eyebrow-tracking", ".06em");
    expect(base).toContain("font-optical-sizing: auto");
    expect(base).toContain("-webkit-font-smoothing: antialiased");
    expect(base).toContain("-moz-osx-font-smoothing: grayscale");

    const body = base.slice(base.indexOf("body {"), base.indexOf("}", base.indexOf("body {")));
    expect(body).toContain("font-size: var(--type-body-size)");
    expect(body).not.toContain("letter-spacing:");

    for (const selector of ["h1, .type-page-title", "h2, .type-section-heading", "h3, .type-card-title", ".eyebrow, .type-eyebrow"]) {
      expect(base).toContain(selector);
    }
    expect(css).toContain(".sec { font-size: var(--type-section-heading-size)");
    expect(css).toContain(".sec.first { margin-top: 0; font-size: var(--type-page-title-size); }");
    const nav = css.slice(css.indexOf(".botnav a {"), css.indexOf("}", css.indexOf(".botnav a {")));
    expect(nav).toContain("font-size: var(--type-navigation-size)");
    expect(nav).toContain("font-weight: var(--type-navigation-weight)");
    expect(nav).toContain("letter-spacing: var(--type-navigation-tracking)");
  });

  /**
   * Home's selectors, named because the rule for them is different.
   *
   * Home is TWO sizes: --t-lg for the title, the two section headings and every
   * number; --t-xs for every other word. Everywhere else --t-xs stays a TAG
   * size for uppercase labels, with --t-sm doing the reading. Both rules are
   * held below, and this list is what separates them.
   */
  const HOME = [".mlabel", ".mnote", ".delta", ".winsel button", ".chartax", ".chartempty",
                ".ctip .cd", ".ctip .cr", ".chartkey", ".cmpmetric", ".vval", ".vnames span",
                ".cmpfoot", ".cmpempty", ".popgrp > span", ".popopt",
                ".metrics .metric b", ".cfig b", ".home .sec"];

  /**
   * The change beside a number must actually come out green or rust.
   *
   * It did not, and nothing could see it. `.metric span:not(.mlabel):not(.mnote)`
   * is three classes and an element; `.delta.up` is two classes. The broader
   * rule won, repainted the change muted grey and forced it onto its own line —
   * with both rules valid, both applied, and no error anywhere. A grep for
   * "is the colour set" passes on a page where the colour never lands.
   *
   * So this works out which rule WINS, the way a browser does.
   */
  it("lets the change beside a number keep its colour", () => {
    const score = (sel: string) => {
      // Classes, attributes and pseudo-classes count the same, and :not() adds
      // nothing itself but its contents count — which is the whole trap here.
      const classes = (sel.match(/\.[a-zA-Z][\w-]*/g) || []).length;
      const elements = (sel.replace(/:not\([^)]*\)/g, "").match(/(^|[\s>+~])[a-zA-Z][\w-]*/g) || []).length;
      return classes * 100 + elements;
    };
    // Every rule in the dashboard that a <span class="delta up"> inside
    // .metric > .mrow would match, and that has an opinion about colour.
    const matches = [...css.matchAll(/\n\s*(\.[^{}\n]*?) \{([^}]*)\}/g)]
      .map((m) => [m[1]!.trim(), m[2]!] as const)
      .filter(([sel, body]) => {
        if (!/(^|[;{\s])color:/.test(body)) return false;
        if (sel === ".delta.up") return true;
        // A descendant-span rule under .metric matches unless it excludes us.
        return /^\.metric\b.*\bspan\b/.test(sel) && !sel.includes(":not(.delta)");
      });
    const winner = matches.sort((a, b) => score(b[0]) - score(a[0]))[0];
    expect(winner, "no rule colours .delta.up at all").toBeTruthy();
    expect(winner![0], "a broader rule outranks .delta.up and greys the change out")
      .toBe(".delta.up");
    expect(winner![1]).toContain("#15803d");
    // ...and it must stay inline beside the number, not be pushed to its own
    // line by that same rule's display: block.
    const blockers = matches.filter(([sel, body]) => sel !== ".delta.up" && body.includes("display: block"));
    expect(blockers.map(([sel]) => sel), "a broader rule forces the change onto its own line").toEqual([]);
  });

  /**
   * A figure sits inside a block of small text, so it takes the text's family.
   * --display is Inter TIGHT, a narrower cut of the same design: two widths at
   * one size read as a mismatch rather than as a level, which is what the chart
   * card looked like with its figures in one family and its dates in the other.
   */
  it("sets the chart card and the tiles in one family", () => {
    for (const cls of [".metrics .metric b {", ".cfig b {"]) {
      const rule = css.slice(css.indexOf(cls), css.indexOf("}", css.indexOf(cls)));
      expect(rule, cls + " is not on the body family").toContain("font-family: var(--body)");
      expect(rule, cls + " should not be the display face").not.toContain("var(--display)");
      // Figures to be read exactly, not words.
      expect(rule).toContain("tabular-nums slashed-zero");
    }
  });

  it("gives Home three text sizes and no others", () => {
    const rules = [...css.matchAll(/\n\s*(\.[^{}\n]*?) \{([^}]*)\}/g)]
      .map((m) => [m[1]!.trim(), m[2]!] as const)
      .filter(([sel]) => HOME.includes(sel));
    // If this stops matching, the check is passing on nothing.
    expect(rules.length).toBeGreaterThan(10);
    const off = rules
      .filter(([, body]) => /font-size: (?!var\(--t-xl\)|var\(--t-md\)|var\(--t-sm\))/.test(body))
      .map(([sel]) => sel);
    expect(off, "Home rules off its three sizes: " + off.join(", ")).toEqual([]);
    // All three in use, and NOT --t-xs: that one is the uppercase tag size and
    // Home has no uppercase on it.
    const used = new Set(rules.flatMap(([, b]) =>
      [...b.matchAll(/font-size: (var\(--t-[a-z]+\))/g)].map((m) => m[1]!)));
    expect([...used].sort()).toEqual(["var(--t-md)", "var(--t-sm)", "var(--t-xl)"]);
  });

  it("keeps 11px for uppercase tags, and Home never reaches for it", () => {
    // Off Home the rule still holds: caps at 11px optically match sentence text
    // at 13px, so uppercase is what earns the smaller size. A 13px sentence
    // next to an 11px caption reads as a mistake rather than a hierarchy.
    const rules = [...css.matchAll(/\n\s*(\.[^{}\n]*?) \{([^}]*)\}/g)]
      .filter((m) => m[2]!.includes("var(--t-xs)"))
      .map((m) => [m[1]!.trim(), m[2]!] as const)
      .filter(([sel]) => !HOME.includes(sel));
    expect(rules.length).toBeGreaterThan(3);
    const lower = rules
      // The bottom nav is the one non-Home exception, annotated where it lives:
      // five labels share one pill and phone navs are sentence case anyway.
      .filter(([sel, body]) => !body.includes("text-transform: uppercase") && sel !== ".botnav a")
      .map(([sel]) => sel);
    expect(lower, "11px on text that is not an uppercase tag: " + lower.join(", ")).toEqual([]);
  });

  it("spaces lines and letters from the tokens and nothing else", () => {
    // The type read as cramped, and the cause was that both of these had drifted
    // off the scale one rule at a time: five line heights and ten tracking
    // values, most of them squeezing. Breathing room is only a token change if
    // every rule actually goes through the token.
    const lh = values("line-height").filter(
      // The ⋯ button centres one glyph in a 36px circle. That is a layout
      // reset, not a reading decision, and no token should describe it.
      (v) => !v.startsWith("var(--lh-") && !v.startsWith("var(--type-") && v !== "1",
    );
    expect(lh, "line heights off the scale: " + lh.join(", ")).toEqual([]);
    const tr = values("letter-spacing").filter((v) => !v.startsWith("var(--tr-") && !v.startsWith("var(--type-"));
    expect(tr, "tracking off the scale: " + tr.join(", ")).toEqual([]);
  });

  it("sizes text from the six tokens and nothing else", () => {
    const off = values("font-size").filter(
      // .48em is a RATIO of its parent — the share beside a health count — not
      // a size, so it moves when the token it sits inside moves.
      (v) => !v.startsWith("var(--t-") && !v.startsWith("var(--type-") && v !== ".48em",
    );
    expect(off, "text sizes off the scale: " + off.join(", ")).toEqual([]);
  });

  it("rounds corners from the three tokens and the pill", () => {
    // Per corner, so the shorthand a grouped row needs — rounded at the top,
    // square where the next row meets it — is judged on its parts.
    //
    // 4px is allowed and is NOT a fourth radius: DESIGN.md's chart rules ask for
    // a bar "square at the baseline and 3–4px rounded at the data end", and a
    // --r-sm corner on a 44px bar is a lozenge rather than a bar. It is a MARK
    // spec, the way a stroke width is, and only a bar may take it — which the
    // loop below holds.
    const corner = /^(0|4px|999px|var\(--r(-sm|-lg)?\))$/;
    const off = values("border-radius").filter(
      (v) => !v.split(/\s+/).every((c) => corner.test(c)),
    );
    expect(off, "radii off the scale: " + off.join(", ")).toEqual([]);
    for (const m of css.matchAll(/\n\s*(\.[^{}\n]*?) \{([^}]*)\}/g)) {
      if (/border-radius:[^;}]*4px/.test(m[2]!)) {
        expect(m[1]!.trim(), "4px corners are a chart bar's mark spec, nothing else")
          .toBe(".vbar");
      }
    }
  });

  it("spaces from the one 4px scale", () => {
    const off = values("padding").filter((v) =>
      // A calc() has spaces of its own, so lift it out before splitting the
      // shorthand — otherwise "calc(96px + …)" reads as three bad values.
      // Greedy to the LAST bracket: a calc() here nests an env(), so a lazy
      // match stops inside it and leaves "0px)" looking like a bad value.
      !v.replace(/calc\(.*\)/, "calc")
        .split(/\s+/)
        .every((part) => part.startsWith("var(--s") || part === "0" || part === "calc"),
    );
    expect(off, "padding off the scale: " + off.join(", ")).toEqual([]);
  });

  /**
   * The six values, pinned, and every step big enough to see.
   *
   * Twelve sizes inside 3.5px is what this replaced, so the tokens have to stay
   * far enough apart to read as levels rather than as accidents.
   *
   * These are the conventional 12/14/16/20/24/32 steps, chosen by the founder
   * over the smaller set that came before (body was 14px, the floor was 11px).
   * Pinned by value and not only by ratio, because the SIZES are the decision —
   * a later drift that kept the ratios but moved every number would satisfy a
   * ratio-only guard while quietly undoing the choice.
   */
  it("holds the six sizes, each a visible step from the next", () => {
    const kit = readFileSync(new URL("../src/ui/kit.ts", import.meta.url), "utf8");
    const want: [string, number][] = [
      ["--t-hero", 2], ["--t-xl", 1.5], ["--t-lg", 1.25],
      ["--t-md", 1], ["--t-sm", 0.875], ["--t-xs", 0.75],
    ];
    const steps = want.map(([t, px]) => {
      const m = kit.match(new RegExp(t + ": ([\\d.]+)rem"));
      expect(m, t + " is missing from the scale").toBeTruthy();
      expect(Number(m![1]), t + " is off the chosen scale").toBe(px);
      return Number(m![1]);
    });
    // EVERY step, the last one included. The old scale needed an exemption for
    // its bottom pair — 12px against 11px, which no eye separates on size — and
    // leaned on those two never sharing a case to tell them apart. This scale
    // has no such pair, so the guard covers the whole thing.
    for (let i = 0; i < steps.length - 1; i++) {
      expect(steps[i]! / steps[i + 1]!, `${steps[i]}rem over ${steps[i + 1]}rem is too small a step`)
        .toBeGreaterThanOrEqual(1.14);
    }
  });
});

describe("the customers screen", () => {
  const html = dashboardPage({ emailConfigured: true } as never);
  const list = html.slice(html.indexOf("function customersScreen()"), html.indexOf("function custCard(x)"));
  const one = html.slice(html.indexOf("function customerScreen(code)"), html.indexOf("async function confirmAndSend"));

  it("can be searched, sorted and filtered by segment", () => {
    expect(list).toContain("data-q");
    expect(list).toContain("data-sort");
    for (const sort of ["recent", "visits", "lapsed"]) expect(list).toContain(`value="${sort}"`);
    // The filter chips are built from the SERVER's own groups, so the filter
    // can never offer a segment the tiles above it do not show.
    expect(list).toContain("(body.health || []).map");
  });

  /**
   * lastDays counts UP as somebody stays away. "Most recent" is therefore
   * ascending and "longest away" is the same list backwards — get that the
   * wrong way round and the two options silently swap.
   */
  it("sorts recency the right way round", () => {
    expect(list).toContain('sort === "lapsed"');
    expect(list).toContain("b.lastDays - a.lastDays");
    expect(list).toContain("a.lastDays - b.lastDays");
  });

  it("does not draw a list nobody scrolls to the end of", () => {
    expect(list).toContain("shown.slice(0, 200)");
    expect(list).toContain("Showing the first 200");
  });

  /**
   * THE PRIVACY LINE. This product asks customers for no name, no email and no
   * phone, and its privacy page promises exactly that in writing. The spec for
   * this screen asked for a name; there is none to show, and inventing one —
   * "Customer #4" included — would imply an identity the product refuses to
   * hold. The card code is what a customer is called here.
   */
  it("identifies a customer by their card code and never by a name", () => {
    expect(html).toContain("x.code");
    expect(html).not.toContain("Customer name");
    expect(html).not.toContain("customerName");
    expect(one).toContain("asks customers for no name");
  });

  /**
   * Consent is REPRESENTED, not faked. There is no consent column, so a live
   * toggle would be the UI lying about the one subject the privacy page makes
   * a promise about. What is real — their card is gone, or they are at the
   * weekly limit — is shown as Reachability above it.
   */
  it("shows real reachability, the marketing state included", () => {
    expect(one).toContain("Reachability");
    expect(one).toContain("x.removed");
    expect(one).toContain("x.canNudge");
    expect(one).toContain("Card removed");
    expect(one).toContain("At the weekly limit");
    // The marketing state is REAL now. It was chipped as an Example while there
    // was no consent column, because a switch that looked live but did not stop
    // messages would have been this product lying about consent.
    expect(one).toContain("x.optedOut");
    expect(one).toContain("Asked not to be messaged");
    expect(one).not.toContain("'<div class=\"drow\"><span>Marketing messages' + EG");
  });

  /**
   * The owner may read a customer's consent and may never write it. A dashboard
   * that could switch someone's marketing back on would make the whole
   * mechanism worthless, so the screen carries no control for it at all.
   */
  it("gives the owner no way to switch a customer's marketing back on", () => {
    expect(one).toContain("only they can, from the link on the back of their card");
    expect(one).not.toContain("data-optout");
    expect(one).not.toMatch(/api\("\/customer[^"]*opt/i);
  });

  /**
   * Today, and it says today. /api/counter is the only thing that reads the
   * event log back for an owner and it covers one day; a feed labelled
   * "recent" that silently stops at midnight is a lie.
   */
  it("labels the activity feed as today, and says what is missing", () => {
    expect(html).toContain('<h2 class="sec">Today at the counter</h2>');
    expect(html).toContain("Anything before today is in the log but not yet on this page.");
    expect(html).toContain("function drawActivity(host, code)");
    // Time, who, what — in that order.
    expect(html).toContain('class="at"');
    expect(html).toContain("got a stamp");
  });

  /** The screen this one was built out of stayed reachable. */
  it("keeps the message sender working, through one shared confirm", () => {
    expect(html).toContain("async function confirmAndSend(count, payload, message)");
    expect(html).toContain("cannot be taken back");
    // The weekly cap is the server's job and stays there.
    expect(html).toContain("Anyone messaged in the last 7 days is skipped automatically.");
    expect(html).toContain("confirmAndSend(1, { target: [x.serial] }");
  });
});

describe("the manage screens", () => {
  const html = dashboardPage({ emailConfigured: true } as never);
  const detail = html.slice(html.indexOf("function rewardDetailScreen(id)"), html.indexOf("function dealLine(card)"));

  /**
   * ONE pane, and no switch.
   *
   * Manage was two screens behind a pill, and the second one was three lines
   * saying there was nothing there yet — so a control that cost a tap on every
   * visit existed to offer an empty page. Campaigns sits at the top of
   * Customers, which is the screen about people.
   */
  it("is one pane with no tab switch", () => {
    expect(html).not.toContain('data-mt="rewards"');
    expect(html).not.toContain('data-mt="campaigns"');
    expect(html).toContain("function rewardsPane(host)");
    expect(html).toContain("function campaignsBlock()");
    // The old address still resolves — it forwards rather than 404ing anyone
    // who bookmarked it.
    expect(html).toContain('navigate("/customers", true)');
    // And the block really is on Customers, above the customer list.
    const cust = html.slice(html.indexOf("function customersScreen()"),
                            html.indexOf("function customerDetail"));
    expect(cust.indexOf("campaignsBlock()")).toBeGreaterThan(-1);
    expect(cust.indexOf("campaignsBlock()")).toBeLessThan(cust.indexOf("Your customers"));
  });

  /**
   * The whole point of this screen: it stopped reporting.
   *
   * Home's two charts answer how a programme is doing. The same figures worked
   * out on a second screen is how a headline came to disagree with the list
   * under it, twice — so Manage and the pages behind it carry no metric grid at
   * all, and that is held here rather than left as an intention.
   */
  it("shows no performance figures anywhere in Manage", () => {
    const manage = html.slice(html.indexOf("function manageScreen()"),
                              html.indexOf("function designerFor(card, extra)"));
    expect(manage).not.toContain('class="metric"');
    // The HEADING, not the word: the comment where the block used to be says
    // why it went, and that sentence is worth more than the grep is.
    expect(manage).not.toContain('>Performance');
    expect(manage).not.toContain("metrics.active");
    expect(manage).not.toContain("metrics.stamps");
    // The one figure that stays is the lock note, which is a warning about
    // EDITING — the deal is frozen for whoever already holds the card — not a
    // report on how the programme is doing.
    expect(manage).toContain("lockNote(m.active)");
  });

  /**
   * The tile is the REAL card face. designPanel is the one thing that knows how
   * to draw an Apple or an Android pass, and it is shared verbatim with the
   * admin console so the two cannot drift; a simpler second card face built
   * beside it would be exactly that drift.
   */
  it("previews the real card and lets one control switch every face", () => {
    const pane = html.slice(html.indexOf("function rewardsPane(host)"),
                            html.indexOf("function cardBody(t)"));
    expect(pane).toContain("previewOnly: true");
    // The count is the only request the panel makes on mount, and a tile has
    // nowhere to show it.
    expect(pane).toContain("customersPath: null");
    // Through the panel's own switcher, not a copy that toggles hidden.
    expect(pane).toContain("p.setSurface(face)");
    // ONE surface for the whole strip: two tiles disagreeing about which phone
    // you are looking at is unreadable.
    expect(pane).toContain("panels.forEach");
    // The last tile is the way to make the next programme.
    expect(pane).toContain('data-nav="/create/reward"');
    // REAL cards only. Two example tiles used to sit in this strip drawn by the
    // same preview, which is exactly what made them indistinguishable from the
    // owner's own programmes at a swipe.
    expect(pane).not.toContain("MOCK_");
    expect(pane).not.toContain("egmark");
    expect(html).not.toContain("egtile");
    // ".egchip", not "egchip": .segchip is a real class (the segment filter
    // chips on Customers) and contains the shorter string.
    expect(html).not.toContain(".egchip");
    // Arrows, because swiping is a touchscreen gesture and a scroll-snap strip
    // offers nothing else — without them a keyboard reaches card one and stops.
    expect(pane).toContain('aria-label="Previous card"');
    expect(pane).toContain('aria-label="Next card"');
    expect(pane).toContain("car.scrollBy({");
    // A one-tile strip has nowhere to go, and two dead arrows read as broken.
    expect(pane).toContain("car.children.length < 2");
    // Which tile is showing is MEASURED against the strip's own box. offsetLeft
    // is relative to whichever ancestor happens to be positioned and the
    // carousel is not one, so the old arithmetic compared two different origins
    // and lost the details and the buttons as soon as the strip had scrolled.
    expect(pane).toContain("car.getBoundingClientRect()");
    // The USE of it, not the word: the comment where the arithmetic used to be
    // names offsetLeft to say why it went, and that sentence is worth keeping.
    expect(pane).not.toMatch(/\.offsetLeft\b/);
  });

  /**
   * THREE actions: Test, Share, Edit.
   *
   * Poster was a fourth, which split "how do I give this out" across two
   * controls sitting next to each other. It is inside Share now, with the two
   * other links that answer the same question.
   */
  it("offers the card's actions and its details, never its numbers", () => {
    const body = html.slice(html.indexOf("function cardBody(t)"), html.indexOf("const actBtn ="));
    for (const a of ["Test", "Share", "Edit"]) expect(body).toContain(a);
    expect(body).not.toContain('actBtn("poster"');
    // The example branch went with the example tiles: there is one tile shape
    // now, so there is nothing to keep the same shape as.
    expect(body).not.toContain("t.eg");
    // Details is what the card DOES, not how it is doing.
    expect(body).toContain("detailRows(c)");
    expect(body).toContain(">Details<");
    expect(body).not.toContain("customers");
  });

  /**
   * A list of options, not a confirm dialog with the one action disguised as
   * its OK button — the founder asked for it to be shaped for more entries, and
   * the next one has to be a line rather than a rewrite.
   */
  it("shares through a list that a second option could join", () => {
    const sheet = html.slice(html.indexOf("function shareSheet(card)"),
                             html.indexOf("function campaignsBlock()"));
    expect(sheet).toContain('class="sharelist2"');
    expect(sheet).toContain("Copy sign-up link");
    // Poster stopped being a button of its own beside Share, which split "how
    // do I give this out" across two controls. Every way of handing the card
    // over is in the one sheet that answers that question.
    expect(sheet).toContain("Printable poster");
    expect(sheet).toContain("Sign-up page");
    expect(sheet).toContain("Customer page");
    // Clipboard access is refused outside a secure context, so there is a
    // fallback rather than a button that silently does nothing.
    expect(sheet).toContain("navigator.clipboard");
    expect(sheet).toContain("window.isSecureContext");
    expect(sheet).toContain('document.execCommand("copy")');
    // It says whether it worked either way.
    expect(sheet).toContain("Sign-up link copied.");
  });

  /**
   * Nothing stores a campaign — there is no campaigns table at all — so this
   * pane has nothing to list. It used to list four invented ones with Edit
   * links behind them, which is a screen demonstrating itself.
   */
  it("says it has no campaign data yet, and keeps the way to make one", () => {
    const pane = html.slice(html.indexOf("function campaignsBlock()"),
                            html.indexOf("function manageDetailScreen"));
    expect(pane).toContain("No campaign data yet.");
    expect(pane).toContain('data-nav="/create/campaign"');
    expect(pane).not.toContain("MOCK_");
    // No carousel: a campaign has no artwork to swipe through.
    expect(pane).not.toContain("carousel");
    // And no Edit links into a page that cannot describe anything.
    expect(pane).not.toContain('class="rowedit"');
  });

  /**
   * "Multiple programmes means multiple QRs" is a claim best made by showing
   * one QR per programme rather than by writing the sentence down.
   */
  /**
   * An unfinished card is the one thing on this screen that cannot be shared,
   * printed or handed out — so it offers none of those, and offers the only
   * thing that helps instead.
   */
  /**
   * The card-type rows were three grid rows tall, not two.
   *
   * The icon and the radio both span rows 1-2 and the name takes row 1, so the
   * one free cell in row 2 sits BEHIND the placement cursor by the time the
   * subtext is reached — and grid never walks backwards. The subtext landed in
   * a third row, under an empty band the icon and radio were holding open.
   * Placing all four explicitly is what stops that.
   */
  it("places every part of a chooser row explicitly", () => {
    const css = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
    expect(css).toContain(".pick.opt > strong { grid-column: 2; grid-row: 1;");
    expect(css).toContain(".pick.opt > .sub2 { grid-column: 2; grid-row: 2;");
    expect(css).toContain(".pick.opt > .pickicon { grid-column: 1; }");
    expect(css).toContain(".pick.opt > .pickdot { grid-column: 3; }");
  });

  /**
   * A draft is ONE button, and the word "Draft" above the card is the whole
   * explanation.
   *
   * It used to be a tinted bar: a pill, a sentence saying nobody could be given
   * the card, the button, and a delete link. The pill is the status line now
   * and the sentence is what the word means, so what is left is the way back
   * into the flow. Deleting lives on the card's own page, which says whether it
   * will really delete or only hide.
   */
  it("gives a draft one button and no explanation block", () => {
    const body = html.slice(html.indexOf("function cardBody(t)"), html.indexOf("const actBtn ="));
    expect(body).toContain("const draft = !c.publishedAt");
    expect(body).toContain("Continue editing");
    expect(body).toContain("data-resume");
    expect(body).not.toContain("draftbar");
    expect(body).not.toContain("data-draftdel");
    expect(body).not.toContain("Not finished yet");
    // Back to Rules, not Choose: the type is the answer that made the card.
    const paint = html.slice(html.indexOf("const resume = body.querySelector"),
                             html.indexOf('body.querySelector("[data-share]")'));
    expect(paint).toContain('navigate("/create/" + c.id + "/rules")');
  });

  /**
   * Three states, not two. A card that has ENDED has closed its sign-ups while
   * everybody holding one keeps collecting and keeps claiming, so it is neither
   * live nor unfinished — and it was the one state this screen could not show.
   */
  it("says which state the card is in, above the card", () => {
    const fn = html.slice(html.indexOf("function statusOf(c)"), html.indexOf("function detailRows(c)"));
    expect(fn).toContain('{ key: "draft", label: "Draft" }');
    expect(fn).toContain('{ key: "ended", label: "Ended" }');
    expect(fn).toContain('{ key: "live", label: "Active" }');
    // Drawn above the strip, and repainted as you swipe.
    const pane = html.slice(html.indexOf("function rewardsPane(host)"), html.indexOf("function statusOf(c)"));
    expect(pane.indexOf("data-cstat")).toBeLessThan(pane.indexOf('class="carwrap"'));
    expect(pane).toContain("statusOf(t.card).label");
    // The card's own page uses the SAME badge. It had a .pstat span with no CSS
    // anywhere, so it rendered as bare text run into the card's name.
    expect(html).not.toContain('class="pstat');
  });

  /**
   * Three rows that say what the card DOES.
   *
   * They replace a "The deal" line that answered a different question and knew
   * nothing about earn modes — so a points card earning from what people SPEND
   * described itself as though it earned per visit.
   */
  it("describes a card by program, earning and reward", () => {
    const rows = html.slice(html.indexOf("function detailRows(c)"), html.indexOf("function cardBody(t)"));
    expect(rows).toContain('"Program"');
    expect(rows).toContain('"Earning"');
    expect(rows).toContain('"Reward"');
    // A membership card counts nothing, so it has no Earning row at all —
    // absent rather than empty, because an empty row invites the reader to
    // wonder what should have been in it.
    expect(rows).toContain('if (earn) rows.push(["Earning", earn])');
    const earn = html.slice(html.indexOf("function earnLine(c)"), html.indexOf("function rewardLine(c)"));
    expect(earn).toContain('if (c.kind === "membership") return ""');
    expect(earn).toContain('c.earnMode === "spend"');
    expect(earn).toContain("Your staff decide at the counter");
  });

  /**
   * A test card is a thing you do TO a finished card, not a step in designing
   * one. It lived in the design panel — and the Manage carousel mounts that
   * panel in preview-only mode, which strips it, so the one screen actually
   * about a card had no way to get one.
   */
  it("offers a test card from Manage, not from the designer", () => {
    const body = html.slice(html.indexOf("function cardBody(t)"), html.indexOf("const actBtn ="));
    expect(body).toContain('actBtn("testadd", ICON_ADD, "Test")');
    const sheet = html.slice(html.indexOf("function testCardSheet(card)"),
                             html.indexOf("const actBtn ="));
    expect(sheet).toContain("Add to Apple Wallet");
    expect(sheet).toContain("Add to Google Wallet");
    expect(sheet).toContain("/test-link");
    // A laptop cannot open either wallet link — Apple hands it a .pkpass it
    // downloads and cannot read, and Google wants the signed-in phone — so a
    // desktop gets the QR, which is the only thing that reaches the phone.
    expect(sheet).toContain("onPhone");
    expect(sheet).toContain("test-qr.png");
  });

  it("gives a card its own QR, poster and customer page", () => {
    expect(detail).toContain("/qr");
    expect(detail).toContain("/poster");
    expect(detail).toContain("/me");
    expect(detail).toContain("Every card has its own QR");
    // Built from the card on screen, never from the shop. The shop's link
    // cannot say WHICH card an owner is standing on, and with more than one
    // card that is the whole question.
    expect(detail).toContain(`src="/c/' + esc(card.id) + '/qr`);
    expect(detail).not.toContain("S.joinRef");
  });

  /**
   * Shown, not enforced. A card already in a wallet carries its own copy of
   * the rules, so changing a live programme is deliberate working behaviour —
   * actually disabling these fields would delete a feature the product
   * documents. The note explains what really happens instead.
   */
  it("explains the lock on an enrolled programme rather than applying one", () => {
    expect(detail).toContain("enrolled ? lockNote(m.active)");
    const note = html.slice(html.indexOf("function lockNote(n)"), html.indexOf("function campaignDetailScreen"));
    expect(note).toContain("You can still change it");
    expect(note).not.toContain("disabled");
    expect(note).not.toContain("readOnly");
  });

  /**
   * Ending a programme really ends it now — cards.ended_at — and the button
   * asks twice, never with a browser dialog: a browser lets somebody silence
   * those, after which confirm() answers "no" in silence and the button looks
   * broken on a staff phone.
   *
   * The second tap's wording carries the promise, because that is the moment
   * somebody hesitates: existing cards keep working.
   */
  it("asks twice to end sign-ups, and says what survives it", () => {
    expect(detail).toContain("End sign-ups");
    expect(detail).toContain('arm(d.querySelector("[data-end]")');
    expect(detail).toContain("Tap again — existing cards keep working");
    // Both states say what survives, in the section and on the button.
    expect(detail).toContain("Ending a card stops new sign-ups.");
    expect(detail).toContain("still collecting on it");
    // It is reversible, and the same control both ways.
    expect(detail).toContain("Start sign-ups again");
    expect(detail).toContain('ended: !over');
    // Ending one frees the single-programme slot, so Create changes too — the
    // shop is re-read rather than the card patched where it sits.
    expect(detail).toContain("await refreshCards()");
    expect(html).toContain("function arm(btn, prompt, go)");
    // A real call always passes a message; the four remaining mentions are
    // comments explaining why this app never makes one.
    expect(html).not.toMatch(/[^A-Za-z.]confirm\(\s*["'`]/);
  });

  /**
   * One mount, used by the programme page and later by Create, so the settings
   * object the admin console also passes cannot quietly grow a second shape.
   */
  it("mounts the one designer through one function", () => {
    expect(html).toContain("function designerFor(card, extra)");
    expect(detail).toContain("designerFor(card)");
    const mount = html.slice(html.indexOf("function designerFor(card, extra)"), html.indexOf("let armedBtn"));
    for (const key of ["path:", "apiBase:", "artUrl:", "customersPath:", "saveLabel:", "onRulesSaved:"]) {
      expect(mount).toContain(key);
    }
  });
});

describe("the create screens", () => {
  const html = dashboardPage({ emailConfigured: true } as never);
  const campaign = html.slice(html.indexOf("function createCampaignScreen(type)"),
                              html.indexOf("function manageScreen()"));

  /**
   * The four reward types are the four the database already holds, so wiring
   * this up later is a rename rather than a migration.
   */
  /**
   * Three, not four. Milestones is a stamp card with more than one reward on
   * it, so it belongs inside Stamps rather than beside it — a first screen
   * asking somebody to tell those two apart is asking the wrong question. The
   * database still holds all four kinds; this is what the flow OFFERS.
   */
  it("offers the three card types a shop chooses between", () => {
    for (const k of ["stamp", "points", "membership"]) {
      expect(html).toContain(`k: "${k}"`);
    }
    for (const n of ["Stamps", "Points", "Membership"]) {
      expect(html).toContain(`name: "${n}"`);
    }
    // A sentence each — the whole reason these are cards and not a dropdown.
    expect(html).toContain("blurb:");
    // And the one most shops want is said to be.
    expect(html).toContain("Reward (most popular)");
  });

  it("offers the four campaign types, each saying what it is for", () => {
    for (const n of ["Win-back", "Quiet period", "Progress reminder", "Custom"]) {
      expect(html).toContain(`name: "${n}"`);
    }
    expect(html).toContain("CAMPAIGN_TYPES");
  });

  /**
   * THE ONE THAT MATTERS, inverted.
   *
   * This used to assert that Create never posted anything, because a shop
   * could hold one card and the server refused a second — a flow that tried to
   * save would have looked broken to the one person it exists to impress. Both
   * halves of that are gone: a shop may hold several, and the card is made at
   * the end of step 1 so the rest of the flow is editing something real.
   *
   * What replaces it is the rule that makes creating-early safe: the card is
   * made as a DRAFT, and nothing hands a draft to a customer.
   */
  it("creates the card as a draft, at the end of step one", () => {
    const choose = html.slice(html.indexOf("function createChooseScreen()"),
                              html.indexOf("function createRulesScreen(id)"));
    expect(choose).toContain('"/cards"');
    expect(choose).toContain("draft: true");
    // And it goes to step 2 with the id it just got back, which is also the
    // address somebody returns to.
    expect(choose).toContain('navigate("/create/" + made.id + "/rules")');
  });

  /**
   * Next is out of reach until the step is actually answered.
   *
   * Disabled and visible, never hidden: a Next that vanished would leave the
   * step looking finished. And because a disabled button swallows clicks, the
   * shake hangs off the footer instead — pressing a greyed-out Next has to
   * point at what is missing, or it reads as the page being broken.
   */
  it("locks Next until the step is finished, and points at what is missing", () => {
    const rules = html.slice(html.indexOf("function createRulesScreen(id)"),
                             html.indexOf("function createDesignScreen(id)"));
    // Every gate returns the ELEMENT to shake, so the reason and the arrow are
    // one value and cannot disagree.
    expect(rules).toContain("const blocked = () =>");
    expect(rules).toContain('body.querySelector("[data-cont]")');
    // Every required field is named, including the reward's VALUE — which was
    // missing, so a reward with a name and no value walked straight past, and
    // the effective discount underneath was computed from a blank.
    expect(rules).toContain('at("rewardName")');
    expect(rules).toContain('at("value")');
    expect(rules).toContain('at("percent")');
    // Re-checked on every edit, on Continue, and on opening either part.
    expect((rules.match(/relock\(\)/g) || []).length).toBeGreaterThan(3);

    const frame = html.slice(html.indexOf("function wizardFrame(stepIndex"),
                             html.indexOf("/** Step 1 —"));
    expect(frame).toContain("next.disabled = Boolean(why)");
    expect(frame).toContain("wshake");
    expect(frame).toContain('foot.addEventListener("pointerdown"');
  });

  /**
   * The card name arrives EMPTY.
   *
   * Step 1 has to create the card with something, so it uses the shop's name —
   * but that is a placeholder nobody chose, and a box that arrives full reads
   * as answered. It is the owner's only once it differs from the auto one.
   */
  it("does not pre-fill the card name with the shop's", () => {
    const rules = html.slice(html.indexOf("function createRulesScreen(id)"),
                             html.indexOf("function createDesignScreen(id)"));
    expect(rules).toContain('name: (card.name && card.name !== card.shopName) ? card.name : ""');
    expect(rules).toContain('placeholder="e.g. Coffee card"');
    // And the gate refuses an empty one, so it cannot simply be skipped.
    expect(rules).toContain('if (!String(r.name).trim()) return body.querySelector("[data-r=name]")');
  });

  /** The shop name is a rule, not a colour, so it is asked here now. */
  it("asks for the shop name on Rules, under the card name", () => {
    const rules = html.slice(html.indexOf("function createRulesScreen(id)"),
                             html.indexOf("function createDesignScreen(id)"));
    expect(rules).toContain('data-r="shopName"');
    expect(rules).toContain("This will be what your card displays.");
    expect(rules.indexOf('data-r="name"')).toBeLessThan(rules.indexOf('data-r="shopName"'));
    // It is what gets SAVED as the shop name — it used to send the card's.
    expect(rules).toContain("shopName: r.shopName");
  });

  /**
   * Two options, not a number box. Above two is a giveaway nobody meant to
   * type, and zero welcome stamps makes a card that lands in a wallet reading
   * empty, which looks like the scan did not work.
   */
  it("offers one or two for the welcome stamps and the rate, and nothing else", () => {
    const rules = html.slice(html.indexOf("function createRulesScreen(id)"),
                             html.indexOf("function createDesignScreen(id)"));
    const stamp = rules.slice(rules.indexOf("const stampEarn ="),
                              rules.indexOf("const pointsEarn ="));
    expect(stamp).toContain('<select data-r="welcome">');
    expect(stamp).toContain('<select data-r="perVisit">');
    expect(stamp).not.toContain('data-r="welcome" type="number"');
    expect(stamp).not.toContain('data-r="perVisit" type="number"');
    // The same row a points card uses: two halves of equal width, the fixed
    // one greyed, the unit inside the box. It was a small centred sentence,
    // which read as a caption rather than as the setting it is.
    expect(stamp).toContain('<span class="unit-fixed">1 visit</span>');
    expect(stamp).toContain("<i>Stamps</i>");
    const helper = html.slice(html.indexOf("function oneOrTwo(value)"),
                              html.indexOf("How many visits one reward costs"));
    expect(helper).toContain("[1, 2].map");
  });

  /**
   * And POINTS are typed, which is the same rule read the other way.
   *
   * Two is a sane ceiling for welcome STAMPS on a card with at most twenty
   * circles. On a card counting to 500 it is not a modest head start, it is
   * nothing at all — so the ceiling follows what is being counted rather than
   * the column the two of them share.
   */
  it("types welcome points and the rate on a points card, rather than offering two", () => {
    const rules = html.slice(html.indexOf("function createRulesScreen(id)"),
                             html.indexOf("function createDesignScreen(id)"));
    const pts = rules.slice(rules.indexOf("const pointsEarn ="), rules.indexOf("const paint ="));
    expect(pts).toContain('data-r="welcome" type="number"');
    expect(pts).toContain('data-r="earnPoints" type="number"');
    expect(pts).toContain('data-r="pointsTarget" type="number"');
    expect(pts).not.toContain('<select data-r="welcome">');
  });

  /**
   * The rate row is one setting in two boxes, so both boxes are the same width
   * and the unit sits inside them. Manual has neither: the amount is decided at
   * the counter, which is the whole meaning of the word.
   */
  it("shows a rate on visit and spend, and none at all on manual", () => {
    const rules = html.slice(html.indexOf("function createRulesScreen(id)"),
                             html.indexOf("function createDesignScreen(id)"));
    const pts = rules.slice(rules.indexOf("const pointsEarn ="), rules.indexOf("const paint ="));
    expect(pts).toContain('r.earnMode === "manual"');
    expect(pts).toContain('r.earnMode === "spend"');
    expect(pts).toContain('<span class="unit-fixed">1 visit</span>');
    expect(pts).toContain("<i>RM</i>");
    expect(pts).toContain("<i>Points</i>");
    const css = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
    expect(css).toContain(".rate { display: grid; grid-template-columns: 1fr auto 1fr;");
  });

  /** The three earn modes, worded the way the founder asked for them. */
  it("names the three ways a points card can earn", () => {
    const modes = html.slice(html.indexOf("const EARN_MODES = ["),
                             html.indexOf("The four campaign types"));
    expect(modes).toContain("A flat number of points for each visit");
    expect(modes).toContain("Customers earn automatically from what they pay");
    expect(modes).toContain(
      "Your staff decide how many points to award using your own rules at the counter");
  });

  /**
   * A membership card counts nothing, so it has neither half — and it must not
   * send a reward. cardFieldsFromBody writes the reward SENTENCE whenever
   * rewardType arrives, so sending one would stamp a reward onto a card that
   * has no counter to earn it on.
   */
  it("asks a membership card for a member name and perks, and saves no reward", () => {
    const rules = html.slice(html.indexOf("function createRulesScreen(id)"),
                             html.indexOf("function createDesignScreen(id)"));
    expect(rules).toContain('data-r="memberLabel"');
    expect(rules).toContain('data-r="benefits"');
    expect(rules).toContain('placeholder="VIP"');
    expect(rules).toContain("What you call your regulars.");
    const save = rules.slice(rules.indexOf("const save = ()"), rules.indexOf("frame = wizardFrame(1"));
    expect(save).toContain("b.memberLabel = r.memberLabel");
    expect(save).toContain("b.benefits = r.benefits");
    // The reward fields sit in the OTHER branch of the same if.
    expect(save.indexOf("b.rewardType")).toBeGreaterThan(save.indexOf("b.benefits"));
  });

  /** Every step says how to go back, including the first. */
  it("offers a back link on every step", () => {
    const frame = html.slice(html.indexOf("function wizardFrame(stepIndex"),
                             html.indexOf("/** Step 1 —"));
    expect(frame).toContain("data-wback");
    // Step 1 leaves the flow; the others go to the step before.
    expect(frame).toContain('stepIndex === 0 ? navigate("/create") : opts.onStep(stepIndex - 1)');
  });

  it("publishes only on the last step", () => {
    const design = html.slice(html.indexOf("function createDesignScreen(id)"),
                              html.indexOf("function visitsPerReward(target"));
    expect(design).toContain("/publish");
    // Step 2 saves the rules but must never publish — leaving half-way has to
    // leave a draft, not a live card.
    const rules = html.slice(html.indexOf("function createRulesScreen(id)"),
                             html.indexOf("function createDesignScreen(id)"));
    expect(rules).not.toContain("/publish");
    expect(rules).toContain("Save and finish later".slice(0, 4));
  });

  /**
   * The preview-only screen these two tested is gone: the flow makes a real
   * card now, so there is no copy to keep away from the live one. The guard in
   * the designer stays — it is what stops any future caller mounting the panel
   * in draft mode and writing through it — and this is what still holds it.
   */
  it("keeps the designer's draft guard, with nothing relying on it", () => {
    expect(html).toContain("if (env.draft)");
  });

  /**
   * The address the old reward picker lived at was linked from the Create menu
   * for months. It forwards to the step that replaced it rather than 404ing.
   */
  it("forwards the old reward address into the wizard", () => {
    expect(html).toContain('navigate("/create/card", { replace: true })');
  });

  /** Configure, preview, send — and the send is real. */
  it("runs a campaign through three steps and one real send", () => {
    expect(campaign).toContain('<li class="on">Who and what</li>');
    expect(campaign).toContain("<li>Preview</li>");
    expect(campaign).toContain("<li>Send</li>");
    expect(campaign).toContain("data-preview");
    expect(campaign).toContain("confirmAndSend(ready, { target: sel.value");
    // The three named types are pre-filled wording over the same sender —
    // no new machinery, nothing new on the server.
    expect(html).toContain('seg: "lost"');
    expect(html).toContain('seg: "regular"');
  });

  /**
   * Nothing in PunchMe messages a customer on a timer — automated win-back was
   * removed for that reason — and a campaign screen is exactly where that would
   * creep back in. It says so instead of implying otherwise.
   */
  it("schedules nothing, and says so", () => {
    expect(campaign).toContain("Scheduling and repeats are coming.");
    expect(campaign).toContain("nothing goes out without you");
    expect(campaign).not.toContain("setInterval");
    expect(campaign).not.toContain("schedule:");
  });

  /** The reach line names the whole group and what the limit will hold back. */
  it("says who it reaches and who the limit will skip", () => {
    expect(campaign).toContain("const held = Math.max(0, total - ready);");
    expect(campaign).toContain("at the weekly limit and will be skipped");
  });
});

/**
 * The customer's own page — the first screen in this product addressed to a
 * customer who already has a card.
 */
describe("the customer's own page", () => {
  const mine = customerCardPage(POSTER_CARD as never, "Kopi Corner", 3, true);
  const theirs = customerCardPage(POSTER_CARD as never, "Kopi Corner", 0, false);

  it("wears the shop's colours and says what the deal is", () => {
    expect(mine).toContain("Kopi Corner");
    expect(mine).toContain(String(POSTER_CARD.stamps_target));
    expect(mine).toContain(POSTER_CARD.reward);
    expect(mine).toContain("mhero");
  });

  /**
   * The privacy promise is made ON the page it most concerns. This is the one
   * screen a customer reads after they have a card, and the temptation to ask
   * for an email "so we can tell you about your reward" would land here first.
   */
  it("asks for nothing, and says so", () => {
    expect(mine).toContain("No name, no phone number, no email — ever.");
    expect(mine).toContain('href="/privacy"');
    for (const field of ["type=\"email\"", "type=\"tel\"", 'name="name"', "autocomplete=\"name\""]) {
      expect(mine).not.toContain(field);
    }
  });

  /**
   * No serial and no auth token, ever. Both live inside cards on customers'
   * phones and the barcode content IS the serial — an address bar is not where
   * either belongs.
   */
  it("carries no pass credential", () => {
    for (const html of [mine, theirs]) {
      expect(html).not.toContain("auth_token");
      expect(html).not.toContain("authToken");
      expect(html).not.toContain("serial");
    }
  });

  /** A browser with no card is the ordinary case, not an error. */
  it("offers a card rather than an error when this browser has none", () => {
    expect(theirs).toContain("Get your card");
    expect(theirs).not.toContain("Your progress will show here");
    expect(mine).toContain("Your progress will show here");
  });

  /** What is not built yet is marked, rather than mocked up as working. */
  it("marks the parts that are not built yet", () => {
    expect(mine).toContain("msoon");
    expect(mine).toContain("Marketing messages");
    expect(mine).toContain("Deleting the card from your\n        wallet stops everything today.");
  });
});

/**
 * The screen builders, actually run.
 *
 * Compiling the dashboard's JavaScript proves it has no typos, and grepping it
 * proves the right words are in it. Neither notices a row that renders "NaN%",
 * a label that comes out "undefined", or a percentage that divides by zero —
 * and those are the failures a placeholder screen is most likely to have,
 * because the data behind it is invented.
 *
 * These are the builders that take data and return HTML, pulled out of the
 * real page text so they cannot drift from what ships.
 */
describe("the screen builders, actually run", () => {
  const html = dashboardPage({ emailConfigured: true } as never);
  /**
   * A named chunk of the real page text.
   *
   * Throws when either marker is gone, and that is the whole point: indexOf
   * returns -1 for a marker that has been edited away, slice(from, -1) then
   * quietly returns almost the entire page, and new Function() below receives
   * a second copy of every declaration in it. The failure that produced was
   * "Identifier 'ROOT' has already been declared" — a true statement about a
   * problem nowhere near ROOT. Fail where the marker is instead.
   */
  const cut = (from: string, to: string) => {
    const a = html.indexOf(from), b = html.indexOf(to);
    if (a < 0) throw new Error(`screen-builder marker gone from the page: ${from.slice(0, 60)}`);
    if (b < 0) throw new Error(`screen-builder end marker gone from the page: ${to.slice(0, 60)}`);
    return html.slice(a, b);
  };

  const B = new Function(
    'function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){' +
      'return {"&":"&amp;","<":"&lt;",">":"&gt;",\'"\':"&quot;"}[c];});}' +
      'const ROOT = "/dashboard";' +
      cut("const KIND_LABEL =", "function manageScreen()") +
      cut("function custCard(x)", "/**\n     * What happened at the counter today.") +
      cut("function dealLine(card)", "function endedNote()") +
      "return { custCard, dealLine, segLabel, KIND_LABEL };",
  )();


  it("renders a customer row for each segment, and for someone in today", () => {
    for (const health of ["regular", "returning", "new", "lost"]) {
      const c = B.custCard({ code: "K4M7XQ", health, stamps: 3, target: 10, lastDays: 4 });
      expect(c).toContain("h-" + health);
      expect(c).toContain("K4M7XQ");
      expect(c).not.toContain("undefined");
    }
    expect(B.custCard({ code: "A1", health: "new", stamps: 0, target: 8, lastDays: 0 }))
      .toContain("in today");
    expect(B.custCard({ code: "A1", health: "new", stamps: 0, target: 8, lastDays: 1 }))
      .toContain("yesterday");
  });

  /**
   * The insight says one thing or nothing. A shop with no customers must get
   * nothing — an empty shop being told about its segments is the sort of
   * confident nonsense that makes a whole screen untrustworthy.
   */

  it("describes the deal for each kind of card", () => {
    expect(B.dealLine({ kind: "stamp", stampsTarget: 10, reward: "a free coffee" }))
      .toBe("Collect 10 stamps, get a free coffee");
    expect(B.dealLine({ kind: "membership", reward: "Members' pricing" })).toBe("Members' pricing");
    expect(B.dealLine({ kind: "points", reward: "" })).toBe("Points on every visit");
    // A card with no reward written yet still reads as a sentence.
    expect(B.dealLine({ kind: "stamp", stampsTarget: 6, reward: "" }))
      .toBe("Collect 6 stamps, get a reward");
  });
});

describe("no invented data anywhere in the dashboard", () => {
  const html = dashboardPage({ emailConfigured: true } as never);

  /**
   * There WAS a whole module of made-up numbers here — two example programmes,
   * three example campaigns, and an "Example" chip rendered beside every one of
   * them so an owner could tell them from their own.
   *
   * The chip was not enough. It marked a row that sat in the same list, at the
   * same size, in the same chart as the shop's real programmes, and the thing
   * an owner does with a chart is glance at it. Its whole file is deleted; what
   * replaces it on an empty screen is a sentence saying there is nothing yet
   * and a button that starts the thing that would fill it.
   */
  it("carries no mock module, no chip, and no invented row", () => {
    expect(html).not.toContain("MOCK_");
    // Dotted, because .segchip — a real class — contains the bare word.
    expect(html).not.toContain(".egchip");
    expect(html).not.toContain(".egrow");
    expect(html).not.toContain(".egmark");
    expect(html).not.toContain("mockCard");
    expect(html).not.toContain(">Example<");
  });

  it("answers an empty screen with the way to fill it", () => {
    // Both charts, and the campaigns pane, say what is missing and offer the
    // one control that changes it.
    expect(html).toContain("No programmes yet. Publish one and it shows up here.");
    expect(html).toContain("No campaign data yet.");
    expect(html).toContain('data-nav="/create/reward"');
    expect(html).toContain('data-nav="/create/campaign"');
  });
});

/**
 * The Send-to dropdown names how many customers are in each group; the line
 * under the button says how many of them this message will actually reach, and
 * where the rest went. Showing only the sendable figure made a group of nine
 * read as five with no explanation — customers appearing to go missing rather
 * than a limit doing its job.
 */
describe("the notification audience", () => {
  const html = dashboardPage({ emailConfigured: true } as never);

  it("counts the whole group in the dropdown, not the sendable part", () => {
    expect(html).toContain('>Everyone (\' + everyone +');
  });

  it("names the group size, never the eligible count, in the options", () => {
    expect(html).toContain("h.customers +");
    expect(html).not.toContain("h.eligible + \")</option>\"");
  });

  /**
   * Two lines that add up to the dropdown's number, and one reason for the gap.
   * The rest of the group is described as being at the weekly limit even when
   * some of them deleted the card: that second number is one an owner can do
   * nothing about, and it reads as a scoreline against themselves. The server
   * still counts it — health[].removed — it just is not on this screen.
   */
  it("says how many will get it and how many will not, in two lines", () => {
    expect(html).toContain("const held = Math.max(0, total - ready);");
    expect(html).toContain('lines.join("<br>")');
    expect(html).toContain('" at the weekly limit"');
  });

  it("never tells an owner how many customers deleted their card", () => {
    // The parked customer-search fold names it per card; the audience line and
    // the send result must not put a COUNT of it on screen.
    const panel = html.slice(html.indexOf("function paintAudience"), html.indexOf("function load"));
    expect(panel).not.toContain("deleted the card");
    expect(panel).not.toContain("removed");
  });
});

describe("the poster's print button on a phone", () => {
  const html = posterPage(POSTER_CARD, "Kopi Corner", "kopi-corner", 3);

  /**
   * window.print() is present on phones and, in several browsers, simply does
   * nothing — so the button looked broken. It is now wrapped, and a share sheet
   * (the one reliable route from a phone to a printer, or to a computer that
   * has one) appears wherever navigator.share exists.
   */
  it("wraps print rather than trusting it", () => {
    expect(html).toContain("try { window.print(); }");
    expect(html).not.toContain('onclick="window.print()"');
  });

  it("offers a share sheet, and only where there is one", () => {
    expect(html).toContain("if (navigator.share)");
    expect(html).toContain("navigator.share({ title: document.title, url: location.href })");
    // Hidden by default: on a laptop the share button would be a dead end.
    expect(html).toContain('data-share style="display:none');
    expect(html).toContain('data-phint style="display:none');
  });

  /** The hint has to say what to DO, not that something is unsupported. */
  it("tells a phone user how to actually get paper", () => {
    expect(html).toContain("Share this page to a computer that has a printer");
  });
});

describe("the merchant launch journey", () => {
  const html = dashboardPage({ emailConfigured: true } as never);

  it("keeps the three launch steps and their destinations in the dashboard", () => {
    const home = html.slice(html.indexOf("function homeScreen()"),
                            html.indexOf("const ICON_CARET"));
    expect(home).toContain("Create your card");
    expect(home).toContain("Share your card");
    expect(home).toContain("Start stamping");
    expect(html).toContain('["/ready/:id"');
    expect(V2_SCREENS).toContain("/ready/:id");
  });

  it("hands a newly published card to a clear ready screen", () => {
    const design = html.slice(html.indexOf("function createDesignScreen(id)"),
                             html.indexOf("function oneOrTwo(value)"));
    expect(design).toContain('navigate("/ready/" + id)');
    expect(html).toContain("Your card is ready");
    expect(html).toContain("How it works");
  });

  it("uses the card's sign-up address and records a meaningful share action", () => {
    expect(html).toContain('"/c/" + encodeURIComponent(card.id) + "?s=link"');
    expect(html).toContain('api("/onboarding/share", { method: "POST" })');
    expect(html).toContain("Create social post");
    expect(html).toContain("Print your poster");
  });

  it("keeps the scanner home-screen hint non-sensitive and makes a saved poster visible", () => {
    expect(staffPage(true)).toContain("Add scanner to Home Screen");
    expect(staffPage(true)).not.toContain("localStorage");
    const poster = posterPage(POSTER_CARD, "Kopi Corner", "kopi-corner", 3, false, {
      message: "Free coffee is closer than you think.",
      detail: "Join today.",
      background: "dark",
    });
    expect(poster).toContain("Free coffee is closer than you think.");
    expect(poster).toContain("Join today.");
  });
});

describe("a staging copy announces itself on every page", () => {
  // ENV_NAME is read per render (envName(), src/config.ts), so one process can
  // exercise both sides — the same trick e2e uses for ALLOW_PUBLIC_SIGNUP.
  it("live pages carry no strip and no noindex", () => {
    delete process.env.ENV_NAME;
    const html = staffPage(false);
    expect(html).not.toContain("not the real site");
    expect(html).not.toContain('name="robots"');
  });

  it("staging pages carry both, via the one shared shell", () => {
    process.env.ENV_NAME = "staging";
    try {
      // Three pages from three different audiences — owner, staff, customer —
      // because the strip lives in page() and must reach all of them at once.
      for (const html of [staffPage(false), dashboardPage(false), notReadyPage()]) {
        expect(html).toContain("not the real site");
        expect(html).toContain('<meta name="robots" content="noindex">');
      }
    } finally {
      delete process.env.ENV_NAME;
    }
  });
});

/**
 * The opt-out, as the customer meets it.
 *
 * The privacy notice exists in two languages and they are ONE obligation under
 * PDPA s.7(3), not a translation nicety — src/pages.ts says a discrepancy
 * between them is worse than either version alone. So the check that they moved
 * together is a test, not a good intention.
 */
describe("stopping messages, as a customer", () => {
  const en = privacyPage("hello@punchme.test");
  const bm = privacyPageBm("hello@punchme.test");

  it("no longer tells customers that deleting the card is the only way", () => {
    // This was true when it was written and stopped being true the moment a
    // consent column existed. It was also the sentence the notice made a
    // promise out of, which is why it could not be left behind.
    expect(en).not.toContain("That is the whole opt-out");
    expect(en).toContain("Stop messages");
    expect(bm).toContain("Stop messages");
  });

  it("says in BOTH languages that the card keeps working", () => {
    // The honest surprise: stamps still arrive. Somebody expecting silence and
    // still getting a lock-screen banner would think the switch was broken.
    expect(en).toContain("Your card keeps working");
    expect(bm).toContain("Kad anda tetap berfungsi");
  });

  it("still offers deleting the card as the way to stop everything", () => {
    expect(en).toContain("To stop everything");
    expect(bm).toContain("Untuk menghentikan semuanya");
  });

  it("gives the customer both directions on their own page", () => {
    const on = stopMessagesPage("Kopi Corner", false);
    const off = stopMessagesPage("Kopi Corner", true);
    expect(on).toContain("Stop sending me messages");
    expect(off).toContain("Turn messages back on");
    // The one thing this page exists to say.
    expect(on).toContain("Your card keeps working either way");
    expect(off).toContain("Your card keeps working either way");
  });

  it("escapes the shop name, like every other page that prints one", () => {
    expect(stopMessagesPage("</title><script>x</script>", false)).not.toContain("<script>x</script>");
  });
});
