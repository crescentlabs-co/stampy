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
import { cafeBannerVersion, cafeLogoVersion, type CafeRow, type PassRow } from "./db.js";
import {
  buildLoyaltyClass,
  buildLoyaltyObject,
  buildSaveJwtClaims,
  objectId,
} from "./googleModel.js";

const WALLET_API = "https://walletobjects.googleapis.com/walletobjects/v1";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/wallet_object.issuer";

export interface GoogleResult {
  ok: boolean;
  status?: number;
  reason?: string;
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
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
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

async function api(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; text: string }> {
  const token = await accessToken();
  if (!token) return { status: 0, text: "no-access-token" };
  const res = await fetch(`${WALLET_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, text: await res.text() };
}

function notConfigured(): GoogleResult {
  return { ok: false, reason: "google-not-configured" };
}

function toResult(res: { status: number; text: string }): GoogleResult {
  const ok = res.status >= 200 && res.status < 300;
  if (!ok) console.error("[google-wallet] API error:", res.status, res.text.slice(0, 300));
  return { ok, status: res.status, reason: ok ? undefined : res.text.slice(0, 200) };
}

/** Insert-or-update the café's LoyaltyClass (called on enroll, café edits, logo upload). */
export async function ensureClass(cafe: CafeRow): Promise<GoogleResult> {
  if (!setupStatus().canGoogleWallet) return notConfigured();
  try {
    // Version-stamp the art URLs so Google re-fetches them after an upload.
    const [logoVersion, bannerVersion] = await Promise.all([
      cafeLogoVersion(cafe.id).catch(() => 0),
      cafeBannerVersion(cafe.id).catch(() => 0),
    ]);
    const cls = buildLoyaltyClass(cafe, logoVersion, bannerVersion);
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
export async function createObject(row: PassRow, cafe: CafeRow): Promise<GoogleResult> {
  if (!setupStatus().canGoogleWallet) return notConfigured();
  try {
    const obj = buildLoyaltyObject(row, cafe);
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
export function saveJwtUrl(row: PassRow, cafe: CafeRow): string | null {
  const sa = serviceAccount();
  if (!sa || !setupStatus().canGoogleWallet) return null;
  const token = jwt.sign(buildSaveJwtClaims(row, cafe, sa.client_email), sa.private_key, {
    algorithm: "RS256",
  });
  return `https://pay.google.com/gp/v/save/${token}`;
}

/**
 * Push the card's current state (stamp count, reward copy) to the device.
 * NOTIFY_ON_UPDATE makes Google show a notification for the balance change —
 * the Android equivalent of Apple's changeMessage banner.
 */
export async function patchBalance(row: PassRow, cafe: CafeRow): Promise<GoogleResult> {
  if (!setupStatus().canGoogleWallet) return notConfigured();
  try {
    const obj = {
      ...buildLoyaltyObject(row, cafe),
      notifyPreference: "NOTIFY_ON_UPDATE",
    };
    return toResult(await api("PATCH", `/loyaltyObject/${objectId(row)}`, obj));
  } catch (err) {
    return { ok: false, reason: String(err) };
  }
}

/** Free-form nudge: TEXT_AND_NOTIFY adds a message AND fires a notification. */
export async function addMessage(row: PassRow, cafe: CafeRow, text: string): Promise<GoogleResult> {
  if (!setupStatus().canGoogleWallet) return notConfigured();
  try {
    return toResult(
      await api("POST", `/loyaltyObject/${objectId(row)}/addMessage`, {
        message: { header: cafe.name, body: text, messageType: "TEXT_AND_NOTIFY" },
      }),
    );
  } catch (err) {
    return { ok: false, reason: String(err) };
  }
}
