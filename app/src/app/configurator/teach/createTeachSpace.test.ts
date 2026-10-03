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
      insert: (payload: unknown) => {
        state.ops.push({ table, op: "insert", payload });
        return { select: () => ({ single: async () => state.insertResult }) };
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
    const tenantInsert = state.ops.find((o) => o.table === "tenants")!;
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
    expect(await run()).toBe("REDIRECT:/configurator/teach/new-tenant");
  });
});
