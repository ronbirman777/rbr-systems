import { z } from "zod";

/**
 * Admin policy as pure, tested rules: which actions demand a recent MFA
 * step-up, what a coupon definition may contain, and which of its fields stay
 * immutable once customers have been promised them.
 */

export const ADMIN_ACTIONS = [
  "coupon.create", "coupon.update", "coupon.disable", "coupon.enable", "coupon.sync_stripe",
  "plan.sync_stripe", "subscription.exempt_set", "subscription.exempt_clear",
  "settings.paid_checkout", "admin.grant", "admin.revoke",
] as const;
export type AdminAction = (typeof ADMIN_ACTIONS)[number];

/** A percent at or above this, or a 'forever' duration, counts as a "very large discount" and needs step-up. */
export const LARGE_DISCOUNT_PERCENT = 50;

export type CouponDraft = {
  discountType: "percent" | "fixed_amount";
  percentOff: number | null;
  amountOffMinor: number | null;
  durationType: "once" | "repeating" | "forever";
};

/**
 * Which actions need a RECENT second factor (not merely an AAL2 session).
 * Everything that changes money terms, access, the launch flag or Admin
 * membership does; routine reads and low-risk coupon edits do not.
 */
export function requiresStepUp(action: AdminAction, ctx: { draft?: CouponDraft; couponHasRedemptions?: boolean } = {}): boolean {
  switch (action) {
    case "coupon.create":
      return !!ctx.draft && (ctx.draft.durationType === "forever" || (ctx.draft.discountType === "percent" && (ctx.draft.percentOff ?? 0) >= LARGE_DISCOUNT_PERCENT));
    case "coupon.update":
      // Editing something customers have already used.
      return !!ctx.couponHasRedemptions;
    case "coupon.disable":
    case "coupon.enable":
    case "coupon.sync_stripe":
      return false;
    default:
      return true; // plan sync, exemptions, the paid-checkout flag, Admin grants/revokes
  }
}

// ---------------------------------------------------------------------------
// Coupon definition (validated on the server; the form is never trusted)
// ---------------------------------------------------------------------------

const code = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/, "letters, digits, - and _ only");

const isoOrNull = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .refine((v) => v === null || !Number.isNaN(Date.parse(v)), "invalid date");

export const couponInputSchema = z
  .object({
    code,
    description: z.string().trim().max(500).optional().nullable(),
    discountType: z.enum(["percent", "fixed_amount"]),
    percentOff: z.coerce.number().gt(0).max(100).nullable().optional(),
    amountOffMinor: z.coerce.number().int().gt(0).nullable().optional(),
    currency: z.string().trim().length(3).transform((s) => s.toUpperCase()).nullable().optional(),
    usageRule: z.enum(["once_per_user", "once_per_space", "unlimited_during_validity"]),
    durationType: z.enum(["once", "repeating", "forever"]),
    durationCycles: z.coerce.number().int().min(2).max(60).nullable().optional(),
    validFrom: isoOrNull.optional(),
    validUntil: isoOrNull.optional(),
    globalMaxRedemptions: z.coerce.number().int().gt(0).nullable().optional(),
    planKeys: z.array(z.string().min(1).max(64)).nullable().optional(),
    spaceTypes: z.array(z.enum(["teach", "retreat"])).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.discountType === "percent") {
      if (v.percentOff == null) ctx.addIssue({ code: "custom", path: ["percentOff"], message: "percent required" });
      if (v.amountOffMinor != null || v.currency) ctx.addIssue({ code: "custom", path: ["amountOffMinor"], message: "a percent coupon has no fixed amount" });
    } else {
      if (v.amountOffMinor == null) ctx.addIssue({ code: "custom", path: ["amountOffMinor"], message: "amount required" });
      if (!v.currency) ctx.addIssue({ code: "custom", path: ["currency"], message: "currency required" });
      if (v.percentOff != null) ctx.addIssue({ code: "custom", path: ["percentOff"], message: "a fixed coupon has no percent" });
    }
    if (v.durationType === "repeating" && v.durationCycles == null) ctx.addIssue({ code: "custom", path: ["durationCycles"], message: "cycles required" });
    if (v.durationType !== "repeating" && v.durationCycles != null) ctx.addIssue({ code: "custom", path: ["durationCycles"], message: "cycles only apply to 'first N cycles'" });
    if (v.validFrom && v.validUntil && Date.parse(v.validFrom) >= Date.parse(v.validUntil)) {
      ctx.addIssue({ code: "custom", path: ["validUntil"], message: "must be after the start" });
    }
  });
export type CouponInput = z.infer<typeof couponInputSchema>;

/** The fields that carry the financial promise. Immutable once any redemption/reservation exists. */
export const FINANCIAL_FIELDS = ["discountType", "percentOff", "amountOffMinor", "currency", "durationType", "durationCycles", "usageRule"] as const;

export type CouponComparable = {
  discountType: string; percentOff: number | null; amountOffMinor: number | null; currency: string | null;
  durationType: string; durationCycles: number | null; usageRule: string;
};

export function financialTermsChanged(before: CouponComparable, after: CouponComparable): boolean {
  return FINANCIAL_FIELDS.some((f) => before[f] !== after[f]);
}

export type CouponUpdateCheck =
  | { ok: true; recreateStripeCoupon: boolean }
  | { ok: false; reason: "financial_terms_locked" | "cap_below_usage" };

/**
 * Editing an already-used coupon must never silently change history. Rules:
 *  - never used (no reservation/redemption ever): everything is editable; a change to financial terms makes the
 *    server create a NEW Stripe coupon (Stripe coupons are immutable) and keep the old one only for reference.
 *  - used: discount type/value/currency/duration/usage rule are LOCKED. Availability dates, the active flag,
 *    description and applicability may change (they affect NEW redemptions only). The global cap may be raised or
 *    lowered but never below the redemptions already made.
 */
export function checkCouponUpdate(a: {
  before: CouponComparable; after: CouponComparable; used: boolean; usedCount: number; newGlobalMax: number | null;
}): CouponUpdateCheck {
  const changed = financialTermsChanged(a.before, a.after);
  if (a.used && changed) return { ok: false, reason: "financial_terms_locked" };
  if (a.newGlobalMax != null && a.newGlobalMax < a.usedCount) return { ok: false, reason: "cap_below_usage" };
  return { ok: true, recreateStripeCoupon: changed };
}

/** The Stripe coupon must carry EXACTLY the terms InnerDweS promised. */
export function couponMatchesStripe(
  terms: { discountType: string; percentOff: number | null; amountOffMinor: number | null; currency: string | null; durationType: string; durationCycles: number | null },
  stripe: { valid: boolean; percentOff: number | null; amountOffMinor: number | null; currency: string | null; duration: string; durationInMonths: number | null } | null
): { ok: true } | { ok: false; reason: string } {
  if (!stripe) return { ok: false, reason: "stripe_coupon_missing" };
  if (!stripe.valid) return { ok: false, reason: "stripe_coupon_invalid" };
  if (stripe.duration !== terms.durationType) return { ok: false, reason: "duration_mismatch" };
  if (terms.durationType === "repeating" && stripe.durationInMonths !== terms.durationCycles) return { ok: false, reason: "cycles_mismatch" };
  if (terms.discountType === "percent") {
    if (stripe.percentOff == null || Math.abs(stripe.percentOff - (terms.percentOff ?? -1)) > 0.001 || stripe.amountOffMinor != null) return { ok: false, reason: "percent_mismatch" };
  } else {
    if (stripe.amountOffMinor !== terms.amountOffMinor || (stripe.currency ?? "").toUpperCase() !== (terms.currency ?? "").toUpperCase() || stripe.percentOff != null) {
      return { ok: false, reason: "amount_mismatch" };
    }
  }
  return { ok: true };
}
