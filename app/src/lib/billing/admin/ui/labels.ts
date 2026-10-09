import { formatMoney } from "../../money";
import { NEXT_ACTIONS, type NextAction, type StripeMode, type SubscriptionStatus } from "../../types";

/**
 * Pure presentation helpers for the Admin console (English only, UTC only).
 * No React, no I/O - everything here is unit-tested.
 */

export const NEXT_ACTION_LABELS: Record<NextAction, string> = {
  renewal: "Renews",
  discount_cycle: "Renews with discount",
  discount_ends: "Discount ends - full price next",
  cancel_at_period_end: "Access ends (cancellation)",
  payment_retry: "Stripe payment retry",
  guest_suspension: "Guest App suspended",
  studio_suspension: "Studio suspended",
  deletion_warning: "Final deletion warning",
  deletion_eligible: "Becomes deletion-eligible",
  none: "Nothing scheduled",
};

export function nextActionLabel(a: NextAction | string): string {
  return (NEXT_ACTIONS as readonly string[]).includes(a) ? NEXT_ACTION_LABELS[a as NextAction] : String(a);
}

export const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  incomplete: "Incomplete",
  incomplete_expired: "Incomplete (expired)",
  trialing: "Trialing",
  active: "Active",
  past_due: "Past due",
  unpaid: "Unpaid",
  canceled: "Canceled",
  paused: "Paused",
  exempt: "Exempt (not paying)",
};

export function statusLabel(s: string): string {
  return s in STATUS_LABELS ? STATUS_LABELS[s as SubscriptionStatus] : s;
}

export type Tone = "good" | "warn" | "bad" | "neutral";
export function statusTone(s: string): Tone {
  if (s === "active" || s === "trialing") return "good";
  if (s === "past_due" || s === "unpaid" || s === "incomplete") return "warn";
  if (s === "canceled" || s === "incomplete_expired") return "bad";
  return "neutral";
}

export const USAGE_RULE_LABELS: Record<string, string> = {
  once_per_user: "Once per user (across all Spaces)",
  once_per_space: "Once per Space",
  unlimited_during_validity: "Unlimited while available",
};
export const usageRuleLabel = (r: string) => USAGE_RULE_LABELS[r] ?? r;

export const REDEMPTION_STATUS_LABELS: Record<string, string> = {
  reserved: "Reserved (checkout in progress)",
  redeemed: "Redeemed - discount running",
  completed: "Completed - discount finished",
  canceled: "Subscription canceled",
  released: "Released",
  expired: "Expired",
};
export const redemptionStatusLabel = (s: string) => REDEMPTION_STATUS_LABELS[s] ?? s;

export function spaceTypeLabel(t: string | null | undefined): string {
  if (t === "teach") return "Teach";
  if (t === "retreat") return "Retreat";
  return t ? t : "-";
}

/** UTC timestamp, e.g. "2026-11-01 12:00 UTC". Never the browser's clock or zone. */
export function formatUtc(v: Date | string | null | undefined): string {
  if (!v) return "-";
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function formatUtcDate(v: Date | string | null | undefined): string {
  if (!v) return "-";
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return `${d.toISOString().slice(0, 10)} UTC`;
}

/** "$25.00" from an integer minor amount; "-" for null; falls back to "1234 XYZ" when the currency is not formattable. */
export function money(minor: number | null | undefined, currency: string | null | undefined): string {
  if (minor == null) return "-";
  const cur = (currency ?? "USD").trim().toUpperCase();
  try {
    return formatMoney(minor, cur);
  } catch {
    return `${minor} ${cur} (minor)`;
  }
}

export type CouponTerms = {
  discount_type?: string; percent_off?: number | string | null; amount_off_minor?: number | null; currency?: string | null;
  duration_type?: string; duration_cycles?: number | null;
};

export function discountLabel(c: { discountType: string; percentOff: number | string | null; amountOffMinor: number | null; currency: string | null }): string {
  if (c.discountType === "percent") {
    const p = Number(c.percentOff);
    return Number.isFinite(p) ? `${Number(p.toFixed(2))}% off` : "-";
  }
  return c.amountOffMinor == null ? "-" : `${money(c.amountOffMinor, c.currency)} off`;
}

export function couponDiscountLabel(c: CouponTerms): string {
  return discountLabel({
    discountType: c.discount_type ?? "", percentOff: c.percent_off ?? null, amountOffMinor: c.amount_off_minor ?? null, currency: c.currency ? String(c.currency).trim() : null,
  });
}

export function durationLabel(durationType: string, cycles: number | null | undefined): string {
  if (durationType === "once") return "First billing cycle";
  if (durationType === "repeating") return `First ${cycles ?? "?"} billing cycles`;
  if (durationType === "forever") return "Forever";
  return durationType;
}

export type CouponStatus = "active" | "disabled" | "expired" | "scheduled";

export function couponStatus(c: { active: boolean; valid_from?: string | null; valid_until?: string | null }, now: Date): CouponStatus {
  if (!c.active) return "disabled";
  if (c.valid_until && now.getTime() > new Date(c.valid_until).getTime()) return "expired";
  if (c.valid_from && now.getTime() < new Date(c.valid_from).getTime()) return "scheduled";
  return "active";
}

export function couponWindowLabel(c: { valid_from?: string | null; valid_until?: string | null }): string {
  if (!c.valid_from && !c.valid_until) return "Always available";
  return `${c.valid_from ? formatUtc(c.valid_from) : "any time"} -> ${c.valid_until ? formatUtc(c.valid_until) : "no end"}`;
}

export type CouponSyncState = "synced" | "needs_sync" | "no_stripe";

/** Sync state for the CURRENT Stripe mode only (test and live ids are never mixed). mode null = Stripe not configured here. */
export function couponSyncState(c: { stripe_test_coupon_id?: string | null; stripe_live_coupon_id?: string | null }, mode: StripeMode | null): CouponSyncState {
  if (!mode) return "no_stripe";
  const id = mode === "live" ? c.stripe_live_coupon_id : c.stripe_test_coupon_id;
  return id ? "synced" : "needs_sync";
}

/** "cycle 2 of 6", "cycle 3 (forever)", "finished after 6 cycles" ... */
export function discountProgressText(
  discount: { cyclesCompleted: number; cyclesTotal: number | null; status: string } | null,
  progress: { currentCycle: number; totalCycles: number | null } | null | undefined
): string {
  if (!discount) return "-";
  if (discount.status === "redeemed") {
    if (progress) return progress.totalCycles == null ? `cycle ${progress.currentCycle} (forever)` : `cycle ${progress.currentCycle} of ${progress.totalCycles}`;
    return discount.cyclesTotal == null ? `${discount.cyclesCompleted} cycles so far (forever)` : `${discount.cyclesCompleted} of ${discount.cyclesTotal} cycles done`;
  }
  if (discount.status === "completed") return `finished after ${discount.cyclesTotal ?? discount.cyclesCompleted} cycles`;
  if (discount.status === "canceled") return `canceled after ${discount.cyclesCompleted} cycles`;
  return discount.status;
}

export function invoiceStatusLabel(i: { status: string; amount_refunded_minor?: number | null; currency?: string | null }): string {
  const refunded = Number(i.amount_refunded_minor ?? 0);
  if (refunded > 0) return `${i.status} - refunded ${money(refunded, i.currency)}`;
  return i.status;
}

/** Only absolute https URLs are ever rendered as links (Stripe-hosted documents). */
export function safeHttpsUrl(u: unknown): string | null {
  if (typeof u !== "string" || !u) return null;
  try {
    const p = new URL(u);
    return p.protocol === "https:" ? p.toString() : null;
  } catch {
    return null;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

export const ERROR_MESSAGES: Record<string, string> = {
  invalid: "Some fields are not valid. Check the highlighted fields.",
  code_taken: "That coupon code already exists.",
  save_failed: "The change could not be saved. Nothing was changed - try again.",
  sync_failed: "Saved, but syncing to Stripe failed. Use \"Sync to Stripe\" to retry.",
  audit_failed: "The audit record could not be written, so the change is not reported as done. Check the Audit log before retrying.",
  financial_terms_locked: "Discount type, value, currency, duration and usage rule cannot change once customers have used this coupon. Create a new coupon instead.",
  cap_below_usage: "The redemption cap cannot be lower than the redemptions already made.",
  not_found: "That record no longer exists.",
  reason_required: "A reason of at least 5 characters is required.",
  has_paid_subscription: "That Space has a paid subscription, so it cannot be marked exempt.",
  stripe_not_configured: "Stripe is not configured in this environment.",
  plan_not_synced: "The plan is not synced to Stripe in this mode yet. Run \"Sync plan to Stripe\" first.",
  owner_only: "Only an Owner can do this.",
  user_not_found: "No account exists with that email. The person must sign up first.",
  cannot_revoke_self: "You cannot revoke your own Admin access.",
  last_owner: "At least one active Owner must remain.",
  step_up_required: "Confirm it's you: enter a fresh 6-digit code to continue.",
  mfa_required: "Two-step verification is required. Open the verification page and sign in with your authenticator.",
  unauthenticated: "Your session has ended. Sign in again.",
  not_admin: "This account is not an Admin.",
  invalid_code: "That code was not accepted. Check the current code in your authenticator app and try again.",
  enroll_failed: "Authenticator setup could not be started. Try again.",
};

export function errorMessage(code: string): string {
  if (code.startsWith("price_drift:")) {
    return `The Stripe price no longer matches the plan (${code.slice("price_drift:".length)}). Sync the plan and review before continuing.`;
  }
  return ERROR_MESSAGES[code] ?? "Something went wrong. Nothing was reported as done.";
}

export function isAuthError(code: string): boolean {
  return code === "unauthenticated" || code === "not_admin" || code === "mfa_required";
}

/** Percent >= LARGE (or forever) = needs step-up and a visible warning. Mirrors policy.requiresStepUp("coupon.create"). */
export function isLargeDiscount(d: { discountType: string; percentOff: number | null; durationType: string }, largePercent: number): boolean {
  return d.durationType === "forever" || (d.discountType === "percent" && (d.percentOff ?? 0) >= largePercent);
}

/** "datetime-local" value (UTC) from an ISO string. */
export function toDateTimeLocalUtc(v: string | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 16);
}

/** Major-unit string ("5.00") from minor. */
export function minorToMajorString(minor: number | null | undefined): string {
  return minor == null ? "" : (minor / 100).toFixed(2);
}

/** Field-level errors of a failed action result (empty when none). */
export function fieldErrors(r: { ok: boolean } | null | undefined): Record<string, string> {
  if (!r || r.ok) return {};
  return (r as { fields?: Record<string, string> }).fields ?? {};
}

/** An <img>-safe source for the QR: a data:image/svg+xml URL as-is, or raw <svg> markup wrapped into one. Never injected as HTML. */
export function qrImageSrc(qr: string): string | null {
  if (qr.startsWith("data:image/svg+xml")) return qr;
  if (qr.trimStart().startsWith("<svg")) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}`;
  return null;
}

