import type { AccountKey } from "@/lib/i18n/account";
import { LOCALE_TAG, type Locale } from "@/lib/i18n/locales";
import { formatMoney } from "../../money";
import { NEXT_ACTIONS, type NextAction, type StripeMode, type SubscriptionStatus } from "../../types";

/**
 * Pure presentation helpers for the Admin console (localized via the `admin` dictionary, UTC only).
 * No React, no I/O - everything here is unit-tested.
 *
 * IMPORTANT: this file is imported by client components, so it must never import the account
 * dictionaries (lib/i18n/account.ts) at runtime - only the key TYPE. Every translating helper
 * takes an AdminCtx: the server builds one with makeAdminCtx(locale) (lib/billing/admin/ui/ctx.ts),
 * client components get one from the Admin provider.
 */

export type AdminKey = AccountKey<"admin">;
export type AdminT = (key: AdminKey, values?: Record<string, string | number>) => string;
export type AdminCtx = { t: AdminT; locale: Locale };

/** Looks up a dynamic key; an unknown raw value (not a known enum member) is shown as-is. */
function lookup(c: AdminCtx, prefix: string, raw: string, known: readonly string[]): string {
  return known.includes(raw) ? c.t(`${prefix}${raw}` as AdminKey) : raw;
}

export const NEXT_ACTION_KEYS: Record<NextAction, AdminKey> = {
  renewal: "nextAction_renewal",
  discount_cycle: "nextAction_discount_cycle",
  discount_ends: "nextAction_discount_ends",
  cancel_at_period_end: "nextAction_cancel_at_period_end",
  payment_retry: "nextAction_payment_retry",
  guest_suspension: "nextAction_guest_suspension",
  studio_suspension: "nextAction_studio_suspension",
  deletion_warning: "nextAction_deletion_warning",
  deletion_eligible: "nextAction_deletion_eligible",
  none: "nextAction_none",
};

export function nextActionLabel(a: NextAction | string, c: AdminCtx): string {
  return (NEXT_ACTIONS as readonly string[]).includes(a) ? c.t(NEXT_ACTION_KEYS[a as NextAction]) : String(a);
}

const STATUS_KEYS: Record<SubscriptionStatus, AdminKey> = {
  incomplete: "status_incomplete",
  incomplete_expired: "status_incomplete_expired",
  trialing: "status_trialing",
  active: "status_active",
  past_due: "status_past_due",
  unpaid: "status_unpaid",
  canceled: "status_canceled",
  paused: "status_paused",
  exempt: "status_exempt",
};

export function statusLabel(s: string, c: AdminCtx): string {
  return s in STATUS_KEYS ? c.t(STATUS_KEYS[s as SubscriptionStatus]) : s;
}

export type Tone = "good" | "warn" | "bad" | "neutral";
export function statusTone(s: string): Tone {
  if (s === "active" || s === "trialing") return "good";
  if (s === "past_due" || s === "unpaid" || s === "incomplete") return "warn";
  if (s === "canceled" || s === "incomplete_expired") return "bad";
  return "neutral";
}

export const usageRuleLabel = (r: string, c: AdminCtx) => lookup(c, "usageRule_", r, ["once_per_user", "once_per_space", "unlimited_during_validity"]);

export const redemptionStatusLabel = (s: string, c: AdminCtx) => lookup(c, "redemption_", s, ["reserved", "redeemed", "completed", "canceled", "released", "expired"]);

export const couponStatusLabel = (s: string, c: AdminCtx) => lookup(c, "couponStatus_", s, ["active", "scheduled", "expired", "disabled"]);

export const invoiceStatusWord = (s: string, c: AdminCtx) => lookup(c, "invoiceStatus_", s, ["paid", "open", "void", "uncollectible", "draft"]);

export const eventStatusLabel = (s: string, c: AdminCtx) => lookup(c, "eventStatus_", s, ["processed", "failed"]);

export function spaceTypeLabel(t: string | null | undefined, c: AdminCtx): string {
  if (t === "teach" || t === "retreat") return c.t(`spaceType_${t}`);
  return t ? t : "-";
}

/**
 * UTC timestamp. English keeps the unambiguous "2026-11-01 12:00 UTC"; every other locale uses Intl with an
 * explicit locale tag and timeZone "UTC" (never the browser's clock or zone), followed by the UTC marker.
 */
export function formatUtc(v: Date | string | null | undefined, c: AdminCtx): string {
  if (!v) return "-";
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  if (c.locale === "en") return `${d.toISOString().slice(0, 16).replace("T", " ")} ${c.t("utcSuffix")}`;
  return `${new Intl.DateTimeFormat(LOCALE_TAG[c.locale], { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(d)} ${c.t("utcSuffix")}`;
}

export function formatUtcDate(v: Date | string | null | undefined, c: AdminCtx): string {
  if (!v) return "-";
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  if (c.locale === "en") return `${d.toISOString().slice(0, 10)} ${c.t("utcSuffix")}`;
  return `${new Intl.DateTimeFormat(LOCALE_TAG[c.locale], { dateStyle: "medium", timeZone: "UTC" }).format(d)} ${c.t("utcSuffix")}`;
}

/** "$25.00" from an integer minor amount (locale-formatted); "-" for null; falls back to "1234 XYZ" when the currency is not formattable. */
export function money(minor: number | null | undefined, currency: string | null | undefined, locale: Locale = "en"): string {
  if (minor == null) return "-";
  const cur = (currency ?? "USD").trim().toUpperCase();
  try {
    return formatMoney(minor, cur, locale);
  } catch {
    return `${minor} ${cur} (minor)`;
  }
}

export type CouponTerms = {
  discount_type?: string; percent_off?: number | string | null; amount_off_minor?: number | null; currency?: string | null;
  duration_type?: string; duration_cycles?: number | null;
};

export function discountLabel(d: { discountType: string; percentOff: number | string | null; amountOffMinor: number | null; currency: string | null }, c: AdminCtx): string {
  if (d.discountType === "percent") {
    const p = Number(d.percentOff);
    return Number.isFinite(p) ? c.t("discountPercentOff", { percent: new Intl.NumberFormat(LOCALE_TAG[c.locale], { maximumFractionDigits: 2 }).format(Number(p.toFixed(2))) }) : "-";
  }
  return d.amountOffMinor == null ? "-" : c.t("discountAmountOff", { amount: money(d.amountOffMinor, d.currency, c.locale) });
}

export function couponDiscountLabel(t: CouponTerms, c: AdminCtx): string {
  return discountLabel({
    discountType: t.discount_type ?? "", percentOff: t.percent_off ?? null, amountOffMinor: t.amount_off_minor ?? null, currency: t.currency ? String(t.currency).trim() : null,
  }, c);
}

export function durationLabel(durationType: string, cycles: number | null | undefined, c: AdminCtx): string {
  if (durationType === "once") return c.t("durationOnce");
  if (durationType === "repeating") return c.t("durationRepeating", { n: cycles ?? "?" });
  if (durationType === "forever") return c.t("durationForever");
  return durationType;
}

export type CouponStatus = "active" | "disabled" | "expired" | "scheduled";

export function couponStatus(c: { active: boolean; valid_from?: string | null; valid_until?: string | null }, now: Date): CouponStatus {
  if (!c.active) return "disabled";
  if (c.valid_until && now.getTime() > new Date(c.valid_until).getTime()) return "expired";
  if (c.valid_from && now.getTime() < new Date(c.valid_from).getTime()) return "scheduled";
  return "active";
}

export function couponWindowLabel(w: { valid_from?: string | null; valid_until?: string | null }, c: AdminCtx): string {
  if (!w.valid_from && !w.valid_until) return c.t("windowAlways");
  return c.t("windowRange", { from: w.valid_from ? formatUtc(w.valid_from, c) : c.t("windowAnyTime"), to: w.valid_until ? formatUtc(w.valid_until, c) : c.t("windowNoEnd") });
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
  progress: { currentCycle: number; totalCycles: number | null } | null | undefined,
  c: AdminCtx
): string {
  if (!discount) return "-";
  if (discount.status === "redeemed") {
    if (progress) return progress.totalCycles == null ? c.t("progressCycleForever", { current: progress.currentCycle }) : c.t("progressCycleOf", { current: progress.currentCycle, total: progress.totalCycles });
    return discount.cyclesTotal == null ? c.t("progressSoFarForever", { done: discount.cyclesCompleted }) : c.t("progressDoneOf", { done: discount.cyclesCompleted, total: discount.cyclesTotal });
  }
  if (discount.status === "completed") return c.t("progressFinished", { n: discount.cyclesTotal ?? discount.cyclesCompleted });
  if (discount.status === "canceled") return c.t("progressCanceled", { n: discount.cyclesCompleted });
  return discount.status;
}

export function invoiceStatusLabel(i: { status: string; amount_refunded_minor?: number | null; currency?: string | null }, c: AdminCtx): string {
  const refunded = Number(i.amount_refunded_minor ?? 0);
  const status = invoiceStatusWord(i.status, c);
  if (refunded > 0) return c.t("invoiceRefunded", { status, amount: money(refunded, i.currency, c.locale) });
  return status;
}

/**
 * The money facts of one billing_invoices row (migration 0040), kept apart so Admin never confuses them:
 *   total     - what Stripe billed (after discounts and tax), total_minor;
 *   due       - what is still owed on an open/draft invoice (amount_due_minor, else the total);
 *   paid      - what was actually collected (amount_paid_minor; less than total when account credit applied, 0 for 100% off);
 *   refunded  - amount_refunded_minor (absolute, set from the Stripe charge);
 *   net       - paid - refunded (never below 0), shown only when something was refunded;
 *   uncollected - an uncollectible invoice's unpaid remainder (Stripe gave up collecting it).
 * `headline` is the single most relevant figure for the row; `note` explains $0 and void rows.
 */
export type InvoiceAmountKind = "total" | "due" | "paid" | "refunded" | "net" | "uncollected";
export type InvoiceAmountLine = { kind: InvoiceAmountKind; minor: number };
export type InvoiceAmountNote = "void" | "no_charge" | null;
export type InvoiceAmounts = { lines: InvoiceAmountLine[]; headline: InvoiceAmountKind | null; note: InvoiceAmountNote };
export type InvoiceAmountInput = {
  status: string; total_minor?: number | null; amount_due_minor?: number | null; amount_paid_minor?: number | null; amount_refunded_minor?: number | null;
};

const nonNeg = (v: number | null | undefined): number | null => (v == null || !Number.isFinite(Number(v)) ? null : Math.max(0, Math.trunc(Number(v))));

export function invoiceAmounts(i: InvoiceAmountInput): InvoiceAmounts {
  const total = nonNeg(i.total_minor);
  const paid = nonNeg(i.amount_paid_minor) ?? 0;
  const refunded = nonNeg(i.amount_refunded_minor) ?? 0;
  const lines: InvoiceAmountLine[] = [];
  if (total != null) lines.push({ kind: "total", minor: total });
  let headline: InvoiceAmountKind | null = total != null ? "total" : null;
  let note: InvoiceAmountNote = null;

  if (i.status === "open" || i.status === "draft") {
    const due = nonNeg(i.amount_due_minor) ?? total;
    const outstanding = due == null ? null : Math.max(0, due - paid);
    if (outstanding != null) { lines.push({ kind: "due", minor: outstanding }); headline = "due"; }
    if (paid > 0) lines.push({ kind: "paid", minor: paid });
  } else if (i.status === "uncollectible") {
    const due = nonNeg(i.amount_due_minor) ?? total;
    if (paid > 0) lines.push({ kind: "paid", minor: paid });
    if (due != null) { lines.push({ kind: "uncollected", minor: Math.max(0, due - paid) }); headline = "uncollected"; }
  } else if (i.status === "void") {
    if (paid > 0) lines.push({ kind: "paid", minor: paid });
    note = "void";
  } else {
    // paid (or an unknown status from a future Stripe version): show what was collected.
    lines.push({ kind: "paid", minor: paid });
    headline = "paid";
    if (paid === 0 && (total ?? 0) === 0) note = "no_charge";
  }
  if (refunded > 0) {
    lines.push({ kind: "refunded", minor: refunded });
    lines.push({ kind: "net", minor: Math.max(0, paid - refunded) });
    if (headline === "paid") headline = "net";
  }
  return { lines, headline, note };
}

const AMOUNT_KEYS: Record<InvoiceAmountKind, AdminKey> = {
  total: "invAmtTotal", due: "invAmtDue", paid: "invAmtPaid", refunded: "invAmtRefunded", net: "invAmtNet", uncollected: "invAmtUncollected",
};

/** Localized label/value lines for an invoice's amounts (currency formatted with the shared money helper). */
export function invoiceAmountLines(i: InvoiceAmountInput & { currency?: string | null }, c: AdminCtx): { kind: InvoiceAmountKind; label: string; value: string; headline: boolean }[] {
  const a = invoiceAmounts(i);
  const cur = i.currency ? String(i.currency).trim() : null;
  return a.lines.map((l) => ({ kind: l.kind, label: c.t(AMOUNT_KEYS[l.kind]), value: money(l.minor, cur, c.locale), headline: l.kind === a.headline }));
}

export function invoiceAmountNote(i: InvoiceAmountInput, c: AdminCtx): string | null {
  const n = invoiceAmounts(i).note;
  return n === "void" ? c.t("invAmtNoteVoid") : n === "no_charge" ? c.t("invAmtNoteNoCharge") : null;
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

const ERROR_CODES = [
  "invalid", "code_taken", "save_failed", "sync_failed", "audit_failed", "financial_terms_locked", "cap_below_usage", "not_found", "reason_required",
  "has_paid_subscription", "stripe_not_configured", "plan_not_synced", "owner_only", "user_not_found", "cannot_revoke_self", "last_owner",
  "step_up_required", "mfa_required", "unauthenticated", "not_admin", "invalid_code", "enroll_failed",
] as const;

export function errorMessage(code: string, c: AdminCtx): string {
  if (code.startsWith("price_drift:")) return c.t("errPriceDrift", { detail: code.slice("price_drift:".length) });
  return (ERROR_CODES as readonly string[]).includes(code) ? c.t(`err_${code}` as AdminKey) : c.t("errGeneric");
}

/**
 * Field-level messages come from server-side validation (policy.ts / service.ts) in English. Known ones are mapped to
 * the dictionary; anything else (e.g. a library default message) is shown as received.
 */
const FIELD_MESSAGE_KEYS: Record<string, AdminKey> = {
  "letters, digits, - and _ only": "fieldMsg_codeFormat",
  "invalid date": "fieldMsg_invalidDate",
  "percent required": "fieldMsg_percentRequired",
  "a percent coupon has no fixed amount": "fieldMsg_percentNoFixed",
  "amount required": "fieldMsg_amountRequired",
  "currency required": "fieldMsg_currencyRequired",
  "a fixed coupon has no percent": "fieldMsg_fixedNoPercent",
  "cycles required": "fieldMsg_cyclesRequired",
  "cycles only apply to 'first N cycles'": "fieldMsg_cyclesOnlyRepeating",
  "must be after the start": "fieldMsg_untilAfterStart",
  "already exists": "fieldMsg_alreadyExists",
  "state why (min 5 characters)": "fieldMsg_stateWhy",
};
export function fieldMessage(msg: string, c: AdminCtx): string {
  const key = FIELD_MESSAGE_KEYS[msg];
  return key ? c.t(key) : msg;
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
export function fieldErrors(r: { ok: boolean } | null | undefined, c?: AdminCtx): Record<string, string> {
  if (!r || r.ok) return {};
  const fields = (r as { fields?: Record<string, string> }).fields ?? {};
  return c ? Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, fieldMessage(v, c)])) : fields;
}

/** An <img>-safe source for the QR: a data:image/svg+xml URL as-is, or raw <svg> markup wrapped into one. Never injected as HTML. */
export function qrImageSrc(qr: string): string | null {
  if (qr.startsWith("data:image/svg+xml")) return qr;
  if (qr.trimStart().startsWith("<svg")) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}`;
  return null;
}

