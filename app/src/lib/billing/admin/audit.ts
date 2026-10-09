import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { redactForAudit } from "./redact";

export type AuditEntry = {
  adminUserId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  requestId?: string | null;
};

/**
 * Append one row to the append-only audit log (UPDATE/DELETE are blocked by a
 * trigger for every role). Before/after are redacted for anything secret-shaped
 * before they are stored - once written, a row can never be removed.
 *
 * Audited mutations write their audit row in the SAME request; if the audit write
 * fails the caller must treat the whole action as failed (an unaudited Admin
 * mutation must not be reported as done).
 */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  const db = createAdminClient();
  const { error } = await db.from("admin_audit_log").insert({
    admin_user_id: entry.adminUserId,
    action: entry.action,
    target_type: entry.targetType,
    target_id: entry.targetId ?? null,
    before_state: entry.before === undefined ? null : redactForAudit(entry.before),
    after_state: entry.after === undefined ? null : redactForAudit(entry.after),
    reason: entry.reason ? entry.reason.slice(0, 500) : null,
    request_id: entry.requestId ?? null,
  });
  if (error) throw new Error(`audit write failed: ${error.message}`);
}
