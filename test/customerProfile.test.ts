import { describe, expect, it } from "vitest";
import {
  maskPhoneNumber,
  normalizePhoneNumber,
  parseCustomerProfile,
} from "../src/customerProfile.js";

describe("customer profile validation", () => {
  it("normalizes a Malaysian local number and tidy display name", () => {
    expect(parseCustomerProfile({
      displayName: "  Nur   Aisyah  ",
      phoneNumber: "012-345 6789",
      consent: true,
    })).toEqual({
      ok: true,
      profile: {
        displayName: "Nur Aisyah",
        phoneNumber: "+60123456789",
      },
    });
  });

  it("accepts international numbers without treating the phone as an identity", () => {
    expect(normalizePhoneNumber("+44 (0) 7700 900123")).toBe("+447700900123");
    expect(normalizePhoneNumber("0065 8123 4567")).toBe("+6581234567");
  });

  it("requires a name, a valid phone number, and explicit consent", () => {
    expect(parseCustomerProfile({ displayName: "", phoneNumber: "0123456789", consent: true }))
      .toEqual({ ok: false, error: "invalid-name" });
    expect(parseCustomerProfile({ displayName: "Aisyah", phoneNumber: "123", consent: true }))
      .toEqual({ ok: false, error: "invalid-phone" });
    expect(parseCustomerProfile({ displayName: "Aisyah", phoneNumber: "0123456789" }))
      .toEqual({ ok: false, error: "consent-required" });
    expect(parseCustomerProfile({ displayName: "Aisyah", phoneNumber: "0123456789", consent: "yes" }).ok)
      .toBe(true);
  });

  it("caps the fields before they reach the database", () => {
    expect(parseCustomerProfile({
      displayName: "a".repeat(81),
      phoneNumber: "0123456789",
      consent: true,
    })).toEqual({ ok: false, error: "invalid-name" });
  });

  it("masks phone numbers returned to a counter search", () => {
    expect(maskPhoneNumber("+60123456789")).toBe("•••• 6789");
    expect(maskPhoneNumber("")).toBe("");
  });
});
