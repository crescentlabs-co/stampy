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
import type { CardRow, PassRow } from "./db.js";
import { buildPassJson } from "./passModel.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const artDir = path.join(here, "..", "assets", "pass");
const certsDir = path.join(here, "..", "certs");

let cachedIcons: Record<string, Buffer> | null = null;

/**
 * The bundled square mark, used for the icon slots on every pass. Brand-neutral
 * on purpose — see scripts/generate-art.ts.
 */
function loadIcons(): Record<string, Buffer> {
  if (!cachedIcons) {
    cachedIcons = {};
    for (const f of ["icon.png", "icon@2x.png", "icon@3x.png"]) {
      cachedIcons[f] = readFileSync(path.join(artDir, f));
    }
  }
  return cachedIcons;
}

export class NotConfiguredError extends Error {}

/**
 * Decides which buffer lands in which Apple art slot. Pure and exported so the
 * mapping is testable — buildPkpass itself can't be, since it needs certs.
 *
 * Three rules, each learned the hard way:
 *
 *  - `icon.*` is ALWAYS the bundled square mark. It is required by PassKit and
 *    is what a lock-screen notification shows, so it must stay square. An
 *    uploaded logo used to be copied over it, which turned a wide wordmark into
 *    an unreadable squashed notification icon.
 *  - `logo.*` is written ONLY when the merchant uploaded one. With no upload the
 *    slot is left empty and Wallet renders `logoText` (the shop name) alone —
 *    better than shipping a placeholder with somebody else's brand on it.
 *  - `strip.*` takes the rendered stamp grid, falling back to a bare banner for
 *    a card that has a banner but no strips yet. The grid already has the banner
 *    composited into it (see drawStampStrip in src/pages.ts), so nothing is lost
 *    when the grid wins.
 */
/**
 * Which of the two logos an Apple card should wear.
 *
 * `logo_has_name` is "my wide logo already says the shop's name", so the pass
 * drops its own name text and the wide lockup is the whole header. Turn that
 * OFF and the pass prints the shop's name beside the logo — and a wide lockup
 * leaves no room for the words, so the SMALL one is the right picture.
 *
 * Google has always preferred the small one (it draws logos in a circle); this
 * is the same rule reaching the iPhone, and it is why the two boxes are now
 * called Wide and Small rather than Apple and Android.
 *
 * Falls back to whichever exists. A shop with only one logo gets that one.
 */
export function passLogo(
  card: Pick<CardRow, "logo_has_name">,
  wide?: Buffer | null,
  small?: Buffer | null,
): Buffer | null | undefined {
  if (!card.logo_has_name && small) return small;
  return wide ?? small;
}

export function passArt(
  logoPng?: Buffer | null,
  stripPng?: Buffer | null,
): Record<string, Buffer> {
  const art: Record<string, Buffer> = { ...loadIcons() };
  if (logoPng) {
    art["logo.png"] = logoPng;
    art["logo@2x.png"] = logoPng;
    art["logo@3x.png"] = logoPng;
  }
  if (stripPng) {
    // Rendered at @3x (1125×369 for a 375×123pt storeCard strip) and handed to
    // every slot — one buffer beats three near-identical ones through the
    // signer, and Wallet scales it per device.
    art["strip.png"] = stripPng;
    art["strip@2x.png"] = stripPng;
    art["strip@3x.png"] = stripPng;
  }
  return art;
}

/**
 * Builds and signs the .pkpass for a card. Throws NotConfiguredError until
 * certs exist. Slot assignment lives in `passArt` above.
 */
export function buildPkpass(
  row: PassRow,
  card: CardRow,
  logoPng?: Buffer | null,
  bannerPng?: Buffer | null,
  stampStripPng?: Buffer | null,
  business?: string,
  /** The square version, when the shop uploaded one. See passLogo. */
  markPng?: Buffer | null,
): Buffer {
  if (!setupStatus().canSignPasses) {
    throw new NotConfiguredError(
      "Apple certificates are not configured yet — check /setup for what's missing.",
    );
  }

  const art = passArt(passLogo(card, logoPng, markPng), stampStripPng ?? bannerPng);

  const pass = new PKPass(
    {
      ...art,
      "pass.json": Buffer.from(JSON.stringify(buildPassJson(row, card, business))),
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
