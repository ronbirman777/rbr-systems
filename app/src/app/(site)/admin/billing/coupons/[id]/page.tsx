import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/billing/admin/auth";
import { getCouponDetail } from "@/lib/billing/admin/queries";
import {
  couponDiscountLabel, couponStatus, couponStatusLabel, couponSyncState, couponWindowLabel, durationLabel, formatUtc, isUuid, minorToMajorString, nextActionLabel,
  redemptionStatusLabel, spaceTypeLabel, toDateTimeLocalUtc, usageRuleLabel, type Tone,
} from "@/lib/billing/admin/ui/labels";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentStripeMode } from "../../../_lib/mode";
import { adminMetaTitle, getAdminI18n } from "../../../_lib/i18n";
import { setCouponActiveAction, syncCouponAction } from "../../actions";
import { ConfirmActionButton } from "../../../_components/ConfirmActionButton";
import { CouponForm, type CouponFormInitial } from "../../../_components/CouponForm";
import { Badge, Card, Dl, EmptyRow, PageHeader, RBody, RCell, RHead, RRow, RTable, Stat } from "../../../_components/ui";
import { linkCls } from "../../../_components/styles";

export const dynamic = "force-dynamic";
export const generateMetadata = () => adminMetaTitle("metaCoupon");

const TONE: Record<string, Tone> = { active: "good", scheduled: "warn", expired: "neutral", disabled: "bad" };

export default async function CouponDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const c = await getAdminI18n();
  const { t } = c;
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const d = await getCouponDetail(createAdminClient(), id);
  if (!d) notFound();
  const { coupon: cp, stats, redemptions } = d;
  const mode = currentStripeMode();
  const st = couponStatus(cp, new Date());
  const sync = couponSyncState(cp, mode);
  const used = stats.redemptions + stats.reserved > 0;
  const code = cp.code as string;

  const initial: CouponFormInitial = {
    code, description: (cp.description as string | null) ?? "", discountType: cp.discount_type, percentOff: cp.percent_off == null ? "" : String(Number(cp.percent_off)),
    amountOff: minorToMajorString(cp.amount_off_minor), currency: cp.currency ? String(cp.currency).trim() : "USD", usageRule: cp.usage_rule,
    durationType: cp.duration_type, durationCycles: cp.duration_cycles == null ? "" : String(cp.duration_cycles), validFrom: toDateTimeLocalUtc(cp.valid_from),
    validUntil: toDateTimeLocalUtc(cp.valid_until), globalMaxRedemptions: cp.global_max_redemptions == null ? "" : String(cp.global_max_redemptions),
    planKeys: (cp.plan_keys as string[] | null) ?? [], spaceTypes: (cp.space_types as string[] | null) ?? [],
  };

  return (
    <>
      <p className="mb-2 text-sm"><Link className={linkCls} href="/admin/billing/coupons">&larr; {t("cdBack")}</Link></p>
      <PageHeader
        title={code}
        actions={
          <>
            {sync === "needs_sync" ? (
              <ConfirmActionButton
                label={t("cdSyncLabel")}
                title={t("cdSyncTitle", { code })}
                message={t("cdSyncMessage", { mode: mode ?? "" })}
                confirmLabel={t("cdSyncConfirm")}
                action={syncCouponAction.bind(null, id)}
                okMessage={t("cdSyncOk")}
                variant="primary"
              />
            ) : null}
            {cp.active ? (
              <ConfirmActionButton
                label={t("cdDisableLabel")}
                title={t("cdDisableTitle", { code })}
                message={t("cdDisableMessage", { code })}
                confirmLabel={t("cdDisableConfirm", { code })}
                action={setCouponActiveAction.bind(null, id, false)}
                okMessage={t("cdDisableOk")}
                variant="danger"
              />
            ) : (
              <ConfirmActionButton
                label={t("cdEnableLabel")}
                title={t("cdEnableTitle", { code })}
                message={t("cdEnableMessage", { code })}
                confirmLabel={t("cdEnableConfirm", { code })}
                action={setCouponActiveAction.bind(null, id, true)}
                okMessage={t("cdEnableOk")}
                variant="primary"
              />
            )}
          </>
        }
      >
        <Badge tone={TONE[st]}>{couponStatusLabel(st, c)}</Badge> {cp.description ? <span className="ms-2">{cp.description as string}</span> : null}
      </PageHeader>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label={t("cdStatRedemptions")} value={<b>{stats.redemptions}</b>} caption={t("cdStatRedemptionsCaption")} />
        <Stat label={t("cdStatAttempts")} value={`${stats.attempts} / ${stats.reserved}`} caption={t("cdStatAttemptsCaption")} />
        <Stat label={t("cdStatActive")} value={stats.activeDiscounted} caption={t("cdStatActiveCaption")} />
        <Stat label={t("cdStatCompleted")} value={stats.completed} caption={t("cdStatCompletedCaption")} />
        <Stat label={t("cdStatCanceled")} value={stats.canceledSubscriptions} caption={t("cdStatCanceledCaption")} />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card title={t("cdDefinition")}>
          <Dl items={[
            [t("cdDiscount"), couponDiscountLabel(cp, c)],
            [t("cdDurationOfRedemption"), durationLabel(cp.duration_type, cp.duration_cycles, c)],
            [t("cdUsageRule"), usageRuleLabel(cp.usage_rule, c)],
            [t("cdWindow"), couponWindowLabel(cp, c)],
            [t("cdTotalCap"), cp.global_max_redemptions ?? t("valueNone")],
            [t("cdAppliesTo"), t("cdAppliesValue", { plans: (cp.plan_keys as string[] | null)?.join(", ") || t("cdAllPlans"), types: (cp.space_types as string[] | null)?.map((x) => spaceTypeLabel(x, c)).join(", ") || t("cdAllSpaceTypes") })],
            [t("cdStripeSync"), sync === "no_stripe" ? t("cdSyncNoStripe") : sync === "synced" ? t("cdSyncedMode", { mode: mode ?? "" }) : t("cdNeedsSyncMode", { mode: mode ?? "" })],
            [t("cdCreated"), formatUtc(cp.created_at, c)],
          ]} />
        </Card>
        <Card title={t("cdEdit")}>
          <CouponForm mode="edit" couponId={id} initial={initial} lockFinancial={used} />
        </Card>
      </div>

      <Card title={t("cdRedemptions", { count: redemptions.length })}>
        {redemptions.length === 0 ? <EmptyRow>{t("cdNoRedemptions")}</EmptyRow> : (
          <RTable caption={t("cdRedemptionsCaption")}>
            <RHead cols={[t("colSpace"), t("colRedeemed"), t("colDiscountRuns"), t("colCycles"), t("colStatus"), t("colNextBilling"), t("colNextAction")]} />
            <RBody>
              {redemptions.map(({ redemption: r, nextBillingDate, next }) => {
                const tn = r.tenants as { name?: string; product_type?: string } | null;
                return (
                  <RRow key={r.id as string}>
                    <RCell label={t("colSpace")}>{tn?.name ?? "-"}<span className="block text-xs text-idw-forest/70">{spaceTypeLabel(tn?.product_type, c)}</span></RCell>
                    <RCell label={t("colRedeemed")}>{formatUtc(r.redeemed_at, c)}</RCell>
                    <RCell label={t("colDiscountRuns")}>{formatUtc(r.discount_starts_at, c)}<span className="block text-xs">{t("cdRunsTo", { time: r.discount_ends_at ? formatUtc(r.discount_ends_at, c) : r.cycles_total == null && r.duration_type === "forever" ? t("cdNeverForever") : "-" })}</span></RCell>
                    <RCell label={t("colCycles")}>{r.cycles_completed} / {r.cycles_total ?? (r.duration_type === "forever" ? t("cdCyclesForever") : "-")}</RCell>
                    <RCell label={t("colStatus")}>{redemptionStatusLabel(r.status, c)}</RCell>
                    <RCell label={t("colNextBilling")}>{formatUtc(nextBillingDate, c)}</RCell>
                    <RCell label={t("colNextAction")}>{next ? <>{nextActionLabel(next.action, c)}<span className="block text-xs">{formatUtc(next.at, c)}</span></> : "-"}</RCell>
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
