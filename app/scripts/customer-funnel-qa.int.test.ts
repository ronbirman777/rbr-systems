/**
 * TASK 032 - customer-funnel real-browser QA: SEED and CLEANUP phases (the browser phase is customer-funnel-qa.mjs).
 *
 * Runs over the REAL Staging database through the REAL billing services; the only fake is Stripe (FakeStripe).
 * Skipped unless FUNNEL_QA_PHASE is "seed" or "cleanup".
 *
 *   FUNNEL_QA_PHASE=seed    FUNNEL_QA_MANIFEST=<path> SUPABASE_URL=... SUPABASE_SECRET_KEY=<service role JWT> npx vitest run scripts/customer-funnel-qa.int.test.ts
 *   FUNNEL_QA_PHASE=cleanup FUNNEL_QA_MANIFEST=<path> ...                                                       (same command)
 *
 * Safety (fail closed): assertStagingTarget() runs before any client exists; every synthetic row is recorded by the run
 * and removed only through runScopedDelete (exact ids, counted before, asserted after); the launch flag and the plan's
 * Stripe test ids are restored to the values this run READ before changing them. admin_audit_log is never touched
 * (this script does not call any Admin mutation, so it writes no audit rows). The manifest holds ids and the run id
 * only - never a key.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const PHASE = process.env.FUNNEL_QA_PHASE ?? "";
const MANIFEST = process.env.FUNNEL_QA_MANIFEST ?? "";
const URL_ = process.env.SUPABASE_URL ?? "";
const NONE = ["00000000-0000-0000-0000-000000000000"];

type Manifest = {
  runId: string;
  flagBefore: boolean | null;
  planBefore: { stripe_test_product_id: string | null; stripe_test_price_id: string | null } | null;
  users: Record<string, { id: string; email: string }>;
  tenants: Record<string, { id: string; pendingId: string; subscriptionId: string; type: string }>;
  coupons: Record<string, string>; // key -> code
  couponIds: string[];
  fakeInvoicePrefix: string;
};

const save = (m: Manifest) => writeFileSync(MANIFEST, JSON.stringify(m, null, 2));

async function connect() {
  const { assertStagingTarget } = await import("./stagingGuard.mjs");
  assertStagingTarget({ url: URL_, serviceKey: process.env.SUPABASE_SECRET_KEY });
  return createClient(URL_, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
}

describe.skipIf(PHASE !== "seed")("customer funnel QA - seed", () => {
  it("seeds synthetic subscriptions in every customer-visible state", async () => {
    expect(MANIFEST).toBeTruthy();
    expect(existsSync(MANIFEST), "a manifest already exists: run cleanup first").toBe(false);
    const db = await connect();
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL_;
    const run = randomBytes(3).toString("hex");
    const m: Manifest = { runId: run, flagBefore: null, planBefore: null, users: {}, tenants: {}, coupons: {}, couponIds: [], fakeInvoicePrefix: `in_FAKE${run}` };
    save(m);

    const { FakeStripe, eventBody, validSig } = await import("../src/lib/billing/testing/fakeGateway");
    const { createSupabaseBillingStore } = await import("../src/lib/billing/store");
    const { seedNewSpaceDefaults } = await import("../src/lib/billing/seedSpace");
    const { handleStripeWebhook } = await import("../src/lib/billing/webhook");
    const { startCheckout } = await import("../src/lib/billing/checkout");
    const { runBillingJobs } = await import("../src/lib/billing/lifecycleJob");

    const stripe = new FakeStripe(run);
    let clock = new Date();
    const setClock = (d: Date) => { clock = d; stripe.now = d; };
    const advance = (ms: number) => setClock(new Date(clock.getTime() + ms));
    const store = createSupabaseBillingStore(db);
    const deps = {
      store, stripe, now: () => clock, appUrl: "https://app.example.test", automaticTax: false,
      seedSpace: (t: string, type: "teach" | "retreat", name: string) => seedNewSpaceDefaults(db, t, type, name),
      untitledName: (t: "teach" | "retreat") => (t === "teach" ? "My Teaching Space" : "Untitled Retreat"), defaultTimezone: "UTC",
    };
    let seq = 0;
    const deliver = (type: string, objectId: string) => handleStripeWebhook(deps, eventBody({ id: `evt_QA32FUN${run}_${++seq}`, type, objectId }), validSig);
    const consent = { immediateService: true, withdrawalAcknowledged: true };

    // ---- restore points: record what this run READ before it changes anything shared
    m.flagBefore = (await db.from("billing_settings").select("paid_checkout_enabled").single()).data!.paid_checkout_enabled;
    const planRow = (await db.from("billing_plans").select("stripe_test_product_id,stripe_test_price_id").eq("plan_key", "space_monthly_usd").single()).data!;
    m.planBefore = { stripe_test_product_id: planRow.stripe_test_product_id ?? null, stripe_test_price_id: planRow.stripe_test_price_id ?? null };
    save(m);

    // ---- users (admin API; no password is ever typed anywhere - the browser phase mints sessions from magic-link tokens)
    const mkUser = async (label: string) => {
      const email = `qa032fun-${run}-${label}@example.com`;
      const { data, error } = await db.auth.admin.createUser({ email, password: randomBytes(18).toString("base64url"), email_confirm: true });
      if (error) throw error;
      m.users[label] = { id: data.user.id, email }; save(m);
      return data.user.id;
    };
    const owner = await mkUser("owner");
    await mkUser("fresh");

    // ---- shared Staging changes (values restored by cleanup): trusted plan synced to a FAKE price id, then the flag on
    const fakePrice = `price_FAKE${run}`;
    {
      const { error } = await db.from("billing_plans").update({ stripe_test_product_id: `prod_FAKE${run}`, stripe_test_price_id: fakePrice }).eq("plan_key", "space_monthly_usd");
      if (error) throw error;
      stripe.price.id = fakePrice;
    }
    {
      const { error } = await db.from("billing_settings").update({ paid_checkout_enabled: true }).eq("singleton", true);
      if (error) throw error;
    }

    // ---- coupons: inserted directly (no Admin call, so no permanent audit rows) with fake Stripe counterparts
    const upper = run.toUpperCase();
    type CouponSpec = { key: string; suffix: string; row: Record<string, unknown>; stripe: { percentOff: number | null; amountOffMinor: number | null; currency: string | null; duration: "once" | "repeating" | "forever"; months: number | null } };
    const specs: CouponSpec[] = [
      { key: "l10", suffix: "L10", row: { discount_type: "percent", percent_off: 10, usage_rule: "once_per_user", duration_type: "repeating", duration_cycles: 3 }, stripe: { percentOff: 10, amountOffMinor: null, currency: null, duration: "repeating", months: 3 } },
      { key: "for20", suffix: "FOR20", row: { discount_type: "percent", percent_off: 20, usage_rule: "unlimited_during_validity", duration_type: "forever" }, stripe: { percentOff: 20, amountOffMinor: null, currency: null, duration: "forever", months: null } },
      { key: "once5", suffix: "ONCE5", row: { discount_type: "fixed_amount", amount_off_minor: 500, currency: "USD", usage_rule: "unlimited_during_validity", duration_type: "once" }, stripe: { percentOff: null, amountOffMinor: 500, currency: "USD", duration: "once", months: null } },
      { key: "expired", suffix: "EXP", row: { discount_type: "percent", percent_off: 10, usage_rule: "unlimited_during_validity", duration_type: "once", valid_until: new Date(Date.now() - 5 * 86400_000).toISOString() }, stripe: { percentOff: 10, amountOffMinor: null, currency: null, duration: "once", months: null } },
      { key: "future", suffix: "SOON", row: { discount_type: "percent", percent_off: 10, usage_rule: "unlimited_during_validity", duration_type: "once", valid_from: new Date(Date.now() + 20 * 86400_000).toISOString() }, stripe: { percentOff: 10, amountOffMinor: null, currency: null, duration: "once", months: null } },
      { key: "inactive", suffix: "OFF", row: { discount_type: "percent", percent_off: 10, usage_rule: "unlimited_during_validity", duration_type: "once", active: false }, stripe: { percentOff: 10, amountOffMinor: null, currency: null, duration: "once", months: null } },
    ];
    for (const s of specs) {
      const code = `QA32F${upper}${s.suffix}`;
      const sc = await stripe.createCoupon({ internalCouponId: code, name: code, percentOff: s.stripe.percentOff, amountOffMinor: s.stripe.amountOffMinor, currency: s.stripe.currency, duration: s.stripe.duration, durationInMonths: s.stripe.months });
      const { data, error } = await db.from("coupons").insert({ code, normalized_code: code, description: `TASK 032 funnel QA ${run}`, stripe_test_coupon_id: sc.id, ...s.row }).select("id").single();
      if (error) throw error;
      m.coupons[s.key] = code; m.couponIds.push(data!.id); save(m);
    }

    // ---- one purchase through the REAL services (FakeStripe pays), then a fixed real-time-relative storyline
    const DAY = 86400_000;
    const buy = async (spaceType: "teach" | "retreat", coupon: string | null) => {
      const r = await startCheckout(deps, { userId: owner, email: m.users.owner.email, spaceType, couponCode: coupon, consent, locale: "en" });
      if ("error" in r) throw new Error(`checkout refused: ${r.error}`);
      const session = [...stripe.sessions.values()].find((s) => s.clientReferenceId === r.pendingCheckoutId)!;
      const paid = stripe.completePayment(session.id);
      const res = await deliver("checkout.session.completed", session.id);
      if (res.status !== 200) throw new Error(`webhook ${res.status} ${res.body}`);
      const { data: sub } = await db.from("space_subscriptions").select("id, tenant_id").eq("stripe_subscription_id", paid.subscriptionId).single();
      return { pendingId: r.pendingCheckoutId, subscriptionId: paid.subscriptionId, rowId: sub!.id as string, tenantId: sub!.tenant_id as string, invoiceId: paid.invoiceId };
    };
    const record = async (key: string, type: "teach" | "retreat", p: Awaited<ReturnType<typeof buy>>, name: string) => {
      m.tenants[key] = { id: p.tenantId, pendingId: p.pendingId, subscriptionId: p.subscriptionId, type }; save(m);
      const { error } = await db.from("tenants").update({ name }).eq("id", p.tenantId);
      if (error) throw error;
    };
    const now = Date.now();
    const jobs = async (hours: number) => { advance(hours * 3600_000); return runBillingJobs(deps, null); };

    // 1. active
    setClock(new Date(now - 1 * DAY));
    const active = await buy("teach", null);
    await record("active", "teach", active, "QA Active Teach Space");

    // 2. discounted with progress: LAUNCH-style 10% x 3, first cycle paid. (A coupon reservation is checked against the
    //    DB's real clock, so this purchase cannot be back-dated; "cycle 1 of 3" is the progress shown.)
    setClock(new Date(Date.now() - 60_000));
    const disc = await buy("retreat", m.coupons.l10);
    await record("discounted", "retreat", disc, "QA Discounted Flow");

    // 3. canceling at period end
    setClock(new Date(now - 3 * DAY));
    const canc = await buy("teach", null);
    stripe.setCancelAtPeriodEnd(canc.subscriptionId, true);
    await deliver("customer.subscription.updated", canc.subscriptionId);
    await record("canceling", "teach", canc, "QA Canceling Teach");

    // 4. payment issue (failed < 24h ago)
    setClock(new Date(now - 31 * DAY));
    const issue = await buy("retreat", null);
    setClock(new Date(now - 2 * 3600_000));
    const f1 = stripe.failRenewal(issue.subscriptionId);
    await deliver("invoice.payment_failed", f1.id);
    await record("payment_issue", "retreat", issue, "QA Payment Issue Flow");

    // 5. guest suspended (failed ~48h ago, past the 24h mark)
    setClock(new Date(now - 32 * DAY));
    const guest = await buy("teach", null);
    setClock(new Date(now - 48 * 3600_000));
    const f2 = stripe.failRenewal(guest.subscriptionId);
    await deliver("invoice.payment_failed", f2.id);
    await jobs(25);
    await record("guest_suspended", "teach", guest, "QA Guest Suspended Teach");

    // 6. studio suspended (failed ~9 days ago, past the 168h mark)
    setClock(new Date(now - 40 * DAY));
    const studio = await buy("retreat", null);
    setClock(new Date(now - 9 * DAY));
    const f3 = stripe.failRenewal(studio.subscriptionId);
    await deliver("invoice.payment_failed", f3.id);
    await jobs(25);
    await jobs(24 * 6.5);
    await record("studio_suspended", "retreat", studio, "QA Studio Suspended Flow");

    // 7. ended (cancel at period end, then the subscription was deleted 5 days ago)
    setClock(new Date(now - 40 * DAY));
    const ended = await buy("teach", null);
    stripe.setCancelAtPeriodEnd(ended.subscriptionId, true);
    await deliver("customer.subscription.updated", ended.subscriptionId);
    setClock(new Date(now - 5 * DAY));
    stripe.cancelNow(ended.subscriptionId);
    await deliver("customer.subscription.deleted", ended.subscriptionId);
    await record("ended", "teach", ended, "QA Ended Teach");

    // a pending checkout that was never paid (for /create/complete "awaiting payment")
    // is created by the browser phase via the real apply-coupon action; nothing to seed here.

    // ---- the seeded states really are what the access function says (observed, not assumed)
    const expectReason: Record<string, string> = {
      active: "active", discounted: "active", canceling: "active", payment_issue: "payment_issue",
      guest_suspended: "guest_suspended", studio_suspended: "studio_suspended", ended: "subscription_ended",
    };
    for (const [key, reason] of Object.entries(expectReason)) {
      const { data } = await db.rpc("space_access_state", { p_tenant_id: m.tenants[key].id });
      expect(data?.[0]?.reason, `${key} access reason`).toBe(reason);
    }
    save(m);
  }, 600_000);
});

describe.skipIf(PHASE !== "cleanup")("customer funnel QA - restore and run-scoped cleanup", () => {
  it("restores shared Staging values, removes only this run's rows, verifies zero residue", async () => {
    expect(existsSync(MANIFEST), "no manifest: nothing to clean").toBe(true);
    const m = JSON.parse(readFileSync(MANIFEST, "utf8")) as Manifest;
    const run = m.runId;
    const db: SupabaseClient = await connect();

    // restore only values this run itself read and changed
    if (m.flagBefore !== null) {
      const { error } = await db.from("billing_settings").update({ paid_checkout_enabled: m.flagBefore }).eq("singleton", true);
      if (error) throw error;
    }
    if (m.planBefore) {
      const { error } = await db.from("billing_plans").update(m.planBefore).eq("plan_key", "space_monthly_usd");
      if (error) throw error;
    }

    const U = Object.values(m.users).map((u) => u.id);
    const Uq = U.length ? U : NONE;
    const idsWhere = async (table: string, build: (q: any) => any, col = "id") => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const { data, error } = await build(db.from(table).select(col));
      if (error) throw new Error(`cleanup lookup ${table}: ${error.message}`);
      return ((data ?? []) as unknown as Record<string, string>[]).map((r) => r[col]);
    };
    const tIds = await idsWhere("tenants", (q) => q.in("created_by", Uq));
    const T = tIds.length ? tIds : NONE;
    const pcIds = await idsWhere("pending_space_checkouts", (q) => q.in("user_id", Uq));
    const P = pcIds.length ? pcIds : NONE;
    const couponIds = m.couponIds.length ? m.couponIds : NONE;
    const plan: [string, string, string[]][] = [
      ["billing_email_outbox", "id", await idsWhere("billing_email_outbox", (q) => q.in("user_id", Uq))],
      ["billing_invoices", "id", await idsWhere("billing_invoices", (q) => q.like("stripe_invoice_id", `in_FAKE${run}%`))],
      ["billing_events", "id", await idsWhere("billing_events", (q) => q.like("stripe_event_id", `evt_QA32FUN${run}%`))],
      ["coupon_redemptions", "id", [...(await idsWhere("coupon_redemptions", (q) => q.in("pending_checkout_id", P))), ...(await idsWhere("coupon_redemptions", (q) => q.in("tenant_id", T))), ...(await idsWhere("coupon_redemptions", (q) => q.in("coupon_id", couponIds)))]],
      ["billing_acceptances", "id", await idsWhere("billing_acceptances", (q) => q.in("pending_checkout_id", P))],
      ["space_subscriptions", "id", await idsWhere("space_subscriptions", (q) => q.in("tenant_id", T))],
      ["published_spaces", "tenant_id", await idsWhere("published_spaces", (q) => q.in("tenant_id", T), "tenant_id")],
      ["tenants", "id", tIds],
      ["pending_space_checkouts", "id", pcIds],
      ["billing_customers", "id", await idsWhere("billing_customers", (q) => q.in("user_id", Uq))],
      ["coupons", "id", m.couponIds],
    ];
    const total = plan.reduce((n, [, , ids]) => n + new Set(ids).size, 0);
    if (total > 500) throw new Error(`cleanup ABORTED: ${total} rows selected, far more than a run creates`);
    const removed: string[] = [];
    for (const [table, column, ids] of plan) {
      const { runScopedDelete } = await import("./stagingGuard.mjs");
      const n = await runScopedDelete(db, { table, column, ids });
      if (n) removed.push(`${table}:${n}`);
    }
    for (const id of U) { const { error } = await db.auth.admin.deleteUser(id); if (error) throw new Error(`deleteUser: ${error.message}`); }
    console.log(`cleanup removed ${removed.join(", ")}`);

    // residue: nothing carrying this run's id may remain; shared values are back
    for (const [table, col, pat] of [["billing_email_outbox", "dedupe_key", `%${run}%`], ["billing_invoices", "stripe_invoice_id", `%${run}%`], ["billing_customers", "stripe_customer_id", `%${run}%`], ["space_subscriptions", "stripe_subscription_id", `%${run}%`], ["billing_events", "stripe_event_id", `%${run}%`], ["coupons", "normalized_code", `%${run.toUpperCase()}%`]] as const) {
      const { count } = await db.from(table).select("*", { count: "exact", head: true }).ilike(col, pat);
      expect(count, `${table} still carries this run's id`).toBe(0);
    }
    for (const id of U) expect((await db.auth.admin.getUserById(id)).data.user, "user removed").toBeNull();
    expect((await db.from("billing_settings").select("paid_checkout_enabled").single()).data!.paid_checkout_enabled).toBe(m.flagBefore);
    const planNow = (await db.from("billing_plans").select("stripe_test_product_id,stripe_test_price_id").eq("plan_key", "space_monthly_usd").single()).data!;
    expect(planNow).toEqual(m.planBefore);
    writeFileSync(MANIFEST + ".cleaned", JSON.stringify({ runId: run, cleanedAt: new Date().toISOString() }));
  }, 300_000);
});
