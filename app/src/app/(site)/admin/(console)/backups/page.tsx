import { requireAdminPage } from "@/lib/billing/admin/auth";
import { sectionRoles } from "@/lib/admin/sections";
import { getWatchdogStatus } from "@/lib/admin/watchdog/status";
import { WATCHDOG_THRESHOLDS } from "@/lib/admin/watchdog/summary";
import { adminMetaTitle, getAdminI18n } from "../../_lib/i18n";
import { Card, PageHeader } from "../../_components/ui";
import { cardCls } from "../../_components/styles";
import { BackupFreshness, WatchdogHealthBadge, WatchdogMeta } from "../../_components/WatchdogView";

export const dynamic = "force-dynamic";
export const generateMetadata = () => adminMetaTitle("secBackups");

/**
 * Owner-only. Batch 1 shows the watchdog adapter's state, which is NOT CONNECTED (default source; no KV/API access,
 * no credentials). Read-only: there is no control here that dispatches, cancels or alters a backup (ADM-11).
 */
export default async function BackupsPage() {
  await requireAdminPage({ roles: sectionRoles("backups") });
  const c = await getAdminI18n();
  const { t } = c;
  const s = await getWatchdogStatus();
  return (
    <>
      <PageHeader title={t("secBackups")}>{t("bkIntro")}</PageHeader>
      <div className={`${cardCls} mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between`} aria-label={t("bkStatusStrip")} role="region">
        <span className="inline-flex flex-wrap items-center gap-2 text-sm"><span className="font-semibold">{t("bkWatchdog")}</span><WatchdogHealthBadge s={s} c={c} /></span>
        <span className="inline-flex flex-wrap items-center gap-2 text-sm"><span className="font-semibold">{t("ovcBackup")}</span><BackupFreshness s={s} c={c} /></span>
        <span className="text-xs text-idw-forest/75"><WatchdogMeta s={s} c={c} /></span>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t("bkHowAlertsWork")}>
          <p className="text-sm">{t("bkNotConnectedBody")}</p>
          <p className="mt-2 text-xs text-idw-forest/70">{t("bkThresholds", { warn: WATCHDOG_THRESHOLDS.backupWarningHours, crit: WATCHDOG_THRESHOLDS.backupCriticalHours, stale: WATCHDOG_THRESHOLDS.summaryMaxAgeMinutes })}</p>
        </Card>
        <Card title={t("bkEvidence")}>
          <p data-metric-state="not_measured" className="text-sm">{t("bkEvidenceBody")}</p>
        </Card>
      </div>
    </>
  );
}
