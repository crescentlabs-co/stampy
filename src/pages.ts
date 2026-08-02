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
    font-family: "Space Grotesk";
    font-style: normal;
    font-weight: 400 700;
    font-display: swap;
    src: url("/assets/fonts/space-grotesk-latin.woff2") format("woff2");
  }
  :root {
    /* Stone & Sage: cool light neutral + muted sage accent, paired with Space Grotesk. */
    --bg: #f0f1ed; --surface: #ffffff; --ink: #20211d; --ink2: #2f312b;
    --muted: #888d83; --line: #e3e5df; --field-border: #cdd0c8; --ghost-bg: #e7e9e3;
    --accent: #6f8567; --accent-dark: #5c7156;
    --r: 16px; --r-lg: 22px;
    --shadow: 0 10px 30px -14px rgba(32,33,29,.20), 0 2px 6px rgba(32,33,29,.07);
    --display: "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    --body: "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
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
    background: var(--surface); border-radius: var(--r-lg); padding: 28px 26px;
    box-shadow: var(--shadow); width: 100%; max-width: 440px;
  }
  h1 { font-family: var(--display); font-weight: 700; font-size: 1.7rem; letter-spacing: -.015em; margin-bottom: 10px; text-wrap: balance; }
  h2 { font-family: var(--display); font-weight: 700; font-size: 1.15rem; letter-spacing: -.01em; margin: 24px 0 8px; }
  p.sub { color: var(--muted); margin-bottom: 22px; }
  .btn {
    display: block; width: 100%; text-align: center; padding: 15px 20px;
    border-radius: 14px; border: none; font-size: 1.02rem; font-weight: 600;
    cursor: pointer; text-decoration: none;
  }
  .btn-dark { background: var(--ink); color: #fff; }
  .btn-stamp { background: var(--ink); color: #fff; }
  .btn-ghost { background: var(--ghost-bg); color: var(--ink); }
  .btn { transition: transform .09s ease, filter .15s ease; }
  .btn:active { transform: scale(.985); }
  .btn:disabled { opacity: .45; cursor: not-allowed; }
  @media (prefers-reduced-motion: reduce) { .btn { transition: none; } .btn:active { transform: none; } }
  .muted { color: var(--muted); font-size: .85rem; }
  input, textarea, select {
    width: 100%; padding: 13px 14px; border: 1px solid var(--field-border); border-radius: 12px;
    font-size: 1rem; font-family: inherit; background: var(--surface); color: var(--ink);
  }
  input:focus, textarea:focus, select:focus { outline: 2px solid var(--accent); outline-offset: 1px; border-color: transparent; }
  label { font-size: .8rem; color: var(--muted); display: block; margin: 14px 0 6px; }
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
    .row3 label { font-size: .78rem; line-height: 1.25; }
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
          <div><label>Welcome stamps\${info("Stamps a new card starts with — and where a card restarts after a reward, so a regular is never worse off than a first-timer.")}</label><input data-f="stampsStart" type="number" min="0" max="19" value="\${c.stampsStart}"></div>
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

export function notReadyPage(): string {
  return page(
    "Not ready yet",
    `<div class="card" style="text-align:center">
      <h1>Hang tight ☕️</h1>
      <p class="sub">This card isn’t ready to issue yet. Apple certificates are still being set up — check <a href="/setup">/setup</a>.</p>
    </div>`,
  );
}

// ----------------------------------------------------------- marketing ----

/**
 * The product front door at `/` — a one-scroll, problem-first pitch for café
 * owners. Static (boots with zero secrets); themed with the same tokens +
 * Space Grotesk as the dashboard. Early-access framing (Apple/Google still
 * finishing), so every CTA leads to the owner sign-up at /dashboard.
 */
export function marketingPage(): string {
  const css = /* css */ `
    /* Space Mono carries every small label, tag and receipt on this page.
       Same inline-declaration rationale as the base font: unique filenames
       cache safely behind the immutable assets mount. */
    @font-face {
      font-family: "Space Mono";
      font-style: normal;
      font-weight: 400;
      font-display: swap;
      src: url("/assets/fonts/space-mono-latin-400.woff2") format("woff2");
    }
    @font-face {
      font-family: "Space Mono";
      font-style: normal;
      font-weight: 700;
      font-display: swap;
      src: url("/assets/fonts/space-mono-latin-700.woff2") format("woff2");
    }
    :root {
      --canvas: #131109; --panel-d: #1d2316; --panel-d2: #2b341d;
      --cream: #f4f2ec; --cream-soft: rgba(244,242,236,.64); --cream-line: rgba(244,242,236,.14);
      --lime: #c9e792; --lime-soft: rgba(201,231,146,.13); --lime-line: rgba(201,231,146,.28);
      --sage: #6f8567; --sage-dark: #5c7156; --sage-br: #a9c398; --ink-soft: #54574e;
      --paper: #efe8d7; --paper-ink: #57503f; --paper-line: #c9bfa4;
      --mono: "Space Mono", ui-monospace, "SF Mono", Menlo, monospace;
    }
    html { scroll-behavior: smooth; }
    @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
    body { display: block; padding: 0; align-items: stretch; background: var(--canvas); }
    ::selection { background: var(--sage); color: #fff; }
    /* registration ticks on the page edges, like a print sheet */
    body::before, body::after {
      content: ""; position: fixed; top: 0; bottom: 0; width: 12px; z-index: 1; pointer-events: none;
      background: repeating-linear-gradient(to bottom, transparent 0 13px, rgba(244,242,236,.22) 13px 14px);
    }
    body::before { left: 6px; } body::after { right: 6px; }
    @media (max-width: 1279px) { body::before, body::after { display: none; } }
    .stack { max-width: 1180px; margin: 0 auto; padding: 12px; display: flex; flex-direction: column; gap: 12px; position: relative; z-index: 2; }
    .panel { border-radius: 30px; overflow: hidden; position: relative; }
    .panel.light { background: var(--surface); }
    .panel.stone { background: var(--bg); }
    .panel.cream { background: #f6f4ed; }
    .panel.dark { background: radial-gradient(130% 130% at 78% -10%, var(--panel-d2), var(--panel-d) 58%); color: var(--cream); }
    .inner { padding: clamp(34px, 5.5vw, 84px); }
    /* faint technical dot-grid on pale panels (painted straight into the
       panel background so it can never sit above content) */
    .dotted-bg { background-image: radial-gradient(rgba(32,33,29,.07) 1px, transparent 1.4px); background-size: 26px 26px; }
    /* reveal */
    .reveal { opacity: 0; transform: translateY(22px); transition: opacity .7s cubic-bezier(.2,.7,.2,1), transform .7s cubic-bezier(.2,.7,.2,1); }
    .reveal.in { opacity: 1; transform: none; }
    @media (prefers-reduced-motion: reduce) { .reveal { opacity: 1; transform: none; transition: none; } }
    /* nav */
    .nav { position: sticky; top: 12px; z-index: 60; display: flex; justify-content: center; padding: 4px 12px 0; }
    .navbar { display: flex; align-items: center; gap: 4px; background: rgba(255,255,255,.86);
              backdrop-filter: saturate(1.5) blur(14px); border: 1px solid rgba(0,0,0,.06); border-radius: 999px;
              padding: 6px; box-shadow: 0 14px 34px -14px rgba(0,0,0,.65); max-width: 100%; }
    .navbar .brand { font-family: var(--display); font-weight: 700; font-size: 1.02rem; letter-spacing: -.01em;
                     color: var(--ink); text-decoration: none; padding: 8px 14px; white-space: nowrap; }
    .navlinks { display: none; }
    @media (min-width: 760px) { .navlinks { display: flex; gap: 2px; } }
    .navlinks a { color: var(--ink-soft); text-decoration: none; font-weight: 600; font-size: .9rem; padding: 9px 13px; border-radius: 999px; }
    .navlinks a:hover { background: rgba(0,0,0,.05); color: var(--ink); }
    .navcta { background: var(--ink); color: #fff; text-decoration: none; font-weight: 600; font-size: .9rem;
              padding: 10px 16px; border-radius: 999px; white-space: nowrap; margin-left: 2px; transition: transform .09s, filter .15s; }
    .navcta:hover { filter: brightness(1.15); } .navcta:active { transform: scale(.97); }
    /* type helpers */
    .brkt { font-family: var(--mono); font-weight: 700; font-size: .68rem; letter-spacing: .16em; text-transform: uppercase; color: var(--sage-dark); }
    .panel.dark .brkt { color: var(--lime); }
    .chip { display: inline-flex; align-items: center; gap: 10px; font-family: var(--mono); font-weight: 700;
            font-size: .66rem; letter-spacing: .13em; text-transform: uppercase; color: var(--sage-dark); }
    .chip .ic { width: 27px; height: 27px; border-radius: 8px; display: grid; place-items: center; font-size: .85rem;
                background: rgba(111,133,103,.12); border: 1px solid rgba(111,133,103,.22); }
    .panel.dark .chip { color: var(--cream-soft); }
    .panel.dark .chip .ic { background: var(--lime-soft); border-color: var(--lime-line); }
    .h2 { font-family: var(--display); font-weight: 700; font-size: clamp(1.85rem, 4.4vw, 2.9rem); line-height: 1.05;
          letter-spacing: -.025em; text-wrap: balance; margin-top: 14px; }
    .h2 .lime { color: var(--lime); }
    .h2 .accent { color: var(--sage-dark); }
    .h2sub { color: var(--ink-soft); margin-top: 14px; font-size: 1.06rem; max-width: 52ch; }
    .panel.dark .h2sub { color: var(--cream-soft); }
    .stmt { text-align: center; display: flex; flex-direction: column; align-items: center; }
    .stmt .h2 { max-width: 24ch; }
    .stmt .h2sub { text-align: center; }
    /* ctas + mono spec chips */
    .cta { display: inline-block; text-decoration: none; font-weight: 600; font-size: 1.02rem; padding: 15px 26px;
           border-radius: 14px; transition: transform .09s ease, filter .15s ease; }
    .cta:active { transform: scale(.985); } .cta:hover { filter: brightness(1.06); }
    .cta.dark { background: var(--ink); color: #fff; }
    .cta.lime { background: var(--lime); color: #26310f; }
    .cta.ghost-l { background: rgba(32,33,29,.06); color: var(--ink); border: 1px solid rgba(32,33,29,.1); }
    .cta.ghost-d { background: rgba(244,242,236,.08); color: var(--cream); border: 1px solid var(--cream-line); }
    @media (prefers-reduced-motion: reduce) { .cta, .navcta { transition: none; } .cta:active { transform: none; } }
    .row { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 30px; align-items: center; justify-content: center; }
    .specs { display: flex; flex-wrap: wrap; gap: 8px 10px; justify-content: center; margin-top: 26px;
             font-family: var(--mono); font-weight: 700; font-size: .64rem; letter-spacing: .1em; text-transform: uppercase; }
    .specs span { padding: 8px 13px; border-radius: 999px; border: 1px dashed rgba(32,33,29,.28); color: var(--ink-soft); }
    .panel.dark .specs span { border-color: var(--cream-line); color: var(--cream-soft); }
    /* floating receipt cards */
    .rcpt { background: #fff; color: var(--ink); border-radius: 13px; padding: 11px 14px; min-width: 178px;
            box-shadow: 0 24px 48px -18px rgba(0,0,0,.5); font-family: var(--mono); font-size: .66rem; text-align: left; }
    .rcpt .rrow { display: flex; align-items: center; gap: 9px; }
    .rcpt .rlg { width: 26px; height: 26px; border-radius: 8px; background: var(--sage); color: #fff; display: grid; place-items: center; font-size: .8rem; flex: none; }
    .rcpt .rname { font-family: var(--display); font-weight: 700; font-size: .86rem; flex: 1; letter-spacing: -.01em; }
    .rcpt .ramt { font-weight: 700; white-space: nowrap; }
    .rcpt .ramt.plus { color: var(--sage-dark); }
    .rcpt .rmeta { color: var(--muted); margin-top: 7px; letter-spacing: .04em; }
    /* dashed technical boxes */
    .tbox { font-family: var(--mono); font-size: .6rem; font-weight: 400; letter-spacing: .07em; text-transform: uppercase;
            line-height: 1.7; border: 1px dashed rgba(32,33,29,.32); border-radius: 9px; padding: 9px 12px;
            color: var(--ink-soft); background: rgba(255,255,255,.55); text-align: left; }
    .tbox b { display: block; font-weight: 700; color: var(--ink); }
    .panel.dark .tbox { border-color: var(--cream-line); color: var(--cream-soft); background: rgba(244,242,236,.04); }
    .panel.dark .tbox b { color: var(--cream); }
    /* ------------------------------------------------------------- hero -- */
    .hero { text-align: center; display: flex; flex-direction: column; align-items: center; }
    .hero h1 { font-family: var(--display); font-weight: 700; font-size: clamp(2.5rem, 7vw, 4.5rem);
               line-height: .99; letter-spacing: -.035em; text-wrap: balance; margin-top: 26px; max-width: 15ch; }
    .hero h1 .accent { color: var(--sage-dark); }
    .hero .lead { color: var(--ink-soft); font-size: clamp(1.04rem, 2.1vw, 1.22rem); margin-top: 20px; max-width: 46ch; }
    .heroart { position: relative; margin-top: clamp(34px, 5vw, 56px); width: 100%; display: grid; place-items: center; }
    .lcard { position: relative; z-index: 1; width: 340px; max-width: 86vw; background: var(--ink); color: var(--cream);
             border-radius: 24px; padding: 22px; box-shadow: 0 48px 90px -30px rgba(32,33,29,.55);
             transform: rotate(-2deg); text-align: left; }
    @media (prefers-reduced-motion: reduce) { .lcard { transform: none; } }
    .lcard .lt { display: flex; align-items: center; gap: 12px; }
    .lcard .llogo { width: 42px; height: 42px; border-radius: 12px; background: var(--sage); color: #fff; display: grid; place-items: center; font-size: 1.2rem; }
    .lcard .lname { font-family: var(--display); font-weight: 700; font-size: 1.12rem; flex: 1; }
    .lcard .llbl { font-family: var(--mono); font-size: .56rem; letter-spacing: .14em; text-transform: uppercase; color: rgba(244,242,236,.55); }
    .lcard .lnum { font-family: var(--mono); font-weight: 700; font-size: 1.05rem; text-align: right; }
    .lcard .ldots { font-size: 1.5rem; margin: 14px 0 10px; color: var(--lime); letter-spacing: 0; }
    .lcard .ldots .hd { display: inline-block; margin-right: 5px; }
    .lcard .ldots .hd:not(.on) { color: rgba(244,242,236,.22); }
    .lcard .ldots .hd.on { opacity: 0; animation: stampin .5s cubic-bezier(.2,1.5,.4,1) forwards; }
    @keyframes stampin { from { opacity: 0; transform: scale(2.4); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { .lcard .ldots .hd.on { animation: none; opacity: 1; } }
    .lcard .lrow { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin-top: 4px; }
    .lcard .lrw { font-weight: 600; font-size: .95rem; }
    .lcard .lqr { margin: 16px auto 2px; width: 82px; height: 82px; border-radius: 12px; background: var(--cream); color: var(--ink); display: grid; place-items: center; }
    .fl { position: absolute; z-index: 2; }
    .fl1 { top: -6%; right: max(2%, calc(50% - 420px)); transform: rotate(3deg); }
    .fl2 { bottom: 2%; left: max(1%, calc(50% - 430px)); transform: rotate(-4deg); }
    .fl3 { top: 12%; left: max(2%, calc(50% - 400px)); }
    .fl4 { bottom: 14%; right: max(1%, calc(50% - 400px)); }
    @media (max-width: 899px) { .fl { display: none; } }
    /* ---------------------------------------------------------- problem -- */
    .papers { position: relative; margin: clamp(30px, 5vw, 52px) auto 0; width: min(760px, 100%); height: 300px; }
    .paper { position: absolute; width: 196px; background: var(--paper); color: var(--paper-ink); border-radius: 10px;
             padding: 14px 15px; box-shadow: 0 26px 50px -20px rgba(0,0,0,.55); }
    .paper .ph { font-family: var(--mono); font-weight: 700; font-size: .56rem; letter-spacing: .12em; text-transform: uppercase; }
    .paper .pg { display: grid; grid-template-columns: repeat(5, 1fr); gap: 7px; margin-top: 11px; }
    .paper .pc { aspect-ratio: 1; border: 1.5px dashed var(--paper-line); border-radius: 50%; display: grid; place-items: center; font-size: .72rem; }
    .paper .pc.in { border-style: solid; border-color: #8a7d5c; background: rgba(138,125,92,.14); }
    .tornwrap { position: absolute; top: 12px; left: 50%; width: 196px; height: 130px; transform: translateX(-50%) rotate(2deg); }
    .tornwrap .half { position: absolute; inset: 0; transition: transform .9s cubic-bezier(.2,.7,.2,1) .15s; }
    .tornwrap .half.l { clip-path: polygon(0 0, 56% 0, 46% 18%, 57% 36%, 45% 55%, 56% 74%, 46% 100%, 0 100%); }
    .tornwrap .half.r { clip-path: polygon(56% 0, 100% 0, 100% 100%, 46% 100%, 56% 74%, 45% 55%, 57% 36%, 46% 18%); }
    .reveal.in .tornwrap .half.l { transform: translate(-30px, 4px) rotate(-7deg); }
    .reveal.in .tornwrap .half.r { transform: translate(30px, -3px) rotate(6deg); }
    @media (prefers-reduced-motion: reduce) {
      .tornwrap .half { transition: none; }
      .tornwrap .half.l { transform: translate(-30px, 4px) rotate(-7deg); }
      .tornwrap .half.r { transform: translate(30px, -3px) rotate(6deg); }
    }
    .paper.p2 { left: 5%; bottom: 4%; transform: rotate(-8deg); opacity: .8; }
    .paper.p3 { right: 6%; top: 26%; transform: rotate(6deg); opacity: .55; }
    .paper .stain { position: absolute; width: 58px; height: 58px; border-radius: 50%; border: 8px solid rgba(122,84,40,.22); top: -14px; right: -12px; }
    .gtag { position: absolute; font-family: var(--mono); font-size: .58rem; letter-spacing: .12em; text-transform: uppercase; color: var(--cream); opacity: .38; white-space: nowrap; }
    .gt1 { top: 8%; left: 2%; } .gt2 { top: 76%; right: 2%; } .gt3 { bottom: -4%; left: 34%; }
    @media (max-width: 700px) {
      .papers { height: 250px; }
      .paper { width: 158px; } .tornwrap { width: 158px; height: 112px; }
      .paper .pc { font-size: .6rem; } .gtag { display: none; }
      .paper.p3 { display: none; }
      .paper.p2 { left: 8%; bottom: 0; }
    }
    .painrow { display: grid; gap: 12px; margin-top: clamp(30px, 4.5vw, 46px); }
    @media (min-width: 760px) { .painrow { grid-template-columns: repeat(3, 1fr); } }
    .pain { border: 1px solid var(--cream-line); background: rgba(244,242,236,.04); border-radius: 16px; padding: 20px; }
    .pain .pt { font-family: var(--mono); font-weight: 700; font-size: .62rem; letter-spacing: .14em; color: var(--lime); }
    .pain p { color: var(--cream-soft); font-size: .93rem; margin-top: 9px; }
    /* --------------------------------------------------------- solution -- */
    .duo { position: relative; margin: clamp(34px, 5vw, 54px) auto 0; display: flex; justify-content: center; align-items: center; }
    .wcard { width: 264px; border-radius: 20px; padding: 18px; text-align: left; }
    .wcard .wt { display: flex; align-items: center; gap: 10px; }
    .wcard .wlg { width: 32px; height: 32px; border-radius: 9px; background: var(--sage); color: #fff; display: grid; place-items: center; font-size: .95rem; }
    .wcard .wnm { font-family: var(--display); font-weight: 700; font-size: .98rem; flex: 1; }
    .wcard .wct { font-family: var(--mono); font-weight: 700; font-size: .82rem; }
    .wcard .wdots { font-size: 1.06rem; letter-spacing: 4px; margin: 12px 0 4px; }
    .wcard .wrw { font-family: var(--mono); font-size: .62rem; letter-spacing: .08em; text-transform: uppercase; }
    .wcard.apple { background: var(--ink); color: var(--cream); transform: rotate(-3.5deg) translate(6px, -10px); z-index: 1;
                   box-shadow: 0 30px 60px -22px rgba(32,33,29,.5); }
    .wcard.apple .wdots { color: var(--lime); } .wcard.apple .wdots .off { color: rgba(244,242,236,.24); }
    .wcard.apple .wrw { color: rgba(244,242,236,.6); }
    .wcard.gwal { background: #fff; color: var(--ink); border: 1px solid var(--line); transform: rotate(3deg) translate(-6px, 10px); z-index: 2;
                  box-shadow: 0 30px 60px -24px rgba(32,33,29,.35); }
    .wcard.gwal .wdots { color: var(--sage-dark); } .wcard.gwal .wdots .off { color: #d8d5cc; }
    .wcard.gwal .wrw { color: var(--muted); }
    .wtag { font-family: var(--mono); font-weight: 700; font-size: .56rem; letter-spacing: .14em; text-transform: uppercase;
            padding: 6px 10px; border-radius: 999px; position: absolute; z-index: 3; box-shadow: 0 10px 24px -10px rgba(0,0,0,.35); }
    .wtag.a { background: var(--ink); color: var(--cream); top: -12px; left: calc(50% - 218px); transform: rotate(-4deg); }
    .wtag.g { background: #fff; color: var(--ink); border: 1px solid var(--line); bottom: -18px; right: calc(50% - 248px); transform: rotate(3deg); }
    .duo .tbx-l { position: absolute; left: 0; top: 18%; } .duo .tbx-r { position: absolute; right: 0; bottom: 12%; }
    @media (max-width: 899px) { .duo .tbx-l, .duo .tbx-r { display: none; } }
    @media (max-width: 640px) {
      .duo { flex-direction: column; gap: 18px; }
      .wcard.apple { transform: rotate(-2deg); } .wcard.gwal { transform: rotate(2deg); }
      .wtag { display: none; }
    }
    /* ----------------------------------------------------- feature rows -- */
    .feat { display: grid; gap: 40px; align-items: center; }
    @media (min-width: 900px) { .feat { grid-template-columns: 1fr 1fr; gap: clamp(40px, 5vw, 72px); } .feat.flip .fcopy { order: 2; } .feat.flip .fart { order: 1; } }
    .feat .h2 { font-size: clamp(1.7rem, 3.6vw, 2.5rem); }
    .callout { display: inline-block; font-family: var(--mono); font-weight: 700; font-size: .62rem; letter-spacing: .1em;
               text-transform: uppercase; line-height: 1.8; border: 1px dashed var(--lime-line); background: var(--lime-soft);
               color: var(--lime); border-radius: 10px; padding: 10px 14px; margin-top: 24px; }
    .panel.light .callout, .panel.stone .callout { border-color: rgba(111,133,103,.4); background: rgba(111,133,103,.1); color: var(--sage-dark); }
    .fart { display: flex; align-items: center; justify-content: center; gap: 24px; position: relative; }
    /* phone + lock screen */
    .phone { position: relative; width: 258px; aspect-ratio: 272 / 560; background: #0e0d0b; border-radius: 44px;
             padding: 10px; box-shadow: 0 50px 90px -34px rgba(0,0,0,.75), 0 0 0 1px rgba(244,242,236,.08); }
    .phone .notch { position: absolute; top: 10px; left: 50%; transform: translateX(-50%); width: 94px; height: 25px;
                    background: #0e0d0b; border-radius: 0 0 15px 15px; z-index: 6; }
    .lock { position: absolute; inset: 10px; border-radius: 34px; overflow: hidden;
            background: linear-gradient(180deg, #2c3b2d, #171f16); color: #fff;
            display: flex; flex-direction: column; align-items: center; padding: 22px 14px; }
    .lock .clock { font-family: var(--display); font-weight: 700; font-size: 3.4rem; letter-spacing: -.03em; margin-top: 30px; }
    .lock .date { opacity: .75; font-size: .8rem; margin-top: -2px; }
    .lock .noti { margin-top: auto; width: 100%; background: rgba(255,255,255,.16); backdrop-filter: blur(8px);
                  border-radius: 15px; padding: 12px; text-align: left; display: flex; gap: 10px;
                  opacity: 0; transform: translateY(14px) scale(.97); transition: opacity .6s ease .5s, transform .6s cubic-bezier(.2,1.2,.3,1) .5s; }
    .reveal.in .lock .noti { opacity: 1; transform: none; }
    @media (prefers-reduced-motion: reduce) { .lock .noti { opacity: 1; transform: none; transition: none; } }
    .lock .noti .ic { width: 30px; height: 30px; border-radius: 8px; background: var(--sage); display: grid; place-items: center; font-size: .9rem; flex: none; }
    .lock .noti .mt { font-family: var(--mono); font-size: .52rem; letter-spacing: .1em; text-transform: uppercase; opacity: .7; }
    .lock .noti .tt { font-weight: 700; font-size: .83rem; margin-top: 2px; }
    .lock .noti .bd { font-size: .78rem; opacity: .92; margin-top: 2px; }
    .trail { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; width: 178px; flex: none; }
    .trail .arr { font-family: var(--mono); color: var(--cream-soft); opacity: .6; font-size: .75rem; margin-left: 18px; }
    @media (max-width: 1060px) { .trail { display: none; } }
    /* insights dashboard card */
    .dashcard { width: min(470px, 100%); background: #fff; border: 1px solid var(--line); border-radius: 20px;
                padding: 20px; box-shadow: var(--shadow); text-align: left; }
    .dashcard .dh { display: flex; justify-content: space-between; align-items: center;
                    font-family: var(--mono); font-weight: 700; font-size: .6rem; letter-spacing: .13em; text-transform: uppercase; color: var(--muted); }
    .dashcard .dh .live { color: var(--sage-dark); }
    .dtiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 14px; }
    .dtile { background: var(--bg); border-radius: 12px; padding: 12px 11px; }
    .dtile b { font-family: var(--display); font-weight: 700; font-size: 1.45rem; display: block; letter-spacing: -.02em; }
    .dtile i { font-style: normal; font-family: var(--mono); font-size: .52rem; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
    .drow { display: flex; align-items: center; gap: 10px; padding: 11px 2px; border-top: 1px solid var(--line);
            font-family: var(--mono); font-size: .66rem; }
    .drow:first-of-type { margin-top: 14px; }
    .drow .did { font-weight: 700; }
    .drow .ddots { letter-spacing: 2px; color: var(--sage-dark); flex: 1; } .drow .ddots .off { color: #d8d5cc; }
    .drow .dwhen { color: var(--muted); white-space: nowrap; }
    .dbdg { font-weight: 700; font-size: .54rem; letter-spacing: .08em; padding: 4px 8px; border-radius: 999px; white-space: nowrap; }
    .dbdg.ok { background: rgba(111,133,103,.14); color: var(--sage-dark); }
    .dbdg.warn { background: rgba(197,141,56,.14); color: #9c6f1f; }
    .dbdg.new { background: rgba(32,33,29,.08); color: var(--ink); }
    .dfoot { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; padding-top: 12px;
             border-top: 1px solid var(--line); font-size: .82rem; color: var(--ink-soft); }
    .dfoot b { color: var(--sage-dark); }
    /* -------------------------------------------------------- stat strip -- */
    .stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 26px 18px; }
    @media (min-width: 800px) { .stats { grid-template-columns: repeat(4, 1fr); } }
    .stat { border-left: 1px dashed rgba(32,33,29,.3); padding-left: 18px; }
    .stat b { font-family: var(--display); font-weight: 700; font-size: clamp(2.3rem, 4.5vw, 3.4rem); letter-spacing: -.03em; line-height: 1; display: block; }
    .stat b small { font-size: .45em; letter-spacing: 0; }
    .stat i { font-style: normal; font-family: var(--mono); font-size: .6rem; font-weight: 700; letter-spacing: .12em;
              text-transform: uppercase; color: var(--ink-soft); display: block; margin-top: 10px; line-height: 1.7; }
    /* ------------------------------------------------------------ setup -- */
    .steplist { list-style: none; padding: 0; margin: 26px 0 0; display: flex; flex-direction: column; }
    .steplist li { display: flex; align-items: baseline; gap: 14px; padding: 13px 2px; border-top: 1px dashed rgba(32,33,29,.25);
                   font-family: var(--mono); font-size: .72rem; letter-spacing: .05em; text-transform: uppercase; color: var(--ink-soft); }
    .steplist li:last-child { border-bottom: 1px dashed rgba(32,33,29,.25); }
    .steplist .n { font-weight: 700; color: var(--sage-dark); }
    .steplist .s { flex: 1; font-weight: 700; color: var(--ink); }
    .steplist .t { white-space: nowrap; }
    /* laptop */
    .laptop { width: min(540px, 100%); }
    .lscr { background: #171c10; border: 9px solid #262b1e; border-bottom: none; border-radius: 16px 16px 0 0;
            padding: 16px 16px 20px; color: var(--cream); text-align: left; box-shadow: 0 44px 80px -30px rgba(32,33,29,.5); }
    .lbase { height: 15px; background: linear-gradient(180deg, #3d4433, #22261a); border-radius: 2px 2px 14px 14px; position: relative; }
    .lbase::before { content: ""; position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 86px; height: 6px;
                     background: rgba(0,0,0,.3); border-radius: 0 0 8px 8px; }
    .lscr .lhd { display: flex; justify-content: space-between; align-items: center; font-family: var(--mono); font-weight: 700;
                 font-size: .56rem; letter-spacing: .14em; text-transform: uppercase; color: rgba(244,242,236,.55); }
    .lscr .lhd .lv { color: var(--lime); }
    .ltiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 12px; }
    .ltile { background: rgba(244,242,236,.06); border: 1px solid rgba(244,242,236,.08); border-radius: 11px; padding: 11px; }
    .ltile b { font-family: var(--display); font-weight: 700; font-size: 1.35rem; color: var(--lime); display: block; letter-spacing: -.02em; }
    .ltile i { font-style: normal; font-family: var(--mono); font-size: .5rem; letter-spacing: .1em; text-transform: uppercase; color: rgba(244,242,236,.5); }
    .lbars { display: flex; align-items: flex-end; gap: 5px; height: 64px; margin-top: 14px; padding: 0 2px; }
    .lbars i { flex: 1; background: var(--lime); opacity: .32; border-radius: 3px 3px 0 0; }
    .lbars i:nth-child(3n) { opacity: .55; } .lbars i:last-child { opacity: 1; }
    .lrow2 { display: flex; justify-content: space-between; font-family: var(--mono); font-size: .58rem; letter-spacing: .08em;
             text-transform: uppercase; color: rgba(244,242,236,.55); margin-top: 12px; border-top: 1px dashed rgba(244,242,236,.14); padding-top: 11px; }
    .lrow2 b { color: var(--lime); }
    /* ------------------------------------------------------------ final -- */
    .final { text-align: center; display: flex; flex-direction: column; align-items: center; }
    .final .h2 { font-size: clamp(2.2rem, 5.6vw, 3.7rem); max-width: 16ch; }
    .fgrid { display: grid; gap: 28px; width: 100%; margin-top: clamp(48px, 7vw, 84px); padding-top: 34px;
             border-top: 1px solid var(--cream-line); text-align: left; }
    @media (min-width: 760px) { .fgrid { grid-template-columns: 2fr 1fr 1fr 1fr; } }
    .fbrand { font-family: var(--display); font-weight: 700; font-size: 1.2rem; color: var(--cream); text-decoration: none; }
    .fblurb { color: var(--cream-soft); font-size: .86rem; margin-top: 10px; max-width: 26ch; }
    .fcol h5 { font-family: var(--mono); font-weight: 700; font-size: .58rem; letter-spacing: .16em; text-transform: uppercase;
               color: rgba(244,242,236,.45); margin: 0 0 12px; }
    .fcol a { display: block; color: var(--cream-soft); text-decoration: none; font-size: .9rem; padding: 5px 0; }
    .fcol a:hover { color: var(--cream); }
    .fine { font-family: var(--mono); font-size: .58rem; letter-spacing: .1em; text-transform: uppercase;
            color: rgba(244,242,236,.4); margin-top: 40px; width: 100%; text-align: left; display: flex; flex-wrap: wrap; gap: 8px 24px; justify-content: space-between; }
  `;
  const qr = `<svg width="60" height="60" viewBox="0 0 72 72" aria-hidden="true"><g fill="currentColor">
    <rect x="6" y="6" width="18" height="18"/><rect x="9" y="9" width="12" height="12" fill="#fff"/><rect x="12" y="12" width="6" height="6"/>
    <rect x="48" y="6" width="18" height="18"/><rect x="51" y="9" width="12" height="12" fill="#fff"/><rect x="54" y="12" width="6" height="6"/>
    <rect x="6" y="48" width="18" height="18"/><rect x="9" y="51" width="12" height="12" fill="#fff"/><rect x="12" y="54" width="6" height="6"/>
    <rect x="30" y="10" width="5" height="5"/><rect x="38" y="10" width="5" height="5"/><rect x="30" y="18" width="5" height="5"/>
    <rect x="42" y="30" width="5" height="5"/><rect x="30" y="30" width="5" height="5"/><rect x="52" y="30" width="5" height="5"/>
    <rect x="60" y="38" width="5" height="5"/><rect x="30" y="42" width="5" height="5"/><rect x="44" y="46" width="5" height="5"/>
    <rect x="52" y="52" width="5" height="5"/><rect x="34" y="56" width="5" height="5"/></g></svg>`;
  const dotsHtml = (on: number, total: number, offClass = "off") =>
    "●".repeat(on) + `<span class="${offClass}">` + "○".repeat(total - on) + "</span>";
  // Hero dots are individual spans so each stamp can pop in with its own delay.
  const heroDots = (on: number, total: number) => {
    let out = "";
    for (let i = 0; i < total; i++) {
      out += i < on
        ? `<span class="hd on" style="animation-delay:${(0.4 + i * 0.15).toFixed(2)}s">●</span>`
        : `<span class="hd">○</span>`;
    }
    return out;
  };
  // A paper punch-card; rendered twice inside .tornwrap so the two clipped
  // halves can drift apart on reveal.
  const paperCard = (title: string, stamped: number, cls = "", extra = "") => {
    let cells = "";
    for (let i = 0; i < 10; i++) cells += `<span class="pc${i < stamped ? " in" : ""}">${i < stamped ? "&#9749;" : ""}</span>`;
    return `<div class="paper${cls ? ` ${cls}` : ""}">${extra}<div class="ph">${title}</div><div class="pg">${cells}</div></div>`;
  };
  const script = /* js */ `
    (function () {
      var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      var reveals = [].slice.call(document.querySelectorAll('.reveal'));
      if (reduce || !('IntersectionObserver' in window)) {
        reveals.forEach(function (el) { el.classList.add('in'); });
        return;
      }
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
      }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
      reveals.forEach(function (el) { io.observe(el); });
    })();
  `;
  const tornPaper = paperCard("Kopi Corner &middot; buy 10 get 1", 9);
  const body = `
    <div class="nav"><div class="navbar">
      <a class="brand" href="/">Stampy &#9749;</a>
      <div class="navlinks">
        <a href="#why">Why</a>
        <a href="#features">Features</a>
        <a href="#setup">Setup</a>
      </div>
      <a class="navcta" href="/dashboard">Get early access</a>
    </div></div>

    <div class="stack">

      <section class="panel cream dotted-bg"><div class="inner hero reveal">
        <span class="chip"><span class="ic">&#9749;</span>Loyalty, minus the paper</span>
        <h1>The only loyalty card <span class="accent">you need.</span></h1>
        <p class="lead">A stamp card that lives in Apple &amp; Google Wallet &mdash; no app to download, nothing to print, nothing to lose. And it quietly brings your customers back.</p>
        <div class="row">
          <a class="cta dark" href="/dashboard">Get early access</a>
          <a class="cta ghost-l" href="#why">See how it works &darr;</a>
        </div>
        <div class="heroart">
          <div class="fl fl1"><div class="rcpt">
            <div class="rrow"><span class="rlg">&#9749;</span><span class="rname">Kopi Corner</span><span class="ramt plus">+1 &#9679;</span></div>
            <div class="rmeta">09:41 &middot; STAMP ADDED</div>
          </div></div>
          <div class="fl fl2"><div class="rcpt">
            <div class="rrow"><span class="rlg">&#127881;</span><span class="rname">Reward unlocked</span><span class="ramt">10/10</span></div>
            <div class="rmeta">FREE COFFEE &middot; REDEEM AT COUNTER</div>
          </div></div>
          <div class="fl fl3"><div class="tbox">&#9656; Customer<b>CARD #7F3A</b>&#9656; Last visit<b>2 DAYS AGO</b></div></div>
          <div class="fl fl4"><div class="tbox">&#9656; Platform<b>APPLE + GOOGLE WALLET</b>&#9656; App required<b>NONE</b></div></div>
          <div class="lcard">
            <div class="lt">
              <div class="llogo">&#9749;</div>
              <div class="lname">Kopi Corner</div>
              <div><div class="llbl">Stamps</div><div class="lnum">7/10</div></div>
            </div>
            <div class="llbl" style="margin-top:18px">Your stamps</div>
            <div class="ldots">${heroDots(7, 10)}</div>
            <div class="lrow"><span class="llbl">Reward</span><span class="lrw">Free coffee</span></div>
            <div class="lqr">${qr}</div>
          </div>
        </div>
      </div></section>

      <section class="panel dark" id="why"><div class="inner reveal stmt">
        <span class="brkt">[ The paper problem ]</span>
        <h2 class="h2">Paper cards don&rsquo;t fail because loyalty doesn&rsquo;t work. <span class="lime">They fail because they&rsquo;re paper.</span></h2>
        <p class="h2sub">Thousands of caf&eacute;s have tried stamp cards. Most gave up &mdash; the cards, not the customers, kept disappearing.</p>
        <div class="papers">
          <span class="gtag gt1">&#9656; Lost in a drawer</span>
          <span class="gtag gt2">&#9656; Washed with the jeans</span>
          <span class="gtag gt3">&#9656; Never hit stamp 10</span>
          <div class="tornwrap">
            <div class="half l">${tornPaper}</div>
            <div class="half r">${tornPaper}</div>
          </div>
          ${paperCard("Bean There &middot; loyalty", 4, "p2", `<span class="stain"></span>`)}
          ${paperCard("Daily Grind &middot; card", 2, "p3")}
        </div>
        <div class="painrow">
          <div class="pain"><div class="pt">&#9656; LOST</div><p>Nine stamps deep, then it vanishes into a drawer. The tenth visit never comes.</p></div>
          <div class="pain"><div class="pt">&#9656; IGNORED</div><p>Nobody installs an app for one caf&eacute;. The sign-up dies right at the counter.</p></div>
          <div class="pain"><div class="pt">&#9656; SILENT</div><p>Paper can&rsquo;t tell you who stopped coming &mdash; and it can&rsquo;t ask them back.</p></div>
        </div>
      </div></section>

      <section class="panel light"><div class="inner reveal stmt">
        <span class="brkt">[ The fix ]</span>
        <h2 class="h2">Stampy makes sure that never happens again.</h2>
        <p class="h2sub">One tap moves your stamp card into the wallet they already carry &mdash; as fast as paper at the counter, impossible to leave behind.</p>
        <div class="duo">
          <div class="tbox tbx-l">&#9656; Added at the counter<b>ONE SCAN &middot; ~4 SECONDS</b></div>
          <span class="wtag a">Apple Wallet</span>
          <div class="wcard apple">
            <div class="wt"><span class="wlg">&#9749;</span><span class="wnm">Kopi Corner</span><span class="wct">7/10</span></div>
            <div class="wdots">${dotsHtml(7, 10)}</div>
            <div class="wrw">Reward &middot; Free coffee</div>
          </div>
          <div class="wcard gwal">
            <div class="wt"><span class="wlg">&#9749;</span><span class="wnm">Kopi Corner</span><span class="wct">7/10</span></div>
            <div class="wdots">${dotsHtml(7, 10)}</div>
            <div class="wrw">Reward &middot; Free coffee</div>
          </div>
          <span class="wtag g">Google Wallet</span>
          <div class="tbox tbx-r">&#9656; One QR &middot; both wallets<b>SAME SCANNER, SAME SPEED</b></div>
        </div>
        <div class="specs">
          <span>One tap to add</span><span>No app</span><span>Updates itself</span><span>iPhone &amp; Android</span>
        </div>
      </div></section>

      <section class="panel dark" id="features"><div class="inner"><div class="feat reveal">
        <div class="fcopy">
          <span class="chip"><span class="ic">&#128276;</span>Win-back</span>
          <h2 class="h2">Paper can&rsquo;t bring them back. <span class="lime">Stampy can.</span></h2>
          <p class="h2sub">When a regular goes quiet, Stampy sends a gentle lock-screen nudge &mdash; &ldquo;we miss you, here&rsquo;s a bonus stamp&rdquo; &mdash; straight from the card in their wallet. No numbers to collect, no email blasts to write.</p>
          <span class="callout">&#9656; Runs itself &mdash; spots lapsing regulars and nudges them for you</span>
        </div>
        <div class="fart">
          <div class="trail">
            <div class="tbox">&#9656; Last visit<b>21 DAYS AGO</b></div>
            <span class="arr">&darr;</span>
            <div class="tbox">&#9656; Auto win-back<b>NUDGE SENT &#10003;</b></div>
            <span class="arr">&darr;</span>
            <div class="tbox">&#9656; Next morning<b>BACK AT THE COUNTER &#9749;</b></div>
          </div>
          <div class="phone">
            <div class="notch"></div>
            <div class="lock">
              <div class="clock">9:41</div>
              <div class="date">Friday, 25 July</div>
              <div class="noti">
                <div class="ic">&#9749;</div>
                <div><div class="mt">Wallet &middot; now</div><div class="tt">Kopi Corner</div><div class="bd">We miss you! Here&rsquo;s a bonus stamp on us &#9749;</div></div>
              </div>
            </div>
          </div>
        </div>
      </div></div></section>

      <section class="panel light"><div class="inner"><div class="feat flip reveal">
        <div class="fcopy">
          <span class="chip"><span class="ic">&#128200;</span>Know your customers</span>
          <h2 class="h2">See who&rsquo;s coming back &mdash; <span class="accent">and who isn&rsquo;t.</span></h2>
          <p class="h2sub">Every stamp is a visit you can actually see. New faces, solid regulars, people starting to drift &mdash; all on one screen, updated with every tap. Paper kept all of this a secret.</p>
          <span class="callout">&#9656; Live counts &middot; visit history &middot; lapsing alerts</span>
        </div>
        <div class="fart">
          <div class="dashcard">
            <div class="dh"><span>Customers</span><span class="live">&#9679; Live</span></div>
            <div class="dtiles">
              <div class="dtile"><b>124</b><i>Customers</i></div>
              <div class="dtile"><b>940</b><i>Stamps</i></div>
              <div class="dtile"><b>32</b><i>Rewards</i></div>
            </div>
            <div class="drow"><span class="did">#A47F</span><span class="ddots">${dotsHtml(7, 10)}</span><span class="dwhen">2h ago</span><span class="dbdg ok">Regular</span></div>
            <div class="drow"><span class="did">#2B91</span><span class="ddots">${dotsHtml(3, 10)}</span><span class="dwhen">3w ago</span><span class="dbdg warn">Lapsing</span></div>
            <div class="drow"><span class="did">#C7D3</span><span class="ddots">${dotsHtml(1, 10)}</span><span class="dwhen">just now</span><span class="dbdg new">New</span></div>
            <div class="dfoot"><span>3 lapsing this week</span><b>Nudge all &rarr;</b></div>
          </div>
        </div>
      </div></div></section>

      <section class="panel cream"><div class="inner reveal">
        <div class="stats">
          <div class="stat"><b>0</b><i>Apps to download</i></div>
          <div class="stat"><b>1</b><i>QR at the counter</i></div>
          <div class="stat"><b>2</b><i>Wallets covered &mdash; Apple &amp; Google</i></div>
          <div class="stat"><b>5<small>min</small></b><i>From sign-up to first stamp</i></div>
        </div>
      </div></section>

      <section class="panel stone dotted-bg" id="setup"><div class="inner"><div class="feat reveal">
        <div class="fcopy">
          <span class="chip"><span class="ic">&#9889;</span>From zero to live</span>
          <h2 class="h2">Set up in 5 minutes.</h2>
          <p class="h2sub">No hardware to buy, no app to build, no training day. If you can post to Instagram, you can launch a loyalty program.</p>
          <ul class="steplist">
            <li><span class="n">01</span><span class="s">Create your account</span><span class="t">1 min</span></li>
            <li><span class="n">02</span><span class="s">Design your card</span><span class="t">2 min</span></li>
            <li><span class="n">03</span><span class="s">Print the counter QR</span><span class="t">1 min</span></li>
            <li><span class="n">04</span><span class="s">First customer, first stamp</span><span class="t">instant</span></li>
          </ul>
        </div>
        <div class="fart">
          <div class="laptop">
            <div class="lscr">
              <div class="lhd"><span>Stampy &mdash; Dashboard</span><span class="lv">&#9679; Live</span></div>
              <div class="ltiles">
                <div class="ltile"><b>124</b><i>Customers</i></div>
                <div class="ltile"><b>+41</b><i>This month</i></div>
                <div class="ltile"><b>86%</b><i>Come back</i></div>
              </div>
              <div class="lbars"><i style="height:26%"></i><i style="height:34%"></i><i style="height:30%"></i><i style="height:44%"></i><i style="height:38%"></i><i style="height:52%"></i><i style="height:47%"></i><i style="height:60%"></i><i style="height:55%"></i><i style="height:71%"></i><i style="height:66%"></i><i style="height:84%"></i></div>
              <div class="lrow2"><span>Stamps this week</span><b>+188</b></div>
            </div>
            <div class="lbase"></div>
          </div>
        </div>
      </div></div></section>

      <section class="panel dark"><div class="inner final reveal">
        <span class="brkt">[ Early access ]</span>
        <h2 class="h2">Be first through the door.</h2>
        <p class="h2sub" style="text-align:center">Stampy is onboarding its first caf&eacute;s now. Free while in beta &mdash; no card details needed.</p>
        <div class="row"><a class="cta lime" href="/dashboard">Get early access</a></div>
        <div class="specs">
          <span>Free during beta</span><span>No card details</span><span>Live in minutes</span>
        </div>
        <div class="fgrid">
          <div>
            <a class="fbrand" href="/">Stampy &#9749;</a>
            <p class="fblurb">Loyalty stamp cards in Apple &amp; Google Wallet &mdash; no app, no paper, no lost cards.</p>
          </div>
          <div class="fcol"><h5>Product</h5><a href="#why">Why paper fails</a><a href="#features">Win-back</a><a href="#setup">Setup</a></div>
          <div class="fcol"><h5>Legal</h5><a href="/privacy">Privacy</a><a href="/terms">Terms</a></div>
          <div class="fcol"><h5>Account</h5><a href="/dashboard">Log in</a><a href="/dashboard">Get early access</a></div>
        </div>
        <div class="fine"><span>Made for caf&eacute;s in Malaysia</span><span>&copy; Stampy</span></div>
      </div></section>
    </div>`;
  return page("Stampy — loyalty cards in Apple & Google Wallet, no app", body, css, script);
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
    .pass { border: 1px solid var(--line); border-radius: 12px; padding: 14px; margin-top: 12px; }
    .pass .dots { font-size: 1.15rem; letter-spacing: 2px; margin: 6px 0; }
    .row { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
    .row .btn { padding: 10px 12px; font-size: .95rem; }
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
export function dashboardPage(canEmail: boolean, contactEmail = ""): string {
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
    .metric { background: var(--surface); border-radius: var(--r); padding: 16px 16px 13px;
              box-shadow: var(--shadow); text-align: left; }
    .metric b { font-family: var(--display); font-weight: 700; font-size: 1.9rem; line-height: 1;
                display: block; letter-spacing: -.02em; font-variant-numeric: tabular-nums; color: var(--ink); }
    .metric span { display: block; margin-top: 6px; font-size: .68rem; text-transform: uppercase;
                   letter-spacing: .05em; color: var(--muted); }
    .card { border: 1px solid var(--line); border-radius: 12px; padding: 16px; margin-top: 14px; }
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
    .seg button.on { color: var(--accent-dark); }
    .seg button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .seg .thumb { position: absolute; z-index: 0; top: 5px; bottom: 5px; left: 0; width: 0; background: var(--surface);
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
        <p class="muted" style="margin-top:14px;text-align:center">
          \${mode === "signup"
            ? 'Already have an account? <a href="#" id="switch">Log in</a>'
            : 'New here? <a href="#" id="switch">Create an account</a>'}
        </p>\`;
      wireEyes(document);
      $("#switch").onclick = (e) => { e.preventDefault(); authForm(mode === "signup" ? "login" : "signup"); };
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
        </details>\`;
      const q = (s) => div.querySelector(s);
      let all = [], ready = 0, cooling = 0;

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
          <td class="\${left < 0 ? "bad" : ""}">\${left < 0 ? "ended " + Math.abs(left) + "d ago" : "day " + m.trial_day + "/${TRIAL_DAYS}"}</td>
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

        <h2 style="margin-top:34px">Set a shop up\${info("Creates the owner account and a plain card. They get a temp password and a staff PIN, both shown once — the PIN is only ever stored scrambled and can never be looked up again. The designer above then opens on their new card.")}</h2>
        <div id="dfy">
          <label>Shop name</label><input id="dfy-name" placeholder="e.g. Nasi Lemak House">
          <label>Owner email</label><input id="dfy-email" type="email" placeholder="owner@card.my">
          <button class="btn btn-dark" id="dfy-create">Create shop + account</button>
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
        const cafeName = $("#dfy-name").value.trim(), ownerEmail = $("#dfy-email").value.trim();
        if (!cafeName) return void ($("#dfy-out").textContent = "Enter a shop name.");
        if (!ownerEmail.includes("@")) return void ($("#dfy-out").textContent = "Enter a valid owner email.");
        $("#dfy-create").disabled = true; $("#dfy-out").textContent = "Creating…";
        const { body: r } = await api("/card", { method: "POST",
          body: JSON.stringify({ cafeName, ownerEmail }) });
        $("#dfy-create").disabled = false;
        if (r.ok) {
          // The PIN is only ever stored hashed, so this is the one time it can be
          // read — after this it can only be replaced from the owner's dashboard.
          $("#dfy-out").innerHTML = '<div class="temp">Created <strong>' + esc(cafeName) + '</strong> for <strong>' + esc(r.ownerEmail) + '</strong>.<br>Temp password: <strong>' + r.tempPassword + '</strong> — they log in at /dashboard and can change it.<br>Staff PIN: <strong>' + r.staffPin + '</strong> — write this down now, it can’t be looked up later.</div>';
          $("#dfy-name").value = ""; $("#dfy-email").value = "";
          // Hand them straight to the designer, pointed at the card just made.
          selCard = r.cardId;
          dsMode = "card";
          setTimeout(load, 1200);
        } else {
          $("#dfy-out").textContent = r.error === "email-taken" ? "That email already has an account." : (r.error || "Failed");
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
