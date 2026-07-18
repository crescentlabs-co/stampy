/**
 * Pure pass-content logic — no certificates, no I/O — so the card's look and
 * notification wording are unit-testable before Apple approval even lands.
 */
import { config } from "./config.js";
import type { CafeRow, PassRow } from "./db.js";

/** "●●●○○○○○○○" — filled vs empty stamp slots. */
export function stampDots(count: number, target: number): string {
  const filled = Math.max(0, Math.min(count, target));
  return "●".repeat(filled) + "○".repeat(Math.max(0, target - filled));
}

export function isRewardReady(row: Pick<PassRow, "stamp_count" | "stamps_target">): boolean {
  return row.stamp_count >= row.stamps_target;
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
export function buildPassJson(row: PassRow, cafe: CafeRow): Record<string, unknown> {
  const ready = isRewardReady(row);
  const progress = `${row.stamp_count}/${row.stamps_target}`;

  return {
    formatVersion: 1,
    passTypeIdentifier: config.passTypeId,
    teamIdentifier: config.teamId,
    organizationName: cafe.name,
    description: `${cafe.name} loyalty card`,
    serialNumber: row.serial,
    webServiceURL: `${config.baseUrl}/wallet`,
    authenticationToken: row.auth_token,
    sharingProhibited: true,
    logoText: cafe.name,
    backgroundColor: cafe.background_color,
    foregroundColor: cafe.foreground_color,
    labelColor: cafe.label_color,
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
          label: cafe.name,
          value: row.message || `Welcome to ${cafe.name}!`,
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
      ],
    },
  };
}
