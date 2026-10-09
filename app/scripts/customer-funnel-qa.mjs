#!/usr/bin/env node
/**
 * TASK 032 - real-browser QA of the CUSTOMER billing funnel (browser phase). Seed/cleanup live in
 * customer-funnel-qa.int.test.ts, which writes the manifest this script reads.
 *
 * What it does: serves nothing itself. It drives a real Chromium (Playwright) against a LOCAL `next start` build that is
 * wired to the Staging Supabase project with a FAKE Stripe key (Stripe is never contacted - the server is started with a
 * preload that refuses *.stripe.com). Sessions for the synthetic users are minted from admin magic-link tokens and handed
 * to the browser as cookies; no password is typed anywhere and no account is created through the UI.
 *
 * Safety: assertStagingTarget() before any client; READ-ONLY toward the database (the only writes are the app's own
 * server actions on the synthetic users - pending checkouts / coupon reservations - which cleanup removes by user id);
 * APP_BASE must be http://localhost or http://127.0.0.1 (never a real host).
 *
 * Env (never printed): SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_PUBLISHABLE_KEY, APP_BASE, PLAYWRIGHT_PATH,
 * FUNNEL_QA_MANIFEST, optional FUNNEL_QA_OUT (results dir), FUNNEL_QA_LOCALES / FUNNEL_QA_WIDTHS (comma lists to narrow).
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { assertStagingTarget } from "./stagingGuard.mjs";

const URL_ = process.env.SUPABASE_URL;
const SECRET = process.env.SUPABASE_SECRET_KEY;
const ANON = process.env.SUPABASE_PUBLISHABLE_KEY;
const APP_BASE = (process.env.APP_BASE ?? "").replace(/\/+$/, "");
const OUT = process.env.FUNNEL_QA_OUT ?? "./funnel-qa-out";
if (!URL_ || !SECRET || !ANON || !APP_BASE || !process.env.PLAYWRIGHT_PATH || !process.env.FUNNEL_QA_MANIFEST) throw new Error("missing SUPABASE_URL / SUPABASE_SECRET_KEY / SUPABASE_PUBLISHABLE_KEY / APP_BASE / PLAYWRIGHT_PATH / FUNNEL_QA_MANIFEST");
assertStagingTarget({ url: URL_, serviceKey: SECRET });
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(APP_BASE)) throw new Error("REFUSING: APP_BASE must be a local server (http://localhost:<port>)");

const M = JSON.parse(readFileSync(process.env.FUNNEL_QA_MANIFEST, "utf8"));
const { chromium } = await import(process.env.PLAYWRIGHT_PATH);
const admin = createClient(URL_, SECRET, { auth: { autoRefreshToken: false, persistSession: false } });
mkdirSync(OUT, { recursive: true });
mkdirSync(`${OUT}/shots`, { recursive: true });

const LOCALES = (process.env.FUNNEL_QA_LOCALES ?? "en,tr,it,he,de").split(",");
const WIDTHS = (process.env.FUNNEL_QA_WIDTHS ?? "320,360,390,430,768,820,1440").split(",").map(Number);
const SHOT_WIDTHS = new Set([320, 390, 1440]);
const RTL = new Set(["he"]);
const wantDirOf = (l) => (RTL.has(l) ? "rtl" : "ltr");

// ------------------------------------------------------------------ dictionaries + Intl (the oracle for "correct text")
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const DICT = {};
for (const l of ["en", ...LOCALES.filter((x) => x !== "en")]) DICT[l] = (await import(`../src/lib/i18n/dictionaries/billing.${l}.ts`))[`billing${cap(l)}`];
const interp = (s, v = {}) => s.replace(/\{(\w+)\}/g, (m, n) => (n in v ? String(v[n]) : m));
const tr = (l, k, v) => interp(DICT[l][k] ?? DICT.en[k], v);
const MONEY_TAG = { en: "en-US", de: "de-DE", es: "es-ES", fr: "fr-FR", he: "he-IL", tr: "tr-TR", it: "it-IT" };
const DATE_TAG = { en: "en-GB", de: "de-DE", es: "es-419", fr: "fr-FR", he: "he-IL", tr: "tr-TR", it: "it-IT" };
const money = (minor, l, cur = "USD") => new Intl.NumberFormat(MONEY_TAG[l], { style: "currency", currency: cur }).format(minor / 100);
const dateOf = (d, l) => new Intl.DateTimeFormat(DATE_TAG[l], { dateStyle: "long", timeZone: "UTC" }).format(new Date(d));
// whitespace + bidi-mark normalisation so NBSP / NNBSP / LRM / RLM never cause a false failure
const norm = (s) => String(s).replace(/[   ]/g, " ").replace(/[‎‏؜‪-‮⁦-⁩]/g, "").replace(/\s+/g, " ").trim();

// forbidden vocabulary from docs/localization/GLOSSARY-*.md ("Rejected" column)
const REJECT = {
  tr: [/\büyelik\b/i, /\bst[üu]dyo/i, /\btahakkuk/i, /\bfiş\b/i, /\bdekont/i, /çalışma alan/i, /\bmekan/i, /\bkamp\b/i, /indirim kodu/i, /promosyon kodu/i, /sonlandır/i, /iade hakkı/i, /\bkasa\b/i, /\bdondur/i, /\bengelle/i, /devam ettir/i, /fatura döngüsü/i, /ödeme hatası/i, /\bGuest App\b/],
  it: [/sottoscrizione/i, /iscrizione/i, /cancellare/i, /riprendere/i, /ripristinare/i, /\bspazio\b/i, /\bstudenti\b/i, /bolletta/i, /\btasse\b/i, /\bIVA\b/, /codice promozionale/i, /\bcoupon\b/i, /\bfallito\b/i, /checkout/i, /diritto di ritiro/i, /bloccato/i, /modalit[àa]' di pagamento/i, /\bGuest App\b/, /annullar/i],
};

// ------------------------------------------------------------------ sessions (admin magic link -> verifyOtp -> cookies)
async function cookiesForUser(email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const anon = createClient(URL_, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: s, error: e2 } = await anon.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: "magiclink" });
  if (e2) throw e2;
  const jar = new Map();
  const ssr = createServerClient(URL_, ANON, { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (l) => l.forEach(({ name, value }) => jar.set(name, value)) } });
  const { error: e3 } = await ssr.auth.setSession({ access_token: s.session.access_token, refresh_token: s.session.refresh_token });
  if (e3) throw e3;
  return [...jar].map(([name, value]) => ({ name, value, url: APP_BASE }));
}
const sessions = { owner: await cookiesForUser(M.users.owner.email), fresh: await cookiesForUser(M.users.fresh.email) };

// ------------------------------------------------------------------ DB truth for expectations (read-only)
const T = M.tenants;
const subRows = {};
for (const [k, t] of Object.entries(T)) {
  const { data } = await admin.from("space_subscriptions").select("*").eq("tenant_id", t.id).single();
  const { data: inv } = await admin.from("billing_invoices").select("*").eq("tenant_id", t.id);
  const { data: red } = await admin.from("coupon_redemptions").select("*").eq("tenant_id", t.id);
  subRows[k] = { sub: data, invoices: inv ?? [], red: red?.[0] ?? null };
}

// ------------------------------------------------------------------ recording
const results = [];
const consoleLog = [];
const rec = (loc, w, pageName, check, ok, detail = "") => { results.push({ loc, w, page: pageName, check, ok: !!ok, detail: ok ? "" : String(detail).slice(0, 500) }); if (!ok) console.log(`FAIL ${loc}/${w} ${pageName} :: ${check} :: ${String(detail).slice(0, 300)}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();

async function newCtx(user, loc, w) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, locale: loc === "en" ? "en-GB" : loc, deviceScaleFactor: 1 });
  await ctx.addCookies([...sessions[user], { name: "idw_locale", value: loc, url: APP_BASE }]);
  const page = await ctx.newPage();
  page.__label = "init";
  page.on("pageerror", (e) => consoleLog.push({ loc, w, page: page.__label, type: "pageerror", text: String(e).slice(0, 300) }));
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) consoleLog.push({ loc, w, page: page.__label, type: m.type(), text: m.text().slice(0, 300) }); });
  page.on("requestfailed", (r) => { if (r.url().startsWith(APP_BASE) && !/ERR_ABORTED/.test(r.failure()?.errorText ?? "")) consoleLog.push({ loc, w, page: page.__label, type: "requestfailed", text: `${r.url().replace(APP_BASE, "")} ${r.failure()?.errorText}` }); });
  page.on("response", (r) => { if (r.url().startsWith(APP_BASE) && r.status() >= 400 && !/_next\/image|favicon/.test(r.url())) consoleLog.push({ loc, w, page: page.__label, type: "http" + r.status(), text: r.url().replace(APP_BASE, "").slice(0, 200) }); });
  return { ctx, page };
}

const hydrated = (page) => page.waitForFunction(() => { const i = document.querySelector("button, input, a"); return i && Object.keys(i).some((k) => k.startsWith("__reactProps") || k.startsWith("__reactFiber")); }, null, { timeout: 15000 }).catch(() => {});
async function go(page, path, label) {
  page.__label = label;
  let r;
  try { r = await page.goto(`${APP_BASE}${path}`, { waitUntil: "domcontentloaded" }); }
  catch (e) { if (!/ERR_ABORTED/.test(String(e))) throw e; await sleep(1200); r = await page.goto(`${APP_BASE}${path}`, { waitUntil: "domcontentloaded" }); }
  await page.waitForLoadState("networkidle").catch(() => {});
  await hydrated(page);
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  return { code: r?.status(), url: page.url().replace(APP_BASE, "") };
}
const ev = async (page, fn, arg) => { for (let i = 0; i < 4; i++) { try { return await page.evaluate(fn, arg); } catch (e) { if (!/Execution context was destroyed|navigation/i.test(String(e)) || i === 3) throw e; await sleep(800); await page.waitForLoadState("networkidle").catch(() => {}); } } };
const bodyText = (page) => ev(page, () => document.body.innerText);

// ------------------------------------------------------------------ the generic per-view audit
const billingKeys = Object.keys(DICT.en);
const RAWKEY = new RegExp(`(?<![A-Za-z0-9_.-])(${billingKeys.filter((k) => /[A-Z]/.test(k) || k.length > 9).join("|")})(?![A-Za-z0-9_])`);
const enByLen = Object.values(DICT.en).filter((s) => s.length >= 18 && !/\{/.test(s));
const SHARED_EN_OK = new Set([]); // strings that legitimately stay English in every locale

async function audit(page, loc, w, name, opts = {}) {
  const text = await bodyText(page);
  const n = norm(text);
  // 1 status already checked by caller. lang / dir on the main wrapper (or html)
  const ld = await ev(page, () => { const m = document.querySelector("main"); return { mainLang: m?.getAttribute("lang") ?? null, mainDir: m?.getAttribute("dir") ?? null, htmlLang: document.documentElement.lang, htmlDir: document.documentElement.dir || null, bodyDir: document.body.getAttribute("dir"), cdir: m ? getComputedStyle(m).direction : null }; });
  const wantDir = RTL.has(loc) ? "rtl" : "ltr";
  if (!opts.skipLangDir) {
    rec(loc, w, name, "lang attribute is the locale", ld.mainLang === loc || (!ld.mainLang && ld.htmlLang === loc), JSON.stringify(ld));
    rec(loc, w, name, `dir is ${wantDir}`, ld.cdir === wantDir, JSON.stringify(ld));
  }
  // 2 raw keys / unfilled placeholders / junk values
  const raw = n.match(RAWKEY);
  rec(loc, w, name, "no raw i18n key", !raw, raw?.[0]);
  const ph = n.match(/\{[A-Za-z_]+\}/);
  rec(loc, w, name, "no unfilled {placeholder}", !ph, ph?.[0]);
  const junk = n.match(/\b(undefined|NaN|null|\[object Object\])\b/);
  rec(loc, w, name, "no undefined/NaN/null/[object] text", !junk, junk?.[0]);
  // 3 overflow
  const ov = await ev(page, () => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, off: [...document.querySelectorAll("body *")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1) && !e.closest("[aria-hidden=true]") && getComputedStyle(e).position !== "fixed"; }).slice(0, 3).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).split(/\s+/).slice(0, 2).join(".")}[${Math.round(e.getBoundingClientRect().left)}..${Math.round(e.getBoundingClientRect().right)}]`) }));
  rec(loc, w, name, "no horizontal overflow", ov.sw <= ov.iw + 1 && ov.off.length === 0, JSON.stringify(ov));
  // 4 clipped / truncated text
  const clipped = await ev(page, () => {
    const out = [];
    for (const e of document.querySelectorAll("main *, dialog *")) {
      if (!e.childNodes.length || ["SCRIPT", "STYLE", "INPUT", "SVG", "PATH"].includes(e.tagName.toUpperCase())) continue;
      const hasText = [...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim());
      if (!hasText) continue;
      if (e.clientWidth <= 1 && e.clientHeight <= 1) continue; // visually-hidden (sr-only) text is meant to be 1px
      const cs = getComputedStyle(e);
      const clips = (v) => v !== "visible";
      if (cs.textOverflow === "ellipsis" && e.scrollWidth > e.clientWidth + 1) out.push(`ellipsis-truncated:${e.tagName}:${e.textContent.trim().slice(0, 40)}`);
      if ((clips(cs.overflowX) && e.scrollWidth > e.clientWidth + 1 && cs.overflowX !== "auto" && cs.overflowX !== "scroll") || (clips(cs.overflowY) && e.scrollHeight > e.clientHeight + 1 && cs.overflowY !== "auto" && cs.overflowY !== "scroll")) out.push(`clipped:${e.tagName}:${e.textContent.trim().slice(0, 40)}[ox=${cs.overflowX},oy=${cs.overflowY},sw=${e.scrollWidth},cw=${e.clientWidth},sh=${e.scrollHeight},ch=${e.clientHeight}]`);
      if (cs.webkitLineClamp && cs.webkitLineClamp !== "none") out.push(`line-clamp:${e.tagName}`);
      // text wider than the nearest clipping ancestor
      const r = e.getBoundingClientRect();
      for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
        const acs = getComputedStyle(a);
        if (acs.overflowX !== "visible" && acs.overflowX !== "auto" && acs.overflowX !== "scroll") { const ar = a.getBoundingClientRect(); if (r.width > 0 && (r.right > ar.right + 1 || r.left < ar.left - 1)) out.push(`outside-clip:${e.tagName}:${e.textContent.trim().slice(0, 40)}`); break; }
      }
    }
    return [...new Set(out)].slice(0, 4);
  });
  rec(loc, w, name, "no clipped/truncated text", clipped.length === 0, clipped.join(" | "));
  // 5 untranslated English leaking into a non-English view
  if (loc !== "en") {
    const leak = enByLen.find((s) => n.includes(norm(s)) && norm(DICT[loc]?.[Object.keys(DICT.en).find((k) => DICT.en[k] === s)] ?? "") !== norm(s));
    rec(loc, w, name, "no English fallback copy", !leak, leak);
  }
  // 6 glossary vocabulary
  for (const re of REJECT[loc] ?? []) { const hit = n.match(re); if (hit) rec(loc, w, name, "glossary: rejected term absent", false, `"${hit[0]}" (${re})`); }
  if (REJECT[loc]) rec(loc, w, name, "glossary: no rejected term", true);
  // 7 expected phrases
  for (const [label, want] of opts.phrases ?? []) rec(loc, w, name, `shows ${label}`, n.includes(norm(want)), `want "${norm(want)}" in: ${n.slice(0, 200)}`);
  for (const [label, bad] of opts.absent ?? []) rec(loc, w, name, `does not show ${label}`, !n.includes(norm(bad)), `found "${norm(bad)}"`);
  return { text, n };
}
async function shot(page, loc, w, name) { if (SHOT_WIDTHS.has(w) && !process.env.FUNNEL_QA_NOSHOTS) await page.screenshot({ path: `${OUT}/shots/${loc}-${w}-${name}.png`, fullPage: true }).catch(() => {}); }
function dump(loc, name, w, text) { if (w === 390) { mkdirSync(`${OUT}/text`, { recursive: true }); writeFileSync(`${OUT}/text/${loc}-${name}.txt`, text); } }

// helpers on the pre-checkout form
const rowsOf = (page) => ev(page, () => [...document.querySelectorAll("dl > div")].map((d) => ({ label: d.querySelector("dt")?.innerText ?? "", value: d.querySelector("dd")?.innerText ?? "" })));
async function applyCode(page, code) {
  const inp = page.locator("input[type=text]").first();
  await inp.fill(code);
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && !!r.request().headers()["next-action"], { timeout: 30000 }).catch(() => {}),
    inp.locator("xpath=following-sibling::button").first().click(),
  ]);
  await sleep(500);
}
async function removeCode(page) {
  const inp = page.locator("input[type=text]").first();
  if (await inp.evaluate((e) => e.readOnly)) { await Promise.all([page.waitForResponse((r) => r.request().method() === "POST" && !!r.request().headers()["next-action"], { timeout: 30000 }).catch(() => {}), inp.locator("xpath=following-sibling::button").first().click()]); await sleep(500); }
}

// ------------------------------------------------------------------ the matrix
async function runCombo(loc, w) {
  const L = (k, v) => tr(loc, k, v);
  const price = money(2500, loc);

  // ================= fresh user: chooser, pre-checkout, coupons, checkout-cannot-start =================
  { const { ctx, page } = await newCtx("fresh", loc, w);
    let r = await go(page, "/create", "create-chooser");
    rec(loc, w, "create-chooser", "HTTP 200 and stays on /create", r.code === 200 && r.url === "/create", JSON.stringify(r));
    const p0 = await audit(page, loc, w, "create-chooser", { phrases: [["title", L("createTitle")], ["subtitle", L("createSubtitle")], ["Teach product", L("productTeach")], ["Flow product", L("productFlow")], ["Teach CTA", L("createTeachCta")], ["Flow CTA", L("createFlowCta")], ["view example", L("viewExample")], ["price " + price, price], ["per month", L("perMonth")], ["tax note", L("taxNote")], ["per-space note", L("perSpaceNote")], ["back to spaces", L("backToSpaces")], ["language label", L("languageLabel")]] });
    dump(loc, "create-chooser", w, p0.text); await shot(page, loc, w, "create-chooser");
    // card count + CTAs are links to the right place
    const links = await ev(page, () => [...document.querySelectorAll("main a")].map((a) => a.getAttribute("href")));
    rec(loc, w, "create-chooser", "CTAs link to /create/teach and /create/flow, no Studio link", links.includes("/create/teach") && links.includes("/create/flow") && !links.some((h) => /configurator/.test(h || "")), JSON.stringify(links));
    const sw = await ev(page, () => [...document.querySelectorAll("nav[aria-label] button[lang]")].map((b) => ({ l: b.lang, cur: b.getAttribute("aria-current") })));
    rec(loc, w, "create-chooser", "language switch lists 7 languages with the current one marked", sw.length === 7 && sw.filter((s) => s.cur).length === 1 && sw.find((s) => s.cur)?.l === loc, JSON.stringify(sw));

    for (const type of ["teach", "flow"]) {
      const name = `precheckout-${type}`;
      r = await go(page, `/create/${type}`, name);
      rec(loc, w, name, "HTTP 200", r.code === 200 && r.url === `/create/${type}`, JSON.stringify(r));
      const product = L(type === "teach" ? "productTeach" : "productFlow");
      const p = await audit(page, loc, w, name, { phrases: [["title", L("summaryTitle", { product })], ["intro", L("summaryIntro")], ["due today " + price, `${L("dueToday")} ${price}`], ["every cycle", L("everyCycle")], ["coupon label", L("couponLabel")], ["apply", L("couponApply")], ["consent 1", L("consentImmediate")], ["consent 2", L("consentWithdrawal")], ["terms line", L("termsLine")], ["continue", L("continueToPayment")], ["tax note", L("taxNote")], ["per-space note", L("perSpaceNote")]] });
      dump(loc, name, w, p.text);
      if (type === "flow") await shot(page, loc, w, name);
      const rows = await rowsOf(page);
      rec(loc, w, name, "base quote rows: today + every cycle", rows.length === 2 && norm(rows[0].value) === norm(price) && norm(rows[1].value) === norm(`${price} ${L("perMonth")}`), JSON.stringify(rows));
      const ctl = await ev(page, () => ({ cb: document.querySelectorAll("input[type=checkbox][required]").length, checked: [...document.querySelectorAll("input[type=checkbox]")].some((c) => c.checked), submitDisabled: [...document.querySelectorAll("form:has(input[name=spaceType]) button[type=submit]")].map((b) => b.disabled), applyDisabled: document.querySelector("input[type=text]")?.nextElementSibling?.disabled, h: [...document.querySelectorAll("button, input, a")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 40 && e.type !== "checkbox" && !e.closest("[aria-hidden=true]"); }).map((e) => `${e.tagName}:${Math.round(e.getBoundingClientRect().height)}`).slice(0, 3) }));
      rec(loc, w, name, "two required, initially unchecked consents; Apply disabled while empty", ctl.cb === 2 && !ctl.checked && ctl.applyDisabled === true, JSON.stringify(ctl));
      rec(loc, w, name, "tap targets >= 40px high", ctl.h.length === 0, JSON.stringify(ctl.h));
    }

    // ---- coupon scenarios on /create/flow
    const name = "coupon";
    await go(page, "/create/flow", "coupon-flow");
    const cases = [
      ["valid 10% x3 (once per user)", M.coupons.l10, "ok", { rows: [[L("dueToday"), money(2250, loc)], [L("firstCycles", { count: 3 }), `${money(2250, loc)} ${L("perMonth")}`], [L("then"), `${money(2500, loc)} ${L("perMonth")}`]], applied: true }],
      ["valid 20% forever", M.coupons.for20, "ok", { rows: [[L("dueToday"), money(2000, loc)], [L("everyCycle"), `${money(2000, loc)} ${L("perMonth")}`]], applied: true }],
      ["valid $5 off first month", M.coupons.once5, "ok", { rows: [[L("dueToday"), money(2000, loc)], [L("firstCycle"), `${money(2000, loc)} ${L("perMonth")}`], [L("then"), `${money(2500, loc)} ${L("perMonth")}`]], applied: true }],
      ["invalid code", `NOPE${M.runId}`, "invalid"],
      ["expired code", M.coupons.expired, "expired"],
      ["not-yet-started code", M.coupons.future, "not_started"],
      ["deactivated code", M.coupons.inactive, "inactive"],
      ["lowercase valid code is accepted", M.coupons.for20.toLowerCase(), "ok", { rows: [[L("dueToday"), money(2000, loc)]], applied: true }],
    ];
    for (const [label, code, expectKind, ex] of cases) {
      await removeCode(page);
      await applyCode(page, code);
      const nm = `coupon: ${label}`;
      const rows = await rowsOf(page);
      const alert = await ev(page, () => document.querySelector("p[role=alert]")?.innerText ?? null);
      const readOnly = await page.locator("input[type=text]").first().evaluate((e) => e.readOnly);
      const live = await ev(page, () => document.querySelector("p[aria-live=polite]")?.innerText ?? "");
      if (expectKind === "ok") {
        rec(loc, w, nm, "applied (field locked, Remove shown)", readOnly, JSON.stringify({ alert, rows }));
        for (const [lab, val] of ex.rows) rec(loc, w, nm, `quote row "${lab}" = ${val}`, rows.some((r) => norm(r.label) === norm(lab) && norm(r.value) === norm(val)), JSON.stringify(rows));
        rec(loc, w, nm, "success line mentions the code", norm(live).includes(norm(L("couponApplied", { code: code.toUpperCase() }))), live);
        rec(loc, w, nm, "no error shown", !alert, alert);
        await audit(page, loc, w, nm, { phrases: [["remove", L("couponRemove")]] });
        if (label.startsWith("valid 10%")) await shot(page, loc, w, "coupon-applied");
      } else {
        const want = L({ invalid: "couponInvalid", expired: "couponExpired", not_started: "couponNotStarted", inactive: "couponInactive" }[expectKind]);
        rec(loc, w, nm, "refused with the right localised message", !readOnly && norm(alert ?? "") === norm(want), JSON.stringify({ alert, want }));
        rec(loc, w, nm, "price unchanged after a refusal", rows.length === 2 && norm(rows[0].value) === norm(price), JSON.stringify(rows));
        await audit(page, loc, w, nm);
        if (label.startsWith("expired")) await shot(page, loc, w, "coupon-error");
      }
    }
    await removeCode(page);
    {
      const rows = await rowsOf(page);
      rec(loc, w, "coupon: remove", "removing restores the plain quote", rows.length === 2 && norm(rows[0].value) === norm(price), JSON.stringify(rows));
    }

    // ---- consent server-side (browser validation bypassed) and "checkout cannot start" (Stripe unreachable by design)
    { const nm = "checkout-cannot-start";
      await go(page, "/create/teach", nm);
      await page.evaluate(() => document.querySelectorAll("input[type=checkbox]").forEach((c) => c.removeAttribute("required")));
      await page.locator("form:has(input[name=spaceType]) button[type=submit]").click();
      await page.waitForFunction(() => document.querySelector("form:has(input[name=spaceType]) p[role=alert]"), null, { timeout: 20000 }).catch(() => {});
      let alert = await ev(page, () => document.querySelector("form:has(input[name=spaceType]) p[role=alert]")?.innerText ?? null);
      rec(loc, w, nm, "submitting without consent shows the consent message (server-side check)", norm(alert ?? "") === norm(L("consentRequired")), JSON.stringify({ alert, want: L("consentRequired") }));
      await audit(page, loc, w, "checkout-consent-error");
      await go(page, "/create/teach", nm);
      for (const c of await page.locator("input[type=checkbox]").all()) await c.check();
      await page.locator("form:has(input[name=spaceType]) button[type=submit]").click();
      await page.waitForFunction(() => document.querySelector("form:has(input[name=spaceType]) p[role=alert]"), null, { timeout: 30000 }).catch(() => {});
      alert = await ev(page, () => document.querySelector("form:has(input[name=spaceType]) p[role=alert]")?.innerText ?? null);
      const stillHere = page.url().replace(APP_BASE, "") === "/create/teach";
      rec(loc, w, nm, "with consent, Stripe unreachable: localised 'could not start' message, stays on page", stillHere && norm(alert ?? "") === norm(L("checkoutProblem")), JSON.stringify({ alert, want: L("checkoutProblem"), url: page.url() }));
      const btn = await ev(page, () => { const b = document.querySelector("form:has(input[name=spaceType]) button[type=submit]"); return { disabled: b.disabled, text: b.innerText }; });
      rec(loc, w, nm, "submit button is usable again after the error", btn.disabled === false && norm(btn.text) === norm(L("continueToPayment")), JSON.stringify(btn));
      await audit(page, loc, w, "checkout-cannot-start", { phrases: [["error", L("checkoutProblem")]] });
      await shot(page, loc, w, "checkout-cannot-start");
    }

    // ---- canceled return banner
    { const nm = "precheckout-canceled";
      const r2 = await go(page, "/create/teach?canceled=1", nm);
      await audit(page, loc, w, nm, { phrases: [["canceled notice", L("checkoutCanceled")]] });
      rec(loc, w, nm, "HTTP 200", r2.code === 200, JSON.stringify(r2));
    }

    // ---- /create/complete for a never-paid checkout (the redirect carries no authority)
    { const nm = "complete-unpaid";
      const { data: pend } = await admin.from("pending_space_checkouts").select("id,status").eq("user_id", M.users.fresh.id).order("created_at", { ascending: false }).limit(1);
      const cid = pend?.[0]?.id ?? "00000000-0000-4000-8000-000000000000";
      await go(page, `/create/complete?c=${cid}`, nm);
      await page.waitForFunction(() => /\S/.test(document.querySelector("[role=status]")?.innerText ?? "") , null, { timeout: 15000 }).catch(() => {});
      await sleep(1800);
      const p = await audit(page, loc, w, nm, { absent: [["payment confirmed", L("paymentConfirmed")]] });
      rec(loc, w, nm, "never shows a Space or 'payment confirmed' for an unpaid checkout; stays on /create/complete", /^\/create\/complete/.test(page.url().replace(APP_BASE, "")), page.url());
      dump(loc, nm, w, p.text); await shot(page, loc, w, nm);
      const r3 = await go(page, "/create/complete?c=not-a-uuid", "complete-bad-id");
      rec(loc, w, "complete-bad-id", "malformed id redirects to /create", r3.url === "/create", JSON.stringify(r3));
    }
    await ctx.close();
  }

  // ================= owner: already_used coupon, welcome, complete (paid), billing x7, My Spaces, gated studios =================
  { const { ctx, page } = await newCtx("owner", loc, w);
    await go(page, "/create/flow", "coupon-already-used");
    await applyCode(page, M.coupons.l10);
    const alert = await ev(page, () => document.querySelector("p[role=alert]")?.innerText ?? null);
    rec(loc, w, "coupon: already used", "once-per-user code already redeemed -> localised 'already used'", norm(alert ?? "") === norm(L("couponAlreadyUsed")), JSON.stringify({ alert, want: L("couponAlreadyUsed") }));
    await audit(page, loc, w, "coupon: already used");

    // paid + provisioned checkout -> the success page confirms and moves to the welcome step
    { const nm = "complete-paid";
      await go(page, `/create/complete?c=${T.active.pendingId}`, nm);
      await page.waitForURL(/\/create\/welcome\//, { timeout: 20000 }).catch(() => {});
      rec(loc, w, nm, "verified-paid checkout continues to the welcome step", page.url().includes(`/create/welcome/${T.active.id}`), page.url());
    }
    { const nm = "welcome";
      const r = await go(page, `/create/welcome/${T.active.id}`, nm);
      rec(loc, w, nm, "HTTP 200", r.code === 200, JSON.stringify(r));
      const p = await audit(page, loc, w, nm, { phrases: [["title", L("onboardTitle")], ["body", L("onboardBody")], ["name label", L("spaceNameLabel")], ["save & open", L("saveAndOpenStudio")], ["skip", L("skipForNow")]] });
      dump(loc, nm, w, p.text); await shot(page, loc, w, nm);
    }
    { const nm = "welcome-foreign";
      const r = await go(page, "/create/welcome/00000000-0000-4000-8000-000000000000", nm);
      rec(loc, w, nm, "someone else's / unknown Space is a 404, no data", r.code === 404, JSON.stringify(r));
    }

    // billing page per state
    const STATE_TEXT = {
      active: { status: "statusActive" }, discounted: { status: "statusActive" }, canceling: { status: "statusCanceling" },
      payment_issue: { status: "statusPaymentIssue" }, guest_suspended: { status: "statusGuestSuspended" },
      studio_suspended: { status: "statusStudioSuspended" }, ended: { status: "statusEnded" },
    };
    for (const [key, st] of Object.entries(STATE_TEXT)) {
      const nm = `billing-${key}`;
      const { sub, invoices, red } = subRows[key];
      const r = await go(page, `/billing/${T[key].id}`, nm);
      rec(loc, w, nm, "HTTP 200", r.code === 200, JSON.stringify(r));
      const cancelAt = sub.cancel_at ?? sub.current_period_end;
      const phrases = [["title", L("billingTitle")], ["status", L(st.status, { date: dateOf(cancelAt, loc) })], ["price line", L("priceMonthly", { price: money(sub.base_amount_minor, loc) })], ["period", `${dateOf(sub.current_period_start, loc)} – ${dateOf(sub.current_period_end, loc)}`], ["back", L("backToSpaces")]];
      const absent = [];
      const nf = (n) => new Intl.NumberFormat(DATE_TAG[loc]).format(n);
      if (["active", "discounted", "canceling"].includes(key)) phrases.push(["included audio with locale-grouped numbers", L("includedAudio", { library: nf(240), max: nf(60), listening: nf(100000) })]);
      if (key === "active") phrases.push(["next billing date", dateOf(sub.current_period_end, loc)], ["next charge", money(2500, loc)]);
      if (key === "discounted") {
        phrases.push(["coupon code", M.coupons.l10], ["discount progress 1 of 3", L("discountProgress", { done: 1, total: 3 })], ["remaining cycles", L("discountRemainingPlural", { count: 2 })], ["discounted charge", money(2250, loc)], ["discounted invoice", money(2250, loc)]);
      }
      if (key === "canceling") phrases.push(["cancel scheduled", L("cancelScheduled", { date: dateOf(cancelAt, loc) })], ["resume", L("resumeButton")]);
      if (key === "payment_issue") phrases.push(["payment issue banner", L("paymentIssueBanner", { date: dateOf(new Date(new Date(sub.payment_failed_at).getTime() + 24 * 3600e3), loc) })], ["update payment", L("updatePayment")]);
      if (key === "guest_suspended") phrases.push(["guest-suspended banner", L("guestSuspendedBanner", { date: dateOf(new Date(new Date(sub.payment_failed_at).getTime() + 168 * 3600e3), loc) })]);
      if (key === "studio_suspended") phrases.push(["studio-suspended banner", L("guestSuspendedBanner", { date: dateOf(new Date(new Date(sub.payment_failed_at).getTime() + 168 * 3600e3), loc) })]);
      if (key === "ended") { absent.push(["cancel section", L("cancelButton")], ["update payment", L("updatePayment")]); }
      if (["active", "discounted"].includes(key)) phrases.push(["cancel section", L("cancelSection")], ["cancel button", L("cancelButton")], ["update payment", L("updatePayment")]);
      // invoices: every seeded invoice appears with its amount and status
      for (const inv of invoices) {
        const amt = inv.status === "paid" ? inv.amount_paid_minor : inv.total_minor;
        phrases.push([`invoice ${inv.number ?? ""} amount`, money(amt, loc)]);
        phrases.push([`invoice status ${inv.status}`, L(inv.status === "paid" ? "invoicePaid" : inv.status === "void" ? "invoiceVoid" : inv.status === "uncollectible" ? "invoiceUncollectible" : inv.failed_at ? "invoiceFailed" : "invoiceOpen")]);
      }
      const p = await audit(page, loc, w, nm, { phrases, absent });
      dump(loc, nm, w, p.text); await shot(page, loc, w, nm);
      // invoice dates: formatted in the locale (never an ISO date)
      rec(loc, w, nm, "no ISO date strings shown", !/\b20\d\d-\d\d-\d\d\b/.test(p.n), p.n.match(/\b20\d\d-\d\d-\d\d\b/)?.[0]);
      // links
      const hrefs = await ev(page, () => [...document.querySelectorAll("main a")].map((a) => ({ h: a.getAttribute("href"), t: a.target, rel: a.rel })));
      rec(loc, w, nm, "invoice links are https and open safely (noopener)", hrefs.filter((a) => /^https:/.test(a.h || "")).every((a) => /noopener/.test(a.rel)), JSON.stringify(hrefs));
    }

    // billing-page actions that need Stripe: cancel confirm dialog + error when Stripe is unreachable; update payment error
    { const nm = "billing-actions-active";
      await go(page, `/billing/${T.active.id}`, nm);
      await page.getByRole("button", { name: L("cancelButton"), exact: true }).click();
      const dlg = await ev(page, () => { const d = document.querySelector("dialog"); return d ? { open: d.open, text: d.innerText } : null; });
      const sub = subRows.active.sub;
      const wantTitle = L("cancelConfirmTitle", { space: "QA Active Teach Space" });
      const wantBody = L("cancelConfirmBody", { date: dateOf(sub.cancel_at ?? sub.current_period_end, loc) });
      rec(loc, w, nm, "cancel opens a real dialog with title+body naming the Space and period-end date", !!dlg?.open && norm(dlg.text).includes(norm(wantTitle)) && norm(dlg.text).includes(norm(wantBody)), JSON.stringify({ dlg: dlg && norm(dlg.text).slice(0, 300), wantTitle, wantBody }));
      const dlgBox = await ev(page, () => { const d = document.querySelector("dialog"); const r = d.getBoundingClientRect(); return { l: r.left, r: r.right, iw: innerWidth, t: r.top, b: r.bottom, ih: innerHeight, sh: d.scrollHeight, ch: d.clientHeight }; });
      rec(loc, w, nm, "dialog fits inside the viewport", dlgBox.l >= 0 && dlgBox.r <= dlgBox.iw + 1 && dlgBox.t >= 0 && dlgBox.sh <= dlgBox.ch + 1, JSON.stringify(dlgBox));
      await audit(page, loc, w, "billing-cancel-dialog", { phrases: [["confirm yes", L("cancelConfirmYes")], ["confirm no", L("cancelConfirmNo")]] });
      await shot(page, loc, w, "billing-cancel-dialog");
      await page.getByRole("button", { name: L("cancelConfirmYes"), exact: true }).click();
      await page.waitForFunction(() => document.querySelector("p[role=alert]"), null, { timeout: 30000 }).catch(() => {});
      const a1 = await ev(page, () => document.querySelector("section p[role=alert]")?.innerText ?? null);
      rec(loc, w, nm, "cancel with Stripe unreachable -> localised generic error, nothing changed", norm(a1 ?? "") === norm(L("billingErrorGeneric")), JSON.stringify({ a1, want: L("billingErrorGeneric") }));
      await go(page, `/billing/${T.active.id}`, nm);
      await page.getByRole("button", { name: L("updatePayment"), exact: true }).click();
      await page.waitForFunction(() => document.querySelector("section p[role=alert]"), null, { timeout: 30000 }).catch(() => {});
      const a2 = await ev(page, () => document.querySelector("section p[role=alert]")?.innerText ?? null);
      rec(loc, w, nm, "update payment with Stripe unreachable -> localised error (no customer on the fake)", norm(a2 ?? "") === norm(L("billingErrorGeneric")), JSON.stringify({ a2, want: L("billingErrorGeneric") }));
    }

    // My Spaces chips
    { const nm = "my-spaces";
      const r = await go(page, "/space", nm);
      rec(loc, w, nm, "HTTP 200", r.code === 200 && r.url === "/space", JSON.stringify(r));
      const phrases = [
        ["payment-issue chip", L("chipPaymentIssue")], ["guest-suspended chip", L("chipGuestSuspended")], ["studio-suspended chip", L("chipStudioSuspended")],
        ["canceling chip", L("chipCanceling", { date: dateOf(subRows.canceling.sub.cancel_at ?? subRows.canceling.sub.current_period_end, loc) })], ["ended chip", L("chipEnded")],
      ];
      const p = await audit(page, loc, w, nm, { phrases, skipLangDir: true });
      dump(loc, nm, w, p.text); await shot(page, loc, w, nm);
      // My Spaces itself is the legacy English page; the billing chips/links are account-language fragments and must say so
      const frag = await ev(page, () => { const f = (e) => ({ lang: e.getAttribute("lang"), dir: getComputedStyle(e).direction }); return { chips: [...document.querySelectorAll("span.rounded-full[lang]")].map(f), links: [...document.querySelectorAll("a[href^='/billing/'][lang]")].map(f) }; });
      rec(loc, w, nm, `5 status chips and 7 billing links carry lang=${loc} and dir=${wantDirOf(loc)}`, frag.chips.length === 5 && frag.links.length === 7 && [...frag.chips, ...frag.links].every((x) => x.lang === loc && x.dir === wantDirOf(loc)), JSON.stringify(frag).slice(0, 300));
      const bl = await ev(page, () => [...document.querySelectorAll("a[href^='/billing/']")].map((a) => a.getAttribute("href")));
      rec(loc, w, nm, "one billing link per paid Space (7)", new Set(bl).size === 7, JSON.stringify(bl));
      // the link is upper-cased by CSS: the browser must apply the LOCALE's casing rules (Turkish i/İ) or it spells the word wrong
      const linkTxt = await ev(page, () => [...document.querySelectorAll("a[href^='/billing/']")].map((a) => a.innerText));
      const wantUp = L("billingLink").toLocaleUpperCase(DATE_TAG[loc]);
      rec(loc, w, nm, `billing link text is correctly cased (${wantUp})`, linkTxt.length > 0 && linkTxt.every((x) => [wantUp, L("billingLink")].includes(x.trim())), JSON.stringify({ linkTxt: linkTxt.slice(0, 2), wantUp }));
      rec(loc, w, nm, "legacy slot counter is not shown for paid customers", !/\d+ of \d+ Space/i.test(p.n), p.n.slice(0, 160));
      const newSpace = await ev(page, () => { const a = [...document.querySelectorAll("a")].find((x) => x.getAttribute("href") === "/create"); return a ? { href: a.getAttribute("href"), text: a.innerText } : null; });
      rec(loc, w, nm, "'+ New Space' is a live link to /create for a paid customer", !!newSpace, JSON.stringify(newSpace));
    }

    // gated Studios
    for (const [key, route] of [["studio_suspended", "retreat"], ["ended", "teach"]]) {
      const nm = `studio-gate-${key}`;
      const r = await go(page, `/configurator/${route}/${T[key].id}`, nm);
      rec(loc, w, nm, "HTTP 200 (gate rendered, no redirect to the editor)", r.code === 200 && r.url.startsWith(`/configurator/${route}/`), JSON.stringify(r));
      const sp = subRows[key].sub;
      const name = key === "ended" ? "QA Ended Teach" : "QA Studio Suspended Flow";
      const deletion = new Date(new Date(sp.payment_failed_at ?? 0).getTime() + 14 * 86400e3);
      const phrases = key === "ended"
        ? [["ended title", L("endedTitle")], ["ended body", L("endedBody", { space: name })], ["back", L("backToSpaces")]]
        : [["suspended title", L("studioSuspendedTitle")], ["body", L("studioSuspendedBody", { space: name })], ["resolve payment", L("resolvePayment")], ["back", L("backToSpaces")]];
      const p = await audit(page, loc, w, nm, { phrases, absent: key === "ended" ? [["resolve payment", L("resolvePayment")]] : [] });
      if (key === "studio_suspended") rec(loc, w, nm, "deadline line shows a localised deletion date", norm(p.n).includes(norm(L("studioSuspendedDeadline", { date: dateOf(deletion, loc) }))), `want ${L("studioSuspendedDeadline", { date: dateOf(deletion, loc) })}`);
      dump(loc, nm, w, p.text); await shot(page, loc, w, nm);
    }
    // a Studio that is NOT gated must not show the gate (guest-suspended keeps the Studio writable)
    { const nm = "studio-gate-guest_suspended-not-gated";
      const r = await go(page, `/configurator/teach/${T.guest_suspended.id}`, nm);
      const t = await bodyText(page);
      rec(loc, w, nm, "guest-suspended Space still opens its Studio (not gated)", r.code === 200 && !norm(t).includes(norm(L("studioSuspendedTitle"))), JSON.stringify(r));
    }
    await ctx.close();
  }
}

if (process.env.FUNNEL_QA_UNAVAILABLE === "1") {
  // Server started WITHOUT a Stripe key while the flag is on: the funnel must say so honestly, never fall back to the legacy free flow.
  for (const loc of LOCALES) for (const w of WIDTHS) {
    const { ctx, page } = await newCtx("fresh", loc, w);
    const r = await go(page, "/create", "checkout-unavailable");
    const L = (k, v) => tr(loc, k, v);
    rec(loc, w, "checkout-unavailable", "HTTP 200 on /create", r.code === 200 && r.url === "/create", JSON.stringify(r));
    await audit(page, loc, w, "checkout-unavailable", { phrases: [["unavailable message", L("checkoutUnavailable")], ["back to spaces", L("backToSpaces")]], absent: [["legacy Create copy", "What would you like to create?"]] });
    const r2 = await go(page, "/create/teach", "checkout-unavailable-type");
    rec(loc, w, "checkout-unavailable", "/create/teach does not open a pre-checkout without Stripe", r2.url === "/create", JSON.stringify(r2));
    await shot(page, loc, w, "checkout-unavailable");
    await ctx.close();
  }
  await browser.close();
  writeFileSync(`${OUT}/results.json`, JSON.stringify({ results, consoleLog }, null, 1));
  console.log(`UNAVAILABLE MODE ${results.filter((r) => r.ok).length} pass / ${results.filter((r) => !r.ok).length} fail`);
  process.exit(0);
}
const t0 = Date.now();
for (const loc of LOCALES) for (const w of WIDTHS) {
  const s = results.length;
  try { await runCombo(loc, w); }
  catch (e) { rec(loc, w, "combo", "script error (did not complete)", false, e.stack ?? e); }
  const slice = results.slice(s);
  console.log(`== ${loc} @${w}: ${slice.filter((r) => r.ok).length} pass / ${slice.filter((r) => !r.ok).length} fail  (${Math.round((Date.now() - t0) / 1000)}s)`);
  writeFileSync(`${OUT}/results.json`, JSON.stringify({ results, consoleLog }, null, 1));
}
await browser.close();
writeFileSync(`${OUT}/results.json`, JSON.stringify({ results, consoleLog }, null, 1));
console.log(`TOTAL ${results.filter((r) => r.ok).length} pass / ${results.filter((r) => !r.ok).length} fail; console entries: ${consoleLog.length}`);
