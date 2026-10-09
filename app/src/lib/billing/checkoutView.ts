import type { TranslationKey } from "@/lib/i18n";

/** Every error code the funnel actions can return (mirrors FunnelError without importing a "use server" module). */
export type FunnelErrorCode =
  | "unavailable" | "consent" | "sign_in"
  | "invalid" | "inactive" | "not_started" | "expired" | "not_applicable" | "already_used" | "in_use_elsewhere" | "limit_reached" | "checkout_closed";

export const FUNNEL_ERROR_CODES: readonly FunnelErrorCode[] = [
  "unavailable", "consent", "sign_in", "invalid", "inactive", "not_started", "expired", "not_applicable",
  "already_used", "in_use_elsewhere", "limit_reached", "checkout_closed",
];

/** The billing-namespace key that explains a funnel error. Total: an unknown code falls back to the generic problem. */
export function funnelErrorKey(code: string): TranslationKey<"billing"> {
  switch (code) {
    case "consent": return "consentRequired";
    case "invalid": return "couponInvalid";
    case "inactive": return "couponInactive";
    case "not_started": return "couponNotStarted";
    case "expired": return "couponExpired";
    case "not_applicable": return "couponNotApplicable";
    case "unavailable": return "checkoutProblem";
    case "already_used": return "couponAlreadyUsed";
    case "in_use_elsewhere": return "couponInUseElsewhere";
    case "limit_reached": return "couponLimitReached";
    case "checkout_closed": return "couponCheckoutClosed";
    default: return "checkoutProblem";
  }
}

/** Errors that belong to the coupon field rather than the submit area. */
export function isCouponError(code: string): boolean {
  return !["unavailable", "consent", "sign_in"].includes(code);
}

export type QuoteViewLike = {
  currency: string;
  baseMinor: number;
  todayMinor: number;
  discount: null | { discountedMinor: number; cycles: number | null; thenMinor: number | null };
};

export type QuoteRow = { id: string; label: string; minor: number; perMonth: boolean };

/** The summary rows for a server-computed quote. Amounts stay integers; formatting happens at render time. */
export function quoteRows(
  q: QuoteViewLike,
  labels: { dueToday: string; then: string; firstCycle: string; firstCycles: string; everyCycle: string }
): QuoteRow[] {
  const rows: QuoteRow[] = [{ id: "today", label: labels.dueToday, minor: q.todayMinor, perMonth: false }];
  if (!q.discount) {
    rows.push({ id: "every", label: labels.everyCycle, minor: q.baseMinor, perMonth: true });
    return rows;
  }
  const { cycles, discountedMinor, thenMinor } = q.discount;
  const label = cycles === null ? labels.everyCycle : cycles === 1 ? labels.firstCycle : labels.firstCycles.replace("{count}", String(cycles));
  rows.push({ id: "discounted", label, minor: discountedMinor, perMonth: true });
  if (thenMinor !== null) rows.push({ id: "then", label: labels.then, minor: thenMinor, perMonth: true });
  return rows;
}
