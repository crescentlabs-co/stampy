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
import { isRewardReady, rewardTerms, stampDots } from "./passModel.js";

/** One LoyaltyClass per café: `<issuerId>.stampy-<cardId>`. */
export function classId(card: Pick<CardRow, "id">): string {
  return `${config.googleIssuerId}.stampy-${card.id}`;
}

/** One LoyaltyObject per card: `<issuerId>.<serial>` (UUIDs are valid id chars). */
export function objectId(row: Pick<PassRow, "serial">): string {
  return `${config.googleIssuerId}.${row.serial}`;
}

/** A café's hosted art URL (per-café route; ?v= makes Google re-fetch after an upload). */
function artUrl(card: Pick<CardRow, "id">, name: "logo" | "banner" | "mark", version = 0): string {
  const base = card.id === DEFAULT_CARD_ID ? "" : `/c/${card.id}`;
  return `${config.baseUrl}${base}/art/${name}.png${version ? `?v=${version}` : ""}`;
}

/**
 * What Google renders as programLogo.
 *
 * Its slot is small and close to square, so the wide brand lockup Apple's logo
 * band wants shrinks to a sliver here. An owner can upload a square version for
 * exactly this; with none (markVersion 0) it stays the main logo, which is what
 * every card issued before this did.
 */
export function logoUrl(card: Pick<CardRow, "id">, logoVersion = 0, markVersion = 0): string {
  return markVersion ? artUrl(card, "mark", markVersion) : artUrl(card, "logo", logoVersion);
}

export function buildLoyaltyClass(
  card: CardRow,
  logoVersion = 0,
  bannerVersion = 0,
  /** The shop's name — Google shows it as the issuer above the programme. */
  business = card.name,
  /** Non-zero ⇒ a square mark exists and is used instead of the wide logo. */
  markVersion = 0,
): Record<string, unknown> {
  const cls: Record<string, unknown> = {
    id: classId(card),
    issuerName: business,
    // The shop's name, not the card's — same reason as Apple's description
    // (src/passModel.ts). `cards.name` is an internal label with no field in the
    // dashboard, so it can be years stale by the time a customer reads it.
    programName: `${business} loyalty card`,
    programLogo: {
      sourceUri: { uri: logoUrl(card, logoVersion, markVersion) },
      contentDescription: {
        defaultValue: { language: "en", value: `${business} logo` },
      },
    },
    hexBackgroundColor: rgbToHex(card.background_color),
    countryCode: "MY",
    reviewStatus: "UNDER_REVIEW",
    // Terms live on the CLASS, not the object, for two reasons: they are the
    // same for every customer of this café, and class data renders on every
    // object already issued — so existing Android cards pick this up without
    // touching a single object. Deliberately NOT in buildLoyaltyPatch: that is
    // re-sent on every stamp, and static text has no business in it.
    textModulesData: [
      {
        id: "terms",
        header: "Reward terms",
        body: rewardTerms(business),
      },
      {
        id: "privacy",
        header: "Your privacy",
        body: "We never ask for your name, phone number or email. To stop, delete this card from your wallet.",
      },
    ],
  };
  // A class PATCH carries no notifyPreference, so adding these never notifies
  // anyone — unlike the object patch. Skipped entirely without a baseUrl:
  // Google rejects a relative uri, and the app must still boot with no config.
  if (config.baseUrl) {
    cls.linksModuleData = {
      uris: [
        { uri: `${config.baseUrl}/terms`, description: "Terms of Service", id: "terms" },
        { uri: `${config.baseUrl}/privacy`, description: "Privacy Policy", id: "privacy" },
      ],
    };
  }
  if (bannerVersion) {
    cls.heroImage = {
      sourceUri: { uri: artUrl(card, "banner", bannerVersion) },
      contentDescription: { defaultValue: { language: "en", value: `${business} banner` } },
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
 * **No image of any kind.** This carried the stamp grid once, which meant every
 * stamp handed Google a URL it had never seen and had to fetch before the card
 * could render — ~20s to reach an Android phone against 3-5s without. Replacing
 * it with the banner fixed that, and then left a subtler version of the same
 * cost: an identical image URL re-sent several times a day per customer, on the
 * one call a customer is waiting on, for a picture that had not changed.
 *
 * The banner belongs on the CLASS (buildLoyaltyClass), which is per-shop, sent
 * on enrol and on card edits, and renders on every object beneath it. So a
 * stamp needs to say nothing about it at all: PATCH leaves omitted fields alone,
 * which is the whole reason this function exists. Uploading a new banner still
 * reaches every existing Android card, because that path calls ensureClass.
 *
 * What is left is text — the balance and the dots — which is all a stamp
 * actually changes.
 *
 * Apple is unaffected and keeps the rendered grid: a .pkpass embeds the image
 * bytes, so there is nothing for the phone to go and fetch (src/passBuilder.ts).
 *
 * @param business only reaches the wire when a nudge is set; the caller may
 *   skip looking it up otherwise (see patchBalance).
 */
export function buildLoyaltyPatch(
  row: PassRow,
  card: CardRow,
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
  };
}

/**
 * The object carries identity and progress; the class carries the look. An
 * object heroImage would shadow the class's banner AND have to be re-sent to
 * change, which is what made the stamp path carry a picture in the first place.
 */
export function buildLoyaltyObject(
  row: PassRow,
  card: CardRow,
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
    ...buildLoyaltyPatch(row, card, business),
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
