import { describe, expect, it, vi } from "vitest";

// "server-only" throws when its default export condition resolves (see
// node_modules/server-only/index.js) - that's the whole point of the
// package, enforced by Next's bundler for the browser build. Under plain
// Vitest/Node there's no bundler applying the "react-server" export
// condition, so importing it for real here would throw and break the
// test; stub it out exactly the way Next.js code itself becomes a no-op
// module server-side.
vi.mock("server-only", () => ({}));

// Task 011: isSpacePubliclyAvailable() now also reads tenants.status
// (archived check) through this same admin client before ever consulting
// entitlement. Defaults to "not archived" (status: "draft") so every
// pre-existing test below keeps exercising only the entitlement logic it
// was written for; the dedicated archived-tenant tests below override it.
const mockTenantStatusSingle = vi.fn().mockResolvedValue({ data: { status: "draft" } });
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    marker: "admin-client-stub",
    from: (table: string) => {
      if (table !== "tenants") throw new Error(`unexpected table in test: ${table}`);
      return { select: () => ({ eq: () => ({ maybeSingle: mockTenantStatusSingle }) }) };
    },
  }),
}));

vi.mock("./getSpaceEntitlement", () => ({
  getSpaceEntitlement: vi.fn(),
}));

import { getSpaceEntitlement } from "./getSpaceEntitlement";
import { isSpacePubliclyAvailable } from "./isSpacePubliclyAvailable";
import type { SpaceEntitlementRow } from "./types";

const mockedGetSpaceEntitlement = vi.mocked(getSpaceEntitlement);

function makeEntitlement(overrides: Partial<SpaceEntitlementRow> = {}): SpaceEntitlementRow {
  return {
    tenant_id: "00000000-0000-0000-0000-000000000001",
    access_type: "complimentary",
    starts_at: "2026-01-01T00:00:00.000Z",
    access_ends_at: "2099-01-01T00:00:00.000Z",
    stripe_customer_id: null,
    stripe_subscription_id: null,
    cancel_at_period_end: false,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("isSpacePubliclyAvailable", () => {
  it("is available for a valid complimentary entitlement", async () => {
    mockedGetSpaceEntitlement.mockResolvedValueOnce(
      makeEntitlement({ access_type: "complimentary", access_ends_at: "2099-01-01T00:00:00.000Z" })
    );
    expect(await isSpacePubliclyAvailable("t1")).toBe(true);
  });

  it("is available for a valid active entitlement", async () => {
    mockedGetSpaceEntitlement.mockResolvedValueOnce(
      makeEntitlement({ access_type: "active", access_ends_at: "2099-01-01T00:00:00.000Z" })
    );
    expect(await isSpacePubliclyAvailable("t1")).toBe(true);
  });

  it("is available during grace", async () => {
    const past = new Date(Date.now() - 100 * 60 * 60 * 1000).toISOString(); // 100h ago
    mockedGetSpaceEntitlement.mockResolvedValueOnce(makeEntitlement({ access_ends_at: past }));
    expect(await isSpacePubliclyAvailable("t1")).toBe(true);
  });

  it("is unavailable once past the 168-hour grace boundary", async () => {
    const past = new Date(Date.now() - 200 * 60 * 60 * 1000).toISOString(); // 200h ago
    mockedGetSpaceEntitlement.mockResolvedValueOnce(makeEntitlement({ access_ends_at: past }));
    expect(await isSpacePubliclyAvailable("t1")).toBe(false);
  });

  it("is unavailable when there is no entitlement row", async () => {
    mockedGetSpaceEntitlement.mockResolvedValueOnce(null);
    expect(await isSpacePubliclyAvailable("t1")).toBe(false);
  });

  it("fails closed when the entitlement read throws", async () => {
    mockedGetSpaceEntitlement.mockRejectedValueOnce(new Error("network error"));
    expect(await isSpacePubliclyAvailable("t1")).toBe(false);
  });

  it("passes the admin client (not the caller's own client) to getSpaceEntitlement", async () => {
    mockedGetSpaceEntitlement.mockResolvedValueOnce(makeEntitlement());
    await isSpacePubliclyAvailable("t1");
    expect(mockedGetSpaceEntitlement).toHaveBeenCalledWith(
      expect.objectContaining({ marker: "admin-client-stub" }),
      "t1"
    );
  });

  describe("Task 011: archived tenants", () => {
    it("is never publicly available once its tenant is archived, even with an otherwise-valid entitlement", async () => {
      mockTenantStatusSingle.mockResolvedValueOnce({ data: { status: "archived" } });
      mockedGetSpaceEntitlement.mockResolvedValueOnce(
        makeEntitlement({ access_type: "complimentary", access_ends_at: "2099-01-01T00:00:00.000Z" })
      );
      expect(await isSpacePubliclyAvailable("t1")).toBe(false);
    });

    it("never even reads the entitlement once the tenant is known to be archived - archive status is checked first", async () => {
      const callsBefore = mockedGetSpaceEntitlement.mock.calls.length;
      mockTenantStatusSingle.mockResolvedValueOnce({ data: { status: "archived" } });
      await isSpacePubliclyAvailable("t1");
      expect(mockedGetSpaceEntitlement.mock.calls.length).toBe(callsBefore);
    });

    it("remains available for a non-archived tenant with valid entitlement (unchanged baseline)", async () => {
      mockTenantStatusSingle.mockResolvedValueOnce({ data: { status: "live" } });
      mockedGetSpaceEntitlement.mockResolvedValueOnce(
        makeEntitlement({ access_type: "active", access_ends_at: "2099-01-01T00:00:00.000Z" })
      );
      expect(await isSpacePubliclyAvailable("t1")).toBe(true);
    });
  });
});
