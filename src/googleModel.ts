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
  // Google has no console UI for this — the callback URL is only ever set by
  // PATCHing it onto the class, here. Every save/delete of any object under
  // this class then POSTs to routes/googleCallback.ts.
  if (config.baseUrl && config.googleCallbackSecret) {
    cls.callbackOptions = {
      url: `${config.baseUrl}/google/callback?token=${config.googleCallbackSecret}`,
    };
  }
  return cls;
}

/**
 * Only the fields a stamp actually changes — the body of the PATCH sent on
 * every stamp, undo and redeem.
 *
 * PATCH leaves omitted fields alone, which is Google's own stated reason to
 * prefer it, so the identity half (id, classId, barcode, accountId…) has no
 * business being re-sent several times a day per customer. buildLoyaltyObject
 * spreads this, so the two can never describe a card differently.
 *
 * **The hero image is the shop's banner, and never the stamp grid.** This used
 * to point at /art/stamps/{count}.png, which meant every single stamp handed
 * Google a URL it had never seen and had to fetch and process before the card
 * could render — measured at ~20s to reach an Android phone, against 3-5s with
 * no image at all. The banner URL is identical on every stamp, so Google
 * fetches it once. Progress is carried by loyaltyPoints and the dots below it,
 * which are text and arrive quickly.
 *
 * Apple is unaffected and keeps the rendered grid: a .pkpass embeds the image
 * bytes, so there is nothing for the phone to go and fetch (src/passBuilder.ts).
 *
 * @param bannerVersion 0 ⇒ no banner uploaded, and heroImage is set to null
 *   rather than omitted — omitting it would leave the last stamp-grid image
 *   frozen on every card issued before this change, showing a full grid beside
 *   a number that disagrees with it.
 */
export function buildLoyaltyPatch(
  row: PassRow,
  card: CardRow,
  bannerVersion = 0,
  business = card.name,
): Record<string, unknown> {
  const ready = isRewardReady(row);
  return {
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
    heroImage: bannerVersion
      ? {
          sourceUri: { uri: artUrl(card, "banner", bannerVersion) },
          contentDescription: {
            defaultValue: { language: "en", value: `${card.name} banner` },
          },
        }
      : null,
  };
}

export function buildLoyaltyObject(
  row: PassRow,
  card: CardRow,
  bannerVersion = 0,
  business = card.name,
): Record<string, unknown> {
  return {
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
    ...buildLoyaltyPatch(row, card, bannerVersion, business),
  };
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
