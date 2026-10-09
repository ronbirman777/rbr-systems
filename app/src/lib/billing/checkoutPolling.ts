/** Pure helpers for the post-payment screen's polling. */

export const POLL_START_MS = 1500;
export const POLL_MAX_MS = 6000;
export const POLL_GIVE_UP_MS = 3 * 60 * 1000;
/** After this long in "awaiting_payment" we say we have not received a payment (never claim one). */
export const NO_PAYMENT_AFTER_MS = 20_000;

/** 1.5s, 2.25s, 3.4s, 5.1s, then capped at 6s. */
export function nextPollDelay(attempt: number): number {
  const d = POLL_START_MS * Math.pow(1.5, Math.max(0, attempt));
  return Math.min(POLL_MAX_MS, Math.round(d));
}

export type CheckoutStatus =
  | { state: "awaiting_payment" }
  | { state: "processing"; delayed: boolean }
  | { state: "ready"; tenantId: string; spaceType: string }
  | { state: "canceled" }
  | { state: "expired" };

export function parseCheckoutStatus(raw: unknown): CheckoutStatus | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  switch (r.state) {
    case "awaiting_payment": return { state: "awaiting_payment" };
    case "processing": return { state: "processing", delayed: r.delayed === true };
    case "ready":
      return typeof r.tenantId === "string" && /^[0-9a-f-]{36}$/i.test(r.tenantId)
        ? { state: "ready", tenantId: r.tenantId, spaceType: typeof r.spaceType === "string" ? r.spaceType : "" }
        : null;
    case "canceled": return { state: "canceled" };
    case "expired": return { state: "expired" };
    default: return null;
  }
}

export const isTerminal = (s: CheckoutStatus | null) => s?.state === "ready" || s?.state === "canceled" || s?.state === "expired";

export type CompleteView = "setting_up" | "no_payment_yet" | "confirmed" | "still_preparing" | "ready" | "expired" | "canceled" | "gave_up";

/** What the screen shows. "Payment confirmed" only for processing/ready - never from the URL, never while awaiting_payment. */
export function completeView(status: CheckoutStatus | null, elapsedMs: number, gaveUp: boolean): CompleteView {
  if (!status) return gaveUp ? "gave_up" : "setting_up";
  switch (status.state) {
    case "ready": return "ready";
    case "expired": return "expired";
    case "canceled": return "canceled";
    case "processing": return status.delayed ? "still_preparing" : "confirmed";
    case "awaiting_payment":
      if (gaveUp) return "no_payment_yet";
      return elapsedMs >= NO_PAYMENT_AFTER_MS ? "no_payment_yet" : "setting_up";
  }
}
