/**
 * All HTML pages, server-rendered from template strings — no frontend build,
 * nothing for the founder to compile. Mobile-first (staff use their phones).
 *
 * The page SHELL and the blocks of browser code that more than one page renders
 * live in src/ui/kit.ts, and the owner dashboard lives in src/dashboardV2.ts.
 * Both are re-exported below, so every existing `from "../pages.js"` import —
 * in the routes and in the test suites — still resolves to the same thing.
 */
import { contrastRatio, contrastText, rgbToHex } from "./color.js";
import { CHURN_DAYS, FLAG_GUIDE, STAGE_LABEL } from "./health.js";
import { type SetupStatus } from "./config.js";
import type { CardRow } from "./db.js";
import { DEFAULT_CARD_ID, FUNNEL_SINCE, FUNNEL_SINCE_LABEL, TRIAL_DAYS } from "./db.js";
import { benefitLines, catalogueSummary, milestoneSummary } from "./passModel.js";
import {
  DESIGN_PANEL_CSS,
  DESIGN_PANEL_JS,
  esc,
  HEALTH_JS,
  MODAL_CSS,
  MODAL_JS,
  page,
  PALETTE_JS,
  POWERED_BY,
  PRODUCT_NAME,
  SEG_CSS,
  SEG_JS,
} from "./ui/kit.js";

// The kit is part of this module's public face: the routes and the tests have
// always imported these names from here, and a move between files is not a
// reason to make every one of them change.
// The dashboard lives in its own file too; same reasoning, same re-export.
export { dashboardPage } from "./dashboardV2.js";

export {
  DESIGN_PANEL_CSS,
  DESIGN_PANEL_JS,
  esc,
  HEALTH_JS,
  MODAL_CSS,
  MODAL_JS,
  page,
  PALETTE_JS,
  POWERED_BY,
  PRODUCT_NAME,
  SEG_CSS,
  SEG_JS,
};

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
