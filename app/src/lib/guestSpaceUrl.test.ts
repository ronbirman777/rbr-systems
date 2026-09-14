import { describe, expect, it } from "vitest";
import { buildGuestSpaceUrl } from "./guestSpaceUrl";

describe("buildGuestSpaceUrl - the one canonical public Guest App URL", () => {
  it("uses /s/[slug] when a slug is reserved", () => {
    const url = buildGuestSpaceUrl("tenant-1", "samadhi");
    expect(url.endsWith("/s/samadhi")).toBe(true);
  });

  it("falls back to /g/[tenantId] when there is no slug", () => {
    const url = buildGuestSpaceUrl("tenant-1", null);
    expect(url.endsWith("/g/tenant-1")).toBe(true);
  });

  it("is an absolute URL, not a relative path", () => {
    const url = buildGuestSpaceUrl("tenant-1", "samadhi");
    expect(() => new URL(url)).not.toThrow();
  });
});
