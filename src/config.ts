/**
 * Central configuration. Everything secret or environment-specific comes from
 * environment variables (set in Railway's web UI — never edited in files).
 *
 * The app is designed to BOOT WITHOUT the Apple secrets so the founder can
 * deploy first, then paste certificates in later. Anything that needs the
 * missing secrets fails with a clear, human-readable message instead of
 * crashing the server. The /setup page reports which pieces are present.
 */

export interface CafeConfig {
  /** Display name on the card and pages. */
  name: string;
  /** Total stamps needed to redeem. */
  stampsTarget: number;
  /** Stamps pre-filled on a brand-new card (endowed progress). */
  stampsStart: number;
  /** What a full card earns. */
  reward: string;
  /** Card colours (CSS rgb() strings, per PassKit spec). */
  backgroundColor: string;
  foregroundColor: string;
  labelColor: string;
}

/** v1 has exactly one hardcoded café (the thin slice). Multi-tenant comes later. */
export const CAFE: CafeConfig = {
  name: process.env.CAFE_NAME ?? "Kopi Corner",
  stampsTarget: intEnv("STAMPS_TARGET", 10),
  stampsStart: intEnv("STAMPS_START", 2),
  reward: process.env.CAFE_REWARD ?? "Free coffee",
  backgroundColor: "rgb(59, 32, 22)",
  foregroundColor: "rgb(255, 250, 240)",
  labelColor: "rgb(214, 178, 120)",
};

export const config = {
  /** Public HTTPS base URL of this server, e.g. https://stampy.up.railway.app */
  baseUrl: (process.env.BASE_URL ?? "").replace(/\/+$/, ""),
  port: intEnv("PORT", 3000),
  databaseUrl: process.env.DATABASE_URL ?? "",

  /** Apple Developer Team ID (10 chars, from developer.apple.com membership page). */
  teamId: process.env.APPLE_TEAM_ID ?? "",
  /** Pass Type identifier, e.g. pass.com.stampy.loyalty */
  passTypeId: process.env.PASS_TYPE_ID ?? "",

  /** Pass signing certificate + key, base64-encoded PEM (from the founder's .p12). */
  signerCertB64: process.env.SIGNER_CERT_B64 ?? "",
  signerKeyB64: process.env.SIGNER_KEY_B64 ?? "",
  signerKeyPassphrase: process.env.SIGNER_KEY_PASSPHRASE ?? "",

  /** APNs auth key (.p8), base64-encoded, plus its Key ID. Used for push updates. */
  apnsKeyB64: process.env.APNS_KEY_B64 ?? "",
  apnsKeyId: process.env.APNS_KEY_ID ?? "",

  /** Simple shared PIN gating the staff page (thin-slice auth). */
  staffPin: process.env.STAFF_PIN ?? "1234",
};

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export interface SetupStatus {
  database: boolean;
  baseUrl: boolean;
  teamId: boolean;
  passTypeId: boolean;
  signerCert: boolean;
  apnsKey: boolean;
  /** True when a signed pass can be generated. */
  canSignPasses: boolean;
  /** True when push updates can be sent. */
  canPush: boolean;
}

export function setupStatus(): SetupStatus {
  const signerCert = Boolean(config.signerCertB64 && config.signerKeyB64);
  const apnsKey = Boolean(config.apnsKeyB64 && config.apnsKeyId && config.teamId);
  return {
    database: Boolean(config.databaseUrl),
    baseUrl: Boolean(config.baseUrl),
    teamId: Boolean(config.teamId),
    passTypeId: Boolean(config.passTypeId),
    signerCert,
    apnsKey,
    canSignPasses: signerCert && Boolean(config.teamId && config.passTypeId && config.baseUrl),
    canPush: apnsKey && Boolean(config.passTypeId),
  };
}
