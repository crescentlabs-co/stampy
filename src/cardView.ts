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
export function cardFieldsFromBody(body: Record<string, unknown>): Parameters<typeof updateCard>[1] {
  const fields: Parameters<typeof updateCard>[1] = {};
  if (typeof body.name === "string" && body.name.trim()) fields.name = body.name.trim().slice(0, 60);
  if (typeof body.reward === "string" && body.reward.trim()) fields.reward = body.reward.trim().slice(0, 60);
  // Capped at 20: the strip image is always a two-row grid, so a higher target
  // would render stamps too small to read on a 375pt-wide strip.
  if (body.stampsTarget !== undefined) fields.stamps_target = clampInt(body.stampsTarget, 1, 20, 10);
  if (body.stampsStart !== undefined) fields.stamps_start = clampInt(body.stampsStart, 0, 29, 2);
  // Average spend crosses the API in major units ("4.50") and is stored in cents.
  if (body.averageSpend !== undefined) {
    const major = Number(body.averageSpend);
    fields.average_spend_cents = Number.isFinite(major)
      ? Math.max(0, Math.min(1_000_000, Math.round(major * 100)))
      : 0;
  }
  // Currency is no longer an owner-facing choice — everything is RM. The column
  // stays for the day that changes; nothing in the UI writes it.

  // Colours arrive as hex from the pickers; stored as rgb(...) for PassKit.
  if (typeof body.bg === "string") fields.background_color = hexToRgb(body.bg);
  if (typeof body.fg === "string") fields.foreground_color = hexToRgb(body.fg);
  if (typeof body.label === "string") fields.label_color = hexToRgb(body.label);
  if (typeof body.accent === "string") fields.accent_color = hexToRgb(body.accent);
  // The band across the middle of the card — one flat colour. It carried a
  // texture too (gradient, waves, chevron…): ten variations of a surface the
  // stamps are drawn on top of, every one tuned to be barely visible so it
  // could not fight them. cards.band_texture survives as a column because
  // migrations here are additive, and is now written by nothing.
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
  return fields;
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
