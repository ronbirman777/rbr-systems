import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminContext } from "@/lib/billing/admin/auth";
import { writeAudit } from "@/lib/billing/admin/audit";

/**
 * Sensitive VIEWS are audited (spec §9; batches doc "Security requirements"): opening a page that shows a Space
 * owner's email writes a `view.*` row to the append-only admin_audit_log, through the existing writer (redacted).
 *
 * Volume rule (batches doc proposal): at most one row per admin, per action, per target, per 10 minutes.
 *
 * Fail closed: if the dedupe read or the audit write fails, the caller must NOT render the personal data
 * (an unaudited view of customer PII must not happen).
 */
export const ADMIN_VIEW_ACTIONS = ["view.space_detail"] as const;
export type AdminViewAction = (typeof ADMIN_VIEW_ACTIONS)[number];
export const VIEW_AUDIT_WINDOW_MS = 10 * 60_000;

export type ViewAuditResult = { ok: true; written: boolean } | { ok: false };

export async function auditSensitiveView(
  db: SupabaseClient,
  admin: AdminContext,
  view: { action: AdminViewAction; targetType: string; targetId: string; fields: string[] },
  now: Date = new Date(),
): Promise<ViewAuditResult> {
  try {
    const since = new Date(now.getTime() - VIEW_AUDIT_WINDOW_MS).toISOString();
    const { count, error } = await db.from("admin_audit_log").select("id", { count: "exact" })
      .eq("admin_user_id", admin.userId).eq("action", view.action).eq("target_type", view.targetType).eq("target_id", view.targetId)
      .gte("created_at", since).limit(0);
    if (error || typeof count !== "number") return { ok: false };
    if (count > 0) return { ok: true, written: false };
    await writeAudit({
      adminUserId: admin.userId, requestId: admin.requestId ?? null, action: view.action,
      targetType: view.targetType, targetId: view.targetId,
      // What was shown (field names only), never the values themselves.
      after: { fields: view.fields },
    });
    return { ok: true, written: true };
  } catch {
    return { ok: false };
  }
}
