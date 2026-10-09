import { z } from "zod";
import { getBillingDeps, isStripeConfigured } from "@/lib/billing/deps.server";
import { BillingError } from "@/lib/billing/errors";
import { getCheckoutUiState } from "@/lib/billing/reconcile";
import { createClient } from "@/lib/supabase/server";

/**
 * Safe polling endpoint for the post-payment screen. Returns ONLY the buyer's
 * own checkout state ({state, tenantId?}); never any Stripe data. The browser
 * redirect from Stripe is not trusted - this reads server state and (rate-limited
 * server-side) asks Stripe directly, so opening the success URL without paying can
 * never produce a Space.
 */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("c");
  if (!z.string().uuid().safeParse(id).success) return Response.json({ error: "bad request" }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!isStripeConfigured()) return Response.json({ error: "unavailable" }, { status: 503 });
  try {
    const state = await getCheckoutUiState(getBillingDeps(), user.id, id!);
    return Response.json(state, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof BillingError && e.code === "forbidden") return Response.json({ error: "not found" }, { status: 404 });
    return Response.json({ error: "temporarily unavailable" }, { status: 503 });
  }
}
