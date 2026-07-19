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
