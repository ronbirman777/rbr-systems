import Link from "next/link";
import { requireAdminPage } from "@/lib/billing/admin/auth";
import { loadOverview } from "@/lib/billing/admin/queries";
import { METRIC_CAPTIONS } from "@/lib/billing/admin/ui/metricCaptions";
import { formatUtc, money } from "@/lib/billing/admin/ui/labels";
import { createAdminClient } from "@/lib/supabase/admin";
import { Badge, PageHeader, Stat } from "../_components/ui";
import { linkCls } from "../_components/styles";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview - InnerDweS Admin" };

function MoneyList({ by }: { by: Record<string, number> }) {
  const entries = Object.entries(by);
  if (!entries.length) return <>-</>;
  return (
    <>
      {entries.map(([cur, minor]) => (
        <span key={cur} className="block">{money(minor, cur)} <span className="text-sm font-normal text-idw-forest/70">{cur}</span></span>
      ))}
    </>
  );
}

export default async function OverviewPage() {
  await requireAdminPage();
  const o = await loadOverview(createAdminClient());
  const m = o.metrics;
  return (
    <>
      <PageHeader title="Billing overview">
        Snapshot as of {formatUtc(o.generatedAt)}. Every number below is defined under it; amounts are shown per currency and never summed across currencies.
      </PageHeader>

      <h2 className="mb-2 font-ui text-lg text-idw-forest">Operations</h2>
      <ul className="mb-8 flex flex-wrap gap-2" aria-label="Operational status">
        <li><Link href="/admin/billing/settings" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-idw-forest/20 bg-white/70 px-4 text-sm"><span>Paid checkout</span> <Badge tone={o.paidCheckoutEnabled ? "good" : "neutral"}>{o.paidCheckoutEnabled ? "enabled" : "disabled"}</Badge></Link></li>
        <li className="inline-flex min-h-11 items-center gap-2 rounded-full border border-idw-forest/20 bg-white/70 px-4 text-sm" title={METRIC_CAPTIONS.openCheckouts}>Open checkouts <Badge>{o.openCheckouts}</Badge></li>
        <li className="inline-flex min-h-11 items-center gap-2 rounded-full border border-idw-forest/20 bg-white/70 px-4 text-sm" title={METRIC_CAPTIONS.failedEvents}>Failed webhook events <Badge tone={o.failedEvents ? "bad" : "neutral"}>{o.failedEvents}</Badge></li>
        <li className="inline-flex min-h-11 items-center gap-2 rounded-full border border-idw-forest/20 bg-white/70 px-4 text-sm" title={METRIC_CAPTIONS.stuckCheckouts}>Stuck checkouts <Badge tone={o.stuckCheckouts ? "warn" : "neutral"}>{o.stuckCheckouts}</Badge></li>
      </ul>
      <p className="-mt-6 mb-8 max-w-3xl text-xs text-idw-forest/70">
        Open checkouts: {METRIC_CAPTIONS.openCheckouts} Failed webhook events: {METRIC_CAPTIONS.failedEvents} Stuck checkouts: {METRIC_CAPTIONS.stuckCheckouts} Paid checkout: {METRIC_CAPTIONS.paidCheckoutFlag}
      </p>

      <h2 className="mb-2 font-ui text-lg text-idw-forest">Revenue</h2>
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Paid subscriptions" value={m.paidSubscriptions} caption={METRIC_CAPTIONS.paidSubscriptions} />
        <Stat label="Paid Spaces" value={m.paidSpaces} caption={METRIC_CAPTIONS.paidSpaces} />
        <Stat label="MRR - list value (gross)" value={<MoneyList by={m.mrr.listMinor} />} caption={METRIC_CAPTIONS.mrrList} />
        <Stat label="MRR - current, after discounts" value={<MoneyList by={m.mrr.currentMinor} />} caption={METRIC_CAPTIONS.mrrCurrent} />
        <Stat label="Discounted subscriptions" value={m.discounted} caption={METRIC_CAPTIONS.discounted} />
        <Stat label="Scheduled cancellations" value={m.scheduledCancellations} caption={METRIC_CAPTIONS.scheduledCancellations} tone={m.scheduledCancellations ? "warn" : undefined} />
      </div>

      <h2 className="mb-2 font-ui text-lg text-idw-forest">Payment problems</h2>
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Payment failures" value={m.paymentFailures} caption={METRIC_CAPTIONS.paymentFailures} tone={m.paymentFailures ? "warn" : undefined} />
        <Stat label="Guest-suspended" value={m.guestSuspended} caption={METRIC_CAPTIONS.guestSuspended} tone={m.guestSuspended ? "bad" : undefined} />
        <Stat label="Studio-suspended" value={m.studioSuspended} caption={METRIC_CAPTIONS.studioSuspended} tone={m.studioSuspended ? "bad" : undefined} />
        <Stat label="Deletion-eligible" value={m.deletionEligible} caption={METRIC_CAPTIONS.deletionEligible} tone={m.deletionEligible ? "bad" : undefined} />
      </div>

      <h2 className="mb-2 font-ui text-lg text-idw-forest">Exempt</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Exempt Spaces (not counted as paying)" value={m.exempt} caption={METRIC_CAPTIONS.exempt} />
      </div>
      <p className="mt-6 text-sm"><Link className={linkCls} href="/admin/billing/subscriptions?status=exempt">View exempt Spaces</Link></p>
    </>
  );
}
