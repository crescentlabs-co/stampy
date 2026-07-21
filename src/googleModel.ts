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
import { rgbToHex } from "./color.js";
import { config } from "./config.js";
import { DEFAULT_CAFE_ID, type CafeRow, type PassRow } from "./db.js";
import { isRewardReady, stampDots } from "./passModel.js";

/** One LoyaltyClass per café: `<issuerId>.stampy-<cafeId>`. */
export function classId(cafe: Pick<CafeRow, "id">): string {
  return `${config.googleIssuerId}.stampy-${cafe.id}`;
}

/** One LoyaltyObject per card: `<issuerId>.<serial>` (UUIDs are valid id chars). */
export function objectId(row: Pick<PassRow, "serial">): string {
  return `${config.googleIssuerId}.${row.serial}`;
}

/** A café's hosted art URL (per-café route; ?v= makes Google re-fetch after an upload). */
function artUrl(cafe: Pick<CafeRow, "id">, name: "logo" | "banner", version = 0): string {
  const base = cafe.id === DEFAULT_CAFE_ID ? "" : `/c/${cafe.id}`;
  return `${config.baseUrl}${base}/art/${name}.png${version ? `?v=${version}` : ""}`;
}

export function logoUrl(cafe: Pick<CafeRow, "id">, logoVersion = 0): string {
  return artUrl(cafe, "logo", logoVersion);
}

export function buildLoyaltyClass(
  cafe: CafeRow,
  logoVersion = 0,
  bannerVersion = 0,
): Record<string, unknown> {
  const cls: Record<string, unknown> = {
    id: classId(cafe),
    issuerName: cafe.name,
    programName: `${cafe.name} — Loyalty Card`,
    programLogo: {
      sourceUri: { uri: logoUrl(cafe, logoVersion) },
      contentDescription: {
        defaultValue: { language: "en", value: `${cafe.name} logo` },
      },
    },
    hexBackgroundColor: rgbToHex(cafe.background_color),
    countryCode: "MY",
    reviewStatus: "UNDER_REVIEW",
  };
  if (bannerVersion) {
    cls.heroImage = {
      sourceUri: { uri: artUrl(cafe, "banner", bannerVersion) },
      contentDescription: { defaultValue: { language: "en", value: `${cafe.name} banner` } },
    };
  }
  return cls;
}

/**
 * @param stampStripsVersion 0 ⇒ café has no rendered stamp grid (keep points +
 *   dots only); >0 ⇒ show the grid for the current count as the hero image
 *   (the version busts Google's cache so the image swaps on each stamp).
 */
export function buildLoyaltyObject(
  row: PassRow,
  cafe: CafeRow,
  stampStripsVersion = 0,
): Record<string, unknown> {
  const ready = isRewardReady(row);
  const filled = Math.max(0, Math.min(row.stamp_count, row.stamps_target));
  const base = cafe.id === DEFAULT_CAFE_ID ? "" : `/c/${cafe.id}`;
  const obj: Record<string, unknown> = {
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
  if (stampStripsVersion) {
    obj.heroImage = {
      sourceUri: { uri: `${config.baseUrl}${base}/art/stamps/${filled}.png?v=${stampStripsVersion}` },
      contentDescription: {
        defaultValue: { language: "en", value: `${cafe.name} stamps: ${row.stamp_count} of ${row.stamps_target}` },
      },
    };
  }
  return obj;
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
