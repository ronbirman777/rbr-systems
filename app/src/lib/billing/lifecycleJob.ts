import type { BillingDeps } from "./deps";
import { reconcileCheckout } from "./reconcile";
import { refreshNextAction } from "./nextActionService";
import { syncSubscription } from "./sync";
import { enqueueSimpleNotice, type SimpleNoticeTemplate } from "./emails/enqueue";
import { flushEmailOutbox, type EmailSender } from "./emails/outbox";

export type JobReport = {
  expiredCheckouts: number;
  expiredReservations: number;
  reconciled: number;
  resynced: number;
  lifecycleActions: { action: string; subscriptionId: string }[];
  emails: { sent: number; failed: number; skipped: boolean };
  errors: string[];
};

const ACTION_TO_TEMPLATE: Partial<Record<string, SimpleNoticeTemplate>> = {
  guest_suspended: "guest_unavailable",
  studio_suspended: "studio_suspended",
  deletion_warning: "final_warning",
  // deletion_eligible has no customer email: the day-12 final warning already
  // told them; eligibility only opens the (separately governed) deletion workflow.
};

/**
 * The scheduled billing job (Vercel Cron -> /api/cron/billing). Every step is
 * idempotent and safe to re-run at any frequency:
 *   - lifecycle stamps are deterministic deadlines applied at most once
 *     (billing_apply_lifecycle), against LIVE state - a Space that recovered a
 *     moment ago is never suspended by a stale action;
 *   - emails use per-episode dedupe keys;
 *   - reconciliation and resync converge on Stripe's truth.
 */
export async function runBillingJobs(deps: BillingDeps, sender: EmailSender | null): Promise<JobReport> {
  const report: JobReport = {
    expiredCheckouts: 0, expiredReservations: 0, reconciled: 0, resynced: 0, lifecycleActions: [],
    emails: { sent: 0, failed: 0, skipped: !sender }, errors: [],
  };
  const guard = async (label: string, fn: () => Promise<void>) => {
    try { await fn(); } catch (e) { report.errors.push(`${label}: ${e instanceof Error ? e.message.slice(0, 160) : "error"}`); }
  };
  const now = deps.now();

  await guard("expire", async () => {
    const r = await deps.store.expireStale();
    report.expiredCheckouts = r.checkouts;
    report.expiredReservations = r.reservations;
  });

  await guard("reconcile", async () => {
    for (const p of await deps.store.listStuckCheckouts(now)) {
      await guard(`reconcile ${p.id}`, async () => { await reconcileCheckout(deps, p.id); report.reconciled++; });
    }
  });

  await guard("resync", async () => {
    for (const s of await deps.store.listActiveSubscriptionsDueForResync(now)) {
      if (!s.stripeSubscriptionId) continue;
      await guard(`resync ${s.id}`, async () => { await syncSubscription(deps, s.stripeSubscriptionId!); report.resynced++; });
    }
  });

  await guard("lifecycle", async () => {
    const actions = await deps.store.applyLifecycle(now);
    for (const a of actions) {
      report.lifecycleActions.push({ action: a.action, subscriptionId: a.subscriptionId });
      const template = ACTION_TO_TEMPLATE[a.action];
      if (template && a.userId) {
        const sub = await deps.store.getSubscriptionById(a.subscriptionId);
        // The dedupe key carries the failure episode, so a NEW episode after a recovery can notify again.
        await enqueueSimpleNotice(deps, {
          template, dedupeKey: `${template}:${a.subscriptionId}:${sub?.paymentFailedAt?.toISOString() ?? "na"}`,
          subscriptionId: a.subscriptionId, tenantId: a.tenantId, userId: a.userId,
        });
      }
      await refreshNextAction(deps, a.subscriptionId);
    }
  });

  if (sender) {
    await guard("emails", async () => {
      const r = await flushEmailOutbox(deps, sender);
      report.emails = { sent: r.sent, failed: r.failed, skipped: false };
    });
  }
  return report;
}
