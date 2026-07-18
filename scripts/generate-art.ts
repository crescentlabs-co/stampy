/**
 * Renders the placeholder pass artwork (icon + logo PNGs) from inline SVG.
 * Run once (`pnpm art`); outputs are committed so production never needs sharp.
 * Swap the SVGs for a real café logo later and re-run.
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

const logoSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 100">
  <g fill="none" stroke="#fffaf0" stroke-width="5" stroke-linecap="round">
    <path d="M18 34 h30 v20 a10 10 0 0 1-10 10 h-10 a10 10 0 0 1-10-10 z" fill="#fffaf0" stroke="none"/>
    <path d="M48 38 h5 a7 7 0 0 1 0 14 h-5"/>
    <path d="M25 18 c0 4-3 4-3 8 M35 18 c0 4-3 4-3 8 M45 18 c0 4-3 4-3 8"/>
  </g>
  <text x="78" y="63" font-family="Avenir Next, Helvetica, sans-serif" font-size="34"
        font-weight="700" fill="#fffaf0">Kopi Corner</text>
</svg>`;

async function render(svg: string, width: number, height: number, file: string): Promise<void> {
  await sharp(Buffer.from(svg)).resize(width, height).png().toFile(path.join(outDir, file));
  console.log("wrote", file, `${width}x${height}`);
}

// icon.png is REQUIRED by PassKit; logo shows top-left on the card.
await render(iconSvg, 29, 29, "icon.png");
await render(iconSvg, 58, 58, "icon@2x.png");
await render(iconSvg, 87, 87, "icon@3x.png");
await render(logoSvg, 160, 50, "logo.png");
await render(logoSvg, 320, 100, "logo@2x.png");
