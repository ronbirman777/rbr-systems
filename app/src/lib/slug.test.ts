import { describe, expect, it } from "vitest";
import {
  normalizeSlug,
  isValidSlugFormat,
  slugFormatError,
  isReservedSlug,
  checkSlugLocally,
  RESERVED_SLUGS,
} from "./slug";
import { isFileSizeAllowed, MAX_IMAGE_BYTES } from "./media/path";

describe("normalizeSlug", () => {
  it("lowercases and hyphenates a human-typed retreat name", () => {
    expect(normalizeSlug("Samadhi Retreat")).toBe("samadhi-retreat");
  });

  it("collapses whitespace/underscore runs into a single hyphen", () => {
    expect(normalizeSlug("Soma   Sanctuary_ _Center")).toBe("soma-sanctuary-center");
  });

  it("strips characters that aren't hostname-safe", () => {
    expect(normalizeSlug("Threshold!! (2026) café")).toBe("threshold-2026-caf");
  });

  it("collapses repeated hyphens and trims leading/trailing ones", () => {
    expect(normalizeSlug("--samadhi---retreat--")).toBe("samadhi-retreat");
  });
});

describe("isValidSlugFormat / slugFormatError", () => {
  it("accepts a normal lowercase-alnum-hyphen slug", () => {
    expect(slugFormatError("samadhi-retreat")).toBeNull();
    expect(isValidSlugFormat("samadhi-retreat")).toBe(true);
  });

  it("rejects slugs shorter than the minimum length", () => {
    expect(slugFormatError("ab")).toBe("too_short");
    expect(isValidSlugFormat("ab")).toBe(false);
  });

  it("rejects slugs longer than 63 characters", () => {
    const tooLong = "a".repeat(64);
    expect(slugFormatError(tooLong)).toBe("too_long");
  });

  it("accepts exactly 63 characters", () => {
    const max = `a${"b".repeat(61)}a`;
    expect(max.length).toBe(63);
    expect(slugFormatError(max)).toBeNull();
  });

  it("rejects a leading hyphen", () => {
    expect(slugFormatError("-samadhi")).toBe("invalid_characters");
  });

  it("rejects a trailing hyphen", () => {
    expect(slugFormatError("samadhi-")).toBe("invalid_characters");
  });

  it("rejects uppercase and non-hostname characters", () => {
    expect(slugFormatError("Samadhi")).toBe("invalid_characters");
    expect(slugFormatError("samadhi_retreat")).toBe("invalid_characters");
    expect(slugFormatError("samadhi.retreat")).toBe("invalid_characters");
  });
});

describe("isReservedSlug", () => {
  it("rejects every word on the reserved list", () => {
    for (const word of RESERVED_SLUGS) {
      expect(isReservedSlug(word)).toBe(true);
    }
  });

  it("accepts a normal, non-reserved slug", () => {
    expect(isReservedSlug("samadhi-retreat")).toBe(false);
  });
});

describe("checkSlugLocally (the combined pre-check the UI runs before hitting the server)", () => {
  it("returns ok for a valid, non-reserved slug", () => {
    expect(checkSlugLocally("Samadhi Retreat")).toBe("ok");
  });

  it("returns invalid for a too-short normalized result", () => {
    expect(checkSlugLocally("hi")).toBe("invalid");
  });

  it("returns reserved for a reserved word, even with mixed-case input", () => {
    expect(checkSlugLocally("Admin")).toBe("reserved");
  });
});

describe("isFileSizeAllowed (upload size boundary - Self Service Phase 1 media safeguards)", () => {
  it("accepts a file under the 8MB limit", () => {
    expect(isFileSizeAllowed(1024)).toBe(true);
  });

  it("accepts a file exactly at the limit", () => {
    expect(isFileSizeAllowed(MAX_IMAGE_BYTES)).toBe(true);
  });

  it("rejects a file over the limit", () => {
    expect(isFileSizeAllowed(MAX_IMAGE_BYTES + 1)).toBe(false);
  });

  it("rejects an empty file", () => {
    expect(isFileSizeAllowed(0)).toBe(false);
  });

  it("the limit is 8MB, per the Phase 1 media safeguards requirement", () => {
    expect(MAX_IMAGE_BYTES).toBe(8 * 1024 * 1024);
  });
});
