/**
 * Put both synthetic Staging QA Spaces back to English and republish.
 *
 * It exists because a locale journey that is interrupted leaves the
 * Spaces in whatever language it had reached - the OS killed one for
 * memory mid-run and both Spaces stayed French, draft and published. The
 * next harness then fails on English labels for no real reason.
 *
 * Deliberately minimal: one browser, two Spaces, click English, publish.
 *
 * Usage: see locale-journey.mjs.
 */
const { BASE, BYPASS, QA_EMAIL, QA_PW, PW } = process.env;
const { chromium } = await import(PW);
const SHELL = 'div.contents[lang][dir], [data-testid="teach-studio"][lang][dir]';
const SPACES = [
  { product: "Flow", tenant: "3e6e4978-79a3-4912-98b5-c26d15d30155", path: "retreat", slug: "qa-flow-1h8ve", nav: "Preview & Publish" },
  { product: "Teach", tenant: "cc51ee9a-9b39-4676-bc39-e20467180488", path: "teach", slug: "qa-teach-staging", nav: "Preview & Publish" },
];

const results = [];
const ok = (name, pass, detail = "") => results.push({ name, pass: !!pass, detail: String(detail).slice(0, 200) });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 950 },
  extraHTTPHeaders: { "x-vercel-protection-bypass": BYPASS, "x-vercel-set-bypass-cookie": "true" },
});
const page = await ctx.newPage();
await page.goto(`${BASE}/log-in`, { waitUntil: "domcontentloaded" });
await page.fill('input[name="email"]', QA_EMAIL);
await page.fill('input[name="password"]', QA_PW);
await page.click('button[type="submit"]');
await page.waitForURL(/\/space/, { timeout: 45000 });

for (const s of SPACES) {
  await page.goto(`${BASE}/configurator/${s.path}/${s.tenant}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.click('button:has-text("English")');
  await page.waitForFunction(
    (sel) => document.querySelector(sel)?.getAttribute("lang") === "en",
    SHELL, { timeout: 8000 }
  ).catch(() => {});
  await page.waitForTimeout(2200);
  ok(`${s.product}: draft is English again`,
    (await page.evaluate((sel) => document.querySelector(sel)?.getAttribute("lang"), SHELL)) === "en");

  await page.locator("aside button, nav button").filter({ hasText: s.nav }).first().click().catch(() => {});
  await page.waitForTimeout(1000);
  for (const scope of ['form button[type="submit"]', "button"]) {
    const btn = page.locator(scope).filter({ hasText: /^(Republish|Publish now|Publish)$/ }).first();
    if (await btn.isVisible().catch(() => false)) { await btn.click(); break; }
  }
  await page.waitForFunction(
    () => !/Publishing/.test(document.body.innerText), null, { timeout: 120000 }
  ).catch(() => {});
  await page.waitForTimeout(3000);

  const fresh = await browser.newContext({ extraHTTPHeaders: { "x-vercel-protection-bypass": BYPASS, "x-vercel-set-bypass-cookie": "true" } });
  const guest = await fresh.newPage();
  await guest.goto(`${BASE}/s/${s.slug}`, { waitUntil: "domcontentloaded" });
  const lang = await guest.evaluate(() => document.querySelector("[lang][dir]")?.getAttribute("lang"));
  ok(`${s.product}: published Guest App is English again`, lang === "en", String(lang));
  await fresh.close();
}

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(JSON.stringify({ base: BASE, total: results.length, failed: failed.length, results }, null, 1));
process.exit(failed.length ? 1 : 0);
