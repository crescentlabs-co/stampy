import { describe, it, expect, beforeEach } from "vitest";
import { hit, clear, _reset } from "../src/rateLimit.js";

describe("rateLimit", () => {
  beforeEach(() => _reset());

  it("allows up to max, then blocks", () => {
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) {
      expect(hit("k", 3, 10_000, now).ok).toBe(true);
    }
    const blocked = hit("k", 3, 10_000, now);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(10);
  });

  it("resets after the window elapses", () => {
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) hit("k", 3, 10_000, now);
    expect(hit("k", 3, 10_000, now).ok).toBe(false);
    // Past the window → counter resets, allowed again.
    expect(hit("k", 3, 10_000, now + 10_001).ok).toBe(true);
  });

  it("keys are independent", () => {
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) hit("a", 3, 10_000, now);
    expect(hit("a", 3, 10_000, now).ok).toBe(false);
    expect(hit("b", 3, 10_000, now).ok).toBe(true); // different key unaffected
  });

  it("clear() lets a key start over", () => {
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) hit("k", 3, 10_000, now);
    expect(hit("k", 3, 10_000, now).ok).toBe(false);
    clear("k");
    expect(hit("k", 3, 10_000, now).ok).toBe(true);
  });
});
