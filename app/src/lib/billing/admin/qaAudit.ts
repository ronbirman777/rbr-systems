/**
 * Identification of TASK 032 QA / test entries in the append-only admin audit log.
 *
 * The audit log can never be edited or pruned (a trigger refuses UPDATE/DELETE/TRUNCATE for every role), so QA
 * residue stays forever. Instead of touching it, we make it unmistakable and keep it out of day-to-day views:
 *
 *   - NEW test entries carry an explicit marker: request_id starting "qa032" (and/or a `qa032.` action).
 *   - The ~28 entries written BEFORE markers existed are recognised by a documented rule: written before the
 *     console existed (QA_AUDIT_LEGACY_BOUNDARY) by an account that is not an Admin.
 *
 * Audit rows are not an input to any business or customer metric (metrics.ts reads subscriptions only; a test
 * asserts that). This classification only drives the Audit page's default filter and its "QA" badge.
 */
export const QA_AUDIT_LEGACY_BOUNDARY = new Date("2026-10-09T06:00:00.000Z");

export type AuditRowLike = {
  action: string;
  request_id?: string | null;
  admin_user_id?: string | null;
  created_at: string;
  before_state?: unknown;
  after_state?: unknown;
};

/** The reason a row is QA/test data, or null when it is a real Admin action. */
export function qaAuditReason(row: AuditRowLike, realAdminIds: ReadonlySet<string>): string | null {
  if (row.action.startsWith("qa032.")) return "QA harness action";
  if ((row.request_id ?? "").startsWith("qa032")) return "QA run marker";
  const payload = `${JSON.stringify(row.before_state ?? null)}${JSON.stringify(row.after_state ?? null)}`;
  if (/QA32I|qa032/i.test(payload)) return "QA fixture data";
  const isAdmin = !!row.admin_user_id && realAdminIds.has(row.admin_user_id);
  if (!isAdmin && new Date(row.created_at).getTime() <= QA_AUDIT_LEGACY_BOUNDARY.getTime()) return "written before the console existed, by a non-Admin account";
  return null;
}
