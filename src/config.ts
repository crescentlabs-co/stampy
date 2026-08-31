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
 * Café content now lives in the `cards` DB table (multi-café). These env values
 * are used ONCE — to seed the default café on first boot — so v0.1 deployments
 * keep working unchanged. Edits after that happen in the owner dashboard.
 */
export const seedCard = {
  name: process.env.CAFE_NAME ?? "Kopi Corner",
  stampsTarget: intEnv("STAMPS_TARGET", 10),
  stampsStart: intEnv("STAMPS_START", 2),
  reward: process.env.CAFE_REWARD ?? "Free coffee",
};

export const config = {
  /** Public HTTPS base URL of this server, e.g. https://stampy.up.railway.app */
  baseUrl: (process.env.BASE_URL ?? "").trim().replace(/\/+$/, ""),
  port: intEnv("PORT", 3000),
  databaseUrl: process.env.DATABASE_URL ?? "",

  /** Platform-owner emails that can reach /admin. `ADMIN_EMAIL` may list several,
   *  comma-separated (e.g. "me@x.com, partner@x.com"). Empty ⇒ /admin is closed. */
  adminEmails: (process.env.ADMIN_EMAIL ?? "")
    .split(",")
    .map((e) => e.toLowerCase().trim())
    .filter(Boolean),

  /** Resend API key + verified From address for transactional email (reset/welcome).
   *  Unset ⇒ email degrades gracefully; owners recover via the admin console instead. */
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "",

  /** Public contact email shown on the Privacy/Terms pages (PDPA requests).
   *  Set CONTACT_EMAIL in Railway; when unset the pages say to use your dashboard account. */
  contactEmail: process.env.CONTACT_EMAIL ?? "",
  /**
   * The card the marketing page's "try a demo card" buttons issue. It is the
   * PunchMe Demo shop, which exists to be that demo and nothing else — so its
   * dashboard doubles as the count of who tried the card from the website.
   *
   * Defaulted rather than left empty on purpose: production is then correct with
   * no variable set, and forgetting one would silently hand visitors a card
   * belonging to a different shop. A card id can never change (CLAUDE.md), so
   * this string is safe to hold. `pnpm dev:local` overrides it to the seeded
   * card, since the demo shop does not exist in a local database.
   */
  demoCardId: (process.env.DEMO_CARD_ID ?? "fbe9ghdk").trim(),

  /** Apple Developer Team ID (10 chars, from developer.apple.com membership page). */
  teamId: (process.env.APPLE_TEAM_ID ?? "").trim(),
  /** Pass Type identifier, e.g. pass.com.stampy.loyalty */
  passTypeId: (process.env.PASS_TYPE_ID ?? "").trim(),

  /** Pass signing certificate + key, base64-encoded PEM (from the founder's .p12). */
  signerCertB64: process.env.SIGNER_CERT_B64 ?? "",
  signerKeyB64: process.env.SIGNER_KEY_B64 ?? "",
  signerKeyPassphrase: process.env.SIGNER_KEY_PASSPHRASE ?? "",

  /** APNs auth key (.p8), base64-encoded, plus its Key ID. Used for push updates. */
  apnsKeyB64: process.env.APNS_KEY_B64 ?? "",
  apnsKeyId: (process.env.APNS_KEY_ID ?? "").trim(),

  /** Google Wallet: Issuer ID (from the Wallet Business Console). */
  googleIssuerId: (process.env.GOOGLE_ISSUER_ID ?? "").trim(),
  /** Google Cloud service-account JSON, base64-encoded (from pnpm prepare-google). */
  googleServiceAccountB64: process.env.GOOGLE_SERVICE_ACCOUNT_B64 ?? "",
  /**
   * Shared secret in the Google Wallet callback URL — the ONLY thing standing
   * between a stranger and the ability to write fake "customer deleted their
   * card" rows. Unset ⇒ the endpoint refuses everything, so Android churn is
   * simply not recorded (see src/routes/googleCallback.ts).
   */
  googleCallbackSecret: (process.env.GOOGLE_CALLBACK_SECRET ?? "").trim(),

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

/**
 * Is the public "create an account" form open?
 *
 * Closed by default. Merchants are onboarded done-for-you — we build the shop
 * in admin and send them a claim link — so an open signup form would only ever
 * mint shops nobody asked for. Set ALLOW_PUBLIC_SIGNUP=1 to reopen it.
 *
 * A function rather than a field on `config`, for the same reason
 * `setupStatus()` is: it is read per request, so a deployment can be opened or
 * closed without a rebuild, and the tests can exercise both sides in one
 * process.
 */
export function signupOpen(): boolean {
  return (process.env.ALLOW_PUBLIC_SIGNUP ?? "").trim() === "1";
}

/**
 * Which copy of PunchMe this is: "live" — the default, so production behaves
 * unchanged with nothing set — or "staging". Everything staging-specific keys
 * off this one name: the page banner, the noindex tag, the email block, and
 * the database stamp that refuses a cross-wired DATABASE_URL (ensureEnvStamp
 * in src/db.ts). A function rather than a config field, for the same reason
 * signupOpen() is: read per call, so the tests can exercise both sides in one
 * process.
 */
export function envName(): string {
  return (process.env.ENV_NAME ?? "").trim().toLowerCase() || "live";
}

/**
 * The word in front of the card id inside every Google Wallet class id:
 * `<issuer>.<prefix>-<cardId>` (classId, src/googleModel.ts). Defaults to
 * "stampy" — the historical value re-sent on every stamp of every Android
 * card ever issued (CLAUDE.md invariant 13) — so a deployment with nothing
 * set does not change by a single character. Staging sets
 * GOOGLE_CLASS_PREFIX=stampy-stg: the card id "default" exists in BOTH
 * databases and would otherwise map both copies onto the same Google class,
 * letting staging overwrite the live card template. A test pins the default.
 */
export function googleClassPrefix(): string {
  return (process.env.GOOGLE_CLASS_PREFIX ?? "").trim() || "stampy";
}
