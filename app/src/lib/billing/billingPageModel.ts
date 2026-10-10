import { translate, type Locale, type TranslationKey } from "@/lib/i18n";
import { LOCALE_TAG } from "@/lib/i18n/locales";
import { translateAccount, type AccountKey } from "@/lib/i18n/account";
import type { BillingViewModel, CustomerBillingState, InvoiceRow } from "./customerView";
import { formatBillingDate, safeHttpsUrl } from "./displayDate";
import { formatMoney } from "./money";
import type { NextAction } from "./types";

type T = (key: AccountKey<"billing">, values?: Record<string, string | number>) => string;

const NEXT_ACTION_KEY: Record<NextAction, AccountKey<"billing">> = {
  renewal: "nextActionRenewal",
  discount_cycle: "nextActionDiscountCycle",
  discount_ends: "nextActionDiscountEnds",
  cancel_at_period_end: "nextActionCancelAtPeriodEnd",
  payment_retry: "nextActionPaymentRetry",
  guest_suspension: "nextActionGuestSuspension",
  studio_suspension: "nextActionStudioSuspension",
  deletion_warning: "nextActionDeletionWarning",
  deletion_eligible: "nextActionDeletionEligible",
  none: "nextActionNone",
};

/** Status chip text for the Billing page. */
export function statusLabel(state: CustomerBillingState, t: T, cancelDate: string): string {
  switch (state) {
    case "active": return t("statusActive");
    case "payment_issue": return t("statusPaymentIssue");
    case "guest_suspended": return t("statusGuestSuspended");
    case "studio_suspended": return t("statusStudioSuspended");
    case "canceling": return t("statusCanceling", { date: cancelDate });
    case "ended": return t("statusEnded");
    case "exempt": return t("statusExempt");
    case "setting_up": return t("statusSettingUp");
  }
}

/** My Spaces chip: nothing for healthy ("active") and internal ("exempt") Spaces. */
export function chipLabel(state: CustomerBillingState, locale: Locale, endDate: Date | null): string | null {
  const t: T = (k, v) => translateAccount(locale, "billing", k, v);
  switch (state) {
    case "payment_issue": return t("chipPaymentIssue");
    case "guest_suspended": return t("chipGuestSuspended");
    case "studio_suspended": return t("chipStudioSuspended");
    case "canceling": return endDate ? t("chipCanceling", { date: formatBillingDate(endDate, locale) }) : null;
    case "ended": return t("chipEnded");
    default: return null;
  }
}

export type InvoiceStatusKind = "paid" | "pending" | "failed" | "void" | "uncollectible";

export function invoiceStatusKind(inv: Pick<InvoiceRow, "status" | "failedAt">): InvoiceStatusKind {
  if (inv.status === "paid") return "paid";
  if (inv.status === "void") return "void";
  if (inv.status === "uncollectible") return "uncollectible";
  if (inv.failedAt) return "failed";
  return "pending";
}

/** The customer's document link: hosted invoice first, else receipt; https only. */
export function invoiceLink(inv: Pick<InvoiceRow, "hostedInvoiceUrl" | "receiptUrl">): string | null {
  return safeHttpsUrl(inv.hostedInvoiceUrl) ?? safeHttpsUrl(inv.receiptUrl);
}

/**
 * The amount a history row shows: what was actually PAID for a paid invoice (after discounts and any account credit;
 * a refund is shown separately), what is still DUE for an open/failed one, and the invoice total otherwise (void /
 * uncollectible). A 100%-discounted paid invoice correctly shows 0.
 */
export function invoiceDisplayMinor(inv: Pick<InvoiceRow, "status" | "amountPaidMinor" | "totalMinor" | "amountDueMinor">): number | null {
  if (inv.status === "paid") return inv.amountPaidMinor;
  if (inv.status === "open" || inv.status === "draft") return inv.amountDueMinor ?? inv.totalMinor;
  return inv.totalMinor;
}

export type InvoiceDisplay = {
  id: string; date: string; amount: string; status: string; kind: InvoiceStatusKind; reference: string; refunded: string | null; href: string | null;
};

export type BillingPageModel = {
  planName: string;
  priceLine: string | null;
  statusText: string;
  state: CustomerBillingState;
  exempt: boolean;
  period: string | null;
  nextBilling: string | null;
  nextCharge: string | null;
  coupon: null | { code: string; progress: string | null; remaining: string | null };
  whatsNext: string | null;
  audio: string | null;
  banner: string | null;
  cancelScheduled: string | null;
  cancelDate: string;
  canCancel: boolean;
  canResume: boolean;
  canUpdatePayment: boolean;
  invoices: InvoiceDisplay[];
};

/** All numbers, dates and phrases the Billing page shows, formatted on the server. Pure. */
export function buildBillingPageModel(view: BillingViewModel, locale: Locale): BillingPageModel {
  const t: T = (k, v) => translateAccount(locale, "billing", k, v);
  const sub = view.subscription;
  const exempt = sub.status === "exempt";
  const ended = view.state === "ended";
  const num = (n: number) => new Intl.NumberFormat(LOCALE_TAG[locale] ?? "en-GB").format(n);
  const date = (d: Date | null) => (d ? formatBillingDate(d, locale) : "");
  const money = (minor: number | null, currency: string | null) => (minor == null || !currency ? null : formatMoney(minor, currency, locale));
  const currency = sub.currency;
  const cancelAt = sub.cancelAt ?? sub.currentPeriodEnd;

  const r = view.redemption;
  let coupon: BillingPageModel["coupon"] = null;
  if (r && r.couponCode && r.status !== "canceled") {
    const total = r.cyclesTotal;
    let progressText: string | null = null;
    let remaining: string | null = null;
    if (r.status === "completed") {
      progressText = t("discountDone", { price: money(sub.baseAmountMinor, currency) ?? "" });
    } else if (total == null) {
      progressText = t("discountForever");
    } else {
      progressText = t("discountProgress", { done: Math.min(r.cyclesCompleted, total), total });
      const left = Math.max(0, total - r.cyclesCompleted);
      remaining = t(left === 1 ? "discountRemaining" : "discountRemainingPlural", { count: left });
    }
    coupon = { code: r.couponCode, progress: progressText, remaining };
  }

  let banner: string | null = null;
  const d = view.deadlines;
  if (d) {
    if (view.state === "payment_issue") banner = t("paymentIssueBanner", { date: date(d.guestSuspendedAt) });
    else if (view.state === "guest_suspended" || view.state === "studio_suspended") banner = t("guestSuspendedBanner", { date: date(d.studioSuspendedAt) });
  }

  const na = view.nextAction;
  const whatsNext = exempt || na.action === "none" ? (exempt ? null : t("nextActionNone")) : t(NEXT_ACTION_KEY[na.action], { date: date(na.at) });

  const showPeriod = !exempt && sub.currentPeriodStart && sub.currentPeriodEnd;
  const cancelScheduled = sub.cancelAtPeriodEnd && !ended && !exempt ? t("cancelScheduled", { date: date(cancelAt) }) : null;
  const paidActive = !exempt && !ended && !!sub.stripeSubscriptionId;

  return {
    planName: view.planName ?? "",
    priceLine: !exempt && sub.baseAmountMinor != null && currency ? t("priceMonthly", { price: formatMoney(sub.baseAmountMinor, currency, locale) }) : null,
    statusText: statusLabel(view.state, t, date(cancelAt)),
    state: view.state,
    exempt,
    period: showPeriod ? `${date(sub.currentPeriodStart)} – ${date(sub.currentPeriodEnd)}` : null,
    nextBilling: !exempt && !ended && !sub.cancelAtPeriodEnd && sub.currentPeriodEnd ? date(sub.currentPeriodEnd) : null,
    nextCharge: !exempt && !ended && !sub.cancelAtPeriodEnd ? money(na.expectedChargeMinor, na.currency ?? currency) : null,
    coupon,
    whatsNext,
    audio: view.audio && !exempt
      ? t("includedAudio", {
          // Locale grouping (100,000 / 100.000 / 100 000), never a bare integer.
          library: num(view.audio.libraryMinutes), max: num(view.audio.maxRecordingMinutes), listening: num(view.audio.listeningMinutesPerMonth),
        })
      : null,
    banner,
    cancelScheduled,
    cancelDate: date(cancelAt),
    canCancel: paidActive && !sub.cancelAtPeriodEnd,
    canResume: paidActive && sub.cancelAtPeriodEnd,
    canUpdatePayment: paidActive,
    invoices: exempt
      ? []
      : view.invoices.map((i) => {
          const kind = invoiceStatusKind(i);
          const statusKey: Record<InvoiceStatusKind, AccountKey<"billing">> = {
            paid: "invoicePaid", pending: "invoiceOpen", failed: "invoiceFailed", void: "invoiceVoid", uncollectible: "invoiceUncollectible",
          };
          const minor = invoiceDisplayMinor(i);
          return {
            id: i.id,
            date: date(i.paidAt ? new Date(i.paidAt) : i.issuedAt ? new Date(i.issuedAt) : null),
            amount: money(minor, i.currency) ?? "",
            status: t(statusKey[kind]),
            kind,
            reference: i.number ?? "",
            refunded: i.amountRefundedMinor > 0 ? t("refundedAmount", { amount: formatMoney(i.amountRefundedMinor, i.currency, locale) }) : null,
            href: invoiceLink(i),
          };
        }),
  };
}
