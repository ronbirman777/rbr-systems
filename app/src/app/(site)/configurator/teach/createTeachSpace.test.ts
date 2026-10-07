import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * TASK 027.5 Phase 2B audit, encoded as tests: createTeachSpace uses the same
 * ownership / membership / slot model as Retreat creation - the member's own
 * RLS-scoped client, a plain tenants insert, and nothing that could bypass
 * the DB-level invariants (on_tenant_created owner membership,
 * created_by-from-RLS, enforce_space_slot_capacity trigger).
 */

const state = vi.hoisted(() => ({
  user: { id: "u1" } as { id: string } | null,
  insertResult: { data: { id: "new-tenant" }, error: null } as { data: { id: string } | null; error: { hint?: string } | null },
  ops: [] as { table: string; op: string; payload?: unknown }[],
  adminUsed: 0,
  /** Tenants this user already has; the dedupe lookup reads it and every insert appends to it. */
  existing: [] as { id: string; name: string; product_type: string; created_by: string; created_at: string }[],
  nextId: 1,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
vi.mock("sharp", () => ({ default: () => ({}) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    state.adminUsed++;
    throw new Error("createTeachSpace must not use the admin client");
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => ({
      select: () => {
        state.ops.push({ table, op: "select" });
        const filters: Record<string, unknown> = {};
        let since = "";
        const q = {
          eq: (col: string, v: unknown) => ((filters[col] = v), q),
          gte: (_c: string, v: string) => ((since = v), q),
          order: () => q,
          limit: () => q,
          maybeSingle: async () => ({
            data: state.existing.find((t) => Object.entries(filters).every(([k, v]) => (t as Record<string, unknown>)[k] === v) && t.created_at >= since) ?? null,
            error: null,
          }),
        };
        return q;
      },
      insert: (payload: unknown) => {
        state.ops.push({ table, op: "insert", payload });
        return {
          select: () => ({
            single: async () => {
              if (state.insertResult.data && table === "tenants") {
                const id = state.insertResult.data.id === "new-tenant" ? `new-tenant-${state.nextId++}` : state.insertResult.data.id;
                const p = payload as { name: string; product_type: string };
                state.existing.push({ id, name: p.name, product_type: p.product_type, created_by: "u1", created_at: new Date().toISOString() });
                return { data: { id }, error: null };
              }
              return state.insertResult;
            },
          }),
        };
      },
      upsert: async (payload: unknown) => {
        state.ops.push({ table, op: "upsert", payload });
        return { error: null };
      },
      update: () => {
        state.ops.push({ table, op: "update" });
        return { eq: async () => ({ error: null }) };
      },
      delete: () => {
        state.ops.push({ table, op: "delete" });
        return { eq: async () => ({ error: null }) };
      },
    }),
  }),
}));

import { createTeachSpace } from "./actions";

async function run(): Promise<string> {
  try {
    await createTeachSpace();
  } catch (e) {
    return (e as Error).message;
  }
  return "NO_REDIRECT";
}

beforeEach(() => {
  state.user = { id: "u1" };
  state.insertResult = { data: { id: "new-tenant" }, error: null };
  state.ops = [];
  state.adminUsed = 0;
  state.existing = [];
  state.nextId = 1;
});

describe("createTeachSpace - shared-invariant audit (TASK 027.5 Phase 2B)", () => {
  it("inserts exactly one tenants row with only name, product_type and timezone", async () => {
    await run();
    const inserts = state.ops.filter((o) => o.op === "insert");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].table).toBe("tenants");
    expect(Object.keys(inserts[0].payload as object).sort()).toEqual(["name", "product_type", "timezone"]);
    expect((inserts[0].payload as { product_type: string }).product_type).toBe("teach");
  });

  it("never sets created_by / owner: ownership comes from RLS + the on_tenant_created trigger", async () => {
    await run();
    const tenantInsert = state.ops.find((o) => o.table === "tenants" && o.op === "insert")!;
    expect(JSON.stringify(tenantInsert.payload)).not.toMatch(/created_by|owner|user_id/);
  });

  it("makes no tenant_members, user_space_slots, profiles or space_entitlements writes (slot/membership/entitlement stay DB-enforced)", async () => {
    await run();
    const forbidden = ["tenant_members", "user_space_slots", "profiles", "space_entitlements", "published_spaces"];
    expect(state.ops.filter((o) => forbidden.includes(o.table))).toEqual([]);
    expect(state.adminUsed).toBe(0);
  });

  it("only seeds Teach's own draft tables after a successful tenant insert", async () => {
    await run();
    const tables = state.ops.filter((o) => o.op === "upsert").map((o) => o.table).sort();
    expect(tables).toEqual(["brand_configs", "module_configs", "module_settings"]);
  });

  it("slot exhaustion (SLOT_LIMIT_REACHED from the DB trigger) redirects to /create?error=slots and seeds nothing", async () => {
    state.insertResult = { data: null, error: { hint: "SLOT_LIMIT_REACHED" } };
    expect(await run()).toBe("REDIRECT:/create?error=slots");
    expect(state.ops.filter((o) => o.op === "upsert")).toEqual([]);
  });

  it("any other insert failure (e.g. the hosted CHECK before 0028) redirects to /create?error=create and seeds nothing", async () => {
    state.insertResult = { data: null, error: { hint: "something-else" } };
    expect(await run()).toBe("REDIRECT:/create?error=create");
    expect(state.ops.filter((o) => o.op === "upsert")).toEqual([]);
  });

  it("signed-out callers are redirected to log-in before any write", async () => {
    state.user = null;
    expect(await run()).toBe("REDIRECT:/log-in");
    expect(state.ops).toEqual([]);
  });

  it("success redirects into the new Space's Teach Studio", async () => {
    expect(await run()).toBe("REDIRECT:/configurator/teach/new-tenant-1");
  });
});

/**
 * TASK 027.5 QA correction (Issue 1): Production showed a double-created Space because the
 * button never went pending and the action was not idempotent.
 */
describe("createTeachSpace - idempotency and navigation (TASK 027.5 QA correction)", () => {
  const inserts = () => state.ops.filter((o) => o.table === "tenants" && o.op === "insert");

  it("a second submit right after the first opens the SAME Space and inserts nothing", async () => {
    const first = await run();
    const second = await run();
    expect(first).toBe("REDIRECT:/configurator/teach/new-tenant-1");
    expect(second).toBe(first);
    expect(inserts()).toHaveLength(1);
  });

  it("five rapid submits (double-click + retries) still create exactly one Space and all navigate to it", async () => {
    const results: string[] = [];
    for (let i = 0; i < 5; i++) results.push(await run());
    expect(new Set(results)).toEqual(new Set(["REDIRECT:/configurator/teach/new-tenant-1"]));
    expect(inserts()).toHaveLength(1);
  });

  it("the duplicate path does not re-seed (it must not overwrite what the teacher already changed)", async () => {
    await run();
    const upsertsAfterFirst = state.ops.filter((o) => o.op === "upsert").length;
    await run();
    expect(state.ops.filter((o) => o.op === "upsert")).toHaveLength(upsertsAfterFirst);
  });

  it("an old untouched Space (outside the dedupe window) does not block a new one", async () => {
    state.existing.push({ id: "old", name: "Untitled", product_type: "teach", created_by: "u1", created_at: new Date(Date.now() - 10 * 60_000).toISOString() });
    // The registry's untitled name is what the dedupe matches on; align the fixture with it.
    const { SPACE_TYPES } = await import("@/lib/spaceTypes/registry");
    state.existing[0].name = SPACE_TYPES.teach.copy.untitledName;
    expect(await run()).toBe("REDIRECT:/configurator/teach/new-tenant-1");
    expect(inserts()).toHaveLength(1);
  });

  it("a recently created Space the teacher already renamed does not swallow a deliberate new one", async () => {
    state.existing.push({ id: "renamed", name: "Maya Yoga", product_type: "teach", created_by: "u1", created_at: new Date().toISOString() });
    expect(await run()).toBe("REDIRECT:/configurator/teach/new-tenant-1");
    expect(inserts()).toHaveLength(1);
  });

  it("another user's or another product's recent Space is never reused", async () => {
    const { SPACE_TYPES } = await import("@/lib/spaceTypes/registry");
    const name = SPACE_TYPES.teach.copy.untitledName;
    state.existing.push({ id: "theirs", name, product_type: "teach", created_by: "someone-else", created_at: new Date().toISOString() });
    state.existing.push({ id: "flow", name, product_type: "retreat", created_by: "u1", created_at: new Date().toISOString() });
    expect(await run()).toBe("REDIRECT:/configurator/teach/new-tenant-1");
    expect(inserts()).toHaveLength(1);
  });

  it("success never ends without a redirect into /configurator/teach/<tenantId>", async () => {
    expect(await run()).toMatch(/^REDIRECT:\/configurator\/teach\/[^/]+$/);
  });

  it("a failed create surfaces an error redirect (never a silent success) and a retry can then succeed", async () => {
    state.insertResult = { data: null, error: { hint: "other" } };
    expect(await run()).toBe("REDIRECT:/create?error=create");
    expect(inserts()).toHaveLength(1);
    state.insertResult = { data: { id: "new-tenant" }, error: null };
    expect(await run()).toBe("REDIRECT:/configurator/teach/new-tenant-1");
  });

  it("entitlement is irrelevant to navigation: the action reads and writes no entitlement rows", async () => {
    await run();
    expect(state.ops.some((o) => o.table === "space_entitlements")).toBe(false);
  });
});
