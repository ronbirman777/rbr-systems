import { getBillingDeps, isStripeConfigured } from "@/lib/billing/deps.server";
import { handleStripeWebhook } from "@/lib/billing/webhook";

/**
 * Stripe webhook endpoint. The body MUST be read as raw text: the signature is
 * an HMAC over the exact bytes, so any JSON re-serialisation would break it.
 * Authorization is the signature (verified inside handleStripeWebhook) - this
 * route is exempt from the preview gate for that reason (see proxy.ts) and
 * answers nothing but the outcome string, never internal detail.
 */
export async function POST(request: Request) {
  if (!isStripeConfigured()) return new Response("billing not configured", { status: 503 });
  const rawBody = await request.text();
  const result = await handleStripeWebhook(getBillingDeps(), rawBody, request.headers.get("stripe-signature"));
  return new Response(result.body, { status: result.status });
}
