import Link from "next/link";
import { requireAdminPage } from "@/lib/billing/admin/auth";
import { listCoupons } from "@/lib/billing/admin/queries";
import { couponDiscountLabel, couponStatus, couponSyncState, couponWindowLabel, durationLabel, usageRuleLabel, type Tone } from "@/lib/billing/admin/ui/labels";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentStripeMode } from "../../_lib/mode";
import { Badge, EmptyRow, PageHeader, RBody, RCell, RHead, RRow, RTable } from "../../_components/ui";
import { btnPrimary, linkCls } from "../../_components/styles";

export const dynamic = "force-dynamic";
export const metadata = { title: "Coupons - InnerDweS Admin" };

const TONE: Record<string, Tone> = { active: "good", scheduled: "warn", expired: "neutral", disabled: "bad" };

export default async function CouponsPage() {
  await requireAdminPage();
  const rows = await listCoupons(createAdminClient());
  const mode = currentStripeMode();
  const now = new Date();
  return (
    <>
      <PageHeader title="Coupons" actions={<Link href="/admin/billing/coupons/new" className={btnPrimary}>New coupon</Link>}>
        The main number is <b>Redeemed</b>: customers who completed payment with the coupon. Checkout attempts and reservations are shown separately and never count as redemptions.
        {mode ? <> Stripe sync is shown for the current <b>{mode}</b> mode.</> : <> Stripe is not configured here, so sync state is unavailable.</>}
      </PageHeader>
      {rows.length === 0 ? <EmptyRow>No coupons yet.</EmptyRow> : (
        <RTable caption="Coupons">
          <RHead cols={["Code", "Status", "Discount", "Duration", "Usage rule", "Availability", "Cap", "Stripe", "Redeemed", "Attempts", "Active", "Completed"]} />
          <RBody>
            {rows.map(({ coupon: c, stats }) => {
              const st = couponStatus(c as { active: boolean; valid_from: string | null; valid_until: string | null }, now);
              const sync = couponSyncState(c, mode);
              return (
                <RRow key={c.id as string}>
                  <RCell label="Code"><Link className={`${linkCls} font-mono`} href={`/admin/billing/coupons/${c.id}`}>{c.code as string}</Link></RCell>
                  <RCell label="Status"><Badge tone={TONE[st]}>{st}</Badge></RCell>
                  <RCell label="Discount">{couponDiscountLabel(c)}</RCell>
                  <RCell label="Duration">{durationLabel(c.duration_type, c.duration_cycles)}</RCell>
                  <RCell label="Usage rule">{usageRuleLabel(c.usage_rule)}</RCell>
                  <RCell label="Availability">{couponWindowLabel(c)}</RCell>
                  <RCell label="Cap">{c.global_max_redemptions ?? "none"}</RCell>
                  <RCell label="Stripe">{sync === "synced" ? <Badge tone="good">synced</Badge> : sync === "needs_sync" ? <Badge tone="warn">needs sync</Badge> : "n/a"}</RCell>
                  <RCell label="Redeemed"><b className="text-base">{stats.redemptions}</b></RCell>
                  <RCell label="Attempts / reserved">{stats.attempts} / {stats.reserved}</RCell>
                  <RCell label="Active discounted">{stats.activeDiscounted}</RCell>
                  <RCell label="Completed">{stats.completed}</RCell>
                </RRow>
              );
            })}
          </RBody>
        </RTable>
      )}
    </>
  );
}
