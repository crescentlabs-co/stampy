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
import { DEFAULT_CARD_ID, type CardRow, type PassRow } from "./db.js";
import { isRewardReady, stampDots } from "./passModel.js";

/** One LoyaltyClass per café: `<issuerId>.stampy-<cardId>`. */
export function classId(card: Pick<CardRow, "id">): string {
  return `${config.googleIssuerId}.stampy-${card.id}`;
}

/** One LoyaltyObject per card: `<issuerId>.<serial>` (UUIDs are valid id chars). */
export function objectId(row: Pick<PassRow, "serial">): string {
  return `${config.googleIssuerId}.${row.serial}`;
}

/** A café's hosted art URL (per-café route; ?v= makes Google re-fetch after an upload). */
function artUrl(card: Pick<CardRow, "id">, name: "logo" | "banner", version = 0): string {
  const base = card.id === DEFAULT_CARD_ID ? "" : `/c/${card.id}`;
  return `${config.baseUrl}${base}/art/${name}.png${version ? `?v=${version}` : ""}`;
}

export function logoUrl(card: Pick<CardRow, "id">, logoVersion = 0): string {
  return artUrl(card, "logo", logoVersion);
}

export function buildLoyaltyClass(
  card: CardRow,
  logoVersion = 0,
  bannerVersion = 0,
  /** The shop's name — Google shows it as the issuer above the programme. */
  business = card.name,
): Record<string, unknown> {
  const cls: Record<string, unknown> = {
    id: classId(card),
    issuerName: business,
    programName: card.name,
    programLogo: {
      sourceUri: { uri: logoUrl(card, logoVersion) },
      contentDescription: {
        defaultValue: { language: "en", value: `${business} logo` },
      },
    },
    hexBackgroundColor: rgbToHex(card.background_color),
    countryCode: "MY",
    reviewStatus: "UNDER_REVIEW",
  };
  if (bannerVersion) {
    cls.heroImage = {
      sourceUri: { uri: artUrl(card, "banner", bannerVersion) },
      contentDescription: { defaultValue: { language: "en", value: `${card.name} banner` } },
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
  card: CardRow,
  stampStripsVersion = 0,
  business = card.name,
): Record<string, unknown> {
  const ready = isRewardReady(row);
  const filled = Math.max(0, Math.min(row.stamp_count, row.stamps_target));
  const base = card.id === DEFAULT_CARD_ID ? "" : `/c/${card.id}`;
  const obj: Record<string, unknown> = {
    id: objectId(row),
    classId: classId(card),
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
      ...(row.message ? [{ id: "message", header: business, body: row.message }] : []),
    ],
  };
  if (stampStripsVersion) {
    obj.heroImage = {
      sourceUri: { uri: `${config.baseUrl}${base}/art/stamps/${filled}.png?v=${stampStripsVersion}` },
      contentDescription: {
        defaultValue: { language: "en", value: `${card.name} stamps: ${row.stamp_count} of ${row.stamps_target}` },
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
  card: CardRow,
  serviceAccountEmail: string,
): Record<string, unknown> {
  return {
    iss: serviceAccountEmail,
    aud: "google",
    typ: "savetowallet",
    iat: Math.floor(Date.now() / 1000),
    origins: config.baseUrl ? [config.baseUrl] : [],
    payload: {
      loyaltyObjects: [{ id: objectId(row), classId: classId(card) }],
    },
  };
}
