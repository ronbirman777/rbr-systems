import { beforeEach, describe, expect, it, vi } from "vitest";

/** TASK 027.5 Phase 2B: Publish dispatch - Retreat unchanged, everything else fails closed. */

const state = vi.hoisted(() => ({
  user: { id: "u1" } as { id: string } | null,
  tenant: { product_type: "retreat" } as { product_type: unknown } | null,
  publishSpace: vi.fn(),
  tenantQueries: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      if (table !== "tenants") throw new Error(`publish dispatch may only read tenants, not ${table}`);
      return {
        select: (cols: string) => ({
          eq: (_c: string, id: string) => ({
            maybeSingle: async () => {
              state.tenantQueries.push(`${cols}@${id}`);
              return { data: state.tenant };
            },
          }),
        }),
      };
    },
  }),
}));
vi.mock("@/app/configurator/retreat/actions", () => ({ publishSpace: state.publishSpace }));
// If dispatch ever imported Teach's publish path, this would be hit.
vi.mock("@/app/configurator/teach/actions", () => ({
  publishTeachSpace: () => {
    throw new Error("Teach publish must not be reachable from My Spaces in Phase 2B");
  },
}));

import { publishSpaceByType } from "./publishActions";

const PREV = { error: null, publishedAt: null };
const form = (tenantId?: string) => {
  const fd = new FormData();
  if (tenantId !== undefined) fd.set("tenantId", tenantId);
  return fd;
};

beforeEach(() => {
  state.user = { id: "u1" };
  state.tenant = { product_type: "retreat" };
  state.tenantQueries = [];
  state.publishSpace.mockReset();
  state.publishSpace.mockResolvedValue({ error: null, publishedAt: "2026-01-01T00:00:00Z" });
});

describe("publishSpaceByType", () => {
  it("Retreat: delegates to main's publishSpace with the original arguments, returning its result untouched", async () => {
    const fd = form("t1");
    const result = await publishSpaceByType(PREV, fd);
    expect(state.publishSpace).toHaveBeenCalledTimes(1);
    expect(state.publishSpace).toHaveBeenCalledWith(PREV, fd);
    expect(result).toEqual({ error: null, publishedAt: "2026-01-01T00:00:00Z" });
  });

  it("Retreat: a publishSpace error is passed through unchanged", async () => {
    state.publishSpace.mockResolvedValue({ error: "Access expired", publishedAt: null });
    expect(await publishSpaceByType(PREV, form("t1"))).toEqual({ error: "Access expired", publishedAt: null });
  });

  it("reads product_type from the DB for the form's tenant, never from the form", async () => {
    const fd = form("t1");
    fd.set("product_type", "retreat");
    state.tenant = { product_type: "teach" };
    const result = await publishSpaceByType(PREV, fd);
    expect(state.tenantQueries).toEqual(["product_type@t1"]);
    expect(result.error).toBeTruthy();
    expect(state.publishSpace).not.toHaveBeenCalled();
  });

  it.each([["teach"], ["client_hub"], ["mystery"], [""], [null]])("fails closed for product_type %j: error returned, nothing published", async (type) => {
    state.tenant = { product_type: type };
    const result = await publishSpaceByType(PREV, form("t1"));
    expect(result.error).toBeTruthy();
    expect(result.publishedAt).toBeNull();
    expect(state.publishSpace).not.toHaveBeenCalled();
  });

  it("Teach: the message says publishing is not available yet", async () => {
    state.tenant = { product_type: "teach" };
    const result = await publishSpaceByType(PREV, form("t1"));
    expect(result.error).toMatch(/isn't available yet/);
  });

  it("fails closed when the tenant is not visible (RLS) or missing", async () => {
    state.tenant = null;
    const result = await publishSpaceByType(PREV, form("t1"));
    expect(result).toEqual({ error: "Space not found.", publishedAt: null });
    expect(state.publishSpace).not.toHaveBeenCalled();
  });

  it("requires a signed-in user before reading anything", async () => {
    state.user = null;
    const result = await publishSpaceByType(PREV, form("t1"));
    expect(result.error).toBe("You need to be logged in.");
    expect(state.tenantQueries).toEqual([]);
    expect(state.publishSpace).not.toHaveBeenCalled();
  });

  it("requires a tenantId", async () => {
    const result = await publishSpaceByType(PREV, form());
    expect(result.error).toBe("Missing space.");
    expect(state.publishSpace).not.toHaveBeenCalled();
  });
});
