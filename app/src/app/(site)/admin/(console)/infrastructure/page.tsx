import { requireAdminPage } from "@/lib/billing/admin/auth";
import { sectionRoles } from "@/lib/admin/sections";
import { adminMetaTitle, getAdminI18n } from "../../_lib/i18n";
import { SectionPlaceholder } from "../../_components/SectionPlaceholder";

export const dynamic = "force-dynamic";
export const generateMetadata = () => adminMetaTitle("secInfrastructure");

/** Owner-only section; no data source is connected in Batch 1 (explicit empty state, never zeros). */
export default async function InfrastructurePage() {
  await requireAdminPage({ roles: sectionRoles("infrastructure") });
  const c = await getAdminI18n();
  return <SectionPlaceholder c={c} titleKey="secInfrastructure" bodyKey="phInfraBody" needsKey="phInfraNeeds" />;
}
