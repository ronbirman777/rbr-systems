import Link from "next/link";
import { requireAdminPage } from "@/lib/billing/admin/auth";
import { loadOverview } from "@/lib/billing/admin/queries";
import type { Locale } from "@/lib/i18n/locales";
import { metricCaption, type MetricName } from "@/lib/billing/admin/ui/metricCaptions";
import { formatUtc, money } from "@/lib/billing/admin/ui/labels";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminMetaTitle, getAdminI18n } from "../_lib/i18n";
import { Badge, PageHeader, Stat } from "../_components/ui";
import { linkCls } from "../_components/styles";

export const dynamic = "force-dynamic";
export const generateMetadata = () => adminMetaTitle("navOverview");

function MoneyList({ by, locale }: { by: Record<string, number>; locale: Locale }) {
  const entries = Object.entries(by);
  if (!entries.length) return <>-</>;
  return (
    <>
      {entries.map(([cur, minor]) => (
        <span key={cur} className="block">{money(minor, cur, locale)} <span className="text-sm font-normal text-idw-forest/70">{cur}</span></span>
      ))}
    </>
  );
}

export default async function OverviewPage() {
  await requireAdminPage();
  const c = await getAdminI18n();
  const { t, locale } = c;
  const o = await loadOverview(createAdminClient());
  const m = o.metrics;
  const cap = (n: MetricName) => metricCaption(n, c);
  return (
    <>
      <PageHeader title={t("ovTitle")}>
        {t("ovSnapshot", { time: formatUtc(o.generatedAt, c) })}
      </PageHeader>

      {o.metricsTruncated ? (
        <p role="alert" className="mb-6 max-w-3xl rounded-lg border border-amber-700/40 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("ovMetricsTruncated", { rows: new Intl.NumberFormat(locale).format(o.metricRowsRead) })}
        </p>
      ) : null}

      <h2 className="mb-2 font-ui text-lg text-idw-forest">{t("ovOperations")}</h2>
      <ul className="mb-8 flex flex-wrap gap-2" aria-label={t("ovOperationalAria")}>
        <li><Link href="/admin/billing/settings" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-idw-forest/20 bg-white/70 px-4 text-sm"><span>{t("ovPaidCheckout")}</span> <Badge tone={o.paidCheckoutEnabled ? "good" : "neutral"}>{o.paidCheckoutEnabled ? t("ovEnabled") : t("ovDisabled")}</Badge></Link></li>
        <li className="inline-flex min-h-11 items-center gap-2 rounded-full border border-idw-forest/20 bg-white/70 px-4 text-sm" title={cap("openCheckouts")}>{t("ovOpenCheckouts")} <Badge>{o.openCheckouts}</Badge></li>
        <li className="inline-flex min-h-11 items-center gap-2 rounded-full border border-idw-forest/20 bg-white/70 px-4 text-sm" title={cap("failedEvents")}>{t("ovFailedEvents")} <Badge tone={o.failedEvents ? "bad" : "neutral"}>{o.failedEvents}</Badge></li>
        <li className="inline-flex min-h-11 items-center gap-2 rounded-full border border-idw-forest/20 bg-white/70 px-4 text-sm" title={cap("stuckCheckouts")}>{t("ovStuckCheckouts")} <Badge tone={o.stuckCheckouts ? "warn" : "neutral"}>{o.stuckCheckouts}</Badge></li>
      </ul>
      <p className="-mt-6 mb-8 max-w-3xl text-xs text-idw-forest/70">
        {[
          t("ovCaptionLine", { label: t("ovOpenCheckouts"), caption: cap("openCheckouts") }),
          t("ovCaptionLine", { label: t("ovFailedEvents"), caption: cap("failedEvents") }),
          t("ovCaptionLine", { label: t("ovStuckCheckouts"), caption: cap("stuckCheckouts") }),
          t("ovCaptionLine", { label: t("ovPaidCheckout"), caption: cap("paidCheckoutFlag") }),
        ].join(" ")}
      </p>

      <h2 className="mb-2 font-ui text-lg text-idw-forest">{t("ovRevenue")}</h2>
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("ovPaidSubscriptions")} value={m.paidSubscriptions} caption={cap("paidSubscriptions")} />
        <Stat label={t("ovPaidSpaces")} value={m.paidSpaces} caption={cap("paidSpaces")} />
        <Stat label={t("ovMrrList")} value={<MoneyList by={m.mrr.listMinor} locale={locale} />} caption={cap("mrrList")} />
        <Stat label={t("ovMrrCurrent")} value={<MoneyList by={m.mrr.currentMinor} locale={locale} />} caption={cap("mrrCurrent")} />
        <Stat label={t("ovDiscounted")} value={m.discounted} caption={cap("discounted")} />
        <Stat label={t("ovScheduledCancellations")} value={m.scheduledCancellations} caption={cap("scheduledCancellations")} tone={m.scheduledCancellations ? "warn" : undefined} />
      </div>

      <h2 className="mb-2 font-ui text-lg text-idw-forest">{t("ovPaymentProblems")}</h2>
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("ovPaymentFailures")} value={m.paymentFailures} caption={cap("paymentFailures")} tone={m.paymentFailures ? "warn" : undefined} />
        <Stat label={t("ovGuestSuspended")} value={m.guestSuspended} caption={cap("guestSuspended")} tone={m.guestSuspended ? "bad" : undefined} />
        <Stat label={t("ovStudioSuspended")} value={m.studioSuspended} caption={cap("studioSuspended")} tone={m.studioSuspended ? "bad" : undefined} />
        <Stat label={t("ovDeletionEligible")} value={m.deletionEligible} caption={cap("deletionEligible")} tone={m.deletionEligible ? "bad" : undefined} />
      </div>

      <h2 className="mb-2 font-ui text-lg text-idw-forest">{t("ovExempt")}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("ovExemptSpaces")} value={m.exempt} caption={cap("exempt")} />
      </div>
      <p className="mt-6 text-sm"><Link className={linkCls} href="/admin/billing/subscriptions?status=exempt">{t("ovViewExempt")}</Link></p>
    </>
  );
}
