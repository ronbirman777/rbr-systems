import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeNextAction, type RedemptionState } from "../nextAction";
import { SUBSCRIPTION_SELECT, toSubscriptionRecord, type SubscriptionRecord, type SubscriptionRow } from "../types";
import { computeOverviewMetrics, type OverviewMetrics } from "./metrics";
import { qaAuditReason } from "./qaAudit";

/** Read-side for the Admin console. Service-role client; the caller has ALREADY passed requireAdmin*(). */

export async function lookupEmails(db: SupabaseClient, userIds: (string | null)[]): Promise<Map<string, string | null>> {
  const ids = [...new Set(userIds.filter((x): x is string => !!x))].slice(0, 200);
  const out = new Map<string, string | null>();
  await Promise.all(ids.map(async (id) => {
    const { data } = await db.auth.admin.getUserById(id);
    out.set(id, data.user?.email ?? null);
  }));
  return out;
}

export type OverviewData = {
  metrics: OverviewMetrics;
  openCheckouts: number;
  failedEvents: number;
  stuckCheckouts: number;
  paidCheckoutEnabled: boolean;
  generatedAt: Date;
};

export async function loadOverview(db: SupabaseClient, now: Date = new Date()): Promise<OverviewData> {
  const [{ data: subRows }, { data: discounted }, { count: openCheckouts }, { count: failedEvents }, { count: stuck }, { data: settings }] = await Promise.all([
    db.from("space_subscriptions").select(SUBSCRIPTION_SELECT).limit(5000),
    db.from("coupon_redemptions").select("space_subscription_id").eq("status", "redeemed").not("space_subscription_id", "is", null).limit(5000),
    db.from("pending_space_checkouts").select("*", { count: "exact", head: true }).in("status", ["created", "checkout_created", "awaiting_payment"]),
    db.from("billing_events").select("*", { count: "exact", head: true }).eq("status", "failed"),
    db.from("pending_space_checkouts").select("*", { count: "exact", head: true }).in("status", ["payment_confirmed", "provisioning", "failed"]),
    db.from("billing_settings").select("paid_checkout_enabled").eq("singleton", true).maybeSingle(),
  ]);
  const subs = (subRows ?? []).map((r) => toSubscriptionRecord(r as unknown as SubscriptionRow));
  const discountedIds = new Set((discounted ?? []).map((d) => d.space_subscription_id as string));
  return {
    metrics: computeOverviewMetrics(subs, discountedIds, now),
    openCheckouts: openCheckouts ?? 0, failedEvents: failedEvents ?? 0, stuckCheckouts: stuck ?? 0,
    paidCheckoutEnabled: settings?.paid_checkout_enabled === true, generatedAt: now,
  };
}

export type SubscriptionListRow = {
  subscription: SubscriptionRecord;
  spaceName: string; spaceType: string; ownerEmail: string | null; couponCode: string | null;
  discount: { cyclesCompleted: number; cyclesTotal: number | null; status: string } | null;
  nextAction: ReturnType<typeof computeNextAction>;
};

export async function listSubscriptions(
  db: SupabaseClient, f: { status?: string; includeExempt?: boolean; limit?: number }, now: Date = new Date()
): Promise<SubscriptionListRow[]> {
  let q = db.from("space_subscriptions").select(`${SUBSCRIPTION_SELECT}, tenants(name, product_type)`).order("created_at", { ascending: false }).limit(Math.min(f.limit ?? 100, 500));
  if (f.status) q = q.eq("status", f.status);
  if (!f.includeExempt) q = q.neq("status", "exempt");
  const { data } = await q;
  const rows = (data ?? []) as unknown as (SubscriptionRow & { tenants: { name: string; product_type: string } | null })[];
  const subIds = rows.map((r) => r.id);
  const [{ data: reds }, emails] = await Promise.all([
    subIds.length
      ? db.from("coupon_redemptions").select("*, coupons(code)").in("space_subscription_id", subIds).in("status", ["redeemed", "completed", "canceled"])
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    lookupEmails(db, rows.map((r) => r.billing_owner_user_id)),
  ]);
  const redBySub = new Map<string, Record<string, unknown>>();
  for (const r of reds ?? []) redBySub.set(r.space_subscription_id as string, r);
  return rows.map((r) => {
    const sub = toSubscriptionRecord(r);
    const red = redBySub.get(r.id);
    const state = red ? toRedemptionState(red) : null;
    return {
      subscription: sub, spaceName: r.tenants?.name ?? "", spaceType: r.tenants?.product_type ?? "",
      ownerEmail: r.billing_owner_user_id ? emails.get(r.billing_owner_user_id) ?? null : null,
      couponCode: ((red?.coupons as { code?: string } | null)?.code) ?? null,
      discount: state ? { cyclesCompleted: state.cyclesCompleted, cyclesTotal: state.cyclesTotal, status: state.status } : null,
      nextAction: computeNextAction(sub, state, { now, nextPaymentAttemptAt: sub.nextPaymentAttemptAt }),
    };
  });
}

export function toRedemptionState(red: Record<string, unknown>): RedemptionState {
  return {
    status: red.status as RedemptionState["status"], cyclesCompleted: Number(red.cycles_completed), cyclesTotal: red.cycles_total == null ? null : Number(red.cycles_total),
    discountEndsAt: red.discount_ends_at ? new Date(String(red.discount_ends_at)) : null,
    couponCode: ((red.coupons as { code?: string } | null)?.code) ?? null,
    lastCycleInvoiceId: (red.last_cycle_invoice_id as string | null) ?? null,
    terms: {
      discountType: red.discount_type as "percent" | "fixed_amount", percentOff: red.percent_off == null ? null : Number(red.percent_off),
      amountOffMinor: red.amount_off_minor == null ? null : Number(red.amount_off_minor), currency: red.currency ? String(red.currency).trim() : null,
      durationType: red.duration_type as "once" | "repeating" | "forever", durationCycles: red.duration_cycles == null ? null : Number(red.duration_cycles),
    },
  };
}

export async function getSubscriptionDetail(db: SupabaseClient, subscriptionId: string, now: Date = new Date()) {
  const { data: row } = await db.from("space_subscriptions").select(`${SUBSCRIPTION_SELECT}, stripe_price_id, latest_invoice_id, tenants(name, product_type)`).eq("id", subscriptionId).maybeSingle();
  if (!row) return null;
  const r = row as unknown as SubscriptionRow & { tenants: { name: string; product_type: string } | null; stripe_price_id: string | null; latest_invoice_id: string | null };
  const sub = toSubscriptionRecord(r);
  const [{ data: red }, { data: invoices }, { data: events }, emails] = await Promise.all([
    db.from("coupon_redemptions").select("*, coupons(code)").eq("space_subscription_id", subscriptionId).order("redeemed_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("billing_invoices").select("*").eq("space_subscription_id", subscriptionId).order("issued_at", { ascending: false }).limit(100),
    r.stripe_subscription_id ? db.from("billing_events").select("stripe_event_id, event_type, status, received_at, processed_at, error_code").eq("stripe_subscription_id", r.stripe_subscription_id).order("received_at", { ascending: false }).limit(25) : Promise.resolve({ data: [] }),
    lookupEmails(db, [r.billing_owner_user_id]),
  ]);
  const state = red ? toRedemptionState(red) : null;
  return {
    subscription: sub, spaceName: r.tenants?.name ?? "", spaceType: r.tenants?.product_type ?? "", stripePriceId: r.stripe_price_id,
    ownerEmail: r.billing_owner_user_id ? emails.get(r.billing_owner_user_id) ?? null : null,
    redemption: state, nextAction: computeNextAction(sub, state, { now, nextPaymentAttemptAt: sub.nextPaymentAttemptAt }),
    invoices: invoices ?? [], events: events ?? [],
  };
}

export type CouponStats = { attempts: number; redemptions: number; activeDiscounted: number; completed: number; canceledSubscriptions: number; reserved: number };

export async function listCoupons(db: SupabaseClient) {
  const [{ data: coupons }, { data: reds }] = await Promise.all([
    db.from("coupons").select("*").order("created_at", { ascending: false }).limit(500),
    db.from("coupon_redemptions").select("coupon_id, status").limit(20000),
  ]);
  const stats = new Map<string, CouponStats>();
  for (const c of coupons ?? []) stats.set(c.id, { attempts: 0, redemptions: 0, activeDiscounted: 0, completed: 0, canceledSubscriptions: 0, reserved: 0 });
  for (const r of reds ?? []) {
    const s = stats.get(r.coupon_id as string);
    if (!s) continue;
    s.attempts++; // every reservation row = a checkout attempt/reservation (typing alone creates none)
    if (["redeemed", "completed", "canceled"].includes(r.status as string)) s.redemptions++; // SUCCESSFUL commercial redemptions only
    if (r.status === "redeemed") s.activeDiscounted++;
    if (r.status === "completed") s.completed++;
    if (r.status === "canceled") s.canceledSubscriptions++;
    if (r.status === "reserved") s.reserved++;
  }
  return (coupons ?? []).map((c) => ({ coupon: c, stats: stats.get(c.id)! }));
}

export async function getCouponDetail(db: SupabaseClient, couponId: string, now: Date = new Date()) {
  const { data: coupon } = await db.from("coupons").select("*").eq("id", couponId).maybeSingle();
  if (!coupon) return null;
  const { data: reds } = await db.from("coupon_redemptions").select("*, tenants(name, product_type), space_subscriptions(status, current_period_end, cancel_at_period_end, base_amount_minor, currency)").eq("coupon_id", couponId).order("created_at", { ascending: false }).limit(500);
  const rows = reds ?? [];
  const emails = await lookupEmails(db, rows.map((r) => r.user_id as string | null));
  const stats: CouponStats = { attempts: rows.length, redemptions: 0, activeDiscounted: 0, completed: 0, canceledSubscriptions: 0, reserved: 0 };
  for (const r of rows) {
    if (["redeemed", "completed", "canceled"].includes(r.status)) stats.redemptions++;
    if (r.status === "redeemed") stats.activeDiscounted++;
    if (r.status === "completed") stats.completed++;
    if (r.status === "canceled") stats.canceledSubscriptions++;
    if (r.status === "reserved") stats.reserved++;
  }
  const redemptions = await Promise.all(rows.map(async (r) => {
    const subRow = r.space_subscriptions as { status: string; current_period_end: string | null; cancel_at_period_end: boolean } | null;
    let next: ReturnType<typeof computeNextAction> | null = null;
    if (r.space_subscription_id) {
      const sub = await db.from("space_subscriptions").select(SUBSCRIPTION_SELECT).eq("id", r.space_subscription_id).maybeSingle();
      if (sub.data) {
        const rec = toSubscriptionRecord(sub.data as unknown as SubscriptionRow);
        next = computeNextAction(rec, r.status === "reserved" ? null : toRedemptionState(r), { now, nextPaymentAttemptAt: rec.nextPaymentAttemptAt });
      }
    }
    return { redemption: r, userEmail: r.user_id ? emails.get(r.user_id) ?? null : null, subscriptionStatus: subRow?.status ?? null, nextBillingDate: subRow?.current_period_end ?? null, next };
  }));
  return { coupon, stats, redemptions };
}

export async function listInvoices(db: SupabaseClient, f: { status?: string; tenantId?: string; subscriptionId?: string; limit?: number }) {
  let q = db.from("billing_invoices").select("*, tenants(name, product_type)").order("issued_at", { ascending: false }).limit(Math.min(f.limit ?? 100, 500));
  if (f.status) q = q.eq("status", f.status);
  if (f.tenantId) q = q.eq("tenant_id", f.tenantId);
  if (f.subscriptionId) q = q.eq("space_subscription_id", f.subscriptionId);
  const { data } = await q;
  const rows = data ?? [];
  const emails = await lookupEmails(db, rows.map((r) => r.user_id as string | null));
  const codes = new Map<string, string>();
  const redIds = [...new Set(rows.map((r) => r.coupon_redemption_id as string | null).filter((x): x is string => !!x))];
  if (redIds.length) {
    const { data: reds } = await db.from("coupon_redemptions").select("id, coupons(code)").in("id", redIds);
    for (const r of reds ?? []) codes.set(r.id as string, ((r.coupons as { code?: string } | null)?.code) ?? "");
  }
  return rows.map((r) => ({ invoice: r, spaceName: (r.tenants as { name?: string } | null)?.name ?? "", ownerEmail: r.user_id ? emails.get(r.user_id) ?? null : null, couponCode: r.coupon_redemption_id ? codes.get(r.coupon_redemption_id) ?? null : null }));
}

export async function listAudit(db: SupabaseClient, limit = 100) {
  const [{ data }, { data: admins }] = await Promise.all([
    db.from("admin_audit_log").select("*").order("created_at", { ascending: false }).limit(Math.min(limit, 500)),
    db.from("admin_users").select("user_id"),
  ]);
  const realAdmins = new Set((admins ?? []).map((a) => a.user_id as string));
  const rows = data ?? [];
  const emails = await lookupEmails(db, rows.map((r) => r.admin_user_id as string | null));
  return rows.map((r) => ({
    ...r,
    adminEmail: r.admin_user_id ? emails.get(r.admin_user_id) ?? null : null,
    /** Non-null = TASK 032 QA/test entry (see qaAudit.ts). */
    qaReason: qaAuditReason(r, realAdmins),
  }));
}

export async function listAdmins(db: SupabaseClient) {
  const { data } = await db.from("admin_users").select("*").order("created_at");
  const rows = data ?? [];
  const emails = await lookupEmails(db, rows.map((r) => r.user_id as string));
  return rows.map((r) => ({ ...r, email: emails.get(r.user_id as string) ?? null }));
}
