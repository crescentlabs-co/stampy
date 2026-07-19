import { describe, expect, it } from "vitest";
import { isPng, MAX_LOGO_BYTES, validateLogoPng } from "../src/imageValidate.js";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const tinyPng = Buffer.concat([PNG_MAGIC, Buffer.from("IHDR-and-friends")]);

describe("isPng", () => {
  it("accepts data starting with the PNG magic bytes", () => {
    expect(isPng(tinyPng)).toBe(true);
  });
  it("rejects JPEGs and arbitrary junk", () => {
    expect(isPng(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5]))).toBe(false); // JPEG
    expect(isPng(Buffer.from("<svg onload=alert(1)>"))).toBe(false);
    expect(isPng(Buffer.alloc(0))).toBe(false);
  });
});

describe("validateLogoPng", () => {
  it("passes a sane PNG", () => {
    expect(validateLogoPng(tinyPng)).toBeNull();
  });
  it("rejects empty, oversize, and non-PNG uploads with distinct reasons", () => {
    expect(validateLogoPng(Buffer.alloc(0))).toBe("empty");
    expect(validateLogoPng(Buffer.concat([tinyPng, Buffer.alloc(MAX_LOGO_BYTES)]))).toBe("too-large");
    expect(validateLogoPng(Buffer.from("plain text file"))).toBe("not-png");
  });
});
