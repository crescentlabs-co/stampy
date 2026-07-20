/**
 * Central configuration. Everything secret or environment-specific comes from
 * environment variables (set in Railway's web UI — never edited in files).
 *
 * The app is designed to BOOT WITHOUT the Apple secrets so the founder can
 * deploy first, then paste certificates in later. Anything that needs the
 * missing secrets fails with a clear, human-readable message instead of
 * crashing the server. The /setup page reports which pieces are present.
 */

/**
 * Café content now lives in the `cafes` DB table (multi-café). These env values
 * are used ONCE — to seed the default café on first boot — so v0.1 deployments
 * keep working unchanged. Edits after that happen in the owner dashboard.
 */
export const seedCafe = {
  name: process.env.CAFE_NAME ?? "Kopi Corner",
  stampsTarget: intEnv("STAMPS_TARGET", 10),
  stampsStart: intEnv("STAMPS_START", 2),
  reward: process.env.CAFE_REWARD ?? "Free coffee",
};

export const config = {
  /** Public HTTPS base URL of this server, e.g. https://stampy.up.railway.app */
  baseUrl: (process.env.BASE_URL ?? "").replace(/\/+$/, ""),
  port: intEnv("PORT", 3000),
  databaseUrl: process.env.DATABASE_URL ?? "",

  /** The platform owner's email — this owner account can reach /admin. Unset ⇒ /admin is closed. */
  adminEmail: (process.env.ADMIN_EMAIL ?? "").toLowerCase().trim(),

  /** Resend API key + verified From address for transactional email (reset/welcome).
   *  Unset ⇒ email degrades gracefully; owners recover via the admin console instead. */
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "",

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

  /** Google Wallet: Issuer ID (from the Wallet Business Console). */
  googleIssuerId: process.env.GOOGLE_ISSUER_ID ?? "",
  /** Google Cloud service-account JSON, base64-encoded (from pnpm prepare-google). */
  googleServiceAccountB64: process.env.GOOGLE_SERVICE_ACCOUNT_B64 ?? "",

  /** Seed PIN for the default café's staff page (per-café PINs live in the DB). */
  staffPin: process.env.STAFF_PIN ?? "1234",

  /**
   * Secret for signing dashboard session cookies. If unset, a random one is
   * generated per boot (sessions survive until the next deploy — fine for now;
   * set SESSION_SECRET in Railway for stable logins).
   */
  sessionSecret: process.env.SESSION_SECRET ?? "",
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
  googleIssuer: boolean;
  googleServiceAccount: boolean;
  /** True when a signed Apple pass can be generated. */
  canSignPasses: boolean;
  /** True when Apple push updates can be sent. */
  canPush: boolean;
  /** True when Google Wallet cards can be issued and updated. */
  canGoogleWallet: boolean;
  /** True when transactional email (password reset / welcome) can be sent. */
  canEmail: boolean;
}

export function setupStatus(): SetupStatus {
  const signerCert = Boolean(config.signerCertB64 && config.signerKeyB64);
  const apnsKey = Boolean(config.apnsKeyB64 && config.apnsKeyId && config.teamId);
  const googleIssuer = Boolean(config.googleIssuerId);
  const googleServiceAccount = Boolean(config.googleServiceAccountB64);
  return {
    database: Boolean(config.databaseUrl),
    baseUrl: Boolean(config.baseUrl),
    teamId: Boolean(config.teamId),
    passTypeId: Boolean(config.passTypeId),
    signerCert,
    apnsKey,
    googleIssuer,
    googleServiceAccount,
    canSignPasses: signerCert && Boolean(config.teamId && config.passTypeId && config.baseUrl),
    canPush: apnsKey && Boolean(config.passTypeId),
    canGoogleWallet: googleIssuer && googleServiceAccount,
    canEmail: Boolean(config.resendApiKey && config.emailFrom),
  };
}
