import { requireAdminPage } from "@/lib/billing/admin/auth";
import { sectionRoles } from "@/lib/admin/sections";
import { loadConsoleOverview } from "@/lib/admin/queries/overview";
import { metricCaption } from "@/lib/billing/admin/ui/metricCaptions";
import { formatUtc } from "@/lib/billing/admin/ui/labels";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminMetaTitle, getAdminI18n } from "../../_lib/i18n";
import { Badge, PageHeader } from "../../_components/ui";
import { cardCls } from "../../_components/styles";
import { MetricMeta, MetricTile, MetricValue, MoneyLines, reasonText, SectionHeading, TileGrid } from "../../_components/MetricView";
import { BackupFreshness, WatchdogHealthBadge, WatchdogMeta } from "../../_components/WatchdogView";
import { spaceTypeName } from "../../_lib/spaceTypes";

export const dynamic = "force-dynamic";
export const generateMetadata = () => adminMetaTitle("secOverview");

export default async function ConsoleOverviewPage() {
  await requireAdminPage({ roles: sectionRoles("overview") });
  const c = await getAdminI18n();
  const { t } = c;
  const o = await loadConsoleOverview(createAdminClient());
  const mrr = "state" in o.mrr ? null : o.mrr;
  const currencyMissing = o.mrrCurrencyMissing.state === "ok" && o.mrrCurrencyMissing.value > 0 ? o.mrrCurrencyMissing.value : 0;

  return (
    <>
      <PageHeader title={t("ovcTitle")}>{t("ovcIntro")}</PageHeader>

      <SectionHeading>{t("ovcAlerts")}</SectionHeading>
      <TileGrid>
        <MetricTile label={t("ovcAlertsApp")} m={o.alertsApp} c={c} href="/admin/alerts" />
        <div className={`${cardCls} flex flex-col`} data-metric-label={t("ovcAlertsWatchdog")}>
          <div className="text-xs font-semibold uppercase tracking-wide text-idw-forest/70">{t("ovcAlertsWatchdog")}</div>
          <div className="mt-1 text-2xl font-semibold text-idw-forest">
            {o.watchdog.state === "ok" || o.watchdog.state === "stale"
              ? <span className="tabular-nums">{o.watchdog.summary.open.length}</span>
              : <WatchdogHealthBadge s={o.watchdog} c={c} />}
          </div>
          <div className="mt-2 text-xs leading-snug text-idw-forest/70"><WatchdogMeta s={o.watchdog} c={c} /></div>
        </div>
        <div className={`${cardCls} flex flex-col`} data-metric-label={t("ovcBackup")}>
          <div className="text-xs font-semibold uppercase tracking-wide text-idw-forest/70">{t("ovcBackup")}</div>
          <div className="mt-1 text-2xl font-semibold"><BackupFreshness s={o.watchdog} c={c} /></div>
          <div className="mt-2 text-xs leading-snug text-idw-forest/70"><WatchdogMeta s={o.watchdog} c={c} /></div>
          <p className="mt-1 text-xs text-idw-forest/70">{t("ovcBackupThresholds")}</p>
        </div>
      </TileGrid>

      <SectionHeading>{t("ovcBusiness")}</SectionHeading>
      <TileGrid>
        <MetricTile label={t("ovPaidSubscriptions")} m={o.paidSpaces} c={c} caption={metricCaption("paidSubscriptions", c)} href="/admin/billing" />
        <div className={`${cardCls} flex flex-col`} data-metric-label={t("ovcMrr")}>
          <div className="text-xs font-semibold uppercase tracking-wide text-idw-forest/70">{t("ovcMrr")}</div>
          <div className="mt-1 text-2xl font-semibold text-idw-forest">
            {mrr ? <MoneyLines by={mrr.current} c={c} /> : <MetricValue m={o.mrr as Exclude<typeof o.mrr, { current: unknown }>} c={c} />}
          </div>
          <div className="mt-2 text-xs leading-snug text-idw-forest/70">
            {mrr ? <span>{metricCaption("mrrCurrent", c)}</span> : <MetricMeta m={o.mrr as Exclude<typeof o.mrr, { current: unknown }>} c={c} />}
          </div>
          {currencyMissing ? <p role="alert" className="mt-2 rounded-lg border border-amber-700/40 bg-amber-50 px-2 py-1 text-xs text-amber-900">{t("ovcMrrCurrencyMissing", { count: currencyMissing })}</p> : null}
        </div>
        <MetricTile label={t("ovcNetNew")} m={o.netNewPaidMonth} c={c} />
        <MetricTile label={t("ovPaymentFailures")} m={o.paymentFailures} c={c} caption={metricCaption("paymentFailures", c)} />
      </TileGrid>

      <SectionHeading>{t("ovcSpaces")}</SectionHeading>
      <TileGrid>
        <MetricTile label={t("spcTotal")} m={o.spacesTotal} c={c} href="/admin/spaces" />
        {o.spacesByType.map(({ type, metric }) => (
          <MetricTile key={type} label={spaceTypeName(type, c)} m={metric} c={c} />
        ))}
        <MetricTile label={t("spcPublishedMonth")} m={o.publishedThisMonth} c={c} />
      </TileGrid>

      <SectionHeading>{t("ovcUsageCost")}</SectionHeading>
      <TileGrid>
        <MetricTile label={t("ovcAudioNear")} m={o.audioNearLimit} c={c} href="/admin/usage" />
        <MetricTile label={t("ovcCostMtd")} m={o.costMtd} c={c} href="/admin/costs" />
      </TileGrid>

      <SectionHeading>{t("ovcFreshness")}</SectionHeading>
      <ul className={`${cardCls} divide-y divide-idw-forest/10 text-sm`} aria-label={t("ovcFreshness")}>
        <li className="flex flex-wrap justify-between gap-2 py-2"><span>{t("ovcSrcCore")}</span><span className="text-idw-forest/75">{t("ovcSrcLive", { time: formatUtc(o.asOf, c) })}</span></li>
        <li className="flex flex-wrap justify-between gap-2 py-2"><span>{t("ovcSrcBilling")}</span><span className="text-idw-forest/75">{o.billingAvailable.state === "ok" ? t("ovcSrcLive", { time: formatUtc(o.asOf, c) }) : <MetricMeta m={o.billingAvailable} c={c} />}</span></li>
        <li className="flex flex-wrap justify-between gap-2 py-2"><span>{t("ovcSrcWatchdog")}</span><span className="inline-flex flex-wrap items-center gap-2 text-idw-forest/75"><WatchdogHealthBadge s={o.watchdog} c={c} /><WatchdogMeta s={o.watchdog} c={c} /></span></li>
        <li className="flex flex-wrap justify-between gap-2 py-2"><span>{t("ovcSrcSnapshots")}</span><span className="inline-flex items-center gap-2 text-idw-forest/75"><Badge>{t("msNotMeasured")}</Badge>{reasonText("snapshots_missing", c)}</span></li>
      </ul>
    </>
  );
}
