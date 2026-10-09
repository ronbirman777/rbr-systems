import "server-only";
import type { EmailSender } from "./outbox";

/**
 * Resend over plain HTTPS (no SDK dependency). Open/click tracking is a
 * DOMAIN-level Resend setting and must be OFF for the sending domain
 * (docs/billing/LAUNCH-GATES.md); this sender adds no tracking of its own and the
 * rendered emails contain no pixels or link wrappers.
 */
export function createResendSender(opts: { apiKey: string; from: string }): EmailSender {
  return {
    async send({ to, subject, text, html, idempotencyKey }) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ from: opts.from, to: [to], subject, text, html }),
      });
      if (!res.ok) throw new Error(`Resend responded ${res.status}`);
      const body = (await res.json().catch(() => ({}))) as { id?: string };
      return { id: body.id ?? null };
    },
  };
}
