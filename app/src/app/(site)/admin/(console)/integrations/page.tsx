import Link from "next/link";
import { requireAdminPage } from "@/lib/billing/admin/auth";
import { sectionRoles } from "@/lib/admin/sections";
import { adminMetaTitle, getAdminI18n } from "../../_lib/i18n";
import { SectionPlaceholder } from "../../_components/SectionPlaceholder";
import { linkCls } from "../../_components/styles";

export const dynamic = "force-dynamic";
export const generateMetadata = () => adminMetaTitle("secIntegrations");

/** Owner-only. Integration status (metadata only, never secrets) needs ADM-M5; admin users stay in Billing settings. */
export default async function IntegrationsPage() {
  await requireAdminPage({ roles: sectionRoles("integrations") });
  const c = await getAdminI18n();
  return (
    <SectionPlaceholder c={c} titleKey="secIntegrations" bodyKey="phIntegrationsBody" needsKey="phIntegrationsNeeds">
      <p className="mt-3 text-sm"><Link className={linkCls} href="/admin/billing/settings">{c.t("phIntegrationsAdmins")}</Link></p>
    </SectionPlaceholder>
  );
}
