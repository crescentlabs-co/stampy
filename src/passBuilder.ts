/**
 * Signs pass.json + artwork into a .pkpass bundle using the founder's Apple
 * certificates (base64 PEM in env). Kept separate from passModel.ts so all
 * content logic stays testable without certificates.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PKPass } from "passkit-generator";
import { config, setupStatus } from "./config.js";
import type { CafeRow, PassRow } from "./db.js";
import { buildPassJson } from "./passModel.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const artDir = path.join(here, "..", "assets", "pass");
const certsDir = path.join(here, "..", "certs");

let cachedArt: Record<string, Buffer> | null = null;

function loadArt(): Record<string, Buffer> {
  if (!cachedArt) {
    cachedArt = {};
    for (const f of ["icon.png", "icon@2x.png", "icon@3x.png", "logo.png", "logo@2x.png"]) {
      cachedArt[f] = readFileSync(path.join(artDir, f));
    }
  }
  return cachedArt;
}

export class NotConfiguredError extends Error {}

/** Builds and signs the .pkpass for a card. Throws NotConfiguredError until certs exist. */
export function buildPkpass(row: PassRow, cafe: CafeRow): Buffer {
  if (!setupStatus().canSignPasses) {
    throw new NotConfiguredError(
      "Apple certificates are not configured yet — check /setup for what's missing.",
    );
  }

  const pass = new PKPass(
    {
      ...loadArt(),
      "pass.json": Buffer.from(JSON.stringify(buildPassJson(row, cafe))),
    },
    {
      wwdr: readFileSync(path.join(certsDir, "wwdr.pem")),
      signerCert: Buffer.from(config.signerCertB64, "base64"),
      signerKey: Buffer.from(config.signerKeyB64, "base64"),
      signerKeyPassphrase: config.signerKeyPassphrase || undefined,
    },
  );

  return pass.getAsBuffer();
}
