import { OWNER_ONLY, requireAdminPage } from "@/lib/billing/admin/auth";
import { loadOverview } from "@/lib/billing/admin/queries";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminMetaTitle, getAdminI18n } from "../../_lib/i18n";
import { setPaidCheckoutAction } from "../../billing/actions";
import { ConfirmActionButton } from "../../_components/ConfirmActionButton";
import { SetExemptForm } from "../../_components/forms";
import { Badge, Card, PageHeader } from "../../_components/ui";

export const dynamic = "force-dynamic";
export const generateMetadata = () => adminMetaTitle("navControls");

const LAUNCH_GATES_DOC = "docs/billing/LAUNCH-GATES.md";

/**
 * OWNER ONLY: the paid-checkout launch switch and billing exemptions (moved out of Billing > Settings). It lives in the
 * owner-only (console) group, so a billing_admin gets a plain 404 at ANY assurance level (the billing layout would
 * otherwise ask an AAL1 billing_admin for MFA first), and the matching server actions refuse them at the gate (setPaidCheckoutAction, setExemptAction,
 * clearExemptAction: roles ["owner"] in billing/actions.ts).
 */
export default async function BillingControlsPage() {
  await requireAdminPage({ roles: OWNER_ONLY });
  const c = await getAdminI18n();
  const { t } = c;
  const overview = await loadOverview(createAdminClient());
  const enabled = overview.paidCheckoutEnabled;
  return (
    <>
      <PageHeader title={t("navControls")}>{t("ctIntro")}</PageHeader>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t("stPaidCheckout")} id="paid-checkout">
          <p className="mb-3 text-sm">{t("stCurrentState")} <Badge tone={enabled ? "good" : "neutral"}>{enabled ? t("stEnabledBadge") : t("stDisabledBadge")}</Badge></p>
          <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            <p className="font-semibold">{t("stDeliberate")}</p>
            <p className="mt-1">{t("stBeforeOn", { doc: LAUNCH_GATES_DOC })}</p>
            <ul className="mt-1 list-disc pl-5">
              <li>{t("stGateLegal")}</li>
              <li>{t("stGateTax")}</li>
              <li>{t("stGateStripe")}</li>
              <li>{t("stGateDpa")}</li>
            </ul>
          </div>
          {enabled ? (
            <ConfirmActionButton
              label={t("stDisableLabel")}
              title={t("stDisableTitle")}
              message={t("stDisableMessage")}
              confirmLabel={t("stDisableLabel")}
              action={setPaidCheckoutAction.bind(null, false)}
              okMessage={t("stDisableOk")}
              variant="danger"
            />
          ) : (
            <ConfirmActionButton
              label={t("stEnableLabel")}
              title={t("stEnableTitle")}
              message={t("stEnableMessage", { doc: LAUNCH_GATES_DOC })}
              confirmLabel={t("stEnableConfirm")}
              action={setPaidCheckoutAction.bind(null, true)}
              okMessage={t("stEnableOk")}
              variant="primary"
            />
          )}
        </Card>
        <Card title={t("stExemption")} id="exempt" className="lg:col-span-2">
          <p className="mb-3 max-w-2xl text-sm">{t("stExemptBody")}</p>
          <div className="max-w-md"><SetExemptForm /></div>
        </Card>
      </div>
    </>
  );
}
