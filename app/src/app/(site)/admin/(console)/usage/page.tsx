import { requireAdminPage } from "@/lib/billing/admin/auth";
import { sectionRoles } from "@/lib/admin/sections";
import { adminMetaTitle, getAdminI18n } from "../../_lib/i18n";
import { SectionPlaceholder } from "../../_components/SectionPlaceholder";

export const dynamic = "force-dynamic";
export const generateMetadata = () => adminMetaTitle("secUsage");

/** Owner-only section; no data source is connected in Batch 1 (explicit empty state, never zeros). */
export default async function UsagePage() {
  await requireAdminPage({ roles: sectionRoles("usage") });
  const c = await getAdminI18n();
  return <SectionPlaceholder c={c} titleKey="secUsage" bodyKey="phUsageBody" needsKey="phUsageNeeds" />;
}
