import { describe, expect, it, vi } from "vitest";

// "server-only" throws when its default export condition resolves (see
// node_modules/server-only/index.js) - that's the whole point of the
// package, enforced by Next's bundler for the browser build. Under plain
// Vitest/Node there's no bundler applying the "react-server" export
// condition, so importing it for real here would throw and break the
// test; stub it out exactly the way Next.js code itself becomes a no-op
// module server-side.
vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ marker: "admin-client-stub" }),
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
});
