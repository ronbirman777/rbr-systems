/**
 * The P3-P5 Studio journey, authenticated, in a real browser, against
 * the real Staging deployment.
 *
 * This is the coverage the earlier phase could not reach: the Flow
 * Studio was never driven through a real login because setting a
 * password on the synthetic Staging QA owner needed a key that was not
 * available. With that unblocked, every new editor is exercised the way
 * an organizer would: open the step, type, watch the dirty state, save,
 * reload, and check the value came back.
 *
 * Two properties are asserted that unit tests cannot reach:
 *   PUBLISH GATING - a value that is saved but not published must not
 *   appear in the Guest App, and must appear after publishing.
 *   NO CROSS-SPACE WRITE - the Teach Space's rows are fingerprinted
 *   before and after (see qa/*.json and the report), outside this file.
 *
 * Field labels come from the dictionaries via their aria-labels, so a
 * renamed label fails loudly here instead of silently matching nothing.
 *
 * Usage: see locale-journey.mjs. Adds MARKER=<unique string>.
 */
const { BASE, BYPASS, QA_EMAIL, QA_PW, PW } = process.env;
const MARKER = process.env.MARKER || `qa${Date.now().toString(36)}`;
const { chromium } = await import(PW);
const FLOW = "3e6e4978-79a3-4912-98b5-c26d15d30155";

const results = [];
const ok = (name, pass, detail = "") => results.push({ name, pass: !!pass, detail: String(detail).slice(0, 400) });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 950 },
  extraHTTPHeaders: { "x-vercel-protection-bypass": BYPASS, "x-vercel-set-bypass-cookie": "true" },
});
const page = await ctx.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 160)));

await page.goto(`${BASE}/log-in`, { waitUntil: "domcontentloaded" });
await page.fill('input[name="email"]', QA_EMAIL);
await page.fill('input[name="password"]', QA_PW);
await page.click('button[type="submit"]');
await page.waitForURL(/\/space/, { timeout: 45000 });

const studio = async () => {
  await page.goto(`${BASE}/configurator/retreat/${FLOW}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
};
const step = async (name) => {
  await page.locator("aside button, nav button").filter({ hasText: new RegExp(name, "i") }).first().click();
  await page.waitForTimeout(500);
};
const save = async () => {
  const btn = page.locator("button").filter({ hasText: /^\s*save\b/i }).first();
  await btn.click();
  // The Server Action round-trips; the button reports "Saving…" and the
  // step returns to a clean state. Waiting on the text avoids a sleep
  // that is either flaky or slow.
  await page.waitForFunction(
    () => ![...document.querySelectorAll("button")].some((b) => /saving/i.test(b.innerText)),
    null, { timeout: 30000 }
  ).catch(() => {});
  await page.waitForTimeout(900);
};
const setField = async (label, value) => {
  const f = page.locator(`[aria-label="${label}"]`).first();
  await f.waitFor({ state: "visible", timeout: 10000 });
  await f.fill(value);
};
const fieldValue = (label) => page.locator(`[aria-label="${label}"]`).first().inputValue();
const dirty = () => page.evaluate(() =>
  [...document.querySelectorAll("button")].some((b) => /^\s*save\b/i.test(b.innerText) && !b.disabled));

// ---------------------------------------------------------------- modules
await studio();
await step("Modules");
const beforeSteps = await page.$$eval("aside button, nav button", (els) => els.map((e) => e.innerText.replace(/\s+/g, " ").trim()));
for (const mod of ["Guidelines", "Readings", "Audio"]) {
  const on = await page.evaluate((m) => {
    const key = { Guidelines: "module_guidelines", Readings: "module_readings", Audio: "module_audio" }[m];
    return document.querySelector(`input[name="${key}"]`)?.value === "true";
  }, mod);
  if (!on) await page.click(`button[aria-label="Toggle ${mod}"]`);
}
const allOn = await page.evaluate(() =>
  ["module_guidelines", "module_readings", "module_audio"].every((k) => document.querySelector(`input[name="${k}"]`)?.value === "true"));
ok("Modules: Guidelines, Readings and Audio can be switched on", allOn);
await save();
await studio();
const afterSteps = await page.$$eval("aside button, nav button", (els) => els.map((e) => e.innerText.replace(/\s+/g, " ").trim()));
const gained = ["Guidelines", "Readings", "Audio"].filter((m) => afterSteps.some((s) => s.includes(m)));
ok("Modules: enabling a module adds its editor to the step list", gained.length === 3,
  `gained ${gained.join("/")} (was ${beforeSteps.length} steps, now ${afterSteps.length})`);

// ------------------------------------------------------------ the editors
/** [step, [[label, value], ...], a value to read back] */
const EDITS = [
  ["Retreat Home", [["Tagline", `${MARKER} tagline`], ["Short description", `${MARKER} short`], ["About the Retreat", `${MARKER} about`], ["What to Bring", `${MARKER}-bring-a\n${MARKER}-bring-b`], ["What to Expect", `${MARKER}-expect-a`]], "Tagline"],
  ["Meals", [["Introduction (optional)", `${MARKER} meals intro`]], "Introduction (optional)"],
  ["Facilities", [["Short description", `${MARKER} facility short`]], "Short description"],
  ["Facilitators", [["Full biography (optional)", `${MARKER} long bio`]], "Full biography (optional)"],
];

for (const [name, fields, readBack] of EDITS) {
  await studio();
  await step(name);
  for (const [label, value] of fields) {
    try { await setField(label, value); }
    catch (e) { ok(`${name}: the field "${label}" exists`, false, String(e).slice(0, 160)); }
  }
  ok(`${name}: typing makes the step dirty`, await dirty());
  await save();
  await studio();
  await step(name);
  let got = "";
  try { got = await fieldValue(readBack); } catch { /* reported below */ }
  ok(`${name}: the edit survives a save and a reload`, got.includes(MARKER), `"${String(got).slice(0, 80)}"`);
}

// ------------------------------------------- the three new item libraries
const ITEMS = [
  ["Guidelines", [["Title", `${MARKER} quiet hours`], ["Description", `${MARKER} 10pm to 7am`]]],
  ["Readings", [["Title", `${MARKER} on arriving`], ["Excerpt", `${MARKER} excerpt`], ["The reading", `${MARKER} body text`]]],
  ["Audio", [["Title", `${MARKER} evening nidra`], ["A note (optional)", `${MARKER} note`]]],
];
for (const [name, fields] of ITEMS) {
  await studio();
  await step(name);
  const add = page.locator("main button").filter({ hasText: new RegExp(`add (a )?(${name.replace(/s$/, "")}|${name})`, "i") }).first();
  try { await add.click({ timeout: 8000 }); } catch (e) { ok(`${name}: there is an "Add" control`, false, String(e).slice(0, 120)); continue; }
  await page.waitForTimeout(400);
  for (const [label, value] of fields) {
    try { await setField(label, value); }
    catch (e) { ok(`${name}: the field "${label}" exists`, false, String(e).slice(0, 160)); }
  }
  await save();
  await studio();
  await step(name);
  const body = await page.locator("main").innerText();
  ok(`${name}: a new item saves and comes back after a reload`, body.includes(`${MARKER}`), body.split("\n").find((l) => l.includes(MARKER)) || "(marker not found in step)");
}

// --------------------------------------------------- the unsaved guard
await studio();
await step("Retreat Home");
await setField("Tagline", `${MARKER} unsaved-probe`);
await page.locator("aside button, nav button").filter({ hasText: /Brand/i }).first().click();
await page.waitForTimeout(600);
const guard = await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"][aria-modal="true"]');
  return d ? d.innerText.replace(/\s+/g, " ").slice(0, 120) : null;
});
ok("leaving a dirty step asks before discarding", !!guard && /unsaved/i.test(guard), guard || "(no dialog)");
if (guard) {
  await page.locator('[role="dialog"] button').filter({ hasText: /without saving|discard|leave/i }).first().click();
  await page.waitForTimeout(600);
}
await studio();
await step("Retreat Home");
const tagline = await fieldValue("Tagline");
ok("discarding really discards - the unsaved probe is not in the draft", !tagline.includes("unsaved-probe"), tagline.slice(0, 80));

// ------------------------------------------- publish gating, then publish
const guestBefore = await (await ctx.request.get(`${BASE}/s/qa-flow-1h8ve`)).text();
ok("publish gating: a SAVED but unpublished edit is not visible to guests",
  !guestBefore.includes(MARKER), guestBefore.includes(MARKER) ? "marker leaked into the published Guest App" : "absent, as it must be");

await studio();
await page.locator("button").filter({ hasText: /republish|publish now/i }).first().click();
await page.waitForTimeout(1200);
const pubBtn = page.locator("button").filter({ hasText: /publish now|republish/i }).first();
if (await pubBtn.isVisible().catch(() => false)) { await pubBtn.click().catch(() => {}); }
await page.waitForFunction(() => /published/i.test(document.body.innerText), null, { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(2500);

const guestAfter = await (await ctx.request.get(`${BASE}/s/qa-flow-1h8ve`)).text();
ok("after publishing, the Guest App serves the new content", guestAfter.includes(MARKER),
  guestAfter.includes(MARKER) ? "present" : "marker still absent after publish");
for (const [what, needle] of [["a guideline", `${MARKER} quiet hours`], ["a reading", `${MARKER} on arriving`], ["an audio track", `${MARKER} evening nidra`], ["the retreat tagline", `${MARKER} tagline`]]) {
  ok(`published Guest App contains ${what}`, guestAfter.includes(needle), needle);
}
ok("no uncaught client errors during the whole journey", pageErrors.length === 0, pageErrors.join(" ; "));

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(JSON.stringify({ base: BASE, marker: MARKER, total: results.length, failed: failed.length, results }, null, 1));
process.exit(failed.length ? 1 : 0);
