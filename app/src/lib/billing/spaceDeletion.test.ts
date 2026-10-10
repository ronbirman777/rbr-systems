import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DELETABLE_SUBSCRIPTION_STATUSES, decideSpaceDeletion, isStudioWritableForWrite, loadSpaceDeletionGate } from "./spaceDeletion";

describe("decideSpaceDeletion (app twin of guard_tenant_delete_with_subscription)", () => {
  it("no billing row: owner session, as before", () => expect(decideSpaceDeletion(null)).toEqual({ allowed: true, mediaVia: "owner" }));
  it("exempt: owner session", () => expect(decideSpaceDeletion("exempt")).toEqual({ allowed: true, mediaVia: "owner" }));
  it.each(["canceled", "incomplete_expired"])("%s: allowed, media via service client", (s) =>
    expect(decideSpaceDeletion(s)).toEqual({ allowed: true, mediaVia: "service" }));
  it.each(["active", "trialing", "past_due", "unpaid", "incomplete", "paused", "something_new"])("%s: refused", (s) =>
    expect(decideSpaceDeletion(s)).toEqual({ allowed: false, reason: "active_subscription" }));

  it("the deletable list equals the 0038 trigger's exclusion list", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/0038_billing_provisioning_lifecycle.sql"), "utf8");
    const body = sql.slice(sql.indexOf("create function public.guard_tenant_delete_with_subscription"));
    const m = body.match(/s\.status not in \(([^)]*)\)/);
    expect(m).toBeTruthy();
    const list = m![1].split(",").map((x) => x.trim().replace(/'/g, ""));
    expect([...list].sort()).toEqual([...DELETABLE_SUBSCRIPTION_STATUSES].sort());
  });
});

function fakeSelect(result: { data: unknown; error: unknown }) {
  return { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => result }) }) }) } as never;
}
function fakeRpc(result: { data: unknown; error: unknown }) {
  return { rpc: async () => result } as never;
}

describe("loadSpaceDeletionGate", () => {
  it("fails closed on a read error", async () =>
    expect(await loadSpaceDeletionGate(fakeSelect({ data: null, error: { code: "XX000" } }), "t")).toEqual({ allowed: false, reason: "billing_unreadable" }));
  it("a database without 0036 (missing relation) is legacy", async () =>
    expect(await loadSpaceDeletionGate(fakeSelect({ data: null, error: { code: "PGRST205" } }), "t")).toEqual({ allowed: true, mediaVia: "owner" }));
  it("reads the status", async () =>
    expect(await loadSpaceDeletionGate(fakeSelect({ data: { status: "active" }, error: null }), "t")).toEqual({ allowed: false, reason: "active_subscription" }));
});

describe("isStudioWritableForWrite (space_studio_writable for SECURITY DEFINER write RPCs)", () => {
  it("true only when the database says true", async () => {
    expect(await isStudioWritableForWrite(fakeRpc({ data: true, error: null }), "t")).toBe(true);
    expect(await isStudioWritableForWrite(fakeRpc({ data: false, error: null }), "t")).toBe(false);
    expect(await isStudioWritableForWrite(fakeRpc({ data: null, error: null }), "t")).toBe(false);
  });
  it("fails closed on an ordinary error", async () =>
    expect(await isStudioWritableForWrite(fakeRpc({ data: null, error: { code: "XX000", message: "boom" } }), "t")).toBe(false));
  it("a database without 0038 (function missing) is legacy: writable", async () =>
    expect(await isStudioWritableForWrite(fakeRpc({ data: null, error: { code: "PGRST202", message: "Could not find the function" } }), "t")).toBe(true));
});
