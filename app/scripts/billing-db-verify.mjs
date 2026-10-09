#!/usr/bin/env node
/**
 * TASK 032 - database-level behavioural verification for the billing
 * migrations (0036-0039). STAGING ONLY: the script refuses to run against any
 * project other than the Staging ref, creates its own synthetic users/rows
 * (prefix qa032-), and removes everything it created (and restores the launch
 * flag) in a finally block.
 *
 * Needs, in the environment (never printed, never written to disk):
 *   SUPABASE_URL, SUPABASE_SECRET_KEY (service role), SUPABASE_PUBLISHABLE_KEY
 *
 * Real concurrency: races are driven with Promise.all over independent RPC
 * calls (each a separate Postgres connection), not simulated.
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const STAGING_REF = "kkqjsspxupyxytddiumf";
const URL_ = process.env.SUPABASE_URL;
const SECRET = process.env.SUPABASE_SECRET_KEY;
const PUB = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!URL_ || !SECRET || !PUB) throw new Error("missing SUPABASE_URL / SUPABASE_SECRET_KEY / SUPABASE_PUBLISHABLE_KEY");
if (!URL_.includes(STAGING_REF)) throw new Error("REFUSING TO RUN: not the Staging project");

const vectors = JSON.parse(readFileSync(new URL("../src/lib/billing/vectors/accessVectors.json", import.meta.url), "utf8"));

const admin = createClient(URL_, SECRET, { auth: { autoRefreshToken: false, persistSession: false } });
const runId = randomBytes(4).toString("hex");
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : "  -> " + detail}`);
};
const H = (n) => new Date(Date.now() + n * 3600_000).toISOString();
const rid = () => randomBytes(6).toString("hex");

const created = { users: [], coupons: [], tenants: [], checkouts: [], storage: [] };
const passwords = new Map();
let flagWasEnabled = false;

async function mkUser(label) {
  const email = `qa032-${runId}-${label}@example.com`;
  const password = randomBytes(18).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error("createUser: " + error.message);
  created.users.push(data.user.id);
  passwords.set(data.user.id, { email, password });
  return data.user.id;
}
async function userClient(userId) {
  const { email, password } = passwords.get(userId);
  const c = createClient(URL_, PUB, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error("signIn: " + error.message);
  return c;
}
let _plan;
async function plan() {
  if (!_plan) _plan = (await admin.from("billing_plans").select("*").eq("plan_key", "space_monthly_usd").single()).data;
  return _plan;
}
async function mkCheckout(userId, type = "teach", { status = "awaiting_payment", expiresMin = 60 } = {}) {
  const p = await plan();
  const { data, error } = await admin.from("pending_space_checkouts").insert({
    user_id: userId, space_type: type, plan_id: p.id, status, stripe_mode: "test",
    expires_at: new Date(Date.now() + expiresMin * 60_000).toISOString(),
  }).select("*").single();
  if (error) throw new Error("mkCheckout: " + error.message);
  created.checkouts.push(data.id);
  return data;
}
let couponSeq = 0;
async function mkCoupon(o = {}) {
  const code = (o.code ?? `QA32${runId}${++couponSeq}`).toUpperCase();
  const row = {
    code, normalized_code: code, discount_type: "percent", percent_off: 10,
    usage_rule: "unlimited_during_validity", duration_type: "once",
    stripe_test_coupon_id: `qa032_${code.toLowerCase()}`, ...o,
  };
  row.normalized_code = String(row.code).toUpperCase();
  const { data, error } = await admin.from("coupons").insert(row).select("*").single();
  if (error) throw new Error("mkCoupon: " + error.message);
  created.coupons.push(data.id);
  return data;
}
const reserve = (userId, code, checkoutId, type = "teach") =>
  admin.rpc("billing_reserve_coupon", {
    p_user_id: userId, p_code: code, p_pending_checkout_id: checkoutId,
    p_space_type: type, p_plan_key: "space_monthly_usd", p_stripe_mode: "test",
  }).then((r) => { if (r.error) throw new Error("reserve rpc: " + r.error.message); return r.data; });
const subJson = (userId, o = {}) => ({
  stripe_subscription_id: `sub_QA32${rid()}`, stripe_customer_id: `cus_QA32${userId.replace(/-/g, "").slice(0, 12)}`,
  stripe_price_id: "price_QA32test", status: "active", currency: "USD", base_amount_minor: 2500,
  effective_amount_minor: 2500, period_start: new Date().toISOString(), period_end: H(24 * 30),
  cancel_at_period_end: false, latest_invoice_id: `in_QA32${rid()}`, ...o,
});
const provision = (checkoutId, sub, name = "QA032 Space") =>
  admin.rpc("billing_provision_paid_space", { p_pending_checkout_id: checkoutId, p_sub: sub, p_space_name: name, p_timezone: "UTC" });

async function cleanup() {
  try {
    // Restore the launch flag first.
    await admin.from("billing_settings").update({ paid_checkout_enabled: flagWasEnabled }).eq("singleton", true);
    for (const path of created.storage) await admin.storage.from("tenant-media").remove([path]);
    // Tenants created through provisioning: make them deletable, then delete.
    const { data: tenants } = await admin.from("tenants").select("id").in("created_by", created.users.length ? created.users : ["00000000-0000-0000-0000-000000000000"]);
    const tIds = [...new Set([...(tenants ?? []).map((t) => t.id), ...created.tenants])];
    if (tIds.length) {
      await admin.from("space_subscriptions").delete().in("tenant_id", tIds);
      await admin.from("published_spaces").delete().in("tenant_id", tIds);
      await admin.from("module_items").delete().in("tenant_id", tIds);
      await admin.from("coupon_redemptions").delete().in("tenant_id", tIds);
    }
    if (created.checkouts.length) {
      await admin.from("coupon_redemptions").delete().in("pending_checkout_id", created.checkouts);
      await admin.from("billing_acceptances").delete().in("pending_checkout_id", created.checkouts);
    }
    if (tIds.length) await admin.from("tenants").delete().in("id", tIds);
    if (created.checkouts.length) await admin.from("pending_space_checkouts").delete().in("id", created.checkouts);
    if (created.coupons.length) await admin.from("coupons").delete().in("id", created.coupons);
    await admin.from("billing_invoices").delete().like("stripe_invoice_id", "in_QA32%");
    await admin.from("billing_email_outbox").delete().like("dedupe_key", "%QA32%");
    await admin.from("billing_customers").delete().like("stripe_customer_id", "cus_QA32%");
    await admin.from("billing_events").delete().like("stripe_event_id", `evt_QA32${runId}%`);
    for (const id of created.users) await admin.auth.admin.deleteUser(id);
    console.log("cleanup done");
  } catch (e) {
    console.log("CLEANUP ERROR (manual check needed): " + e.message);
  }
}

async function main() {
  const { data: flagRow } = await admin.from("billing_settings").select("paid_checkout_enabled").single();
  flagWasEnabled = flagRow.paid_checkout_enabled;

  // ------------------------------------------------------------------ A. coupons: validation
  const u1 = await mkUser("u1");
  const cOk = await mkCoupon({ code: `WELCOME${runId}`, usage_rule: "once_per_user" });
  let ck = await mkCheckout(u1, "teach");

  let r = await reserve(u1, "NOPE-DOES-NOT-EXIST", ck.id);
  check("A1 unknown code -> invalid", r.ok === false && r.reason === "invalid", JSON.stringify(r));
  const cOff = await mkCoupon({ active: false });
  r = await reserve(u1, cOff.code, ck.id); check("A2 disabled coupon -> inactive", r.reason === "inactive", JSON.stringify(r));
  const cFuture = await mkCoupon({ valid_from: H(5) });
  r = await reserve(u1, cFuture.code, ck.id); check("A3 not yet active -> not_started", r.reason === "not_started", JSON.stringify(r));
  const cPast = await mkCoupon({ valid_from: H(-48), valid_until: H(-1) });
  r = await reserve(u1, cPast.code, ck.id); check("A4 expired window -> expired", r.reason === "expired", JSON.stringify(r));
  const cWrongType = await mkCoupon({ space_types: ["retreat"] });
  r = await reserve(u1, cWrongType.code, ck.id, "teach"); check("A5 wrong Space type -> not_applicable", r.reason === "not_applicable", JSON.stringify(r));
  const cWrongPlan = await mkCoupon({ plan_keys: ["some_other_plan"] });
  r = await reserve(u1, cWrongPlan.code, ck.id); check("A6 wrong plan -> not_applicable", r.reason === "not_applicable", JSON.stringify(r));
  const cEur = await mkCoupon({ discount_type: "fixed_amount", percent_off: null, amount_off_minor: 500, currency: "EUR" });
  r = await reserve(u1, cEur.code, ck.id); check("A7 fixed coupon in another currency -> not_applicable", r.reason === "not_applicable", JSON.stringify(r));
  const cBig = await mkCoupon({ discount_type: "fixed_amount", percent_off: null, amount_off_minor: 2500, currency: "USD" });
  r = await reserve(u1, cBig.code, ck.id); check("A8 fixed discount >= price -> not_applicable", r.reason === "not_applicable", JSON.stringify(r));
  const cNoStripe = await mkCoupon({ stripe_test_coupon_id: null });
  r = await reserve(u1, cNoStripe.code, ck.id); check("A9 not synced to Stripe in this mode -> unavailable", r.reason === "unavailable", JSON.stringify(r));
  r = await reserve(u1, `  ${cOk.code.toLowerCase()}  `, ck.id);
  check("A10 case/whitespace normalised -> reserved", r.ok === true && r.reason === "reserved", JSON.stringify(r));
  const r2 = await reserve(u1, cOk.code, ck.id);
  check("A11 re-apply on same checkout is idempotent (same reservation)", r2.ok && r2.redemption_id === r.redemption_id, JSON.stringify(r2));
  const fixed = await mkCoupon({ discount_type: "fixed_amount", percent_off: null, amount_off_minor: 500, currency: "USD", duration_type: "repeating", duration_cycles: 3 });
  const uF = await mkUser("uf"); const ckF = await mkCheckout(uF, "retreat");
  r = await reserve(uF, fixed.code, ckF.id, "retreat");
  check("A12 valid fixed-amount coupon (N cycles) reserves with a snapshot", r.ok && r.amount_off_minor === 500 && r.duration_cycles === 3 && r.currency === "USD", JSON.stringify(r));
  const closed = await mkCheckout(await mkUser("uc"), "teach", { status: "expired" });
  r = await reserve(closed.user_id, cOk.code, closed.id); check("A13 closed/expired checkout cannot reserve", r.reason === "checkout_closed", JSON.stringify(r));

  // ------------------------------------------------------------------ B. usage rules + races
  const uA = await mkUser("ua");
  const ckA1 = await mkCheckout(uA, "teach"), ckA2 = await mkCheckout(uA, "retreat");
  const once = await mkCoupon({ usage_rule: "once_per_user" });
  const race1 = await Promise.all([reserve(uA, once.code, ckA1.id, "teach"), reserve(uA, once.code, ckA2.id, "retreat")]);
  check("B1 simultaneous once-per-user (two tabs/types) -> exactly one reservation", race1.filter((x) => x.ok).length === 1, JSON.stringify(race1.map((x) => x.reason)));
  const { count: liveRows } = await admin.from("coupon_redemptions").select("*", { count: "exact", head: true }).eq("coupon_id", once.id).eq("user_id", uA).in("status", ["reserved", "redeemed"]);
  check("B2 database holds exactly one live row for that user/coupon", liveRows === 1, String(liveRows));

  const uU = await mkUser("uu");
  const ckU1 = await mkCheckout(uU, "teach"), ckU2 = await mkCheckout(uU, "retreat");
  const unl = await mkCoupon({ usage_rule: "unlimited_during_validity", duration_type: "repeating", duration_cycles: 3 });
  const race2 = await Promise.all([reserve(uU, unl.code, ckU1.id, "teach"), reserve(uU, unl.code, ckU2.id, "retreat")]);
  check("B3 unlimited-during-validity: same user, two Spaces -> both succeed", race2.every((x) => x.ok), JSON.stringify(race2.map((x) => x.reason)));

  // Once-per-user across a COMPLETED purchase: second Space is rejected afterwards.
  const uP = await mkUser("up");
  const ckP1 = await mkCheckout(uP, "teach");
  const onceP = await mkCoupon({ usage_rule: "once_per_user", duration_type: "once" });
  await reserve(uP, onceP.code, ckP1.id, "teach");
  let prov = await provision(ckP1.id, subJson(uP), "QA032 Teach");
  check("B4 provisioning with a reserved coupon succeeds", !prov.error && prov.data?.status === "provisioned", JSON.stringify(prov.error ?? prov.data));
  const tenantP = prov.data?.tenant_id; if (tenantP) created.tenants.push(tenantP);
  const ckP2 = await mkCheckout(uP, "retreat");
  r = await reserve(uP, onceP.code, ckP2.id, "retreat");
  check("B5 once-per-user: second Space after a redeemed first -> already_used", r.reason === "already_used", JSON.stringify(r));
  const { data: redP } = await admin.from("coupon_redemptions").select("*").eq("pending_checkout_id", ckP1.id).single();
  check("B6 redemption is 'redeemed' with tenant+subscription attached and a snapshot", redP?.status === "redeemed" && redP.tenant_id === tenantP && !!redP.space_subscription_id && redP.cycles_total === 1 && redP.usage_rule === "once_per_user", JSON.stringify(redP));

  // Global cap: last-slot race.
  const cap = await mkCoupon({ global_max_redemptions: 3 });
  const capUsers = []; const capChecks = [];
  for (let i = 0; i < 10; i++) { const u = await mkUser(`cap${i}`); capUsers.push(u); capChecks.push(await mkCheckout(u, "teach")); }
  const capRes = await Promise.all(capUsers.map((u, i) => reserve(u, cap.code, capChecks[i].id)));
  check("B7 global cap 3 with 10 simultaneous users -> exactly 3 succeed", capRes.filter((x) => x.ok).length === 3, JSON.stringify(capRes.map((x) => x.reason)));
  check("B8 the rest are told the limit was reached", capRes.filter((x) => !x.ok).every((x) => x.reason === "limit_reached"), JSON.stringify(capRes.map((x) => x.reason)));
  const cap1 = await mkCoupon({ global_max_redemptions: 1 });
  const lastUsers = [await mkUser("last1"), await mkUser("last2")];
  const lastChecks = [await mkCheckout(lastUsers[0], "teach"), await mkCheckout(lastUsers[1], "teach")];
  const lastRes = await Promise.all(lastUsers.map((u, i) => reserve(u, cap1.code, lastChecks[i].id)));
  check("B9 two users racing for the FINAL slot -> exactly one wins", lastRes.filter((x) => x.ok).length === 1, JSON.stringify(lastRes.map((x) => x.reason)));

  // Abandoned reservation is released and does not consume the cap.
  const winnerIdx = lastRes.findIndex((x) => x.ok), loserIdx = 1 - winnerIdx;
  await admin.from("pending_space_checkouts").update({ expires_at: H(-1) }).eq("id", lastChecks[winnerIdx].id);
  const exp = await admin.rpc("billing_expire_open_checkouts");
  check("B10 expiring the abandoned checkout releases its reservation", !exp.error && exp.data >= 1, JSON.stringify(exp));
  const { data: winRow } = await admin.from("coupon_redemptions").select("status").eq("pending_checkout_id", lastChecks[winnerIdx].id).single();
  check("B11 abandoned reservation is no longer live", winRow?.status === "expired", winRow?.status);
  r = await reserve(lastUsers[loserIdx], cap1.code, lastChecks[loserIdx].id);
  check("B12 the freed slot can be reserved by the other user", r.ok === true, JSON.stringify(r));

  // Switching coupons on one open checkout releases the previous reservation.
  const uS = await mkUser("us"); const ckS = await mkCheckout(uS, "teach");
  const cx = await mkCoupon({ usage_rule: "once_per_user" }), cy = await mkCoupon({ usage_rule: "once_per_user" });
  await reserve(uS, cx.code, ckS.id); r = await reserve(uS, cy.code, ckS.id);
  const { data: sw } = await admin.from("coupon_redemptions").select("coupon_id,status").eq("pending_checkout_id", ckS.id);
  check("B13 switching coupon: one live reservation (new), old released", r.ok && sw.filter((x) => x.status === "reserved").length === 1 && sw.some((x) => x.coupon_id === cx.id && x.status === "released"), JSON.stringify(sw));

  // ------------------------------------------------------------------ C. provisioning idempotency + concurrency
  const uPv = await mkUser("upv"); const ckPv = await mkCheckout(uPv, "retreat", { status: "payment_confirmed" });
  const sPv = subJson(uPv);
  const many = await Promise.all([1, 2, 3, 4, 5, 6].map(() => provision(ckPv.id, sPv, "QA032 Flow")));
  const okCalls = many.filter((x) => !x.error);
  const tenantIds = new Set(okCalls.map((x) => x.data.tenant_id));
  check("C1 six concurrent provisioning calls for ONE checkout -> one tenant id", okCalls.length === 6 && tenantIds.size === 1, JSON.stringify(many.map((x) => x.error?.message ?? x.data.status)));
  const tPv = [...tenantIds][0]; if (tPv) created.tenants.push(tPv);
  const { count: tcount } = await admin.from("tenants").select("*", { count: "exact", head: true }).eq("created_by", uPv);
  check("C2 exactly one Space exists for that buyer", tcount === 1, String(tcount));
  check("C3 exactly one 'provisioned' + five 'already_provisioned' results", okCalls.filter((x) => x.data.status === "provisioned").length === 1 && okCalls.filter((x) => x.data.status === "already_provisioned").length === 5);
  const { data: mem } = await admin.from("tenant_members").select("*").eq("tenant_id", tPv);
  check("C4 buyer is the owner member of the new Space", mem?.length === 1 && mem[0].user_id === uPv && mem[0].role === "owner", JSON.stringify(mem));
  const { data: subs } = await admin.from("space_subscriptions").select("*").eq("tenant_id", tPv);
  check("C5 exactly one subscription row, active, $25 base, linked to plan+customer", subs?.length === 1 && subs[0].status === "active" && subs[0].base_amount_minor === 2500 && !!subs[0].plan_id && !!subs[0].billing_customer_id, JSON.stringify(subs));
  const { data: ckAfter } = await admin.from("pending_space_checkouts").select("status,tenant_id").eq("id", ckPv.id).single();
  check("C6 pending checkout is provisioned and points at the tenant", ckAfter.status === "provisioned" && ckAfter.tenant_id === tPv);

  const uBad = await mkUser("ubad"); const ckBad = await mkCheckout(uBad, "teach");
  const bad = await provision(ckBad.id, subJson(uBad, { status: "incomplete" }));
  const { count: badT } = await admin.from("tenants").select("*", { count: "exact", head: true }).eq("created_by", uBad);
  check("C7 an unpaid/incomplete subscription provisions NOTHING (transaction rolled back)", !!bad.error && badT === 0, JSON.stringify(bad.error));
  const { data: ckBadAfter } = await admin.from("pending_space_checkouts").select("status").eq("id", ckBad.id).single();
  check("C8 failed provisioning leaves the checkout un-provisioned (retryable)", ckBadAfter.status !== "provisioned", ckBadAfter.status);
  const retry = await provision(ckBad.id, subJson(uBad));
  if (retry.data?.tenant_id) created.tenants.push(retry.data.tenant_id);
  check("C9 a later retry with a paid subscription provisions exactly once", retry.data?.status === "provisioned", JSON.stringify(retry.error ?? retry.data));

  // ------------------------------------------------------------------ D. discount cycles
  const uD = await mkUser("ud"); const ckD = await mkCheckout(uD, "teach");
  const c3 = await mkCoupon({ usage_rule: "unlimited_during_validity", duration_type: "repeating", duration_cycles: 3, valid_until: H(2) });
  await reserve(uD, c3.code, ckD.id);
  const pD = await provision(ckD.id, subJson(uD), "QA032 disc"); if (pD.data?.tenant_id) created.tenants.push(pD.data.tenant_id);
  const sid = pD.data.subscription_id;
  const cyc = async (inv, applied = true) => (await admin.rpc("billing_record_discount_cycle", { p_subscription_id: sid, p_invoice_id: inv, p_discount_applied: applied })).data;
  const a1 = await cyc("in_1"), a1b = await cyc("in_1");
  check("D1 first paid invoice counts cycle 1; the same invoice again is idempotent", a1.status === "counted" && a1.cycles_completed === 1 && a1b.status === "already_counted", JSON.stringify([a1, a1b]));
  await admin.from("coupons").update({ valid_until: H(-24) }).eq("id", c3.id);
  const a2 = await cyc("in_2"), a3 = await cyc("in_3");
  check("D2 coupon window closed (valid_until passed) but the redeemed discount keeps running", a2.status === "counted" && a3.status === "completed" && a3.cycles_completed === 3, JSON.stringify([a2, a3]));
  const { data: rD } = await admin.from("coupon_redemptions").select("status,discount_ends_at").eq("space_subscription_id", sid).single();
  check("D3 after 3 cycles the redemption is 'completed' (automatic move to full price)", rD.status === "completed" && !!rD.discount_ends_at, JSON.stringify(rD));
  const a4 = await cyc("in_4");
  check("D4 no active discount remains -> nothing counted", a4.status === "no_active_discount", JSON.stringify(a4));
  const ckD2 = await mkCheckout(uD, "retreat"); const r5 = await reserve(uD, c3.code, ckD2.id, "retreat");
  check("D5 new reservation after the window closed is refused (expired)", r5.reason === "expired", JSON.stringify(r5));

  // ------------------------------------------------------------------ E. state + lifecycle
  const uL = await mkUser("ul"); const ckL = await mkCheckout(uL, "teach");
  const sL = subJson(uL); const pL = await provision(ckL.id, sL, "QA032 life"); const tL = pL.data.tenant_id, subL = pL.data.subscription_id; created.tenants.push(tL);
  const apply = async (s) => (await admin.rpc("billing_apply_subscription_state", { p_mode: "test", p_stripe_subscription_id: sL.stripe_subscription_id, p_s: s })).data;
  const t0 = new Date(Date.now() - 2 * 3600_000).toISOString();
  let st = await apply({ status: "past_due", latest_invoice_failed: true, failure_observed_at: t0 });
  check("E1 payment failure starts an episode (payment_failed_at set from the failure time)", st.failed_started === true, JSON.stringify(st));
  const { data: s1 } = await admin.from("space_subscriptions").select("payment_failed_at").eq("id", subL).single();
  check("E2 payment_failed_at equals the observed failure instant", Math.abs(new Date(s1.payment_failed_at) - new Date(t0)) < 1500, s1.payment_failed_at);
  st = await apply({ status: "past_due", latest_invoice_failed: true, failure_observed_at: H(1) });
  const { data: s1b } = await admin.from("space_subscriptions").select("payment_failed_at").eq("id", subL).single();
  check("E3 a repeated failure does NOT move the clock (earliest kept)", st.failed_started === false && s1b.payment_failed_at === s1.payment_failed_at);
  const life = async (offsetH) => (await admin.rpc("billing_apply_lifecycle", { p_now: new Date(new Date(t0).getTime() + offsetH * 3600_000).toISOString() })).data.filter((x) => x.subscription_id === subL).map((x) => x.action);
  check("E4 at +23h nothing happens", (await life(23)).length === 0);
  check("E5 at +25h Guest is suspended", JSON.stringify(await life(25)) === JSON.stringify(["guest_suspended"]));
  check("E6 re-running the job at +25h is a no-op (idempotent, no double action)", (await life(25)).length === 0);
  check("E7 at +169h Studio is suspended", JSON.stringify(await life(169)) === JSON.stringify(["studio_suspended"]));
  check("E8 at +289h the final warning is due", JSON.stringify(await life(289)) === JSON.stringify(["deletion_warning"]));
  check("E9 at +337h the Space becomes deletion-ELIGIBLE (never deleted)", JSON.stringify(await life(337)) === JSON.stringify(["deletion_eligible"]));
  const { count: stillThere } = await admin.from("tenants").select("*", { count: "exact", head: true }).eq("id", tL);
  check("E10 the tenant still exists after deletion eligibility", stillThere === 1);
  st = await apply({ status: "active", latest_invoice_paid: true, latest_invoice_failed: false });
  const { data: s2 } = await admin.from("space_subscriptions").select("*").eq("id", subL).single();
  check("E11 recovery clears the episode and every suspension/deletion stamp", st.recovered === true && !s2.payment_failed_at && !s2.guest_suspended_at && !s2.studio_suspended_at && !s2.deletion_warning_at && !s2.eligible_for_deletion_at && !!s2.recovered_at, JSON.stringify(s2));
  check("E12 the job after recovery never acts on the stale episode", (await life(400)).length === 0);
  st = await apply({ status: "active", latest_invoice_paid: true });
  check("E13 applying the same healthy truth twice does nothing", st.recovered === false && st.failed_started === false);
  st = await apply({ status: "past_due", latest_invoice_failed: true });
  check("E14 a NEW episode after recovery starts a fresh clock", st.failed_started === true);
  const unk = (await admin.rpc("billing_apply_subscription_state", { p_mode: "test", p_stripe_subscription_id: "sub_doesnotexist", p_s: { status: "active" } })).data;
  check("E15 an unknown Stripe subscription is reported, not invented", unk.result === "unknown_subscription");
  const wrongMode = (await admin.rpc("billing_apply_subscription_state", { p_mode: "live", p_stripe_subscription_id: sL.stripe_subscription_id, p_s: { status: "canceled" } })).data;
  check("E16 a LIVE-mode event can never touch a TEST subscription", wrongMode.result === "unknown_subscription");
  await apply({ status: "active", latest_invoice_paid: true });

  // ------------------------------------------------------------------ F. access vectors (SQL parity)
  const base = new Date(vectors.now).getTime();
  const iso = (h) => new Date(base + h * 3600_000).toISOString();
  let vecFail = 0;
  for (const v of vectors.vectors) {
    let p_now = vectors.now;
    if (v.sub === null) {
      const uN = await mkUser(`vn${rid().slice(0, 4)}`); const ckN = await mkCheckout(uN, "teach");
      // A Space with no billing row: provision then drop the row (legacy shape).
      const pN = await provision(ckN.id, subJson(uN), "QA032 legacy"); created.tenants.push(pN.data.tenant_id);
      await admin.from("space_subscriptions").delete().eq("tenant_id", pN.data.tenant_id);
      const { data } = await admin.rpc("space_access_state", { p_tenant_id: pN.data.tenant_id, p_now });
      const got = data[0];
      const ok = got.decided === v.expect.decided && got.studio_writable === v.expect.studio && got.reason === v.expect.reason;
      if (!ok) { vecFail++; console.log("   vector mismatch:", v.name, JSON.stringify(got)); }
      continue;
    }
    const s = v.sub;
    const patch = {
      status: s.status,
      cancel_at_period_end: !!s.cancel_at_period_end,
      payment_failed_at: s.payment_failed_hours_ago == null ? null : iso(-s.payment_failed_hours_ago),
      current_period_end: s.period_end_hours_from_now == null ? null : iso(s.period_end_hours_from_now),
      exempt_expires_at: s.exempt_expires_in_hours == null ? null : iso(s.exempt_expires_in_hours),
    };
    if (s.status === "exempt") Object.assign(patch, { exempt_reason: "vector test", exempt_at: iso(-1) });
    const { error: upErr } = await admin.from("space_subscriptions").update(patch).eq("id", subL);
    if (upErr) { vecFail++; console.log("   vector setup error:", v.name, upErr.message); continue; }
    const { data } = await admin.rpc("space_access_state", { p_tenant_id: tL, p_now });
    const got = data[0];
    const ok = got.decided === v.expect.decided && got.studio_writable === v.expect.studio
      && (v.expect.guest === null || got.guest_available === v.expect.guest)
      && (v.expect.publish === null || got.can_publish === v.expect.publish) && got.reason === v.expect.reason;
    if (!ok) { vecFail++; console.log("   vector mismatch:", v.name, JSON.stringify(got), "expected", JSON.stringify(v.expect)); }
  }
  check(`F1 SQL space_access_state matches all ${vectors.vectors.length} shared vectors`, vecFail === 0, `${vecFail} mismatches`);
  await admin.from("space_subscriptions").update({ status: "active", payment_failed_at: null, cancel_at_period_end: false, current_period_end: H(24 * 30), exempt_expires_at: null }).eq("id", subL);

  // ------------------------------------------------------------------ G. enforcement as the real owner
  const owner = await userClient(uL);
  const miRow = (n) => ({ tenant_id: tL, module_key: "teachReadings", title: `qa032 ${n}` });
  let ins = await owner.from("module_items").insert(miRow("active")).select("id").single();
  check("G1 active owner can write Studio content", !ins.error, ins.error?.message);
  await admin.from("space_subscriptions").update({ status: "unpaid", payment_failed_at: H(-200) }).eq("id", subL);
  const insS = await owner.from("module_items").insert(miRow("suspended")).select("id");
  check("G2 Studio-suspended owner: direct INSERT is refused by RLS", !!insS.error, JSON.stringify(insS.data));
  const updS = await owner.from("module_items").update({ title: "tamper" }).eq("tenant_id", tL).select("id");
  check("G3 Studio-suspended owner: direct UPDATE changes nothing", !updS.error ? (updS.data ?? []).length === 0 : true, JSON.stringify(updS));
  const delS = await owner.from("module_items").delete().eq("tenant_id", tL).select("id");
  check("G4 Studio-suspended owner: direct DELETE removes nothing", !delS.error ? (delS.data ?? []).length === 0 : true, JSON.stringify(delS));
  const updT = await owner.from("tenants").update({ name: "tamper" }).eq("id", tL).select("id");
  check("G5 Studio-suspended owner: cannot rename the Space", !updT.error ? (updT.data ?? []).length === 0 : true, JSON.stringify(updT));
  const brandS = await owner.from("brand_configs").upsert({ tenant_id: tL, name: "tamper" }).select("tenant_id");
  check("G6 Studio-suspended owner: cannot write brand settings", !!brandS.error, JSON.stringify(brandS.data));
  const sel = await owner.from("module_items").select("id").eq("tenant_id", tL);
  check("G7 a suspended owner can still READ their content (recovery stays possible)", !sel.error && (sel.data ?? []).length >= 1, JSON.stringify(sel.error));
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const upS = await owner.storage.from("tenant-media").upload(`${tL}/qa032/blocked.png`, png, { contentType: "image/png" });
  check("G8 Studio-suspended owner: media upload is refused", !!upS.error, JSON.stringify(upS.data));
  const pubS = await owner.rpc("publish_space", { p_tenant_id: tL });
  check("G9 Studio-suspended owner: direct publish_space RPC raises", !!pubS.error && /commercial access/.test(pubS.error.message), JSON.stringify(pubS.error));
  const subSel = await owner.from("space_subscriptions").select("status").eq("tenant_id", tL).single();
  check("G10 the owner can read their own subscription state", subSel.data?.status === "unpaid", JSON.stringify(subSel));
  const accSel = await owner.rpc("space_access_state", { p_tenant_id: tL });
  check("G11 owner sees the studio_suspended reason through the access helper", accSel.data?.[0]?.reason === "studio_suspended", JSON.stringify(accSel));

  await admin.from("space_subscriptions").update({ status: "active", payment_failed_at: null }).eq("id", subL);
  const upA = await owner.storage.from("tenant-media").upload(`${tL}/qa032/allowed.png`, png, { contentType: "image/png" });
  if (!upA.error) created.storage.push(`${tL}/qa032/allowed.png`);
  check("G12 after recovery the same owner can upload media again", !upA.error, JSON.stringify(upA.error));
  const pubA = await owner.rpc("publish_space", { p_tenant_id: tL });
  check("G13 after recovery the owner can publish (no content rebuild needed)", !pubA.error, JSON.stringify(pubA.error));
  const { data: pubRow } = await admin.from("published_spaces").select("published_at").eq("tenant_id", tL).maybeSingle();
  check("G14 suspension never touched the published snapshot", !!pubRow);
  await admin.from("space_subscriptions").update({ payment_failed_at: H(-30) }).eq("id", subL);
  const pubG = await owner.rpc("publish_space", { p_tenant_id: tL });
  check("G15 Guest-suspended (24h-7d) owner may still edit/publish content", !pubG.error, JSON.stringify(pubG.error));
  await admin.from("space_subscriptions").update({ payment_failed_at: null }).eq("id", subL);

  // Independence of multiple Spaces under one account.
  const ckM2 = await mkCheckout(uL, "retreat"); const pM2 = await provision(ckM2.id, subJson(uL, { stripe_customer_id: sL.stripe_customer_id }), "QA032 second");
  if (pM2.data?.tenant_id) created.tenants.push(pM2.data.tenant_id);
  await admin.from("space_subscriptions").update({ status: "unpaid", payment_failed_at: H(-200) }).eq("id", subL);
  const accB = await admin.rpc("space_access_state", { p_tenant_id: pM2.data.tenant_id });
  check("G16 failure on Space A does not suspend Space B of the same account", accB.data[0].studio_writable === true && accB.data[0].guest_available === true, JSON.stringify(accB.data));
  const { data: custRows } = await admin.from("billing_customers").select("id").eq("user_id", uL);
  check("G17 one Stripe customer row per account across both Spaces", custRows.length === 1, String(custRows.length));
  await admin.from("space_subscriptions").update({ status: "active", payment_failed_at: null }).eq("id", subL);

  // Delete guard.
  const delTry = await owner.rpc("delete_space", { p_tenant_id: tL });
  check("G18 deleting a Space with a live subscription is refused (cancel first)", !!delTry.error && /subscription/i.test(delTry.error.message), JSON.stringify(delTry.error));
  await admin.from("space_subscriptions").update({ status: "canceled" }).eq("id", subL);
  const delOk = await owner.rpc("delete_space", { p_tenant_id: tL });
  check("G19 after cancellation the Space can be deleted", !delOk.error, JSON.stringify(delOk.error));

  // ------------------------------------------------------------------ H. creation guard
  const uG = await mkUser("ug"); const gc = await userClient(uG);
  await admin.from("billing_settings").update({ paid_checkout_enabled: false }).eq("singleton", true);
  const legacyIns = await gc.from("tenants").insert({ name: "qa032 legacy create", product_type: "teach", timezone: "UTC" }).select("id").single();
  check("H1 flag OFF: legacy direct creation behaves exactly as before", !legacyIns.error, JSON.stringify(legacyIns.error));
  if (legacyIns.data) created.tenants.push(legacyIns.data.id);
  await admin.from("billing_settings").update({ paid_checkout_enabled: true }).eq("singleton", true);
  const uG2 = await mkUser("ug2"); const gc2 = await userClient(uG2);
  const blocked = await gc2.from("tenants").insert({ name: "qa032 unpaid", product_type: "teach", timezone: "UTC" }).select("id");
  check("H2 flag ON: direct client creation is refused with PAYMENT_REQUIRED", !!blocked.error && /PAYMENT_REQUIRED|Payment is required/i.test(JSON.stringify(blocked.error)), JSON.stringify(blocked.error));
  const { count: nB } = await admin.from("tenants").select("*", { count: "exact", head: true }).eq("created_by", uG2);
  check("H3 flag ON: no unpaid tenant exists", nB === 0, String(nB));
  const ckG = await mkCheckout(uG2, "teach"); const pG = await provision(ckG.id, subJson(uG2), "QA032 paid under flag");
  if (pG.data?.tenant_id) created.tenants.push(pG.data.tenant_id);
  check("H4 flag ON: the paid provisioning path still works", pG.data?.status === "provisioned", JSON.stringify(pG.error ?? pG.data));
  await admin.from("billing_settings").update({ paid_checkout_enabled: flagWasEnabled }).eq("singleton", true);

  // ------------------------------------------------------------------ I. privileges / isolation / constraints
  const denied = await gc2.rpc("billing_reserve_coupon", { p_user_id: uG2, p_code: "X", p_pending_checkout_id: ckG.id, p_space_type: "teach", p_plan_key: "space_monthly_usd", p_stripe_mode: "test" });
  check("I1 a signed-in user cannot call the coupon engine directly", !!denied.error, JSON.stringify(denied.data));
  const denied2 = await gc2.rpc("billing_provision_paid_space", { p_pending_checkout_id: ckG.id, p_sub: {}, p_space_name: "x" });
  check("I2 a signed-in user cannot call provisioning directly", !!denied2.error);
  const anon = createClient(URL_, PUB, { auth: { persistSession: false } });
  const denied3 = await anon.rpc("space_access_state", { p_tenant_id: tL });
  check("I3 anon cannot call the access helper", !!denied3.error);
  for (const tbl of ["coupons", "billing_customers", "billing_events", "billing_acceptances", "billing_email_outbox", "coupon_redemptions", "admin_users", "admin_audit_log", "billing_plans", "billing_settings", "space_subscription_addons"]) {
    const rr = await gc2.from(tbl).select("*").limit(1);
    check(`I4 signed-in user has no direct access to ${tbl}`, !!rr.error || (rr.data ?? []).length === 0, JSON.stringify(rr.error?.message ?? rr.data?.length));
  }
  const wr = await gc2.from("coupons").insert({ code: "HACK", normalized_code: "HACK", discount_type: "percent", percent_off: 100, usage_rule: "unlimited_during_validity", duration_type: "forever" });
  check("I5 a signed-in user cannot create a coupon", !!wr.error);
  const wr2 = await gc2.from("space_subscriptions").update({ status: "active" }).eq("tenant_id", pG.data.tenant_id).select("id");
  check("I6 a signed-in user cannot edit a subscription", !wr2.error ? (wr2.data ?? []).length === 0 : true);
  const wr3 = await gc2.from("admin_users").insert({ user_id: uG2, role: "owner" });
  check("I7 a signed-in user cannot grant themselves Admin", !!wr3.error);
  const otherSub = await gc.from("space_subscriptions").select("id").eq("tenant_id", pG.data.tenant_id);
  check("I8 another account cannot see this Space's subscription", !otherSub.error && (otherSub.data ?? []).length === 0, JSON.stringify(otherSub));
  const otherPc = await gc.from("pending_space_checkouts").select("id").eq("id", ckG.id);
  check("I9 another account cannot see this pending checkout", !otherPc.error && (otherPc.data ?? []).length === 0);
  const otherAcc = await gc.rpc("space_access_state", { p_tenant_id: pG.data.tenant_id });
  check("I10 another account learns nothing from the access helper", otherAcc.data?.[0]?.reason === "forbidden", JSON.stringify(otherAcc.data));
  const own = await gc2.from("pending_space_checkouts").select("id,status").eq("id", ckG.id);
  check("I11 the buyer CAN read their own pending checkout (status page)", !own.error && own.data?.length === 1);

  const ev = `evt_QA32${runId}a`;
  const e1 = await admin.from("billing_events").insert({ stripe_event_id: ev, stripe_mode: "test", event_type: "invoice.paid" });
  const e2 = await admin.from("billing_events").insert({ stripe_event_id: ev, stripe_mode: "test", event_type: "invoice.paid" });
  check("I12 a Stripe event id can only be recorded once (webhook idempotency)", !e1.error && e2.error?.code === "23505", JSON.stringify(e2.error));
  const audit = await admin.from("admin_audit_log").insert({ admin_user_id: uG2, action: "qa032.test", target_type: "test", target_id: "x" }).select("id").single();
  const au = await admin.from("admin_audit_log").update({ action: "tampered" }).eq("id", audit.data.id);
  const ad = await admin.from("admin_audit_log").delete().eq("id", audit.data.id);
  check("I13 the audit log is append-only (update and delete both refused, even for service role)", !!au.error && !!ad.error, JSON.stringify([au.error?.message, ad.error?.message]));
  const acc = await admin.from("billing_acceptances").insert({ user_id: uG2, terms_version: "t", privacy_version: "p", billing_terms_version: "b", immediate_service_consent: false, withdrawal_acknowledged: true, consent_text_id: "x" });
  check("I14 an acceptance without both consents cannot be stored", !!acc.error);
  const dupOpen1 = await mkCheckout(uG, "teach").catch((e) => e); const dupOpen2 = await admin.from("pending_space_checkouts").insert({ user_id: uG, space_type: "teach", plan_id: (await plan()).id, stripe_mode: "test", expires_at: H(1) });
  check("I15 at most one open checkout per user per Space type", !!dupOpen2.error && dupOpen2.error.code === "23505", JSON.stringify(dupOpen2.error));
  const ex1 = await admin.rpc("billing_set_internal_exempt", { p_tenant_id: pG.data.tenant_id, p_reason: "x", p_actor: uG2 });
  check("I16 an exemption requires a real reason", !!ex1.error);
  const ex2 = await admin.rpc("billing_set_internal_exempt", { p_tenant_id: pG.data.tenant_id, p_reason: "qa032 exemption test", p_actor: uG2 });
  check("I17 refusing to overwrite a paid subscription with an exemption", !!ex2.error, JSON.stringify(ex2.data));
  const uX = await mkUser("ux"); const ckX = await mkCheckout(uX, "teach"); const pX = await provision(ckX.id, subJson(uX), "QA032 exempt target"); created.tenants.push(pX.data.tenant_id);
  await admin.from("space_subscriptions").delete().eq("tenant_id", pX.data.tenant_id);
  const exOk = await admin.rpc("billing_set_internal_exempt", { p_tenant_id: pX.data.tenant_id, p_reason: "qa032 exemption test", p_actor: uX });
  const accX = await admin.rpc("space_access_state", { p_tenant_id: pX.data.tenant_id });
  check("I18 an exempt Space is fully operational and carries no Stripe ids", !exOk.error && accX.data[0].reason === "exempt" && accX.data[0].can_publish === true);
  const cleared = await admin.rpc("billing_clear_internal_exempt", { p_tenant_id: pX.data.tenant_id });
  check("I19 the exemption can be cleared", cleared.data === true);
  const aud = await admin.rpc("space_audio_entitlements", { p_tenant_id: pG.data.tenant_id });
  check("I20 base audio entitlements: 240 / 60 / 100000", JSON.stringify(aud.data?.[0]) === JSON.stringify({ library_minutes: 240, max_recording_minutes: 60, listening_minutes_per_month: 100000 }), JSON.stringify(aud.data));
  const { data: gsub } = await admin.from("space_subscriptions").select("id").eq("tenant_id", pG.data.tenant_id).single();
  for (const [qty, lib, listen] of [[1, 480, 170000], [2, 720, 240000]]) {
    await admin.from("space_subscription_addons").upsert({ subscription_id: gsub.id, addon_key: "audio_pack", quantity: qty });
    const a = await admin.rpc("space_audio_entitlements", { p_tenant_id: pG.data.tenant_id });
    check(`I21 +${qty} audio add-on: ${lib} library / 60 max / ${listen} listening`, JSON.stringify(a.data?.[0]) === JSON.stringify({ library_minutes: lib, max_recording_minutes: 60, listening_minutes_per_month: listen }), JSON.stringify(a.data));
  }

  // ------------------------------------------------------------------ J. payments / invoices (addendum)
  const uI = await mkUser("ui"); const ckI = await mkCheckout(uI, "teach");
  const cI = await mkCoupon({ usage_rule: "unlimited_during_validity", duration_type: "repeating", duration_cycles: 3 });
  await reserve(uI, cI.code, ckI.id);
  const sI = subJson(uI, { effective_amount_minor: 2250 });
  const pI = await provision(ckI.id, sI, "QA032 invoices"); created.tenants.push(pI.data.tenant_id);
  const inv = (o = {}) => ({
    stripe_mode: "test", stripe_invoice_id: `in_QA32${runId}${o.n ?? "a"}`, stripe_subscription_id: sI.stripe_subscription_id,
    stripe_customer_id: sI.stripe_customer_id, status: "paid", billing_reason: "subscription_create", currency: "USD",
    subtotal_minor: 2500, discount_minor: 250, tax_minor: 0, total_minor: 2250, amount_due_minor: 2250, amount_paid_minor: 2250,
    invoice_number: "QA32-0001", hosted_invoice_url: "https://invoice.stripe.com/i/test_QA32", invoice_pdf_url: "https://pay.stripe.com/invoice/test_QA32/pdf",
    receipt_url: "https://pay.stripe.com/receipts/test_QA32", period_start: new Date().toISOString(), period_end: H(24 * 30),
    issued_at: new Date().toISOString(), paid_at: new Date().toISOString(), attempt_count: 1, discount_applied: true, ...o,
  });
  const up = async (o) => (await admin.rpc("billing_upsert_invoice", { p: inv(o) }));
  let u = await up({ n: "a" });
  check("J1 first payment recorded: created + newly_paid, mapped to the right Space/subscription/account",
    u.data?.result === "created" && u.data.newly_paid === true && u.data.tenant_id === pI.data.tenant_id && u.data.subscription_id === pI.data.subscription_id && u.data.user_id === uI, JSON.stringify(u.error ?? u.data));
  const { data: invRow } = await admin.from("billing_invoices").select("*").eq("stripe_invoice_id", `in_QA32${runId}a`).single();
  check("J2 invoice keeps Stripe's official document links, amounts and the coupon redemption link",
    invRow.hosted_invoice_url?.startsWith("https://invoice.stripe.com/") && invRow.invoice_pdf_url && invRow.receipt_url && invRow.amount_paid_minor === 2250 && invRow.discount_minor === 250 && !!invRow.coupon_redemption_id && invRow.currency === "USD", JSON.stringify(invRow));
  u = await up({ n: "a" });
  check("J3 duplicate Stripe delivery of the same paid invoice is NOT 'newly paid' again", u.data?.newly_paid === false && u.data.result === "unchanged", JSON.stringify(u.data));
  const dupRace = await Promise.all([1, 2, 3, 4, 5].map(() => up({ n: "race", status: "paid" })));
  check("J4 five simultaneous deliveries of one new paid invoice -> exactly one 'newly paid'", dupRace.filter((x) => x.data?.newly_paid).length === 1, JSON.stringify(dupRace.map((x) => x.error?.message ?? x.data.newly_paid)));
  const { count: invCount } = await admin.from("billing_invoices").select("*", { count: "exact", head: true }).eq("stripe_invoice_id", `in_QA32${runId}race`);
  check("J5 and exactly one invoice row exists", invCount === 1, String(invCount));
  u = await up({ n: "ord", status: "open", amount_paid_minor: 0, paid_at: null });
  const afterOpen = u.data?.newly_paid;
  u = await up({ n: "ord", status: "paid" });
  const afterPaid = u.data?.newly_paid;
  u = await up({ n: "ord", status: "open", amount_paid_minor: 0, paid_at: null });
  check("J6 open -> paid transitions to newly_paid once; a late 'open' event never regresses a paid invoice", afterOpen === false && afterPaid === true && u.data?.status === "paid" && u.data?.newly_paid === false, JSON.stringify([afterOpen, afterPaid, u.data]));
  u = await up({ n: "fail", status: "open", amount_paid_minor: 0, paid_at: null, failed_at: new Date().toISOString(), attempt_count: 1, billing_reason: "subscription_cycle" });
  const failedFirst = u.data?.newly_failed;
  u = await up({ n: "fail", status: "open", amount_paid_minor: 0, paid_at: null, failed_at: new Date().toISOString(), attempt_count: 2, billing_reason: "subscription_cycle" });
  check("J7 failed invoice: first failure flagged once, retry attempts do not re-flag", failedFirst === true && u.data?.newly_failed === false && u.data?.newly_paid === false, JSON.stringify([failedFirst, u.data]));
  u = await up({ n: "fail", status: "paid", billing_reason: "subscription_cycle" });
  check("J8 the same invoice later paid (payment recovery) is 'newly paid' exactly once", u.data?.newly_paid === true && u.data.status === "paid", JSON.stringify(u.data));
  u = await up({ n: "void", status: "void", amount_paid_minor: 0, paid_at: null });
  const voidAgain = await up({ n: "void", status: "paid" });
  check("J9 a void invoice is recorded as void and stays void", u.data?.status === "void" && voidAgain.data?.status === "void" && voidAgain.data?.newly_paid === false, JSON.stringify([u.data, voidAgain.data]));
  u = await up({ n: "renew", billing_reason: "subscription_cycle", total_minor: 2250, discount_applied: true });
  const rr = await admin.from("billing_invoices").select("billing_reason,discount_applied,coupon_redemption_id").eq("stripe_invoice_id", `in_QA32${runId}renew`).single();
  check("J10 discounted renewal: newly_paid, reason=subscription_cycle, discount flagged and linked to the redemption", u.data?.newly_paid === true && rr.data.billing_reason === "subscription_cycle" && rr.data.discount_applied && !!rr.data.coupon_redemption_id, JSON.stringify(rr.data));
  const ref1 = await admin.rpc("billing_set_invoice_refund", { p_mode: "test", p_invoice_id: `in_QA32${runId}a`, p_refunded_minor: 2250 });
  const ref2 = await admin.rpc("billing_set_invoice_refund", { p_mode: "test", p_invoice_id: `in_QA32${runId}a`, p_refunded_minor: 2250 });
  check("J11 refund amount mirrored once (idempotent)", ref1.data === true && ref2.data === false, JSON.stringify([ref1.data, ref2.data]));
  const ownerI = await userClient(uI);
  const hist = await ownerI.from("billing_invoices").select("stripe_invoice_id,status,total_minor,hosted_invoice_url").eq("tenant_id", pI.data.tenant_id);
  check("J12 the billing owner sees their payment history with the official document link", !hist.error && hist.data.length >= 5 && hist.data.every((x) => x.stripe_invoice_id.startsWith("in_QA32")) && hist.data.some((x) => x.hosted_invoice_url), JSON.stringify(hist.error ?? hist.data.length));
  const stranger = await gc.from("billing_invoices").select("id").eq("tenant_id", pI.data.tenant_id);
  check("J13 another account cannot see someone else's invoices", !stranger.error && (stranger.data ?? []).length === 0, JSON.stringify(stranger));
  const ownerWrite = await ownerI.from("billing_invoices").update({ total_minor: 1 }).eq("tenant_id", pI.data.tenant_id).select("id");
  check("J14 the owner cannot edit an invoice", !ownerWrite.error ? (ownerWrite.data ?? []).length === 0 : true);
  const dk = `payment_confirmation:in_QA32${runId}a`;
  const ob = () => admin.from("billing_email_outbox").insert({ dedupe_key: dk, user_id: uI, tenant_id: pI.data.tenant_id, template: "payment_confirmation", locale: "en", payload: {} });
  const [o1, o2] = [await ob(), await ob()];
  check("J15 one payment-confirmation outbox row per invoice (duplicate refused)", !o1.error && o2.error?.code === "23505", JSON.stringify(o2.error));
  await admin.from("billing_email_outbox").delete().eq("dedupe_key", dk);
  const noCard = await admin.from("billing_invoices").select("*").limit(1);
  check("J16 the invoice ledger has no card-data columns", !Object.keys(noCard.data?.[0] ?? {}).some((k) => /card|pan|cvc|cvv|last4|fingerprint/i.test(k)), Object.keys(noCard.data?.[0] ?? {}).join(","));
}

try {
  await main();
} catch (e) {
  check("script completed without an unexpected error", false, e.stack || e.message);
} finally {
  await cleanup();
}
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} passed`);
if (bad.length) { console.log("FAILED:\n" + bad.map((b) => " - " + b.name + (b.detail ? "  -> " + b.detail : "")).join("\n")); process.exit(1); }
