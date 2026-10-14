import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getCouponDetail, getSubscriptionDetail, listInvoices, listSubscriptions } from "./queries";

/**
 * Billing lists never carry customer emails (owner 2026-10-14; ADMIN-METRIC-CONTRACTS.md §1.4). The owner email is
 * shown only on the audited, owner-only Space detail page. These loaders feed page props / the RSC payload, so if
 * they return no email, no email can reach the browser from these pages.
 */
const LEAK = "customer-leak@example.test";
const UID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SUB = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

/** A permissive fake: every query chain resolves to rows that DO reference a user, and auth.admin would return an email. */
function fakeDb() {
  const authCalls: string[] = [];
  const subRow = { id: SUB, tenant_id: "t1", billing_owner_user_id: UID, user_id: UID, status: "active", currency: "USD", base_amount_minor: 2500, current_effective_amount_minor: 2500, cancel_at_period_end: false, tenants: { name: "S", product_type: "retreat" }, coupon_id: "c1", coupon_redemption_id: null, space_subscription_id: SUB, coupons: { code: "X" } };
  const chain = (rows: unknown[]): unknown => {
    const p = Promise.resolve({ data: rows, error: null, count: rows.length });
    return new Proxy(() => {}, {
      get: (_t, k) => {
        if (k === "then") return p.then.bind(p);
        if (k === "maybeSingle" || k === "single") return () => Promise.resolve({ data: rows[0] ?? null, error: null });
        return () => chain(rows);
      },
      apply: () => chain(rows),
    });
  };
  const db = {
    from: () => chain([subRow]),
    auth: { admin: new Proxy({}, { get: (_t, k) => (...args: unknown[]) => { authCalls.push(String(k)); return Promise.resolve({ data: { user: { id: args[0], email: LEAK }, users: [{ id: UID, email: LEAK }] }, error: null }); } }) },
  };
  return { db: db as never, authCalls };
}

describe("billing loaders return no customer email", () => {
  it.each<[string, (db: never) => Promise<unknown>]>([
    ["listSubscriptions", (db) => listSubscriptions(db, {})],
    ["listInvoices", (db) => listInvoices(db, {})],
    ["getCouponDetail", (db) => getCouponDetail(db, "c1")],
    ["getSubscriptionDetail", (db) => getSubscriptionDetail(db, SUB)],
  ])("%s: no email in the result and no Auth user lookup at all", async (_n, load) => {
    const { db, authCalls } = fakeDb();
    const out = JSON.stringify(await load(db));
    expect(out).not.toContain(LEAK);
    expect(out).not.toMatch(/"(ownerEmail|userEmail)"/);
    expect(authCalls).toEqual([]);
  });
});

describe("billing pages do not render customer emails (source)", () => {
  const root = join(process.cwd(), "src/app/(site)/admin/billing");
  const files = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? files(p) : p.endsWith(".tsx") ? [p] : []; });
  it("no billing page references ownerEmail / userEmail / lookupEmails", () => {
    const hits = files(root).filter((f) => /ownerEmail|userEmail|lookupEmails/.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
  it("lookupEmails is used only for STAFF identities (audit log authors, admin list), never customer lists", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/billing/admin/queries.ts"), "utf8");
    const fns = [...src.matchAll(/export async function (\w+)[\s\S]*?(?=\nexport |\n$)/g)].filter((m) => m[0].includes("lookupEmails(")).map((m) => m[1]).filter((n) => n !== "lookupEmails");
    expect(fns.sort()).toEqual(["listAdmins", "listAudit"]);
  });
});
