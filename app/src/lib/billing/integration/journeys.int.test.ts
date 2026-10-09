/**
 * TASK 032 - customer journeys through the REAL services over the REAL Staging
 * database (the only fake is Stripe itself - FakeStripe - because Stripe Test Mode
 * credentials are not available here). Skipped unless STAGING_BILLING_INTEGRATION=1.
 *
 *   STAGING_BILLING_INTEGRATION=1 SUPABASE_URL=... SUPABASE_SECRET_KEY=<service role JWT> \
 *   SUPABASE_PUBLISHABLE_KEY=... npx vitest run src/lib/billing/integration
 *
 * Safety: refuses any project but Staging; creates only synthetic users/rows (qa032int);
 * restores the launch flag and the plan's Stripe ids; removes everything it created.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const ENABLED = process.env.STAGING_BILLING_INTEGRATION === "1";
const URL_ = process.env.SUPABASE_URL ?? "";

describe.skipIf(!ENABLED)("billing journeys on Staging (real DB, fake Stripe)", () => {
  let db: SupabaseClient;
  let h: Awaited<ReturnType<typeof buildHarness>>;
  const run = randomBytes(3).toString("hex");
  const users: string[] = [];
  const emailOf = new Map<string, string>();
  let flagBefore = false;
  let planBefore: Record<string, unknown> = {};

  async function mkUser(label: string) {
    const email = `qa032int-${run}-${label}@example.com`;
    const { data, error } = await db.auth.admin.createUser({ email, password: randomBytes(18).toString("base64url"), email_confirm: true });
    if (error) throw error;
    users.push(data.user.id);
    emailOf.set(data.user.id, email);
    return data.user.id;
  }

  async function buildHarness() {
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL_;
    const { FakeStripe, eventBody, validSig } = await import("../testing/fakeGateway");
    const { createSupabaseBillingStore } = await import("../store");
    const { seedNewSpaceDefaults } = await import("../seedSpace");
    const { handleStripeWebhook } = await import("../webhook");
    const { startCheckout, previewCheckout, cancelCheckoutByUser } = await import("../checkout");
    const { runBillingJobs } = await import("../lifecycleJob");
    const admin = await import("../admin/service");
    const stripe = new FakeStripe(run); // every fake Stripe id carries this run's exact id
    let clock = new Date();
    const store = createSupabaseBillingStore(db);
    const deps = {
      store, stripe, now: () => clock, appUrl: "https://app.example.test", automaticTax: false,
      seedSpace: (t: string, type: "teach" | "retreat", name: string) => seedNewSpaceDefaults(db, t, type, name),
      untitledName: (t: "teach" | "retreat") => (t === "teach" ? "My Teaching Space" : "Untitled Retreat"), defaultTimezone: "UTC",
    };
    let seq = 0;
    return {
      stripe, store, deps, admin, startCheckout, previewCheckout, cancelCheckoutByUser, runBillingJobs,
      setClock: (d: Date) => { clock = d; stripe.now = d; },
      advance: (ms: number) => { clock = new Date(clock.getTime() + ms); stripe.now = clock; },
      deliver: (type: string, objectId: string, id = `evt_QA32INT${run}_${++seq}`) => handleStripeWebhook(deps, eventBody({ id, type, objectId }), validSig),
      consent: { immediateService: true, withdrawalAcknowledged: true },
    };
  }

  async function pay(userId: string, spaceType: "teach" | "retreat", coupon: string | null = null) {
    const r = await h.startCheckout(h.deps, { userId, email: emailOf.get(userId) ?? null, spaceType, couponCode: coupon, consent: h.consent, locale: "en" });
    if ("error" in r) return { error: r.error } as const;
    const session = [...h.stripe.sessions.values()].find((s) => s.clientReferenceId === r.pendingCheckoutId)!;
    const paid = h.stripe.completePayment(session.id);
    return { pendingId: r.pendingCheckoutId, sessionId: session.id, ...paid } as const;
  }
  const mustPay = async (...a: Parameters<typeof pay>) => { const r = await pay(...a); if ("error" in r) throw new Error(`refused: ${r.error}`); return r; };

  beforeAll(async () => {
    // Fails CLOSED before any client exists: exact Staging URL + a service-role JWT whose `ref` is Staging.
    const { assertStagingTarget } = await import("../../../../scripts/stagingGuard.mjs");
    assertStagingTarget({ url: URL_, serviceKey: process.env.SUPABASE_SECRET_KEY });
    db = createClient(URL_, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    flagBefore = (await db.from("billing_settings").select("paid_checkout_enabled").single()).data!.paid_checkout_enabled;
    planBefore = (await db.from("billing_plans").select("*").eq("plan_key", "space_monthly_usd").single()).data!;
    h = await buildHarness();
    await db.from("billing_settings").update({ paid_checkout_enabled: true }).eq("singleton", true);
    // Sync the plan against the FAKE Stripe through the real Admin service (also proves plan sync + audit).
    const adminCtx = { userId: await mkUser("admin"), email: null, role: "owner" as const, requestId: `qa032int-${run}` };
    const r = await h.admin.adminSyncPlanToStripe(adminCtx, db, h.deps);
    expect(r.ok).toBe(true);
  }, 60_000);

  afterAll(async () => {
    // Restore shared Staging state this run changed (values this run itself read), then run-scoped, count-asserted cleanup.
    await db.from("billing_settings").update({ paid_checkout_enabled: flagBefore }).eq("singleton", true);
    await db.from("billing_plans").update({
      stripe_test_product_id: planBefore.stripe_test_product_id ?? null, stripe_test_price_id: planBefore.stripe_test_price_id ?? null,
    }).eq("plan_key", "space_monthly_usd");
    const { runScopedDelete } = await import("../../../../scripts/stagingGuard.mjs");
    const none = ["00000000-0000-0000-0000-000000000000"];
    const U = users.length ? users : none;
    const idsWhere = async (table: string, build: (q: any) => any, col = "id") => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const { data, error } = await build(db.from(table).select(col));
      if (error) throw new Error(`cleanup lookup ${table}: ${error.message}`);
      return ((data ?? []) as Record<string, string>[]).map((r) => r[col]);
    };
    const tIds = await idsWhere("tenants", (q) => q.in("created_by", U));
    const T = tIds.length ? tIds : none;
    const pcIds = await idsWhere("pending_space_checkouts", (q) => q.in("user_id", U));
    const P = pcIds.length ? pcIds : none;
    const plan: [string, string, string[]][] = [
      ["billing_email_outbox", "id", await idsWhere("billing_email_outbox", (q) => q.in("user_id", U))],
      ["billing_invoices", "id", await idsWhere("billing_invoices", (q) => q.like("stripe_invoice_id", `in_FAKE${run}%`))],
      ["billing_events", "id", await idsWhere("billing_events", (q) => q.like("stripe_event_id", `evt_QA32INT${run}%`))],
      ["coupon_redemptions", "id", [...(await idsWhere("coupon_redemptions", (q) => q.in("pending_checkout_id", P))), ...(await idsWhere("coupon_redemptions", (q) => q.in("tenant_id", T)))]],
      ["billing_acceptances", "id", await idsWhere("billing_acceptances", (q) => q.in("pending_checkout_id", P))],
      ["space_subscriptions", "id", await idsWhere("space_subscriptions", (q) => q.in("tenant_id", T))],
      ["published_spaces", "tenant_id", await idsWhere("published_spaces", (q) => q.in("tenant_id", T), "tenant_id")],
      ["tenants", "id", tIds],
      ["pending_space_checkouts", "id", pcIds],
      ["billing_customers", "id", await idsWhere("billing_customers", (q) => q.in("user_id", U))],
      ["coupons", "id", await idsWhere("coupons", (q) => q.like("normalized_code", `QA32I${run.toUpperCase()}%`))],
    ];
    const total = plan.reduce((n, [, , ids]) => n + new Set(ids).size, 0);
    if (total > 2000) throw new Error(`cleanup ABORTED: ${total} rows selected, far more than a run creates`);
    for (const [table, column, ids] of plan) await runScopedDelete(db, { table, column, ids });
    for (const id of users) await db.auth.admin.deleteUser(id);
    // Regression guard: nothing carrying this run's id may remain (admin_audit_log is append-only and excepted).
    for (const [table, col, pat] of [["billing_email_outbox", "dedupe_key", `%${run}%`], ["billing_invoices", "stripe_invoice_id", `%${run}%`], ["billing_customers", "stripe_customer_id", `%${run}%`], ["space_subscriptions", "stripe_subscription_id", `%${run}%`], ["billing_events", "stripe_event_id", `%${run}%`]] as const) {
      const { count } = await db.from(table).select("*", { count: "exact", head: true }).ilike(col, pat);
      expect(count, `${table} still carries this run's id`).toBe(0);
    }
  }, 120_000);

  const mkCoupon = async (suffix: string, raw: Record<string, unknown>) => {
    const code = `QA32I${run.toUpperCase()}${suffix}`;
    const ctx = { userId: users[0], email: null, role: "owner" as const, requestId: `qa032int-${run}` };
    const r = await h.admin.adminCreateCoupon(ctx, db, h.deps, { code, usageRule: "unlimited_during_validity", ...raw });
    expect(r, JSON.stringify(r)).toMatchObject({ ok: true });
    return code;
  };

  it("A. new account -> Teach purchase -> exactly one Space, owner, subscription, defaults, invoice, one confirmation", async () => {
    const u = await mkUser("a");
    const paid = await mustPay(u, "teach");
    const { count: before } = await db.from("tenants").select("*", { count: "exact", head: true }).eq("created_by", u);
    expect(before).toBe(0); // NO Space exists before payment is verified
    expect((await h.deliver("checkout.session.completed", paid.sessionId)).status).toBe(200);
    const { data: tenants } = await db.from("tenants").select("id, name, product_type, status").eq("created_by", u);
    expect(tenants).toHaveLength(1);
    expect(tenants![0]).toMatchObject({ product_type: "teach", name: "My Teaching Space" });
    const tenantId = tenants![0].id;
    const { data: mem } = await db.from("tenant_members").select("user_id, role").eq("tenant_id", tenantId);
    expect(mem).toEqual([{ user_id: u, role: "owner" }]);
    const { data: sub } = await db.from("space_subscriptions").select("*").eq("tenant_id", tenantId).single();
    expect(sub).toMatchObject({ status: "active", base_amount_minor: 2500, billing_owner_user_id: u, stripe_mode: "test" });
    expect((await db.from("brand_configs").select("tenant_id").eq("tenant_id", tenantId)).data).toHaveLength(1);
    expect((await db.from("module_configs").select("module_key").eq("tenant_id", tenantId)).data!.map((r) => r.module_key).sort()).toEqual(["teachAudio", "teachContact", "teachReadings"]);
    const { data: inv } = await db.from("billing_invoices").select("*").eq("stripe_invoice_id", paid.invoiceId).single();
    expect(inv).toMatchObject({ tenant_id: tenantId, user_id: u, status: "paid", amount_paid_minor: 2500 });
    expect(inv.hosted_invoice_url).toMatch(/^https:\/\/invoice\.stripe\.com/);
    const { data: mails } = await db.from("billing_email_outbox").select("template, dedupe_key, payload").eq("user_id", u);
    expect(mails!.filter((m) => m.template === "payment_confirmation")).toHaveLength(1);
    expect(mails![0].payload).toMatchObject({ variant: "first", amountPaidMinor: 2500 });
    const { data: acc } = await db.from("billing_acceptances").select("tenant_id, space_subscription_id, terms_version").eq("pending_checkout_id", paid.pendingId).single();
    expect(acc).toMatchObject({ tenant_id: tenantId, space_subscription_id: sub.id });
    expect(sub.next_action).toBe("renewal");
    // the owner can read their own subscription through RLS, and cannot be locked out
    const { data: access } = await db.rpc("space_access_state", { p_tenant_id: tenantId });
    expect(access![0]).toMatchObject({ decided: true, studio_writable: true, guest_available: true, reason: "active" });
  }, 60_000);

  it("B. Flow + LAUNCH10 (10% x 3 cycles, unlimited use): redeemed, then cycle counting and automatic move to full price", async () => {
    const u = await mkUser("b");
    const code = await mkCoupon("L10", { discountType: "percent", percentOff: 10, durationType: "repeating", durationCycles: 3 });
    const prev = await h.previewCheckout(h.deps, { userId: u, spaceType: "retreat", couponCode: code.toLowerCase(), locale: "en" });
    expect(prev.quote).toMatchObject({ todayMinor: 2250, discount: { cycles: 3, thenMinor: 2500 } });
    const paid = await mustPay(u, "retreat", code);
    await h.deliver("checkout.session.completed", paid.sessionId);
    const { data: sub } = await db.from("space_subscriptions").select("*, tenants(product_type)").eq("billing_owner_user_id", u).single();
    expect((sub.tenants as { product_type: string }).product_type).toBe("retreat");
    const { data: red } = await db.from("coupon_redemptions").select("*").eq("space_subscription_id", sub.id).single();
    expect(red).toMatchObject({ status: "redeemed", cycles_total: 3, cycles_completed: 1, usage_rule: "unlimited_during_validity" });
    expect(sub.next_action).toBe("discount_cycle");
    expect(sub.next_expected_charge_minor).toBe(2250);
    for (let i = 0; i < 2; i++) { const inv = h.stripe.renew(paid.subscriptionId); await h.deliver("invoice.paid", inv.id); }
    expect((await db.from("coupon_redemptions").select("status, cycles_completed").eq("id", red.id).single()).data).toEqual({ status: "completed", cycles_completed: 3 });
    const full = h.stripe.renew(paid.subscriptionId);
    await h.deliver("invoice.paid", full.id);
    expect(full.totalMinor).toBe(2500);
    const { data: after } = await db.from("space_subscriptions").select("next_action, next_expected_charge_minor").eq("id", sub.id).single();
    expect(after).toMatchObject({ next_action: "renewal", next_expected_charge_minor: 2500 });
    // coupon analytics: one SUCCESSFUL redemption, regardless of attempts
    const { data: reds } = await db.from("coupon_redemptions").select("status").eq("coupon_id", red.coupon_id);
    expect(reds!.filter((r) => ["redeemed", "completed", "canceled"].includes(r.status))).toHaveLength(1);
  }, 90_000);

  it("C. once-per-user: first purchase succeeds, a second Space with the same coupon is refused", async () => {
    const u = await mkUser("c");
    const code = await mkCoupon("W50", { discountType: "percent", percentOff: 50, durationType: "once", usageRule: "once_per_user" });
    const first = await mustPay(u, "teach", code);
    await h.deliver("checkout.session.completed", first.sessionId);
    expect(first).toBeTruthy();
    const second = await pay(u, "retreat", code);
    expect(second).toEqual({ error: "already_used" });
    expect((await db.from("tenants").select("id").eq("created_by", u)).data).toHaveLength(1);
  }, 60_000);

  it("D. unlimited-during-validity: the same user creates two paid Spaces with the coupon", async () => {
    const u = await mkUser("d");
    const code = await mkCoupon("UNL", { discountType: "percent", percentOff: 10, durationType: "once" });
    const a = await mustPay(u, "teach", code); await h.deliver("checkout.session.completed", a.sessionId);
    const b = await mustPay(u, "retreat", code); await h.deliver("checkout.session.completed", b.sessionId);
    expect((await db.from("tenants").select("id").eq("created_by", u)).data).toHaveLength(2);
    expect((await db.from("billing_customers").select("id").eq("user_id", u)).data).toHaveLength(1); // one Stripe customer, two subscriptions
    expect((await db.from("space_subscriptions").select("id").eq("billing_owner_user_id", u)).data).toHaveLength(2);
  }, 90_000);

  it("E. abandoned checkout creates no Space and its reservation is freed", async () => {
    const u = await mkUser("e");
    const code = await mkCoupon("ABN", { discountType: "percent", percentOff: 10, durationType: "once", usageRule: "once_per_user" });
    const r = await h.startCheckout(h.deps, { userId: u, email: null, spaceType: "teach", couponCode: code, consent: h.consent, locale: "en" });
    expect("url" in r).toBe(true);
    expect((await db.from("tenants").select("id").eq("created_by", u)).data).toHaveLength(0);
    await h.cancelCheckoutByUser(h.deps, u, "teach");
    const { data: red } = await db.from("coupon_redemptions").select("status").eq("user_id", u).single();
    expect(red!.status).toBe("released");
    expect("url" in (await h.startCheckout(h.deps, { userId: u, email: null, spaceType: "retreat", couponCode: code, consent: h.consent, locale: "en" }))).toBe(true);
    expect((await db.from("tenants").select("id").eq("created_by", u)).data).toHaveLength(0);
  }, 60_000);

  it("F. duplicate / racing webhooks never create a second Space or a second email", async () => {
    const u = await mkUser("f");
    const paid = await mustPay(u, "teach");
    const results = await Promise.all([1, 2, 3, 4].map(() => h.deliver("checkout.session.completed", paid.sessionId, `evt_QA32INT${run}_dup`)));
    expect(results.filter((r) => r.body === "processed").length).toBe(1);
    expect(results.every((r) => [200, 409].includes(r.status))).toBe(true);
    await h.deliver("checkout.session.completed", paid.sessionId, `evt_QA32INT${run}_dup`);
    await h.deliver("invoice.paid", paid.invoiceId); await h.deliver("invoice.payment_succeeded", paid.invoiceId);
    expect((await db.from("tenants").select("id").eq("created_by", u)).data).toHaveLength(1);
    const { data: mails } = await db.from("billing_email_outbox").select("template").eq("user_id", u);
    expect(mails!.filter((m) => m.template === "payment_confirmation")).toHaveLength(1);
  }, 60_000);

  it("G+H. payment failure follows the timeline, then recovery restores everything and cancels pending actions", async () => {
    const u = await mkUser("g");
    const paid = await mustPay(u, "teach");
    await h.deliver("checkout.session.completed", paid.sessionId);
    const { data: sub0 } = await db.from("space_subscriptions").select("id, tenant_id").eq("billing_owner_user_id", u).single();
    h.advance(30 * 86400_000);
    const failed = h.stripe.failRenewal(paid.subscriptionId);
    await h.deliver("invoice.payment_failed", failed.id);
    expect((await db.from("billing_email_outbox").select("template").eq("user_id", u).eq("template", "payment_failed")).data).toHaveLength(1);
    const step = async (hours: number) => { h.advance(hours * 3600_000); return h.runBillingJobs(h.deps, null); };
    expect((await step(25)).lifecycleActions.map((a) => a.action)).toContain("guest_suspended");
    const g = (await db.rpc("space_access_state", { p_tenant_id: sub0!.tenant_id, p_now: h.deps.now().toISOString() })).data![0];
    expect(g).toMatchObject({ guest_available: false, studio_writable: true, reason: "guest_suspended" });
    expect((await step(24 * 6.5)).lifecycleActions.map((a) => a.action)).toContain("studio_suspended");
    const s = (await db.rpc("space_access_state", { p_tenant_id: sub0!.tenant_id, p_now: h.deps.now().toISOString() })).data![0];
    expect(s).toMatchObject({ studio_writable: false, reason: "studio_suspended" });
    expect((await step(24 * 5)).lifecycleActions.map((a) => a.action)).toContain("deletion_warning");
    const mails = (await db.from("billing_email_outbox").select("template").eq("user_id", u)).data!.map((m) => m.template);
    for (const t of ["guest_unavailable", "studio_suspended", "final_warning"]) expect(mails.filter((x) => x === t)).toHaveLength(1);
    await step(0); await step(0);
    expect((await db.from("billing_email_outbox").select("template").eq("user_id", u).eq("template", "studio_suspended")).data).toHaveLength(1); // idempotent
    // recovery
    h.stripe.recover(paid.subscriptionId);
    await h.deliver("invoice.paid", failed.id);
    const { data: rec } = await db.from("space_subscriptions").select("*").eq("id", sub0!.id).single();
    expect(rec).toMatchObject({ status: "active", payment_failed_at: null, guest_suspended_at: null, studio_suspended_at: null, deletion_warning_at: null });
    const back = (await db.rpc("space_access_state", { p_tenant_id: sub0!.tenant_id, p_now: h.deps.now().toISOString() })).data![0];
    expect(back).toMatchObject({ studio_writable: true, guest_available: true, reason: "active" });
    const rep = await step(24 * 10);
    expect(rep.lifecycleActions).toEqual([]);
    const conf = (await db.from("billing_email_outbox").select("payload, dedupe_key").eq("user_id", u).eq("template", "payment_confirmation")).data!;
    expect(conf.find((c) => c.dedupe_key === `payment_confirmation:${failed.id}`)!.payload).toMatchObject({ variant: "recovered" });
    expect((await db.from("tenants").select("id").eq("id", sub0!.tenant_id)).data).toHaveLength(1); // nothing was ever deleted
  }, 120_000);

  it("I. cancel at period end keeps access until the end, then ends it; the Space and content are kept", async () => {
    const u = await mkUser("i");
    const paid = await mustPay(u, "teach");
    await h.deliver("checkout.session.completed", paid.sessionId);
    const { data: sub } = await db.from("space_subscriptions").select("id, tenant_id").eq("billing_owner_user_id", u).single();
    h.stripe.setCancelAtPeriodEnd(paid.subscriptionId, true);
    await h.deliver("customer.subscription.updated", paid.subscriptionId);
    expect((await db.from("space_subscriptions").select("cancel_at_period_end, next_action").eq("id", sub!.id).single()).data).toEqual({ cancel_at_period_end: true, next_action: "cancel_at_period_end" });
    expect((await db.rpc("space_access_state", { p_tenant_id: sub!.tenant_id })).data![0]).toMatchObject({ studio_writable: true, guest_available: true });
    h.advance(31 * 86400_000); h.stripe.cancelNow(paid.subscriptionId);
    await h.deliver("customer.subscription.deleted", paid.subscriptionId);
    expect((await db.rpc("space_access_state", { p_tenant_id: sub!.tenant_id, p_now: h.deps.now().toISOString() })).data![0]).toMatchObject({ studio_writable: false, guest_available: false, reason: "subscription_ended" });
    expect((await db.from("billing_email_outbox").select("template").eq("user_id", u)).data!.map((m) => m.template)).toEqual(expect.arrayContaining(["cancellation_scheduled", "subscription_ended"]));
    expect((await db.from("tenants").select("id").eq("id", sub!.tenant_id)).data).toHaveLength(1);
  }, 90_000);

  it("Admin: coupon create/update rules, audit trail, and immutable terms once used", async () => {
    const ctx = { userId: users[0], email: null, role: "owner" as const, requestId: `qa032int-${run}` };
    const code = await mkCoupon("ADM", { discountType: "percent", percentOff: 20, durationType: "repeating", durationCycles: 2 });
    const { data: c } = await db.from("coupons").select("*").eq("normalized_code", code).single();
    expect(c.stripe_test_coupon_id).toMatch(/^coupon_FAKE/);
    expect(h.stripe.coupons.get(c.stripe_test_coupon_id)).toMatchObject({ percentOff: 20, duration: "repeating", durationInMonths: 2 });
    const same = await h.admin.adminCreateCoupon(ctx, db, h.deps, { code: code.toLowerCase(), discountType: "percent", percentOff: 5, usageRule: "once_per_user", durationType: "once" });
    expect(same).toMatchObject({ ok: false, error: "code_taken" }); // case-insensitive uniqueness
    // unused: financial change allowed (fresh Stripe coupon)
    const raw = { code, discountType: "percent", percentOff: 25, usageRule: "unlimited_during_validity", durationType: "repeating", durationCycles: 2 };
    expect((await h.admin.adminUpdateCoupon(ctx, db, h.deps, c.id, raw)).ok).toBe(true);
    const { data: c2 } = await db.from("coupons").select("stripe_test_coupon_id, percent_off").eq("id", c.id).single();
    expect(c2).toMatchObject({ percent_off: 25 });
    expect(c2!.stripe_test_coupon_id).not.toBe(c.stripe_test_coupon_id);
    expect(h.stripe.coupons.get(c2!.stripe_test_coupon_id)).toMatchObject({ percentOff: 25 });
    // used: financial terms locked, active flag and window still editable
    const u = await mkUser("adm");
    const paid = await mustPay(u, "teach", code); await h.deliver("checkout.session.completed", paid.sessionId);
    expect(await h.admin.adminUpdateCoupon(ctx, db, h.deps, c.id, { ...raw, percentOff: 90 })).toMatchObject({ ok: false, error: "financial_terms_locked" });
    expect((await h.admin.adminUpdateCoupon(ctx, db, h.deps, c.id, { ...raw, validUntil: new Date(Date.now() + 86400_000 * 30).toISOString() })).ok).toBe(true);
    expect(await h.admin.adminSetCouponActive(ctx, db, c.id, false)).toMatchObject({ ok: true });
    expect(await h.startCheckout(h.deps, { userId: await mkUser("adm2"), email: null, spaceType: "teach", couponCode: code, consent: h.consent, locale: "en" })).toEqual({ error: "inactive" });
    // the already-redeemed customer keeps the discount: the redemption snapshot never changed
    const { data: red } = await db.from("coupon_redemptions").select("percent_off, status").eq("coupon_id", c.id).eq("user_id", u).single();
    expect(red).toMatchObject({ percent_off: 25, status: "redeemed" });
    const { data: audit } = await db.from("admin_audit_log").select("action").eq("target_id", c.id);
    expect(audit!.map((a) => a.action).sort()).toEqual(["coupon.create", "coupon.disable", "coupon.update", "coupon.update"]);
  }, 120_000);

  it("Admin: exemption is explicit, audited and keeps a Space operational without a subscription", async () => {
    const u = await mkUser("ex");
    const paid = await mustPay(u, "teach"); await h.deliver("checkout.session.completed", paid.sessionId);
    const { data: sub } = await db.from("space_subscriptions").select("tenant_id").eq("billing_owner_user_id", u).single();
    const ctx = { userId: users[0], email: null, role: "owner" as const, requestId: `qa032int-${run}` };
    expect(await h.admin.adminSetInternalExempt(ctx, db, sub!.tenant_id, "ab", null)).toMatchObject({ ok: false, error: "reason_required" });
    expect(await h.admin.adminSetInternalExempt(ctx, db, sub!.tenant_id, "paid already", null)).toMatchObject({ ok: false, error: "has_paid_subscription" });
  }, 60_000);
});
