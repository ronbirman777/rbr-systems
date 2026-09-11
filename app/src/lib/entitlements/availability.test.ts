import { describe, expect, it } from "vitest";
import { deriveCommercialAvailability } from "./availability";
import type { SpaceEntitlementRow } from "./types";

function makeEntitlement(overrides: Partial<SpaceEntitlementRow> = {}): SpaceEntitlementRow {
  return {
    tenant_id: "00000000-0000-0000-0000-000000000001",
    access_type: "complimentary",
    starts_at: "2026-01-01T00:00:00.000Z",
    access_ends_at: "2026-02-01T00:00:00.000Z",
    stripe_customer_id: null,
    stripe_subscription_id: null,
    cancel_at_period_end: false,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("deriveCommercialAvailability", () => {
  describe("no entitlement row", () => {
    it("is inactive but manageable", () => {
      const result = deriveCommercialAvailability(null, new Date("2026-01-15T00:00:00.000Z"));
      expect(result).toEqual({
        accessType: null,
        effectiveStatus: "inactive",
        accessEndsAt: null,
        graceEndsAt: null,
        daysRemaining: null,
        canManage: true,
        canPublish: false,
        isPubliclyAvailable: false,
      });
    });
  });

  describe("boundary: access_ends_at", () => {
    // grace end is derived, not stored - access_ends_at + 7 days = 2026-02-08.
    const entitlement = makeEntitlement({
      access_type: "complimentary",
      access_ends_at: "2026-02-01T00:00:00.000Z",
    });

    it("now == access_ends_at is still the granted access type (inclusive)", () => {
      const result = deriveCommercialAvailability(entitlement, new Date("2026-02-01T00:00:00.000Z"));
      expect(result.effectiveStatus).toBe("complimentary");
      expect(result.canPublish).toBe(true);
      expect(result.isPubliclyAvailable).toBe(true);
    });

    it("now immediately after access_ends_at is grace", () => {
      const result = deriveCommercialAvailability(entitlement, new Date("2026-02-01T00:00:00.001Z"));
      expect(result.effectiveStatus).toBe("grace");
      expect(result.canPublish).toBe(true);
      expect(result.isPubliclyAvailable).toBe(true);
    });
  });

  describe("boundary: derived grace end (access_ends_at + 7 days)", () => {
    // access_ends_at 2026-02-01 -> derived grace end 2026-02-08, exactly.
    const entitlement = makeEntitlement({
      access_ends_at: "2026-02-01T00:00:00.000Z",
    });

    it("now == access_ends_at + 7 days is still grace (inclusive)", () => {
      const result = deriveCommercialAvailability(entitlement, new Date("2026-02-08T00:00:00.000Z"));
      expect(result.effectiveStatus).toBe("grace");
      expect(result.canPublish).toBe(true);
      expect(result.isPubliclyAvailable).toBe(true);
    });

    it("now immediately after access_ends_at + 7 days is inactive", () => {
      const result = deriveCommercialAvailability(entitlement, new Date("2026-02-08T00:00:00.001Z"));
      expect(result.effectiveStatus).toBe("inactive");
      expect(result.canPublish).toBe(false);
      expect(result.isPubliclyAvailable).toBe(false);
      expect(result.daysRemaining).toBeNull();
    });
  });

  describe("access_type propagation", () => {
    it("reflects complimentary while within access window", () => {
      const entitlement = makeEntitlement({ access_type: "complimentary" });
      const result = deriveCommercialAvailability(entitlement, new Date("2026-01-15T00:00:00.000Z"));
      expect(result.effectiveStatus).toBe("complimentary");
      expect(result.accessType).toBe("complimentary");
    });

    it("reflects active while within access window", () => {
      const entitlement = makeEntitlement({ access_type: "active" });
      const result = deriveCommercialAvailability(entitlement, new Date("2026-01-15T00:00:00.000Z"));
      expect(result.effectiveStatus).toBe("active");
      expect(result.accessType).toBe("active");
    });
  });

  describe("canManage is always true regardless of status", () => {
    const entitlement = makeEntitlement({
      access_ends_at: "2026-02-01T00:00:00.000Z",
    });

    it.each([
      ["complimentary/active window", "2026-01-15T00:00:00.000Z"],
      ["grace window", "2026-02-05T00:00:00.000Z"],
      ["inactive", "2026-03-01T00:00:00.000Z"],
    ])("%s", (_label, isoNow) => {
      const result = deriveCommercialAvailability(entitlement, new Date(isoNow));
      expect(result.canManage).toBe(true);
    });
  });

  describe("daysRemaining", () => {
    it("counts down to access_ends_at while active", () => {
      const entitlement = makeEntitlement({ access_ends_at: "2026-01-10T00:00:00.000Z" });
      const result = deriveCommercialAvailability(entitlement, new Date("2026-01-08T00:00:00.000Z"));
      expect(result.daysRemaining).toBe(2);
    });

    it("counts down to the derived grace end while in grace", () => {
      // access_ends_at 2026-01-10 -> derived grace end 2026-01-17.
      const entitlement = makeEntitlement({ access_ends_at: "2026-01-10T00:00:00.000Z" });
      const result = deriveCommercialAvailability(entitlement, new Date("2026-01-15T00:00:00.000Z"));
      expect(result.daysRemaining).toBe(2);
    });

    it("is null once inactive", () => {
      const entitlement = makeEntitlement({ access_ends_at: "2026-01-10T00:00:00.000Z" });
      const result = deriveCommercialAvailability(entitlement, new Date("2026-02-01T00:00:00.000Z"));
      expect(result.daysRemaining).toBeNull();
    });
  });

  describe("accessEndsAt passthrough / graceEndsAt derivation", () => {
    it("echoes access_ends_at unchanged and derives graceEndsAt as exactly +7 days", () => {
      const entitlement = makeEntitlement({ access_ends_at: "2026-02-01T00:00:00.000Z" });
      const result = deriveCommercialAvailability(entitlement, new Date("2026-01-15T00:00:00.000Z"));
      expect(result.accessEndsAt).toBe("2026-02-01T00:00:00.000Z");
      expect(result.graceEndsAt).toBe("2026-02-08T00:00:00.000Z");
    });

    it("applies the same +7 day rule regardless of the access_ends_at value", () => {
      const entitlement = makeEntitlement({ access_ends_at: "2026-06-15T09:30:00.000Z" });
      const result = deriveCommercialAvailability(entitlement, new Date("2026-06-01T00:00:00.000Z"));
      expect(result.graceEndsAt).toBe("2026-06-22T09:30:00.000Z");
    });
  });
});
