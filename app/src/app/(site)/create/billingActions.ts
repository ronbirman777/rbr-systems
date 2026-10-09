"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getBillingDeps, isStripeConfigured } from "@/lib/billing/deps.server";
import { BillingError } from "@/lib/billing/errors";
import { cancelCheckoutByUser, isSellableSpaceType, previewCheckout, startCheckout } from "@/lib/billing/checkout";
import { isStripeHostedUrl } from "@/lib/billing/safeRedirect";
import type { CouponRefusal } from "@/lib/billing/store";
import { ACCOUNT_LOCALE_COOKIE, getAccountLocale } from "@/lib/i18n/accountLocale";
import { isSupportedLocale } from "@/lib/i18n/locales";
import { safeInternalRedirectPath } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";

/** What the browser is told. No Stripe ids, no internal detail - only a code the UI maps to a localised message. */
export type FunnelError = "unavailable" | "consent" | "sign_in" | CouponRefusal;

export type QuoteView = {
  currency: string;
  baseMinor: number;
  todayMinor: number;
  discount: null | { discountedMinor: number; cycles: number | null; thenMinor: number | null };
};

export type ApplyCouponResult =
  | { ok: true; quote: QuoteView; couponCode: string | null }
  | { ok: false; error: FunnelError; quote: QuoteView | null };

async function currentUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

function funnelErrorFrom(e: unknown): FunnelError {
  if (e instanceof BillingError && e.code === "consent_required") return "consent";
  return "unavailable";
}

/**
 * "Apply" on the pre-checkout page (also called with an empty code to remove one).
 * Validates the coupon server-side and returns a server-computed quote. Nothing the
 * browser sends here can set a price - it only names a Space type and a code.
 */
export async function applyCouponAction(spaceType: string, code: string): Promise<ApplyCouponResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "sign_in", quote: null };
  if (!isSellableSpaceType(spaceType) || !isStripeConfigured()) return { ok: false, error: "unavailable", quote: null };
  try {
    const preview = await previewCheckout(getBillingDeps(), { userId: user.id, spaceType, couponCode: code.slice(0, 64), locale: await getAccountLocale() });
    if (preview.coupon.applied) return { ok: true, quote: preview.quote, couponCode: preview.coupon.code };
    if (preview.coupon.error) return { ok: false, error: preview.coupon.error, quote: preview.quote };
    return { ok: true, quote: preview.quote, couponCode: null };
  } catch (e) {
    return { ok: false, error: funnelErrorFrom(e), quote: null };
  }
}

export type StartCheckoutState = { error: FunnelError | null };

/**
 * Create the Stripe Checkout Session and send the browser to it. The form carries only: Space type, coupon
 * code, and the two consent checkboxes. Price/currency/discount/customer are resolved on the server.
 */
export async function startCheckoutAction(_prev: StartCheckoutState, formData: FormData): Promise<StartCheckoutState> {
  const user = await currentUser();
  if (!user) redirect("/log-in");
  const spaceType = String(formData.get("spaceType") ?? "");
  if (!isSellableSpaceType(spaceType) || !isStripeConfigured()) return { error: "unavailable" };

  let url: string;
  try {
    const result = await startCheckout(getBillingDeps(), {
      userId: user.id, email: user.email ?? null, spaceType,
      couponCode: String(formData.get("coupon") ?? "").slice(0, 64) || null,
      consent: { immediateService: formData.get("consentImmediate") === "on", withdrawalAcknowledged: formData.get("consentWithdrawal") === "on" },
      locale: await getAccountLocale(),
    });
    if ("error" in result) return { error: result.error };
    url = result.url;
  } catch (e) {
    return { error: funnelErrorFrom(e) };
  }
  if (!isStripeHostedUrl(url)) return { error: "unavailable" };
  redirect(url);
}

/** The customer returned from Stripe without paying: free the reservation; no Space exists to clean up. */
export async function cancelCheckoutAction(spaceType: string): Promise<void> {
  const user = await currentUser();
  if (!user || !isSellableSpaceType(spaceType) || !isStripeConfigured()) return;
  await cancelCheckoutByUser(getBillingDeps(), user.id, spaceType).catch(() => undefined);
}

/** Persist the visitor's language choice for account-level pages. */
export async function setAccountLocaleAction(locale: string, next: string): Promise<void> {
  if (isSupportedLocale(locale)) {
    (await cookies()).set(ACCOUNT_LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
  }
  redirect(safeInternalRedirectPath(next, "/create"));
}
