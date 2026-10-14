import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const inserts: Record<string, unknown>[] = [];
let insertError: { message: string } | null = null;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: () => ({ insert: async (row: Record<string, unknown>) => { inserts.push(row); return { error: insertError }; } }) }),
}));

import { VIEW_AUDIT_WINDOW_MS, auditSensitiveView } from "./views";

const admin = { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", email: "owner@example.test", role: "owner" as const };
const NOW = new Date("2026-10-14T12:00:00Z");
const view = { action: "view.space_detail" as const, targetType: "tenant", targetId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", fields: ["owner_email"] };

/** Fake for the dedupe count read; records the filters it was given. */
function db(result: { count: number | null; error: { message: string } | null } | "throw") {
  const filters: [string, string, unknown][] = [];
  const q = {
    select: () => q,
    eq: (c: string, v: unknown) => { filters.push(["eq", c, v]); return q; },
    gte: (c: string, v: unknown) => { filters.push(["gte", c, v]); return q; },
    limit: async (n: number) => { filters.push(["limit", "", n]); if (result === "throw") throw new Error("down"); return result; },
  };
  return { client: { from: (t: string) => { filters.push(["from", t, null]); return q; } } as never, filters };
}

beforeEach(() => { inserts.length = 0; insertError = null; });

describe("sensitive-view audit (view.* rows)", () => {
  it("writes one row naming the fields shown - never their values - through the redacting writer", async () => {
    const d = db({ count: 0, error: null });
    await expect(auditSensitiveView(d.client, admin, view, NOW)).resolves.toEqual({ ok: true, written: true });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({ admin_user_id: admin.userId, action: "view.space_detail", target_type: "tenant", target_id: view.targetId, after_state: { fields: ["owner_email"] } });
    expect(JSON.stringify(inserts[0])).not.toContain("@");
  });
  it("de-duplicates: one row per admin, action and target per 10 minutes", async () => {
    const d = db({ count: 1, error: null });
    await expect(auditSensitiveView(d.client, admin, view, NOW)).resolves.toEqual({ ok: true, written: false });
    expect(inserts).toHaveLength(0);
    expect(d.filters).toEqual(expect.arrayContaining([
      ["from", "admin_audit_log", null], ["eq", "admin_user_id", admin.userId], ["eq", "action", "view.space_detail"],
      ["eq", "target_id", view.targetId], ["gte", "created_at", new Date(NOW.getTime() - VIEW_AUDIT_WINDOW_MS).toISOString()], ["limit", "", 0],
    ]));
  });
  it.each<[string, Parameters<typeof db>[0]]>([
    ["the dedupe read errors", { count: null, error: { message: "x" } }],
    ["the dedupe read returns no count", { count: null, error: null }],
    ["the dedupe read throws", "throw"],
  ])("fails closed when %s (the caller must not show the PII)", async (_n, r) => {
    await expect(auditSensitiveView(db(r).client, admin, view, NOW)).resolves.toEqual({ ok: false });
    expect(inserts).toHaveLength(0);
  });
  it("fails closed when the audit write fails", async () => {
    insertError = { message: "append failed" };
    await expect(auditSensitiveView(db({ count: 0, error: null }).client, admin, view, NOW)).resolves.toEqual({ ok: false });
  });
});
