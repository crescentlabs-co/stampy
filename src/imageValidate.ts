/**
 * Upload guardrails for café logos — pure byte checks, no image library.
 * The dashboard normalises every upload to a small PNG client-side (canvas),
 * so the server only needs to verify "actually a PNG, sanely sized" before
 * storing it in Postgres.
 */

/** Every valid PNG starts with these eight bytes. */
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Uploads are canvas-normalised ~480×150 PNGs (~10–80 KB); 256 KB is generous. */
export const MAX_LOGO_BYTES = 256 * 1024;

/**
 * Banners and stamp strips are photographic and far bigger than a logo: a
 * 750×246 strip with a photo composited behind the stamps measures ~190 KB, and
 * a busy image more. They were being validated against the 256 KB logo cap,
 * which silently rejected every banner preset (a plain gradient at the old
 * 1032×336 was already 363 KB) — the upload appeared to work and no banner ever
 * reached the pass. Sized with headroom over a real photo.
 */
export const MAX_ART_BYTES = 512 * 1024;

export function isPng(buf: Buffer): boolean {
  return buf.length > PNG_MAGIC.length && buf.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC);
}

type Reject = "not-png" | "too-large" | "empty" | null;

function validatePng(buf: Buffer, max: number): Reject {
  if (buf.length === 0) return "empty";
  if (buf.length > max) return "too-large";
  if (!isPng(buf)) return "not-png";
  return null;
}

/** Returns null when acceptable, otherwise a machine-readable rejection reason. */
export function validateLogoPng(buf: Buffer): Reject {
  return validatePng(buf, MAX_LOGO_BYTES);
}

/** Same checks, the larger cap — for banners and rendered stamp strips. */
export function validateArtPng(buf: Buffer): Reject {
  return validatePng(buf, MAX_ART_BYTES);
}
