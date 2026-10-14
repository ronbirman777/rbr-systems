import { requireAdminPage } from "@/lib/billing/admin/auth";
import { sectionRoles } from "@/lib/admin/sections";
import { adminMetaTitle, getAdminI18n } from "../../_lib/i18n";
import { SectionPlaceholder } from "../../_components/SectionPlaceholder";

export const dynamic = "force-dynamic";
export const generateMetadata = () => adminMetaTitle("secAlerts");

/** Owner-only section; no data source is connected in Batch 1 (explicit empty state, never zeros). */
export default async function AlertsPage() {
  await requireAdminPage({ roles: sectionRoles("alerts") });
  const c = await getAdminI18n();
  return <SectionPlaceholder c={c} titleKey="secAlerts" bodyKey="phAlertsBody" needsKey="phAlertsNeeds" />;
}
