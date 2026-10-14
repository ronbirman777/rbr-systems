import { requireAdminPage } from "@/lib/billing/admin/auth";
import { sectionRoles } from "@/lib/admin/sections";
import { adminMetaTitle, getAdminI18n } from "../../_lib/i18n";
import { SectionPlaceholder } from "../../_components/SectionPlaceholder";

export const dynamic = "force-dynamic";
export const generateMetadata = () => adminMetaTitle("secCosts");

/** Owner-only section; no data source is connected in Batch 1 (explicit empty state, never zeros). */
export default async function CostsPage() {
  await requireAdminPage({ roles: sectionRoles("costs") });
  const c = await getAdminI18n();
  return <SectionPlaceholder c={c} titleKey="secCosts" bodyKey="phCostsBody" needsKey="phCostsNeeds" />;
}
