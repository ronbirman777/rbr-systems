import { beforeEach, describe, expect, it, vi } from "vitest";

/** The Space detail page shows the owner's email ONLY after the view was audited; otherwise it is hidden (fail closed). */

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, getAll: () => [] }), headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); }, redirect: (to: string) => { throw new Error(`NEXT_REDIRECT:${to}`); } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/billing/admin/auth", () => ({ requireAdminPage: async () => ({ userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", email: "me@example.test", role: "owner" }) }));

const calls: string[] = [];
let auditOk = true;
const OWNER_EMAIL = "space-owner-adm1@example.test";
vi.mock("@/lib/admin/audit/views", () => ({ auditSensitiveView: async () => { calls.push("audit"); return auditOk ? { ok: true, written: true } : { ok: false }; } }));
vi.mock("@/lib/billing/admin/queries", () => ({ lookupEmails: async (_db: unknown, ids: string[]) => { calls.push("lookupEmails"); return new Map(ids.map((i) => [i, OWNER_EMAIL])); } }));
vi.mock("@/lib/admin/queries/spaces", () => ({
  getSpaceDetail: async (_db: unknown, id: string) => (id === "cccccccc-cccc-4ccc-8ccc-cccccccccccc" ? null : {
    id, name: "adm1 Space", productType: "retreat", status: "live", slug: null, timezone: "UTC", createdAt: "2026-10-01T00:00:00Z",
    contentUpdatedAt: "2026-10-02T00:00:00Z", archivedAt: null, publishedAt: "2026-10-01T00:00:00Z", publishedSlug: null, editsPending: true,
    subscription: { state: "none" },
    members: { owner: { state: "ok", value: 1, asOf: "2026-10-14T00:00:00Z", quality: "actual", unit: "count" }, practitioner: { state: "error", source: "x" }, client: { state: "ok", value: 0, asOf: "2026-10-14T00:00:00Z", quality: "actual", unit: "count" } },
    contentItems: { state: "ok", value: 3, asOf: "2026-10-14T00:00:00Z", quality: "actual", unit: "count" },
    ownerUserIds: ["dddddddd-dddd-4ddd-8ddd-dddddddddddd"], ownerIdsTruncated: false,
  }),
}));

import Page from "./page";

/** Serialises a React element tree (not rendered) so its literal strings can be searched. */
const text = (el: unknown) => {
  const seen = new WeakSet<object>();
  return JSON.stringify(el, (k, v) => {
    if (typeof v === "function" || k.startsWith("_")) return undefined;
    if (v && typeof v === "object") { if (seen.has(v)) return undefined; seen.add(v); }
    return v;
  });
};
const ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

beforeEach(() => { calls.length = 0; auditOk = true; });

describe("Space detail: audited owner email", () => {
  it("audit OK -> the email is shown, and it was resolved only AFTER the audit row", async () => {
    const out = text(await Page({ params: Promise.resolve({ id: ID }) }));
    expect(out).toContain(OWNER_EMAIL);
    expect(calls).toEqual(["audit", "lookupEmails"]);
  });
  it("audit fails -> the email is never resolved or shown", async () => {
    auditOk = false;
    const out = text(await Page({ params: Promise.resolve({ id: ID }) }));
    expect(out).not.toContain(OWNER_EMAIL);
    expect(calls).toEqual(["audit"]);
  });
  it("an invalid or unknown id is a 404, before any audit or email lookup", async () => {
    await expect(Page({ params: Promise.resolve({ id: "not-a-uuid" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(Page({ params: Promise.resolve({ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(calls).toEqual([]);
  });
});
