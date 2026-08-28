/**
 * All HTML pages, server-rendered from template strings — no frontend build,
 * nothing for the founder to compile. Mobile-first (staff use their phones).
 */
import { contrastRatio, contrastText, rgbToHex } from "./color.js";
import { CHURN_DAYS, FLAG_GUIDE, STAGE_LABEL } from "./health.js";
import type { SetupStatus } from "./config.js";
import type { CardRow } from "./db.js";
import { DEFAULT_CARD_ID, FUNNEL_SINCE, FUNNEL_SINCE_LABEL, TRIAL_DAYS } from "./db.js";
import { benefitLines, catalogueSummary, milestoneSummary } from "./passModel.js";

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

const baseCss = /* css */ `
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
  /* The marketing page only. It sets its own --display and --body from this,
     because the landing is the one surface that has to look like an ad; the
     dashboard and the stamper stay on the faces chosen for reading. */
  @font-face {
    font-family: "Figtree";
    font-style: normal;
    font-weight: 400 900;
    font-display: swap;
    src: url("/assets/fonts/figtree-latin.woff2") format("woff2");
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
    --r: 14px; --r-lg: 22px;
    --shadow: 0 10px 30px -16px rgba(12,14,13,.18), 0 2px 6px rgba(12,14,13,.06);
    --display: "Figtree", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    --body: "Figtree", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  * { box-sizing: border-box; margin: 0; }
  body {
    font-family: var(--body); line-height: 1.5;
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
  h1 { font-family: var(--display); font-weight: 800; font-size: 1.75rem; letter-spacing: -.03em; margin-bottom: 10px; text-wrap: balance; }
  h2 { font-family: var(--display); font-weight: 800; font-size: 1.18rem; letter-spacing: -.02em; margin: 24px 0 8px; }
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
  .muted { color: var(--muted); font-size: .85rem; }
  input, textarea, select {
    width: 100%; padding: 13px 14px; border: 1px solid var(--field-border); border-radius: 12px;
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
  label { font-size: .78rem; font-weight: 700; letter-spacing: .01em;
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
function esc(s: string): string {
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
    .pv-note { text-align: center; font-size: .72rem; margin-top: 6px; opacity: .75; }

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
    .pvp { background: #fff; color: #111; border-radius: 12px; overflow: hidden;
           margin: 10px 0 4px; box-shadow: 0 10px 30px -8px rgba(43,29,21,.35); }
    .pvp-head { padding: 16px 14px 14px; text-align: center; }
    .pvp-logo { height: 34px; width: auto; max-width: 65%; object-fit: contain; margin-bottom: 6px; }
    .pvp-name { font-family: var(--display); font-weight: 800; font-size: 1.05rem;
                letter-spacing: -.01em; overflow-wrap: anywhere; }
    .pvp-body { padding: 14px 14px 16px; text-align: center; }
    .pvp-offer { font-weight: 700; font-size: .92rem; line-height: 1.3; overflow-wrap: anywhere; }
    .pvp-no { color: #6b6b66; font-size: .72rem; margin: 6px 0 12px; }
    .pvp-qr { border: 4px solid var(--line); border-radius: 10px; width: 96px; height: 96px;
              margin: 0 auto; display: flex; align-items: center; justify-content: center;
              font-weight: 700; font-size: .72rem; color: #111; letter-spacing: 1px; }
    /* Centred, and centred the same way posterPage's .psteps is — the offer,
       the line above the code and the code itself are all centred, so a
       left-flush block of steps was the one thing on the sheet hanging off the
       edge. Changed in BOTH places in the same commit: this preview exists to
       be trusted, and a fix applied to only one of them is how it stops being. */
    .pvp-steps { color: #6b6b66; font-size: .68rem; line-height: 1.7; margin-top: 12px;
                 text-align: center; }

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
    .pvacts { margin-top: 10px; }
    .pvacts-t { font-size: .82rem; font-weight: 600; color: var(--muted);
                display: flex; align-items: center; gap: 4px; margin-bottom: 8px; }
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
    .testqr { width: 150px; height: 150px; margin-top: 10px; border-radius: 10px;
              background: #fff; padding: 6px; box-shadow: inset 0 0 0 1px var(--line); }
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
const GOOGLE_GLYPH =
  '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">' +
  '<path fill="#4285F4" d="M21.6 12.23c0-.68-.06-1.34-.18-1.96H12v3.71h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.89-1.74 2.98-4.3 2.98-7.27z"/>' +
  '<path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.61-2.43l-3.23-2.5c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.07v2.58A10 10 0 0 0 12 22z"/>' +
  '<path fill="#FBBC05" d="M6.41 13.91a6 6 0 0 1 0-3.82V7.51H3.07a10 10 0 0 0 0 8.98l3.34-2.58z"/>' +
  '<path fill="#EA4335" d="M12 5.96c1.47 0 2.79.5 3.83 1.5l2.86-2.86C16.95 2.98 14.7 2 12 2a10 10 0 0 0-8.93 5.51l3.34 2.58C7.2 7.73 9.4 5.96 12 5.96z"/>' +
  "</svg>";

export const DESIGN_PANEL_JS = /* js */ `
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
          <div class="seg dseg" data-surfaces role="tablist">
            <button data-tab="apple" class="on">iPhone</button>
            <button data-tab="google">Android</button>
            <button data-tab="signup">Sign-up poster</button>
            <span class="thumb"></span>
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
            <div class="pv-note">Code ABC123 · updates by itself</div>
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
          <div class="pvp" data-pvp data-surface="signup" hidden>
            <div class="pvp-head" data-pvp-head>
              <img class="pvp-logo" data-pvp-logo alt="" style="\${c.logoVersion ? "" : "display:none"}">
              <div class="pvp-name" data-pvp-name></div>
            </div>
            <div class="pvp-body">
              <div class="pvp-offer" data-pvp-offer></div>
              <div class="pvp-no">Scan to get your card — no app to download.</div>
              <div class="pvp-qr" data-pvp-qr><span>QR</span></div>
              <div class="pvp-steps">1. Point your camera at the code<br>2. Tap Add to Wallet<br>3. Show it when you order</div>
            </div>
          </div>

          <!-- The palette for whichever part of the card was tapped. It lives
               INSIDE the preview box on purpose: the console moves this whole
               node into its right-hand rail (mountDesigner), and a palette left
               behind in the editor column would open 400px away from the thing
               it recolours. Empty and hidden until something is tapped. -->
          <!-- The real thing, on a real phone. Deliberately NOT a .sec heading:
               that class draws a rule and 28px of air above itself, which pushed
               this away from the card and made it read as the start of a new
               section rather than as something you do TO the card above it. The
               rule it used to draw now belongs to the Design fold below. -->
          <div class="pvacts">
            <span class="pvacts-t">Add a test card\${info("A real card for testing — it never counts as a customer and never shows in your numbers. Each link lasts 30 minutes.")}</span>
            <div class="actbar">
              <button class="btn btn-ghost pvicon" data-a="test" data-w="apple" title="Add to Apple Wallet" aria-label="Add to Apple Wallet">${APPLE_GLYPH}</button>
              <button class="btn btn-ghost pvicon" data-a="test" data-w="google" title="Add to Google Wallet" aria-label="Add to Google Wallet">${GOOGLE_GLYPH}</button>
              <!-- A word, not a mark: there is no logo that means "your printed
                   poster", and inventing one would be a symbol nobody can read. -->
              <a class="btn btn-ghost" target="_blank" rel="noopener" href="/c/\${encodeURIComponent(c.id)}/poster">Sign-up poster</a>
            </div>
          </div>
          <div data-testout hidden></div>
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
        <div class="lrow">
          <!-- Named "Apple logo" beside "Android logo" because the pair reads
               instantly. The ⓘ has to carry what the name gives up: this image
               is NOT Apple-only. It is on the poster, on the sign-up page, and
               on Android too whenever no Android logo has been uploaded
               (googleModel.ts falls back to it). A merchant who skipped it
               because "we're not on iPhone" would lose all three. -->
          <label class="dlbl">Apple logo\${info("Your main logo. It goes on the iPhone card, your printed poster and your sign-up page — and on Android too, unless you upload an Android logo below. Any shape; a wide one with your name in it works well. Your card colours are read from it.")}</label>
          <div class="actbar">
            <label class="btn btn-ghost" style="margin:0"><span data-logobtn>Upload logo</span><input data-logo type="file" accept="image/*"></label>
            <button class="btn btn-ghost" data-a="rmlogo" \${c.logoVersion ? "" : "disabled"}>Remove logo</button>
          </div>
        </div>

        <!-- Row two. Always here, because it is one of the three things this
             section is about and a row that is simply absent cannot be
             understood — on a brand-new shop there is no logo yet, so the
             condition that used to reveal it could not be true and the row
             looked missing rather than not-yet-needed.
             The RELEVANCE moved into the row instead: the line below appears
             only once there is a wide logo to be cropped, which is the one state
             where anything is actually being lost. -->
        <div class="lrow" data-markbox>
          <label class="dlbl">Android logo\${info("Android crops your logo to a small circle, so a wide one loses both ends. A square version fixes that. Optional — without it Android uses your Apple logo above.")}</label>
          <div class="actbar">
            <label class="btn btn-ghost" style="margin:0"><span data-markbtn>Upload logo</span><input data-mark type="file" accept="image/*"></label>
            <button class="btn btn-ghost" data-a="rmmark" \${c.markVersion ? "" : "disabled"}>Remove logo</button>
          </div>
          <p class="mhint" data-markhint hidden>Your logo is wide, so Android is cropping the ends off it.</p>
        </div>

        <!-- No heading: the sentence IS the label, and "Business name" above it
             was the same words twice in a row.

             The ⓘ is OUTSIDE the <label>, and that is the bug this row had for
             months rather than a style choice. A label binds to its FIRST
             LABELABLE DESCENDANT, and <button> is labelable — so with the ⓘ
             inside, the label's control was the info dot and never the
             checkbox. The visible track sits on top of an opacity:0 input, so
             every click landed on the track, fell through to label activation,
             and toggled the info bubble. The switch simply did not work.
             Explicit for/id as well, so the binding cannot drift again if
             anything else is ever added to this row. -->
        <div class="lrow">
          <div class="tgrow">
            <span class="tgtext"><label for="lname-tg">My logo already includes my business name</label>\${info("Turn this on and we stop printing the name beside your logo, so it is not said twice.")}</span>
            <!-- A label of its own, so the switch itself is still the obvious
                 thing to press: the track paints over the transparent input, so
                 without this the click would land on nothing. Its ONLY labelable
                 descendant is the checkbox, which is the whole point. -->
            <label class="tg" for="lname-tg">
              <input id="lname-tg" data-lname type="checkbox" \${c.logoHasName ? "checked" : ""}>
              <span class="tgtrack"><span class="tgthumb"></span></span>
            </label>
          </div>
        </div>

        <!-- The band behind the stamps. Sits with the logo rows because it is the
             same kind of decision — a picture you supply — and directly above the
             stamps that get drawn on top of it, which is the thing worth having in
             mind while choosing one. -->
        <div class="lrow">
          <label class="dlbl">Band artwork\${info("The strip behind your stamps. Leave it empty and the band is just your Band colour. Your stamps are drawn ON TOP of whatever you upload, so a busy picture will fight them — something simple, and open in the middle, works best. Cropped to fit a wide strip.")}</label>
          <div class="actbar">
            <label class="btn btn-ghost" style="margin:0"><span data-bandbtn>Upload image</span><input data-band type="file" accept="image/*"></label>
            <button class="btn btn-ghost" data-a="rmband" \${c.bandTexture === "image" ? "" : "disabled"}>Remove</button>
          </div>
        </div>

        <label class="dlbl">Stamp logo\${info("Plain dots, an emoji, or your own shape, drawn in your Stamps colour. A simple shape or symbol, not a photo — we trim it and fill it with your stamp colour. iPhone only: Android always shows dots.")}</label>
        <!-- Three buttons, one choice. It was a text field, a Use button, an
             upload and a Dots button: four controls for three answers, and the
             field read as something you had to fill in before anything would
             work. The emoji moved into a popup, where a field is obviously a
             field. "Default" is always shown because it is the only way back,
             and a control that appears once you no longer need it is no control
             at all. -->
        <!-- ONE ⓘ for this block, on the label above. There were two — a second
             sat here beside the buttons, so the row read as though "Dots"
             specifically needed explaining. Its sentence moved up into the
             label's own hint, where the question is asked. -->
        <div class="stamprow">
          <div class="actbar">
            <label class="btn btn-ghost" style="margin:0">Upload<input data-stampimg type="file" accept="image/png,image/svg+xml"></label>
            <button class="btn btn-ghost" data-a="emoji">Emoji</button>
            <button class="btn btn-ghost" data-a="rmstamp">Dots</button>
          </div>
        </div>
        <!-- What is actually set. The rendered grid used to be the only signal,
             and the grid was exactly what went wrong — so an owner whose shape
             was safe in the database had nothing on the screen telling them so.
             Says its piece even when the grid above is still drawing. -->
        <p class="stampnow" data-stampnow style="display:none">
          <img data-stampnow-img alt=""><span>Your own stamp is being used.</span>
        </p>
        <p class="err" data-stamperr style="display:none"></p>

        <!-- Colours are DERIVED, so they are shown rather than offered: a strip
             of what the logo produced, named, so you can tell which one is the
             band. Changing one happens on the CARD — tap the part you mean in
             the preview and its palette opens under it.

             There used to be a Customize button here revealing five named rows.
             It asked you to name the part you wanted before you could point at
             it, when the part was on screen the whole time; the button was one
             more thing to find, and the rows were a second, worse drawing of a
             card that was already right there. -->
        <label class="dlbl">Colours\${info("Read from your logo and used everywhere. To change one, tap that part of the card in the preview.")}</label>
        <!-- The strip IS the control. Each swatch is a button; tapping one opens
             its palette directly underneath, where you are already looking.
             The palette lives HERE rather than under the preview: the console
             mounts the preview in a right-hand rail, so opening it there would
             put the answer in a different column from the thing you tapped. -->
        <div class="swstrip" data-swatches></div>
        <div class="swnames" data-swnames></div>
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

        <!-- ================= LOYALTY PROGRAMME ================= -->
        \${env.rulesNote}
        <!-- Always headed, and named for what is actually under it. Hidden in
             the console, this left the shop's name as the one field on the panel
             with no heading over it — sitting between Colours and Save as though
             it were another colour. The console cannot set the programme's
             rules, so calling it "Loyalty programme" there would be a promise
             the page does not keep. -->
        <label class="sec dsec" style="display:block">\${env.showDetails ? "Loyalty programme" : "Shop"}</label>
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
        pvName.style.display = c.logoHasName && c.logoVersion ? "none" : "";
        // Every one of these mirrors buildPassJson in src/passModel.ts. A
        // membership card shows who the holder is instead of how far along they
        // are, because it has no target to be along the way to.
        q("[data-pv-progress]").textContent = member ? "Member"
          : points ? (start === 1 ? "1 point" : start + " points")
          : headerValue(start, target);
        q("[data-pv-clbl]").textContent = member ? "MEMBER SINCE" : points ? "BALANCE" : "PROGRESS";
        q("[data-pv-tally]").textContent = member ? thisMonth() : start + "/" + target;
        q("[data-pv-rlbl]").textContent = member ? "MEMBER NO."
          : rungs.length ? "NEXT REWARD" : "REWARD";
        q("[data-pv-reward]").textContent = member
          ? "ABC123"
          : (nextRung ? nextRung.reward : (f("reward").value || "Your reward"));
        for (const el of div.querySelectorAll(".pv-lbl, .pv-note")) el.style.color = f("label").value;
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
        renderPoster();
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
      function renderPoster() {
        const pp = q("[data-pvp]");
        if (!pp) return;
        const bg = f("bg").value;
        const head = q("[data-pvp-head]");
        head.style.background = bg;
        head.style.color = pickTextColor(bg);
        const nm = q("[data-pvp-name]");
        nm.textContent = f("shopName").value || "Your shop";
        // The poster hides the name under the same condition the card does.
        nm.style.display = c.logoHasName && c.logoVersion ? "none" : "";
        const im = q("[data-pvp-logo]");
        if (c.logoVersion) { im.src = env.artUrl("logo", c.logoVersion); im.style.display = ""; }
        else im.style.display = "none";
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
        q("[data-pvp-offer]").textContent = f("signupMessage").value || suggested;
        // The FIELD's placeholder is the same sentence, and it used to be baked
        // in once at mount — so raising the target to 10 and saving left the
        // suggestion underneath still offering the old number, disagreeing with
        // the poster beside it until the whole page was reloaded. It is derived
        // from the same two values here, on every repaint, so it cannot drift.
        f("signupMessage").placeholder = suggested;
        // The QR frame is the accent on white paper, and a pale accent prints as
        // no frame at all — the same fallback posterPage makes server-side.
        const accent = f("accent").value;
        q("[data-pvp-qr]").style.borderColor =
          contrastRatio(accent, "#ffffff") >= 1.6 ? accent
            : (contrastRatio(bg, "#ffffff") >= 1.6 ? bg : "#111111");
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
      const ART_LABEL = { logo: "Logo", banner: "Band artwork", mark: "Android logo" };

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
      function wireUpload(inputSel, kind, w, h, onDone, fit) {
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
            const src = liftBackdrop(img);
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
        im.src = url; im.style.display = ""; c.logoVersion = 1;
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
        lastLogoUrl = "";
        logoRatio = 0;
        updateMark();
        toast("Logo removed");
      };

      // The square version, for Google's small near-square logo slot. Padded to
      // a square on purpose — the opposite of the logo above — because that slot
      // is the shape being fitted, and letterboxing beats a cropped mark.
      // Nothing on this page previews it: the preview is the Apple card, which
      // never uses it, and a preview that showed it would be a lie.
      wireUpload("[data-mark]", "mark", 660, 660, () => {
        c.markVersion = 1;
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
        c.markVersion = 0;
        q("[data-a=rmmark]").disabled = true;
        updateMark();
        renderPreview();
        toast("Square logo removed — Android goes back to your main logo");
      };

      // Staged like the upload above it, not saved on the tick. It changes what
      // the card LOOKS like, and everything that does now waits for one button.
      q("[data-lname]").onchange = () => {
        const on = q("[data-lname]").checked;
        stage("logoHasName", async () => {
          const { body } = await api(P(), {
            method: "POST", body: JSON.stringify({ logoHasName: on }),
          });
          if (!body.ok) {
            // Put the box back where the server left it: a control showing a
            // state that was rejected is worse than one that visibly did not take.
            q("[data-lname]").checked = !on;
            renderPreview();
            toast(body.error || "Couldn't save that");
            return false;
          }
          c.logoHasName = on;
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
        c.bannerVersion = Date.now();
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
        const strip = q("[data-swatches]");
        if (!strip) return;
        strip.innerHTML = "";
        const names = q("[data-swnames]");
        if (names) names.innerHTML = "";
        for (const r of ROLES) {
          const sw = document.createElement("button");
          sw.type = "button";
          sw.className = "sw" + (r.k === activeRole ? " on" : "");
          sw.style.background = f(r.k).value;
          sw.title = r.name;
          // A real attribute, not dataset: identical in a browser, and this way
          // the strip is addressable by selector from CSS and from the tests.
          sw.setAttribute("data-role", r.k);
          sw.setAttribute("aria-label", r.name);
          sw.setAttribute("aria-expanded", r.k === activeRole ? "true" : "false");
          // Tapping the open one shuts it, so the strip is a toggle rather than
          // something that can only ever be opened.
          sw.onclick = () => {
            activeRole = activeRole === r.k ? null : r.k;
            drawPalette();
          };
          strip.appendChild(sw);
          if (names) {
            const nm = document.createElement("span");
            nm.textContent = r.name;
            names.appendChild(nm);
          }
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
       * Put this card in the owner's own wallet.
       *
       * Both wallets, because only the person holding the phone knows which one
       * they need. Minted on press rather than rendered with the panel: the
       * links last 30 minutes, so one made at page load would be stale by the
       * time anybody read it.
       *
       * On a laptop these did nothing you could see. The iPhone link hands the
       * browser a .pkpass, which a desktop downloads silently and cannot open,
       * and Google's save link wants the phone that is signed in — so pressing
       * either one looked broken. A desktop gets the QR instead: it is the only
       * one of the three that can actually reach the phone the wallet is on.
       * The sign-up page is a plain link, on any device — it is a public page,
       * nothing is minted by looking at it.
       */
      const onPhone = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || "");
      div.querySelectorAll("[data-a=test]").forEach((b) => {
        b.onclick = async () => {
          const wallet = b.dataset.w;
          const out = q("[data-testout]");
          const { body } = await api(P("/test-link"));
          if (!body.ok) return toast(body.error || "Couldn't make a link");
          if (onPhone) { location.href = wallet === "google" ? body.google : body.apple; return; }
          out.hidden = false;
          // The QR is behind the same authorisation the link is, so it is built
          // from this page's own api base rather than a public URL. Cache-busted
          // per press: the token inside it expires, and a stale QR that still
          // renders is worse than one that visibly reloads.
          out.innerHTML =
            '<p class="muted" style="margin:12px 0 0;font-size:.84rem">Scan this with the phone you want the card on.</p>' +
            '<img class="testqr" alt="" src="' + esc(env.apiBase + env.path("/test-qr.png")) +
              "?wallet=" + wallet + "&v=" + Date.now() + '">';
        };
      });

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
      function showSurface(name) {
        surfaceSeg.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.tab === name));
        moveThumb(surfaceSeg);
        pvbox.querySelectorAll("[data-surface]").forEach((p) => { p.hidden = p.dataset.surface !== name; });
        renderPreview();
      }
      surfaceSeg.querySelectorAll("button").forEach((b) => {
        b.onclick = () => showSurface(b.dataset.tab);
      });
      // The panel this builds is still a detached node when this runs — its
      // caller appends the RETURN VALUE of this function, after everything in
      // it has already executed. A detached node has no layout box, so
      // moveThumb (inside showSurface) measured 0 for offsetWidth/offsetLeft
      // and seated the thumb at nothing: iPhone was the active tab but had no
      // visible highlight until a later click (which runs after attaching, and
      // measures correctly) moved it for the first time. Deferring one frame
      // guarantees the caller's appendChild has already run.
      requestAnimationFrame(() => showSurface("apple"));

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

      // The six preset tiles (Dot, Coffee, Star, Heart, Donut, Boba) are gone:
      // they were six ways to do what the emoji field does, and every card
      // starts on dots anyway. Three routes remain — dots, any emoji, your own
      // shape — and each is a different kind of answer rather than a shortcut.
      /**
       * Any emoji at all — now asked for in a popup.
       *
       * It was a text input sitting between two buttons, which made one of three
       * equal answers look like a field you had to fill in first. In a dialog a
       * field is obviously a field, and the row above it is three buttons doing
       * three comparable things.
       *
       * modal() resolves a boolean, not a value, so the input is grabbed
       * SYNCHRONOUSLY: modal builds its DOM before it returns the promise, and
       * closing removes the node while this reference keeps its value. That is
       * why this does not await first — it could not find the field afterwards.
       *
       * The renderer draws whatever glyph it is handed, so this only has to hand
       * it one — and exactly one: firstGrapheme keeps multi-code-point emoji
       * (❤️, 🧑‍🍳) whole instead of slicing them in half.
       */
      q("[data-a=emoji]").onclick = async () => {
        const current = (c.stampStyle && c.stampStyle !== "dot" && c.stampStyle !== "custom")
          ? c.stampStyle : "";
        const asked = modal(
          "Use an emoji as your stamp",
          '<p class="muted" style="margin:0 0 10px;font-size:.86rem">Paste or type one. ' +
            'It is drawn in your Stamps colour, on the iPhone card.</p>' +
            '<input data-emoji maxlength="8" placeholder="e.g. ☕️" ' +
            'style="font-size:1.6rem;text-align:center" value="' + esc(current) + '">',
          "Use it",
        );
        const field = document.querySelector(".mdl [data-emoji]");
        if (field && field.focus) field.focus();
        if (!(await asked)) return;
        const one = firstGrapheme(field ? field.value : "");
        if (!one) return toast("No emoji in there — nothing changed");
        applyStamps(one);
      };
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
      }, "keep");
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
      q("[data-a=rmstamp]").onclick = async () => {
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
      };

      // Two saves, disjoint field sets. Both re-render the stamp strips, because
      // a colour change (design) and a target change (rules) each alter them.
      // That re-render IS the pre-generation step: one PNG per stamp count, so a
      // customer's stamp only ever swaps which stored image the pass points at.
      // The quiet flag is for a caller stringing several of these together — the
      // logo colour path does four writes and one thing to say at the end of them.
      async function save(fields, label, quiet) {
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
function page(
  title: string,
  body: string,
  extraCss = "",
  script = "",
  brand = true,
): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" type="image/png" href="/assets/img/punchme-favicon-v1.png">
<title>${esc(title)}</title>
<style>${baseCss}${extraCss}</style>
</head>
<body>${body}${brand ? POWERED_BY : ""}${script ? `<script>${script}</script>` : ""}</body>
</html>`;
}

// ------------------------------------------------------------- customer ----

/**
 * A link, not a tick-box: we ask customers for no name, email or phone, and a
 * consent gate at a counter costs real sign-ups. It sits BELOW the buttons so
 * the Add button stays at thumb height, and leads with the fact rather than the
 * links — "no name, no phone, no email" is the reason to join, not fine print.
 */
const legalLine = `<p class="muted" style="margin-top:10px;font-size:.78rem">No name, no phone number, no email — ever.
  Adding this card means you accept our <a href="/terms" target="_blank">Terms</a> and
  <a href="/privacy" target="_blank">Privacy Policy</a>.</p>`;

/**
 * The one line that sells the card: the owner's own words, or a sentence built
 * from their reward when they haven't written any.
 *
 * Shared by the sign-up page and the printed poster so the two cannot drift —
 * the poster exists to get someone to that page, and a poster promising one
 * thing and a page promising another is worse than no poster.
 *
 * Returns ESCAPED markup: this is owner-supplied text going into a page every
 * one of their customers loads.
 */
export function signupLine(
  card: Pick<CardRow, "signup_message" | "stamps_target" | "reward" | "kind" | "benefits" | "milestones">,
): string {
  if (card.signup_message) return esc(card.signup_message);
  if (card.kind === "points" && (card.milestones ?? []).length) {
    // The price list, because "collect points" on its own tells nobody what
    // the points are for.
    return `Collect points every visit — ${esc(catalogueSummary(card.milestones ?? []).toLowerCase())}.`;
  }
  if (card.kind === "milestones" && (card.milestones ?? []).length) {
    // The whole ladder, because the point of this card is that there is more
    // than one prize on it — a line promising only the top one sells it short
    // and reads like an ordinary stamp card.
    return `Rewards along the way — ${esc(milestoneSummary(card.milestones ?? []).toLowerCase())}.`;
  }
  if (card.kind === "membership") {
    // A membership card has no target to promise, so the generated line names
    // the perks the shop actually typed. With none typed yet it says what the
    // card IS rather than inventing an offer the shop never made.
    const perks = benefitLines(card.benefits ?? "");
    return perks.length
      ? `Your membership card — ${esc(perks.slice(0, 2).join(", ").toLowerCase())}.`
      : "Your membership card, free to join.";
  }
  return `Collect ${card.stamps_target} stamps, get a ${esc(card.reward.toLowerCase())}.`;
}

/**
 * The page a customer lands on after scanning the poster.
 *
 * Branded from the card itself — the shop's logo where a generic ☕️ used to be,
 * and the shop's own colours behind the Add buttons. It is the same shop the
 * poster showed them ten seconds ago, and a plain white page with a coffee
 * emoji reads as somebody else's site.
 *
 * It is named after the SHOP, never `cards.name`: that column is an internal
 * label with no field in the dashboard, so a shop that renamed was still
 * introducing itself to its own customers as whatever the card was called on
 * the day it was made.
 */
export function landingPage(
  card: CardRow,
  appleReady: boolean,
  googleReady: boolean,
  cardId: string,
  /** The shop's name. Defaults to the card's, which is right until a merchant runs two. */
  business = card.name,
  /** 0 = no uploaded logo, so the page falls back to the generic mark. */
  logoVersion = 0,
): string {
  const base = cardId === DEFAULT_CARD_ID ? "" : `/c/${cardId}`;
  const bg = rgbToHex(card.background_color);
  const accent = rgbToHex(card.accent_color);
  const onBg = contrastText(bg);
  // A tinted header rather than a whole page in the brand colour: the Add
  // buttons and the legal line still have to be readable, and Apple's own sheet
  // is white — a full-bleed dark page makes the handover feel like a jump.
  const brandCss = /* css */ `
    .lhero { background: ${bg}; color: ${onBg}; margin: -20px -20px 18px; padding: 26px 20px 22px;
             border-radius: 0 0 22px 22px; text-align: center; }
    .lhero h1 { color: ${onBg}; margin: 0; font-size: 1.6rem; }
    /* Height-bound so a wide brand lockup keeps its width — see .pv-logo. */
    .lhero img { height: 76px; width: auto; max-width: min(280px, 100%);
                 object-fit: contain; margin-bottom: 10px; }
    .lhero .emoji { font-size: 3rem; line-height: 1; margin-bottom: 6px; }
    .lhero .sub { color: ${onBg}; opacity: .85; margin: 8px 0 0; }
    .card { overflow: hidden; }
    .wbtn.btn-dark { background: ${accent}; border-color: ${accent}; color: ${contrastText(accent)}; }
  `;
  const buttons = [
    appleReady
      ? `<a class="btn btn-dark wbtn" data-w="apple" href="${base}/enroll">&#63743; Add to Apple Wallet</a>`
      : "",
    googleReady
      ? `<a class="btn btn-dark wbtn" data-w="google" style="margin-top:10px" href="${base}/enroll/google">Add to Google Wallet</a>`
      : "",
  ].join("");
  // Lead with the wallet native to the phone (the other stays as a fallback),
  // so scanning the QR lands the customer near-directly on the right Add sheet.
  const script = /* js */ `
    (function () {
      var ua = navigator.userAgent || "";
      var prefer = /iPhone|iPad|iPod/.test(ua) ? "apple" : /Android/.test(ua) ? "google" : "";
      var btns = Array.prototype.slice.call(document.querySelectorAll(".wbtn"));
      if (!prefer || btns.length < 2) return;
      btns.sort(function (a, b) { return (b.dataset.w === prefer) - (a.dataset.w === prefer); });
      btns.forEach(function (b, i) {
        b.classList.toggle("btn-dark", i === 0);
        b.classList.toggle("btn-ghost", i !== 0);
        b.style.marginTop = i === 0 ? "0" : "10px";
        b.parentNode.appendChild(b);
      });
    })();
  `;
  return page(
    `${business} — Loyalty Card`,
    `<div class="card" style="text-align:center">
      <div class="lhero">
        ${
          logoVersion
            ? `<img src="${base}/art/logo.png?v=${logoVersion}" alt="${esc(business)}">`
            : `<div class="emoji">☕️</div>`
        }
        ${
          // The same rule the card and the poster follow: a logo that already
          // contains the shop's name must not have it printed again underneath.
          // This page never learned it, so a lockup read its own name twice —
          // and it was the page the founder saw most, because it is what the
          // sign-up QR opens. Only when a logo is actually shown: with no logo
          // there is nothing carrying the name, and hiding it would leave the
          // page anonymous. It stays in <title> either way, which is a browser
          // tab, not a line beside the mark.
          logoVersion && card.logo_has_name ? "" : `<h1>${esc(business)}</h1>`
        }
        <p class="sub">${signupLine(card)}</p>
      </div>
      <p class="sub">Your card lives in your phone’s wallet — no app needed.</p>
      ${
        buttons
          ? `<div id="wallets">${buttons}</div>
             ${card.kind === "membership"
               ? ""
               : `<p class="muted" style="margin-top:14px">You start with a few free stamps as a welcome gift 🎁</p>`}
             ${legalLine}`
          : `<p class="sub"><strong>Almost ready!</strong> Cards can’t be issued yet — the café is still being set up.</p>
             ${legalLine}`
      }
    </div>`,
    brandCss,
    buttons ? script : "",
  );
}

/**
 * Shown when a merchant join link can't decide which card to issue — more than
 * one card, and no default set. Unreachable while merchants run a single card;
 * it exists so `/j/` never dead-ends once they don't.
 */
export function cardPickerPage(
  merchant: { name: string },
  cards: { id: string; name: string; reward: string; stamps_target: number }[],
  query = "",
): string {
  const buttons = cards
    .map(
      (c) =>
        `<a class="btn btn-dark wbtn" style="margin-top:10px" href="/c/${encodeURIComponent(c.id)}${query}">
           ${esc(c.name)} <span style="opacity:.75">— ${esc(c.reward)} after ${c.stamps_target}</span>
         </a>`,
    )
    .join("");
  return page(
    `${merchant.name} — pick a card`,
    `<div class="card" style="text-align:center">
      <h1>${esc(merchant.name)}</h1>
      <p class="sub">Which card would you like?</p>
      ${buttons}
    </div>`,
  );
}

export function notReadyPage(reason?: string): string {
  return page(
    "Not ready yet",
    `<div class="card" style="text-align:center">
      <h1>Hang tight ☕️</h1>
      <p class="sub">${
        reason
          ? esc(reason)
          : `This card isn’t ready to issue yet. Apple certificates are still being set up — check <a href="/setup">/setup</a>.`
      }</p>
    </div>`,
  );
}

/**
 * The page a shop's sign-up link shows before anyone has claimed it, and after
 * it has been archived.
 *
 * A shop exists in full — card, colours, /j/ QR — from the moment we build it,
 * which means a poster could be printed and scanned before the merchant has an
 * account. Without this, a customer could be issued a card that NOBODY can
 * stamp: the staff PIN belongs to the owner, and there is no owner yet. So the
 * Add-to-Wallet buttons are simply not offered until the shop is live.
 */
export function shopNotOpenPage(
  business: string,
  logoVersion = 0,
  cardId = "",
  /** The card, for its colours. Omitted ⇒ the plain site palette. */
  card?: Pick<CardRow, "background_color">,
): string {
  const base = !cardId || cardId === "default" ? "" : `/c/${cardId}`;
  // Same hero as the join page, deliberately: this is the SAME poster being
  // scanned, and a customer who gets a generic white card here and a branded one
  // tomorrow has no way to know it was the same shop. It used to force the logo
  // into a 72x72 rounded square, which letterboxes a wide brand lockup down to a
  // sliver — the one shape most shops actually upload.
  const bg = card ? rgbToHex(card.background_color) : "";
  const onBg = bg ? contrastText(bg) : "";
  const css = bg
    ? /* css */ `
      .lhero { background: ${bg}; color: ${onBg}; margin: -20px -20px 18px; padding: 26px 20px 22px;
               border-radius: 0 0 22px 22px; text-align: center; }
      .lhero h1 { color: ${onBg}; margin: 0; font-size: 1.6rem; }
      .lhero img { height: 76px; width: auto; max-width: min(280px, 100%);
                   object-fit: contain; margin-bottom: 10px; }
      .card { overflow: hidden; }`
    : "";
  const logo = logoVersion && cardId
    ? `<img src="${base}/art/logo.png?v=${logoVersion}" alt="">`
    : "";
  return page(
    `${business} — coming soon`,
    `<div class="card" style="text-align:center">
      <div class="${bg ? "lhero" : ""}">
        ${logo}
        <h1>${esc(business)}</h1>
      </div>
      <p class="sub">Their loyalty card isn’t open yet. Check back soon.</p>
    </div>`,
    css,
  );
}

/**
 * Claim your shop: the card we built for you, then the login to run it.
 *
 * Two jobs in one page, in that order on purpose. The merchant agreed to this
 * over a DM and may not remember exactly what they agreed to, so the first
 * thing they see is their own name and their own card — not a signup form.
 *
 * The token is in the URL, which is the authorisation. Everything else here is
 * the same shape as the reset page: set a password, get a session, land inside.
 */
export function claimPage(
  token: string,
  business: string,
  card: Pick<CardRow, "id" | "reward" | "stamps_target"> | null,
  logoVersion: number,
): string {
  const base = !card || card.id === "default" ? "" : `/c/${card.id}`;
  const logo = logoVersion
    ? `<img class="cl-logo" src="${base}/art/logo.png?v=${logoVersion}" alt="">`
    : "";
  const css = /* css */ `
    .cl-shop { text-align: center; margin-bottom: 6px; }
    /* Height-bound so a wide brand lockup keeps its width — see .pv-logo. */
    .cl-logo { height: 76px; width: auto; max-width: min(280px, 100%); border-radius: 18px;
               object-fit: contain; margin: 0 auto 12px; display: block; box-shadow: var(--shadow); }
    .cl-name { font-family: var(--display); font-size: 1.7rem; line-height: 1.1;
               letter-spacing: -.02em; margin: 0; }
    .cl-reward { color: var(--muted); margin: 8px 0 0; }
    .cl-done { text-align: center; }
    ${MODAL_CSS}
  `;
  const js = /* js */ `
    ${MODAL_JS}
    const $ = (s) => document.querySelector(s);
    const TOKEN = ${JSON.stringify(token)};
    function toast(msg) { const t = $(".toast"); t.textContent = msg; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2800); }
    $("#eye").onchange = () => { $("#pw").type = $("#eye").checked ? "text" : "password"; };
    $("#go").onclick = async () => {
      const email = $("#email").value.trim(), password = $("#pw").value;
      if (!email.includes("@")) return toast("Enter your email");
      if (!password || password.length < 8) return toast("Password needs at least 8 characters");
      $("#go").disabled = true;
      const r = await fetch("/claim/" + encodeURIComponent(TOKEN) + "/finish", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await r.json().catch(() => ({}));
      $("#go").disabled = false;
      if (!body.ok) {
        return toast(
          body.error === "email-taken" ? "That email already has an account — log in instead."
          : body.error === "invalid-or-expired-link" || body.error === "already-claimed"
            ? "This link has already been used. Ask us for a new one."
          : body.error === "too-many-attempts" ? "Too many tries — wait a few minutes."
          : "Couldn’t finish. Try again.");
      }
      // No PIN here any more. This screen used to print one under "write it
      // down now" — the only moment it could ever be read, since only a hash is
      // stored — which made handing somebody their shop a memory test at the
      // exact moment they are least ready for one. They pick their own under
      // Shop, and the dashboard tells them the counter is waiting on it.
      $("#app").innerHTML =
        '<div class="cl-done"><h1>You’re in ✅</h1>' +
        '<p class="sub">Your shop is yours. Next: pick a staff PIN so your counter can start stamping.</p>' +
        '<button class="btn btn-dark" style="margin-top:16px" id="dash">Go to my dashboard</button></div>';
      $("#dash").onclick = () => { location.href = "/dashboard"; };
    };
  `;
  return page(
    `Claim ${business}`,
    `<div class="card" id="app">
      <div class="cl-shop">
        ${logo}
        <p class="cl-name">${esc(business)}</p>
        ${card ? `<p class="cl-reward">${signupLine(card as CardRow)}</p>` : ""}
      </div>
      <h2 style="margin-top:22px">Set up your login</h2>
      <p class="sub">Your card is already built. This is the account you’ll use to run it.</p>
      <label>Email</label><input id="email" type="email" autocomplete="username">
      <label style="margin-top:10px">Password (min 8 characters)</label>
      <input id="pw" type="password" autocomplete="new-password">
      <label class="eye"><input type="checkbox" id="eye"> Show password</label>
      <button class="btn btn-dark" style="margin-top:16px" id="go">Claim my shop</button>
      <p class="muted" style="margin-top:12px;font-size:.8rem">By claiming you accept our
        <a href="/terms" target="_blank">Terms</a> and
        <a href="/privacy" target="_blank">Privacy Policy</a>.</p>
    </div><div class="toast"></div>`,
    css,
    js,
  );
}

// ----------------------------------------------------------- marketing ----

/**
 * The product front door at `/` — a one-scroll pitch for shop owners, modelled
 * on the Lassie treatment: warm off-white ground, serif headlines, photography
 * doing the colour work, and a great deal of air. No accent colour by design.
 *
 * Static and boots with zero secrets. Every CTA leads to the owner sign-up.
 *
 * PLACEHOLDERS the founder still has to supply are marked TODO(founder) below:
 * the demo-pass link, the six example cards, the contact details, and the hero
 * clip that will eventually replace the hero still.
 */
/**
 * @param contactEmail the address the contact buttons and footer use. Threaded
 *   in like privacyPage/termsPage rather than hard-coded: it is one value in
 *   Railway, and a marketing page carrying a different address from the legal
 *   pages is exactly the inconsistency a reviewer looks for.
 */
/**
 * The marketing page, and the reference implementation of the house style.
 *
 * It was eight sections and had come apart: a feature carousel whose markup was
 * duplicated and never closed (so it rendered squeezed inside an unclosed
 * .lede, with two orphan headings), a "run it from your phone" section that
 * showed the same screenshot under two different labels, and a whole block of
 * CSS for a "how it works" section that had never been written. Six sections
 * now, in the order a visitor needs them: the hook, what they get, how it
 * works, who it fits, who we are, what it costs.
 *
 * Life comes from the four colour tiles in section two, not from ornament, and
 * they are the only place on any surface those colours appear (DESIGN.md).
 */
export function marketingPage(contactEmail = "", demoCardId = DEFAULT_CARD_ID): string {
  const css = /* css */ `
    :root {
      --paper: var(--bg); --soft: var(--surface);
      --ink-2: var(--muted); --hair: var(--line);
      --neon: var(--accent); --neon-2: var(--accent-2);
      --r: 28px; --r-sm: 14px;
      /* The four tile surfaces. They live here and on no other page: see
         "The marketing tiles" in DESIGN.md before adding a fifth. */
      --tile-lime: #c9f73d; --tile-sky: #57c7ff; --tile-pink: #ff9ecd;
    }
    html { scroll-behavior: smooth; }
    @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
    body { display: block; padding: 0 0 46px; align-items: stretch;
           background: var(--paper); color: var(--ink); font-family: var(--body); }
    ::selection { background: var(--neon); color: var(--ink); }
    img { max-width: 100%; display: block; }
    /* The gutter's MINIMUM is what a phone gets: 4vw of a 390px screen is 15.6px,
       so the clamp floor was doing all the work and every box and every line of
       type sat 18px from the glass. 26px is the floor now, which is what stops
       the page reading as edge-to-edge on a phone. */
    .shell { max-width: 1180px; margin: 0 auto; padding: 0 clamp(26px, 4vw, 40px); }
    /* One family, two weights. The whole look rests on the display weight being
       genuinely heavy rather than merely bold. */
    h1, h2, h3, h4, .dsp { font-family: var(--display); font-weight: 800;
                           letter-spacing: -.03em; line-height: 1.02; text-wrap: balance; }
    a { color: inherit; }
    /* Ink, everywhere. A neon ring is invisible against the neon buttons it most
       needs to mark, and this page no longer has a dark surface to need the
       other direction - the black how-it-works panel was the last one. */
    :where(a, button):focus-visible { outline: 3px solid var(--ink);
                                      outline-offset: 3px; border-radius: 6px; }

    /* ---------------------------------------------------------------- nav -- */
    /* A pill that floats OVER the page, not a bar bolted across the top of it.
       Full-bleed with a hairline, it read as browser chrome sitting on the
       design rather than as part of it. The strip itself takes no pointer
       events, so the transparent margin either side of the pill cannot swallow
       a click meant for the page underneath. */
    .nav { position: sticky; top: 0; z-index: 70; pointer-events: none;
           padding: clamp(10px, 1.6vw, 16px) clamp(12px, 3vw, 22px); }
    .navin { max-width: 680px; margin: 0 auto; pointer-events: auto;
             display: flex; align-items: center; gap: 14px;
             padding: 10px 10px 10px 24px; border-radius: 999px;
             background: rgba(242,244,241,.86);
             backdrop-filter: saturate(1.4) blur(14px);
             border: 1px solid var(--hair);
             box-shadow: 0 10px 30px -16px rgba(12,14,13,.4); }
    .brand { display: flex; align-items: center; text-decoration: none; }
    /* No blend mode any more: the logo is a genuinely transparent PNG now.
       multiply was papering over an opaque white ground, and it only ever
       half-worked - against the translucent pill it left a white rim that
       showed the moment anything scrolled behind it. */
    .brand img { height: 27px; width: auto; display: block; }
    /* The two section links are gone: Instagram and Message us are the only
       things in here now, both hard right, and the pill tightens to suit. */
    .navin { max-width: 580px; }
    .ig { margin-left: auto; display: grid; place-items: center; width: 44px; height: 44px;
          border-radius: 50%; color: var(--ink); text-decoration: none;
          transition: background .15s ease; }
    .ig:hover { background: rgba(12,14,13,.08); }
    .ig svg { display: block; }
    @media (prefers-reduced-motion: reduce) { .ig { transition: none; } }
    /* The one thing on the page that has to be pressed, so it is sized like it:
       bigger than the body button scale, not smaller. */
    .nav .pbtn { padding: 14px 28px; font-size: 1.02rem; }
    /* "Start your 30 days free" is a long label for a pill that also holds a
       logo and an icon. At 320px it ran past the pill's right edge, so the whole
       bar steps down a size rather than the label being shortened - the offer is
       the point of the button. */
    @media (max-width: 460px) {
      .navin { gap: 10px; padding: 8px 8px 8px 16px; }
      .brand img { height: 21px; }
      .ig { width: 36px; height: 36px; }
      .ig svg { width: 20px; height: 20px; }
      .nav .pbtn { padding: 11px 15px; font-size: .84rem; }
    }

    /* -------------------------------------------------------------- buttons -- */
    .pbtn { display: inline-flex; align-items: center; justify-content: center; gap: 8px;
           font-family: var(--body); font-weight: 700; font-size: .95rem; text-decoration: none;
           padding: 13px 22px; border-radius: 999px; border: 2px solid transparent;
           white-space: nowrap; cursor: pointer; transition: background .15s ease, color .15s ease; }
    .pbtn-neon { background: var(--neon); color: var(--ink); }
    .pbtn-neon:hover { background: var(--neon-2); }
    .pbtn-line { background: transparent; color: var(--ink); border-color: var(--ink); }
    .pbtn-line:hover { background: var(--ink); color: var(--paper); }
    @media (prefers-reduced-motion: reduce) { .pbtn { transition: none; } }

    /* A live ring in the two brand greens, and no third hue: two backgrounds,
       a flat neon on the padding box and the turning cone on the border box.
       No extra element, so nothing has to sit above the pill's backdrop-filter.
       The resting state is an ordinary neon pill, which is what a browser
       without @property and a visitor who asked for less motion both get. */
    @property --ring { syntax: "<angle>"; initial-value: 0deg; inherits: false; }
    .pbtn-glow { color: var(--ink); border: 3px solid transparent; transition: none;
                 background: linear-gradient(var(--neon), var(--neon)) padding-box,
                             conic-gradient(from var(--ring), var(--neon), #f0ffc4,
                                            var(--neon-2), #f0ffc4, var(--neon)) border-box;
                 animation: ring 3.2s linear infinite; }
    @keyframes ring { to { --ring: 360deg; } }
    @media (prefers-reduced-motion: reduce) { .pbtn-glow { animation: none; } }

    /* -------------------------------------------------------------- layout -- */
    .band { padding: clamp(56px, 8vw, 108px) 0; }
    .band.tight { padding: clamp(38px, 5vw, 68px) 0; }
    /* The measure belongs on the heading, not the wrapper: ch resolves against
       the element's own font-size, so 20ch here is 20 characters of display
       type. On the wrapper it was 20 characters of body type, which squeezed
       every section heading into two words a line. */
    .lede { max-width: 820px; margin: 0 auto clamp(34px, 5vw, 58px); text-align: center; }
    .lede h2 { font-size: clamp(2rem, 5vw, 3.2rem); max-width: 20ch; margin: 0 auto; }
    .lede p { margin: 16px auto 0; max-width: 46ch; color: var(--ink-2); font-size: 1.02rem;
              line-height: 1.55; }
    /* The brand LETTERING set into a heading, in place of the word typed out.
       The full lockup does not work here. Its letters are only 133px of a 230px
       file, so matching them to the heading's caps makes the hexagon tower 70%
       above the line, and matching the hexagon leaves the letters at 60% of the
       size of the word beside them. The icon is already in the nav; what was
       asked for was the font.
       .72em is Figtree's cap height at 800, and "PunchMe" has no descender, so
       the file's ink bottom IS its baseline — which is where an inline image on
       vertical-align: baseline already sits. No nudge needed. */
    .lede.shout h2 .wordmark { height: .72em; width: auto; display: inline-block;
                               vertical-align: baseline; margin: 0 .04em; }
    /* Emphasis inside a shouted heading, sized in em so it tracks the clamp
       rather than needing a breakpoint of its own. */
    .lede.shout h2 mark { background: var(--neon); color: var(--on-accent);
                          padding: 0 .08em; margin-right: -.03em; border-radius: .06em; }
    /* The two mid-page section headings set like the hero. It stops there: a
       page where every heading shouts has no emphasis left to spend, which is
       the whole reason the hero lands. Price, Who are we and the marquee keep
       the ordinary .lede h2. */
    .lede.shout h2 { text-transform: uppercase; letter-spacing: -.035em;
                     font-size: clamp(2.2rem, 6.6vw, 4.8rem); max-width: 15ch; }

    /* ---------------------------------------------------------------- hero -- */
    /* Roughly 60% of visitors never scroll, so this screen carries the whole
       argument: the outcome, what it is, one action, and a card they can put in
       their own phone in ten seconds. Everything else was cut. */
    .hero { text-align: center; padding: clamp(24px, 3.2vw, 54px) 0 clamp(30px, 4vw, 62px); }
    /* Caps, and short enough to hold two lines. Set through text-transform
       rather than typed in capitals, so the accessible name stays a sentence.
       Caps want less negative tracking than lowercase does. */
    .hero h1 { font-size: clamp(2.5rem, 8.4vw, 6.6rem); letter-spacing: -.035em;
               text-transform: uppercase; margin: 0 auto; max-width: 15ch; }
    /* The last word cycles. The words are stacked absolutely inside a box the
       height of one line, so nothing below it moves as they change.
       Every word but the first RESTS hidden and is animated INTO view with no
       fill-mode, so a browser that never runs the animation shows exactly one
       word rather than four on top of each other (DESIGN.md rule 7). */
    .flip { display: block; position: relative; height: 1.02em; }
    .flip span { position: absolute; inset: 0; display: block; opacity: 0;
                 animation: flipword 7.2s linear infinite; }
    .flip span:nth-child(1) { opacity: 1; animation-delay: 0s; }
    .flip span:nth-child(2) { animation-delay: 1.8s; }
    .flip span:nth-child(3) { animation-delay: 3.6s; }
    .flip span:nth-child(4) { animation-delay: 5.4s; }
    /* 25% of the cycle is one word's turn; it is fully visible for most of that
       and hands over in the last fifth. The first word is opaque at rest, so its
       keyframes have to put it back to 0 for the other three's turn. */
    @keyframes flipword {
      0%    { opacity: 0; transform: translateY(.32em); }
      3%, 22% { opacity: 1; transform: translateY(0); }
      25%, 100% { opacity: 0; transform: translateY(-.32em); }
    }
    @media (prefers-reduced-motion: reduce) {
      .flip span { animation: none; }
      .flip span:not(:first-child) { opacity: 0; }
    }
    .hero .sub { margin: clamp(12px, 1.6vw, 18px) auto 0; max-width: 34ch; color: var(--ink-2);
                 font-size: clamp(1rem, 1.7vw, 1.16rem); line-height: 1.45; }

    /* The product's own object, and the one image on the page that cannot be
       mistaken for stock. No radius and no clipping: the art sits ON the page
       rather than inside a panel, which is what made it read as a thumbnail in a
       beige tile. Wide, because the phones are the proof. */
    /* The number tracks the file: it is 1933px wide, so 960 CSS px is 1:1 on a
       2x screen. Stretching it even 8% softens the QR codes and the code line
       under them, which are the finest detail in the shot and the first thing
       to smear. Re-check this if the art is replaced again. */
    .shot { margin: clamp(18px, 2.4vw, 34px) auto 0; width: min(960px, 100%); }
    /* No mask and no blend mode: the ground in this file IS the page's white,
       keyed to it when the art was brought in (scripts note in the commit), so
       the phones already sit on the page. Doing it in the pixels rather than in
       CSS is what keeps the lime card the right lime - a global levels lift
       whitens the ground and shifts every other colour with it.
       height:auto, or the intrinsic height attribute wins. */
    .shot img { width: 100%; height: auto; }
    .try { margin: clamp(12px, 1.8vw, 20px) 0 0; font-size: .78rem; font-weight: 700;
           letter-spacing: .1em; text-transform: uppercase; color: var(--ink-2); }
    .wallets { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center;
               margin-top: 12px; }
    .wallets svg { flex: none; display: block; }
    .wmark { font-size: 1.06em; line-height: 1; }

    /* --------------------------------------------------------------- tiles -- */
    /* The COLOUR is the art block and the words sit under it on the page. They
       were cards, and a card puts a box round type that reads perfectly well on
       white - the boxes were competing with the images for the eye. The blocks
       hold no buttons and no links, which is what keeps the neon meaning
       "press this" everywhere else on the page. */
    .tiles { display: grid; gap: clamp(22px, 3vw, 34px); }
    @media (min-width: 900px) { .tiles { grid-template-columns: repeat(3, 1fr); } }
    .tile { color: var(--ink); }
    /* The art is a background, not an img, so a slot whose file has not landed
       yet is a clean coloured panel rather than a broken-image icon. Taller than
       it is wide: these are the focus of the section. */
    .tile .art { aspect-ratio: 4 / 5; border-radius: var(--r);
                 margin-bottom: clamp(14px, 1.8vw, 20px);
                 background: center/cover no-repeat; }
    .tile h3 { font-size: clamp(1.3rem, 2vw, 1.7rem); margin-bottom: 7px; }
    .tile p { margin: 0; font-size: .96rem; line-height: 1.45; color: var(--ink-2); }
    .art.lime { background-color: var(--tile-lime); }
    .art.sky  { background-color: var(--tile-sky); }
    .art.pink { background-color: var(--tile-pink); }

    /* ------------------------------------------------------- how it works -- */
    /* Three steps in three boxes, matching section two's three blocks above
       them. This was a black panel with a numbered flow down it; the panel was
       the page's only --slab surface, so losing it means the weight now comes
       from the shouted heading and the colour chips rather than from a dark
       block. That is a deliberate trade, not an oversight: see DESIGN.md. */
    .steps { display: grid; gap: 14px; }
    @media (min-width: 900px) { .steps { grid-template-columns: repeat(3, 1fr); } }
    .step { background: var(--soft); border: 1px solid var(--hair); border-radius: var(--r);
            padding: clamp(28px, 3.2vw, 44px) clamp(22px, 2.6vw, 34px); text-align: center; }
    /* The chips run lime, sky, pink in the same order as the blocks above, so
       the two sections read as one system rather than two colour schemes. */
    .chip { display: inline-grid; place-items: center; width: 60px; height: 60px;
            border-radius: 18px; margin-bottom: clamp(14px, 1.8vw, 20px); color: var(--ink); }
    .chip svg { display: block; }
    .chip.lime { background: var(--tile-lime); }
    .chip.sky  { background: var(--tile-sky); }
    .chip.pink { background: var(--tile-pink); }
    .step h3 { font-size: clamp(1.18rem, 1.9vw, 1.46rem); margin-bottom: 8px; }
    .step p { margin: 0 auto; max-width: 30ch; color: var(--ink-2);
              font-size: .98rem; line-height: 1.5; }

    /* --------------------------------------------------------------- slide -- */
    /* Lives here rather than beside a component because the reassurance band is
       the only user now. The example-card marquee that shared it is gone. */
    @keyframes slide { from { transform: translateX(0); } to { transform: translateX(-50%); } }

    /* ------------------------------------------------------------------ us -- */
    /* No card any more: the heading sits over the section and the copy sits to
       the RIGHT of a picture, which needs the two to be one grid rather than a
       panel with everything stacked inside it. */
    .us { max-width: 1100px; margin: 0 auto; display: grid; gap: clamp(24px, 4vw, 60px); }
    @media (min-width: 900px) { .us { grid-template-columns: .82fr 1.18fr; align-items: center; } }
    /* The picture is not here yet. Same trick the feature blocks use: a
       background on a sized block, so the slot is a clean panel until the file
       lands rather than a broken-image icon. */
    .us .art { aspect-ratio: 4 / 5; border-radius: var(--r);
               background: var(--soft) center/cover no-repeat; }
    .us p { color: var(--ink-2); font-size: 1.04rem; line-height: 1.62; margin-bottom: 16px; }
    .us p:last-child { margin-bottom: 0; }
    /* The one line that carries the section, set like a heading rather than
       like body: it is the claim, everything under it is the elaboration. */
    .us .lead { font-family: var(--display); font-weight: 800; letter-spacing: -.03em;
                line-height: 1.08; color: var(--ink);
                font-size: clamp(1.7rem, 3.4vw, 2.5rem); margin-bottom: 22px; }
    /* The closing line gets air above it, as a paragraph break would give it,
       and carries the section out in ink rather than the muted body colour -
       bold at --ink-2 reads as a heavier grey, not as emphasis. */
    .us .close-line { margin-top: 28px; font-weight: 700; color: var(--ink); }

    /* ---------------------------------------------------------- ticker -- */
    /* The four reasons not to worry, as a green band pinned to the bottom of
       the viewport. They were a quiet row above the price button.
       This is the biggest departure from rule 1 in the file - a large neon
       background is exactly what that rule forbids - and it is the founder's
       explicit call. It carries NO control, which is the one thing that keeps
       the rule's intent alive: nothing on the band competes with the nav pill
       for the meaning "press this". Do not put a link in here.
       Height is fixed at 46px and body reserves it, so the band can never sit
       over the footer. */
    .ticker { position: fixed; left: 0; right: 0; bottom: 0; z-index: 60; height: 46px;
              background: var(--neon); color: var(--ink); overflow: hidden;
              display: flex; align-items: center;
              border-top: 1px solid rgba(12,14,13,.16); }
    .tktrack { display: flex; width: max-content; animation: slide 46s linear infinite; }
    .ticker:hover .tktrack, .ticker:focus-within .tktrack { animation-play-state: paused; }
    .tkitem { display: flex; align-items: center; gap: 9px; padding: 0 26px;
              font-size: .88rem; font-weight: 700; white-space: nowrap; }
    .tkitem svg { flex: none; display: block; }
    /* The one accessible copy of the band's claims. Not display:none, which
       would take it out of the accessibility tree along with everything else. */
    .vh { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;
          overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
    /* Same treatment the example-card marquee gets: with motion off it becomes
       an ordinary scroller, not a frozen strip the reader cannot get past. */
    @media (prefers-reduced-motion: reduce) {
      .ticker { overflow-x: auto; }
      .tktrack { animation: none; }
    }

    /* --------------------------------------------------------------- price -- */
    .price { max-width: 460px; margin: 0 auto; border: 2px solid var(--ink);
             border-radius: var(--r); padding: clamp(28px, 4vw, 44px); text-align: center; }
    .price .amt { font-family: var(--display); font-weight: 800; font-size: clamp(3rem, 8vw, 4.4rem);
                  letter-spacing: -.045em; line-height: 1;
                  display: flex; align-items: baseline; justify-content: center; gap: 6px; }
    /* Beside the number on its baseline, not under it: the unit belongs to the
       price, and a line of its own read as a second fact. */
    .price .per { font-family: var(--body); font-weight: 600; font-size: 1.02rem;
                  letter-spacing: 0; color: var(--ink-2); }
    .price ul { list-style: none; margin: 26px 0; padding: 0; text-align: left;
                display: flex; flex-direction: column; gap: 11px; }
    .price li { display: flex; gap: 11px; align-items: flex-start; font-size: .96rem;
                font-weight: 500; line-height: 1.4; }
    /* A real tick. Two crossed gradients read as a slash, which on a price list
       looks like the feature is excluded. */
    .price li::before { content: ""; flex: none; width: 20px; height: 20px; margin-top: 2px;
                        border-radius: 50%;
                        background: var(--neon) center/11px 11px no-repeat;
                        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M1.6 6.5l2.9 2.9 5.9-6.8' fill='none' stroke='%230c0e0d' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"); }
    .price .pbtn { width: 100%; }
    /* Emphasis on neon, which is what --on-accent exists for: dark text on the
       accent, never the other way round. One word, not a surface.
       The gap after it was 7px against a 3.7px word space on the same line, and
       the cause was structural, not padding: .price li is a flex row, so a bare
       <mark> became its own flex ITEM and the row's 11px gap landed between it
       and the words after it. The text is wrapped in a span now, which puts the
       mark back in normal inline flow - so what follows it is a space. */
    .price mark { background: var(--neon); color: var(--on-accent); font-weight: 700;
                  padding: 1px 5px; border-radius: 5px; }

    /* ---------------------------------------------------------------- foot -- */
    .foot { border-top: 1px solid var(--hair); padding: 26px 0 44px; display: flex;
            flex-wrap: wrap; gap: 10px 24px; align-items: center;
            justify-content: space-between; color: var(--ink-2); font-size: .86rem; }
    .foot a { text-decoration: none; }
    .foot a:hover { color: var(--ink); }
    .foot nav { display: flex; gap: 20px; }
  `;

  /**
   * The three tiles. Each art file is optional: until it lands in assets/img the
   * slot renders as a clean panel in the tile's own colour.
   *
   * Headings are one or two words on purpose - assume the visitor reads only
   * those. The wallet claim leads because it is the one a rival web-app cannot
   * truthfully copy, and it carries the privacy promise as its own last clause
   * now that there is no separate tile for it.
   *
   * The third tile says NUMBERS and never identities. Every figure named there
   * is one cardMetrics (src/db.ts) actually returns - customers counted per
   * person, net stamps, who has gone quiet. Nothing here may imply an owner
   * learns WHO someone is: identity is a signed cookie and nothing else, and
   * the privacy page promises exactly that.
   *
   * tone, art file, heading, line
   */
  const TILES: [string, string, string, string][] = [
    [
      "lime",
      "tile-wallet-v1.webp",
      "Lives in their wallet",
      "No app to download. 3 seconds to sign up.",
    ],
    [
      "sky",
      "tile-notify-v2.webp",
      "Push notifications to their screen",
      "Send reminders, promotions and campaigns to bring them back.",
    ],
    [
      "pink",
      "tile-numbers-v1.webp",
      "Know your numbers",
      "All of it from your phone. Anywhere, anytime. Nothing to install.",
    ],
  ];
  const tiles = TILES.map(
    ([tone, art, head, line]) => `<article class="tile">
        <div class="art ${tone}" style="background-image:url('/assets/img/${art}')" role="presentation"></div>
        <h3>${head}</h3>
        <p>${line}</p>
      </article>`,
  ).join("");

  /**
   * The three step icons, drawn here rather than pulled in: there is no icon
   * library and no build step to add one (CLAUDE.md 12). Line weight and the
   * 26px box are shared so the three sit at the same visual size, and they take
   * currentColor so the chip decides the ink.
   */
  const ICON_FRAME = `<path d="M3 8V5.4A2.4 2.4 0 0 1 5.4 3H8M18 3h2.6A2.4 2.4 0 0 1 23 5.4V8M23 18v2.6a2.4 2.4 0 0 1-2.4 2.4H18M8 23H5.4A2.4 2.4 0 0 1 3 20.6V18"
      fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>`;
  const ICON_ADD = `<svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
      ${ICON_FRAME}<path d="M13 9.4v7.2M9.4 13h7.2" fill="none" stroke="currentColor"
        stroke-width="2.2" stroke-linecap="round"/></svg>`;
  const ICON_STAMP = `<svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
      ${ICON_FRAME}<path d="M3.4 13h19.2" fill="none" stroke="currentColor"
        stroke-width="2.2" stroke-linecap="round"/></svg>`;
  const ICON_REWARD = `<svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
      <circle cx="13" cy="13" r="9.6" fill="none" stroke="currentColor" stroke-width="2.2"/>
      <path d="M8.8 13.3l2.9 2.9 5.5-6.2" fill="none" stroke="currentColor"
        stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  /**
   * The headline's last word. Order matters: "regulars" is the one that has to
   * survive, because it is the only one a reader with motion turned off, or a
   * screen reader, ever gets.
   */
  const FLIP_WORDS = ["regulars", "visits", "sales", "growth"];

  const ICON_INSTAGRAM = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" stroke-width="2"/>
      <circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="2"/>
      <circle cx="17.4" cy="6.6" r="1.3" fill="currentColor"/></svg>`;

  // Apple's own glyph, as the sign-up page already uses. Google has no
  // character for this, so it gets a drawn card mark at the same weight.
  // TODO(founder): swap this for Google's official "Add to Google Wallet"
  // badge artwork, which their brand guidelines ask for.
  const googleMark = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2.6" y="5.4" width="18.8" height="13.6" rx="3.4" stroke="currentColor" stroke-width="2"/>
      <path d="M2.6 10.4h18.8" stroke="currentColor" stroke-width="2"/>
    </svg>`;

  const script = /* js */ `
    (function () {
      // Lead with the wallet native to the phone, exactly as the sign-up page
      // does: an iPhone visitor pressing "try a demo card" should land on the
      // Apple sheet without first having to spot which button is theirs.
      var ua = navigator.userAgent || "";
      var prefer = /iPhone|iPad|iPod/.test(ua) ? "apple" : /Android/.test(ua) ? "google" : "";
      var btns = Array.prototype.slice.call(document.querySelectorAll(".wallets [data-w]"));
      if (!prefer || btns.length < 2) return;
      // Order only. Neither half goes neon: the hero already has the page's one
      // neon button, and these two offer the same thing on two platforms.
      btns.sort(function (a, b) { return (b.dataset.w === prefer) - (a.dataset.w === prefer); });
      btns.forEach(function (b) { b.parentNode.appendChild(b); });
    })();
  `;

  /**
   * Where "Message us" actually goes.
   *
   * It pointed at #contact - the closing block - and that block has been
   * removed, which would have left the page's one call to action scrolling
   * nowhere. That is the precise fault that cost us Google Wallet publishing
   * access the first time, so it gets a real destination or none at all:
   * the mailbox when one is configured, Instagram when it is not.
   */
  /**
   * The reassurance band. Four claims, every one of them true today and none of
   * them a number we cannot back (PRODUCT.md): the free first month and the
   * price are founder-confirmed, and no app / no card details are facts about
   * how the product works.
   *
   * The set is repeated three times and then doubled, so the track can loop at
   * exactly -50% with no seam AND still fill an ultrawide viewport - one set
   * doubled leaves a gap past about 1700px.
   */
  const REASSURANCE = [
    "First month free",
    "Set up in 5 minutes",
    "Manage everything from your phone",
    "No card details",
    "No app for your customers",
    "Cancel any time",
  ];
  const tick = `<svg width="15" height="15" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M1.6 6.5l2.9 2.9 5.9-6.8" fill="none" stroke="currentColor"
        stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const tickerSet = REASSURANCE.map(
    (t) => `<span class="tkitem">${tick}${t}</span>`,
  ).join("").repeat(3);

  /**
   * Where every "Message us" on the page goes - the nav pill and the price
   * button, deliberately the same destination.
   *
   * WhatsApp first, with the opening line already written, because a button that
   * drops someone into a chat with the message typed is the shortest path there
   * is. Then the mailbox, then Instagram.
   *
   * It never falls through to nothing. This button once pointed at #contact -
   * the section it sat in - and a reviewer pressing it and staying exactly where
   * they were is what cost us Google Wallet publishing access.
   */
  //
  // It goes through /go/start rather than straight out, so the press can be
  // counted: a click on an outbound link cannot be recorded from the browser
  // once the page is already navigating away. That route resolves the
  // destination and redirects, and it only ever redirects to https - which is
  // why the mailto fallback is not in this chain. It stays on the footer link,
  // where it is a plain mailto: and behaves.
  const contactCta = `href="/go/start"`;

  const body = `
    <header class="nav"><div class="navin">
      <a class="brand" href="/"><img src="/assets/img/punchme-logo-v2.png" alt="PunchMe" width="1034" height="230"></a>
      <a class="ig" href="https://instagram.com/punchme.my" target="_blank"
         rel="noopener" aria-label="PunchMe on Instagram">${ICON_INSTAGRAM}</a>
      <a class="pbtn pbtn-glow" ${contactCta}>Start your 30 days free</a>
    </div></header>

    <main>
      <!-- 1 - THE HOOK. The outcome first, never what the product is; what it
           is goes in the line underneath. One action, then a card the visitor
           can put in their own phone, because a demo they can check in ten
           seconds is worth more than any claim we could make here. -->
      <section class="shell"><div class="hero">
        <!-- The rotating words are aria-hidden and one plain copy follows, so
             the headline is announced once as a sentence rather than as four
             words running together. -->
        <h1>Turn loyalty into more
          <span class="flip" aria-hidden="true">${FLIP_WORDS.map((w) => `<span>${w}</span>`).join("")}</span>
          <span class="vh">${FLIP_WORDS[0]}</span></h1>
        <p class="sub">The stamp card that lives in your customer&rsquo;s wallet.</p>
        <div class="shot">
          <img src="/assets/img/hero-phones-v5.webp" width="1933" height="1517"
               alt="Three phones showing stamp cards in Apple Wallet: a milk tea shop, PunchMe and a kopitiam">
        </div>
        <p class="try">Try a demo card</p>
        <!-- Real destinations. These used to point at /dashboard, which is not a
             demo and not a wallet; both now issue an actual pass. -->
        <!-- The PunchMe Demo shop's own card. These used to issue from the seeded
             default card, which is still named Kopi Corner in production - so a
             visitor pressing "Apple Wallet" was handed somebody else's brand.
             Both routes log a wallet_click before anything can fail, so that
             shop's dashboard is also the count of who tried the card from this
             page, and pass_added is how many kept it. -->
        <div class="wallets">
          <a class="pbtn pbtn-line" data-w="apple" href="/c/${demoCardId}/enroll"><span class="wmark"
            aria-hidden="true">&#63743;</span> Apple Wallet</a>
          <a class="pbtn pbtn-line" data-w="google"
             href="/c/${demoCardId}/enroll/google">${googleMark} Google Wallet</a>
        </div>
      </div></section>

      <!-- 2 - WHAT THEY GET. Three tiles, one claim each, headings of a word or
           two. The wallet claim leads because it is the one a rival web-app
           cannot truthfully copy: "no app to download" is a line every one of
           them also runs, so it is a clause here, not the argument. -->
      <section class="band"><div class="shell">
        <div class="lede shout">
          <h2>Why <img class="wordmark" src="/assets/img/punchme-wordmark-v1.png"
            alt="PunchMe" width="808" height="133">?</h2>
        </div>
        <div class="tiles">${tiles}</div>
      </div></section>

      <!-- 3 - HOW IT WORKS. Three steps, not four: "we send you a poster" is
           our job, not a step the owner performs, and it was padding the list
           out to a number rather than to the work. -->
      <section class="band" id="how"><div class="shell">
        <div class="lede shout"><h2>How <img class="wordmark"
          src="/assets/img/punchme-wordmark-v1.png" alt="PunchMe" width="808" height="133"> works</h2></div>
        <div class="steps">
          <article class="step">
            <span class="chip lime">${ICON_ADD}</span>
            <h3>Scan to add</h3>
            <p>Customers scan a QR to add their card to Apple or Google Wallet.
              No app to download.</p>
          </article>
          <article class="step">
            <span class="chip sky">${ICON_STAMP}</span>
            <h3>Scan to stamp</h3>
            <p>When they return, staff scan the QR in the customer&rsquo;s wallet.</p>
          </article>
          <article class="step">
            <span class="chip pink">${ICON_REWARD}</span>
            <h3>Rewards, tracked</h3>
            <p>Progress updates automatically. They view it and redeem anytime.</p>
          </article>
        </div>
      </div></section>

      <!-- 4 - PRICE. The reasons not to worry sit here, immediately above the
           only button on the page that asks for a decision. -->
      <section class="band tight" id="price"><div class="shell">
        <div class="lede shout"><h2>First month <mark>free</mark></h2></div>
        <div class="price">
          <p class="amt">RM79<span class="per">/month</span></p>
          <ul>
            <li><span><mark>Unlimited</mark> loyalty members</span></li>
            <li><span>Customizable stamp card design</span></li>
            <li><span>Customizable reward rules</span></li>
            <li><span>Push notifications</span></li>
            <li><span>Basic analytics</span></li>
            <li><span>Direct support</span></li>
            <li><span>Done-for-you setup</span></li>
          </ul>
          <a class="pbtn pbtn-neon" ${contactCta}>Start your 30 days free</a>
        </div>
      </div></section>

      <!-- 5 - WHO WE ARE. Last on the page now, under the price: it is the thing
           a reader who is already sold goes looking for, not something anyone
           has to pass through on the way to what it costs.
           NOTE: DESIGN.md says a heading must carry its own benefit and names
           "Who are we?" as its anti-example. This one is the founder's explicit
           call - a page selling a service from two named people is a case where
           the plain label is the point. -->
      <section class="band tight"><div class="shell">
        <div class="lede shout"><h2>Who we are</h2></div>
        <div class="us">
          <div class="art" style="background-image:url('/assets/img/us-v2.webp')"
               role="presentation"></div>
          <div>
            <p class="lead">Two people. Too many ideas.</p>
            <p>We like building things and solving problems.</p>
            <p>Modern technology makes it possible to go from an idea to something real
              faster than ever.</p>
            <p>And we&rsquo;re here to make the most of it &mdash; to keep building,
              experimenting and pushing what we think is possible.</p>
            <p class="close-line">We&rsquo;re very excited to find out where this takes us.</p>
          </div>
        </div>
      </div></section>

      <!-- Who this is and how to reach them, on the page a stranger lands on.
           It used to say only "PunchMe - made in Kuala Lumpur" - a product and a
           city, with no way to verify the name on our Google business profile
           and nothing to write to.
           The "Want it on your counter" block that used to carry Email and
           Instagram is gone, so this footer and the nav button are now the only
           ways off the page to a person. Google refused Wallet publishing once
           because a reviewer pressed a contact button and stayed exactly where
           they were; keep every one of these pointing somewhere real. -->
      <div class="shell"><div class="foot">
        <span>PunchMe &middot; made in Kuala Lumpur${
          contactEmail ? ` &middot; <a href="mailto:${esc(contactEmail)}">${esc(contactEmail)}</a>` : ""
        }</span>
        <nav>
          <a href="/support">Support</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
        </nav>
      </div></div>
    </main>
    <!-- Pinned to the viewport, so the reasons not to worry are on screen at the
         moment the reader decides, wherever on the page that happens.
         The band itself is aria-hidden: the set is repeated six times to fill an
         ultrawide track, and a screen reader announcing "First month free" six
         times is noise, not reassurance. These claims used to sit in the price
         section, which is where they were read from - so one plain copy follows
         it, off screen, and that is the one assistive tech gets. -->
    <div class="ticker" aria-hidden="true"><div class="tktrack">${tickerSet}${tickerSet}</div></div>
    <ul class="vh">${REASSURANCE.map((t) => `<li>${t}</li>`).join("")}</ul>`;
  // No footer: this page IS the brand, and it signs off in its own footer.
  return page("PunchMe: the stamp card that lives in your customer's phone", body, css, script, false);
}

/**
 * Confirms this browser will not be counted in the site's traffic numbers.
 *
 * Its own tiny page rather than a line on an existing one: it is visited
 * deliberately, once per device, and it has to say plainly what just happened
 * so it is obvious the opt-out took.
 */
export function optOutPage(): string {
  return page(
    "Analytics off — PunchMe",
    `<div class="card" style="text-align:center">
      <h1>You will not be counted</h1>
      <p class="sub">This browser is now excluded from PunchMe&rsquo;s visitor numbers.
        Nothing about it is recorded from here on.</p>
      <p class="muted" style="margin-top:14px">Clearing this browser&rsquo;s cookies undoes
        it, so visit this page again after you do.</p>
      <a class="btn btn-dark" href="/" style="margin-top:18px">Back to the site</a>
    </div>`,
  );
}

// -------------------------------------------------------------- legal ----

const legalCss = /* css */ `
  body { display: block; padding: 0; align-items: stretch; }
  .legal { max-width: 760px; margin: 0 auto; padding: 40px 22px 80px; }
  .legal .back { color: var(--muted); text-decoration: none; font-weight: 600; font-size: .9rem; }
  .legal h1 { font-size: clamp(1.9rem, 5vw, 2.6rem); margin: 18px 0 6px; letter-spacing: -.02em; }
  .legal .upd { color: var(--muted); font-size: .88rem; margin-bottom: 8px; }
  .legal h2 { margin: 30px 0 8px; font-size: 1.2rem; }
  .legal p, .legal li { color: #3f4139; font-size: 1rem; line-height: 1.65; }
  .legal ul { margin: 6px 0 6px 20px; }
  .legal li { margin: 4px 0; }
  .legal .note { background: var(--bg); border: 1px solid var(--line); border-radius: 14px; padding: 16px 18px; margin-top: 28px; color: var(--ink-soft, #54574e); font-size: .92rem; }
`;

function contactLine(contactEmail: string): string {
  return contactEmail
    ? `email us at <a href="mailto:${contactEmail}">${contactEmail}</a>`
    : `reach us through the account you signed up with in your <a href="/dashboard">dashboard</a>`;
}

const UPDATED = "28 July 2026";

/**
 * How to get help — the page a stranger should land on, and the one Google's
 * business profile asks for as a customer support URL.
 *
 * It did not exist, so the support URL pointed at the Terms of Service, whose
 * contact line is a footnote under six sections of legal text. Two audiences
 * arrive here and want opposite things: an owner locked out of their dashboard,
 * and a customer holding a card who wants the shop, not us. Answer both in the
 * order they arrive, and hand the customer straight back to the shop — their
 * stamps are not ours to settle.
 */
export function supportPage(contactEmail = ""): string {
  const body = `<article class="legal">
    <a class="back" href="/">&larr; Back to PunchMe</a>
    <h1>Support</h1>
    <p class="upd">We reply the same day, Malaysian business hours.</p>
    <p>PunchMe makes the digital loyalty stamp cards that shops hand out through
      Apple Wallet and Google Wallet. Whatever you need, ${contactLine(contactEmail)}.</p>

    <h2>If you run a shop with PunchMe</h2>
    <ul>
      <li><strong>Can&rsquo;t log in?</strong> Use <a href="/dashboard">Forgot password</a> on the
        login page. If no email arrives, write to us and we will reset it by hand and send you a
        temporary password.</li>
      <li><strong>Staff can&rsquo;t stamp?</strong> Your counter PIN is under <em>Shop</em> in your
        dashboard, and you can replace it there. Changing it signs every staff phone out, which is
        the point &mdash; do it if a phone goes missing.</li>
      <li><strong>Want to change your card?</strong> Colours, logo, reward and the number of stamps
        are all in your dashboard, and changes reach cards already in wallets by themselves.
        Customers keep the deal they joined on until they claim it.</li>
      <li><strong>Something looks wrong?</strong> Tell us what you saw and roughly when. We keep a
        record of every stamp, so we can usually say exactly what happened.</li>
    </ul>

    <h2>If you have a loyalty card in your wallet</h2>
    <ul>
      <li><strong>Stamps, rewards and whether something counted</strong> are the shop&rsquo;s to
        settle, not ours &mdash; they run the programme and we only run the card. Ask at the counter.</li>
      <li><strong>To stop</strong>, delete the card from Apple Wallet or Google Wallet. That is the
        whole opt-out: nothing further reaches you, and there is no account to close.</li>
      <li><strong>Your data</strong> &mdash; we hold no name, email or phone number for you. To ask
        what we hold, correct it or have it deleted, ${contactLine(contactEmail)} and quote the
        short card code shown on your card, which is the only way we can find the right record.
        See the <a href="/privacy">Privacy Policy</a>.</li>
    </ul>

    <h2>Contact</h2>
    <p>However you found us, ${contactLine(contactEmail)}. Say which shop you mean and we will get
      to it faster.</p>

    <div class="note">PunchMe is in beta and free while we finish building it. If something is
      broken, telling us is genuinely useful &mdash; it is how most of this got fixed.</div>
  </article>`;
  return page("PunchMe — Support", body, legalCss);
}

/**
 * The PDPA (s.7(3)) requires the notice in English AND Bahasa Malaysia, so
 * these two pages are one obligation in two languages, not a page and a
 * translation. Change one, change the other — a discrepancy between them is
 * worse than either version alone.
 */
function langToggle(current: "en" | "bm"): string {
  return current === "en"
    ? `<p class="upd"><a href="/privacy?lang=bm">Baca dalam Bahasa Malaysia</a></p>`
    : `<p class="upd"><a href="/privacy">Read in English</a></p>`;
}

export function privacyPage(contactEmail = ""): string {
  const body = `<article class="legal">
    <a class="back" href="/">&larr; Back to PunchMe</a>
    <h1>Privacy Policy</h1>
    <p class="upd">Last updated ${UPDATED}</p>
    ${langToggle("en")}
    <p>PunchMe provides digital loyalty stamp cards that live in Apple Wallet and Google Wallet. This policy explains what we collect and why, in plain language. It is written to meet Malaysia&rsquo;s Personal Data Protection Act 2010 (PDPA).</p>

    <h2>The short version, for customers</h2>
    <p>We never ask you for your name, phone number or email address, and there is no account to create. Your loyalty card is a card in your phone&rsquo;s wallet — nothing more. <strong>If you want to stop, delete the card from your wallet.</strong> That is the whole opt-out: no form, no email, nothing to cancel.</p>

    <h2>What we collect from customers</h2>
    <p>We do <strong>not</strong> ask for, and never hold, your name, email address, phone number, date of birth or payment details. What we do hold, from the moment you add a card:</p>
    <ul>
      <li><strong>A random card number and a short card code</strong> — the identifiers printed in the card&rsquo;s barcode, so staff can scan it.</li>
      <li><strong>Your stamps</strong> — the current count, and the date and time of each stamp, reward and correction.</li>
      <li><strong>Which wallet you use</strong> — Apple or Google.</li>
      <li><strong>Technical information your browser sends</strong> when you open a join page: the browser and device type it identifies itself as, and the link or page you arrived from. We use this to tell real customers from link previews and web crawlers, and to see where sign-ups come from.</li>
      <li><strong>A delivery address for your card</strong> — for Apple, a push token from your device; for Google, the card&rsquo;s reference in Google&rsquo;s system. This is what lets the card update itself when you get a stamp.</li>
      <li><strong>The loyalty messages sent to your card</strong> — the wording of each message and whether it arrived.</li>
      <li><strong>A cookie in your browser</strong>, set for the shop you joined, so a second visit adds a stamp to the card you already have instead of issuing you another one. It contains a random reference and nothing else.</li>
    </ul>
    <p>None of this is your identity. It identifies a <em>card in a browser</em>: a new phone reads as a new customer, and we accept that rather than ask you who you are. Each shop is separate — if you hold cards at two shops, those are two unconnected records, and neither shop can see the other.</p>

    <h2>Visitors to this website</h2>
    <p>Separately from any card, we count visits to our own public pages &mdash; this
      page, the home page, Support and Terms. We store the page you opened, the site
      you arrived from, what your browser says it is, and <strong>a random reference
      in a cookie</strong> so that ten visits from you are not counted as ten
      different people. That reference is a string of random characters. It is not
      linked to you, to any card, to any shop, or to anything else we hold, and
      there is nothing we could look it up against.</p>
    <p>We do this to see whether the website is working, and nothing else. There is
      no advertising, no third-party analytics service, and nothing is shared with
      anyone. If you would rather not be counted at all, open
      <a href="/analytics-optout">/analytics-optout</a> and this browser will be
      excluded from then on.</p>

    <h2>What we collect from café owners</h2>
    <p>Your email address, a securely hashed password (we can never see the password itself), your staff PIN as a one-way hash, and the card details you enter: café name, reward, colours, and any logo or banner you upload.</p>

    <h2>Why we collect it</h2>
    <ul>
      <li>To run the loyalty programme: issue cards, add stamps, and show the reward.</li>
      <li>To update your card and send loyalty notifications — a new stamp, or a &ldquo;we miss you&rdquo; message — through your wallet.</li>
      <li>To show the café their own numbers: how many cards, stamps and rewards.</li>
      <li>To keep the service working and secure, and to stop abuse.</li>
    </ul>
    <p>We do <strong>not</strong> sell your data, we do <strong>not</strong> use it for advertising, and we do <strong>not</strong> combine what one café knows about you with any other café.</p>

    <h2>Who is responsible for your data</h2>
    <p>The café whose card you hold decides how your loyalty data is used — under the PDPA they are the data user. PunchMe runs the system on their behalf as their data processor. <strong>A café can see only its own cards, stamps and messages</strong>, never another café&rsquo;s and never anything about you beyond what is listed above.</p>

    <h2>Who else receives it</h2>
    <ul>
      <li><strong>Apple</strong> — receives your device&rsquo;s push token so it can tell your phone the card changed. The alert itself carries no content.</li>
      <li><strong>Google</strong> — hosts the card on Android, so it receives the card number, short code, stamp count, reward wording and the text of any message shown on the card.</li>
      <li><strong>Railway</strong> — our hosting provider, which runs the servers and the database.</li>
    </ul>
    <p>These providers operate outside Malaysia, so running the service involves transferring data overseas. We only use providers that offer protection comparable to the PDPA, and we send them the minimum the card needs to work. Apple and Google handle what they receive under their own privacy policies.</p>

    <h2>Where it&rsquo;s stored</h2>
    <p>In a managed PostgreSQL database at Railway, transmitted over encrypted (HTTPS) connections. Passwords and staff PINs are one-way hashed and are never stored in a form anyone can read back.</p>

    <h2>How long we keep it</h2>
    <p>Your card and its stamps are kept while the card is in your wallet. <strong>Delete the card and it stops updating and receives nothing further</strong> — no more stamps, no more messages.</p>
    <p>We do keep the record that the card existed and the stamps it earned, because that history is the café&rsquo;s own record of its business — how many people joined, how many came back, how many rewards it gave out. It stays attached to a random card number, never to a name. Cards that were never stamped and never reached a wallet are deleted automatically after 30 days.</p>
    <p>Café account data is kept while the account is open.</p>

    <h2>Your rights (PDPA)</h2>
    <p>You may ask to access the personal data we hold about you, correct it, ask us to delete it, obtain a copy of it, limit how it is used, or withdraw your consent. To make a request, ${contactLine(contactEmail)}. Because we hold no name or contact details, you will need to give us your card&rsquo;s short code so we can find the right record. If your request is about a particular café&rsquo;s programme, we will pass it to that café, who decides as the data user.</p>

    <h2>Changes</h2>
    <p>We may update this policy as the product grows. We&rsquo;ll change the date above when we do.</p>

    <div class="note">PunchMe is in beta. This policy is a plain-language starting point, not legal advice — please have it reviewed by a professional before relying on it at scale.</div>
  </article>`;
  return page("PunchMe — Privacy Policy", body, legalCss);
}

/**
 * The Bahasa Malaysia notice. Required by PDPA s.7(3), which is why it is a
 * page and not a nice-to-have. Kept section-for-section identical to the
 * English above so the two can be diffed by eye.
 */
export function privacyPageBm(contactEmail = ""): string {
  const contact = contactEmail
    ? `e-mel kami di <a href="mailto:${contactEmail}">${contactEmail}</a>`
    : `hubungi kami melalui akaun yang anda daftar di <a href="/dashboard">papan pemuka</a> anda`;
  const body = `<article class="legal">
    <a class="back" href="/">&larr; Kembali ke PunchMe</a>
    <h1>Dasar Privasi</h1>
    <p class="upd">Dikemas kini ${UPDATED}</p>
    ${langToggle("bm")}
    <p>PunchMe menyediakan kad setia digital yang disimpan di dalam Apple Wallet dan Google Wallet. Dasar ini menerangkan apa yang kami kumpul dan sebabnya, dalam bahasa yang mudah. Ia ditulis untuk memenuhi Akta Perlindungan Data Peribadi 2010 (PDPA) Malaysia.</p>

    <h2>Ringkasnya, untuk pelanggan</h2>
    <p>Kami tidak pernah meminta nama, nombor telefon atau alamat e-mel anda, dan tiada akaun yang perlu dibuka. Kad setia anda hanyalah sekeping kad di dalam dompet telefon anda. <strong>Jika anda mahu berhenti, padamkan kad itu daripada dompet anda.</strong> Itu sahaja caranya: tiada borang, tiada e-mel, tiada apa-apa untuk dibatalkan.</p>

    <h2>Apa yang kami kumpul daripada pelanggan</h2>
    <p>Kami <strong>tidak</strong> meminta, dan tidak pernah menyimpan, nama, alamat e-mel, nombor telefon, tarikh lahir atau maklumat pembayaran anda. Apa yang kami simpan, bermula saat anda menambah kad:</p>
    <ul>
      <li><strong>Nombor kad rawak dan kod kad ringkas</strong> — pengenalan yang tercetak dalam kod bar kad, supaya kakitangan boleh mengimbasnya.</li>
      <li><strong>Setem anda</strong> — jumlah semasa, serta tarikh dan masa setiap setem, ganjaran dan pembetulan.</li>
      <li><strong>Dompet yang anda guna</strong> — Apple atau Google.</li>
      <li><strong>Maklumat teknikal yang dihantar oleh pelayar anda</strong> apabila anda membuka halaman sertai: jenis pelayar dan peranti yang dinyatakannya, serta pautan atau halaman yang membawa anda ke sini. Kami menggunakannya untuk membezakan pelanggan sebenar daripada pratonton pautan dan perangkak web, dan untuk melihat dari mana pendaftaran datang.</li>
      <li><strong>Alamat penghantaran untuk kad anda</strong> — bagi Apple, token tolakan daripada peranti anda; bagi Google, rujukan kad itu dalam sistem Google. Inilah yang membolehkan kad mengemas kini dirinya apabila anda menerima setem.</li>
      <li><strong>Mesej setia yang dihantar ke kad anda</strong> — kandungan setiap mesej dan sama ada ia sampai.</li>
      <li><strong>Satu kuki di dalam pelayar anda</strong>, ditetapkan untuk kedai yang anda sertai, supaya lawatan kedua menambah setem pada kad sedia ada dan bukannya mengeluarkan kad baharu. Ia mengandungi rujukan rawak sahaja.</li>
    </ul>
    <p>Semua ini bukan identiti anda. Ia mengenal pasti <em>sekeping kad di dalam sebuah pelayar</em>: telefon baharu akan dibaca sebagai pelanggan baharu, dan kami menerima hakikat itu daripada bertanya siapa anda. Setiap kedai adalah berasingan — jika anda memegang kad di dua kedai, itu dua rekod yang tidak berhubung, dan kedai yang satu tidak dapat melihat yang lain.</p>

    <h2>Pelawat ke laman web ini</h2>
    <p>Berasingan daripada mana-mana kad, kami mengira lawatan ke halaman awam kami
      sendiri &mdash; halaman ini, halaman utama, Sokongan dan Terma. Kami menyimpan
      halaman yang anda buka, laman yang anda datang daripadanya, apa yang pelayar
      anda nyatakan tentang dirinya, dan <strong>satu rujukan rawak dalam kuki</strong>
      supaya sepuluh lawatan daripada anda tidak dikira sebagai sepuluh orang berbeza.
      Rujukan itu ialah rentetan aksara rawak. Ia tidak dikaitkan dengan anda, dengan
      mana-mana kad, mana-mana kedai, atau apa-apa lain yang kami simpan.</p>
    <p>Kami melakukan ini untuk melihat sama ada laman web ini berfungsi, dan tiada
      yang lain. Tiada pengiklanan, tiada perkhidmatan analitik pihak ketiga, dan
      tiada apa-apa dikongsi dengan sesiapa. Jika anda tidak mahu dikira langsung,
      buka <a href="/analytics-optout">/analytics-optout</a> dan pelayar ini akan
      dikecualikan mulai saat itu.</p>

    <h2>Apa yang kami kumpul daripada pemilik kafe</h2>
    <p>Alamat e-mel anda, kata laluan yang dicincang secara selamat (kami tidak dapat melihat kata laluan sebenar), PIN kakitangan anda sebagai cincangan sehala, dan butiran kad yang anda masukkan: nama kafe, ganjaran, warna, serta apa-apa logo atau sepanduk yang anda muat naik.</p>

    <h2>Mengapa kami mengumpulnya</h2>
    <ul>
      <li>Untuk menjalankan program setia: mengeluarkan kad, menambah setem, dan memaparkan ganjaran.</li>
      <li>Untuk mengemas kini kad anda dan menghantar pemberitahuan setia — setem baharu, atau mesej &ldquo;kami rindu anda&rdquo; — melalui dompet anda.</li>
      <li>Untuk menunjukkan kepada kafe angka mereka sendiri: berapa banyak kad, setem dan ganjaran.</li>
      <li>Untuk memastikan perkhidmatan berfungsi dan selamat, serta menghalang penyalahgunaan.</li>
    </ul>
    <p>Kami <strong>tidak</strong> menjual data anda, <strong>tidak</strong> menggunakannya untuk pengiklanan, dan <strong>tidak</strong> menggabungkan apa yang diketahui oleh satu kafe tentang anda dengan mana-mana kafe lain.</p>

    <h2>Siapa yang bertanggungjawab ke atas data anda</h2>
    <p>Kafe yang kadnya anda pegang menentukan bagaimana data setia anda digunakan — di bawah PDPA merekalah pengguna data. PunchMe mengendalikan sistem bagi pihak mereka sebagai pemproses data. <strong>Sesebuah kafe hanya dapat melihat kad, setem dan mesejnya sendiri</strong>, tidak sekali-kali milik kafe lain dan tidak apa-apa tentang anda selain yang disenaraikan di atas.</p>

    <h2>Siapa lagi yang menerimanya</h2>
    <ul>
      <li><strong>Apple</strong> — menerima token tolakan peranti anda supaya ia dapat memberitahu telefon anda bahawa kad telah berubah. Amaran itu sendiri tidak membawa apa-apa kandungan.</li>
      <li><strong>Google</strong> — mengehos kad pada Android, jadi ia menerima nombor kad, kod ringkas, jumlah setem, kandungan ganjaran dan teks apa-apa mesej yang dipaparkan pada kad.</li>
      <li><strong>Railway</strong> — penyedia hosting kami, yang mengendalikan pelayan dan pangkalan data.</li>
    </ul>
    <p>Penyedia ini beroperasi di luar Malaysia, jadi menjalankan perkhidmatan ini melibatkan pemindahan data ke luar negara. Kami hanya menggunakan penyedia yang menawarkan perlindungan setanding dengan PDPA, dan kami menghantar kepada mereka hanya apa yang diperlukan oleh kad untuk berfungsi. Apple dan Google mengendalikan apa yang mereka terima di bawah dasar privasi mereka sendiri.</p>

    <h2>Di mana ia disimpan</h2>
    <p>Di dalam pangkalan data PostgreSQL terurus di Railway, dihantar melalui sambungan tersulit (HTTPS). Kata laluan dan PIN kakitangan dicincang sehala dan tidak pernah disimpan dalam bentuk yang boleh dibaca semula oleh sesiapa.</p>

    <h2>Berapa lama kami menyimpannya</h2>
    <p>Kad anda dan setemnya disimpan selagi kad itu berada di dalam dompet anda. <strong>Padamkan kad itu dan ia berhenti dikemas kini serta tidak menerima apa-apa lagi</strong> — tiada setem, tiada mesej.</p>
    <p>Kami memang menyimpan rekod bahawa kad itu pernah wujud dan setem yang diperolehnya, kerana sejarah itu ialah rekod perniagaan kafe itu sendiri — berapa ramai yang menyertai, berapa ramai yang kembali, berapa banyak ganjaran yang diberikan. Ia kekal terikat pada nombor kad rawak, tidak sekali-kali pada nama. Kad yang tidak pernah disetem dan tidak pernah sampai ke dompet akan dipadam secara automatik selepas 30 hari.</p>
    <p>Data akaun kafe disimpan selagi akaun itu dibuka.</p>

    <h2>Hak anda (PDPA)</h2>
    <p>Anda boleh meminta akses kepada data peribadi yang kami simpan tentang anda, membetulkannya, meminta kami memadamnya, mendapatkan salinannya, mengehadkan penggunaannya, atau menarik balik persetujuan anda. Untuk membuat permintaan, ${contact}. Oleh sebab kami tidak menyimpan nama atau butiran perhubungan, anda perlu memberikan kod ringkas kad anda supaya kami dapat mencari rekod yang betul. Jika permintaan anda berkaitan program sesebuah kafe, kami akan menyalurkannya kepada kafe itu, yang memutuskan sebagai pengguna data.</p>

    <h2>Perubahan</h2>
    <p>Kami mungkin mengemas kini dasar ini apabila produk berkembang. Kami akan menukar tarikh di atas apabila berbuat demikian.</p>

    <div class="note">PunchMe masih dalam beta. Dasar ini ialah titik permulaan dalam bahasa mudah, bukan nasihat guaman — sila minta seorang profesional menyemaknya sebelum bergantung padanya secara meluas.</div>
  </article>`;
  return page("PunchMe — Dasar Privasi", body, legalCss);
}

export function termsPage(contactEmail = ""): string {
  const body = `<article class="legal">
    <a class="back" href="/">&larr; Back to PunchMe</a>
    <h1>Terms of Service</h1>
    <p class="upd">Last updated ${UPDATED}</p>
    <p>These terms cover your use of PunchMe. By creating an account you agree to them.</p>

    <h2>Beta service</h2>
    <p>PunchMe is currently in beta and free to use. It&rsquo;s provided &ldquo;as is,&rdquo; without warranties of uptime or availability, while we finish building and testing. Features may change or pause during this period.</p>

    <h2>Your account</h2>
    <ul>
      <li>Keep your login and your café&rsquo;s staff PIN secure — you&rsquo;re responsible for activity under them.</li>
      <li>Give accurate information when you sign up.</li>
    </ul>

    <h2>Acceptable use</h2>
    <ul>
      <li>Use PunchMe only for a genuine loyalty program for your own café.</li>
      <li>Don&rsquo;t misuse customer notifications to spam or mislead people.</li>
      <li>Follow the laws that apply to you, including consumer and data-protection law.</li>
    </ul>

    <h2>Your customers, your relationship</h2>
    <p>The customers who join your card are yours. PunchMe processes their card data on your behalf to run the program; we don&rsquo;t market to them or take them elsewhere.</p>

    <h2>Reward terms</h2>
    <p>These are the terms shown on the back of every card, and they apply between you and your customer. You run the programme; we run the software.</p>
    <ul>
      <li>One stamp per visit. You decide what earns a stamp.</li>
      <li>Stamps may expire after 12 months without a visit.</li>
      <li>You may substitute a reward of similar value, or withdraw the programme, at any time.</li>
      <li>The reward is yours to honour, not PunchMe&rsquo;s. Stamps have no cash value and cannot be exchanged, sold or transferred between customers.</li>
      <li>Stamps added by mistake can be reversed by your staff, and the correction is recorded.</li>
    </ul>

    <h2>Data protection</h2>
    <p>Under Malaysia&rsquo;s Personal Data Protection Act, <strong>you are the data user</strong> for your customers&rsquo; loyalty data and <strong>PunchMe is your data processor</strong>. This section is the written agreement the Act asks for between the two. We undertake to:</p>
    <ul>
      <li>Process customer data only to run your loyalty programme, on your instructions, and never for our own purposes.</li>
      <li>Never sell it, use it for advertising, market to your customers, or combine one café&rsquo;s data with another&rsquo;s.</li>
      <li>Keep it secure — encrypted connections, hashed passwords and PINs, and access limited to what running the service requires.</li>
      <li>Use sub-processors only where the service needs them (Apple, Google and our hosting provider — named in the <a href="/privacy">Privacy Policy</a>), and send them the minimum required.</li>
      <li>Help you answer a customer&rsquo;s access, correction or deletion request within a reasonable time.</li>
      <li>Tell you without undue delay if we become aware of a breach affecting your customers&rsquo; data, with what we know, so you can meet your own notification duties.</li>
      <li>Return or delete your customer data on request when you close your account, except where we must keep it by law.</li>
    </ul>
    <p>In return, you agree to display or link the <a href="/privacy">Privacy Policy</a> where you invite customers to join — the join page and posters we generate already do this — and not to enter personal data about a customer (a name, phone number or anything similar) into a card message, since those fields are not built to hold it.</p>

    <h2>Liability</h2>
    <p>To the extent permitted by law, PunchMe isn&rsquo;t liable for indirect or consequential losses arising from use of a beta service. Nothing here limits rights that can&rsquo;t be limited under Malaysian law.</p>

    <h2>Ending it</h2>
    <p>You can stop using PunchMe and ask us to delete your account at any time. We may suspend accounts that break these terms.</p>

    <h2>Contact</h2>
    <p>Questions about these terms? ${contactLine(contactEmail)}.</p>

    <div class="note">PunchMe is in beta. These terms are a plain-language starting point, not legal advice — please have them reviewed by a professional before relying on them at scale.</div>
  </article>`;
  return page("PunchMe — Terms of Service", body, legalCss);
}

// ---------------------------------------------------------------- staff ----

/**
 * The stamper. `signedIn` comes from the staff session cookie — an unsigned-in
 * device is only ever sent the PIN form, so the page itself leaks no café data.
 */
export function staffPage(signedIn: boolean, cardId = DEFAULT_CARD_ID): string {
  const css = /* css */ `
    .pass { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r);
            padding: 14px; margin-top: 12px; }
    .pass .dots { font-size: 1.15rem; letter-spacing: 2px; margin: 6px 0; }
    .row { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
    .row .btn { padding: 16px 18px; font-size: 1.05rem; min-height: 54px; }
    /* Read one-handed, at arm's length, with a queue waiting. */
    .toast { font-family: var(--display); font-weight: 800; font-size: 1.2rem;
             letter-spacing: -.02em; padding: 18px 28px; border-radius: var(--r);
             background: var(--accent); color: var(--on-accent); bottom: 32px; }
    .ready { color: #1a7f37; font-weight: 700; }
    .signout { background: none; border: none; color: var(--muted); font: inherit; font-size: .85rem;
               cursor: pointer; padding: 4px 0; text-decoration: underline; }
    #scanner {
      position: fixed; inset: 0; background: #000; z-index: 40;
      display: none; flex-direction: column;
    }
    #scanner.on { display: flex; }
    #scanner video { flex: 1; object-fit: cover; width: 100%; }
    #scanner .bar { padding: 14px; }
    .codebox { display: flex; gap: 8px; margin-top: 8px; }
    .codebox input { text-transform: uppercase; letter-spacing: 3px; font-weight: 700; text-align: center; }
    .codebox .btn { width: auto; padding: 12px 18px; }
    /* A button waiting for its second tap. Loud, because it is about to give
       away a free coffee — and because the tap that armed it may have been a
       pocket. It disarms itself after four seconds. */
    .btn.armed { background: #9a3412; border-color: #9a3412; color: #fff; }
    /* The whole point of the redeem rework: a card that has hit its target is
       already on screen when the customer hands over their phone, instead of
       being somewhere in a list of twenty. */
    #readywrap:not(:empty) { margin-top: 22px; }
    #readywrap .pass { border-color: #1a7f37; border-width: 2px; }
    /* Card switcher: only rendered when the owner runs more than one card. */
    .cardpick { display: flex; gap: 8px; flex-wrap: wrap; margin: 6px 0 16px; }
    .cardpick button { width: auto; padding: 9px 16px; border-radius: 999px; border: 1px solid var(--line);
                       background: none; font: inherit; font-size: .9rem; cursor: pointer; }
    .cardpick button.on { background: var(--ink, #111); color: #fff; border-color: var(--ink, #111); }
    .find { border: 1px solid var(--line); border-radius: 12px; padding: 4px 14px 14px; margin-top: 22px; }
    .find summary { cursor: pointer; padding: 12px 0; font-weight: 600; list-style: none; display: flex; gap: 8px; align-items: center; }
    .find summary::-webkit-details-marker { display: none; }
    .find summary::before { content: "▸"; color: var(--muted); font-weight: 400; transition: transform .18s; }
    .find[open] summary::before { transform: rotate(90deg); }
    ${MODAL_CSS}
  `;
  // Shared by both states. Everything below it is emitted for one state only:
  // an unsigned-in phone is never sent the stamper code, so the page is a gate
  // rather than a hidden panel.
  const sharedJs = /* js */ `
    const $ = (s, el=document) => el.querySelector(s);
    // Which card this phone is stamping — decided by the SERVER and injected
    // here, not re-derived from the URL. A bare /staff used to make the browser
    // claim "default", which on a multi-merchant deployment is someone else's
    // counter. Switchable in the page: one PIN covers every card the owner runs.
    let cardId = ${JSON.stringify(cardId)};

    async function api(path, opts = {}) {
      const res = await fetch("/staff/api" + path, {
        ...opts,
        headers: { "Content-Type": "application/json", "x-card-id": cardId, ...(opts.headers||{}) },
      });
      if (res.status === 429) {
        const b = await res.json().catch(() => ({}));
        toast("Too many attempts — try again in " + (b.retryAfterSeconds || 60) + "s");
        throw new Error("rate");
      }
      // The session expired or was cleared — reload so the server serves the PIN form.
      if (res.status === 401) { location.reload(); throw new Error("signed-out"); }
      return res.json();
    }

    function toast(msg) {
      const t = $(".toast"); t.textContent = msg; t.classList.add("show");
      setTimeout(() => t.classList.remove("show"), 2600);
    }
  `;

  const loginJs = /* js */ `
    $("#app").innerHTML = \`
      <h1>Staff login</h1>
      <p class="sub">Enter the staff PIN. This phone stays signed in for two weeks.</p>
      <input id="pin" type="password" inputmode="numeric" placeholder="PIN">
      <button class="btn btn-dark" style="margin-top:12px" id="go">Enter</button>\`;
    async function signIn() {
      const pin = $("#pin").value.trim();
      if (!pin) return toast("Type the PIN");
      // The PIN crosses the wire once, here — after this the phone is authorised
      // by its session cookie instead of resending the PIN on every stamp.
      const out = await api("/login", { method: "POST", body: JSON.stringify({ pin }) });
      if (out.ok) location.reload();
      else toast("Wrong PIN");
    }
    $("#go").onclick = signIn;
    $("#pin").onkeydown = (e) => { if (e.key === "Enter") signIn(); };
  `;

  const stamperJs = /* js */ `
    ${MODAL_JS}
    // ---- two-tap confirm, deliberately NOT a browser dialog ----
    // Browsers offer "prevent this page from creating additional dialogs" after
    // a few in a row. A busy counter hits that in one shift, and once a staff
    // member ticks it every later dialog silently reports "cancel" — the redeem
    // button would just stop working, with no error, until someone reloaded. So
    // the confirmation lives in the button itself. A test enforces this.
    let armedBtn = null, armedTimer = null;
    function disarm() {
      if (armedBtn) { armedBtn.textContent = armedBtn.dataset.label; armedBtn.classList.remove("armed"); }
      clearTimeout(armedTimer); armedBtn = null; armedTimer = null;
    }
    /** First tap arms and relabels; second tap within 4s runs it. */
    function arm(btn, prompt, go) {
      btn.dataset.label = btn.textContent;
      btn.onclick = () => {
        if (armedBtn === btn) { disarm(); go(); return; }
        disarm();
        armedBtn = btn;
        btn.textContent = prompt;
        btn.classList.add("armed");
        armedTimer = setTimeout(disarm, 4000);
      };
    }

    let busy = false; // debounce: one tap/scan = one stamp
    async function act(path, body, doneMsg) {
      if (busy) return; busy = true;
      try {
        let out = await api(path, { method: "POST", body: JSON.stringify(body) });
        // Anti-spam: the same card was stamped moments ago. A genuine second
        // order is one tap on the popup — it used to mean scanning the card
        // again, which on the scanner path meant reopening the camera and
        // lining the phone back up for something staff had already decided.
        // This is our own popup, never the browser's — a browser dialog can be
        // switched off mid-shift and then silently answers "cancel".
        if (out.error === "too-soon") {
          const again = await modal(
            "Stamp it again?",
            "<p>This card was stamped <strong>" + out.secondsLeft + "s</strong> ago. " +
              "Only do this if they really are buying a second one.</p>",
            "Add another",
          );
          if (!again) return out;
          out = await api(path, { method: "POST", body: JSON.stringify({ ...body, force: true }) });
        }
        if (out.error) toast("Error: " + out.error);
        else {
          // The customer can hand over any of the shop's cards, so name the one
          // it landed on when that isn't the card currently on screen.
          const other = out.card && out.card.id !== cardId ? " on " + out.card.name : "";
          // The count, not the push. The wallet update is sent in the background
          // now, so claiming "pushed to phone ✓" here would be a guess — and the
          // stamp is already saved either way, which is what staff need to know.
          // A membership card has no target, so "3 of 10" would be a number
          // out of a number that means nothing. Its visit count says the same
          // reassuring thing — the tap registered — without inventing a goal.
          const count = !out.pass ? ""
            : out.pass.kind === "membership"
              ? (out.pass.stamps > 0 ? " — visit " + out.pass.stamps : "")
              : out.pass.kind === "points"
                ? " — " + out.pass.stamps + (out.pass.stamps === 1 ? " point" : " points")
                : " — " + out.pass.stamps + " of " + out.pass.target;
          // A points card the phone was not already showing carries its own
          // preset amounts, so the buttons match the card in hand.
          if (out.card && Array.isArray(out.card.presets) && out.card.presets.length) {
            presets = out.card.presets;
          }
          toast(doneMsg + other + count);
        }
        // Redraw from the response rather than waiting on a second round trip.
        // The server already told us the new state; fetching it again only
        // holds the button locked while a queue waits.
        if (out.pass) {
          const i = allPasses.findIndex((p) => p.serial === out.pass.serial);
          if (i >= 0) allPasses[i] = out.pass; else allPasses.unshift(out.pass);
          renderReady(); renderList();
        }
        void load();
        return out;
      } finally { busy = false; }
    }

    // ------------------------------------------------------------ scanner ----
    // Primary: native BarcodeDetector. Fallback: jsQR over canvas frames
    // (iPhone Safari has no BarcodeDetector). Final fallback: typed card code.
    let stream = null, scanTimer = null, lastScan = "";
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    async function onScanResult(text) {
      if (!text || busy) return;
      if (text === lastScan) return; // same card still in front of the camera
      lastScan = text;
      stopScanner();
      const value = text.trim();
      if (uuidRe.test(value)) await act("/stamp", { serial: value }, "Stamp added");
      else await act("/stamp-by-code", { code: value.replace(/^Code /i, "") }, "Stamp added");
    }

    async function startScanner() {
      lastScan = "";
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" }, audio: false,
        });
      } catch { toast("Camera not available — type the card code instead"); return; }
      $("#scanner").classList.add("on");
      const video = $("#scanner video");
      video.srcObject = stream;
      await video.play();

      if ("BarcodeDetector" in window) {
        const det = new BarcodeDetector({ formats: ["qr_code"] });
        scanTimer = setInterval(async () => {
          try {
            const codes = await det.detect(video);
            if (codes.length) onScanResult(codes[0].rawValue);
          } catch {}
        }, 250);
      } else if (window.jsQR) {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        scanTimer = setInterval(() => {
          if (!video.videoWidth) return;
          canvas.width = video.videoWidth; canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const hit = jsQR(img.data, img.width, img.height);
          if (hit && hit.data) onScanResult(hit.data);
        }, 300);
      } else {
        stopScanner();
        toast("Scanning not supported on this phone — type the card code instead");
      }
    }

    function stopScanner() {
      clearInterval(scanTimer); scanTimer = null;
      if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
      $("#scanner").classList.remove("on");
    }

    // --------------------------------------------------------------- views ----
    let allPasses = [];
    // The shop's own one-tap amounts, refreshed with the pass list. Empty on
    // every card that is not a points card.
    let presets = [];

    /**
     * An amount typed at the counter, for the odd bill the presets do not cover.
     *
     * An inline row rather than a browser prompt. A phone can suppress those,
     * after which they return nothing and the button silently does nothing at
     * all — the same reason nothing destructive on this page uses one either
     * (CLAUDE.md invariant 8). A test asserts this page ships no browser
     * dialogs, and it reads the comments too, so do not name one here.
     */
    function askAmount(host, p) {
      if (host.querySelector(".amtrow")) return;
      const row = document.createElement("div");
      row.className = "row amtrow";
      row.innerHTML =
        '<input class="amtin" type="number" min="1" step="1" inputmode="numeric" placeholder="Points">' +
        '<button class="btn btn-stamp" data-a="amtok">Add</button>' +
        '<button class="btn btn-ghost" data-a="amtno">Cancel</button>';
      const input = row.querySelector(".amtin");
      row.querySelector('[data-a=amtno]').onclick = () => row.remove();
      row.querySelector('[data-a=amtok]').onclick = () => {
        const n = Math.trunc(Number(input.value));
        if (!(n >= 1)) { toast("Type how many points"); return; }
        row.remove();
        act("/stamp", { serial: p.serial, amount: n }, "Points added");
      };
      host.appendChild(row);
      input.focus();
    }
    let found = []; // server-side search hits (cards outside the recent 20)
    async function load() {
      const out = await api("/passes");
      allPasses = out.passes;
      if (Array.isArray(out.presets)) presets = out.presets;
      renderReady();
      renderList();
    }
    /** One card, with whatever actions it currently allows. */
    function passRow(p) {
      const div = document.createElement("div");
      div.className = "pass";
      // A membership card is checked IN, not stamped: it has no target, so there
      // is no progress to show and never a reward to give. It still records a
      // stamp underneath, which is what keeps its visits in the customer groups
      // and the counter log alongside everybody else's.
      const member = p.kind === "membership";
      const points = p.kind === "points";
      // A points counter offers the shop's own amounts as one-tap buttons.
      // Typing a number on a busy counter is how 500 lands where 50 was meant,
      // so the free entry sits behind a second tap and these carry the traffic.
      const amounts = points ? (presets.length ? presets : [1, 5, 10]) : [];
      div.innerHTML = \`
        <strong>\${p.code}</strong>
        \${p.rewardReady ? '<span class="ready"> — ' + (points ? "ENOUGH TO SPEND 🎉" : "REWARD READY 🎉") + '</span>' : ""}
        \${member
          ? '<div class="dots"><span class="muted">Member' + (p.stamps > 0 ? " — " + p.stamps + (p.stamps === 1 ? " visit" : " visits") : "") + '</span></div>'
          : points
          ? '<div class="dots"><b>' + p.stamps + '</b> <span class="muted">' + (p.stamps === 1 ? "point" : "points") + '</span></div>'
          : '<div class="dots">' + p.dots + ' <span class="muted">' + p.stamps + '/' + p.target +
            (p.total && p.total !== p.target ? ' (of ' + p.total + ')' : '') + '</span></div>'}
        <div class="row">
          \${points
            ? amounts.map((n) => '<button class="btn btn-stamp" data-a="add" data-n="' + n + '">+' + n + '</button>').join("") +
              '<button class="btn btn-ghost" data-a="custom">Other amount</button>'
            : '<button class="btn btn-stamp" data-a="stamp">' + (member ? "Check in ✓" : "+1 Stamp") + '</button>'}
          \${p.stamps > 0 ? '<button class="btn btn-ghost" data-a="undo">' + (member ? "− Undo check-in" : points ? "− Undo last" : "− Undo a stamp") + '</button>' : ""}
          \${points
            ? (p.canBuy || []).map((m, i) =>
                '<button class="btn btn-ghost" data-a="spend" data-i="' + i + '">Give ' + m.reward + ' (−' + m.at + ')</button>').join("")
            : (p.rewardReady ? '<button class="btn btn-ghost" data-a="redeem">' + redeemLabel(p) + '</button>' : "")}
        </div>\`;
      const stampBtn = div.querySelector('[data-a=stamp]');
      if (stampBtn) stampBtn.onclick = () =>
        act("/stamp", { serial: p.serial }, member ? "Checked in" : "Stamp added");
      for (const b of div.querySelectorAll('[data-a=add]')) {
        b.onclick = () => act("/stamp", { serial: p.serial, amount: Number(b.getAttribute("data-n")) }, "Points added");
      }
      // Behind a second tap, and behind an inline entry row rather than a
      // browser dialog: a staff phone can suppress those, after which they
      // return nothing and the button silently stops working (CLAUDE.md 8).
      const customBtn = div.querySelector('[data-a=custom]');
      if (customBtn) arm(customBtn, "Type an amount", () => askAmount(div, p));
      for (const b of div.querySelectorAll('[data-a=spend]')) {
        const m = (p.canBuy || [])[Number(b.getAttribute("data-i"))];
        if (m) arm(b, "Confirm — give " + m.reward + "?", () =>
          act("/redeem", { serial: p.serial, at: m.at }, m.reward + " given — " + m.at + " points off"));
      }
      // The fix for a mis-scan. Before this the only way back was to redeem,
      // which handed out a free reward.
      const u = div.querySelector('[data-a=undo]');
      if (u) arm(u, "Confirm — undo?", () => act("/undo", { serial: p.serial }, member ? "Check-in removed" : "Stamp removed"));
      const r = div.querySelector('[data-a=redeem]');
      if (r) arm(r, "Confirm — give reward?", () => act("/redeem", { serial: p.serial },
        p.finalReward ? "Reward given — card restarted" : "Reward given — card carries on"));
      return div;
    }

    /**
     * What the redeem button says.
     *
     * A card with rewards up the ladder pays out and CARRIES ON, so "give
     * reward and restart" would be a lie on every rung but the last — and the
     * customer would be told their stamps had gone when they had not. Naming
     * the prize also stops staff handing over the wrong one on a card with
     * three of them.
     */
    function redeemLabel(p) {
      const what = p.reward ? "Give " + p.reward : "Give reward";
      return what + (p.finalReward ? " & restart" : " & carry on");
    }

    // Cards at their target, always on screen. The customer's last stamp used to
    // drop them somewhere into a list of twenty and staff had to go hunting for
    // the card that was right in front of them.
    function renderReady() {
      const host = $("#readywrap"); if (!host) return;
      const ready = allPasses.filter((p) => p.rewardReady);
      host.innerHTML = "";
      if (!ready.length) return;
      const anyPoints = ready.some((p) => p.kind === "points");
      host.insertAdjacentHTML("beforeend",
        "<h2>Ready to redeem</h2><p class=\\"sub\\">" +
        (ready.length === 1 ? "One card has" : ready.length + " cards have") +
        (anyPoints ? " enough to spend." : " hit the target.") + "</p>");
      for (const p of ready) host.appendChild(passRow(p));
    }

    function renderList() {
      const list = $("#list"); if (!list) return;
      const q = ($("#search")?.value || "").trim().toUpperCase();
      // A search hit found on the server (found[]) wins over the recent list,
      // which only holds 20 cards — a regular from last month isn't in it.
      const rows = q ? (found.length ? found : allPasses.filter((p) => p.code.toUpperCase().includes(q))) : allPasses;
      list.innerHTML = "";
      if (!allPasses.length && !found.length) {
        list.innerHTML = '<p class="muted" style="margin-top:16px">No cards yet — a customer scans the Add-to-Wallet QR to create the first one.</p>';
        return;
      }
      if (!rows.length) {
        list.innerHTML = '<p class="muted" style="margin-top:16px">' +
          (q.length >= 6 ? 'No card has the code ' + q + '.' : 'Type the full 6-character code to search every card.') + '</p>';
        return;
      }
      if (!q) {
        list.insertAdjacentHTML("beforeend",
          '<p class="muted" style="margin:10px 0 0">The ' + rows.length + ' most recent cards. Type a code to reach any other.</p>');
      }
      for (const p of rows) list.appendChild(passRow(p));
    }

    // Codes are exactly 6 chars, so once that much is typed we can ask the
    // server — that's the only way to reach a card outside the recent 20.
    let searchTimer = null;
    function onSearch() {
      const q = ($("#search")?.value || "").trim().toUpperCase();
      clearTimeout(searchTimer);
      if (q.length < 6) { found = []; renderList(); return; }
      searchTimer = setTimeout(async () => {
        try {
          const out = await api("/lookup?code=" + encodeURIComponent(q));
          found = out.pass ? [out.pass] : [];
        } catch (e) {
          found = []; // 404 = no such code; renderList explains
        }
        renderList();
      }, 250);
    }

    // One PIN covers every card the owner runs, so a counter with a coffee card
    // and a pastry card switches here instead of signing in twice. Hidden
    // entirely for the overwhelmingly common case of a single card.
    async function renderCards() {
      const out = await api("/cards");
      const cards = out.cards || [];
      const host = $("#cards");
      if (cards.length < 2) { host.innerHTML = ""; return; }
      host.innerHTML = '<label>Stamping</label><div class="cardpick">' +
        cards.map((c) => '<button class="' + (c.id === cardId ? "on" : "") +
          '" data-c="' + c.id + '">' + c.name + "</button>").join("") + "</div>";
      host.querySelectorAll("[data-c]").forEach((b) => {
        b.onclick = () => {
          cardId = b.dataset.c;
          // Keep the URL honest, so a reload (or a bookmark) stays on this card.
          history.replaceState(null, "", "/staff?c=" + encodeURIComponent(cardId));
          renderCards();
          load();
        };
      });
    }

    $("#app").innerHTML = \`
      <h1>Stamper</h1>
      <p class="sub">Scan the customer’s card, or type its code.</p>
      <div id="cards"></div>
      <button class="btn btn-stamp" id="scan">📷 Scan card</button>
      <div class="codebox">
        <input id="code" placeholder="CARD CODE" maxlength="8" autocomplete="off">
        <button class="btn btn-ghost" id="bycode">Stamp</button>
      </div>
      <div id="readywrap"></div>
      <details class="find" id="find">
        <summary>Find a card</summary>
        <input id="search" placeholder="🔍 Card code" autocomplete="off" style="text-transform:uppercase">
        <div id="list" style="margin-top:10px"></div>
      </details>
      <button class="signout" id="out">Sign this phone out</button>\`;
    $("#scan").onclick = startScanner;
    $("#bycode").onclick = () => {
      const code = $("#code").value.trim();
      if (!code) return toast("Type the code shown on the customer’s card");
      act("/stamp-by-code", { code }, "Stamp added").then(() => { $("#code").value = ""; });
    };
    $("#search").oninput = onSearch;
    arm($("#out"), "Confirm — sign out?", async () => {
      await api("/logout", { method: "POST" });
      location.reload();
    });
    renderCards();
    load();
    // Don't repaint out from under a half-confirmed action — the poll would
    // replace the armed button and swallow the second tap.
    clearInterval(window.__poll);
    window.__poll = setInterval(() => { if (!armedBtn) load(); }, 10000);
  `;
  // The camera overlay and jsQR (the BarcodeDetector fallback iPhone Safari
  // needs) are only worth loading for a phone that can actually stamp.
  const scanner = signedIn
    ? `<div id="scanner"><video playsinline muted></video>
         <div class="bar"><button class="btn btn-ghost" onclick="stopScanner()">Cancel</button></div>
       </div>
       <script src="/staff/jsqr.js"></script>`
    : "";
  return page(
    "PunchMe — Staff",
    `<div class="card" id="app"></div>
     ${scanner}
     <div class="toast"></div>
     <script>${sharedJs}${signedIn ? stamperJs : loginJs}</script>`,
    css,
  );
}

// ------------------------------------------------------------ dashboard ----

/**
 * The owner dashboard. `canEmail` says whether transactional email is actually
 * configured — with no email service, offering to "send a reset link" would be
 * a lie, and the owner would sit waiting for mail that never arrives. The honest
 * alternative is rendered server-side so the wrong promise never reaches the page.
 */
export function dashboardPage(canEmail: boolean, contactEmail = "", allowSignup = false): string {
  // Strict allowlist: this value is an env var that ends up inside an inline
  // script, and a stray backtick or ${ would break the whole page.
  const contact = contactEmail.replace(/[^A-Za-z0-9._%+@-]/g, "");
  const resetBox = canEmail
    ? `<label>Your account email</label><input id="fmail" type="email"><button class="btn btn-ghost" style="margin-top:8px" id="fsend">Send reset link</button>`
    : `<p class="muted" style="margin:0">Password resets by email aren’t set up yet — ${
        contact
          ? `<a href="mailto:${contact}">email us at ${contact}</a>`
          : "message whoever set up your PunchMe account"
      } and we’ll set a new password for you.</p>`;
  const css = /* css */ `
    .metrics { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin: 10px 0; }
    .metric { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r);
              padding: 16px 16px 13px; text-align: left; }
    .metric b { font-family: var(--display); font-weight: 800; font-size: 2rem; line-height: 1;
                display: block; letter-spacing: -.035em; font-variant-numeric: tabular-nums; color: var(--ink); }
    .metric span { display: block; margin-top: 6px; font-size: .78rem;
                   letter-spacing: .01em; color: var(--muted); }
    .card { border: 1px solid var(--line); border-radius: var(--r);
            padding: 16px; margin-top: 14px; }
    .links { display: flex; gap: 12px; margin-top: 10px; flex-wrap: wrap; font-size: .9rem; }
    ${DESIGN_PANEL_CSS}
    .account { border-top: 1px solid var(--line); margin-top: 30px; padding-top: 20px; }
    .card { max-width: 480px; }
    /* --- card dropdown selector --- */
    .cardselect { display: flex; gap: 8px; align-items: center; margin: 10px 0 6px; }
    .cardselect select { flex: 1; padding: 11px 12px; border: 1px solid var(--field-border); border-radius: 10px;
                         font: inherit; font-weight: 600; background: var(--surface); color: var(--ink); }
    .cardselect .btn { width: auto; padding: 11px 14px; font-size: .9rem; white-space: nowrap; }
    ${SEG_CSS}
    /* Five tabs don't fit a 375px phone at the default size. Tighten them enough
       that all five stay visible (a hidden tab is worse than small type), and
       keep a scroll as the fallback for anything narrower still. */
    /* --- the welcome block ---------------------------------------------------
       The dashboard used to open on the word "Dashboard" and the login email:
       a fact about the software, addressed to nobody. This greets the shop and
       says how the card is doing, and it doubles as the rule between the page
       and the tab strip — there was nothing separating navigation from content.

       NEON, and deliberately the one exception to DESIGN.md rule 1 — see the
       rule's own carve-out, which was written for this block. It was --slab.
       The header is not decoration: it is the shop's identity and the whole of
       the app's navigation in one object, and it is the only thing on the page
       that never changes, so it is the one surface that can carry the colour
       without competing with anything. Nothing else on the dashboard is neon
       now — the tab thumb inside it goes WHITE precisely because a neon thumb
       on a neon ground is invisible.

       Text is --on-accent (near-black) and never white: #c9f73d is a pale
       green, so white on it is about 1.3:1 and unreadable, which is the reason
       --on-accent exists and is always dark. */
    .greet { background: var(--accent); color: var(--on-accent); border-radius: var(--r-lg);
            padding: 20px 22px 16px; margin-top: 4px; }
    .greet h1 { font-size: 1.45rem; margin: 0; color: var(--on-accent); }
    /* The login email. Quiet, but it must stay legible — it is the only thing
       on screen answering "which account am I in?", which matters the moment
       somebody runs two shops. Tinted from the ink rather than greyed: a grey
       on this green reads as dirt. */
    .greet .who { font-size: .8rem; margin: 3px 0 0; color: rgba(12,14,13,.66);
                  word-break: break-all; }
    /* The tab strip, now inside the header. Its trough is a darker wash of the
       same ground rather than --ghost-bg, which is a neutral grey and turns
       muddy on green. */
    .greet #tabs { background: rgba(12,14,13,.11); }
    .greet #tabs button { color: rgba(12,14,13,.62); }
    .greet #tabs button.on { color: var(--ink); }
    /* White, not neon: the thumb has to be the thing that stands OUT of the
       ground it sits on, and on neon that is white. */
    .greet #tabs .thumb { background: #fff; box-shadow: 0 2px 6px rgba(12,14,13,.18); }
    #tabs { margin: 16px 0 0; overflow-x: auto; scrollbar-width: none; }
    #tabs::-webkit-scrollbar { display: none; }
    #tabs button { padding: 10px 9px; font-size: .84rem; }
    @media (max-width: 430px) {
      #tabs { padding: 3px; gap: 0; }
      #tabs button { padding: 10px 6px; font-size: .78rem; }
      #tabs .thumb { top: 3px; bottom: 3px; }
    }
    .segwrap { margin: 8px 0 4px; }
    .segwrap .lbl { font-size: .8rem; color: var(--muted); margin-bottom: 6px; }
    /* --- share tab --- */
    .sharelist { display: flex; flex-direction: column; gap: 10px; margin: 8px 0 16px; }
    .sharelist a { display: flex; justify-content: space-between; align-items: center; gap: 8px;
                   border: 1px solid var(--line); border-radius: 14px; padding: 16px 18px; text-decoration: none;
                   color: var(--ink); font-weight: 600; }
    .sharelist a:hover { border-color: var(--accent); }
    /* Block, not inline: on a phone the description otherwise wrapped between
       the title and the "open →" and the row read as three broken fragments. */
    .sharelist a .sub2 { display: block; font-weight: 400; color: var(--muted); font-size: .82rem; margin-top: 2px; }
    .sharelist a .arr { white-space: nowrap; }
    .sharelist a .arr { color: var(--muted); }
    .sharelist { margin-bottom: 6px; }
    /* --- home: totals + per-card breakdown --- */
    /* Always four tiles, always 2×2 — a square hero card, not a row that
       stretches to four-across once a wider viewport allows it. Tracked spend
       stays IN the grid even with nothing to show yet (an em dash, not a
       missing tile): a metric that vanishes when it has no answer reads as
       broken, not as "not set up yet". */
    .totals { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin: 14px 0; }
    .totals .metric { padding: 16px 14px 13px; }
    .totals .metric b { font-size: clamp(1.4rem, 6.5vw, 2rem); }
    /* Customer health: four more tiles under the four above, and the SAME size.
       They were smaller, on the theory that the shape of the base should read
       quieter than its size; on screen it just looked like two grids that had
       not been designed together. Colour is what separates them now. */
    .totals.health { margin-top: 6px; }
    .totals.health .metric { background: var(--hue-bg);
                             border-color: transparent; border-left: 3px solid var(--hue); }
    .totals.health .metric b { color: var(--hue); }
    /* The share of the base, beside the count and deliberately smaller: the
       count is the fact, the percentage is how to read it. Tabular so four
       tiles line up down the column instead of shuffling by digit width. */
    .totals.health .metric b i { font-style: normal; font-size: .48em; font-weight: 700;
                                 letter-spacing: 0; margin-left: 6px; opacity: .72; }
    .totals.health .metric span { color: var(--ink2); font-weight: 600; }
    /* Semantic colour, rule 6 of DESIGN.md, plus the one blue this app has:
       these four are read against each other at a glance, and the hue does the
       sorting the eye would otherwise have to do by reading every label. */
    .h-regular   { --hue: #15803d; --hue-bg: #e9f7ee; }
    .h-returning { --hue: #1d4ed8; --hue-bg: #e9eefb; }
    .h-new       { --hue: #b45309; --hue-bg: #fdf4e3; }
    .h-lost      { --hue: #9a3412; --hue-bg: #fbedeb; }
    .breakdown { width: 100%; border-collapse: collapse; font-size: .9rem; margin-top: 6px; }
    .breakdown th { text-align: left; color: var(--muted); font-size: .78rem; letter-spacing: .01em; padding: 8px 10px; border-bottom: 1px solid var(--line); }
    .breakdown td { padding: 10px; border-bottom: 1px solid var(--line); }
    .breakdown td.n { text-align: right; font-variant-numeric: tabular-nums; }
    .viewall { margin-top: 18px; }
    /* --- card picker (Cards + Share) --- */
    .cardpick { display: flex; gap: 8px; flex-wrap: wrap; margin: 10px 0 20px; }
    .cardpick button { width: auto; padding: 9px 16px; border-radius: 999px; border: 1px solid var(--field-border);
                       background: var(--surface); color: var(--ink); font: inherit; font-weight: 600; cursor: pointer; }
    .cardpick button.on { background: var(--ink); color: #fff; border-color: var(--ink); }
    /* --- customer rows (Customers view) — the dashboard's own card style --- */
    .pass { border: 1px solid var(--line); border-radius: 14px; padding: 15px 16px; margin-top: 12px;
            background: var(--surface); box-shadow: var(--shadow); }
    .pass strong { font-size: 1.02rem; }
    .pass .row { display: flex; gap: 8px; margin-top: 12px; }
    .pass .row .btn { width: auto; padding: 9px 16px; font-size: .9rem; }
    .ready { color: #1a7f37; font-weight: 700; }
    /* --- customers view: one collapsible section per recency group --- */
    .custctl { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 4px; }
    .custctl > div { flex: 1; min-width: 130px; }
    .grp { border: 1px solid var(--line); border-radius: 14px; padding: 4px 14px 14px; margin-bottom: 10px; background: var(--surface); }
    .grp summary { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; cursor: pointer;
                   padding: 12px 0; font-weight: 700; list-style: none; }
    .grp summary::-webkit-details-marker { display: none; }
    .grp summary::before { content: "▸"; color: var(--muted); font-weight: 400; transition: transform .18s; }
    .grp[open] summary::before { transform: rotate(90deg); }
    .grp .gc { background: var(--bg); box-shadow: inset 0 0 0 1px var(--line); border-radius: 999px;
               padding: 2px 10px; font-size: .8rem; font-variant-numeric: tabular-nums; }
    .grp .gh { color: var(--muted); font-weight: 400; font-size: .8rem; }
    .grp .gnudge { width: auto; padding: 8px 14px; font-size: .85rem; margin-bottom: 4px; }
    /* Rows sit inside a group box already, so they're separated by a rule rather
       than being a second card-in-a-card. */
    .crow { padding: 12px 0; border-top: 1px solid var(--line); }
    .ctop { display: flex; align-items: center; gap: 8px; }
    .ctop strong { font-size: 1rem; letter-spacing: .04em; }
    .cprog { flex: 1; color: var(--muted); font-size: .85rem; font-variant-numeric: tabular-nums; }
    .cn { width: auto; padding: 7px 14px; font-size: .82rem; }
    .cmeta { color: var(--muted); font-size: .8rem; margin-top: 3px; }
    .warn { color: #9a3412; font-weight: 600; }
    /* "Your counter can't stamp yet." Its own class, not .warn: that one is a
       colour applied to a word inside a row, and giving it a box here would put
       a box round every one of them. Amber rather than red — nothing is broken,
       a step is outstanding — and the button is ghost, because the neon one on
       the page belongs to whatever the owner came here to do (DESIGN.md 1). */
    /* The tab strip used to carry 24px under itself; it is inside the header
       now, so the gap between that block and the panel it switches belongs
       here instead. */
    #pinwarn:not(:empty), #panel { margin-top: 22px; }
    #pinwarn:not(:empty) + #panel { margin-top: 0; }
    .pinwarn { display: flex; flex-wrap: wrap; align-items: center; gap: 10px;
               background: #fef3c7; color: #7c2d12; border: 1px solid #fcd34d;
               border-radius: 14px; padding: 12px 14px; margin-bottom: 14px;
               font-size: .88rem; line-height: 1.45; }
    .pinwarn p { margin: 0; flex: 1; min-width: 200px; }
    .pinwarn .btn { width: auto; padding: 8px 14px; font-size: .82rem; flex: none;
                    background: #fff; border-color: #d9a441; color: #7c2d12; }
    /* --- Customers: one standalone row per lapse cohort (not a collapsible) --- */
    .bucket { border: 1px solid var(--line); border-radius: 14px; padding: 12px 14px;
              margin-bottom: 8px; background: var(--surface); }
    .bucket .cprog { text-align: right; padding-right: 6px; }
    .bucket .cn:disabled { opacity: .4; }
    /* --- a value shown exactly once (a new PIN) --- */
    .temp { font-family: ui-monospace, Menlo, monospace; background: var(--ghost-bg); padding: 10px 12px;
            border-radius: 10px; margin-top: 10px; font-size: .85rem; line-height: 1.5; }
    /* --- Card tab: Design / Rules section headings --- */
    .sec { font-size: 1.1rem; margin: 28px 0 2px; padding-top: 20px; border-top: 1px solid var(--line); }
    /* --- counter activity: facts, and nothing that looks like a verdict --- */
    /* Deliberately has no state styling at all. There is no red, no bold-on-
       threshold, no chip: the moment one number can look different from
       another, the screen starts telling the owner what to think, which is the
       one thing it must not do. One weight, one colour, every row. */
    /* Two rows of three, not six lines. Every cell is the same size and the
       same weight whatever its number says — the moment one can look louder
       than another, the screen starts having an opinion. */
    .cact { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; margin: 4px 0 2px;
            background: var(--line); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
    /* White cells, because the grid opens inside a tinted fold and --surface on
       --surface left six invisible boxes. The 1px gaps ARE the --line grid
       showing through, so the cells have to be a colour that differs from it. */
    .cact .ccell { background: var(--bg); border: none; font: inherit; color: var(--ink);
                   text-align: left; padding: 11px 12px; min-width: 0; }
    .cact button.ccell { cursor: pointer; }
    .cact button.ccell:hover { background: var(--surface); }
    /* Display 800, tabular — the same treatment as the hero metrics, because
       these are metrics. Every cell gets it equally: the weight says "this is a
       number", never "this number is the interesting one". */
    .cact .cn { display: block; font-family: var(--display); font-weight: 800; font-size: 1.5rem;
                line-height: 1.1; letter-spacing: -.03em; font-variant-numeric: tabular-nums; }
    .cact .cl { display: block; margin-top: 3px; font-size: .72rem; color: var(--muted); line-height: 1.3; }
    .cact .cgo { color: var(--muted); font-size: .72rem; }
    .clist { width: 100%; border-collapse: collapse; font-size: .88rem; }
    .clist th { text-align: left; color: var(--muted); font-size: .7rem; text-transform: uppercase;
                letter-spacing: .06em; padding: 6px 8px 6px 0; border-bottom: 1px solid var(--line); }
    .clist td { padding: 9px 8px 9px 0; border-bottom: 1px solid var(--line); vertical-align: top; }
    .clist td.mono { font-family: ui-monospace, Menlo, monospace; font-size: .82rem; }
    .sec.first { margin-top: 4px; padding-top: 0; border-top: none; }
    /* Design is a set-it-once job, so it folds away (.fold lives in
       DESIGN_PANEL_CSS, with the panel that emits it). Rules — the reward, the
       stamp count, the win-back — is what owners come back to, and stays open. */
    /* --- show-password toggle --- */
    .eye { display: flex; align-items: center; gap: 6px; font-size: .8rem; color: var(--muted); margin: 8px 0 0; }
    .eye input { width: auto; }
    ${MODAL_CSS}
  `;
  const js = /* js */ `
    ${PALETTE_JS}
    ${MODAL_JS}
    const $ = (s, el=document) => el.querySelector(s);
    // Decided by the server from whether an email service is configured.
    const RESET_BY_EMAIL = ${canEmail ? "true" : "false"};
    // Shops are built for merchants and handed over with a claim link, so there
    // is nothing to sign up FOR here. Offering the form would only produce
    // empty shops nobody asked for.
    const ALLOW_SIGNUP = ${allowSignup ? "true" : "false"};
    const RESET_BOX = ${JSON.stringify(resetBox)};
    // Never rejects. A dropped connection used to throw out of whichever click
    // handler called this, unnoticed — no toast, a button that looked dead. It
    // reports status 0 instead, which every caller already treats as "not ok".
    async function api(path, opts = {}) {
      let res;
      try {
        res = await fetch("/dashboard/api" + path, {
          ...opts, headers: { "Content-Type": "application/json", ...(opts.headers||{}) },
        });
      } catch (e) {
        return { status: 0, body: { error: "network" } };
      }
      return { status: res.status, body: await res.json().catch(() => ({})) };
    }
    function toast(msg) {
      const t = $(".toast"); t.textContent = msg; t.classList.add("show");
      setTimeout(() => t.classList.remove("show"), 2600);
    }
    // Escaping for the handful of screens built by string concatenation rather
    // than a template literal. Same helper as the admin console's.
    const esc = (s) => String(s == null ? "" : s)
      .replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);

    // Reveal/hide password fields via a "Show" checkbox (data-eye = their
    // selector). querySelectorAll, not querySelector: one checkbox drives every
    // field it names, so changing a password is one box for both instead of two
    // that do the same job on adjacent lines.
    function wireEyes(root) {
      root.querySelectorAll("[data-eye]").forEach((cb) => {
        cb.onchange = () => {
          root.querySelectorAll(cb.dataset.eye).forEach((i) => { i.type = cb.checked ? "text" : "password"; });
        };
      });
    }

    // The two-tap arm() helper used to live here for "Generate a new PIN". That
    // button is gone — an owner types their own PIN now — and it was the only
    // thing on this page that used it, so the helper went with it. The stamper
    // and the admin console each keep their own copy; both are still used.

    function authForm(mode) {
      $("#app").innerHTML = \`
        <h1>\${mode === "signup" ? "Create your account" : "Owner login"}</h1>
        <p class="sub">\${mode === "signup"
          ? "Free to start: you’ll get your own loyalty card to design."
          : "Log in to manage your cards."}</p>
        \${mode === "signup" ? '<label>Café name</label><input id="cafename" placeholder="e.g. Kopi Corner">' : ""}
        <label>Email</label><input id="email" type="email" autocomplete="username">
        <label>Password\${mode === "signup" ? " (min 8 characters)" : ""}</label>
        <input id="pw" type="password" autocomplete="\${mode === "signup" ? "new-password" : "current-password"}">
        <label class="eye"><input type="checkbox" data-eye="#pw"> Show password</label>
        \${mode === "signup" ? '<label class="eye" style="margin-top:12px"><input type="checkbox" id="agree"> I agree to the <a href="/terms" target="_blank">Terms</a>&nbsp;&amp;&nbsp;<a href="/privacy" target="_blank">Privacy Policy</a></label>' : ""}
        <button class="btn btn-dark" style="margin-top:14px" id="go"\${mode === "signup" ? " disabled" : ""}>\${mode === "signup" ? "Create account" : "Log in"}</button>
        \${mode === "login" ? '<p class="muted" style="margin-top:12px;text-align:center"><a href="#" id="forgot">Forgot password?</a></p><div id="forgotbox" style="display:none">' + RESET_BOX + '</div>' : ""}
        \${ALLOW_SIGNUP
          ? '<p class="muted" style="margin-top:14px;text-align:center">' + (mode === "signup"
              ? 'Already have an account? <a href="#" id="switch">Log in</a>'
              : 'New here? <a href="#" id="switch">Create an account</a>') + "</p>"
          : ""}\`;
      wireEyes(document);
      const sw = $("#switch");
      if (sw) sw.onclick = (e) => { e.preventDefault(); authForm(mode === "signup" ? "login" : "signup"); };
      if (mode === "signup") {
        // Consent gates account creation.
        const ag = $("#agree");
        ag.onchange = () => { $("#go").disabled = !ag.checked; };
      }
      if (mode === "login") {
        $("#forgot").onclick = (e) => { e.preventDefault(); const b = $("#forgotbox"); b.style.display = b.style.display === "none" ? "block" : "none"; };
        // Without an email service there is no form to wire — the box just
        // explains how to actually get a reset.
        if (RESET_BY_EMAIL) $("#fsend").onclick = async () => {
          const email = $("#fmail").value.trim();
          if (!email.includes("@")) return toast("Enter your account email");
          await api("/forgot", { method: "POST", body: JSON.stringify({ email }) });
          toast("If that email has an account, a reset link is on its way ✉️");
          $("#forgotbox").style.display = "none";
        };
      }
      $("#go").onclick = async () => {
        const payload = { email: $("#email").value.trim(), password: $("#pw").value };
        if (mode === "signup") payload.cafeName = $("#cafename").value.trim();
        const { status, body } = await api("/" + mode, { method: "POST", body: JSON.stringify(payload) });
        if (body.ok) location.reload();
        else if (status === 429) toast("Too many attempts — try again in " + (body.retryAfterSeconds || 60) + "s.");
        else if (status === 0) toast("Couldn't reach PunchMe — check your connection.");
        else if (body.error === "account-closed") toast("This account is closed — message whoever set your PunchMe up.");
        else toast(body.error === "email-taken" ? "That email already has an account — log in instead."
                 : body.error || ("Failed (" + status + ")"));
      };
    }

    // Curated palettes so a new card looks good without fiddling. [bg, text, label]

    // The card editor: DESIGN (what it looks like) and RULES (how it behaves) as
    // two sections with their own Save, because they're two different jobs — the
    // old single panel mixed a colour picker with the staff PIN behind one button.
    ${DESIGN_PANEL_JS}
    ${HEALTH_JS}

    // ---- Home: totals across ALL cards + per-card breakdown + customer preview ----
    function homePanel() {
      const div = document.createElement("div");
      const sum = (k) => S.cards.reduce((a, c) => a + (c.metrics[k] || 0), 0);
      const breakdown = S.cards.length > 1
        ? \`<label style="margin-top:16px">Breakdown by card</label>
           <table class="breakdown"><tr><th>Card</th><th>Customers</th><th>Stamps</th><th>Rewards</th></tr>
           \${S.cards.map((c) => '<tr><td>' + c.name + '</td><td class="n">' + c.metrics.active + '</td><td class="n">' + c.metrics.stamps + '</td><td class="n">' + c.metrics.redemptions + '</td></tr>').join("")}
           </table>\`
        : "";
      div.innerHTML = \`
        <!-- Named, because the section under it is named. Four unlabelled tiles
             above a heading read as part of it, and these are a different
             question: how much has happened, against what shape the base is.
             "so far" answers the one an owner always asks next: since when? -->
        <h2 class="sec first">Overview</h2>
        <div class="totals" data-totals></div>
        <p class="muted" data-gap style="margin:-6px 0 4px"></p>
        <div data-health></div>
        \${breakdown}\`;

      // Money influenced = stamps × that card's average spend, summed per card
      // (each card can have a different basket). Hidden until a spend is set,
      // because a confident "0" would read as a real answer. The symbol comes
      // from each card, not from whichever card happened to be first.
      const priced = S.cards.filter((c) => c.averageSpend > 0);
      const oneCurrency = priced.every((c) => c.currency === (priced[0] || {}).currency);
      const influenced = priced.reduce((a, c) => a + c.metrics.stamps * c.averageSpend, 0);
      const money = (n) =>
        (oneCurrency ? (priced[0] || {}).currency || "" : "") +
        n.toLocaleString(undefined, { maximumFractionDigits: 0 });

      // Four numbers, all time, in a fixed 2×2 — the same four tiles whether or
      // not an average spend is set, so the shape of the page never shifts
      // under an owner. The "came back" rate was here and is not any more: it
      // needed a footnote about the week it takes to mean anything, and a tile
      // that has to be explained is a tile nobody reads. The retention
      // question is answered properly on the admin console. cardMetrics still
      // computes matured/returned — nothing else moves if it comes back.
      const host = div.querySelector("[data-totals]");
      host.className = "totals";
      host.innerHTML = \`
        <div class="metric"><b>\${sum("active")}</b><span>customers</span></div>
        <div class="metric"><b>\${sum("stamps")}</b><span>stamps</span></div>
        <div class="metric"><b>\${sum("redemptions")}</b><span>rewards given</span></div>
        <div class="metric"><b>\${priced.length ? money(influenced) : "—"}</b><span>tracked spend</span></div>\`;

      // Only the empty state now. The two "issued but not counted" figures that
      // used to sit here — cards abandoned at the Add sheet, and cards since
      // deleted — are both things an owner can do nothing about, and reading
      // them as a scoreline against yourself is worse than not knowing. Both
      // are still tracked and both are on the admin console.
      (async () => {
        const { body } = await api("/customers");
        const counts = body.counts || { active: 0, issuedNeverAdded: 0, removed: 0 };
        const line = div.querySelector("[data-gap]");
        line.innerHTML = counts.active
          ? ""
          : "No customers yet — they appear once someone adds your card and gets their first stamp.";
        if (!priced.length) {
          line.insertAdjacentHTML("afterend",
            '<p class="muted" style="margin:2px 0 4px">Set an average spend in Card → Rules to see tracked spend.</p>');
        }
        drawHealth(div.querySelector("[data-health]"), body);
      })();
      return div;
    }

    /**
     * Customer health: the shape of the base, not its size.
     *
     * The four tiles above say how many customers and how many stamps. These
     * four say whether the same people keep coming back, which is the question
     * a shop actually lives or dies on. Every customer is in exactly one, so
     * the four ALWAYS add up to the customers tile — checkable by eye, which is
     * the only reason a number like this can be trusted.
     *
     * The groups are computed server-side (HEALTH / healthOf) against the
     * shop's own expected return cycle, so a cafe and a barber both get an
     * honest answer without either of them tuning anything.
     */
    // ---- Notifications: one message, one button, one line saying who gets it ----
    // This was three cohort rows, a card dropdown and two paragraphs explaining
    // the limit. All of it said what one sentence under the button says, and the
    // limit was never enforced here anyway — canNudge (src/winback.ts) decides,
    // server-side, and reports back what actually went out. The groups came from
    // that same rule, so the subtitle can't disagree with the button either.
    /**
     * PARKED, not deleted. Both folds below are built and working; neither is
     * on screen while these are false.
     *
     * "Today's Activity" answers a question no owner has asked yet — it was
     * hard to tell what it was FOR — and "Find a customer" assumes a shop wants
     * to look someone up, which no one has needed. Rather than guess, they wait
     * for feedback from real shops. Flip either to true to bring it straight
     * back; the markup, the loaders and the drill-down sheets are all still
     * here, and test/pages.test.ts asserts that they are.
     */
    const SHOW_COUNTER_FOLD = false;
    const SHOW_FIND_FOLD = false;

    function customersPanel() {
      const div = document.createElement("div");
      div.innerHTML = \`
        <!-- No hint here on purpose. The two lines under the send button already
             say who this reaches and who it does not, in this shop's own
             numbers; a bubble restating the rule in words was one more thing to
             open and one more place for the cap to be written down wrongly. -->
        <h2 class="sec">Notifications</h2>
        <!-- Who first, then what. Choosing the audience changes what the line
             under the button says, so the count is always about the people
             actually being messaged. -->
        <label>Send to</label>
        <select data-audience></select>
        <label style="margin-top:12px">Message</label>
        <!-- Button UNDER the field, not beside it. Side by side, "Push
             notification" ate most of a phone's width and left the message —
             the thing being written — in a sliver. -->
        <input data-msg maxlength="200">
        <button class="btn btn-dark" style="margin-top:10px" data-send>Push notification</button>
        <p class="muted" style="margin-top:6px" data-who></p>
        <!-- Both parked behind the flags above. Folded, ahead of the customer
             search: it is what an owner checks first, and it must not push the
             message box off the screen — loaded only when opened. -->
        \${SHOW_COUNTER_FOLD ? \`
        <details class="grp" style="margin-top:22px" data-counter>
          <summary><span class="gt">Today's Activity</span>\${info("What happened at your counter today. Nobody is named — everyone shares one PIN. Tap a number for the times.")}<span class="gh" data-clast></span></summary>
          <div data-cbody style="margin-top:10px"></div>
        </details>\` : ""}
        \${SHOW_FIND_FOLD ? \`
        <details class="grp" style="margin-top:20px" data-find>
          <summary><span class="gt">Find a customer</span></summary>
          <input data-search placeholder="🔍 Card code" autocomplete="off" style="text-transform:uppercase;margin-top:10px">
          <div data-results style="margin-top:10px"></div>
        </details>\` : ""}\`;
      const q = (s) => div.querySelector(s);
      let all = [], ready = 0, everyone = 0, health = [], readyAll = 0;

      /**
       * Who the chosen audience IS, and how many of them this will reach.
       *
       * The dropdown names the group's real size — nine customers is nine
       * customers — and this line accounts for the gap between that and the
       * number the button will actually send. Showing only the sendable figure
       * made a group of nine read as five with no explanation, which looks like
       * customers going missing rather than a limit doing its job.
       *
       * The server filters again on the way out regardless: this is the honest
       * preview of that, never a substitute for it.
       */
      function paintAudience() {
        const sel = q("[data-audience]");
        const key = sel.value || "ready";
        const group = health.find((h) => h.key === key);
        ready = group ? group.eligible : readyAll;
        const total = group ? group.customers : everyone;
        // EVERYBODY the message will not reach, described as the weekly limit.
        // Some of them deleted the card instead, and the server knows exactly
        // which — see health[].removed — but that is a number an owner can do
        // nothing about and reads as a scoreline against themselves. One reason
        // on screen, both counted behind it, and the two lines always add up to
        // the number in the dropdown.
        const held = Math.max(0, total - ready);
        const lines = [];
        lines.push(ready
          ? "Will be sent to <strong>" + ready + "</strong> of " + total +
            (total === 1 ? " customer" : " customers")
          : "Nobody to message in this group right now");
        if (held) lines.push(held + (held === 1 ? " is" : " are") + " at the weekly limit");
        q("[data-who]").innerHTML = lines.join("<br>");
        q("[data-send]").disabled = !ready;
      }

      // ---- At the counter ---------------------------------------------------
      // Every cell is a count, and tapping one shows the times behind it. The
      // times ARE the answer: a count says something happened, the clock says
      // when, and "when" is the only thing an owner away from the shop can
      // actually judge. Nothing here computes a rate, compares two numbers, or
      // styles one differently from another — the owner knows their own shop.
      const hhmmss = (d) => new Date(d).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
      const hhmm = (d) => new Date(d).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      const dayOf = (d) => new Date(d).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
      // The sheet is titled with the same words as the cell that opened it, so
      // there is never a moment of wondering whether you tapped the right one.
      const named = { stamp: "Stamps given", undo: "Stamps taken back", redeem: "Rewards given" };

      // Loaded when the fold is first opened, not with the tab: this is a
      // second request and the message box above must never wait on it.
      const cfold = q("[data-counter]");
      let counterLoaded = false;
      if (cfold) cfold.addEventListener("toggle", async () => {
        if (!cfold.open || counterLoaded) return;
        counterLoaded = true;
        const { body } = await api("/counter");
        if (!body.ok) { counterLoaded = false; return; }
        const k = body.counter;

        // The last stamp is deliberately NOT limited to today — on a quiet day
        // it is the most useful fact there is. Which means it carries its date
        // when it isn't today, or "4:12pm" reads as this afternoon when it was
        // Tuesday. It sits on the closed fold, so it costs no row.
        if (k.lastStampAt) {
          const d = new Date(k.lastStampAt), now = new Date();
          const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
            && d.getDate() === now.getDate();
          q("[data-clast]").textContent = "last stamp " +
            (sameDay ? hhmm(k.lastStampAt) : dayOf(k.lastStampAt) + ", " + hhmm(k.lastStampAt));
        } else {
          q("[data-clast]").textContent = "nothing stamped yet";
        }

        // A cell is a button only when there is something behind it to open.
        const cell = (label, n, key) => {
          const inner = '<span class="cn">' + n + '</span><span class="cl">' + label +
            (key && n > 0 ? ' <span class="cgo">›</span>' : "") + "</span>";
          return key && n > 0
            ? '<button type="button" class="ccell" data-open="' + key + '">' + inner + "</button>"
            : '<div class="ccell">' + inner + "</div>";
        };
        q("[data-cbody]").innerHTML =
          '<div class="cact">' +
            cell("Stamps given", k.stamps, "stamps") +
            cell("Customers stamped", k.customers) +
            cell("Rewards given", k.rewards, "rewards") +
            // The literal event: staff confirmed a second stamp on the same card
            // inside a minute. Named for what happened, because there are plenty
            // of ordinary reasons for it — a paper card being transferred, most
            // obviously.
            cell("Stamped again within a minute", k.stampedAgain, "bursts") +
            cell("Stamps taken back", k.takenBack, "undos") +
            cell("Phones that stamped", k.phones, "devices") +
          "</div>";

        const list = (rows, head, cells) =>
          rows.length
            ? '<table class="clist"><tr>' + head.map((h) => "<th>" + h + "</th>").join("") + "</tr>" +
              rows.map((r) => "<tr>" + cells(r).map((c) => "<td>" + c + "</td>").join("") + "</tr>").join("") +
              "</table>"
            : "<p>Nothing today.</p>";

        q("[data-cbody]").querySelectorAll("[data-open]").forEach((b) => {
          b.onclick = () => {
            const kind = b.dataset.open;
            if (kind === "bursts") {
              return sheet("Stamped again within a minute",
                list(k.bursts, ["Time", "Stamps", "Over", "Card"], (r) =>
                  [hhmmss(r.at), r.stamps, r.seconds + "s", '<span class="mono">' + (r.code || "—") + "</span>"]) +
                // Otherwise "4 stamps over 66s" under a heading that says "within
                // a minute" reads as a contradiction. The minute is the gap
                // between stamps, not the length of the whole run.
                '<p class="muted" style="margin-top:12px;font-size:.82rem">Each stamp landed under a ' +
                "minute after the one before it, so a run of several can span longer than that.</p>");
            }
            if (kind === "devices") {
              return sheet("Phones that stamped",
                list(k.devices, ["Phone", "First seen", "Last seen", "Stamps"], (r) =>
                  ['<span class="mono">' + r.device_id.slice(0, 6) + "</span>",
                   dayOf(r.first_seen), dayOf(r.last_seen), r.stamps]) +
                // Both of these would mislead if left unsaid, and neither is a
                // judgement — they are how the list is built.
                '<p class="muted" style="margin-top:12px;font-size:.82rem">Phones that have stamped in ' +
                "the last 14 days, not phones signed in. A phone whose browser data is cleared comes " +
                "back as a new one here. To sign every phone out, reset the staff PIN under Shop.</p>");
            }
            const want = kind === "stamps" ? "stamp" : kind === "rewards" ? "redeem" : "undo";
            sheet(named[want],
              list(k.events.filter((e) => e.type === want), ["Time", "Card"], (r) =>
                [hhmmss(r.at), '<span class="mono">' + (r.code || "—") + "</span>"]));
          };
        });
      });

      /** Send. The server decides who is actually eligible and reports back. */
      async function nudge(payload, expected) {
        const message = q("[data-msg]").value.trim();
        if (!message) return toast("Type a message first");
        if (!expected) return toast("Nobody to message right now");
        const { body } = await api("/nudge", { method: "POST", body: JSON.stringify(Object.assign({ message }, payload)) });
        if (!body.ok) return toast(body.error || "Failed");
        const s = body.skipped || {};
        const held = (s.rateLimited || 0) + (s.removed || 0);
        toast("Sent to " + body.sent + " of " + body.total + (held ? " · " + held + " held back by the limit" : ""));
        load();
      }

      // The one thing an owner has to read before sending sits here, not as grey
      // subtext under the box: it goes out exactly as typed, to real phones, and
      // it cannot be taken back.
      async function confirmSend(count, payload) {
        const msg = q("[data-msg]").value.trim();
        if (!msg) return toast("Type a message first");
        const ok = await modal(
          "Send to " + count + (count === 1 ? " customer?" : " customers?"),
          "<p>It goes out exactly as written, to their phone, and cannot be taken back.</p>" +
            '<p style="margin-top:8px"><strong>' + mdlEsc(msg) + "</strong></p>" +
            '<p style="margin-top:8px">Anyone messaged in the last 7 days is skipped automatically.</p>',
          "Send it",
        );
        if (ok) nudge(payload, count);
      }

      // Code and progress on one line, the story underneath.
      function row(x) {
        const el = document.createElement("div"); el.className = "crow";
        const seen = x.lastDays === 0 ? "in today" : x.lastDays + " days ago";
        const why = x.blocked === "rate-limited" ? "messaged in the last 7 days"
          : x.blocked === "removed" ? "deleted the card" : "";
        el.innerHTML = \`
          <div class="ctop">
            <strong>\${x.code}</strong>
            <span class="cprog">\${x.stamps}/\${x.target}</span>
            \${x.canNudge ? '<button class="btn btn-ghost cn" data-n>Message</button>' : ""}
          </div>
          <div class="cmeta">last \${seen}\${why ? ' · <span class="warn">' + why + "</span>" : ""}</div>\`;
        const btn = el.querySelector("[data-n]");
        if (btn) btn.onclick = () => confirmSend(1, { target: [x.serial] });
        return el;
      }

      // Hidden until they type: the list is a lookup tool, not a view.
      function renderResults() {
        const box = q("[data-search]");
        if (!box) return; // parked — see SHOW_FIND_FOLD
        const search = (box.value || "").trim().toUpperCase();
        const host = q("[data-results]"); host.innerHTML = "";
        if (!search) return;
        const shown = all.filter((x) => x.code.toUpperCase().includes(search));
        if (!shown.length) { host.innerHTML = '<p class="muted">No card has that code.</p>'; return; }
        for (const x of shown.slice(0, 25)) host.appendChild(row(x));
      }

      async function load() {
        // Always every card. The dropdown is gone with the one-card-per-merchant
        // cap; the two legacy merchants running two cards message both at once,
        // which is what a person at their shop expects anyway.
        const { body } = await api("/customers?cardId=all");
        all = body.customers || [];
        const buckets = body.buckets || [];
        const find = (k) => (buckets.find((b) => b.key === k) || {});
        health = body.health || [];
        readyAll = find("ready").eligible || 0;
        // Everyone means everyone, so the count is every customer — not the
        // sendable ones. The four health groups partition the same people, so
        // this is also the number the tiles above add up to.
        everyone = health.reduce((a, h) => a + h.customers, 0);

        // Everyone, then one option per health group. The groups are the
        // audiences worth choosing — chase the Lost, thank the Regulars — while
        // the cooldown buckets stay a read-out: "messaged this week" is a
        // reason somebody is skipped, never a group to aim at.
        const sel = q("[data-audience]");
        const keep = sel.value;
        // Group SIZE in the dropdown, not the sendable count: the dropdown is
        // for choosing who to talk to, and "Regulars (2)" when a shop has five
        // regulars is simply a wrong label. What will actually go out is the
        // line under the button.
        sel.innerHTML =
          '<option value="ready">Everyone (' + everyone + ")</option>" +
          health.map((h) =>
            '<option value="' + h.key + '">' + esc(h.label) + " (" + h.customers + ")</option>",
          ).join("");
        if (keep) sel.value = keep;
        paintAudience();
        // Pre-fill with the shop's stored starting message, so the box is never
        // empty. It is edited here and nowhere else now — the duplicate field in
        // Card → Rules was two places to set one message, on a page the owner
        // wasn't on when they sent it.
        if (!q("[data-msg]").dataset.touched) q("[data-msg]").value = (S.cards[0] || {}).winbackMessage || "";
        renderResults();
      }
      q("[data-msg]").oninput = (e) => { e.target.dataset.touched = "1"; };
      q("[data-audience]").onchange = paintAudience;
      q("[data-send]").onclick = () =>
        confirmSend(ready, { target: q("[data-audience]").value || "ready" });
      const searchBox = q("[data-search]");
      if (searchBox) searchBox.oninput = renderResults;
      load();
      return div;
    }

    // ---- Cards: pick a card (chips) + the designer for the selected one ----
    function cardsPanel() {
      const div = document.createElement("div");
      div.innerHTML = \`<div class="cardpick" data-pick></div><div data-design></div>\`;
      const pick = div.querySelector("[data-pick]");
      const host = div.querySelector("[data-design]");
      function draw() {
        pick.innerHTML = "";
        if (S.cards.length > 1) {
          S.cards.forEach((c, i) => {
            const b = document.createElement("button");
            b.textContent = c.name; b.dataset.ci = String(i);
            b.className = i === S.selCard ? "on" : "";
            b.onclick = () => { S.selCard = i; draw(); };
            pick.appendChild(b);
          });
        }
        // No "+ Add card" button: V1 is one card per merchant, and the server
        // refuses a second one. The chips above still render for the few
        // merchants that added a card before that cap existed, so they can edit
        // both until an operator removes the spare.
        host.innerHTML = "";
        // The owner edits their real card, so every path points at it and the
        // customer count is a live number. The console passes a different env
        // and gets the same panel — see DESIGN_PANEL_JS.
        const card = S.cards[S.selCard];
        const artBase = card.id === "default" ? "" : "/c/" + card.id;
        host.appendChild(designPanel(card, {
          api, toast, modal, info,
          path: (suffix) => "/card/" + card.id + suffix,
        apiBase: "/dashboard/api",
          artUrl: (kind, v) => artBase + "/art/" + kind + ".png" + (v ? "?v=" + v : ""),
          customersPath: "/customers?cardId=" + encodeURIComponent(card.id),
          rulesNote: "",
          showDetails: true,
          // Nothing above the Card tab names this panel, so it names itself.
          titled: true,
          saveLabel: "Save changes",
          // Keep the card-picker chip labels in sync without resetting the form.
          onRulesSaved: () => {
            const pk = document.querySelector("[data-pick]");
            if (pk) pk.querySelectorAll("button[data-ci]").forEach((b) => {
              b.textContent = S.cards[Number(b.dataset.ci)].name;
            });
          },
        }));
      }
      draw();
      return div;
    }

    // ---- Shop: every link you hand out, then the counter, then your login ----
    // The links used to sit under the card designer, which put "print this for
    // the counter" on the page you visit to change a colour. They are all
    // set-up-once things, so they live together, split by who they are for.
    function accountPanel() {
      const div = document.createElement("div");
      const c = S.cards[0] || {};
      div.innerHTML = \`
        <!-- Above the PIN on purpose. Both are set-once answers a shop owes
             before anything works properly, and the setup banner asks for both
             — so they are the first two things on this tab, in that order. -->
        <h2 class="sec first">Your customers</h2>
        <p class="muted">How often should a customer come back?\${info("How often you'd expect a regular to come in. It only sorts your customers into New, Returning, Regular and Lost on the Customers tab. It changes nothing about your card, your stamps or your reward.")}</p>
        <select data-cycle style="margin-top:8px">
          <option value="">Choose one…</option>
          <option value="14">Once every 1–2 weeks</option>
          <option value="21">Once every 2–3 weeks</option>
          <option value="28">Once every 3–4 weeks</option>
        </select>
        <p class="muted" data-cycleout style="margin:6px 0 0;font-size:.84rem"></p>

        <h2 class="sec">Staff stamper</h2>
        <p class="muted">Staff use this tool to punch cards.\${info("One PIN for your whole counter. It is stored scrambled, so nobody can look it up. Setting a new one signs every staff phone out.")}</p>
        <label style="margin-top:14px" data-pinlabel>Staff PIN</label>
        <div class="copyrow" style="margin-top:6px">
          <input data-pin placeholder="4–12 digits" inputmode="numeric" autocomplete="off">
          <button class="btn btn-ghost" data-setpin>Set</button>
        </div>
        <div data-pinout></div>
        <!-- The card id MUST be in this link. Without it a bare /staff has to
             guess which counter it is, and on a deployment with several
             merchants the guess used to be "whoever owns the café named
             default" — a stranger. -->
        <div class="sharelist" style="margin-top:12px">
          <a href="/staff?c=\${c.id || ""}" target="_blank"><span>Open the stamper <span class="sub2">staff sign in here with the PIN</span></span><span class="arr">open →</span></a>
        </div>

        <h2 class="sec">Share</h2>
        <!-- Both are /j/ links: the merchant ref survives a rename, a second
             card and a change of ownership, and every ref a shop has ever held
             keeps resolving — which is what makes a printed poster safe. Card
             links stay live forever too, so nothing already shared breaks. -->
        <div class="sharelist">
          <!-- ?s=link so a shared link is told apart from a poster scan. Both
               are plain page views otherwise, and knowing which channel works
               is the difference between printing more posters and posting more. -->
          <a href="/j/\${S.joinRef || c.id || ""}?s=link" target="_blank"><span>Sign-up link <span class="sub2">send it, or put it in a bio</span></span><span class="arr">open →</span></a>
          <a href="/c/\${c.id || ""}/poster" target="_blank"><span>Sign-up poster <span class="sub2">print this for the counter</span></span><span class="arr">open →</span></a>
        </div>

        <h2 class="sec">Your account</h2>
        <label>Signed in as</label>
        <p style="font-weight:600;margin-bottom:6px">\${S.email}</p>
        <label style="margin-top:10px">Change password</label>
        <input data-cur type="password" placeholder="Current password" autocomplete="current-password">
        <input data-new type="password" placeholder="New password (min 8)" autocomplete="new-password" style="margin-top:8px">
        <label class="eye"><input type="checkbox" data-eye="[data-cur],[data-new]"> Show passwords</label>
        <button class="btn btn-dark" style="margin-top:20px" data-pwsave>Update password</button>
        <button class="btn btn-ghost" style="margin-top:20px" data-out>Log out</button>\`;
      wireEyes(div);
      // No wireInfo here: renderPanel delegates from the panel this sits inside,
      // and a second listener on an ancestor would fire on the same click and
      // close what the first just opened.

      // "Set" or "Reset" — an owner who already has a PIN is replacing one, and
      // the button saying "Set" made that look like a first-time action they had
      // somehow missed. The PIN itself is never sent back here: only its scrypt
      // hash is stored, so all the server can say is whether one exists.
      if (S.hasStaffPin) {
        div.querySelector("[data-pinlabel]").textContent = "Reset staff PIN";
        div.querySelector("[data-setpin]").textContent = "Reset";
        div.querySelector("[data-pin]").placeholder = "New PIN (4–12 digits)";
      }

      const pinOut = div.querySelector("[data-pinout]");
      // The PIN is NOT painted back. "Generate a new PIN" is gone, so the owner
      // always typed the one they just set and reading it back to them serves
      // nobody — while putting a live counter credential on a screen that may be
      // sitting open on the till does. What they do need is the consequence.
      const setPin = async (pin) => {
        const { body } = await api("/staff-pin", { method: "POST", body: JSON.stringify({ pin }) });
        if (!body.ok) {
          return toast(body.error === "pin-too-short" ? "Use at least 4 digits" : (body.error || "Couldn’t set the PIN"));
        }
        pinOut.innerHTML = '<div class="temp">PIN saved. Every staff phone has been signed out — ' +
          'they each need to sign in again with the new one.</div>';
        div.querySelector("[data-pinlabel]").textContent = "Reset staff PIN";
        div.querySelector("[data-setpin]").textContent = "Reset";
        // The first PIN also clears the banner above. Without this it sits there
        // contradicting the confirmation directly beneath it until a reload.
        S.hasStaffPin = true;
        renderPinWarning();
      };
      /**
       * How often customers should come back.
       *
       * Saves on the tap — like the logo upload, not like the colours. There is
       * one value, it is instantly reversible, and a Save button for a single
       * radio is a step that only exists to be forgotten. The health groups
       * re-cohort the same people with no new events, so pressing it is safe to
       * do twice while you decide.
       */
      const cycles = div.querySelector("[data-cycle]");
      const cycleOut = div.querySelector("[data-cycleout]");
      const paintCycle = () => {
        cycles.value = S.cycleDays ? String(S.cycleDays) : "";
        cycleOut.textContent = S.cycleDays
          ? "Used to group your customers."
          : "Not set — we're assuming every 2 weeks for now.";
      };
      paintCycle();
      cycles.onchange = async () => {
        const days = Number(cycles.value);
        if (!days) return paintCycle();
        const { body } = await api("/return-cycle", { method: "POST", body: JSON.stringify({ days }) });
        if (!body.ok) { paintCycle(); return toast(body.error || "Couldn't save that"); }
        S.cycleDays = days;
        paintCycle();
        renderPinWarning();
        toast("Saved ✓");
      };

      div.querySelector("[data-setpin]").onclick = () => {
        const el = div.querySelector("[data-pin]");
        const pin = el.value.trim();
        if (pin.length < 4) return toast("Use at least 4 digits");
        el.value = "";
        setPin(pin);
      };

      div.querySelector("[data-pwsave]").onclick = async () => {
        const { body } = await api("/change-password", { method: "POST", body: JSON.stringify({
          current: div.querySelector("[data-cur]").value, next: div.querySelector("[data-new]").value,
        })});
        if (body.ok) { toast("Password updated ✓"); div.querySelector("[data-cur]").value = ""; div.querySelector("[data-new]").value = ""; }
        else toast(body.error || "Couldn’t update");
      };
      div.querySelector("[data-out]").onclick = async () => { await api("/logout", { method: "POST" }); location.reload(); };
      return div;
    }

    ${SEG_JS}
    // ---- app shell: owner-scoped tabs ----
    const S = { cards: [], email: "", tab: "customers", selCard: 0, hasStaffPin: false,
                joinRef: "", cycleDays: 0 };

    /**
     * A screen with no tabs behind it: a message and a way out. EVERY dead end
     * on this page goes through here, because the page's server-rendered body
     * is the word "Loading…" and nothing else — whatever fails to paint over it
     * leaves an owner staring at a spinner that is not a spinner, with no log
     * out button and therefore no way to reach the login form again. The retry
     * argument is optional; the log out button never is.
     */
    function deadEnd(email, message, retry) {
      $("#app").innerHTML =
        '<div><h1 style="margin:0">Dashboard</h1>' +
        (email ? '<p class="sub" style="margin:2px 0 14px">' + esc(email) + "</p>" : "") + "</div>" +
        '<p class="muted">' + esc(message) + "</p>" +
        '<div style="display:flex;gap:8px;margin-top:16px">' +
        (retry ? '<button class="btn btn-ghost" style="width:auto;padding:10px 16px" data-retry>Try again</button>' : "") +
        '<button class="btn btn-ghost" style="width:auto;padding:10px 16px" data-out>Log out</button></div>';
      if (retry) $("[data-retry]").onclick = () => retry();
      // Logging out must work even when the server is the thing that is broken:
      // reload regardless, so a failed request cannot pin somebody to this
      // screen. The cookie clear is best-effort, the escape is not.
      $("[data-out]").onclick = async () => {
        try { await api("/logout", { method: "POST" }); } finally { location.reload(); }
      };
    }

    async function app() {
      const { status, body } = await api("/overview");
      if (status === 401) return authForm("login");
      // An archived shop is closed and requireOwner refuses every call behind
      // it. Say which it is; the alternative was reading cards off a body that
      // does not have any.
      if (status === 403) {
        return void deadEnd("", "This account is closed. If that is a surprise, message whoever set your PunchMe up.");
      }
      // Anything else that is not the overview: a 5xx, a proxy's HTML error
      // page, a dropped connection. Offer the retry rather than crash on a
      // body that has no cards in it.
      if (!Array.isArray(body.cards)) {
        return void deadEnd("", "Couldn't load your dashboard. Check your connection and try again.", app);
      }
      S.cards = body.cards; S.email = body.email; S.selCard = 0; S.tab = "customers";
      S.hasStaffPin = !!body.hasStaffPin;
      // 0 means never chosen — the setup banner asks for it, and the Shop tab
      // shows nothing selected rather than a default they never picked.
      S.cycleDays = Number(body.returnCycleDays) || 0;
      S.joinRef = body.joinRef || "";
      // An account that holds no shop. It happens when a shop is handed to
      // somebody else: the login survives — deleting it would take an account
      // away over a mis-click — but it owns nothing, and every tab below reads
      // S.cards[0]. Say so plainly rather than render three empty tabs.
      if (!S.cards.length) {
        return void deadEnd(
          S.email,
          "This account does not have a shop. If that is a surprise, message whoever set your PunchMe up — they can hand it back.",
        );
      }
      /**
       * The block the dashboard opens on.
       *
       * It replaced "Dashboard" over the login email — a title that named the
       * software and said nothing to the person reading it — and it is also the
       * rule between the tab strip and the page, which had none.
       *
       * Everything here is already in S. No request, no query: a greeting that
       * costs a round trip is a greeting that arrives after you have started
       * reading.
       *
       * The numbers are SUMMED across cards. A merchant running two programmes
       * has one shop, and this block greets the shop — reading them off
       * cards[0] would show one programme's figures as though they were the
       * whole business, which is the shape of bug this codebase has had twice.
       */
      function greetHtml() {
        const shop = (S.cards[0] || {}).shopName || "your shop";
        // Who you are, and where you are going. The counts and the share link
        // that used to sit here are both said better further down — the numbers
        // by the Customers tab this block opens on, and the link by the Shop
        // tab, which is where somebody goes looking for it. Repeating them here
        // made the header the third place each appeared.
        return '<div class="greet">' +
          "<h1>Hello, " + esc(shop) + "</h1>" +
          '<p class="who">' + esc(S.email) + "</p>" +
          // The tabs live INSIDE this block, so the shop, the account and the
          // navigation read as one fixed thing that the panel changes under.
          '<div class="seg" id="tabs" role="tablist">' +
            '<button data-tab="customers" class="on">Customers</button>' +
            '<button data-tab="card">Card</button>' +
            '<button data-tab="shop">Shop</button>' +
            '<span class="thumb"></span>' +
          "</div>" +
          "</div>";
      }

      // Three tabs, each one job: who your customers are and how it's going ·
      // what the card is · everything you set once. Home and Customers used to
      // be separate, which left a headline row on one page and the people it
      // described on another; with one card per merchant the first was too thin
      // to be a page of its own.
      $("#app").innerHTML = \`
        \${greetHtml()}
        <div id="pinwarn"></div>
        <div id="panel"></div>\`;
      $("#tabs").querySelectorAll("button").forEach((b) => {
        b.onclick = () => go(b.dataset.tab);
      });
      renderTabs(); renderPinWarning(); renderPanel();
    }

    /**
     * The counter cannot stamp until a PIN exists, and nothing used to say so.
     *
     * No PIN is minted at signup or at claim any more — an owner picks their own
     * under Shop. That is the right trade (a PIN can only ever be read once, and
     * a "write this down now" screen is a memory test at the worst moment), but
     * it leaves a real gap: verifyPassword refuses an empty hash, so every staff
     * sign-in fails, and it fails looking exactly like a wrong PIN. Above the
     * panels, on every tab, because the tab it sends you to is not the one an
     * owner opens first.
     */
    function renderPinWarning() {
      const box = $("#pinwarn");
      if (!box) return;
      // Two set-once answers a shop owes before the product works properly, in
      // ONE banner rather than two stacked warnings — a second amber box beside
      // the first is how a page teaches people to ignore both. Each line names
      // what is broken meanwhile, not what the field is called.
      const todo = [];
      if (!S.hasStaffPin) {
        todo.push("<strong>Your counter can’t stamp yet.</strong> " +
          "Staff sign in to the stamper with a PIN, and you haven’t picked one.");
      }
      if (!S.cycleDays) {
        todo.push("<strong>Pick how often customers should come back.</strong> " +
          "It's what sorts your customers into New, Returning, Regular and Lost.");
      }
      if (!todo.length) { box.innerHTML = ""; return; }
      box.innerHTML =
        '<div class="pinwarn"><p>' + todo.join('</p><p style="margin-top:6px">') + "</p>" +
        '<button class="btn btn-ghost" id="gopin">' +
          (todo.length > 1 ? "Finish setting up" : !S.hasStaffPin ? "Set a staff PIN" : "Set it") +
        "</button></div>";
      $("#gopin").onclick = () => go("shop");
    }

    /** Switch tabs from anywhere (the tab bar, or a link inside a panel). */
    function go(tab) { S.tab = tab; renderTabs(); renderPanel(); window.scrollTo(0, 0); }

    function renderTabs() {
      const seg = $("#tabs");
      seg.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.tab === S.tab));
      moveThumb(seg);
    }
    function renderPanel() {
      const panel = $("#panel"); panel.innerHTML = "";
      if (S.tab === "card") panel.appendChild(cardsPanel());
      else if (S.tab === "shop") panel.appendChild(accountPanel());
      else {
        // The numbers, then the people they are about — one page, in that order.
        panel.appendChild(homePanel());
        panel.appendChild(customersPanel());
      }
      wireInfo(panel);
    }

    // The last line of defence. The body this script boots into is the word
    // "Loading…", so ANY exception before something paints over it leaves an
    // owner on a dead screen with no log out button and no way back to the
    // login form — which is exactly what one undefined helper did. Awaited, not
    // fired and forgotten: an un-awaited app() would reject past this catch.
    async function boot() {
      try {
        const { body } = await api("/state");
        if (body.loggedIn) await app();
        else authForm("login");
      } catch (e) {
        console.error("[dashboard] boot failed:", e);
        deadEnd("", "Something went wrong loading this page.", boot);
      }
    }
    boot();
  `;
  return page(
    "PunchMe — Dashboard",
    `<div class="card" id="app"><p class="sub">Loading…</p></div><div class="toast"></div>`,
    css,
    js,
  );
}

// --------------------------------------------------------------- poster ----

/**
 * The owner's own printable sign-up poster, in their card's colours.
 *
 * What this replaces: the Shop tab used to link straight at `/c/:id/qr`, which
 * serves a **bare PNG**. Printing that gives you a black square on white paper
 * with no shop name, no offer, and nothing telling a customer they don't need to
 * download anything — which is the single objection a poster has to answer.
 *
 * The QR encodes the MERCHANT join link, not a card link. That is the whole
 * point of `/j/:ref`: a poster on a counter outlives a rename, a second card and
 * a change of ownership (see CLAUDE.md). Retired slugs redirect forever, so a
 * printed poster can never be killed by an edit in the dashboard.
 */
export function posterPage(
  card: Pick<CardRow, "id" | "reward" | "stamps_target" | "signup_message" | "kind" | "benefits" | "milestones"> & {
    background_color: string;
    accent_color: string;
    label_color: string;
  },
  /** The shop's name — the merchant's, not the card's. */
  business: string,
  /** Merchant id or current slug: whatever `/j/:ref` should carry. */
  joinRef: string,
  /** 0 = no uploaded logo, so the header runs on type alone. */
  logoVersion = 0,
  /** The logo is a lockup that already reads as the name — see cards.logo_has_name. */
  logoHasName = false,
): string {
  const bg = rgbToHex(card.background_color);
  const accent = rgbToHex(card.accent_color);
  // Never sampled: a shop whose brand colour is dark and whose accent is also
  // dark would otherwise print a header nobody can read.
  const onBg = contrastText(bg);
  // The QR frame is the accent, and the paper behind it is white — so a pale
  // brand colour printed as no frame at all. Fall back to the card colour, and
  // to ink if that is pale too, rather than framing white in white.
  const frame = contrastRatio(accent, "#ffffff") >= 1.6
    ? accent
    : (contrastRatio(bg, "#ffffff") >= 1.6 ? bg : "#111111");
  // A lockup that already says the name would otherwise print it twice, exactly
  // as the wallet card did before logo_has_name existed.
  const showName = !(logoHasName && logoVersion);
  const ref = encodeURIComponent(joinRef);
  const css = /* css */ `
    body { max-width: 640px; }
    .poster { border: 1px solid var(--line); border-radius: 18px; overflow: hidden; background: #fff; }
    .phead { background: ${bg}; color: ${onBg}; padding: 26px 28px 22px; text-align: center; }
    /* Height-bound so a wide brand lockup keeps its width — see .pv-logo. This
       one is printed, so the cap is generous: paper has the room. */
    .phead img { height: 74px; width: auto; max-width: min(320px, 100%);
                 object-fit: contain; margin-bottom: 10px; }
    /* overflow-wrap, because .poster clips rather than wraps: one long unbroken
       word ("Kopitiam@BukitBintang") was silently cut off mid-name. clamp so a
       long name shrinks instead of pushing the QR onto a second sheet. */
    .phead h1 { font-size: clamp(1.15rem, 5vw, 1.7rem); margin: 0; color: ${onBg};
                letter-spacing: -.01em; overflow-wrap: anywhere; }
    .pbody { padding: 26px 28px 20px; text-align: center; }
    .poffer { font-size: clamp(1.05rem, 4.2vw, 1.5rem); font-weight: 700; line-height: 1.25;
              margin: 0 0 8px; text-wrap: balance; overflow-wrap: anywhere; }
    .pno { font-size: 1rem; color: var(--muted); margin: 0 0 20px; }
    /* The QR is the point of the sheet, so it takes the space. Framed in the
       card's accent so the paper reads as theirs from across a counter. */
    .pqr { border: 6px solid ${frame}; border-radius: 16px; padding: 12px; background: #fff;
           width: min(100%, 380px); margin: 0 auto; }
    .pqr img { display: block; width: 100%; height: auto; }
    /* Centred to match everything else on the sheet — see .pvp-steps, which is
       the mock of this block and has to keep saying the same thing. */
    .psteps { text-align: center; max-width: 340px; margin: 22px auto 0; color: var(--muted);
              font-size: .92rem; line-height: 1.8; }
    .pfoot { border-top: 1px solid var(--line); padding: 12px 28px; text-align: center;
             color: var(--muted); font-size: .76rem; letter-spacing: .02em; }
    .noprint { margin-top: 18px; }
    .phint { margin-top: 10px; font-size: .85rem; color: var(--muted); line-height: 1.5; }
    @media print {
      .noprint { display: none; }
      /* One sheet. A 120-character message used to push the QR over the page
         break, which prints a poster with its code cut in half. */
      .poster { break-inside: avoid; page-break-inside: avoid; }
      body { max-width: none; padding: 0; background: #fff; }
      .poster { border: none; border-radius: 0; }
      /* Browsers strip background colours when printing unless told not to. The
         brand colour IS the poster, so without this it prints as a white band
         and the whole exercise is a plain QR again. */
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      @page { margin: 12mm; }
    }`;
  const body = `
    <div class="poster">
      <div class="phead">
        ${logoVersion ? `<img src="/c/${encodeURIComponent(card.id)}/art/logo.png?v=${logoVersion}" alt="">` : ""}
        ${showName ? `<h1>${esc(business)}</h1>` : ""}
      </div>
      <div class="pbody">
        <p class="poffer">${signupLine(card)}</p>
        <p class="pno">Scan to get your card — no app to download.</p>
        <div class="pqr"><img src="/j/${ref}/qr" alt="Scan to add your loyalty card"></div>
        <div class="psteps">
          1. Point your camera at the code<br>
          2. Tap <strong>Add to Apple Wallet</strong> or <strong>Google Wallet</strong><br>
          3. Show the card when you order — it stamps itself
        </div>
      </div>
      <div class="pfoot">Powered by ${PRODUCT_NAME}</div>
    </div>
    <div class="noprint">
      <button class="btn btn-dark" data-print>Print this poster</button>
      <button class="btn btn-ghost" data-share style="display:none;margin-top:8px">Share this poster</button>
      <p class="phint" data-phint style="display:none">On a phone, Print is not always offered.
        Share this page to a computer that has a printer — or, in the share sheet, pick Print.</p>
    </div>
    <script>
      (function () {
        var shareBtn = document.querySelector("[data-share]");
        var hint = document.querySelector("[data-phint]");
        document.querySelector("[data-print]").onclick = function () {
          // Wrapped, because on a phone window.print() is present and does
          // nothing at all in several browsers, and throws in a few others.
          // Either way the reader gets the hint below instead of a dead button.
          try { window.print(); } catch (err) { /* the hint is already showing */ }
        };
        // navigator.share exists where there IS a share sheet, which is the one
        // reliable route to a printer from a phone. It is also the honest test
        // for "this is a phone" — far better than sniffing the user agent.
        if (navigator.share) {
          shareBtn.style.display = "";
          hint.style.display = "";
          shareBtn.onclick = function () {
            navigator.share({ title: document.title, url: location.href }).catch(function () {});
          };
        }
      })();
    </script>`;
  // No shell footer: the poster carries its own, inside the printed area, where
  // it will actually appear on paper.
  return page(`${business} — sign-up poster`, body, css, "", false);
}

// ---------------------------------------------------------------- admin ----

// counterSheetPage lived here. It was the plain, admin-only second printable,
// and posterPage above replaced it on every axis: branded, carries the logo, and
// its QR is /j/:ref rather than /c/:cardId — so a rename or a second card can
// never strand it. /c/:cardId/qr stays a route; only this sheet is gone.

/**
 * The merchant console — one page, one path down it.
 *
 * What it is for, in one sentence: get a shop from signed up → stamping → still
 * stamping in 30 days → paying. Everything on the page answers one of four
 * questions in that order — did they start, are people signing up, do those
 * customers come back, is it worth money — and the drill-down asks them in
 * exactly that order.
 *
 * It used to render each of those facts TWICE: once per merchant in a row's
 * drill-down, and again in five "platform-wide" tables keyed on the loyalty
 * programme instead of the business. Almost every shop runs one programme, so
 * they were the same rows twice, and the two funnels were free to disagree.
 * Only the merchant view survives.
 *
 * The prose went with it. Explanations live on ⓘ icons (MODAL_JS) beside the
 * heading they explain, so the page is numbers and the words are one tap away.
 */
export function adminPage(): string {
  // Every problem the console can raise, keyed the way `triage` keys its flags.
  // The rules used to sit in a table on the page — fourteen rows of prose under
  // a list that was usually three lines long. Same words, moved behind the chip
  // they explain, where you read them at the moment you are asking.
  const flagHelp = JSON.stringify(
    Object.fromEntries(FLAG_GUIDE.map((g) => [g.key, `${g.rule}. ${g.why}`])),
  );
  // The stage vocabulary, from the one file that defines it. Written here rather
  // than retyped in the browser so the table, a shop's header and `stageOf`
  // cannot end up calling the same state three different things.
  const stageLabels = JSON.stringify(STAGE_LABEL);
  const css = /* css */ `
    body { max-width: none; }
    .awrap { width: 100%; max-width: 1040px; }
    .purpose { color: var(--muted); font-size: .88rem; margin: 2px 0 0; }
    /* --- the one number the console leads with ------------------------------
       Four hero numbers used to sit at the top, then four panels of them. Both
       made you read everything to find the one thing that mattered. There is
       exactly ONE hero on this page, and the rest is a trend. */
    .lead { display: grid; gap: 20px; margin: 18px 0 8px; grid-template-columns: 1fr; }
    @media (min-width: 760px) { .lead { grid-template-columns: auto 1fr; gap: 40px; align-items: center; } }
    .leadlab { font-size: .68rem; font-weight: 700; letter-spacing: .05em; text-transform: uppercase;
               color: var(--muted); display: flex; align-items: center; gap: 5px; }
    /* Proportional figures, not tabular: equal-width digits give every number
       the width of a 0, and at this size that makes 12 look loose. */
    .hero { font-family: var(--display); font-weight: 800; font-size: 3.6rem; line-height: 1;
            letter-spacing: -.045em; margin: 6px 0 0; }
    .heroof { display: block; color: var(--muted); font-size: .86rem; font-family: var(--body);
              font-weight: 400; letter-spacing: 0; margin-top: 6px; }
    /* Where the whole book sits, in one line. */
    .lifebar { display: flex; height: 14px; border-radius: 999px; overflow: hidden; margin: 0 0 12px;
               background: var(--ghost-bg); gap: 2px; }
    .lifebar i { display: block; }
    .lifekey { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: .82rem; }
    /* The landing page box. Same panel treatment as everything else here, and
       deliberately small: six numbers read on the way past, not a dashboard. */
    .trafbox { background: var(--surface); border: 1px solid var(--line);
               border-radius: var(--r-lg); padding: 16px 18px; margin-top: 14px; }
    .trafrow { display: grid; gap: 12px; margin-top: 10px;
               grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); }
    .trafrow > div { display: flex; flex-direction: column; }
    .trafrow b { font-family: var(--display); font-weight: 800; font-size: 1.5rem;
                 line-height: 1; font-variant-numeric: tabular-nums; }
    .trafmo { color: var(--muted); font-size: .72rem; margin-top: 3px; }
    .traflab { color: var(--muted); font-size: .68rem; font-weight: 700;
               letter-spacing: .05em; text-transform: uppercase; margin-top: 5px; }
    .lifekey span { display: flex; align-items: center; gap: 6px; color: var(--muted); }
    .lifekey b { color: var(--ink); font-variant-numeric: tabular-nums; }
    .lifekey i { width: 9px; height: 9px; border-radius: 3px; display: inline-block; flex: none; }
    .lifebar i.paid, .lifekey i.paid { background: var(--ink); }
    .lifebar i.live, .lifekey i.live { background: #15803d; }
    .lifebar i.quiet, .lifekey i.quiet { background: #b45309; }
    .lifebar i.dead, .lifekey i.dead { background: #9a3412; }
    .lifebar i.new, .lifekey i.new { background: var(--field-border); }
    /* --- the weekly lines ---------------------------------------------------
       One series per tile — small multiples rather than six lines fighting on
       one plot, which is also why there is no categorical palette here and
       nothing to mistake for anything else. */
    .rangerow { display: flex; align-items: baseline; justify-content: space-between;
                gap: 12px; flex-wrap: wrap; margin: 4px 0 12px; }
    .rangerow .seg { margin: 0; }
    .tiles { display: grid; gap: 12px; grid-template-columns: 1fr; }
    @media (min-width: 640px) { .tiles { grid-template-columns: 1fr 1fr; } }
    @media (min-width: 940px) { .tiles { grid-template-columns: 1fr 1fr 1fr; } }
    .tile { border: 1px solid var(--line); border-radius: 14px; padding: 13px 15px 11px;
            background: var(--surface); }
    .tile .tl { font-size: .68rem; font-weight: 700; letter-spacing: .05em; text-transform: uppercase;
                color: var(--muted); display: flex; align-items: center; gap: 5px; }
    .tile .tv { font-family: var(--display); font-weight: 800; font-size: 1.7rem; line-height: 1.15;
                letter-spacing: -.03em; margin-top: 4px; }
    .tile .td { font-family: var(--body); font-size: .78rem; font-weight: 700; letter-spacing: 0;
                margin-left: 8px; color: var(--muted); }
    .tile .td.up { color: #15803d; }
    .tile .td.down { color: #9a3412; }
    .tile .tn { color: var(--muted); font-size: .73rem; margin-top: 2px; }
    .tile svg { display: block; width: 100%; height: auto; margin-top: 9px; }
    /* --- a rate that has too few people behind it is not a rate ------------- */
    .nodata { color: var(--muted); font-size: .86rem; line-height: 1.5; }
    /* --- who needs a call today ---------------------------------------------
       ONE line per shop, not one per problem: a shop with four things wrong
       used to take four cards and push everything else off the screen. */
    .triage { border: 1px solid var(--line); border-radius: 14px; background: var(--surface);
              margin-bottom: 10px; overflow: hidden; }
    .trow { display: grid; grid-template-columns: 1fr; gap: 2px 14px; padding: 11px 14px;
            border-left: 4px solid transparent; }
    .trow + .trow { border-top: 1px solid var(--line); }
    @media (min-width: 680px) { .trow { grid-template-columns: 200px 1fr; align-items: baseline; } }
    .trow.critical { border-left-color: #9a3412; }
    .trow.warn { border-left-color: #b45309; }
    .trow.info { border-left-color: var(--accent); }
    .trow .tname { font-weight: 700; }
    .trow .taction { color: var(--muted); font-size: .85rem; }
    .tclear { border: 1px dashed var(--line); border-radius: 14px; padding: 18px; text-align: center;
              color: var(--muted); margin-bottom: 12px; }
    /* Severity chips, reused in the table's Problems column. */
    .chipf { display: inline-flex; align-items: center; gap: 3px; font-size: .7rem; font-weight: 700;
             padding: 2px 8px; border-radius: 999px; margin: 1px 3px 1px 0; white-space: nowrap; }
    .chipf.critical { background: #fdeaea; color: #9a3412; }
    .chipf.warn { background: #fef3c7; color: #92400e; }
    .chipf.info { background: var(--ghost-bg); color: var(--muted); }
    /* Where a shop is in its life, as a word rather than a colour alone. Four
       states about USE; paying is a separate pill beside it, because a shop can
       be paying and churning at once and that pair is the thing worth knowing. */
    .stage { display: inline-block; font-size: .7rem; font-weight: 700; padding: 2px 8px;
             border-radius: 999px; white-space: nowrap; background: var(--ghost-bg); color: var(--muted); }
    .stage.stamping { background: #dcfce7; color: #15803d; }
    .stage.activated { background: #fef3c7; color: #92400e; }
    .stage.churning { background: #fdeaea; color: #9a3412; }
    .paypill { display: inline-block; font-size: .7rem; font-weight: 700; padding: 2px 8px;
               border-radius: 999px; white-space: nowrap; background: var(--ink); color: var(--on-slab);
               margin-left: 4px; }
    /* --- the activation timeline -------------------------------------------
       Four steps in one row, not a two-panel grid of eight numbers. It answers
       one question — how far did this shop actually get — and the first step
       that is missing is the answer. */
    .tline { display: grid; gap: 10px; grid-template-columns: 1fr; margin-top: 4px; }
    @media (min-width: 640px) { .tline { grid-template-columns: repeat(4, 1fr); } }
    .tstep { border: 1px solid var(--line); border-radius: 12px; padding: 11px 13px; background: var(--bg);
             position: relative; }
    .tstep .sl { font-size: .68rem; font-weight: 700; letter-spacing: .05em; text-transform: uppercase;
                 color: var(--muted); display: flex; align-items: center; gap: 5px; }
    .tstep .sv { font-family: var(--display); font-weight: 800; font-size: 1.05rem; letter-spacing: -.02em;
                 margin-top: 3px; }
    .tstep .sw { font-size: .74rem; color: var(--muted); margin-top: 1px; }
    /* The step they never reached. Not red — most shops are simply mid-journey,
       and colouring every unreached step as a failure is how a list stops
       being read. It is the ABSENCE that carries the meaning. */
    .tstep.todo { border-style: dashed; }
    .tstep.todo .sv { color: var(--muted); font-family: var(--body); font-weight: 400; font-size: .9rem; }
    /* --- the one loyalty number -------------------------------------------- */
    .bigrate { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
    .bigrate .rv { font-family: var(--display); font-weight: 800; font-size: 2.4rem; line-height: 1;
                   letter-spacing: -.035em; }
    .bigrate .rd { font-size: .84rem; font-weight: 700; color: var(--muted); }
    .bigrate .rd.up { color: #15803d; }
    .bigrate .rd.down { color: #9a3412; }
    /* --- the table ---------------------------------------------------------- */
    table { border-collapse: collapse; width: 100%; font-size: .9rem; margin-top: 12px; }
    th { text-align: left; color: var(--muted); font-size: .72rem; text-transform: uppercase;
         letter-spacing: .06em; padding: 8px 10px; border-bottom: 1px solid var(--line); }
    td { padding: 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
    .mrow { cursor: pointer; }
    .mrow:hover td { background: var(--ghost-bg); }
    /* The totals line. Ruled off and unclickable — it is not a shop, and it is
       the one row on this page you are meant to check the others against. */
    .mtot td { border-top: 2px solid var(--ink); font-weight: 700;
               font-variant-numeric: tabular-nums; }
    .mtot .flags { font-weight: 400; }
    /* The week now running: tinted and italic so it reads as provisional at a
       glance, without a legend. It sits at the TOP because the table is newest
       first, which is where you look for "how are we doing right now". */
    .wknow td { background: var(--ghost-bg); font-style: italic; }
    .wktot td { border-top: 2px solid var(--ink); font-weight: 700; }
    .wktot .flags { font-weight: 400; font-style: normal; }
    .mrow .mname { font-weight: 700; }
    .mrow .mname::after { content: " ›"; color: var(--muted); font-weight: 400; }
    .flags { font-size: .78rem; color: var(--muted); }
    /* Something that needs a phone call. */
    .bad { color: #9a3412; font-weight: 600; }
    /* Worth knowing, not worth ringing about. Amber is the app's one attention
       colour (DESIGN.md rule 6) and stays out of the accent's job. */
    .flags .warn { color: #92400e; font-weight: 600; }
    .tw { overflow-x: auto; }
    /* --- one shop, on its own page ------------------------------------------ */
    .back { margin: 2px 0 14px; }
    .dhead { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
             flex-wrap: wrap; margin-bottom: 6px; }
    .dhead h1 { margin-bottom: 4px; }
    /* One menu, not nine loose buttons across three boxes. Everything that acts
       on a shop lives here, including the two that were unreachable before. */
    .menu { position: relative; }
    .menu > summary { list-style: none; cursor: pointer; display: inline-flex; align-items: center;
                      gap: 8px; padding: 11px 18px; border-radius: 999px; background: var(--ink);
                      color: var(--on-slab); font-weight: 700; font-size: .92rem; }
    .menu > summary::-webkit-details-marker { display: none; }
    .menu[open] > summary { background: var(--accent-dark); }
    .menu .sheet { position: absolute; right: 0; top: calc(100% + 6px); z-index: 30; min-width: 268px;
                   background: var(--bg); border: 1px solid var(--line); border-radius: 14px;
                   box-shadow: var(--shadow); padding: 6px; }
    .menu .sheet button, .menu .sheet a { display: block; width: 100%; text-align: left; background: none;
                   border: none; font: inherit; font-size: .92rem; color: var(--ink); padding: 10px 12px;
                   border-radius: 10px; cursor: pointer; text-decoration: none; }
    .menu .sheet button:hover, .menu .sheet a:hover { background: var(--surface); }
    .menu .sheet button.armed { background: #9a3412; color: #fff; }
    .menu .sheet hr { border: none; border-top: 1px solid var(--line); margin: 6px 4px; }
    .menu .sheet .danger { color: #9a3412; font-weight: 600; }
    .dgrid { display: grid; gap: 14px; grid-template-columns: 1fr; }
    @media (min-width: 760px) { .dgrid { grid-template-columns: 1fr 1fr; } }
    .dpanel { border: 1px solid var(--line); border-radius: 12px; padding: 14px; background: var(--bg); }
    .dpanel h4 { margin: 0 0 8px; font-size: .74rem; text-transform: uppercase; letter-spacing: .06em;
                 color: var(--muted); }
    .dpanel dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 14px; margin: 0; font-size: .88rem; }
    .dpanel dt { color: var(--muted); }
    .dpanel dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; }
    .dnote { color: var(--muted); font-size: .76rem; margin: 8px 0 0; line-height: 1.5; }
    /* A funnel that looks like one. Six numbers in a list made you do the
       subtraction yourself; the drop between steps is the thing being read. */
    .fnl { display: grid; grid-template-columns: auto 1fr auto; gap: 5px 10px; align-items: center;
           font-size: .84rem; }
    .fnl .fl { color: var(--muted); white-space: nowrap; }
    .fnl .fb { height: 16px; border-radius: 4px; background: var(--accent); min-width: 2px; }
    .fnl .fb.zero { background: var(--line); }
    .fnl .fv { font-variant-numeric: tabular-nums; font-weight: 600; text-align: right; white-space: nowrap; }
    .fnl .fd { font-size: .74rem; color: var(--muted); }
    .fnl .fd.bad { color: #9a3412; font-weight: 600; }
    /* The one-liner that replaced the "anything wrong" panel: silent when the
       answer is no, which is most of the time. */
    .okline { color: var(--muted); font-size: .82rem; margin-top: 12px; }
    .badline { color: #9a3412; font-weight: 600; font-size: .85rem; margin-top: 12px; }
    .rst { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; align-items: end; }
    .rst select { width: auto; }
    .rst .btn { width: auto; padding: 10px 14px; }
    .temp { font-family: ui-monospace, Menlo, monospace; background: var(--ghost-bg); padding: 8px 10px;
            border-radius: 8px; margin-top: 10px; }
    /* A value shown inside a tinted box goes white, or the one thing that has to
       be read is the one that blends in (DESIGN.md rule 9). */
    .fold .temp, .dpanel .temp { background: var(--bg); box-shadow: inset 0 0 0 1px var(--line); }
    /* The monospace treatment for an id or a URL shown verbatim. */
    .mono { font-family: ui-monospace, Menlo, monospace; word-break: break-all; }
    .cbtn, .dbtn { width: auto; padding: 5px 10px; font-size: .78rem; margin-top: 4px; }
    .arch { font-size: .68rem; text-transform: uppercase; letter-spacing: .06em;
            background: var(--ghost-bg); color: var(--muted); padding: 2px 6px; border-radius: 5px; }
    .btn.armed { background: #9a3412; border-color: #9a3412; color: #fff; }
    #dfy label { display: block; margin-top: 10px; }
    #dfy input { width: 100%; }
    #dfy .btn { width: auto; padding: 10px 14px; margin-top: 12px; }
    .dsempty { color: var(--muted); font-size: .88rem; padding: 26px 14px; text-align: center; }
    /* --- New shop: three steps, numbered because they ARE a sequence --------
       The number is not decoration here: you cannot design a card for a shop
       that does not exist, and you cannot hand over one you have not designed. */
    .steps { list-style: none; margin: 0; padding: 0; counter-reset: none; }
    .step { border: 1px solid var(--line); border-radius: 14px; padding: 16px 18px; margin-top: 14px; }
    .step h3 { display: flex; align-items: center; gap: 10px; margin: 0 0 12px;
               font-size: 1.02rem; font-family: var(--display); font-weight: 800; letter-spacing: -.02em; }
    .step .sn { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px;
                border-radius: 999px; background: var(--accent); color: var(--on-accent);
                font-size: .82rem; font-weight: 800; flex: none; }
    .resume { margin-top: 10px; font-size: .84rem; color: var(--muted); }
    .rlink { border: none; background: none; font: inherit; color: var(--accent-dark); font-weight: 700;
             cursor: pointer; padding: 2px 4px; text-decoration: underline; }
    ${SEG_CSS}
    ${MODAL_CSS}
    ${DESIGN_PANEL_CSS}
  `;
  const js = /* js */ `
    ${PALETTE_JS}
    ${SEG_JS}
    ${MODAL_JS}
    ${DESIGN_PANEL_JS}
    const $ = (s, el=document) => el.querySelector(s);
    async function api(p, o={}) {
      const r = await fetch("/admin/api" + p, { ...o, headers: { "Content-Type": "application/json", ...(o.headers||{}) } });
      return { status: r.status, body: await r.json().catch(() => ({})) };
    }
    function toast(msg) {
      const t = $(".toast"); t.textContent = msg; t.classList.add("show");
      setTimeout(() => t.classList.remove("show"), 2600);
    }
    const esc = (s) => String(s == null ? "" : s)
      .replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);

    // What each problem means, moved off the page and behind the chip that
    // raises it. Keyed on the flag's KEY, never its label — half the labels are
    // templated ("3 rewards owed") and would never match a fixed string.
    const FLAG_HELP = ${flagHelp};
    const STAGE_LABEL = ${stageLabels};
    // How many silent days make a shop churning. From src/health.ts, so the
    // hero, the stage chip and the flag can never quote three different numbers.
    const CHURN_DAYS = ${CHURN_DAYS};

    // A rate over a handful of people is noise dressed as a measurement. Below
    // this the console says how many there are instead of inventing a
    // percentage — COALESCE(…, 0) rendered a confident 0% for a shop nobody
    // had ever stamped, which is the most misleading thing a console can do.
    const RET_FLOOR = 10;

    // Two-tap confirmation, same idiom as the stamper and the dashboard: a
    // browser dialog can be suppressed, after which confirm() returns false and
    // the action silently stops working. First tap relabels, second within 4s
    // runs it.
    let armedBtn = null, armedTimer = null;
    function disarmBtn() {
      if (armedBtn) { armedBtn.textContent = armedBtn.dataset.label; armedBtn.classList.remove("armed"); }
      clearTimeout(armedTimer); armedBtn = null; armedTimer = null;
    }
    function armBtn(btn, prompt, go) {
      btn.dataset.label = btn.textContent;
      btn.onclick = () => {
        if (armedBtn === btn) { disarmBtn(); go(); return; }
        disarmBtn();
        armedBtn = btn;
        btn.textContent = prompt;
        btn.classList.add("armed");
        armedTimer = setTimeout(disarmBtn, 4000);
      };
    }

    // ------------------------------------------------------- where we are ----
    // One document, two addresses. /admin/m/:id opens straight onto a shop, and
    // clicking into one pushes that address, so back, refresh and a pasted link
    // all do what a browser does everywhere else. A shop's detail used to
    // unfold inside its own table row: it could not be linked, survived neither
    // a refresh nor a re-render, and browser-back left the console entirely.
    const MPATH = "/admin/m/";
    const openMerchant = () => location.pathname.indexOf(MPATH) === 0
      ? decodeURIComponent(location.pathname.slice(MPATH.length))
      : null;
    // Which tab to come back to. Not in the URL: it is where you were, not what
    // you are looking at, and it must survive a trip into a shop and out again.
    let pane = "overview";
    // How many weeks the charts show. The server sends the longest range once,
    // so this is a slice rather than a round trip — a range switch that waits
    // on the network stops being something you flick between.
    let range = 12;
    let rerender = () => {};
    addEventListener("popstate", () => rerender());

    // A menu that stays open after a tap somewhere else is a menu you have to
    // close twice. Delegated from the document once, rather than re-bound every
    // time a shop's page renders — the two-tap arm lives inside this menu, so a
    // tap on one of its OWN buttons must not count as outside.
    document.addEventListener("click", (e) => {
      document.querySelectorAll("details.menu[open]").forEach((d) => {
        if (!d.contains(e.target)) { d.open = false; disarmBtn(); }
      });
    });

    // ---------------------------------------------------- the card designer ----
    // The SAME panel the owner dashboard renders (DESIGN_PANEL_JS), pointed at a
    // merchant's live card. The console used to carry its own smaller designer
    // (three colours, one gradient band, ten fixed icons) plus six hard-coded
    // "business type" presets in the signup form. Both are gone: there is one
    // way to design a card, and it is the one owners use.
    //
    // It mounts in two places, both through mountDesigner: step 2 of New shop,
    // and a fold on the shop's own page. Neither the panel nor this mount
    // changed when the console was rebuilt around it — only the box it opens
    // in, which on a page rather than inside a table cell is wide enough for
    // the two columns it wants.

    /**
     * Mount the shared panel on a card, in the console's two-column layout.
     *
     * The rail argument is the caller's own HTML, dropped under the preview:
     * the links for this shop, and on New shop the claim link too. It is built
     * out here rather than inside the panel because it is the console's
     * business, not the designer's.
     *
     * The rail element is appended to the panel's OWN root before the preview
     * moves into it, and that ordering is not cosmetic: every lookup inside
     * designPanel is div.querySelector, so a preview parked outside the panel
     * would break renderPreview in the browser, where nothing type-checks it.
     */
    async function mountDesigner(host, cardId, rail, after) {
      host.innerHTML = '<div class="dsempty">Loading…</div>';
      const { body } = await api("/card/" + cardId + "/design-state");
      if (!body.ok) { host.innerHTML = "<div class=\\"dsempty\\">Couldn’t load that card.</div>"; return; }
      const card = body.card;
      host.innerHTML = "";
      const panel = designPanel(card, {
        api, toast, modal, info,
        path: (suffix) => "/card/" + card.id + "/design" + suffix,
        apiBase: "/admin/api",
        artUrl: (kind, v) => "/c/" + card.id + "/art/" + kind + ".png" + (v ? "?v=" + v : ""),
        // A real card has real holders, and the save confirmation names them.
        customersPath: "/card/" + card.id + "/counts",
        // The console does not set a card's TERMS. The fields still exist and
        // are seeded from the card — the preview and the stamp renderer read
        // them — but they are hidden and never editable, so a save can only
        // write them back unchanged. The shop name stays editable.
        showDetails: false,
        // Both console mounts sit under a heading that already says "Design
        // their card" — step 2 of New shop, and the fold on the shop's page.
        titled: false,
        saveLabel: "Save card",
        rulesNote: "",
        onRulesSaved: () => { if (after) after(); },
      });
      panel.classList.add("dscols");
      const aside = document.createElement("aside");
      aside.className = "dsrail";
      panel.appendChild(aside);
      // Move, don't clone: the panel keeps every handle it wired to these nodes.
      // ONE node now — the box holds all three previews, its label and the
      // links. Moving the card alone left its siblings in the left column,
      // which is how a preview ends up describing a surface you cannot see.
      aside.appendChild(panel.querySelector("[data-pvbox]"));
      if (rail) aside.insertAdjacentHTML("beforeend", '<div class="dsacts">' + rail + "</div>");
      host.appendChild(panel);
      wireInfo(panel);
      aside.querySelectorAll("[data-copy]").forEach((b) => {
        b.onclick = () => { navigator.clipboard.writeText(b.dataset.copy); b.textContent = "Copied ✓"; };
      });
      return panel;
    }

    /** The links an operator hands over, for one card. One printable, and the link. */
    function cardLinks(card, merchantId, origin) {
      return '<a class="btn btn-ghost" target="_blank" href="/c/' + card.id + '/poster">Print poster</a>' +
        '<button class="btn btn-ghost" data-copy="' + origin + "/j/" + merchantId + '">Copy sign-up link</button>' +
        '<span class="lnk">' + origin + "/j/" + merchantId + "</span>" +
        '<p class="muted" style="margin:6px 0 0;font-size:.78rem">Branded with your colours and logo. ' +
        'The code sends people to your shop, so it keeps working if you rename or add a second card.</p>';
    }

    // ------------------------------------------------------------- charts ----
    // Hand-rolled SVG, because the app has no build step and no browser
    // framework, and a sparkline is forty lines of geometry.

    const weekOf = (d) => new Date(d).toLocaleDateString([], { day: "numeric", month: "short" });
    const int = (v) => v == null ? "—" : Math.round(v).toLocaleString();
    const one = (v) => v == null ? "—" : Number(v).toFixed(1);

    /**
     * One weekly column sparkline: every bucket in the range, the most recent
     * one carrying the emphasis.
     *
     * Emphasis is WEIGHT, not colour. DESIGN.md rule 1 gives the neon exactly
     * one job — marking the next thing to press — so a lime bar in a chart is
     * decoration, and rule 2 says weight comes from the near-black. The weeks
     * behind sit in the field grey; the week being read is ink.
     *
     * Every bucket is drawn, empty ones included, and a zero week keeps a 2px
     * stub against the baseline: a gap you cannot see is indistinguishable from
     * a week that was never in the data. A null — an average over no shops at
     * all — draws nothing, because that is not the same as zero.
     */
    function spark(rows, key, fmt) {
      const W = 300, H = 44, r = 3;
      const n = rows.length;
      if (!n) return "";
      const slot = W / n;
      const w = Math.max(3, Math.min(24, slot - 2));
      const vals = rows.map((x) => x[key]).filter((v) => v != null);
      const top = Math.max(1, ...vals);
      const marks = rows.map((row, i) => {
        const v = row[key];
        const x = i * slot + (slot - w) / 2;
        // A full-height transparent slot, so the hover target is the column and
        // not a 9px bar you have to land on dead-centre.
        const hit = '<rect x="' + (i * slot).toFixed(1) + '" y="0" width="' + slot.toFixed(1) +
          '" height="' + H + '" fill="transparent"><title>Week of ' + esc(weekOf(row.week)) +
          " — " + esc(v == null ? "no shops stamped" : fmt(v)) + "</title></rect>";
        if (v == null) return hit;
        const h = Math.max(2, (v / top) * (H - 4));
        const y = H - h;
        const c = Math.min(r, w / 2, h);
        // Square at the baseline, rounded at the data end — a bar grows from
        // one edge and should only be soft at the edge that carries the value.
        const d = "M" + x.toFixed(1) + " " + H + " V" + (y + c).toFixed(1) +
          " Q" + x.toFixed(1) + " " + y.toFixed(1) + " " + (x + c).toFixed(1) + " " + y.toFixed(1) +
          " H" + (x + w - c).toFixed(1) +
          " Q" + (x + w).toFixed(1) + " " + y.toFixed(1) + " " + (x + w).toFixed(1) + " " + (y + c).toFixed(1) +
          " V" + H + " Z";
        return '<path d="' + d + '" fill="' + (i === n - 1 ? "var(--ink)" : "var(--field-border)") + '"></path>' + hit;
      }).join("");
      return '<svg viewBox="0 0 ' + W + " " + (H + 1) + '" role="img" aria-label="' + n +
        ' weeks, most recent last">' + marks +
        '<line x1="0" y1="' + (H + 0.5) + '" x2="' + W + '" y2="' + (H + 0.5) +
        '" stroke="var(--line)" stroke-width="1"></line></svg>';
    }

    /**
     * A stat tile: label, value, change against the week before, and the line
     * behind it. One series each, which is what makes six of them readable
     * where six lines on one plot would not be.
     */
    function tile(rows, def) {
      const fmt = def.dp ? one : int;
      const cur = rows.length ? rows[rows.length - 1] : null;
      const prev = rows.length > 1 ? rows[rows.length - 2] : null;
      const v = cur ? cur[def.key] : null;
      const p = prev ? prev[def.key] : null;
      // No percentage off a zero base and none off a missing one. The note
      // underneath carries the previous value either way, so the comparison is
      // always readable even when the ratio is not defined.
      let delta = "";
      if (v != null && p != null && p !== 0) {
        const pc = Math.round(((v - p) / p) * 100);
        delta = '<span class="td ' + (pc >= 0 ? "up" : "down") + '">' +
          (pc >= 0 ? "▲ " : "▼ ") + Math.abs(pc) + "%</span>";
      }
      return '<div class="tile"><div class="tl">' + esc(def.label) + info(def.help) + "</div>" +
        '<div class="tv">' + esc(fmt(v)) + delta + "</div>" +
        '<div class="tn">' + (prev ? "from " + esc(fmt(p)) + " the week before" : "no earlier week") + "</div>" +
        spark(rows, def.key, fmt) + "</div>";
    }

    /**
     * Every week as numbers.
     *
     * A tooltip is never the only way to read a value — hover is not available
     * on a phone and does not answer to a keyboard. This is the same data, and
     * it is the reason the bars can stay unlabelled.
     */
    /**
     * @param rows  the FINISHED weeks, oldest first.
     * @param part  the week now running, or null. It is listed and totalled
     *              here but never fed to a tile: a tile states a change against
     *              the week before, and a Tuesday measured against a full week
     *              points down every Monday and recovers by Sunday, for reasons
     *              that say nothing about the shop. It was dropped entirely
     *              instead, which meant a shop stamped only today read as zero
     *              with nothing on screen explaining why.
     *
     * The Total is over exactly the rows shown, part week included, so it can
     * be checked by adding the column up — the same rule as the merchants
     * table: a total derived from anything other than what is on screen is a
     * total that can disagree with it.
     */
    function seriesTable(rows, defs, part) {
      const shown = part ? [...rows, part] : [...rows];
      const cell = (v, d) =>
        '<td style="font-variant-numeric:tabular-nums">' + esc((d.dp ? one : int)(v)) + "</td>";
      // A rate cannot be summed — "stamps per customer" over six weeks is not
      // the six weekly figures added up — so a derived column totals as a dash
      // rather than as a number that would be quietly wrong.
      const total = (d) => d.dp
        ? "<td>—</td>"
        : cell(shown.reduce((a, r) => a + (Number(r[d.key]) || 0), 0), d);
      return '<div class="tw"><table><tr><th>Week of</th>' +
        defs.map((d) => "<th>" + esc(d.label) + "</th>").join("") + "</tr>" +
        (part
          ? '<tr class="wknow"><td>' + esc(weekOf(part.week)) +
            ' <span class="flags">still running</span></td>' +
            defs.map((d) => cell(part[d.key], d)).join("") + "</tr>"
          : "") +
        [...rows].reverse().map((row) => "<tr><td>" + esc(weekOf(row.week)) + "</td>" +
          defs.map((d) => cell(row[d.key], d)).join("") + "</tr>").join("") +
        '<tr class="wktot"><td>Total' +
          '<br><span class="flags">' + shown.length + " week" + (shown.length === 1 ? "" : "s") +
          (part ? ", including the one still running" : "") + "</span></td>" +
          defs.map(total).join("") + "</tr>" +
        "</table></div>";
    }

    /** The range control. One row above everything it scopes, never per chart. */
    function rangeRow(note) {
      return '<div class="rangerow"><p class="dnote" style="margin:0;max-width:52ch">' + note + "</p>" +
        '<div class="seg" data-range role="tablist">' +
        [4, 12, 26].map((n) => '<button data-weeks="' + n + '"' + (n === range ? ' class="on"' : "") +
          ">" + n + "w</button>").join("") +
        '<span class="thumb"></span></div></div>';
    }

    /**
     * Do customers come back? One rate, and whether it is moving.
     *
     * This replaced six — second visit, third visit, completion, median gap,
     * median days to reward, still-alive at 30/60/90. Every one was real and
     * together they answered nothing, because nobody reads six rates to decide
     * one thing.
     *
     * Two honesty rules do the work, and both live in the query (returningRate,
     * src/db.ts): somebody stamped this week is in NEITHER number, because they
     * have not had the chance to come back; and the comparison is the same
     * arithmetic on a cutoff four weeks old, not a number kept from last month.
     */
    function returningHtml(r, where) {
      const eligible = (r && r.eligible) || 0;
      if (eligible < RET_FLOOR) {
        return '<p class="nodata">Not enough data yet — ' + eligible + " customer" +
          (eligible === 1 ? "" : "s") + " " + where +
          " had a first stamp long enough ago to count. A rate over fewer than " +
          RET_FLOOR + " people is noise, so it is not shown.</p>";
      }
      // The comparison is held to the SAME floor as the rate itself. Four weeks
      // ago a young shop had a handful of eligible customers, and "▲ 5 pts"
      // against a base of four is the very thing the gate above exists to stop
      // — it would just have been laundered through the word "trend".
      const comparable = r.prev_rate !== null && r.prev_eligible >= RET_FLOOR;
      // Percentage POINTS, not a percent change: 20% to 25% is five points, and
      // calling it "+25%" is the oldest way there is to overstate a rate.
      const pts = comparable ? Math.round((r.rate - r.prev_rate) * 100) : null;
      return '<div class="bigrate"><span class="rv">' + Math.round(r.rate * 100) + "%</span>" +
        (pts === null
          ? '<span class="rd">too few customers four weeks ago to compare</span>'
          : '<span class="rd ' + (pts >= 0 ? "up" : "down") + '">' + (pts >= 0 ? "▲ " : "▼ ") +
            Math.abs(pts) + " pts vs four weeks ago</span>") +
        "</div>" +
        '<p class="dnote">' + r.returned + " of " + eligible +
        " customers whose first stamp was 14+ days ago have been back at least once" +
        (comparable ? " · was " + Math.round(r.prev_rate * 100) + "% of " + r.prev_eligible : "") +
        ".</p>";
    }

    // The shop being set up in New shop, held OUTSIDE load() so that saving its
    // card — which re-reads the whole console — does not throw away the step you
    // were standing on.
    // { merchantId, cardId, name, merchant } — it carries the merchant ROW, not
    // just a name, because step 3 renders the same claim panel the shop's own
    // page does and that panel reads the link state off the row.
    let building = null;

    async function load() {
      const { status, body } = await api("/overview");
      if (status === 403) {
        // Tell the founder EXACTLY why it's closed rather than a vague bounce.
        const msg = body.error === "admin-closed"
          ? 'The admin console is closed because <strong>ADMIN_EMAIL</strong> isn’t set. In Railway → your app service → Variables, add <strong>ADMIN_EMAIL</strong> = your dashboard login email (you can list several, comma-separated, e.g. <em>you@x.com, partner@x.com</em>), then redeploy.'
          : 'You’re not signed in as an admin account. Log in at <a href="/dashboard">/dashboard</a> with an email listed in <strong>ADMIN_EMAIL</strong>, then reopen this page.';
        $("#app").innerHTML = '<h1>Admin</h1><p class="sub">' + msg + '</p>';
        return;
      }
      const origin = location.origin;
      // "3 days ago" beats a date when the question is "is this one alive?".
      const ago = (d) => {
        if (!d) return "never";
        const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
        return days === 0 ? "today" : days === 1 ? "yesterday" : days + "d ago";
      };
      const pct = (x) => (x === null || x === undefined) ? "—" : Math.round(x * 100) + "%";
      const num = (x, dp) => (x === null || x === undefined) ? "—" : Number(x).toFixed(dp || 0);
      const stale = (d, days) => !d || (Date.now() - new Date(d).getTime()) > days * 86400000;
      const days = (from, to) => (from && to)
        ? Math.max(0, Math.round((new Date(to) - new Date(from)) / 86400000)) + "d" : "—";

      const merchants = body.merchants || [];
      // The landing page's own figures. Defaulted here rather than guarded at
      // every use: a console that has never had a visit is a normal state, not
      // an error, and it should render zeros rather than dashes.
      const emptyTraffic = { views: 0, devices: 0, returning: 0, cta: 0, ctaDevices: 0,
                             cardScans: 0, referrers: [] };
      const traffic = body.traffic || { week: emptyTraffic, month: emptyTraffic };
      const demoFunnel = body.demo || { week: { clicked: 0, added: 0 }, month: { clicked: 0, added: 0 } };
      const live = merchants.filter((m) => !m.archived_at);
      const money = (m, n) => m.currency + Math.round(n).toLocaleString();
      const byMerchant = new Map(merchants.map((m) => [m.id, m]));

      // Worst first, not alphabetical. A console sorted by name makes you read
      // every row to find the one that needs you, which is this page's job.
      const ranked = [...merchants].sort((a, b) => {
        const sev = (x) => x.flags.length ? ({ critical: 0, warn: 1, info: 2 })[x.flags[0].severity] : 9;
        return sev(a) - sev(b) || b.flags.length - a.flags.length
          || new Date(b.created_at) - new Date(a.created_at);
      });
      const needing = ranked.filter((m) => m.flags.length && !m.archived_at);
      const archivedMerchants = ranked.filter((m) => m.archived_at);
      // Each chip carries its own rule, so the fourteen-row guide that used to
      // sit under the list is read where the question is actually asked.
      const chips = (m, help) => m.flags.map((f) =>
        '<span class="chipf ' + f.severity + '">' + esc(f.label) +
        (help && FLAG_HELP[f.key] ? info(FLAG_HELP[f.key]) : "") + "</span>").join("");
      // Four words about USE, plus a separate pill for paying — a shop can be
      // paying AND churning, and squeezing both onto one axis is what let a
      // paying shop that had stopped stamping read as the healthiest state
      // on the board.
      const stageChip = (m) =>
        '<span class="stage ' + m.stage + '">' + (STAGE_LABEL[m.stage] || m.stage) + "</span>" +
        (m.paid_at ? '<span class="paypill">Paying</span>' : "");

      // ---- the weekly lines ---------------------------------------------------
      // An average over nobody at all is not zero, so it is null and the bar is
      // simply absent for that week.
      const derive = (rows) => (rows || []).map((r) => ({ ...r,
        per_customer: r.active_customers ? r.stamps / r.active_customers : null }));
      const allWeeks = derive(body.series);
      // The week we are standing in is a PART week — it has run for a day or
      // for six — so putting it beside full ones draws a crash every Monday
      // morning. It is held out of every chart and reported as itself.
      const doneWeeks = allWeeks.slice(0, -1);
      const partWeek = allWeeks.length ? allWeeks[allWeeks.length - 1] : null;
      const shownWeeks = () => doneWeeks.slice(-range);

      const P_TILES = [
        { key: "stamps", label: "Stamps",
          help: "Stamps given at counters that week, net of undos: a staff undo corrects a mis-scan, so it comes back off. Free welcome stamps have never been in it — one stamp is one real visit." },
        { key: "active_customers", label: "Customers stamped",
          help: "Distinct PEOPLE stamped that week. Someone holding an Apple and a Google card at one shop is one person, not two." },
        { key: "active_merchants", label: "Stamping shops",
          help: "Shops that gave at least one stamp that week. The adoption number: a shop that signed up and never stamps is not using the product, whatever else it does." },
        { key: "per_customer", label: "Stamps per customer", dp: 1,
          help: "How hard the people who ARE using their card use it — depth rather than reach, and the number that says whether the loyalty loop is turning at all. Blank in a week nobody was stamped: an average over nobody is not zero." },
        { key: "new_merchants", label: "New shops",
          help: "Shops signed up that week, archived ones excluded. Counted from the earlier of the shop being built and its owner's account, so a done-for-you setup dates from when we built it." },
        { key: "rewards", label: "Rewards given",
          help: "Cards completed and handed over that week. The only event in the product that costs a merchant real money, so it is the closest thing to proof the loop closed." },
      ];
      const M_TILES = [
        { key: "stamps", label: "Stamps", help: "Stamps at this shop that week, net of undos." },
        { key: "active_customers", label: "Customers stamped",
          help: "Distinct people stamped that week, counted per person across both wallets." },
        { key: "new_customers", label: "New customers",
          help: "People whose FIRST stamp at this shop landed that week — new demand rather than repeat." },
        { key: "per_customer", label: "Stamps per customer", dp: 1,
          help: "How often the people using their card came in that week. Blank in a week nobody was stamped." },
        { key: "rewards", label: "Rewards given", help: "Cards completed and handed over that week." },
      ];

      /**
       * The sign-up funnel as a funnel: a bar per step, and the DROP between
       * steps, which is the thing actually being read. It was six numbers in a
       * list, leaving you to do the subtraction yourself and never showing
       * which gap was the big one.
       */
      function funnelHtml(m) {
        const steps = [
          ["Opened sign-up", m.scanned],
          ["Add tapped", m.clicked],
          ["Card made", m.made],
          ["Landed in wallet", m.landed],
          // The fifth bar is the one that was missing: cards that reached a
          // wallet and were thrown away. It sat under the funnel as "Deleted /
          // dropped" in a list, where nobody read it against the bar above it.
          ["Deleted again", m.removed + m.dropped],
        ];
        const top = Math.max(1, ...steps.map((x) => x[1]));
        return '<div class="fnl">' + steps.map(([label, n], i) => {
          const prev = i ? steps[i - 1][1] : null;
          // Only a drop is worth naming, and only when there was enough at the
          // step above to mean anything — "−100%" off a single visitor is noise.
          // NEVER on the last bar: deleted is a subtraction FROM landed, not a
          // further step down the funnel, and "−60%" there would read as a loss
          // when it is the opposite — a small number is the good outcome.
          const last = i === steps.length - 1;
          const drop = !last && prev && prev >= 5 && n < prev
            ? Math.round((1 - n / prev) * 100) : null;
          return '<span class="fl">' + label + "</span>" +
            '<span><span class="fb ' + (n ? "" : "zero") + '" style="width:' +
              Math.max(2, Math.round((n / top) * 100)) + '%"></span></span>' +
            '<span class="fv">' + n + (drop === null ? "" :
              ' <span class="fd' + (drop >= 50 ? " bad" : "") + '">−' + drop + "%</span>") + "</span>";
        }).join("") + "</div>";
      }

      // ---- the shop table -----------------------------------------------------
      // Seven columns, every one of them about whether the shop is being USED.
      // "Owner seen" came off: an owner who never logs in but whose counter
      // stamps all day is a success, and the column implied the opposite. It is
      // still on the shop's own page, where it is context rather than a verdict.
      // Every stamp column names its WINDOW. Four figures on this console were
      // all called "stamps" and none of them said over what period, so a shop
      // with one stamp this week read as 1 in the table and 0 on its own page —
      // a rolling 30 days against a tile that only counts finished weeks. Both
      // right, neither legible.
      const MERCHANT_HEAD = "<tr><th>Shop</th><th>Stage</th><th>Last stamp</th>" +
        "<th>Customers 30d</th><th>Stamps (30d)</th><th>Stamps (all time)</th>" +
        "<th>Stamps/customer</th><th>Problems</th></tr>";
      const merchantRow = (m) => {
        const perCust = m.active_30d ? (m.stamps_30d / m.active_30d).toFixed(1) : "—";
        return '<tr class="mrow" data-m="' + esc(m.id) + '">' +
          '<td><span class="mname">' + esc(m.name) + "</span>" +
            (m.archived_at ? ' <span class="arch">archived</span>' : "") +
            '<br><span class="flags">' + esc(m.owners || "no owner") + "</span></td>" +
          "<td>" + stageChip(m) + "</td>" +
          '<td class="' + (stale(m.last_stamp_at, CHURN_DAYS) ? "bad" : "") + '">' +
            ago(m.last_stamp_at) + "</td>" +
          "<td>" + m.active_30d + "</td>" +
          "<td>" + m.stamps_30d + "</td>" +
          "<td>" + m.stamps + "</td>" +
          '<td style="font-variant-numeric:tabular-nums">' + perCust + "</td>" +
          "<td>" + (chips(m) || '<span class="flags">—</span>') + "</td></tr>";
      };

      /**
       * The line that makes the table checkable.
       *
       * SUMMED FROM THE ROWS ON SCREEN, never from a second query. A total that
       * comes from its own SELECT can disagree with the column above it, and
       * "the top does not equal the list" is the exact complaint this is fixing
       * — the same reason metrics are derived from the event log rather than
       * stored beside it.
       *
       * Live shops only, and it says so: a closed account is not evidence about
       * the product, and the Overview has always left them out. The rows stay
       * visible so an archived shop can still be found.
       */
      const liveOf = (ms) => ms.filter((m) => !m.archived_at);
      const sumBy = (ms, key) => ms.reduce((a, m) => a + (Number(m[key]) || 0), 0);
      const merchantTotals = (ms) => {
        const live = liveOf(ms);
        const hidden = ms.length - live.length;
        return '<tr class="mtot"><td>Total' +
          '<br><span class="flags">' + live.length + " live shop" + (live.length === 1 ? "" : "s") +
            (hidden ? " · " + hidden + " archived, not counted" : "") + "</span></td>" +
          "<td></td><td></td>" +
          "<td>" + sumBy(live, "active_30d") + "</td>" +
          "<td>" + sumBy(live, "stamps_30d") + "</td>" +
          "<td>" + sumBy(live, "stamps") + "</td>" +
          "<td></td><td></td></tr>";
      };

      // ---- one shop, on its own page ------------------------------------------
      /**
       * One step of the activation timeline.
       *
       * A step they never reached is DASHED, not red. Most shops are simply
       * partway along, and painting every unreached step as a failure is how a
       * page stops being read — the absence is what carries the meaning, and
       * the third argument says what that absence means rather than just
       * "never".
       */
      function tstep(label, at, missing) {
        if (!at) {
          return '<div class="tstep todo"><div class="sl">' + esc(label) + "</div>" +
            '<div class="sv">' + esc(missing || "not yet") + "</div></div>";
        }
        return '<div class="tstep"><div class="sl">' + esc(label) + "</div>" +
          '<div class="sv">' + esc(ago(at)) + "</div>" +
          '<div class="sw">' + esc(new Date(at).toLocaleDateString([], {
            day: "numeric", month: "short", year: "numeric" })) + "</div></div>";
      }

      function detailHtml(m) {
        const v = m.value;
        const staffRows = (body.staff || []).filter((s) => s.merchant_id === m.id);
        const cards = (body.cards || []).filter((c) => m.card_ids.includes(c.id));
        const liveCards = cards.filter((c) => !c.archived_at);
        // Silent when nothing is wrong, which is most of the time.
        const wrong = [];
        if (m.pin_failed_24h) wrong.push(m.pin_failed_24h + " failed staff PINs today");
        if (m.lookup_failed_7d >= 5) wrong.push(m.lookup_failed_7d + " codes matched nothing this week");
        if (m.messages_failed) wrong.push(m.messages_failed + " messages never arrived");
        if (m.staff_devices === 1 && m.stamps >= 20) wrong.push("only one staff phone has ever stamped");
        if (m.unclaimed_rewards >= 3) wrong.push(m.unclaimed_rewards + " rewards earned and not handed over");
        const noFunnel = new Date(m.signed_up_at) < new Date("${FUNNEL_SINCE}");
        const left = m.trialLeft;

        // Everything that acts on this shop, in one place. They used to be nine
        // buttons spread over three boxes, two of them repeating what a third
        // already did — and "mark paid" existed as a route with no button at
        // all, which is why the delete refusal told you to do something the
        // console could not do.
        const actions = '<details class="menu"><summary>Actions ▾</summary><div class="sheet">' +
          '<button data-copy="' + origin + "/j/" + esc(m.id) + '">Copy sign-up link</button>' +
          liveCards.map((c) => '<a target="_blank" href="/c/' + esc(c.id) + '/poster">Print poster' +
            (liveCards.length > 1 ? " · " + esc(c.name) : "") + "</a>").join("") +
          (m.has_owner
            ? '<hr><button data-resetpw="' + esc(m.owner_id) + '">Reset their password</button>' +
              // The way back from a link that reached the wrong person. The shop
              // returns to unclaimed keeping its card id, its slug and its /j/
              // QR — rebuilding it would mint a new card id, and a card id is
              // printed on posters and baked into every Android card ever
              // issued from it.
              '<button data-unclaim="' + esc(m.id) + '">Hand it to someone else</button>'
            : "") +
          '<hr><button data-paid="' + esc(m.id) + '" data-now="' + (m.paid_at ? "1" : "") + '">' +
            (m.paid_at ? "Mark as not paying" : "Mark as paying") + "</button>" +
          (m.archived_at
            ? '<button data-munarchive="' + esc(m.id) + '">Restore shop</button>'
            : '<button data-marchive="' + esc(m.id) + '">Archive shop</button>') +
          '<button class="danger" data-showdelete>Delete this shop…</button>' +
          "</div></details>";

        return '<p class="back"><button class="rlink" data-back>← All shops</button></p>' +
          '<div class="dhead"><div><h1>' + esc(m.name) +
            (m.archived_at ? ' <span class="arch">archived</span>' : "") + "</h1>" +
            '<p class="purpose">' + stageChip(m) + " · " + esc(m.owners || "no owner") +
            " · signed up " + ago(m.signed_up_at) +
            (m.paid_at ? "" : left < 0 ? ' · <span class="bad">trial ended ' + Math.abs(left) + "d ago</span>"
              : m.first_stamp_at ? " · day " + m.trial_day + " of ${TRIAL_DAYS}" : "") +
            "</p></div>" + actions + "</div>" +
          '<div data-pwout></div>' +

          (m.flags.length
            ? '<div class="triage" style="margin-top:14px">' + m.flags.map((f) =>
                '<div class="trow ' + f.severity + '"><div><span class="tname">' + esc(f.label) +
                (FLAG_HELP[f.key] ? info(FLAG_HELP[f.key]) : "") + "</span></div>" +
                '<div><div>' + esc(f.detail) + '</div><div class="taction">' + esc(f.action) +
                "</div></div></div>").join("") + "</div>"
            : '<div class="tclear" style="margin-top:14px">Nothing needs you about this shop.</div>') +

          (m.stage === "not-claimed" ? '<div class="dpanel" style="margin-top:14px">' +
            claimPanelHtml(m) + "</div>" : "") +

          (wrong.length
            ? '<p class="badline">Wrong right now: ' + wrong.map(esc).join(" · ") + "</p>"
            : '<p class="okline">Nothing broken: staff can sign in, codes match, messages arrive.</p>') +

          // How far did they actually get? Four steps in one row, and the first
          // one that is missing is the answer. This replaced two panels of
          // eight numbers that between them never said it plainly.
          '<h2 style="margin-top:26px">How far did they get?' + info("The four things that have to happen in order, and the first one missing is where they are stuck. Activated means the LOGIN exists — they claimed the shop. First customer is the first card ever issued. First stamp is somebody actually being served at the counter, which is the only one that proves the thing works.") + "</h2>" +
          '<div class="tline">' +
            tstep("Signed up", m.signed_up_at, "") +
            tstep("Activated", m.claimed_at || (m.has_owner ? m.signed_up_at : null), "no login yet") +
            tstep("First customer", m.first_customer_at, "nobody has signed up") +
            tstep("First stamp", m.first_stamp_at,
              m.poster_views ? "poster opened, nobody stamped" : "poster never opened") +
          "</div>" +

          '<h2 style="margin-top:26px">This shop, week by week' +
            info("Each tile is ONE week — the most recent finished one — not a running total. The week now under way is left out, so a shop stamped only today reads as zero here while its all-time and 30-day figures above both count it. For the total, read Stamps (all time).") + "</h2>" +
          '<div data-mseries><p class="nodata">Loading…</p></div>' +

          '<h2 style="margin-top:26px">Are people signing up?' + info("This is acquisition, not health — it names WHICH step is losing people. A drop from opened to tapped is the sign-up page; from made to landed is the wallet's own Add sheet. The last bar is not a further step: it is how many of the cards that DID land were later thrown away, so a small number there is the good outcome. A QR scan and a tapped link both arrive as an ordinary page view, so the split comes from a tag on the poster QR and the share link; anything untagged, including posters printed before the tag existed, counts as untagged rather than lost.") + "</h2>" +
          '<div class="dpanel">' + funnelHtml(m) +
            '<p class="dnote">Opened via poster ' + m.opened_poster + " · link " + m.opened_link +
              " · untagged " + m.opened_other + "</p>" +
            (noFunnel ? '<p class="dnote"><strong>Predates the funnel.</strong> Page opens and Add taps have only been recorded since ${FUNNEL_SINCE_LABEL}, so cards issued before then show as zeroes above. Missing history, not a broken flow.</p>' : "") +
          "</div>" +

          '<h2 style="margin-top:26px">Do customers come back?' + info("Of the customers here whose first stamp was at least 14 days ago, how many have been stamped more than once. Counted per PERSON and per net stamp: someone holding an Apple and a Google card is one customer, and a staff undo takes its visit back off. Somebody stamped this week is in neither number — they have not had the chance to come back yet.") + "</h2>" +
          '<div class="dpanel" data-mret><p class="nodata">Loading…</p></div>' +

          '<h2 style="margin-top:26px">Customer value' + info("Counter visits × the shop's OWN self-reported average basket. A countable number times one assumption — and deliberately not incremental: some of these people would have come in anyway, and there is no way to see the counterfactual. Free welcome stamps and the reset after a reward emit no event, so they have never been in it.") + "</h2>" +
          '<div class="dpanel"><dl>' +
            "<dt>Estimated spend through the card</dt><dd>" +
              (v.hasBasket ? money(m, v.spendThroughCard) : "no basket set") + "</dd>" +
            "<dt>Their average basket</dt><dd>" +
              (v.hasBasket ? money(m, m.basket_cents / 100) : "never told us") + "</dd>" +
            "<dt>Customers</dt><dd>" + m.customers + "</dd>" +
            // Both windows, both named. This said "Stamps" and meant all time,
            // while the row you clicked to get here said "Stamps" and meant the
            // last 30 days — so the page appeared to contradict the table that
            // opened it. The all-time one is the figure that tallies: it is
            // this shop's line in the Merchants total, and the number on their
            // own dashboard.
            "<dt>Stamps (all time)</dt><dd>" + m.stamps + "</dd>" +
            "<dt>Stamps (last 30 days)</dt><dd>" + m.stamps_30d + "</dd>" +
          "</dl>" + (v.hasBasket
            ? '<p class="dnote">Stamps and customers are counted. The spend is those stamps times a basket they typed in themselves, so it is an estimate — there is no tracked spend in this product.</p>'
            : '<p class="dnote">They have never told us their average basket, so there is no money figure — one would be a guess times a guess. It is a field in their own dashboard.</p>') +
          "</div>" +

          (staffRows.length ? '<details class="fold" style="margin-top:18px"><summary>Counter phones (' +
            staffRows.length + ")" + info("A PHONE, not a person — signing out and back in mints a new id, and changing the PIN resets them all. Rewards is flagged when one phone hands out rewards on more than 30% of the stamps it adds; that is the shape free-coffee-for-friends takes.") + "</summary>" +
            '<div class="tw"><table><tr><th>Phone</th><th>Stamps</th><th>Rewards</th><th>Undos</th><th>Forced</th><th>Last seen</th></tr>' +
            staffRows.map((s) => '<tr><td class="mono">' + esc(s.actor.replace("staff:", "")) + "</td><td>" +
              // The columns stay RAW — stamps, undos and forced side by side is
              // the point of an audit table, and netting one into another hides
              // a fact. The FLAG divides by net, though: a phone that pads its
              // stamp count with scans it then undoes was diluting its own
              // ratio, which is the one number here meant to catch it.
              s.stamps + '</td><td class="' +
              ((s.stamps - s.undos) >= 10 && s.redeems / Math.max(1, s.stamps - s.undos) > 0.3 ? "bad" : "") + '">' +
              s.redeems + "</td><td>" + s.undos + "</td><td>" + s.forced + "</td><td>" + ago(s.last_seen) +
              "</td></tr>").join("") + "</table></div></details>" : "") +

          '<details class="fold" style="margin-top:10px"><summary>Every change they have made (' +
            m.card_edits + ")</summary>" +
            '<div data-edits class="flags">Loading…</div></details>' +

          (liveCards.length ? '<details class="fold" style="margin-top:10px" data-designfold><summary>Design their card' +
            info("The same designer the owner gets. It sets how the card LOOKS and the shop's name — never the reward or the stamp count, which are the shop's own to set. A saved change reaches every card already in a wallet.") +
            '</summary><div data-designhost></div></details>' : "") +

          // A claimed shop gets NO claim panel. It briefly had one, folded shut,
          // and it was wrong twice over: the copy says "nobody has claimed this
          // shop" whatever the shop's state, and the server refuses the only
          // button on it with already-claimed, because a link that mints a
          // login cannot be handed out for a login that exists. The way back
          // from a link that reached the wrong person is Actions → Hand it to
          // someone else, which returns the shop to unclaimed keeping its card
          // id — and the panel then appears in full, unfolded, where it means
          // something.

          (liveCards.length ? '<details class="fold" style="margin-top:10px"><summary>Check their Android card' +
            info("The band across the bottom of an Android card is Google\u2019s heroImage, not ours — we hand Google a link and Google fetches it. When that write fails it is logged on the server and nowhere else, so a card can look wrong here with everything on our side correct. This asks Google what it is actually holding. It reads only: nothing is changed and nobody is notified.") +
            '</summary><button class="btn btn-ghost cbtn" data-gcheck style="margin-top:8px">Ask Google</button>' +
            '<div data-gout></div></details>' : "") +

          '<details class="fold" style="margin-top:10px"><summary>Contact, links and programmes</summary>' +
            '<div class="flags">Sign-up link: <span class="mono">' + origin + "/j/" + esc(m.id) + "</span></div>" +
            '<label style="margin-top:12px">Phone</label>' +
            '<input data-phone value="' + esc(m.contact_phone) + '" placeholder="Who to ring">' +
            '<label style="margin-top:8px">Notes</label>' +
            '<input data-note value="' + esc(m.contact_note) + '" placeholder="Anything worth remembering">' +
            '<button class="btn btn-ghost cbtn" data-savecontact style="margin-top:8px">Save contact</button>' +
            (cards.length ? '<div class="flags" style="margin-top:14px">Programme' +
              (cards.length === 1 ? "" : "s") +
              info("A card id is printed on posters and baked into every Android card ever issued from it, so archiving is the only safe retirement — nothing is deleted and cards already in wallets keep stamping.") +
              cards.map((c) => '<div style="margin-top:6px"><span class="mono">' + esc(c.name) + "</span> " +
                (c.archived_at
                  ? '<button class="btn btn-ghost dbtn" data-unarchive="' + esc(c.id) + '">Restore</button>'
                  : '<button class="btn btn-ghost dbtn" data-archive="' + esc(c.id) + '">Archive</button>') +
                "</div>").join("") + "</div>" : "") +
          "</details>" +

          // The only irreversible button in the console, and the only way to
          // free an email address that is stuck: login refuses an archived owner
          // and the claim form refuses an existing one, so an address can be
          // locked out of both with nothing else to unstick it. A paid shop is
          // refused server-side; nothing else is.
          '<details class="fold" style="margin-top:10px" data-deletefold><summary>Delete this shop permanently</summary>' +
            '<p class="muted" style="margin:8px 0">Everything goes: the shop, its programme, its login, its customers and its whole history. ' +
            (m.customers ? "<strong>" + m.customers + " customer(s) hold a card from this shop. Their cards stop working and cannot be restored.</strong> " : "") +
            "Archive instead unless you are certain — that keeps every card working and can be undone.</p>" +
            '<label style="margin-top:4px">Type <strong>' + esc(m.name) + "</strong> to confirm</label>" +
            '<input data-delname placeholder="' + esc(m.name) + '" autocomplete="off">' +
            '<button class="btn btn-ghost dbtn" data-mdelete style="margin-top:8px" disabled>Delete shop</button>' +
            "<div data-delout></div></details>";
      }

      // ---- the claim link, in the one place it is written ---------------------
      // Rendered by the shop's own page AND by step 3 of New shop. It was two
      // implementations of one thing, which is exactly why they disagreed: one
      // knew a link was out and the other did not, and neither said that minting
      // again kills the link already sitting in the merchant's DM.
      //
      // The link is readable here because it is stored readable — see
      // src/claim.ts for that trade and what bounds it.
      const dayMonth = (d) => new Date(d).toLocaleDateString([], { day: "numeric", month: "short" });

      function claimPanelHtml(m) {
        const out = Boolean(m.claim_expires);
        return '<h4>Claim link' + info(
          "Sending this hands the shop over: whoever opens it makes the login. It works once and lasts 7 days. " +
          "Making a new one REPLACES the one already sent, so anything you have DM'd stops working — that is also how you withdraw a link that went to the wrong person."
        ) + "</h4>" +
          '<div class="flags">Nobody has claimed this shop. Until they do there is no login, no ' +
          "staff PIN, and their sign-up page stays closed — so no customer can be given a card " +
          "that nobody could stamp.</div>" +
          (out
            ? '<div class="temp" style="margin-top:8px">' + esc(m.claim_token || "(link withdrawn)") +
              (m.claim_token
                ? '<br><button class="btn btn-ghost cbtn" data-copy="' + esc(m.claim_token) + '">Copy it</button> '
                : " ") +
              "Out now, good until " + dayMonth(m.claim_expires) + ".</div>"
            : "") +
          '<div class="rst" style="margin-top:8px">' +
            '<button class="btn btn-dark cbtn" data-claimlink="' + m.id + '">' +
              (out ? "Replace the link that’s out" : "Make a claim link") + "</button>" +
            (out ? '<button class="btn btn-ghost dbtn" data-claimdrop="' + m.id + '">Withdraw it</button>' : "") +
          "</div>" +
          '<div class="flags" style="margin-top:6px">You can keep changing the card after you send ' +
          "this — they see the latest version whenever they open it.</div>" +
          '<div data-claimout="' + m.id + '"></div>';
      }

      /**
       * Wire a claim panel wherever it was rendered.
       *
       * Minting when a link is already out goes behind the two-tap arm — the
       * same guard archiving uses — because the cost is invisible and lands on
       * somebody else: their link dies and they find out by clicking a dead one.
       * Never a browser dialog (invariant 8): a suppressed confirm() returns
       * false and the button silently stops working.
       */
      function wireClaim(scope, m, done) {
        scope.querySelectorAll("[data-copy]").forEach((b) => {
          b.onclick = () => { navigator.clipboard.writeText(b.dataset.copy); b.textContent = "Copied ✓"; };
        });
        const out = scope.querySelector('[data-claimout="' + m.id + '"]');
        const mk = scope.querySelector("[data-claimlink]");
        const mint = async () => {
          mk.disabled = true;
          const { body: r } = await api("/merchant/" + m.id + "/claim-link", { method: "POST" });
          mk.disabled = false;
          if (!r.ok) {
            out.textContent = r.error === "already-claimed" ? "Already claimed." : (r.error || "Failed");
            return;
          }
          out.innerHTML = '<div class="temp" style="margin-top:8px">' + esc(r.url) +
            '<br><button class="btn btn-ghost cbtn" data-copy="' + esc(r.url) + '">Copy it</button> ' +
            "Send this in the DM. It works once, and lasts 7 days." +
            (r.replaced ? " The link you sent before no longer works." : "") + "</div>";
          out.querySelector("[data-copy]").onclick = (e) => {
            navigator.clipboard.writeText(r.url); e.target.textContent = "Copied ✓";
          };
          if (done) done();
        };
        if (mk) {
          if (m.claim_expires) armBtn(mk, "Tap again — the sent one dies", mint);
          else mk.onclick = mint;
        }
        const drop = scope.querySelector("[data-claimdrop]");
        if (drop) armBtn(drop, "Tap again to withdraw", async () => {
          await api("/merchant/" + m.id + "/claim-link", { method: "DELETE" });
          load();
        });
      }

      // ---- getting about -------------------------------------------------------
      function goMerchant(id) {
        history.pushState({}, "", MPATH + encodeURIComponent(id));
        render();
      }
      function goConsole(to) {
        if (to) pane = to;
        history.pushState({}, "", "/admin");
        render();
      }
      /** A .seg measures zero while hidden, so only seat the ones on screen. */
      function seatSegs() {
        document.querySelectorAll(".seg").forEach((s) => { if (s.offsetParent) moveThumb(s); });
      }

      function render() {
        const id = openMerchant();
        if (id) {
          const m = byMerchant.get(id);
          if (m) return void renderDetail(m);
          $("#app").innerHTML = '<p class="back"><button class="rlink" data-back>← All shops</button></p>' +
            '<h1>No such shop</h1><p class="sub">Nothing here has that id. It may have been deleted.</p>';
          $("[data-back]").onclick = () => goConsole();
          return;
        }
        renderConsole();
      }

      // ---- the console ---------------------------------------------------------
      function renderConsole() {
        // Summed over LIVE shops only: an archived account is closed, not
        // broken, and leaving it in would drag every figure down for a reason
        // that has nothing to do with the product.
        // The four states a live shop can be in, straight off stageOf, and
        // mutually exclusive by construction — so the bar always adds to 100%.
        // Paying is NOT one of them; it is counted separately underneath,
        // because a shop can be paying and churning at the same time.
        const stamping = live.filter((m) => m.stage === "stamping");
        const churning = live.filter((m) => m.stage === "churning");
        const never = live.filter((m) => m.stage === "activated");
        const unclaimed = live.filter((m) => m.stage === "not-claimed");
        const paid = live.filter((m) => m.paid_at);
        const wide = (n) => live.length ? (n / live.length) * 100 : 0;
        const seg = (cls, list) => list.length
          ? '<i class="' + cls + '" style="width:' + wide(list.length) + '%"></i>' : "";
        const key = (cls, list, label) => list.length
          ? '<span><i class="' + cls + '"></i><b>' + list.length + "</b> " + label + "</span>" : "";
        // The landing page's numbers. Both windows are shown at once rather
        // than behind a switch: 7 days alone cannot tell a quiet week from a
        // dead page, and the pair is one glance where a toggle is two.
        const t = traffic.week, m2 = traffic.month;
        const d = demoFunnel.week, dm = demoFunnel.month;
        const traf = (label, week, month) =>
          '<div><b>' + week + '</b><span class="trafmo">' + month + " in 30d</span>" +
          '<span class="traflab">' + label + "</span></div>";
        const rows = shownWeeks();

        $("#app").innerHTML =
          "<h1>Merchant health</h1>" +
          '<p class="purpose">Get every shop from signed up → stamping → still stamping in 30 days → paying.</p>' +
          '<div class="seg" id="atabs" role="tablist" style="margin:16px 0 6px">' +
            '<button data-pane="overview"' + (pane === "overview" ? ' class="on"' : "") + ">Overview</button>" +
            '<button data-pane="merchants"' + (pane === "merchants" ? ' class="on"' : "") + ">Merchants</button>" +
            '<button data-pane="new"' + (pane === "new" ? ' class="on"' : "") + ">New shop</button>" +
            '<span class="thumb"></span></div>' +

          // ============================ OVERVIEW ============================
          '<div id="pane-overview"' + (pane === "overview" ? "" : " hidden") + ">" +
            '<div class="lead"><div>' +
              '<p class="leadlab">Shops stamping in the last ' + CHURN_DAYS + " days" +
                info("Shops that have given at least one stamp in the last " + CHURN_DAYS + " days — the same threshold that makes a shop 'churning', so this number and the stage chips can never disagree. It is deliberately tight: a shop closed for a long weekend will drop out of it, and on a portfolio this small that is the right trade. This is the adoption number, and the one thing worth checking every morning.") +
              "</p>" +
              '<p class="hero">' + stamping.length +
                '<span class="heroof">of ' + live.length + " live shop" + (live.length === 1 ? "" : "s") +
                (needing.length ? " · " + needing.length + " need you today" : " · nothing needs you") +
                "</span></p>" +
            "</div><div>" +
              '<div class="lifebar">' + seg("live", stamping) + seg("quiet", churning) +
                seg("dead", never) + seg("new", unclaimed) + "</div>" +
              '<div class="lifekey">' + key("live", stamping, "stamping") +
                key("quiet", churning, "churning") + key("dead", never, "activated, no stamps") +
                key("new", unclaimed, "not claimed") + "</div>" +
              (paid.length ? '<p class="dnote" style="margin-top:8px">' + paid.length + " paying" +
                info("Kept off the bar on purpose. Paying is not a stage: a shop can be paying AND churning, and that pair is the most useful thing this page can tell you — so it travels beside the stage rather than replacing it.") + "</p>" : "") +

            // ---------------------------- the landing page's own numbers ----
            // A small box, not a pane: this is one glance on the way past, and
            // it is the founder's number rather than any shop's - which is why
            // it lives here and not on a dashboard an owner can see.
            '</div></div>' +
            '<div class="trafbox">' +
              '<p class="leadlab">Landing page' +
                info("Visits to the public pages, counted with an anonymous per-browser id and nothing else. Bots are recorded but excluded from these figures. Your own devices are excluded once you have visited /analytics-optout on each of them - without that, at this stage almost every visit here is you. Card QR scans are landings from the QR printed on a demo card in somebody's wallet - a pitch scan and a passed-around scan both count here, deliberately not split.") +
              "</p>" +
              '<div class="trafrow">' +
                traf("Visits", t.views, m2.views) +
                traf("Devices", t.devices, m2.devices) +
                traf("Came back", t.returning, m2.returning) +
                traf("Pressed start", t.cta, m2.cta) +
                traf("Tried the card", d.clicked, dm.clicked) +
                traf("Kept it", d.added, dm.added) +
                traf("Card QR scans", t.cardScans, m2.cardScans) +
              "</div>" +
              (t.referrers.length
                ? '<p class="dnote">From ' + t.referrers.map(function (r) {
                    return r.host + " " + r.n;
                  }).join(" · ") + "</p>"
                : '<p class="dnote">No visits recorded in the last 7 days.</p>') +
            "</div>" +


            // The book total, and the ONE number on this console that can be
            // checked by hand: it is the sum of the "Stamps (all time)" column
            // on Merchants, which is the sum of each shop's own dashboard.
            // Summed from the same rows the table renders — a second query
            // could disagree with the list, which is the whole complaint.
            //
            // It sits above Week by week because those tiles answer a different
            // question entirely (one finished week), and reading them as a
            // total is exactly the mistake that made these numbers look broken.
            '<h2 style="margin-top:26px">Everything so far' +
              info("All time, across live shops. Archived shops are left out here and out of the totals on Merchants, but their rows stay so you can still find them. This is the number that must equal the Stamps (all time) column added up, and each shop's own dashboard. The week-by-week tiles below are a different question: one finished week, not a running total.") + "</h2>" +
            '<div class="tiles">' +
              '<div class="tile"><div class="tl">Stamps, all time</div>' +
                '<div class="tv">' + int(sumBy(liveOf(body.merchants), "stamps")) + "</div>" +
                '<div class="tn">across ' + liveOf(body.merchants).length + " live shop" +
                  (liveOf(body.merchants).length === 1 ? "" : "s") + "</div></div>" +
              '<div class="tile"><div class="tl">Customers, last 30 days</div>' +
                '<div class="tv">' + int(sumBy(liveOf(body.merchants), "active_30d")) + "</div>" +
                '<div class="tn">people stamped, counted once each per shop</div></div>' +
              '<div class="tile"><div class="tl">Rewards, all time</div>' +
                '<div class="tv">' + int(sumBy(liveOf(body.merchants), "redemptions")) + "</div>" +
                '<div class="tn">handed over at a counter</div></div>' +
            "</div>" +

            '<h2 style="margin-top:26px">Week by week' +
              info("Whole weeks, Monday to Sunday, off the event log. Each tile is ONE week — the most recent finished one — not a running total; for totals read Everything so far above. Archived shops are left out of every line, and out of those totals too, so the two agree.") + "</h2>" +
            rangeRow("The tiles compare finished weeks only, so a half-run week never reads as a fall. The week now running is in the table below, marked, and in its total.") +
            '<div class="tiles">' + P_TILES.map((d) => tile(rows, d)).join("") + "</div>" +
            '<details class="fold" style="margin-top:12px"><summary>Every week, as numbers</summary>' +
              seriesTable(rows, P_TILES, partWeek) + "</details>" +

            '<h2 style="margin-top:26px">Do customers come back?' +
              info("Of everyone whose first stamp was at least 14 days ago, how many have been stamped more than once. Recomputed across every live shop's customers at once, never averaged from per-shop rates — a rate over 3 customers and a rate over 300 do not average into anything. Counted per person and per net stamp, and somebody stamped this week is in neither number, because they have not had the chance to come back.") + "</h2>" +
            '<div class="dpanel">' + returningHtml(body.returning, "anywhere") + "</div>" +

            '<h2 style="margin-top:26px">Needs you today' +
              info("Only shops with something actually wrong, worst first. The line under each name is the single most urgent thing to do about it. A healthy shop is not listed at all — that is the point.") + "</h2>" +
            (needing.length
              ? '<div class="triage">' + needing.slice(0, 5).map((m) =>
                  '<div class="trow ' + m.flags[0].severity + '" data-go="' + esc(m.id) + '">' +
                  '<div><span class="tname">' + esc(m.name) + "</span></div><div><div>" + chips(m, true) +
                  '</div><div class="taction">' + esc(m.flags[0].action) + "</div></div></div>").join("") +
                "</div>" +
                (needing.length > 5
                  ? '<p class="dnote"><button class="rlink" data-allshops>' + (needing.length - 5) +
                    " more shop" + (needing.length - 5 === 1 ? "" : "s") + " with something wrong</button></p>"
                  : "")
              : '<div class="tclear">Nothing needs you today.</div>') +

            '<details class="fold" style="margin-top:26px"><summary>Maintenance</summary>' +
              '<p class="dnote" style="margin:8px 0">Press this after the public address changes. Android cards load their logo, banner and stamp images from that address, and the link Google calls back on is stored with each shop — none of it moves by itself. iPhone cards need nothing. It notifies nobody and cannot change anyone’s stamps, so it is safe to press twice.</p>' +
              '<button class="btn btn-ghost" id="gresync">Resync Google Wallet</button><div id="gresync-out"></div>' +
              '<p class="dnote" style="margin:18px 0 8px">The demo card\u2019s QR opens the landing page instead of being a stamp code. New cards get that when they are issued; ones already in a wallet do not, and only Android is affected \u2014 iPhone rebuilds its card on every check, Google writes the barcode once and never again. Press this after changing what that QR points at. It reads each card first and only rewrites the ones actually holding the old value, so a count of zero means nothing was stuck.</p>' +
              '<button class="btn btn-ghost" id="dresync">Fix demo card QR codes</button><div id="dresync-out"></div>' +
            "</details>" +
          "</div>" +

          // =========================== MERCHANTS ============================
          '<div id="pane-merchants"' + (pane === "merchants" ? "" : " hidden") + ">" +
            '<h2>Every shop' + info("Worst first, never alphabetical. Open any shop for the whole picture: its problems, its weekly lines, its funnel, its card and everything you can do to it.") + "</h2>" +
            '<div class="tw"><table>' + MERCHANT_HEAD +
              ranked.filter((m) => !m.archived_at).map(merchantRow).join("") +
              merchantTotals(ranked) + "</table></div>" +
            (archivedMerchants.length
              ? '<details class="fold" style="margin-top:12px"><summary>Archived shops (' +
                archivedMerchants.length + ")" +
                info("Closed accounts. Nothing is deleted and every card already in a wallet keeps working — they are just out of the working list, raise no problems, and are left out of everything on Overview. Restore one from its own page.") +
                '</summary><div class="tw"><table>' + MERCHANT_HEAD +
                archivedMerchants.map(merchantRow).join("") + "</table></div></details>"
              : "") +
          "</div>" +

          // =========================== NEW SHOP =============================
          // Untouched by the rework: the same three steps, in the same order,
          // against the same shared designer and the same shared claim panel.
          '<div id="pane-new"' + (pane === "new" ? "" : " hidden") + ">" +
            '<ol class="steps">' +
              '<li class="step" data-step="1"><h3><span class="sn">1</span>Name it' +
                info("Creates the business and a plain card with NO login attached — that is the point. Nothing a customer can reach exists until they claim it: their sign-up page stays closed and no card can be issued.") +
                '</h3><div class="rst" style="margin-top:0">' +
                '<div style="flex:1;min-width:200px"><input id="dfy-name" placeholder="e.g. Nasi Lemak House"></div>' +
                '<button class="btn btn-dark" id="dfy-create">Build it</button></div><div id="dfy-out"></div>' +
                (unclaimed.length
                  ? '<div class="resume">or pick up one you started: ' + unclaimed.map((m) =>
                      '<button type="button" class="rlink" data-resume="' + esc(m.id) + '">' + esc(m.name) +
                      "</button>").join("") + "</div>"
                  : "") +
              "</li>" +
              '<li class="step" data-step="2"><h3><span class="sn">2</span>Design their card' +
                info("The same designer the owner gets — upload their logo and we read the colours out of it. It never sets the reward or the stamp count; only the shop does that, from their own dashboard.") +
                '</h3><p class="dnote" style="margin:0 0 10px">Press <strong>Save card</strong> before you hand it over, or they open a card with no design on it. You can keep changing it afterwards either way.</p>' +
                '<div id="ds-editor"><div class="dsempty">Build a shop above, or pick one up, and the designer opens here.</div></div></li>' +
              '<li class="step" data-step="3"><h3><span class="sn">3</span>Hand it over' +
                info("Sending this hands the shop over: whoever opens it makes the login. It works once, lasts 7 days, and is shown here only when it is minted. Sending a new one replaces the old, which is also how you withdraw one that went to the wrong person.") +
                '</h3><div id="dfy-claim"><div class="dsempty">The claim link appears once there is a shop to hand over.</div></div></li>' +
            "</ol>" +
          "</div>";

        wireConsole();
      }

      function wireConsole() {
        $("#atabs").querySelectorAll("button").forEach((b) => {
          b.onclick = () => {
            pane = b.dataset.pane;
            $("#atabs").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
            ["overview", "merchants", "new"].forEach((p) => { $("#pane-" + p).hidden = p !== pane; });
            seatSegs();
            window.scrollTo(0, 0);
          };
        });
        // One filter row for every chart it scopes, never one per chart.
        const rr = $("[data-range]");
        if (rr) rr.querySelectorAll("button").forEach((b) => {
          b.onclick = () => { range = Number(b.dataset.weeks); renderConsole(); };
        });
        document.querySelectorAll("[data-m]").forEach((tr) => {
          tr.onclick = () => goMerchant(tr.dataset.m);
        });
        document.querySelectorAll("[data-go]").forEach((el) => {
          el.style.cursor = "pointer";
          el.onclick = (e) => { if (!e.target.closest("button")) goMerchant(el.dataset.go); };
        });
        const more = $("[data-allshops]");
        if (more) more.onclick = () => {
          pane = "merchants";
          renderConsole();
        };
        wireResync();
        wireDemoResync();
        wireNewShop();
        seatSegs();
        if (building) drawSteps();
      }

      function wireDemoResync() {
        const dr = $("#dresync");
        if (!dr) return;
        dr.onclick = async () => {
          const out = $("#dresync-out");
          dr.disabled = true;
          dr.textContent = "Fixing\u2026";
          out.innerHTML = "";
          const { body: r } = await api("/demo-barcode-resync", { method: "POST" });
          dr.disabled = false;
          dr.textContent = "Fix demo card QR codes";
          if (!r.ok) {
            out.innerHTML = '<p class="dnote" style="margin:8px 0 0">' + (r.error === "no-demo-card"
              ? "No card with id " + esc(String(r.id || "")) + ". Check DEMO_CARD_ID in Railway."
              : "Couldn\u2019t fix \u2014 " + esc(String(r.error || "unknown"))) + "</p>";
            return;
          }
          const g = r.google || {};
          // Say what it DID, not that it ran. "Fixed 0 of 0" reads as a failure;
          // "nothing needed fixing" is the same fact and is actionable.
          const line = !g.configured
            ? "Google Wallet isn\u2019t set up, so only the iPhone half ran."
            : g.checked === 0
              ? "No Android demo cards exist yet, so there was nothing to fix."
              : g.fixed
                ? g.fixed + " Android card" + (g.fixed === 1 ? "" : "s") + " now point at the site" +
                  (g.skipped ? " (" + g.skipped + " already did)" : "")
                : "All " + g.checked + " Android demo card" + (g.checked === 1 ? "" : "s") +
                  " already point at the site.";
          out.innerHTML = '<p class="dnote" style="margin:8px 0 0">' + esc(line) +
            (g.failed ? esc(" " + g.failed + " could not be read or written.") : "") +
            esc(" iPhone cards nudged: " + (r.applePushed || 0) + ".") + "</p>";
        };
      }

      function wireResync() {
        // Re-send every shop's Google class. Sequential on the server, so this
        // can take a few seconds on a long list — say so rather than look hung.
        const gr = $("#gresync");
        if (!gr) return;
        gr.onclick = async () => {
          const out = $("#gresync-out");
          gr.disabled = true;
          gr.textContent = "Resyncing…";
          out.innerHTML = "";
          const { body: r } = await api("/google-resync", { method: "POST" });
          gr.disabled = false;
          gr.textContent = "Resync Google Wallet";
          if (!r.ok) {
            out.innerHTML = '<p class="dnote" style="margin:8px 0 0">' + (r.error === "google-not-configured"
              ? "Google Wallet isn’t set up in Railway, so there is nothing to resync."
              : "Couldn’t resync — " + esc(String(r.error || "unknown"))) + "</p>";
            return;
          }
          // Name the failures. "3 of 10 failed" with no names is a message you
          // cannot act on, and this is the screen you act from.
          const bad = (r.results || []).filter((x) => !x.ok);
          // And name the REPAIR, separately from the resync. This button rewrote
          // shop designs and reported success while the thing an operator
          // pressed it to fix — a card in a wallet drawing its own old band over
          // the shop's — sat untouched on the object, where a class write cannot
          // reach. A count of zero is meaningful now: nothing was stuck.
          const fixed = (r.results || []).filter((x) => x.cleared > 0);
          out.innerHTML = '<p class="dnote" style="margin:8px 0 0">' +
            (r.failed
              ? esc(r.failed + " of " + r.total + " failed: ") +
                bad.map((x) => esc(x.name) + " (" + esc(x.reason) + ")").join(", ")
              : esc(r.total + " shop" + (r.total === 1 ? "" : "s") + " resynced ✓")) +
            (r.cleared
              ? "<br>" + esc(r.cleared + " card" + (r.cleared === 1 ? "" : "s") +
                  " in a wallet showed their own old band — cleared, so the shop’s design shows through: ") +
                fixed.map((x) => esc(x.name) + " (" + x.cleared + ")").join(", ")
              : "") + "</p>";
        };
      }

      // ---- one shop, on its own page ------------------------------------------
      async function renderDetail(m) {
        $("#app").innerHTML = detailHtml(m);
        window.scrollTo(0, 0);
        wireDetail(m);
        // Two extra trips, neither of which the page waits on: the numbers are
        // what the page is for and they are already on screen.
        api("/merchant/" + m.id + "/edits").then(({ body: ed }) => {
          const host = $("[data-edits]");
          if (!host) return;
          host.innerHTML = (ed.edits || []).length
            ? ed.edits.map((x) => {
                const what = Object.entries(x.changed || {})
                  .map(([k, ch]) => k + ": " + esc(String(ch.from)) + " → " + esc(String(ch.to)))
                  .join(" · ");
                return "<div>" + ago(x.created_at) + " — " + (what || "design") + "</div>";
              }).join("")
            : "Nothing changed since setup.";
        });
        // One trip carries both this shop's weekly lines and its own returning
        // rate — they answer two of the three questions this console exists for
        // and there is no reason to make the page wait twice.
        api("/merchant/" + m.id + "/series").then(({ body: s }) => {
          const ret = $("[data-mret]");
          if (ret) ret.innerHTML = returningHtml(s.returning, "here") +
            (m.nudged ? '<p class="dnote">Nudged → came back: ' + m.nudge_returned + " of " + m.nudged + "</p>" : "");
          const host = $("[data-mseries]");
          if (!host) return;
          // The running week is held out of the TILES and listed in the table,
          // the same as the platform section above. It used to be dropped
          // outright here — and unlike the platform view, never reported
          // anywhere — so a shop stamped only today read as zero with nothing
          // on screen saying why.
          const mAll = derive(s.series);
          const mPart = mAll.length ? mAll[mAll.length - 1] : null;
          const weeks = mAll.slice(0, -1).slice(-range);
          host.innerHTML = weeks.length || mPart
            ? rangeRow("The tiles compare finished weeks only, so a half-run week never reads as a fall. The week now running is in the table below, marked, and in its total.") +
              '<div class="tiles">' + M_TILES.map((d) => tile(weeks, d)).join("") + "</div>" +
              '<details class="fold" style="margin-top:12px"><summary>Every week, as numbers</summary>' +
              seriesTable(weeks, M_TILES, mPart) + "</details>"
            : '<p class="nodata">Nothing has happened here yet.</p>';
          const rr = host.querySelector("[data-range]");
          if (rr) {
            rr.querySelectorAll("button").forEach((b) => {
              b.onclick = () => { range = Number(b.dataset.weeks); renderDetail(m); };
            });
            seatSegs();
          }
        });
      }

      /** Everything you can do to a shop, wired where its page renders it. */
      function wireDetail(m) {
        const scope = $("#app");
        const id = m.id;
        $("[data-back]").onclick = () => goConsole("merchants");
        scope.querySelectorAll("[data-copy]").forEach((b) => {
          b.onclick = () => { navigator.clipboard.writeText(b.dataset.copy); b.textContent = "Copied ✓"; };
        });
        const menu = scope.querySelector(".menu");
        const save = scope.querySelector("[data-savecontact]");
        if (save) save.onclick = async () => {
          await api("/merchant/" + id + "/contact", { method: "POST", body: JSON.stringify({
            phone: scope.querySelector("[data-phone]").value,
            note: scope.querySelector("[data-note]").value,
          })});
          save.textContent = "Saved ✓";
        };
        // Only where there is a panel to wire — see the note in detailHtml.
        if (m.stage === "not-claimed") wireClaim(scope, m);
        // Taking a shop back off an owner. Two taps, like archiving: the cost
        // lands on somebody else, who loses their dashboard mid-sentence.
        const hand = scope.querySelector("[data-unclaim]");
        if (hand) armBtn(hand, "Tap again — they lose it", async () => {
          const { body: r } = await api("/merchant/" + id + "/unclaim", { method: "POST" });
          if (r.ok) return void load();
          hand.textContent = r.error === "not-claimed" ? "Nobody holds it" : "Failed";
        });
        // Whether they are paying. It had a route and no button, so the delete
        // refusal told you to mark a shop unpaid with nothing anywhere to do it.
        const paid = scope.querySelector("[data-paid]");
        if (paid) armBtn(paid, "Tap again to confirm", async () => {
          await api("/merchant/" + id + "/paid", {
            method: "POST", body: JSON.stringify({ paid: !paid.dataset.now }),
          });
          load();
        });
        const arch = scope.querySelector("[data-marchive]");
        if (arch) armBtn(arch, "Tap again to archive", async () => {
          await api("/merchant/" + id + "/archive", { method: "POST" });
          load();
        });
        const un = scope.querySelector("[data-munarchive]");
        if (un) un.onclick = async () => {
          await api("/merchant/" + id + "/unarchive", { method: "POST" });
          load();
        };
        // Delete is a menu item that OPENS the gate, never one that fires it:
        // the typed name is the real guard, and arm() only covers a mis-click.
        const showDel = scope.querySelector("[data-showdelete]");
        const fold = scope.querySelector("[data-deletefold]");
        if (showDel && fold) showDel.onclick = () => {
          if (menu) menu.open = false;
          fold.open = true;
          fold.scrollIntoView({ block: "center" });
          fold.querySelector("[data-delname]").focus();
        };
        const delName = scope.querySelector("[data-delname]");
        const delBtn = scope.querySelector("[data-mdelete]");
        if (delName && delBtn) {
          const shopName = (m.name || "").trim().toLowerCase();
          delName.oninput = () => {
            delBtn.disabled = delName.value.trim().toLowerCase() !== shopName;
          };
          armBtn(delBtn, "Tap again — this cannot be undone", async () => {
            const { body: r } = await api("/merchant/" + id, {
              method: "DELETE", body: JSON.stringify({ name: delName.value }),
            });
            // Nothing left to go back to, so leave the shop's address behind.
            if (r.ok) { history.replaceState({}, "", "/admin"); pane = "merchants"; return void load(); }
            const why = {
              "paid-shop": "This shop is paying. Mark it as not paying first if you really mean it.",
              "name-mismatch": "That name doesn't match.",
            }[r.error] || "Couldn't delete it.";
            scope.querySelector("[data-delout]").innerHTML =
              '<p class="dnote" style="margin:8px 0 0">' + esc(why) + "</p>";
          });
        }
        // Reads the far end of the wire. Every way an Android band goes blank
        // looks the same from our side, so this names which one it is rather
        // than leaving an owner to guess: the class write failed, the class is
        // right but an old card carries its own band over the top, or the link
        // Google holds no longer serves an image.
        const gcheck = scope.querySelector("[data-gcheck]");
        if (gcheck) gcheck.onclick = async () => {
          const out = scope.querySelector("[data-gout]");
          gcheck.disabled = true;
          gcheck.textContent = "Asking Google…";
          out.innerHTML = "";
          const { body: r } = await api("/merchant/" + id + "/google");
          gcheck.disabled = false;
          gcheck.textContent = "Ask Google";
          if (!r.cards) {
            out.innerHTML = '<p class="dnote" style="margin:8px 0 0">Couldn’t reach Google.</p>';
            return;
          }
          out.innerHTML = r.cards.map((c) => {
            const cl = c.class || {};
            const lines = [];
            if (!cl.found) {
              lines.push(cl.reason === "google-not-configured"
                ? ["bad", "Google Wallet isn’t set up in Railway, so there is nothing to ask."]
                : ["bad", "Google has no card design for this programme (" + esc(String(cl.status || "?")) +
                   "). Nothing we send is reaching it — press Resync Google Wallet on Overview and check again."]);
            } else {
              if (!cl.heroUri) {
                lines.push(["bad", "Google is holding NO band image. That is the blank strip — the design save never landed."]);
              } else if (cl.expectedHeroUri && cl.heroUri !== cl.expectedHeroUri) {
                lines.push(["bad", "Google is holding an OLD band. Its link is not the one we would send now, so the last save never reached Google."]);
              } else {
                lines.push(["ok", "Google is holding the current band."]);
              }
              if (c.hero) {
                lines.push(c.hero.status === 200 && c.hero.type.indexOf("image/") === 0
                  ? ["ok", "That link loads: " + esc(c.hero.type) + ", " + Math.round(c.hero.bytes / 1024) + "KB."]
                  : ["bad", "That link does NOT load (" + esc(String(c.hero.status)) + " " + esc(c.hero.type) +
                     "). Google cannot fetch it, so the strip stays blank."]);
              }
              // An object-level image wins over the class's for as long as it
              // exists, and every stamp since has been a patch that leaves it
              // alone — so a shop can have a perfect design and still show
              // the wrong band on the cards that have been in a wallet longest.
              const shadowed = (c.objects || []).filter((o) => o.ownHeroUri);
              if (shadowed.length) {
                lines.push(["bad", shadowed.length + " card" + (shadowed.length === 1 ? "" : "s") +
                  " in a wallet carry their own band, which hides the shop’s. Those were issued before the band moved to the design."]);
              }
              if (!cl.hasCallback) {
                lines.push(["warn", "Google has no callback registered, so nobody is told when a customer deletes their card. Set GOOGLE_CALLBACK_SECRET in Railway, then resync."]);
              }
              if (cl.reviewStatus && cl.reviewStatus.toLowerCase() === "draft") {
                lines.push(["bad", "The design is still a DRAFT at Google, which cannot issue cards."]);
              }
            }
            return '<div class="flags" style="margin-top:10px"><strong>' + esc(c.name) + "</strong>" +
              lines.map((l) => '<div class="' + (l[0] === "bad" ? "bad" : l[0] === "warn" ? "warn" : "") +
                '" style="margin-top:4px">' + (l[0] === "ok" ? "✓ " : "• ") + l[1] + "</div>").join("") +
              "</div>";
          }).join("");
        };
        // Mounted lazily: it is a second request per shop and the page must not
        // wait on it to show the numbers, which are what the page is for.
        const dfold = scope.querySelector("[data-designfold]");
        if (dfold) dfold.addEventListener("toggle", () => {
          const host = scope.querySelector("[data-designhost]");
          if (!dfold.open || host.dataset.mounted) return;
          host.dataset.mounted = "1";
          const card = (body.cards || []).find((c) => m.card_ids.includes(c.id) && !c.archived_at);
          if (card) mountDesigner(host, card.id, cardLinks(card, id, origin), load);
        });
        // Passwords are one-way scrypt hashes: there is nothing to look up, so
        // this REPLACES the hash with a fresh temporary password, shown once.
        const pw = scope.querySelector("[data-resetpw]");
        if (pw) armBtn(pw, "Tap again to reset", async () => {
          const out = scope.querySelector("[data-pwout]");
          const { body: r } = await api("/owner/" + pw.dataset.resetpw + "/reset-password", { method: "POST" });
          if (menu) menu.open = false;
          out.innerHTML = r.ok
            ? '<div class="temp">New password for <strong>' + esc(r.email) + "</strong>: <strong>" +
              r.tempPassword + "</strong><br>Give it to them; they can change it in their dashboard.</div>"
            : '<div class="temp">' + esc(r.error || "Failed") + "</div>";
        });
        // Archiving a programme is always safe — nothing is destroyed and it is
        // reversible — so the only refusal left is taking a shop's last card.
        const WHY = { "last-card": "Their only card — kept", "no-such-card": "Not found", already: "Already archived" };
        scope.querySelectorAll("[data-archive]").forEach((b) => {
          armBtn(b, "Tap again to archive", async () => {
            b.disabled = true;
            const { body: r } = await api("/card/" + b.dataset.archive + "/archive", { method: "POST" });
            if (r.ok) return void load();
            b.disabled = false;
            b.textContent = WHY[r.error] || "Failed";
          });
        });
        // Restoring needs no confirmation: it puts back something still there.
        scope.querySelectorAll("[data-unarchive]").forEach((b) => {
          b.onclick = async () => {
            b.disabled = true;
            const { body: r } = await api("/card/" + b.dataset.unarchive + "/unarchive", { method: "POST" });
            if (r.ok) return void load();
            b.disabled = false;
            b.textContent = "Failed";
          };
        });
      }

      // ---- New shop: name it, design it, hand it over -------------------------
      // One sequence in one place, and the rework did not touch it. It used to
      // be three sections at three heights of a long page — Build a shop at the
      // bottom, the designer above it, and the claim link on the shop's row
      // further up still — with nothing on screen saying that was the order.

      /** Draw steps 2 and 3 for whatever shop is in hand, or reset them. */
      async function drawSteps() {
        const ed = $("#ds-editor"), cl = $("#dfy-claim");
        if (!ed || !cl) return;
        if (!building) {
          ed.innerHTML = '<div class="dsempty">Build a shop above, or pick one up, and the designer opens here.</div>';
          cl.innerHTML = '<div class="dsempty">The claim link appears once there is a shop to hand over.</div>';
          return;
        }
        // Re-read the row every time: a claim link minted a minute ago is on
        // the fresh one and not on the copy this step was started with.
        const fresh = byMerchant.get(building.merchantId);
        if (fresh) building.merchant = fresh;
        // The same panel the shop's own page renders, against the same merchant
        // row — so the two can never know different things about one link.
        cl.innerHTML = claimPanelHtml(building.merchant);
        wireInfo(cl);
        wireClaim(cl, building.merchant);
        // No rail: "Copy sign-up link" and "Print poster" are for handing a shop
        // over, and this one does not exist for anybody yet. The same links sit
        // on its page the moment it does.
        await mountDesigner(ed, building.cardId, "", load);
      }

      function wireNewShop() {
        const create = $("#dfy-create");
        if (!create) return;
        create.onclick = async () => {
          const cafeName = $("#dfy-name").value.trim();
          if (!cafeName) return void ($("#dfy-out").textContent = "Enter a shop name.");
          create.disabled = true; $("#dfy-out").textContent = "Building…";
          const { body: r } = await api("/card", { method: "POST", body: JSON.stringify({ cafeName }) });
          create.disabled = false;
          if (!r.ok) return void ($("#dfy-out").textContent = r.error || "Failed");
          // No email, no password, no PIN — there is no account yet, and that is
          // deliberate. They make their own when they claim it.
          $("#dfy-out").innerHTML = '<div class="temp">Built <strong>' + esc(cafeName) + "</strong>.</div>";
          $("#dfy-name").value = "";
          building = {
            merchantId: r.merchantId, cardId: r.cardId, name: cafeName,
            // Freshly built: no link has ever been out for it.
            merchant: { id: r.merchantId, name: cafeName, claim_expires: null, claim_token: null },
          };
          drawSteps();
        };
        // Picking one up mid-way is the same three steps against a shop that
        // already exists — a link sent on Monday and a design finished on
        // Tuesday is the normal case, not an edge one.
        $("#pane-new").querySelectorAll("[data-resume]").forEach((b) => {
          b.onclick = () => {
            const m = byMerchant.get(b.dataset.resume);
            const card = (body.cards || []).find((c) => m.card_ids.includes(c.id) && !c.archived_at);
            if (!card) return void toast("That shop has no live card");
            building = { merchantId: m.id, cardId: card.id, name: m.name, merchant: m };
            drawSteps();
          };
        });
      }

      // Delegated from #app, which contains every view this page has — so one
      // call covers markup rendered later. Once only: #app itself survives every
      // re-render, and wiring it per load stacks duplicate listeners on it.
      if (!$("#app").dataset.infoRoot) { $("#app").dataset.infoRoot = "1"; wireInfo($("#app")); }
      rerender = render;
      render();
    }
    load();
  `;
  return page(
    "PunchMe — Admin",
    `<div class="card awrap" id="app"><p class="sub">Loading…</p></div><div class="toast"></div>`,
    css,
    js,
  );
}

// ---------------------------------------------------------------- setup ----

export function setupPage(s: SetupStatus, baseUrl: string): string {
  const check = (ok: boolean, label: string, hint: string) =>
    `<li style="margin:10px 0; list-style:none">
       <span style="font-size:1.1rem">${ok ? "✅" : "❌"}</span> <strong>${label}</strong>
       ${ok ? "" : `<div class="muted" style="margin-left:28px">${hint}</div>`}
     </li>`;
  return page(
    "PunchMe — Setup status",
    `<div class="card">
      <h1>Setup status</h1>
      <p class="sub">Green across the board = ready to demo.</p>
      <ul style="padding:0">
        ${check(s.database, "Database connected", "Add the Postgres plugin in Railway (it sets DATABASE_URL automatically).")}
        ${check(s.baseUrl, "Public URL set (BASE_URL)", "In Railway → Variables, set BASE_URL to this app’s https URL.")}
        ${check(s.teamId, "Apple Team ID (APPLE_TEAM_ID)", "From developer.apple.com → Membership details.")}
        ${check(s.passTypeId, "Pass Type ID (PASS_TYPE_ID)", "e.g. pass.com.stampy.loyalty — created at developer.apple.com.")}
        ${check(s.signerCert, "Signing certificate (SIGNER_CERT_B64 + SIGNER_KEY_B64)", "Exported from Keychain — Claude walks you through this.")}
        ${check(s.apnsKey, "Push key (APNS_KEY_B64 + APNS_KEY_ID)", "An APNs auth key (.p8) from developer.apple.com.")}
        ${check(s.googleIssuer, "Google Wallet Issuer ID (GOOGLE_ISSUER_ID)", "From the Google Wallet Business Console — needed for Android cards.")}
        ${check(s.googleServiceAccount, "Google service account (GOOGLE_SERVICE_ACCOUNT_B64)", "Produced by pnpm prepare-google from the downloaded JSON key.")}
        ${check(s.canEmail, "Email for password resets (RESEND_API_KEY + EMAIL_FROM)", "Optional but recommended: make a free Resend account, verify a sender, then set both in Railway → Variables. Without it, owners recover via the admin console instead.")}
        ${check(s.canWhatsapp, "WhatsApp for “Start your 30 days free” (WHATSAPP_NUMBER)", "In Railway → your app service (not Postgres) → Variables, add WHATSAPP_NUMBER. Digits only, country code first, no + and no spaces: a Malaysian 012-345 6789 is 60123456789. Press Deploy after adding it. Until it is set the button still works — it opens Instagram instead.")}
      </ul>
      <hr style="border:none;border-top:1px solid var(--line);margin:16px 0">
      <p><strong>Apple — can issue cards:</strong> ${s.canSignPasses ? "YES ✅" : "not yet"}</p>
      <p><strong>Apple — can push updates:</strong> ${s.canPush ? "YES ✅" : "not yet"}</p>
      <p><strong>Google Wallet (Android):</strong> ${s.canGoogleWallet ? "YES ✅" : "not yet"}</p>
      <p><strong>Email (password resets):</strong> ${s.canEmail ? "YES ✅" : "not yet"}</p>
      <p><strong>“Start your 30 days free” opens:</strong> ${s.canWhatsapp ? "WhatsApp ✅" : "Instagram (WHATSAPP_NUMBER not set)"}</p>
      <p style="margin-top:14px">Owner dashboard: <a href="/dashboard">${baseUrl || ""}/dashboard</a></p>
      ${
        s.canSignPasses
          ? `<p>Counter QR (print me): <a href="/qr">${baseUrl}/qr</a></p>
             <p>Staff page: <a href="/staff">${baseUrl}/staff</a></p>`
          : ""
      }
    </div>`,
  );
}

// ------------------------------------------------------------ reset ----

/** The page a password-reset email link opens: set a new password, then log in. */
export function resetPage(): string {
  const js = /* js */ `
    const $ = (s) => document.querySelector(s);
    const token = new URLSearchParams(location.search).get("token") || "";
    function toast(msg) { const t = $(".toast"); t.textContent = msg; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2600); }
    if (!token) {
      $("#app").innerHTML = '<h1>Reset link invalid</h1><p class="sub">This link is missing its code. Request a new one from the <a href="/dashboard">login page</a>.</p>';
    } else {
      $("#app").innerHTML = \`
        <h1>Set a new password</h1>
        <p class="sub">Choose a new password for your PunchMe account.</p>
        <label>New password (min 8 characters)</label>
        <input id="pw" type="password" autocomplete="new-password">
        <label style="display:flex;align-items:center;gap:6px;font-size:.8rem;color:var(--muted);margin-top:6px"><input id="eye" type="checkbox" style="width:auto"> Show password</label>
        <button class="btn btn-dark" style="margin-top:14px" id="go">Save new password</button>\`;
      $("#eye").onchange = () => { $("#pw").type = $("#eye").checked ? "text" : "password"; };
      $("#go").onclick = async () => {
        const password = $("#pw").value;
        if (!password || password.length < 8) return toast("Password needs at least 8 characters");
        const r = await fetch("/dashboard/api/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) });
        const body = await r.json().catch(() => ({}));
        if (body.ok) { toast("Password set — signing you in…"); setTimeout(() => location.href = "/dashboard", 900); }
        else toast(body.error === "invalid-or-expired-link" ? "This link has expired — request a new one." : (body.error || "Couldn’t reset"));
      };
    }
  `;
  return page(
    "PunchMe — Reset password",
    `<div class="card" id="app"><p class="sub">Loading…</p></div><div class="toast"></div>`,
    "",
    js,
  );
}
