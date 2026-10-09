import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/billing/admin/auth";
import { getSubscriptionDetail } from "@/lib/billing/admin/queries";
import {
  discountProgressText, formatUtc, invoiceStatusLabel, isUuid, money, nextActionLabel, redemptionStatusLabel, safeHttpsUrl, spaceTypeLabel, statusLabel, statusTone,
} from "@/lib/billing/admin/ui/labels";
import { createAdminClient } from "@/lib/supabase/admin";
import { resyncSubscriptionAction } from "../../actions";
import { ConfirmActionButton } from "../../../_components/ConfirmActionButton";
import { ClearExemptForm } from "../../../_components/forms";
import { Badge, Card, Dl, EmptyRow, PageHeader } from "../../../_components/ui";
import { linkCls } from "../../../_components/styles";

export const dynamic = "force-dynamic";
export const metadata = { title: "Subscription - InnerDweS Admin" };

export default async function SubscriptionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
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
      <p className="mb-2 text-sm"><Link className={linkCls} href="/admin/billing/subscriptions">&larr; All subscriptions</Link></p>
      <PageHeader
        title={d.spaceName || "(unnamed Space)"}
        actions={stripeSubId ? (
          <ConfirmActionButton
            label="Resync from Stripe"
            title="Resync this subscription from Stripe?"
            message="InnerDweS will re-read this subscription and its invoices from Stripe and update its own records to match. Nothing is charged or changed in Stripe."
            confirmLabel="Resync"
            action={resyncSubscriptionAction.bind(null, stripeSubId)}
            okMessage="Resynced from Stripe."
          />
        ) : null}
      >
        {spaceTypeLabel(d.spaceType)} Space - owner {d.ownerEmail ?? "unknown"} - <Badge tone={statusTone(s.status)}>{statusLabel(s.status)}</Badge>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Plan and price">
          <Dl items={[
            ["Base price", money(s.baseAmountMinor, s.currency)],
            ["Current effective price", money(effective, s.currency)],
            ["Current period", s.currentPeriodStart ? `${formatUtc(s.currentPeriodStart)} to ${formatUtc(s.currentPeriodEnd)}` : "-"],
            ["Cancel state", s.cancelAtPeriodEnd ? `Ends ${formatUtc(s.cancelAt ?? s.currentPeriodEnd)}` : s.canceledAt ? `Canceled ${formatUtc(s.canceledAt)}` : "Not canceling"],
            ["Ended at", formatUtc(s.endedAt)],
          ]} />
        </Card>

        <Card title="Discount">
          {d.redemption ? (
            <Dl items={[
              ["Coupon", <code key="c" className="font-mono">{d.redemption.couponCode ?? "-"}</code>],
              ["Status", redemptionStatusLabel(d.redemption.status)],
              ["Progress", discountProgressText({ cyclesCompleted: d.redemption.cyclesCompleted, cyclesTotal: d.redemption.cyclesTotal, status: d.redemption.status }, na.discountProgress)],
              ["Discount ends", d.redemption.discountEndsAt ? formatUtc(d.redemption.discountEndsAt) : d.redemption.cyclesTotal == null ? "Never (forever)" : "-"],
            ]} />
          ) : <p className="text-sm text-idw-forest/70">No coupon on this subscription.</p>}
        </Card>

        <Card title="What happens next">
          <Dl items={[
            ["Next action", nextActionLabel(na.action)],
            ["When", formatUtc(na.at)],
            ["Expected charge (before tax)", na.expectedChargeMinor != null ? money(na.expectedChargeMinor, na.currency) : "-"],
          ]} />
        </Card>

        <Card title="Lifecycle timestamps">
          <Dl items={[
            ["Payment failed at", formatUtc(s.paymentFailedAt)],
            ["Guest App suspended at", formatUtc(s.guestSuspendedAt)],
            ["Studio suspended at", formatUtc(s.studioSuspendedAt)],
            ["Deletion warning at", formatUtc(s.deletionWarningAt)],
            ["Deletion-eligible at", formatUtc(s.eligibleForDeletionAt)],
            ["Recovered at", formatUtc(s.recoveredAt)],
          ]} />
        </Card>

        <Card title="Stripe references">
          <Dl items={[
            ["Mode", s.stripeMode ?? "-"],
            ["Subscription ID", stripeSubId ? <code key="s" className="font-mono text-xs">{stripeSubId}</code> : "-"],
            ["Price ID", d.stripePriceId ? <code key="p" className="font-mono text-xs">{d.stripePriceId}</code> : "-"],
          ]} />
        </Card>

        {s.status === "exempt" ? (
          <Card title="Exemption">
            <Dl items={[["Reason", s.exemptReason ?? "-"], ["Expires", s.exemptExpiresAt ? formatUtc(s.exemptExpiresAt) : "No expiry"]]} />
            <p className="my-3 text-sm text-idw-forest/80">This Space is kept operational without a subscription. It is not counted as paying. Removing the exemption is audited.</p>
            <ClearExemptForm tenantId={s.tenantId} />
          </Card>
        ) : null}
      </div>

      <Card title="Invoices" className="mt-4">
        {d.invoices.length === 0 ? <EmptyRow>No invoices recorded.</EmptyRow> : (
          <ul className="divide-y divide-idw-forest/10 text-sm">
            {d.invoices.map((i) => {
              const hosted = safeHttpsUrl(i.hosted_invoice_url);
              return (
                <li key={i.id as string} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <code className="font-mono text-xs">{i.stripe_invoice_id as string}</code>
                    <span className="block text-xs text-idw-forest/70">{i.invoice_number ? `#${i.invoice_number} - ` : ""}{formatUtc(i.issued_at as string | null)} - {invoiceStatusLabel(i as { status: string; amount_refunded_minor?: number; currency?: string })}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span>{money(i.total_minor as number | null, i.currency as string)}</span>
                    {hosted ? <a className={linkCls} href={hosted} target="_blank" rel="noopener noreferrer">Hosted invoice</a> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-sm"><Link className={linkCls} href={`/admin/billing/payments?subscription=${s.id}`}>Open in Payments</Link></p>
      </Card>

      <Card title="Recent webhook events" className="mt-4">
        {d.events.length === 0 ? <EmptyRow>No events recorded for this subscription.</EmptyRow> : (
          <ul className="divide-y divide-idw-forest/10 text-sm">
            {d.events.map((e) => (
              <li key={e.stripe_event_id as string} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><code className="font-mono text-xs">{e.event_type as string}</code><span className="block text-xs text-idw-forest/70">{formatUtc(e.received_at as string)}{e.error_code ? ` - ${e.error_code}` : ""}</span></span>
                <Badge tone={e.status === "processed" ? "good" : e.status === "failed" ? "bad" : "neutral"}>{String(e.status)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
