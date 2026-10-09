import Link from "next/link";
import { requireAdminPage } from "@/lib/billing/admin/auth";
import { listCoupons } from "@/lib/billing/admin/queries";
import { couponDiscountLabel, couponStatus, couponStatusLabel, couponSyncState, couponWindowLabel, durationLabel, usageRuleLabel, type Tone } from "@/lib/billing/admin/ui/labels";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentStripeMode } from "../../_lib/mode";
import { adminMetaTitle, getAdminI18n } from "../../_lib/i18n";
import { Badge, EmptyRow, PageHeader, RBody, RCell, RHead, RRow, RTable } from "../../_components/ui";
import { btnPrimary, linkCls } from "../../_components/styles";

export const dynamic = "force-dynamic";
export const generateMetadata = () => adminMetaTitle("navCoupons");

const TONE: Record<string, Tone> = { active: "good", scheduled: "warn", expired: "neutral", disabled: "bad" };

export default async function CouponsPage() {
  await requireAdminPage();
  const c = await getAdminI18n();
  const { t } = c;
  const rows = await listCoupons(createAdminClient());
  const mode = currentStripeMode();
  const now = new Date();
  return (
    <>
      <PageHeader title={t("navCoupons")} actions={<Link href="/admin/billing/coupons/new" className={btnPrimary}>{t("cpNew")}</Link>}>
        {t("cpIntro")} {mode ? t("cpSyncMode", { mode }) : t("cpSyncNone")}
      </PageHeader>
      {rows.length === 0 ? <EmptyRow>{t("cpEmpty")}</EmptyRow> : (
        <RTable caption={t("cpCaption")}>
          <RHead cols={[t("colCode"), t("colStatus"), t("colDiscount"), t("colDuration"), t("colUsageRule"), t("colAvailability"), t("colCap"), t("colStripe"), t("colRedeemed"), t("colAttempts"), t("colActiveDiscounted"), t("colCompleted")]} />
          <RBody>
            {rows.map(({ coupon: cp, stats }) => {
              const st = couponStatus(cp as { active: boolean; valid_from: string | null; valid_until: string | null }, now);
              const sync = couponSyncState(cp, mode);
              return (
                <RRow key={cp.id as string}>
                  <RCell label={t("colCode")}><Link className={`${linkCls} font-mono`} href={`/admin/billing/coupons/${cp.id}`}>{cp.code as string}</Link></RCell>
                  <RCell label={t("colStatus")}><Badge tone={TONE[st]}>{couponStatusLabel(st, c)}</Badge></RCell>
                  <RCell label={t("colDiscount")}>{couponDiscountLabel(cp, c)}</RCell>
                  <RCell label={t("colDuration")}>{durationLabel(cp.duration_type, cp.duration_cycles, c)}</RCell>
                  <RCell label={t("colUsageRule")}>{usageRuleLabel(cp.usage_rule, c)}</RCell>
                  <RCell label={t("colAvailability")}>{couponWindowLabel(cp, c)}</RCell>
                  <RCell label={t("colCap")}>{cp.global_max_redemptions ?? t("valueNone")}</RCell>
                  <RCell label={t("colStripe")}>{sync === "synced" ? <Badge tone="good">{t("syncSynced")}</Badge> : sync === "needs_sync" ? <Badge tone="warn">{t("syncNeedsSync")}</Badge> : t("syncNotApplicable")}</RCell>
                  <RCell label={t("colRedeemed")}><b className="text-base">{stats.redemptions}</b></RCell>
                  <RCell label={t("colAttempts")}>{stats.attempts} / {stats.reserved}</RCell>
                  <RCell label={t("colActiveDiscounted")}>{stats.activeDiscounted}</RCell>
                  <RCell label={t("colCompleted")}>{stats.completed}</RCell>
                </RRow>
              );
            })}
          </RBody>
        </RTable>
      )}
    </>
  );
}
