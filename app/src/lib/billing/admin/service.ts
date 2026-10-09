import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BillingDeps } from "../deps";
import { BASE_PLAN_KEY } from "../constants";
import { reconcileCheckout } from "../reconcile";
import { syncSubscription } from "../sync";
import type { AdminContext } from "./auth";
import { writeAudit } from "./audit";
import { checkCouponUpdate, couponInputSchema, type CouponComparable, type CouponInput } from "./policy";

/**
 * Admin mutations. Each function:
 *   - assumes the CALLER (the server action) already passed requireAdminAction()
 *     with the right step-up level for this action (see policy.requiresStepUp);
 *   - validates every input again on the server (forms are never trusted);
 *   - writes an audit row, and reports failure if that write fails - an unaudited
 *     Admin mutation is never reported as done;
 *   - never touches Stripe secrets, TOTP secrets or card data.
 * Returns plain result objects so a server action can hand them to the UI.
 */

export type OpResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string; fields?: Record<string, string> };
const fail = (error: string, fields?: Record<string, string>): { ok: false; error: string; fields?: Record<string, string> } => ({ ok: false, error, fields });

const modeColumn = (mode: "test" | "live") => (mode === "test" ? "stripe_test_coupon_id" : "stripe_live_coupon_id");

type CouponRow = {
  id: string; code: string; discount_type: "percent" | "fixed_amount"; percent_off: number | null; amount_off_minor: number | null;
  currency: string | null; usage_rule: string; duration_type: "once" | "repeating" | "forever"; duration_cycles: number | null;
  global_max_redemptions: number | null;
} & Record<string, unknown>;

const comparableOfRow = (c: CouponRow): CouponComparable => ({
  discountType: c.discount_type, percentOff: c.percent_off == null ? null : Number(c.percent_off), amountOffMinor: c.amount_off_minor,
  currency: c.currency ? String(c.currency).trim() : null, durationType: c.duration_type, durationCycles: c.duration_cycles, usageRule: c.usage_rule,
});
const comparableOfInput = (i: CouponInput): CouponComparable => ({
  discountType: i.discountType, percentOff: i.percentOff ?? null, amountOffMinor: i.amountOffMinor ?? null, currency: i.currency ?? null,
  durationType: i.durationType, durationCycles: i.durationCycles ?? null, usageRule: i.usageRule,
});

function rowFromInput(i: CouponInput) {
  return {
    code: i.code, normalized_code: i.code.toUpperCase(), description: i.description ?? null,
    discount_type: i.discountType, percent_off: i.discountType === "percent" ? i.percentOff : null,
    amount_off_minor: i.discountType === "fixed_amount" ? i.amountOffMinor : null, currency: i.discountType === "fixed_amount" ? i.currency : null,
    usage_rule: i.usageRule, duration_type: i.durationType, duration_cycles: i.durationType === "repeating" ? i.durationCycles : null,
    valid_from: i.validFrom ?? null, valid_until: i.validUntil ?? null, global_max_redemptions: i.globalMaxRedemptions ?? null,
    plan_keys: i.planKeys?.length ? i.planKeys : null, space_types: i.spaceTypes?.length ? i.spaceTypes : null,
  };
}

async function createStripeCoupon(deps: BillingDeps, id: string, i: CouponInput): Promise<string> {
  const { id: stripeId } = await deps.stripe.createCoupon({
    internalCouponId: id, name: i.code, percentOff: i.discountType === "percent" ? i.percentOff ?? null : null,
    amountOffMinor: i.discountType === "fixed_amount" ? i.amountOffMinor ?? null : null, currency: i.discountType === "fixed_amount" ? i.currency ?? null : null,
    duration: i.durationType, durationInMonths: i.durationType === "repeating" ? i.durationCycles ?? null : null,
  });
  return stripeId;
}

function zodFields(err: { issues: { path: PropertyKey[]; message: string }[] }): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) out[String(issue.path[0] ?? "form")] ??= issue.message;
  return out;
}

export async function adminCreateCoupon(admin: AdminContext, db: SupabaseClient, deps: BillingDeps | null, raw: unknown): Promise<OpResult<{ id: string }>> {
  const parsed = couponInputSchema.safeParse(raw);
  if (!parsed.success) return fail("invalid", zodFields(parsed.error));
  const input = parsed.data;

  const ins = await db.from("coupons").insert({ ...rowFromInput(input), created_by: admin.userId }).select("*").single();
  if (ins.error) return ins.error.code === "23505" ? fail("code_taken", { code: "already exists" }) : fail("save_failed");
  const row = ins.data as CouponRow;

  try {
    let stripeId: string | null = null;
    if (deps) {
      stripeId = await createStripeCoupon(deps, row.id, input);
      await db.from("coupons").update({ [modeColumn(deps.stripe.mode)]: stripeId, updated_at: new Date().toISOString() }).eq("id", row.id);
    }
    await writeAudit({ adminUserId: admin.userId, requestId: admin.requestId ?? null, action: "coupon.create", targetType: "coupon", targetId: row.id, after: { ...rowFromInput(input), stripeCouponSynced: !!stripeId } });
  } catch {
    // Nothing has used this coupon yet: undo completely rather than leave an unsynced/unaudited definition.
    await db.from("coupons").delete().eq("id", row.id);
    return fail("sync_failed");
  }
  return { ok: true, data: { id: row.id } };
}

export async function adminUpdateCoupon(admin: AdminContext, db: SupabaseClient, deps: BillingDeps | null, couponId: string, raw: unknown): Promise<OpResult> {
  const parsed = couponInputSchema.safeParse(raw);
  if (!parsed.success) return fail("invalid", zodFields(parsed.error));
  const input = parsed.data;

  const { data: before } = await db.from("coupons").select("*").eq("id", couponId).maybeSingle();
  if (!before) return fail("not_found");
  const { data: used } = await db.from("coupon_redemptions").select("status").eq("coupon_id", couponId).in("status", ["reserved", "redeemed", "completed", "canceled"]);
  const usedCount = (used ?? []).length;

  const check = checkCouponUpdate({
    before: comparableOfRow(before as CouponRow), after: comparableOfInput(input), used: usedCount > 0, usedCount, newGlobalMax: input.globalMaxRedemptions ?? null,
  });
  if (!check.ok) return fail(check.reason);

  const patch: Record<string, unknown> = { ...rowFromInput(input), updated_at: new Date().toISOString() };
  // The code itself is the customer-facing handle and the audit key: it can never be re-pointed once used.
  if (usedCount > 0) { patch.code = before.code; patch.normalized_code = before.normalized_code; }

  if (check.recreateStripeCoupon && deps) {
    try { patch[modeColumn(deps.stripe.mode)] = await createStripeCoupon(deps, couponId, input); } catch { return fail("sync_failed"); }
  }
  const upd = await db.from("coupons").update(patch).eq("id", couponId);
  if (upd.error) return upd.error.code === "23505" ? fail("code_taken", { code: "already exists" }) : fail("save_failed");

  try {
    await writeAudit({ adminUserId: admin.userId, requestId: admin.requestId ?? null, action: "coupon.update", targetType: "coupon", targetId: couponId, before, after: patch });
  } catch {
    await db.from("coupons").update(before as Record<string, unknown>).eq("id", couponId); // unaudited => revert
    return fail("audit_failed");
  }
  return { ok: true, data: undefined };
}

/** Disable/enable affects NEW checkouts only: existing redemptions keep their snapshotted terms. */
export async function adminSetCouponActive(admin: AdminContext, db: SupabaseClient, couponId: string, active: boolean): Promise<OpResult> {
  const { data: before } = await db.from("coupons").select("id, code, active").eq("id", couponId).maybeSingle();
  if (!before) return fail("not_found");
  if (before.active === active) return { ok: true, data: undefined };
  const upd = await db.from("coupons").update({ active, updated_at: new Date().toISOString() }).eq("id", couponId);
  if (upd.error) return fail("save_failed");
  try {
    await writeAudit({ adminUserId: admin.userId, requestId: admin.requestId ?? null, action: active ? "coupon.enable" : "coupon.disable", targetType: "coupon", targetId: couponId, before: { active: before.active }, after: { active } });
  } catch {
    await db.from("coupons").update({ active: before.active }).eq("id", couponId);
    return fail("audit_failed");
  }
  return { ok: true, data: undefined };
}

/** Make sure a coupon has its Stripe counterpart in THIS deployment's mode (e.g. after switching to Live). */
export async function adminSyncCouponToStripe(admin: AdminContext, db: SupabaseClient, deps: BillingDeps, couponId: string): Promise<OpResult> {
  const { data: c } = await db.from("coupons").select("*").eq("id", couponId).maybeSingle();
  if (!c) return fail("not_found");
  const col = modeColumn(deps.stripe.mode);
  if (c[col]) return { ok: true, data: undefined };
  const row = c as CouponRow;
  const input = {
    code: row.code, discountType: row.discount_type, percentOff: row.percent_off, amountOffMinor: row.amount_off_minor, currency: row.currency ? String(row.currency).trim() : null,
    usageRule: row.usage_rule, durationType: row.duration_type, durationCycles: row.duration_cycles,
  } as CouponInput;
  try {
    const stripeId = await createStripeCoupon(deps, couponId, input);
    await db.from("coupons").update({ [col]: stripeId, updated_at: new Date().toISOString() }).eq("id", couponId);
    await writeAudit({ adminUserId: admin.userId, requestId: admin.requestId ?? null, action: "coupon.sync_stripe", targetType: "coupon", targetId: couponId, after: { mode: deps.stripe.mode } });
  } catch {
    return fail("sync_failed");
  }
  return { ok: true, data: undefined };
}

/** Create/verify the base plan's Stripe Product + Price in this mode and persist their ids. */
export async function adminSyncPlanToStripe(admin: AdminContext, db: SupabaseClient, deps: BillingDeps): Promise<OpResult<{ priceId: string }>> {
  const plan = await deps.store.getPlan(BASE_PLAN_KEY, deps.stripe.mode);
  if (!plan) return fail("not_found");
  try {
    const { productId, priceId } = await deps.stripe.ensureProductAndPrice({
      planKey: plan.planKey, displayName: plan.displayName, amountMinor: plan.unitAmountMinor, currency: plan.currency, interval: plan.interval,
      existingProductId: plan.stripeProductId, existingPriceId: plan.stripePriceId,
    });
    const check = await deps.stripe.checkPrice({ priceId, expectedAmountMinor: plan.unitAmountMinor, currency: plan.currency, interval: plan.interval });
    if (!check.ok) return fail(`price_drift:${check.reason}`);
    const cols = deps.stripe.mode === "test" ? { stripe_test_product_id: productId, stripe_test_price_id: priceId } : { stripe_live_product_id: productId, stripe_live_price_id: priceId };
    await db.from("billing_plans").update({ ...cols, updated_at: new Date().toISOString() }).eq("plan_key", plan.planKey);
    await writeAudit({ adminUserId: admin.userId, requestId: admin.requestId ?? null, action: "plan.sync_stripe", targetType: "plan", targetId: plan.planKey, before: { productId: plan.stripeProductId, priceId: plan.stripePriceId }, after: { mode: deps.stripe.mode, productId, priceId } });
    return { ok: true, data: { priceId } };
  } catch {
    return fail("sync_failed");
  }
}

/** Narrow, audited exemption: who, why, when, and (optionally) until when. Never a generic "make it active". */
export async function adminSetInternalExempt(admin: AdminContext, db: SupabaseClient, tenantId: string, reason: string, expiresAt: Date | null): Promise<OpResult> {
  if (reason.trim().length < 5) return fail("reason_required", { reason: "state why (min 5 characters)" });
  const rpc = await db.rpc("billing_set_internal_exempt", { p_tenant_id: tenantId, p_reason: reason.trim(), p_actor: admin.userId, p_expires_at: expiresAt ? expiresAt.toISOString() : null });
  if (rpc.error) return fail(/paid subscription/.test(rpc.error.message) ? "has_paid_subscription" : "save_failed");
  try {
    await writeAudit({ adminUserId: admin.userId, requestId: admin.requestId ?? null, action: "subscription.exempt_set", targetType: "tenant", targetId: tenantId, after: { expiresAt: expiresAt?.toISOString() ?? null }, reason });
  } catch {
    await db.rpc("billing_clear_internal_exempt", { p_tenant_id: tenantId });
    return fail("audit_failed");
  }
  return { ok: true, data: undefined };
}

export async function adminClearInternalExempt(admin: AdminContext, db: SupabaseClient, tenantId: string, reason: string): Promise<OpResult> {
  if (reason.trim().length < 5) return fail("reason_required", { reason: "state why (min 5 characters)" });
  const rpc = await db.rpc("billing_clear_internal_exempt", { p_tenant_id: tenantId });
  if (rpc.error) return fail("save_failed");
  await writeAudit({ adminUserId: admin.userId, requestId: admin.requestId ?? null, action: "subscription.exempt_clear", targetType: "tenant", targetId: tenantId, reason });
  return { ok: true, data: undefined };
}

/**
 * The server-side launch switch for paid checkout. Enabling it is refused unless the technical prerequisites hold
 * (Stripe configured for this mode, the plan has a verified Stripe price). The LEGAL/TAX gates are a documented manual
 * checklist (docs/billing/LAUNCH-GATES.md) - code cannot verify them, which is exactly why the owner flips this deliberately.
 */
export async function adminSetPaidCheckout(admin: AdminContext, db: SupabaseClient, deps: BillingDeps | null, enabled: boolean): Promise<OpResult> {
  if (enabled) {
    if (!deps) return fail("stripe_not_configured");
    const plan = await deps.store.getPlan(BASE_PLAN_KEY, deps.stripe.mode);
    if (!plan?.stripePriceId) return fail("plan_not_synced");
    const check = await deps.stripe.checkPrice({ priceId: plan.stripePriceId, expectedAmountMinor: plan.unitAmountMinor, currency: plan.currency, interval: plan.interval });
    if (!check.ok) return fail(`price_drift:${check.reason}`);
  }
  const { data: before } = await db.from("billing_settings").select("paid_checkout_enabled").eq("singleton", true).maybeSingle();
  const upd = await db.from("billing_settings").update({ paid_checkout_enabled: enabled, updated_by: admin.userId, updated_at: new Date().toISOString() }).eq("singleton", true);
  if (upd.error) return fail("save_failed");
  try {
    await writeAudit({ adminUserId: admin.userId, requestId: admin.requestId ?? null, action: "settings.paid_checkout", targetType: "settings", targetId: "paid_checkout", before: before ?? undefined, after: { paid_checkout_enabled: enabled } });
  } catch {
    await db.from("billing_settings").update({ paid_checkout_enabled: before?.paid_checkout_enabled ?? false }).eq("singleton", true);
    return fail("audit_failed");
  }
  return { ok: true, data: undefined };
}

export async function adminGrantAdmin(admin: AdminContext, db: SupabaseClient, email: string, role: "owner" | "billing_admin"): Promise<OpResult> {
  if (admin.role !== "owner") return fail("owner_only");
  const target = await findUserByEmail(db, email);
  if (!target) return fail("user_not_found");
  const up = await db.from("admin_users").upsert({ user_id: target, role, created_by: admin.userId, disabled_at: null }, { onConflict: "user_id" });
  if (up.error) return fail("save_failed");
  await writeAudit({ adminUserId: admin.userId, requestId: admin.requestId ?? null, action: "admin.grant", targetType: "admin_user", targetId: target, after: { role } });
  return { ok: true, data: undefined };
}

export async function adminRevokeAdmin(admin: AdminContext, db: SupabaseClient, targetUserId: string): Promise<OpResult> {
  if (admin.role !== "owner") return fail("owner_only");
  if (targetUserId === admin.userId) return fail("cannot_revoke_self");
  const { data: owners } = await db.from("admin_users").select("user_id").eq("role", "owner").is("disabled_at", null);
  if ((owners ?? []).every((o) => o.user_id === targetUserId)) return fail("last_owner");
  const upd = await db.from("admin_users").update({ disabled_at: new Date().toISOString() }).eq("user_id", targetUserId);
  if (upd.error) return fail("save_failed");
  await writeAudit({ adminUserId: admin.userId, requestId: admin.requestId ?? null, action: "admin.revoke", targetType: "admin_user", targetId: targetUserId });
  return { ok: true, data: undefined };
}

async function findUserByEmail(db: SupabaseClient, email: string): Promise<string | null> {
  const wanted = email.trim().toLowerCase();
  for (let page = 1; page <= 10; page++) {
    const { data } = await db.auth.admin.listUsers({ page, perPage: 200 });
    const hit = data?.users.find((u) => u.email?.toLowerCase() === wanted);
    if (hit) return hit.id;
    if (!data || data.users.length < 200) break;
  }
  return null;
}

/** Support tools (audited, no money impact): re-read Stripe's truth for one subscription / one checkout. */
export async function adminResyncSubscription(admin: AdminContext, deps: BillingDeps, stripeSubscriptionId: string): Promise<OpResult> {
  try { await syncSubscription(deps, stripeSubscriptionId); } catch { return fail("sync_failed"); }
  await writeAudit({ adminUserId: admin.userId, requestId: admin.requestId ?? null, action: "subscription.resync", targetType: "subscription", targetId: stripeSubscriptionId });
  return { ok: true, data: undefined };
}

export async function adminReconcileCheckout(admin: AdminContext, deps: BillingDeps, pendingCheckoutId: string): Promise<OpResult> {
  try { await reconcileCheckout(deps, pendingCheckoutId); } catch { return fail("reconcile_failed"); }
  await writeAudit({ adminUserId: admin.userId, requestId: admin.requestId ?? null, action: "checkout.reconcile", targetType: "checkout", targetId: pendingCheckoutId });
  return { ok: true, data: undefined };
}
