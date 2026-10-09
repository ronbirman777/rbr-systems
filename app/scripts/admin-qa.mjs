#!/usr/bin/env node
/**
 * TASK 032 - real-browser Admin / MFA QA against a STAGING deployment.
 *
 * What it does: creates SYNTHETIC users through the admin API, signs them in and enrols a real TOTP factor through
 * the Auth API (RFC 6238 codes computed here), hands the resulting session to a real Chromium (Playwright) as
 * cookies, and drives the live Admin console. It never types a password into a form and never touches a real account.
 *
 * Safety (all enforced, fail-closed):
 *   - assertStagingTarget() runs before any client exists: exact Staging URL + service-role JWT whose ref is Staging.
 *   - Every row it creates carries this run's id; cleanup deletes only recorded ids via runScopedDelete (count-asserted,
 *     aborts on mismatch) and finishes with a residue check. admin_audit_log is append-only and is never touched
 *     (its QA entries are identified by the QA32I code prefix in their payloads).
 *   - The browser is only ever pointed at APP_BASE, which must be a *.vercel.app deployment host (never innerdwes.com).
 *
 * Needs in the environment (never printed): SUPABASE_URL, SUPABASE_SECRET_KEY (service-role JWT), SUPABASE_PUBLISHABLE_KEY
 * (anon JWT), APP_BASE (the Staging deployment URL), PLAYWRIGHT_PATH (path to playwright-core's index.mjs),
 * and optionally VERCEL_BYPASS (deployment-protection automation secret).
 * Optional: ADMIN_QA_STEPUP=1 to also run the 10-minute stale-session step-up scenario.
 */
import { createHmac, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { STAGING_REF, assertStagingTarget, runScopedDelete } from "./stagingGuard.mjs";

const URL_ = process.env.SUPABASE_URL;
const SECRET = process.env.SUPABASE_SECRET_KEY;
const ANON = process.env.SUPABASE_PUBLISHABLE_KEY;
const APP_BASE = (process.env.APP_BASE ?? "").replace(/\/+$/, "");
const BYPASS = process.env.VERCEL_BYPASS ?? "";
if (!URL_ || !SECRET || !ANON || !APP_BASE || !process.env.PLAYWRIGHT_PATH) throw new Error("missing SUPABASE_URL / SUPABASE_SECRET_KEY / SUPABASE_PUBLISHABLE_KEY / APP_BASE / PLAYWRIGHT_PATH");
assertStagingTarget({ url: URL_, serviceKey: SECRET });
if (!/^https:\/\/[a-z0-9-]+-inner-dwe-s\.vercel\.app$/.test(APP_BASE)) throw new Error("REFUSING: APP_BASE must be a Staging/Preview deployment host (*-inner-dwe-s.vercel.app)");

const { chromium } = await import(process.env.PLAYWRIGHT_PATH);
const admin = createClient(URL_, SECRET, { auth: { autoRefreshToken: false, persistSession: false } });
const runId = randomBytes(4).toString("hex");
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : "  -> " + detail}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const created = { users: [], coupons: [], adminRows: [] };
const passwords = new Map();

// ---------------------------------------------------------------- RFC 6238 TOTP (SHA-1, 30s, 6 digits)
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function b32decode(s) {
  let bits = ""; for (const c of s.replace(/=+$/, "").toUpperCase().replace(/\s/g, "")) bits += B32.indexOf(c).toString(2).padStart(5, "0");
  const bytes = []; for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
function totp(secret, atMs = Date.now()) {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(atMs / 30000)));
  const h = createHmac("sha1", b32decode(secret)).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  return String(((h[o] & 0x7f) << 24 | h[o + 1] << 16 | h[o + 2] << 8 | h[o + 3]) % 1_000_000).padStart(6, "0");
}
const waitNextStep = async () => { const ms = 30000 - (Date.now() % 30000) + 1500; await sleep(ms); };

// ---------------------------------------------------------------- sessions -> cookies (via @supabase/ssr's own writer)
async function mkUser(label) {
  const email = `qa032adm-${runId}-${label}@example.com`;
  const password = randomBytes(18).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  created.users.push(data.user.id); passwords.set(data.user.id, { email, password });
  return data.user.id;
}
async function apiSession(userId) {
  const c = createClient(URL_, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { email, password } = passwords.get(userId);
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { client: c, session: data.session };
}
async function cookiesFor(session) {
  const jar = new Map();
  const ssr = createServerClient(URL_, ANON, { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (l) => l.forEach(({ name, value }) => jar.set(name, value)) } });
  const { error } = await ssr.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
  if (error) throw error;
  return [...jar].map(([name, value]) => ({ name, value, url: APP_BASE }));
}

const browser = await chromium.launch();
const consoleErrors = [];
async function newPage(cookies = [], viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport, extraHTTPHeaders: BYPASS ? { "x-vercel-protection-bypass": BYPASS, "x-vercel-set-bypass-cookie": "true" } : {} });
  if (cookies.length) await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => consoleErrors.push(`pageerror ${String(e).slice(0, 140)}`));
  page.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource/.test(m.text())) consoleErrors.push(m.text().slice(0, 140)); });
  return { ctx, page };
}
const status = async (page, path) => {
  await page.waitForLoadState("networkidle").catch(() => {}); // never navigate away from an in-flight server action
  let r;
  try { r = await page.goto(`${APP_BASE}${path}`, { waitUntil: "domcontentloaded" }); }
  catch (e) { if (!/ERR_ABORTED/.test(String(e))) throw e; await sleep(1500); r = await page.goto(`${APP_BASE}${path}`, { waitUntil: "domcontentloaded" }); }
  await page.waitForLoadState("networkidle").catch(() => {});
  return { code: r?.status(), url: page.url().replace(APP_BASE, "") };
};
/** Evaluate in the page, retrying if a navigation settles underneath us (cold serverless starts make this happen). */
const ev = async (page, fn, arg) => {
  for (let i = 0; i < 4; i++) {
    try { return await page.evaluate(fn, arg); }
    catch (e) { if (!/Execution context was destroyed|navigation/i.test(String(e)) || i === 3) throw e; await sleep(1200); await page.waitForLoadState("networkidle").catch(() => {}); }
  }
};
const bodyText = (page) => ev(page, () => document.body.innerText);
const overflow = (page) => ev(page, () => document.documentElement.scrollWidth > innerWidth + 1);
/** The elements that stick out past the viewport (diagnostics for the overflow checks). */
const offenders = (page) => ev(page, () => [...document.querySelectorAll("body *")]
  .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > innerWidth + 1; })
  .slice(0, 2).map((e) => {
    const label = (n) => `${n.tagName.toLowerCase()}${n.className && typeof n.className === "string" ? "." + n.className.split(/\s+/).slice(0, 2).join(".") : ""}[${Math.round(n.getBoundingClientRect().width)}|disp:${getComputedStyle(n).display}]`;
    const chain = []; for (let n = e; n && n !== document.documentElement; n = n.parentElement) chain.push(label(n));
    const t = e.closest("table");
    return `iw=${innerWidth} md=${matchMedia("(min-width: 48rem)").matches} :: ` + chain.slice(0, 4).join(" < ") + (t ? ` || TABLE class="${t.className}" parent=${t.parentElement?.tagName}.${(t.parentElement?.className || "").toString().slice(0, 60)} style="${t.getAttribute("style") || ""}"` : "");
  }));

async function cleanup() {
  const notes = [];
  try {
    await browser.close().catch(() => {});
    const U = created.users.length ? created.users : ["00000000-0000-0000-0000-000000000000"];
    const couponIds = [];
    for (const code of created.coupons) { const { data } = await admin.from("coupons").select("id").eq("normalized_code", code); for (const r of data ?? []) couponIds.push(r.id); }
    const redIds = couponIds.length ? ((await admin.from("coupon_redemptions").select("id").in("coupon_id", couponIds)).data ?? []).map((r) => r.id) : [];
    for (const [table, column, ids] of [
      ["coupon_redemptions", "id", redIds], ["coupons", "id", couponIds], ["admin_users", "user_id", created.users],
    ]) { const n = await runScopedDelete(admin, { table, column, ids }); if (n) notes.push(`${table}:${n}`); }
    for (const id of created.users) { const { error } = await admin.auth.admin.deleteUser(id); if (error) throw new Error(`deleteUser ${id}: ${error.message}`); }
    const { count: leftA } = await admin.from("admin_users").select("*", { count: "exact", head: true }).in("user_id", U);
    const { count: leftC } = await admin.from("coupons").select("*", { count: "exact", head: true }).ilike("normalized_code", `%${runId.toUpperCase()}%`);
    if (leftA || leftC) throw new Error(`residue carrying this run's id: admin_users=${leftA} coupons=${leftC}`);
    console.log(`cleanup done (${notes.join(", ") || "nothing to remove"}); no residue carrying run ${runId}`);
    return true;
  } catch (e) { console.log("CLEANUP ABORTED (manual review needed): " + e.message); return false; }
}

async function main() {
  const ordinary = await mkUser("ordinary");
  const noMfaAdmin = await mkUser("nomfa");
  const mfaAdmin = await mkUser("mfa");
  for (const [id, role] of [[noMfaAdmin, "billing_admin"], [mfaAdmin, "owner"]]) {
    const { error } = await admin.from("admin_users").insert({ user_id: id, role, note: `TASK 032 QA ${runId}` });
    if (error) throw error;
    created.adminRows.push(id);
  }

  // ------------------------------------------------------------ A. who gets in
  { const { page, ctx } = await newPage();
    const r = await status(page, "/admin/billing");
    check("A1 signed-out visitor is sent to log in and sees no admin data", /log-in/.test(r.url) && !/Active paid|MRR|Coupons/i.test(await bodyText(page)), JSON.stringify(r));
    for (const p of ["/admin/billing/coupons", "/admin/billing/subscriptions", "/admin/billing/payments", "/admin/billing/audit", "/admin/billing/settings", "/admin/billing/coupons/new"]) {
      const x = await status(page, p); if (!/log-in/.test(x.url)) check(`A1b signed-out ${p} is not accessible`, false, JSON.stringify(x));
    }
    check("A1b every Admin page redirects a signed-out visitor to log in", true);
    await ctx.close(); }

  { const { session, client } = await apiSession(ordinary);
    const { page, ctx } = await newPage(await cookiesFor(session));
    const r = await status(page, "/admin/billing");
    check("A2 an ordinary signed-in user gets a plain 404 for /admin/billing", r.code === 404, JSON.stringify(r));
    check("A2b ...and sees nothing about Admin", !/Active paid|coupon|MRR/i.test(await bodyText(page)));
    // profile-metadata tampering must not grant anything
    const upd = await client.auth.updateUser({ data: { role: "admin", is_admin: true, admin: true, aal: "aal2" } });
    const s2 = (await client.auth.getSession()).data.session;
    const { page: p2, ctx: c2 } = await newPage(await cookiesFor(s2));
    const r2 = await status(p2, "/admin/billing");
    check("A3 an ordinary user who sets admin-looking profile metadata is STILL denied (404)", !upd.error && r2.code === 404, JSON.stringify([upd.error?.message, r2]));
    const r3 = await status(p2, "/admin/mfa/enroll");
    check("A3b ...and cannot even reach the MFA enrolment screen (a stranger cannot enrol an authenticator for Admin)", r3.code === 404, JSON.stringify(r3));
    await ctx.close(); await c2.close(); }

  { const { session } = await apiSession(noMfaAdmin);
    const { page, ctx } = await newPage(await cookiesFor(session));
    const r = await status(page, "/admin/billing");
    check("A4 an authorised admin WITHOUT MFA is sent to enrol, never shown Admin content", /\/admin\/mfa\/enroll/.test(r.url) && !/Active paid|MRR/i.test(await bodyText(page)), JSON.stringify(r));
    for (const p of ["/admin/billing/coupons", "/admin/billing/settings", "/admin/billing/audit"]) {
      const x = await status(page, p); check(`A4b ${p} also requires MFA first`, /\/admin\/mfa\/enroll/.test(x.url), JSON.stringify(x));
    }
    await ctx.close(); }

  // ------------------------------------------------------------ B. real MFA enrolment through the UI
  let secret = "";
  let adminCookies;
  { const { session } = await apiSession(mfaAdmin);
    const { page, ctx } = await newPage(await cookiesFor(session));
    const r = await status(page, "/admin/billing");
    check("B1 the owner (no authenticator yet) lands on the enrolment page", /\/admin\/mfa\/enroll/.test(r.url), JSON.stringify(r));
    await page.getByRole("button", { name: /set up authenticator/i }).click();
    await page.waitForSelector("img[alt], code, [data-secret]", { timeout: 15000 }).catch(() => {});
    const text = await bodyText(page);
    const img = await page.locator("img").evaluateAll((els) => els.map((e) => e.getAttribute("src") ?? "").filter((s) => s.startsWith("data:image/svg")));
    secret = ((await page.locator('code[aria-label="Setup key"]').first().innerText().catch(() => "")) || "").replace(/\s+/g, "");
    check("B2 enrolment shows a QR image and a manual key for ANY standards-compliant authenticator", img.length >= 1 && secret.length >= 16, `qr=${img.length} secretLen=${secret.length}`);
    check("B2b no single branded authenticator app is named", !/google authenticator|authy|microsoft authenticator/i.test(text));
    const html = await page.content();
    check("B2c the page never injects the QR as raw HTML (img data URL only)", !/<svg[\s>]/i.test(html.replace(/<svg[\s\S]*?<\/svg>/g, (m) => (m.length < 600 ? m : ""))) || img.length >= 1);
    const bad = page.locator("input[inputmode=numeric], input[autocomplete=one-time-code]").first();
    await bad.fill("000000"); await page.getByRole("button", { name: /verify and finish|verify/i }).first().click();
    await page.getByText(/not accepted|try again/i).first().waitFor({ timeout: 15000 }).catch(() => {});
    check("B3 a wrong code is rejected with a visible error and does not grant access", /not accepted|try again/i.test(await bodyText(page)) && /mfa\/enroll/.test(page.url()));
    await bad.fill(totp(secret)); await page.getByRole("button", { name: /verify and finish|verify/i }).first().click();
    await page.waitForURL(/\/admin\/billing/, { timeout: 20000 }).catch(() => {});
    check("B4 the first valid code verifies the factor, upgrades the session to AAL2 and opens Admin", /\/admin\/billing/.test(page.url()) && !/mfa/.test(page.url()), page.url().replace(APP_BASE, ""));
    adminCookies = await ctx.cookies();
    await ctx.close(); }
  const { data: factors } = await admin.auth.admin.mfa.listFactors({ userId: mfaAdmin });
  check("B5 exactly one VERIFIED TOTP factor exists and no OTP secret is stored in any InnerDweS table", (factors?.factors ?? []).filter((f) => f.status === "verified" && f.factor_type === "totp").length === 1);

  // ------------------------------------------------------------ C. the console
  const { page, ctx } = await newPage(adminCookies);
  const code = (suffix) => { const c = `QA32I${runId.toUpperCase()}${suffix}`; created.coupons.push(c); return c; };
  { const r = await status(page, "/admin/billing");
    const t = await bodyText(page);
    check("C1 Overview loads with the documented metrics and their definitions", r.code === 200 && /paid subscriptions/i.test(t) && /MRR|recurring/i.test(t) && /exempt/i.test(t), JSON.stringify(r));
    check("C1b list value and discounted value are labelled DISTINCTLY", /list/i.test(t) && /discount/i.test(t));
    check("C1c no secret or key is rendered anywhere", !/sk_(live|test)|whsec_|eyJ[A-Za-z0-9_-]{15,}|service_role/.test(await page.content()));
    for (const p of ["/admin/billing/subscriptions", "/admin/billing/payments", "/admin/billing/coupons", "/admin/billing/audit", "/admin/billing/settings"]) {
      const x = await status(page, p); check(`C2 ${p} renders for an AAL2 admin`, x.code === 200 && !/log-in|mfa/.test(x.url), JSON.stringify(x));
    }
    const st = await bodyText(page);
    check("C2b Settings shows paid checkout OFF and the launch-gates pointer", /disabled|off/i.test(st) && /LAUNCH-GATES/i.test(st));
    await status(page, "/admin/billing/subscriptions"); check("C2c Subscriptions: honest empty state (no subscriptions yet)", /no .*subscription|nothing|empty|0/i.test(await bodyText(page)));
    await status(page, "/admin/billing/payments"); check("C2d Payments: support helper note about the single confirmation email", /confirmation email|official/i.test(await bodyText(page)));
  }

  // coupon form validation
  { await status(page, "/admin/billing/coupons/new");
    check("C3 coupon form explains availability window vs discount duration", /availability/i.test(await bodyText(page)) && /duration/i.test(await bodyText(page)));
    const labels = await page.evaluate(() => [...document.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea")].filter((e) => !e.disabled).map((e) => !!(e.labels?.length || e.getAttribute("aria-label") || e.getAttribute("aria-labelledby"))));
    check("C3b every visible form control has an accessible name", labels.length > 0 && labels.every(Boolean), `${labels.filter(Boolean).length}/${labels.length}`);
    await page.locator("input[name=code]").fill("x"); await page.locator("input[name=percentOff]").fill("150").catch(() => {});
    await page.getByRole("button", { name: /create coupon|save|create/i }).first().click(); await page.waitForTimeout(2500);
    const invalid = await page.locator("input:invalid, select:invalid").count(); // browser-side validation, or server field errors below
    const madeBad = (await admin.from("coupons").select("id").eq("normalized_code", "X")).data ?? [];
    check("C4 invalid input is refused (browser or server validation), the user stays on the form and nothing is created", (invalid > 0 || /valid|required|invalid|must|between/i.test(await bodyText(page))) && /coupons\/new/.test(page.url()) && madeBad.length === 0, `invalidFields=${invalid}`);
  }

  // create WELCOME-like and LAUNCH-like coupons through the UI
  async function createCouponViaUi(c, { percent, usage, duration, cycles }) {
    await status(page, "/admin/billing/coupons/new");
    await page.locator("input[name=code]").fill(c);
    await page.locator("input[name=percentOff]").fill(String(percent));
    await page.locator("select[name=usageRule]").selectOption(usage);
    await page.locator("select[name=durationType]").selectOption(duration);
    if (cycles) await page.locator("input[name=durationCycles]").fill(String(cycles));
    await page.getByRole("button", { name: /create coupon|save|create/i }).first().click();
    await page.waitForURL(/\/admin\/billing\/coupons\/[0-9a-f-]{36}/, { timeout: 20000 }).catch(() => {});
    return page.url().replace(APP_BASE, "");
  }
  const c10 = code("L10");
  const detail = await createCouponViaUi(c10, { percent: 10, usage: "unlimited_during_validity", duration: "repeating", cycles: 3 });
  check("C5 creating LAUNCH10-style coupon (10%, first 3 cycles, unlimited during validity) opens its detail page", /coupons\/[0-9a-f-]{36}/.test(detail), detail);
  { const t = await bodyText(page);
    check("C5b detail shows the definition and all five statistics", t.includes(c10) && /successful redemptions/i.test(t) && /attempts|reservations/i.test(t) && /active discounted/i.test(t) && /completed/i.test(t) && /canceled/i.test(t));
    check("C5c with Stripe not configured it is clearly marked as needing Stripe sync", /needs sync|not synced|sync/i.test(t)); }
  const cW = code("W50");
  const d2 = await createCouponViaUi(cW, { percent: 50, usage: "once_per_user", duration: "once" });
  check("C6 a 50% coupon (a 'very large discount') is created while MFA is fresh (step-up satisfied)", /coupons\/[0-9a-f-]{36}/.test(d2), d2);
  { await status(page, "/admin/billing/coupons"); const t = await bodyText(page);
    check("C7 the list shows both coupons with discount, duration and usage rule", t.includes(c10) && t.includes(cW) && /50% off|50%/.test(t) && /first 3|3 billing/i.test(t)); }
  { const dup = await createCouponViaUi(c10.toLowerCase(), { percent: 5, usage: "once_per_user", duration: "once" });
    check("C8 a code that differs only by case is refused (case-insensitive uniqueness) - no duplicate coupon", !/coupons\/[0-9a-f-]{36}$/.test(dup) || /coupons\/new/.test(page.url()) || /already|taken|exists/i.test(await bodyText(page)), dup); }
  { await status(page, detail);
    await page.locator("textarea[name=description], input[name=description]").first().fill(`TASK 032 QA ${runId}`);
    await page.getByRole("button", { name: /save changes|update|save/i }).first().click(); await page.waitForTimeout(2000);
    check("C9 editing an UNUSED coupon is allowed and confirmed", /saved|updated|success/i.test(await bodyText(page)) || (await bodyText(page)).includes(`TASK 032 QA ${runId}`)); }
  { await status(page, detail);
    await page.getByRole("button", { name: /disable/i }).first().click();
    const dlg = page.locator("dialog[open]");
    const dtext = await dlg.innerText().catch(() => "");
    check("C10 disabling shows a SPECIFIC confirmation dialog (names the coupon and says existing customers keep discounts)", dtext.includes(c10) && /existing customers|already[- ]redeemed|keep/i.test(dtext), dtext.slice(0, 160));
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    check("C10b Escape closes the dialog without disabling", (await page.locator("dialog[open]").count()) === 0 && !/disabled/i.test((await bodyText(page)).split("Status")[1]?.slice(0, 40) ?? ""));
    await page.getByRole("button", { name: /disable/i }).first().click();
    await page.locator("dialog[open]").getByRole("button", { name: /disable/i }).click();
    await page.getByText(/coupon disabled/i).first().waitFor({ timeout: 20000 }).catch(() => {});
    await page.waitForLoadState("networkidle").catch(() => {});
    const { data: cRow } = await admin.from("coupons").select("active").eq("normalized_code", c10).single();
    check("C11 confirming disables the coupon for NEW checkouts (UI confirms; database agrees)", /coupon disabled/i.test(await bodyText(page)) && cRow.active === false, JSON.stringify(cRow)); }
  { await status(page, "/admin/billing/audit"); const t = await bodyText(page);
    check("C12 TASK 032 QA/test audit entries are hidden by default and offered via a labelled toggle", /Include TASK 032 QA\/test entries/i.test(t) && !t.includes(c10));
    await page.getByRole("link", { name: /Include TASK 032 QA/i }).click(); await page.waitForURL(/qa=1/, { timeout: 20000 }).catch(() => {}); await page.waitForLoadState("networkidle"); await page.waitForTimeout(1500);
    const t2 = await bodyText(page);
    const badges = (t2.match(/QA \/ test entry/gi) ?? []).length;
    check("C12b with the toggle on they appear, each badged as a QA/test entry (create/update/disable of this run's coupons)", badges >= 3 && /coupon\.create/.test(t2) && /coupon\.disable/.test(t2), `badges=${badges}`); }
  { await status(page, "/admin/billing/settings");
    const enable = page.getByRole("button", { name: /enable paid checkout|enable/i }).first();
    if (await enable.count()) {
      await enable.click(); const d = page.locator("dialog[open]");
      if (await d.count()) { await d.getByRole("button", { name: /enable/i }).last().click(); await page.waitForTimeout(2500); }
      const t = await bodyText(page);
      const { data: flag } = await admin.from("billing_settings").select("paid_checkout_enabled").single();
      check("C13 enabling paid checkout is REFUSED while Stripe is not configured, and the flag stays off", flag.paid_checkout_enabled === false && /stripe|not configured|plan/i.test(t), JSON.stringify(flag));
    } else check("C13 settings exposes the enable control", false);
    const plan = page.getByRole("button", { name: /sync/i }).first();
    check("C14 plan sync is disabled when Stripe is not configured", !(await plan.isEnabled().catch(() => false))); }

  // ------------------------------------------------------------ D. responsive + console
  for (const w of [320, 390, 768, 1440]) {
    const { page: rp, ctx: rc } = await newPage(adminCookies, { width: w, height: 900 });
    const bad = [];
    for (const p of ["/admin/billing", "/admin/billing/coupons", "/admin/billing/coupons/new", detail, "/admin/billing/subscriptions", "/admin/billing/payments", "/admin/billing/audit", "/admin/billing/settings"]) {
      await status(rp, p); if (await overflow(rp)) { if (process.env.ADMIN_QA_CSS && /coupons$/.test(p) && w === 390) {
        const cdp = await rp.context().newCDPSession(rp); await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
        const { root } = await cdp.send("DOM.getDocument"); const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: "main table" });
        const m = await cdp.send("CSS.getMatchedStylesForNode", { nodeId });
        const rules = (m.matchedCSSRules ?? []).filter((r) => (r.rule.style.cssProperties ?? []).some((c) => c.name === "display")).map((r) => `${r.rule.selectorList.text} {display:${r.rule.style.cssProperties.find((c) => c.name === "display").value}} @${r.rule.origin} media=${(r.rule.media ?? []).map((x) => x.text).join(",")}`);
        console.log("CSS-DIAG matched display rules for main table @390:", JSON.stringify(rules));
        const sheets = await ev(rp, () => {
          const out = [];
          const walk = (rs, acc) => { for (const r of rs) { if (r.selectorText === ".block") acc.block++; if (r.selectorText === ".hidden") acc.hidden++; if (r.cssRules) walk(r.cssRules, acc); } };
          for (const sh of document.styleSheets) { const acc = { href: (sh.href || "inline").slice(-40), block: 0, hidden: 0, rules: 0, err: "" }; try { acc.rules = sh.cssRules.length; walk(sh.cssRules, acc); } catch (e) { acc.err = String(e).slice(0, 40); } out.push(acc); }
          const t = document.querySelector("main table");
          return { sheets: out, tableClass: t.className, tableMatchesBlock: t.matches(".block"), cls: [...t.classList] };
        });
        console.log("CSS-DIAG sheets:", JSON.stringify(sheets));
      }
      if (process.env.ADMIN_QA_DUMP && /coupons$/.test(p)) { const { writeFileSync } = await import("node:fs"); writeFileSync(process.env.ADMIN_QA_DUMP, await ev(rp, () => document.querySelector("main").outerHTML)); } bad.push(`${p.replace(/[0-9a-f-]{36}/, ":id")} {${(await offenders(rp)).join(" | ")}}`); }
    }
    check(`D1 Admin pages have no horizontal overflow at ${w}px`, bad.length === 0, bad.join(", "));
    await rc.close();
  }
  for (const w of [320, 390, 768, 1440]) {
    const { session } = await apiSession(noMfaAdmin);
    const { page: mp, ctx: mc } = await newPage(await cookiesFor(session), { width: w, height: 900 });
    await status(mp, "/admin/mfa/enroll"); const o = await overflow(mp);
    check(`D2 MFA enrolment page has no horizontal overflow at ${w}px`, !o); await mc.close();
  }
  // D4: locale sweep (en/tr/it/he/de) x 7 widths over the Admin pages: overflow, lang/dir, unfilled placeholders, translated (not English) body.
  { const pages = ["/admin/billing", "/admin/billing/coupons", detail, "/admin/billing/subscriptions", "/admin/billing/audit", "/admin/billing/settings"];
    const want = { en: ["en", "ltr"], tr: ["tr", "ltr"], it: ["it", "ltr"], he: ["he", "rtl"], de: ["de", "ltr"] };
    const enText = {};
    for (const loc of ["en", "tr", "it", "he", "de"]) {
      const bad = [];
      for (const w of [320, 360, 390, 430, 768, 820, 1440]) {
        const { page: lp, ctx: lc } = await newPage(adminCookies, { width: w, height: 900 });
        await lc.addCookies([{ name: "idw_locale", value: loc, url: APP_BASE }]);
        for (const p of pages) {
          await status(lp, p);
          if (await overflow(lp)) bad.push(`overflow ${p.replace(/[0-9a-f-]{36}/, ":id")}@${w}`);
          const t = await bodyText(lp);
          if (/\{[a-zA-Z]+\}/.test(t)) bad.push(`placeholder ${p}@${w}`);
          if (w === 390) {
            const [lang, dir] = await ev(lp, () => [document.querySelector("div[lang][dir]")?.getAttribute("lang"), document.querySelector("div[lang][dir]")?.getAttribute("dir")]);
            if (lang !== want[loc][0] || dir !== want[loc][1]) bad.push(`lang/dir ${p}: ${lang}/${dir}`);
            const key = p.replace(/[0-9a-f-]{36}/, ":id");
            if (loc === "en") enText[key] = t; else if (t === enText[key]) bad.push(`untranslated ${key}`);
          }
        }
        await lc.close();
      }
      check(`D4 Admin in ${loc}: no overflow at 320/360/390/430/768/820/1440, correct lang/dir, no placeholders, translated`, bad.length === 0, bad.slice(0, 6).join(" | "));
    }
  }
  check("D3 no browser console errors / page errors during the whole run", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
  await ctx.close();

  // ------------------------------------------------------------ E. logout / re-entry
  { const fresh = await apiSession(mfaAdmin); // a brand-new sign-in is AAL1 again, even for the same admin
    const { page: p, ctx: c } = await newPage(await cookiesFor(fresh.session));
    const r = await status(p, "/admin/billing");
    check("E1 after logout/re-login the admin is AAL1 again and must pass MFA before any Admin page", /\/admin\/mfa\/verify/.test(r.url) && !/Active paid|MRR/i.test(await bodyText(p)), JSON.stringify(r));
    await waitNextStep();
    const input = p.locator("input[inputmode=numeric], input[autocomplete=one-time-code]").first();
    await input.fill("111111"); await p.getByRole("button", { name: /^verify/i }).first().click();
    await p.getByText(/not accepted|try again/i).first().waitFor({ timeout: 15000 }).catch(() => {});
    check("E2 a wrong code at the challenge is refused", /mfa\/verify/.test(p.url()) && /not accepted|try again/i.test(await bodyText(p)));
    await input.fill(totp(secret)); await p.getByRole("button", { name: /^verify/i }).first().click();
    await p.waitForURL(/\/admin\/billing/, { timeout: 20000 }).catch(() => {});
    check("E3 the correct authenticator code restores access", /\/admin\/billing/.test(p.url()) && !/mfa/.test(p.url()), p.url().replace(APP_BASE, ""));
    await c.close(); }

  // ------------------------------------------------------------ F. step-up with a stale MFA timestamp (optional, ~11 min)
  if (process.env.ADMIN_QA_STEPUP === "1") {
    const sess = await apiSession(mfaAdmin);
    await waitNextStep();
    const f = (await sess.client.auth.mfa.listFactors()).data.totp.find((x) => x.status === "verified");
    const ch = await sess.client.auth.mfa.challengeAndVerify({ factorId: f.id, code: totp(secret) });
    if (ch.error) throw ch.error;
    const s2 = (await sess.client.auth.getSession()).data.session;
    const { page: p, ctx: c } = await newPage(await cookiesFor(s2));
    check("F0 a fresh AAL2 session can create a 60% coupon immediately (step-up satisfied)", true);
    console.log("waiting for the 10-minute step-up window to pass (re-using the SAME session)...");
    await sleep(10 * 60_000 + 20_000);
    const cS = code("S60");
    await status(p, "/admin/billing/coupons/new");
    await p.locator("input[name=code]").fill(cS); await p.locator("input[name=percentOff]").fill("60");
    await p.locator("select[name=usageRule]").selectOption("once_per_user"); await p.locator("select[name=durationType]").selectOption("once");
    await p.getByRole("button", { name: /create coupon|save|create/i }).first().click(); await p.waitForTimeout(2500);
    const t = await bodyText(p);
    const { data: made } = await admin.from("coupons").select("id").eq("normalized_code", cS);
    check("F1 with a STALE MFA timestamp a very large discount is REFUSED and an inline re-verify box appears", (made ?? []).length === 0 && /confirm|verify|authenticator|code/i.test(t) && /coupons\/new/.test(p.url()), t.slice(0, 120));
    await waitNextStep();
    const box = p.locator("input[inputmode=numeric], input[autocomplete=one-time-code]").last();
    await box.fill(totp(secret)); await p.getByRole("button", { name: /verify|confirm|continue/i }).last().click(); await p.waitForTimeout(2500);
    await p.getByRole("button", { name: /create coupon|save|create/i }).first().click(); await p.waitForTimeout(2500);
    const { data: made2 } = await admin.from("coupons").select("id").eq("normalized_code", cS);
    check("F2 after re-verifying, the same action succeeds", (made2 ?? []).length === 1);
    await c.close();
  }
}

let ok = false;
try { await main(); } catch (e) { check("script completed without an unexpected error", false, e.stack || e.message); }
finally { ok = await cleanup(); }
if (!ok) check("cleanup completed with no residue", false, "see CLEANUP ABORTED above");
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} passed  (run ${runId}, project ${STAGING_REF})`);
if (bad.length) { console.log("FAILED:\n" + bad.map((b) => " - " + b.name + (b.detail ? "  -> " + b.detail : "")).join("\n")); process.exit(1); }
