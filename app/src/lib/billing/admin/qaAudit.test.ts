import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { QA_AUDIT_LEGACY_BOUNDARY, qaAuditReason } from "./qaAudit";

const REAL = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const row = (o: Partial<Parameters<typeof qaAuditReason>[0]> = {}) => ({ action: "coupon.update", request_id: null, admin_user_id: REAL, created_at: "2026-11-20T10:00:00Z", before_state: null, after_state: null, ...o });

describe("TASK 032 QA audit entries are identifiable (the log itself is append-only and cannot be pruned)", () => {
  const admins = new Set([REAL]);
  it("a real Admin action after launch is NOT flagged", () => {
    expect(qaAuditReason(row({ after_state: { code: "LAUNCH10", percent_off: 10 } }), admins)).toBeNull();
    expect(qaAuditReason(row({ action: "settings.paid_checkout" }), admins)).toBeNull();
  });
  it("explicit markers flag a row: qa032.* action, qa032 request id, QA fixture codes in the payload", () => {
    expect(qaAuditReason(row({ action: "qa032.test" }), admins)).toBe("QA harness action");
    expect(qaAuditReason(row({ request_id: "qa032int-ab12cd" }), admins)).toBe("QA run marker");
    expect(qaAuditReason(row({ after_state: { code: "QA32IAB12CDL10" } }), admins)).toBe("QA fixture data");
  });
  it("legacy unmarked rows: written before the console existed by a non-Admin account", () => {
    const early = new Date(QA_AUDIT_LEGACY_BOUNDARY.getTime() - 60_000).toISOString();
    expect(qaAuditReason(row({ admin_user_id: "11111111-1111-4111-8111-111111111111", created_at: early }), admins)).toMatch(/before the console existed/);
    expect(qaAuditReason(row({ admin_user_id: null, created_at: early }), admins)).toMatch(/before the console existed/);
  });
  it("...but a REAL Admin's early action, or any non-Admin action after the boundary, is not swallowed by the legacy rule", () => {
    const early = new Date(QA_AUDIT_LEGACY_BOUNDARY.getTime() - 60_000).toISOString();
    expect(qaAuditReason(row({ admin_user_id: REAL, created_at: early }), admins)).toBeNull();
    const late = new Date(QA_AUDIT_LEGACY_BOUNDARY.getTime() + 60_000).toISOString();
    expect(qaAuditReason(row({ admin_user_id: "11111111-1111-4111-8111-111111111111", created_at: late }), admins)).toBeNull();
  });
  it("the legacy boundary covers exactly the pre-marker QA window observed on Staging (2026-10-09 04:41-05:22 UTC)", () => {
    expect(QA_AUDIT_LEGACY_BOUNDARY.toISOString()).toBe("2026-10-09T06:00:00.000Z");
    expect(new Date("2026-10-09T05:22:29Z").getTime()).toBeLessThan(QA_AUDIT_LEGACY_BOUNDARY.getTime());
  });
  it("audit rows are NOT an input to any business/customer metric", () => {
    const metrics = readFileSync(path.resolve(__dirname, "metrics.ts"), "utf8");
    expect(metrics).not.toMatch(/admin_audit_log|\baudit\b/);
    const overview = readFileSync(path.resolve(__dirname, "queries.ts"), "utf8");
    const loadOverview = overview.slice(overview.indexOf("export async function loadOverview"), overview.indexOf("export type SubscriptionListRow"));
    expect(loadOverview).not.toContain("admin_audit_log");
  });
});
