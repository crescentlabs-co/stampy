/**
 * Google Wallet REST client (mirrors apns.ts in spirit): hand-rolled with
 * jsonwebtoken + fetch, no SDK. Auth = service-account JWT exchanged for an
 * OAuth2 access token (cached ~55 min, like the APNs JWT).
 *
 * Contract (same as apns.ts): NEVER throws on missing config — every call
 * returns { ok:false, reason:"google-not-configured" } until the founder pastes
 * GOOGLE_ISSUER_ID + GOOGLE_SERVICE_ACCOUNT_B64 into Railway. The app must
 * always boot and run without secrets.
 */
import jwt from "jsonwebtoken";
import { config, setupStatus } from "./config.js";
import {
  businessNameForCard,
  cafeBannerVersion,
  cafeLogoVersion,
  cardLogoMarkVersion,
  stampStripsVersion,
  type CardRow,
  type PassRow,
} from "./db.js";
import {
  buildLoyaltyClass,
  buildLoyaltyObject,
  buildLoyaltyPatch,
  buildHeroClearPatch,
  buildSaveJwtClaims,
  classId,
  objectId,
} from "./googleModel.js";

const WALLET_API = "https://walletobjects.googleapis.com/walletobjects/v1";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/wallet_object.issuer";

export interface GoogleResult {
  ok: boolean;
  status?: number;
  reason?: string;
  /** Round trip to Google in ms — how long WE waited, not how long the phone waits. */
  ms?: number;
}

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

let cachedSa: ServiceAccount | null = null;

export function serviceAccount(): ServiceAccount | null {
  if (!config.googleServiceAccountB64) return null;
  if (!cachedSa) {
    try {
      const parsed = JSON.parse(
        Buffer.from(config.googleServiceAccountB64, "base64").toString("utf8"),
      ) as ServiceAccount;
      if (!parsed.client_email || !parsed.private_key) return null;
      cachedSa = parsed;
    } catch {
      return null;
    }
  }
  return cachedSa;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string | null> {
  const sa = serviceAccount();
  if (!sa) return null;
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token;

  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    { iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 },
    sa.private_key,
    { algorithm: "RS256" },
  );
  // Logged on its own because it only happens on a cold process or once an
  // hour: if one stamp in twenty is slow, this is the first thing to rule out.
  const started = Date.now();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  console.log(`[google-wallet] token exchange ${res.status} in ${Date.now() - started}ms`);
  if (!res.ok) {
    console.error("[google-wallet] token exchange failed:", res.status, await res.text());
    return null;
  }
  const body = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: body.access_token,
    expiresAt: Date.now() + (body.expires_in - 300) * 1000, // refresh 5 min early
  };
  return cachedToken.token;
}

/**
 * One Wallet API round trip, timed. `ms` covers the token exchange too when
 * this call is the one that pays for it, because that is what the caller
 * actually waited for.
 */
async function api(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; text: string; ms: number }> {
  const started = Date.now();
  const token = await accessToken();
  if (!token) return { status: 0, text: "no-access-token", ms: Date.now() - started };
  const res = await fetch(`${WALLET_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const ms = Date.now() - started;
  console.log(`[google-wallet] ${method} ${path} ${res.status} in ${ms}ms`);
  return { status: res.status, text, ms };
}

function notConfigured(): GoogleResult {
  return { ok: false, reason: "google-not-configured" };
}

function toResult(res: { status: number; text: string; ms: number }): GoogleResult {
  const ok = res.status >= 200 && res.status < 300;
  if (!ok) console.error("[google-wallet] API error:", res.status, res.text.slice(0, 300));
  return { ok, status: res.status, ms: res.ms, reason: ok ? undefined : res.text.slice(0, 200) };
}

/** Insert-or-update the café's LoyaltyClass (called on enroll, café edits, logo upload). */
export async function ensureClass(card: CardRow): Promise<GoogleResult> {
  if (!setupStatus().canGoogleWallet) return notConfigured();
  try {
    // Version-stamp the art URLs so Google re-fetches them after an upload.
    const [logoVersion, bannerVersion, markVersion, business, stampsVersion] = await Promise.all([
      cafeLogoVersion(card.id).catch(() => 0),
      cafeBannerVersion(card.id).catch(() => 0),
      // 0 ⇒ no square mark uploaded, and programLogo stays the wide logo.
      cardLogoMarkVersion(card.id).catch(() => 0),
      businessNameForCard(card),
      // 0 ⇒ no rendered grid, and the hero band falls back to the banner.
      stampStripsVersion(card.id).catch(() => 0),
    ]);
    const cls = buildLoyaltyClass(card, logoVersion, bannerVersion, business, markVersion, stampsVersion);
    const inserted = await api("POST", "/loyaltyClass", cls);
    if (inserted.status === 409) {
      return toResult(await api("PATCH", `/loyaltyClass/${cls.id as string}`, cls));
    }
    return toResult(inserted);
  } catch (err) {
    return { ok: false, reason: String(err) };
  }
}

/** Insert the card's LoyaltyObject (idempotent: 409 → patch to freshest state). */
export async function createObject(row: PassRow, card: CardRow): Promise<GoogleResult> {
  if (!setupStatus().canGoogleWallet) return notConfigured();
  try {
    // Enrol happens once per customer and nobody is holding a queue for it, so
    // this keeps its lookup — unlike the stamp path above.
    const obj = buildLoyaltyObject(row, card, await businessNameForCard(card));
    const inserted = await api("POST", "/loyaltyObject", obj);
    if (inserted.status === 409) {
      return toResult(await api("PATCH", `/loyaltyObject/${obj.id as string}`, obj));
    }
    return toResult(inserted);
  } catch (err) {
    return { ok: false, reason: String(err) };
  }
}

/** The "Add to Google Wallet" URL — a signed savetowallet JWT. */
export function saveJwtUrl(row: PassRow, card: CardRow): string | null {
  const sa = serviceAccount();
  if (!sa || !setupStatus().canGoogleWallet) return null;
  const token = jwt.sign(buildSaveJwtClaims(row, card, sa.client_email), sa.private_key, {
    algorithm: "RS256",
  });
  return `https://pay.google.com/gp/v/save/${token}`;
}

/**
 * Push the card's current state (stamp count, reward copy) to the device.
 * NOTIFY_ON_UPDATE makes Google show a notification for the balance change —
 * the Android equivalent of Apple's changeMessage banner.
 */
export async function patchBalance(row: PassRow, card: CardRow): Promise<GoogleResult> {
  if (!setupStatus().canGoogleWallet) return notConfigured();
  try {
    // Two database reads used to happen here on every stamp: the banner version
    // and the shop's name. The banner is gone from the patch entirely (it lives
    // on the class), and the name only reaches the wire as the header of a nudge
    // — so on an ordinary stamp, which is nearly all of them, this now waits on
    // nothing but Google. card.name is the right fallback and is never sent.
    const business = row.message ? await businessNameForCard(card) : card.name;
    // Only what changed: PATCH leaves everything else as it is, so the card's
    // identity, barcode and artwork are not re-sent on every stamp.
    const patch = {
      ...buildLoyaltyPatch(row, card, business),
      notifyPreference: "NOTIFY_ON_UPDATE",
    };
    return toResult(await api("PATCH", `/loyaltyObject/${objectId(row)}`, patch));
  } catch (err) {
    return { ok: false, reason: String(err) };
  }
}

/** Free-form nudge: TEXT_AND_NOTIFY adds a message AND fires a notification. */
export async function addMessage(row: PassRow, card: CardRow, text: string): Promise<GoogleResult> {
  if (!setupStatus().canGoogleWallet) return notConfigured();
  try {
    const business = await businessNameForCard(card);
    return toResult(
      await api("POST", `/loyaltyObject/${objectId(row)}/addMessage`, {
        message: { header: business, body: text, messageType: "TEXT_AND_NOTIFY" },
      }),
    );
  } catch (err) {
    return { ok: false, reason: String(err) };
  }
}

// ------------------------------------------------------------ diagnosis ----

/**
 * What Google is ACTUALLY holding for one card — read-only, and the only way to
 * answer "why is the band on my Android card blank?".
 *
 * Everything upstream of Google is checkable from a browser: the art URLs are
 * public, `ensureClass` is a few lines, and the strip renders. None of that
 * proves the write landed. A class POST that comes back 400 is logged to
 * Railway and swallowed by every caller (they are all `void ensureClass(...)`),
 * so the console can say "resynced" while Google holds a class from March. This
 * reads the other end of the wire instead of inferring it.
 *
 * **It never returns Google's raw JSON.** The class carries
 * `callbackOptions.url`, which has GOOGLE_CALLBACK_SECRET in its query string —
 * anything that echoed the class wholesale would print that secret into a
 * browser, a screenshot and a support thread. Only the named fields below cross
 * back, and the callback is reported as a boolean.
 */
export interface GoogleClassReport {
  found: boolean;
  status?: number;
  /** Why the read failed, when it did. Google's text, truncated. */
  reason?: string;
  reviewStatus?: string;
  /** The band across the card. Undefined ⇒ Google is holding no hero at all. */
  heroUri?: string;
  programLogoUri?: string;
  /** True ⇒ the save/delete callback is registered (the token itself is never returned). */
  hasCallback: boolean;
  /** What ensureClass would send right now, to compare against the above. */
  expectedHeroUri?: string;
  expectedProgramLogoUri?: string;
}

export interface GoogleObjectReport {
  serial: string;
  found: boolean;
  status?: number;
  /**
   * An object-level hero SHADOWS the class's band. Set by the stamp path until
   * c53cc79 and never cleared since — a PATCH that omits a field leaves it
   * alone — so this is the first thing to look at on a card that has been in a
   * wallet a while.
   */
  ownHeroUri?: string;
  /**
   * What the QR on the card ACTUALLY holds right now, as Google has it.
   *
   * Needed because barcode is written once, at createObject, and every stamp
   * since is a PATCH that omits it — so a change to what the barcode should
   * contain does not reach an object that already exists. Reading it back is
   * the only way a repair can tell a card it has already fixed from one it has
   * not, and the only way its count can mean anything.
   */
  barcodeValue?: string;
  state?: string;
}

/** GET the class Google is holding. Returns only named, secret-free fields. */
export async function readClass(card: CardRow): Promise<GoogleClassReport> {
  if (!setupStatus().canGoogleWallet) return { found: false, hasCallback: false, reason: "google-not-configured" };
  const [logoVersion, bannerVersion, markVersion, business, stampsVersion] = await Promise.all([
    cafeLogoVersion(card.id).catch(() => 0),
    cafeBannerVersion(card.id).catch(() => 0),
    cardLogoMarkVersion(card.id).catch(() => 0),
    businessNameForCard(card),
    stampStripsVersion(card.id).catch(() => 0),
  ]);
  const want = buildLoyaltyClass(card, logoVersion, bannerVersion, business, markVersion, stampsVersion);
  const expectedHeroUri = uriOf(want.heroImage);
  const expectedProgramLogoUri = uriOf(want.programLogo);

  const res = await api("GET", `/loyaltyClass/${classId(card)}`);
  if (res.status < 200 || res.status >= 300) {
    return {
      found: false,
      status: res.status,
      reason: res.text.slice(0, 200),
      hasCallback: false,
      expectedHeroUri,
      expectedProgramLogoUri,
    };
  }
  const cls = safeParse(res.text);
  return {
    found: true,
    status: res.status,
    reviewStatus: typeof cls.reviewStatus === "string" ? cls.reviewStatus : undefined,
    heroUri: uriOf(cls.heroImage),
    programLogoUri: uriOf(cls.programLogo),
    hasCallback: Boolean((cls.callbackOptions as { url?: string } | undefined)?.url),
    expectedHeroUri,
    expectedProgramLogoUri,
  };
}

/** GET one object Google is holding, to see whether it shadows the class band. */
export async function readObject(serial: string): Promise<GoogleObjectReport> {
  if (!setupStatus().canGoogleWallet) return { serial, found: false };
  const res = await api("GET", `/loyaltyObject/${config.googleIssuerId}.${serial}`);
  if (res.status < 200 || res.status >= 300) return { serial, found: false, status: res.status };
  const obj = safeParse(res.text);
  return {
    serial,
    found: true,
    status: res.status,
    ownHeroUri: uriOf(obj.heroImage),
    barcodeValue:
      obj.barcode && typeof obj.barcode === "object"
        ? ((obj.barcode as Record<string, unknown>).value as string | undefined)
        : undefined,
    state: typeof obj.state === "string" ? obj.state : undefined,
  };
}

function safeParse(text: string): Record<string, unknown> {
  try {
    const v = JSON.parse(text) as unknown;
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** The sourceUri out of an Image, whichever of Google's two shapes it arrives in. */
function uriOf(image: unknown): string | undefined {
  const src = (image as { sourceUri?: { uri?: string } } | null | undefined)?.sourceUri?.uri;
  return typeof src === "string" && src ? src : undefined;
}

/**
 * Take the band OFF one customer's card, so the shop's design shows through.
 *
 * Google renders an object's own `heroImage` over the class's. Between fd665e8
 * and c53cc79 every stamp put one on the object — first the stamp grid, then
 * `banner.png` — and a PATCH leaves an omitted field alone, so those images are
 * still there, frozen, on every card issued or stamped in that window. On a card
 * whose band colour was white, that frozen image is a white rectangle, which is
 * the "blank strip on Android" an owner cannot explain and cannot fix: resync
 * rewrites the CLASS, and the picture winning is on the OBJECT.
 *
 * `null`, not an omitted field. Omitting is precisely what froze them. 439b1d8
 * already relied on an explicit null clearing the slot, for this same reason.
 *
 * **No `notifyPreference`** — this is a repair, not an event. Google notifies
 * only when asked to (patchBalance asks; class patches deliberately do not), so
 * a customer's phone must not buzz because an operator tidied up their artwork.
 */
export async function clearObjectHero(serial: string): Promise<GoogleResult> {
  if (!setupStatus().canGoogleWallet) return notConfigured();
  try {
    return toResult(
      await api("PATCH", `/loyaltyObject/${config.googleIssuerId}.${serial}`, buildHeroClearPatch()),
    );
  } catch (err) {
    return { ok: false, reason: String(err) };
  }
}
