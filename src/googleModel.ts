/**
 * Pure Google Wallet content logic — no network, no credentials — mirroring
 * passModel.ts so the Android card's look and copy are unit-testable before
 * Google credentials exist.
 *
 * Google's model differs from Apple's: Google HOSTS the card. We insert a
 * LoyaltyClass (per café) and LoyaltyObject (per card) via REST, then PATCH the
 * object on every stamp — Google delivers the update (and the notification,
 * when notifyPreference is NOTIFY_ON_UPDATE) to the device itself. No device
 * registrations, no push tokens.
 */
import { config } from "./config.js";
import type { CafeRow, PassRow } from "./db.js";
import { isRewardReady, stampDots } from "./passModel.js";

/** "rgb(59, 32, 22)" (our DB format, per PassKit) → "#3b2016" (Google's format). */
export function rgbToHex(rgb: string): string {
  const m = /rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/.exec(rgb);
  if (!m) return "#3b2016";
  const hex = (s: string) => Number(s).toString(16).padStart(2, "0");
  return `#${hex(m[1]!)}${hex(m[2]!)}${hex(m[3]!)}`;
}

/** One LoyaltyClass per café: `<issuerId>.stampy-<cafeId>`. */
export function classId(cafe: Pick<CafeRow, "id">): string {
  return `${config.googleIssuerId}.stampy-${cafe.id}`;
}

/** One LoyaltyObject per card: `<issuerId>.<serial>` (UUIDs are valid id chars). */
export function objectId(row: Pick<PassRow, "serial">): string {
  return `${config.googleIssuerId}.${row.serial}`;
}

export function buildLoyaltyClass(cafe: CafeRow): Record<string, unknown> {
  return {
    id: classId(cafe),
    issuerName: cafe.name,
    programName: `${cafe.name} — Loyalty Card`,
    programLogo: {
      sourceUri: { uri: `${config.baseUrl}/art/logo.png` },
      contentDescription: {
        defaultValue: { language: "en", value: `${cafe.name} logo` },
      },
    },
    hexBackgroundColor: rgbToHex(cafe.background_color),
    countryCode: "MY",
    reviewStatus: "UNDER_REVIEW",
  };
}

export function buildLoyaltyObject(row: PassRow, cafe: CafeRow): Record<string, unknown> {
  const ready = isRewardReady(row);
  return {
    id: objectId(row),
    classId: classId(cafe),
    state: "ACTIVE",
    accountId: row.serial,
    accountName: `Card ${row.short_code}`,
    // Same QR content as the Apple pass (the serial), so the SAME staff
    // scanner stamps both platforms; altText covers the typed fallback.
    barcode: {
      type: "QR_CODE",
      value: row.serial,
      alternateText: `Code ${row.short_code}`,
    },
    loyaltyPoints: {
      label: "Stamps",
      balance: { string: `${row.stamp_count}/${row.stamps_target}` },
    },
    textModulesData: [
      {
        id: "stamps",
        header: ready ? "REWARD READY 🎉" : "YOUR STAMPS",
        body: stampDots(row.stamp_count, row.stamps_target),
      },
      {
        id: "reward",
        header: "REWARD",
        body: ready ? `${row.reward} — show this to staff!` : row.reward,
      },
      ...(row.message ? [{ id: "message", header: cafe.name, body: row.message }] : []),
    ],
  };
}

/**
 * The "Save to Google Wallet" JWT claims (unsigned — googleWallet.ts signs it).
 * Skinny variant: the object is already inserted via REST, so the JWT only
 * references its id.
 */
export function buildSaveJwtClaims(
  row: PassRow,
  cafe: CafeRow,
  serviceAccountEmail: string,
): Record<string, unknown> {
  return {
    iss: serviceAccountEmail,
    aud: "google",
    typ: "savetowallet",
    iat: Math.floor(Date.now() / 1000),
    origins: config.baseUrl ? [config.baseUrl] : [],
    payload: {
      loyaltyObjects: [{ id: objectId(row), classId: classId(cafe) }],
    },
  };
}
