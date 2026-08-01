/**
 * Colour conversion between the two formats the wallets speak.
 *
 * The DB stores café colours as "rgb(r, g, b)" because Apple's pass.json wants
 * that literal string. Google wants hex, and so do the dashboard's
 * <input type="color"> pickers — so both directions live here, tolerant of
 * junk input (bad values fall back to the Stampy brand brown rather than
 * crashing a card build or a save).
 */

const FALLBACK_RGB = "rgb(59, 32, 22)";
const FALLBACK_HEX = "#3b2016";

/** "rgb(59, 32, 22)" (our DB format, per PassKit) → "#3b2016" (Google/pickers). */
export function rgbToHex(rgb: string): string {
  const m = /rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/.exec(rgb);
  if (!m) return FALLBACK_HEX;
  const hex = (s: string) => Math.min(255, Number(s)).toString(16).padStart(2, "0");
  return `#${hex(m[1]!)}${hex(m[2]!)}${hex(m[3]!)}`;
}

/**
 * Black or white — whichever is readable ON the given colour.
 *
 * Text is never sampled from a brand palette, here or in the browser's copy
 * (`pickTextColor`, PALETTE_JS in src/pages.ts): a shop whose colours happen to
 * be two dark tones would otherwise get a header nobody can read. WCAG relative
 * luminance, with the usual 0.179 crossover point.
 */
export function contrastText(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#ffffff"; // the fallback brown is dark
  const chan = (i: number) => {
    const v = parseInt(m[1]!.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const l = 0.2126 * chan(0) + 0.7152 * chan(2) + 0.0722 * chan(4);
  return l > 0.179 ? "#111111" : "#ffffff";
}

/** "#3b2016" or "#abc" (picker format) → "rgb(59, 32, 22)" (DB/PassKit format). */
export function hexToRgb(hex: string): string {
  const h = hex.trim();
  const long = /^#?([0-9a-f]{6})$/i.exec(h);
  const short = /^#?([0-9a-f]{3})$/i.exec(h);
  let six: string;
  if (long) six = long[1]!;
  else if (short) six = [...short[1]!].map((c) => c + c).join("");
  else return FALLBACK_RGB;
  const n = (i: number) => parseInt(six.slice(i, i + 2), 16);
  return `rgb(${n(0)}, ${n(2)}, ${n(4)})`;
}
