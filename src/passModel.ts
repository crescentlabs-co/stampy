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
 *  - the stamp-progress header  → fires on every stamp ("You now have 4/10 …")
 *  - the hidden `message` field → fires when we set a win-back message
 * Everything else changes silently, so customers get one clean banner per event.
 */
export function buildPassJson(
  row: PassRow,
  card: CardRow,
  /** The shop's name. Defaults to the card's, which is right until a merchant runs two. */
  business = card.name,
): Record<string, unknown> {
  const ready = isRewardReady(row);
  const progress = `${row.stamp_count}/${row.stamps_target}`;

  return {
    formatVersion: 1,
    passTypeIdentifier: config.passTypeId,
    teamIdentifier: config.teamId,
    organizationName: business,
    description: `${card.name} loyalty card`,
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
          key: "progress",
          label: "STAMPS",
          value: progress,
          changeMessage: ready
            ? `Card full! %@ — your ${row.reward.toLowerCase()} is ready 🎉`
            : `You now have %@ stamps — ${row.reward.toLowerCase()} at ${row.stamps_target}!`,
        },
      ],
      primaryFields: [],
      secondaryFields: [
        {
          key: "stamps",
          label: ready ? "REWARD READY 🎉" : "YOUR STAMPS",
          value: stampDots(row.stamp_count, row.stamps_target),
        },
      ],
      auxiliaryFields: [
        {
          key: "reward",
          label: "REWARD",
          value: ready ? `${row.reward} — show this to staff!` : row.reward,
        },
      ],
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
