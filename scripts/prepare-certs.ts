/**
 * Converts the founder's Apple credential files into the base64 values that go
 * into Railway's Variables UI. Claude runs this FOR the founder when the files
 * exist — the founder never touches a terminal.
 *
 *   pnpm prepare-certs <Certificates.p12> <p12-password> <AuthKey_XXXXXX.p8>
 *
 * Prints each VARIABLE=value block ready to paste into Railway.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const [p12Path, p12Password, p8Path] = process.argv.slice(2);

if (!p12Path || p12Password === undefined || !p8Path) {
  console.error("Usage: pnpm prepare-certs <Certificates.p12> <p12-password> <AuthKey_XXXXXX.p8>");
  process.exit(1);
}
for (const f of [p12Path, p8Path]) {
  if (!existsSync(f)) {
    console.error(`File not found: ${f}`);
    process.exit(1);
  }
}

function openssl(args: string[]): string {
  return execFileSync("openssl", args, { encoding: "utf8" });
}

// Extract the signing certificate (public half) and private key from the .p12.
const certPem = openssl([
  "pkcs12", "-in", p12Path, "-clcerts", "-nokeys", "-passin", `pass:${p12Password}`,
]);
const keyPem = openssl([
  "pkcs12", "-in", p12Path, "-nocerts", "-nodes", "-passin", `pass:${p12Password}`,
]);

const keyIdMatch = /AuthKey_([A-Z0-9]+)\.p8$/.exec(p8Path);

console.log("\nPaste these into Railway → your service → Variables:\n");
console.log(`SIGNER_CERT_B64=${Buffer.from(certPem).toString("base64")}\n`);
console.log(`SIGNER_KEY_B64=${Buffer.from(keyPem).toString("base64")}\n`);
console.log(`APNS_KEY_B64=${readFileSync(p8Path).toString("base64")}\n`);
if (keyIdMatch) console.log(`APNS_KEY_ID=${keyIdMatch[1]}\n`);
else console.log("APNS_KEY_ID=<the 10-char Key ID shown on developer.apple.com>\n");
console.log("Also set: APPLE_TEAM_ID, PASS_TYPE_ID, BASE_URL, STAFF_PIN\n");
