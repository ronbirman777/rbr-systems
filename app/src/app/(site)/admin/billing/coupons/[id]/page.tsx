import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/billing/admin/auth";
import { getCouponDetail } from "@/lib/billing/admin/queries";
import {
  couponDiscountLabel, couponStatus, couponSyncState, couponWindowLabel, durationLabel, formatUtc, isUuid, minorToMajorString, nextActionLabel,
  redemptionStatusLabel, spaceTypeLabel, toDateTimeLocalUtc, usageRuleLabel, type Tone,
} from "@/lib/billing/admin/ui/labels";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentStripeMode } from "../../../_lib/mode";
import { setCouponActiveAction, syncCouponAction } from "../../actions";
import { ConfirmActionButton } from "../../../_components/ConfirmActionButton";
import { CouponForm, type CouponFormInitial } from "../../../_components/CouponForm";
import { Badge, Card, Dl, EmptyRow, PageHeader, RBody, RCell, RHead, RRow, RTable, Stat } from "../../../_components/ui";
import { linkCls } from "../../../_components/styles";

export const dynamic = "force-dynamic";
export const metadata = { title: "Coupon - InnerDweS Admin" };

const TONE: Record<string, Tone> = { active: "good", scheduled: "warn", expired: "neutral", disabled: "bad" };

export default async function CouponDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const d = await getCouponDetail(createAdminClient(), id);
  if (!d) notFound();
  const { coupon: c, stats, redemptions } = d;
  const mode = currentStripeMode();
  const st = couponStatus(c, new Date());
  const sync = couponSyncState(c, mode);
  const used = stats.redemptions + stats.reserved > 0;
  const code = c.code as string;

  const initial: CouponFormInitial = {
    code, description: (c.description as string | null) ?? "", discountType: c.discount_type, percentOff: c.percent_off == null ? "" : String(Number(c.percent_off)),
    amountOff: minorToMajorString(c.amount_off_minor), currency: c.currency ? String(c.currency).trim() : "USD", usageRule: c.usage_rule,
    durationType: c.duration_type, durationCycles: c.duration_cycles == null ? "" : String(c.duration_cycles), validFrom: toDateTimeLocalUtc(c.valid_from),
    validUntil: toDateTimeLocalUtc(c.valid_until), globalMaxRedemptions: c.global_max_redemptions == null ? "" : String(c.global_max_redemptions),
    planKeys: (c.plan_keys as string[] | null) ?? [], spaceTypes: (c.space_types as string[] | null) ?? [],
  };

  return (
    <>
      <p className="mb-2 text-sm"><Link className={linkCls} href="/admin/billing/coupons">&larr; All coupons</Link></p>
      <PageHeader
        title={code}
        actions={
          <>
            {sync === "needs_sync" ? (
              <ConfirmActionButton
                label="Sync to Stripe"
                title={`Sync ${code} to Stripe?`}
                message={<>This creates the matching coupon in Stripe ({mode} mode) so customers can use it at checkout. It does not change the terms.</>}
                confirmLabel="Sync"
                action={syncCouponAction.bind(null, id)}
                okMessage="Synced to Stripe."
                variant="primary"
              />
            ) : null}
            {c.active ? (
              <ConfirmActionButton
                label="Disable"
                title={`Disable ${code}?`}
                message={`Disable ${code} for NEW checkouts? Existing customers will keep their already-redeemed discounts.`}
                confirmLabel={`Disable ${code}`}
                action={setCouponActiveAction.bind(null, id, false)}
                okMessage="Coupon disabled."
                variant="danger"
              />
            ) : (
              <ConfirmActionButton
                label="Enable"
                title={`Enable ${code}?`}
                message={`Enable ${code} for NEW checkouts? It will be usable again whenever its availability window is open.`}
                confirmLabel={`Enable ${code}`}
                action={setCouponActiveAction.bind(null, id, true)}
                okMessage="Coupon enabled."
                variant="primary"
              />
            )}
          </>
        }
      >
        <Badge tone={TONE[st]}>{st}</Badge> {c.description ? <span className="ml-2">{c.description as string}</span> : null}
      </PageHeader>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Successful redemptions" value={<b>{stats.redemptions}</b>} caption="Customers who completed payment with this coupon. The main number." />
        <Stat label="Checkout attempts / reservations" value={`${stats.attempts} / ${stats.reserved}`} caption="Every checkout that tried the coupon / those still in progress. Not redemptions." />
        <Stat label="Active discounted subscriptions" value={stats.activeDiscounted} caption="Discount currently running." />
        <Stat label="Completed discounts" value={stats.completed} caption="Discount ran its full duration." />
        <Stat label="Canceled subscriptions" value={stats.canceledSubscriptions} caption="Redeemed, then the subscription ended." />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card title="Definition">
          <Dl items={[
            ["Discount", couponDiscountLabel(c)],
            ["Duration of a redemption", durationLabel(c.duration_type, c.duration_cycles)],
            ["Usage rule", usageRuleLabel(c.usage_rule)],
            ["Availability window (new redemptions)", couponWindowLabel(c)],
            ["Total redemption cap", c.global_max_redemptions ?? "none"],
            ["Applies to", `${(c.plan_keys as string[] | null)?.join(", ") || "all plans"}; ${(c.space_types as string[] | null)?.map(spaceTypeLabel).join(", ") || "all Space types"}`],
            ["Stripe sync", sync === "no_stripe" ? "Stripe not configured here" : sync === "synced" ? `synced (${mode})` : `needs sync (${mode})`],
            ["Created", formatUtc(c.created_at)],
          ]} />
        </Card>
        <Card title="Edit">
          <CouponForm mode="edit" couponId={id} initial={initial} lockFinancial={used} />
        </Card>
      </div>

      <Card title={`Redemptions (${redemptions.length})`}>
        {redemptions.length === 0 ? <EmptyRow>Nobody has used this coupon yet.</EmptyRow> : (
          <RTable caption="Coupon redemptions">
            <RHead cols={["Customer", "Space", "Redeemed", "Discount runs", "Cycles", "Status", "Next billing", "Next action"]} />
            <RBody>
              {redemptions.map(({ redemption: r, userEmail, nextBillingDate, next }) => {
                const t = r.tenants as { name?: string; product_type?: string } | null;
                return (
                  <RRow key={r.id as string}>
                    <RCell label="Customer">{userEmail ?? "-"}</RCell>
                    <RCell label="Space">{t?.name ?? "-"}<span className="block text-xs text-idw-forest/70">{spaceTypeLabel(t?.product_type)}</span></RCell>
                    <RCell label="Redeemed">{formatUtc(r.redeemed_at)}</RCell>
                    <RCell label="Discount runs">{formatUtc(r.discount_starts_at)}<span className="block text-xs">to {r.discount_ends_at ? formatUtc(r.discount_ends_at) : r.cycles_total == null && r.duration_type === "forever" ? "never (forever)" : "-"}</span></RCell>
                    <RCell label="Cycles">{r.cycles_completed} / {r.cycles_total ?? (r.duration_type === "forever" ? "forever" : "-")}</RCell>
                    <RCell label="Status">{redemptionStatusLabel(r.status)}</RCell>
                    <RCell label="Next billing">{formatUtc(nextBillingDate)}</RCell>
                    <RCell label="Next action">{next ? <>{nextActionLabel(next.action)}<span className="block text-xs">{formatUtc(next.at)}</span></> : "-"}</RCell>
                  </RRow>
                );
              })}
            </RBody>
          </RTable>
        )}
      </Card>
    </>
  );
}
