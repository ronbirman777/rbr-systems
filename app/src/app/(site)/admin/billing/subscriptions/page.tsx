import Link from "next/link";
import { requireAdminPage } from "@/lib/billing/admin/auth";
import { listSubscriptions } from "@/lib/billing/admin/queries";
import { SUBSCRIPTION_STATUSES } from "@/lib/billing/types";
import { discountProgressText, formatUtc, money, nextActionLabel, spaceTypeLabel, statusLabel, statusTone } from "@/lib/billing/admin/ui/labels";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminMetaTitle, getAdminI18n } from "../../_lib/i18n";
import { Badge, EmptyRow, FilterLinks, PageHeader, RBody, RCell, RHead, RRow, RTable } from "../../_components/ui";
import { linkCls } from "../../_components/styles";

export const dynamic = "force-dynamic";
export const generateMetadata = () => adminMetaTitle("navSubscriptions");

export default async function SubscriptionsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdminPage();
  const c = await getAdminI18n();
  const { t, locale } = c;
  const sp = await searchParams;
  const status = (SUBSCRIPTION_STATUSES as readonly string[]).includes(sp.status ?? "") ? sp.status : undefined;
  const rows = await listSubscriptions(createAdminClient(), { status, includeExempt: status === "exempt", limit: 200 });
  return (
    <>
      <PageHeader title={t("navSubscriptions")}>{t("subIntro")}</PageHeader>
      <FilterLinks base="/admin/billing/subscriptions" param="status" current={status} label={t("filterAria")}
        options={[["", t("filterAllPaid")], ...SUBSCRIPTION_STATUSES.map((s): [string, string] => [s, statusLabel(s, c)])]} />
      {rows.length === 0 ? <EmptyRow>{t("subEmpty")}</EmptyRow> : (
        <RTable caption={t("navSubscriptions")}>
          <RHead cols={[t("colSpace"), t("colPlanPrice"), t("colStatus"), t("colDiscount"), t("colCurrentPeriod"), t("colNextAction"), t("colCancel"), t("colFailure")]} />
          <RBody>
            {rows.map((r) => {
              const s = r.subscription;
              const na = r.nextAction;
              const effective = s.currentEffectiveAmountMinor ?? s.baseAmountMinor;
              return (
                <RRow key={s.id}>
                  <RCell label={t("colSpace")}>
                    <Link className={linkCls} href={`/admin/billing/subscriptions/${s.id}`}>{r.spaceName || t("unnamed")}</Link>
                    <span className="block text-xs text-idw-forest/70">{spaceTypeLabel(r.spaceType, c)}</span>
                  </RCell>
                  <RCell label={t("colPlanPrice")}>
                    <span className="block">{t("subBase", { amount: money(s.baseAmountMinor, s.currency, locale, c) })}</span>
                    {effective !== s.baseAmountMinor ? <span className="block text-xs">{t("subNow", { amount: money(effective, s.currency, locale, c) })}</span> : null}
                    {s.stripeMode ? <span className="block text-xs text-idw-forest/70">{t("subModeSuffix", { mode: s.stripeMode })}</span> : null}
                  </RCell>
                  <RCell label={t("colStatus")}><Badge tone={statusTone(s.status)}>{statusLabel(s.status, c)}</Badge></RCell>
                  <RCell label={t("colDiscount")}>
                    {r.couponCode ? <><code className="font-mono text-xs">{r.couponCode}</code><span className="block text-xs">{discountProgressText(r.discount, na.discountProgress, c)}</span></> : "-"}
                  </RCell>
                  <RCell label={t("colCurrentPeriod")}>{s.currentPeriodEnd ? <>{formatUtc(s.currentPeriodStart, c)}<span className="block text-xs">{t("subTo", { time: formatUtc(s.currentPeriodEnd, c) })}</span></> : "-"}</RCell>
                  <RCell label={t("colNextAction")}>
                    {nextActionLabel(na.action, c)}
                    {na.at ? <span className="block text-xs">{formatUtc(na.at, c)}</span> : null}
                    {na.expectedChargeMinor != null ? <span className="block text-xs">{t("subCharge", { amount: money(na.expectedChargeMinor, na.currency, locale, c) })}</span> : null}
                  </RCell>
                  <RCell label={t("colCancel")}>{s.cancelAtPeriodEnd ? <Badge tone="warn">{t("subEnds", { time: formatUtc(s.cancelAt ?? s.currentPeriodEnd, c) })}</Badge> : s.canceledAt ? t("subCanceledAt", { time: formatUtc(s.canceledAt, c) }) : "-"}</RCell>
                  <RCell label={t("colFailure")}>{s.paymentFailedAt ? <Badge tone="bad">{t("subFailureSince", { kind: s.studioSuspendedAt ? t("failStudioSuspended") : s.guestSuspendedAt ? t("failGuestSuspended") : t("failPaymentFailed"), time: formatUtc(s.paymentFailedAt, c) })}</Badge> : "-"}</RCell>
                </RRow>
              );
            })}
          </RBody>
        </RTable>
      )}
    </>
  );
}
