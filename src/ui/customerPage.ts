/**
 * The customer's own page — what they see when they open their card's link.
 *
 * New in V2, and deliberately small. It is the first page in this product
 * addressed to the customer AFTER they have a card; everything before it was
 * about getting them one.
 *
 * Three things about it are decided and should not drift:
 *
 *   1. **It is not linked from cards already in wallets, and must not pretend
 *      to be.** The links inside an Apple or Google card are baked in when the
 *      card is made; adding one means re-pushing every card that exists. So
 *      this page is reachable from a programme's sharing section, an owner can
 *      look at it, and wiring it into issued cards is its own job.
 *   2. **No serial and no auth token in the URL.** Those two are inside cards
 *      on customers' phones and the barcode content IS the serial. The address
 *      is /c/:cardId/me and the person is identified by the same signed
 *      per-merchant cookie the sign-up flow already sets.
 *   3. Customer details stay lookup-only. They are never credentials and never
 *      become a second customer identity beside the signed merchant cookie.
 *
 * The progress figures are placeholders for now: reading a live balance means
 * resolving the cookie to a pass on the server, which is a real change to a
 * public route rather than a screen. What is real here is the shop's branding,
 * the offer, and the shape.
 */
import { contrastText, rgbToHex } from "../color.js";
import type { CardRow } from "../db.js";
import { DEFAULT_CARD_ID } from "../db.js";
import { esc, page } from "./kit.js";

export function customerCardPage(
  card: CardRow,
  /** The shop's name. Defaults to the card's, which is right until a merchant runs two. */
  business = card.name,
  /** 0 = no uploaded logo, so the page falls back to the shop's initial. */
  logoVersion = 0,
  /** False when this browser holds no card for this shop — see the note below. */
  known = true,
): string {
  const base = card.id === DEFAULT_CARD_ID ? "" : `/c/${card.id}`;
  const bg = rgbToHex(card.background_color);
  const accent = rgbToHex(card.accent_color);
  const onBg = contrastText(bg);

  const css = /* css */ `
    /* The shop's colours, in a header rather than over the whole page — the
       same choice the sign-up page makes, and for the same reason: everything
       below has to stay readable whatever the shop picked. */
    .mhero { background: ${bg}; color: ${onBg}; margin: -20px -20px 18px;
             padding: 26px 20px 22px; border-radius: 0 0 22px 22px; text-align: center; }
    .mhero h1 { color: ${onBg}; margin: 0; font-size: 1.5rem; }
    .mhero img { height: 68px; width: auto; max-width: min(260px, 100%);
                 object-fit: contain; margin-bottom: 10px; }
    .mhero p { color: ${onBg}; opacity: .85; margin: 8px 0 0; font-size: .92rem; }
    .card { overflow: hidden; }
    /* Progress. One bar, because a customer wants one answer: how close am I. */
    .mbar { height: 12px; border-radius: 999px; background: var(--ghost-bg); overflow: hidden; }
    .mbar i { display: block; height: 100%; background: ${accent}; }
    .mrow { display: flex; align-items: baseline; gap: 12px; padding: 12px 0;
            border-bottom: 1px solid var(--line); font-size: .92rem; }
    .mrow span { color: var(--muted); }
    .mrow b { margin-left: auto; }
    .msoon { display: inline-block; background: var(--ghost-bg); color: var(--muted);
             border-radius: 999px; padding: 3px 9px; font-size: .64rem; font-weight: 700;
             letter-spacing: .06em; text-transform: uppercase; margin-left: 8px; }
  `;

  const logo = logoVersion
    ? `<img src="${base}/art/logo.png?v=${logoVersion}" alt="${esc(business)}">`
    : "";

  // A browser with no card for this shop. Not an error — the ordinary way to
  // arrive here is from a wallet card, and somebody who opens the link on a
  // laptop has simply not got one on that machine.
  const body = known
    ? `
      <p class="muted">Your card</p>
      <div class="mbar"><i style="width:40%"></i></div>
      <p class="muted" style="margin-top:8px">Your progress will show here.<span class="msoon">Coming</span></p>
      <div class="mrow"><span>Your reward</span><b>${esc(card.reward || "A reward")}</b></div>
      <div class="mrow"><span>Stamps needed</span><b>${card.stamps_target}</b></div>
      <div class="mrow"><span>Marketing messages</span><b>On<span class="msoon">Coming</span></b></div>
      <p class="muted">Turning off messages from this shop is coming. Deleting the card from your
        wallet stops everything today.</p>`
    : `
      <p class="muted">Open this page from the card in your wallet and it will show your
        progress. On a phone that has never added this shop's card, there is nothing
        to show yet.</p>
      <a class="btn btn-dark" style="margin-top:14px" href="${base || "/c/" + card.id}">Get your card</a>`;

  return page(
    `${business} — your card`,
    `<div class="card">
       <div class="mhero">
         ${logo}
         <h1>${esc(business)}</h1>
         <p>${esc(card.reward ? `Collect ${card.stamps_target} stamps, get ${card.reward}` : "Your loyalty card")}</p>
       </div>
       ${body}
       <p class="muted" style="margin-top:20px;font-size:.78rem">Your saved name and phone number help
         this shop find your loyalty card. They are not used for marketing or sold.
         <a href="/privacy">How we handle your data</a>.</p>
     </div>`,
    css,
  );
}
