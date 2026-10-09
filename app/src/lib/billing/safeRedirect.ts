/**
 * Checkout / portal destinations come from Stripe's API (trusted), but a redirect
 * to an unexpected host is never acceptable (open-redirect class). Only https URLs
 * on a Stripe-owned host are followed.
 */
const STRIPE_HOST = /(^|\.)stripe\.com$/i;

export function isStripeHostedUrl(raw: string | null | undefined): boolean {
  if (!raw) return false;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && STRIPE_HOST.test(u.hostname) && !u.username && !u.password;
  } catch {
    return false;
  }
}
