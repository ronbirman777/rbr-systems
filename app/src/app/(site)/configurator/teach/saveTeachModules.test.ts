import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ ops: [] as { table: string; op: string; payload?: unknown }[] }));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: () => undefined }));
vi.mock("sharp", () => ({ default: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: (table: string) => ({
      select: () => {
        const q = { eq: () => q, maybeSingle: async () => ({ data: { id: T, product_type: "teach", name: "x" }, error: null }), single: async () => ({ data: { id: T, product_type: "teach", name: "x" }, error: null }) };
        return q;
      },
      upsert: async (payload: unknown) => {
        state.ops.push({ table, op: "upsert", payload });
        return { error: null };
      },
      insert: async (payload: unknown) => (state.ops.push({ table, op: "insert", payload }), { error: null }),
      update: () => (state.ops.push({ table, op: "update" }), { eq: async () => ({ error: null }) }),
      delete: () => (state.ops.push({ table, op: "delete" }), { eq: async () => ({ error: null }) }),
    }),
  }),
}));

import { saveTeachModules } from "./actions";

const T = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  state.ops = [];
});

describe("saveTeachModules: hiding a module never deletes its content", () => {
  it("turning a module off only flips module_configs.enabled; items and settings are never written or deleted", async () => {
    const res = await saveTeachModules(T, ["teachAudio"]);
    expect(res.error).toBeFalsy();
    const writes = state.ops.filter((o) => o.op !== "select");
    expect(writes.map((o) => `${o.table}:${o.op}`)).toEqual(["module_configs:upsert"]);
    const rows = writes[0].payload as { module_key: string; enabled: boolean }[];
    expect(Object.fromEntries(rows.map((r) => [r.module_key, r.enabled]))).toEqual({ teachReadings: false, teachAudio: true, teachContact: false, customPages: false, teachRetreats: false });
  });

  it("re-enabling is the same single flag write, so the earlier content is simply visible again", async () => {
    await saveTeachModules(T, []);
    await saveTeachModules(T, ["teachReadings", "teachAudio", "teachContact", "customPages", "teachRetreats"]);
    const writes = state.ops.filter((o) => o.op !== "select");
    expect(writes.every((o) => o.table === "module_configs" && o.op === "upsert")).toBe(true);
    expect((writes[1].payload as { enabled: boolean }[]).every((r) => r.enabled)).toBe(true);
  });
});
