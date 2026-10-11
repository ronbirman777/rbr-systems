#!/usr/bin/env node
/**
 * TASK 032.5 W0 - real-browser Staging QA for the Flow audio lifecycle and the 0047 bucket limits.
 *
 * Scenario (one synthetic legacy Flow Space owned by one synthetic user, both created by this run):
 *   F1  the Studio audio step loads for the owner
 *   F2  a real WAV uploaded through the Studio file input lands as a versioned draft object and the row references it
 *   F3  Remove (the list button -> deleteModuleItem) deletes the row AND its draft audio object (the W0-3 fix)
 *   F4  no orphan draft objects remain under the run's tenant
 *   F5  a member-session direct Storage upload of text/html into the tenant folder is refused (0047 MIME list)
 *   F6  an unsupported type chosen in the Studio is refused client-side before any upload
 *
 * Safety (fail-closed): assertStagingTarget() before any client; APP_BASE must be a *-inner-dwe-s.vercel.app host;
 * every user/tenant/object is created by this run and removed by exact id (runScopedDelete, count-asserted), Storage
 * cleanup lists the run tenant's prefix and refuses to delete anything it did not expect. Never types a password.
 *
 * Env (never printed): SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_PUBLISHABLE_KEY, APP_BASE, PLAYWRIGHT_PATH, VERCEL_BYPASS.
 */
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { assertStagingTarget, runScopedDelete } from "./stagingGuard.mjs";

const URL_ = process.env.SUPABASE_URL, SECRET = process.env.SUPABASE_SECRET_KEY, ANON = process.env.SUPABASE_PUBLISHABLE_KEY;
const APP_BASE = (process.env.APP_BASE ?? "").replace(/\/+$/, ""), BYPASS = process.env.VERCEL_BYPASS ?? "";
if (!URL_ || !SECRET || !ANON || !APP_BASE || !process.env.PLAYWRIGHT_PATH) throw new Error("missing env");
assertStagingTarget({ url: URL_, serviceKey: SECRET });
if (!/^https:\/\/[a-z0-9-]+-inner-dwe-s\.vercel\.app$/.test(APP_BASE)) throw new Error("REFUSING: APP_BASE must be a *-inner-dwe-s.vercel.app host");

const { chromium } = await import(process.env.PLAYWRIGHT_PATH);
const admin = createClient(URL_, SECRET, { auth: { autoRefreshToken: false, persistSession: false } });
const runId = randomBytes(4).toString("hex");
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok: !!ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : "  -> " + detail}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 2 s of 8 kHz mono 16-bit PCM silence: a real, decodable WAV. */
function wav(seconds = 2, rate = 8000) {
  const data = seconds * rate * 2, b = Buffer.alloc(44 + data);
  b.write("RIFF", 0); b.writeUInt32LE(36 + data, 4); b.write("WAVE", 8); b.write("fmt ", 12); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(data, 40);
  return b;
}
async function listAll(prefix) {
  const out = [];
  const walk = async (p) => {
    const { data, error } = await admin.storage.from("tenant-media").list(p, { limit: 1000 });
    if (error) throw error;
    for (const o of data ?? []) { const full = `${p}/${o.name}`; if (o.id) out.push(full); else await walk(full); }
  };
  await walk(prefix);
  return out;
}

const email = `qa0325-${runId}@example.com`, password = randomBytes(18).toString("base64url");
const { data: u, error: uErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (uErr) throw uErr;
const userId = u.user.id;
const member = createClient(URL_, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: s, error: sErr } = await member.auth.signInWithPassword({ email, password });
if (sErr) throw sErr;
let tenantId = null;
const browser = await chromium.launch();
try {
  const { data: t, error: tErr } = await member.from("tenants").insert({ name: `qa0325 flow audio ${runId}`, product_type: "retreat", timezone: "UTC" }).select("id").single();
  if (tErr) throw tErr;
  tenantId = t.id;
  // Turn on the Audio module as the owner would on the Modules step (same row shape as saveModules).
  const { error: mErr } = await member.from("module_configs").upsert([{ tenant_id: tenantId, module_key: "audio", enabled: true }], { onConflict: "tenant_id,module_key" });
  if (mErr) throw mErr;

  const jar = new Map();
  const ssr = createServerClient(URL_, ANON, { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (l) => l.forEach(({ name, value }) => jar.set(name, value)) } });
  await ssr.auth.setSession({ access_token: s.session.access_token, refresh_token: s.session.refresh_token });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: BYPASS ? { "x-vercel-protection-bypass": BYPASS, "x-vercel-set-bypass-cookie": "true" } : {} });
  await ctx.addCookies([...jar].map(([name, value]) => ({ name, value, url: APP_BASE })));
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());

  const r = await page.goto(`${APP_BASE}/configurator/retreat/${tenantId}?step=audio`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.getByRole("button", { name: /audio/i }).first().click().catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
  const addBtn = page.getByRole("button", { name: /add audio|add track/i });
  await addBtn.first().waitFor({ timeout: 15000 }).catch(() => {});
  const f1 = r?.status() === 200 && (await addBtn.count()) > 0;
  check("F1 Studio audio step loads for the owner", f1, `status ${r?.status()} url ${page.url().replace(APP_BASE, "")} buttons ${(await page.evaluate(() => [...document.querySelectorAll("button,a")].map((b) => (b.textContent || "").replace(/\s+/g, " ").trim()).filter((x) => /audio|track/i.test(x)).join(" | ")))}`);
  if (!f1) throw new Error("F1 failed - stopping before the upload steps");

  await addBtn.click();
  const input = page.locator('input[type="file"][aria-label="Audio file"]').first();
  await input.waitFor({ state: "attached", timeout: 15000 });
  // F6 first: an unsupported type is refused client-side, nothing uploaded
  await input.setInputFiles({ name: "evil.html", mimeType: "text/html", buffer: Buffer.from("<script>1</script>") });
  await sleep(1500);
  const afterBad = await listAll(tenantId);
  check("F6 unsupported type refused in the Studio before upload (no object written)", afterBad.length === 0, afterBad.join(","));

  await input.setInputFiles({ name: "qa.wav", mimeType: "audio/wav", buffer: wav() });
  let item = null;
  for (let i = 0; i < 30 && !item; i++) {
    await sleep(1000);
    const { data } = await admin.from("module_items").select("id, metadata").eq("tenant_id", tenantId).eq("module_key", "audio");
    item = (data ?? []).find((x) => typeof x.metadata?.audioRef === "string") ?? null;
  }
  const ref = item?.metadata?.audioRef ?? "";
  const objsAfterUpload = await listAll(tenantId);
  check("F2 Studio upload stored a versioned draft and the row references it",
    !!item && /\/audioFile\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/draft\.wav$/.test(ref) && objsAfterUpload.includes(ref), `ref=${ref} objs=${objsAfterUpload.length}`);

  // F5: member-session direct upload of text/html into the tenant folder (0047)
  const { error: htmlErr } = await member.storage.from("tenant-media").upload(`${tenantId}/qa0325/${runId}.html`, new Blob(["<b>x</b>"], { type: "text/html" }), { contentType: "text/html", upsert: false });
  check("F5 member direct upload of text/html refused by the bucket (0047)", !!htmlErr && /mime/i.test(String(htmlErr.message ?? htmlErr)), String(htmlErr?.message ?? "no error"));

  // F3: Remove from the list (hover reveals the button; force the click)
  await page.goto(`${APP_BASE}/configurator/retreat/${tenantId}?step=audio`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.getByRole("button", { name: /audio/i }).first().click().catch(() => {});
  await page.getByRole("button", { name: /add audio|add track/i }).first().waitFor({ timeout: 15000 }).catch(() => {});
  await page.getByRole("button", { name: /^remove$/i }).first().click({ force: true });
  let gone = false;
  for (let i = 0; i < 20 && !gone; i++) {
    await sleep(1000);
    const { data } = await admin.from("module_items").select("id").eq("id", item?.id ?? "00000000-0000-0000-0000-000000000000");
    gone = (data ?? []).length === 0;
  }
  await sleep(1500);
  const objsAfterRemove = await listAll(tenantId);
  check("F3 Remove deleted the row AND its draft audio object", gone && !objsAfterRemove.includes(ref), `rowGone=${gone} stillThere=${objsAfterRemove.includes(ref)}`);
  check("F4 no orphan draft objects remain under the run tenant", objsAfterRemove.filter((p) => /\/draft\.[a-z0-9]+$/.test(p)).length === 0, objsAfterRemove.join(","));
  await ctx.close();
} finally {
  await browser.close();
  // Exact, run-scoped cleanup.
  if (tenantId) {
    const left = await listAll(tenantId);
    if (left.some((p) => !p.startsWith(`${tenantId}/`))) throw new Error("cleanup ABORTED: unexpected object outside the run tenant");
    if (left.length) { const { data, error } = await admin.storage.from("tenant-media").remove(left); if (error || (data ?? []).length !== left.length) throw new Error("storage cleanup mismatch"); }
    await runScopedDelete(admin, { table: "tenants", ids: [tenantId], expected: 1 });
  }
  await admin.auth.admin.deleteUser(userId);
  const { count } = await admin.from("tenants").select("*", { count: "exact", head: true }).eq("id", tenantId ?? "00000000-0000-0000-0000-000000000000");
  console.log(`cleanup done (tenant rows left: ${count ?? 0})`);
}
const failed = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
