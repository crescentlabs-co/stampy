/**
 * Tiny in-memory rate limiter — brute-force protection for login / signup /
 * forgot-password / staff PIN. No dependency, no DB: per-process counters are
 * fine for a single Railway instance (if we ever scale horizontally this moves
 * to Redis, but that's premature now).
 *
 * Fixed-window counter keyed by an arbitrary string (e.g. "login:<email>").
 * Each key allows `max` hits per `windowMs`; the window resets once it elapses.
 */

interface Bucket {
  count: number;
  resetAt: number; // epoch ms when the window (and count) resets
}

const buckets = new Map<string, Bucket>();

export interface RateResult {
  ok: boolean;
  /** Seconds until the caller may try again (only meaningful when !ok). */
  retryAfterSeconds: number;
}

/**
 * Checks whether `key` is currently blocked WITHOUT recording an attempt. Use
 * this to gate before doing work, then call `hit()` only when the work fails —
 * so successful use (a staff stamp, a good login) never burns the budget.
 */
export function peek(key: string, max: number, windowMs: number, now = Date.now()): RateResult {
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) return { ok: true, retryAfterSeconds: 0 };
  if (b.count >= max) {
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  }
  return { ok: true, retryAfterSeconds: 0 };
}

/** Records one attempt against `key`. Returns ok:false once `max` is exceeded. */
export function hit(key: string, max: number, windowMs: number, now = Date.now()): RateResult {
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSeconds: 0 };
  }
  b.count += 1;
  if (b.count > max) {
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  }
  return { ok: true, retryAfterSeconds: 0 };
}

/** Clears a key's counter (e.g. after a successful login) — optional, unused for now. */
export function clear(key: string): void {
  buckets.delete(key);
}

/** Test hook — wipe all state between cases. */
export function _reset(): void {
  buckets.clear();
}

// Periodic sweep so expired buckets don't accumulate forever. unref() keeps the
// timer from holding the process open (and from interfering with test runners).
const sweep = setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (now >= b.resetAt) buckets.delete(k);
}, 10 * 60_000);
if (typeof sweep.unref === "function") sweep.unref();
