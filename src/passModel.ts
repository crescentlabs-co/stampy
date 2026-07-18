/**
 * Pure pass-content logic — no certificates, no I/O — so the card's look and
 * notification wording are unit-testable before Apple approval even lands.
 */
import { CAFE, config } from "./config.js";
import type { PassRow } from "./db.js";

/** "●●●○○○○○○○" — filled vs empty stamp slots. */
export function stampDots(count: number, target: number): string {
  const filled = Math.max(0, Math.min(count, target));
  return "●".repeat(filled) + "○".repeat(Math.max(0, target - filled));
}

export function isRewardReady(row: Pick<PassRow, "stamp_count" | "stamps_target">): boolean {
  return row.stamp_count >= row.stamps_target;
}

/**
 * Builds the complete pass.json content for a card.
 *
 * Notification design (the hero feature): iOS shows a lock-screen banner when
 * a field that carries `changeMessage` changes. Exactly two fields carry one:
 *  - the stamp-progress header  → fires on every stamp ("You now have 4/10 …")
 *  - the hidden `message` field → fires when we set a win-back message
 * Everything else changes silently, so customers get one clean banner per event.
 */
export function buildPassJson(row: PassRow): Record<string, unknown> {
  const ready = isRewardReady(row);
  const progress = `${row.stamp_count}/${row.stamps_target}`;

  return {
    formatVersion: 1,
    passTypeIdentifier: config.passTypeId,
    teamIdentifier: config.teamId,
    organizationName: CAFE.name,
    description: `${CAFE.name} loyalty card`,
    serialNumber: row.serial,
    webServiceURL: `${config.baseUrl}/wallet`,
    authenticationToken: row.auth_token,
    sharingProhibited: true,
    logoText: CAFE.name,
    backgroundColor: CAFE.backgroundColor,
    foregroundColor: CAFE.foregroundColor,
    labelColor: CAFE.labelColor,
    barcodes: [
      {
        format: "PKBarcodeFormatQR",
        message: row.serial,
        messageEncoding: "iso-8859-1",
        altText: `Card ${row.serial.slice(0, 8)}`,
      },
    ],
    storeCard: {
      headerFields: [
        {
          key: "progress",
          label: "STAMPS",
          value: progress,
          changeMessage: ready
            ? `Card full! %@ — your ${CAFE.reward.toLowerCase()} is ready 🎉`
            : `You now have %@ stamps — ${CAFE.reward.toLowerCase()} at ${row.stamps_target}!`,
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
          label: CAFE.name,
          value: row.message || `Welcome to ${CAFE.name}!`,
          changeMessage: "%@",
        },
        {
          key: "howto",
          label: "How it works",
          value: `Show this card when you order. Collect ${row.stamps_target} stamps and your next ${row.reward.toLowerCase()} is on us. Your card updates by itself — no app needed.`,
        },
      ],
    },
  };
}
