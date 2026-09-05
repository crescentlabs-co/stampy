/**
 * The shared UI kit: the page shell, the design tokens, and every block of
 * browser code that more than one page renders.
 *
 * This file was carved out of src/pages.ts, which had grown past 8,000 lines
 * and held both these shared pieces and every page that uses them. Nothing here
 * changed in the move — it is the same text, in a file the dashboard and the
 * admin console can both import without importing each other.
 *
 * src/pages.ts re-exports all of it, so every existing import of
 * `../pages.js` still resolves. Dependencies point one way only:
 * pages.ts → dashboardV2.ts → ui/kit.ts.
 */
import { envName } from "../config.js";

/**
 * What the product is called. Renaming lives here, once.
 *
 * **Three things that look like the name are NOT the name, and renaming them
 * breaks something that cannot be repaired from this side:**
 *
 *   - `stampy_session`, `stampy_cust_*`, `stampy_card_*`, `stampy_staff_*`
 *     (src/auth.ts) are COOKIE NAMES sitting in people's browsers right now.
 *     The customer one lasts 400 days and is the only thing that says "this
 *     browser already has a card" — rename it and every customer is minted a
 *     duplicate card on their next visit.
 *   - `<issuer>.stampy-<cardId>` (src/googleModel.ts) is the Google Wallet
 *     class id, re-sent on every stamp. Rename it and every Android card ever
 *     issued stops updating, permanently, with no way to tell the phone.
 *   - `pass.com.stampy.*` is the Apple Pass Type ID, registered with Apple and
 *     baked into every issued .pkpass. It comes from PASS_TYPE_ID in Railway
 *     and is Apple's to change, not ours.
 *
 * A name is a label; those three are identifiers that happen to contain it.
 */
export const PRODUCT_NAME = "PunchMe";

/**
 * The footer that carries the name inside an owner's dashboard and the console.
 * One line, centred, at the bottom of whichever tab you are on — the merchant's
 * own brand is what a dashboard should feel like, so ours signs it rather than
 * heading it.
 */
export const POWERED_BY = `<p class="pby">Powered by ${PRODUCT_NAME}</p>`;

export const baseCss = /* css */ `
  /* Font face is declared INLINE (not a separate cacheable stylesheet) so a
     content change is never served stale behind an immutable cache. The woff2
     has a unique filename, so it caches safely. */
  @font-face {
    font-family: "Bricolage Grotesque";
    font-style: normal;
    font-weight: 400 700;
    font-display: swap;
    src: url("/assets/fonts/bricolage-grotesque-latin.woff2") format("woff2");
  }
  /* Headlines only. The body stays on the grotesque, which is what the staff
     stamper is read in at arm's length — a serif there would be a downgrade. */
  @font-face {
    font-family: "Instrument Serif";
    font-style: normal;
    font-weight: 400;
    font-display: swap;
    src: url("/assets/fonts/instrument-serif-latin.woff2") format("woff2");
  }
  @font-face {
    font-family: "Instrument Serif";
    font-style: italic;
    font-weight: 400;
    font-display: swap;
    src: url("/assets/fonts/instrument-serif-latin-italic.woff2") format("woff2");
  }
  @font-face {
    font-family: "Figtree";
    font-style: normal;
    font-weight: 400 900;
    font-display: swap;
    src: url("/assets/fonts/figtree-latin.woff2") format("woff2");
  }
  /* The two faces everything is actually set in. Two families, because one
     family doing both jobs is why a heading and the paragraph under it used to
     read as the same thing at two sizes. Inter Tight is the narrower cut of the
     same design, so the pair agree about letter shapes and disagree about
     width — which is the difference you want between a heading and a sentence.
     Both are variable files: one request each covers every weight we set. */
  @font-face {
    font-family: "Inter Tight";
    font-style: normal;
    font-weight: 500 800;
    font-display: swap;
    src: url("/assets/fonts/inter-tight-latin.woff2") format("woff2");
  }
  @font-face {
    font-family: "Inter";
    font-style: normal;
    font-weight: 400 700;
    font-display: swap;
    src: url("/assets/fonts/inter-latin.woff2") format("woff2");
  }
  :root {
    /* See DESIGN.md. White page, near-black panels for weight, and one neon that
       only ever marks the next thing to press. Neutrals carry a green bias so
       they sit under the accent instead of fighting it. */
    --bg: #ffffff; --surface: #f2f4f1; --slab: #101312;
    --ink: #0c0e0d; --ink2: #3b403a;
    --muted: #5f6560; --line: #e3e7e1; --field-border: #cdd2cb; --ghost-bg: #eceee9;
    /* --accent is a FILL or a BORDER, never text: neon on white cannot be read.
       That is what --on-accent and --accent-dark are for. */
    --accent: #c9f73d; --accent-2: #b8e82c; --on-accent: #0c0e0d;
    --accent-dark: #2f3630; --on-slab: #f4f6f2;
    /* --- the scale ---------------------------------------------------------
       SIX text sizes, and the jump between them is roughly 1.3–1.45×. That gap
       is the point: the dashboard had grown 22 sizes, twelve of them inside a
       3.5px range, and a difference nobody can perceive does not read as a
       hierarchy — it reads as carelessness. If a new size seems needed, one of
       these six is wrong for the job; do not add a seventh. */
    --t-hero: 2rem;      /* 32px — the one big number on a screen */
    --t-xl: 1.5rem;      /* 24px — a metric's number, a screen title */
    --t-lg: 1.125rem;    /* 18px — a section heading */
    --t-md: .875rem;     /* 14px — body, and a row's name or value */
    --t-sm: .75rem;      /* 12px — the subtext under either of those */
    --t-xs: .6875rem;    /* 11px — labels, uppercase and tracked. Nothing else */
    /* Line height belongs to the scale. One global 1.5 left headings loose and
       small text cramped, because those two want opposite things. These are
       deliberately airy: the whole complaint about the old type was that it
       felt cramped, and line spacing is most of what "breathable" means. */
    --lh-num: 1.1;       /* a number standing alone. No line below it to clear */
    --lh-tight: 1.25;    /* headings */
    --lh-body: 1.65;     /* body */
    --lh-read: 1.75;     /* a paragraph somebody has to read */
    /* Tracking belongs to the scale too, and it is paired to SIZE, because that
       is how Inter is drawn: it wants tightening as it gets big and opening up
       as it gets small. We had ten tracking values chosen one at a time, and
       most of them squeezed. --display is Inter TIGHT, a narrow cut already;
       tightening a narrow face is what made headings feel packed. */
    --tr-hero: -.02em;   /* --t-hero and --t-xl: big display, gently closed */
    --tr-lg: -.01em;     /* --t-lg section headings */
    --tr-body: 0;        /* --t-md. Inter is drawn correct at reading size */
    --tr-sm: .005em;     /* --t-sm. Small text needs air, not less of it */
    --tr-caps: .06em;    /* --t-xs uppercase labels. Caps always need opening */
    --tr-code: .04em;    /* a short code, read one character at a time */
    /* THREE radii and the pill. Was six — 7, 8, 10, 12, 14 and 22px, side by
       side on things that mean the same thing. */
    --r-sm: 10px;        /* chips, inputs, small controls */
    --r: 16px;           /* cards, rows, blocks */
    --r-lg: 24px;        /* sheets, and the scroll box */
    /* One 4px spacing scale, replacing twenty-odd paddings that differed by a
       pixel or two. A card is --s3 or --s4 and nothing else. */
    --s1: 4px; --s2: 8px; --s3: 16px; --s4: 24px; --s5: 40px;
    --shadow: 0 10px 30px -16px rgba(12,14,13,.18), 0 2px 6px rgba(12,14,13,.06);
    /* Headings and big numbers take the narrow cut, sentences take the normal
       one. Change these two lines and the whole product changes with them —
       nothing else in the codebase names a font family by hand. */
    --display: "Inter Tight", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    --body: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  * { box-sizing: border-box; margin: 0; }
  body {
    font-family: var(--body); line-height: var(--lh-body); letter-spacing: var(--tr-body);
    background: var(--bg); color: var(--ink); min-height: 100vh;
    -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
    display: flex; flex-direction: column; align-items: center;
    padding: 28px 16px 56px;
  }
  .card {
    background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-lg);
    padding: 28px 26px; box-shadow: var(--shadow); width: 100%; max-width: 440px;
  }
  /* The shell is the page, so it is white and the boxes on it are what carry the
     tint. Higher specificity than a bare .card on purpose: every page's own CSS
     is declared after this one, and one of them kept turning the shell grey. */
  body > .card { background: var(--bg); }
  h1 { font-family: var(--display); font-weight: 800; font-size: var(--t-xl); line-height: var(--lh-tight);
       letter-spacing: var(--tr-hero); margin-bottom: 10px; text-wrap: balance; }
  h2 { font-family: var(--display); font-weight: 800; font-size: var(--t-lg); line-height: var(--lh-tight);
       letter-spacing: var(--tr-lg); margin: var(--s4) 0 var(--s3); }
  p.sub { color: var(--muted); margin-bottom: 22px; }
  .btn {
    display: block; width: 100%; text-align: center; padding: 15px 20px;
    border-radius: 14px; border: none; font-size: 1.02rem; font-weight: 600;
    cursor: pointer; text-decoration: none;
  }
  .btn { border-radius: 999px; font-weight: 700; }
  /* The primary. Only one of these on a screen. */
  .btn-neon { background: var(--accent); color: var(--on-accent); }
  .btn-neon:hover { background: var(--accent-2); }
  .btn-dark { background: var(--ink); color: var(--on-slab); }
  /* The counter's own button. Neon, and deliberately the loudest thing there. */
  .btn-stamp { background: var(--accent); color: var(--on-accent); }
  .btn-ghost { background: var(--ghost-bg); color: var(--ink); }
  .btn-ghost:hover { background: var(--line); }
  /* A quiet control inside a tinted box goes white. --ghost-bg on --surface is
     one shade of difference, so an opened fold read as a single grey slab with
     its buttons dissolved into it. The tint marks the region; the things you
     press sit on the page colour with a hairline. An inset shadow rather than a
     border, so adding it moves nothing by 2px. This is the rule the console's
     .dpanel already followed on its own — it is written down here instead. */
  :is(.fold, .grp, .bucket, .mdetail) .btn-ghost {
    background: var(--bg); box-shadow: inset 0 0 0 1px var(--field-border);
  }
  :is(.fold, .grp, .bucket, .mdetail) .btn-ghost:hover { background: var(--surface); }
  .btn { transition: transform .09s ease, filter .15s ease; }
  .btn:active { transform: scale(.985); }
  .btn:disabled { opacity: .45; cursor: not-allowed; }
  @media (prefers-reduced-motion: reduce) { .btn { transition: none; } .btn:active { transform: none; } }
  .muted { color: var(--muted); font-size: var(--t-sm); line-height: var(--lh-read); }
  input, textarea, select {
    width: 100%; padding: 13px 14px; border: 1px solid var(--field-border); border-radius: var(--r-sm);
    /* 1rem and NOT --t-md, which is smaller. iOS Safari zooms the whole page
       when you focus a field under 16px, and it does not zoom back out. This
       one stays off the scale on purpose. */
    font-size: 1rem; font-family: inherit; background: var(--bg); color: var(--ink);
  }
  input:focus, textarea:focus, select:focus { outline: 2px solid var(--ink); outline-offset: 1px; border-color: transparent; }
  :where(a, button, summary, [tabindex]):focus-visible { outline: 3px solid var(--ink); outline-offset: 2px; }
  :where(.onslab, .btn-dark, .btn-stamp):focus-visible { outline-color: var(--accent); }
  /* Uppercase with tracking is a good deal wider than sentence case at the same
     size. At .74rem/.05em "Welcome stamps" plus its info dot no longer fitted a
     three-across column and the dot dropped to a second line, so the size and
     the tracking are set to what actually fits the narrowest column we use. */
  /* Sentence case, not uppercase. Every label in the dashboard runs through
     here, so uppercasing shouted LOGO / STAMP / COLOURS / MESSAGE at an owner
     and turned any label that is a sentence rather than a word — the
     business-name switch, which is a <label> — into a wall of caps. Size and
     weight carry the hierarchy; the caps only added noise and cost legibility.
     The card MOCKS keep their uppercase (.pv-lbl, .pvg-lbl): those transcribe
     what Apple and Google actually print, and lowercasing them would make the
     preview lie about the real card. */
  label { font-size: var(--t-sm); font-weight: 700; letter-spacing: var(--tr-sm);
          color: var(--muted); display: block; margin: 14px 0 6px; }
  /* The one place our own name appears inside a merchant's dashboard, and the
     quietest thing on the page on purpose: what they are looking at is their
     shop, and we are the footnote under it. Same treatment on the console. */
  .pby { text-align: center; color: var(--muted); font-size: .72rem; letter-spacing: .04em;
         margin: 38px 0 2px; }
  .toast {
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    background: var(--ink); color: #fff; padding: 12px 20px; border-radius: 999px;
    font-size: .9rem; opacity: 0; transition: opacity .25s; pointer-events: none;
    max-width: 90vw; text-align: center; z-index: 50;
  }
  .toast.show { opacity: 1; }
`;

/** Owner-supplied text (café name, reward) going into markup, not into a script. */
export function esc(s: string): string {
  return s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
}

/**
 * The colour maths behind "upload your logo and we fill in the card".
 *
 * Kept as a SOURCE STRING because the dashboard's JavaScript lives inside a
 * template literal and there is no build step — it cannot import a module. That
 * would normally mean writing this twice, once for the browser and once to test
 * it; exporting the source instead means test/pages.test.ts evaluates the very
 * code the browser runs. Nothing here touches the DOM, so it is safe to eval.
 *
 * The point of the contrast functions: a palette pulled from a logo can easily
 * be two dark colours, and text picked to "look brand-y" would then be
 * unreadable on a phone at arm's length. Text is therefore never sampled — it
 * is computed against whatever sits behind it.
 */
export const PALETTE_JS = /* js */ `
  function _hex(n) { return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0"); }
  function toRgb(hex) {
    var h = String(hex || "").replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (!/^[0-9a-f]{6}$/i.test(h)) return [0, 0, 0];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function toHex(r, g, b) { return "#" + _hex(r) + _hex(g) + _hex(b); }

  /** WCAG relative luminance, 0 (black) to 1 (white). */
  function relLuminance(hex) {
    var c = toRgb(hex).map(function (v) {
      var s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  /** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
  function contrastRatio(a, b) {
    var la = relLuminance(a), lb = relLuminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  /** Text that can actually be read on this surface. Never sampled from a logo. */
  function pickTextColor(bg) {
    return contrastRatio("#ffffff", bg) >= contrastRatio("#141414", bg) ? "#ffffff" : "#141414";
  }
  /** Mix toward white (amount > 0) or black (amount < 0). */
  function shiftColor(hex, amount) {
    var c = toRgb(hex), t = amount > 0 ? 255 : 0, k = Math.abs(amount);
    return toHex(c[0] + (t - c[0]) * k, c[1] + (t - c[1]) * k, c[2] + (t - c[2]) * k);
  }
  /**
   * Away from a surface, so the two never read as the same colour.
   *
   * The direction cannot be read off the surface alone. Black on a dark card has
   * nowhere to go DOWN, and stepping up drags it THROUGH the card colour on the
   * way — losing contrast before it gains any. That is how a black stamp came
   * out mid-grey: the old rule picked "toward white" from the surface, then took
   * six steps of it. So try both ways and keep whichever clears the bar in the
   * fewest steps, or if neither can, whichever gets furthest.
   */
  function separate(hex, from, minRatio) {
    if (contrastRatio(hex, from) >= minRatio) return hex;
    var best = null;
    for (var d = 0; d < 2; d++) {
      var out = hex, n = 0;
      while (n < 6 && contrastRatio(out, from) < minRatio) { out = shiftColor(out, d ? 0.12 : -0.12); n++; }
      var ratio = contrastRatio(out, from);
      var cand = { hex: out, ok: ratio >= minRatio, n: n, ratio: ratio };
      var better = !best || (cand.ok && !best.ok) ||
        (cand.ok === best.ok && (cand.ok ? cand.n < best.n : cand.ratio > best.ratio));
      if (better) best = cand;
    }
    return best.hex;
  }

  /**
   * One emoji, not one character: ❤️ and 🧑‍🍳 are several code points each, and
   * slicing by character leaves half a glyph behind.
   */
  function firstGrapheme(s) {
    var str = String(s || "").trim();
    if (!str) return "";
    try {
      var seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
      var it = seg.segment(str)[Symbol.iterator]().next();
      if (!it.done) return it.value.segment;
    } catch (e) { /* older engine — fall through */ }
    return Array.from(str)[0] || "";
  }

  /**
   * Pixels (a flat RGBA array) → the five colours the card is built from.
   * Coarse buckets rather than true clustering: a logo has a handful of flat
   * colours, and 512 buckets separate them without the weight of k-means.
   */
  function paletteFrom(data) {
    var buckets = {}, k;
    for (var i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;                       // transparent
      var r = data[i], g = data[i + 1], b = data[i + 2];
      var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (mx > 244 && mn > 244) continue;                    // paper white
      if (mx < 14) continue;                                 // pure black
      k = (r >> 5) + "," + (g >> 5) + "," + (b >> 5);
      var e = buckets[k] || (buckets[k] = { n: 0, r: 0, g: 0, b: 0 });
      e.n++; e.r += r; e.g += g; e.b += b;
    }
    var list = [];
    for (k in buckets) {
      var q = buckets[k];
      var r2 = q.r / q.n, g2 = q.g / q.n, b2 = q.b / q.n;
      var mx2 = Math.max(r2, g2, b2), mn2 = Math.min(r2, g2, b2);
      list.push({ n: q.n, hex: toHex(r2, g2, b2), sat: mx2 ? (mx2 - mn2) / mx2 : 0 });
    }
    if (!list.length) return null;
    list.sort(function (a, c) { return c.n - a.n; });

    // The card colour carries text, so it must be dark enough to hold some.
    var bg = list[0].hex;
    if (relLuminance(bg) > 0.45) bg = shiftColor(bg, -0.55);

    // The most saturated colour with real presence — the brand's actual colour,
    // not the grey it happens to be printed on.
    var colourful = list.filter(function (x) { return x.sat > 0.25 && x.n >= list[0].n * 0.04; });
    colourful.sort(function (a, c) { return c.sat - a.sat; });
    var accent = colourful.length ? colourful[0].hex : shiftColor(bg, 0.45);

    // The band sits behind the stamps, so it has to differ from the card AND
    // leave the stamps visible on top of it.
    var second = list.length > 1 ? list[1].hex : shiftColor(bg, 0.18);
    var band = separate(second, bg, 1.35);
    // Measured against the CARD, not the band. The stamps do sit on the band,
    // but the band is a near neighbour of the card by construction (1.35 above),
    // so holding stamps 2.2:1 off the band was really holding them off the card
    // twice over — and it put a floor under how dark a stamp could be. A shop
    // that wants black stamps on a dark card can have them now; only a stamp
    // that would vanish into the card itself still gets moved.
    accent = separate(accent, bg, 1.6);

    var label = separate(list.length > 2 ? list[2].hex : accent, bg, 2.6);
    return { bg: bg, band: band, accent: accent, label: label, fg: pickTextColor(bg) };
  }
`;

/**
 * The confirmation popup and the ⓘ hint, shared by the dashboard and the staff
 * stamper. Exported as source, like PALETTE_JS, so both pages run one copy and
 * test/pages.test.ts compiles the code that actually ships.
 *
 * **This is not `confirm()`, and it must never become it.** A browser offers
 * "prevent this page from creating additional dialogs" after a few in a row; a
 * counter hits that in one shift, and from then on every dialog silently answers
 * "cancel" with nothing on screen. That is invariant 8, and it is why destructive
 * buttons on the stamper arm instead of asking. A popup we build ourselves has
 * no such switch, so it can carry the things an owner has to read before they
 * commit — which is the whole point: those sentences used to sit as grey subtext
 * under the button, where nobody read them either.
 *
 * `info()` is the other half. Anything that merely explains a field collapses
 * into a tappable ⓘ. Tappable, not hover: this is used on a phone, where there
 * is no hover and a tooltip is simply invisible.
 */
export const MODAL_JS = /* js */ `
  function mdlEsc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch];
    });
  }

  /**
   * Ask, and resolve true only if they confirm. bodyHtml is markup we build —
   * anything the user typed goes through mdlEsc on the way in.
   */
  function modal(title, bodyHtml, okLabel) {
    return new Promise(function (resolve) {
      var last = document.activeElement;
      var wrap = document.createElement("div");
      wrap.className = "mdl";
      wrap.innerHTML =
        '<div class="mdlbox" role="dialog" aria-modal="true" aria-labelledby="mdlt">' +
          '<h3 id="mdlt"></h3><div class="mdlbody"></div>' +
          '<div class="mdlrow">' +
            '<button type="button" class="btn btn-ghost" data-no>Cancel</button>' +
            '<button type="button" class="btn btn-dark" data-yes></button>' +
          "</div>" +
        "</div>";
      wrap.querySelector("#mdlt").textContent = title;
      wrap.querySelector(".mdlbody").innerHTML = bodyHtml;
      var yes = wrap.querySelector("[data-yes]"), no = wrap.querySelector("[data-no]");
      yes.textContent = okLabel || "Confirm";
      function close(answer) {
        document.removeEventListener("keydown", onKey, true);
        wrap.remove();
        if (last && last.focus) last.focus();
        resolve(answer);
      }
      function onKey(e) {
        if (e.key === "Escape") { e.preventDefault(); close(false); return; }
        // Two buttons, so the trap is just: keep Tab between them.
        if (e.key === "Tab") {
          e.preventDefault();
          (document.activeElement === yes ? no : yes).focus();
        }
      }
      yes.onclick = function () { close(true); };
      no.onclick = function () { close(false); };
      // Tapping the dim area behind it is a cancel, never a confirm.
      wrap.onclick = function (e) { if (e.target === wrap) close(false); };
      document.addEventListener("keydown", onKey, true);
      document.body.appendChild(wrap);
      yes.focus();
    });
  }

  /**
   * The same box, read-only: something to look at, with one way out.
   *
   * modal() above asks a question and its Cancel means "don't do it". A list of
   * what happened has nothing to cancel, and offering Cancel next to Confirm on
   * a page that only shows facts invites the reader to think one of them
   * commits something. So this has a single Close, and shares the dim backdrop,
   * the Escape handler and the focus return with modal() rather than growing a
   * second dialog to keep in step.
   */
  function sheet(title, bodyHtml) {
    var last = document.activeElement;
    var wrap = document.createElement("div");
    wrap.className = "mdl";
    wrap.innerHTML =
      '<div class="mdlbox" role="dialog" aria-modal="true" aria-labelledby="mdls">' +
        '<h3 id="mdls"></h3><div class="mdlbody"></div>' +
        '<div class="mdlrow"><button type="button" class="btn btn-dark" data-close>Close</button></div>' +
      "</div>";
    wrap.querySelector("#mdls").textContent = title;
    wrap.querySelector(".mdlbody").innerHTML = bodyHtml;
    var closeBtn = wrap.querySelector("[data-close]");
    function close() {
      document.removeEventListener("keydown", onKey, true);
      wrap.remove();
      if (last && last.focus) last.focus();
    }
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); close(); }
      // One button, so the trap is simply: Tab goes nowhere else.
      if (e.key === "Tab") { e.preventDefault(); closeBtn.focus(); }
    }
    closeBtn.onclick = close;
    wrap.onclick = function (e) { if (e.target === wrap) close(); };
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(wrap);
    closeBtn.focus();
  }

  /** A tappable ⓘ and the one line it reveals. Returns markup, not an element. */
  function info(text) {
    return '<button type="button" class="ihint" data-info="' + mdlEsc(text) + '" aria-label="What is this?">i</button>';
  }

  // One bubble for the whole page, and ONE piece of state for it. All of this
  // sits outside wireInfo on purpose: wireInfo runs again on every tab switch,
  // and a per-call closure would leave the previous panel's listeners holding a
  // stale "which icon is open", so an outside click would leave the current
  // icon lit and swallow the next tap on it.
  var infoTip = null, infoFor = null;
  function infoBubble() {
    if (!infoTip) {
      infoTip = document.createElement("div");
      infoTip.className = "itip";
      document.body.appendChild(infoTip);
    }
    return infoTip;
  }
  function hideInfo() {
    if (infoTip) infoTip.classList.remove("on");
    if (infoFor) infoFor.classList.remove("on");
    infoFor = null;
  }
  /**
   * Place it from the icon's own rect and clamp it to the viewport, rather than
   * anchoring it in CSS: these icons sit at very different places across a
   * panel, and a bubble pinned relative to its button runs off the edge of a
   * 375px phone.
   */
  function showInfo(btn) {
    var el = infoBubble();
    el.textContent = btn.dataset.info;
    // Positioned BEFORE it is made visible. It is hidden with visibility, not
    // display, so it still has layout to measure — and placing it first is what
    // stops a frame of the bubble appearing at the top-left corner.
    var r = btn.getBoundingClientRect();
    var pad = 10;
    var left = r.left + r.width / 2 - el.offsetWidth / 2;
    if (left + el.offsetWidth > window.innerWidth - pad) left = window.innerWidth - pad - el.offsetWidth;
    el.style.left = Math.round(Math.max(pad, left)) + "px";
    // Above the icon when there is no room below it.
    var below = r.bottom + 8;
    el.style.top = below + el.offsetHeight > window.innerHeight - pad
      ? Math.round(r.top - el.offsetHeight - 8) + "px"
      : Math.round(below) + "px";
    el.classList.add("on");
    btn.classList.add("on");
    infoFor = btn;
  }
  /**
   * Wire every ⓘ inside a root. Delegated from the root rather than bound per
   * button, so markup rendered later still works without re-wiring.
   */
  function wireInfo(root) {
    function target(e) {
      var el = e.target;
      if (!el || !el.closest) return null;
      var btn = el.closest("[data-info]");
      return btn && root.contains(btn) ? btn : null;
    }
    // Hover for a mouse, tap for a phone — where there is no hover at all, so a
    // hover-only hint would simply never appear. Focus covers the keyboard.
    root.addEventListener("mouseover", function (e) { var b = target(e); if (b && b !== infoFor) showInfo(b); });
    root.addEventListener("mouseout", function (e) { if (target(e)) hideInfo(); });
    root.addEventListener("focusin", function (e) { var b = target(e); if (b) showInfo(b); });
    root.addEventListener("focusout", function (e) { if (target(e)) hideInfo(); });
    root.addEventListener("click", function (e) {
      var btn = target(e);
      if (!btn) return;
      e.preventDefault();
      if (infoFor === btn) hideInfo(); else showInfo(btn);
    });
    // A tap anywhere else, a scroll, or Escape dismisses it — otherwise the
    // bubble sits over the page after the icon has scrolled away. Attached once,
    // for the same reason the state above is shared.
    if (!document.body.dataset.infoWired) {
      document.body.dataset.infoWired = "1";
      document.addEventListener("click", function (e) {
        var el = e.target;
        if (!el || !el.closest || !el.closest("[data-info]")) hideInfo();
      }, true);
      window.addEventListener("scroll", hideInfo, true);
      document.addEventListener("keydown", function (e) { if (e.key === "Escape") hideInfo(); });
    }
  }
`;

/**
 * The card designer, as one shared string.
 *
 * Lives here rather than in the dashboard page because the admin console
 * needs the SAME designer, not a second one that looks similar. It is spliced
 * into both pages' inline scripts; `test/pages.test.ts` compiles each of them,
 * which is the only type-checking any of this browser code gets.
 *
 * Depends on `MODAL_JS` for `info`, `modal` and `toast`, and on the calling
 * page for `firstGrapheme`. Everything else it reaches is passed in — see the
 * doc comment on `designPanel` below.
 */
/**
 * Styles for DESIGN_PANEL_JS. Any page that renders the designer includes this.
 *
 * Split out of the dashboard's stylesheet for the same reason the markup was:
 * the console renders the same panel, and a second hand-kept copy of these
 * selectors would drift from it silently — a designer that works in one place
 * and lays out wrong in the other.
 */
/**
 * The sliding segmented control — tabs on the owner dashboard, and now the two
 * panes of the admin console.
 *
 * Shared rather than copied, for the reason .fold had to be: the console
 * rendered `class="fold"` for months with no .fold rules anywhere in its
 * stylesheet, so every fold there was a bare <details> with a browser triangle.
 * A control that exists on two pages lives in one place.
 *
 * Pair it with SEG_JS, which is what actually slides the thumb.
 */
/**
 * A small menu hung off a button — the app's dropdown.
 *
 * Lives here rather than in the dashboard because two pages render it now: the
 * Manage screens, and the card designer's surface switcher, which the admin
 * console mounts too. That is the rule this file exists for — a second copy is
 * how the console ends up with a control that behaves differently.
 *
 * Closes on a tap outside, on Escape, and on a second tap of the same button.
 * Needs `esc` from the page around it, like the rest of this file.
 */
export const POPOVER_CSS = /* css */ `
    .pop { position: absolute; z-index: 30; top: calc(100% + var(--s2));
           background: var(--bg); border: 1px solid var(--line); border-radius: var(--r);
           box-shadow: var(--shadow); padding: var(--s3); min-width: 200px;
           max-width: calc(100% - var(--s2)); max-height: 60vh; overflow-y: auto; }
    .pop.right { right: 0; }
    .pop.left { left: 0; }
    .pop.center { left: 50%; transform: translateX(-50%); }
    .popgrp + .popgrp { margin-top: var(--s3); border-top: 1px solid var(--line);
                        padding-top: var(--s3); }
    .popgrp > span { display: block; font-size: var(--t-sm); color: var(--muted);
                     margin-bottom: var(--s2); }
    .popopt { display: flex; align-items: center; gap: var(--s2); width: 100%;
              background: none; border: 0; padding: var(--s2); border-radius: var(--r-sm);
              font: inherit; font-size: var(--t-md); color: var(--ink); text-align: left;
              cursor: pointer; }
    .popopt:hover { background: var(--surface); }
    .popopt.on { font-weight: 600; }
    /* A tick, not a fill: the neon marks the next thing to press and a chosen
       option is not that. */
    .popopt::before { content: ""; width: 16px; flex: none; }
    .popopt.on::before { content: "✓"; }
    .popopt:disabled { color: var(--muted); cursor: default; }
    .popopt:disabled:hover { background: none; }
`;

export const POPOVER_JS = /* js */ `
    function popover(host, buttons) {
      let pop = null, openSide = "";
      function away(e) {
        if (!pop) return;
        if (pop.contains(e.target)) return;
        if (buttons.some((b) => b && b.contains(e.target))) return;
        close();
      }
      function onKey(e) { if (e.key === "Escape") { e.preventDefault(); close(); } }
      function close() {
        if (pop) { pop.remove(); pop = null; }
        openSide = "";
        buttons.forEach((b) => b && b.classList.remove("on"));
        document.removeEventListener("pointerdown", away, true);
        document.removeEventListener("keydown", onKey, true);
      }
      function open(side, html, onPick, mark) {
        const was = openSide;
        close();
        if (was === side) return;
        pop = document.createElement("div");
        pop.className = "pop " + side;
        openSide = side;
        pop.innerHTML = html;
        host.appendChild(pop);
        if (mark) mark.classList.add("on");
        document.addEventListener("pointerdown", away, true);
        document.addEventListener("keydown", onKey, true);
        pop.addEventListener("click", (e) => {
          const b = e.target.closest("[data-set]");
          if (!b || b.disabled) return;
          const value = b.dataset.set;
          close();
          onPick(value);
        });
      }
      return { open, close };
    }

    /** One option inside a popover. */
    const popOpt = (set, name, on, off) =>
      '<button type="button" class="popopt' + (on ? " on" : "") + '" data-set="' + set + '"' +
      (off ? " disabled" : "") + ">" + esc(name) + "</button>";

`;

export const SEG_CSS = /* css */ `
    .seg { position: relative; display: flex; background: var(--ghost-bg); border-radius: 999px; padding: 5px; gap: 2px; }
    .seg button { position: relative; z-index: 1; flex: 1; border: none; background: none; font: inherit;
                  font-weight: 600; font-size: .9rem; color: var(--muted); padding: 10px 12px; cursor: pointer;
                  border-radius: 999px; white-space: nowrap; transition: color .2s; }
    .seg button.on { color: var(--on-accent); font-weight: 700; }
    .seg button:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
    .seg .thumb { position: absolute; z-index: 0; top: 5px; bottom: 5px; left: 0; width: 0; background: var(--accent);
                  border-radius: 999px; box-shadow: 0 2px 6px rgba(32,33,29,.14);
                  transition: transform .28s cubic-bezier(.34,1.1,.4,1), width .28s cubic-bezier(.34,1.1,.4,1); }
    @media (prefers-reduced-motion: reduce) { .seg .thumb { transition: none; } }
`;

/**
 * Slides a .seg's thumb under whichever button carries .on — the "tap across,
 * watch it glide". Also re-seats every control on the page when the layout
 * shifts, because the webfont swapping in changes button widths and would
 * otherwise leave the highlight sitting next to the tab it belongs under.
 */
export const SEG_JS = /* js */ `
    function moveThumb(seg) {
      const on = seg.querySelector("button.on") || seg.querySelector("button");
      const thumb = seg.querySelector(".thumb");
      if (!on || !thumb) return;
      thumb.style.width = on.offsetWidth + "px";
      thumb.style.transform = "translateX(" + on.offsetLeft + "px)";
      // On a very narrow phone the bar scrolls; bring the active tab into view.
      // block:"nearest" so this never scrolls the page itself.
      if (seg.scrollWidth > seg.clientWidth) on.scrollIntoView({ inline: "nearest", block: "nearest" });
    }
    const reseat = () => document.querySelectorAll(".seg").forEach((s) => moveThumb(s));
    window.addEventListener("resize", reseat);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(reseat);
`;

export const DESIGN_PANEL_CSS = /* css */ `
    /* The designer's column. It was laid out against the dashboard's 480px
       card, and the console is a 1000px page — without this the preview and
       every control below it stretch, and the two stop looking alike. A
       no-op on the dashboard, which already sits inside a 480px .card. */
    .designhost { max-width: 480px; }
    .dsurf { position: relative; display: flex; justify-content: center; margin-bottom: var(--s2); }
    /* Its own, rather than borrowing the dashboard's .cmpmetric: that one is
       flex:1 and left-aligned (it shares a row with a filter button), so it
       stretched and sat off-centre here — and it is styled in the dashboard,
       which the admin console mounting this panel does not load at all. */
    .dsurf { gap: 6px; }
    .dsurfbtn { display: inline-flex; align-items: center; justify-content: center;
                width: 42px; height: 34px; background: var(--bg); color: var(--muted);
                border: 1px solid var(--line); border-radius: 10px; padding: 0;
                font: inherit; cursor: pointer; }
    /* INK, not neon. The wizard's Next button is the neon on this screen, and
       DESIGN.md gives the accent exactly one job — two filled things leave the
       eye with nowhere to go. Say the word and this one takes it instead. */
    .dsurfbtn.on { background: var(--slab); color: var(--on-slab); border-color: var(--slab); }
    .dsurfbtn svg { width: 16px; height: 16px; flex: none; fill: none; stroke: currentColor;
                    stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .dsurfbtn:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; border-radius: 8px; }

    /* The lock screen. Dark whatever the card is, because a lock screen is. */
    .pvn { background: #1c1c1e; border-radius: 18px; padding: 22px 14px 16px; color: #fff;
           text-align: center; }
    .pvn-time { font-size: 2.6rem; font-weight: 300; line-height: 1; letter-spacing: -.02em; }
    .pvn-date { font-size: .8rem; opacity: .7; margin-top: 4px; }
    .pvn-card { display: flex; align-items: center; gap: 10px; text-align: left;
                margin-top: 20px; padding: 10px 12px; border-radius: 14px;
                background: rgba(255,255,255,.16); backdrop-filter: blur(6px); }
    .pvn-logo { width: 22px; height: 22px; border-radius: 5px; object-fit: cover; flex: none; }
    .pvn-txt { flex: 1; min-width: 0; }
    .pvn-app { font-size: .68rem; text-transform: uppercase; letter-spacing: .06em; opacity: .75; }
    .pvn-body { font-size: .84rem; line-height: 1.35; margin-top: 2px; overflow-wrap: anywhere; }
    .pvn-ago { font-size: .68rem; opacity: .6; flex: none; align-self: flex-start; }
    .pvn-note { font-size: .72rem; opacity: .55; margin: 14px 0 0; line-height: 1.4; }
    /* The card is a reference while you edit, not the subject of the screen.
       At full width it pushed every field below the fold on a phone, which is
       where this is used. Capped rather than scaled so the type inside stays
       the size it will really be. */
    .pvbox { max-width: 320px; margin-inline: auto; }
    /* The fold the designer sits in. Declared HERE, not in the dashboard's
       stylesheet, for the same reason the markup is shared: the panel emits
       this class and the console renders the panel, so a copy kept in one
       stylesheet left every fold on the console with no border, no tint and no
       caret — a bare <details> with a browser triangle. */
    .fold { border: 1px solid var(--line); border-radius: 14px; padding: 0 14px; margin-top: 14px;
            background: var(--surface); }
    .fold summary { cursor: pointer; padding: 14px 0; font-weight: 600; list-style: none;
                    display: flex; gap: 8px; align-items: center; }
    .fold summary::-webkit-details-marker { display: none; }
    .fold summary::before { content: "▸"; color: var(--muted); font-weight: 400; transition: transform .18s; }
    .fold[open] summary::before { transform: rotate(90deg); }
    .fold[open] { padding-bottom: 18px; }
    /* Opened, the fold is a tinted region — so the boxes inside it step up to
       the page colour rather than repeating the tint. --surface on --surface is
       no step at all, which is what made an open Design read as one grey slab
       with the controls dissolved into it. */
    .fold .crpal { background: var(--bg); }
    .fold .chipcustom input[type=color] { background: var(--bg); }
    /* A fold nested in a tinted region (the console's merchant drill-down) has
       the same problem one level up: it flips to white and keeps its border. */
    .mdetail .fold { background: var(--bg); }
    /* --- two columns, on a page wide enough for them (the console) ---------
       The panel was laid out for a 480px phone card, top to bottom: preview,
       then everything that changes it. On a 1000px console that left half the
       page blank, and the preview scrolled away exactly when you started
       picking colours. So the preview and the caller's own actions move into a
       rail on the right that stays put.

       The rail is placed explicitly, which grid resolves BEFORE auto-placed
       items — so the controls still flow from row 1 of column 1 rather than
       starting below it. It spans every row, which is what lets a sticky
       element inside its own grid area actually travel. */
    .dscols { display: grid; grid-template-columns: minmax(0, 1fr) 320px;
              column-gap: 26px; align-items: start; }
    .dscols > * { grid-column: 1; min-width: 0; }
    .dscols > .dsrail { grid-column: 2; grid-row: 1 / span 99;
                        position: sticky; top: 16px; align-self: start; }
    .dscols .dsrail .pv { margin-top: 0; }
    .dsacts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
    .dsacts .btn { width: auto; padding: 9px 13px; font-size: .84rem; }
    .dsacts .lnk { font-size: .74rem; color: var(--muted); width: 100%;
                   word-break: break-all; font-family: ui-monospace, Menlo, monospace; }
    /* Below this the console is a phone too, and the owner's own single-column
       layout is the right one. The rail unpins and falls back under. */
    @media (max-width: 859px) {
      .dscols { display: block; }
      .dscols > .dsrail { position: static; }
    }
    .row2 { display: flex; gap: 8px; }
    .row2 > div { flex: 1; }
    /* Three number fields across a 375px phone. Smaller, tighter labels so
       "Stamps to reward" wraps to two lines instead of shoving the columns
       apart, and min-width:0 so flex actually lets them shrink. */
    .row3 > div { min-width: 0; }
    .row3 label { font-size: .64rem; letter-spacing: .03em; line-height: 1.3; }
    /* --- live wallet-card preview --- */
    .pv { border-radius: 14px; padding: 16px; margin: 10px 0 4px; box-shadow: 0 4px 16px rgba(43,29,21,.18); }
    .pv-top { display: flex; align-items: center; gap: 10px; }
    /* Height-bound, not a square. A brand lockup is wide, and forcing one into
       a square box letterboxed it down to a sliver — which read as "this only
       takes a small symbol" when the wallet was happy to show the whole thing.
       A square mark is unchanged: it simply stops at the height. */
    .pv-logo { height: 34px; width: auto; max-width: 120px; border-radius: 8px;
               object-fit: contain; background: rgba(255,255,255,.14); }
    .pv-name { font-weight: 700; font-size: 1.02rem; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    /* margin-left:auto, not "whatever .pv-name pushes". The name is hidden for a
       logo that already carries it, and the progress was then the last flexible
       thing in the row — so it stopped sitting on the right edge the moment the
       tick-box was used. Wallet keeps the header field hard right regardless. */
    .pv-hdr { text-align: right; margin-left: auto; }
    .pv-lbl { font-size: .62rem; letter-spacing: .08em; font-weight: 600; }
    .pv-progress { font-size: 1.05rem; font-weight: 700; }
    .pv-dots { font-size: 1.25rem; letter-spacing: 3px; margin: 2px 0 10px; }
    /* The two secondary fields, side by side as Wallet lays them out. */
    .pv-row2 { display: flex; gap: 14px; margin-top: 10px; }
    .pv-row2 > div { flex: 1; min-width: 0; }
    .pv-row2 > div + div { text-align: right; }
    .pv-reward { font-size: .95rem; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pv-qr { background: #fff; color: #1d1d1f; width: 74px; height: 74px; border-radius: 8px;
             margin: 14px auto 2px; display: flex; align-items: center; justify-content: center;
             font-weight: 700; font-size: .8rem; letter-spacing: 1px; }

    /* --- the Google card --- */
    /* Laid out against a photograph of a real Android card, not from the API
       docs. Google does not stack the issuer over the programme beside the logo,
       and it does not put a label inline with its value: the header is a strip
       of logo + issuer with a rule under it, the programme name is a heading on
       its own line, and every value sits UNDER a small grey caption. The rows
       and their order are decided by cardTemplateOverride (src/googleModel.ts)
       — progress and reward paired, dots on their own full-width row — so this
       mock has to follow that template, not an arrangement of its own. */
    .pvg { padding-bottom: 0; }
    .pvg-hdr { display: flex; align-items: center; gap: 9px; padding-bottom: 11px; }
    /* cover, not contain, and no padding: Google's logo slot is a circle and it
       CROPS to it. Drawn with contain, a wide lockup shrank politely to fit and
       the mock said everything was fine — while the phone was cutting both ends
       off. The mock has to lose them too, or there is no reason on screen to
       upload the square version. Small, because it is small on the phone: at
       42px it read as the card's main image rather than as a favicon. */
    .pvg-logo { width: 26px; height: 26px; border-radius: 999px; object-fit: cover;
                background: rgba(127,127,127,.18); flex: none;
                box-shadow: 0 0 0 1px currentColor; }
    .pvg-issuer { font-size: .82rem; min-width: 0;
                  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    /* The hairlines Google draws under the header and under the progress row.
       currentColor at low opacity so they hold on any card colour — a fixed
       grey vanishes on a dark card and shouts on a pale one. */
    .pvg-rule { height: 1px; background: currentColor; opacity: .16; }
    .pvg-prog { font-size: 1.6rem; font-weight: 700; letter-spacing: -.02em;
                margin: 13px 0 14px; overflow-wrap: anywhere; }
    .pvg-row { display: flex; align-items: flex-start; gap: 12px; padding-bottom: 13px; }
    .pvg-row > div { min-width: 0; }
    .pvg-row > div + div { margin-left: auto; text-align: right; }
    .pvg-lbl { font-size: .66rem; letter-spacing: .07em; opacity: .65; text-transform: uppercase; }
    .pvg-val { font-size: .95rem; font-weight: 600; margin-top: 2px; overflow-wrap: anywhere; }
    .pvg-stamps { padding-top: 13px; }
    /* pre-line, because the grid arrives as a string with a newline in it — the
       only way to shape text in a field whose typography belongs to Google. */
    .pvg-dots { font-size: .95rem; margin-top: 3px; white-space: pre-line; line-height: 1.5; }
    /* Centred, on white, rounded — Google draws its own plate behind the code
       whatever the card colour is. */
    .pvg-qr { width: 96px; height: 96px; margin: 16px auto 0; background: #fff;
              border-radius: 12px; display: flex; align-items: center; justify-content: center;
              color: #111; font-weight: 700; font-size: .78rem; letter-spacing: 1px; }
    .pvg-code { text-align: center; font-size: .78rem; margin-top: 8px; }
    /* The band Google renders below the details — its heroImage slot. Left
       unset it is the bare white shelf an owner sees on their phone and cannot
       account for; filled, it is the all-filled stamp grid (see
       buildLoyaltyClass). Bleeds to both edges because Google's does.
       Falls back to the white shelf when the card has no grid yet, so the mock
       still shows the card ending where the real one ends. */
    .pvg-foot { background: #fff; height: 34px; margin: 16px -16px 0;
                background-size: cover; background-position: center; }
    .pvg-foot.band { height: auto; aspect-ratio: 750 / 246; background-color: transparent; }

    /* --- the printed sheet --- */
    /* White, because paper is. Only the head band and the QR frame are brand. */

    /* The surface switch. Smaller than the page-level tabs it borrows from —
       it is a control inside a panel, not the panel's own navigation. Mini on
       purpose: inline-flex, so the strip is only as wide as its three labels.
       Stretched full width it read as navigation, which is the one thing it is
       not: it picks which surface you are looking at.
       Size alone did not read as "not navigation" — it was still the exact
       same neon pill-and-thumb as the real tab bar one scroll above it, just
       smaller. DESIGN.md rule 1 reserves the neon for the next action; picking
       a preview to look at is not one, so its active state goes dark instead.
       Neon now means exactly one thing on this screen: the real tab bar. */
    /* NOT a pill with a sliding thumb any more. Shrinking the page's own tab
       control and darkening its thumb was not enough separation: it was still
       the same object, one scroll below the real one, and read as a second
       navigation. The pill-and-thumb shape now belongs to the page tabs alone.
       This is an underlined strip — the active surface is marked by a rule
       under its label and by ink weight, which is the conventional shape for
       "which view am I looking at" and cannot be confused with a pill. */
    .dseg { display: flex; gap: 2px; margin: 0 0 14px; padding: 0;
            background: none; border-radius: 0; border-bottom: 1px solid var(--line); }
    .dseg button { flex: 0 0 auto; font-size: .84rem; padding: 9px 12px; border-radius: 0;
                   color: var(--muted); font-weight: 600; background: none;
                   border-bottom: 3px solid transparent; margin-bottom: -1px; }
    /* The highlighter, back. It was a dark hairline, which is the quietest
       possible way to say "you are here" and read as no marker at all beside
       the neon tab strip above it. Neon UNDERLINE against the tabs' neon PILL:
       one hue, two shapes, so the two controls cannot be mistaken for each
       other without inventing a second palette (DESIGN.md rule 6).
       The LABEL stays --ink. Rule 1's "never text" is not negotiable — neon on
       white cannot be read, so the mark goes under the word, never on it. */
    .dseg button.on { color: var(--ink); font-weight: 700;
                      border-bottom-color: var(--accent); }
    .dseg button:hover { color: var(--ink); }
    /* The thumb is the pill's marker and has no place here; the underline is
       the state. Left in the markup so moveThumb stays harmless. */
    .dseg .thumb { display: none; }
    .dpane { display: block; }
    .dpane[hidden] { display: none; }
    .pvbox { min-width: 0; }
    /* One line, tight under the card: title then three ways to open it. It used
       to be a .sec heading, which draws a rule and 28px of air, and that read as
       a new section beginning rather than as something you do to the card
       directly above. wrap so a narrow phone breaks after the title. */
    /* Square, so the two marks read as a pair rather than as two buttons that
       happen to have pictures in them. */
    .pvicon { padding: 8px; line-height: 0; min-width: 38px; display: inline-flex;
              align-items: center; justify-content: center; }
    /* …except inside a sectioned bar, where every section is an equal share of
       the width. min-width would stop the two marks shrinking with the third
       section on a narrow phone, and line-height:0 clips the "Poster" label
       sitting next to them. */
    .actbar .pvicon { min-width: 0; line-height: 1.2; padding: 11px 10px; }
    /* The editor's own spacing. The page's default label margin is 14px top and
       6px bottom, which over seven controls is most of a screen of nothing — and
       this section is read top to bottom in one sitting, so its height is the
       thing that makes it feel long. */
    /* The design fold's own summary carries the section heading now, so the
       first control inside it must not add a second heading's worth of air. */
    .dfold { margin-top: 18px; }
    .dfold > summary { font-size: .95rem; }
    .dfold .dsec.first { margin-top: 0; }
    .dsec { margin: 26px 0 4px; padding-top: 18px; }
    .dsec.first { margin-top: 4px; padding-top: 0; border-top: none; }
    /* More air above a label than below it: the gap belongs to the control it
       introduces, not to the one it follows. */
    .dlbl { margin: 20px 0 6px; }
    /* The three logo rows, identical in shape so they read as three answers to
       one question rather than one control with two things stuck to it. The
       first label in a row loses its top margin: the row supplies the gap, and
       both would stack into a hole between every pair. */
    .lrow + .lrow { margin-top: 20px; }

    /* Two logo boxes side by side. Each wears its platform's mark on the frame,
       so neither needs a name to say which it is. */
    .logopair { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
    .logobox { position: relative; display: flex; flex-direction: column; align-items: center;
               gap: 8px; padding: 12px 10px 10px; border: 1px dashed var(--field-border);
               border-radius: 14px; background: var(--bg); }
    .lbplat { position: absolute; top: -9px; left: 10px; display: flex; align-items: center;
              padding: 0 5px; background: var(--bg); color: var(--muted); line-height: 1; }
    .lbplat svg { width: 15px; height: 15px; display: block; }
    /* The picture, with its own remove. An X ON the thumbnail rather than a
       disabled button beside Upload — two controls for a thing that is not
       there yet is one too many. */
    .lbthumb { position: relative; width: 76px; height: 46px; border-radius: 8px;
               background: var(--surface); display: flex; align-items: center;
               justify-content: center; }
    .lbthumb.wide { width: 100%; height: 62px; }
    .lbthumb img { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 8px; }
    .lbx { position: absolute; top: -7px; right: -7px; width: 20px; height: 20px;
           border-radius: 999px; border: 0; padding: 0; cursor: pointer;
           background: var(--slab); color: var(--on-slab); font-size: 11px; line-height: 1;
           display: flex; align-items: center; justify-content: center; }
    .lbup { margin: 0; width: 100%; }
    .lbup input[type=file] { display: none; }
    /* Reachable by script, invisible to the eye. display:none would make
       .click() a no-op in Safari. */
    .offscreen { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
                 overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
    .lbcap { font-size: .78rem; color: var(--muted); display: flex; align-items: center; gap: 2px; }
    /* The frame. Checkered so a transparent logo reads as transparent rather
       than as white, which is what it will actually be on the card. */
    .cropwrap { position: relative; overflow: hidden; border-radius: 10px; margin: 0 auto;
                background-color: #fff; touch-action: none; cursor: grab;
                background-image:
                  linear-gradient(45deg, #eee 25%, transparent 25%),
                  linear-gradient(-45deg, #eee 25%, transparent 25%),
                  linear-gradient(45deg, transparent 75%, #eee 75%),
                  linear-gradient(-45deg, transparent 75%, #eee 75%);
                background-size: 14px 14px;
                background-position: 0 0, 0 7px, 7px -7px, -7px 0; }
    .cropwrap canvas { display: block; }
    .bannerbox { display: flex; flex-direction: column; align-items: flex-start; gap: 8px;
                 margin-top: 10px; padding: 12px; border: 1px dashed var(--field-border);
                 border-radius: 14px; background: var(--bg); }

    /* Five boxes, not one strip. The strip put five swatches edge to edge with
       their names on a second line, so telling which name belonged to which
       colour meant counting along. */
    .swgrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(88px, 1fr));
              gap: 8px; margin-top: 10px; }
    .swbox { display: flex; flex-direction: column; align-items: flex-start; gap: 6px;
             padding: 8px; border: 1px solid var(--line); border-radius: 12px;
             background: var(--bg); cursor: pointer; font: inherit; text-align: left; }
    .swbox[aria-expanded="true"] { border-color: var(--ink); }
    .swbox .swchip { width: 100%; height: 30px; border-radius: 8px; border: 1px solid var(--line); }
    .swbox .swname { font-size: .78rem; font-weight: 600; color: var(--ink); }
    .swbox .swval { font-size: .7rem; color: var(--muted); font-variant-numeric: tabular-nums;
                    text-transform: uppercase; }
    .lrow .dlbl { margin-top: 0; }
    .lrow .tgrow { margin-top: 0; }
    /* The one line that is conditional, rather than the whole row: it says
       something is being lost right now, so it only belongs on screen when
       something is. */
    .mhint { margin: 6px 0 0; font-size: .8rem; color: #9a3412; }
    .mhint[hidden] { display: none; }
    /* Colours: a read-out first, the rows only on request. Uploading a logo
       sets all five, so the resting state is "here is what your logo produced"
       rather than five things to fill in. All on ONE line — label, the way in,
       and the palette itself — which is the whole section in the height a
       heading used to take. */
    /* The palette as ONE bar of five sections, the same shape as .actbar above
       it. Five 26px squares spread across a row that can run to 400px was the
       scattered look in its purest form: mostly gap, and no way to tell it was
       one palette rather than five unrelated chips. */
    /* Same frame mechanism as .actbar: 1px of padding and a 1px gap, with the
       strip's own colour showing through as the outline AND the dividers. An
       inset shadow cannot do it once the sections are opaque — the sections
       paint over it. */
    .swstrip { display: flex; height: 34px; margin-top: 5px; border-radius: 999px;
               overflow: hidden; padding: 1px; gap: 1px; background: var(--field-border); }
    /* Each swatch is a button now: the strip named all five parts already, so
       it was the obvious thing to press long before it did anything. */
    .sw { flex: 1 1 0; min-width: 0; border: 0; padding: 0; cursor: pointer;
          font: inherit; border-radius: 0; }
    .sw:first-child { border-radius: 999px 0 0 999px; }
    .sw:last-child { border-radius: 0 999px 999px 0; }
    .sw:hover { box-shadow: inset 0 0 0 2px var(--accent); }
    /* The one whose palette is open. Inset so it cannot move the strip. */
    .sw.on { box-shadow: inset 0 0 0 2px var(--ink); }
    .sw:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; z-index: 1; }
    /* title= is hover-only and this designer is used on a phone, so the names
       are on the page. Same flex basis as the sections above, so each label
       stays under the colour it belongs to. */
    .swnames { display: flex; margin-top: 4px; }
    .swnames span { flex: 1 1 0; min-width: 0; text-align: center;
                    font-size: .6rem; letter-spacing: .04em; color: var(--muted);
                    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    /* Inline rejection notice (e.g. a stamp upload with no transparency) —
       stays on screen, unlike a toast, because it asks the owner to go and fix
       the file and come back. */
    .err { color: #a33; background: #fdeaea; border: 1px solid #f2c9c9; border-radius: 10px;
           padding: 10px 12px; font-size: .84rem; margin-top: 8px; }
    /* "Your own stamp is being used" — the shape itself, at the size it is read
       at, so the answer is the picture rather than a sentence about it. */
    .stampnow { display: flex; align-items: center; gap: 8px; margin: 8px 0 0;
                font-size: .84rem; color: var(--muted); }
    .stampnow img { width: 26px; height: 26px; object-fit: contain; border-radius: 6px;
                    background: var(--bg); box-shadow: inset 0 0 0 1px var(--line); padding: 3px; }
    /* --- designer controls --- */
    /* Where the five native pickers sit while no palette is open. They are moved
       out into the open palette, not proxied — see drawPalette. */
    .colorpark { display: none; }
    .chipcustom input[type=color] { width: 30px; height: 30px; padding: 2px; margin: 0;
                                    border: 1px solid var(--field-border); border-radius: 8px;
                                    background: var(--surface); cursor: pointer; }
    /* The palette that opens under the swatch strip — in the editor column,
       beside the strip that was tapped. NOT under the preview: the console
       mounts the preview in a right-hand rail, so opening it there would put
       the answer in a different column from the control. */
    .crpal { background: var(--bg); border: 1px solid var(--line); border-radius: 12px;
             padding: 10px 12px 12px; margin-top: 10px; }
    .crpal-h { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .crpal-n { font-size: .68rem; font-weight: 700; letter-spacing: .05em;
               text-transform: uppercase; color: var(--muted); }
    .crpal-x { border: none; background: none; font: inherit; font-size: .9rem; line-height: 1;
               color: var(--muted); cursor: pointer; padding: 4px; border-radius: 6px; }
    .crpal-x:hover { background: var(--surface); color: var(--ink); }
    /* The swatch whose palette is open, marked in the read-out strip too, so
       the strip and the card never disagree about what is being edited. */
    .sw.on { box-shadow: inset 0 0 0 1px var(--bg), 0 0 0 2px var(--accent); }
    /* --- the design steps ---
       One thing at a time. This screen carried ~21 controls, ten band tiles and
       five colour rows in one undifferentiated column, which is fine once you
       know it and impossible the first time. The numbers are the whole point:
       they say how many decisions there are, and that there is an end. */
    .dstep { border-top: 1px solid var(--line); margin-top: 18px; padding-top: 14px; }
    .dstep:first-of-type { border-top: 0; margin-top: 6px; padding-top: 0; }
    .dstep > h4 { display: flex; align-items: center; gap: 8px; margin: 0 0 2px;
                 font-family: var(--display); font-weight: 800; font-size: 1rem;
                 letter-spacing: -.01em; color: var(--ink); }
    .dstep > h4 .sn { display: inline-flex; align-items: center; justify-content: center;
                     width: 22px; height: 22px; border-radius: 999px; flex: none;
                     background: var(--slab); color: var(--on-slab);
                     font-size: .74rem; font-weight: 800; letter-spacing: 0; }
    .dstep > p.hint { margin: 0 0 8px; color: var(--muted); font-size: .84rem; }
    /* DESIGN.md rule 9, which this panel was breaking by name: --ghost-bg on
       --surface is one shade apart, and eight ghost buttons live inside this
       fold. Inside it they go back to the page colour with a hairline. */
    .fold .btn-ghost { background: var(--bg); box-shadow: inset 0 0 0 1px var(--line); }
    /* --- the sectioned action bar ---
       ONE bar cut into equal sections, not a scatter of separate pills with
       air between them. Separate pills were the previous shape and they read
       as unrelated things that happen to sit near each other; these are two
       or three actions on ONE thing (this logo, this stamp, this card), so
       they share one outline and are divided by a hairline — the same
       grouped-row treatment a phone's own Settings uses.
       Outlined, never filled with the accent: DESIGN.md rule 1 gives the neon
       exactly one job, and "upload a logo" is not the next action on a page. */
    /* One mechanism draws BOTH the outline and the dividers: 1px of padding and
       a 1px gap, with the bar's own colour showing through around and between
       opaque sections.
       The outline cannot be an inset shadow here. It was, and the moment the
       sections stopped being transparent they painted straight over it — the
       bar lost its edge and read as floating text, which is exactly what "Add a
       test card" looked like. Padding puts the frame outside the sections
       instead of under them, so nothing can cover it. */
    .actbar { display: flex; align-items: stretch; margin-top: 6px; gap: 1px; padding: 1px;
              border-radius: 999px; overflow: hidden; background: var(--field-border); }
    /* flex-basis 0, so sections are equal regardless of how long their labels
       are — sized by content, "Upload logo" and "Remove logo" differ enough to
       look like a mistake. */
    .actbar > * { flex: 1 1 0; min-width: 0; }
    /* .btn.btn-ghost, not .btn: :is(.fold, .grp, …) .btn-ghost in baseCss is
       (0,2,0) and would re-fill each section and give it its own ring inside
       the bar. (0,3,0) wins outright rather than depending on which stylesheet
       happens to be printed last. */
    .actbar .btn.btn-ghost { width: 100%; border-radius: 0; background: var(--bg);
                             box-shadow: none; padding: 11px 10px; font-size: .88rem;
                             display: flex; align-items: center; justify-content: center;
                             gap: 6px; line-height: 1.2; }
    /* Hover says exactly which section you are about to pick. Neon as a RING,
       never as a fill behind text and never as text — DESIGN.md rule 1. Inset,
       so it cannot add a pixel and shift the row. */
    .actbar .btn.btn-ghost:hover { background: var(--surface);
                                   box-shadow: inset 0 0 0 2px var(--accent); }
    /* Present but not available: a Remove that vanishes until there is
       something to remove reads as a missing feature, not as a disabled one. */
    .actbar .btn.btn-ghost:disabled { opacity: .4; cursor: not-allowed; }
    /* No neon ring on something that cannot be pressed. */
    .actbar .btn.btn-ghost:disabled:hover { background: var(--bg); box-shadow: none; }
    .actbar input[type=file] { display: none; }
    /* A row, not a tick-box: title and its consequence on the left, the switch
       on the right, matching the settings-row shape a phone's own Settings app
       already taught everyone to read — a checkbox with a sentence beside it
       was a form field, and this is a preference. Built from a real
       <input type=checkbox> (same .checked, same change event data-lname
       already read) with the box itself made invisible but still the full hit
       target — the track and thumb beside it are paint, not the control. */
    .tgrow { display: flex; align-items: center; justify-content: space-between; gap: 14px;
             margin-top: 4px; }
    /* The pointer goes on what is ACTUALLY clickable — the two labels — rather
       than the whole row. The row is a plain div now: it used to be the label,
       which is exactly how the ⓘ inside it captured the binding. */
    .tgtext label, .tg { cursor: pointer; }
    .tgtext { flex: 1; min-width: 0; font-size: .85rem; color: var(--muted); }
    .tgtext label { display: inline; margin: 0; font: inherit; letter-spacing: normal;
                    text-transform: none; color: inherit; }
    .tg { position: relative; display: inline-block; width: 44px; height: 26px; flex: none; }
    .tg input { position: absolute; inset: 0; margin: 0; width: 100%; height: 100%;
                opacity: 0; cursor: pointer; }
    .tgtrack { position: absolute; inset: 0; background: var(--ghost-bg); border-radius: 999px;
               box-shadow: inset 0 0 0 1px var(--field-border); transition: background .15s ease; }
    .tgthumb { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 999px;
               background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.25); transition: transform .15s ease; }
    /* The one flip switch on the page, so it earns the neon rather than
       competing with it — DESIGN.md rule 1's "live-state pill". */
    .tg input:checked ~ .tgtrack { background: var(--accent); box-shadow: none; }
    .tg input:checked ~ .tgtrack .tgthumb { transform: translateX(18px); }
    .tg input:focus-visible ~ .tgtrack { outline: 2px solid var(--ink); outline-offset: 2px; }
    @media (prefers-reduced-motion: reduce) { .tgtrack, .tgthumb { transition: none; } }
    .copyrow { display: flex; gap: 8px; margin-top: 4px; }
    .copyrow input { font-family: ui-monospace, Menlo, monospace; font-size: .78rem; background: var(--ghost-bg); }
    .copyrow .btn { width: auto; padding: 10px 14px; font-size: .9rem; }
    /* --- colour presets --- */
    /* --- colours pulled out of an uploaded image ---
       The five named rows that used to live here are gone: the palette opens on
       the card now (.crpal, above), against the part that was tapped. Their CSS
       went with them rather than being left behind to be puzzled over. */
    .chipcustom { display: inline-flex; align-items: center; gap: 6px; font-size: .76rem; color: var(--muted);
                  margin-left: 4px; }
    .chiprow { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-top: 8px; }
    .chip { width: 30px; height: 30px; border-radius: 8px; border: 2px solid transparent; cursor: pointer;
            padding: 0; box-shadow: inset 0 0 0 1px rgba(0,0,0,.18); }
    .chip:hover { border-color: var(--accent); }
    .chip.on { border-color: var(--accent); }
    /* The stamp bar's hint sits beside the bar, not inside it: it is not a
       fourth section, and a 22px round ⓘ stretched to an equal share of the
       row is exactly how it read. */
    .stamprow { display: flex; align-items: center; gap: 8px; margin: 4px 0 8px; }
    .stamprow .actbar { flex: 1; min-width: 0; margin-top: 0; }
    /* --- premium card preview --- */
    .pv { border-radius: 18px; padding: 16px; margin: 10px 0 4px; overflow: hidden;
          box-shadow: 0 10px 30px -8px rgba(43,29,21,.35), 0 2px 6px rgba(43,29,21,.15); }
    /* Sits BELOW the top bar, exactly as Wallet stacks the strip under the
       logo/logoText/header band. Bleeds to the card's side edges only. */
    .pv-banner { height: 64px; margin: 12px -16px; background-size: cover; background-position: center; display: none; }
    .pv-banner.on { display: block; }
    /* A decorative banner may be cropped; the stamp grid may NOT — it is the
       information the customer reads, so show the whole strip at its real shape. */
    .pv-banner.strip { height: auto; aspect-ratio: 750 / 246; background-size: 100% 100%; }
`;

/**
 * The two wallet marks, inline.
 *
 * Inline SVG because there is no build step and no asset pipeline: a file would
 * be a second request for 400 bytes, and an external URL is a dependency this
 * page does not otherwise have. They are baked in here, server-side, so the
 * browser never evaluates them as an expression.
 *
 * `currentColor` on purpose — the buttons are ghost buttons and the panel is
 * rendered in both a light dashboard and a light console, but a token change
 * should not leave two invisible marks behind.
 *
 * Both buttons carry a title and an aria-label. An icon-only control that a
 * screen reader announces as "button" is not a control, and neither is one a
 * new owner has to press to find out what it does.
 */
const APPLE_GLYPH =
  '<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true">' +
  '<path d="M16.36 12.78c.02-2.2 1.8-3.26 1.88-3.31-1.02-1.5-2.62-1.7-3.19-1.72-1.36-.14-2.65.8-3.34.8-.69 0-1.75-.78-2.87-.76-1.48.02-2.84.86-3.6 2.18-1.53 2.66-.39 6.6 1.1 8.76.73 1.06 1.6 2.25 2.74 2.21 1.1-.04 1.52-.71 2.85-.71 1.33 0 1.71.71 2.87.69 1.19-.02 1.94-1.08 2.66-2.14.84-1.23 1.19-2.42 1.21-2.48-.03-.01-2.32-.89-2.34-3.52zM14.2 6.4c.6-.74 1.01-1.75.9-2.77-.87.04-1.93.58-2.56 1.31-.56.65-1.06 1.7-.93 2.7.97.08 1.97-.5 2.59-1.24z"/>' +
  "</svg>";
const BELL_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
  'stroke-linecap="round" stroke-linejoin="round" width="17" height="17" aria-hidden="true">' +
  '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>' +
  '<path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>';

const GOOGLE_GLYPH =
  '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">' +
  '<path fill="#4285F4" d="M21.6 12.23c0-.68-.06-1.34-.18-1.96H12v3.71h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.89-1.74 2.98-4.3 2.98-7.27z"/>' +
  '<path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.61-2.43l-3.23-2.5c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.07v2.58A10 10 0 0 0 12 22z"/>' +
  '<path fill="#FBBC05" d="M6.41 13.91a6 6 0 0 1 0-3.82V7.51H3.07a10 10 0 0 0 0 8.98l3.34-2.58z"/>' +
  '<path fill="#EA4335" d="M12 5.96c1.47 0 2.79.5 3.83 1.5l2.86-2.86C16.95 2.98 14.7 2 12 2a10 10 0 0 0-8.93 5.51l3.34 2.58C7.2 7.73 9.4 5.96 12 5.96z"/>' +
  "</svg>";

export const DESIGN_PANEL_JS = /* js */ `
    // The dashboard has its own caret constant; the console does not, and this
    // panel is inlined into both — so it carries its own. Deliberately NOT
    // named with the dashboard's constant as a prefix: a test anchors a slice
    // on that exact string, and a longer name containing it is found first.
    const CARET_SVG =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

    /**
     * The card designer, shared VERBATIM by the owner dashboard and the admin
     * console. Parity between the two is guaranteed by them being the same code
     * rather than by two implementations agreeing — the console used to carry a
     * poorer copy (three colours, one band, ten fixed icons) that drifted from
     * this one the moment either changed.
     *
     * env is everything the panel reaches outside itself, so the owner's
     * dashboard and the console can point it at the same card from either side:
     *
     *   api(path, opts)    the calling page's fetch wrapper, already prefixed
     *   path(suffix)       "/card/<id>" on the dashboard, "/card/<id>/design"
     *                      in the console — same shapes, different mount
     *   artUrl(kind, v)    where the stored logo / band PNG is served from
     *   customersPath      the live-customer count, or null when there is no
     *                      card to count yet
     *   rulesNote          HTML above the programme block, or ""
     *   onRulesSaved()     the caller's own follow-up
     *   titled             whether the panel prints its own "Design" heading.
     *                      False in the console, where both mounts already sit
     *                      under one that says "Design their card".
     *   saveLabel          "Save changes" for an owner, "Save card" in the
     *                      console. There is ONE save either way: two of them
     *                      made a merchant sort their own change into the right
     *                      half of the panel before they could keep it, and the
     *                      look one lived inside a collapsed section. What the
     *                      two buttons used to say separately is now the
     *                      confirmation in front of the one.
     *   previewOnly        render the card face and nothing else: no editor, no
     *                      save, no test-card bar, no surface tabs. The returned
     *                      node carries setSurface("apple"|"google") so the
     *                      caller can switch faces from its own control. Pass
     *                      customersPath null with it — the count is the one
     *                      request this panel makes on mount and a preview tile
     *                      has nowhere to show it.
     *   draft              true when this panel is a PREVIEW of a programme
     *                      that does not exist yet — the Create flow. Everything
     *                      renders and previews exactly as normal; the one
     *                      difference is that saving writes nothing and says so.
     *                      A shop can hold only one programme today (the server
     *                      refuses a second), so a Create flow that tried to
     *                      save would get a 409 and look broken. Default false:
     *                      the dashboard's programme page and the console both
     *                      omit it and are unaffected.
     *   toast/modal/info   shared with MODAL_JS
     */
    function designPanel(c, env) {
      const div = document.createElement("div");
      const api = env.api, toast = env.toast, modal = env.modal, info = env.info;
      const P = (suffix) => env.path(suffix || "");
      const bust = (v) => v ? "?v=" + v : "";
      const logoSrc = env.artUrl("logo", c.logoVersion);
      div.innerHTML = \`
        <!-- One box, three surfaces. It is ONE node on purpose: the console
             moves the preview into a sticky rail, and anything left behind as a
             sibling would sit in the wrong column. The box does not belong to a
             tab either — it is what every tab is editing, so it stays put. -->
        <div class="pvbox" data-pvbox>
          <!-- The tab strip lives HERE now, on the thing it switches. It used to
               sit inside the editor and move the controls with it, because the
               editor was organised by surface — one section per wallet. A
               merchant has one brand and one programme that happen to appear in
               three places, so the editor is organised that way instead and
               these three are purely a way of looking. -->
          <!-- A dropdown, not a strip of three. Three tabs and the card
               beneath them were two rows of chrome above the thing being
               looked at, and DESIGN.md allows one filled pill per screen —
               which the dashboard's nav already spends. Same control the
               Manage screens use. -->
          <!-- Three icons, not a dropdown. A dropdown hides two of the three
               behind a tap and names only the one you are on; these are one tap
               each and the whole set is visible at rest. The selected one is
               filled — the one place the panel says "you are here". -->
          <div class="dsurf" data-surfaces role="tablist">
            <button type="button" class="dsurfbtn on" data-surf="apple" role="tab"
                    aria-selected="true" aria-label="iPhone">${APPLE_GLYPH}</button>
            <button type="button" class="dsurfbtn" data-surf="google" role="tab"
                    aria-selected="false" aria-label="Android">${GOOGLE_GLYPH}</button>
            <button type="button" class="dsurfbtn" data-surf="notify" role="tab"
                    aria-selected="false" aria-label="Notification">${BELL_SVG}</button>
          </div>

          <div class="pv" data-pv data-surface="apple">
            <div class="pv-top">
              <img class="pv-logo" data-pv-logo src="\${logoSrc}" alt="" style="\${c.logoVersion ? "" : "display:none"}">
              <span class="pv-name" data-pv-name></span>
              <div class="pv-hdr"><div class="pv-progress" data-pv-progress></div></div>
            </div>
            <div class="pv-banner" data-pv-banner></div>
            <div class="pv-dots" data-pv-dots></div>
            <div class="pv-row2">
              <div><div class="pv-lbl" data-pv-rlbl>REWARD</div><div class="pv-reward" data-pv-reward></div></div>
              <div><div class="pv-lbl" data-pv-clbl>PROGRESS</div><div class="pv-reward" data-pv-tally></div></div>
            </div>
            <div class="pv-qr">QR</div>
          </div>

          <!-- Google. Deliberately NOT the Apple card in another colour: Android
               gets one colour, a near-square logo, and the count as TEXT — no
               rendered grid and no custom stamp shape, ever (see
               buildLoyaltyPatch). Showing the grid here would be a lie the
               owner only discovers on somebody else's phone. -->
          <!-- The order and the pairing here are NOT a design choice: they are
               cardTemplateOverride in src/googleModel.ts, rendered. Progress and
               reward share a row because they are that template's twoItems row;
               the dots have their own because that row is oneItem. Change the
               template and this has to move with it, or the mock goes back to
               describing a card nobody receives. -->
          <div class="pv pvg" data-pvg data-surface="google" hidden>
            <div class="pvg-hdr">
              <img class="pvg-logo" data-pvg-logo alt="" style="\${(c.markVersion || c.logoVersion) ? "" : "display:none"}">
              <span class="pvg-issuer" data-pvg-issuer></span>
            </div>
            <div class="pvg-rule"></div>
            <div class="pvg-prog" data-pvg-prog></div>
            <div class="pvg-row">
              <div>
                <div class="pvg-lbl" data-pvg-rlbl>REWARD</div>
                <div class="pvg-val" data-pvg-reward></div>
              </div>
              <div>
                <div class="pvg-lbl" data-pvg-clbl>PROGRESS</div>
                <div class="pvg-val" data-pvg-bal></div>
              </div>
            </div>
            <!-- The dots row went with its module in googleModel.ts. Google
                 renders text modules left-aligned in its own typography, so the
                 grid could never be centred or sized like the iPhone's, and
                 sending it as an image is what made a stamp take ~20s to reach
                 a phone. The count now lives in PROGRESS, above. -->
            <div class="pvg-qr">QR</div>
            <div class="pvg-code">Code ABC123</div>
            <div class="pvg-foot"></div>
          </div>

          <!-- The printed sheet, at a size you can judge. Not an iframe of the
               real page: that is a round trip per keystroke, and the poster is
               a server-rendered document. Same order and same rules as
               posterPage, including hiding the name when the logo carries it. -->
          <!-- The lock screen, which is where this card does its real work.
               A wallet card is not something anybody opens; it is something
               that taps them on the shoulder after a stamp. This is the one
               surface an owner never otherwise sees, and the wording in it is
               generated from their own reward and target — so it is worth more
               than a mock of a poster they can simply print and look at.

               The banner text is passModel's changeMessage with %@ already
               substituted, which is exactly what iOS shows. -->
          <div class="pvn" data-pvn data-surface="notify" hidden>
            <div class="pvn-time" data-pvn-time>9:41</div>
            <div class="pvn-date">Monday, 8 September</div>
            <div class="pvn-card">
              <img class="pvn-logo" data-pvn-logo alt="" style="\${c.logoVersion ? "" : "display:none"}">
              <div class="pvn-txt">
                <div class="pvn-app" data-pvn-app></div>
                <div class="pvn-body" data-pvn-body></div>
              </div>
              <div class="pvn-ago">now</div>
            </div>
            <p class="pvn-note">What a customer sees after a stamp, without opening anything.</p>
          </div>

          <!-- The palette for whichever part of the card was tapped. It lives
               INSIDE the preview box on purpose: the console moves this whole
               node into its right-hand rail (mountDesigner), and a palette left
               behind in the editor column would open 400px away from the thing
               it recolours. Empty and hidden until something is tapped. -->
        </div>

        <!-- ================= DESIGN =================
             Not "iPhone / Android / Sign-up". A merchant has one design and one
             programme; that they show up in three places is the previews' job to
             say, not the editor's. Organised by surface, this asked somebody to
             design the same logo three times and left the name tick filed under
             a wallet it does not belong to. -->
        <!-- Titled only where nothing above it already is. The console mounts
             this inside a step headed "Design their card" and inside a row whose
             summary says the same, so printing DESIGN again straight underneath
             read as a page that had not been updated. -->
        <!-- Folded away, and CLOSED. Most owners take their logo's colours and
             never open this again, so ~20 controls sat between them and the
             rules they came for. The card preview and "Add a test card" stay
             outside it, because those are what the tab is opened to see.
             Only on the owner's dashboard: the console already renders this
             panel inside its own "Design their card" fold, and a fold inside a
             fold is two carets saying the same thing. -->
        \${env.titled ? '<details class="fold dfold"><summary>Customise the design</summary>' : ""}

        <!-- THREE things, three rows, in the order they are decided: the logo
             itself, the square version Android crops to, and whether that logo
             already says the shop's name. They were interleaved — upload, tick,
             then a differently-shaped Android block — so the tick looked like a
             property of the upload above it and the square one like an
             afterthought. Same shape each: a label with its ⓘ, then its
             control. -->
        <label class="sec dsec" style="display:block">Personalize</label>

        <!-- TWO boxes, one row. They were two full-width rows, which asked the
             same question twice and buried the Android one below the fold on a
             phone. Each box wears its platform's mark on the frame, so neither
             needs a name to say which it is — and the pair reads as one
             decision, which is what it is.

             Removing is an ✕ ON the picture rather than a button in a bar. A
             disabled "Remove logo" sitting beside "Upload logo" is two controls
             for a thing that is not there yet. -->
        <div class="logopair">
          <div class="logobox" data-lb="apple">
            <span class="lbplat" aria-hidden="true">${APPLE_GLYPH}</span>
            <div class="lbthumb" data-lbthumb="logo"\${c.logoVersion ? "" : " hidden"}>
              <img data-lbimg="logo" alt="">
              <button type="button" class="lbx" data-a="rmlogo" aria-label="Remove Apple logo">✕</button>
            </div>
            <label class="lbup btn btn-ghost"><span data-logobtn>Upload logo</span><input data-logo type="file" accept="image/*"></label>
            <span class="lbcap">Apple\${info("Your main logo. It goes on the iPhone card, your printed poster and your sign-up page — and on Android too, unless you upload an Android logo beside it. Any shape; a wide one with your name in it works well. Your card colours are read from it.")}</span>
          </div>
          <div class="logobox" data-lb="android" data-markbox>
            <span class="lbplat" aria-hidden="true">${GOOGLE_GLYPH}</span>
            <div class="lbthumb" data-lbthumb="mark"\${c.markVersion ? "" : " hidden"}>
              <img data-lbimg="mark" alt="">
              <button type="button" class="lbx" data-a="rmmark" aria-label="Remove Android logo">✕</button>
            </div>
            <label class="lbup btn btn-ghost"><span data-markbtn>Upload logo</span><input data-mark type="file" accept="image/*"></label>
            <span class="lbcap">Android\${info("Android crops your logo to a small circle, so a wide one loses both ends. A square version fixes that. Optional — without it Android uses your Apple logo.")}</span>
          </div>
        </div>
        <p class="mhint" data-markhint hidden>Your logo is wide, so Android is cropping the ends off it.</p>

        <!-- The ⓘ is OUTSIDE the <label>, and that is a bug this row carried for
             months rather than a style choice. A label binds to its FIRST
             LABELABLE DESCENDANT, and <button> is labelable — so with the ⓘ
             inside, the label's control was the info dot and never the
             checkbox, and every click on the track toggled the bubble instead.
             Explicit for/id as well, so it cannot drift again. -->
        <div class="lrow">
          <div class="tgrow">
            <span class="tgtext"><label for="lname-tg">Show company name next to logo</label>\${info("Prints your shop's name beside your logo on the iPhone card. Turn it off if your logo already says the name. Android always shows it — Google prints the issuer name itself and we cannot switch that off.")}</span>
            <label class="tg" for="lname-tg">
              <input id="lname-tg" data-lname type="checkbox" \${c.logoHasName ? "" : "checked"}>
              <span class="tgtrack"><span class="tgthumb"></span></span>
            </label>
          </div>
        </div>

        <label class="sec dsec" style="display:block">Stamps</label>
        <label class="dlbl">Stamp shape\${info("Drawn in your Stamps colour. A simple shape reads best at the size a stamp actually is. iPhone only: Android always shows dots.")}</label>
        <!-- One dropdown where there were three buttons. The three answered one
             question — dots, an emoji, or your own picture — and a row of
             buttons made them look like three different things you could do. -->
        <select data-stamppick></select>
        <!-- Off-screen, NOT hidden. A display:none file input ignores a
             scripted .click() in Safari, so "Upload your own" opened nothing
             at all — the same trap the five colour inputs are parked around
             further down, for the same reason. accept is deliberately wide:
             a phone's photo library hands back HEIC and JPEG, and a picker
             that shows every photo greyed out reads as broken. -->
        <input data-stampimg type="file" accept="image/*" class="offscreen">
        <p class="stampnow" data-stampnow style="display:none">
          <img data-stampnow-img alt=""><span>Your own stamp is being used.</span>
        </p>
        <p class="err" data-stamperr style="display:none"></p>

        <label class="sec dsec" style="display:block">Banner</label>
        <!-- This was the band-artwork row, sitting among the logo rows. It is a
             picture you supply, like the logos, but it is the one behind the
             stamps — so it gets its own heading rather than being the third
             thing in a list about logos. -->
        <div class="bannerbox">
          <div class="lbthumb wide" data-lbthumb="banner"\${c.bandTexture === "image" ? "" : " hidden"}>
            <img data-lbimg="banner" alt="">
            <button type="button" class="lbx" data-a="rmband" aria-label="Remove banner">✕</button>
          </div>
          <label class="lbup btn btn-ghost"><span data-bandbtn>Upload image</span><input data-band type="file" accept="image/*"></label>
          <span class="lbcap">\${info("The strip behind your stamps. Leave it empty and the band is just your Band colour. Your stamps are drawn ON TOP of it, so something simple and open in the middle works best.")}</span>
        </div>

        <label class="sec dsec" style="display:block">Colours</label>
        <!-- Five boxes, not one strip. The strip put five swatches edge to edge
             with their names on a second line underneath, so telling which name
             belonged to which colour meant counting along. Each box now carries
             its own swatch, name and value. -->
        <div class="swgrid" data-swatches></div>
        <div class="crpal" data-palette hidden></div>
        <!-- The five native pickers are the source of truth every other function
             reads through f("bg"), f("bandColor") and so on, so they must exist
             from the start. They are PARKED here and MOVED into the open palette,
             rather than hidden and clicked from a proxy: calling .click() on a
             display:none colour input does not reliably open the OS picker, so
             the owner has to be tapping the real thing. Every rebuild therefore
             has to park all five again first — see drawPalette. -->
        <div class="colorpark" data-park>
          <input data-f="bg" type="color" value="\${c.bg}">
          <input data-f="fg" type="color" value="\${c.fg}">
          <input data-f="label" type="color" value="\${c.label}">
          <input data-f="accent" type="color" value="\${c.accent}">
          <input data-f="bandColor" type="color" value="\${c.bandColor}">
        </div>

        \${env.titled ? "</details>" : ""}

        <!-- ================= LOYALTY CARD ================= -->
        \${env.rulesNote}
        <!-- Always headed, and named for what is actually under it. Hidden in
             the console, this left the shop's name as the one field on the panel
             with no heading over it — sitting between Colours and Save as though
             it were another colour. The console cannot set the programme's
             rules, so calling it "Loyalty card" there would be a promise
             the page does not keep. -->
        <label class="sec dsec" style="display:block">\${env.showDetails ? "Loyalty card" : "Shop"}</label>
        <label class="dlbl">Shop name\${info("The name customers see on the card.")}</label>
        <input data-f="shopName" value="\${(c.shopName || "").replace(/"/g, "&quot;")}">

        <!-- The card's TERMS. Hidden rather than dropped when env.showDetails is
             false: renderPreview and drawStampStrip read stampsTarget and reward
             to draw anything at all, so removing these inputs would leave the
             designer unable to render the card it is designing. Hidden, they are
             seeded from the card and never editable, so a save can only write
             them back unchanged. -->
        <div \${env.showDetails ? "" : "hidden"}>
        <!-- The card TYPE. Everything below it changes shape with this, and so
             do all three previews — a membership card has no target to reach,
             so the stamp rules underneath are hidden rather than left on screen
             asking for numbers that would never be used. -->
        <label class="dlbl">Card type\${info("A stamp card counts visits towards a reward. A membership card has no counter — it proves who someone is and lists what they get. Staff still tap once either way, so your customer numbers work the same on both.")}</label>
        <select data-f="kind">
          <!-- Exactly ONE option carries the selected attribute. This used
               to read "not
               membership", from when those were the only two kinds, so adding
               milestones and points quietly marked TWO options on every card
               that was neither — survivable only because a browser takes the
               last one it sees. Anything unrecognised falls back to a stamp
               card, matching asCardKind on the server. -->
          <option value="stamp"\${["milestones", "points", "membership"].includes(c.kind) ? "" : " selected"}>Stamp card — collect stamps, earn a reward</option>
          <option value="milestones"\${c.kind === "milestones" ? " selected" : ""}>Rewards along the way — several prizes on one card</option>
          <option value="points"\${c.kind === "points" ? " selected" : ""}>Points — collect points, spend them on rewards</option>
          <option value="membership"\${c.kind === "membership" ? " selected" : ""}>Membership — no stamps, just perks</option>
        </select>

        <div data-rules="points" hidden>
          <label class="dlbl">Buttons on your counter\${info("The amounts your staff can add with one tap, separated by commas. Typing a number on a busy counter is how 500 lands where 50 was meant, so keep these to the amounts you use most. A staff member can still type any amount behind a second tap.")}</label>
          <input data-f="pointPresets" maxlength="40" value="\${(c.pointPresets || "").replace(/"/g, "&quot;")}" placeholder="10, 20, 50">
          <label class="dlbl">What points can be spent on\${info("Each reward and what it costs in points. A customer can spend as soon as they can afford the cheapest one, and whatever is left stays on their card.")}</label>
          <div data-ladder-points></div>
          <button type="button" class="btn btn-ghost" data-a="addprice" style="margin-top:8px">+ Add a reward</button>
          <p class="dhint" data-ladder-note-points></p>
        </div>

        <div data-rules="milestones" hidden>
          <label class="dlbl">Rewards on this card\${info("A prize at each number you list. Reaching one hands it over and the card CARRIES ON — only the last one starts the card again from zero. The biggest number is how many circles the card has.")}</label>
          <div data-ladder></div>
          <button type="button" class="btn btn-ghost" data-a="addrung" style="margin-top:8px">+ Add a reward</button>
          <p class="dhint" data-ladder-note></p>
        </div>

        <div data-rules="membership" hidden>
          <label class="dlbl">Member name\${info("What you call your regulars \u2014 VIP, Member, Regular, whatever fits your shop. It is printed on the front of the card, where a stamp card shows how far along somebody is.")}</label>
          <input data-f="memberLabel" maxlength="20" placeholder="Member" value="\${(c.memberLabel || "").replace(/"/g, "&quot;")}">
          <label class="dlbl">What members get\${info("One perk per line. These print on the back of the card, and editing them updates every member's card — unlike a stamp target, which stays as promised until the customer claims their reward.")}</label>
          <textarea data-f="benefits" rows="4" maxlength="800" placeholder="10% off every order&#10;Free birthday drink&#10;Early access to new beans">\${(c.benefits || "").replace(/&/g, "&amp;").replace(/</g, "&lt;")}</textarea>
        </div>

        <div data-rules="stamp">
        <label class="dlbl">Reward</label><input data-f="reward" value="\${c.reward}">
        <div class="row2 row3">
          <div><label>Stamps to reward</label><input data-f="stampsTarget" type="number" min="1" max="20" value="\${c.stampsTarget}"></div>
          <div><label>Free stamps\${info("Stamps a NEW card starts with, as a welcome. A card that has just paid out a reward restarts at zero — the visit that earned the reward is that stamp.")}</label><input data-f="stampsStart" type="number" min="0" max="19" value="\${c.stampsStart}"></div>
          <div><label>Avg spend (RM)\${info("What a customer usually spends per visit. Turns stamps into a money figure on Customers.")}</label><input data-f="averageSpend" type="number" min="0" step="0.10" value="\${c.averageSpend}"></div>
        </div>
        </div>

        <label class="dlbl">Sign-up page message\${info("The line customers read after scanning, before they add the card. It also headlines your poster. Leave blank and we write one.")}</label>
        <input data-f="signupMessage" maxlength="120" value="\${(c.signupMessage || "").replace(/"/g, "&quot;")}" placeholder="Collect \${c.stampsTarget} stamps, get a \${(c.reward || "").toLowerCase()}.">
        </div>

        <!-- ONE save. Two of them asked a merchant to know which half of the
             panel a change belonged to before they could keep it — and the look
             one lived inside a collapsed section, so it could be missed
             entirely. The confirmation carries both consequences instead, since
             they genuinely differ and one button is what now hides that. -->
        <button class="btn btn-neon" style="margin-top:20px" data-a="save">\${env.saveLabel}</button>\`;

      const f = (k) => div.querySelector('[data-f=' + k + ']');
      const q = (s) => div.querySelector(s);

      // ---- Rich stamp grid engine (declared before renderPreview, which uses it) ----
      // Big stamps that fill in (like a real punch card), rendered in the browser
      // and stored server-side. Apple uses them as the strip image, Google as the
      // hero image. Emoji glyphs bake in this device's emoji look.
      // Declared up here: drawStampStrip reads it and renderPreview calls that
      // during setup, so declaring it further down would leave it in the dead
      // zone and throw.
      /** The band at any size, from whatever the colour picker currently says. */
      function bandPng(w, h) {
        return drawBanner(f("bandColor").value, w, h);
      }
      let stampStyle = c.stampStyle || "";  // '' = plain dots, 'custom' = uploaded
      const stampImg = new Image();          // holds the uploaded icon for drawing

      // Load the STORED stamp shape back before anything re-renders.
      //
      // This is the whole reason an uploaded stamp used to disappear. The icon
      // lived only in a variable, so a reload — or a colour save, or a tap on a
      // band texture — found nothing in memory and quietly redrew every stamp as
      // a plain circle. cards.stamp_style still said 'custom', describing an
      // image nothing had kept. It is a stored image now, and every path that
      // re-renders awaits this first (see applyStamps and the self-heal below),
      // so the grid can never be rebuilt without it.
      let stampIconReady = false;
      function loadStampIcon(src) {
        return new Promise((resolve) => {
          if (!src) { stampIconReady = false; return resolve(); }
          stampImg.onload = () => { stampIconReady = true; resolve(); };
          // A 404 (nothing stored) is not an error worth showing — it just means
          // this card has no shape and the grid falls back to dots.
          stampImg.onerror = () => { stampIconReady = false; resolve(); };
          stampImg.src = src;
        });
      }
      // Same-origin, so the canvas it is drawn into stays untainted and
      // toDataURL keeps working — see /c/:cardId/art/stamp-icon.png.
      const stampIconReadyPromise = loadStampIcon(
        c.stampIconVersion ? env.artUrl("stamp-icon", c.stampIconVersion) : "",
      );

      // The banner is the BACKDROP the stamps are drawn onto, so it has to be
      // decoded before any strip is rendered — the pass has one strip slot, and
      // whatever we bake in here is all the customer ever sees.
      const bannerImg = new Image();
      let bannerReady = false;
      function loadBanner(src) {
        return new Promise((resolve) => {
          if (!src) { bannerReady = false; return resolve(); }
          bannerImg.onload = () => { bannerReady = true; resolve(); };
          bannerImg.onerror = () => { bannerReady = false; resolve(); };
          bannerImg.src = src;
        });
      }
      // Drawn from the hosted copy, which is same-origin, so the canvas stays
      // untainted and toDataURL keeps working.
      //
      // ONLY when the band is an uploaded image. card_banners holds one of two
      // things — the owner's artwork, or the flat band we generated — and
      // band_texture says which. Loading the generated one would paint a STALE
      // colour over a fresh one: drag the Band picker and the card would not
      // move until the PNG had been saved, re-served and re-decoded, which is
      // exactly the bug that made the band read from the picker in the first
      // place.
      let bandIsImage = c.bandTexture === "image";
      const bannerReadyPromise = loadBanner(
        bandIsImage && c.bannerVersion ? env.artUrl("banner", c.bannerVersion) : "",
      );

      /**
       * Repaint once the stored art has actually decoded.
       *
       * Without this the panel LIES on every open. The mount paints the preview
       * synchronously, microseconds after these two images were handed a src, so
       * neither has decoded: the stamp grid falls through to plain circles and
       * the band to bare colour. Nothing then repainted, because renderPreview
       * only runs on a field edit — so an owner who opened the designer and
       * simply looked at it saw dots over an uploaded shape that was safely in
       * the database, and reasonably concluded the upload had been lost.
       *
       * Deliberately not awaited by the mount: the panel must appear at once on
       * a slow connection, then correct itself.
       */
      void Promise.all([stampIconReadyPromise, bannerReadyPromise]).then(() => {
        // The EDITOR has to still be here, not just the card face.
        //
        // previewOnly paints once and then throws every field away, keeping
        // only [data-pvbox] — so this guard passed on a carousel tile (the face
        // is inside that box) and renderPreview then read a colour input that
        // had been removed. One unhandled rejection per tile, every time a
        // banner finished decoding, and the tile stopped repainting from there.
        // Checking a field renderPreview actually reads is the real precondition.
        if (!f("bg")) return;
        if (div.isConnected || div.querySelector("[data-pv]")) renderPreview();
      });

      // Draws the stamp grid for filled/target onto a wide strip → dataURL.
      // Filled cells show the icon; empty cells show a faint "hole" of it.
      // Mirrors stampGrid() in src/passModel.ts — always two rows, so the strip
      // keeps one shape at any target. No build step here, so it cannot import;
      // if you change the rule, change it in both places.
      function stampGridCols(target) { return Math.max(1, Math.ceil(target / 2)); }

      // Paints the uploaded stamp shape in one flat colour: draw it, then
      // "source-in" a fill over it, which keeps the alpha channel and throws away
      // whatever colours the file itself had. That is why an upload must be
      // transparent — a photo would come out as a solid rectangle.
      function shapeStamp(img, size, color) {
        const s = document.createElement("canvas"); s.width = size; s.height = size;
        const sx = s.getContext("2d");
        const k = Math.min(size / img.naturalWidth, size / img.naturalHeight); // contain, never crop
        const w = img.naturalWidth * k, h = img.naturalHeight * k;
        sx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        sx.globalCompositeOperation = "source-in";
        sx.fillStyle = color; sx.fillRect(0, 0, size, size);
        return s;
      }

      /**
       * One strip image for one stamp count.
       *
       * 1125x369 is the @3x storeCard strip (375x123pt) and is also what Google
       * takes as its hero image, which is why it is the default — Google asks
       * for 1032px of width and the old @2x render was 750. The grid is centred
       * with a clear margin all round and an odd target leaves the last row one
       * short, centred. Earned stamps take the accent colour; unearned are the
       * same shape at 25%.
       *
       * The caller can ask for a smaller canvas. That is not a preference: a
       * band image composited into an @3x strip can pass the server's 512KB
       * per-strip cap on its own, and the route fails the whole set — see the
       * clamp in applyStamps.
       */
      function drawStampStrip(filled, target, icon, wOut, hOut, plain) {
        // 1125×369 — Apple's storeCard strip at @3x (375×123pt), and the SAME
        // file is Google's heroImage. It was 750×246 (@2x), which was correct
        // for Apple and undersized for Google: their loyalty guidelines ask for
        // 1032px of width and we were sending 750. Everything below is derived
        // from W, H and M, so the grid scales rather than being re-laid-out.
        //
        // The 3:1 shape is Apple's and cannot change — a storeCard strip is a
        // fixed slot. Google currently documents ~1032×812 for a hero, so this
        // is wider than they ask and shorter than they ask; a hero at the wrong
        // RATIO is letterboxed, but one under their width may be dropped, so
        // width is the half worth fixing with one image serving both.
        // Defaults are @3x; applyStamps passes @2x instead when a composited
        // band would push a strip past the server's 512KB cap. M scales with
        // the canvas so the grid keeps the same clear margin at either size.
        const W = wOut || 1125, H = hOut || 369, M = Math.round(W * 0.0533);
        const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
        const x = cv.getContext("2d");
        // The band, drawn from what the pickers say RIGHT NOW — then the stamps
        // on top. Apple has one strip slot, so the band and the grid have to
        // arrive as a single image.
        //
        // This used to composite the stored banner PNG instead, which meant the
        // band colour did nothing until it had been saved, re-uploaded and
        // re-downloaded: you dragged the picker and the card never moved. Now
        // the picker is the source and the stored PNG is only the copy the
        // wallets fetch.
        paintBand(x, f("bandColor").value, W, H);
        // A membership card stops here: the band is the whole image. It has no
        // counter, so there is nothing to draw a grid of — and the grid maths
        // below divides by the target, which is zero on this path.
        if (plain) return cv.toDataURL("image/png");
        const accent = f("accent").value;
        const cols = stampGridCols(target), rows = target > 1 ? 2 : 1;
        const cw = (W - M * 2) / cols, ch = (H - M * 2) / rows;
        const r = Math.min(cw, ch) * 0.34;
        const perRow = Math.ceil(target / rows);
        const customReady = stampIconReady && stampImg.complete && stampImg.naturalWidth > 0;
        // A shape is CONTAINED in its box while a dot FILLS one, so drawing both
        // at 2r made every uploaded stamp read smaller than the dots it
        // replaced — a round mark only touches the box at four points, and
        // anything not square loses more. 2.5r puts the artwork back at the
        // weight of a dot and still leaves a clear gap between neighbours.
        const shaped = icon === "custom" && customReady
          ? { on: shapeStamp(stampImg, Math.ceil(r * 2.5), accent), size: Math.ceil(r * 2.5) }
          : null;
        for (let i = 0; i < target; i++) {
          const rowN = Math.floor(i / perRow), col = i % perRow;
          // A short final row is centred rather than left-aligned.
          const inRow = Math.min(perRow, target - rowN * perRow);
          const rowW = cw * inRow, rowX = (W - rowW) / 2;
          const cx = rowX + cw * col + cw / 2, cy = M + ch * rowN + ch / 2;
          const on = i < filled;
          if (shaped) {
            x.globalAlpha = on ? 1 : .25;
            x.drawImage(shaped.on, cx - shaped.size / 2, cy - shaped.size / 2);
            x.globalAlpha = 1;
          } else if (icon === "dot" || icon === "custom") {
            // "dot" style, or a custom stamp whose source isn't in memory (e.g.
            // after a reload) — a clean circle in the same two states.
            x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2);
            x.fillStyle = accent;
            x.globalAlpha = on ? 1 : .25;
            x.fill();
            x.globalAlpha = 1;
          } else {
            // fillStyle, which this did not set. The last thing to set it was
            // paintBand above, so every ready-made shape was drawn in the BAND
            // colour, on top of the band — invisible, on every card, while dots
            // worked fine because the dot path sets it two lines up.
            x.fillStyle = accent;
            x.font = (r * 1.9) + "px serif"; x.textAlign = "center"; x.textBaseline = "middle";
            x.globalAlpha = on ? 1 : .25;
            x.fillText(icon, cx, cy);
            x.globalAlpha = 1;
          }
        }
        return cv.toDataURL("image/png");
      }

      // banner preview
      if (c.bannerVersion) {
        const b = q("[data-pv-banner]");
        b.style.backgroundImage = "url(" + env.artUrl("banner", c.bannerVersion) + ")";
        b.classList.add("on");
      }

      // Mirrors getHeaderFieldValue() in src/passModel.ts, which is the canonical
      // version — the pass and this preview must never disagree about the header.
      function headerValue(earned, total) {
        const e = Math.max(0, Math.min(earned, total));
        if (e >= total) return "Reward ready";
        const left = total - e;
        return left <= e ? left + " left" : e + " earned";
      }

      /**
       * The same rule in points, and the same reason: count up while that is
       * the encouraging number, count down once the reward is the shorter road.
       * Past the dearest thing on the list it goes back to the plain balance,
       * which is the one number still moving.
       */
      function pointsHeader(earned, total) {
        const pts = (n) => n + (n === 1 ? " point" : " points");
        if (earned >= total) return pts(earned);
        const e = Math.max(0, Math.min(earned, total));
        const left = total - e;
        return left <= e ? pts(left) + " to reward" : pts(e) + " earned";
      }

      /**
       * What this shop calls its regulars. "Member" until they say otherwise.
       *
       * Read from the CONTROL and not from the card it was loaded with, so the
       * preview changes as the word is typed — the same rule the shop name and
       * the card type already follow. previewOnly strips the editor, so the
       * card it was loaded with is the fallback there.
       */
      function memberLabel() {
        const box = f("memberLabel");
        const v = (box ? box.value : c.memberLabel) || "Member";
        return v.trim() || "Member";
      }

      /**
       * Does the logo already carry the shop's name?
       *
       * Read from the SWITCH and not from the card it was loaded with, so the
       * preview moves as it is flicked. It used to read the card, and the card
       * is only updated on Save — so ticking "show company name" did nothing
       * visible at all, and the switch read as broken.
       */
      function hasNameNow() {
        const box = q("[data-lname]");
        return box ? !box.checked : Boolean(c.logoHasName);
      }

      /**
       * Is the designer editing a membership card right now?
       *
       * Read from the control rather than from the card it was loaded with, so
       * the previews change the moment the type is switched — before any save.
       */
      function isMember() {
        return kindNow() === "membership";
      }

      // "Aug 2026" — mirrors memberSince() in src/passModel.ts. A card being
      // designed has no holder yet, so the preview shows this month, which is
      // what the first member to scan the poster will actually see.
      const PV_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      function thisMonth() {
        const d = new Date();
        return PV_MONTHS[d.getMonth()] + " " + d.getFullYear();
      }

      function kindNow() {
        const sel = f("kind");
        // Falls back to a stamp card rather than to nothing: an empty kind
        // matches no rules block, so every one of them would be hidden and the
        // panel would look like it had lost its own settings.
        return (sel && sel.value) || "stamp";
      }

      /** Show only the rules that belong to the type being edited. */
      function syncKind() {
        const k = kindNow();
        for (const el of div.querySelectorAll("[data-rules]")) {
          el.hidden = el.getAttribute("data-rules") !== k;
        }
      }

      // ---- the reward ladder ----
      //
      // Held as an array rather than read back off the inputs on every keypress,
      // because the rows are added and removed and an index into the DOM would
      // go stale the moment somebody deleted the middle one. The inputs write
      // into this; everything else reads it.
      let ladder = (c.milestones || []).map((m) => ({ at: m.at, reward: m.reward }));
      if (!ladder.length) ladder = [{ at: 2, reward: "" }, { at: Number(c.stampsTarget) || 10, reward: c.reward || "" }];

      // A points PRICE is not a stamp count: it is not held to the twenty a grid
      // of circles imposes, because a points card draws no grid. Mirrors
      // MAX_MILESTONE / MAX_POINTS_COST in src/db.ts, which is what the server
      // clamps to.
      function ladderMax() {
        return kindNow() === "points" ? 100000 : 20;
      }

      /** The ladder as the server wants it: sorted, complete rows only. */
      function ladderClean() {
        const cap = ladderMax();
        const seen = {};
        return ladder
          .map((m) => ({ at: Math.max(1, Math.min(cap, Number(m.at) || 1)), reward: (m.reward || "").trim() }))
          .filter((m) => m.reward)
          .sort((a, b) => a.at - b.at)
          .filter((m) => (seen[m.at] ? false : (seen[m.at] = 1)));
      }

      /**
       * One editor, mounted in whichever rules block is on screen.
       *
       * Both card kinds are editing the same list of rewards-and-numbers, so a
       * second copy of this would be two places for the same bug. Only the
       * wording and the cap differ, and both come from the kind.
       */
      function renderLadder() {
        const points = kindNow() === "points";
        const host = q(points ? "[data-ladder-points]" : "[data-ladder]");
        if (!host) return;
        host.innerHTML = "";
        ladder.forEach((m, i) => {
          const rowEl = document.createElement("div");
          rowEl.className = "row2 ladder-row";
          rowEl.innerHTML =
            '<div><label>' + (points ? "Costs" : "At stamp") + '</label>' +
            '<input type="number" min="1" max="' + ladderMax() + '" data-lad="at" value="' +
            (Number(m.at) || 1) + '"></div>' +
            '<div><label>They get</label>' +
            '<input maxlength="60" data-lad="reward" placeholder="' +
            (points ? "Free coffee" : "Free cookie") + '" value="' +
            String(m.reward || "").replace(/"/g, "&quot;") + '"></div>' +
            '<button type="button" class="btn btn-ghost" data-lad="del" aria-label="Remove this reward">Remove</button>';
          rowEl.querySelector('[data-lad=at]').addEventListener("input", (e) => {
            ladder[i].at = e.target.value; renderPreview();
          });
          rowEl.querySelector('[data-lad=reward]').addEventListener("input", (e) => {
            ladder[i].reward = e.target.value; renderPreview();
          });
          rowEl.querySelector('[data-lad=del]').onclick = () => {
            // Never down to nothing: a card of either kind with no rewards on
            // it has nothing to give, and the save would quietly turn it back
            // into a stamp card promising whatever was in the reward box.
            if (ladder.length <= 1) { toast("A card needs at least one reward"); return; }
            ladder.splice(i, 1); renderLadder(); renderPreview();
          };
          host.appendChild(rowEl);
        });
        const note = q(points ? "[data-ladder-note-points]" : "[data-ladder-note]");
        if (note) {
          const clean = ladderClean();
          if (!clean.length) note.textContent = "Add a reward to see how the card will work.";
          else if (points) {
            note.textContent = "Customers can spend as soon as they reach " + clean[0].at +
              " points. Whatever is left over stays on their card.";
          } else {
            note.textContent = "Your card will have " + clean[clean.length - 1].at + " circles. " +
              (clean.length > 1
                ? "The first " + (clean.length - 1) + (clean.length === 2 ? " reward keeps" : " rewards keep") +
                  " the card going; the last one starts it again from zero."
                : "One reward, at the end.");
          }
        }
      }

      const addRung = () => {
        if (ladder.length >= 6) { toast("Six rewards is the most one card can hold"); return; }
        const top = ladderClean();
        const step = kindNow() === "points" ? 100 : 3;
        const next = top.length
          ? Math.min(ladderMax(), top[top.length - 1].at + step)
          : (kindNow() === "points" ? 100 : 5);
        ladder.push({ at: next, reward: "" });
        renderLadder(); renderPreview();
      };
      for (const b of div.querySelectorAll('[data-a=addrung], [data-a=addprice]')) b.onclick = addRung;

      let lastKind = null;
      function renderPreview() {
        syncKind();
        // The editor lives in whichever rules block is on screen, so switching
        // kind has to move it. Only on an actual change — re-rendering on every
        // keystroke would take the focus out of the box being typed in.
        if (kindNow() !== lastKind) { lastKind = kindNow(); renderLadder(); }
        const member = isMember();
        const points = kindNow() === "points";
        const rungs = kindNow() === "milestones" || points ? ladderClean() : [];
        // On a milestones card the whole card is the LAST rung and the number
        // the header counts to is the FIRST unclaimed one — the same split
        // targetFor() makes in src/passModel.ts. A preview that counted to the
        // top would show a card no customer ever sees.
        // A points card is previewed at a plausible balance rather than at the
        // welcome stamps, which it does not have: the owner needs to see what a
        // customer part-way to their cheapest reward is looking at.
        const total = points
          ? (rungs.length ? rungs[rungs.length - 1].at : 100)
          : rungs.length
            ? rungs[rungs.length - 1].at
            : Math.max(1, Math.min(20, Number(f("stampsTarget").value) || 10));
        const start = points
          ? (rungs.length ? Math.floor(rungs[0].at / 2) : 50)
          : Math.max(0, Math.min(total, Number(f("stampsStart").value) || 0));
        const nextRung = rungs.find((m) => m.at > start) || rungs[rungs.length - 1] || null;
        const target = nextRung ? nextRung.at : total;
        const pv = q("[data-pv]");
        pv.style.background = f("bg").value;
        pv.style.color = f("fg").value;
        // The name beside the logo is the pass's logoText, so the preview has to
        // drop it under exactly the condition the pass does — otherwise the
        // owner ticks the box and sees no change until the card is on a phone.
        const pvName = q("[data-pv-name]");
        pvName.textContent = f("shopName").value || "Your card";
        pvName.style.display = hasNameNow() && c.logoVersion ? "none" : "";
        // Every one of these mirrors buildPassJson in src/passModel.ts. A
        // membership card shows who the holder is instead of how far along they
        // are, because it has no target to be along the way to.
        q("[data-pv-progress]").textContent = member ? memberLabel()
          : points ? pointsHeader(start, target)
          : headerValue(start, target);
        q("[data-pv-clbl]").textContent = member ? "MEMBER SINCE" : points ? "BALANCE" : "PROGRESS";
        q("[data-pv-tally]").textContent = member ? thisMonth() : start + "/" + target;
        q("[data-pv-rlbl]").textContent = member ? "MEMBER NO."
          : rungs.length ? "NEXT REWARD" : "REWARD";
        q("[data-pv-reward]").textContent = member
          ? "ABC123"
          : (nextRung ? nextRung.reward : (f("reward").value || "Your reward"));
        for (const el of div.querySelectorAll(".pv-lbl")) el.style.color = f("label").value;
        // When a rich stamp style is active, show the rendered grid in the strip
        // (it shares the slot with the banner — stamps win, matching the card).
        // Set both states explicitly every time. This used to only ever ADD the
        // class, so which image you saw depended on whether the banner or the
        // strip painted last — the preview could show a banner the pass didn't have.
        const dots = q("[data-pv-dots]"), banner = q("[data-pv-banner]");
        // ...and whenever the band is an uploaded image, for the same reason.
        // The real card ALWAYS gets a composited strip — applyStamps renders one
        // whatever the stamp style — so with artwork behind the stamps the text
        // dots and a decorative 64px band would show a card nobody receives.
        if (member || points) {
          // No circles at all — there is nothing to fill in. The band is still
          // drawn, because it carries the shop's colours and any artwork they
          // uploaded, and it is the one strip image a membership card stores.
          dots.style.display = "none";
          banner.style.backgroundImage = "url(" + drawStampStrip(0, 0, stampStyle, 0, 0, true) + ")";
          banner.classList.add("on", "strip");
        } else if (stampStyle || bandIsImage) {
          dots.style.display = "none";
          banner.style.backgroundImage = "url(" + drawStampStrip(start, total, stampStyle) + ")";
          banner.classList.add("on", "strip");
        } else {
          dots.style.display = "";
          banner.classList.remove("strip");
          banner.classList.toggle("on", Boolean(c.bannerVersion));
          dots.textContent = "●".repeat(start) + "○".repeat(total - start);
        }
        renderGoogle(start, target, nextRung, total, points);
        renderNotify();
      }

      /**
       * The Android card.
       *
       * Google is handed ONE colour and no images beyond the logo, so this mock
       * is deliberately plainer than the Apple one — that difference is the
       * information. It shows the count as text because that is literally what
       * Android receives: the rendered grid and the custom stamp shape never
       * reach it (src/googleModel.ts), and a mock that drew them would be a lie
       * the owner only finds out about on somebody else's phone.
       */
      function renderGoogle(start, target, nextRung, total, points) {
        const g = q("[data-pvg]");
        if (!g) return;
        const member = isMember();
        g.style.background = f("bg").value;
        g.style.color = pickTextColor(f("bg").value);
        const name = f("shopName").value || "Your shop";
        q("[data-pvg-issuer]").textContent = name;
        // Google prints the issuer AND the programme name at the top, always, so
        // putting the shop in both said it twice. The name is on the line above;
        // this one says what the thing is — exactly as buildLoyaltyClass sends
        // it, which is a fixed string and not the shop's.
        q("[data-pvg-prog]").textContent = member ? "Membership"
          : points ? "Points card" : "Loyalty card";
        // Every caption and every value below comes from buildLoyaltyPatch,
        // headers included — a card at its target tells the holder to show it,
        // and a mock that only ever drew the ordinary state would hide the one
        // moment the card exists for. The mock-vs-payload test compares this
        // against what buildLoyaltyPatch actually sends, so the two cannot
        // drift: the dot grid used to be drawn here and was removed in step
        // with its module.
        const ready = start >= target;
        const reward = f("reward").value || "Your reward";
        const progress = start + "/" + target;
        // The two captions are the class's cardTemplateOverride rendered, so
        // they move with the payload rather than staying fixed labels.
        q("[data-pvg-rlbl]").textContent = member ? "MEMBER NO."
          : nextRung ? "NEXT REWARD" : "REWARD";
        q("[data-pvg-clbl]").textContent = member ? "MEMBER SINCE" : points ? "BALANCE" : "PROGRESS";
        q("[data-pvg-bal]").textContent = member
          ? thisMonth()
          : points
            ? start + (start === 1 ? " point" : " points")
            : ready ? progress + " — reward ready 🎉" : progress + " earned";
        const shown = nextRung ? nextRung.reward : reward;
        q("[data-pvg-reward]").textContent = member
          ? "ABC123"
          : (ready ? shown + " — show this to staff!" : shown);
        // The square mark if there is one, else the wide logo — the same
        // fallback logoUrl() applies when the class is built.
        const im = q("[data-pvg-logo]");
        const v = c.markVersion || c.logoVersion;
        if (v) {
          im.src = env.artUrl(c.markVersion ? "mark" : "logo", v);
          im.style.display = "";
        } else im.style.display = "none";
        // The hero band: the ALL-FILLED grid, never the customer's real count.
        // Drawn at target-of-target here for the same reason the class points at
        // stamps/full.png — this band is decoration, and a mock that animated it
        // with the preview's slider would promise Android something it does not
        // do (see buildLoyaltyClass).
        const foot = q(".pvg-foot");
        if (foot) {
          if (member || points) {
            foot.style.backgroundImage = "url(" + drawStampStrip(0, 0, stampStyle, 0, 0, true) + ")";
            foot.classList.add("band");
          } else if (stampStyle) {
            const whole = total || target;
            foot.style.backgroundImage = "url(" + drawStampStrip(whole, whole, stampStyle) + ")";
            foot.classList.add("band");
          } else {
            foot.style.backgroundImage = "";
            foot.classList.remove("band");
          }
        }
      }

      /**
       * One dropdown where three buttons were.
       *
       * They answered a single question — dots, a ready-made shape, or your own
       * picture — and a row of buttons made them read as three separate things
       * you could do, with the current answer written underneath in a fourth
       * place. A list says what it is set to by being set to it.
       *
       * The presets are drawn in the card's own Stamps colour like any other
       * glyph: nothing to store, nothing to upload, and they survive a colour
       * change. They are TEXT glyphs and not emoji for exactly that reason — a
       * colour emoji ignores fillStyle, so a red heart stayed red on a green
       * card and there was no way to make it match. That is also why the
       * coffee cup went: there is no plain-text one.
       */
      const STAMP_PRESETS = [
        { v: "dot", name: "Dots" },
        { v: "\u2605", name: "Star" },
        { v: "\u2665", name: "Heart" },
        { v: "\u2713", name: "Tick" },
        { v: "\u25C6", name: "Diamond" },
      ];

      function stampNow() {
        if (c.stampIconVersion && stampStyle === "custom") return "custom";
        if (!stampStyle || stampStyle === "dot") return "dot";
        return stampStyle;
      }

      function drawStampPick() {
        const sel = q("[data-stamppick]");
        if (!sel) return;
        const now = stampNow();
        // A card already wearing a shape this list no longer offers keeps it,
        // as its own first entry. The emoji route is gone — a colour emoji
        // ignores the card's Stamps colour, which is the one thing every other
        // shape here obeys — but cards chosen while it existed are still out
        // there, and a list with nothing selected would silently rewrite one to
        // dots on the next save.
        const known = now === "custom" || STAMP_PRESETS.some((x) => x.v === now);
        sel.innerHTML =
          (known ? "" : '<option value="' + esc(now) + '" selected>' + esc(now) + " (your shape)</option>") +
          STAMP_PRESETS.map((x) =>
            '<option value="' + esc(x.v) + '"' + (x.v === now ? " selected" : "") + ">" +
            esc(x.name) + "</option>").join("") +
          '<option value="custom"' + (now === "custom" ? " selected" : "") + ">Upload your own\u2026</option>";
      }

      {
        const sel = q("[data-stamppick]");
        if (sel) {
          drawStampPick();
          sel.onchange = async () => {
            const v = sel.value;
            // Both of these open something and may be cancelled, so the list is
            // put back to what is actually set rather than left showing a
            // choice that was never made.
            if (v === "custom") { drawStampPick(); q("[data-stampimg]").click(); return; }
            if (v === "dot") { await backToDots(); drawStampPick(); return; }
            await applyStamps(v);
            drawStampPick();
          };
        }
      }

      /**
       * The Android square logo, offered only when the logo actually needs one.
       *
       * It used to appear whenever the Android tab was open, which made it look
       * like a second logo everyone has to supply. Google crops programLogo to a
       * circle: a square-ish logo survives that untouched and its owner should
       * never be asked for anything, while a wide lockup loses both ends and its
       * owner should be told exactly that, once, next to the logo in question.
       *
       * The trigger is the shape of the image they already uploaded, measured in
       * the browser — no new column, and no guessing.
       */
      let logoRatio = 0;
      function updateMark() {
        const hint = q("[data-markhint]");
        if (!hint) return;
        // The row's label is fixed and its state lives on the button, which is
        // where the state of the row above it lives too. The hint is the one
        // extra thing, and only in the one state where something is actually
        // being lost: a wide logo, and no square version to use instead.
        q("[data-markbtn]").textContent = c.markVersion ? "Replace logo" : "Upload logo";
        // The SAME line for the row above. It never had one — its button said
        // "Upload logo" whether or not a logo was already there, so a merchant
        // looking at their own logo was invited to upload one. The Android row
        // has been doing this correctly all along, which is what made the
        // difference visible.
        q("[data-logobtn]").textContent = c.logoVersion ? "Replace logo" : "Upload logo";
        hint.hidden = !(c.logoVersion && logoRatio > 1.25 && !c.markVersion);
        paintArt();
      }

      /**
       * The three thumbnails, and whether each is there at all.
       *
       * A box shows its picture with an X on it, or nothing but its Upload
       * button. Removing used to be a permanently-visible button that was
       * disabled until there was something to remove — two controls for a thing
       * that did not exist yet.
       */
      // Declared ABOVE paintArt, which updateMark() calls during setup: a let
      // read before its own declaration throws, and the panel never mounts.
      // The three pictures as data URLs, held only while they are staged. See
      // paintArt for why: a staged upload is not on the server yet, so its
      // hosted URL is a 404 and the thumbnail draws as a broken image.
      let freshLogo = "", freshMark = "", freshBand = "";
      function paintArt() {
        const one = (key, on, url) => {
          const box = div.querySelector('[data-lbthumb="' + key + '"]');
          if (!box) return;
          box.hidden = !on;
          if (on && url) {
            const img = div.querySelector('[data-lbimg="' + key + '"]');
            if (img) img.src = url;
          }
        };
        // The picture JUST UPLOADED, if there is one, and only then the hosted
        // copy. An upload is STAGED — nothing reaches the server until Save —
        // so asking the server for it draws a broken image, which is the "?"
        // that appeared in the box the moment a logo was chosen. The version
        // number had already been bumped locally, so the URL looked valid and
        // 404'd.
        one("logo", Boolean(c.logoVersion), freshLogo || env.artUrl("logo", c.logoVersion));
        one("mark", Boolean(c.markVersion), freshMark || env.artUrl("mark", c.markVersion));
        one("banner", bandIsImage, freshBand || env.artUrl("banner", c.bannerVersion));
      }
      // Measured off its own Image rather than the preview's: the preview logo
      // is hidden on two of the three tabs, and a hidden img still decodes but
      // this way nothing depends on which tab happens to be open.
      if (c.logoVersion) {
        const probe = new Image();
        probe.onload = () => {
          if (probe.naturalHeight > 0) logoRatio = probe.naturalWidth / probe.naturalHeight;
          updateMark();
        };
        probe.src = env.artUrl("logo", c.logoVersion);
      }
      updateMark();

      /** The printed sheet. Same order and the same rules as posterPage. */
      /**
       * The sign-up line, and the lock-screen banner.
       *
       * This was renderPoster, and the poster mock it drew is gone — an owner
       * can print the real sheet and hold it, while the notification is the one
       * surface they never otherwise see. What survived is the sentence: it is
       * the sign-up page's headline AND the placeholder under the field, and
       * both have to be derived on every repaint or a target change leaves the
       * suggestion underneath offering the old number.
       */
      function renderNotify() {
        const reward = f("reward").value || "your reward";
        const target = Math.max(1, Math.min(20, Number(f("stampsTarget").value) || 10));
        // Mirrors signupLine() in src/pages.ts. A membership card has no target
        // to promise, so the generated line names the perks the shop typed.
        let suggested;
        if (kindNow() === "points" && ladderClean().length) {
          suggested = "Collect points every visit — " +
            ladderClean().map((m) => m.reward + " for " + m.at).join(" · ").toLowerCase() + " points.";
        } else if (kindNow() === "milestones" && ladderClean().length) {
          suggested = "Rewards along the way — " +
            ladderClean().map((m) => m.reward + " at " + m.at).join(" · ").toLowerCase() + ".";
        } else if (isMember()) {
          const perks = (f("benefits").value || "").split(String.fromCharCode(10))
            .map((l) => l.trim()).filter(Boolean);
          suggested = perks.length
            ? "Your membership card — " + perks.slice(0, 2).join(", ").toLowerCase() + "."
            : "Your membership card, free to join.";
        } else {
          suggested = "Collect " + target + " stamps, get a " + reward.toLowerCase() + ".";
        }
        f("signupMessage").placeholder = suggested;

        const nb = q("[data-pvn-body]");
        if (!nb) return;
        const shop = f("shopName").value || "Your shop";
        q("[data-pvn-app]").textContent = shop;
        const im = q("[data-pvn-logo]");
        if (c.logoVersion) { im.src = env.artUrl("logo", c.logoVersion); im.style.display = ""; }
        else im.style.display = "none";
        // What iOS actually shows: the header field's changeMessage with %@
        // already substituted. Mirrors buildPassJson in src/passModel.ts — if
        // that wording changes, this has to move with it or an owner is shown
        // a banner their customers never get.
        const start = Math.max(0, Math.min(target, Number(f("stampsStart").value) || 0));
        const rungs = kindNow() === "milestones" || kindNow() === "points" ? ladderClean() : [];
        const nextRung = rungs.find((m) => m.at > start) || rungs[rungs.length - 1] || null;
        const to = nextRung ? nextRung.at : target;
        const prize = nextRung ? nextRung.reward : reward;
        let line;
        if (isMember()) line = "Member at " + shop;
        else if (kindNow() === "points") {
          line = start + " points — " + prize.toLowerCase() + " at " + to;
        } else if (start >= to) {
          line = "Reward ready — your " + prize.toLowerCase() + " is waiting 🎉";
        } else {
          const left = to - start;
          line = (left <= start ? left + " left" : start + " earned") +
            " — " + prize.toLowerCase() + " at " + to;
        }
        nb.textContent = line;
      }

      for (const el of div.querySelectorAll("[data-f]")) el.addEventListener("input", renderPreview);
      renderLadder();
      renderPreview();

      /**
       * NOTHING an owner uploads reaches the card until they press Save.
       *
       * Uploads used to POST the instant a file was chosen, so a logo, a band or
       * a stamp shape landed on the live card — and, because the art URLs are
       * what an Android wallet re-fetches, on customers' phones — while the
       * colours beside them still waited for the button. Half the panel saved
       * itself and half did not, which is why an operator designing in the admin
       * console watched their half-finished work appear in the merchant's
       * dashboard. One rule now: the preview updates immediately, the server
       * hears about it on Save.
       *
       * Keyed by what is being written, so choosing three logos in a row leaves
       * one upload staged rather than three. Deletions stay immediate — each is
       * behind a confirmation that says so, and they are the one case where
       * "did that work?" needs answering on the spot.
       */
      const pending = new Map();
      const stage = (key, run) => { pending.set(key, run); markPending(); };
      /** Runs the queue in the order it was built. A failure leaves the rest staged. */
      async function flushPending() {
        for (const key of [...pending.keys()]) {
          const ok = await pending.get(key)();
          if (!ok) { markPending(); return false; }
          pending.delete(key);
        }
        markPending();
        return true;
      }
      /** Say so on the button, so an unsaved upload is never a silent state. */
      function markPending() {
        const btn = div.querySelector("[data-a=save]");
        if (btn && !btn.disabled) {
          btn.textContent = pending.size
            ? (env.saveLabel || "Save") + " •"
            : (env.saveLabel || "Save");
        }
      }

      // Self-heal: the stamp grid now lives only in the strip image, so a card
      // with no rendered strips would show a customer no stamps at all. Cards
      // made before that was true have none, so render the default set once, the
      // first time their owner opens this panel. Silent — nothing was asked for,
      // and a repair is not an edit, so it commits rather than staging.
      if (!c.stampsVersion) {
        applyStamps(stampStyle || "dot", true, true).then(() => { c.stampsVersion = 1; })
          .catch(() => {}); // a failure just means we try again next visit
      }

      // What each upload is called when a toast has to name it. Keyed by the
      // same string the route takes, so a new kind cannot be added without one.
      const ART_LABEL = { logo: "Logo", banner: "Banner", mark: "Android logo" };

      // ---- Make an upload usable without asking the owner to edit it ----
      //
      // Shops have a logo as a PNG on a white square. That is the file they
      // have, and telling them to go and produce a transparent one is asking
      // for image editing most of them do not do. Two problems come out of it:
      // a white box sitting behind the mark on a coloured card, and — for a
      // stamp, whose SHAPE is its alpha channel — an upload that is rejected
      // outright because a solid rectangle would stamp a solid rectangle.
      //
      // So: lift the flat backdrop, then trim the empty margin around what is
      // left. The trim is the half that fixes "my stamp is too small" — a
      // typical icon file is nearly half padding, and every pixel of it was
      // being scaled down into the slot along with the artwork.

      /**
       * The flat colour an image sits on, or null if it does not sit on one.
       *
       * Read from the border ring only, and only trusted when the ring is
       * overwhelmingly ONE colour. A photo, a gradient or a full-bleed design
       * fails that test and is left completely alone — which is the point: this
       * must never eat part of a picture that had no backdrop to remove.
       */
      function flatBackdrop(d, w, h) {
        const edge = [];
        const step = Math.max(1, Math.floor(Math.min(w, h) / 64));
        for (let x = 0; x < w; x += step) { edge.push((x) * 4, ((h - 1) * w + x) * 4); }
        for (let y = 0; y < h; y += step) { edge.push((y * w) * 4, (y * w + w - 1) * 4); }
        let r = 0, g = 0, b = 0, n = 0;
        for (const i of edge) {
          if (d[i + 3] < 128) continue; // already transparent there
          r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
        }
        // A border that is already mostly transparent needs no lifting.
        if (n < edge.length * 0.6) return null;
        r = r / n; g = g / n; b = b / n;
        let near = 0;
        for (const i of edge) {
          if (d[i + 3] < 128) continue;
          if (Math.max(Math.abs(d[i] - r), Math.abs(d[i + 1] - g), Math.abs(d[i + 2] - b)) <= 16) near++;
        }
        return near >= n * 0.9 ? { r, g, b } : null;
      }

      /**
       * Lift that backdrop and crop to what is actually drawn.
       *
       * Every matching pixel goes, not only the ones touching the border: a
       * stamp is recoloured through its alpha, so a white disc enclosed by a
       * ring is invisible as background but perfectly solid to that fill — it
       * turned a ring-and-fist mark into a plain blob. The ramp rather than a
       * threshold is what stops the result looking cut out with scissors.
       */
      function liftBackdrop(src) {
        const cv = document.createElement("canvas");
        cv.width = src.width; cv.height = src.height;
        const cx = cv.getContext("2d", { willReadFrequently: true });
        cx.drawImage(src, 0, 0);
        const im = cx.getImageData(0, 0, cv.width, cv.height);
        const d = im.data;
        const bg = flatBackdrop(d, cv.width, cv.height);
        if (bg) {
          for (let i = 0; i < d.length; i += 4) {
            const dist = Math.max(Math.abs(d[i] - bg.r), Math.abs(d[i + 1] - bg.g), Math.abs(d[i + 2] - bg.b));
            // 0..10 away is backdrop, 40+ is artwork, in between fades.
            const keep = Math.min(1, Math.max(0, (dist - 10) / 30));
            d[i + 3] = Math.round(d[i + 3] * keep);
          }
          cx.putImageData(im, 0, 0);
        }
        // Trim. Uses the alpha we just wrote, so an image that already had a
        // transparent margin is trimmed too, backdrop or no backdrop.
        let x0 = cv.width, y0 = cv.height, x1 = -1, y1 = -1;
        for (let y = 0; y < cv.height; y++) {
          for (let x = 0; x < cv.width; x++) {
            if (d[(y * cv.width + x) * 4 + 3] >= 24) {
              if (x < x0) x0 = x; if (x > x1) x1 = x;
              if (y < y0) y0 = y; if (y > y1) y1 = y;
            }
          }
        }
        if (x1 < 0) return cv; // nothing left; the caller's own check reports it
        const tw = x1 - x0 + 1, th = y1 - y0 + 1;
        if (tw === cv.width && th === cv.height) return cv;
        const out = document.createElement("canvas");
        out.width = tw; out.height = th;
        out.getContext("2d").drawImage(cv, x0, y0, tw, th, 0, 0, tw, th);
        return out;
      }
      // The logo as it stands, for the legibility check below. Seeded from the
      // hosted copy so the check still works on a page that was reloaded rather
      // than freshly uploaded to; that URL is same-origin, so reading its pixels
      // back off a canvas is allowed.
      let lastLogoUrl = c.logoVersion ? env.artUrl("logo", c.logoVersion) : "";

      /**
       * The average colour of what is actually DRAWN, alpha-weighted — so the
       * transparent margin liftBackdrop just created counts for nothing, and a
       * mark that is 90% empty space still reports its ink rather than a wash.
       */
      function artworkColor(img) {
        const cv = document.createElement("canvas");
        const w = cv.width = Math.max(1, Math.min(64, img.naturalWidth || img.width));
        const h = cv.height = Math.max(1, Math.min(64, img.naturalHeight || img.height));
        const cx = cv.getContext("2d", { willReadFrequently: true });
        cx.drawImage(img, 0, 0, w, h);
        const d = cx.getImageData(0, 0, w, h).data;
        let r = 0, g = 0, b = 0, a = 0;
        for (let i = 0; i < d.length; i += 4) {
          const k = d[i + 3] / 255;
          r += d[i] * k; g += d[i + 1] * k; b += d[i + 2] * k; a += k;
        }
        return a < 1 ? null : toHex(r / a, g / a, b / a);
      }

      /**
       * Taking the white plate off a logo is right on a coloured card — it is
       * what stops the mark looking like a sticker. It is wrong in exactly one
       * case: when the artwork under the plate is as dark as the card, and that
       * plate was the only thing making it visible. Stripping it then hands back
       * an invisible logo and no explanation.
       *
       * So move the card rather than the logo. The owner chose a colour, not a
       * contrast ratio, and the nearest shade that shows their mark is much
       * closer to what they asked for than a blank card is.
       */
      async function ensureLogoReadable(dataUrl, quiet) {
        const img = await new Promise((res) => {
          const i = new Image();
          i.onload = () => res(i); i.onerror = () => res(null); i.src = dataUrl;
        });
        if (!img) return;
        const ink = artworkColor(img);
        if (!ink) return;
        const bg = f("bg").value;
        if (contrastRatio(ink, bg) >= 2) return;
        // Away from the ink, on the side the card is already on.
        const up = relLuminance(bg) >= relLuminance(ink);
        let out = bg;
        for (let i = 0; i < 8 && contrastRatio(ink, out) < 2; i++) out = shiftColor(out, up ? 0.1 : -0.1);
        if (out === bg || contrastRatio(ink, out) < 2) return; // nothing gained; leave it alone
        f("bg").value = out;
        f("fg").value = pickTextColor(out);
        renderPreview(); drawPalette();
        // The pickers hold it and Save reads the pickers. This used to POST on
        // its own, which put a colour on the live card while the owner was still
        // choosing one.
        if (!quiet) {
          toast("That logo was almost invisible on your card colour, so the card was made "
            + (up ? "lighter" : "darker") + " to suit. Change it below if you'd rather.");
        }
      }

      // image upload helper: normalise to PNG (wide logo, or wide banner) → POST.
      // fit "contain" letterboxes the whole image in; "cover" (the default) fills
      // the frame and crops the overflow. A logo MUST contain — cropping a
      // wordmark to fill a frame chops the first and last letters off.
      /**
       * Put the picture where you want it before it is saved.
       *
       * Every upload before this was fitted automatically — centred, and either
       * capped, letterboxed or cropped — with no way to say "not there, there".
       * A logo with the mark off to one side, or a banner whose subject sits
       * left, came out wrong and no different file fixed it.
       *
       * The FRAME's shape is the target's, except for the logo, which keeps its
       * own: padding a square mark into a wide frame made the wallets scale the
       * whole frame down into their logo slot and left the mark a fraction of
       * the space it should have had. Zooming crops within that shape, so the
       * shape itself never changes under the owner.
       *
       * Returns something drawImage accepts — the original when nothing was
       * moved, so an owner who just presses Use it loses no resolution to a
       * needless round trip through a canvas.
       */
      function cropDialog(src, w, h, fit) {
        const aspect = fit === "keep" ? src.width / src.height : w / h;
        const VW = 264, VH = Math.max(90, Math.round(VW / aspect));
        // Big enough to cover the frame, so there is never an empty edge.
        const cover = Math.max(VW / src.width, VH / src.height);
        let zoom = 1, ox = 0, oy = 0;

        const asked = modal(
          "Position your image",
          '<p class="muted" style="margin:0 0 10px;font-size:.86rem">Drag to move it. ' +
            "Pinch, or use the slider, to zoom.</p>" +
            '<div class="cropwrap" style="width:' + VW + "px;height:" + VH + 'px">' +
              '<canvas data-crop width="' + VW + '" height="' + VH + '"></canvas>' +
            "</div>" +
            '<input data-cropzoom type="range" min="100" max="400" value="100" ' +
              'aria-label="Zoom" style="width:100%;margin-top:10px">',
          "Use it",
        );

        // Grabbed synchronously, before the await — the same reason the emoji
        // field is: once the promise resolves the dialog is already gone.
        const cv = document.querySelector(".mdl [data-crop]");
        const range = document.querySelector(".mdl [data-cropzoom]");

        function clamp() {
          // Never past the edges: at any zoom the picture has to cover the
          // frame, or the saved image has a transparent band down one side.
          const dw = src.width * cover * zoom, dh = src.height * cover * zoom;
          const mx = Math.max(0, (dw - VW) / 2), my = Math.max(0, (dh - VH) / 2);
          ox = Math.max(-mx, Math.min(mx, ox));
          oy = Math.max(-my, Math.min(my, oy));
        }
        function paint() {
          if (!cv || !cv.getContext) return;
          clamp();
          const x = cv.getContext("2d");
          const dw = src.width * cover * zoom, dh = src.height * cover * zoom;
          x.clearRect(0, 0, VW, VH);
          x.drawImage(src, (VW - dw) / 2 + ox, (VH - dh) / 2 + oy, dw, dh);
        }
        paint();

        // One map for every finger down. Two of them is a pinch; one is a drag.
        const touches = new Map();
        let startGap = 0, startZoom = 1;
        const gap = () => {
          const p = [...touches.values()];
          return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        };
        if (cv) {
          cv.addEventListener("pointerdown", (e) => {
            touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (cv.setPointerCapture) cv.setPointerCapture(e.pointerId);
            if (touches.size === 2) { startGap = gap(); startZoom = zoom; }
          });
          cv.addEventListener("pointermove", (e) => {
            const was = touches.get(e.pointerId);
            if (!was) return;
            if (e.preventDefault) e.preventDefault();
            touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (touches.size >= 2) {
              const now = gap();
              if (startGap > 0) {
                zoom = Math.max(1, Math.min(4, startZoom * (now / startGap)));
                if (range) range.value = String(Math.round(zoom * 100));
              }
            } else {
              ox += e.clientX - was.x;
              oy += e.clientY - was.y;
            }
            paint();
          });
          const up = (e) => {
            touches.delete(e.pointerId);
            if (touches.size < 2) startGap = 0;
          };
          cv.addEventListener("pointerup", up);
          cv.addEventListener("pointercancel", up);
        }
        if (range) {
          range.oninput = () => { zoom = Math.max(1, Number(range.value) / 100); paint(); };
        }

        return asked.then((ok) => {
          if (!ok) return null;
          // Nothing moved: hand back the original rather than losing a
          // generation of resolution to a canvas that would only re-draw it.
          if (zoom === 1 && ox === 0 && oy === 0) return src;
          clamp();
          // Rendered at the TARGET size, not the preview's, so zooming in does
          // not cost the resolution the frame is capable of.
          const outW = fit === "keep" ? Math.min(w, Math.round(h * aspect)) : w;
          const outH = fit === "keep" ? Math.round(outW / aspect) : h;
          const out = document.createElement("canvas");
          out.width = outW; out.height = outH;
          const k = outW / VW;
          const dw = src.width * cover * zoom * k, dh = src.height * cover * zoom * k;
          out.getContext("2d").drawImage(
            src, (outW - dw) / 2 + ox * k, (outH - dh) / 2 + oy * k, dw, dh);
          return out;
        });
      }

      function wireUpload(inputSel, kind, w, h, onDone, fit, crop) {
        q(inputSel).onchange = () => {
          const file = q(inputSel).files[0]; if (!file) return;
          const img = new Image();
          img.onload = async () => {
            URL.revokeObjectURL(img.src);
            // An SVG with no width/height attributes decodes at zero size in
            // Safari. Every scale below then collapses to a 1×1 transparent
            // pixel, which uploads perfectly and draws as nothing — an upload
            // that "did not work" with no error anywhere to say why.
            if (!img.width || !img.height) {
              toast("That image has no size set. If it's an SVG, open it in your design tool and export it as a PNG.");
              return;
            }
            // Lift the backdrop and trim the padding BEFORE scaling, so the
            // artwork is measured at full resolution and the size cap is spent
            // on the artwork rather than on the empty margin around it.
            const lifted = liftBackdrop(img);
            // The one thing the owner gets to decide about a picture. Only for
            // the ones worth positioning: the stamp shape is a silhouette we
            // trim and refill, so there is nothing to place inside it.
            const src = crop === false ? lifted : await cropDialog(lifted, w, h, fit);
            // Cancelled. Nothing is staged and nothing drawn — and the input is
            // cleared so choosing the SAME file again still fires a change.
            if (!src) { q(inputSel).value = ""; return; }
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext.bind(canvas);
            if (fit === "keep") {
              // Keep the image's OWN shape and only cap the size. The logo needs
              // this: padding a square mark into a wide frame made the wallets
              // scale that whole frame down into their logo slot, leaving the
              // mark itself a fraction of the space it should have had. No
              // different upload could fix it, which is what made it feel like
              // there was a spec nobody had been told.
              const s = Math.min(w / src.width, h / src.height, 1);
              const dw = Math.max(1, Math.round(src.width * s));
              const dh = Math.max(1, Math.round(src.height * s));
              canvas.width = dw; canvas.height = dh;
              ctx("2d").drawImage(src, 0, 0, dw, dh);
            } else {
              canvas.width = w; canvas.height = h;
              const s = fit === "contain"
                ? Math.min(w / src.width, h / src.height)
                : Math.max(w / src.width, h / src.height);
              ctx("2d").drawImage(src, (w - src.width * s) / 2, (h - src.height * s) / 2, src.width * s, src.height * s);
            }
            const dataUrl = canvas.toDataURL("image/png");
            if (!kind) { onDone(dataUrl); return; } // caller stages (e.g. the stamp shape)
            // Staged, not posted. The preview below is already showing it — the
            // card and its customers only find out on Save.
            stage(kind, async () => {
              const { body } = await api(P("/" + kind), {
                method: "POST", body: JSON.stringify({ png: dataUrl.split(",")[1] }),
              });
              if (!body.ok) { toast(body.error || "Upload failed"); return false; }
              return true;
            });
            await onDone(dataUrl);
            toast(ART_LABEL[kind] + " ready — press " + (env.saveLabel || "Save"));
          };
          img.onerror = () => toast("Couldn't read that image");
          img.src = URL.createObjectURL(file);
        };
      }
      // Capped at Apple's 160×50pt logo band at @3x, but NOT padded to it: the
      // image keeps its own shape, so a square mark stays square and fills the
      // wallet's logo slot, and a wide wordmark stays wide. Whichever they have
      // is the right shape to upload.
      wireUpload("[data-logo]", "logo", 1280, 400, (url) => {
        const im = q("[data-pv-logo]");
        im.src = url; im.style.display = ""; c.logoVersion = 1; freshLogo = url;
        q("[data-a=rmlogo]").disabled = false;
        lastLogoUrl = url;
        // Straight away, not only from the probe below: the button now has to
        // say "Replace logo", and that is true the moment the upload lands. The
        // probe can fail — a decode is not guaranteed — and the label must not
        // depend on it.
        updateMark();
        // Re-measure: whether Android needs a square version is a fact about
        // THIS image, so a new upload can turn that row on or off.
        const probe = new Image();
        probe.onload = () => {
          if (probe.naturalHeight > 0) logoRatio = probe.naturalWidth / probe.naturalHeight;
          updateMark();
        };
        probe.src = url;
        // One awaited sequence: read the palette, apply it, then check the logo
        // is still readable on the colour that came out of it.
        void applyLogoColours(url);
      }, "keep");
      // Removing the logo hides it here too, because the pass drops the image
      // entirely with no upload and shows the shop name alone — the preview has
      // to agree, or the owner is designing against something they won't get.
      q("[data-a=rmlogo]").onclick = async () => {
        // Same hard delete as the stamp shape, same lack of an undo.
        const ok = await modal(
          "Delete your logo?",
          "<p>It comes off the card, the sign-up page and your poster straight away, and cannot be undone — " +
            "you would need the original file to put it back.</p>",
          "Delete it",
        );
        if (!ok) return;
        const { body } = await api(P("/logo"), { method: "DELETE" });
        if (!body.ok) return toast(body.error || "Couldn't remove logo");
        c.logoVersion = 0;
        q("[data-pv-logo]").style.display = "none";
        q("[data-a=rmlogo]").disabled = true;
        lastLogoUrl = ""; freshLogo = "";
        logoRatio = 0;
        updateMark();
        toast("Logo removed");
      };

      // The square version, for Google's small near-square logo slot. Padded to
      // a square on purpose — the opposite of the logo above — because that slot
      // is the shape being fitted, and letterboxing beats a cropped mark.
      // Nothing on this page previews it: the preview is the Apple card, which
      // never uses it, and a preview that showed it would be a lie.
      wireUpload("[data-mark]", "mark", 660, 660, (url) => {
        c.markVersion = 1; freshMark = url;
        q("[data-a=rmmark]").disabled = false;
        // The row stays, and changes what it says: with one uploaded it is no
        // longer a warning, it is where you go to replace or remove it. Removing
        // it silently would leave no way back.
        updateMark();
        renderPreview();
      }, "contain");
      q("[data-a=rmmark]").onclick = async () => {
        const ok = await modal(
          "Delete your square logo?",
          "<p>Android goes back to cropping your main logo. This happens straight away and cannot be undone.</p>",
          "Delete it",
        );
        if (!ok) return;
        const { body } = await api(P("/mark"), { method: "DELETE" });
        if (!body.ok) return toast(body.error || "Couldn't remove it");
        c.markVersion = 0; freshMark = "";
        q("[data-a=rmmark]").disabled = true;
        updateMark();
        renderPreview();
        toast("Square logo removed — Android goes back to your main logo");
      };

      // Staged like the upload above it, not saved on the tick. It changes what
      // the card LOOKS like, and everything that does now waits for one button.
      // The switch and the column mean OPPOSITE things, and this is where that
      // gets converted — once, in one place.
      //
      // logo_has_name is "my logo already says the shop's name", so the pass
      // DROPS its logoText when it is true. The switch asks the owner-facing
      // question, "show company name next to logo", which is the same fact
      // inverted. The markup already flips it; this handler did not, so ticking
      // the box turned the name OFF and untitcking turned it on.
      q("[data-lname]").onchange = () => {
        const showName = q("[data-lname]").checked;
        const hasName = !showName;
        stage("logoHasName", async () => {
          const { body } = await api(P(), {
            method: "POST", body: JSON.stringify({ logoHasName: hasName }),
          });
          if (!body.ok) {
            // Put the box back where the server left it: a control showing a
            // state that was rejected is worse than one that visibly did not take.
            q("[data-lname]").checked = !showName;
            renderPreview();
            toast(body.error || "Couldn't save that");
            return false;
          }
          c.logoHasName = hasName;
          return true;
        });
        renderPreview();
      };


      // ---- The band behind the stamps ----
      //
      // Stored in card_banners, the same row the generated flat band uses —
      // cards.band_texture says which of the two is in there. That column has
      // existed since the ten procedural textures were removed and has been
      // written by nothing since; this is what it is for.
      //
      // 1125x369 to match the strip exactly, so compositing is a straight
      // draw with no resampling, and "cover" because a band is 3:1 and almost
      // nothing anybody uploads is.
      wireUpload("[data-band]", "banner", 1125, 369, async (url) => {
        await loadBanner(url);
        bandIsImage = true;
        c.bandTexture = "image";
        c.bannerVersion = Date.now(); freshBand = url;
        q("[data-a=rmband]").disabled = false;
        updateBandBtn();
        // The texture flag has to reach the server WITH the image, or the next
        // colour save regenerates the flat band straight over the upload. Staged
        // beside it so the two land together or not at all.
        stage("bandTexture", async () => {
          const { body } = await api(P(), {
            method: "POST", body: JSON.stringify({ bandTexture: "image" }),
          });
          if (!body.ok) { toast(body.error || "Couldn't save that"); return false; }
          c.bandTexture = "image";
          return true;
        });
        // Every stored strip still has the old band baked into it.
        await applyStamps(stampStyle || "dot", true);
        renderPreview();
      }, "cover");

      q("[data-a=rmband]").onclick = async () => {
        const ok = await modal(
          "Remove your band artwork?",
          "<p>The band goes back to your Band colour. The image is deleted and cannot be undone — you would need the original file to put it back.</p>",
          "Remove it",
        );
        if (!ok) return;
        const { body } = await api(P("/banner"), { method: "DELETE" });
        if (!body.ok) return toast(body.error || "Couldn't remove it");
        await loadBanner("");
        bandIsImage = false;
        c.bandTexture = "flat";
        q("[data-a=rmband]").disabled = true;
        updateBandBtn();
        await save({ bandTexture: "flat" }, "", true);
        // Put a flat band back in card_banners before anything reads it: it is
        // Google's hero image whenever a card has no strips, and deleting the
        // upload without regenerating would leave that pointing at nothing.
        await saveBanner(bandPng(1125, 369), true);
        await applyStamps(stampStyle || "dot", true, true);
        renderPreview();
        toast("Back to your Band colour");
      };

      /** Upload vs Replace, the same tell the logo rows carry. */
      function updateBandBtn() {
        const b = q("[data-bandbtn]");
        if (b) b.textContent = bandIsImage ? "Replace image" : "Upload image";
        paintArt();
      }
      updateBandBtn();

      // ---- Colours out of the logo ----
      //
      // Applied on upload, not offered. It used to paint five swatches and a
      // button asking permission, on the reasoning that an upload which
      // silently repainted the card would be worse than no feature at all. In
      // practice almost nobody pressed it, and the alternative was matching
      // their own brand by eye in five colour pickers — so the card that came
      // out of a logo upload looked nothing like the shop.
      //
      // It overwrites whatever was there, every time, and there is no undo in
      // this panel. That is the trade, and the ⓘ on the Logo label says so.
      let found = null;

      /** Read the palette out of an image. Resolves once found is set. */
      function readPalette(dataUrl) {
        return new Promise((resolve) => {
          const im = new Image();
          im.onload = () => {
            // 64px is plenty to count colours by and keeps this instant on a phone.
            const k = Math.min(64 / im.naturalWidth, 64 / im.naturalHeight, 1);
            const cv = document.createElement("canvas");
            cv.width = Math.max(1, Math.round(im.naturalWidth * k));
            cv.height = Math.max(1, Math.round(im.naturalHeight * k));
            const x = cv.getContext("2d", { willReadFrequently: true });
            x.drawImage(im, 0, 0, cv.width, cv.height);
            let data;
            try { data = x.getImageData(0, 0, cv.width, cv.height).data; }
            catch (e) { found = null; return resolve(); } // tainted canvas
            found = paletteFrom(data);
            // Still needed with the swatches gone: every colour in the logo is
            // offered as a chip in every colour row.
            drawPalette();
            resolve();
          };
          im.onerror = () => { found = null; resolve(); };
          im.src = dataUrl;
        });
      }

      /**
       * Take the logo's colours, in ONE save.
       *
       * Sequenced deliberately. readPalette and ensureLogoReadable are both
       * async, and ensureLogoReadable snapshots bg AFTER its own decode — run
       * unawaited they race, and two writes to the same columns land in
       * undefined order. Awaiting also means one toast rather than four, and one
       * strip re-bake rather than three.
       */
      async function applyLogoColours(dataUrl) {
        await readPalette(dataUrl);
        if (!found) {
          // Nothing usable: leave the card exactly as it was and say so, rather
          // than a paragraph on screen explaining a thing that did not happen.
          return toast("No clear colours in that logo — set them yourself below");
        }
        f("bg").value = found.bg; f("fg").value = found.fg;
        f("label").value = found.label; f("accent").value = found.accent;
        f("bandColor").value = found.band;
        renderPreview(); drawPalette();
        // Into the pickers only. Save reads the pickers and regenerates the band
        // from them, so nothing here has to write — and an owner who uploads a
        // logo, dislikes the colours it produced and closes the tab leaves the
        // live card exactly as they found it.
        //
        // The extracted card colour is sampled FROM the logo, so it can land on
        // top of the logo's own ink. This corrects that, and must come last or
        // it fixes a colour that is about to be overwritten.
        await ensureLogoReadable(dataUrl, true);
        toast("Colours taken from your logo — press " + (env.saveLabel || "Save") + " to keep them");
      }

      /**
       * Read the palette out of the logo that is ALREADY saved, on open.
       *
       * The palette used to be set only by an upload, so it was null on every
       * ordinary visit — and paletteChips seeds itself from it. Change one role
       * to white, reload, and the colour that came out of the logo was simply
       * gone from the chips: the only way back was to upload the logo again.
       * Reported as "it removed the neon I had and that option should not
       * disappear", which was exactly right.
       *
       * Reads only. applyLogoColours stays the one thing that ever WRITES a
       * colour, so opening the designer can never repaint anybody's card.
       * Same-origin art, so getImageData is not tainted; a failure leaves it
       * null and the chips fall back to what they offered before.
       */
      if (c.logoVersion) {
        void readPalette(env.artUrl("logo", c.logoVersion));
      }

      // ---- Swap any colour into any role ----
      // Matching a shade by hand in a colour picker is the fiddliest thing on
      // this page, and it is never what the owner wants: they want the black
      // that is already in their logo, on the card instead of behind the stamps.
      // So every colour in play is offered for every role. The neutrals are here
      // because "make the card black" is the most common ask of all and no logo
      // reliably contains a usable one.
      const NEUTRALS = ["#111111", "#2b2b2b", "#6e6e68", "#f4f1ea", "#ffffff"];
      const ROLES = [
        { k: "bg", name: "Card" }, { k: "bandColor", name: "Band" },
        { k: "accent", name: "Stamps" }, { k: "label", name: "Labels" },
        { k: "fg", name: "Text" },
      ];
      // Nothing open to begin with: the card is a card until you tap a part of
      // it. Which part is open is the ONE piece of state this section has.
      let activeRole = null;
      function paletteChips() {
        const seen = {}, out = [];
        const add = (hex) => {
          const h = String(hex || "").toLowerCase();
          if (!/^#[0-9a-f]{6}$/.test(h) || seen[h]) return;
          seen[h] = 1; out.push(h);
        };
        if (found) [found.bg, found.band, found.accent, found.label].forEach(add);
        ROLES.forEach((r) => add(f(r.k).value));
        NEUTRALS.forEach(add);
        return out;
      }
      /**
       * Put a colour on a role and redraw everything that shows it — WITHOUT
       * rebuilding the list. The open row holds the live <input type="color">,
       * and dragging in the OS picker fires input continuously; re-rendering
       * mid-drag would move that input out from under the picker.
       */
      function applyRole(role, hex) {
        f(role).value = hex;
        // Text is the one thing never chosen by eye — swapping the card colour
        // would otherwise quietly leave unreadable text behind it.
        if (role === "bg") f("fg").value = pickTextColor(hex);
        renderPreview(); refreshSwatches();
      }
      // ---- Tap a swatch, change that colour ----
      //
      // The five named rows and the Customize button that revealed them are
      // gone. They asked an owner to name the part they meant — "Band" — before
      // they could point at it, and the strip of colours was sitting right there
      // saying all five names already. So the strip IS the control now: it was
      // a read-out and a list of the parts at the same time, which made it the
      // obvious thing to press and the one place a colour can be changed.
      //
      // ONE control for one job, deliberately. This section previously carried a
      // chip row AND five colour squares doing the same thing, and the note in
      // its old CSS is the reason to keep it to one: two controls for one job
      // read as two different jobs.
      const park = q("[data-park]");
      const palHost = q("[data-palette]");

      /**
       * What the logo produced, named — and the way in to changing it.
       *
       * The colours are DERIVED, so this began as a read-out. A bare row of
       * colours cannot say which one is the band, and the band is the one people
       * go looking for, so each is printed with its name under it: this designer
       * is used on a phone, where a title attribute is unreachable. Buttons
       * rather than spans, so the strip answers a keyboard as well as a thumb.
       */
      function drawSwatches() {
        const grid = q("[data-swatches]");
        if (!grid) return;
        grid.innerHTML = "";
        for (const r of ROLES) {
          const sw = document.createElement("button");
          sw.type = "button";
          sw.className = "swbox" + (r.k === activeRole ? " on" : "");
          // A real attribute, not dataset: identical in a browser, and this way
          // it is addressable by selector from CSS and from the tests.
          sw.setAttribute("data-role", r.k);
          sw.setAttribute("aria-label", r.name);
          sw.setAttribute("aria-expanded", r.k === activeRole ? "true" : "false");
          const chip = document.createElement("span");
          chip.className = "swchip";
          chip.style.background = f(r.k).value;
          const nm = document.createElement("span");
          nm.className = "swname";
          nm.textContent = r.name;
          // The value, printed. On a strip the colours sat edge to edge with
          // their names on a second line, so telling which name belonged to
          // which colour meant counting along — and the hex was nowhere.
          const val = document.createElement("span");
          val.className = "swval";
          val.textContent = f(r.k).value;
          sw.appendChild(chip);
          sw.appendChild(nm);
          sw.appendChild(val);
          // Tapping the open one shuts it, so a box is a toggle rather than
          // something that can only ever be opened.
          sw.onclick = () => {
            activeRole = activeRole === r.k ? null : r.k;
            drawPalette();
          };
          grid.appendChild(sw);
        }
      }

      /** The named strip, and the selected chip in whatever palette is open. */
      function refreshSwatches() {
        drawSwatches();
        palHost.querySelectorAll(".chip").forEach((ch) => {
          ch.classList.toggle("on", Boolean(activeRole) && ch.dataset.hex === f(activeRole).value.toLowerCase());
        });
      }

      /** Outline the part being edited, so the tap has an answer on the card. */
      /**
       * Draw the palette for whichever part is open, or close it.
       *
       * Parks all five native pickers BEFORE wiping the host, exactly as the old
       * row list had to: the open palette physically holds one of them, and every
       * colour read in this panel goes through f("bg") and friends. Wipe the host
       * with a picker still inside and those reads point at a node nobody can
       * reach or open.
       */
      function drawPalette() {
        for (const r of ROLES) park.appendChild(f(r.k));
        palHost.innerHTML = "";
        palHost.hidden = !activeRole;
        if (!activeRole) { drawSwatches(); return; }

        const role = ROLES.find((r) => r.k === activeRole);
        const head = document.createElement("div");
        head.className = "crpal-h";
        const nm = document.createElement("span");
        nm.className = "crpal-n";
        nm.textContent = role ? role.name : "";
        const close = document.createElement("button");
        close.type = "button";
        close.className = "crpal-x";
        close.setAttribute("aria-label", "Close");
        close.textContent = "✕";
        close.onclick = () => { activeRole = null; drawPalette(); };
        head.appendChild(nm);
        head.appendChild(close);
        palHost.appendChild(head);

        const chips = document.createElement("div");
        chips.className = "chiprow";
        for (const hex of paletteChips()) {
          const ch = document.createElement("button");
          ch.type = "button";
          ch.className = "chip" + (hex === f(activeRole).value.toLowerCase() ? " on" : "");
          ch.style.background = hex; ch.title = hex; ch.dataset.hex = hex;
          ch.onclick = () => applyRole(activeRole, hex);
          chips.appendChild(ch);
        }
        // The real colour input, moved in — for a shade in none of the above.
        const custom = document.createElement("span");
        custom.className = "chipcustom";
        custom.appendChild(f(activeRole));
        custom.appendChild(document.createTextNode("Custom…"));
        chips.appendChild(custom);
        palHost.appendChild(chips);
        drawSwatches();
      }

      // The preview stays a preview. It briefly carried hit regions so the card
      // itself could be tapped, which was a misreading of the ask: the strip of
      // colours below already names all five parts and was the thing meant. Two
      // ways to change one colour is the "chip row plus five squares" mistake
      // this section has already made once.

      // The OS picker writes straight through. No rebuild here on purpose —
      // this fires on every frame of a drag, and rebuilding would move the very
      // input the picker is attached to.
      for (const r of ROLES) {
        f(r.k).oninput = () => applyRole(r.k, f(r.k).value.toLowerCase());
      }
      drawPalette();

      // The band is stored exactly where the uploaded banner photo used to be, so
      // nothing downstream changes: Apple composites it behind the stamps, Google
      // uses it as the hero image. Photos are gone — this is always generated.
      async function saveBanner(dataUrl, quiet) {
        const { body } = await api(P("/banner"), { method: "POST", body: JSON.stringify({ png: dataUrl.split(",")[1] }) });
        if (!body.ok) return toast(body.error || "Band failed");
        // Re-bake the strips: the band is the backdrop INSIDE each strip PNG,
        // so a new band that isn't re-rendered would never reach the pass.
        await loadBanner(dataUrl);
        await applyStamps(stampStyle || "dot", true, true);
        if (!quiet) toast("Band saved ✓");
      }

      /** The band as a data URL — the copy the wallets fetch. */
      function drawBanner(c1, w, h) {
        const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
        paintBand(cv.getContext("2d"), c1, w, h);
        return cv.toDataURL("image/png");
      }
      /**
       * The same band painted straight onto a context. drawStampStrip needs it
       * synchronously — going via an Image and a data URL would not have decoded
       * by the time the stamps are drawn on top, so the band would simply be
       * missing from the strip.
       */
      /**
       * The backdrop the stamps are drawn onto: the owner's artwork if they
       * uploaded any, otherwise the Band colour.
       *
       * The image half is what the bannerImg/bannerReady loader above has always
       * been for. It kept decoding and nothing drew it, because ten procedural
       * textures were removed from here and the flat fill was all that was left.
       * An uploaded image is a different proposition from those: a merchant who
       * brings their own artwork has decided it is worth the stamps sitting on
       * it, which is not a decision a built-in "grain" option could make for
       * them.
       *
       * COVER, not stretch. A band is 3:1 and almost nothing anybody uploads is,
       * so fitting it would letterbox the ends in a colour that is not on the
       * card. Cover crops instead, centred, which is what every other art path
       * in this panel does.
       */
      function paintBand(x, c1, w, h) {
        x.fillStyle = c1;
        x.fillRect(0, 0, w, h);
        if (!bannerReady || !bannerImg.naturalWidth) return;
        const k = Math.max(w / bannerImg.naturalWidth, h / bannerImg.naturalHeight);
        const iw = bannerImg.naturalWidth * k, ih = bannerImg.naturalHeight * k;
        x.drawImage(bannerImg, (w - iw) / 2, (h - ih) / 2, iw, ih);
      }
      // ---- The band: the strip the stamps sit on, in one flat colour ----
      //
      // There were ten textures here — gradient, glow, waves, chevron, grain and
      // the rest. They went because they were ten ways to answer a question the
      // owner had not asked: the stamps are drawn ON TOP of this, so every one
      // of them was tuned to be barely visible, and a control that can only make
      // the card slightly worse is not a choice. The band is now the Band colour
      // in the Colours list, and nothing else.
      //
      // It is still rendered and stored as the banner PNG: Apple uses it as the
      // strip backdrop, Google as the class hero image, and it is painted into
      // every stamp strip. Only a browser can draw it, so the PNG stays.

      // Renders the full 0..target set and STAGES it, unless the commit flag
      // says otherwise. The strips are drawn from whatever the panel is showing —
      // the band and the stamp shape as previewed — so a staged set is always
      // the set the owner is looking at, whether or not those two have been
      // saved yet. The quiet flag is for the piggy-back call from save(), which
      // toasts its own.
      async function applyStamps(style, quiet, commit) {
        stampStyle = style;
        // Onto the card object too, not just the local. The dashboard builds
        // this panel from a card it loaded ONCE at page load and keeps reusing
        // — so leaving c.stampStyle stale meant switching tabs and coming back
        // rebuilt the panel believing the card was on dots, and the next save
        // wrote dots over the owner's grid and set stamp_style back. The panel
        // that reads this object is the one that has to be told.
        c.stampStyle = style;
        // The banner is baked into every strip, so it must be decoded first or
        // the whole set renders on a bare colour. The stamp shape for the same
        // reason: re-render before it has loaded and the owner's icon is
        // silently replaced by circles, in storage, for every count at once.
        await bannerReadyPromise;
        await stampIconReadyPromise;
        // The top rung IS the target on a milestones card — see
        // cardFieldsFromBody, which writes the same number server-side. Reading
        // the stamps-to-reward box instead would render a set of grids for a
        // number this card does not use.
        const ladderTop = kindNow() === "milestones" && ladderClean().length
          ? ladderClean()[ladderClean().length - 1].at
          : 0;
        const target = ladderTop || Math.max(1, Math.min(20, Number(f("stampsTarget").value) || 10));
        // One set per target still in play, not just the current one. A pass keeps
        // the target it was issued with, so an owner going 8 → 6 still has
        // customers asking for an 8-slot grid — and before this they got a 404 and
        // lost their stamps picture entirely. Usually one set; two until everyone
        // on the old ruleset has earned their next reward.
        const targets = [...new Set([target, ...(c.targetsInUse || [])])].filter((t) => t >= 1 && t <= 20);
        // Render the set, and keep every strip inside the server's cap.
        //
        // validateArtPng rejects anything over 512KB and the route fails the
        // WHOLE save, so one heavy strip loses the lot. A flat band is ~40KB and
        // nowhere near it; uploaded artwork composited at 1125x369 can clear it
        // on its own. The strips also travel in ONE body (express.json 8mb) and
        // setStampStrips replaces the set atomically — CLAUDE.md is explicit
        // that the all-at-once replace is what prunes a target nobody holds any
        // more — so chunking is not available as an escape.
        //
        // So: render, weigh, and if it is too heavy render the set again at @2x.
        // A shop with artwork trades some resolution for a card that saves; a
        // flat shop keeps @3x. The GRID is what gets smaller, which is the wrong
        // half to lose — but a strip that will not upload is worse than a strip
        // that is 750px wide, and 750x246 is what every card shipped with until
        // two commits ago.
        const CAP = 512 * 1024;
        // base64 is 4 bytes per 3, and the cap is applied to the DECODED bytes.
        const decoded = (b64) => Math.floor(b64.length * 3 / 4);
        // A membership card stores exactly ONE band, keyed (0, 0) — see
        // stripKey() in src/passModel.ts, which is what every reader asks with.
        // Rendering a set per count would mean up to twenty-one copies of the
        // same picture, and its visit tally has no ceiling to render up to
        // anyway.
        const render = (w, h) => {
          // Points for the same reason as membership: the balance has no
          // ceiling, so there is no finite set of counts to draw pictures for.
          if (isMember() || kindNow() === "points") {
            return [{ target: 0, filled: 0, png: drawStampStrip(0, 0, style, w, h, true).split(",")[1] }];
          }
          const out = [];
          for (const t of targets) {
            for (let n = 0; n <= t; n++) {
              out.push({ target: t, filled: n, png: drawStampStrip(n, t, style, w, h).split(",")[1] });
            }
          }
          return out;
        };
        let strips = render(1125, 369);
        if (strips.some((s) => decoded(s.png) > CAP * 0.9)) strips = render(750, 246);
        const put = async () => {
          const { body } = await api(P("/stamps"), { method: "POST", body: JSON.stringify({ style, strips }) });
          if (!body.ok) { toast(body.error || "Couldn't save stamps"); return false; }
          return true;
        };
        if (!commit) { stage("stamps", put); renderPreview(); return; }
        if (!(await put())) return;
        renderPreview();
        if (!quiet) toast("Stamp style saved ✓");
      }


      /**
       * The tab switches which preview you are looking at. Nothing else.
       *
       * It used to move the editor with it, because the editor was one section
       * per wallet. Now that the editor is Brand and Loyalty programme, there is
       * no such thing as "the Android controls" to switch to — the one thing
       * only Android needs is the square logo, and that appears next to the logo
       * it is a version of, when the logo's shape calls for it.
       */
      const surfaceSeg = q("[data-surfaces]");
      // Scoped to the preview box rather than the whole panel: hiding is a blunt
      // instrument, and searching the entire panel for data-surface is what let
      // it reach the tab buttons themselves once before.
      const pvbox = q("[data-pvbox]");
      /**
       * Which face is showing. Split from showSurface because a PREVIEW tile
       * needs this half and not the other: it has no tab strip to light up, and
       * repainting reads the editor's fields, which a preview tile no longer
       * has. One definition of "show the Android face" either way.
       */
      function showFace(name) {
        pvbox.querySelectorAll("[data-surface]").forEach((p) => { p.hidden = p.dataset.surface !== name; });
      }
      const SURFACES = [
        { k: "apple", name: "iPhone" },
        { k: "google", name: "Android" },
        { k: "notify", name: "Notification" },
      ];
      function showSurface(name) {
        const pick = SURFACES.find((x) => x.k === name) || SURFACES[0];
        if (surfaceSeg) {
          for (const b of surfaceSeg.querySelectorAll("[data-surf]")) {
            const on = b.getAttribute("data-surf") === pick.k;
            b.classList.toggle("on", on);
            b.setAttribute("aria-selected", on ? "true" : "false");
          }
        }
        showFace(pick.k);
        renderPreview();
      }
      if (surfaceSeg) {
        for (const b of surfaceSeg.querySelectorAll("[data-surf]")) {
          b.onclick = () => showSurface(b.getAttribute("data-surf"));
        }
      }
      // The panel this builds is still a detached node when this runs — its
      // caller appends the RETURN VALUE of this function, after everything in
      // it has already executed. A detached node has no layout box, so
      // moveThumb (inside showSurface) measured 0 for offsetWidth/offsetLeft
      // and seated the thumb at nothing: iPhone was the active tab but had no
      // visible highlight until a later click (which runs after attaching, and
      // measures correctly) moved it for the first time. Deferring one frame
      // guarantees the caller's appendChild has already run.
      // A preview tile has been painted already (below) and has no fields left
      // to repaint from, so it only re-seats the face.
      requestAnimationFrame(() => (env.previewOnly ? showFace("apple") : showSurface("apple")));

      /**
       * Say whether a shape is stored, and show it.
       *
       * Reads c.stampIconVersion rather than the in-memory image, so it answers
       * "what is SAVED" — which is the question that was unanswerable, and the
       * reason a safely stored upload looked lost.
       */
      function showStamp() {
        const row = q("[data-stampnow]");
        if (!row) return;
        if (!c.stampIconVersion) { row.style.display = "none"; return; }
        q("[data-stampnow-img]").src = env.artUrl("stamp-icon", c.stampIconVersion);
        row.style.display = "";
      }
      showStamp();

      // Upload your own stamp icon → check it → STORE it → re-render the grid.
      //
      // The storing step is the one that was missing. This used to pass kind
      // null, which makes wireUpload hand back the dataURL without sending it
      // anywhere, so the shape lived in one variable and the next re-render
      // replaced it with circles. It is checked here rather than by letting
      // wireUpload post for us, because "has a see-through background" has to
      // be answered before the bytes are stored, not after.
      wireUpload("[data-stampimg]", null, 256, 256, (dataUrl) => {
        const err = q("[data-stamperr]");
        const show = (m) => { err.textContent = m; err.style.display = ""; };
        const probe = new Image();
        probe.onload = async () => {
          const cv = document.createElement("canvas");
          cv.width = probe.naturalWidth; cv.height = probe.naturalHeight;
          const px = cv.getContext("2d");
          px.drawImage(probe, 0, 0);
          const data = px.getImageData(0, 0, cv.width, cv.height).data;
          let clear = 0;
          for (let i = 3; i < data.length; i += 4) if (data[i] < 24) clear++;
          // Reached only when the backdrop could not be lifted — a photo, or
          // artwork that runs to every edge. A plain white square, which is the
          // file most shops have, is handled before this and never gets here.
          if (clear < data.length / 4 * 0.02) {
            show("This one has no plain background to remove — it looks like a photo, and a stamp would come out as a filled rectangle. A simple shape or symbol on one flat colour works best.");
            return;
          }
          err.style.display = "none";
          // Staged like every other upload. The shape is checked HERE, before it
          // is accepted at all, so a file that cannot work as a stamp is refused
          // on the spot rather than at Save — what waits for the button is the
          // storing of a shape already known to be usable.
          stage("stamp-icon", async () => {
            const { body } = await api(P("/stamp-icon"), {
              method: "POST", body: JSON.stringify({ png: dataUrl.split(",")[1] }),
            });
            if (!body.ok) {
              show(body.error === "too-large"
                ? "That file is too big. A stamp is drawn about the size of a fingernail, so a small, simple shape is all it needs."
                : "Couldn't save that stamp. Check your connection and try again.");
              return false;
            }
            return true;
          });
          // Hold the new shape before re-rendering, for the same reason the
          // stored one is loaded at mount: applyStamps writes the whole grid.
          await loadStampIcon(dataUrl);
          // A stamp is staged now, and this object is what a re-mount reads —
          // the logo and the square mark beside it already do this. Leaving it
          // at 0 is what let a tab switch decide the card had no shape.
          c.stampIconVersion = Date.now();
          showStamp();
          await applyStamps("custom");
          toast("Stamp shape ready — press " + (env.saveLabel || "Save"));
        };
        probe.onerror = () => show("Couldn't read that image.");
        probe.src = dataUrl;
      }, "keep", false);
      // Back to plain dots — which is still a rendered strip, not the absence of
      // one: the grid image is the only place stamps are drawn now. The stored
      // shape goes too: leaving it behind would have the next page load quietly
      // offer to draw a stamp the owner had just removed.
      // Confirmed, because this button DELETES the uploaded shape and there is
      // no undo and no history — the art is one row, hard-deleted. It sits
      // between Upload and Emoji, reads like a third style rather than a
      // discard, and applies the instant it is pressed: an owner pressed it
      // meaning "show me the plain option" and lost artwork they had no other
      // copy of. Only asks when there is actually something to lose.
      async function backToDots() {
        if (c.stampIconVersion) {
          const ok = await modal(
            "Delete your stamp shape?",
            "<p>Your uploaded shape is deleted and the stamps go back to plain dots. " +
              "This happens straight away and cannot be undone — you would need the original file to put it back.</p>",
            "Delete it",
          );
          if (!ok) return;
        }
        q("[data-stamperr]").style.display = "none";
        await api(P("/stamp-icon"), { method: "DELETE" });
        await loadStampIcon("");
        c.stampIconVersion = 0;
        showStamp();
        await applyStamps("dot", true);
        toast("Back to plain dots");
      }

      // Two saves, disjoint field sets. Both re-render the stamp strips, because
      // a colour change (design) and a target change (rules) each alter them.
      // That re-render IS the pre-generation step: one PNG per stamp count, so a
      // customer's stamp only ever swaps which stored image the pass points at.
      // The quiet flag is for a caller stringing several of these together — the
      // logo colour path does four writes and one thing to say at the end of them.
      async function save(fields, label, quiet) {
        // A draft has nothing to save to. Everything above this point still
        // ran — the preview is live and the fields are staged — so the panel
        // behaves identically right up to the write it cannot make.
        if (env.draft) {
          Object.assign(c, fields);
          toast("Saving a new card arrives with the Create flow — nothing was written.");
          return;
        }
        const { body } = await api(P(), { method: "POST", body: JSON.stringify(fields) });
        if (!body.ok) return toast(body.error || "Save failed");
        Object.assign(c, fields);
        // Everything the owner staged goes out with the fields — this is the
        // press they were waiting for. A failure leaves the rest staged and says
        // so, rather than reporting a save that only half happened.
        if (!(await flushPending())) return;
        // Always regenerate, even on plain dots: the strip image is now the only
        // place stamps are drawn, so a card with no strips would show nothing.
        await applyStamps(stampStyle || "dot", true, true);
        if (!quiet) toast(label + " saved ✓");
      }

      // How many people this actually reaches. Read once when the panel opens, so
      // both confirmations can name a real number rather than talk in the
      // abstract about "your customers".
      // A caller with no count to offer leaves customersPath null, and the
      // confirmations below drop to their "no customers" wording rather than
      // inventing a number.
      let liveCustomers = 0;
      if (env.customersPath) (async () => {
        const { body } = await api(env.customersPath);
        liveCustomers = (body.counts || {}).active || 0;
      })();
      const them = () => liveCustomers === 1 ? "customer" : "customers";

      /**
       * The look: five colours plus the band, whose colour is baked into a
       * stored PNG — so saving the field alone would leave the old band on the
       * card and the new one only in the picker.
       */
      async function saveLook() {
        // No shopName here. The field sits above the fold now, next to Save
        // rules — leaving its save on a button inside a collapsed section is how
        // you get an owner who renamed their shop and lost it.
        await save({
          bg: f("bg").value, fg: f("fg").value, label: f("label").value, accent: f("accent").value,
          bandColor: f("bandColor").value,
        }, "Design");
        // Only while the band IS the flat colour. card_banners holds either the
        // generated band or the owner's artwork, and regenerating unconditionally
        // would paint a flat rectangle over an upload the first time somebody
        // touched a colour picker — silently, with no undo and no copy of the
        // file. band_texture is what tells the two apart.
        if (!bandIsImage) await saveBanner(bandPng(1125, 369));
      }

      /**
       * One save, and a confirmation that carries both blast radii.
       *
       * There were two buttons because the look and the rules reach different
       * people, and that is still true — but it made the merchant sort their own
       * change into the right half before they could keep it, and the look one
       * sat inside a collapsed section where it could be missed entirely. So the
       * distinction moves from the buttons into the sentence in front of the one
       * button, which is the moment it actually matters:
       *
       *   the look  → everyone holding a card, right now
       *   the rules → new cards, and existing ones when they next earn a reward
       *   the name  → the one rules-side change that reaches a wallet today
       *
       * They are two ROWS now, not two sentences. Run together in a paragraph,
       * "reaches all 5 customers" and "their stamps and reward are untouched"
       * landed one after the other about the same five people and read as a
       * contradiction — it was reported as one. Same two facts, labelled.
       */
      q("[data-a=save]").onclick = async () => {
        const renamed = f("shopName").value.trim() !== (c.shopName || "").trim();
        const ok = await modal(
          env.showDetails ? "Save these changes?" : "Save this card?",
          '<dl class="mdlblast">' +
          // The look half is true on every path — the console sets no rules, but
          // it very much sets colours. "have taken a card", NOT "already hold
          // one": this count is ACTIVE_PASS_SQL, which deliberately keeps
          // counting somebody after they delete the card so that churn cannot
          // erase its own evidence. Some of these people no longer hold
          // anything, and the sentence must not claim otherwise.
            "<dt>Design</dt><dd>Reaches" +
            (liveCustomers
              ? " all <strong>" + liveCustomers + "</strong> " + them() + " who have taken a card"
              : " everyone who takes a card") +
            // This used to promise the design landed whenever the phone next
            // checked in, which was true only while a design save touched no
            // pass row and the wallet was therefore told nothing had changed.
            // touchPassesForCard fixed that, so it arrives in seconds — and the
            // stale wording undersold it badly enough to be reported as "the
            // message says later but it updates instantly".
            ", usually within seconds." +
            info("Android updates in place. An iPhone is sent a silent nudge and fetches the new card — seconds, unless the phone is off or offline, in which case it picks it up as soon as it is back. Nobody gets a notification either way.") +
            "</dd>" +
          // With the terms hidden the only other thing this button can change is
          // the name, so promising anything about rules would be a lie.
          (!env.showDetails
            ? "<dt>Reward<br>&amp; stamps</dt><dd>Not touched — only the shop sets those.</dd>"
            : liveCustomers
            ? "<dt>Reward<br>&amp; stamps</dt><dd>Unchanged for those <strong>" + liveCustomers +
              "</strong>. They keep what they were promised until their next reward, then move onto " +
              "the new rules. New customers get them today.</dd>"
            : "<dt>Reward<br>&amp; stamps</dt><dd>Apply to every card from here on.</dd>") +
          (renamed && liveCustomers
            ? "<dt>Shop name</dt><dd>The new name <strong>does</strong> reach cards already in a wallet. " +
              "Your old sign-up links keep working.</dd>"
            : "") +
          "</dl>",
          "Save changes",
        );
        if (!ok) return;
        // In the order the card is built: the look first, because it re-renders
        // the band PNG that the rest of the card is composited over.
        await saveLook();
        await save({
          shopName: f("shopName").value,
          // The card's own name follows the shop's. It used to be a second field
          // nobody could tell apart from the first, and the only place it shows
          // is the programme name on an Android card — which is the shop.
          name: f("shopName").value,
          kind: kindNow(),
          benefits: f("benefits") ? f("benefits").value : "",
          memberLabel: f("memberLabel") ? f("memberLabel").value : "",
          milestones: ladderClean(),
          pointPresets: f("pointPresets") ? f("pointPresets").value : "",
          reward: f("reward").value,
          stampsTarget: Number(f("stampsTarget").value),
          stampsStart: Number(f("stampsStart").value),
          averageSpend: Number(f("averageSpend").value) || 0,
          signupMessage: f("signupMessage").value,
        }, "Card");
        env.onRulesSaved();
      };

      /**
       * previewOnly: keep the card face, throw the editor away.
       *
       * The Manage carousel needs the REAL Apple and Android faces, and this
       * panel is the one thing that knows how to draw them — it is shared
       * verbatim with the admin console so the two cannot drift, and a second
       * simpler card face built beside it would be exactly that drift.
       *
       * Trimmed at the END, after everything above has wired itself, rather
       * than by not rendering the editor in the first place: the wiring reaches
       * for its own fields by name all the way down, and a half-built panel
       * would throw on the first one that is missing. The discarded nodes take
       * their listeners with them. The only mount-time REQUEST is the customer
       * count, and a caller in this mode passes customersPath null.
       *
       * The surface seg goes too — the carousel has its own control above the
       * card — but showSurface stays and is handed out, so "show the Android
       * face" has one implementation rather than a copy that toggles hidden.
       */
      if (env.previewOnly) {
        // Paint BEFORE the trim, while the fields renderPreview reads are still
        // here. Nothing can change a preview tile afterwards, so once is enough
        // and setSurface below never needs to repaint.
        showSurface("apple");
        const box = q("[data-pvbox]");
        // children + remove(), not lastChild + removeChild: those two are the
        // pair the test harness does not implement, so a trim written with them
        // does nothing under test and everything in a browser — which is a test
        // that reports success about code it never ran.
        Array.prototype.slice.call(div.children).forEach((el) => { if (el !== box) el.remove(); });
        // display, not the hidden ATTRIBUTE: .seg sets display:flex, and an
        // element's own display beats [hidden] every time. The strip stayed on
        // screen above every tile in the carousel — three tab strips saying
        // iPhone / Android / Sign-up poster, next to a control that already
        // switches the face.
        if (surfaceSeg) { surfaceSeg.hidden = true; surfaceSeg.style.display = "none"; }
        div.setSurface = showFace;
      }
      return div;
    }
`;

/**
 * Customer health: the four groups, the share each one is of the base, and the
 * hint that says how a customer lands in one.
 *
 * Exported as source like DESIGN_PANEL_JS, for the same reason: `shares` has
 * real arithmetic in it and this is the only way a test can run the code the
 * dashboard actually ships rather than a second copy of it. Depends on `info`
 * and `esc` from the page around it.
 */
export const HEALTH_JS = /* js */ `
function drawHealth(host, body) {
  if (!host) return;
  const groups = body.health || [];
  // Rendered at zero as well as at thirteen. A section that appears only once
  // it has something to say is a section nobody knows exists, and this one has
  // to be found BEFORE a shop has customers — it is half the reason to pick a
  // return cycle. The percentages are dropped while there is nothing to take a
  // percentage of; four tiles reading "0 0%" is noise, not information.
  if (!groups.length) {
    host.innerHTML = "";
    return;
  }
  const total = groups.reduce((a, g) => a + g.customers, 0);
  const share = shares(groups.map((g) => g.customers));
  const cycle = body.cycle || {};
  const gap = cycle.regularGapDays || 11;
  const need = cycle.regularStamps || 3;
  const lostWeeks = Math.round((cycle.lostAfterDays || 21) / 7);
  // Each rule, then the shop's own number for it in brackets. The words are
  // fixed; the numbers come from what the server sent rather than from a copy
  // of the thresholds here, so a hint can never describe a rule the server has
  // stopped applying.
  const band = {
    new: "signed up and hasn\u2019t been back yet.",
    regular: need + "+ stamps from your counter (" + (need + 1) + "+ visits with the sign-up) " +
      "and typically comes back within your selected cycle (an average gap of " +
      gap + " days or less).",
    returning: "has come back, but doesn\u2019t yet meet the Regular criteria.",
    lost: "hasn\u2019t returned for more than 2\u00d7 your selected cycle (" + lostWeeks + " weeks).",
  };
  // A newline built rather than written: this whole panel lives inside a
  // template literal, which would turn a backslash-n into a REAL newline
  // and break the string it sits in. The bubble is white-space: pre-line,
  // so these are the line breaks the reader sees.
  const NL = String.fromCharCode(10);
  const lines = [
    "Customer segments are based on your selected visit cycle \u2014 yours is once every " +
      (cycle.label || "1\u20132 weeks") + ".",
    "",
  ];
  // New first, then Regular, Returning, Lost: the order the rules read in, not
  // the order the tiles sit in. A reader meets one stamp before three.
  ["new", "regular", "returning", "lost"].forEach((key) => {
    const g = groups.find((h) => h.key === key);
    if (g) lines.push(g.label + ": " + (band[key] || g.hint));
  });
  lines.push("",
    "Signing up counts as visit 1. After that, every stamp from your counter is a visit \u2014 " +
    "welcome stamps are not. Everyone is in exactly one group, so the four add up to your " +
    "customer count above.");
  if (!cycle.chosen) lines.push("", "You have not chosen a cycle yet \u2014 set it in Shop.");
  const hint = lines.join(NL);
  host.innerHTML =
    '<h2 class="sec">Customer health' + info(hint) + "</h2>" +
    '<div class="totals health">' +
      groups.map((g, i) =>
        '<div class="metric h-' + esc(g.key) + '"><b>' + g.customers +
          (total ? "<i>" + share[i] + "%</i>" : "") + "</b>" +
          "<span>" + esc(g.label.toLowerCase()) + "</span></div>",
      ).join("") +
    "</div>";
}

/**
 * Whole percentages that add up to exactly 100.
 *
 * Rounding each share on its own gives 33/33/33/33 and a reader who can
 * count. Largest remainder hands the leftover points to the groups that
 * lost the most in rounding, which is the only way four numbers under a
 * heading promising they add up actually do.
 */
function shares(counts) {
  const total = counts.reduce((a, n) => a + n, 0);
  if (!total) return counts.map(() => 0);
  const exact = counts.map((n) => (n * 100) / total);
  const out = exact.map(Math.floor);
  let left = 100 - out.reduce((a, n) => a + n, 0);
  exact
    .map((v, i) => ({ i, rem: v - Math.floor(v) }))
    .sort((a, b) => b.rem - a.rem)
    .forEach((e) => { if (left > 0) { out[e.i]++; left--; } });
  return out;
}
`;

/** Styles for MODAL_JS. Both pages that use the popup must include this. */
export const MODAL_CSS = /* css */ `
  .mdl { position: fixed; inset: 0; z-index: 50; background: rgba(24,20,16,.55);
         display: flex; align-items: center; justify-content: center; padding: 20px;
         animation: mdlin .14s ease-out; }
  .mdlbox { background: var(--surface); border-radius: 18px; padding: 22px 20px 18px;
            width: 100%; max-width: 380px; box-shadow: 0 18px 50px -12px rgba(24,20,16,.5); }
  .mdlbox h3 { margin: 0 0 8px; font-size: 1.12rem; }
  .mdlbody { color: var(--muted); font-size: .9rem; line-height: 1.55; }
  .mdlbody strong { color: var(--ink); }
  /* Two blast radii, side by side rather than in one paragraph. The look and
     the rules reach completely different people, and running them together got
     "reaches all 5 customers" and "are untouched" into consecutive sentences
     about the same 5 people — which read as a contradiction and was reported as
     one. A label per row is the whole fix. */
  .mdlblast { display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; margin-top: 12px; }
  .mdlblast dt { font-size: .62rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
                 color: var(--muted); padding-top: 3px; white-space: nowrap; }
  .mdlblast dd { margin: 0; }
  .mdlrow { display: flex; gap: 8px; margin-top: 18px; }
  .mdlrow .btn { width: auto; flex: 1; margin: 0; padding: 12px 14px; font-size: .92rem; }
  @keyframes mdlin { from { opacity: 0 } to { opacity: 1 } }
  @media (prefers-reduced-motion: reduce) { .mdl { animation: none; } }
  /* The ⓘ that replaced a paragraph of grey subtext under every field. */
  .ihint { width: 18px; height: 18px; padding: 0; margin-left: 6px; border-radius: 50%;
           border: 1px solid var(--field-border); background: var(--surface); color: var(--muted);
           font-weight: 700; font-size: .68rem; line-height: 1; cursor: pointer; vertical-align: middle; }
  .ihint:hover, .ihint.on { border-color: var(--accent); color: var(--accent-dark); }
  /* The hint itself: a bubble over the page, not a line that pushes the form
     down. One per page, moved and refilled — see wireInfo. */
  .itip { position: fixed; z-index: 60; max-width: min(280px, calc(100vw - 20px));
          background: var(--ink, #201d19); color: #fff; border-radius: 10px;
          padding: 9px 12px; font-size: .8rem; line-height: 1.45;
          box-shadow: 0 8px 24px -6px rgba(24,20,16,.45);
          opacity: 0; visibility: hidden; transition: opacity .12s;
          pointer-events: none; left: 0; top: 0; }
  /* pre-line so a hint can be a short LIST — a rule with four groups reads as
     four lines and is unreadable as one paragraph. Existing hints hold no
     newlines, so they are unchanged. */
  .itip { white-space: pre-line; }
  .itip.on { opacity: 1; visibility: visible; }
  @media (prefers-reduced-motion: reduce) { .itip { transition: none; } }
`;

/**
 * The shell every page is served in.
 *
 * `title` is ESCAPED here rather than at each call site. Several titles carry a
 * shop name — the sign-up page, the poster, the counter sheet — and a title is
 * plain text by definition, so there is no caller that wants markup in it.
 * Escaping once is the only version of this that cannot be forgotten by the next
 * page someone adds. It had been forgotten already: a shop named
 * `</title><script>…` reached the title of a page every one of their customers
 * loads.
 *
 * `brand` puts the Powered by line at the foot, and defaults to ON for exactly
 * the same reason the escape lives here: the first pass at this signed the
 * dashboard tabs and the console and missed the sign-up page, the login form,
 * the claim page, the stamper and four others. Opt OUT by name — a page with no
 * footer should be a decision someone made, not one they forgot.
 */
export function page(
  title: string,
  body: string,
  extraCss = "",
  script = "",
  brand = true,
): string {
  // On any copy that is not live, every page says so — a strip at the top of
  // all of them at once, because this shell is the one place they share. Same
  // condition adds noindex, so a search engine never lists the staging site.
  // Live renders neither: envName() defaults to "live" with nothing set.
  const env = envName();
  const envStrip =
    env === "live"
      ? ""
      // The class is load-bearing on one page: the dashboard's top bar is also
      // sticky, and without a way to select this strip the two would stick to
      // the same 0 and the strip — which sits far above everything on purpose —
      // would cover half the bar. The dashboard offsets itself below it.
      // padding-top carries the notch: the page paints into it now
      // (viewport-fit=cover), and a strip that stopped below the status bar
      // would leave a white band above the top of the app.
      : `<div class="envstrip" style="position:sticky;top:0;z-index:9999;background:#101312;color:#c9f73d;text-align:center;padding:7px 10px;padding-top:calc(7px + env(safe-area-inset-top, 0px));font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase">${esc(env)} — not the real site</div>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<!-- viewport-fit=cover lets a page paint into the notch and the home bar
     area. Anything pinned to an edge then has to add the matching
     env(safe-area-inset-*) itself, or it sits under the hardware. -->
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${env === "live" ? "" : '<meta name="robots" content="noindex">'}
<link rel="icon" type="image/png" href="/assets/img/punchme-favicon-v1.png">
<title>${esc(title)}</title>
<style>${baseCss}${extraCss}</style>
</head>
<body>${envStrip}${body}${brand ? POWERED_BY : ""}${script ? `<script>${script}</script>` : ""}</body>
</html>`;
}
