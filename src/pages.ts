/**
 * All HTML pages, server-rendered from template strings — no frontend build,
 * nothing for the founder to compile. Mobile-first (staff use their phones).
 */
import { contrastText, rgbToHex } from "./color.js";
import { FLAG_GUIDE } from "./health.js";
import type { SetupStatus } from "./config.js";
import type { CardRow } from "./db.js";
import { DEFAULT_CARD_ID, FUNNEL_SINCE, FUNNEL_SINCE_LABEL, TRIAL_DAYS } from "./db.js";

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
  label { font-size: .68rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
          color: var(--muted); display: block; margin: 14px 0 6px; }
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
  /** Away from a surface, so the two never read as the same colour. */
  function separate(hex, from, minRatio) {
    var out = hex, step = relLuminance(from) > 0.4 ? -0.12 : 0.12;
    for (var i = 0; i < 6 && contrastRatio(out, from) < minRatio; i++) out = shiftColor(out, step);
    return out;
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
    accent = separate(accent, band, 2.2);

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
export const DESIGN_PANEL_CSS = /* css */ `
    /* The designer's column. It was laid out against the dashboard's 480px
       card, and the console is a 1000px page — without this the preview and
       every control below it stretch, and the two stop looking alike. A
       no-op on the dashboard, which already sits inside a 480px .card. */
    .designhost { max-width: 480px; }
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
    .pv-logo { width: 34px; height: 34px; border-radius: 8px; object-fit: contain; background: rgba(255,255,255,.14); }
    .pv-name { font-weight: 700; font-size: 1.02rem; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pv-hdr { text-align: right; }
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
    /* Inline rejection notice (e.g. a stamp upload with no transparency) —
       stays on screen, unlike a toast, because it asks the owner to go and fix
       the file and come back. */
    .err { color: #a33; background: #fdeaea; border: 1px solid #f2c9c9; border-radius: 10px;
           padding: 10px 12px; font-size: .84rem; margin-top: 8px; }
    /* --- designer controls --- */
    /* Where the five native pickers sit while no row is open. They are moved out
       into the open row, not proxied — see drawRoles. */
    .colorpark { display: none; }
    .chipcustom input[type=color] { width: 30px; height: 30px; padding: 2px; margin: 0;
                                    border: 1px solid var(--field-border); border-radius: 8px;
                                    background: var(--surface); cursor: pointer; }
    .logorow { display: flex; gap: 8px; align-items: center; margin-top: 4px; }
    .logorow input[type=file] { display: none; }
    .logorow .btn { width: auto; padding: 10px 14px; font-size: .9rem; }
    .copyrow { display: flex; gap: 8px; margin-top: 4px; }
    .copyrow input { font-family: ui-monospace, Menlo, monospace; font-size: .78rem; background: var(--ghost-bg); }
    .copyrow .btn { width: auto; padding: 10px 14px; font-size: .9rem; }
    /* --- colour presets --- */
    /* --- colours pulled out of an uploaded image --- */
    .swatches { margin-top: 10px; padding: 12px; border-radius: 12px; background: var(--ghost-bg); }
    .swrow { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .swrow .sw { width: 30px; height: 30px; border-radius: 8px; box-shadow: inset 0 0 0 1px rgba(0,0,0,.14); }
    .swrow .btn { width: auto; padding: 8px 12px; font-size: .85rem; margin-left: auto; }
    /* --- colours: one named row per part of the card, opening to its palette --- */
    /* This replaced a chip row AND a row of five colour squares that set the
       same five fields. Two controls for one job read as two different jobs. */
    .crlist { border: 1px solid var(--line); border-radius: 14px; overflow: hidden; margin: 6px 0 10px;
              background: var(--surface); }
    .crow2 + .crow2 { border-top: 1px solid var(--line); }
    .crhead { display: flex; align-items: center; gap: 10px; width: 100%; padding: 12px 14px;
              border: none; background: none; font: inherit; color: var(--ink); cursor: pointer; text-align: left; }
    .crname { flex: 1; font-weight: 600; font-size: .92rem; }
    .crsw { width: 26px; height: 26px; border-radius: 7px; box-shadow: inset 0 0 0 1px rgba(0,0,0,.2); }
    .crcaret { color: var(--muted); font-size: .8rem; transition: transform .18s; }
    .crow2.open .crcaret { transform: rotate(90deg); }
    .crow2.open .crname { color: var(--accent-dark); }
    .crow2.open { background: var(--ghost-bg); }
    .crow2 .chiprow { padding: 0 14px 14px; margin-top: 0; }
    .chipcustom { display: inline-flex; align-items: center; gap: 6px; font-size: .76rem; color: var(--muted);
                  margin-left: 4px; }
    .chiprow { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-top: 8px; }
    .chip { width: 30px; height: 30px; border-radius: 8px; border: 2px solid transparent; cursor: pointer;
            padding: 0; box-shadow: inset 0 0 0 1px rgba(0,0,0,.18); }
    .chip:hover { border-color: var(--accent); }
    .chip.on { border-color: var(--accent); }
    .emojirow { display: flex; gap: 8px; align-items: center; margin: 4px 0 8px; }
    .emojirow input { flex: 1; font-size: 1.15rem; }
    .emojirow .btn { width: auto; padding: 10px 14px; font-size: .9rem; }
    /* --- band textures --- */
    .bantpl { display: flex; gap: 8px; flex-wrap: wrap; margin: 4px 0 2px; }
    .bantpl .bt { width: 72px; height: 32px; border-radius: 8px; border: 2px solid transparent; cursor: pointer;
                  position: relative; overflow: hidden; background-size: cover; background-position: center;
                  box-shadow: inset 0 0 0 1px rgba(0,0,0,.06); }
    .bantpl .bt:hover { border-color: var(--accent); }
    .bantpl .bt.sel { border-color: var(--accent); }
    .bantpl .bt span { position: absolute; inset: auto 0 2px 0; text-align: center; font-size: .58rem;
                       color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,.6); font-weight: 700; }
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

export const DESIGN_PANEL_JS = /* js */ `
    /**
     * The card designer, shared VERBATIM by the owner dashboard and the admin
     * console. Parity between the two is guaranteed by them being the same code
     * rather than by two implementations agreeing — the console used to carry a
     * poorer copy (three colours, one band, ten fixed icons) that drifted from
     * this one the moment either changed.
     *
     * env is everything the panel reaches outside itself, so it can edit a
     * merchant's real card or an unattached saved design without knowing which:
     *
     *   api(path, opts)    the calling page's fetch wrapper, already prefixed
     *   path(suffix)       "/card/<id>" here, "/design/<id>" in the console
     *   artUrl(kind, v)    where the stored logo / band PNG is served from
     *   customersPath      the live-customer count, or null when there is no
     *                      card to count — a design has no customers yet
     *   rulesNote          HTML above the rules block, or ""
     *   onRulesSaved()     the caller's own follow-up
     *   toast/modal/info   shared with MODAL_JS
     */
    function designPanel(c, env) {
      const div = document.createElement("div");
      const api = env.api, toast = env.toast, modal = env.modal, info = env.info;
      const P = (suffix) => env.path(suffix || "");
      const bust = (v) => v ? "?v=" + v : "";
      const logoSrc = env.artUrl("logo", c.logoVersion);
      div.innerHTML = \`
        <label class="sec first" style="display:block">Preview</label>
        <div class="pv" data-pv>
          <div class="pv-top">
            <img class="pv-logo" data-pv-logo src="\${logoSrc}" alt="" style="\${c.logoVersion ? "" : "display:none"}">
            <span class="pv-name" data-pv-name></span>
            <div class="pv-hdr"><div class="pv-progress" data-pv-progress></div></div>
          </div>
          <div class="pv-banner" data-pv-banner></div>
          <div class="pv-dots" data-pv-dots></div>
          <div class="pv-row2">
            <div><div class="pv-lbl">REWARD</div><div class="pv-reward" data-pv-reward></div></div>
            <div><div class="pv-lbl">PROGRESS</div><div class="pv-reward" data-pv-tally></div></div>
          </div>
          <div class="pv-qr">QR</div>
          <div class="pv-note">Code ABC123 · updates by itself</div>
        </div>

        <!-- Design sits directly under the preview it changes, folded away. It is
             one block: the logo belongs with the colours it feeds, not pulled out
             on its own above them. -->
        <details class="fold" style="margin-top:12px" \${env.designOpen ? "open" : ""}>
        <summary>Design</summary>

        <label style="margin-top:6px">Logo\${info("It goes on the card, the sign-up page and your printed poster — and we read your colours out of it. Any shape; we do not crop it.")}</label>
        <div class="logorow">
          <label class="btn btn-ghost" style="margin:0">Upload logo<input data-logo type="file" accept="image/*"></label>
          <button class="btn btn-ghost" data-a="rmlogo" style="\${c.logoVersion ? "" : "display:none"}">Remove logo</button>
        </div>
        <div class="swatches" data-swatches style="display:none"></div>

        <label style="margin-top:14px">Colours\${info("Tap a part of the card, then tap a colour for it. The band is the strip across the middle that the stamps sit on; Stamps is what an earned stamp fills in with.")}</label>
        <div class="crlist" data-roles></div>
        <!-- The five native pickers are the source of truth every other function
             reads through f("bg"), f("bandColor") and so on, so they must exist
             from the start. They are PARKED here and MOVED into whichever row is
             open, rather than hidden and clicked from a proxy: calling .click()
             on a display:none colour input does not reliably open the OS picker,
             so the owner has to be tapping the real thing. -->
        <div class="colorpark" data-park>
          <input data-f="bg" type="color" value="\${c.bg}">
          <input data-f="fg" type="color" value="\${c.fg}">
          <input data-f="label" type="color" value="\${c.label}">
          <input data-f="accent" type="color" value="\${c.accent}">
          <input data-f="bandColor" type="color" value="\${c.bandColor}">
        </div>

        <label style="margin-top:14px">Band\${info("The pattern behind the stamps. They are all kept deliberately soft — the stamps are drawn on top, and a busy band makes them hard to read.")}</label>
        <div class="bantpl" data-bandtex></div>

        <label style="margin-top:14px">Stamps\${info("Plain dots, any emoji you paste in, or your own shape. Whatever you pick is drawn in your Stamps colour.")}</label>
        <div class="emojirow">
          <input data-emoji maxlength="8" placeholder="Paste any emoji" value="\${(c.stampStyle && c.stampStyle !== "dot" && c.stampStyle !== "custom") ? c.stampStyle : ""}">
          <button class="btn btn-ghost" data-a="useemoji">Use this</button>
        </div>
        <div class="logorow" style="margin-top:8px">
          <label class="btn btn-ghost" style="margin:0">Upload your own stamp<input data-stampimg type="file" accept="image/png,image/svg+xml"></label>
          <!-- Always visible, not only for an uploaded stamp. With the preset
               tiles gone this is the only way back to plain dots, and a control
               that appears once you no longer need it is no control at all. -->
          <button class="btn btn-ghost" data-a="rmstamp">Plain dots</button>
          \${info("One shape on a see-through background (PNG or SVG), not a photo. Its own colours are ignored — it gets filled with your stamp colour.")}
        </div>
        <p class="err" data-stamperr style="display:none"></p>

        <button class="btn btn-dark" style="margin-top:14px" data-a="savedesign">Save design</button>
        </details>

        <!-- No section headers here. Each .sec costs ~50px of rule and margin,
             and two of them plus a full-width spend row were most of what stood
             between the preview and the controls. What a change DOES now lives
             in the Save popup, which is the moment it matters, rather than as
             grey text nobody reads on the way past. -->
        \${env.rulesNote}
        <label style="margin-top:16px">Shop name\${info("The name customers see on the card.")}</label>
        <input data-f="shopName" value="\${(c.shopName || "").replace(/"/g, "&quot;")}">

        <!-- The card's TERMS. Hidden rather than dropped when env.showDetails is
             false: renderPreview and drawStampStrip read stampsTarget and reward
             to draw anything at all, so removing these inputs would leave the
             designer unable to render the card it is designing. Hidden, they are
             seeded from the card and never editable, so a save can only write
             them back unchanged. -->
        <div \${env.showDetails ? "" : "hidden"}>
        <label style="margin-top:14px">Reward</label><input data-f="reward" value="\${c.reward}">
        <div class="row2 row3">
          <div><label>Stamps to reward</label><input data-f="stampsTarget" type="number" min="1" max="20" value="\${c.stampsTarget}"></div>
          <div><label>Free stamps\${info("Stamps a new card starts with — and where a card restarts after a reward, so a regular is never worse off than a first-timer.")}</label><input data-f="stampsStart" type="number" min="0" max="19" value="\${c.stampsStart}"></div>
          <div><label>Avg spend (RM)\${info("What a customer usually spends per visit. Turns stamps into a money figure on Customers. Optional — leave at 0 to hide it.")}</label><input data-f="averageSpend" type="number" min="0" step="0.10" value="\${c.averageSpend}"></div>
        </div>

        <label style="margin-top:16px">Sign-up page message\${info("The line customers read after scanning your QR, before they add the card. It also headlines your printed poster. Leave blank and we write one from your reward.")}</label>
        <input data-f="signupMessage" maxlength="120" value="\${(c.signupMessage || "").replace(/"/g, "&quot;")}" placeholder="Collect \${c.stampsTarget} stamps, get a \${(c.reward || "").toLowerCase()}.">
        </div>

        <button class="btn btn-dark" style="margin-top:14px" data-a="saverules">\${env.rulesSaveLabel}</button>\`;

      const f = (k) => div.querySelector('[data-f=' + k + ']');
      const q = (s) => div.querySelector(s);

      // ---- Rich stamp grid engine (declared before renderPreview, which uses it) ----
      // Big stamps that fill in (like a real punch card), rendered in the browser
      // and stored server-side. Apple uses them as the strip image, Google as the
      // hero image. Emoji glyphs bake in this device's emoji look.
      // Declared up here, not beside the texture picker: drawStampStrip reads
      // them and renderPreview calls it during setup, so declaring these further
      // down would leave them in the dead zone and throw.
      let bandTexture = c.bandTexture || "gradient";
      /** The band at any size, from whatever the colour picker currently says. */
      function bandPng(style, w, h) {
        const a = f("bandColor").value;
        return drawBanner(style, a, shade(a, 0.35), w, h);
      }
      let stampStyle = c.stampStyle || "";  // '' = plain dots, 'custom' = uploaded
      let customStampUrl = null;             // dataURL of an uploaded stamp icon
      const stampImg = new Image();          // holds that uploaded icon for drawing

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
      const bannerReadyPromise = loadBanner(
        c.bannerVersion ? env.artUrl("banner", c.bannerVersion) : "",
      );

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
       * One strip image for one stamp count. 750x246 is the @2x storeCard strip
       * (375x123pt); the grid is centred with a 40px clear margin all round, and
       * an odd target leaves the last row one short, centred.
       *
       * @2x rather than @3x on purpose: once a banner photo is composited in,
       * an @3x strip weighs ~414KB and a full set of 21 comes to 8MB, which
       * overruns both the upload cap and the request body. @2x halves the
       * dimensions for ~190KB each, and the strip is imagery with no fine text,
       * so an @3x phone upscaling it is not noticeable.
       * Earned stamps take the accent colour; unearned are the same shape at 25%.
       */
      function drawStampStrip(filled, target, icon) {
        const W = 750, H = 246, M = 40;
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
        const bandHex = f("bandColor").value;
        paintBand(x, bandTexture, bandHex, shade(bandHex, 0.35), W, H);
        const accent = f("accent").value;
        const cols = stampGridCols(target), rows = target > 1 ? 2 : 1;
        const cw = (W - M * 2) / cols, ch = (H - M * 2) / rows;
        const r = Math.min(cw, ch) * 0.34;
        const perRow = Math.ceil(target / rows);
        const customReady = customStampUrl && stampImg.complete && stampImg.naturalWidth > 0;
        const shaped = icon === "custom" && customReady
          ? { on: shapeStamp(stampImg, Math.ceil(r * 2), accent), size: Math.ceil(r * 2) }
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

      function renderPreview() {
        const target = Math.max(1, Math.min(20, Number(f("stampsTarget").value) || 10));
        const start = Math.max(0, Math.min(target, Number(f("stampsStart").value) || 0));
        const pv = q("[data-pv]");
        pv.style.background = f("bg").value;
        pv.style.color = f("fg").value;
        q("[data-pv-name]").textContent = f("shopName").value || "Your card";
        q("[data-pv-progress]").textContent = headerValue(start, target);
        q("[data-pv-tally]").textContent = start + "/" + target;
        q("[data-pv-reward]").textContent = f("reward").value || "Your reward";
        for (const el of div.querySelectorAll(".pv-lbl, .pv-note")) el.style.color = f("label").value;
        // When a rich stamp style is active, show the rendered grid in the strip
        // (it shares the slot with the banner — stamps win, matching the card).
        // Set both states explicitly every time. This used to only ever ADD the
        // class, so which image you saw depended on whether the banner or the
        // strip painted last — the preview could show a banner the pass didn't have.
        const dots = q("[data-pv-dots]"), banner = q("[data-pv-banner]");
        if (stampStyle) {
          dots.style.display = "none";
          banner.style.backgroundImage = "url(" + drawStampStrip(start, target, stampStyle) + ")";
          banner.classList.add("on", "strip");
        } else {
          dots.style.display = "";
          banner.classList.remove("strip");
          banner.classList.toggle("on", Boolean(c.bannerVersion));
          dots.textContent = "●".repeat(start) + "○".repeat(target - start);
        }
      }
      for (const el of div.querySelectorAll("[data-f]")) el.addEventListener("input", renderPreview);
      renderPreview();

      // Self-heal: the stamp grid now lives only in the strip image, so a card
      // with no rendered strips would show a customer no stamps at all. Cards
      // made before that was true have none, so render the default set once, the
      // first time their owner opens this panel. Silent — nothing was asked for.
      if (!c.stampsVersion) {
        applyStamps(stampStyle || "dot", true).then(() => { c.stampsVersion = 1; })
          .catch(() => {}); // a failure just means we try again next visit
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
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext.bind(canvas);
            if (fit === "keep") {
              // Keep the image's OWN shape and only cap the size. The logo needs
              // this: padding a square mark into a wide frame made the wallets
              // scale that whole frame down into their logo slot, leaving the
              // mark itself a fraction of the space it should have had. No
              // different upload could fix it, which is what made it feel like
              // there was a spec nobody had been told.
              const s = Math.min(w / img.width, h / img.height, 1);
              const dw = Math.max(1, Math.round(img.width * s));
              const dh = Math.max(1, Math.round(img.height * s));
              canvas.width = dw; canvas.height = dh;
              ctx("2d").drawImage(img, 0, 0, dw, dh);
            } else {
              canvas.width = w; canvas.height = h;
              const s = fit === "contain"
                ? Math.min(w / img.width, h / img.height)
                : Math.max(w / img.width, h / img.height);
              ctx("2d").drawImage(img, (w - img.width * s) / 2, (h - img.height * s) / 2, img.width * s, img.height * s);
            }
            const dataUrl = canvas.toDataURL("image/png");
            if (!kind) { onDone(dataUrl); return; } // caller saves (e.g. banner via saveBanner)
            const { body } = await api(P("/" + kind), {
              method: "POST", body: JSON.stringify({ png: dataUrl.split(",")[1] }),
            });
            if (body.ok) { onDone(dataUrl); toast((kind === "logo" ? "Logo" : "Banner") + " saved ✓"); }
            else toast(body.error || "Upload failed");
          };
          img.onerror = () => toast("Couldn't read that image");
          img.src = URL.createObjectURL(file);
        };
      }
      // Capped at Apple's 160×50pt logo band at @3x, but NOT padded to it: the
      // image keeps its own shape, so a square mark stays square and fills the
      // wallet's logo slot, and a wide wordmark stays wide. Whichever they have
      // is the right shape to upload.
      wireUpload("[data-logo]", "logo", 480, 150, (url) => {
        const im = q("[data-pv-logo]");
        im.src = url; im.style.display = ""; c.logoVersion = 1;
        q("[data-a=rmlogo]").style.display = "";
        readPalette(url); // the logo is where the colours come from
      }, "keep");
      // Removing the logo hides it here too, because the pass drops the image
      // entirely with no upload and shows the shop name alone — the preview has
      // to agree, or the owner is designing against something they won't get.
      q("[data-a=rmlogo]").onclick = async () => {
        const { body } = await api(P("/logo"), { method: "DELETE" });
        if (!body.ok) return toast(body.error || "Couldn't remove logo");
        c.logoVersion = 0;
        q("[data-pv-logo]").style.display = "none";
        q("[data-a=rmlogo]").style.display = "none";
        toast("Logo removed");
      };

      // ---- Colours out of the logo ----
      // Read on this device: the palette is pulled from the logo the owner is
      // already uploading, so there is no second image to explain. Nothing is
      // applied until they tap the button — an upload that silently repainted
      // their card would be worse than no feature at all.
      let found = null;
      function readPalette(dataUrl) {
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
          catch (e) { return; } // tainted canvas — nothing to offer
          found = paletteFrom(data);
          showSwatches();
          drawRoles();
        };
        im.src = dataUrl;
      }
      function showSwatches() {
        const host = q("[data-swatches]");
        host.style.display = "";
        if (!found) {
          host.innerHTML = '<p class="muted" style="margin:0">No clear colours in that logo — set the colours below yourself.</p>';
          return;
        }
        const chip = (hex, name) => '<span class="sw" title="' + name + '" style="background:' + hex + '"></span>';
        host.innerHTML =
          '<div class="swrow">' + chip(found.bg, "Card") + chip(found.band, "Band") +
          chip(found.accent, "Stamps") + chip(found.label, "Labels") + chip(found.fg, "Text") +
          '<button class="btn btn-ghost" data-a="usepal">Use these colours</button></div>' +
          '<p class="muted" style="margin:6px 0 0">Text is chosen for readability rather than taken from the logo, so it can always be read on the card.</p>';
        host.querySelector("[data-a=usepal]").onclick = async () => {
          f("bg").value = found.bg; f("fg").value = found.fg;
          f("label").value = found.label; f("accent").value = found.accent;
          f("bandColor").value = found.band;
          renderPreview(); drawTextureRow(); drawRoles();
          await save({
            bg: found.bg, fg: found.fg, label: found.label,
            accent: found.accent, bandColor: found.band,
          }, "Colours");
          await saveBanner(bandPng(bandTexture, 750, 246));
        };
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
      // Nothing open to begin with: the list reads as five named parts of the
      // card, which is the question an owner actually has ("what colour is the
      // band?"), rather than a palette they have to decode.
      let activeRole = null;
      const rolesHost = q("[data-roles]");
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
        renderPreview(); drawTextureRow(); refreshSwatches();
      }
      /** Header swatches and the selected chip, updated in place. */
      function refreshSwatches() {
        rolesHost.querySelectorAll("[data-role]").forEach((row) => {
          const k = row.dataset.role;
          row.querySelector(".crsw").style.background = f(k).value;
          row.querySelectorAll(".chip").forEach((ch) => {
            ch.classList.toggle("on", ch.dataset.hex === f(k).value.toLowerCase());
          });
        });
      }
      // One row per part of the card, each named and showing its own colour;
      // tapping one opens its palette underneath. This replaced a chip row and a
      // row of five colour squares that did the same job in two places — which
      // is what made it impossible to tell which one you were meant to use.
      const park = q("[data-park]");
      function drawRoles() {
        // Put every native picker back in its park BEFORE wiping the list. The
        // open row holds the real input, and innerHTML = "" would destroy the
        // one element the rest of this panel reads its colours from.
        for (const r of ROLES) park.appendChild(f(r.k));
        rolesHost.innerHTML = "";
        for (const r of ROLES) {
          const open = r.k === activeRole;
          const row = document.createElement("div");
          row.className = "crow2" + (open ? " open" : "");
          row.dataset.role = r.k;

          const head = document.createElement("button");
          head.type = "button";
          head.className = "crhead";
          head.setAttribute("aria-expanded", open ? "true" : "false");
          head.innerHTML = '<span class="crname"></span>' +
            '<span class="crsw" style="background:' + f(r.k).value + '"></span>' +
            '<span class="crcaret">▸</span>';
          head.querySelector(".crname").textContent = r.name;
          head.onclick = () => { activeRole = open ? null : r.k; drawRoles(); };
          row.appendChild(head);

          if (open) {
            const chips = document.createElement("div"); chips.className = "chiprow";
            for (const hex of paletteChips()) {
              const ch = document.createElement("button");
              ch.type = "button";
              ch.className = "chip" + (hex === f(r.k).value.toLowerCase() ? " on" : "");
              ch.style.background = hex; ch.title = hex; ch.dataset.hex = hex;
              ch.onclick = () => applyRole(r.k, hex);
              chips.appendChild(ch);
            }
            // The real colour input, moved in — for a shade in none of the above.
            const custom = document.createElement("span");
            custom.className = "chipcustom";
            custom.appendChild(f(r.k));
            custom.appendChild(document.createTextNode("Custom…"));
            chips.appendChild(custom);
            row.appendChild(chips);
          }
          rolesHost.appendChild(row);
        }
      }
      // The OS picker writes straight through. No rebuild here on purpose —
      // this fires on every frame of a drag, and rebuilding would move the very
      // input the picker is attached to.
      for (const r of ROLES) {
        f(r.k).oninput = () => applyRole(r.k, f(r.k).value.toLowerCase());
      }
      drawRoles();

      // The band is stored exactly where the uploaded banner photo used to be, so
      // nothing downstream changes: Apple composites it behind the stamps, Google
      // uses it as the hero image. Photos are gone — this is always generated.
      async function saveBanner(dataUrl) {
        const { body } = await api(P("/banner"), { method: "POST", body: JSON.stringify({ png: dataUrl.split(",")[1] }) });
        if (!body.ok) return toast(body.error || "Band failed");
        // Re-bake the strips: the band is the backdrop INSIDE each strip PNG,
        // so a new band that isn't re-rendered would never reach the pass.
        await loadBanner(dataUrl);
        await applyStamps(stampStyle || "dot", true);
        toast("Band saved ✓");
      }

      function shade(hex, p) { // p in -1..1 → darken/lighten
        const n = parseInt((hex || "#3b2016").slice(1), 16), t = p < 0 ? 0 : 255, a = Math.abs(p);
        let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
        r = Math.round((t - r) * a) + r; g = Math.round((t - g) * a) + g; b = Math.round((t - b) * a) + b;
        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
      }
      /** The band as a data URL, for the texture swatches and the stored PNG. */
      function drawBanner(style, c1, c2, w, h) {
        const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
        paintBand(cv.getContext("2d"), style, c1, c2, w, h);
        return cv.toDataURL("image/png");
      }
      /**
       * The same band painted straight onto a context. drawStampStrip needs it
       * synchronously — going via an Image and a data URL would not have decoded
       * by the time the stamps are drawn on top, so the band would simply be
       * missing from the strip.
       */
      function paintBand(x, style, c1, c2, w, h) {
        // Every texture is deliberately soft. The stamps are drawn ON TOP of
        // this, so a band that competes with them is the one way the picker can
        // make a card worse — hence the low alphas throughout.
        if (style === "flat") {
          x.fillStyle = c1; x.fillRect(0, 0, w, h);
        } else if (style === "stripes") {
          x.fillStyle = c1; x.fillRect(0, 0, w, h);
          x.fillStyle = c2; x.globalAlpha = .22;
          const sw = w / 14;
          for (let i = -h; i < w; i += sw * 2) {
            x.beginPath(); x.moveTo(i, h); x.lineTo(i + h, 0);
            x.lineTo(i + h + sw, 0); x.lineTo(i + sw, h); x.closePath(); x.fill();
          }
          x.globalAlpha = 1;
        } else if (style === "dots") {
          x.fillStyle = c1; x.fillRect(0, 0, w, h);
          x.fillStyle = c2; x.globalAlpha = .26;
          const step = w / 16, r = step * 0.17;
          for (let row = 0, y = step / 2; y < h; y += step * .8, row++) {
            for (let px = (row % 2 ? step / 2 : 0) + step / 2; px < w; px += step) {
              x.beginPath(); x.arc(px, y, r, 0, Math.PI * 2); x.fill();
            }
          }
          x.globalAlpha = 1;
        } else if (style === "chevron") {
          x.fillStyle = c1; x.fillRect(0, 0, w, h);
          x.strokeStyle = c2; x.globalAlpha = .24; x.lineWidth = Math.max(2, h / 26);
          const step = h / 3;
          for (let y = -h; y < h * 2; y += step) {
            x.beginPath();
            for (let px = 0; px <= w; px += w / 8) {
              const up = Math.round(px / (w / 8)) % 2 === 0;
              x.lineTo(px, y + (up ? 0 : step * .6));
            }
            x.stroke();
          }
          x.globalAlpha = 1; x.lineWidth = 1;
        } else if (style === "grain") {
          x.fillStyle = c1; x.fillRect(0, 0, w, h);
          // Deterministic, not Math.random: the band is re-rendered on every
          // save, and a different speckle each time would be a pointless new
          // image for the wallets to fetch.
          x.fillStyle = c2;
          for (let i = 0; i < 2600; i++) {
            const s = Math.sin(i * 12.9898) * 43758.5453;
            const t = Math.sin(i * 78.233) * 43758.5453;
            x.globalAlpha = .05 + ((s - Math.floor(s)) * .12);
            x.fillRect((s - Math.floor(s)) * w, (t - Math.floor(t)) * h, 2, 2);
          }
          x.globalAlpha = 1;
        } else if (style === "rays") {
          x.fillStyle = c1; x.fillRect(0, 0, w, h);
          x.fillStyle = c2; x.globalAlpha = .16;
          for (let i = 0; i < 12; i += 2) {
            const a = (i / 12) * Math.PI * 2;
            x.beginPath(); x.moveTo(w / 2, h / 2);
            x.arc(w / 2, h / 2, w, a, a + Math.PI / 12); x.closePath(); x.fill();
          }
          x.globalAlpha = 1;
        } else if (style === "diagonal") {
          x.fillStyle = c1; x.fillRect(0, 0, w, h);
          x.fillStyle = c2; x.beginPath(); x.moveTo(0, h); x.lineTo(w, 0); x.lineTo(w, h); x.closePath(); x.fill();
        } else if (style === "glow") {
          x.fillStyle = c1; x.fillRect(0, 0, w, h);
          const g = x.createRadialGradient(w * .5, h * .5, 10, w * .5, h * .5, w * .6);
          g.addColorStop(0, c2); g.addColorStop(1, c1); x.fillStyle = g; x.fillRect(0, 0, w, h);
        } else if (style === "waves") {
          x.fillStyle = c1; x.fillRect(0, 0, w, h); x.fillStyle = c2;
          for (let k = 0; k < 3; k++) { x.globalAlpha = .18 + k * .12; x.beginPath(); x.moveTo(0, h * .4 + k * 34);
            for (let px = 0; px <= w; px += 8) x.lineTo(px, h * .4 + k * 34 + Math.sin(px / 90 + k) * 26);
            x.lineTo(w, h); x.lineTo(0, h); x.closePath(); x.fill(); } x.globalAlpha = 1;
        } else { // gradient
          const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, c1); g.addColorStop(1, c2);
          x.fillStyle = g; x.fillRect(0, 0, w, h);
        }
      }
      // ---- The band: the strip the stamps sit on, in its own colour ----
      // It is still stored as the banner PNG, so Google's hero image and Apple's
      // strip backdrop are unchanged — what went away is uploading a photo.
      // "flat" is one colour; the rest shade toward a lighter version of it.
      // Must stay in step with BAND_TEXTURES in src/cardView.ts. That allowlist
      // is what refuses an unknown one, so a texture the browser can draw but
      // the server rejects would silently save as flat.
      const TEXTURES = [
        { name: "Flat", style: "flat" },
        { name: "Gradient", style: "gradient" },
        { name: "Glow", style: "glow" },
        { name: "Diagonal", style: "diagonal" },
        { name: "Waves", style: "waves" },
        { name: "Stripes", style: "stripes" },
        { name: "Dots", style: "dots" },
        { name: "Chevron", style: "chevron" },
        { name: "Grain", style: "grain" },
        { name: "Rays", style: "rays" },
      ];
      const btpl = q("[data-bandtex]");
      function drawTextureRow() {
        btpl.innerHTML = "";
        for (const t of TEXTURES) {
          const bt = document.createElement("div");
          bt.className = "bt" + (t.style === bandTexture ? " sel" : "");
          bt.title = t.name;
          bt.style.backgroundImage = "url(" + bandPng(t.style, 144, 64) + ")";
          bt.innerHTML = "<span>" + t.name + "</span>";
          bt.onclick = async () => {
            bandTexture = t.style;
            drawTextureRow();
            await api(P(), { method: "POST", body: JSON.stringify({ bandTexture: t.style }) });
            await saveBanner(bandPng(t.style, 750, 246));
          };
          btpl.appendChild(bt);
        }
      }
      drawTextureRow();

      // Renders the full 0..target set and stores it (immediate, like banners).
      // The quiet flag is for the piggy-back call from save(), which toasts its own.
      async function applyStamps(style, quiet) {
        stampStyle = style;
        // The banner is baked into every strip, so it must be decoded first or
        // the whole set renders on a bare colour.
        await bannerReadyPromise;
        const target = Math.max(1, Math.min(20, Number(f("stampsTarget").value) || 10));
        // One set per target still in play, not just the current one. A pass keeps
        // the target it was issued with, so an owner going 8 → 6 still has
        // customers asking for an 8-slot grid — and before this they got a 404 and
        // lost their stamps picture entirely. Usually one set; two until everyone
        // on the old ruleset has earned their next reward.
        const targets = [...new Set([target, ...(c.targetsInUse || [])])].filter((t) => t >= 1 && t <= 20);
        const strips = [];
        for (const t of targets) {
          for (let n = 0; n <= t; n++) {
            strips.push({ target: t, filled: n, png: drawStampStrip(n, t, style).split(",")[1] });
          }
        }
        const { body } = await api(P("/stamps"), { method: "POST", body: JSON.stringify({ style, strips }) });
        if (!body.ok) return toast(body.error || "Couldn't save stamps");
        renderPreview();
        if (!quiet) toast("Stamp style saved ✓");
      }

      // The six preset tiles (Dot, Coffee, Star, Heart, Donut, Boba) are gone:
      // they were six ways to do what the emoji field does, and every card
      // starts on dots anyway. Three routes remain — dots, any emoji, your own
      // shape — and each is a different kind of answer rather than a shortcut.
      // Any emoji at all. The renderer already draws whatever glyph it is given,
      // so this only has to hand it one — and exactly one: firstGrapheme keeps
      // multi-code-point emoji (❤️, 🧑‍🍳) whole instead of slicing them in half.
      q("[data-a=useemoji]").onclick = () => {
        const one = firstGrapheme(q("[data-emoji]").value);
        q("[data-emoji]").value = one;
        applyStamps(one || "dot");
      };
      // Upload your own stamp icon → normalise to a small square PNG → apply.
      // Rejected unless it has transparency: the shape is taken from the alpha
      // channel, so a fully opaque image would stamp a solid square.
      wireUpload("[data-stampimg]", null, 160, 160, (dataUrl) => {
        const err = q("[data-stamperr]");
        const probe = new Image();
        probe.onload = () => {
          const cv = document.createElement("canvas");
          cv.width = probe.naturalWidth; cv.height = probe.naturalHeight;
          const px = cv.getContext("2d");
          px.drawImage(probe, 0, 0);
          const data = px.getImageData(0, 0, cv.width, cv.height).data;
          let clear = 0;
          for (let i = 3; i < data.length; i += 4) if (data[i] < 24) clear++;
          if (clear < data.length / 4 * 0.02) {
            err.textContent = "That image has no see-through background, so it would stamp a solid block. Save it as a PNG or SVG with transparency, or pick a built-in stamp above.";
            err.style.display = "";
            return;
          }
          err.style.display = "none";
          customStampUrl = dataUrl; stampImg.src = dataUrl;
          stampImg.onload = () => applyStamps("custom");
        };
        probe.src = dataUrl;
      });
      // Back to plain dots — which is still a rendered strip, not the absence of
      // one: the grid image is the only place stamps are drawn now.
      q("[data-a=rmstamp]").onclick = async () => {
        customStampUrl = "";
        q("[data-emoji]").value = "";
        await applyStamps("dot", true);
        toast("Back to plain dots");
      };

      // Two saves, disjoint field sets. Both re-render the stamp strips, because
      // a colour change (design) and a target change (rules) each alter them.
      // That re-render IS the pre-generation step: one PNG per stamp count, so a
      // customer's stamp only ever swaps which stored image the pass points at.
      async function save(fields, label) {
        const { body } = await api(P(), { method: "POST", body: JSON.stringify(fields) });
        if (!body.ok) return toast(body.error || "Save failed");
        Object.assign(c, fields);
        // Always regenerate, even on plain dots: the strip image is now the only
        // place stamps are drawn, so a card with no strips would show nothing.
        await applyStamps(stampStyle || "dot", true);
        toast(label + " saved ✓");
      }

      // How many people this actually reaches. Read once when the panel opens, so
      // both confirmations can name a real number rather than talk in the
      // abstract about "your customers".
      // A saved design has none: it is not in anybody's wallet yet, so the
      // confirmations below drop to their "no customers" wording rather than
      // inventing a number.
      let liveCustomers = 0;
      if (env.customersPath) (async () => {
        const { body } = await api(env.customersPath);
        liveCustomers = (body.counts || {}).active || 0;
      })();
      const them = () => liveCustomers === 1 ? "customer" : "customers";

      // The sentences that used to sit as grey subtext under these two buttons
      // are now in front of the button. Same words, read this time.
      q("[data-a=savedesign]").onclick = async () => {
        const ok = await modal(
          "Update the card everywhere?",
          liveCustomers
            ? "<p>The new look reaches all <strong>" + liveCustomers + "</strong> " + them() +
              " who already hold your card, not just new ones. Their stamps and reward are untouched.</p>"
            : "<p>This is how your card will look to everyone who takes one.</p>",
          "Save design",
        );
        if (!ok) return;
        // No shopName here. The field sits above the fold now, next to Save
        // rules — leaving its save on a button inside a collapsed section is how
        // you get an owner who renamed their shop and lost it.
        await save({
          bg: f("bg").value, fg: f("fg").value, label: f("label").value, accent: f("accent").value,
          bandColor: f("bandColor").value,
        }, "Design");
        // The band colour is baked into a stored PNG, so a colour change has to
        // re-render it — saving the field alone would leave the old band on the
        // card and the new one only in the picker.
        await saveBanner(bandPng(bandTexture, 750, 246));
      };

      q("[data-a=saverules]").onclick = async () => {
        // The rename is called out separately, because it is the one change here
        // that reaches a card already in someone's wallet.
        const renamed = f("shopName").value.trim() !== (c.shopName || "").trim();
        const ok = await modal(
          env.showDetails ? "Save these changes?" : "Save the shop name?",
          // With the terms hidden the only thing this button can change is the
          // name, so promising anything about rules would be a lie.
          (!env.showDetails
            ? "<p>Only the name changes. The reward and the stamp count stay exactly as they are.</p>"
            : liveCustomers
            ? "<p>New cards use these rules straight away. Your <strong>" + liveCustomers + "</strong> existing " +
              them() + " keep the reward and stamp count they were promised, and move onto the new rules " +
              "the next time they earn a reward.</p>"
            : "<p>These rules apply to every card from here on.</p>") +
          (renamed && liveCustomers
            ? '<p style="margin-top:8px">The new shop name <strong>does</strong> reach cards already in a wallet — ' +
              "it is the only thing here that does. Your old sign-up links keep working.</p>"
            : ""),
          "Save",
        );
        if (!ok) return;
        await save({
          shopName: f("shopName").value,
          // The card's own name follows the shop's. It used to be a second field
          // nobody could tell apart from the first, and the only place it shows
          // is the programme name on an Android card — which is the shop.
          name: f("shopName").value,
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
 */
function page(title: string, body: string, extraCss = "", script = ""): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${baseCss}${extraCss}</style>
</head>
<body>${body}${script ? `<script>${script}</script>` : ""}</body>
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
export function signupLine(card: Pick<CardRow, "signup_message" | "stamps_target" | "reward">): string {
  return card.signup_message
    ? esc(card.signup_message)
    : `Collect ${card.stamps_target} stamps, get a ${esc(card.reward.toLowerCase())}.`;
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
    .lhero img { width: 76px; height: 76px; object-fit: contain; margin-bottom: 10px; }
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
            ? `<img src="${base}/art/logo.png?v=${logoVersion}" alt="">`
            : `<div class="emoji">☕️</div>`
        }
        <h1>${esc(business)}</h1>
        <p class="sub">${signupLine(card)}</p>
      </div>
      <p class="sub">Your card lives in your phone’s wallet — no app needed.</p>
      ${
        buttons
          ? `<div id="wallets">${buttons}</div>
             <p class="muted" style="margin-top:14px">You start with a few free stamps as a welcome gift 🎁</p>
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
export function shopNotOpenPage(business: string, logoVersion = 0, cardId = ""): string {
  const logo = logoVersion && cardId
    ? `<img src="${cardId === "default" ? "" : `/c/${cardId}`}/art/logo.png?v=${logoVersion}" alt=""
           style="width:72px;height:72px;border-radius:18px;object-fit:contain;margin:0 auto 14px;display:block">`
    : "";
  return page(
    `${business} — coming soon`,
    `<div class="card" style="text-align:center">
      ${logo}
      <h1>${esc(business)}</h1>
      <p class="sub">Their loyalty card isn’t open yet. Check back soon.</p>
    </div>`,
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
    .cl-logo { width: 76px; height: 76px; border-radius: 18px; object-fit: contain;
               margin: 0 auto 12px; display: block; box-shadow: var(--shadow); }
    .cl-name { font-family: var(--display); font-size: 1.7rem; line-height: 1.1;
               letter-spacing: -.02em; margin: 0; }
    .cl-reward { color: var(--muted); margin: 8px 0 0; }
    .cl-done { text-align: center; }
    .cl-pin { font-family: ui-monospace, Menlo, monospace; font-size: 2rem; font-weight: 700;
              letter-spacing: .12em; background: var(--ghost-bg); border-radius: 12px;
              padding: 14px; margin: 12px 0 4px; }
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
      // The PIN can be read exactly once. It is shown on its own screen rather
      // than toasted away, because the counter cannot work without it and there
      // is no way to look it up later — only to replace it.
      $("#app").innerHTML =
        '<div class="cl-done"><h1>You’re in ✅</h1>' +
        '<p class="sub">Your staff PIN — write it down now. It can’t be shown again, only replaced.</p>' +
        '<div class="cl-pin">' + body.staffPin + "</div>" +
        '<p class="muted" style="font-size:.82rem">Staff type this once on the stamper, on each phone.</p>' +
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
export function marketingPage(): string {
  const css = /* css */ `
    :root {
      --paper: var(--bg); --soft: var(--surface);
      --ink-2: var(--muted); --hair: var(--line);
      --neon: var(--accent); --neon-2: var(--accent-2);
      --r: 28px; --r-sm: 14px;
    }
    html { scroll-behavior: smooth; }
    @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
    body { display: block; padding: 0; align-items: stretch;
           background: var(--paper); color: var(--ink); font-family: var(--body); }
    ::selection { background: var(--neon); color: var(--ink); }
    img { max-width: 100%; display: block; }
    .shell { max-width: 1180px; margin: 0 auto; padding: 0 clamp(18px, 4vw, 40px); }
    /* One family, two weights. The whole look rests on the display weight being
       genuinely heavy rather than merely bold. */
    h1, h2, h3, h4, .dsp { font-family: var(--display); font-weight: 800;
                           letter-spacing: -.03em; line-height: 1.02; text-wrap: balance; }
    a { color: inherit; }
    /* Ink on the white page, neon on the black panels. A neon ring alone was
       invisible against the neon buttons it most needed to mark. */
    :where(a, button):focus-visible { outline: 3px solid var(--ink);
                                      outline-offset: 3px; border-radius: 6px; }
    :where(.panel.dark, .car, .close, .herobox) :where(a, button):focus-visible {
      outline-color: var(--neon); }

    /* ---------------------------------------------------------------- nav -- */
    .nav { position: sticky; top: 0; z-index: 70; background: rgba(255,255,255,.9);
           backdrop-filter: saturate(1.4) blur(14px); border-bottom: 1px solid var(--hair); }
    .navin { max-width: 1180px; margin: 0 auto; padding: 13px clamp(18px, 4vw, 40px);
             display: flex; align-items: center; gap: 20px; }
    .brand { font-family: var(--display); font-weight: 800; font-size: 1.16rem;
             letter-spacing: -.035em; text-decoration: none; }
    .navlinks { display: none; margin-left: auto; gap: 26px; }
    @media (min-width: 760px) { .navlinks { display: flex; } }
    .navlinks a { text-decoration: none; font-size: .92rem; font-weight: 500; color: var(--ink-2); }
    .navlinks a:hover { color: var(--ink); }
    .nav .pbtn { margin-left: auto; }
    @media (min-width: 760px) { .nav .pbtn { margin-left: 0; } }

    /* -------------------------------------------------------------- buttons -- */
    .pbtn { display: inline-flex; align-items: center; justify-content: center; gap: 8px;
           font-family: var(--body); font-weight: 700; font-size: .95rem; text-decoration: none;
           padding: 13px 22px; border-radius: 999px; border: 2px solid transparent;
           white-space: nowrap; cursor: pointer; transition: background .15s ease, color .15s ease; }
    .pbtn-neon { background: var(--neon); color: var(--ink); }
    .pbtn-neon:hover { background: var(--neon-2); }
    .pbtn-line { background: transparent; color: var(--ink); border-color: var(--ink); }
    .pbtn-line:hover { background: var(--ink); color: var(--paper); }
    .pbtn-pale { background: var(--paper); color: var(--ink); }
    .pbtn-pale:hover { background: var(--soft); }
    @media (prefers-reduced-motion: reduce) { .pbtn { transition: none; } }

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

    /* ---------------------------------------------------------------- hero -- */
    .hero { display: grid; gap: clamp(30px, 4vw, 54px); align-items: center;
            padding: clamp(40px, 6vw, 86px) 0 clamp(46px, 6vw, 92px); }
    @media (min-width: 940px) { .hero { grid-template-columns: 1.04fr .96fr; } }
    .hero h1 { font-size: clamp(2.6rem, 6.5vw, 4.6rem); margin: 20px 0 0; }
    .hero .sub { margin: 20px 0 0; max-width: 40ch; color: var(--ink-2);
                 font-size: clamp(1.02rem, 2vw, 1.14rem); line-height: 1.55; }
    .herobtns { display: flex; flex-wrap: wrap; gap: 11px; margin-top: 12px; }
    .trylbl { margin: 30px 0 0; font-size: .78rem; font-weight: 700; letter-spacing: .1em;
              text-transform: uppercase; color: var(--ink-2); }
    .herobox { background: var(--slab); border-radius: var(--r); padding: clamp(28px, 4vw, 52px);
               display: grid; place-items: center; min-height: 340px; }

    /* ------------------------------------------------- the drawn stamp card -- */
    /* The product's own object, drawn rather than photographed: it is the one
       thing on the page that cannot be mistaken for stock. */
    .card { width: 100%; max-width: 340px; background: var(--paper); border: none;
            border-radius: 18px; padding: 20px;
            box-shadow: 0 24px 60px -24px rgba(0,0,0,.6); }
    .card .top { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .card .mark { width: 34px; height: 34px; border-radius: 9px; background: var(--ink);
                  color: var(--neon); display: grid; place-items: center;
                  font-family: var(--display); font-weight: 800; font-size: 1rem; }
    .card .shop { font-family: var(--display); font-weight: 800; font-size: 1.06rem;
                  letter-spacing: -.02em; }
    .card .meta { color: var(--ink-2); font-size: .76rem; font-weight: 500; }
    .card .rowlbl { display: flex; align-items: baseline; justify-content: space-between;
                    margin: 20px 0 9px; }
    .card .rowlbl span { color: var(--ink-2); font-size: .72rem; font-weight: 700;
                         letter-spacing: .09em; text-transform: uppercase; }
    .card .rowlbl b { font-family: var(--display); font-weight: 800; font-size: .96rem; }
    .dots { display: grid; grid-template-columns: repeat(5, 26px); gap: 8px; }
    .dots i { width: 26px; height: 26px; border-radius: 50%; background: var(--soft);
              border: 2px solid var(--hair); }
    .dots i.on { background: var(--neon); border-color: var(--neon); }
    .card .rw { margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--hair);
                display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .card .rw span { color: var(--ink-2); font-size: .78rem; font-weight: 600; }
    .card .rw b { font-family: var(--display); font-weight: 800; font-size: .92rem; }

    /* ------------------------------------------------------- two-up panels -- */
    .duo { display: grid; gap: 18px; }
    @media (min-width: 860px) { .duo { grid-template-columns: 1fr 1fr; } }
    .panel { border-radius: var(--r); padding: clamp(26px, 3.4vw, 42px); }
    .panel.pale { background: var(--soft); }
    .panel.dark { background: var(--slab); color: var(--on-slab); }
    .panel .who { font-size: .78rem; font-weight: 700; letter-spacing: .1em;
                  text-transform: uppercase; color: var(--ink-2); }
    .panel.dark .who { color: #97a08f; }
    .panel h3 { font-size: clamp(1.5rem, 2.6vw, 2rem); margin: 10px 0 26px; }
    /* The journey reads downwards, with the arrow doing the joining. No images
       here on purpose: the steps are the content. */
    .flow { list-style: none; margin: 0; padding: 0; }
    .flow li { display: flex; gap: 14px; align-items: flex-start; }
    .flow .n { flex: none; width: 30px; height: 30px; border-radius: 50%;
               background: var(--neon); color: var(--ink); display: grid; place-items: center;
               font-family: var(--display); font-weight: 800; font-size: .85rem; }
    .flow .tx { padding-top: 4px; font-size: 1rem; line-height: 1.45; font-weight: 500; }
    .panel.dark .flow .tx { color: #dfe4d9; }
    .flow .arw { height: 26px; margin: 4px 0 4px 14px; width: 2px; background: var(--hair);
                 position: relative; }
    .panel.dark .flow .arw { background: #2a2f28; }
    .flow .arw::after { content: ""; position: absolute; left: 50%; bottom: -1px;
                        width: 7px; height: 7px; transform: translateX(-50%) rotate(45deg);
                        border-right: 2px solid var(--hair); border-bottom: 2px solid var(--hair); }
    .panel.dark .flow .arw::after { border-color: #2a2f28; }

    /* ------------------------------------------------------------- marquee -- */
    .mq { overflow: hidden; padding: 6px 0 10px; mask-image: linear-gradient(90deg,
          transparent, #000 6%, #000 94%, transparent); }
    .mqtrack { display: flex; gap: 16px; width: max-content;
               animation: slide 46s linear infinite; }
    .mq:hover .mqtrack, .mq:focus-within .mqtrack { animation-play-state: paused; }
    @keyframes slide { from { transform: translateX(0); } to { transform: translateX(-50%); } }
    /* With motion turned off it becomes an ordinary scroller, not a still frame
       the visitor cannot get past. */
    @media (prefers-reduced-motion: reduce) {
      .mq { overflow-x: auto; mask-image: none; }
      .mqtrack { animation: none; }
    }
    .xc { flex: 0 0 auto; width: 250px; background: var(--paper); border: 2px solid var(--hair);
          border-radius: 20px; padding: 20px; }
    .xc .biz { font-family: var(--display); font-weight: 800; font-size: 1.1rem;
               letter-spacing: -.02em; }
    .xc .kind { color: var(--ink-2); font-size: .76rem; font-weight: 600; margin-top: 2px; }
    .xc .dots { margin: 16px 0 14px; }
    .xc dl { display: grid; grid-template-columns: auto 1fr; gap: 5px 12px; margin: 0;
             font-size: .82rem; }
    .xc dt { color: var(--ink-2); font-weight: 500; }
    .xc dd { margin: 0; text-align: right; font-weight: 700; }

    /* ------------------------------------------------------------ carousel -- */
    .car { background: var(--slab); color: var(--on-slab); border-radius: var(--r);
           overflow: hidden; touch-action: pan-y; }
    /* One track that slides, rather than slides that appear and disappear. The
       flex items stay full width so the transform maps 1:1 to slide index. */
    .cartrack { display: flex; align-items: stretch;
                transition: transform .52s cubic-bezier(.32, .72, 0, 1); }
    .slide { flex: 0 0 100%; display: grid; }
    @media (min-width: 900px) { .slide { grid-template-columns: 1fr 1fr; } }
    @media (prefers-reduced-motion: reduce) { .cartrack { transition: none; } }
    .slidetx { padding: clamp(30px, 4vw, 60px); display: flex; flex-direction: column;
               justify-content: center; }
    .slidetx h3 { font-size: clamp(1.7rem, 3.2vw, 2.5rem); }
    .slidetx p { margin: 18px 0 0; color: #b7bfb0; font-size: 1rem; line-height: 1.6;
                 max-width: 40ch; }
    .slideart { position: relative; min-height: 300px; background: #1a1f19;
                display: grid; place-items: center; padding: 30px; overflow: hidden; }
    .slideart > img { position: absolute; inset: 0; width: 100%; height: 100%;
                      object-fit: cover; filter: grayscale(.92) contrast(1.06) brightness(.62); }
    .slideart > :not(img) { position: relative; z-index: 1; }
    .cardots { display: flex; gap: 8px; justify-content: center; margin-top: 22px; }
    .cardots button { width: 34px; height: 5px; border-radius: 999px; border: none;
                      background: var(--hair); cursor: pointer; padding: 0; }
    .cardots button[aria-pressed="true"] { background: var(--ink); }

    /* -------------------------------------------------- drawn lock screen -- */
    .lock { width: 100%; max-width: 300px; }
    .lock .clock { font-family: var(--display); font-weight: 800; color: #fff;
                   text-align: center; font-size: 3.4rem; letter-spacing: -.04em; line-height: 1; }
    .lock .date { text-align: center; color: rgba(255,255,255,.8); font-size: .82rem;
                  font-weight: 600; margin-bottom: 14px; }
    .notif { background: rgba(240,242,238,.94); backdrop-filter: blur(8px); border-radius: 16px;
             padding: 12px 14px; display: flex; gap: 11px; align-items: flex-start;
             color: var(--ink); text-align: left; }
    .notif .ic { flex: none; width: 32px; height: 32px; border-radius: 8px; background: var(--ink);
                 color: var(--neon); display: grid; place-items: center;
                 font-family: var(--display); font-weight: 800; font-size: .82rem; }
    .notif .hd { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
    .notif b { font-size: .84rem; font-weight: 700; }
    .notif .tm { color: var(--ink-2); font-size: .72rem; font-weight: 600; }
    .notif p { margin: 2px 0 0; font-size: .84rem; line-height: 1.35; color: #333832; }

    /* ------------------------------------------------------- nudge composer -- */
    .nudge { width: 100%; max-width: 320px; background: var(--paper); color: var(--ink);
             border-radius: 18px; padding: 18px; box-shadow: 0 24px 60px -22px rgba(0,0,0,.7); }
    .nudge h4 { font-size: 1rem; }
    .nudge .grp { display: flex; align-items: center; justify-content: space-between; gap: 10px;
                  padding: 11px 0; border-bottom: 1px solid var(--hair); font-size: .86rem; }
    .nudge .grp:last-of-type { border-bottom: none; }
    .nudge .grp b { font-weight: 700; }
    .nudge .grp .cnt { color: var(--ink-2); font-weight: 600; font-size: .8rem; }
    .nudge .pbtn { width: 100%; margin-top: 12px; font-size: .88rem; padding: 11px 16px; }
    .nudge .rule { margin: 10px 0 0; color: var(--ink-2); font-size: .72rem; line-height: 1.4; }

    /* -------------------------------------------------------- owner phone -- */
    .own { display: grid; gap: clamp(24px, 3vw, 40px); align-items: center; }
    @media (min-width: 1000px) { .own { grid-template-columns: 1fr auto 1fr; } }
    /* The four points ARE the controls: a caption you can press beats a caption
       beside a row of pills that say the same thing twice. */
    .owncap { display: block; width: 100%; text-align: left; cursor: pointer;
              font-family: var(--body); background: transparent; color: inherit;
              border: 2px solid transparent; border-left: 3px solid var(--hair);
              border-radius: 0 var(--r-sm) var(--r-sm) 0; padding: 14px 18px;
              transition: border-color .2s ease, background .2s ease; }
    .owncap h4 { font-size: 1.1rem; margin-bottom: 6px; }
    .owncap p { color: var(--ink-2); font-size: .93rem; line-height: 1.5; margin: 0; }
    .owncap + .owncap { margin-top: 14px; }
    .owncap:hover { background: var(--soft); border-left-color: var(--ink-2); }
    .owncap[aria-pressed="true"] { background: var(--soft); border-left-color: var(--neon); }
    .owncap[aria-pressed="true"] p { color: var(--ink); }
    @media (prefers-reduced-motion: reduce) { .owncap { transition: none; } }
    .phone { width: 320px; max-width: 100%; margin: 0 auto; background: var(--ink);
             border-radius: 42px; padding: 11px; box-shadow: 0 30px 70px -30px rgba(12,14,13,.5); }
    .screen { background: var(--paper); border-radius: 32px; overflow: hidden;
              min-height: 560px; display: flex; flex-direction: column; }
    .sbar { display: flex; align-items: center; justify-content: space-between;
            padding: 14px 20px 6px; font-size: .74rem; font-weight: 700; color: var(--ink); }
    .scr { display: none; padding: 8px 18px 20px; flex: 1; }
    /* No fill-mode and no to-frame: the resting state is the element's own, so a
       screen that never gets to animate is simply visible. With "both" it was
       pinned at opacity 0, and the phone rendered empty. */
    .scr[data-on] { display: block; animation: scrin .34s cubic-bezier(.32, .72, 0, 1); }
    @keyframes scrin { from { opacity: 0; transform: translateX(14px); } }
    @media (prefers-reduced-motion: reduce) { .scr[data-on] { animation: none; } }
    .scr h5 { font-family: var(--display); font-weight: 800; font-size: 1.3rem;
              letter-spacing: -.03em; margin-bottom: 3px; }
    .scr .hint { color: var(--ink-2); font-size: .8rem; font-weight: 500; margin-bottom: 16px; }
    .box { background: var(--soft); border-radius: 14px; padding: 13px 14px; margin-bottom: 10px; }
    .box.line { background: transparent; border: 2px solid var(--hair); }
    .box .t { font-size: .86rem; font-weight: 700; }
    .box .s { color: var(--ink-2); font-size: .76rem; font-weight: 500; margin-top: 2px; }
    .scan { aspect-ratio: 1.25; border-radius: 14px; background: var(--ink); position: relative;
            display: grid; place-items: center; margin-bottom: 12px; }
    .scan .frame { width: 54%; aspect-ratio: 1; border-radius: 10px;
                   box-shadow: 0 0 0 3px var(--neon); }
    .scan .cap { position: absolute; bottom: 12px; color: #cfd6c8; font-size: .74rem;
                 font-weight: 600; }
    .toast { background: var(--neon); color: var(--ink); border-radius: 12px; padding: 11px 13px;
             font-size: .86rem; font-weight: 700; margin-bottom: 10px; }
    .fld { margin-bottom: 10px; }
    .fld label { display: block; color: var(--ink-2); font-size: .74rem; font-weight: 700;
                 letter-spacing: .05em; text-transform: uppercase; margin-bottom: 5px; }
    .fld .val { border: 2px solid var(--hair); border-radius: 12px; padding: 11px 13px;
                font-size: .88rem; font-weight: 600; }
    .tabbar { display: flex; border-top: 1px solid var(--hair); }
    .tabbar span { flex: 1; text-align: center; padding: 11px 0 14px; color: var(--ink-2);
                   font-size: .68rem; font-weight: 700; }
    .tabbar span.on { color: var(--ink); }

    /* --------------------------------------------------------------- price -- */
    .price { max-width: 460px; margin: 0 auto; border: 2px solid var(--ink);
             border-radius: var(--r); padding: clamp(28px, 4vw, 44px); text-align: center; }
    .price .amt { font-family: var(--display); font-weight: 800; font-size: clamp(3rem, 8vw, 4.4rem);
                  letter-spacing: -.045em; line-height: 1; }
    .price .per { color: var(--ink-2); font-weight: 600; font-size: 1rem; margin-top: 8px; }
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
    .price .fine { color: var(--ink-2); font-size: .82rem; margin-top: 14px; }

    /* ------------------------------------------------------------------ us -- */
    .us { max-width: 720px; margin: 0 auto; }
    .us h2 { font-size: clamp(1.8rem, 4vw, 2.6rem); margin-bottom: 18px; }
    .us p { color: var(--ink-2); font-size: 1.04rem; line-height: 1.62; margin-bottom: 14px; }
    .us p:last-child { margin-bottom: 0; }

    /* --------------------------------------------------------------- close -- */
    .close { position: relative; border-radius: var(--r); overflow: hidden; isolation: isolate;
             padding: clamp(46px, 7vw, 96px) clamp(22px, 4vw, 56px); text-align: center;
             color: var(--on-slab); }
    .close > img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
                   object-position: 50% 62%; z-index: 0;
                   filter: grayscale(.94) contrast(1.05) brightness(.5); }
    .close::after { content: ""; position: absolute; inset: 0; z-index: 1;
                    background: linear-gradient(180deg, rgba(16,19,18,.62), rgba(16,19,18,.86)); }
    .close > :not(img) { position: relative; z-index: 2; }
    .close h2 { font-size: clamp(2rem, 5vw, 3.2rem); }
    .close p.sup { margin: 18px auto 0; max-width: 42ch; color: #ccd3c6; font-size: 1.02rem;
                   line-height: 1.55; }
    .closebtns { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center;
                 margin-top: 30px; }
    .tel { margin-top: 22px; font-family: var(--display); font-weight: 800; font-size: 1.24rem;
           letter-spacing: -.02em; }
    .tel a { text-decoration: none; }

    /* ---------------------------------------------------------------- foot -- */
    .foot { border-top: 1px solid var(--hair); padding: 26px 0 44px; display: flex;
            flex-wrap: wrap; gap: 10px 24px; align-items: center;
            justify-content: space-between; color: var(--ink-2); font-size: .86rem; }
    .foot a { text-decoration: none; }
    .foot a:hover { color: var(--ink); }
    .foot nav { display: flex; gap: 20px; }
  `;

  // Placeholder example cards. TODO(founder): confirm the six trades and rewards.
  const EXAMPLES: [string, string, number, number, string][] = [
    ["Kopi Corner", "Cafe or kopitiam", 10, 7, "Free drink"],
    ["Roti Bakar Co", "Bakery", 10, 4, "Free item"],
    ["Teh Tarik Lane", "Bubble tea", 10, 9, "Free drink"],
    ["Gaya Barber", "Barber or salon", 5, 3, "Free cut"],
    ["Kilat Wash", "Car wash", 5, 2, "Free upgrade"],
    ["Paws & Co", "Pet grooming", 5, 4, "Free add on"],
  ];
  const cardHtml = ([biz, kind, slots, filled, reward]: [string, string, number, number, string]) => {
    let dots = "";
    for (let i = 0; i < slots; i++) dots += `<i class="${i < filled ? "on" : ""}"></i>`;
    return `<article class="xc">
              <p class="biz">${biz}</p>
              <p class="kind">${kind}</p>
              <div class="dots">${dots}</div>
              <dl>
                <dt>Stamps</dt><dd>${slots}</dd>
                <dt>Reward</dt><dd>${reward}</dd>
              </dl>
            </article>`;
  };
  // The track is doubled so the translate can loop at exactly -50% with no seam.
  const oneSet = EXAMPLES.map(cardHtml).join("");
  const marquee = oneSet + oneSet;

  const script = /* js */ `
    (function () {
      var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

      // ---- feature carousel -------------------------------------------------
      var car = document.querySelector('[data-car]');
      var track = document.querySelector('[data-cartrack]');
      if (car && track) {
        var slides = [].slice.call(track.querySelectorAll('[data-slide]'));
        var dots = [].slice.call(document.querySelectorAll('[data-dot]'));
        var at = 0, timer = null;
        function show(i) {
          at = (i + slides.length) % slides.length;
          track.style.transform = 'translateX(' + (at * -100) + '%)';
          slides.forEach(function (s, n) { s.setAttribute('aria-hidden', String(n !== at)); });
          dots.forEach(function (d, n) { d.setAttribute('aria-pressed', String(n === at)); });
        }
        function stop() { if (timer) { clearInterval(timer); timer = null; } }
        // Autoplay is a convenience, never the only way through: the dots stay
        // authoritative, and a visitor who is reading is never interrupted.
        function play() { if (reduce) return; stop(); timer = setInterval(function () { show(at + 1); }, 5500); }
        dots.forEach(function (d, n) {
          d.addEventListener('click', function () { show(n); play(); });
        });
        car.addEventListener('mouseenter', stop);
        car.addEventListener('mouseleave', play);
        car.addEventListener('focusin', stop);
        car.addEventListener('focusout', play);
        // Thumb swipe. Only acts on a mostly-horizontal drag, so a vertical
        // flick still scrolls the page instead of changing slide.
        var x0 = null, y0 = null;
        car.addEventListener('touchstart', function (e) {
          x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; stop();
        }, { passive: true });
        car.addEventListener('touchend', function (e) {
          if (x0 === null) return;
          var dx = e.changedTouches[0].clientX - x0;
          var dy = e.changedTouches[0].clientY - y0;
          if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy)) show(at + (dx < 0 ? 1 : -1));
          x0 = null; y0 = null; play();
        }, { passive: true });
        show(0);
        play();
      }

      // ---- owner phone screens ---------------------------------------------
      // The captions are the controls, so the screen follows whichever point
      // the visitor pressed.
      var tabs = [].slice.call(document.querySelectorAll('[data-scr]'));
      var screens = [].slice.call(document.querySelectorAll('[data-screen]'));
      tabs.forEach(function (t) {
        t.addEventListener('click', function () {
          var want = t.getAttribute('data-scr');
          tabs.forEach(function (o) { o.setAttribute('aria-pressed', String(o === t)); });
          screens.forEach(function (s) {
            if (s.getAttribute('data-screen') === want) s.setAttribute('data-on', '');
            else s.removeAttribute('data-on');
          });
        });
      });
    })();
  `;

  const body = `
    <header class="nav"><div class="navin">
      <a class="brand" href="/">PunchMe</a>
      <nav class="navlinks">
        <a href="#how">How it works</a>
        <a href="#owner">For owners</a>
        <a href="#price">Price</a>
      </nav>
      <a class="pbtn pbtn-neon" href="#contact">Get started</a>
    </div></header>

    <main>
      <!-- 1 · HERO -->
      <section class="shell"><div class="hero">
        <div>
          <h1>The stamp card that lives in your customer's phone</h1>
          <p class="sub">No app, for them or for you. And it can't be left at home.</p>
          <p class="trylbl">Try a sample card</p>
          <div class="herobtns">
            <!-- TODO(founder): both point at the live demo pass once it is wired. -->
            <a class="pbtn pbtn-neon" href="/dashboard">Apple Wallet</a>
            <a class="pbtn pbtn-line" href="/dashboard">Google Wallet</a>
          </div>
        </div>
        <div class="herobox">
          <div class="card">
            <div class="top">
              <div>
                <p class="shop">Kopi Corner</p>
                <p class="meta">Apple Wallet</p>
              </div>
              <span class="mark">P</span>
            </div>
            <div class="rowlbl"><span>Progress</span><b>7 of 10</b></div>
            <div class="dots">
              <i class="on"></i><i class="on"></i><i class="on"></i><i class="on"></i><i class="on"></i>
              <i class="on"></i><i class="on"></i><i></i><i></i><i></i>
            </div>
            <div class="rw"><span>Reward</span><b>Free drink</b></div>
          </div>
        </div>
      </div></section>

      <!-- 2 · NOTHING TO INSTALL -->
      <section class="band" id="how"><div class="shell">
        <div class="lede">
          <h2>Nothing to install. On either side.</h2>
          <p>No app for your customers, and no new hardware on your counter.</p>
        </div>
        <div class="duo">
          <div class="panel pale">
            <p class="who">For your customer</p>
            <h3>Three taps, then never again</h3>
            <ul class="flow">
              <li><span class="n">1</span><span class="tx">Scans the QR on your counter</span></li>
              <li aria-hidden="true"><span class="arw"></span></li>
              <li><span class="n">2</span><span class="tx">The card saves straight into their wallet</span></li>
              <li aria-hidden="true"><span class="arw"></span></li>
              <li><span class="n">3</span><span class="tx">Gets a stamp every visit</span></li>
            </ul>
          </div>
          <div class="panel dark">
            <p class="who">For you</p>
            <h3>Four seconds at the counter</h3>
            <ul class="flow">
              <li><span class="n">1</span><span class="tx">Open the stamper on any phone</span></li>
              <li aria-hidden="true"><span class="arw"></span></li>
              <li><span class="n">2</span><span class="tx">Scan their card</span></li>
              <li aria-hidden="true"><span class="arw"></span></li>
              <li><span class="n">3</span><span class="tx">Stamped. Their phone updates itself</span></li>
            </ul>
          </div>
        </div>
      </div></section>

      <!-- 3 · EXAMPLES, auto-scrolling -->
      <section class="band tight"><div class="shell">
        <div class="lede">
          <h2>Built for your business</h2>
          <p>Every trade counts differently. Yours is set up to match.</p>
        </div>
      </div>
      <div class="mq"><div class="mqtrack">${marquee}</div></div>
      </section>

      <!-- 4 · FEATURE CAROUSEL -->
      <section class="band"><div class="shell">
        <div class="lede">
          <h2>Why us</h2>
        </div>
        <div class="car" data-car><div class="cartrack" data-cartrack>
          <div class="slide" data-slide>
            <div class="slidetx">
              <h3>Their card updates before they leave the counter</h3>
              <p>Tap once. The phone in their pocket catches up on its own.</p>
            </div>
            <div class="slideart">
              <div class="lock">
                <p class="clock">9:41</p>
                <p class="date">Tuesday 12 August</p>
                <div class="notif">
                  <span class="ic">P</span>
                  <div>
                    <div class="hd"><b>Kopi Corner</b><span class="tm">now</span></div>
                    <p>7 of 10 stamps. Three more and the next one is free.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="slide" data-slide>
            <div class="slidetx">
              <h3>It lives in the wallet they already have</h3>
              <p>Apple Wallet and Google Wallet, one QR for both. No download, no sign-up,
                no personal details.</p>
            </div>
            <div class="slideart">
              <div class="card">
                <div class="top">
                  <div>
                    <p class="shop">Kopi Corner</p>
                    <p class="meta">Google Wallet</p>
                  </div>
                  <span class="mark">P</span>
                </div>
                <div class="rowlbl"><span>Progress</span><b>9 of 10</b></div>
                <div class="dots">
                  <i class="on"></i><i class="on"></i><i class="on"></i><i class="on"></i><i class="on"></i>
                  <i class="on"></i><i class="on"></i><i class="on"></i><i class="on"></i><i></i>
                </div>
                <div class="rw"><span>Reward</span><b>Free drink</b></div>
              </div>
            </div>
          </div>
          <div class="slide" data-slide>
            <div class="slidetx">
              <h3>Bring back the ones who stopped coming</h3>
              <p>See who has gone quiet and reach them with one press. Never on a timer,
                never more than once a week.</p>
            </div>
            <div class="slideart">
              <img src="/assets/img/quiet-table-v1.jpg" alt="" width="1200" height="780" loading="lazy">
              <div class="nudge">
                <h4>Who has gone quiet</h4>
                <div class="grp"><b>Slipping away</b><span class="cnt">14 people</span></div>
                <div class="grp"><b>Nearly gone</b><span class="cnt">31 people</span></div>
                <div class="grp"><b>Regulars</b><span class="cnt">88 people</span></div>
                <button class="pbtn pbtn-neon" type="button">Send a nudge</button>
                <p class="rule">One message per person per week, and never on a schedule.</p>
              </div>
            </div>
          </div>
        </div></div>
        <div class="cardots">
          <button type="button" data-dot aria-label="Card updates" aria-pressed="true"></button>
          <button type="button" data-dot aria-label="Lives in the wallet" aria-pressed="false"></button>
          <button type="button" data-dot aria-label="Bringing customers back" aria-pressed="false"></button>
        </div>
      </div></section>

      <!-- 5 · FOR THE OWNER -->
      <section class="band" id="owner"><div class="shell">
        <div class="lede">
          <h2>Everything you run it from</h2>
          <p>Tap a point to see the screen.</p>
        </div>
        <div class="own">
          <div>
            <button class="owncap" type="button" data-scr="stamp" aria-pressed="true">
              <h4>Stamping</h4>
              <p>Any phone on the counter, behind one PIN.</p>
            </button>
            <button class="owncap" type="button" data-scr="notify" aria-pressed="false">
              <h4>Bringing people back</h4>
              <p>See who has gone quiet, and reach them.</p>
            </button>
          </div>
          <div class="phone">
            <div class="screen">
              <div class="sbar"><span>9:41</span><span>PunchMe</span></div>

              <div class="scr" data-screen="stamp" data-on>
                <h5>Stamper</h5>
                <p class="hint">Kopi Corner &middot; signed in</p>
                <div class="scan"><span class="frame"></span><span class="cap">Point at their card</span></div>
                <div class="toast">Stamp added &middot; 7 of 10</div>
                <div class="box"><p class="t">Recent</p><p class="s">4 stamps in the last hour</p></div>
              </div>

              <div class="scr" data-screen="notify">
                <h5>Notifications</h5>
                <p class="hint">Who to bring back</p>
                <div class="box"><p class="t">Slipping away &middot; 14</p><p class="s">Last visit 2 to 4 weeks ago</p></div>
                <div class="box"><p class="t">Nearly gone &middot; 31</p><p class="s">Last visit over 6 weeks ago</p></div>
                <div class="box line"><p class="t">12 skipped</p><p class="s">Messaged in the last 7 days</p></div>
                <div class="toast">Sent to 45 people</div>
              </div>

              <div class="scr" data-screen="customers">
                <h5>Customers</h5>
                <p class="hint">Everyone who holds a card</p>
                <div class="box"><p class="t">Regulars &middot; 88</p><p class="s">Visited in the last fortnight</p></div>
                <div class="box"><p class="t">133 in total</p><p class="s">No names, no numbers</p></div>
                <div class="box line"><p class="t">Today</p><p class="s">21 stamps &middot; 3 rewards given</p></div>
              </div>

              <div class="scr" data-screen="settings">
                <h5>Your card</h5>
                <p class="hint">Change it any time</p>
                <div class="fld"><label>Shop name</label><div class="val">Kopi Corner</div></div>
                <div class="fld"><label>Stamps to a reward</label><div class="val">10</div></div>
                <div class="fld"><label>Reward</label><div class="val">Free drink</div></div>
                <div class="box"><p class="t">Staff PIN</p><p class="s">Shown once, then replaced</p></div>
              </div>

              <div class="tabbar">
                <span class="on">Home</span><span>Customers</span><span>Card</span><span>Settings</span>
              </div>
            </div>
          </div>
          <div>
            <button class="owncap" type="button" data-scr="customers" aria-pressed="false">
              <h4>Your customers</h4>
              <p>Counted once each, and never asked for a name.</p>
            </button>
            <button class="owncap" type="button" data-scr="settings" aria-pressed="false">
              <h4>Your card</h4>
              <p>Stamps, reward and staff PIN, changed any time.</p>
            </button>
          </div>
        </div>
      </div></section>

      <!-- 6 · PRICE -->
      <section class="band tight" id="price"><div class="shell">
        <div class="lede"><h2>One price</h2></div>
        <div class="price">
          <p class="amt">RM79</p>
          <p class="per">a month &middot; first month free</p>
          <ul>
            <li>Apple Wallet and Google Wallet, one QR for both</li>
            <li>Unlimited customers and unlimited stamps</li>
            <li>Bring-back messages, whenever you decide to send them</li>
            <li>We set your shop up ourselves</li>
          </ul>
          <a class="pbtn pbtn-neon" href="/dashboard">Start free</a>
          <p class="fine">No card details to start. Cancel whenever.</p>
        </div>
      </div></section>

      <!-- 7 · WHO WE ARE -->
      <section class="band tight"><div class="shell"><div class="us">
        <h2>Who are we?</h2>
        <p>Two of us, in Kuala Lumpur. Four years in e-commerce data analytics between
          one of us, five in fintech product for the other.</p>
        <p>We set up every shop ourselves, so you will always be talking to the people
          who built it.</p>
      </div></div></section>

      <!-- 8 · CLOSE. TODO(founder): real WhatsApp / Instagram / email / phone. -->
      <section class="band tight" id="contact"><div class="shell">
        <div class="close">
          <img src="/assets/img/shopfront-v1.jpg" alt="" width="1800" height="1170" loading="lazy">
          <h2>Want it on your counter?</h2>
          <p class="sup">Message us and we will set the whole thing up for you, card
            design included.</p>
          <div class="closebtns">
            <a class="pbtn pbtn-neon" href="#contact">WhatsApp</a>
            <a class="pbtn pbtn-pale" href="#contact">Instagram</a>
            <a class="pbtn pbtn-pale" href="#contact">Email</a>
          </div>
          <p class="tel">We reply the same day</p>
        </div>
      </div></section>

      <div class="shell"><div class="foot">
        <span>PunchMe &middot; made in Kuala Lumpur</span>
        <nav>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/dashboard">Log in</a>
        </nav>
      </div></div>
    </main>`;
  return page("PunchMe — the stamp card that lives in your customer's phone", body, css, script);
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
    <a class="back" href="/">&larr; Back to Stampy</a>
    <h1>Privacy Policy</h1>
    <p class="upd">Last updated ${UPDATED}</p>
    ${langToggle("en")}
    <p>Stampy provides digital loyalty stamp cards that live in Apple Wallet and Google Wallet. This policy explains what we collect and why, in plain language. It is written to meet Malaysia&rsquo;s Personal Data Protection Act 2010 (PDPA).</p>

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
    <p>The café whose card you hold decides how your loyalty data is used — under the PDPA they are the data user. Stampy runs the system on their behalf as their data processor. <strong>A café can see only its own cards, stamps and messages</strong>, never another café&rsquo;s and never anything about you beyond what is listed above.</p>

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

    <div class="note">Stampy is in beta. This policy is a plain-language starting point, not legal advice — please have it reviewed by a professional before relying on it at scale.</div>
  </article>`;
  return page("Stampy — Privacy Policy", body, legalCss);
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
    <a class="back" href="/">&larr; Kembali ke Stampy</a>
    <h1>Dasar Privasi</h1>
    <p class="upd">Dikemas kini ${UPDATED}</p>
    ${langToggle("bm")}
    <p>Stampy menyediakan kad setia digital yang disimpan di dalam Apple Wallet dan Google Wallet. Dasar ini menerangkan apa yang kami kumpul dan sebabnya, dalam bahasa yang mudah. Ia ditulis untuk memenuhi Akta Perlindungan Data Peribadi 2010 (PDPA) Malaysia.</p>

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
    <p>Kafe yang kadnya anda pegang menentukan bagaimana data setia anda digunakan — di bawah PDPA merekalah pengguna data. Stampy mengendalikan sistem bagi pihak mereka sebagai pemproses data. <strong>Sesebuah kafe hanya dapat melihat kad, setem dan mesejnya sendiri</strong>, tidak sekali-kali milik kafe lain dan tidak apa-apa tentang anda selain yang disenaraikan di atas.</p>

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

    <div class="note">Stampy masih dalam beta. Dasar ini ialah titik permulaan dalam bahasa mudah, bukan nasihat guaman — sila minta seorang profesional menyemaknya sebelum bergantung padanya secara meluas.</div>
  </article>`;
  return page("Stampy — Dasar Privasi", body, legalCss);
}

export function termsPage(contactEmail = ""): string {
  const body = `<article class="legal">
    <a class="back" href="/">&larr; Back to Stampy</a>
    <h1>Terms of Service</h1>
    <p class="upd">Last updated ${UPDATED}</p>
    <p>These terms cover your use of Stampy. By creating an account you agree to them.</p>

    <h2>Beta service</h2>
    <p>Stampy is currently in beta and free to use. It&rsquo;s provided &ldquo;as is,&rdquo; without warranties of uptime or availability, while we finish building and testing. Features may change or pause during this period.</p>

    <h2>Your account</h2>
    <ul>
      <li>Keep your login and your café&rsquo;s staff PIN secure — you&rsquo;re responsible for activity under them.</li>
      <li>Give accurate information when you sign up.</li>
    </ul>

    <h2>Acceptable use</h2>
    <ul>
      <li>Use Stampy only for a genuine loyalty program for your own café.</li>
      <li>Don&rsquo;t misuse customer notifications to spam or mislead people.</li>
      <li>Follow the laws that apply to you, including consumer and data-protection law.</li>
    </ul>

    <h2>Your customers, your relationship</h2>
    <p>The customers who join your card are yours. Stampy processes their card data on your behalf to run the program; we don&rsquo;t market to them or take them elsewhere.</p>

    <h2>Reward terms</h2>
    <p>These are the terms shown on the back of every card, and they apply between you and your customer. You run the programme; we run the software.</p>
    <ul>
      <li>One stamp per visit. You decide what earns a stamp.</li>
      <li>Stamps may expire after 12 months without a visit.</li>
      <li>You may substitute a reward of similar value, or withdraw the programme, at any time.</li>
      <li>The reward is yours to honour, not Stampy&rsquo;s. Stamps have no cash value and cannot be exchanged, sold or transferred between customers.</li>
      <li>Stamps added by mistake can be reversed by your staff, and the correction is recorded.</li>
    </ul>

    <h2>Data protection</h2>
    <p>Under Malaysia&rsquo;s Personal Data Protection Act, <strong>you are the data user</strong> for your customers&rsquo; loyalty data and <strong>Stampy is your data processor</strong>. This section is the written agreement the Act asks for between the two. We undertake to:</p>
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
    <p>To the extent permitted by law, Stampy isn&rsquo;t liable for indirect or consequential losses arising from use of a beta service. Nothing here limits rights that can&rsquo;t be limited under Malaysian law.</p>

    <h2>Ending it</h2>
    <p>You can stop using Stampy and ask us to delete your account at any time. We may suspend accounts that break these terms.</p>

    <h2>Contact</h2>
    <p>Questions about these terms? ${contactLine(contactEmail)}.</p>

    <div class="note">Stampy is in beta. These terms are a plain-language starting point, not legal advice — please have them reviewed by a professional before relying on them at scale.</div>
  </article>`;
  return page("Stampy — Terms of Service", body, legalCss);
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
          const count = out.pass ? " — " + out.pass.stamps + " of " + out.pass.target : "";
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
    let found = []; // server-side search hits (cards outside the recent 20)
    async function load() {
      const out = await api("/passes");
      allPasses = out.passes;
      renderReady();
      renderList();
    }
    /** One card, with whatever actions it currently allows. */
    function passRow(p) {
      const div = document.createElement("div");
      div.className = "pass";
      div.innerHTML = \`
        <strong>\${p.code}</strong>
        \${p.rewardReady ? '<span class="ready"> — REWARD READY 🎉</span>' : ""}
        <div class="dots">\${p.dots} <span class="muted">\${p.stamps}/\${p.target}</span></div>
        <div class="row">
          <button class="btn btn-stamp" data-a="stamp">+1 Stamp</button>
          \${p.stamps > 0 ? '<button class="btn btn-ghost" data-a="undo">− Undo a stamp</button>' : ""}
          \${p.rewardReady ? '<button class="btn btn-ghost" data-a="redeem">Give reward & restart</button>' : ""}
        </div>\`;
      div.querySelector('[data-a=stamp]').onclick = () => act("/stamp", { serial: p.serial }, "Stamp added");
      // The fix for a mis-scan. Before this the only way back was to redeem,
      // which handed out a free reward.
      const u = div.querySelector('[data-a=undo]');
      if (u) arm(u, "Confirm — undo?", () => act("/undo", { serial: p.serial }, "Stamp removed"));
      const r = div.querySelector('[data-a=redeem]');
      if (r) arm(r, "Confirm — give reward?", () => act("/redeem", { serial: p.serial }, "Reward given — card restarted"));
      return div;
    }

    // Cards at their target, always on screen. The customer's last stamp used to
    // drop them somewhere into a list of twenty and staff had to go hunting for
    // the card that was right in front of them.
    function renderReady() {
      const host = $("#readywrap"); if (!host) return;
      const ready = allPasses.filter((p) => p.rewardReady);
      host.innerHTML = "";
      if (!ready.length) return;
      host.insertAdjacentHTML("beforeend",
        "<h2>Ready to redeem</h2><p class=\\"sub\\">" +
        (ready.length === 1 ? "One card has" : ready.length + " cards have") +
        " hit the target.</p>");
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
    "Stampy — Staff",
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
          : "message whoever set up your Stampy account"
      } and we’ll set a new password for you.</p>`;
  const css = /* css */ `
    .metrics { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin: 10px 0; }
    .metric { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r);
              padding: 16px 16px 13px; text-align: left; }
    .metric b { font-family: var(--display); font-weight: 800; font-size: 2rem; line-height: 1;
                display: block; letter-spacing: -.035em; font-variant-numeric: tabular-nums; color: var(--ink); }
    .metric span { display: block; margin-top: 6px; font-size: .68rem; text-transform: uppercase;
                   letter-spacing: .05em; color: var(--muted); }
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
    /* --- sliding segmented control (tabs + toggles) --- */
    .seg { position: relative; display: flex; background: var(--ghost-bg); border-radius: 999px; padding: 5px; gap: 2px; }
    .seg button { position: relative; z-index: 1; flex: 1; border: none; background: none; font: inherit;
                  font-weight: 600; font-size: .9rem; color: var(--muted); padding: 10px 12px; cursor: pointer;
                  border-radius: 999px; white-space: nowrap; transition: color .2s; }
    .seg button.on { color: var(--on-accent); font-weight: 700; }
    .seg button:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
    .seg .thumb { position: absolute; z-index: 0; top: 5px; bottom: 5px; left: 0; width: 0; background: var(--accent);
                  border-radius: 999px; box-shadow: 0 2px 6px rgba(32,33,29,.14);
                  transition: transform .28s cubic-bezier(.34,1.1,.4,1), width .28s cubic-bezier(.34,1.1,.4,1); }
    /* Five tabs don't fit a 375px phone at the default size. Tighten them enough
       that all five stay visible (a hidden tab is worse than small type), and
       keep a scroll as the fallback for anything narrower still. */
    #tabs { margin: 18px 0 24px; overflow-x: auto; scrollbar-width: none; }
    #tabs::-webkit-scrollbar { display: none; }
    #tabs button { padding: 10px 9px; font-size: .84rem; }
    @media (max-width: 430px) {
      #tabs { padding: 3px; gap: 0; }
      #tabs button { padding: 10px 6px; font-size: .78rem; }
      #tabs .thumb { top: 3px; bottom: 3px; }
    }
    .segwrap { margin: 8px 0 4px; }
    .segwrap .lbl { font-size: .8rem; color: var(--muted); margin-bottom: 6px; }
    @media (prefers-reduced-motion: reduce) { .seg .thumb { transition: none; } }
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
    .totals { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 14px 0; }
    /* Three tiles fit across a phone. A fourth (spend) wraps to 2×2 rather than
       3-then-1, and goes back to one row once there's room. */
    .totals.four { grid-template-columns: repeat(2, 1fr); }
    @media (min-width: 560px) { .totals.four { grid-template-columns: repeat(4, 1fr); } }
    .totals .metric { padding: 16px 14px 13px; }
    .totals .metric b { font-size: clamp(1.4rem, 6.5vw, 2rem); }
    .breakdown { width: 100%; border-collapse: collapse; font-size: .9rem; margin-top: 6px; }
    .breakdown th { text-align: left; color: var(--muted); font-size: .68rem; text-transform: uppercase; letter-spacing: .05em; padding: 8px 10px; border-bottom: 1px solid var(--line); }
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
    .grp .gc { background: var(--ghost-bg); border-radius: 999px; padding: 2px 10px; font-size: .8rem;
               font-variant-numeric: tabular-nums; }
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
    .cact .ccell { background: var(--surface); border: none; font: inherit; color: var(--ink);
                   text-align: left; padding: 11px 12px; min-width: 0; }
    .cact button.ccell { cursor: pointer; }
    .cact button.ccell:hover { background: var(--ghost-bg); }
    .cact .cn { display: block; font-family: var(--display); font-size: 1.35rem; line-height: 1.1;
                letter-spacing: -.01em; font-variant-numeric: tabular-nums; }
    .cact .cl { display: block; margin-top: 3px; font-size: .72rem; color: var(--muted); line-height: 1.3; }
    .cact .cgo { color: var(--muted); font-size: .72rem; }
    .clist { width: 100%; border-collapse: collapse; font-size: .88rem; }
    .clist th { text-align: left; color: var(--muted); font-size: .7rem; text-transform: uppercase;
                letter-spacing: .06em; padding: 6px 8px 6px 0; border-bottom: 1px solid var(--line); }
    .clist td { padding: 9px 8px 9px 0; border-bottom: 1px solid var(--line); vertical-align: top; }
    .clist td.mono { font-family: ui-monospace, Menlo, monospace; font-size: .82rem; }
    .sec.first { margin-top: 4px; padding-top: 0; border-top: none; }
    /* Design is a set-it-once job, so it folds away. Rules — the reward, the
       stamp count, the win-back — is what owners come back to, and stays open. */
    .fold { border: 1px solid var(--line); border-radius: 14px; padding: 0 14px; margin-top: 14px;
            background: var(--surface); }
    .fold summary { cursor: pointer; padding: 14px 0; font-weight: 600; list-style: none;
                    display: flex; gap: 8px; align-items: center; }
    .fold summary::-webkit-details-marker { display: none; }
    .fold summary::before { content: "▸"; color: var(--muted); font-weight: 400; transition: transform .18s; }
    .fold[open] summary::before { transform: rotate(90deg); }
    .fold[open] { padding-bottom: 18px; }
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
    async function api(path, opts = {}) {
      const res = await fetch("/dashboard/api" + path, {
        ...opts, headers: { "Content-Type": "application/json", ...(opts.headers||{}) },
      });
      return { status: res.status, body: await res.json().catch(() => ({})) };
    }
    function toast(msg) {
      const t = $(".toast"); t.textContent = msg; t.classList.add("show");
      setTimeout(() => t.classList.remove("show"), 2600);
    }

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
        else toast(body.error === "email-taken" ? "That email already has an account — log in instead."
                 : body.error || ("Failed (" + status + ")"));
      };
    }

    // Curated palettes so a new card looks good without fiddling. [bg, text, label]

    // The card editor: DESIGN (what it looks like) and RULES (how it behaves) as
    // two sections with their own Save, because they're two different jobs — the
    // old single panel mixed a colour picker with the staff PIN behind one button.
    ${DESIGN_PANEL_JS}

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
        <div class="totals" data-totals></div>
        <p class="muted" data-gap style="margin:-6px 0 4px"></p>
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

      // Three numbers, all time. The "came back" rate was here and is not any
      // more: it needed a footnote about the week it takes to mean anything, and
      // a tile that has to be explained is a tile nobody reads. The retention
      // question is answered properly on the admin console. cardMetrics still
      // computes matured/returned — nothing else moves if it comes back.
      const host = div.querySelector("[data-totals]");
      host.className = "totals " + (priced.length ? "four" : "three");
      host.innerHTML = \`
        <div class="metric"><b>\${sum("active")}</b><span>customers</span></div>
        <div class="metric"><b>\${sum("stamps")}</b><span>stamps</span></div>
        <div class="metric"><b>\${sum("redemptions")}</b><span>rewards given</span></div>
        \${priced.length ? '<div class="metric"><b>' + money(influenced) + '</b><span>spend influenced</span></div>' : ""}\`;

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
            '<p class="muted" style="margin:2px 0 4px">Set an average spend in Card → Rules to see the money your stamps influenced.</p>');
        }
      })();
      return div;
    }

    // ---- Notifications: one message, one button, one line saying who gets it ----
    // This was three cohort rows, a card dropdown and two paragraphs explaining
    // the limit. All of it said what one sentence under the button says, and the
    // limit was never enforced here anyway — canNudge (src/winback.ts) decides,
    // server-side, and reports back what actually went out. The groups came from
    // that same rule, so the subtitle can't disagree with the button either.
    function customersPanel() {
      const div = document.createElement("div");
      div.innerHTML = \`
        <h2 class="sec">Notifications\${info("Each customer can be messaged once every 7 days. Anyone inside that window is skipped automatically.")}</h2>
        <label>Message</label>
        <!-- Button UNDER the field, not beside it. Side by side, "Push
             notification" ate most of a phone's width and left the message —
             the thing being written — in a sliver. -->
        <input data-msg maxlength="200">
        <button class="btn btn-dark" style="margin-top:10px" data-send>Push notification</button>
        <p class="muted" style="margin-top:6px" data-who></p>
        <details class="grp" style="margin-top:22px" data-find>
          <summary><span class="gt">Find a customer</span></summary>
          <input data-search placeholder="🔍 Card code" autocomplete="off" style="text-transform:uppercase;margin-top:10px">
          <div data-results style="margin-top:10px"></div>
        </details>
        <!-- Folded, and last. It is a thing to check when something feels off,
             not a thing to read every day, and it must not push the message box
             off the screen. Loaded only when opened. -->
        <details class="grp" data-counter>
          <summary><span class="gt">Today's Activity</span>\${info("What happened at your counter today, and nothing more. Everyone shares one PIN, so none of this can say who did anything — tap any number for the exact times.")}<span class="gh" data-clast></span></summary>
          <div data-cbody style="margin-top:10px"></div>
        </details>\`;
      const q = (s) => div.querySelector(s);
      let all = [], ready = 0, cooling = 0;

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
      cfold.addEventListener("toggle", async () => {
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
        const search = (q("[data-search]").value || "").trim().toUpperCase();
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
        ready = find("ready").eligible || 0;
        cooling = find("cooling").customers || 0;
        const bits = [];
        bits.push(ready ? "Will be sent to <strong>" + ready + "</strong>" + (ready === 1 ? " customer" : " customers") : "Nobody to message right now");
        if (cooling) bits.push(cooling + " already messaged this week");
        q("[data-who]").innerHTML = bits.join(" · ");
        q("[data-send]").disabled = !ready;
        // Pre-fill with the shop's stored starting message, so the box is never
        // empty. It is edited here and nowhere else now — the duplicate field in
        // Card → Rules was two places to set one message, on a page the owner
        // wasn't on when they sent it.
        if (!q("[data-msg]").dataset.touched) q("[data-msg]").value = (S.cards[0] || {}).winbackMessage || "";
        renderResults();
      }
      q("[data-msg]").oninput = (e) => { e.target.dataset.touched = "1"; };
      q("[data-send]").onclick = () => confirmSend(ready, { target: "ready" });
      q("[data-search]").oninput = renderResults;
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
          artUrl: (kind, v) => artBase + "/art/" + kind + ".png" + (v ? "?v=" + v : ""),
          customersPath: "/customers?cardId=" + encodeURIComponent(card.id),
          rulesNote: "",
          // Folded: for an owner, design is a set-it-once job and the rules are
          // what they come back to. The console opens it, because there the
          // design IS the job.
          designOpen: false,
          showDetails: true,
          rulesSaveLabel: "Save rules",
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
        <h2 class="sec first">Staff stamper</h2>
        <p class="muted">Staff use this tool to punch cards.\${info("One PIN covers your whole counter, on every card you run. It is stored scrambled, so nobody can look it up — not even us. Setting a new one signs every staff phone out.")}</p>
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
          <a href="/c/\${c.id || ""}/poster" target="_blank"><span>Sign-up QR poster <span class="sub2">print this for the counter</span></span><span class="arr">open →</span></a>
        </div>

        <h2 class="sec">Your account</h2>
        <label>Signed in as</label>
        <p style="font-weight:600;margin-bottom:6px">\${S.email}</p>
        <label style="margin-top:10px">Change password</label>
        <input data-cur type="password" placeholder="Current password" autocomplete="current-password">
        <input data-new type="password" placeholder="New password (min 8)" autocomplete="new-password" style="margin-top:8px">
        <label class="eye"><input type="checkbox" data-eye="[data-cur],[data-new]"> Show passwords</label>
        <button class="btn btn-dark" style="margin-top:10px" data-pwsave>Update password</button>
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

    // Slides the tab bar's thumb under the active tab — the "tap across, watch
    // it glide". (Home's All-time / 30-day toggle used to share this too, until
    // it was dropped for doubling every number on the screen.)
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
    // ---- app shell: owner-scoped tabs ----
    const S = { cards: [], email: "", tab: "customers", selCard: 0, hasStaffPin: false, joinRef: "" };

    async function app() {
      const { status, body } = await api("/overview");
      if (status === 401) return authForm("login");
      S.cards = body.cards; S.email = body.email; S.selCard = 0; S.tab = "customers";
      S.hasStaffPin = !!body.hasStaffPin;
      S.joinRef = body.joinRef || "";
      // Three tabs, each one job: who your customers are and how it's going ·
      // what the card is · everything you set once. Home and Customers used to
      // be separate, which left a headline row on one page and the people it
      // described on another; with one card per merchant the first was too thin
      // to be a page of its own.
      $("#app").innerHTML = \`
        <div><h1 style="margin:0">Dashboard</h1><p class="sub" style="margin:2px 0 14px">\${S.email}</p></div>
        <div class="seg" id="tabs" role="tablist">
          <button data-tab="customers" class="on">Customers</button>
          <button data-tab="card">Card</button>
          <button data-tab="shop">Shop</button>
          <span class="thumb"></span>
        </div>
        <div id="panel"></div>\`;
      $("#tabs").querySelectorAll("button").forEach((b) => {
        b.onclick = () => go(b.dataset.tab);
      });
      renderTabs(); renderPanel();
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

    // Re-seat every segmented thumb when the layout shifts (window resize) or the
    // webfont swaps in and changes button widths, so the highlight stays aligned.
    const reseat = () => document.querySelectorAll(".seg").forEach((s) => moveThumb(s));
    window.addEventListener("resize", reseat);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(reseat);

    (async () => {
      const { body } = await api("/state");
      if (body.loggedIn) app();
      else authForm("login");
    })();
  `;
  return page(
    "Stampy — Dashboard",
    `<div class="card" id="app"><p class="sub">Loading…</p></div><div class="toast"></div>`,
    css,
    js,
  );
}

// --------------------------------------------------------------- poster ----

/** What the poster says it is powered by. Renaming lives here, once. */
const PRODUCT_NAME = "PunchMe";

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
  card: Pick<CardRow, "id" | "reward" | "stamps_target" | "signup_message"> & {
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
): string {
  const bg = rgbToHex(card.background_color);
  const accent = rgbToHex(card.accent_color);
  // Never sampled: a shop whose brand colour is dark and whose accent is also
  // dark would otherwise print a header nobody can read.
  const onBg = contrastText(bg);
  const ref = encodeURIComponent(joinRef);
  const css = /* css */ `
    body { max-width: 640px; }
    .poster { border: 1px solid var(--line); border-radius: 18px; overflow: hidden; background: #fff; }
    .phead { background: ${bg}; color: ${onBg}; padding: 26px 28px 22px; text-align: center; }
    .phead img { width: 74px; height: 74px; object-fit: contain; margin-bottom: 10px; }
    .phead h1 { font-size: 1.7rem; margin: 0; color: ${onBg}; letter-spacing: -.01em; }
    .pbody { padding: 26px 28px 20px; text-align: center; }
    .poffer { font-size: 1.5rem; font-weight: 700; line-height: 1.25; margin: 0 0 8px;
              text-wrap: balance; }
    .pno { font-size: 1rem; color: var(--muted); margin: 0 0 20px; }
    /* The QR is the point of the sheet, so it takes the space. Framed in the
       card's accent so the paper reads as theirs from across a counter. */
    .pqr { border: 6px solid ${accent}; border-radius: 16px; padding: 12px; background: #fff;
           width: min(100%, 380px); margin: 0 auto; }
    .pqr img { display: block; width: 100%; height: auto; }
    .psteps { text-align: left; max-width: 340px; margin: 22px auto 0; color: var(--muted);
              font-size: .92rem; line-height: 1.8; }
    .pfoot { border-top: 1px solid var(--line); padding: 12px 28px; text-align: center;
             color: var(--muted); font-size: .76rem; letter-spacing: .02em; }
    .noprint { margin-top: 18px; }
    @media print {
      .noprint { display: none; }
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
        <h1>${esc(business)}</h1>
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
      <button class="btn btn-dark" onclick="window.print()">Print this poster</button>
    </div>`;
  return page(`${business} — sign-up poster`, body, css);
}

// ---------------------------------------------------------------- admin ----

/**
 * A print-ready sheet for a café's counter: the Add-to-Wallet QR, big, with the
 * reward named under it. Built for the admin doing done-for-you onboarding —
 * open it, hit print, hand it over. Deliberately plain HTML/CSS with a print
 * stylesheet rather than generated PDF, so there is no new dependency and the
 * merchant can print it from any phone or laptop.
 */
export function counterSheetPage(
  card: { id: string; name: string; reward: string; stamps_target: number },
  /** The shop. Named on the sheet above the card, so a merchant running two
   *  cards gets two posters that are obviously from the same place. */
  business = card.name,
): string {
  const css = /* css */ `
    body { max-width: 720px; }
    .sheet { border: 1px solid var(--line); border-radius: 20px; padding: 40px 32px; text-align: center;
             background: #fff; }
    .sheet h1 { font-size: 2rem; margin: 0 0 6px; }
    .sheet .reward { font-size: 1.25rem; font-weight: 700; margin: 0 0 4px; }
    .sheet .how { color: var(--muted); margin: 0 0 24px; }
    .sheet img { width: 100%; max-width: 340px; height: auto; }
    .sheet .steps { text-align: left; max-width: 340px; margin: 24px auto 0; color: var(--muted);
                    font-size: .9rem; line-height: 1.7; }
    .noprint { margin-top: 18px; }
    /* On paper: no browser chrome, no buttons, no page background. */
    @media print {
      .noprint { display: none; }
      body { max-width: none; padding: 0; background: #fff; }
      .sheet { border: none; padding: 0; }
    }
  `;
  const body = `
    <div class="sheet">
      <h1>${esc(business)}</h1>
      ${business === card.name ? "" : `<p class="sub" style="margin:-4px 0 10px">${esc(card.name)}</p>`}
      <p class="reward">${esc(card.reward)} after ${card.stamps_target} stamps</p>
      <p class="how">Scan to add your card — no app to download</p>
      <img src="/c/${encodeURIComponent(card.id)}/qr" alt="Add-to-Wallet QR code">
      <div class="steps">
        1. Point your camera at the code<br>
        2. Tap <strong>Add to Apple Wallet</strong> or <strong>Google Wallet</strong><br>
        3. Show the card when you order — it stamps itself
      </div>
    </div>
    <div class="noprint">
      <button class="btn btn-dark" onclick="window.print()">Print this sheet</button>
    </div>`;
  return page(`${business} — counter sheet`, body, css);
}

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
  const css = /* css */ `
    body { max-width: none; }
    .awrap { width: 100%; max-width: 1000px; }
    .purpose { color: var(--muted); font-size: .88rem; margin: 2px 0 0; }
    /* --- how everyone is doing: four lenses on the whole book --- */
    /* Four hero numbers used to sit here — stamping this week, stamps 7d, cards
       in wallets, need attention. None of them answered a question worth asking
       before opening a shop. These four panels do: health, performance, value,
       retention, each a few numbers rather than one. */
    .pstrip { display: grid; grid-template-columns: 1fr; gap: 12px; margin: 16px 0 30px; }
    @media (min-width: 700px) { .pstrip { grid-template-columns: 1fr 1fr; } }
    .ppanel { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 15px 17px; }
    .ppanel h3 { margin: 0 0 12px; font-size: .68rem; text-transform: uppercase; letter-spacing: .07em;
                 color: var(--muted); font-family: inherit; font-weight: 700; }
    .ppanel dl { display: grid; grid-template-columns: 1fr auto; gap: 7px 14px; margin: 0; font-size: .9rem; }
    .ppanel dt { color: var(--muted); }
    .ppanel dd { margin: 0; text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
    .ppanel dd.big { font-family: var(--display); font-size: 1.25rem; line-height: 1.1; letter-spacing: -.01em; }
    .ppanel dd.up { color: #15803d; }
    .ppanel dd.down { color: #9a3412; }
    .ppanel .foot { color: var(--muted); font-size: .74rem; margin: 10px 0 0; line-height: 1.45; }
    /* The lifecycle bar: where the whole book sits, in one line. */
    .lifebar { display: flex; height: 12px; border-radius: 999px; overflow: hidden; margin: 2px 0 12px;
               background: var(--ghost-bg); }
    .lifebar i { display: block; }
    .lifebar i.live { background: #15803d; }
    .lifebar i.quiet { background: #b45309; }
    .lifebar i.dead { background: #9a3412; }
    .lifekey { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: .82rem; }
    .lifekey span { display: flex; align-items: center; gap: 6px; color: var(--muted); }
    .lifekey b { color: var(--ink); font-variant-numeric: tabular-nums; }
    .lifekey i { width: 9px; height: 9px; border-radius: 3px; display: inline-block; }
    .lifekey i.live { background: #15803d; }
    .lifekey i.quiet { background: #b45309; }
    .lifekey i.dead { background: #9a3412; }
    /* --- who needs a call today --- */
    /* ONE line per shop, not one per problem: a shop with four things wrong used
       to take four cards and push everything else off the screen. */
    .triage { border: 1px solid var(--line); border-radius: 14px; background: var(--surface);
              margin-bottom: 12px; overflow: hidden; }
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
    .legend td { font-size: .84rem; }
    .legend td:first-child { white-space: nowrap; }
    /* Severity chips, reused in the table's Flags column. */
    .chipf { display: inline-block; font-size: .7rem; font-weight: 700; padding: 2px 8px;
             border-radius: 999px; margin: 1px 3px 1px 0; white-space: nowrap; }
    .chipf.critical { background: #fdeaea; color: #9a3412; }
    .chipf.warn { background: #fef3c7; color: #92400e; }
    .chipf.info { background: var(--ghost-bg); color: var(--muted); }
    /* --- the one table, and what opens under a row --- */
    .mrow { cursor: pointer; }
    .mrow:hover td { background: var(--ghost-bg); }
    .mname { font-weight: 700; }
    /* NOT var(--ghost-bg). Painting the whole drill-down grey made the most
       detailed part of the console read as disabled. It is content; it gets a
       surface and a rule down its left edge to show what it belongs to. */
    .mdetail > td { background: var(--surface); border-left: 3px solid var(--accent); padding: 16px 18px; }
    .dgrid { display: grid; gap: 14px; grid-template-columns: 1fr; }
    @media (min-width: 760px) { .dgrid { grid-template-columns: 1fr 1fr; } }
    .dpanel { border: 1px solid var(--line); border-radius: 12px; padding: 14px; background: var(--bg); }
    .dpanel h4 { margin: 0 0 8px; font-size: .74rem; text-transform: uppercase; letter-spacing: .06em;
                 color: var(--muted); }
    .dpanel h4 .qn { color: var(--accent-dark); font-variant-numeric: tabular-nums; margin-right: 6px; }
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
    table { border-collapse: collapse; width: 100%; font-size: .9rem; margin-top: 12px; }
    th { text-align: left; color: var(--muted); font-size: .72rem; text-transform: uppercase; letter-spacing: .06em; padding: 8px 10px; border-bottom: 1px solid var(--line); }
    td { padding: 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
    .flags { font-size: .78rem; color: var(--muted); }
    /* Something that needs a phone call. */
    .bad { color: #9a3412; font-weight: 600; }
    .tw { overflow-x: auto; }
    .rst { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; align-items: end; }
    .rst select { width: auto; }
    .rst .btn { width: auto; padding: 10px 14px; }
    .temp { font-family: ui-monospace, Menlo, monospace; background: var(--ghost-bg); padding: 8px 10px; border-radius: 8px; margin-top: 10px; }
    .nfc { font-family: ui-monospace, Menlo, monospace; word-break: break-all; }
    .cbtn, .dbtn { width: auto; padding: 5px 10px; font-size: .78rem; margin-top: 4px; }
    .arch { font-size: .68rem; text-transform: uppercase; letter-spacing: .06em;
            background: var(--ghost-bg); color: var(--muted); padding: 2px 6px; border-radius: 5px; }
    .btn.armed { background: #9a3412; border-color: #9a3412; color: #fff; }
    #dfy label { display: block; margin-top: 10px; }
    #dfy input { width: 100%; }
    #dfy .btn { width: auto; padding: 10px 14px; margin-top: 12px; }
    /* --- designs: the list on the left, the real designer on the right --- */
    .dstarget { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 4px 0 16px; }
    .dstarget select { width: auto; flex: 1; min-width: 180px; max-width: 320px; }
    .dstarget .seg2 { display: flex; background: var(--ghost-bg); border-radius: 999px; padding: 4px; gap: 2px; }
    .dstarget .seg2 button { width: auto; border: none; background: none; font: inherit; font-weight: 600;
                             font-size: .85rem; color: var(--muted); padding: 8px 14px; border-radius: 999px;
                             cursor: pointer; white-space: nowrap; }
    .dstarget .seg2 button.on { background: var(--surface); color: var(--accent-dark);
                                box-shadow: 0 2px 6px rgba(32,33,29,.14); }
    /* The designer first and at its own width — .designhost caps it at the 480px
       it was laid out for — with the push panel beside it rather than under. */
    .dsgrid { display: grid; grid-template-columns: 1fr; gap: 20px; align-items: start; }
    @media (min-width: 860px) { .dsgrid { grid-template-columns: 480px minmax(0, 1fr); } }
    .dspush { border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px;
              background: var(--surface); }
    /* Card mode has nothing to push, and an empty bordered box reads as broken. */
    .dspush:empty { display: none; }
    .dspush .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 8px; }
    .dspush select { width: auto; flex: 1; min-width: 160px; }
    .dspush .btn { width: auto; padding: 10px 14px; white-space: nowrap; }
    .dsempty { color: var(--muted); font-size: .88rem; padding: 26px 14px; text-align: center; }
    ${MODAL_CSS}
    ${DESIGN_PANEL_CSS}
  `;
  const js = /* js */ `
    ${PALETTE_JS}
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

    // ---------------------------------------------------- the card designer ----
    // The SAME panel the owner dashboard renders — see DESIGN_PANEL_JS — and it
    // is on screen from the moment the section loads, with the Design block
    // open. It points at one of two things:
    //
    //   a saved design   an unattached design_templates row, built for a
    //                    prospect before they have an account, pushed later
    //   a shop's card    a live card, edited exactly as its owner would
    //
    // Everything about that difference lives in the env passed below. The
    // console used to carry its own smaller designer (three colours, one
    // gradient band, ten fixed icons) plus six hard-coded "business type"
    // presets in the signup form. Both are gone: there is one way to design a
    // card, and it is the one owners use.
    let designs = [], selDesign = null, dsMode = "design", selCard = null;

    /** rgb(...) as stored for PassKit → the hex an <input type=color> speaks. */
    const rgbHex = (v) => {
      const m = /rgb\((\d+)[,\s]+(\d+)[,\s]+(\d+)\)/.exec(String(v || ""));
      if (!m) return String(v || "#000000");
      return "#" + [1, 2, 3].map((i) => Number(m[i]).toString(16).padStart(2, "0")).join("");
    };

    async function loadDesigns(cards) {
      const { body } = await api("/templates");
      designs = body.templates || [];
      if (selDesign && !designs.some((d) => d.id === selDesign)) selDesign = null;
      if (!selDesign && designs.length) selDesign = designs[0].id;
      drawDesignSection(cards);
    }

    /** Create a design and open the designer on it straight away. */
    async function newDesign(cards, name) {
      const { body: r } = await api("/templates", {
        method: "POST", body: JSON.stringify({ name: name || "Untitled design" }),
      });
      if (!r.ok) return void toast(r.error || "Couldn't create it");
      selDesign = r.template.id;
      dsMode = "design";
      await loadDesigns(cards);
    }

    function drawDesignSection(cards) {
      const live = cards.filter((c) => !c.archived_at);
      if (!selCard && live.length) selCard = live[0].id;
      // The target picker: a saved design, or somebody's real card.
      $("#ds-target").innerHTML = \`
        <div class="seg2">
          <button type="button" data-mode="design" class="\${dsMode === "design" ? "on" : ""}">A saved design</button>
          <button type="button" data-mode="card" class="\${dsMode === "card" ? "on" : ""}">A shop's card</button>
        </div>
        \${dsMode === "design"
          ? (designs.length
              ? '<select id="ds-pick">' + designs.map((d) =>
                  '<option value="' + d.id + '"' + (d.id === selDesign ? " selected" : "") + ">" + esc(d.name) + "</option>").join("") + "</select>" +
                '<button class="btn btn-ghost cbtn" id="ds-new" style="margin:0">+ New</button>' +
                '<button class="btn btn-ghost cbtn" id="ds-del" style="margin:0">Delete</button>'
              : '<button class="btn btn-dark cbtn" id="ds-new" style="margin:0;padding:10px 14px">Start a design</button>')
          : (live.length
              ? '<select id="ds-cardpick">' + live.map((c) =>
                  '<option value="' + c.id + '"' + (c.id === selCard ? " selected" : "") + ">" + esc(c.name) + "</option>").join("") + "</select>"
              : '<span class="flags">No shops yet.</span>')}\`;

      $("#ds-target").querySelectorAll("[data-mode]").forEach((b) => {
        b.onclick = () => { dsMode = b.dataset.mode; drawDesignSection(cards); };
      });
      const pick = $("#ds-pick");
      if (pick) pick.onchange = () => { selDesign = pick.value; drawDesignSection(cards); };
      const cpick = $("#ds-cardpick");
      if (cpick) cpick.onchange = () => { selCard = cpick.value; drawDesignSection(cards); };
      const nw = $("#ds-new");
      if (nw) nw.onclick = () => newDesign(cards);
      const del = $("#ds-del");
      if (del) armBtn(del, "Tap again to delete", async () => {
        await api("/templates/" + selDesign, { method: "DELETE" });
        selDesign = null;
        loadDesigns(cards);
      });

      if (dsMode === "design") drawDesignEditor(cards);
      else drawCardEditor(cards);
    }

    /** The shared panel, mounted on a saved design. */
    function drawDesignEditor(cards) {
      const host = $("#ds-editor");
      const push = $("#ds-push");
      const d = designs.find((x) => x.id === selDesign);
      if (!d) {
        push.innerHTML = "";
        host.innerHTML = '<div class="dsempty">Start a design and the full designer opens here — ' +
          "upload a logo, we read the colours out of it, and you set the card, band and stamps.</div>";
        return;
      }
      mountDesigner(host, {
        id: d.id,
        shopName: d.name, name: d.name, reward: d.reward,
        stampsTarget: d.stamps_target, stampsStart: d.stamps_start,
        averageSpend: 0, signupMessage: d.signup_message,
        bg: rgbHex(d.bg), fg: rgbHex(d.fg), label: rgbHex(d.label_color),
        accent: rgbHex(d.accent_color), bandColor: rgbHex(d.band_color),
        bandTexture: d.band_texture, stampStyle: d.stamp_style,
        logoVersion: d.has_logo ? d.art_version : 0,
        bannerVersion: d.has_banner ? d.art_version : 0,
        // A design has no passes, so there is no older target it still owes a
        // grid for. On a real card below, this is populated and matters.
        targetsInUse: [],
      }, {
        path: (suffix) => "/design/" + d.id + suffix,
        artUrl: (kind, v) => "/admin/api/templates/" + d.id + "/" + kind + ".png" + (v ? "?v=" + v : ""),
        // In nobody's wallet yet, so the save confirmation has no number to name.
        customersPath: null,
        onRulesSaved: () => loadDesigns(cards),
      });
      drawPush(cards, d);
    }

    /** The same panel, mounted on a merchant's live card. */
    async function drawCardEditor(cards) {
      const host = $("#ds-editor");
      $("#ds-push").innerHTML = "";
      if (!selCard) { host.innerHTML = '<div class="dsempty">No shops to design for yet.</div>'; return; }
      host.innerHTML = '<div class="dsempty">Loading…</div>';
      const { body } = await api("/card/" + selCard + "/design-state");
      if (!body.ok) { host.innerHTML = '<div class="dsempty">Couldn\\'t load that card.</div>'; return; }
      // Guard against a slow response landing after the picker moved on.
      if (body.card.id !== selCard) return;
      mountDesigner(host, body.card, {
        path: (suffix) => "/card/" + body.card.id + "/design" + suffix,
        artUrl: (kind, v) => "/c/" + body.card.id + "/art/" + kind + ".png" + (v ? "?v=" + v : ""),
        // A real card has real holders, and the save confirmation names them.
        customersPath: "/card/" + body.card.id + "/counts",
        onRulesSaved: () => load(),
      });
    }

    /**
     * One mount point for both, so the two can never be given different panels.
     * Only path, artUrl, customersPath and the follow-up differ; every flag
     * below is the same either way.
     */
    function mountDesigner(host, card, env) {
      host.innerHTML = "";
      const wrap = document.createElement("div");
      wrap.className = "designhost";
      wrap.appendChild(designPanel(card, {
        api, toast, modal, info,
        ...env,
        // Open, not folded: on the dashboard design is a set-it-once job behind
        // the rules, but here the design IS the job.
        designOpen: true,
        // The console does not set a card's TERMS. The fields still exist and
        // are seeded from the card — the preview and the stamp renderer read
        // them — but they are hidden and never editable, so a save can only
        // write them back unchanged. The shop name stays editable.
        showDetails: false,
        rulesSaveLabel: "Save name",
        rulesNote: "",
      }));
      host.appendChild(wrap);
    }

    /** Push a saved design onto a live card. Look only — never the terms. */
    function drawPush(cards, d) {
      const host = $("#ds-push");
      const live = cards.filter((c) => !c.archived_at);
      if (!live.length) { host.innerHTML = ""; return; }
      host.innerHTML = \`
        <strong style="font-size:.9rem">Push "\${esc(d.name)}" onto a shop's card</strong>
        <div class="flags" style="margin-top:4px">Colours, band and stamps only — their reward and
          stamp count are left exactly as they are.</div>
        <div class="row">
          <select id="ds-pushto">\${live.map((c) => '<option value="' + c.id + '">' + esc(c.name) + "</option>").join("")}</select>
          <button class="btn btn-dark" id="ds-go">Push design</button>
        </div>\`;
      // Two taps: it changes a card already in customers' wallets.
      armBtn($("#ds-go"), "Tap again to push", async () => {
        const cardId = $("#ds-pushto").value;
        const card = cards.find((c) => c.id === cardId);
        const btn = $("#ds-go");
        btn.disabled = true; btn.textContent = "Pushing…";
        // The grid is re-rendered here for THIS card's target: a saved design
        // cannot know how many stamps the card it lands on needs, and the push
        // deliberately does not change that number.
        const target = card.stamps_target || 10;
        const bannerUrl = d.has_banner
          ? "/admin/api/templates/" + d.id + "/banner.png?v=" + d.art_version
          : "";
        const backdrop = await loadImg(bannerUrl);
        const strips = [];
        for (let n = 0; n <= target; n++) {
          strips.push({
            filled: n,
            png: pushStrip(n, target, d.stamp_style || "dot", rgbHex(d.bg), rgbHex(d.accent_color), backdrop).split(",")[1],
          });
        }
        const { body: r } = await api("/card/" + cardId + "/apply-template", {
          method: "POST", body: JSON.stringify({ templateId: d.id, strips }),
        });
        btn.disabled = false; btn.textContent = "Push design";
        if (r.ok) { toast("Pushed to " + card.name + " ✓"); setTimeout(load, 1200); }
        else toast(r.error || "Push failed");
      });
    }

    // Decodes a dataURL/URL so it can be composited. Resolves to null on
    // failure rather than rejecting — a missing band must never block a push.
    function loadImg(src) {
      return new Promise((resolve) => {
        if (!src) return resolve(null);
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => resolve(null);
        im.src = src;
      });
    }

    /**
     * The stamp grid for a PUSH, drawn at the target card's own stamp count.
     *
     * Same geometry as the shared designer's drawStampStrip — @2x storeCard
     * strip, two rows, 40px clear margin, short last row centred — but it
     * cannot call that one: it lives inside designPanel's closure and reads the
     * live colour pickers, and a push renders from a stored design against a
     * card that is not open in the editor.
     */
    function pushStrip(filled, target, icon, bg, accent, backdrop) {
      const W = 750, H = 246, M = 40;
      const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
      const x = cv.getContext("2d");
      x.fillStyle = bg; x.fillRect(0, 0, W, H);
      if (backdrop && backdrop.naturalWidth > 0) {
        const k = Math.max(W / backdrop.naturalWidth, H / backdrop.naturalHeight); // cover
        const bw = backdrop.naturalWidth * k, bh = backdrop.naturalHeight * k;
        x.drawImage(backdrop, (W - bw) / 2, (H - bh) / 2, bw, bh);
      }
      const rows = target > 1 ? 2 : 1, cols = Math.max(1, Math.ceil(target / 2));
      const cw = (W - M * 2) / cols, ch = (H - M * 2) / rows;
      const r = Math.min(cw, ch) * 0.34;
      const perRow = Math.ceil(target / rows);
      for (let i = 0; i < target; i++) {
        const rowN = Math.floor(i / perRow), col = i % perRow;
        const inRow = Math.min(perRow, target - rowN * perRow);
        const cx = (W - cw * inRow) / 2 + cw * col + cw / 2, cy = M + ch * rowN + ch / 2;
        const on = i < filled;
        if (icon === "dot" || !icon) {
          x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2);
          x.fillStyle = accent; x.globalAlpha = on ? 1 : .25; x.fill(); x.globalAlpha = 1;
        } else {
          x.font = (r * 1.9) + "px serif"; x.textAlign = "center"; x.textBaseline = "middle";
          x.globalAlpha = on ? 1 : .25; x.fillText(icon, cx, cy); x.globalAlpha = 1;
        }
      }
      return cv.toDataURL("image/png");
    }

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
      const live = merchants.filter((m) => !m.archived_at);
      const money = (m, n) => m.currency + Math.round(n).toLocaleString();

      // Worst first, not alphabetical. A console sorted by name makes you read
      // every row to find the one that needs you, which is this page's job.
      const ranked = [...merchants].sort((a, b) => {
        const sev = (x) => x.flags.length ? ({ critical: 0, warn: 1, info: 2 })[x.flags[0].severity] : 9;
        return sev(a) - sev(b) || b.flags.length - a.flags.length
          || new Date(b.created_at) - new Date(a.created_at);
      });
      const needing = ranked.filter((m) => m.flags.length && !m.archived_at);
      const archivedMerchants = ranked.filter((m) => m.archived_at);
      const chips = (m) => m.flags
        .map((f) => '<span class="chipf ' + f.severity + '">' + esc(f.label) + "</span>").join("");

      const merchantRow = (m) => {
        const left = m.trialLeft;
        const v = m.value;
        return \`
        <tr class="mrow" data-m="\${m.id}">
          <td>
            <span class="mname">\${esc(m.name)}</span>\${m.archived_at ? ' <span class="arch">archived</span>' : ""}
            <br><span class="flags">\${esc(m.owners || "no owner")}</span>
          </td>
          <td>\${m.stage === "unclaimed" ? '<span class="chipf info">not claimed</span>'
            : !m.first_stamp_at ? '<span class="flags">not started</span>'
            : left < 0 ? '<span class="bad">ended ' + Math.abs(left) + "d ago</span>"
            : "day " + m.trial_day + "/${TRIAL_DAYS}"}</td>
          <td class="\${m.first_stamp_at ? "" : "bad"}">
            \${m.first_stamp_at ? ago(m.first_stamp_at) : "not yet"}
            \${m.first_stamp_at ? "" : '<br><span class="flags">' + m.trial_day + "d waiting</span>"}
          </td>
          <td class="\${stale(m.last_stamp_at, 7) ? "bad" : ""}">\${ago(m.last_stamp_at)}</td>
          <td>\${m.customers}<br><span class="flags">\${m.active_7d} this week</span></td>
          <td>\${m.stamps_7d} / \${m.stamps_30d}
            <br><span class="flags">\${m.stamps_prev_7d ? (m.stamps_7d >= m.stamps_prev_7d ? "▲" : "▼") + " vs " + m.stamps_prev_7d : "—"}</span></td>
          <td>\${v.hasBasket ? money(m, v.spendThroughCard) : "—"}
            <br><span class="flags">\${m.redemptions} reward\${m.redemptions === 1 ? "" : "s"}</span></td>
          <td class="\${stale(m.last_owner_login, 30) ? "bad" : ""}">\${ago(m.last_owner_login)}</td>
          <td>\${chips(m) || '<span class="flags">—</span>'}</td>
        </tr>
        <tr class="mdetail" data-d="\${m.id}" style="display:none"><td colspan="9"></td></tr>\`;
      };

      const MERCHANT_HEAD = \`<tr>
        <th>Shop</th><th>Trial</th><th>Activated</th><th>Last stamp</th>
        <th>Customers</th><th>Stamps 7d/30d</th><th>Value</th><th>Owner seen</th><th>Problems</th>
      </tr>\`;

      // ---- one merchant, four questions in the order you would ask them ------
      const retById = new Map((body.retention || []).map((r) => [r.id, r]));

      /**
       * The sign-up funnel as a funnel: a bar per step, and the DROP between
       * steps, which is the thing actually being read. It was six numbers in a
       * list, leaving you to do the subtraction yourself and never showing
       * which gap was the big one.
       */
      function funnelHtml(m) {
        const steps = [
          ["Opened sign-up", m.scanned],
          ["Tapped Add", m.clicked],
          ["Card made", m.made],
          ["Landed in wallet", m.landed],
        ];
        const top = Math.max(1, ...steps.map((x) => x[1]));
        return '<div class="fnl">' + steps.map(([label, n], i) => {
          const prev = i ? steps[i - 1][1] : null;
          // Only a drop is worth naming, and only when there was enough at the
          // step above to mean anything — "−100%" off a single visitor is noise.
          const drop = prev && prev >= 5 && n < prev ? Math.round((1 - n / prev) * 100) : null;
          return '<span class="fl">' + label + "</span>" +
            '<span><span class="fb ' + (n ? "" : "zero") + '" style="width:' +
              Math.max(2, Math.round((n / top) * 100)) + '%"></span></span>' +
            '<span class="fv">' + n + (drop === null ? "" :
              ' <span class="fd' + (drop >= 50 ? " bad" : "") + '">−' + drop + "%</span>") + "</span>";
        }).join("") + "</div>";
      }
      function detailHtml(m) {
        const v = m.value;
        const ret = retById.get(m.id) || {};
        const staffRows = (body.staff || []).filter((s) => s.merchant_id === m.id);
        const cards = (body.cards || []).filter((c) => m.card_ids.includes(c.id));
        // Silent when nothing is wrong, which is most of the time. The old
        // "Counter & engagement" panel listed these eight numbers whether or not
        // any of them meant anything.
        const wrong = [];
        if (m.pin_failed_24h) wrong.push(m.pin_failed_24h + " failed staff PINs today");
        if (m.lookup_failed_7d >= 5) wrong.push(m.lookup_failed_7d + " codes matched nothing this week");
        if (m.messages_failed) wrong.push(m.messages_failed + " messages never arrived");
        if (m.staff_devices === 1 && m.stamps >= 20) wrong.push("only one staff phone has ever stamped");
        if (m.unclaimed_rewards >= 3) wrong.push(m.unclaimed_rewards + " rewards earned and not handed over");
        const noFunnel = new Date(m.signed_up_at) < new Date("${FUNNEL_SINCE}");
        return \`
        <div class="dgrid">
          <div class="dpanel">
            <h4><span class="qn">1</span>Did they start?\${info("Activated means the first stamp given to a real customer at the counter — not signing up, not issuing a card. Nothing else on this page means anything until it says yes.")}</h4>
            <dl>
              <dt>Signed up</dt><dd>\${ago(m.signed_up_at)}</dd>
              <dt>Activated</dt><dd class="\${m.first_stamp_at ? "" : "bad"}">\${m.first_stamp_at ? ago(m.first_stamp_at) : "never"}</dd>
              <dt>Took</dt><dd>\${days(m.signed_up_at, m.first_stamp_at)}</dd>
              <dt>Poster opened</dt><dd class="\${m.poster_views ? "" : "bad"}">\${m.poster_views ? m.poster_views + "×" : "never"}</dd>
              <dt>Counter visits</dt><dd>\${m.stamps}</dd>
              <dt>Last stamp</dt><dd class="\${stale(m.last_stamp_at, 7) ? "bad" : ""}">\${ago(m.last_stamp_at)}</dd>
            </dl>
          </div>

          <div class="dpanel">
            <h4><span class="qn">2</span>Are people signing up?\${info("This is acquisition, not health — it names WHICH step is losing people. A drop from opened to tapped is the sign-up page; from made to landed is the wallet's own Add sheet. A QR scan and a tapped link both arrive as an ordinary page view, so the split comes from a tag on the poster QR and the share link; anything untagged, including posters printed before the tag existed, counts as untagged rather than lost.")}</h4>
            \${funnelHtml(m)}
            <dl style="margin-top:10px">
              <dt style="padding-left:12px" class="flags">poster · link · untagged</dt>
              <dd class="flags">\${m.opened_poster} · \${m.opened_link} · \${m.opened_other}</dd>
              <dt>Deleted / dropped</dt><dd>\${m.removed} / \${m.dropped}</dd>
            </dl>
            \${noFunnel ? \`<p class="dnote"><strong>Predates the funnel.</strong> Page opens and Add
              taps have only been recorded since ${FUNNEL_SINCE_LABEL}, so cards issued before then
              show as zeroes above. Missing history, not a broken flow.</p>\` : ""}
          </div>

          <div class="dpanel">
            <h4><span class="qn">3</span>Do customers come back?\${info("Retention, counted per PERSON and per net stamp: someone holding an Apple and a Google card is one customer, and a staff undo takes its visit back off. This is the number a renewal turns on — a shop whose customers never return a second time is paying for a card nobody uses.")}</h4>
            <dl>
              <dt>Customers who ever got a stamp</dt><dd>\${ret.started ?? 0}</dd>
              <dt>Came back a 2nd time</dt><dd>\${pct(ret.second_visit_rate)}</dd>
              <dt>…a 3rd</dt><dd>\${pct(ret.third_visit_rate)}</dd>
              <dt>Finished a card</dt><dd>\${pct(ret.completion_rate)}</dd>
              <dt>Days between visits</dt><dd>\${num(ret.median_gap_days, 1)}</dd>
              <dt>Still active 30/60/90</dt><dd>\${pct(ret.alive_30)} · \${pct(ret.alive_60)} · \${pct(ret.alive_90)}</dd>
              <dt>Nudged → came back</dt><dd>\${m.nudged ? m.nudge_returned + " of " + m.nudged : "—"}</dd>
            </dl>
          </div>

          <div class="dpanel">
            <h4><span class="qn">4</span>Is it worth anything?\${info("Counter visits × the shop's OWN self-reported average basket. A countable number times one assumption — and deliberately not incremental: some of these people would have come in anyway, and there is no way to see the counterfactual. Free welcome stamps and the reset after a reward emit no event, so they have never been in it. Blank means they never told us their basket.")}</h4>
            <dl>
              <dt>Spend through the card</dt><dd>\${v.hasBasket ? money(m, v.spendThroughCard) : "no basket set"}</dd>
              <dt>Spend per reward</dt><dd>\${v.hasBasket ? money(m, v.spendPerReward) : "—"}</dd>
              <dt>Rewards given</dt><dd>\${v.rewardsGiven}</dd>
              <dt>Rewards owed</dt><dd class="\${m.unclaimed_rewards >= 3 ? "bad" : ""}">\${m.unclaimed_rewards}</dd>
              <dt>Owner logins (30d)</dt><dd>\${m.logins_30d}</dd>
              <dt>Made it theirs\${info("Whether the owner has ever changed their own card. Unprompted configuration is the clearest evidence a merchant considers the thing theirs, and it is the closest signal to willingness-to-pay there is before money changes hands.")}</dt>
              <dd>\${m.card_edits ? m.card_edits + " edits, last " + ago(m.last_card_edit_at) : "never touched it"}</dd>
            </dl>
          </div>
        </div>

        \${wrong.length
          ? '<p class="badline">Wrong right now: ' + wrong.map(esc).join(" · ") + "</p>"
          : '<p class="okline">Nothing broken: staff can sign in, codes match, messages arrive.</p>'}

        \${staffRows.length ? \`<details class="fold" style="margin-top:12px">
          <summary>Counter phones (\${staffRows.length})\${info("A PHONE, not a person — signing out and back in mints a new id, and changing the PIN resets them all. Rewards is flagged when one phone hands out rewards on more than 30% of the stamps it adds; that is the shape free-coffee-for-friends takes.")}</summary>
          <div class="tw"><table>
            <tr><th>Phone</th><th>Stamps</th><th>Rewards</th><th>Undos</th><th>Forced</th><th>Last seen</th></tr>
            \${staffRows.map((s) => \`<tr>
              <td class="nfc">\${esc(s.actor.replace("staff:", ""))}</td><td>\${s.stamps}</td>
              <td class="\${s.stamps >= 10 && s.redeems / s.stamps > 0.3 ? "bad" : ""}">\${s.redeems}</td>
              <td>\${s.undos}</td><td>\${s.forced}</td><td>\${ago(s.last_seen)}</td>
            </tr>\`).join("")}
          </table></div>
        </details>\` : ""}

        <details class="fold" style="margin-top:10px">
          <summary>Every change they have made (\${m.card_edits})</summary>
          <div data-edits="\${m.id}" class="flags">Loading…</div>
        </details>

        \${m.stage === "unclaimed" ? \`<div class="dpanel" style="margin-top:14px">
          <h4>Claim link\${info("Sending this hands the shop over: whoever opens it makes the login. It works once, lasts 7 days, and is shown here only when it is minted — we store a hash, so it can never be read back. Sending a new one replaces the old, which is also how you withdraw one that went to the wrong person.")}</h4>
          <div class="flags">Nobody has claimed this shop. Until they do there is no login, no
            staff PIN, and their sign-up page stays closed — so no customer can be given a card
            that nobody could stamp.</div>
          <div class="rst" style="margin-top:8px">
            <button class="btn btn-dark cbtn" data-claimlink="\${m.id}">Make a claim link</button>
            \${m.claim_expires ? '<button class="btn btn-ghost dbtn" data-claimdrop="' + m.id + '">Withdraw the current one</button>' : ""}
          </div>
          \${m.claim_expires ? '<div class="flags" style="margin-top:6px">A link is out, good until ' +
            new Date(m.claim_expires).toLocaleDateString([], { day: "numeric", month: "short" }) + ".</div>" : ""}
          <div data-claimout="\${m.id}"></div>
        </div>\` : ""}

        <div class="dpanel" style="margin-top:14px">
          <h4>Contact &amp; actions</h4>
          <div class="flags" style="margin-bottom:8px">
            Sign-up link: <span class="nfc">\${origin}/j/\${m.id}</span>
          </div>
          <div class="rst" style="margin-top:0">
            <button class="btn btn-ghost cbtn" data-nfc="\${origin}/j/\${m.id}">Copy link</button>
            \${cards.map((c) => '<a class="btn btn-ghost cbtn" target="_blank" href="/c/' + c.id + '/poster">Poster</a>').join("")}
            \${cards.map((c) => '<a class="btn btn-ghost cbtn" target="_blank" href="/admin/card/' + c.id + '/sheet">Counter sheet</a>').join("")}
            \${cards.filter((c) => !c.archived_at).map((c) =>
              '<button class="btn btn-ghost cbtn" data-design="' + c.id + '">Design their card</button>').join("")}
            \${m.archived_at
              ? '<button class="btn btn-ghost dbtn" data-munarchive="' + m.id + '">Restore shop</button>'
              : '<button class="btn btn-ghost dbtn" data-marchive="' + m.id + '">Archive shop</button>'}
          </div>
          <label style="margin-top:12px">Phone</label>
          <input data-phone="\${m.id}" value="\${esc(m.contact_phone)}" placeholder="Who to ring">
          <label style="margin-top:8px">Notes</label>
          <input data-note="\${m.id}" value="\${esc(m.contact_note)}" placeholder="Anything worth remembering">
          <button class="btn btn-ghost cbtn" data-savecontact="\${m.id}" style="margin-top:8px">Save contact</button>
          \${cards.length ? \`<div class="flags" style="margin-top:12px">
            Programme\${cards.length === 1 ? "" : "s"}, for the NFC sticker\${info("The Add-to-Wallet URL to program onto an NFC sticker. You set these up for merchants; they never see it. A card id is printed on posters and baked into every Android card ever issued from it, so archiving is the only safe retirement — nothing is deleted and cards already in wallets keep stamping.")}
            \${cards.map((c) => '<div style="margin-top:6px"><span class="nfc">' + origin + (c.id === "default" ? "/" : "/c/" + c.id) + "</span> " +
              '<button class="btn btn-ghost cbtn" data-nfc="' + origin + (c.id === "default" ? "/" : "/c/" + c.id) + '">Copy</button> ' +
              (c.archived_at
                ? '<button class="btn btn-ghost dbtn" data-unarchive="' + c.id + '">Restore</button>'
                : '<button class="btn btn-ghost dbtn" data-archive="' + c.id + '">Archive</button>') + "</div>").join("")}
          </div>\` : ""}
        </div>\`;
      }

      const owners = body.owners || [];

      // ---- how everyone is doing --------------------------------------------
      // Summed over LIVE shops only: an archived account is closed, not broken,
      // and leaving it in would drag every portfolio figure down for a reason
      // that has nothing to do with the product.
      const sum = (k) => live.reduce((a, m) => a + (m[k] || 0), 0);
      // The three states a shop can be in, and they are mutually exclusive.
      const never = live.filter((m) => !m.first_stamp_at);
      const quiet = live.filter((m) => m.first_stamp_at && m.stamps_7d === 0);
      const active = live.filter((m) => m.stamps_7d > 0);
      const pctOf = (n) => live.length ? (n / live.length) * 100 : 0;
      const s7 = sum("stamps_7d"), sPrev = sum("stamps_prev_7d");
      const trend = sPrev ? Math.round(((s7 - sPrev) / sPrev) * 100) : null;
      const newShops = live.filter((m) => Date.now() - new Date(m.signed_up_at).getTime() < 30 * 86400000).length;
      // Money only counts shops that actually told us their basket — averaging
      // in a zero from everyone else would understate it and look like a bug.
      const withBasket = live.filter((m) => m.value.hasBasket);
      const spend = withBasket.reduce((a, m) => a + m.value.spendThroughCard, 0);
      const cur = live[0] ? live[0].currency : "RM";
      const perShop = withBasket.length
        ? [...withBasket].map((m) => m.value.spendThroughCard).sort((a, b) => a - b)[Math.floor(withBasket.length / 2)]
        : 0;
      const plat = body.platform || {};

      $("#app").innerHTML = \`
        <h1>Merchant health</h1>
        <p class="purpose">Get every shop from signed up → stamping → still stamping in 30 days → paying.
          Read top to bottom: what is alive, who needs a call, then any shop in full.</p>

        <h2 style="margin-top:22px">How everyone is doing\${info("The whole book on four lenses, before any single shop. Archived shops are left out of all four — a closed account is not evidence about the product.")}</h2>
        <div class="pstrip">
          <div class="ppanel">
            <h3>Health\${info("Where every live shop sits. Never started means not one stamp has ever been given at their counter. Gone quiet means they were stamping and have not this week — the single best predictor of churn.")}</h3>
            <div class="lifebar">
              <i class="live" style="width:\${pctOf(active.length)}%"></i>
              <i class="quiet" style="width:\${pctOf(quiet.length)}%"></i>
              <i class="dead" style="width:\${pctOf(never.length)}%"></i>
            </div>
            <div class="lifekey">
              <span><i class="live"></i><b>\${active.length}</b> stamping now</span>
              <span><i class="quiet"></i><b>\${quiet.length}</b> gone quiet</span>
              <span><i class="dead"></i><b>\${never.length}</b> never started</span>
            </div>
            <p class="foot">\${live.length} live shop\${live.length === 1 ? "" : "s"}\${needing.length ? " · " + needing.length + " need you today" : " · nothing needs you"}</p>
          </div>

          <div class="ppanel">
            <h3>Performance\${info("Counter activity across the book. Stamps are net of undos, and free welcome stamps have never been in them — one stamp is one real visit.")}</h3>
            <dl>
              <dt>Stamps this week</dt><dd class="big">\${s7}</dd>
              <dt>vs last week</dt>
              <dd class="\${trend === null ? "" : trend >= 0 ? "up" : "down"}">\${trend === null ? sPrev : (trend >= 0 ? "▲ " : "▼ ") + Math.abs(trend) + "% (" + sPrev + ")"}</dd>
              <dt>Customers active this week</dt><dd>\${sum("active_7d")}</dd>
              <dt>Cards in wallets</dt><dd>\${live.reduce((a, m) => a + Math.max(0, m.landed - m.removed), 0)}</dd>
              <dt>New shops (30d)</dt><dd>\${newShops}</dd>
            </dl>
          </div>

          <div class="ppanel">
            <h3>Value\${info("What the book delivered, in money: counter visits times each shop's OWN self-reported basket. A countable number times one assumption, and not incremental — some of these people would have come anyway.")}</h3>
            <dl>
              <dt>Spend through cards</dt><dd class="big">\${cur}\${Math.round(spend).toLocaleString()}</dd>
              <dt>Median per shop</dt><dd>\${cur}\${Math.round(perShop).toLocaleString()}</dd>
              <dt>Rewards given</dt><dd>\${sum("redemptions")}</dd>
              <dt>Rewards owed</dt><dd class="\${sum("unclaimed_rewards") ? "down" : ""}">\${sum("unclaimed_rewards")}</dd>
            </dl>
            <p class="foot">\${withBasket.length} of \${live.length} shop\${live.length === 1 ? "" : "s"} set a basket; the rest are not in the money figures.</p>
          </div>

          <div class="ppanel">
            <h3>Retention\${info("Recomputed across every live shop's customers at once, not averaged from the per-shop rates — a rate over 3 customers and a rate over 300 do not average into anything. Counted per person, and per net stamp.")}</h3>
            <dl>
              <dt>Came back a 2nd time</dt><dd class="big">\${pct(plat.second_visit_rate)}</dd>
              <dt>…a 3rd</dt><dd>\${pct(plat.third_visit_rate)}</dd>
              <dt>Finished a card</dt><dd>\${pct(plat.completion_rate)}</dd>
              <dt>Still active 30/60/90</dt><dd>\${pct(plat.alive_30)} · \${pct(plat.alive_60)} · \${pct(plat.alive_90)}</dd>
            </dl>
            <p class="foot">Across \${plat.started || 0} people who have ever been stamped.</p>
          </div>
        </div>

        <h2>Needs you today\${info("Only shops with something actually wrong, worst first. The line under each name is the single most urgent thing to do about it. A healthy shop is not listed at all — that is the point.")}</h2>
        \${needing.length ? \`<div class="triage">
          \${needing.map((m) => \`
            <div class="trow \${m.flags[0].severity}">
              <div><span class="tname">\${esc(m.name)}</span></div>
              <div>
                <div>\${chips(m)}</div>
                <div class="taction">\${esc(m.flags[0].action)}</div>
              </div>
            </div>\`).join("")}
        </div>\`
          : '<div class="tclear">Nothing needs you today.</div>'}
        <details class="fold" style="margin:0 0 26px"><summary>What these problems mean</summary>
          <div class="tw"><table class="legend">
            <tr><th>Problem</th><th>Fires when</th><th>Why it matters</th></tr>
            ${FLAG_GUIDE.map((g) => `<tr><td><span class="chipf warn">${esc(g.label)}</span></td><td>${esc(g.rule)}</td><td>${esc(g.why)}</td></tr>`).join("")}
          </table></div>
        </details>

        <h2>Every shop\${info("Worst first, never alphabetical. Click any row for that shop in full. Trial counts from the account's own signup date. Value is counter visits times their self-reported basket.")}</h2>
        <div class="tw"><table>
          \${MERCHANT_HEAD}
          \${ranked.filter((m) => !m.archived_at).map(merchantRow).join("")}
        </table></div>
        \${archivedMerchants.length ? \`<details class="fold" style="margin-top:12px">
          <summary>Archived shops (\${archivedMerchants.length})\${info("Closed accounts. Nothing is deleted and every card already in a wallet keeps working — they are just out of the working list, raise no problems, and are left out of the tiles above. Restore one from inside its row.")}</summary>
          <div class="tw"><table>\${MERCHANT_HEAD}\${archivedMerchants.map(merchantRow).join("")}</table></div>
        </details>\` : ""}

        <h2 style="margin-top:34px">Card designs\${info("The same designer the owners get — logo, the colours read out of it, band and stamps. Point it at a saved design to build one for a prospect before they have an account, or straight at a shop's live card. It never changes a card's reward or stamp count; only its owner does that.")}</h2>
        <div class="dstarget" id="ds-target"></div>
        <div class="dsgrid">
          <div id="ds-editor"></div>
          <div class="dspush" id="ds-push"></div>
        </div>

        <h2 style="margin-top:34px">Build a shop\${info("Creates the business and a plain card with NO login — that is the point. Design it above, then send them a claim link from their row, and they make their own account. Nothing they get is reachable by a customer until they claim it.")}</h2>
        <div id="dfy">
          <label>Shop name</label><input id="dfy-name" placeholder="e.g. Nasi Lemak House">
          <button class="btn btn-dark" id="dfy-create">Build it</button>
        </div>
        <div id="dfy-out"></div>

        <h2>Reset a password\${info("Passwords are stored scrambled and can never be viewed. This sets a NEW temporary one to hand over.")}</h2>
        <div class="rst">
          <div><label>Owner</label><select id="who">\${owners.map((o) => '<option value="' + o.id + '">' + esc(o.email) + "</option>").join("")}</select></div>
          <button class="btn btn-dark" id="reset">Generate temp password</button>
        </div>
        <div id="tempout"></div>\`;

      // Delegated from #app, which contains the drill-downs and the designer
      // too — so one call covers markup rendered later. Once only: #app itself
      // survives every re-render, and wiring it per load stacks duplicate
      // listeners on the same element.
      if (!$("#app").dataset.infoRoot) { $("#app").dataset.infoRoot = "1"; wireInfo($("#app")); }
      loadDesigns(body.cards || []);

      // ---- merchant row: expand, and the actions inside it -------------------
      // The detail is built on first open and left in the DOM, so re-opening a
      // row is instant and the contact fields keep whatever was typed into them.
      const byMerchant = new Map(merchants.map((m) => [m.id, m]));
      document.querySelectorAll("[data-m]").forEach((tr) => {
        tr.onclick = async (e) => {
          // Anything clickable inside the detail must not toggle the row shut.
          if (e.target.closest("button, a, input, label, summary")) return;
          const id = tr.dataset.m;
          const row = document.querySelector('[data-d="' + id + '"]');
          const cell = row.firstElementChild;
          const opening = row.style.display === "none";
          row.style.display = opening ? "" : "none";
          if (opening && !cell.innerHTML) {
            cell.innerHTML = detailHtml(byMerchant.get(id));
            wireDetail(id);
            // The edit history is the only thing here that needs its own trip.
            const { body: ed } = await api("/merchant/" + id + "/edits");
            const host = cell.querySelector('[data-edits="' + id + '"]');
            if (!host) return;
            host.innerHTML = (ed.edits || []).length
              ? ed.edits.map((x) => {
                  const what = Object.entries(x.changed || {})
                    .map(([k, ch]) => k + ": " + esc(String(ch.from)) + " → " + esc(String(ch.to)))
                    .join(" · ");
                  return "<div>" + ago(x.created_at) + " — " + (what || "design") + "</div>";
                }).join("")
              : "Nothing changed since setup.";
          }
        };
      });

      /** Buttons inside a merchant's drill-down, wired when it is first built. */
      function wireDetail(id) {
        const scope = document.querySelector('[data-d="' + id + '"]');
        scope.querySelectorAll("[data-nfc]").forEach((b) => {
          b.onclick = () => { navigator.clipboard.writeText(b.dataset.nfc); b.textContent = "Copied ✓"; };
        });
        const save = scope.querySelector("[data-savecontact]");
        if (save) save.onclick = async () => {
          await api("/merchant/" + id + "/contact", { method: "POST", body: JSON.stringify({
            phone: scope.querySelector("[data-phone]").value,
            note: scope.querySelector("[data-note]").value,
          })});
          save.textContent = "Saved ✓";
        };
        // Two taps, same as archiving a card: it takes a business out of the
        // working list, and a mis-click on the wrong row is easy to make.
        const mk = scope.querySelector("[data-claimlink]");
        if (mk) mk.onclick = async () => {
          const { body: r } = await api("/merchant/" + id + "/claim-link", { method: "POST" });
          const out = scope.querySelector('[data-claimout="' + id + '"]');
          if (!r.ok) { out.textContent = r.error === "already-claimed" ? "Already claimed." : (r.error || "Failed"); return; }
          // Shown once. The hash is what is stored, so re-reading it later is
          // not something the server could do even if the page asked.
          out.innerHTML = '<div class="temp" style="margin-top:8px">' + esc(r.url) +
            '<br><button class="btn btn-ghost cbtn" data-nfc="' + esc(r.url) + '">Copy it</button>' +
            " Send this in the DM. It works once.</div>";
          out.querySelector("[data-nfc]").onclick = (e) => {
            navigator.clipboard.writeText(r.url); e.target.textContent = "Copied ✓";
          };
        };
        const drop = scope.querySelector("[data-claimdrop]");
        if (drop) armBtn(drop, "Tap again to withdraw", async () => {
          await api("/merchant/" + id + "/claim-link", { method: "DELETE" });
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
        // Jump to the designer with this shop's card already selected. Same
        // panel, same routes — the section below just changes what it points at.
        scope.querySelectorAll("[data-design]").forEach((b) => {
          b.onclick = () => {
            selCard = b.dataset.design;
            dsMode = "card";
            drawDesignSection(body.cards || []);
            $("#ds-target").scrollIntoView({ behavior: "smooth", block: "start" });
          };
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

      // ---- set a shop up ------------------------------------------------------
      // No design here any more. It used to build a card from one of six
      // hard-coded business-type presets, which was a second designer hiding in
      // a signup form; now it creates a plain card and the real designer above
      // opens on it.
      $("#dfy-create").onclick = async () => {
        const cafeName = $("#dfy-name").value.trim();
        if (!cafeName) return void ($("#dfy-out").textContent = "Enter a shop name.");
        $("#dfy-create").disabled = true; $("#dfy-out").textContent = "Building…";
        const { body: r } = await api("/card", { method: "POST", body: JSON.stringify({ cafeName }) });
        $("#dfy-create").disabled = false;
        if (r.ok) {
          // No email, no password, no PIN — there is no account yet, and that is
          // deliberate. They make their own when they claim it.
          $("#dfy-out").innerHTML = '<div class="temp">Built <strong>' + esc(cafeName) + "</strong>. " +
            "Design their card above, then send them a claim link from their row below.</div>";
          $("#dfy-name").value = "";
          // Hand straight to the designer, pointed at the card just made.
          selCard = r.cardId;
          dsMode = "card";
          setTimeout(load, 1200);
        } else {
          $("#dfy-out").textContent = r.error || "Failed";
        }
      };
      $("#reset").onclick = async () => {
        const { body: r } = await api("/owner/" + $("#who").value + "/reset-password", { method: "POST" });
        if (r.ok) $("#tempout").innerHTML = '<div class="temp">New password for <strong>' + esc(r.email) + '</strong>: <strong>' + r.tempPassword + '</strong><br>Give it to them; they can change it in their dashboard.</div>';
        else $("#tempout").textContent = r.error || "Failed";
      };
    }
    load();
  `;
  return page(
    "Stampy — Admin",
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
    "Stampy — Setup status",
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
      </ul>
      <hr style="border:none;border-top:1px solid var(--line);margin:16px 0">
      <p><strong>Apple — can issue cards:</strong> ${s.canSignPasses ? "YES ✅" : "not yet"}</p>
      <p><strong>Apple — can push updates:</strong> ${s.canPush ? "YES ✅" : "not yet"}</p>
      <p><strong>Google Wallet (Android):</strong> ${s.canGoogleWallet ? "YES ✅" : "not yet"}</p>
      <p><strong>Email (password resets):</strong> ${s.canEmail ? "YES ✅" : "not yet"}</p>
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
        <p class="sub">Choose a new password for your Stampy account.</p>
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
    "Stampy — Reset password",
    `<div class="card" id="app"><p class="sub">Loading…</p></div><div class="toast"></div>`,
    "",
    js,
  );
}
