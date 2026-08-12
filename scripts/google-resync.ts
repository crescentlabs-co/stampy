/**
 * `pnpm google:resync` — re-send every café's LoyaltyClass to Google.
 *
 * Why this exists: ensureClass() runs on enroll and on café/logo/banner edits,
 * and nowhere else. So when the CLASS gains a field that every existing card
 * should show — the Terms and Privacy links, the reward terms — cards already in
 * customers' wallets would never see it, because nothing touches their class
 * again. This is the one-off sweep that closes that gap.
 *
 * Safe to run repeatedly. A class PATCH carries no notifyPreference, so this
 * notifies nobody: Google hard-caps notifications at 3/card/24h and none of them
 * should be spent on a terms link (CLAUDE.md invariant 3). It touches classes
 * only, never objects, so no customer's stamp count can be altered by it.
 *
 *   DATABASE_URL='<Railway DATABASE_PUBLIC_URL>' pnpm google:resync
 *
 * Needs the same Google credentials the server runs with. Without them it says
 * so and exits 0 — nothing to do is not a failure.
 */
import { allCards, getPool } from "../src/db.js";
import { ensureClass } from "../src/googleWallet.js";
import { setupStatus } from "../src/config.js";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.\n");
  console.error("  Railway → your project → the Postgres service → Variables tab");
  console.error("  → copy DATABASE_PUBLIC_URL, then run:\n");
  console.error("  DATABASE_URL='<paste it here>' pnpm google:resync\n");
  process.exit(1);
}

// This is the usual outcome when run from a laptop, and it used to print one
// cheerful line and exit 0 — which reads as "done" when nothing happened at all.
// The credentials live in Railway, and invariant 2 says they stay there, so the
// console button is the real path and this exits non-zero to say so.
if (!setupStatus().canGoogleWallet) {
  console.error("Google Wallet is not configured IN THIS SHELL.\n");
  console.error("  GOOGLE_ISSUER_ID and GOOGLE_SERVICE_ACCOUNT_B64 live in Railway's");
  console.error("  Variables, and a service-account private key should not be copied");
  console.error("  onto a laptop or into a shell history to run this.\n");
  console.error("  Use the button instead:  /admin → Shops → Maintenance →");
  console.error("  'Resync Google Wallet'. It runs the same code where the key is.\n");
  process.exit(1);
}

const pool = getPool();
const rows = await allCards();
console.log(`Resyncing ${rows.length} class${rows.length === 1 ? "" : "es"} to Google…\n`);

let failed = 0;
for (const card of rows) {
  const r = await ensureClass(card);
  if (r.ok) {
    console.log(`  ok    ${card.id.padEnd(24)} ${card.name}`);
  } else {
    failed++;
    console.error(`  FAIL  ${card.id.padEnd(24)} ${card.name} — ${r.reason}`);
  }
}

await pool.end();

if (failed) {
  console.error(`\n${failed} of ${rows.length} failed. ❌`);
  process.exit(1);
}
console.log(`\nRESYNC OK ✅  ${rows.length} classes carry the terms and privacy links.`);
