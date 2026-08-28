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
import { config, googleClassPrefix } from "./config.js";
import { DEFAULT_CARD_ID, type CardRow, type PassRow } from "./db.js";
import {
  benefitsText, cardTerms, catalogueSummary, isRewardReady, memberSince, milestoneSummary,
  passBarcode, rewardFor, targetFor,
} from "./passModel.js";

/** One LoyaltyClass per café: `<issuerId>.<prefix>-<cardId>` — the prefix is
 * "stampy" on live, forever (invariant 13); staging overrides it so its
 * classes can never collide with live's (see googleClassPrefix). */
export function classId(card: Pick<CardRow, "id">): string {
  return `${config.googleIssuerId}.${googleClassPrefix()}-${card.id}`;
}

/** One LoyaltyObject per card: `<issuerId>.<serial>` (UUIDs are valid id chars). */
export function objectId(row: Pick<PassRow, "serial">): string {
  return `${config.googleIssuerId}.${row.serial}`;
}

/** A café's hosted art URL (per-café route; ?v= makes Google re-fetch after an upload). */
function artUrl(
  card: Pick<CardRow, "id">,
  name: "logo" | "banner" | "mark" | "stamps/full",
  version = 0,
): string {
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

/**
 * The three text modules the object sends that belong on the FRONT of the card.
 *
 * Named once because they are named twice: the object writes them
 * (buildLoyaltyPatch) and the class points at them by id
 * (cardTemplateOverride). A rename in one place alone is silent — Google accepts
 * a fieldPath naming a module that does not exist and simply renders an empty
 * row, so the card would lose its reward line with nothing failing anywhere.
 */
// FRONT_STAMPS_MODULE was here, holding the dot grid. Gone with its row —
// stampDots itself stays in passModel.ts, where the iPhone card and the staff
// counter both still use it.
export const FRONT_REWARD_MODULE = "reward";
/**
 * "1 earned", "3 left", "Reward ready" — the line the iPhone card carries in its
 * top-right corner, beside the logo, and the one thing a customer holding both
 * cards would have had to learn twice.
 *
 * It cannot go beside the logo here. Everything above the template rows on a
 * Google card — issuerName, programName, programLogo — is on the CLASS, which is
 * per shop; anything that changes per customer has to be a row below the title.
 * So it sits top-right of the first row, which is where the iPhone puts it
 * anyway.
 *
 * A string, and therefore free: the slow path on this card is IMAGES, which is
 * why buildLoyaltyPatch sends none.
 */
export const FRONT_EARNED_MODULE = "earned";

/**
 * What Android shows without scrolling.
 *
 * Google's default loyalty template puts programName, loyaltyPoints and the
 * barcode on the front and everything in textModulesData in a details view you
 * have to go looking for. So the dots, the reward and "REWARD READY 🎉" — the
 * three things a customer opens the card TO SEE — were all one screen away, and
 * the front was a title and a number.
 *
 * cardTemplateOverride REPLACES the default rows rather than adding to them, so
 * everything worth seeing has to be listed — including the count, which the
 * default template used to show for free.
 *
 * Every `fields` array here holds exactly ONE path, and must keep doing so: it
 * is a fallback chain (first non-empty wins), so a second entry is not a second
 * thing displayed, it is a thing displayed only when the first is missing. That
 * misreading is what left the card saying "Stamps" with no number.
 *
 * On the CLASS, so every object already issued inherits it — no existing card
 * has to be touched, and none of them is notified (a class PATCH carries no
 * notifyPreference).
 */
function cardFrontTemplate(): Record<string, unknown> {
  const field = (path: string) => ({ firstValue: { fields: [{ fieldPath: path }] } });
  const mod = (id: string) => field(`object.textModulesData['${id}']`);
  return {
    cardTemplateOverride: {
      cardRowTemplateInfos: [
        // Reward on the left, where you are on the right — the order the Apple
        // card has always read in (passModel's secondaryFields, and its header
        // field in the top-right corner). It was the other way round here, so a
        // customer holding both had two cards to learn.
        {
          twoItems: {
            startItem: mod(FRONT_REWARD_MODULE),
            endItem: mod(FRONT_EARNED_MODULE),
          },
        },
        // The dots had their own full-width row here. Removed with the module
        // itself — a template path naming a module that does not exist renders
        // an empty row rather than failing, so the two must go together.
      ],
    },
  };
}

export function buildLoyaltyClass(
  card: CardRow,
  logoVersion = 0,
  bannerVersion = 0,
  /** The shop's name — Google shows it as the issuer above the programme. */
  business = card.name,
  /** Non-zero ⇒ a square mark exists and is used instead of the wide logo. */
  markVersion = 0,
  /** Non-zero ⇒ the card has rendered stamp strips, so the hero band is the grid. */
  stampsVersion = 0,
): Record<string, unknown> {
  const cls: Record<string, unknown> = {
    id: classId(card),
    // The shop's name, not the card's — same reason as Apple's description
    // (src/passModel.ts). `cards.name` is an internal label with no field in the
    // dashboard, so it can be years stale by the time a customer reads it.
    issuerName: business,
    // Google prints BOTH of these at the top and always has, so this carried the
    // shop's name twice: small beside the logo, then large underneath. It also
    // spent a year reading "<shop> loyalty card", which said the name twice in
    // one line and read as a placeholder nobody had filled in.
    //
    // The name lives on the issuer line above. This one says what the thing is.
    programName: card.kind === "membership" ? "Membership"
      : card.kind === "points" ? "Points card"
      : "Loyalty card",
    programLogo: {
      sourceUri: { uri: logoUrl(card, logoVersion, markVersion) },
      contentDescription: {
        defaultValue: { language: "en", value: `${business} logo` },
      },
    },
    hexBackgroundColor: rgbToHex(card.background_color),
    countryCode: "MY",
    reviewStatus: "UNDER_REVIEW",
    classTemplateInfo: cardFrontTemplate(),
    // Terms live on the CLASS, not the object, for two reasons: they are the
    // same for every customer of this café, and class data renders on every
    // object already issued — so existing Android cards pick this up without
    // touching a single object. Deliberately NOT in buildLoyaltyPatch: that is
    // re-sent on every stamp, and static text has no business in it.
    textModulesData: [
      // The perks a membership buys. On the CLASS, alongside the terms, for the
      // same two reasons: they are identical for every member of this shop, and
      // class data renders on every object already issued — so adding a perk
      // reaches every Android member without touching a single object, and
      // without the notification an object patch would carry.
      ...(card.kind === "membership" && benefitsText(card.benefits ?? "")
        ? [{
            id: "benefits",
            header: "What you get",
            body: benefitsText(card.benefits ?? ""),
          }]
        : []),
      // The whole ladder, spelled out. On the CLASS because it is the same for
      // every customer of this shop — and because the front of the card only
      // has room for the next rung, which on its own never tells anybody that
      // there is more than one prize on the card.
      ...(card.kind === "milestones" && (card.milestones ?? []).length
        ? [{
            id: "milestones",
            header: "Rewards on this card",
            body: milestoneSummary(card.milestones ?? []),
          }]
        : []),
      // The price list. Same reasoning as the ladder above: the front of the
      // card only has room for the next thing, which never tells anybody what
      // else their points could buy.
      ...(card.kind === "points" && (card.milestones ?? []).length
        ? [{
            id: "catalogue",
            header: "What your points buy",
            body: catalogueSummary(card.milestones ?? []),
          }]
        : []),
      {
        id: "terms",
        header: card.kind === "membership" ? "Membership terms" : "Reward terms",
        body: cardTerms(business, card.kind),
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
  // The band across the bottom of the Android card. Without one Google leaves
  // the space blank, which is the white strip an owner sees and cannot explain.
  //
  // The stamp grid wins over the banner because the banner is already
  // composited into every strip (see applyStamps), so the grid carries both —
  // picking the banner instead would drop the stamps for no gain.
  //
  // It is the ALL-FILLED grid, and that is the point: it lives on the class, is
  // re-sent only when the owner saves, and therefore costs a stamp nothing.
  // A band drawn at the customer's real count would have to ride the object
  // patch, where Google re-fetches the image itself and lands it seconds after
  // the number it sits beside — two progress indicators disagreeing.
  if (stampsVersion) {
    cls.heroImage = {
      sourceUri: { uri: artUrl(card, "stamps/full", stampsVersion) },
      contentDescription: { defaultValue: { language: "en", value: `${business} stamp card` } },
    };
  } else if (bannerVersion) {
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
  const member = row.kind === "membership";
  const points = row.kind === "points";
  // The NEXT rung on a milestones card, the pass's own snapshot on any other —
  // the same two helpers the iPhone card reads, so the platforms cannot start
  // describing different progress towards different prizes.
  const target = targetFor(row);
  const reward = rewardFor(row);
  const progress = `${row.stamp_count}/${target}`;
  return {
    // Nothing on the card front points at this any more — the count is drawn
    // from the `count` text module below — and it must NOT be removed for that
    // reason. `loyaltyPoints.balance` is the field whose change triggers
    // Google's update notification; drop it and Android stops telling anyone a
    // stamp landed, with every card still looking correct when opened by hand.
    loyaltyPoints: {
      label: member ? "Member no." : points ? "Points" : "Stamps",
      // A membership card has no progress to report, so this holds the member's
      // own code instead. It is a constant, which means an Android membership
      // card never fires a Google notification of its own — correct, since
      // there is no event to announce. A nudge still arrives, through the
      // `message` module and addMessage.
      // On a points card this is Google's own points field doing the job it was
      // built for — the balance on its own, not a fraction.
      balance: { string: member ? row.short_code : points ? String(row.stamp_count) : progress },
    },
    textModulesData: [
      // These three ids are pointed at by the class's cardTemplateOverride,
      // which is what lifts them onto the front of the card — hence the
      // constants.
      {
        id: FRONT_EARNED_MODULE,
        header: member ? "MEMBER SINCE" : points ? "BALANCE" : "PROGRESS",
        // "3/10 earned" — the count itself, not a derived phrase. It used to
        // borrow the iPhone's wording ("1 earned" / "3 left"), which reads well
        // beside a grid of dots that shows the whole card at a glance. With the
        // dots gone this line is the only place the number appears on the front,
        // so it says the number.
        body: member
          ? memberSince(row.created_at)
          : points
            ? (ready ? `${row.stamp_count} points — ready to spend 🎉` : `${row.stamp_count} points`)
            : ready ? `${progress} — reward ready 🎉` : `${progress} earned`,
      },
      // The dots row is gone. Google renders text modules left-aligned in its
      // own typography, so the grid could never be centred or sized like the
      // iPhone's, and sending it as an IMAGE is what once made a stamp take
      // ~20s to reach a phone instead of 3-5s. A row of characters pretending
      // to be a stamp card was worth less than the space it took.
      {
        id: FRONT_REWARD_MODULE,
        header: member ? "MEMBER NO."
          : row.kind === "milestones" || points ? "NEXT REWARD" : "REWARD",
        body: member
          ? row.short_code
          : ready ? `${reward} — show this to staff!` : reward,
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
    // Same QR content as the Apple pass, from the SAME function, so the one
    // staff scanner reads both platforms and neither can drift from the other.
    // For most cards that is the serial; the demo card's is a link - see
    // passBarcode in passModel.ts for why.
    barcode: {
      type: "QR_CODE",
      value: passBarcode(row, card).message,
      alternateText: passBarcode(row, card).altText,
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

/**
 * The body that takes the band OFF one customer's card.
 *
 * Trivial enough to inline, and deliberately not inlined: it is the one patch
 * in this file whose CONTENTS are the whole point, and both halves have to be
 * asserted. `heroImage: null` rather than an omitted field — omitting is
 * exactly what left these images frozen on every card issued between fd665e8
 * and c53cc79, because PATCH leaves an omitted field alone. And no
 * `notifyPreference`, because a repair is not an event: nobody's phone may buzz
 * because an operator tidied up their artwork (invariant 3).
 */
export function buildHeroClearPatch(): Record<string, unknown> {
  return { heroImage: null };
}
