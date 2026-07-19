import { describe, expect, it } from "vitest";
import { hexToRgb, rgbToHex } from "../src/color.js";

describe("rgbToHex", () => {
  it("converts PassKit rgb() strings to hex", () => {
    expect(rgbToHex("rgb(59, 32, 22)")).toBe("#3b2016");
    expect(rgbToHex("rgb(255, 250, 240)")).toBe("#fffaf0");
    expect(rgbToHex("rgb(0,0,0)")).toBe("#000000");
  });
  it("falls back to the brand brown on junk", () => {
    expect(rgbToHex("not-a-color")).toBe("#3b2016");
    expect(rgbToHex("")).toBe("#3b2016");
  });
});

describe("hexToRgb", () => {
  it("converts picker hex to the PassKit rgb() format", () => {
    expect(hexToRgb("#3b2016")).toBe("rgb(59, 32, 22)");
    expect(hexToRgb("#fffaf0")).toBe("rgb(255, 250, 240)");
    expect(hexToRgb("3b2016")).toBe("rgb(59, 32, 22)"); // hash optional
  });
  it("expands #rgb shorthand", () => {
    expect(hexToRgb("#abc")).toBe("rgb(170, 187, 204)");
  });
  it("falls back to the brand brown on junk", () => {
    expect(hexToRgb("#12345")).toBe("rgb(59, 32, 22)");
    expect(hexToRgb("javascript:alert(1)")).toBe("rgb(59, 32, 22)");
    expect(hexToRgb("")).toBe("rgb(59, 32, 22)");
  });
  it("round-trips with rgbToHex", () => {
    for (const hex of ["#000000", "#ff8800", "#fffaf0"]) {
      expect(rgbToHex(hexToRgb(hex))).toBe(hex);
    }
  });
});
