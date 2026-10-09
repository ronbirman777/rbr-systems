import { describe, expect, it } from "vitest";
import { runBillingJobs } from "../lifecycleJob";
import { provisionFromVerifiedSession } from "../provisioning";
import { checkoutAndPay, makeHarness, USER, type Harness } from "../testing/harness";
import { enqueueSimpleNotice, type SimpleNoticeTemplate } from "./enqueue";
import { flushEmailOutbox } from "./outbox";
import { EMAIL_TEMPLATES, RETIRED_EMAIL_TEMPLATES, emailDedupeKey, isSendableTemplate, paymentConfirmationVariant } from "./templates";

/**
 * The billing email model (docs/billing/EMAILS-INVOICES.md): ONE customer email per
 * event. These tests assert the EXACT outbox rows, so a second welcome / recovery /
 * receipt email - or a duplicate row - fails them.
 */

type Row = { template: string; dedupeKey: string; variant?: unknown };
const rows = (h: Harness): Row[] =>
  [...h.store.outbox.values()].map((e) => ({ template: e.template, dedupeKey: e.dedupeKey, ...(e.template === "payment_confirmation" ? { variant: e.payload.variant } : {}) }));
const confirmation = (invoiceId: string, variant: string): Row => ({ template: "payment_confirmation", dedupeKey: `payment_confirmation:${invoiceId}`, variant });

async function bought(h: Harness) {
  const paid = await checkoutAndPay(h);
  await h.deliver("checkout.session.completed", paid.sessionId, "evt_checkout");
  const sub = [...h.store.subs.values()].find((s) => s.stripeSubscriptionId === paid.subscriptionId)!;
  return { ...paid, sub };
}

function recordingSender() {
  const sent: { to: string; subject: string; idempotencyKey: string }[] = [];
  return { sent, send: async (m: { to: string; subject: string; idempotencyKey: string }) => { sent.push(m); return { id: `re_${sent.length}` }; } };
}

describe("billing email model: exact outbox rows", () => {
  it("first payment -> exactly ONE email: payment confirmation that is also the subscription activation", async () => {
    const h = makeHarness();
    const b = await bought(h);
    // Stripe also sends both invoice events for the same first invoice.
    await h.deliver("invoice.paid", b.invoiceId, "evt_ip");
    await h.deliver("invoice.payment_succeeded", b.invoiceId, "evt_ips");
    expect(rows(h)).toEqual([confirmation(b.invoiceId, "first")]);
  });

  it("first payment whose invoice event arrives BEFORE provisioning still yields one 'first' row", async () => {
    const h = makeHarness();
    const paid = await checkoutAndPay(h);
    await h.deliver("invoice.paid", paid.invoiceId, "evt_early");
    expect(rows(h)).toEqual([]);
    await h.deliver("checkout.session.completed", paid.sessionId, "evt_checkout");
    await h.deliver("invoice.payment_succeeded", paid.invoiceId, "evt_late");
    expect(rows(h)).toEqual([confirmation(paid.invoiceId, "first")]);
  });

  it("renewal -> one 'renewal' confirmation per renewal invoice, nothing else", async () => {
    const h = makeHarness();
    const b = await bought(h);
    h.advance(30 * 86400_000);
    const r1 = h.stripe.renew(b.subscriptionId);
    await h.deliver("invoice.paid", r1.id);
    await h.deliver("invoice.payment_succeeded", r1.id);
    h.advance(30 * 86400_000);
    const r2 = h.stripe.renew(b.subscriptionId);
    await h.deliver("invoice.paid", r2.id);
    expect(rows(h)).toEqual([confirmation(b.invoiceId, "first"), confirmation(r1.id, "renewal"), confirmation(r2.id, "renewal")]);
  });

  it("failure then recovery -> one failed-payment warning, then ONE recovery email (the 'recovered' confirmation), never payment_recovered", async () => {
    const h = makeHarness();
    const b = await bought(h);
    h.advance(30 * 86400_000);
    const failed = h.stripe.failRenewal(b.subscriptionId);
    await h.deliver("invoice.payment_failed", failed.id, "evt_fail_1");
    h.advance(3 * 86400_000);
    await h.deliver("invoice.payment_failed", failed.id, "evt_fail_2"); // Stripe's retry also fails
    expect(rows(h)).toEqual([confirmation(b.invoiceId, "first"), { template: "payment_failed", dedupeKey: `payment_failed:${failed.id}` }]);

    h.stripe.recover(b.subscriptionId);
    await h.deliver("invoice.paid", failed.id, "evt_rec_1");
    await h.deliver("invoice.payment_succeeded", failed.id, "evt_rec_2");
    expect(rows(h)).toEqual([
      confirmation(b.invoiceId, "first"),
      { template: "payment_failed", dedupeKey: `payment_failed:${failed.id}` },
      confirmation(failed.id, "recovered"),
    ]);
    expect(rows(h).some((r) => r.template in RETIRED_EMAIL_TEMPLATES)).toBe(false);

    // The next ordinary renewal is a renewal again, not a second recovery.
    h.advance(30 * 86400_000);
    const next = h.stripe.renew(b.subscriptionId);
    await h.deliver("invoice.paid", next.id);
    expect(rows(h).at(-1)).toEqual(confirmation(next.id, "renewal"));
    expect(rows(h)).toHaveLength(4);
  });

  it("duplicate webhooks (same event id, different event ids, provisioning re-run) never add a row", async () => {
    const h = makeHarness();
    const paid = await checkoutAndPay(h);
    expect(await h.deliver("checkout.session.completed", paid.sessionId, "evt_same")).toEqual({ status: 200, body: "processed" });
    expect(await h.deliver("checkout.session.completed", paid.sessionId, "evt_same")).toEqual({ status: 200, body: "duplicate" });
    await h.deliver("checkout.session.completed", paid.sessionId, "evt_other_id");
    await h.deliver("invoice.paid", paid.invoiceId, "evt_ip");
    await h.deliver("invoice.paid", paid.invoiceId, "evt_ip");
    // Reconcile / a retried handler re-runs provisioning for the same verified session.
    await provisionFromVerifiedSession(h.deps, await h.stripe.retrieveCheckoutSession(paid.sessionId));
    expect(rows(h)).toEqual([confirmation(paid.invoiceId, "first")]);
  });

  it("a redelivered recovery invoice after the episode closed keeps the single 'recovered' row (first row wins)", async () => {
    const h = makeHarness();
    const b = await bought(h);
    h.advance(30 * 86400_000);
    const failed = h.stripe.failRenewal(b.subscriptionId);
    await h.deliver("invoice.payment_failed", failed.id);
    h.stripe.recover(b.subscriptionId);
    await h.deliver("invoice.paid", failed.id);
    h.advance(3600_000);
    await h.deliver("invoice.paid", failed.id, "evt_late_redelivery"); // the Space is no longer in failure here
    expect(rows(h).filter((r) => r.dedupeKey === `payment_confirmation:${failed.id}`)).toEqual([confirmation(failed.id, "recovered")]);
  });

  it("re-running the lifecycle job any number of times queues each notice once per episode, and the flush sends each row once", async () => {
    const h = makeHarness();
    const b = await bought(h);
    h.advance(30 * 86400_000);
    const failed = h.stripe.failRenewal(b.subscriptionId);
    await h.deliver("invoice.payment_failed", failed.id);
    const episode = h.store.subs.get(b.sub.id)!.paymentFailedAt!;
    const s = recordingSender();

    h.advance(25 * 3600_000);
    for (let i = 0; i < 3; i++) await runBillingJobs(h.deps, s);
    h.advance(6.5 * 86400_000);
    for (let i = 0; i < 3; i++) await runBillingJobs(h.deps, s);
    h.advance(5 * 86400_000);
    for (let i = 0; i < 3; i++) await runBillingJobs(h.deps, s);

    const expected: Row[] = [
      confirmation(b.invoiceId, "first"),
      { template: "payment_failed", dedupeKey: `payment_failed:${failed.id}` },
      { template: "guest_unavailable", dedupeKey: `guest_unavailable:${b.sub.id}:${episode.toISOString()}` },
      { template: "studio_suspended", dedupeKey: `studio_suspended:${b.sub.id}:${episode.toISOString()}` },
      { template: "final_warning", dedupeKey: `final_warning:${b.sub.id}:${episode.toISOString()}` },
    ];
    expect(rows(h)).toEqual(expected);
    expect(s.sent).toHaveLength(expected.length);
    expect(new Set(s.sent.map((m) => m.idempotencyKey)).size).toBe(expected.length);
    expect([...h.store.outbox.values()].every((e) => e.status === "sent")).toBe(true);

    // Recovery: one more row, and further job runs change nothing.
    h.stripe.recover(b.subscriptionId);
    await h.deliver("invoice.paid", failed.id);
    for (let i = 0; i < 3; i++) await runBillingJobs(h.deps, s);
    expect(rows(h)).toEqual([...expected, confirmation(failed.id, "recovered")]);
    expect(s.sent).toHaveLength(expected.length + 1);
    expect(s.sent.at(-1)!.subject).toContain("active again");
  });
});

describe("retired templates (subscription_started, payment_recovered)", () => {
  it("are not part of the sendable set, and every sendable template is distinct from them", () => {
    for (const t of Object.keys(RETIRED_EMAIL_TEMPLATES)) {
      expect(isSendableTemplate(t)).toBe(false);
      expect((EMAIL_TEMPLATES as readonly string[]).includes(t)).toBe(false);
    }
  });

  it("cannot be enqueued, even through an untyped call", async () => {
    const h = makeHarness();
    const b = await bought(h);
    for (const t of Object.keys(RETIRED_EMAIL_TEMPLATES)) {
      await expect(enqueueSimpleNotice(h.deps, {
        template: t as SimpleNoticeTemplate, dedupeKey: `${t}:x`, subscriptionId: b.sub.id, tenantId: b.sub.tenantId!, userId: USER,
      })).rejects.toThrow(/not enqueueable/);
    }
    expect(rows(h)).toEqual([confirmation(b.invoiceId, "first")]);
  });

  it("a stray DB row with a retired template is skipped by the outbox, never sent", async () => {
    const h = makeHarness();
    h.store.outbox.set("subscription_started:stray", {
      id: "em_stray", template: "subscription_started", userId: USER, tenantId: null, locale: "en", payload: {}, status: "pending", attempts: 0, dedupeKey: "subscription_started:stray",
    });
    const s = recordingSender();
    const r = await flushEmailOutbox(h.deps, s);
    expect(r).toEqual({ sent: 0, failed: 0 });
    expect(s.sent).toHaveLength(0);
    expect(h.store.outbox.get("subscription_started:stray")!.status).toBe("skipped");
  });
});

describe("payment confirmation variant precedence", () => {
  const v = (billingReason: string | null, wasInFailure: boolean, cancelAtPeriodEnd: boolean) => paymentConfirmationVariant({ billingReason, wasInFailure, cancelAtPeriodEnd });
  it("first invoice is always the activation email", () => {
    expect(v("subscription_create", false, false)).toBe("first");
    expect(v("subscription_create", true, true)).toBe("first");
  });
  it("then final, then recovered, then renewal", () => {
    expect(v("subscription_cycle", true, true)).toBe("final");
    expect(v("subscription_cycle", true, false)).toBe("recovered");
    expect(v("subscription_cycle", false, false)).toBe("renewal");
    expect(v(null, false, false)).toBe("renewal");
  });
  it("dedupe keys are per invoice / per episode", () => {
    expect(emailDedupeKey.paymentConfirmation("in_1")).toBe("payment_confirmation:in_1");
    expect(emailDedupeKey.paymentFailed("in_1")).toBe("payment_failed:in_1");
    expect(emailDedupeKey.lifecycle("guest_unavailable", "s1", new Date("2026-11-01T00:00:00.000Z"))).toBe("guest_unavailable:s1:2026-11-01T00:00:00.000Z");
  });
});
