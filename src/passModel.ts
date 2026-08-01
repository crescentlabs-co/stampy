/**
 * Pure pass-content logic — no certificates, no I/O — so the card's look and
 * notification wording are unit-testable before Apple approval even lands.
 */
import { config } from "./config.js";
import type { CardRow, PassRow } from "./db.js";

/** "●●●○○○○○○○" — filled vs empty stamp slots. */
export function stampDots(count: number, target: number): string {
  const filled = Math.max(0, Math.min(count, target));
  return "●".repeat(filled) + "○".repeat(Math.max(0, target - filled));
}

export function isRewardReady(row: Pick<PassRow, "stamp_count" | "stamps_target">): boolean {
  return row.stamp_count >= row.stamps_target;
}

/** "7/10" — the plain tally. One wording, so nothing drifts between surfaces. */
export function progressText(earned: number, total: number): string {
  return `${earned}/${total}`;
}

/**
 * The one-line status shown as the card's header, with no label beside it.
 *
 * It counts UP while that is the encouraging number and flips to counting DOWN
 * once the customer is at least halfway — "3 left" pulls harder than "7 earned"
 * when the reward is close.
 *
 * Every count from 0 to total yields a DIFFERENT string, which is what makes the
 * lock-screen banner fire on every stamp: iOS only shows one when the field's
 * value actually changed. A test enforces that distinctness — if you edit this,
 * keep it true or stamps go silent.
 */
export function getHeaderFieldValue(earned: number, total: number): string {
  const filled = Math.max(0, Math.min(earned, total));
  if (filled >= total) return "Reward ready";
  const remaining = total - filled;
  return remaining <= filled ? `${remaining} left` : `${filled} earned`;
}

/**
 * The stamp grid is derived from the total, never merchant-configurable: always
 * two rows, so the strip image has a consistent shape at any target. An odd
 * total leaves the last row one short, and the renderer centres it.
 */
export function stampGrid(total: number): { rows: number; cols: number } {
  return { rows: 2, cols: Math.max(1, Math.ceil(total / 2)) };
}

/**
 * The reward terms printed on the back of the card, on BOTH platforms — Apple
 * reads it from here, googleModel.ts imports the same function. One wording, so
 * an Android customer and an iPhone customer are never shown different terms.
 *
 * Expiry is stated as a reserved right, not a promise: nothing in the code
 * expires a stamp, and there is no per-card expiry setting. Say "may" or say
 * nothing — a card that claims an automatic behaviour we don't implement is
 * worse than one that stays quiet. If a real expiry mechanism ever lands, this
 * string is where the number comes from.
 */
export function rewardTerms(business: string): string {
  return [
    "One stamp per visit.",
    `${business} decides what earns a stamp and provides the reward — Stampy only runs the card.`,
    "Stamps may expire after 12 months without a visit.",
    `${business} may substitute a reward of similar value or end the programme at any time.`,
    "Stamps have no cash value and cannot be exchanged, sold or transferred.",
  ].join(" ");
}

/** Links to the policies, for the back of the card. PassKit linkifies bare URLs. */
export function legalText(): string {
  const base = config.baseUrl || "";
  return `We never ask for your name, phone number or email. To stop, delete this card from your wallet.\n\nTerms: ${base}/terms\nPrivacy: ${base}/privacy`;
}

/**
 * Builds the complete pass.json content for a card, branded per café.
 *
 * Notification design (the hero feature): iOS shows a lock-screen banner when
 * a field that carries `changeMessage` changes. Exactly two fields carry one:
 *  - the `progress` header      → fires on every stamp ("3 left — free coffee at 10")
 *  - the hidden `message` field → fires when we set a win-back message
 * Everything else changes silently, so customers get one clean banner per event.
 *
 * `%@` is substituted by iOS with the field's NEW value, so the header's
 * changeMessage has to read correctly for every shape getHeaderFieldValue can
 * return ("4 earned", "3 left", "Reward ready") — hence the bare "%@ — …" form
 * rather than a sentence built around a specific one.
 *
 * The stamp grid itself lives in the strip IMAGE (pre-rendered per count into
 * card_stamp_strips), not in a field — nothing is overlaid on top of it, which is
 * why there is no primary field and why the old unicode-dots field is gone.
 */
export function buildPassJson(
  row: PassRow,
  card: CardRow,
  /** The shop's name. Defaults to the card's, which is right until a merchant runs two. */
  business = card.name,
): Record<string, unknown> {
  const ready = isRewardReady(row);

  return {
    formatVersion: 1,
    passTypeIdentifier: config.passTypeId,
    teamIdentifier: config.teamId,
    organizationName: business,
    // The SHOP's name, never the card's. Apple shows this on the Add sheet and
    // again in the pass's info panel, and `cards.name` is an internal label the
    // owner has no field for any more — a shop that renamed was still being
    // introduced to its own customers by whatever the card was called on the day
    // it was created.
    description: `${business} loyalty card`,
    serialNumber: row.serial,
    webServiceURL: `${config.baseUrl}/wallet`,
    authenticationToken: row.auth_token,
    sharingProhibited: true,
    logoText: business,
    backgroundColor: card.background_color,
    foregroundColor: card.foreground_color,
    labelColor: card.label_color,
    barcodes: [
      {
        format: "PKBarcodeFormatQR",
        message: row.serial,
        messageEncoding: "iso-8859-1",
        // Staff fallback: if the camera won't read, they type this code.
        altText: `Code ${row.short_code}`,
      },
    ],
    storeCard: {
      headerFields: [
        {
          // No `label`: the value stands alone beside the logo. Keeping the key
          // as "progress" keeps Apple diffing it against the same field on cards
          // already issued, and keeps the documented changeMessage pair intact.
          key: "progress",
          value: getHeaderFieldValue(row.stamp_count, row.stamps_target),
          changeMessage: ready
            ? `%@ — your ${row.reward.toLowerCase()} is waiting 🎉`
            : `%@ — ${row.reward.toLowerCase()} at ${row.stamps_target}`,
        },
      ],
      // Empty, but the keys stay: the strip image carries the stamp grid and
      // nothing may sit on top of it. passkit-generator emits these as [] either
      // way, and test/passModel.test.ts spreads all five arrays.
      primaryFields: [],
      secondaryFields: [
        {
          key: "reward",
          label: "Reward",
          value: ready ? `${row.reward} — show this to staff!` : row.reward,
        },
        {
          key: "tally",
          label: "Progress",
          value: progressText(row.stamp_count, row.stamps_target),
        },
      ],
      auxiliaryFields: [],
      backFields: [
        {
          key: "message",
          label: business,
          value: row.message || `Welcome to ${business}!`,
          changeMessage: "%@",
        },
        {
          key: "code",
          label: "CARD CODE",
          value: row.short_code,
        },
        {
          key: "howto",
          label: "How it works",
          value: `Show this card when you order. Collect ${row.stamps_target} stamps and your next ${row.reward.toLowerCase()} is on us. Your card updates by itself — no app needed.`,
        },
        // No changeMessage on either of these: they never change, and Apple
        // shows a lock-screen banner for every back field that carries one.
        // test/passModel.test.ts holds the line at exactly two.
        {
          key: "terms",
          label: "Reward terms",
          value: rewardTerms(business),
        },
        {
          key: "legal",
          label: "Terms & privacy",
          value: legalText(),
        },
      ],
    },
  };
}
