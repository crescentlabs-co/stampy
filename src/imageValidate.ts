/**
 * Upload guardrails for café logos — pure byte checks, no image library.
 * The dashboard normalises every upload to a small PNG client-side (canvas),
 * so the server only needs to verify "actually a PNG, sanely sized" before
 * storing it in Postgres.
 */

/** Every valid PNG starts with these eight bytes. */
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Uploads are canvas-normalised ~320×320 PNGs (~10–80 KB); 256 KB is generous. */
export const MAX_LOGO_BYTES = 256 * 1024;

export function isPng(buf: Buffer): boolean {
  return buf.length > PNG_MAGIC.length && buf.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC);
}

/** Returns null when acceptable, otherwise a machine-readable rejection reason. */
export function validateLogoPng(buf: Buffer): "not-png" | "too-large" | "empty" | null {
  if (buf.length === 0) return "empty";
  if (buf.length > MAX_LOGO_BYTES) return "too-large";
  if (!isPng(buf)) return "not-png";
  return null;
}
