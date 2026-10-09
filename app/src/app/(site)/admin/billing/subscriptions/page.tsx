import Link from "next/link";
import { requireAdminPage } from "@/lib/billing/admin/auth";
import { listSubscriptions } from "@/lib/billing/admin/queries";
import { SUBSCRIPTION_STATUSES } from "@/lib/billing/types";
import { discountProgressText, formatUtc, money, nextActionLabel, spaceTypeLabel, statusLabel, statusTone } from "@/lib/billing/admin/ui/labels";
import { createAdminClient } from "@/lib/supabase/admin";
import { Badge, EmptyRow, FilterLinks, PageHeader, RBody, RCell, RHead, RRow, RTable } from "../../_components/ui";
import { linkCls } from "../../_components/styles";

export const dynamic = "force-dynamic";
export const metadata = { title: "Subscriptions - InnerDweS Admin" };

export default async function SubscriptionsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const status = (SUBSCRIPTION_STATUSES as readonly string[]).includes(sp.status ?? "") ? sp.status : undefined;
  const rows = await listSubscriptions(createAdminClient(), { status, includeExempt: status === "exempt", limit: 200 });
  return (
    <>
      <PageHeader title="Subscriptions">One subscription per Space. Exempt Spaces are hidden unless you filter for them.</PageHeader>
      <FilterLinks base="/admin/billing/subscriptions" param="status" current={status}
        options={[["", "All paid"], ...SUBSCRIPTION_STATUSES.map((s): [string, string] => [s, statusLabel(s)])]} />
      {rows.length === 0 ? <EmptyRow>No subscriptions match this filter.</EmptyRow> : (
        <RTable caption="Subscriptions">
          <RHead cols={["Space", "Owner", "Plan / price", "Status", "Discount", "Current period", "Next action", "Cancel", "Failure"]} />
          <RBody>
            {rows.map((r) => {
              const s = r.subscription;
              const na = r.nextAction;
              const effective = s.currentEffectiveAmountMinor ?? s.baseAmountMinor;
              return (
                <RRow key={s.id}>
                  <RCell label="Space">
                    <Link className={linkCls} href={`/admin/billing/subscriptions/${s.id}`}>{r.spaceName || "(unnamed)"}</Link>
                    <span className="block text-xs text-idw-forest/70">{spaceTypeLabel(r.spaceType)}</span>
                  </RCell>
                  <RCell label="Owner">{r.ownerEmail ?? "-"}</RCell>
                  <RCell label="Price">
                    <span className="block">Base {money(s.baseAmountMinor, s.currency)}</span>
                    {effective !== s.baseAmountMinor ? <span className="block text-xs">Now {money(effective, s.currency)}</span> : null}
                    {s.stripeMode ? <span className="block text-xs text-idw-forest/70">{s.stripeMode} mode</span> : null}
                  </RCell>
                  <RCell label="Status"><Badge tone={statusTone(s.status)}>{statusLabel(s.status)}</Badge></RCell>
                  <RCell label="Discount">
                    {r.couponCode ? <><code className="font-mono text-xs">{r.couponCode}</code><span className="block text-xs">{discountProgressText(r.discount, na.discountProgress)}</span></> : "-"}
                  </RCell>
                  <RCell label="Period">{s.currentPeriodEnd ? <>{formatUtc(s.currentPeriodStart)}<span className="block text-xs">to {formatUtc(s.currentPeriodEnd)}</span></> : "-"}</RCell>
                  <RCell label="Next action">
                    {nextActionLabel(na.action)}
                    {na.at ? <span className="block text-xs">{formatUtc(na.at)}</span> : null}
                    {na.expectedChargeMinor != null ? <span className="block text-xs">Charge {money(na.expectedChargeMinor, na.currency)}</span> : null}
                  </RCell>
                  <RCell label="Cancel">{s.cancelAtPeriodEnd ? <Badge tone="warn">ends {formatUtc(s.cancelAt ?? s.currentPeriodEnd)}</Badge> : s.canceledAt ? `canceled ${formatUtc(s.canceledAt)}` : "-"}</RCell>
                  <RCell label="Failure">{s.paymentFailedAt ? <Badge tone="bad">{s.studioSuspendedAt ? "Studio suspended" : s.guestSuspendedAt ? "Guest suspended" : "payment failed"} since {formatUtc(s.paymentFailedAt)}</Badge> : "-"}</RCell>
                </RRow>
              );
            })}
          </RBody>
        </RTable>
      )}
    </>
  );
}
