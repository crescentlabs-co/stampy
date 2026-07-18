/**
 * Converts the founder's downloaded Google service-account JSON key into the
 * base64 value that goes into Railway's Variables UI. Claude runs this FOR the
 * founder when the file exists — the founder never touches a terminal.
 *
 *   pnpm prepare-google <service-account.json>
 *
 * Prints the VARIABLE=value block ready to paste into Railway.
 */
import { existsSync, readFileSync } from "node:fs";

const [jsonPath] = process.argv.slice(2);

if (!jsonPath) {
  console.error("Usage: pnpm prepare-google <service-account.json>");
  process.exit(1);
}
if (!existsSync(jsonPath)) {
  console.error(`File not found: ${jsonPath}`);
  process.exit(1);
}

const raw = readFileSync(jsonPath, "utf8");
let parsed: { client_email?: string; private_key?: string };
try {
  parsed = JSON.parse(raw);
} catch {
  console.error("That file isn't valid JSON — download the service-account key again.");
  process.exit(1);
}
if (!parsed.client_email || !parsed.private_key) {
  console.error(
    "That JSON is missing client_email/private_key — it must be a service-account KEY file " +
      "(Google Cloud → IAM → Service Accounts → Keys → Add key → JSON).",
  );
  process.exit(1);
}

console.log("\nPaste this into Railway → your service → Variables:\n");
console.log(`GOOGLE_SERVICE_ACCOUNT_B64=${Buffer.from(raw).toString("base64")}\n`);
console.log(`(service account: ${parsed.client_email})`);
console.log(
  "Also set GOOGLE_ISSUER_ID — the number shown in the Google Wallet Business Console.\n",
);
