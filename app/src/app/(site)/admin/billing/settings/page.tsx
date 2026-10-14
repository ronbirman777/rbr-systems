import Link from "next/link";
import { requireAdminPage } from "@/lib/billing/admin/auth";
import { listAdmins } from "@/lib/billing/admin/queries";
import { formatUtc } from "@/lib/billing/admin/ui/labels";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentStripeMode } from "../../_lib/mode";
import { adminMetaTitle, getAdminI18n } from "../../_lib/i18n";
import { revokeAdminAction, syncPlanAction } from "../actions";
import { ConfirmActionButton } from "../../_components/ConfirmActionButton";
import { GrantAdminForm } from "../../_components/forms";
import { Badge, Card, PageHeader } from "../../_components/ui";
import { linkCls } from "../../_components/styles";

export const dynamic = "force-dynamic";
export const generateMetadata = () => adminMetaTitle("navSettings");

export default async function SettingsPage() {
  const me = await requireAdminPage();
  const c = await getAdminI18n();
  const { t } = c;
  const db = createAdminClient();
  const admins = await listAdmins(db);
  const mode = currentStripeMode();
  const isOwner = me.role === "owner";
  return (
    <>
      <PageHeader title={t("navSettings")}>{t("stIntro")}</PageHeader>
      {isOwner ? <p className="mb-4 text-sm"><Link className={linkCls} href="/admin/launch">{t("ctMovedNote")}</Link></p> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t("stPlanSync")} id="plan-sync">
          <p className="mb-3 text-sm">{mode ? t("stPlanSyncBody", { mode }) : t("stPlanSyncBodyNoStripe")}</p>
          <ConfirmActionButton
            label={t("stSyncLabel")}
            title={t("stSyncTitle")}
            message={mode ? t("stSyncMessage", { mode }) : t("stSyncMessageConfigured")}
            confirmLabel={t("stSyncConfirm")}
            action={syncPlanAction}
            okMessage={t("stSyncOk")}
            variant="primary"
            disabled={!mode}
          />
        </Card>

        <Card title={t("stAdmins")} id="admins" className="lg:col-span-2">
          <ul className="mb-4 divide-y divide-idw-forest/10 text-sm">
            {admins.map((a) => (
              <li key={a.user_id as string} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <bdi>{a.email ?? t("unknownEmail")}</bdi> <Badge>{a.role === "owner" ? t("roleOwner") : t("roleBillingAdmin")}</Badge> {a.disabled_at ? <Badge tone="bad">{t("stDisabledAt", { time: formatUtc(a.disabled_at, c) })}</Badge> : null}
                  {a.user_id === me.userId ? <span className="ms-2 text-xs text-idw-forest/70">{t("you")}</span> : null}
                </span>
                {isOwner && !a.disabled_at && a.user_id !== me.userId ? (
                  <ConfirmActionButton
                    label={t("stRevokeLabel")}
                    title={t("stRevokeTitle")}
                    message={t("stRevokeMessage", { who: a.email ?? t("stRevokeThisAccount") })}
                    confirmLabel={t("stRevokeConfirm")}
                    action={revokeAdminAction.bind(null, a.user_id as string)}
                    okMessage={t("stRevokeOk")}
                    variant="danger"
                  />
                ) : null}
              </li>
            ))}
          </ul>
          {isOwner ? (
            <div className="max-w-md border-t border-idw-forest/10 pt-4">
              <h3 className="mb-2 font-ui text-base">{t("stGrantHeading")}</h3>
              <GrantAdminForm />
            </div>
          ) : <p className="text-sm text-idw-forest/70">{t("stOwnersOnly")}</p>}
        </Card>

      </div>
    </>
  );
}
