import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlanEntitlementBundle } from "./entitlements";
import type { DiscountTerms } from "./quote";
import type { RedemptionState } from "./nextAction";
import type { StripeMode, SubscriptionRecord, SubscriptionRow } from "./types";
import { SUBSCRIPTION_SELECT, toSubscriptionRecord } from "./types";

/**
 * BillingStore - every billing read/write the services need, as typed methods.
 * The Supabase implementation below is a thin wrapper over the database
 * functions proven in scripts/billing-db-verify.mjs; services depend only on
 * this interface, so they are unit-tested against an in-memory fake without
 * duplicating (or weakening) the database's own guarantees.
 *
 * Server-only usage: the implementation takes the SERVICE-ROLE client.
 */

export type PlanRecord = {
  id: string;
  planKey: string;
  displayName: string;
  active: boolean;
  interval: "month" | "year";
  currency: string;
  unitAmountMinor: number;
  spaceTypes: string[];
  stripeProductId: string | null;
  stripePriceId: string | null;
  entitlements: PlanEntitlementBundle;
};

export type CheckoutStatus =
  | "created" | "checkout_created" | "awaiting_payment" | "payment_confirmed"
  | "provisioning" | "provisioned" | "expired" | "canceled" | "failed";

export type PendingCheckout = {
  id: string;
  userId: string | null;
  spaceType: "teach" | "retreat";
  planId: string;
  status: CheckoutStatus;
  stripeMode: StripeMode;
  sessionId: string | null;
  customerId: string | null;
  subscriptionId: string | null;
  quote: Record<string, unknown>;
  locale: string | null;
  tenantId: string | null;
  failureCode: string | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
};

export type ReservationResult =
  | {
      ok: true;
      reason: "reserved" | "already_reserved";
      redemptionId: string;
      couponId: string;
      stripeCouponId: string;
      terms: DiscountTerms;
      usageRule: string;
      reservationExpiresAt: Date;
    }
  | { ok: false; reason: CouponRefusal };

export type CouponRefusal =
  | "invalid" | "inactive" | "not_started" | "expired" | "not_applicable" | "unavailable"
  | "already_used" | "in_use_elsewhere" | "limit_reached" | "checkout_closed";

export type ProvisionSubscriptionInput = {
  stripe_subscription_id: string;
  stripe_customer_id: string;
  stripe_price_id: string | null;
  status: string;
  currency: string;
  base_amount_minor: number;
  effective_amount_minor: number | null;
  period_start: string | null;
  period_end: string | null;
  cancel_at_period_end: boolean;
  latest_invoice_id: string | null;
};

export type ProvisionResult = {
  status: "provisioned" | "already_provisioned";
  tenantId: string;
  subscriptionId: string | null;
  userId: string | null;
  spaceType: "teach" | "retreat" | null;
  couponStatus: string | null;
};

export type SubscriptionStateInput = {
  status: string;
  price_id?: string | null;
  currency?: string | null;
  base_amount_minor?: number | null;
  effective_amount_minor?: number | null;
  period_start?: string | null;
  period_end?: string | null;
  cancel_at_period_end?: boolean;
  cancel_at?: string | null;
  canceled_at?: string | null;
  ended_at?: string | null;
  latest_invoice_id?: string | null;
  latest_invoice_paid?: boolean;
  latest_invoice_failed?: boolean;
  failure_observed_at?: string | null;
};

export type SubscriptionStateResult =
  | { result: "unknown_subscription" }
  | { result: "ignored_exempt"; tenantId: string }
  | {
      result: "applied"; subscriptionId: string; tenantId: string; userId: string | null;
      statusBefore: string; statusAfter: string; failedStarted: boolean; recovered: boolean; ended: boolean;
      cancelAtPeriodEndBefore: boolean; cancelAtPeriodEndAfter: boolean;
    };

export type InvoiceUpsertResult = {
  result: "created" | "updated" | "unchanged";
  invoiceId: string;
  status: string;
  newlyPaid: boolean;
  newlyFailed: boolean;
  tenantId: string | null;
  subscriptionId: string | null;
  userId: string | null;
};

export type EmailJob = {
  id: string;
  template: string;
  userId: string | null;
  tenantId: string | null;
  locale: string;
  payload: Record<string, unknown>;
  attempts: number;
};

export interface BillingStore {
  paidCheckoutEnabled(): Promise<boolean>;
  getPlan(planKey: string, mode: StripeMode): Promise<PlanRecord | null>;
  getPlanById(planId: string, mode: StripeMode): Promise<PlanRecord | null>;
  getCustomerId(userId: string, mode: StripeMode): Promise<string | null>;
  saveCustomer(userId: string, mode: StripeMode, stripeCustomerId: string): Promise<void>;

  findOpenCheckout(userId: string, spaceType: string): Promise<PendingCheckout | null>;
  createPendingCheckout(input: {
    userId: string; spaceType: "teach" | "retreat"; planId: string; mode: StripeMode; expiresAt: Date; locale: string | null;
    quote: Record<string, unknown>;
  }): Promise<PendingCheckout>;
  getPendingCheckout(id: string): Promise<PendingCheckout | null>;
  getPendingBySession(mode: StripeMode, sessionId: string): Promise<PendingCheckout | null>;
  setCheckoutQuote(id: string, quote: Record<string, unknown>): Promise<void>;
  touchCheckout(id: string): Promise<void>;
  transitionCheckout(id: string, from: CheckoutStatus[], to: "checkout_created" | "awaiting_payment" | "canceled" | "expired", extra?: { sessionId?: string; customerId?: string }): Promise<boolean>;
  listStuckCheckouts(now: Date): Promise<PendingCheckout[]>;

  reserveCoupon(a: { userId: string; code: string; pendingCheckoutId: string; spaceType: string; planKey: string; mode: StripeMode }): Promise<ReservationResult>;
  releaseCoupon(pendingCheckoutId: string, reason: string): Promise<void>;
  expireStale(): Promise<{ checkouts: number; reservations: number }>;

  saveAcceptance(a: {
    userId: string; pendingCheckoutId: string; termsVersion: string; privacyVersion: string; billingTermsVersion: string;
    consentTextId: string; locale: string | null;
  }): Promise<void>;

  confirmPayment(a: { pendingCheckoutId: string; sessionId: string; customerId: string | null; subscriptionId: string | null }): Promise<string>;
  provision(a: { pendingCheckoutId: string; sub: ProvisionSubscriptionInput; spaceName: string; timezone: string }): Promise<ProvisionResult>;
  failCheckout(pendingCheckoutId: string, code: string): Promise<void>;

  claimEvent(a: { mode: StripeMode; eventId: string; type: string; customerId?: string | null; subscriptionId?: string | null }): Promise<"claimed" | "duplicate" | "in_progress">;
  finishEvent(a: { mode: StripeMode; eventId: string; status: "processed" | "failed" | "ignored"; errorCode?: string; errorDetail?: string; tenantId?: string | null; pendingCheckoutId?: string | null }): Promise<void>;

  applySubscriptionState(mode: StripeMode, stripeSubscriptionId: string, state: SubscriptionStateInput): Promise<SubscriptionStateResult>;
  upsertInvoice(invoice: Record<string, unknown>): Promise<InvoiceUpsertResult>;
  setInvoiceRefund(mode: StripeMode, invoiceId: string, refundedMinor: number): Promise<boolean>;
  recordDiscountCycle(subscriptionId: string, invoiceId: string, discountApplied: boolean, paidAt: Date): Promise<{ status: string; cyclesCompleted?: number }>;

  getSubscriptionByStripeId(mode: StripeMode, stripeSubscriptionId: string): Promise<SubscriptionRecord | null>;
  getSubscriptionById(id: string): Promise<SubscriptionRecord | null>;
  getRedemptionState(subscriptionId: string): Promise<RedemptionState | null>;
  setNextAction(subscriptionId: string, a: { action: string; at: Date | null; expectedChargeMinor: number | null }): Promise<void>;
  setNextPaymentAttempt(subscriptionId: string, at: Date | null): Promise<void>;
  applyLifecycle(now: Date): Promise<{ subscriptionId: string; tenantId: string; userId: string | null; action: string; at: Date }[]>;
  listActiveSubscriptionsDueForResync(now: Date): Promise<SubscriptionRecord[]>;

  enqueueEmail(a: {
    dedupeKey: string; template: string; userId: string | null; tenantId: string | null; subscriptionId: string | null;
    locale: string; payload: Record<string, unknown>; scheduledAt?: Date;
  }): Promise<boolean>;
  claimEmails(limit: number): Promise<EmailJob[]>;
  finishEmail(id: string, status: "sent" | "failed" | "skipped", providerId?: string | null, error?: string | null): Promise<void>;

  getUserContact(userId: string): Promise<{ email: string | null; locale: string | null } | null>;
  getTenantSummary(tenantId: string): Promise<{ name: string; productType: string } | null>;
}

// ---------------------------------------------------------------------------
// Supabase implementation (service-role client)
// ---------------------------------------------------------------------------

const toDate = (v: unknown) => (v ? new Date(String(v)) : null);

function mapPending(r: Record<string, unknown>): PendingCheckout {
  return {
    id: String(r.id), userId: (r.user_id as string | null) ?? null, spaceType: r.space_type as "teach" | "retreat",
    planId: String(r.plan_id), status: r.status as CheckoutStatus, stripeMode: r.stripe_mode as StripeMode,
    sessionId: (r.stripe_checkout_session_id as string | null) ?? null, customerId: (r.stripe_customer_id as string | null) ?? null,
    subscriptionId: (r.stripe_subscription_id as string | null) ?? null, quote: (r.quote as Record<string, unknown>) ?? {},
    locale: (r.locale as string | null) ?? null, tenantId: (r.tenant_id as string | null) ?? null,
    failureCode: (r.failure_code as string | null) ?? null, createdAt: new Date(String(r.created_at)),
    updatedAt: new Date(String(r.updated_at)), expiresAt: new Date(String(r.expires_at)),
  };
}

function mapPlan(r: Record<string, unknown>, mode: StripeMode): PlanRecord {
  return {
    id: String(r.id), planKey: String(r.plan_key), displayName: String(r.display_name), active: !!r.active,
    interval: r.billing_interval as "month" | "year", currency: String(r.currency).trim().toUpperCase(),
    unitAmountMinor: Number(r.unit_amount_minor), spaceTypes: (r.space_types as string[]) ?? [],
    stripeProductId: ((mode === "test" ? r.stripe_test_product_id : r.stripe_live_product_id) as string | null) ?? null,
    stripePriceId: ((mode === "test" ? r.stripe_test_price_id : r.stripe_live_price_id) as string | null) ?? null,
    entitlements: r.entitlements as PlanEntitlementBundle,
  };
}

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  if (res.data == null) throw new Error(`${what}: no data`);
  return res.data;
}

export function createSupabaseBillingStore(db: SupabaseClient): BillingStore {
  const rpc = async <T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> => {
    const r = await db.rpc(fn, args);
    if (r.error) throw new Error(`${fn}: ${r.error.message}`);
    return r.data as T;
  };

  return {
    async paidCheckoutEnabled() {
      const { data } = await db.from("billing_settings").select("paid_checkout_enabled").eq("singleton", true).maybeSingle();
      return data?.paid_checkout_enabled === true;
    },
    async getPlan(planKey, mode) {
      const { data } = await db.from("billing_plans").select("*").eq("plan_key", planKey).maybeSingle();
      return data ? mapPlan(data, mode) : null;
    },
    async getPlanById(planId, mode) {
      const { data } = await db.from("billing_plans").select("*").eq("id", planId).maybeSingle();
      return data ? mapPlan(data, mode) : null;
    },
    async getCustomerId(userId, mode) {
      const { data } = await db.from("billing_customers").select("stripe_customer_id").eq("user_id", userId).eq("stripe_mode", mode).maybeSingle();
      return data?.stripe_customer_id ?? null;
    },
    async saveCustomer(userId, mode, stripeCustomerId) {
      const { error } = await db.from("billing_customers").upsert(
        { user_id: userId, stripe_mode: mode, stripe_customer_id: stripeCustomerId, updated_at: new Date().toISOString() },
        { onConflict: "stripe_mode,stripe_customer_id" }
      );
      if (error) throw new Error(`saveCustomer: ${error.message}`);
    },

    async findOpenCheckout(userId, spaceType) {
      const { data } = await db.from("pending_space_checkouts").select("*").eq("user_id", userId).eq("space_type", spaceType)
        .in("status", ["created", "checkout_created", "awaiting_payment"]).maybeSingle();
      return data ? mapPending(data) : null;
    },
    async createPendingCheckout(i) {
      const ins = await db.from("pending_space_checkouts").insert({
        user_id: i.userId, space_type: i.spaceType, plan_id: i.planId, stripe_mode: i.mode, expires_at: i.expiresAt.toISOString(),
        locale: i.locale, quote: i.quote,
      }).select("*").single();
      if (ins.error?.code === "23505") {
        // Lost the race for the single open checkout: use the winner's.
        const existing = await this.findOpenCheckout(i.userId, i.spaceType);
        if (existing) return existing;
      }
      return mapPending(must(ins, "createPendingCheckout"));
    },
    async getPendingCheckout(id) {
      const { data } = await db.from("pending_space_checkouts").select("*").eq("id", id).maybeSingle();
      return data ? mapPending(data) : null;
    },
    async getPendingBySession(mode, sessionId) {
      const { data } = await db.from("pending_space_checkouts").select("*").eq("stripe_mode", mode).eq("stripe_checkout_session_id", sessionId).maybeSingle();
      return data ? mapPending(data) : null;
    },
    async setCheckoutQuote(id, quote) {
      await db.from("pending_space_checkouts").update({ quote, updated_at: new Date().toISOString() }).eq("id", id);
    },
    async touchCheckout(id) {
      await db.from("pending_space_checkouts").update({ updated_at: new Date().toISOString() }).eq("id", id);
    },
    async transitionCheckout(id, from, to, extra) {
      return rpc<boolean>("billing_transition_checkout", {
        p_id: id, p_allowed_from: from, p_to: to, p_session_id: extra?.sessionId ?? null, p_customer_id: extra?.customerId ?? null,
      });
    },
    async listStuckCheckouts(now) {
      const cutoff = new Date(now.getTime() - 2 * 60_000).toISOString();
      const { data } = await db.from("pending_space_checkouts").select("*")
        .or(`status.in.(payment_confirmed,provisioning,failed),and(status.in.(checkout_created,awaiting_payment),updated_at.lt.${cutoff})`)
        .not("stripe_checkout_session_id", "is", null).limit(50);
      return (data ?? []).map(mapPending);
    },

    async reserveCoupon(a) {
      const r = await rpc<Record<string, unknown>>("billing_reserve_coupon", {
        p_user_id: a.userId, p_code: a.code, p_pending_checkout_id: a.pendingCheckoutId, p_space_type: a.spaceType,
        p_plan_key: a.planKey, p_stripe_mode: a.mode,
      });
      if (!r.ok) return { ok: false, reason: r.reason as CouponRefusal };
      return {
        ok: true, reason: r.reason as "reserved" | "already_reserved", redemptionId: String(r.redemption_id), couponId: String(r.coupon_id),
        stripeCouponId: String(r.stripe_coupon_id), usageRule: String(r.usage_rule), reservationExpiresAt: new Date(String(r.reservation_expires_at)),
        terms: {
          discountType: r.discount_type as "percent" | "fixed_amount",
          percentOff: r.percent_off == null ? null : Number(r.percent_off),
          amountOffMinor: r.amount_off_minor == null ? null : Number(r.amount_off_minor),
          currency: (r.currency as string | null)?.trim() ?? null,
          durationType: r.duration_type as "once" | "repeating" | "forever",
          durationCycles: r.duration_cycles == null ? null : Number(r.duration_cycles),
        },
      };
    },
    async releaseCoupon(pendingCheckoutId, reason) {
      await rpc("billing_release_coupon_reservation", { p_pending_checkout_id: pendingCheckoutId, p_reason: reason });
    },
    async expireStale() {
      const checkouts = await rpc<number>("billing_expire_open_checkouts", {});
      const reservations = await rpc<number>("billing_expire_stale_reservations", {});
      return { checkouts, reservations };
    },

    async saveAcceptance(a) {
      // One acceptance record per checkout (a partial unique index on pending_checkout_id). PostgREST cannot target a
      // partial index with ON CONFLICT, so insert and treat "already stored" as success: the first acceptance is the
      // evidence and must never be overwritten by a retry.
      const { error } = await db.from("billing_acceptances").insert({
        user_id: a.userId, pending_checkout_id: a.pendingCheckoutId, terms_version: a.termsVersion, privacy_version: a.privacyVersion,
        billing_terms_version: a.billingTermsVersion, immediate_service_consent: true, withdrawal_acknowledged: true,
        consent_text_id: a.consentTextId, locale: a.locale,
      });
      if (error && error.code !== "23505") throw new Error(`saveAcceptance: ${error.message}`);
    },

    async confirmPayment(a) {
      return rpc<string>("billing_confirm_checkout_payment", {
        p_pending_checkout_id: a.pendingCheckoutId, p_session_id: a.sessionId, p_customer_id: a.customerId, p_subscription_id: a.subscriptionId,
      });
    },
    async provision(a) {
      const r = await rpc<Record<string, unknown>>("billing_provision_paid_space", {
        p_pending_checkout_id: a.pendingCheckoutId, p_sub: a.sub, p_space_name: a.spaceName, p_timezone: a.timezone,
      });
      const coupon = r.coupon as { status?: string } | null | undefined;
      return {
        status: r.status as "provisioned" | "already_provisioned", tenantId: String(r.tenant_id),
        subscriptionId: (r.subscription_id as string | null) ?? null, userId: (r.user_id as string | null) ?? null,
        spaceType: (r.space_type as "teach" | "retreat" | null) ?? null, couponStatus: coupon?.status ?? null,
      };
    },
    async failCheckout(id, code) {
      await rpc("billing_fail_checkout", { p_pending_checkout_id: id, p_code: code });
    },

    async claimEvent(a) {
      return rpc<"claimed" | "duplicate" | "in_progress">("billing_claim_event", {
        p_mode: a.mode, p_event_id: a.eventId, p_type: a.type, p_customer_id: a.customerId ?? null, p_subscription_id: a.subscriptionId ?? null,
      });
    },
    async finishEvent(a) {
      await rpc("billing_finish_event", {
        p_mode: a.mode, p_event_id: a.eventId, p_status: a.status, p_error_code: a.errorCode ?? null, p_error_detail: a.errorDetail ?? null,
        p_tenant_id: a.tenantId ?? null, p_pending_checkout_id: a.pendingCheckoutId ?? null,
      });
    },

    async applySubscriptionState(mode, id, state) {
      const r = await rpc<Record<string, unknown>>("billing_apply_subscription_state", { p_mode: mode, p_stripe_subscription_id: id, p_s: state });
      if (r.result === "unknown_subscription") return { result: "unknown_subscription" };
      if (r.result === "ignored_exempt") return { result: "ignored_exempt", tenantId: String(r.tenant_id) };
      return {
        result: "applied", subscriptionId: String(r.subscription_id), tenantId: String(r.tenant_id), userId: (r.user_id as string | null) ?? null,
        statusBefore: String(r.status_before), statusAfter: String(r.status_after), failedStarted: !!r.failed_started,
        recovered: !!r.recovered, ended: !!r.ended, cancelAtPeriodEndBefore: !!r.cancel_at_period_end_before,
        cancelAtPeriodEndAfter: !!r.cancel_at_period_end_after,
      };
    },
    async upsertInvoice(invoice) {
      const r = await rpc<Record<string, unknown>>("billing_upsert_invoice", { p: invoice });
      return {
        result: r.result as "created" | "updated" | "unchanged", invoiceId: String(r.invoice_id), status: String(r.status),
        newlyPaid: !!r.newly_paid, newlyFailed: !!r.newly_failed, tenantId: (r.tenant_id as string | null) ?? null,
        subscriptionId: (r.subscription_id as string | null) ?? null, userId: (r.user_id as string | null) ?? null,
      };
    },
    async setInvoiceRefund(mode, invoiceId, refundedMinor) {
      return rpc<boolean>("billing_set_invoice_refund", { p_mode: mode, p_invoice_id: invoiceId, p_refunded_minor: refundedMinor });
    },
    async recordDiscountCycle(subscriptionId, invoiceId, discountApplied, paidAt) {
      const r = await rpc<Record<string, unknown>>("billing_record_discount_cycle", {
        p_subscription_id: subscriptionId, p_invoice_id: invoiceId, p_discount_applied: discountApplied, p_paid_at: paidAt.toISOString(),
      });
      return { status: String(r.status), cyclesCompleted: r.cycles_completed == null ? undefined : Number(r.cycles_completed) };
    },

    async getSubscriptionByStripeId(mode, id) {
      const { data } = await db.from("space_subscriptions").select(SUBSCRIPTION_SELECT).eq("stripe_mode", mode).eq("stripe_subscription_id", id).maybeSingle();
      return data ? toSubscriptionRecord(data as unknown as SubscriptionRow) : null;
    },
    async getSubscriptionById(id) {
      const { data } = await db.from("space_subscriptions").select(SUBSCRIPTION_SELECT).eq("id", id).maybeSingle();
      return data ? toSubscriptionRecord(data as unknown as SubscriptionRow) : null;
    },
    async getRedemptionState(subscriptionId) {
      const { data } = await db.from("coupon_redemptions").select("*, coupons(code)").eq("space_subscription_id", subscriptionId)
        .in("status", ["redeemed", "completed", "canceled"]).order("redeemed_at", { ascending: false }).limit(1).maybeSingle();
      if (!data) return null;
      return {
        status: data.status, couponCode: (data.coupons as { code?: string } | null)?.code ?? null, lastCycleInvoiceId: data.last_cycle_invoice_id ?? null, cyclesCompleted: data.cycles_completed, cyclesTotal: data.cycles_total, discountEndsAt: toDate(data.discount_ends_at),
        terms: {
          discountType: data.discount_type, percentOff: data.percent_off == null ? null : Number(data.percent_off),
          amountOffMinor: data.amount_off_minor, currency: data.currency ? String(data.currency).trim() : null,
          durationType: data.duration_type, durationCycles: data.duration_cycles,
        },
      };
    },
    async setNextAction(subscriptionId, a) {
      await rpc("billing_set_next_action", {
        p_subscription_id: subscriptionId, p_action: a.action, p_at: a.at ? a.at.toISOString() : null, p_expected_charge_minor: a.expectedChargeMinor,
      });
    },
    async setNextPaymentAttempt(subscriptionId, at) {
      await rpc("billing_set_next_payment_attempt", { p_subscription_id: subscriptionId, p_at: at ? at.toISOString() : null });
    },
    async applyLifecycle(now) {
      const rows = await rpc<{ subscription_id: string; tenant_id: string; user_id: string | null; action: string; occurred_at: string }[]>("billing_apply_lifecycle", { p_now: now.toISOString() });
      return (rows ?? []).map((r) => ({ subscriptionId: r.subscription_id, tenantId: r.tenant_id, userId: r.user_id, action: r.action, at: new Date(r.occurred_at) }));
    },
    async listActiveSubscriptionsDueForResync(now) {
      const cutoff = new Date(now.getTime() - 2 * 3600_000).toISOString();
      const { data } = await db.from("space_subscriptions").select(SUBSCRIPTION_SELECT)
        .in("status", ["active", "trialing", "past_due", "unpaid"]).not("stripe_subscription_id", "is", null).lt("current_period_end", cutoff).limit(50);
      return (data ?? []).map((r) => toSubscriptionRecord(r as unknown as SubscriptionRow));
    },

    async enqueueEmail(a) {
      return rpc<boolean>("billing_enqueue_email", {
        p_dedupe_key: a.dedupeKey, p_template: a.template, p_user_id: a.userId, p_tenant_id: a.tenantId, p_subscription_id: a.subscriptionId,
        p_locale: a.locale, p_payload: a.payload, p_scheduled_at: (a.scheduledAt ?? new Date()).toISOString(),
      });
    },
    async claimEmails(limit) {
      const rows = await rpc<Record<string, unknown>[]>("billing_claim_emails", { p_limit: limit });
      return (rows ?? []).map((r) => ({
        id: String(r.id), template: String(r.template), userId: (r.user_id as string | null) ?? null, tenantId: (r.tenant_id as string | null) ?? null,
        locale: String(r.locale), payload: (r.payload as Record<string, unknown>) ?? {}, attempts: Number(r.attempts),
      }));
    },
    async finishEmail(id, status, providerId, error) {
      await rpc("billing_finish_email", { p_id: id, p_status: status, p_provider_id: providerId ?? null, p_error: error ?? null });
    },

    async getUserContact(userId) {
      const { data, error } = await db.auth.admin.getUserById(userId);
      if (error || !data.user) return null;
      const meta = (data.user.user_metadata ?? {}) as { locale?: string };
      return { email: data.user.email ?? null, locale: meta.locale ?? null };
    },
    async getTenantSummary(tenantId) {
      const { data } = await db.from("tenants").select("name, product_type").eq("id", tenantId).maybeSingle();
      return data ? { name: data.name, productType: data.product_type } : null;
    },
  };
}
