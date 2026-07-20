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

/**
 * Builds and signs the .pkpass for a card. Throws NotConfiguredError until
 * certs exist. When the café has an uploaded logo (`logoPng`), it replaces the
 * bundled default artwork in every slot — Wallet scales each to fit, so one
 * canvas-normalised square PNG covers icon and logo alike.
 */
export function buildPkpass(
  row: PassRow,
  cafe: CafeRow,
  logoPng?: Buffer | null,
  bannerPng?: Buffer | null,
): Buffer {
  if (!setupStatus().canSignPasses) {
    throw new NotConfiguredError(
      "Apple certificates are not configured yet — check /setup for what's missing.",
    );
  }

  const art = { ...loadArt() };
  if (logoPng) {
    for (const slot of Object.keys(art)) art[slot] = logoPng;
  }
  // A banner shows as the storeCard "strip" image behind the top fields.
  if (bannerPng) {
    art["strip.png"] = bannerPng;
    art["strip@2x.png"] = bannerPng;
  }

  const pass = new PKPass(
    {
      ...art,
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
