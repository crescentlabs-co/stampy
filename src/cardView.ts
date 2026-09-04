/**
 * The card, as the DESIGNER sees it.
 *
 * One shape, built in one place, because two pages now render the same designer
 * (`DESIGN_PANEL_JS`, src/pages.ts): the owner's dashboard editing their own
 * card, and the admin console editing any merchant's. A second hand-kept copy of
 * this object would drift the first time a field was added — the panel would
 * simply read `undefined` and draw the wrong thing, with nothing to catch it,
 * because none of that browser code is type-checked.
 *
 * Colours cross the API as hex: `<input type="color">` speaks hex, and PassKit
 * stores rgb(...). That conversion belongs here rather than at each call site.
 *
 * Never carries the staff PIN, a password, or any hash. Only the PIN's scrypt
 * hash is stored and there is nothing to reveal; the dashboard sends a separate
 * `hasStaffPin` boolean so the UI can say "Reset" instead of "Set".
 */
import { hexToRgb, rgbToHex } from "./color.js";
import { validateArtPng, validateLogoPng } from "./imageValidate.js";
import {
  cafeBannerVersion,
  cafeLogoVersion,
  cardLogoMarkVersion,
  cardStampIconVersion,
  deleteCardBanner,
  deleteCardLogo,
  deleteCardLogoMark,
  deleteCardStampIcon,
  setCardBanner,
  setCardLogo,
  setCardLogoMark,
  setCardStampIcon,
  stampStripsVersion,
  targetsInUse,
  updateCard,
  asCardKind,
  asEarnMode,
  asMilestones,
  asRewardType,
  moneyLabel,
  type RewardType,
  asPointPresets,
  MAX_POINTS_COST,
  type CardKind,
  type CardRow,
} from "./db.js";

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? Math.trunc(v) : Number.parseInt(String(v), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/**
 * The designer's JSON → columns on `cards`.
 *
 * Shared by the owner dashboard and the admin console because the SAME browser
 * code sends both requests. Two copies of this coercion would be two chances to
 * clamp differently, and the console's design would then land on a card looking
 * unlike the preview it was built against.
 *
 * Authorisation is deliberately NOT here. The dashboard checks `ownerHasCard`
 * and the console checks `requireAdmin`; those are different questions, and
 * folding either into this function would make it easy to call from a route
 * that had asked neither.
 *
 * The staff PIN is not a card field — it belongs to the owner and lives at
 * POST /api/staff-pin. Anything sent here is ignored on purpose.
 */
/**
 * The one line the customer reads, built from the shape the owner picked.
 *
 * This is the whole trick that keeps reward types cheap. `cards.reward` stays a
 * plain sentence, and it is still the only thing the Apple card, the Google
 * card, the staff phone, the poster and the pass snapshot ever read — so none
 * of them has to learn that a reward can be a percentage. Only this function
 * knows, and it runs once, on save.
 *
 * An ITEM keeps the owner's own words: "Free coffee" is better than anything
 * generated, and it is what every card written before today already holds.
 */
export function rewardSentence(
  type: RewardType,
  name: string,
  valueCents: number,
  percent: number,
  capCents: number,
): string {
  if (type === "amount") return `${moneyLabel(valueCents)} off`;
  if (type === "percent") {
    // The cap is optional: a shop offering a flat 20% off with no ceiling
    // should not have "up to RM0" printed on its card.
    return capCents > 0 ? `${percent}% off up to ${moneyLabel(capCents)}` : `${percent}% off`;
  }
  return name.trim().slice(0, 60);
}

/** Ringgit off the wire ("4.50") into the cents this file stores. */
function moneyCents(v: unknown): number {
  const major = Number(v);
  return Number.isFinite(major) ? Math.max(0, Math.min(1_000_000, Math.round(major * 100))) : 0;
}

export function cardFieldsFromBody(
  body: Record<string, unknown>,
  /**
   * What kind of card this ALREADY is, for a body that does not say.
   *
   * Two clamps below need it, and getting it wrong is not cosmetic: 29 is a
   * sane ceiling for welcome stamps on a card with at most 20 circles and a
   * nonsense one for welcome POINTS on a card counting to 500.
   */
  existingKind: CardKind = "stamp",
): Parameters<typeof updateCard>[1] {
  const fields: Parameters<typeof updateCard>[1] = {};
  if (typeof body.name === "string" && body.name.trim()) fields.name = body.name.trim().slice(0, 60);
  if (typeof body.reward === "string" && body.reward.trim()) fields.reward = body.reward.trim().slice(0, 60);
  // The card's kind. Anything unrecognised falls back to a stamp card rather
  // than being rejected — the same shape as band_texture above, and the safe
  // direction: an unknown kind reaching the pass builders would render a card
  // with no progress and no reward on it.
  if (body.kind !== undefined) fields.kind = asCardKind(body.kind);
  // What this card is by the time the save lands: what the body says, or what
  // it already was. Everything below that behaves differently per kind reads
  // this rather than fields.kind, which is undefined on a save that only
  // touched colours.
  const kind: CardKind = fields.kind ?? existingKind;
  // What the shop calls its regulars, on the front of a membership card. Blank
  // falls back to the word the card printed before this field existed, so
  // clearing the box cannot leave the card with an empty slot where a label
  // belongs.
  if (typeof body.memberLabel === "string") {
    fields.member_label = body.memberLabel.trim().slice(0, 20) || "Member";
  }
  // How a points card earns. See EarnMode in src/db.ts for why the rate lives
  // on the card and is not frozen onto each pass.
  if (body.earnMode !== undefined) fields.earn_mode = asEarnMode(body.earnMode);
  if (body.earnSpend !== undefined) fields.earn_spend_cents = moneyCents(body.earnSpend);
  if (body.earnPoints !== undefined) {
    fields.earn_points = clampInt(body.earnPoints, 0, MAX_POINTS_COST, 0);
  }
  // Perks, one per line. Blank is a real choice (a membership card with no list
  // yet), so this is deliberately not guarded on being non-empty. Capped at ten
  // lines because both wallets render them as one block of text on the back of
  // the card, and a longer list is scrolled past rather than read.
  if (typeof body.benefits === "string") {
    fields.benefits = body.benefits
      .split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 10)
      .map((l) => l.slice(0, 80)).join("\n");
  }
  // How many stamps a visit is worth. Capped low on purpose: this multiplies
  // every tap, so a stray 50 would fill a card in one visit.
  if (body.stampsPerVisit !== undefined) {
    fields.stamps_per_visit = clampInt(body.stampsPerVisit, 1, 10, 1);
  }
  // The reward's shape and its numbers, then the sentence built from them.
  //
  // Written together and never apart: the sentence is what a customer reads and
  // the numbers are what the Create flow reloads, so a save that moved one
  // without the other would leave a card promising something its own settings
  // no longer say.
  if (body.rewardType !== undefined) {
    const rType = asRewardType(body.rewardType);
    const value = moneyCents(body.rewardValue);
    const cap = moneyCents(body.rewardCap);
    const pct = clampInt(body.rewardPercent, 1, 100, 10);
    fields.reward_type = rType;
    fields.reward_value_cents = value;
    fields.reward_percent = pct;
    fields.reward_cap_cents = cap;
    // The name only matters for an item; for the other two the sentence is
    // generated, and a stale name left in `reward` would contradict it.
    const name = typeof body.reward === "string" ? body.reward : "";
    const sentence = rewardSentence(rType, name, value, pct, cap);
    if (sentence) fields.reward = sentence;
    // What a customer spends in a visit, which is what turns stamps into a
    // money figure on Home. The Create flow no longer asks for it separately:
    // for a free item, what the item is worth IS the basket. For a discount it
    // is not, so it stays where it was rather than being guessed at.
    if (rType === "item" && value > 0) fields.average_spend_cents = value;
  }
  // The reward ladder. asMilestones sorts it and drops anything malformed —
  // `rewards_claimed` is an index into this list, so an unsorted one would hand
  // out the wrong prize.
  // On a points card the numbers are PRICES, not stamp counts, so they are not
  // held to the 20-circle cap a grid imposes.
  if (body.milestones !== undefined) {
    fields.milestones = asMilestones(
      body.milestones,
      fields.kind === "points" ? MAX_POINTS_COST : undefined,
    );
  }
  // Stored the way it is typed; asPointPresets is the one place it becomes
  // numbers, so a malformed list can never reach a counter as a broken button.
  if (body.pointPresets !== undefined) {
    fields.point_presets = asPointPresets(body.pointPresets).join(",");
  }
  // Capped at 20: the strip image is always a two-row grid, so a higher target
  // would render stamps too small to read on a 375pt-wide strip.
  if (body.stampsTarget !== undefined) fields.stamps_target = clampInt(body.stampsTarget, 1, 20, 10);
  // Welcome POINTS are not welcome stamps. 29 is a sane ceiling on a card with
  // at most 20 circles and a nonsense one on a card counting to 500, so the
  // ceiling follows the kind rather than the column.
  if (body.stampsStart !== undefined) {
    fields.stamps_start = kind === "points"
      ? clampInt(body.stampsStart, 0, MAX_POINTS_COST, 0)
      : clampInt(body.stampsStart, 0, 29, 2);
  }
  // Average spend crosses the API in major units ("4.50") and is stored in cents.
  if (body.averageSpend !== undefined) fields.average_spend_cents = moneyCents(body.averageSpend);
  // Currency is no longer an owner-facing choice — everything is RM. The column
  // stays for the day that changes; nothing in the UI writes it.

  // Colours arrive as hex from the pickers; stored as rgb(...) for PassKit.
  if (typeof body.bg === "string") fields.background_color = hexToRgb(body.bg);
  if (typeof body.fg === "string") fields.foreground_color = hexToRgb(body.fg);
  if (typeof body.label === "string") fields.label_color = hexToRgb(body.label);
  if (typeof body.accent === "string") fields.accent_color = hexToRgb(body.accent);
  // The band across the middle of the card. It carried a TEXTURE too once
  // (gradient, waves, chevron…): ten variations of a surface the stamps are
  // drawn on top of, every one tuned to be barely visible so it could not fight
  // them, and all ten were removed.
  //
  // band_texture survived as a column and is written again — but as a FLAG, not
  // a style. card_banners holds one of two things, the owner's uploaded artwork
  // or the flat band we generated, and this says which. Without it a colour
  // save cannot tell the difference and regenerates the flat band over the
  // upload. Only the two values: anything else falls back to flat.
  if (typeof body.bandTexture === "string") {
    fields.band_texture = body.bandTexture === "image" ? "image" : "flat";
  }
  if (typeof body.bandColor === "string") fields.band_color = hexToRgb(body.bandColor);
  // The default text a nudge is pre-filled with. The column is still called
  // auto_winback_message from when a scheduler used it; nothing is automated
  // any more (see src/winback.ts), but event and column names here are
  // effectively permanent, so it keeps its name.
  if (typeof body.winbackMessage === "string" && body.winbackMessage.trim()) {
    fields.auto_winback_message = body.winbackMessage.trim().slice(0, 200);
  }
  // The owner's own line on their sign-up page. Blank clears it, which is a
  // real choice — it falls back to the generated "Collect N stamps, get a X" —
  // so this one is deliberately not guarded on being non-empty.
  if (typeof body.signupMessage === "string") {
    fields.signup_message = body.signupMessage.trim().slice(0, 120);
  }
  // "My logo already includes my business name" — drops the pass's logoText so
  // a brand lockup does not print the name a second time beside itself.
  if (typeof body.logoHasName === "boolean") fields.logo_has_name = body.logoHasName;
  // "Points to reward" IS a one-entry price list.
  //
  // The Create flow asks for one number and one reward; the card editor can add
  // more rungs later. Both write the same column, so neither has to know the
  // other exists — and a customer who has saved past the price keeps the
  // difference, because redeemPass subtracts a price rather than restarting.
  //
  // Built HERE and not in the browser because the reward SENTENCE is built
  // here. rewardSentence is the one boundary where a reward becomes words, and
  // a ladder assembled in the browser would quietly be a second one.
  if (kind === "points" && body.pointsTarget !== undefined && fields.reward) {
    fields.milestones = [{
      at: clampInt(body.pointsTarget, 1, MAX_POINTS_COST, 100),
      reward: fields.reward,
    }];
  }
  // A milestones card's target IS its top rung. Keeping the two in step is what
  // lets the stamp grid, the pre-rendered strip images and every query that
  // reads stamps_target keep working without knowing milestones exist — and it
  // stops a shop saving a 10-circle card whose last prize sits at 6.
  if (fields.kind === "milestones" && fields.milestones?.length) {
    fields.stamps_target = fields.milestones[fields.milestones.length - 1]!.at;
  }
  return fields;
}

/** The three kinds whose rules are a list of rewards rather than one reward. */
export function usesRewardList(kind: string): boolean {
  return kind === "milestones" || kind === "points";
}

/**
 * The four images a card can carry, and how to store each one.
 *
 * Both consoles upload the same four through the same browser code, so the
 * routes are one parameterised handler each rather than eight hand-copied ones.
 * That copying is not hypothetical: the banner was once validated against the
 * LOGO's size cap and silently rejected every photo over 256KB.
 *
 * The URL segment is the key, because it is also the art path
 * (/c/:cardId/art/<kind>.png) and the designer builds both from one string.
 */
// `big` picks the byte cap: 512KB rather than 256KB.
//
// The logo and the Android mark moved up to it when their render sizes did.
// They are generated at 1280×400 and 660×660 now — Google's own recommendation
// and its stated 660×660 MINIMUM for the circular logo — where they used to be
// 480×150 and 400×400. A detailed logo at 660×660 lands in the low hundreds of
// KB, and the old 256KB cap would have rejected the upload outright: an owner
// would have been told their logo was too big by the same release that made it
// bigger. The stamp icon stays small because it is a silhouette we trim and
// refill, never a photograph.
export const ART_KINDS = {
  logo: { set: setCardLogo, del: deleteCardLogo, big: true },
  banner: { set: setCardBanner, del: deleteCardBanner, big: true },
  mark: { set: setCardLogoMark, del: deleteCardLogoMark, big: true },
  "stamp-icon": { set: setCardStampIcon, del: deleteCardStampIcon, big: false },
} as const;

export type ArtKind = keyof typeof ART_KINDS;

/** The path fragment both routers match on, so neither can drift from the other. */
export const ART_KIND_PATTERN = Object.keys(ART_KINDS).join("|");

/**
 * base64 → validated PNG bytes, or the error string a route should return.
 * A banner is a rendered photo band and gets the larger cap; the rest are marks.
 */
export function artBytes(kind: ArtKind, png: unknown): Buffer | string {
  if (typeof png !== "string" || !png) return "missing-png";
  let bytes: Buffer;
  try {
    bytes = Buffer.from(png, "base64");
  } catch {
    return "bad-base64";
  }
  return (ART_KINDS[kind].big ? validateArtPng(bytes) : validateLogoPng(bytes)) ?? bytes;
}

export interface DesignerCard {
  id: string;
  name: string;
  /** When the programme was created — what the Home charts order by. ISO. */
  createdAt: string;
  /**
   * When it stopped taking NEW sign-ups, or null while it is running.
   *
   * Sent as well as `createdAt` because the dashboard has to show the state and
   * offer the reverse of it; the GATE that enforces it is on the server
   * (shopOpen, src/routes/public.ts) and never reads this.
   */
  endedAt: string | null;
  /** Which kind of card the designer is editing — see CardKind. */
  kind: string;
  /** Perks for a membership card, one per line. '' on a stamp card. */
  benefits: string;
  /** The reward ladder on a milestones card, ascending. Empty otherwise. */
  milestones: { at: number; reward: string }[];
  /** null while the Create flow is still being walked through. */
  publishedAt: string | null;
  /** The reward's shape and numbers, so the Create flow can reload the answers. */
  rewardType: string;
  rewardValue: number;
  rewardPercent: number;
  rewardCap: number;
  stampsPerVisit: number;
  /** One-tap amounts on a points counter, as typed ("10,20,50"). */
  pointPresets: string;
  reward: string;
  stampsTarget: number;
  stampsStart: number;
  averageSpend: number;
  currency: string;
  bg: string;
  fg: string;
  label: string;
  accent: string;
  bandColor: string;
  /** Always 'flat' now; kept so an older stored value still round-trips. */
  bandTexture: string;
  stampStyle: string;
  /** The logo is a lockup that already says the shop's name — see CardRow. */
  logoHasName: boolean;
  /** 0 = nothing uploaded. Used to cache-bust the preview image. */
  logoVersion: number;
  bannerVersion: number;
  /** 0 = none; Google then falls back to the wide logo. */
  markVersion: number;
  /**
   * 0 = no uploaded stamp shape. Non-zero is what tells the panel to fetch the
   * source art back and hold it BEFORE re-rendering — without it the grid is
   * redrawn as plain circles, which is how an uploaded stamp used to vanish on
   * the first reload.
   */
  stampIconVersion: number;
  /** 0 = no rendered stamp grid (plain text dots). */
  stampsVersion: number;
  /**
   * Targets still held by live passes. Only a browser can render a grid, so it
   * has to know which older targets it still owes a set for — otherwise
   * lowering the target blanks the grid on every card issued under the old one.
   */
  targetsInUse: number[];
  /** What this shop calls its regulars. Membership cards only. */
  memberLabel: string;
  /** How a points card earns: 'visit', 'spend' or 'manual'. */
  earnMode: string;
  /** The ringgit side of the spend rate, in major units, like every other price here. */
  earnSpend: number;
  earnPoints: number;
  /**
   * What one reward costs on a points card.
   *
   * Derived from the price list rather than stored twice: the Create flow asks
   * for one number, the card editor can hold several, and the cheapest one is
   * what "points to reward" means to somebody who set exactly one. 0 means the
   * card has no price list yet.
   */
  pointsTarget: number;
  winbackMessage: string;
  signupMessage: string;
  /** The BUSINESS name — what the pass prints as logoText. Lives on the
   *  merchant, not the card, which is why it is passed in. */
  shopName: string;
}

/** Everything the designer needs for one card, art versions included. */
export async function designerCard(card: CardRow, shopName?: string): Promise<DesignerCard> {
  const [logoVersion, bannerVersion, markVersion, stampIconVersion, stampsVersion, inUse] =
    await Promise.all([
      cafeLogoVersion(card.id),
      cafeBannerVersion(card.id),
      cardLogoMarkVersion(card.id),
      cardStampIconVersion(card.id),
      stampStripsVersion(card.id),
      targetsInUse(card.id),
    ]);
  return {
    id: card.id,
    name: card.name,
    createdAt: card.created_at.toISOString(),
    endedAt: card.ended_at ? card.ended_at.toISOString() : null,
    kind: card.kind,
    benefits: card.benefits,
    milestones: card.milestones ?? [],
    publishedAt: card.published_at ? card.published_at.toISOString() : null,
    rewardType: card.reward_type,
    rewardValue: card.reward_value_cents / 100,
    rewardPercent: card.reward_percent,
    rewardCap: card.reward_cap_cents / 100,
    stampsPerVisit: card.stamps_per_visit,
    pointPresets: card.point_presets ?? "",
    reward: card.reward,
    stampsTarget: card.stamps_target,
    stampsStart: card.stamps_start,
    averageSpend: card.average_spend_cents / 100,
    currency: card.currency,
    bg: rgbToHex(card.background_color),
    fg: rgbToHex(card.foreground_color),
    label: rgbToHex(card.label_color),
    accent: rgbToHex(card.accent_color),
    bandColor: rgbToHex(card.band_color),
    bandTexture: card.band_texture,
    stampStyle: card.stamp_style,
    logoHasName: card.logo_has_name,
    logoVersion,
    bannerVersion,
    markVersion,
    stampIconVersion,
    stampsVersion,
    targetsInUse: inUse,
    memberLabel: card.member_label,
    earnMode: card.earn_mode,
    earnSpend: card.earn_spend_cents / 100,
    earnPoints: card.earn_points,
    pointsTarget: (card.milestones ?? []).length ? card.milestones[0]!.at : 0,
    winbackMessage: card.auto_winback_message,
    signupMessage: card.signup_message,
    shopName: shopName || card.name,
  };
}

/**
 * Did this save change what is DRAWN on a card already in a wallet?
 *
 * Only some of what the designer writes reaches an issued pass. The colours and
 * the band do, and so does the shop's name (it is the pass's organizationName
 * and logoText). The reward and the stamp count do NOT: a pass carries the
 * ruleset it was issued with, so `row.reward` and `row.stamps_target` in
 * passModel come off the PASS, not the card — which is exactly why editing a
 * card never rewrites a promise somebody is already holding.
 *
 * Used to decide whether a save is worth waking every phone for. Getting it
 * wrong in the generous direction is not dangerous (the push is silent), but it
 * is pointless traffic; getting it wrong the other way leaves iPhones showing
 * an old design until their next stamp.
 */
export function touchesLook(
  fields: Parameters<typeof updateCard>[1],
  body: Record<string, unknown> = {},
): boolean {
  const drawn = [
    "background_color", "foreground_color", "label_color",
    "accent_color", "band_color", "stamp_style", "name",
    // Both of these are printed on the pass itself. The kind decides every
    // field on the front, and the perks are a back field on Apple — where,
    // unlike Google's class-level copy, nothing reaches an issued card until
    // the phone re-fetches. Without these a shop would add a perk, see it on
    // their Android preview, and find their iPhone members still on the old
    // list until each of them was next stamped.
    "kind", "benefits",
    // Printed on the back of an Apple card, and the reason the header counts to
    // one number rather than another.
    "milestones",
    // Ticking this removes the name printed beside the logo on every issued
    // pass. Nothing about it is visible until the phone re-fetches, so a save
    // that skipped the push would leave the name doubled until the next stamp.
    "logo_has_name",
  ] as const;
  if (drawn.some((k) => fields[k] !== undefined)) return true;
  // The shop name is stored on the MERCHANT, so it never appears in `fields` —
  // but it is printed on every pass, so a rename has to reach them.
  return typeof body.shopName === "string" && body.shopName.trim() !== "";
}
