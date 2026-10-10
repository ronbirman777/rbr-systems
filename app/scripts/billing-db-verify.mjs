#!/usr/bin/env node
/**
 * TASK 032 - database-level behavioural verification for the billing
 * migrations (0036-0046; section L covers the 0042 Restore/Replace guards, section M the 0043 audio enforcement,
 * section N the 0044 Guest Access / Featured definer-RPC guards, section O the 0045 media content guard, section P
 * the 0046 audio provenance / exempt-Replace guard). STAGING ONLY: the script refuses to run against any
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
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import { STAGING_REF, assertStagingTarget, runScopedDelete } from "./stagingGuard.mjs";

const URL_ = process.env.SUPABASE_URL;
const SECRET = process.env.SUPABASE_SECRET_KEY;
const PUB = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!URL_ || !SECRET || !PUB) throw new Error("missing SUPABASE_URL / SUPABASE_SECRET_KEY / SUPABASE_PUBLISHABLE_KEY");
// Fails CLOSED before any client is created or any write can happen: exact Staging URL, a service-role JWT whose
// `ref` claim is the Staging project (so the Production key can never be used here by mistake).
assertStagingTarget({ url: URL_, serviceKey: SECRET });

const vectors = JSON.parse(readFileSync(new URL("../src/lib/billing/vectors/accessVectors.json", import.meta.url), "utf8"));

const admin = createClient(URL_, SECRET, { auth: { autoRefreshToken: false, persistSession: false } });
const runId = randomBytes(4).toString("hex"); // the exact identifier every row of THIS run carries
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
  stripe_subscription_id: `sub_QA32${runId}${rid()}`, stripe_customer_id: `cus_QA32${runId}${userId.replace(/-/g, "").slice(0, 8)}`,
  stripe_price_id: "price_QA32test", status: "active", currency: "USD", base_amount_minor: 2500,
  effective_amount_minor: 2500, period_start: new Date().toISOString(), period_end: H(24 * 30),
  cancel_at_period_end: false, latest_invoice_id: `in_QA32${runId}${rid()}`, ...o,
});
const provision = (checkoutId, sub, name = "QA032 Space") =>
  admin.rpc("billing_provision_paid_space", { p_pending_checkout_id: checkoutId, p_sub: sub, p_space_name: name, p_timezone: "UTC" });

/**
 * Run-scoped, fail-closed cleanup. Everything deleted is identified by ids this run created or by keys that
 * embed THIS run's full id (never a bare prefix). Counts are asserted before deleting: if more rows match than
 * this run could have created, cleanup ABORTS and deletes nothing (and the run is reported as failed).
 * admin_audit_log is append-only by design and is never touched.
 */
const residue = [];
async function idsWhere(table, build, column = "id") {
  const { data, error } = await build(admin.from(table).select(column));
  if (error) throw new Error(`cleanup lookup failed for ${table}: ${error.message}`);
  return (data ?? []).map((r) => r[column]);
}
async function cleanup() {
  try {
    // Restore the launch flag first (only ever a value this run read).
    await admin.from("billing_settings").update({ paid_checkout_enabled: flagWasEnabled }).eq("singleton", true);
    for (const path of created.storage) await admin.storage.from("tenant-media").remove([path]);

    const U = created.users.length ? created.users : ["00000000-0000-0000-0000-000000000000"];
    const tIds = [...new Set([...created.tenants, ...(await idsWhere("tenants", (q) => q.in("created_by", U)))])];
    const T = tIds.length ? tIds : ["00000000-0000-0000-0000-000000000000"];
    const C = created.checkouts.length ? created.checkouts : ["00000000-0000-0000-0000-000000000000"];

    const plan = [
      ["billing_email_outbox", "id", [...(await idsWhere("billing_email_outbox", (q) => q.like("dedupe_key", `qa032:${runId}:%`))), ...(await idsWhere("billing_email_outbox", (q) => q.like("dedupe_key", `payment_confirmation:in_QA32${runId}%`))), ...(await idsWhere("billing_email_outbox", (q) => q.in("user_id", U)))]],
      ["billing_invoices", "id", await idsWhere("billing_invoices", (q) => q.like("stripe_invoice_id", `in_QA32${runId}%`))],
      ["billing_events", "id", await idsWhere("billing_events", (q) => q.like("stripe_event_id", `evt_QA32${runId}%`))],
      ["coupon_redemptions", "id", [...(await idsWhere("coupon_redemptions", (q) => q.in("pending_checkout_id", C))), ...(await idsWhere("coupon_redemptions", (q) => q.in("tenant_id", T)))]],
      ["billing_acceptances", "id", await idsWhere("billing_acceptances", (q) => q.in("pending_checkout_id", C))],
      ["space_subscriptions", "id", await idsWhere("space_subscriptions", (q) => q.in("tenant_id", T))],
      ["published_spaces", "tenant_id", await idsWhere("published_spaces", (q) => q.in("tenant_id", T), "tenant_id")],
      ["module_items", "id", await idsWhere("module_items", (q) => q.in("tenant_id", T))],
      // 0046 backfill audit rows written by section P (tenant FK is SET NULL, so they are removed by this run's id).
      ["billing_audio_backfill_findings", "id", await idsWhere("billing_audio_backfill_findings", (q) => q.eq("run_id", `qa032-${runId}`))],
      ["tenants", "id", tIds],
      ["pending_space_checkouts", "id", created.checkouts],
      ["billing_customers", "id", await idsWhere("billing_customers", (q) => q.in("user_id", U))],
      ["coupons", "id", created.coupons],
    ];
    const total = plan.reduce((n, [, , ids]) => n + new Set(ids).size, 0);
    if (total > 2000) throw new Error(`cleanup ABORTED: ${total} rows selected, far more than a run creates`);
    for (const [table, column, ids] of plan) {
      const n = await runScopedDelete(admin, { table, column, ids });
      if (n) console.log(`cleanup: removed ${n} from ${table}`);
    }
    // Users last (their FKs are SET NULL on the rows removed above). Exact ids only.
    for (const id of created.users) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) throw new Error(`cleanup: could not delete synthetic user ${id}: ${error.message}`);
    }

    // Regression guard: NOTHING carrying this run's id may remain anywhere (audit excepted: append-only).
    const checks = [
      ["billing_email_outbox", "dedupe_key", `%${runId}%`], ["billing_invoices", "stripe_invoice_id", `%${runId}%`],
      ["billing_events", "stripe_event_id", `%${runId}%`], ["billing_customers", "stripe_customer_id", `%${runId}%`],
      ["coupons", "normalized_code", `%${runId.toUpperCase()}%`], ["space_subscriptions", "stripe_subscription_id", `%${runId}%`],
    ];
    for (const [table, col, pat] of checks) {
      const { count } = await admin.from(table).select("*", { count: "exact", head: true }).ilike(col, pat);
      if (count) residue.push(`${table}: ${count} row(s) still carry this run's id`);
    }
    const { count: leftFindings } = await admin.from("billing_audio_backfill_findings").select("*", { count: "exact", head: true }).eq("run_id", `qa032-${runId}`);
    if (leftFindings) residue.push(`billing_audio_backfill_findings: ${leftFindings} row(s) still carry this run's id`);
    const { count: leftUsers } = await admin.from("billing_customers").select("*", { count: "exact", head: true }).in("user_id", U);
    if (leftUsers) residue.push(`billing_customers: ${leftUsers} rows still point at this run's users`);
    console.log(residue.length ? `RESIDUE: ${residue.join("; ")}` : "cleanup done (no residue carrying this run's id)");
  } catch (e) {
    residue.push(`cleanup aborted: ${e.message}`);
    console.log("CLEANUP ABORTED (nothing further deleted; manual review needed): " + e.message);
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
  const audit = await admin.from("admin_audit_log").insert({ admin_user_id: uG2, action: "qa032.test", target_type: "test", target_id: "x", request_id: `qa032-verify-${runId}`, reason: `TASK 032 QA harness run ${runId} (append-only test entry)` }).select("id").single();
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

  // ------------------------------------------------------------------ K. event / email / transition primitives
  const evId = `evt_QA32${runId}k1`;
  const claim = (id = evId, extra = {}) => admin.rpc("billing_claim_event", { p_mode: "test", p_event_id: id, p_type: "invoice.paid", ...extra }).then((r) => r.error ? r.error.message : r.data);
  const claims = await Promise.all([1, 2, 3, 4, 5, 6, 7, 8].map(() => claim()));
  check("K1 eight simultaneous deliveries of one Stripe event -> exactly one 'claimed', rest 'in_progress'", claims.filter((x) => x === "claimed").length === 1 && claims.filter((x) => x === "in_progress").length === 7, JSON.stringify(claims));
  await admin.rpc("billing_finish_event", { p_mode: "test", p_event_id: evId, p_status: "processed" });
  check("K2 after processing, a redelivery is 'duplicate' (no side effects)", (await claim()) === "duplicate");
  const evF = `evt_QA32${runId}k2`;
  await claim(evF);
  await admin.rpc("billing_finish_event", { p_mode: "test", p_event_id: evF, p_status: "failed", p_error_code: "boom", p_error_detail: "x" });
  check("K3 a FAILED event is re-claimed on retry", (await claim(evF)) === "claimed");
  const { data: evRow } = await admin.from("billing_events").select("attempts,status").eq("stripe_event_id", evF).single();
  check("K4 the retry is counted and the event is processing again", evRow.attempts === 2 && evRow.status === "processing", JSON.stringify(evRow));
  await admin.from("billing_events").update({ processing_started_at: H(-1) }).eq("stripe_event_id", evF);
  check("K5 a stale 'processing' claim (crashed worker) is taken over", (await claim(evF)) === "claimed");
  const badFin = await admin.rpc("billing_finish_event", { p_mode: "test", p_event_id: evF, p_status: "received" });
  check("K6 an invalid final status is refused", !!badFin.error);

  const dk2 = `qa032:${runId}:mail`;
  const enq = () => admin.rpc("billing_enqueue_email", { p_dedupe_key: dk2, p_template: "payment_confirmation", p_user_id: uG2, p_tenant_id: null, p_subscription_id: null, p_locale: "de", p_payload: { a: 1 } }).then((r) => r.data);
  const enqs = await Promise.all([enq(), enq(), enq(), enq()]);
  check("K7 four simultaneous enqueues of the same email -> exactly one inserted", enqs.filter((x) => x === true).length === 1, JSON.stringify(enqs));
  for (let i = 0; i < 6; i++) await admin.rpc("billing_enqueue_email", { p_dedupe_key: `qa032:${runId}:m${i}`, p_template: "payment_failed", p_user_id: uG2, p_tenant_id: null, p_subscription_id: null, p_locale: "en", p_payload: {} });
  const [c1, c2] = await Promise.all([admin.rpc("billing_claim_emails", { p_limit: 4 }), admin.rpc("billing_claim_emails", { p_limit: 4 })]);
  const idsA = (c1.data ?? []).map((x) => x.id), idsB = (c2.data ?? []).map((x) => x.id);
  check("K8 two workers claiming at once never lease the same email", idsA.filter((x) => idsB.includes(x)).length === 0, JSON.stringify([idsA.length, idsB.length]));
  check("K9 claimed emails are marked sending with a lease timestamp and an attempt", [...(c1.data ?? []), ...(c2.data ?? [])].every((x) => x.status === "sending" && x.attempts === 1 && !!x.claimed_at));
  if (idsA[0]) {
    await admin.rpc("billing_finish_email", { p_id: idsA[0], p_status: "sent", p_provider_id: "re_QA32" });
    await admin.rpc("billing_finish_email", { p_id: idsA[0], p_status: "failed", p_error: "late" });
    const { data: done } = await admin.from("billing_email_outbox").select("status,provider_message_id,sent_at").eq("id", idsA[0]).single();
    check("K10 a sent email stays sent (a late 'failed' cannot overwrite it)", done.status === "sent" && done.provider_message_id === "re_QA32" && !!done.sent_at, JSON.stringify(done));
  }
  const cLate = await admin.rpc("billing_claim_emails", { p_limit: 100 });
  check("K11 already-leased emails are not handed out again within the lease window", (cLate.data ?? []).every((x) => ![...idsA, ...idsB].includes(x.id)), String((cLate.data ?? []).length));

  // transition guard
  const uT = await mkUser("ut"); const ckT = await mkCheckout(uT, "teach", { status: "created" });
  const cT = await mkCoupon({ usage_rule: "once_per_user" });
  await reserve(uT, cT.code, ckT.id);
  const tr1 = await admin.rpc("billing_transition_checkout", { p_id: ckT.id, p_allowed_from: ["created"], p_to: "checkout_created", p_session_id: `cs_test_QA32${runId}`, p_customer_id: "cus_QA32t" });
  check("K12 created -> checkout_created attaches the Stripe session", tr1.data === true);
  const tr2 = await admin.rpc("billing_transition_checkout", { p_id: ckT.id, p_allowed_from: ["created"], p_to: "awaiting_payment" });
  check("K13 a transition from the wrong state is refused (no-op)", tr2.data === false);
  const tr3 = await admin.rpc("billing_transition_checkout", { p_id: ckT.id, p_allowed_from: ["checkout_created", "awaiting_payment"], p_to: "canceled" });
  const { data: rel } = await admin.from("coupon_redemptions").select("status").eq("pending_checkout_id", ckT.id).single();
  check("K14 cancelling the checkout releases its coupon reservation", tr3.data === true && rel.status === "released", JSON.stringify(rel));
  const trBad = await admin.rpc("billing_transition_checkout", { p_id: ckT.id, p_allowed_from: ["canceled"], p_to: "provisioned" });
  check("K15 a checkout can never be moved to 'provisioned' through the transition helper", !!trBad.error);
  const tr4 = await admin.rpc("billing_transition_checkout", { p_id: ckPv.id, p_allowed_from: ["provisioned"], p_to: "canceled" });
  check("K16 a provisioned checkout can never be cancelled/expired afterwards", tr4.data === false);
  const dupSess = await admin.from("pending_space_checkouts").update({ stripe_checkout_session_id: `cs_test_QA32${runId}` }).eq("id", ckA1.id);
  check("K17 one Stripe session id maps to exactly one pending checkout", !!dupSess.error && dupSess.error.code === "23505", JSON.stringify(dupSess.error));
  const np = await admin.rpc("billing_set_next_payment_attempt", { p_subscription_id: pI.data.subscription_id, p_at: H(24) });
  const { data: npRow } = await admin.from("space_subscriptions").select("next_payment_attempt_at").eq("id", pI.data.subscription_id).single();
  check("K18 the next Stripe retry date can be recorded", !np.error && !!npRow.next_payment_attempt_at, JSON.stringify(np.error));

  // ------------------------------------------------------------------ L. 0042 lifecycle guards (restore / replace)
  // One account: one LEGACY Space (direct insert, flag off) + one PAID Space, legacy allowance 1. Before 0042,
  // restore_space() counted both against the allowance (2 > 1) and neither RPC consulted billing.
  const setFlag = (on) => admin.from("billing_settings").update({ paid_checkout_enabled: on }).eq("singleton", true);
  const setSlots = (userId, n) => admin.from("user_space_slots").upsert({ user_id: userId, slots_allowed: n });
  const statusOf = async (id) => (await admin.from("tenants").select("status,name").eq("id", id).single()).data;
  const locked = (res) => !!res.error && res.error.hint === "BILLING_LOCKED";
  const slotLimited = (res) => !!res.error && res.error.hint === "SLOT_LIMIT_REACHED";

  const uLc = await mkUser("ulc"); const lc = await userClient(uLc);
  await setFlag(false);
  await setSlots(uLc, 1);
  const legacyT = await lc.from("tenants").insert({ name: "qa032 legacy lifecycle", product_type: "teach", timezone: "UTC" }).select("id").single();
  if (legacyT.data) created.tenants.push(legacyT.data.id);
  const ckLc = await mkCheckout(uLc, "retreat");
  const sLc = subJson(uLc);
  const pLc = await provision(ckLc.id, sLc, "QA032 paid lifecycle");
  const paidT = pLc.data?.tenant_id; if (paidT) created.tenants.push(paidT);
  const legacyId = legacyT.data?.id;
  check("L0 setup: one legacy + one paid Space for one account, legacy allowance 1", !legacyT.error && !!paidT, JSON.stringify(legacyT.error ?? pLc.error));
  const subLc = (await admin.from("space_subscriptions").select("id").eq("tenant_id", paidT).single()).data?.id;
  const setSub = (patch) => admin.from("space_subscriptions").update(patch).eq("id", subLc);

  // Paid (active) Space: restore is allowed although the account is over the legacy allowance, flag OFF and ON.
  for (const on of [false, true]) {
    await setFlag(on);
    await lc.rpc("archive_space", { p_tenant_id: paidT });
    const res = await lc.rpc("restore_space", { p_tenant_id: paidT });
    check(`L1 flag ${on ? "ON" : "OFF"}: an active paid Space restores without needing a legacy slot`, !res.error && (await statusOf(paidT))?.status === "draft", JSON.stringify(res.error));
  }

  // Legacy Space: flag OFF keeps the 0017 count (paid Space included) -> refused exactly as before.
  await setFlag(false);
  await lc.rpc("archive_space", { p_tenant_id: legacyId });
  let lres = await lc.rpc("restore_space", { p_tenant_id: legacyId });
  check("L2 flag OFF: legacy restore keeps the pre-0042 count (2 owned > 1 allowed -> SLOT_LIMIT_REACHED)", slotLimited(lres) && (await statusOf(legacyId))?.status === "archived", JSON.stringify(lres.error));
  // Flag ON: only legacy Spaces count -> 1 <= 1 -> allowed.
  await setFlag(true);
  lres = await lc.rpc("restore_space", { p_tenant_id: legacyId });
  check("L3 flag ON: legacy restore counts legacy Spaces only (the paid Space does not eat the free slot)", !lres.error && (await statusOf(legacyId))?.status === "draft", JSON.stringify(lres.error));
  // Flag ON, still over the legacy allowance -> refused.
  await setSlots(uLc, 0);
  await lc.rpc("archive_space", { p_tenant_id: legacyId });
  lres = await lc.rpc("restore_space", { p_tenant_id: legacyId });
  check("L4 flag ON: a legacy Space over the legacy allowance is still refused (SLOT_LIMIT_REACHED)", slotLimited(lres) && (await statusOf(legacyId))?.status === "archived", JSON.stringify(lres.error));
  await setFlag(false);
  await setSlots(uLc, 2);
  lres = await lc.rpc("restore_space", { p_tenant_id: legacyId });
  check("L5 flag OFF: legacy restore with a free slot succeeds (unchanged)", !lres.error && (await statusOf(legacyId))?.status === "draft", JSON.stringify(lres.error));
  const legacyReplace = await lc.rpc("replace_space", { p_tenant_id: legacyId, p_new_name: "qa032 legacy replaced" });
  check("L6 legacy Space: replace is unaffected by billing (allowed)", !legacyReplace.error && (await statusOf(legacyId))?.name === "qa032 legacy replaced", JSON.stringify(legacyReplace.error));
  await setSlots(uLc, 1);

  // Suspended / ended paid Space: restore and replace are refused with BILLING_LOCKED, whatever the flag.
  const lcItem = await lc.from("module_items").insert({ tenant_id: paidT, module_key: "meals", title: "qa032 keep me" }).select("id").single();
  for (const [label, patch] of [
    ["Studio-suspended (failure > 7 days)", { status: "past_due", payment_failed_at: H(-200) }],
    ["ended (canceled)", { status: "canceled", payment_failed_at: null }],
  ]) {
    await setSub({ status: "active", payment_failed_at: null });
    await lc.rpc("archive_space", { p_tenant_id: paidT });
    await setSub(patch);
    for (const on of [false, true]) {
      await setFlag(on);
      const rs = await lc.rpc("restore_space", { p_tenant_id: paidT });
      check(`L7 flag ${on ? "ON" : "OFF"}, ${label}: restore refused with BILLING_LOCKED`, locked(rs) && (await statusOf(paidT))?.status === "archived", JSON.stringify(rs.error));
      const rp = await lc.rpc("replace_space", { p_tenant_id: paidT, p_new_name: "qa032 tamper" });
      const after = await statusOf(paidT);
      const { count: kept } = await admin.from("module_items").select("*", { count: "exact", head: true }).eq("tenant_id", paidT);
      check(`L8 flag ${on ? "ON" : "OFF"}, ${label}: replace refused with BILLING_LOCKED and nothing was reset`, locked(rp) && after?.name !== "qa032 tamper" && after?.status === "archived" && (lcItem.error || kept >= 1), JSON.stringify(rp.error));
    }
  }

  // Guest-suspended (Studio still writable, 24h-7d): a paying customer is not blocked.
  await setSub({ status: "past_due", payment_failed_at: H(-30) });
  await setFlag(true);
  const gs = await lc.rpc("restore_space", { p_tenant_id: paidT });
  check("L9 Guest-suspended (Studio writable): restore allowed", !gs.error && (await statusOf(paidT))?.status === "draft", JSON.stringify(gs.error));

  // Exempt Space: allowed, no slot check (allowance 1, two owned).
  await admin.from("space_subscriptions").delete().eq("id", subLc);
  const exLc = await admin.rpc("billing_set_internal_exempt", { p_tenant_id: paidT, p_reason: "qa032 lifecycle exemption", p_actor: uLc });
  await lc.rpc("archive_space", { p_tenant_id: paidT });
  for (const on of [false, true]) {
    await setFlag(on);
    if ((await statusOf(paidT))?.status !== "archived") await lc.rpc("archive_space", { p_tenant_id: paidT });
    const rs = await lc.rpc("restore_space", { p_tenant_id: paidT });
    check(`L10 flag ${on ? "ON" : "OFF"}: an exempt Space restores without a legacy slot`, !exLc.error && !rs.error && (await statusOf(paidT))?.status === "draft", JSON.stringify(exLc.error ?? rs.error));
  }
  // 0046: an exemption must not carry over to replacement content - Replace is refused until an Admin clears it.
  const exRp = await lc.rpc("replace_space", { p_tenant_id: paidT, p_new_name: "qa032 exempt replaced" });
  check("L11 an exempt Space cannot be replaced (EXEMPT_REPLACE_REQUIRES_ADMIN, 0046) and nothing was reset", exRp.error?.hint === "EXEMPT_REPLACE_REQUIRES_ADMIN" && (await statusOf(paidT))?.name !== "qa032 exempt replaced", JSON.stringify(exRp.error));
  await admin.rpc("billing_clear_internal_exempt", { p_tenant_id: paidT });

  // Non-owners are still refused before any billing logic.
  const strangerRs = await gc.rpc("restore_space", { p_tenant_id: paidT });
  check("L12 a non-owner is still refused (42501), never told the billing state", !!strangerRs.error && strangerRs.error.code === "42501" && !locked(strangerRs), JSON.stringify(strangerRs.error));
  await setFlag(flagWasEnabled);

  // ------------------------------------------------------------------ M. 0043 audio enforcement (paid Spaces)
  {
    // Synthetic tracks only: no audio bytes are uploaded; refs are well-formed strings in each test tenant's folder.
    const audioDenied = (res) => !!res.error && res.error.hint === "AUDIO_SERVER_ONLY";
    const audioLimit = (res) => !!res.error && res.error.hint === "AUDIO_LIMIT";
    const aRef = (tenant, item, ext = "mp3") => `${tenant}/teachAudioFile/${item}/${randomUUID()}/draft.${ext}`;
    // From 0046 the service-role finalize write goes through billing_audio_attach_verified() (provenance + metadata
    // in one transaction); a bare service-role update of the file fields is refused (section P). Synthetic fingerprint.
    const attach = (tenant, item, ref, seconds) => admin.rpc("billing_audio_attach_verified", {
      p_tenant_id: tenant, p_item_id: item, p_metadata: { audioRef: ref, durationSeconds: seconds }, p_size_bytes: 1000, p_sha256: "a".repeat(64),
    });
    const uAu = await mkUser("uau"); const mOwner = await userClient(uAu);
    await setFlag(false);
    const ckAu = await mkCheckout(uAu, "teach"); const pAu = await provision(ckAu.id, subJson(uAu), "QA032 audio paid");
    const tAu = pAu.data?.tenant_id; if (tAu) created.tenants.push(tAu);
    // Legacy (billing row removed) and exempt shapes for the same owner.
    const ckAl = await mkCheckout(uAu, "retreat"); const pAl = await provision(ckAl.id, subJson(uAu), "QA032 audio legacy");
    const tAl = pAl.data?.tenant_id; if (tAl) created.tenants.push(tAl);
    if (tAl) {
      await admin.from("space_subscriptions").delete().eq("tenant_id", tAl);
      await admin.from("space_entitlements").upsert({ tenant_id: tAl, access_type: "complimentary", access_ends_at: H(24 * 30) });
    }
    const uAe = await mkUser("uae"); const mExOwner = await userClient(uAe);
    const ckAe = await mkCheckout(uAe, "teach"); const pAe = await provision(ckAe.id, subJson(uAe), "QA032 audio exempt");
    const tAe = pAe.data?.tenant_id; if (tAe) created.tenants.push(tAe);
    if (tAe) {
      await admin.from("space_subscriptions").delete().eq("tenant_id", tAe);
      await admin.rpc("billing_set_internal_exempt", { p_tenant_id: tAe, p_reason: "qa032 audio exemption", p_actor: uAe });
    }
    check("M0 setup: paid, legacy and exempt Spaces exist", !!tAu && !!tAl && !!tAe, JSON.stringify([pAu.error, pAl.error, pAe.error]));
    const mPol = await admin.rpc("billing_audio_policy", { p_tenant_id: tAu });
    check("M1 policy helper: paid Space enforced at 14400 s library / 3600 s per recording", mPol.data?.[0]?.mode === "enforced" && mPol.data[0].library_seconds === 14400 && mPol.data[0].max_recording_seconds === 3600, JSON.stringify(mPol));

    const it1 = randomUUID();
    let mRes = await mOwner.from("module_items").insert({ id: it1, tenant_id: tAu, module_key: "teachAudio", title: "qa032 track", metadata: { audioRef: aRef(tAu, it1), durationSeconds: 10 } }).select("id");
    check("M2 paid: a direct member INSERT carrying a file is refused (AUDIO_SERVER_ONLY)", audioDenied(mRes), JSON.stringify(mRes.error));
    mRes = await mOwner.from("module_items").insert({ id: it1, tenant_id: tAu, module_key: "teachAudio", title: "qa032 track", metadata: { audioRef: null, durationSeconds: null } }).select("id");
    check("M3 paid: a member INSERT without a file (upload prepare) is allowed", !mRes.error, JSON.stringify(mRes.error));
    const ref1 = aRef(tAu, it1);
    mRes = await mOwner.from("module_items").update({ metadata: { audioRef: ref1, durationSeconds: 1 } }).eq("id", it1).select("id");
    check("M4 paid: a direct member UPDATE setting the file is refused", audioDenied(mRes), JSON.stringify(mRes.error ?? mRes.data));
    mRes = await attach(tAu, it1, ref1, 3600);
    check("M5 paid: the service-role finalize write of a verified 3600 s file is allowed", !mRes.error, JSON.stringify(mRes.error));
    mRes = await attach(tAu, it1, ref1, 3601);
    check("M6 paid: the database refuses a 3601 s file even from the server path (AUDIO_LIMIT)", audioLimit(mRes), JSON.stringify(mRes.error));
    mRes = await mOwner.from("module_items").update({ metadata: { audioRef: ref1, durationSeconds: 60 } }).eq("id", it1).select("id");
    check("M7 paid: a member cannot lower the stored length", audioDenied(mRes), JSON.stringify(mRes.error ?? mRes.data));
    mRes = await mOwner.from("module_items").update({ title: "qa032 renamed" }).eq("id", it1).select("id");
    check("M8 paid: a member text edit that leaves the file untouched still works", !mRes.error && mRes.data?.length === 1, JSON.stringify(mRes.error));
    mRes = await mOwner.from("module_items").upsert({ id: it1, tenant_id: tAu, module_key: "teachAudio", title: "qa032 saved", metadata: { audioRef: ref1, durationSeconds: 3600, note: "x" } }, { onConflict: "id" }).select("id");
    check("M9 paid: a Save-style upsert carrying the stored file over still works", !mRes.error, JSON.stringify(mRes.error));
    let mPub = await mOwner.rpc("publish_space", { p_tenant_id: tAu });
    check("M10 paid: direct publish within the allowance succeeds", !mPub.error, JSON.stringify(mPub.error));

    for (let i = 0; i < 3; i++) {
      const id = randomUUID();
      await admin.from("module_items").insert({ id, tenant_id: tAu, module_key: "teachAudio", title: `qa032 fill ${i}`, metadata: { audioRef: null, durationSeconds: null } });
      await attach(tAu, id, aRef(tAu, id), 3600);
    }
    const it5 = randomUUID();
    await admin.from("module_items").insert({ id: it5, tenant_id: tAu, module_key: "teachAudio", title: "qa032 over", metadata: { audioRef: null, durationSeconds: null } });
    mRes = await attach(tAu, it5, aRef(tAu, it5), 60);
    check("M11 paid: library at exactly 240:00, one more minute is refused by the database", audioLimit(mRes), JSON.stringify(mRes.error));
    const { data: subAu } = await admin.from("space_subscriptions").select("id").eq("tenant_id", tAu).single();
    await admin.from("space_subscription_addons").upsert({ subscription_id: subAu.id, addon_key: "audio_pack", quantity: 1 });
    mRes = await attach(tAu, it5, aRef(tAu, it5), 60);
    check("M12 paid: with one audio add-on the same minute is allowed", !mRes.error, JSON.stringify(mRes.error));
    await admin.from("space_subscription_addons").delete().eq("subscription_id", subAu.id);
    mPub = await mOwner.rpc("publish_space", { p_tenant_id: tAu });
    check("M13 paid: after the add-on is removed, a DIRECT publish_space RPC over the library is refused (AUDIO_LIMIT)", audioLimit(mPub), JSON.stringify(mPub.error));
    await admin.from("module_items").delete().eq("id", it5);
    await mOwner.from("module_settings").upsert({ tenant_id: tAu, module_key: "spaceSettings", data: { qa: { audioRef: aRef(tAu, randomUUID()) } } });
    mPub = await mOwner.rpc("publish_space", { p_tenant_id: tAu });
    check("M14 paid: an audioRef smuggled into a published settings object is refused at publish", audioLimit(mPub), JSON.stringify(mPub.error));
    await mOwner.from("module_settings").delete().eq("tenant_id", tAu).eq("module_key", "spaceSettings");
    mPub = await mOwner.rpc("publish_space", { p_tenant_id: tAu });
    check("M15 paid: back within the rules, publish succeeds again", !mPub.error, JSON.stringify(mPub.error));
    mRes = await mOwner.from("module_items").update({ metadata: { audioRef: null, durationSeconds: null } }).eq("id", it1).select("id");
    check("M16 paid: a member can still detach (clear) a file", !mRes.error && mRes.data?.length === 1, JSON.stringify(mRes.error));

    const itL = randomUUID();
    mRes = await mOwner.from("module_items").insert({ id: itL, tenant_id: tAl, module_key: "audio", title: "qa032 legacy long", metadata: { audioRef: `${tAl}/audioFile/${itL}/${randomUUID()}/draft.mp3`, durationSeconds: 18000 } }).select("id");
    check("M17 legacy: a member writes a 5 h file directly, exactly as before 0043", !mRes.error, JSON.stringify(mRes.error));
    mPub = await mOwner.rpc("publish_space", { p_tenant_id: tAl });
    check("M18 legacy: direct publish is unaffected", !mPub.error, JSON.stringify(mPub.error));
    const itE = randomUUID();
    mRes = await mExOwner.from("module_items").insert({ id: itE, tenant_id: tAe, module_key: "teachAudio", title: "qa032 exempt long", metadata: { audioRef: aRef(tAe, itE), durationSeconds: 18000 } }).select("id");
    check("M19 exempt: a member writes a 5 h file directly (not blocked)", !mRes.error, JSON.stringify(mRes.error));
    mPub = await mExOwner.rpc("publish_space", { p_tenant_id: tAe });
    check("M20 exempt: direct publish is unaffected", !mPub.error, JSON.stringify(mPub.error));

    const strangerPol = await mExOwner.rpc("billing_audio_policy", { p_tenant_id: tAu });
    check("M21 a non-member learns nothing from the audio policy helper", strangerPol.data?.[0]?.mode === "unavailable", JSON.stringify(strangerPol.data));
    const anonPol = await createClient(URL_, PUB, { auth: { persistSession: false } }).rpc("billing_audio_policy", { p_tenant_id: tAu });
    check("M22 anon cannot call the audio policy helper", !!anonPol.error);
    await admin.rpc("billing_clear_internal_exempt", { p_tenant_id: tAe });
  }

  // ------------------------------------------------------------------ N. 0044 definer-RPC guards (Guest Access / Featured)
  {
    // set/disable_guest_access_code and submit_featured_listing are SECURITY DEFINER: the 0039 policies never see
    // their writes. 0044 makes each refuse with BILLING_LOCKED when space_studio_writable() is false. Called
    // DIRECTLY as the owner (bypassing the Studio actions' pre-check), flag OFF and ON.
    const uN = await mkUser("un"); const nc = await userClient(uN);
    await setFlag(false);
    await setSlots(uN, 3);
    const legacyN = await nc.from("tenants").insert({ name: "qa032 legacy definer", product_type: "retreat", timezone: "UTC" }).select("id").single();
    const tLegacy = legacyN.data?.id; if (tLegacy) created.tenants.push(tLegacy);
    const ckNa = await mkCheckout(uN, "retreat"); const pNa = await provision(ckNa.id, subJson(uN), "QA032 definer active");
    const tActive = pNa.data?.tenant_id; if (tActive) created.tenants.push(tActive);
    const ckNs = await mkCheckout(uN, "retreat"); const pNs = await provision(ckNs.id, subJson(uN), "QA032 definer suspended");
    const tSusp = pNs.data?.tenant_id; if (tSusp) created.tenants.push(tSusp);
    check("N0 setup: one legacy, one active paid and one paid Space for one owner", !!tLegacy && !!tActive && !!tSusp, JSON.stringify([legacyN.error, pNa.error, pNs.error]));

    const setCode = (c, t) => c.rpc("set_guest_access_code", { p_tenant_id: t, p_code: "246810" });
    const disable = (c, t) => c.rpc("disable_guest_access_code", { p_tenant_id: t });
    const feature = (c, t) => c.rpc("submit_featured_listing", { p_tenant_id: t, p_description: "qa032 definer", p_location: null, p_website: null, p_instagram: null, p_additional_links: [] });
    const accessOf = async (t) => (await admin.from("space_guest_access").select("mode,version").eq("tenant_id", t).maybeSingle()).data;
    const featuredOf = async (t) => (await admin.from("space_featured_submissions").select("status,submitted_at").eq("tenant_id", t).maybeSingle()).data;

    // While the soon-to-be-suspended Space is still active, give it a code (so a refused disable is observable).
    const preCode = await setCode(nc, tSusp);
    check("N1 active paid: set code before suspension (setup)", !preCode.error, JSON.stringify(preCode.error));
    await admin.from("space_subscriptions").update({ status: "past_due", payment_failed_at: H(-200) }).eq("tenant_id", tSusp);
    const accessBefore = await accessOf(tSusp);
    const featuredBefore = await featuredOf(tSusp);

    for (const on of [false, true]) {
      await setFlag(on);
      const f = on ? "ON" : "OFF";
      const rSet = await setCode(nc, tSusp);
      check(`N2 flag ${f}, Studio-suspended paid: direct set_guest_access_code refused with BILLING_LOCKED`, locked(rSet), JSON.stringify(rSet.error));
      const rDis = await disable(nc, tSusp);
      check(`N3 flag ${f}, Studio-suspended paid: direct disable_guest_access_code refused with BILLING_LOCKED`, locked(rDis), JSON.stringify(rDis.error));
      const rFeat = await feature(nc, tSusp);
      check(`N4 flag ${f}, Studio-suspended paid: direct submit_featured_listing refused with BILLING_LOCKED`, locked(rFeat), JSON.stringify(rFeat.error));
      const accessAfter = await accessOf(tSusp);
      const featuredAfter = await featuredOf(tSusp);
      check(`N5 flag ${f}, Studio-suspended paid: nothing was written (code row and Featured row unchanged)`,
        JSON.stringify(accessAfter) === JSON.stringify(accessBefore) && accessAfter?.mode === "code" && JSON.stringify(featuredAfter) === JSON.stringify(featuredBefore),
        JSON.stringify({ accessBefore, accessAfter, featuredBefore, featuredAfter }));

      for (const [label, t] of [["legacy", tLegacy], ["active paid", tActive]]) {
        const a = await setCode(nc, t);
        const d = await disable(nc, t);
        const fe = await feature(nc, t);
        check(`N6 flag ${f}, ${label}: set code, disable code and Featured submit all allowed (unchanged)`, !a.error && !d.error && !fe.error && (await accessOf(t))?.mode === "public" && (await featuredOf(t))?.status === "submitted",
          JSON.stringify([a.error, d.error, fe.error]));
      }
    }

    // Guest-suspended (24 h - 7 d): Studio still writable, so the owner is not blocked.
    await admin.from("space_subscriptions").update({ status: "past_due", payment_failed_at: H(-30) }).eq("tenant_id", tSusp);
    const gsSet = await setCode(nc, tSusp);
    check("N7 Guest-suspended paid (Studio writable): set code allowed", !gsSet.error, JSON.stringify(gsSet.error));
    // A non-owner is refused by the ownership check first and is never told the billing state.
    await admin.from("space_subscriptions").update({ status: "past_due", payment_failed_at: H(-200) }).eq("tenant_id", tSusp);
    const strangerSet = await setCode(gc, tSusp);
    const strangerFeat = await feature(gc, tSusp);
    check("N8 a non-owner is refused ('not authorized'), never BILLING_LOCKED", !!strangerSet.error && !locked(strangerSet) && !!strangerFeat.error && !locked(strangerFeat), JSON.stringify([strangerSet.error, strangerFeat.error]));
    await admin.from("space_subscriptions").update({ status: "active", payment_failed_at: null }).eq("tenant_id", tSusp);
  }

  // ------------------------------------------------------------------ O. 0045 media content guard (paid Spaces)
  {
    // Real Storage API calls as a member session and as the service role. Synthetic bytes only (a tiny WebP
    // header and a few bytes labelled audio); every object this run creates is recorded in created.storage.
    // On a paid Space a member may create only versioned draft AUDIO objects and never overwrite; image objects
    // and published copies come from the service-role pipeline; a snapshot imageRef must name one of the Space's
    // own image paths. A member can still store any string in a DRAFT field (module_items.image_ref etc.) -
    // that write is not where the guard sits - but publishing it is refused (O7/O8). Legacy/exempt unchanged.
    const MEDIA_INVALID = (res) => !!res.error && res.error.hint === "MEDIA_REF_INVALID";
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x16, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const audioBytes = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0, 0xff, 0xfb, 0x90, 0x64]);
    const up = async (client, path, bytes, contentType, upsert = false) => {
      const r = await client.storage.from("tenant-media").upload(path, new Blob([bytes], { type: contentType }), { upsert, contentType });
      if (!r.error) created.storage.push(path);
      return r;
    };
    const uO = await mkUser("uo"); const oc = await userClient(uO);
    await setFlag(false);
    const ckOp = await mkCheckout(uO, "teach"); const pOp = await provision(ckOp.id, subJson(uO), "QA032 media paid");
    const tP = pOp.data?.tenant_id; if (tP) created.tenants.push(tP);
    const ckOl = await mkCheckout(uO, "retreat"); const pOl = await provision(ckOl.id, subJson(uO), "QA032 media legacy");
    const tL = pOl.data?.tenant_id; if (tL) created.tenants.push(tL);
    if (tL) {
      await admin.from("space_subscriptions").delete().eq("tenant_id", tL);
      await admin.from("space_entitlements").upsert({ tenant_id: tL, access_type: "complimentary", access_ends_at: H(24 * 30) });
    }
    const ckOe = await mkCheckout(uO, "teach"); const pOe = await provision(ckOe.id, subJson(uO), "QA032 media exempt");
    const tE = pOe.data?.tenant_id; if (tE) created.tenants.push(tE);
    if (tE) {
      await admin.from("space_subscriptions").delete().eq("tenant_id", tE);
      await admin.rpc("billing_set_internal_exempt", { p_tenant_id: tE, p_reason: "qa032 media exemption", p_actor: uO });
    }
    check("O0 setup: paid, legacy and exempt Spaces exist", !!tP && !!tL && !!tE, JSON.stringify([pOp.error, pOl.error, pOe.error]));

    const v = (t, mod, file) => `${t}/${mod}/${randomUUID()}/${randomUUID()}/${file}`;
    let r = await up(oc, v(tP, "brand", "draft.webp"), webp, "image/webp");
    check("O1 paid: a member upload of an image object (draft.webp) is refused by Storage", !!r.error, JSON.stringify(r.error));
    r = await up(oc, v(tP, "teachAudioFile", "draft.webp"), audioBytes, "image/webp");
    check("O2 paid: audio bytes uploaded by a member under an image name are refused", !!r.error, JSON.stringify(r.error));
    const audioPath = v(tP, "teachAudioFile", "draft.mp3");
    r = await up(oc, audioPath, audioBytes, "audio/mpeg");
    check("O3 paid: the member's browser-direct draft AUDIO upload still works", !r.error, JSON.stringify(r.error));
    r = await up(oc, audioPath.replace("/draft.mp3", "/published.mp3"), audioBytes, "audio/mpeg");
    check("O4 paid: a member cannot pre-create a published copy", !!r.error, JSON.stringify(r.error));
    const imgPath = v(tP, "brand", "draft.webp");
    r = await up(admin, imgPath, webp, "image/webp");
    check("O5 paid: the service-role (validated) image write is allowed", !r.error, JSON.stringify(r.error));
    r = await oc.storage.from("tenant-media").upload(imgPath, new Blob([audioBytes], { type: "image/webp" }), { upsert: true, contentType: "image/webp" });
    check("O6 paid: a member cannot overwrite the validated image (upsert)", !!r.error, JSON.stringify(r.error));

    // Direct member write of an image ref at an audio object (the draft write itself is allowed), then publish:
    // publish_space() derives `published.mp3` for the hero imageRef and the 0045 trigger refuses the snapshot.
    const brand = (t, ref) => oc.from("brand_configs").upsert({ tenant_id: t, palette: "forest-sage", atmosphere: "calm-organic", image_style: "rounded", hero_image_ref: ref }, { onConflict: "tenant_id" });
    let w = await brand(tP, audioPath);
    let pub = await oc.rpc("publish_space", { p_tenant_id: tP });
    check("O7 paid: a hero image_ref pointed at an audio object by a direct member write cannot be published (MEDIA_REF_INVALID)", !w.error && MEDIA_INVALID(pub), JSON.stringify([w.error, pub.error]));
    const snapWrite = await oc.from("published_spaces").upsert({ tenant_id: tP, product_type: "teach", name: "qa032", theme: {}, timezone: "UTC", enabled_modules: [], modules: { brand: { hero: { imageRef: audioPath.replace("/draft.mp3", "/published.mp3") } } } }, { onConflict: "tenant_id" });
    check("O8 paid: a direct owner write to published_spaces naming an audio object as an image is refused", MEDIA_INVALID(snapWrite), JSON.stringify(snapWrite.error));
    const foreign = await oc.from("published_spaces").upsert({ tenant_id: tP, product_type: "teach", name: "qa032", theme: {}, timezone: "UTC", enabled_modules: [], modules: { brand: { hero: { imageRef: `${tL}/brand/hero/${randomUUID()}/published.webp` } } } }, { onConflict: "tenant_id" });
    check("O9 paid: a snapshot imageRef naming another tenant's file is refused", MEDIA_INVALID(foreign), JSON.stringify(foreign.error));
    w = await brand(tP, imgPath);
    pub = await oc.rpc("publish_space", { p_tenant_id: tP });
    check("O10 paid: publishing a service-role image ref succeeds", !w.error && !pub.error, JSON.stringify([w.error, pub.error]));
    const del = await oc.storage.from("tenant-media").remove([audioPath]);
    check("O11 paid: a member can still delete its own objects", !del.error && (del.data ?? []).length === 1, JSON.stringify(del.error));

    r = await up(oc, v(tL, "brand", "draft.webp"), webp, "image/webp");
    check("O12 legacy: a member image upload works exactly as before", !r.error, JSON.stringify(r.error));
    w = await brand(tL, `${tL}/audioFile/${randomUUID()}/${randomUUID()}/draft.mp3`);
    pub = await oc.rpc("publish_space", { p_tenant_id: tL });
    check("O13 legacy: the database does not judge legacy image refs at publish (unchanged)", !w.error && !pub.error, JSON.stringify([w.error, pub.error]));
    r = await up(oc, v(tE, "brand", "draft.webp"), webp, "image/webp");
    check("O14 exempt: a member image upload works exactly as before", !r.error, JSON.stringify(r.error));
    const anonPred = await createClient(URL_, PUB, { auth: { persistSession: false } }).rpc("billing_media_member_write_allowed", { p_name: `${tP}/x/y/z/draft.webp`, p_command: "insert" });
    check("O15 anon cannot call the Storage predicate", !!anonPred.error);
    await admin.rpc("billing_clear_internal_exempt", { p_tenant_id: tE });
  }

  // ------------------------------------------------------------------ P. 0046 audio provenance + exempt Replace
  {
    // A length on a paid Space is authoritative only when the server measured that exact file
    // (billing_audio_verifications, written by billing_audio_attach_verified in the finalize path). Real Storage
    // objects are used for the fingerprint (synthetic bytes; recorded in created.storage). The publish-time byte
    // comparison itself is application code (lib/media/publish.ts, proven in mediaContentGuard.test.ts against the
    // real publish action); P6 proves the database side of it: a swapped draft no longer matches the recorded
    // fingerprint, and a member can neither re-stamp provenance nor create the published copy. Review fixes: P1a/P17
    // the "never enforced while holding media" invariant, P14 a planted published sibling, P15 item binding, P16 the
    // backfill folder check.
    const UNVERIFIED = (res) => !!res.error && res.error.hint === "AUDIO_UNVERIFIED";
    const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
    const upP = async (client, path, bytes) => {
      const r = await client.storage.from("tenant-media").upload(path, new Blob([bytes], { type: "audio/mpeg" }), { upsert: false, contentType: "audio/mpeg" });
      if (!r.error) created.storage.push(path);
      return r;
    };
    const measured = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0, 0xff, 0xfb, 0x90, 0x64, 1, 2, 3, 4]);
    const swapped = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0, 0xff, 0xfb, 0x90, 0x64, 9, 9, 9, 9, 9, 9, 9, 9]);
    const uP = await mkUser("up"); const pc = await userClient(uP);
    await setFlag(false);
    const ckPp = await mkCheckout(uP, "teach"); const pPp = await provision(ckPp.id, subJson(uP), "QA032 provenance paid");
    const tPP = pPp.data?.tenant_id; if (tPP) created.tenants.push(tPP);
    const ckPl = await mkCheckout(uP, "retreat"); const pPl = await provision(ckPl.id, subJson(uP), "QA032 provenance legacy");
    const tPL = pPl.data?.tenant_id; if (tPL) created.tenants.push(tPL);
    if (tPL) {
      await admin.from("space_subscriptions").delete().eq("tenant_id", tPL);
      await admin.from("space_entitlements").upsert({ tenant_id: tPL, access_type: "complimentary", access_ends_at: H(24 * 30) });
    }
    const ckPe = await mkCheckout(uP, "teach"); const pPe = await provision(ckPe.id, subJson(uP), "QA032 provenance exempt");
    const tPE = pPe.data?.tenant_id; if (tPE) created.tenants.push(tPE);
    if (tPE) {
      await admin.from("space_subscriptions").delete().eq("tenant_id", tPE);
      await admin.rpc("billing_set_internal_exempt", { p_tenant_id: tPE, p_reason: "qa032 provenance exemption", p_actor: uP });
    }
    check("P0 setup: paid, legacy and exempt Spaces exist", !!tPP && !!tPL && !!tPE, JSON.stringify([pPp.error, pPl.error, pPe.error]));

    // Invariant (0046 H): billing never starts governing a Space that already holds media. A Space that held audio
    // while billing did not govern it cannot get its paid row back.
    const paidRow = (await admin.from("space_subscriptions").select("*").eq("tenant_id", tPP).single()).data;
    await admin.from("space_subscriptions").delete().eq("tenant_id", tPP);
    const itOld = randomUUID();
    const refOld = `${tPP}/teachAudioFile/${itOld}/${randomUUID()}/draft.mp3`;
    let pRes = await pc.from("module_items").insert({ id: itOld, tenant_id: tPP, module_key: "teachAudio", title: "qa032 pre-0046", metadata: { audioRef: refOld, durationSeconds: 600 } }).select("id");
    const backRefused = await admin.from("space_subscriptions").insert(paidRow);
    check("P1a invariant: a paid row cannot be (re)inserted on a Space that already holds audio (BILLING_SPACE_HAS_MEDIA)", !pRes.error && backRefused.error?.hint === "BILLING_SPACE_HAS_MEDIA", JSON.stringify([pRes.error, backRefused.error]));
    // A "pre-0046" row: an attached file with no provenance on an enforced Space (what a paid Space's audio attached
    // before 0046 looks like). Built through the real writers: detach while legacy, the paid row back, a verified
    // attach, then its provenance row removed by the service role.
    await pc.from("module_items").update({ metadata: { audioRef: null, durationSeconds: null } }).eq("id", itOld);
    const back = await admin.from("space_subscriptions").insert(paidRow);
    const oldAttach = await admin.rpc("billing_audio_attach_verified", { p_tenant_id: tPP, p_item_id: itOld, p_metadata: { audioRef: refOld, durationSeconds: 600 }, p_size_bytes: 1, p_sha256: "0".repeat(64) });
    const oldProvDel = await admin.from("billing_audio_verifications").delete().eq("item_id", itOld);
    const pol = await admin.rpc("billing_audio_policy", { p_tenant_id: tPP });
    check("P1 setup: an unverified (no provenance) file is attached on an enforced Space", !back.error && !oldAttach.error && !oldProvDel.error && pol.data?.[0]?.mode === "enforced",
      JSON.stringify([back.error, oldAttach.error, oldProvDel.error, pol.data]));
    let pPub = await pc.rpc("publish_space", { p_tenant_id: tPP });
    check("P2 paid: publishing an unverified (browser-reported) length is refused (AUDIO_UNVERIFIED)", UNVERIFIED(pPub), JSON.stringify(pPub.error));

    // New upload: a real draft object, measured + fingerprinted "by the server" and attached through the RPC.
    const itNew = randomUUID();
    const refNew = `${tPP}/teachAudioFile/${itNew}/${randomUUID()}/draft.mp3`;
    await pc.from("module_items").insert({ id: itNew, tenant_id: tPP, module_key: "teachAudio", title: "qa032 new", metadata: { audioRef: null, durationSeconds: null } });
    const upNew = await upP(pc, refNew, measured);
    pRes = await admin.from("module_items").update({ metadata: { audioRef: refNew, durationSeconds: 30 } }).eq("id", itNew).select("id");
    check("P3 paid: a bare service-role file write without provenance is refused (AUDIO_UNVERIFIED)", !upNew.error && UNVERIFIED(pRes), JSON.stringify([upNew.error, pRes.error]));
    const fp = { p_size_bytes: measured.byteLength, p_sha256: sha(measured) };
    const memberAttach = await pc.rpc("billing_audio_attach_verified", { p_tenant_id: tPP, p_item_id: itNew, p_metadata: { audioRef: refNew, durationSeconds: 30 }, ...fp });
    const memberRead = await pc.from("billing_audio_verifications").select("item_id");
    const memberForge = await pc.from("billing_audio_verifications").insert({ item_id: itOld, tenant_id: tPP, audio_ref: refOld, duration_seconds: 600, size_bytes: 1, sha256: "e".repeat(64), source: "server" });
    check("P4 a member can neither call the finalize RPC nor read or forge provenance", !!memberAttach.error && (!!memberRead.error || (memberRead.data ?? []).length === 0) && !!memberForge.error,
      JSON.stringify([memberAttach.error, memberRead.error, memberForge.error]));
    pRes = await admin.rpc("billing_audio_attach_verified", { p_tenant_id: tPP, p_item_id: itNew, p_metadata: { audioRef: refNew, durationSeconds: 30 }, ...fp });
    const prov = (await admin.from("billing_audio_verifications").select("audio_ref, duration_seconds, size_bytes, sha256, source").eq("item_id", itNew).single()).data;
    check("P5 paid: the finalize RPC records provenance (ref, length, size, sha256, source=server) and attaches", !pRes.error && prov?.audio_ref === refNew && prov?.duration_seconds === 30 && Number(prov?.size_bytes) === measured.byteLength && prov?.sha256 === sha(measured) && prov?.source === "server",
      JSON.stringify([pRes.error, prov]));
    pPub = await pc.rpc("publish_space", { p_tenant_id: tPP });
    check("P6 paid: still refused while the unverified pre-0046 file is attached", UNVERIFIED(pPub), JSON.stringify(pPub.error));
    pRes = await pc.from("module_items").update({ metadata: { audioRef: null, durationSeconds: null } }).eq("id", itOld).select("id");
    pPub = await pc.rpc("publish_space", { p_tenant_id: tPP });
    check("P7 paid: after the unverified file is detached, publishing server-verified audio succeeds", !pRes.error && !pPub.error, JSON.stringify([pRes.error, pPub.error]));

    // Swap after measurement: the member deletes its draft (allowed) and uploads other bytes at the same path (allowed).
    const del = await pc.storage.from("tenant-media").remove([refNew]);
    const reup = await upP(pc, refNew, swapped);
    const { data: nowBlob } = await admin.storage.from("tenant-media").download(refNew);
    const nowSha = nowBlob ? sha(new Uint8Array(await nowBlob.arrayBuffer())) : null;
    const reStamp = await pc.from("billing_audio_verifications").update({ sha256: nowSha, size_bytes: swapped.byteLength }).eq("item_id", itNew).select("item_id");
    const preCopy = await upP(pc, refNew.replace("/draft.mp3", "/published.mp3"), swapped);
    const stillSha = (await admin.from("billing_audio_verifications").select("sha256").eq("item_id", itNew).single()).data?.sha256;
    check("P8 swapped draft: the bytes no longer match the recorded fingerprint (publish copy refuses), a member cannot re-stamp provenance or pre-create the published copy",
      !del.error && !reup.error && !!nowSha && nowSha !== prov?.sha256 && (!!reStamp.error || (reStamp.data ?? []).length === 0) && stillSha === sha(measured) && !!preCopy.error,
      JSON.stringify([del.error, reup.error, reStamp.error, preCopy.error]));

    // Backfill recorder (service role only): flags a mismatch, never changes the stored length.
    await admin.from("module_items").update({ title: "qa032 pre-0046 again" }).eq("id", itOld);
    const bfRun = `qa032-${runId}`;
    const memberBf = await pc.rpc("billing_audio_backfill_record", { p_run_id: bfRun, p_tenant_id: tPP, p_item_id: itNew, p_audio_ref: refNew, p_measured_seconds: 30, p_size_bytes: 1, p_sha256: "e".repeat(64), p_verdict: "ok" });
    const bf = await admin.rpc("billing_audio_backfill_record", { p_run_id: bfRun, p_tenant_id: tPP, p_item_id: itNew, p_audio_ref: refNew, p_measured_seconds: 999, p_size_bytes: swapped.byteLength, p_sha256: nowSha, p_verdict: "mismatch" });
    const afterBf = (await admin.from("module_items").select("metadata").eq("id", itNew).single()).data?.metadata;
    const { count: bfRows } = await admin.from("billing_audio_backfill_findings").select("*", { count: "exact", head: true }).eq("run_id", bfRun);
    check("P9 backfill recorder: member refused; a mismatch is flagged with an audit row and the stored length is kept", !!memberBf.error && bf.data === "flagged" && afterBf?.durationSeconds === 30 && bfRows === 1,
      JSON.stringify([memberBf.error, bf.error, bf.data, afterBf, bfRows]));

    // Published sibling planted (MEDIUM-1): a published object in the upload folder - here by the service role, the
    // only writer that can create one on a paid Space - makes a re-attach of the SAME ref refuse (AUDIO_REUPLOAD).
    const plantedPub = await upP(admin, refNew.replace("/draft.mp3", "/published.mp3"), swapped);
    const reAttach = await admin.rpc("billing_audio_attach_verified", { p_tenant_id: tPP, p_item_id: itNew, p_metadata: { audioRef: refNew, durationSeconds: 30 }, ...fp });
    check("P14 a re-attach of the same ref over an existing published sibling is refused (AUDIO_REUPLOAD)", !plantedPub.error && reAttach.error?.hint === "AUDIO_REUPLOAD", JSON.stringify([plantedPub.error, reAttach.error]));

    // Item binding (LOW-1): no writer lets one item hold another item's (verified) file.
    const itB = randomUUID();
    await pc.from("module_items").insert({ id: itB, tenant_id: tPP, module_key: "teachAudio", title: "qa032 borrower", metadata: { audioRef: null, durationSeconds: null } });
    const borrowSvc = await admin.rpc("billing_audio_attach_verified", { p_tenant_id: tPP, p_item_id: itB, p_metadata: { audioRef: refNew, durationSeconds: 30 }, ...fp });
    const borrowMember = await pc.from("module_items").update({ metadata: { audioRef: refNew, durationSeconds: 30 } }).eq("id", itB).select("id");
    check("P15 item binding: another item's file cannot be attached to an item (finalize RPC: AUDIO_UNVERIFIED; member: AUDIO_SERVER_ONLY)",
      borrowSvc.error?.hint === "AUDIO_UNVERIFIED" && borrowMember.error?.hint === "AUDIO_SERVER_ONLY", JSON.stringify([borrowSvc.error, borrowMember.error]));

    // Backfill folder check (LOW-3), on the exempt Space (members may write files there): a row whose ref lives in
    // ANOTHER item's folder is flagged, never stamped.
    const itF = randomUUID();
    const refForeign = `${tPE}/teachAudioFile/${randomUUID()}/${randomUUID()}/draft.mp3`;
    const fIns = await pc.from("module_items").insert({ id: itF, tenant_id: tPE, module_key: "teachAudio", title: "qa032 foreign folder", metadata: { audioRef: refForeign, durationSeconds: 30 } }).select("id");
    const bfF = await admin.rpc("billing_audio_backfill_record", { p_run_id: bfRun, p_tenant_id: tPE, p_item_id: itF, p_audio_ref: refForeign, p_measured_seconds: 30, p_size_bytes: measured.byteLength, p_sha256: sha(measured), p_verdict: "ok" });
    const { count: fProv } = await admin.from("billing_audio_verifications").select("*", { count: "exact", head: true }).eq("item_id", itF);
    check("P16 backfill: a ref outside the item's own folder is flagged and nothing is stamped", !fIns.error && bfF.data === "flagged" && fProv === 0, JSON.stringify([fIns.error, bfF.error, bfF.data, fProv]));

    // Invariant (0046 H) on an exemption: an exempt Space holding media cannot be flipped to a paid status.
    const flip = await admin.from("space_subscriptions").update({ status: "active" }).eq("tenant_id", tPE).select("id");
    const stillExempt = (await admin.from("space_subscriptions").select("status").eq("tenant_id", tPE).single()).data?.status;
    check("P17 invariant: an exempt Space holding media cannot be flipped to paid (BILLING_SPACE_HAS_MEDIA)", flip.error?.hint === "BILLING_SPACE_HAS_MEDIA" && stillExempt === "exempt", JSON.stringify([flip.error, stillExempt]));

    // Exempt Replace (0046).
    const exName = (await admin.from("tenants").select("name").eq("id", tPE).single()).data?.name;
    let rp = await pc.rpc("replace_space", { p_tenant_id: tPE, p_new_name: "qa032 exempt replaced" });
    const exAfter = (await admin.from("tenants").select("name").eq("id", tPE).single()).data?.name;
    check("P10 exempt: replace refused (EXEMPT_REPLACE_REQUIRES_ADMIN) and nothing was reset", rp.error?.hint === "EXEMPT_REPLACE_REQUIRES_ADMIN" && exAfter === exName, JSON.stringify(rp.error));
    await admin.rpc("billing_clear_internal_exempt", { p_tenant_id: tPE });
    rp = await pc.rpc("replace_space", { p_tenant_id: tPE, p_new_name: "qa032 exempt cleared replaced" });
    check("P11 after an Admin clears the exemption, replace works (the Space is then legacy)", !rp.error, JSON.stringify(rp.error));
    rp = await pc.rpc("replace_space", { p_tenant_id: tPL, p_new_name: "qa032 legacy replaced" });
    check("P12 legacy: replace still works (unchanged)", !rp.error, JSON.stringify(rp.error));
    rp = await pc.rpc("replace_space", { p_tenant_id: tPP, p_new_name: "qa032 paid replaced" });
    const { count: provLeft } = await admin.from("billing_audio_verifications").select("*", { count: "exact", head: true }).eq("tenant_id", tPP);
    check("P13 paid: replace still works (unchanged) and removes the Space's provenance rows with its items", !rp.error && provLeft === 0, JSON.stringify([rp.error, provLeft]));
  }
  await setFlag(flagWasEnabled);
}

try {
  await main();
} catch (e) {
  check("script completed without an unexpected error", false, e.stack || e.message);
} finally {
  await cleanup();
}
if (residue.length) check("cleanup left no residue carrying this run's id", false, residue.join("; "));
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} passed`);
if (bad.length) { console.log("FAILED:\n" + bad.map((b) => " - " + b.name + (b.detail ? "  -> " + b.detail : "")).join("\n")); process.exit(1); }
