import type { AdminCtx, AdminKey } from "@/lib/billing/admin/ui/labels";
import { Card, PageHeader } from "./ui";

/**
 * A section whose data source is not connected yet. It says so explicitly ("No data source connected") and names
 * what will connect it - it never shows zeros or placeholder numbers.
 */
export function SectionPlaceholder({ c, titleKey, bodyKey, needsKey, children }: { c: AdminCtx; titleKey: AdminKey; bodyKey: AdminKey; needsKey: AdminKey; children?: React.ReactNode }) {
  const { t } = c;
  return (
    <>
      <PageHeader title={t(titleKey)}>{t(bodyKey)}</PageHeader>
      <Card>
        <p data-metric-state="no_source" className="font-ui text-lg text-idw-forest/80">{t("msNoSource")}</p>
        <p className="mt-2 max-w-3xl text-sm text-idw-forest/75">{t(needsKey)}</p>
        {children}
      </Card>
    </>
  );
}
