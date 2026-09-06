export interface CustomerProfile {
  displayName: string;
  phoneNumber: string;
}

export type CustomerProfileResult =
  | { ok: true; profile: CustomerProfile }
  | { ok: false; error: "invalid-name" | "invalid-phone" | "consent-required" };

/**
 * Store one consistent, searchable phone shape. Local Malaysian numbers are
 * expanded to +60; explicit international prefixes are preserved. A phone is
 * contact detail only — callers must never use it as customer authentication.
 */
export function normalizePhoneNumber(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let phone = value.trim().replace(/[\s().-]/g, "");
  if (phone.startsWith("00")) phone = `+${phone.slice(2)}`;
  else if (phone.startsWith("0")) phone = `+60${phone.slice(1)}`;
  else if (!phone.startsWith("+")) phone = `+${phone}`;
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}

export function parseCustomerProfile(input: {
  displayName?: unknown;
  phoneNumber?: unknown;
  consent?: unknown;
}): CustomerProfileResult {
  const displayName = typeof input.displayName === "string"
    ? input.displayName.trim().replace(/\s+/g, " ")
    : "";
  if (!displayName || displayName.length > 80 || /[\u0000-\u001f\u007f]/.test(displayName)) {
    return { ok: false, error: "invalid-name" };
  }
  const phoneNumber = normalizePhoneNumber(input.phoneNumber);
  if (!phoneNumber) return { ok: false, error: "invalid-phone" };
  if (input.consent !== true && input.consent !== "1" && input.consent !== "on") {
    return { ok: false, error: "consent-required" };
  }
  return { ok: true, profile: { displayName, phoneNumber } };
}

export function maskPhoneNumber(phoneNumber: string): string {
  const digits = phoneNumber.replace(/\D/g, "");
  return digits ? `•••• ${digits.slice(-4)}` : "";
}

/** Digits-only form for matching phone queries without leaking them into URLs. */
export function phoneSearchValue(value: unknown): string {
  return typeof value === "string" ? value.replace(/\D/g, "").slice(0, 15) : "";
}
