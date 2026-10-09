"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AdminAuthError, requireAdminAction, type AdminContext } from "@/lib/billing/admin/auth";
import { couponFormToRaw, draftOfRaw } from "@/lib/billing/admin/forms";
import { requiresStepUp, type AdminAction } from "@/lib/billing/admin/policy";
import {
  adminClearInternalExempt, adminCreateCoupon, adminGrantAdmin, adminReconcileCheckout, adminResyncSubscription, adminRevokeAdmin,
  adminSetCouponActive, adminSetInternalExempt, adminSetPaidCheckout, adminSyncCouponToStripe, adminSyncPlanToStripe, adminUpdateCoupon, type OpResult,
} from "@/lib/billing/admin/service";
import { getBillingDeps, isStripeConfigured } from "@/lib/billing/deps.server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Every Admin mutation enters here. Each action:
 *   1. re-authorises on the server (session + admin_users + AAL2 [+ recent MFA when
 *      policy.requiresStepUp says so]) - the UI hiding a button is never the protection;
 *   2. maps a denial to a safe result the UI can act on (e.g. "re-verify your code");
 *   3. delegates to a service that validates again, writes the audit row, and reports failure
 *      if the audit write fails.
 */
export type AdminActionResult = OpResult<unknown> | { ok: false; error: "unauthenticated" | "not_admin" | "mfa_required" | "step_up_required" };

async function authorise(action: AdminAction, ctx: { draft?: ReturnType<typeof draftOfRaw>; couponHasRedemptions?: boolean } = {}): Promise<{ ok: true; admin: AdminContext } | Extract<AdminActionResult, { ok: false }>> {
  try {
    return { ok: true, admin: await requireAdminAction({ recentMfa: requiresStepUp(action, ctx) }) };
  } catch (e) {
    if (!(e instanceof AdminAuthError)) throw e;
    if (e.denial === "step_up_required") return { ok: false, error: "step_up_required" };
    if (e.denial === "mfa_challenge_required" || e.denial === "mfa_enroll_required") return { ok: false, error: "mfa_required" };
    return { ok: false, error: e.denial === "unauthenticated" ? "unauthenticated" : "not_admin" };
  }
}

const deps = () => (isStripeConfigured() ? getBillingDeps() : null);
const done = (r: AdminActionResult): AdminActionResult => {
  if (r.ok) revalidatePath("/admin/billing", "layout");
  return r;
};
const uuid = z.string().uuid();

export async function createCouponAction(_prev: AdminActionResult | null, fd: FormData): Promise<AdminActionResult> {
  const raw = couponFormToRaw(fd);
  const a = await authorise("coupon.create", { draft: draftOfRaw(raw) });
  if (!a.ok) return a;
  return done(await adminCreateCoupon(a.admin, createAdminClient(), deps(), raw));
}

export async function updateCouponAction(couponId: string, _prev: AdminActionResult | null, fd: FormData): Promise<AdminActionResult> {
  if (!uuid.safeParse(couponId).success) return { ok: false, error: "invalid" };
  const db = createAdminClient();
  const { count } = await db.from("coupon_redemptions").select("*", { count: "exact", head: true }).eq("coupon_id", couponId).in("status", ["reserved", "redeemed", "completed", "canceled"]);
  const a = await authorise("coupon.update", { couponHasRedemptions: (count ?? 0) > 0 });
  if (!a.ok) return a;
  return done(await adminUpdateCoupon(a.admin, db, deps(), couponId, couponFormToRaw(fd)));
}

export async function setCouponActiveAction(couponId: string, active: boolean): Promise<AdminActionResult> {
  if (!uuid.safeParse(couponId).success) return { ok: false, error: "invalid" };
  const a = await authorise(active ? "coupon.enable" : "coupon.disable");
  if (!a.ok) return a;
  return done(await adminSetCouponActive(a.admin, createAdminClient(), couponId, active));
}

export async function syncCouponAction(couponId: string): Promise<AdminActionResult> {
  if (!uuid.safeParse(couponId).success) return { ok: false, error: "invalid" };
  const a = await authorise("coupon.sync_stripe");
  if (!a.ok) return a;
  const d = deps();
  if (!d) return { ok: false, error: "stripe_not_configured" };
  return done(await adminSyncCouponToStripe(a.admin, createAdminClient(), d, couponId));
}

export async function syncPlanAction(): Promise<AdminActionResult> {
  const a = await authorise("plan.sync_stripe");
  if (!a.ok) return a;
  const d = deps();
  if (!d) return { ok: false, error: "stripe_not_configured" };
  return done(await adminSyncPlanToStripe(a.admin, createAdminClient(), d));
}

export async function setExemptAction(tenantId: string, _prev: AdminActionResult | null, fd: FormData): Promise<AdminActionResult> {
  if (!uuid.safeParse(tenantId).success) return { ok: false, error: "invalid" };
  const a = await authorise("subscription.exempt_set");
  if (!a.ok) return a;
  const until = String(fd.get("expiresAt") ?? "").trim();
  const expires = until ? new Date(until) : null;
  if (expires && Number.isNaN(expires.getTime())) return { ok: false, error: "invalid", fields: { expiresAt: "invalid date" } };
  return done(await adminSetInternalExempt(a.admin, createAdminClient(), tenantId, String(fd.get("reason") ?? ""), expires));
}

export async function clearExemptAction(tenantId: string, _prev: AdminActionResult | null, fd: FormData): Promise<AdminActionResult> {
  if (!uuid.safeParse(tenantId).success) return { ok: false, error: "invalid" };
  const a = await authorise("subscription.exempt_clear");
  if (!a.ok) return a;
  return done(await adminClearInternalExempt(a.admin, createAdminClient(), tenantId, String(fd.get("reason") ?? "")));
}

export async function setPaidCheckoutAction(enabled: boolean): Promise<AdminActionResult> {
  const a = await authorise("settings.paid_checkout");
  if (!a.ok) return a;
  return done(await adminSetPaidCheckout(a.admin, createAdminClient(), deps(), enabled));
}

export async function grantAdminAction(_prev: AdminActionResult | null, fd: FormData): Promise<AdminActionResult> {
  const a = await authorise("admin.grant");
  if (!a.ok) return a;
  const role = fd.get("role") === "owner" ? "owner" : "billing_admin";
  return done(await adminGrantAdmin(a.admin, createAdminClient(), String(fd.get("email") ?? ""), role));
}

export async function revokeAdminAction(targetUserId: string): Promise<AdminActionResult> {
  if (!uuid.safeParse(targetUserId).success) return { ok: false, error: "invalid" };
  const a = await authorise("admin.revoke");
  if (!a.ok) return a;
  return done(await adminRevokeAdmin(a.admin, createAdminClient(), targetUserId));
}

/** Support tools: re-read Stripe's truth. Audited; need AAL2 but not a fresh code (no money or access is changed by hand). */
export async function resyncSubscriptionAction(stripeSubscriptionId: string): Promise<AdminActionResult> {
  const a = await authorise("coupon.sync_stripe"); // same (no step-up) tier
  if (!a.ok) return a;
  const d = deps();
  if (!d) return { ok: false, error: "stripe_not_configured" };
  if (!/^sub_[A-Za-z0-9]+$/.test(stripeSubscriptionId)) return { ok: false, error: "invalid" };
  return done(await adminResyncSubscription(a.admin, d, stripeSubscriptionId));
}

export async function reconcileCheckoutAction(pendingCheckoutId: string): Promise<AdminActionResult> {
  const a = await authorise("coupon.sync_stripe");
  if (!a.ok) return a;
  const d = deps();
  if (!d) return { ok: false, error: "stripe_not_configured" };
  if (!uuid.safeParse(pendingCheckoutId).success) return { ok: false, error: "invalid" };
  return done(await adminReconcileCheckout(a.admin, d, pendingCheckoutId));
}
