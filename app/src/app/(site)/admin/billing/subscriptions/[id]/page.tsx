import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/billing/admin/auth";
import { getSubscriptionDetail } from "@/lib/billing/admin/queries";
import {
  discountProgressText, eventStatusLabel, formatUtc, invoiceStatusLabel, isUuid, money, nextActionLabel, redemptionStatusLabel, safeHttpsUrl, spaceTypeLabel, statusLabel, statusTone,
} from "@/lib/billing/admin/ui/labels";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminMetaTitle, getAdminI18n } from "../../../_lib/i18n";
import { resyncSubscriptionAction } from "../../actions";
import { ConfirmActionButton } from "../../../_components/ConfirmActionButton";
import { ClearExemptForm } from "../../../_components/forms";
import { Badge, Card, Dl, EmptyRow, PageHeader } from "../../../_components/ui";
import { linkCls } from "../../../_components/styles";

export const dynamic = "force-dynamic";
export const generateMetadata = () => adminMetaTitle("metaSubscription");

export default async function SubscriptionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const c = await getAdminI18n();
  const { t, locale } = c;
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const d = await getSubscriptionDetail(createAdminClient(), id);
  if (!d) notFound();
  const s = d.subscription;
  const na = d.nextAction;
  const effective = s.currentEffectiveAmountMinor ?? s.baseAmountMinor;
  const stripeSubId = s.stripeSubscriptionId;

  return (
    <>
      <p className="mb-2 text-sm"><Link className={linkCls} href="/admin/billing/subscriptions">&larr; {t("sdBack")}</Link></p>
      <PageHeader
        title={d.spaceName || t("unnamedSpace")}
        actions={stripeSubId ? (
          <ConfirmActionButton
            label={t("sdResyncLabel")}
            title={t("sdResyncTitle")}
            message={t("sdResyncMessage")}
            confirmLabel={t("sdResyncConfirm")}
            action={resyncSubscriptionAction.bind(null, stripeSubId)}
            okMessage={t("sdResyncOk")}
          />
        ) : null}
      >
        {t("sdSubline", { type: spaceTypeLabel(d.spaceType, c), owner: d.ownerEmail ?? t("unknownOwner") })}<Badge tone={statusTone(s.status)}>{statusLabel(s.status, c)}</Badge>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t("sdPlanPrice")}>
          <Dl items={[
            [t("sdBasePrice"), money(s.baseAmountMinor, s.currency, locale)],
            [t("sdEffectivePrice"), money(effective, s.currency, locale)],
            [t("sdCurrentPeriod"), s.currentPeriodStart ? t("sdPeriodRange", { from: formatUtc(s.currentPeriodStart, c), to: formatUtc(s.currentPeriodEnd, c) }) : "-"],
            [t("sdCancelState"), s.cancelAtPeriodEnd ? t("sdCancelEnds", { time: formatUtc(s.cancelAt ?? s.currentPeriodEnd, c) }) : s.canceledAt ? t("sdCancelCanceled", { time: formatUtc(s.canceledAt, c) }) : t("sdNotCanceling")],
            [t("sdEndedAt"), formatUtc(s.endedAt, c)],
          ]} />
        </Card>

        <Card title={t("sdDiscount")}>
          {d.redemption ? (
            <Dl items={[
              [t("sdCoupon"), <code key="c" className="font-mono">{d.redemption.couponCode ?? "-"}</code>],
              [t("sdStatus"), redemptionStatusLabel(d.redemption.status, c)],
              [t("sdProgress"), discountProgressText({ cyclesCompleted: d.redemption.cyclesCompleted, cyclesTotal: d.redemption.cyclesTotal, status: d.redemption.status }, na.discountProgress, c)],
              [t("sdDiscountEnds"), d.redemption.discountEndsAt ? formatUtc(d.redemption.discountEndsAt, c) : d.redemption.cyclesTotal == null ? t("sdNeverForever") : "-"],
            ]} />
          ) : <p className="text-sm text-idw-forest/70">{t("sdNoCoupon")}</p>}
        </Card>

        <Card title={t("sdNext")}>
          <Dl items={[
            [t("sdNextAction"), nextActionLabel(na.action, c)],
            [t("sdWhen"), formatUtc(na.at, c)],
            [t("sdExpectedCharge"), na.expectedChargeMinor != null ? money(na.expectedChargeMinor, na.currency, locale) : "-"],
          ]} />
        </Card>

        <Card title={t("sdLifecycle")}>
          <Dl items={[
            [t("sdPaymentFailedAt"), formatUtc(s.paymentFailedAt, c)],
            [t("sdGuestSuspendedAt"), formatUtc(s.guestSuspendedAt, c)],
            [t("sdStudioSuspendedAt"), formatUtc(s.studioSuspendedAt, c)],
            [t("sdDeletionWarningAt"), formatUtc(s.deletionWarningAt, c)],
            [t("sdEligibleAt"), formatUtc(s.eligibleForDeletionAt, c)],
            [t("sdRecoveredAt"), formatUtc(s.recoveredAt, c)],
          ]} />
        </Card>

        <Card title={t("sdStripeRefs")}>
          <Dl items={[
            [t("sdMode"), s.stripeMode ?? "-"],
            [t("sdSubscriptionId"), stripeSubId ? <code key="s" className="font-mono text-xs">{stripeSubId}</code> : "-"],
            [t("sdPriceId"), d.stripePriceId ? <code key="p" className="font-mono text-xs">{d.stripePriceId}</code> : "-"],
          ]} />
        </Card>

        {s.status === "exempt" ? (
          <Card title={t("sdExemption")}>
            <Dl items={[[t("sdReason"), s.exemptReason ?? "-"], [t("sdExpires"), s.exemptExpiresAt ? formatUtc(s.exemptExpiresAt, c) : t("sdNoExpiry")]]} />
            <p className="my-3 text-sm text-idw-forest/80">{t("sdExemptNote")}</p>
            <ClearExemptForm tenantId={s.tenantId} />
          </Card>
        ) : null}
      </div>

      <Card title={t("sdInvoices")} className="mt-4">
        {d.invoices.length === 0 ? <EmptyRow>{t("sdNoInvoices")}</EmptyRow> : (
          <ul className="divide-y divide-idw-forest/10 text-sm">
            {d.invoices.map((i) => {
              const hosted = safeHttpsUrl(i.hosted_invoice_url);
              return (
                <li key={i.id as string} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <code className="font-mono text-xs">{i.stripe_invoice_id as string}</code>
                    <span className="block text-xs text-idw-forest/70">{i.invoice_number ? t("sdInvoiceNumber", { number: i.invoice_number as string }) : ""}{formatUtc(i.issued_at as string | null, c)} - {invoiceStatusLabel(i as { status: string; amount_refunded_minor?: number; currency?: string }, c)}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span>{money(i.total_minor as number | null, i.currency as string, locale)}</span>
                    {hosted ? <a className={linkCls} href={hosted} target="_blank" rel="noopener noreferrer">{t("docHosted")}</a> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-sm"><Link className={linkCls} href={`/admin/billing/payments?subscription=${s.id}`}>{t("sdOpenPayments")}</Link></p>
      </Card>

      <Card title={t("sdEvents")} className="mt-4">
        {d.events.length === 0 ? <EmptyRow>{t("sdNoEvents")}</EmptyRow> : (
          <ul className="divide-y divide-idw-forest/10 text-sm">
            {d.events.map((e) => (
              <li key={e.stripe_event_id as string} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><code className="font-mono text-xs">{e.event_type as string}</code><span className="block text-xs text-idw-forest/70">{formatUtc(e.received_at as string, c)}{e.error_code ? ` - ${e.error_code}` : ""}</span></span>
                <Badge tone={e.status === "processed" ? "good" : e.status === "failed" ? "bad" : "neutral"}>{eventStatusLabel(String(e.status), c)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
