import type { BillingDeps } from "../deps";
import { resolveLocale } from "@/lib/i18n";
import { renderBillingEmail } from "./render";
import { isRetiredTemplate, isSendableTemplate } from "./templates";

/** A mail provider. Implementations MUST NOT enable open/click tracking. */
export interface EmailSender {
  send(msg: { to: string; subject: string; text: string; html: string; idempotencyKey: string }): Promise<{ id: string | null }>;
}

/**
 * Send queued billing emails. Each outbox row is leased (billing_claim_emails)
 * before sending, the provider call carries the row id as its idempotency key,
 * and the final status write only lands on a still-'sending' row - so a crash,
 * a retry or two overlapping job runs can never produce a duplicate email.
 * A recipient without an email address is 'skipped' (nothing to send to), and so
 * is a row with a retired template (subscription_started / payment_recovered) -
 * the app never enqueues those, so such a row could only be stray data.
 */
export async function flushEmailOutbox(deps: BillingDeps, sender: EmailSender, limit = 20): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (const job of await deps.store.claimEmails(limit)) {
    try {
      if (!isSendableTemplate(job.template)) {
        await deps.store.finishEmail(job.id, "skipped", null, isRetiredTemplate(job.template) ? "retired template" : "unsupported template");
        continue;
      }
      const contact = job.userId ? await deps.store.getUserContact(job.userId) : null;
      if (!contact?.email) { await deps.store.finishEmail(job.id, "skipped", null, "no recipient address"); continue; }
      const email = renderBillingEmail(job.template, resolveLocale(job.locale), job.payload);
      const res = await sender.send({ to: contact.email, subject: email.subject, text: email.text, html: email.html, idempotencyKey: `idw-billing-email-${job.id}` });
      await deps.store.finishEmail(job.id, "sent", res.id, null);
      sent++;
    } catch (e) {
      failed++;
      await deps.store.finishEmail(job.id, "failed", null, e instanceof Error ? e.message.slice(0, 280) : "send failed").catch(() => undefined);
    }
  }
  return { sent, failed };
}
