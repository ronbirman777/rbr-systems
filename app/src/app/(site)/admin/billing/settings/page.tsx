import { requireAdminPage } from "@/lib/billing/admin/auth";
import { listAdmins, loadOverview } from "@/lib/billing/admin/queries";
import { formatUtc } from "@/lib/billing/admin/ui/labels";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentStripeMode } from "../../_lib/mode";
import { revokeAdminAction, setPaidCheckoutAction, syncPlanAction } from "../actions";
import { ConfirmActionButton } from "../../_components/ConfirmActionButton";
import { GrantAdminForm, SetExemptForm } from "../../_components/forms";
import { Badge, Card, PageHeader } from "../../_components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings - InnerDweS Admin" };

export default async function SettingsPage() {
  const me = await requireAdminPage();
  const db = createAdminClient();
  const [overview, admins] = await Promise.all([loadOverview(db), listAdmins(db)]);
  const enabled = overview.paidCheckoutEnabled;
  const mode = currentStripeMode();
  const isOwner = me.role === "owner";
  return (
    <>
      <PageHeader title="Settings">Sensitive changes ask for a fresh authenticator code and are recorded in the Audit log.</PageHeader>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Paid checkout" id="paid-checkout">
          <p className="mb-3 text-sm">Current state: <Badge tone={enabled ? "good" : "neutral"}>{enabled ? "ENABLED - customers can buy Spaces" : "DISABLED - paid checkout is off"}</Badge></p>
          <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            <p className="font-semibold">Enabling paid checkout is the owner&apos;s deliberate decision.</p>
            <p className="mt-1">Before turning it on, confirm every launch gate in <code className="font-mono text-xs">docs/billing/LAUNCH-GATES.md</code>:</p>
            <ul className="mt-1 list-disc pl-5">
              <li>Legal operator and the Terms/Privacy/refund pages are final</li>
              <li>Tax registration and tax collection are settled</li>
              <li>Stripe is in live mode with the plan synced and verified</li>
              <li>Data-processing agreements (DPAs) with providers are in place</li>
            </ul>
          </div>
          {enabled ? (
            <ConfirmActionButton
              label="Disable paid checkout"
              title="Disable paid checkout?"
              message="Disable paid checkout? Nobody will be able to buy a new Space. Existing subscribers and their Spaces are not affected."
              confirmLabel="Disable paid checkout"
              action={setPaidCheckoutAction.bind(null, false)}
              okMessage="Paid checkout disabled."
              variant="danger"
            />
          ) : (
            <ConfirmActionButton
              label="Enable paid checkout"
              title="Enable paid checkout for real customers?"
              message="Enable paid checkout? Customers will be able to buy Spaces and be charged immediately. Only continue if every gate in docs/billing/LAUNCH-GATES.md is complete."
              confirmLabel="Yes, enable paid checkout"
              action={setPaidCheckoutAction.bind(null, true)}
              okMessage="Paid checkout enabled."
              variant="primary"
            />
          )}
        </Card>

        <Card title="Stripe plan sync" id="plan-sync">
          <p className="mb-3 text-sm">Makes sure the base plan&apos;s Product and Price exist in Stripe ({mode ? <b>{mode}</b> : "Stripe not configured"} mode) and match the plan in InnerDweS exactly. Safe to run repeatedly.</p>
          <ConfirmActionButton
            label="Sync plan to Stripe"
            title="Sync the plan to Stripe?"
            message={`This creates or verifies the Stripe Product and Price for the base plan in ${mode ?? "the configured"} mode. No customer is charged.`}
            confirmLabel="Sync plan"
            action={syncPlanAction}
            okMessage="Plan synced: the Stripe price matches the plan."
            variant="primary"
            disabled={!mode}
          />
        </Card>

        <Card title="Admin users" id="admins" className="lg:col-span-2">
          <ul className="mb-4 divide-y divide-idw-forest/10 text-sm">
            {admins.map((a) => (
              <li key={a.user_id as string} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {a.email ?? "(unknown email)"} <Badge>{a.role === "owner" ? "Owner" : "Billing admin"}</Badge> {a.disabled_at ? <Badge tone="bad">disabled {formatUtc(a.disabled_at)}</Badge> : null}
                  {a.user_id === me.userId ? <span className="ml-2 text-xs text-idw-forest/70">(you)</span> : null}
                </span>
                {isOwner && !a.disabled_at && a.user_id !== me.userId ? (
                  <ConfirmActionButton
                    label="Revoke"
                    title="Revoke Admin access?"
                    message={`Revoke Admin access for ${a.email ?? "this account"}? They lose access to this console immediately.`}
                    confirmLabel="Revoke access"
                    action={revokeAdminAction.bind(null, a.user_id as string)}
                    okMessage="Admin access revoked."
                    variant="danger"
                  />
                ) : null}
              </li>
            ))}
          </ul>
          {isOwner ? (
            <div className="max-w-md border-t border-idw-forest/10 pt-4">
              <h3 className="mb-2 font-ui text-base">Grant Admin access</h3>
              <GrantAdminForm />
            </div>
          ) : <p className="text-sm text-idw-forest/70">Only Owners can grant or revoke Admin access.</p>}
        </Card>

        <Card title="Internal / legacy exemption" id="exempt" className="lg:col-span-2">
          <p className="mb-3 max-w-2xl text-sm">An exemption keeps one Space operational <b>without a subscription</b> (for example internal, legacy or QA Spaces). Exempt Spaces are never counted as paying and never in revenue. Every exemption needs a reason and may have an expiry; setting and removing it is recorded in the Audit log. A Space with a paid subscription cannot be exempted.</p>
          <div className="max-w-md"><SetExemptForm /></div>
        </Card>
      </div>
    </>
  );
}
