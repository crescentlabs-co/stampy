/**
 * The pages are template strings and there is no build step, so a typo in a
 * page's inline <script> would ship silently and break that screen in the
 * browser with nothing failing here. These tests compile every inline script
 * (compile only — nothing runs, so no DOM is needed) and check the handful of
 * structural promises the server relies on.
 */
import { describe, expect, it } from "vitest";
import { FLAG_GUIDE } from "../src/health.js";
import {
  adminPage,
  dashboardPage,
  landingPage,
  marketingPage,
  MODAL_JS,
  PALETTE_JS,
  posterPage,
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
      expect(html.match(/\.crlist \{/g)!.length).toBe(1);
    }
  });

  it("points the owner's copy at their card and the console's at a design", () => {
    expect(dash).toContain('path: (suffix) => "/card/" + card.id + suffix');
    expect(admin).toContain('path: (suffix) => "/design/" + d.id + suffix');
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
    // Comments are stripped first: prose may mention a name the code must not use.
    const panel = panelOf(dash)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    for (const gone of [/\bbase\b/, /\bS\.cards\b/, /\bartBase\b/]) {
      expect(gone.test(panel), `the panel still reads ${gone}`).toBe(false);
    }
    // Everything that leaves the panel goes through env. (onRulesSaved is the
    // sentinel panelOf slices at, so it sits just past the end by construction.)
    for (const via of ["env.artUrl(", "env.path(", "env.customersPath", "env.designOpen", "env.showDetails"]) {
      expect(panel).toContain(via);
    }
  });

  it("asks about live customers only where there are any", () => {
    // A saved design is in nobody's wallet, so the "this reaches N customers"
    // confirmation has no number to name and must not invent one.
    expect(dash).toContain("customersPath: \"/customers?cardId=\"");
    expect(admin).toContain("customersPath: null");
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

  it("asks the four questions in the order you would ask them", () => {
    const order = ["Did they start?", "Are people signing up?", "Do customers come back?", "Is it worth anything?"];
    let at = -1;
    for (const q of order) {
      const i = html.indexOf(q);
      expect(i).toBeGreaterThan(at);
      at = i;
    }
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
  it("puts the whole designer on screen, open", () => {
    expect(html).toContain("designOpen: true");
    expect(html).toContain('wrap.className = "designhost"');
    // Both targets are reachable without creating anything first.
    expect(html).toContain('data-mode="design"');
    expect(html).toContain('data-mode="card"');
    expect(html).toContain("Start a design");
    expect(html).not.toContain("Name a design on the left");
  });

  it("has no trace of the preset card builder", () => {
    for (const gone of ["VERTICALS", "data-vpick", "Business type", "Chicken rice", "Bubble tea"]) {
      expect(html).not.toContain(gone);
    }
  });

  it("edits a card's look but never its terms", () => {
    expect(html).toContain("showDetails: false");
    expect(html).toContain('rulesSaveLabel: "Save name"');
    // The shop name is the one detail the console does set.
    expect(html).toContain('data-f="shopName"');
  });

  it("opens on the portfolio, not on four hero numbers", () => {
    expect(html).toContain("How everyone is doing");
    for (const panel of ["Health", "Performance", "Value", "Retention"]) {
      expect(html).toContain(">" + panel);
    }
    expect(html).toContain("lifebar");
    // The old strip.
    expect(html).not.toContain("stamping this week</span>");
    expect(html).not.toContain("cards in wallets</span>");
  });

  it("draws the sign-up funnel as a funnel", () => {
    expect(html).toContain('class="fnl"');
    expect(html).toContain("function funnelHtml(m)");
  });

  it("documents every problem it can raise", () => {
    expect(html.match(/class="chipf warn"/g)!.length).toBe(FLAG_GUIDE.length);
  });
});

/**
 * "At the counter" states facts and stops.
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
  // The block lives at the bottom of the Customers tab, folded away.
  const block = html.slice(
    html.indexOf("// ---- At the counter"),
    html.indexOf("/** Send. The server decides"),
  );

  it("is actually on the page", () => {
    expect(block.length).toBeGreaterThan(500);
    expect(html).toContain("At the counter");
    expect(html).toContain("data-counter");
    // Folded and last: it must never push the message box off the screen.
    expect(html.indexOf("data-counter")).toBeGreaterThan(html.indexOf("data-find"));
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
    expect(html).toContain("Update the card everywhere?");
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

  // Design is one folded block sitting directly under the preview it changes.
  // The logo belongs inside it, with the colours it feeds — pulling it out on
  // its own put half a section above the fold and half below.
  it("keeps Design as one block under the preview, above the rules", () => {
    expect(html).toContain("<summary>Design</summary>");
    const at = (s: string) => html.indexOf(s);
    expect(at("<summary>Design</summary>")).toBeLessThan(at("data-logo"));
    expect(at("data-logo")).toBeLessThan(at("data-roles"));
    expect(at('data-a="savedesign"')).toBeLessThan(at('data-f="shopName"'));
  });

  // Colours was a .sec — a bordered 1.1rem heading — while Band and Stamps were
  // plain labels, so one of three peers looked like their parent.
  it("gives every design section the same weight and a one-word name", () => {
    const design = html.slice(html.indexOf("<summary>Design</summary>"), html.indexOf('data-a="savedesign"'));
    expect(design).not.toContain('class="sec');
    for (const name of ["Logo", "Colours", "Band", "Stamps"]) {
      expect(design).toContain(`>${name}`);
    }
    expect(html).not.toContain("Band texture");
    expect(html).not.toContain("Stamp icon");
  });

  // Three cohort rows and a card dropdown said what one line under the button
  // says. The limit was never enforced here anyway — canNudge decides.
  it("sends notifications from one box with one button", () => {
    expect(html).toContain("Notifications");
    expect(html).toContain("Push notification");
    expect(html).toContain("already messaged this week");
    expect(html).not.toContain("data-buckets");
    expect(html).not.toContain("Bring people back");
    expect(html).toContain("Find a customer");
    // The 7-day rule is the thing people ask about, so it is on the heading.
    expect(html).toContain("once every 7 days");
    // "Also issued: N deleted the card" is gone — an owner can do nothing about
    // it, and it read as a scoreline against them.
    expect(html).not.toContain("Also issued");
  });

  // Two controls set the same five fields: a chip row and a row of five colour
  // squares. Two controls for one job read as two different jobs.
  it("picks colours from one labelled list, not a chip row plus five squares", () => {
    expect(html).toContain("data-roles");
    expect(html).toContain("crhead");
    expect(html).toContain("Custom…");
    expect(html).not.toContain("rolebtn");
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
  it("offers the same band textures the server will accept", () => {
    for (const t of ["stripes", "dots", "chevron", "grain", "rays"]) {
      expect(html).toContain(`style: "${t}"`);
    }
  });

  // Six preset tiles did what the emoji field does, and every card starts on
  // dots anyway. Three routes remain, each a different kind of answer.
  it("offers dots, any emoji or your own shape — no preset tiles", () => {
    expect(html).not.toContain("data-stamptpl");
    expect(html).not.toContain("STAMP_ICONS");
    expect(html).toContain("data-emoji");
    expect(html).toContain(">Plain dots<");
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
