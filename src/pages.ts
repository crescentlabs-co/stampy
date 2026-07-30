/**
 * All HTML pages, server-rendered from template strings — no frontend build,
 * nothing for the founder to compile. Mobile-first (staff use their phones).
 */
import type { SetupStatus } from "./config.js";
import type { CardRow } from "./db.js";
import { DEFAULT_CARD_ID } from "./db.js";

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

function page(title: string, body: string, extraCss = "", script = ""): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
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

export function landingPage(
  card: CardRow,
  appleReady: boolean,
  googleReady: boolean,
  cardId: string,
): string {
  const base = cardId === DEFAULT_CARD_ID ? "" : `/c/${cardId}`;
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
    `${card.name} — Loyalty Card`,
    `<div class="card" style="text-align:center">
      <div style="font-size:3rem; margin-bottom:8px">☕️</div>
      <h1>${esc(card.name)}</h1>
      <p class="sub">${
        // The owner's own words when they've written some. esc() is not optional
        // here: this is owner-supplied text going straight into the markup of a
        // page every one of their customers loads.
        card.signup_message
          ? esc(card.signup_message)
          : `Collect ${card.stamps_target} stamps, get a ${esc(card.reward.toLowerCase())}.`
      }<br>
      Your card lives in your phone’s wallet — no app needed.</p>
      ${
        buttons
          ? `<div id="wallets">${buttons}</div>
             <p class="muted" style="margin-top:14px">You start with a few free stamps as a welcome gift 🎁</p>
             ${legalLine}`
          : `<p class="sub"><strong>Almost ready!</strong> Cards can’t be issued yet — the café is still being set up.</p>
             ${legalLine}`
      }
    </div>`,
    "",
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
    // A card refused for being stamped seconds ago is remembered briefly, so the
    // staff's next tap on it means "yes, genuinely a second order". Same two-tap
    // idiom as the buttons, and it works for the scanner too.
    const forceArmed = new Map();
    async function act(path, body, doneMsg) {
      if (busy) return; busy = true;
      try {
        const key = body.serial || body.code || "";
        if (forceArmed.get(key) > Date.now()) { forceArmed.delete(key); body = { ...body, force: true }; }
        let out = await api(path, { method: "POST", body: JSON.stringify(body) });
        // Anti-spam: same card stamped moments ago. Staff can override for a
        // genuine repeat order by repeating the action.
        if (out.error === "too-soon") {
          forceArmed.set(key, Date.now() + 8000);
          toast("Stamped " + out.secondsLeft + "s ago — scan or tap again to add another");
          return out;
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
    .row2 { display: flex; gap: 8px; }
    .row2 > div { flex: 1; }
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
    .colors { display: flex; gap: 8px; margin-top: 4px; }
    .colors > label { flex: 1; margin: 0; }
    .colors input[type=color] { width: 100%; height: 38px; padding: 2px; border: 1px solid var(--field-border);
                                border-radius: 10px; background: #fff; cursor: pointer; }
    .logorow { display: flex; gap: 8px; align-items: center; margin-top: 4px; }
    .logorow input[type=file] { display: none; }
    .logorow .btn { width: auto; padding: 10px 14px; font-size: .9rem; }
    .copyrow { display: flex; gap: 8px; margin-top: 4px; }
    .copyrow input { font-family: ui-monospace, Menlo, monospace; font-size: .78rem; background: var(--ghost-bg); }
    .copyrow .btn { width: auto; padding: 10px 14px; font-size: .9rem; }
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
    /* --- colour presets --- */
    .presets { display: flex; gap: 8px; flex-wrap: wrap; margin: 4px 0 2px; }
    .preset { width: 38px; height: 38px; border-radius: 10px; border: 2px solid var(--field-border); cursor: pointer;
              display: grid; place-items: center; font-size: .7rem; font-weight: 700; }
    .preset:hover { border-color: var(--accent); transform: translateY(-1px); }
    /* --- banner templates --- */
    .bantpl { display: flex; gap: 8px; flex-wrap: wrap; margin: 4px 0 2px; }
    .bantpl .bt { width: 72px; height: 32px; border-radius: 8px; border: 2px solid transparent; cursor: pointer;
                  position: relative; overflow: hidden; background-size: cover; background-position: center;
                  box-shadow: inset 0 0 0 1px rgba(0,0,0,.06); }
    .bantpl .bt:hover { border-color: var(--accent); }
    .bantpl .bt span { position: absolute; inset: auto 0 2px 0; text-align: center; font-size: .58rem;
                       color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,.6); font-weight: 700; }
    /* --- premium card preview --- */
    .pv { border-radius: 18px; padding: 16px; margin: 10px 0 4px; overflow: hidden;
          box-shadow: 0 10px 30px -8px rgba(43,29,21,.35), 0 2px 6px rgba(43,29,21,.15); }
    .pv-banner { height: 64px; margin: -16px -16px 12px; background-size: cover; background-position: center; display: none; }
    .pv-banner.on { display: block; }
    /* A decorative banner may be cropped; the stamp grid may NOT — it is the
       information the customer reads, so show the whole strip at its real shape. */
    .pv-banner.strip { height: auto; aspect-ratio: 1125 / 369; background-size: 100% 100%; }
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
    /* With a spend figure there are four tiles: 2×2 on a phone beats 3-then-1. */
    /* Two up on a phone, all of them side by side once there's room. Five wraps
       to 3+2 on a narrow screen rather than squeezing to unreadable. */
    .totals.four, .totals.five { grid-template-columns: repeat(2, 1fr); }
    @media (min-width: 560px) {
      .totals.four { grid-template-columns: repeat(4, 1fr); }
      .totals.five { grid-template-columns: repeat(3, 1fr); }
    }
    @media (min-width: 760px) { .totals.five { grid-template-columns: repeat(5, 1fr); } }
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
    /* A button waiting for its second tap (see armBtn). */
    .btn.armed { background: #9a3412; border-color: #9a3412; color: #fff; }
    /* --- show-password toggle --- */
    .eye { display: flex; align-items: center; gap: 6px; font-size: .8rem; color: var(--muted); margin: 8px 0 0; }
    .eye input { width: auto; }
  `;
  const js = /* js */ `
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

    // Reveal/hide any password field via a "Show" checkbox (data-eye = its selector).
    function wireEyes(root) {
      root.querySelectorAll("[data-eye]").forEach((cb) => {
        cb.onchange = () => { const i = root.querySelector(cb.dataset.eye); if (i) i.type = cb.checked ? "text" : "password"; };
      });
    }

    // Two-tap confirmation, same idiom as the stamper. Browsers let a user
    // suppress further dialogs, and a suppressed dialog reports "cancel" — so an
    // action gated on one silently stops working. First tap relabels the button,
    // second within 4s runs it.
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
    const PRESETS = [
      { name: "Espresso", bg: "#3b2016", fg: "#fffaf0", label: "#d6b278" },
      { name: "Mocha",    bg: "#5b4033", fg: "#fff6ec", label: "#e6c9a8" },
      { name: "Matcha",   bg: "#2f4a34", fg: "#f3f8ef", label: "#b7d6a0" },
      { name: "Forest",   bg: "#143a2b", fg: "#eefaf1", label: "#8fd6a8" },
      { name: "Berry",    bg: "#4a1f38", fg: "#fdeef6", label: "#e5a9cd" },
      { name: "Rose",     bg: "#7d2144", fg: "#fff0f4", label: "#f4a9c0" },
      { name: "Ocean",    bg: "#123047", fg: "#eef7fc", label: "#8fc4e6" },
      { name: "Grape",    bg: "#38265e", fg: "#f2eefb", label: "#b9a4ec" },
      { name: "Charcoal", bg: "#1f2124", fg: "#f4f4f5", label: "#a9d0ff" },
      { name: "Sunset",   bg: "#7a2f1c", fg: "#fff2ea", label: "#f6b98f" },
      { name: "Honey",    bg: "#8a5a12", fg: "#fff8ea", label: "#ffd98a" },
      { name: "Ink",      bg: "#101418", fg: "#eef2f6", label: "#7fd1c4" },
    ];

    // The card editor: DESIGN (what it looks like) and RULES (how it behaves) as
    // two sections with their own Save, because they're two different jobs — the
    // old single panel mixed a colour picker with the staff PIN behind one button.
    function designPanel(c) {
      const div = document.createElement("div");
      const base = c.id === "default" ? "" : "/c/" + c.id;
      const bust = (v) => v ? "?v=" + v : "";
      const logoSrc = base + "/art/logo.png" + bust(c.logoVersion);
      div.innerHTML = \`
        <label class="sec first" style="display:block">Card preview <span class="muted">(live — updates as you type)</span></label>
        <div class="pv" data-pv>
          <div class="pv-banner" data-pv-banner></div>
          <div class="pv-top">
            <img class="pv-logo" data-pv-logo src="\${logoSrc}" alt="">
            <span class="pv-name" data-pv-name></span>
            <div class="pv-hdr"><div class="pv-progress" data-pv-progress></div></div>
          </div>
          <div class="pv-dots" data-pv-dots></div>
          <div class="pv-row2">
            <div><div class="pv-lbl">REWARD</div><div class="pv-reward" data-pv-reward></div></div>
            <div><div class="pv-lbl">PROGRESS</div><div class="pv-reward" data-pv-tally></div></div>
          </div>
          <div class="pv-qr">QR</div>
          <div class="pv-note">Code ABC123 · updates by itself</div>
        </div>

        <details class="fold">
        <summary>Design — colours, logo, banner, stamps</summary>
        <label style="margin-top:6px">Start from a template <span class="muted">(sets colours, banner, stamps & reward for your kind of shop)</span></label>
        <div class="bantpl" data-vtpl></div>

        <label style="margin-top:12px">Pick a theme <span class="muted">(a good-looking colour set in one tap)</span></label>
        <div class="presets" data-presets></div>

        <label style="margin-top:10px" class="muted">Or fine-tune the colours yourself</label>
        <div class="colors">
          <label>Card colour<input data-f="bg" type="color" value="\${c.bg}"></label>
          <label>Text<input data-f="fg" type="color" value="\${c.fg}"></label>
          <label>Labels<input data-f="label" type="color" value="\${c.label}"></label>
          <label>Stamps<input data-f="accent" type="color" value="\${c.accent}"></label>
        </div>
        <p class="muted" style="margin-top:6px">"Stamps" is the colour an earned stamp fills in with.</p>
        <div class="logorow" style="margin-top:8px">
          <label class="btn btn-ghost" style="margin:0">Upload logo<input data-logo type="file" accept="image/*"></label>
          <button class="btn btn-ghost" data-a="rmlogo" style="\${c.logoVersion ? "" : "display:none"}">Remove logo</button>
        </div>

        <label style="margin-top:10px">Banner <span class="muted">(a wide image behind the top of the card)</span></label>
        <div class="bantpl" data-bantpl></div>
        <div class="logorow" style="margin-top:8px">
          <label class="btn btn-ghost" style="margin:0">Upload your own<input data-banner type="file" accept="image/*"></label>
          <button class="btn btn-ghost" data-a="rmbanner" style="\${c.bannerVersion ? "" : "display:none"}">Remove banner</button>
        </div>

        <label style="margin-top:12px">Stamp style <span class="muted">(big stamps that fill in — replaces the small dots)</span></label>
        <div class="bantpl" data-stamptpl></div>
        <div class="logorow" style="margin-top:8px">
          <label class="btn btn-ghost" style="margin:0">Upload your own stamp<input data-stampimg type="file" accept="image/png,image/svg+xml"></label>
          <button class="btn btn-ghost" data-a="rmstamp" style="\${c.stampsVersion ? "" : "display:none"}">Use plain dots</button>
        </div>
        <p class="muted" style="margin-top:6px">One shape on a see-through background (PNG or SVG) — not a photo. Its own colours are ignored: it gets filled with your stamp colour.</p>
        <p class="err" data-stamperr style="display:none"></p>

        <label style="margin-top:12px">Shop name <span class="muted">(printed on the card itself)</span></label><input data-f="shopName" value="\${(c.shopName || "").replace(/"/g, "&quot;")}">
        <label style="margin-top:12px">Card name <span class="muted">(only you see this)</span></label><input data-f="name" value="\${c.name}">
        <button class="btn btn-dark" style="margin-top:14px" data-a="savedesign">Save design</button>
        <p class="muted" style="margin-top:8px">Templates, banners and stamp styles save the moment you tap them. Colours and the name save with this button. Everything here updates on your customers' existing cards too.</p>
        </details>

        <h2 class="sec">Rules</h2>
        <label>Reward</label><input data-f="reward" value="\${c.reward}">
        <div class="row2">
          <div><label>Stamps to reward</label><input data-f="stampsTarget" type="number" min="1" max="20" value="\${c.stampsTarget}"></div>
          <div><label>Free welcome stamps</label><input data-f="stampsStart" type="number" min="0" max="19" value="\${c.stampsStart}"></div>
        </div>
        <p class="muted" style="margin-top:-2px">Welcome stamps are also where a card restarts after a reward — that part applies to your existing customers straight away.</p>
        <label style="margin-top:14px">Average spend per visit (RM)</label>
        <input data-f="averageSpend" type="number" min="0" step="0.10" value="\${c.averageSpend}">
        <p class="muted" style="margin-top:-2px">Used on Home to turn stamps into a money figure. Leave at 0 to hide it.</p>

        <label style="margin-top:16px">Sign-up page message</label>
        <input data-f="signupMessage" maxlength="120" value="\${(c.signupMessage || "").replace(/"/g, "&quot;")}" placeholder="Collect \${c.stampsTarget} stamps, get a \${(c.reward || "").toLowerCase()}.">
        <p class="muted" style="margin-top:6px">The line customers read after scanning your QR, before they add the card. Leave blank to use the one above.</p>


        <button class="btn btn-dark" style="margin-top:14px" data-a="saverules">Save rules</button>
        <p class="muted" style="margin-top:8px" data-rulesnote></p>\`;

      const f = (k) => div.querySelector('[data-f=' + k + ']');
      const q = (s) => div.querySelector(s);

      // ---- Rich stamp grid engine (declared before renderPreview, which uses it) ----
      // Big stamps that fill in (like a real punch card), rendered in the browser
      // and stored server-side. Apple uses them as the strip image, Google as the
      // hero image. Emoji glyphs bake in this device's emoji look.
      let stampStyle = c.stampStyle || "";  // '' = plain dots, 'custom' = uploaded
      let customStampUrl = null;             // dataURL of an uploaded stamp icon
      const stampImg = new Image();          // holds that uploaded icon for drawing

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
       * One strip image for one stamp count. 1125x369 is the @3x storeCard strip
       * (375x123pt); the grid is centred with a 60px clear margin all round, and
       * an odd target leaves the last row one short, centred.
       * Earned stamps take the accent colour; unearned are the same shape at 25%.
       */
      function drawStampStrip(filled, target, icon) {
        const W = 1125, H = 369, M = 60;
        const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
        const x = cv.getContext("2d");
        x.fillStyle = f("bg").value; x.fillRect(0, 0, W, H); // strip sits on the card colour
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
        b.style.backgroundImage = "url(" + base + "/art/banner.png" + bust(c.bannerVersion) + ")";
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
        q("[data-pv-name]").textContent = f("shopName").value || f("name").value || "Your card";
        q("[data-pv-progress]").textContent = headerValue(start, target);
        q("[data-pv-tally]").textContent = start + "/" + target;
        q("[data-pv-reward]").textContent = f("reward").value || "Your reward";
        for (const el of div.querySelectorAll(".pv-lbl, .pv-note")) el.style.color = f("label").value;
        // When a rich stamp style is active, show the rendered grid in the strip
        // (it shares the slot with the banner — stamps win, matching the card).
        const dots = q("[data-pv-dots]"), banner = q("[data-pv-banner]");
        if (stampStyle) {
          dots.style.display = "none";
          banner.style.backgroundImage = "url(" + drawStampStrip(start, target, stampStyle) + ")";
          banner.classList.add("on"); banner.classList.add("strip");
        } else {
          dots.style.display = "";
          banner.classList.remove("strip");
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

      // preset swatches
      const pc = q("[data-presets]");
      for (const p of PRESETS) {
        const sw = document.createElement("div");
        sw.className = "preset"; sw.title = p.name;
        sw.style.background = p.bg; sw.style.color = p.label;
        sw.textContent = p.name[0];
        // The accent follows the label colour, which is what filled a stamp
        // before it became its own field — themes stay coherent out of the box.
        sw.onclick = () => { f("bg").value = p.bg; f("fg").value = p.fg; f("label").value = p.label; f("accent").value = p.label; renderPreview(); };
        pc.appendChild(sw);
      }

      // image upload helper: normalise to PNG (square logo, or wide banner) → POST
      function wireUpload(inputSel, kind, w, h, onDone) {
        q(inputSel).onchange = () => {
          const file = q(inputSel).files[0]; if (!file) return;
          const img = new Image();
          img.onload = async () => {
            URL.revokeObjectURL(img.src);
            const canvas = document.createElement("canvas");
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext("2d");
            const s = Math.max(w / img.width, h / img.height); // cover
            ctx.drawImage(img, (w - img.width * s) / 2, (h - img.height * s) / 2, img.width * s, img.height * s);
            const dataUrl = canvas.toDataURL("image/png");
            if (!kind) { onDone(dataUrl); return; } // caller saves (e.g. banner via saveBanner)
            const { body } = await api("/card/" + c.id + "/" + kind, {
              method: "POST", body: JSON.stringify({ png: dataUrl.split(",")[1] }),
            });
            if (body.ok) { onDone(dataUrl); toast((kind === "logo" ? "Logo" : "Banner") + " saved ✓"); }
            else toast(body.error || "Upload failed");
          };
          img.onerror = () => toast("Couldn't read that image");
          img.src = URL.createObjectURL(file);
        };
      }
      wireUpload("[data-logo]", "logo", 320, 320, (url) => {
        q("[data-pv-logo]").src = url; q("[data-a=rmlogo]").style.display = "";
      });
      q("[data-a=rmlogo]").onclick = async () => {
        const { body } = await api("/card/" + c.id + "/logo", { method: "DELETE" });
        if (body.ok) { q("[data-pv-logo]").src = base + "/art/logo.png?v=" + Date.now(); q("[data-a=rmlogo]").style.display = "none"; toast("Logo removed"); }
      };

      // Banner: pre-made templates (drawn on a canvas from the card's colours,
      // so they stay on-brand) plus "upload your own". Both save the same way.
      async function saveBanner(dataUrl) {
        const { body } = await api("/card/" + c.id + "/banner", { method: "POST", body: JSON.stringify({ png: dataUrl.split(",")[1] }) });
        if (!body.ok) return toast(body.error || "Banner failed");
        const b = q("[data-pv-banner]"); b.style.backgroundImage = "url(" + dataUrl + ")"; b.classList.add("on");
        q("[data-a=rmbanner]").style.display = ""; toast("Banner saved ✓");
      }
      wireUpload("[data-banner]", null, 1032, 336, saveBanner); // null kind → onDone handles the POST
      q("[data-a=rmbanner]").onclick = async () => {
        const { body } = await api("/card/" + c.id + "/banner", { method: "DELETE" });
        if (body.ok) { const b = q("[data-pv-banner]"); b.classList.remove("on"); b.style.backgroundImage = ""; q("[data-a=rmbanner]").style.display = "none"; toast("Banner removed"); }
      };

      function shade(hex, p) { // p in -1..1 → darken/lighten
        const n = parseInt((hex || "#3b2016").slice(1), 16), t = p < 0 ? 0 : 255, a = Math.abs(p);
        let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
        r = Math.round((t - r) * a) + r; g = Math.round((t - g) * a) + g; b = Math.round((t - b) * a) + b;
        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
      }
      function drawBanner(style, c1, c2, w, h) {
        const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
        const x = cv.getContext("2d");
        if (style === "diagonal") {
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
        return cv.toDataURL("image/png");
      }
      const BANNERS = [
        { name: "Gradient", style: "gradient", from: 1 },
        { name: "Glow", style: "glow", from: 1 },
        { name: "Diagonal", style: "diagonal", from: 1 },
        { name: "Waves", style: "waves", from: 1 },
        { name: "Slate", style: "gradient", c1: "#20242b", c2: "#3c434e" },
        { name: "Sand", style: "gradient", c1: "#cdbfa3", c2: "#a98f66" },
        { name: "Rose", style: "glow", c1: "#7d2144", c2: "#c85b86" },
        { name: "Forest", style: "waves", c1: "#143a2b", c2: "#3f8a63" },
        { name: "Dusk", style: "diagonal", c1: "#2b2140", c2: "#c98a5a" },
      ];
      const btpl = q("[data-bantpl]");
      for (const t of BANNERS) {
        const c1 = t.from ? f("bg").value : t.c1;
        const c2 = t.from ? shade(f("bg").value, 0.4) : t.c2;
        const bt = document.createElement("div"); bt.className = "bt"; bt.title = t.name;
        bt.style.backgroundImage = "url(" + drawBanner(t.style, c1, c2, 144, 64) + ")";
        bt.innerHTML = "<span>" + t.name + "</span>";
        bt.onclick = () => {
          const a = t.from ? f("bg").value : t.c1, b = t.from ? shade(f("bg").value, 0.4) : t.c2;
          saveBanner(drawBanner(t.style, a, b, 1032, 336));
        };
        btpl.appendChild(bt);
      }

      const STAMP_ICONS = [
        { name: "Dot", icon: "dot" }, { name: "Coffee", icon: "☕" },
        { name: "Paw", icon: "🐾" }, { name: "Star", icon: "⭐" },
        { name: "Heart", icon: "❤️" }, { name: "Donut", icon: "🍩" },
        { name: "Boba", icon: "🧋" }, { name: "Croissant", icon: "🥐" },
        { name: "Chicken", icon: "🍗" }, { name: "Flower", icon: "🌸" },
      ];

      // Renders the full 0..target set and stores it (immediate, like banners).
      // The quiet flag is for the piggy-back call from save(), which toasts its own.
      async function applyStamps(style, quiet) {
        stampStyle = style;
        const target = Math.max(1, Math.min(20, Number(f("stampsTarget").value) || 10));
        const strips = [];
        for (let n = 0; n <= target; n++) strips.push({ filled: n, png: drawStampStrip(n, target, style).split(",")[1] });
        const { body } = await api("/card/" + c.id + "/stamps", { method: "POST", body: JSON.stringify({ style, strips }) });
        if (!body.ok) return toast(body.error || "Couldn't save stamps");
        q("[data-a=rmstamp]").style.display = style === "custom" ? "" : "none";
        renderPreview();
        if (!quiet) toast("Stamp style saved ✓");
      }

      const stpl = q("[data-stamptpl]");
      for (const t of STAMP_ICONS) {
        const bt = document.createElement("div"); bt.className = "bt"; bt.title = t.name;
        bt.style.backgroundImage = "url(" + drawStampStrip(Math.ceil((Number(f("stampsTarget").value) || 10) / 2), Number(f("stampsTarget").value) || 10, t.icon) + ")";
        bt.innerHTML = "<span>" + t.name + "</span>";
        bt.onclick = () => applyStamps(t.icon);
        stpl.appendChild(bt);
      }
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
        await applyStamps("dot", true);
        toast("Back to plain dots");
      };

      // ---- Vertical templates: one tap sets a coordinated whole-card design ----
      const VERTICALS = [
        { name: "Coffee",      emoji: "☕", bg: "#3b2016", fg: "#fffaf0", label: "#d6b278", banner: "gradient", icon: "☕", reward: "Free coffee" },
        { name: "Chicken rice", emoji: "🍗", bg: "#7a2f1c", fg: "#fff2ea", label: "#f6b98f", banner: "diagonal", icon: "🍗", reward: "Free plate" },
        { name: "Bubble tea",  emoji: "🧋", bg: "#38265e", fg: "#f2eefb", label: "#b9a4ec", banner: "glow",     icon: "🧋", reward: "Free drink" },
        { name: "Bakery",      emoji: "🥐", bg: "#8a5a12", fg: "#fff8ea", label: "#ffd98a", banner: "gradient", icon: "🥐", reward: "Free pastry" },
        { name: "Dessert",     emoji: "🍨", bg: "#7d2144", fg: "#fff0f4", label: "#f4a9c0", banner: "glow",     icon: "🍩", reward: "Free dessert" },
        { name: "Anything",    emoji: "⭐", bg: "#1f2124", fg: "#f4f4f5", label: "#a9d0ff", banner: "waves",    icon: "⭐", reward: "Free reward" },
      ];

      // Applies the whole bundle: colours + reward (main save), banner, stamps.
      async function applyVertical(v) {
        f("bg").value = v.bg; f("fg").value = v.fg; f("label").value = v.label; f("accent").value = v.label;
        f("reward").value = v.reward;
        renderPreview();
        const { body } = await api("/card/" + c.id, { method: "POST", body: JSON.stringify({
          reward: v.reward, bg: v.bg, fg: v.fg, label: v.label, accent: v.label,
        })});
        if (!body.ok) return toast(body.error || "Couldn't apply template");
        await saveBanner(drawBanner(v.banner, v.bg, shade(v.bg, 0.4), 1032, 336));
        await applyStamps(v.icon);
        toast(v.name + " template applied ✓");
      }

      const vtpl = q("[data-vtpl]");
      for (const v of VERTICALS) {
        const bt = document.createElement("div"); bt.className = "bt"; bt.title = v.name;
        bt.style.backgroundImage = "url(" + drawBanner(v.banner, v.bg, shade(v.bg, 0.4), 144, 64) + ")";
        bt.innerHTML = "<span>" + v.emoji + " " + v.name + "</span>";
        bt.onclick = () => applyVertical(v);
        vtpl.appendChild(bt);
      }

      // Two saves, disjoint field sets. Both re-render the stamp strips, because
      // a colour change (design) and a target change (rules) each alter them.
      // That re-render IS the pre-generation step: one PNG per stamp count, so a
      // customer's stamp only ever swaps which stored image the pass points at.
      async function save(fields, label) {
        const { body } = await api("/card/" + c.id, { method: "POST", body: JSON.stringify(fields) });
        if (!body.ok) return toast(body.error || "Save failed");
        Object.assign(c, fields);
        // Always regenerate, even on plain dots: the strip image is now the only
        // place stamps are drawn, so a card with no strips would show nothing.
        await applyStamps(stampStyle || "dot", true);
        toast(label + " saved ✓");
      }

      q("[data-a=savedesign]").onclick = async () => {
        await save({
          name: f("name").value, shopName: f("shopName").value,
          bg: f("bg").value, fg: f("fg").value, label: f("label").value, accent: f("accent").value,
        }, "Design");
        // Keep the card-picker chip labels in sync without resetting the form.
        const pk = document.querySelector("[data-pick]");
        if (pk) pk.querySelectorAll("button[data-ci]").forEach((b) => { b.textContent = S.cards[Number(b.dataset.ci)].name; });
      };

      q("[data-a=saverules]").onclick = () => save({
        reward: f("reward").value,
        stampsTarget: Number(f("stampsTarget").value),
        stampsStart: Number(f("stampsStart").value),
        averageSpend: Number(f("averageSpend").value) || 0,
        signupMessage: f("signupMessage").value,
      }, "Rules");

      // Say exactly what a rules change does, with the real number attached.
      // Each pass snapshots its reward and target when it's issued, so lowering
      // "stamps to reward" from 10 to 5 leaves every existing card on 10 — that
      // surprises people, so it shouldn't be buried in a doc.
      (async () => {
        const note = q("[data-rulesnote]");
        const { body } = await api("/customers?cardId=" + encodeURIComponent(c.id));
        const n = (body.counts || {}).active || 0;
        note.innerHTML = n
          ? "Applies to cards issued from now on. Your <strong>" + n + "</strong> existing " +
            (n === 1 ? "customer keeps their" : "customers keep their") +
            " current reward and stamp count — colours, logo and card name update on everyone's card."
          : "Applies to every card from now on. Once you have customers, a change here only affects newly issued cards; their reward and stamp count stay as they were.";
      })();
      return div;
    }

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

      // Do the people who take a card ever come back? Only cards older than a
      // week count, either way — hand out 100 on Saturday and this must not
      // crater on Sunday and then drift back up over the following week.
      // "—" until somebody is old enough to judge: a confident 0% would read
      // as an answer when there isn't one yet.
      const matured = sum("matured"), returned = sum("returned");
      const returnRate = matured ? Math.round((returned / matured) * 100) + "%" : "—";

      // One set of numbers, all time. The All-time / 30-day toggle is gone: it
      // doubled every figure on the screen for a question nobody was asking yet.
      const host = div.querySelector("[data-totals]");
      host.className = "totals " + (priced.length ? "five" : "four");
      host.innerHTML = \`
        <div class="metric"><b>\${sum("active")}</b><span>customers</span></div>
        <div class="metric"><b>\${returnRate}</b><span>came back\${matured ? "" : " (needs a week)"}</span></div>
        <div class="metric"><b>\${sum("stamps")}</b><span>stamps</span></div>
        <div class="metric"><b>\${sum("redemptions")}</b><span>rewards given</span></div>
        \${priced.length ? '<div class="metric"><b>' + money(influenced) + '</b><span>spend influenced</span></div>' : ""}\`;

      // The gap line. "Customers" counts cards that were stamped or confirmed in
      // a wallet; cards abandoned at the Add sheet and cards since deleted are
      // named here rather than silently inflating or deflating the headline.
      (async () => {
        const { body } = await api("/customers");
        const counts = body.counts || { active: 0, issuedNeverAdded: 0, removed: 0 };
        const need = (body.buckets || [])
          .filter((b) => b.nudgeable)
          .reduce((a, b) => a + b.eligible, 0);
        // "Never reached a wallet" is not shown here any more: an owner can do
        // nothing about a cancelled Add sheet, and it read as a failure of
        // theirs. It lives on the admin console, which is where it belongs.
        const gap = [];
        if (counts.removed) gap.push(counts.removed + " deleted the card");
        const line = div.querySelector("[data-gap]");
        if (!counts.active && !gap.length) {
          line.innerHTML = "No customers yet — they appear once someone adds your card and gets their first stamp.";
        } else {
          line.innerHTML = (need ? "<strong>" + need + "</strong> could use a nudge" + (gap.length ? " · " : "") : "") +
            (gap.length ? "Also issued: " + gap.join(" · ") : "");
        }
        if (!priced.length) {
          line.insertAdjacentHTML("afterend",
            '<p class="muted" style="margin:2px 0 4px">Set an <strong>average spend per visit</strong> in Card → Rules to also see the money your stamps influenced.</p>');
        }
      })();
      return div;
    }

    // ---- Customers: weekly lapse cohorts, then a search box ----
    // Nobody works a loyalty list card by card, so the list is no longer the
    // page: the cohorts are. Buckets, counts and eligibility are all computed
    // server-side (routes/dashboard.ts BUCKETS), so what you see and what the
    // Nudge button sends to can never drift apart.
    function customersPanel() {
      const div = document.createElement("div");
      div.innerHTML = \`
        <h2 class="sec">Bring people back</h2>
        <div class="account">
          <label>Message</label>
          <input data-msg maxlength="200">
          <p class="muted" style="margin-top:6px" data-limits></p>
        </div>
        <div class="custctl" style="margin-top:18px">
          <div><label>Card</label><select data-card><option value="all">All cards</option></select></div>
        </div>
        <div data-buckets style="margin-top:14px"><p class="muted">Loading…</p></div>
        <details class="grp" style="margin-top:22px" data-find>
          <summary><span class="gt">Find a card</span><span class="gh">look up one customer by their code</span></summary>
          <input data-search placeholder="🔍 Card code" autocomplete="off" style="text-transform:uppercase;margin-top:10px">
          <div data-results style="margin-top:10px"></div>
        </details>\`;
      const q = (s) => div.querySelector(s);
      let all = [], buckets = [], limits = { perWeek: 1 };

      /** Send. The server decides who is actually eligible and reports back. */
      async function nudge(payload, what, expected) {
        const message = q("[data-msg]").value.trim();
        if (!message) return toast("Type a message first");
        if (!expected) return toast("Nobody to nudge there");
        const { body } = await api("/nudge", { method: "POST", body: JSON.stringify(Object.assign({ message }, payload)) });
        if (!body.ok) return toast(body.error || "Failed");
        const s = body.skipped || {};
        const held = (s.rateLimited || 0) + (s.removed || 0);
        toast("Nudged " + body.sent + " of " + body.total + (held ? " · " + held + " held back by the limits" : ""));
        load();
      }

      // One row per cohort. The counts are live sums over whoever is in the
      // bucket right now — a card that ages from one week into the next takes
      // its own nudge history with it, so nothing here is an average.
      function renderBuckets() {
        const host = q("[data-buckets]"); host.innerHTML = "";
        if (!all.length && !buckets.some((b) => b.customers)) {
          host.innerHTML = '<p class="muted">No customers yet — they appear once someone adds your card and gets their first stamp.</p>';
          return;
        }
        for (const b of buckets) {
          // Every group renders, including at zero. Hiding the empty ones made
          // groups appear and vanish between visits, so there was no way to
          // tell "nobody is on cooldown" from "that group doesn't exist".
          const el = document.createElement("div");
          el.className = "bucket";
          const bits = [b.customers + (b.customers === 1 ? " customer" : " customers")];
          el.innerHTML = \`
            <div class="ctop">
              <strong>\${b.label}</strong>
              <span class="cprog">\${b.customers}</span>
              \${b.nudgeable ? '<button class="btn btn-ghost cn" data-n' + (b.eligible ? "" : " disabled") + '>Nudge ' + b.eligible + '</button>' : ""}
            </div>
            <div class="cmeta">\${bits.join(" · ")} · \${b.hint}</div>\`;
          const btn = el.querySelector("[data-n]");
          if (btn && b.eligible) btn.onclick = () => nudge({ target: b.key }, b.label, b.eligible);
          host.appendChild(el);
        }
      }

      // Code and progress on one line, the story underneath.
      function row(x) {
        const el = document.createElement("div"); el.className = "crow";
        const seen = x.lastDays === 0 ? "in today" : x.lastDays + " days ago";
        const why = x.blocked === "rate-limited" ? "messaged in the last 7 days"
          : x.blocked === "removed" ? "deleted the card" : "";
        const meta = [x.cardName, "last " + seen].join(" · ");
        el.innerHTML = \`
          <div class="ctop">
            <strong>\${x.code}</strong>
            <span class="cprog">\${x.stamps}/\${x.target}</span>
            \${x.canNudge ? '<button class="btn btn-ghost cn" data-n>Nudge</button>' : ""}
          </div>
          <div class="cmeta">\${meta}\${x.unanswered ? ' · <span class="warn">' + x.unanswered + ' unanswered</span>' : ""}\${why ? ' · <span class="warn">' + why + "</span>" : ""}</div>\`;
        const btn = el.querySelector("[data-n]");
        if (btn) btn.onclick = () => nudge({ target: [x.serial] }, "customer", 1);
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
        const card = q("[data-card]").value;
        const { body } = await api("/customers?cardId=" + encodeURIComponent(card));
        all = body.customers || [];
        buckets = body.buckets || [];
        limits = body.limits || limits;
        q("[data-limits]").innerHTML = "Edit this before you send — it goes out exactly as written. " +
          "Nothing is ever sent on its own, and there is one rule: each customer can be messaged once every 7 days.";
        const sel = q("[data-card]");
        if (!sel.dataset.filled) {
          sel.insertAdjacentHTML("beforeend", (body.cards || []).map((c) => '<option value="' + c.id + '">' + c.name + '</option>').join(""));
          sel.dataset.filled = "1";
        }
        // Pre-fill with the shop's stored starting message, so the box is never
        // empty. It is edited here and nowhere else now — the duplicate field in
        // Card → Rules was two places to set one message, on a page the owner
        // wasn't on when they sent it.
        const src = card === "all" ? S.cards[0] : S.cards.find((c) => c.id === card);
        if (!q("[data-msg]").dataset.touched) q("[data-msg]").value = (src && src.winbackMessage) || "";
        renderBuckets();
        renderResults();
      }
      q("[data-msg]").oninput = (e) => { e.target.dataset.touched = "1"; };
      q("[data-card]").onchange = load;
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
        host.appendChild(designPanel(S.cards[S.selCard]));
        host.appendChild(sharePanel(S.cards[S.selCard]));
      }
      draw();
      return div;
    }

    // ---- The two links for the selected card, at the very bottom ----
    // You need these once, when you set the card up — so they sit under
    // everything you actually come back to edit. They never change when the card
    // does, which is the whole point of putting them beside it.
    function sharePanel(c) {
      const div = document.createElement("div");
      div.innerHTML = \`
        <h2 class="sec">Share this card</h2>
        <p class="muted">Print the QR for your counter. Both links stay the same however you edit the card.</p>
        <div class="sharelist" style="margin-top:10px">
          <a href="/c/\${c.id}" target="_blank"><span>\${c.name} <span class="sub2">the sign-up link</span></span><span class="arr">open →</span></a>
          <a href="/c/\${c.id}/qr" target="_blank"><span>\${c.name} QR <span class="sub2">print this for the counter</span></span><span class="arr">open →</span></a>
        </div>\`;
      return div;
    }

    // ---- Settings: the staff page, then your own login ----
    // The old Access tab existed only because the PIN hung off each café row, so
    // every card had its own PIN and its own stamper link. There is one counter,
    // so there is one PIN — and the links belong beside the card they open.
    function accountPanel() {
      const div = document.createElement("div");
      div.innerHTML = \`
        <h2 class="sec first">Staff page</h2>
        <p class="muted">One PIN for your whole counter — it works on every card you run. Stored scrambled, so it can't be looked up, not even by us. If nobody remembers it, generate a new one.</p>
        <!-- The card id MUST be in this link. Without it a bare /staff has to
             guess which counter it is, and on a deployment with several
             merchants the guess used to be "whoever owns the café named
             default" — a stranger. -->
        <div class="sharelist" style="margin-top:10px">
          <a href="/staff?c=\${(S.cards[0] || {}).id || ""}" target="_blank"><span>Staff stamper <span class="sub2">staff sign in here with the PIN</span></span><span class="arr">open →</span></a>
        </div>
        <label style="margin-top:14px">Staff PIN</label>
        <div class="copyrow" style="margin-top:6px">
          <input data-pin placeholder="Set your own PIN (4–12 digits)" inputmode="numeric" autocomplete="off">
          <button class="btn btn-ghost" data-setpin>Set</button>
        </div>
        <button class="btn btn-ghost" style="margin-top:8px;width:auto;padding:10px 14px" data-newpin>Generate a new PIN</button>
        <div data-pinout></div>

        <h2 class="sec">Your account</h2>
        <label>Signed in as</label>
        <p style="font-weight:600;margin-bottom:6px">\${S.email}</p>
        <label style="margin-top:10px">Change password</label>
        <input data-cur type="password" placeholder="Current password" autocomplete="current-password">
        <label class="eye"><input type="checkbox" data-eye="[data-cur]"> Show current password</label>
        <input data-new type="password" placeholder="New password (min 8)" autocomplete="new-password" style="margin-top:8px">
        <label class="eye"><input type="checkbox" data-eye="[data-new]"> Show new password</label>
        <button class="btn btn-dark" style="margin-top:10px" data-pwsave>Update password</button>
        <button class="btn btn-ghost" style="margin-top:20px" data-out>Log out</button>\`;
      wireEyes(div);

      const pinOut = div.querySelector("[data-pinout]");
      // Shown once, right after it's set — there is no way back to it later.
      const reveal = (pin) => {
        pinOut.innerHTML = '<div class="temp">New staff PIN: <strong>' + pin + '</strong><br>' +
          'Write it down now. Every staff phone has to sign in again with it, on every card.</div>';
      };
      const setPin = async (pin) => {
        const { body } = await api("/staff-pin", { method: "POST", body: JSON.stringify({ pin }) });
        if (body.ok) reveal(body.staffPin);
        else toast(body.error === "pin-too-short" ? "Use at least 4 digits" : (body.error || "Couldn’t set the PIN"));
      };
      div.querySelector("[data-setpin]").onclick = () => {
        const el = div.querySelector("[data-pin]");
        const pin = el.value.trim();
        if (pin.length < 4) return toast("Use at least 4 digits");
        el.value = "";
        setPin(pin);
      };
      // Two taps rather than a dialog: this signs every staff phone out.
      armBtn(div.querySelector("[data-newpin]"), "Confirm — sign all phones out?", () => setPin(""));

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
    const S = { cards: [], email: "", tab: "customers", selCard: 0 };

    async function app() {
      const { status, body } = await api("/overview");
      if (status === 401) return authForm("login");
      S.cards = body.cards; S.email = body.email; S.selCard = 0; S.tab = "customers";
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
          <button data-tab="account">Settings</button>
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
      else if (S.tab === "account") panel.appendChild(accountPanel());
      else {
        // The numbers, then the people they are about — one page, in that order.
        panel.appendChild(homePanel());
        panel.appendChild(customersPanel());
      }
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

export function adminPage(): string {
  const css = /* css */ `
    body { max-width: none; }
    .awrap { width: 100%; max-width: 960px; }
    table { border-collapse: collapse; width: 100%; font-size: .9rem; margin-top: 12px; }
    th { text-align: left; color: var(--muted); font-size: .72rem; text-transform: uppercase; letter-spacing: .06em; padding: 8px 10px; border-bottom: 1px solid var(--line); }
    td { padding: 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
    .flags { font-size: .78rem; color: var(--muted); }
    /* Something that needs a phone call: a quiet merchant, a deleted card, an
       unclaimed reward, a phone redeeming far more than it stamps. */
    .bad { color: #9a3412; font-weight: 600; }
    .tw { overflow-x: auto; }
    .rst { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; align-items: end; }
    .rst select { width: auto; }
    .rst .btn { width: auto; padding: 10px 14px; }
    .temp { font-family: ui-monospace, Menlo, monospace; background: var(--ghost-bg); padding: 8px 10px; border-radius: 8px; margin-top: 10px; }
    .nfc { font-family: ui-monospace, Menlo, monospace; word-break: break-all; }
    .cbtn { width: auto; padding: 5px 10px; font-size: .78rem; margin-top: 4px; }
    /* Removing a card is not an edit that can be undone, so it gets the same
       two-tap treatment as giving away a reward. */
    .dbtn { width: auto; padding: 5px 10px; font-size: .78rem; margin-top: 4px; }
    /* A retired programme. Still listed here — this is the only place it shows
       at all — so it needs to read as retired at a glance. */
    .arch { font-size: .68rem; text-transform: uppercase; letter-spacing: .06em;
            background: var(--ghost-bg); color: var(--muted); padding: 2px 6px; border-radius: 5px; }
    .btn.armed { background: #9a3412; border-color: #9a3412; color: #fff; }
    .bantpl { display: flex; gap: 8px; flex-wrap: wrap; margin: 4px 0 2px; }
    .bantpl .bt { width: 84px; height: 40px; border-radius: 8px; border: 2px solid transparent; cursor: pointer;
                  position: relative; overflow: hidden; background-size: cover; background-position: center;
                  box-shadow: inset 0 0 0 1px rgba(0,0,0,.06); }
    .bantpl .bt:hover { border-color: var(--accent); }
    .bantpl .bt.sel { border-color: var(--accent); }
    .bantpl .bt span { position: absolute; inset: auto 0 2px 0; text-align: center; font-size: .58rem;
                       color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,.6); font-weight: 700; }
    #dfy label { display: block; margin-top: 10px; }
    #dfy input { width: 100%; }
    #dfy .btn { width: auto; padding: 10px 14px; margin-top: 12px; }
    /* --- card designs: form on the left, the thing you'd show a prospect on the right --- */
    #tpl label { display: block; margin-top: 10px; }
    #tpl input[type=text], #tpl input:not([type]) { width: 100%; }
    #tpl .btn { width: auto; padding: 10px 14px; margin-top: 14px; }
    .tplgrid { display: grid; grid-template-columns: 1fr 260px; gap: 24px; align-items: start; }
    @media (max-width: 680px) { .tplgrid { grid-template-columns: 1fr; } }
    .tplcolors { display: flex; gap: 14px; margin-top: 10px; }
    .tplcolors label { margin: 0; font-size: .8rem; color: var(--muted); }
    .tplcolors input { width: 44px; height: 30px; padding: 0; border: none; background: none; }
    /* A wallet card, roughly to scale — enough to judge a logo against a colour. */
    .mock { border-radius: 14px; padding: 14px; min-height: 190px; margin-top: 6px;
            box-shadow: 0 6px 22px rgba(0,0,0,.16); position: relative; overflow: hidden; }
    .mock .mb { position: absolute; inset: 0 0 auto 0; height: 62px; background-size: cover; background-position: center; }
    .mock .mtop { position: relative; display: flex; align-items: center; gap: 8px; margin-top: 66px; }
    .mock .mlogo { width: 30px; height: 30px; border-radius: 7px; object-fit: cover; background: rgba(255,255,255,.14); }
    .mock .mname { font-weight: 700; font-size: .95rem; }
    .mock .mlbl { font-size: .55rem; letter-spacing: .1em; opacity: .75; margin-top: 12px; }
    .mock .mdots { font-size: 1.1rem; letter-spacing: 3px; margin-top: 2px; }
    .mock .mrew { font-weight: 700; font-size: .9rem; margin-top: 1px; }
  `;
  const js = /* js */ `
    const $ = (s, el=document) => el.querySelector(s);
    async function api(p, o={}) {
      const r = await fetch("/admin/api" + p, { ...o, headers: { "Content-Type": "application/json", ...(o.headers||{}) } });
      return { status: r.status, body: await r.json().catch(() => ({})) };
    }

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

    // ---- Client-side card renderers (same approach as the owner dashboard) ----
    function shade(hex, p) {
      const n = parseInt((hex || "#3b2016").slice(1), 16), t = p < 0 ? 0 : 255, a = Math.abs(p);
      let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
      r = Math.round((t - r) * a) + r; g = Math.round((t - g) * a) + g; b = Math.round((t - b) * a) + b;
      return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }
    function drawBanner(style, c1, c2, w, h) {
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      const x = cv.getContext("2d");
      if (style === "diagonal") {
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
      } else {
        const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, c1); g.addColorStop(1, c2);
        x.fillStyle = g; x.fillRect(0, 0, w, h);
      }
      return cv.toDataURL("image/png");
    }
    // Same geometry as the owner designer's copy (see designPanel): @3x storeCard
    // strip, two rows, 60px clear margin, short last row centred. The accent
    // colour fills an earned stamp; unearned is the same shape at 25%.
    function drawStampStrip(filled, target, icon, bg, accent) {
      const W = 1125, H = 369, M = 60;
      const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
      const x = cv.getContext("2d");
      x.fillStyle = bg; x.fillRect(0, 0, W, H);
      const rows = target > 1 ? 2 : 1, cols = Math.max(1, Math.ceil(target / 2));
      const cw = (W - M * 2) / cols, ch = (H - M * 2) / rows;
      const r = Math.min(cw, ch) * 0.34;
      const perRow = Math.ceil(target / rows);
      for (let i = 0; i < target; i++) {
        const rowN = Math.floor(i / perRow), col = i % perRow;
        const inRow = Math.min(perRow, target - rowN * perRow);
        const cx = (W - cw * inRow) / 2 + cw * col + cw / 2, cy = M + ch * rowN + ch / 2;
        const on = i < filled;
        if (icon === "dot") {
          x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2);
          x.fillStyle = accent; x.globalAlpha = on ? 1 : .25; x.fill(); x.globalAlpha = 1;
        } else {
          x.font = (r * 1.9) + "px serif"; x.textAlign = "center"; x.textBaseline = "middle";
          x.globalAlpha = on ? 1 : .25; x.fillText(icon, cx, cy); x.globalAlpha = 1;
        }
      }
      return cv.toDataURL("image/png");
    }
    const VERTICALS = [
      { name: "Coffee",       emoji: "☕", bg: "#3b2016", fg: "#fffaf0", label: "#d6b278", banner: "gradient", icon: "☕", reward: "Free coffee" },
      { name: "Chicken rice", emoji: "🍗", bg: "#7a2f1c", fg: "#fff2ea", label: "#f6b98f", banner: "diagonal", icon: "🍗", reward: "Free plate" },
      { name: "Bubble tea",   emoji: "🧋", bg: "#38265e", fg: "#f2eefb", label: "#b9a4ec", banner: "glow",     icon: "🧋", reward: "Free drink" },
      { name: "Bakery",       emoji: "🥐", bg: "#8a5a12", fg: "#fff8ea", label: "#ffd98a", banner: "gradient", icon: "🥐", reward: "Free pastry" },
      { name: "Dessert",      emoji: "🍨", bg: "#7d2144", fg: "#fff0f4", label: "#f4a9c0", banner: "glow",     icon: "🍩", reward: "Free dessert" },
      { name: "Anything",     emoji: "⭐", bg: "#1f2124", fg: "#f4f4f5", label: "#a9d0ff", banner: "waves",    icon: "⭐", reward: "Free reward" },
    ];
    let picked = VERTICALS[0];

    // ------------------------------------------------- reusable card designs ----
    // Saved before the merchant exists, applied to their card once they sign up.
    // Stamp strips are NOT stored on a design — they depend on the target card's
    // stamp count, so they're re-rendered here at apply time.
    const STAMP_ICONS = ["dot", "☕", "🍗", "🧋", "🥐", "🍨", "🍜", "⭐", "🌸", "🍺"];
    let tplIcon = "dot";
    let tplLogoB64 = "";   // stripped of its data: prefix, ready to POST
    let tplLogoUrl = "";   // for the live preview

    function readAsPng(file, cb) {
      // Everything is normalised to a square PNG so the wallet gets one format
      // whatever the prospect sent us (usually a JPG off WhatsApp).
      const img = new Image();
      const fr = new FileReader();
      fr.onload = () => { img.onload = () => {
        const S = 300;
        const cv = document.createElement("canvas"); cv.width = S; cv.height = S;
        const x = cv.getContext("2d");
        const side = Math.min(img.width, img.height);
        x.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, S, S);
        cb(cv.toDataURL("image/png"));
      }; img.src = fr.result; };
      fr.readAsDataURL(file);
    }

    function drawTplMock() {
      const bg = $("#tpl-bg").value, fg = $("#tpl-fg").value, lbl = $("#tpl-label").value;
      const name = $("#tpl-name").value.trim() || "Their shop";
      const reward = $("#tpl-reward").value.trim() || "Free reward";
      const dots = tplIcon === "dot"
        ? "●●●○○○○○○○"
        : tplIcon.repeat(3) + "·".repeat(7);
      const m = $("#tpl-mock");
      m.style.background = bg; m.style.color = fg;
      m.innerHTML =
        '<div class="mb" style="background-image:url(' + drawBanner("gradient", bg, shade(bg, 0.4), 260, 62) + ')"></div>' +
        '<div class="mtop">' +
          (tplLogoUrl ? '<img class="mlogo" src="' + tplLogoUrl + '">' : '<div class="mlogo"></div>') +
          '<span class="mname">' + name + "</span>" +
        "</div>" +
        '<div class="mlbl" style="color:' + lbl + '">YOUR STAMPS</div>' +
        '<div class="mdots">' + dots + "</div>" +
        '<div class="mlbl" style="color:' + lbl + '">REWARD</div>' +
        '<div class="mrew">' + reward + "</div>";
    }

    function wireTemplates(cards) {
      const ipick = $("[data-ipick]");
      ipick.innerHTML = "";
      STAMP_ICONS.forEach((ic, i) => {
        const bt = document.createElement("div");
        bt.className = "bt" + (i === 0 ? " sel" : "");
        bt.style.display = "grid"; bt.style.placeItems = "center";
        bt.style.width = "44px"; bt.style.background = "var(--ghost-bg)";
        bt.textContent = ic === "dot" ? "●" : ic;
        bt.onclick = () => {
          tplIcon = ic;
          ipick.querySelectorAll(".bt").forEach((x) => x.classList.remove("sel"));
          bt.classList.add("sel"); drawTplMock();
        };
        ipick.appendChild(bt);
      });
      ["#tpl-name", "#tpl-reward", "#tpl-bg", "#tpl-fg", "#tpl-label"].forEach((s) => {
        $(s).oninput = drawTplMock;
      });
      $("#tpl-logo").onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        readAsPng(file, (url) => { tplLogoUrl = url; tplLogoB64 = url.split(",")[1]; drawTplMock(); });
      };
      drawTplMock();

      $("#tpl-save").onclick = async () => {
        const name = $("#tpl-name").value.trim();
        if (!name) return void ($("#tpl-out").textContent = "Give the design a name.");
        const bg = $("#tpl-bg").value;
        const { body: r } = await api("/templates", { method: "POST", body: JSON.stringify({
          name, reward: $("#tpl-reward").value.trim() || "Free reward",
          bg, fg: $("#tpl-fg").value, label: $("#tpl-label").value,
          stampStyle: tplIcon,
          logo: tplLogoB64,
          banner: drawBanner("gradient", bg, shade(bg, 0.4), 1032, 336).split(",")[1],
        })});
        $("#tpl-out").textContent = r.ok ? "" : (r.error || "Failed");
        if (r.ok) { $("#tpl-name").value = ""; drawTplMock(); listTemplates(cards); }
      };
      listTemplates(cards);
    }

    async function listTemplates(cards) {
      const { body } = await api("/templates");
      const t = $("#tpl-table");
      const list = body.templates || [];
      if (!list.length) {
        t.innerHTML = '<tr><td class="flags">No saved designs yet.</td></tr>';
        return;
      }
      const opts = cards.map((c) => '<option value="' + c.id + '">' + c.name + "</option>").join("");
      t.innerHTML = "<tr><th>Design</th><th>Reward</th><th>Colours</th><th>Push onto a card</th><th></th></tr>" +
        list.map((x) => \`<tr>
          <td><strong>\${x.name}</strong><br><span class="flags">\${x.has_logo ? "logo · " : ""}\${x.stamp_style === "dot" ? "dots" : x.stamp_style}</span></td>
          <td>\${x.reward}</td>
          <td><span style="display:inline-block;width:34px;height:18px;border-radius:5px;background:\${x.bg}"></span></td>
          <td><select data-to="\${x.id}">\${opts}</select>
              <button class="btn btn-ghost cbtn" data-apply="\${x.id}">Apply</button></td>
          <td><button class="btn btn-ghost cbtn" data-deltpl="\${x.id}">Delete</button></td>
        </tr>\`).join("");

      t.querySelectorAll("[data-apply]").forEach((b) => {
        b.onclick = async () => {
          const id = b.dataset.apply;
          const cardId = t.querySelector('[data-to="' + id + '"]').value;
          const card = cards.find((c) => c.id === cardId);
          const tpl = list.find((x) => x.id === id);
          b.disabled = true; b.textContent = "Applying…";
          // Re-render the stamp grid for THIS card's target — a saved design
          // can't know how many stamps the card it lands on will need.
          const target = card.stamps_target || 10;
          const icon = tpl.stamp_style || "dot";
          const strips = [];
          for (let n = 0; n <= target; n++) {
            strips.push({ filled: n, png: drawStampStrip(n, target, icon, tpl.bg, tpl.label_color).split(",")[1] });
          }
          const { body: r } = await api("/card/" + cardId + "/apply-template", {
            method: "POST", body: JSON.stringify({ templateId: id, strips }),
          });
          b.disabled = false; b.textContent = r.ok ? "Applied ✓" : "Failed";
          if (r.ok) setTimeout(load, 1200);
        };
      });
      t.querySelectorAll("[data-deltpl]").forEach((b) => {
        b.onclick = async () => {
          await api("/templates/" + b.dataset.deltpl, { method: "DELETE" });
          listTemplates(cards);
        };
      });
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
      const nfcUrl = (id) => origin + (id === "default" ? "/" : "/c/" + id);
      // "3 days ago" beats a date when the question is "is this one alive?".
      const ago = (d) => {
        if (!d) return "never";
        const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
        return days === 0 ? "today" : days === 1 ? "yesterday" : days + "d ago";
      };
      const pct = (x) => (x === null || x === undefined) ? "—" : Math.round(x * 100) + "%";
      const num = (x, dp) => (x === null || x === undefined) ? "—" : Number(x).toFixed(dp || 0);
      const stale = (d, days) => !d || (Date.now() - new Date(d).getTime()) > days * 86400000;

      const cardRow = (c) => \`
        <tr>
          <td><strong>\${c.name}</strong><br><span class="flags">\${c.id}</span></td>
          <td>\${c.owners || "—"}</td>
          <td>\${c.active}<br><span class="flags">\${c.active_7d} this week</span></td>
          <td>\${c.stamps}<br><span class="flags">\${c.stamps_7d} / 7d · \${c.stamps_30d} / 30d</span></td>
          <td>\${c.redemptions}</td>
          <td class="\${stale(c.last_stamp_at, 7) ? "bad" : ""}">\${ago(c.last_stamp_at)}</td>
          <td class="\${stale(c.last_owner_login, 30) ? "bad" : ""}">\${ago(c.last_owner_login)}</td>
          <td class="flags"><span class="nfc">\${nfcUrl(c.id)}</span><br>
            <button class="btn btn-ghost cbtn" data-nfc="\${nfcUrl(c.id)}">Copy</button>
            <a class="btn btn-ghost cbtn" href="/admin/card/\${c.id}/sheet" target="_blank">Counter sheet</a>
            \${c.archived_at
              ? '<button class="btn btn-ghost dbtn" data-unarchive="' + c.id + '">Restore</button>'
              : '<button class="btn btn-ghost dbtn" data-archive="' + c.id + '">Archive</button>'}</td>
        </tr>\`;
      // Retired programmes drop out of every table into a fold underneath it, so
      // each section is the shops actually being run — but their numbers are one
      // click away rather than gone. Archiving re-runs load(), so a card moves
      // down the moment it is archived.
      const archivedIds = new Set(body.cards.filter((c) => c.archived_at).map((c) => c.id));
      /** → { live, fold }: rows for the section's table, and its Archived fold. */
      function splitArchived(items, idOf, header, rowFn, note) {
        const live = items.filter((x) => !archivedIds.has(idOf(x)));
        const gone = items.filter((x) => archivedIds.has(idOf(x)));
        const fold = gone.length
          ? \`<details class="fold" style="margin-top:12px">
               <summary>Archived (\${gone.length})</summary>
               \${note ? '<p class="muted" style="margin:0 0 10px">' + note + "</p>" : ""}
               <div class="tw"><table>\${header}\${gone.map(rowFn).join("")}</table></div>
             </details>\`
          : "";
        return { live: live.map(rowFn).join(""), fold };
      }

      const CARD_HEAD = \`<tr><th>Programme</th><th>Owner(s)</th><th>Customers</th><th>Stamps</th><th>Redeemed</th><th>Last stamp</th><th>Owner last in</th><th>Sign-up / NFC link</th></tr>\`;
      const main = splitArchived(
        body.cards, (c) => c.id, CARD_HEAD, cardRow,
        "Off their owner's dashboard and off their join link. Cards already in customers' wallets still stamp, and everything they do is still recorded. Restore puts one back.",
      );
      const rows = main.live;
      const archivedBlock = main.fold;

      // The sign-up funnel, every figure counted from the event log rather than
      // from pass rows — so the 30-day cleanup of never-used cards cannot move
      // any of these numbers. Each step's drop says something different about
      // where a merchant's flow is leaking.
      const byId = new Map(body.cards.map((c) => [c.id, c]));
      const drop = (from, to) => (from > 0 ? Math.round((1 - to / from) * 100) : null);
      const lossy = (from, to) => from >= 10 && drop(from, to) >= 50;
      const funnelRow = (f) => {
        const c = byId.get(f.id) || {};
        return \`
        <tr>
          <td><strong>\${f.name}</strong>\${c.archived_at ? ' <span class="arch">archived</span>' : ""}</td>
          <td>\${f.scanned}</td>
          <td class="\${lossy(f.scanned, f.clicked) ? "bad" : ""}">\${f.clicked}</td>
          <td class="\${lossy(f.clicked, f.made) ? "bad" : ""}">\${f.made}</td>
          <td class="\${lossy(f.made, f.landed) ? "bad" : ""}">\${f.landed}</td>
          <td class="\${c.removed ? "bad" : ""}">\${c.removed ?? 0}</td>
          <td>\${c.active ?? 0}</td>
        </tr>\`;
      };
      const FUNNEL_HEAD = \`<tr><th>Programme</th><th>Scanned</th><th>Tapped Add</th><th>Card made</th><th>Landed</th><th>Deleted</th><th>Customers</th></tr>\`;
      const funnel = splitArchived(body.funnel || [], (f) => f.id, FUNNEL_HEAD, funnelRow);

      const retRow = (r) => \`
        <tr>
          <td><strong>\${r.name}</strong></td>
          <td>\${pct(r.second_visit_rate)}</td>
          <td>\${pct(r.third_visit_rate)}</td>
          <td>\${num(r.median_gap_days, 1)}</td>
          <td>\${num(r.median_days_to_first_stamp, 1)}</td>
          <td>\${pct(r.completion_rate)}</td>
          <td>\${num(r.median_days_to_reward, 0)}</td>
          <td class="\${r.unclaimed_rewards ? "bad" : ""}">\${r.unclaimed_rewards}</td>
          <td>\${pct(r.alive_30)} · \${pct(r.alive_60)} · \${pct(r.alive_90)}</td>
        </tr>\`;
      const RET_HEAD = \`<tr><th>Programme</th><th>2nd visit</th><th>3rd visit</th><th>Days between</th><th>To 1st stamp</th><th>Finish a card</th><th>Days to reward</th><th>Owed</th><th>Still active 30/60/90</th></tr>\`;
      const ret = splitArchived(body.retention || [], (r) => r.id, RET_HEAD, retRow);

      const staffRow = (s) => {
        // The fraud signal: a phone giving out rewards disproportionately to the
        // stamps it adds. Small numbers are noise, so only flag real volume.
        const share = s.stamps ? s.redeems / s.stamps : 0;
        const odd = s.stamps >= 10 && share > 0.3;
        return \`<tr>
          <td>\${s.cafe_name}</td>
          <td class="nfc">\${s.actor.replace("staff:", "")}</td>
          <td>\${s.stamps}</td>
          <td class="\${odd ? "bad" : ""}">\${s.redeems}\${s.stamps ? " (" + Math.round(share * 100) + "%)" : ""}</td>
          <td>\${s.undos}</td>
          <td>\${s.forced}</td>
          <td class="flags">\${ago(s.last_seen)}</td>
        </tr>\`;
      };
      const STAFF_HEAD = \`<tr><th>Programme</th><th>Phone</th><th>Stamps</th><th>Rewards given</th><th>Undos</th><th>Forced</th><th>Last seen</th></tr>\`;
      const staff = splitArchived(body.staff || [], (x) => x.card_id, STAFF_HEAD, staffRow);
      // Did chasing quiet customers actually work, and is anyone leaning on the
      // override at the counter? Both are only answerable now that events record
      // who did what.
      const wbRow = (c) => {
        const rate = c.nudged ? Math.round((c.nudge_returned / c.nudged) * 100) + "%" : "—";
        return \`<tr>
          <td><strong>\${c.name}</strong></td>
          <td>\${c.nudged}</td>
          <td>\${c.nudge_returned}</td>
          <td>\${Math.max(0, c.nudged - c.nudge_returned)}</td>
          <td>\${rate}</td>
        </tr>\`;
      };
      const WB_HEAD = \`<tr><th>Programme</th><th>Nudged</th><th>Came back</th><th>Didn't</th><th>Return rate</th></tr>\`;
      const wb = splitArchived(body.cards, (c) => c.id, WB_HEAD, wbRow);
      const opts = body.owners.map((o) => '<option value="' + o.id + '">' + o.email + '</option>').join("");
      $("#app").innerHTML = \`
        <h1>Platform admin</h1>
        <p class="sub">\${body.cards.length} loyalty programmes · \${body.owners.length} owners. Read-only, plus password resets.</p>
        <p class="muted" style="margin:-4px 0 10px"><strong>Customers</strong> = cards stamped at least once or confirmed in a wallet. Stamps exclude free welcome stamps. Red means quiet: no stamp for a week, or no dashboard login for a month.</p>
        <div class="tw"><table>
          <tr><th>Programme</th><th>Owner(s)</th><th>Customers</th><th>Stamps</th><th>Redeemed</th><th>Last stamp</th><th>Owner last in</th><th>Sign-up / NFC link</th></tr>
          \${rows}
        </table></div>
        \${archivedBlock}
        <p class="muted" style="margin-top:8px">The sign-up / NFC link is the Add-to-Wallet URL to program onto a card's NFC sticker — you set these up for merchants (they don't see it).</p>

        <h2>Sign-up funnel</h2>
        <p class="muted">One row per loyalty programme — each row IS one programme, and every number in it counts <em>customers</em>, never programmes. Read left to right: a big drop between two columns is where that merchant is losing sign-ups. Red marks a step losing half or more, once there are at least 10 to judge by.</p>
        <p class="muted"><strong>Scanned</strong> opened the poster link (crawlers excluded) · <strong>Tapped Add</strong> chose a wallet · <strong>Card made</strong> got one issued · <strong>Landed</strong> is confirmed sitting in their wallet.</p>
        <p class="muted">A tap is recorded before the card is minted and even when minting fails, so <strong>Tapped Add</strong> can never be lower than <strong>Card made</strong> on recent data. If it is higher, Adds are failing — expired Apple certificates or unconfigured Google — and that is worth acting on.</p>
        <p class="muted">Counted from the event log, so the automatic cleanup of never-used cards never moves these numbers. Three things to read carefully: scans and taps have only been recorded since <strong>28 July 2026</strong>, so anything from before that shows <strong>0</strong> in the first two columns — that is missing history, not a real drop-off; <strong>Landed</strong> counts each add, so someone who deletes and re-adds counts twice and can push it above <strong>Card made</strong>; and <strong>Landed</strong> and <strong>Deleted</strong> rely on the wallet telling us — Apple always has, Google only since the issuer callback was set up, so older Android sign-ups under-report on those two.</p>
        <div class="tw"><table>
          \${FUNNEL_HEAD}
          \${funnel.live}
        </table></div>
        \${funnel.fold}

        <h2>Do they come back?</h2>
        <p class="muted">The only questions that decide whether a merchant renews. <strong>2nd visit</strong> is the big one: of everyone who ever got a stamp, how many came back at all. <strong>To 1st stamp</strong> is time-to-value. <strong>Owed</strong> = cards sitting at their target with the reward not yet claimed. <strong>Still active</strong> counts only cards old enough to judge, so a new merchant isn't scored as a failure.</p>
        <div class="tw"><table>
          \${RET_HEAD}
          \${ret.live}
        </table></div>
        \${ret.fold}

        <h2>Win-back</h2>
        <p class="muted"><strong>Came back</strong> = a stamp after the last message, so the nudge worked. One rule governs sending: each customer can be messaged once every 7 days, counted per person rather than per card. Nothing goes out on a timer.</p>
        <div class="tw"><table>
          \${WB_HEAD}
          \${wb.live}
        </table></div>
        \${wb.fold}

        <h2>Counter audit</h2>
        <p class="muted">Per staff <em>phone</em>, not per person — a device that signs out and back in gets a new id, and changing the PIN resets them all. So this is "phone A vs phone B". <strong>Redeems</strong> is flagged when a phone hands out rewards on more than 30% of the stamps it adds; that's the shape free-coffee-for-friends takes. <strong>Forced</strong> = confirmed past the "just stamped" warning.</p>
        <div class="tw"><table>
          \${STAFF_HEAD}
          \${staff.live || '<tr><td colspan="7" class="flags">No counter activity yet.</td></tr>'}
        </table></div>
        \${staff.fold}

        <h2>Card designs</h2>
        <p class="muted">Mock a card up for a prospect before they have an account, then push it onto their card once they sign up — after that all they touch is the wording and the colours. Drop in their logo and you have something to show them in a minute.</p>
        <div id="tpl">
          <div class="tplgrid">
            <div>
              <label>Design name</label><input id="tpl-name" placeholder="e.g. Ah Seng Kopitiam">
              <label>Reward</label><input id="tpl-reward" placeholder="Free coffee">
              <label>Logo <span class="muted">(square PNG or JPG)</span></label>
              <input id="tpl-logo" type="file" accept="image/*">
              <label>Stamp icon</label>
              <div class="bantpl" data-ipick></div>
              <div class="tplcolors">
                <label>Card<input id="tpl-bg" type="color" value="#3b2016"></label>
                <label>Text<input id="tpl-fg" type="color" value="#fffaf0"></label>
                <label>Labels<input id="tpl-label" type="color" value="#d6b278"></label>
              </div>
              <button class="btn btn-dark" id="tpl-save">Save this design</button>
            </div>
            <div>
              <label>Preview</label>
              <div class="mock" id="tpl-mock"></div>
            </div>
          </div>
          <div id="tpl-out"></div>
          <div class="tw"><table id="tpl-table"></table></div>
        </div>

        <h2>Create a café (done-for-you)</h2>
        <p class="muted">Design a card and set up the owner's account in one step. Pick their business type, and we build a matching card. They get a temp password to log in and take over.</p>
        <div id="dfy">
          <label>Business type</label>
          <div class="bantpl" data-vpick></div>
          <label>Café name</label><input id="dfy-name" placeholder="e.g. Nasi Lemak House">
          <label>Owner email</label><input id="dfy-email" type="email" placeholder="owner@card.my">
          <button class="btn btn-dark" id="dfy-create">Create café + account</button>
        </div>
        <div id="dfy-out"></div>

        <h2>Reset an owner's password</h2>
        <p class="muted">Passwords are stored scrambled and can never be viewed — this sets a NEW temporary one to hand over.</p>
        <div class="rst">
          <div><label>Owner</label><select id="who">\${opts}</select></div>
          <button class="btn btn-dark" id="reset">Generate temp password</button>
        </div>
        <div id="tempout"></div>\`;

      wireTemplates(body.cards);

      // Business-type swatches (click to select the design bundle).
      const vpick = $("[data-vpick]");
      VERTICALS.forEach((v, i) => {
        const bt = document.createElement("div"); bt.className = "bt" + (i === 0 ? " sel" : ""); bt.title = v.name;
        bt.style.backgroundImage = "url(" + drawBanner(v.banner, v.bg, shade(v.bg, 0.4), 144, 64) + ")";
        bt.innerHTML = "<span>" + v.emoji + " " + v.name + "</span>";
        bt.onclick = () => { picked = v; vpick.querySelectorAll(".bt").forEach((x) => x.classList.remove("sel")); bt.classList.add("sel"); };
        vpick.appendChild(bt);
      });
      $("#dfy-create").onclick = async () => {
        const cafeName = $("#dfy-name").value.trim(), ownerEmail = $("#dfy-email").value.trim();
        if (!cafeName) return void ($("#dfy-out").textContent = "Enter a café name.");
        if (!ownerEmail.includes("@")) return void ($("#dfy-out").textContent = "Enter a valid owner email.");
        $("#dfy-create").disabled = true; $("#dfy-out").textContent = "Creating…";
        const strips = [];
        for (let n = 0; n <= 10; n++) strips.push({ filled: n, png: drawStampStrip(n, 10, picked.icon, picked.bg, picked.label).split(",")[1] });
        const banner = drawBanner(picked.banner, picked.bg, shade(picked.bg, 0.4), 1032, 336).split(",")[1];
        const { body: r } = await api("/card", { method: "POST", body: JSON.stringify({
          cafeName, ownerEmail, reward: picked.reward,
          bg: picked.bg, fg: picked.fg, label: picked.label, stampStyle: picked.icon,
          banner, strips,
        })});
        $("#dfy-create").disabled = false;
        if (r.ok) {
          // The PIN is only ever stored hashed, so this is the one time it can be
          // read — after this it can only be replaced from the owner's dashboard.
          $("#dfy-out").innerHTML = '<div class="temp">Created <strong>' + cafeName + '</strong> for <strong>' + r.ownerEmail + '</strong>.<br>Temp password: <strong>' + r.tempPassword + '</strong> — they log in at /dashboard and can change it.<br>Staff PIN: <strong>' + r.staffPin + '</strong> — write this down now, it can’t be looked up later.</div>';
          $("#dfy-name").value = ""; $("#dfy-email").value = "";
          setTimeout(load, 1500); // refresh the table to show the new café
        } else {
          $("#dfy-out").textContent = r.error === "email-taken" ? "That email already has an account." : (r.error || "Failed");
        }
      };
      $("#app").querySelectorAll(".cbtn").forEach((b) => {
        b.onclick = async () => {
          try { await navigator.clipboard.writeText(b.dataset.nfc); b.textContent = "Copied ✓"; }
          catch { b.textContent = b.dataset.nfc; }
        };
      });
      // Archiving is always safe — nothing is destroyed and it is reversible —
      // so the only refusal left is taking away a shop's last live card.
      const WHY = {
        "last-card": "Their only card — kept",
        "no-such-card": "Not found",
        already: "Already archived",
      };
      $("#app").querySelectorAll("[data-archive]").forEach((b) => {
        armBtn(b, "Tap again to archive", async () => {
          b.disabled = true;
          const { body: r } = await api("/card/" + b.dataset.archive + "/archive", { method: "POST" });
          if (r.ok) return void load();
          b.disabled = false;
          b.textContent = WHY[r.error] || "Failed";
        });
      });
      // Restoring needs no confirmation: it puts back something still there.
      $("#app").querySelectorAll("[data-unarchive]").forEach((b) => {
        b.onclick = async () => {
          b.disabled = true;
          const { body: r } = await api("/card/" + b.dataset.unarchive + "/unarchive", { method: "POST" });
          if (r.ok) return void load();
          b.disabled = false;
          b.textContent = "Failed";
        };
      });
      $("#reset").onclick = async () => {
        const { body: r } = await api("/owner/" + $("#who").value + "/reset-password", { method: "POST" });
        if (r.ok) $("#tempout").innerHTML = '<div class="temp">New password for <strong>' + r.email + '</strong>: <strong>' + r.tempPassword + '</strong><br>Give it to them; they can change it in their dashboard.</div>';
        else $("#tempout").textContent = r.error || "Failed";
      };
    }
    load();
  `;
  return page(
    "Stampy — Admin",
    `<div class="card awrap" id="app"><p class="sub">Loading…</p></div>`,
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
