/**
 * Renders the fallback pass artwork (icon + logo PNGs) from inline SVG.
 * Run once (`pnpm art`); outputs are committed so production never needs sharp.
 *
 * These are shown to merchants who have not uploaded their own logo, so they
 * MUST stay brand-neutral — no shop name, no wordmark. This file used to draw
 * "Kopi Corner" into the logo, which then appeared on every real merchant's
 * card as if it were their business. Keep it to the mark alone.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, "..", "assets", "pass");
mkdirSync(outDir, { recursive: true });

// Simple coffee-cup mark on the card's brown, matching config.ts colours.
const iconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="#3b2016"/>
  <g fill="none" stroke="#fffaf0" stroke-width="6" stroke-linecap="round">
    <path d="M28 42 h34 v22 a12 12 0 0 1-12 12 h-10 a12 12 0 0 1-12-12 z" fill="#fffaf0" stroke="none"/>
    <path d="M62 46 h6 a8 8 0 0 1 0 16 h-6"/>
    <path d="M36 24 c0 5-4 5-4 10 M48 24 c0 5-4 5-4 10 M60 24 c0 5-4 5-4 10"/>
  </g>
</svg>`;

// The mark on its own, centred in a square. Apple no longer uses this at all
// unless a merchant uploads a logo (see passArt in src/passBuilder.ts); it
// survives because Google Wallet requires a hosted programLogo URI, which
// /art/logo.png serves from this file when there is no upload.
const logoSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <g fill="none" stroke="#fffaf0" stroke-width="6" stroke-linecap="round">
    <path d="M28 42 h34 v22 a12 12 0 0 1-12 12 h-10 a12 12 0 0 1-12-12 z" fill="#fffaf0" stroke="none"/>
    <path d="M62 46 h6 a8 8 0 0 1 0 16 h-6"/>
    <path d="M36 24 c0 5-4 5-4 10 M48 24 c0 5-4 5-4 10 M60 24 c0 5-4 5-4 10"/>
  </g>
</svg>`;

async function render(svg: string, width: number, height: number, file: string): Promise<void> {
  await sharp(Buffer.from(svg)).resize(width, height).png().toFile(path.join(outDir, file));
  console.log("wrote", file, `${width}x${height}`);
}

// icon.png is REQUIRED by PassKit and is what shows on a lock-screen
// notification. The logo is square now that it carries no wordmark.
await render(iconSvg, 29, 29, "icon.png");
await render(iconSvg, 58, 58, "icon@2x.png");
await render(iconSvg, 87, 87, "icon@3x.png");
await render(logoSvg, 160, 160, "logo.png");
await render(logoSvg, 320, 320, "logo@2x.png");
