import type { AdminCtx } from "@/lib/billing/admin/ui/labels";

/**
 * Console label for tenants.product_type: retreat = Time to Flow, teach = Time to Teach, client_hub = the legacy
 * Time to Heal type (shown as legacy), anything else = "Other (<value>)" - never dropped (contracts §3.2).
 */
export function spaceTypeName(type: string, c: AdminCtx): string {
  switch (type) {
    case "retreat": return c.t("spcTypeRetreat");
    case "teach": return c.t("spcTypeTeach");
    case "client_hub": return c.t("spcTypeClientHub");
    case "other": return c.t("spcTypeOtherAll");
    default: return c.t("spcTypeOther", { type });
  }
}

const STATUS = ["draft", "ready_to_publish", "live", "archived"] as const;
/** tenants.status label; an unknown raw value is shown as-is. */
export function spaceStatusName(status: string, c: AdminCtx): string {
  return (STATUS as readonly string[]).includes(status) ? c.t(`spcStatus_${status as (typeof STATUS)[number]}`) : status;
}
