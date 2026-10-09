import type { BillingDeps } from "../deps";
import { startCheckout } from "../checkout";
import { handleStripeWebhook } from "../webhook";
import { eventBody, FakeStripe, validSig } from "./fakeGateway";
import { FakeStore } from "./fakeStore";

export const USER = "11111111-1111-4111-8111-111111111111";
export const OTHER = "22222222-2222-4222-8222-222222222222";
export const CONSENT = { immediateService: true, withdrawalAcknowledged: true };

export function makeHarness() {
  const store = new FakeStore();
  const stripe = new FakeStripe();
  const seeded: { tenantId: string; type: string; name: string }[] = [];
  const deps: BillingDeps = {
    store, stripe, now: () => store.now, appUrl: "https://app.example.test", automaticTax: false,
    seedSpace: async (tenantId, type, name) => { seeded.push({ tenantId, type, name }); },
    untitledName: (t) => (t === "teach" ? "My Teaching Space" : "Untitled Retreat"),
    defaultTimezone: "UTC",
  };
  store.coupons = [];
  let evSeq = 0;
  /** Deliver a signed webhook exactly as Stripe's servers would. */
  const deliver = (type: string, objectId: string, id = `evt_${++evSeq}`, extra: { created?: number } = {}) =>
    handleStripeWebhook(deps, eventBody({ id, type, objectId, ...extra }), validSig);
  const advance = (ms: number) => { store.now = new Date(store.now.getTime() + ms); stripe.now = store.now; };
  return { store, stripe, deps, seeded, deliver, advance };
}
export type Harness = ReturnType<typeof makeHarness>;

/** The customer starts checkout (server side), pays at Stripe, and returns the identifiers. */
export async function checkoutAndPay(h: Harness, o: { userId?: string; spaceType?: "teach" | "retreat"; coupon?: string | null } = {}) {
  const userId = o.userId ?? USER;
  const r = await startCheckout(h.deps, { userId, email: `${userId}@example.com`, spaceType: o.spaceType ?? "teach", couponCode: o.coupon ?? null, consent: CONSENT, locale: "en" });
  if ("error" in r) throw new Error(`checkout refused: ${r.error}`);
  const pending = (await h.store.findOpenCheckout(userId, o.spaceType ?? "teach"))!;
  const session = [...h.stripe.sessions.values()].find((s) => s.clientReferenceId === pending.id)!;
  const paid = h.stripe.completePayment(session.id);
  return { userId, pendingId: pending.id, sessionId: session.id, ...paid };
}
