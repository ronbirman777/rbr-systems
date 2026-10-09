import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  ops: [] as { table: string; op: string; payload?: unknown }[],
  flow: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: () => undefined }));
vi.mock("sharp", () => ({ default: () => ({}) }));
vi.mock("@/lib/teach/flowLinkServer", () => ({ checkFlowGuestUrl: state.flow }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: (table: string) => ({
      select: () => {
        const q = {
          eq: () => q,
          in: () => q,
          maybeSingle: async () => ({ data: { id: T, product_type: "teach", name: "Lena", timezone: "Asia/Bangkok" }, error: null }),
          single: async () => ({ data: { id: T, product_type: "teach", name: "Lena", timezone: "Asia/Bangkok" }, error: null }),
        };
        return q;
      },
      upsert: async (payload: unknown) => (state.ops.push({ table, op: "upsert", payload }), { error: null }),
      delete: () => (state.ops.push({ table, op: "delete" }), { eq: () => ({ in: async () => ({ error: null }) }) }),
    }),
    storage: { from: () => ({ remove: async () => ({ data: [], error: null }) }) },
  }),
}));

import { saveTeachItems } from "./actions";

const T = "11111111-1111-4111-8111-111111111111";
const R1 = "22222222-2222-4222-8222-222222222222";
const R2 = "33333333-3333-4333-8333-333333333333";

const retreat = (over: Record<string, unknown> = {}, metadata: Record<string, unknown> = {}) => ({
  id: R1,
  title: "Autumn Breathwork Retreat",
  subtitle: null,
  description: "Seven days of breath and rest.",
  externalLink: null,
  metadata: { enabled: true, ...metadata },
  ...over,
});
const save = (items: unknown[]) => saveTeachItems(T, "teachRetreats", items);
const upserts = () => state.ops.filter((o) => o.op === "upsert" && o.table === "module_items");

beforeEach(() => {
  state.ops = [];
  state.flow.mockReset();
});

describe("saveTeachItems: My Retreats", () => {
  it("saves a minimal retreat (name + short description only) with the order as sort_order", async () => {
    const res = await save([retreat(), retreat({ id: R2, title: "Spring" })]);
    expect(res.error).toBeNull();
    const rows = upserts()[0].payload as { id: string; module_key: string; sort_order: number; metadata: Record<string, unknown> }[];
    expect(rows.map((r) => [r.id, r.module_key, r.sort_order])).toEqual([[R1, "teachRetreats", 0], [R2, "teachRetreats", 1]]);
    expect(rows[0].metadata).toMatchObject({ enabled: true, startDate: null, price: null });
  });

  it("never writes image_ref (owned by the upload/remove actions)", async () => {
    await save([retreat()]);
    const row = (upserts()[0].payload as Record<string, unknown>[])[0];
    expect("image_ref" in row).toBe(false);
  });

  it("requires a short description", async () => {
    const res = await save([retreat({ description: "  " })]);
    expect(res.error).toMatch(/short description.*Autumn Breathwork Retreat/);
    expect(upserts()).toHaveLength(0);
  });

  it("requires a name", async () => {
    expect((await save([retreat({ title: "" })])).error).toBeTruthy();
  });

  it("tells the teacher about a wrong date instead of silently dropping it", async () => {
    expect((await save([retreat({}, { startDate: "2027-02-31" })])).error).toMatch(/date that isn’t valid/);
    expect((await save([retreat({}, { startDate: "2027-10-14", endDate: "not a date" })])).error).toMatch(/date that isn’t valid/);
  });

  it("enforces end >= start and start-before-end-only", async () => {
    expect((await save([retreat({}, { startDate: "2027-10-20", endDate: "2027-10-14" })])).error).toMatch(/before its start date/);
    expect((await save([retreat({}, { endDate: "2027-10-14" })])).error).toMatch(/end date but no start date/);
    expect((await save([retreat({}, { startDate: "2027-10-14", endDate: "2027-10-20" })])).error).toBeNull();
  });

  it("price must be an amount and needs a currency code", async () => {
    expect((await save([retreat({}, { price: "lots", currency: "THB" })])).error).toMatch(/valid amount/);
    expect((await save([retreat({}, { price: 700 })])).error).toMatch(/Add a currency/);
    expect((await save([retreat({}, { price: 700, currency: "baht" })])).error).toMatch(/three-letter code/);
    expect((await save([retreat({}, { price: 700, currency: "thb" })])).error).toBeNull();
    expect((upserts().at(-1)!.payload as { metadata: { currency: string } }[])[0].metadata.currency).toBe("THB");
  });

  it("an unfinished registration method is refused; None is fine", async () => {
    expect((await save([retreat({}, { registration: { method: "website", value: "" } })])).error).toMatch(/registration details/);
    expect((await save([retreat({}, { registration: { method: null } })])).error).toBeNull();
  });

  it("errors speak the Space language", async () => {
    const res = await saveTeachItems(T, "teachRetreats", [retreat({ description: "" })], "de");
    expect(res.error).toMatch(/Kurzbeschreibung/);
  });
});

describe("saveTeachItems: a linked InnerDweS Flow retreat must be public", () => {
  const link = { flowGuestUrl: "https://innerdwes.com/s/return-to-balance" };

  it("stores OUR canonical address, not whatever was pasted", async () => {
    state.flow.mockResolvedValue({ ok: true, canonicalUrl: "https://innerdwes.com/s/return-to-balance", name: "Return to Balance" });
    const res = await save([retreat({}, { flowGuestUrl: "innerdwes.com/s/Return-To-Balance/" })]);
    expect(res.error).toBeNull();
    expect((upserts()[0].payload as { metadata: { flowGuestUrl: string } }[])[0].metadata.flowGuestUrl).toBe("https://innerdwes.com/s/return-to-balance");
    expect(state.flow).toHaveBeenCalledWith("innerdwes.com/s/Return-To-Balance/");
  });

  it.each([
    ["invalid", /isn’t a Guest App address/],
    ["notFound", /isn’t published/],
    ["notFlow", /must point to a retreat Guest App/],
    ["notPublic", /isn’t publicly accessible/],
  ])("refuses a %s link and writes nothing", async (reason, message) => {
    state.flow.mockResolvedValue({ ok: false, reason });
    const res = await save([retreat({}, link)]);
    expect(res.error).toMatch(message);
    expect(upserts()).toHaveLength(0);
  });

  it("a DISABLED retreat is not held to it (a hidden draft may point at something not live yet)", async () => {
    state.flow.mockResolvedValue({ ok: false, reason: "notFound" });
    const res = await save([retreat({}, { ...link, enabled: false })]);
    expect(res.error).toBeNull();
    expect(state.flow).not.toHaveBeenCalled();
  });

  it("no link, no lookup", async () => {
    await save([retreat()]);
    expect(state.flow).not.toHaveBeenCalled();
  });
});
