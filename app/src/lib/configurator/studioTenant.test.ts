import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: { id: "u1" } as { id: string } | null,
  tenant: null as Record<string, unknown> | null,
  queries: 0,
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            state.queries += 1;
            return { data: state.tenant };
          },
        }),
      }),
    }),
  }),
}));

import { loadStudioTenant } from "./studioTenant";

const ID = "11111111-2222-3333-4444-555555555555";

beforeEach(() => {
  state.user = { id: "u1" };
  state.tenant = null;
  state.queries = 0;
});

describe("loadStudioTenant", () => {
  it("returns the tenant for an accessible retreat Space", async () => {
    state.tenant = { id: ID, name: "x", timezone: "UTC", slug: null, product_type: "retreat" };
    const r = await loadStudioTenant(ID);
    expect(r.tenant.id).toBe(ID);
  });

  it.each(["not-a-uuid", "123", "", "00000000-0000-0000-0000-00000000000"])(
    "malformed id %j is a 404 without touching the database",
    async (id) => {
      await expect(loadStudioTenant(id)).rejects.toThrow("NEXT_NOT_FOUND");
      expect(state.queries).toBe(0);
    }
  );

  it("is a 404 when the tenant does not exist or RLS hides it", async () => {
    state.tenant = null;
    await expect(loadStudioTenant(ID)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("is a 404 for an unsupported product type", async () => {
    state.tenant = { id: ID, name: "x", timezone: "UTC", slug: null, product_type: "client_hub" };
    await expect(loadStudioTenant(ID)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("redirects a signed-out visitor to log-in even if a tenant row came back", async () => {
    state.user = null;
    state.tenant = { id: ID, name: "x", timezone: "UTC", slug: null, product_type: "retreat" };
    await expect(loadStudioTenant(ID)).rejects.toThrow("NEXT_REDIRECT:/log-in");
  });
});
