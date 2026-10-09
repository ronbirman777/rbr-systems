import type { SupabaseClient } from "@supabase/supabase-js";
import { computeNextAction, type NextActionResult, type RedemptionState } from "./nextAction";
import { deriveSpaceAccess, type AccessReason } from "./access";
import { lifecycleDeadlines } from "./lifecycle";
import { computeAudioEntitlements, type AudioEntitlements, type PlanEntitlementBundle } from "./entitlements";
import { SUBSCRIPTION_SELECT, toSubscriptionRecord, type SubscriptionRecord, type SubscriptionRow } from "./types";

/** What the customer-facing status chip / banner should say. */
export type CustomerBillingState =
  | "active" | "payment_issue" | "guest_suspended" | "studio_suspended" | "canceling" | "ended" | "exempt" | "setting_up";

export function customerBillingState(sub: SubscriptionRecord, now: Date): CustomerBillingState {
  const a = deriveSpaceAccess(sub, now);
  if (sub.status === "exempt") return a.decided ? "exempt" : "active";
  switch (a.reason) {
    case "subscription_ended": return "ended";
    case "subscription_not_active": return "setting_up";
    case "studio_suspended": return "studio_suspended";
    case "guest_suspended": return "guest_suspended";
    case "payment_issue": return "payment_issue";
    default: return sub.cancelAtPeriodEnd ? "canceling" : "active";
  }
}

export type InvoiceRow = {
  id: string; stripeInvoiceId: string; status: "draft" | "open" | "paid" | "void" | "uncollectible"; issuedAt: string | null; paidAt: string | null;
  failedAt: string | null; currency: string; totalMinor: number | null; amountPaidMinor: number; amountRefundedMinor: number;
  discountMinor: number; number: string | null; hostedInvoiceUrl: string | null; invoicePdfUrl: string | null; receiptUrl: string | null;
};

export type BillingViewModel = {
  tenantId: string;
  spaceName: string;
  spaceType: string;
  subscription: SubscriptionRecord;
  state: CustomerBillingState;
  reason: AccessReason;
  access: { studioWritable: boolean; guestAvailable: boolean };
  /** Failure-episode dates the banners quote. */
  deadlines: { guestSuspendedAt: Date; studioSuspendedAt: Date; deletionEligibleAt: Date } | null;
  nextAction: NextActionResult;
  redemption: (RedemptionState & { couponCode: string | null }) | null;
  planName: string | null;
  audio: AudioEntitlements | null;
  invoices: InvoiceRow[];
};

/**
 * Everything the owner's Billing / Plan page shows, read through the OWNER'S OWN
 * session (RLS: only the owner can read the subscription and invoices - another
 * account gets nothing). Returns null when the Space has no billing row.
 */
export async function loadBillingView(
  supabase: SupabaseClient,
  /** Server-side client for the non-sensitive CATALOG (plan name/bundle, coupon display code) that owners cannot read directly. Ownership has already been proven by the owner-session read below. */
  catalog: SupabaseClient,
  tenantId: string,
  now: Date = new Date()
): Promise<BillingViewModel | null> {
  const { data: subRow } = await supabase.from("space_subscriptions").select(SUBSCRIPTION_SELECT).eq("tenant_id", tenantId).maybeSingle();
  if (!subRow) return null;
  const subscription = toSubscriptionRecord(subRow as unknown as SubscriptionRow);

  const [{ data: tenant }, { data: red }, { data: plan }, { data: addon }, { data: invs }] = await Promise.all([
    supabase.from("tenants").select("name, product_type").eq("id", tenantId).maybeSingle(),
    catalog.from("coupon_redemptions").select("*, coupons(code)").eq("space_subscription_id", subscription.id).in("status", ["redeemed", "completed", "canceled"]).order("redeemed_at", { ascending: false }).limit(1).maybeSingle(),
    subscription.planId ? catalog.from("billing_plans").select("display_name, entitlements").eq("id", subscription.planId).maybeSingle() : Promise.resolve({ data: null }),
    catalog.from("space_subscription_addons").select("quantity").eq("subscription_id", subscription.id).eq("addon_key", "audio_pack").maybeSingle(),
    supabase.from("billing_invoices").select("id, stripe_invoice_id, status, issued_at, paid_at, failed_at, currency, total_minor, amount_paid_minor, amount_refunded_minor, discount_minor, invoice_number, hosted_invoice_url, invoice_pdf_url, receipt_url").eq("tenant_id", tenantId).order("issued_at", { ascending: false }).limit(50),
  ]);

  const bundle = (plan?.entitlements ?? null) as PlanEntitlementBundle | null;
  const audio = bundle ? computeAudioEntitlements(bundle, addon?.quantity ?? 0) : null;

  const redemption = red
    ? {
        status: red.status, cyclesCompleted: red.cycles_completed, cyclesTotal: red.cycles_total, discountEndsAt: red.discount_ends_at ? new Date(red.discount_ends_at) : null,
        couponCode: (red.coupons as { code?: string } | null)?.code ?? null,
        lastCycleInvoiceId: red.last_cycle_invoice_id ?? null,
        terms: {
          discountType: red.discount_type, percentOff: red.percent_off == null ? null : Number(red.percent_off), amountOffMinor: red.amount_off_minor,
          currency: red.currency ? String(red.currency).trim() : null, durationType: red.duration_type, durationCycles: red.duration_cycles,
        },
      }
    : null;

  const access = deriveSpaceAccess(subscription, now);
  const nextAction = computeNextAction(subscription, redemption, { now, nextPaymentAttemptAt: subscription.nextPaymentAttemptAt });
  const d = subscription.paymentFailedAt ? lifecycleDeadlines(subscription.paymentFailedAt) : null;

  return {
    tenantId,
    spaceName: tenant?.name ?? "",
    spaceType: tenant?.product_type ?? "",
    subscription,
    state: customerBillingState(subscription, now),
    reason: access.reason,
    access: { studioWritable: access.studioWritable, guestAvailable: access.guestAvailable === true },
    deadlines: d ? { guestSuspendedAt: d.guestSuspendedAt, studioSuspendedAt: d.studioSuspendedAt, deletionEligibleAt: d.deletionEligibleAt } : null,
    nextAction,
    redemption,
    planName: plan?.display_name ?? null,
    audio,
    invoices: (invs ?? []).map((i) => ({
      id: i.id, stripeInvoiceId: i.stripe_invoice_id, status: i.status, issuedAt: i.issued_at, paidAt: i.paid_at, failedAt: i.failed_at,
      currency: String(i.currency).trim(), totalMinor: i.total_minor, amountPaidMinor: i.amount_paid_minor, amountRefundedMinor: i.amount_refunded_minor,
      discountMinor: i.discount_minor, number: i.invoice_number, hostedInvoiceUrl: i.hosted_invoice_url, invoicePdfUrl: i.invoice_pdf_url, receiptUrl: i.receipt_url,
    })),
  };
}
