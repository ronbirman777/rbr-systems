/**
 * The last link in the chain: does the PUBLISHED Guest App actually come
 * out in the Space's language?
 *
 * The Studio journeys prove the Studio and its draft preview react. This
 * one goes the whole way for both products and all five languages:
 * choose the language, publish, then fetch the public guest URL as an
 * anonymous visitor - no session, no bypass cookie beyond Vercel's
 * protection - and check the shell's lang/dir and the navigation labels
 * against the dictionaries.
 *
 * It publishes 10 times against the two synthetic Staging Spaces. That is
 * the point: a locale that only looks right in the Studio is not done.
 *
 * Usage: see locale-journey.mjs.
 */
const { BASE, BYPASS, QA_EMAIL, QA_PW, PW, LABELS } = process.env;
const { chromium } = await import(PW);
const L = JSON.parse(await (await import("node:fs/promises")).readFile(LABELS, "utf8"));

const SPACES = [
  { product: "Flow", tenant: "3e6e4978-79a3-4912-98b5-c26d15d30155", path: "retreat", slug: "qa-flow-1h8ve",
    navKeys: ["flow.navToday", "flow.navSchedule", "flow.navTeam", "flow.navExplore"] },
  { product: "Teach", tenant: "cc51ee9a-9b39-4676-bc39-e20467180488", path: "teach", slug: "qa-teach-staging",
    navKeys: ["teach.navHome", "teach.navSchedule", "teach.navAbout", "teach.navExplore"] },
];
const LOCALES = ["en", "de", "es", "fr", "he"];
const ORDER = { en: "English", de: "Deutsch", es: "Español", fr: "Français", he: "עברית" };
const SHELL = 'div.contents[lang][dir], [data-testid="teach-studio"][lang][dir]';

const results = [];
const ok = (name, pass, detail = "") => results.push({ name, pass: !!pass, detail: String(detail).slice(0, 300) });

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

for (const space of SPACES) {
  for (const code of LOCALES) {
    await page.goto(`${BASE}/configurator/${space.path}/${space.tenant}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.click(`button:has-text("${ORDER[code]}")`);
    await page.waitForFunction(
      ([want, sel]) => document.querySelector(sel)?.getAttribute("lang") === want,
      [code, SHELL], { timeout: 4000 }
    ).catch(() => {});
    await page.waitForTimeout(1800); // let the Server Action land

    // Publish from the Preview & Publish step. Every label here is read
    // from the dictionaries, because by this point the Studio is already
    // speaking the language being tested - the first version of this
    // harness hard-coded English and five of ten cells timed out.
    const navLabel = space.product === "Flow" ? L[code]["studio.navPreviewPublish"] : L[code]["teach.previewAndPublish"];
    await page.locator("aside button, nav button").filter({ hasText: navLabel }).first().click();
    await page.waitForTimeout(1000);
    // Flow's publish is a form submit; Teach's is a plain button. Both
    // read "Republish" once a Space has been published at least once.
    const pubLabels = [L[code]["studio.republish"], L[code]["studio.publish"], L[code]["teach.publishNow"]];
    // The form submit FIRST. Flow's top bar also has a "Republish"
    // button, and it only takes you to this step - clicking that one is
    // why an earlier run published nothing and read five stale snapshots.
    let clicked = false;
    for (const scope of ['form button[type="submit"]', "button"]) {
      for (const label of pubLabels) {
        const btn = page.locator(scope).filter({ hasText: label }).first();
        if (await btn.isVisible().catch(() => false)) {
          await btn.click();
          clicked = true;
          break;
        }
      }
      if (clicked) break;
    }
    ok(`${space.product}/${code}: the Studio offers a publish control in ${code}`, clicked, pubLabels.join(" / "));
    // Publishing is done when the button stops saying "Publishing…".
    await page.waitForFunction(
      (busy) => ![...document.querySelectorAll("button")].some((b) => b.innerText.includes(busy)),
      L[code]["studio.publishingNow"], { timeout: 90000 }
    ).catch(() => {});
    await page.waitForTimeout(3000);

    // Now read the PUBLIC guest page, with no Studio session involved.
    const fresh = await browser.newContext({
      viewport: { width: 390, height: 844 },
      extraHTTPHeaders: { "x-vercel-protection-bypass": BYPASS, "x-vercel-set-bypass-cookie": "true" },
    });
    const guest = await fresh.newPage();
    await guest.goto(`${BASE}/s/${space.slug}`, { waitUntil: "domcontentloaded" });
    await guest.waitForLoadState("networkidle").catch(() => {});
    const shell = await guest.evaluate(() => {
      const el = document.querySelector("[lang][dir]");
      return el ? { lang: el.getAttribute("lang"), dir: el.getAttribute("dir") } : null;
    });
    ok(`${space.product}/${code}: the published Guest App declares lang=${code}`, shell?.lang === code, JSON.stringify(shell));
    ok(`${space.product}/${code}: and dir=${code === "he" ? "rtl" : "ltr"}`,
      shell?.dir === (code === "he" ? "rtl" : "ltr"), JSON.stringify(shell));
    const text = await guest.evaluate(() => document.body.innerText);
    const want = space.navKeys.map((k) => L[code][k]);
    const missing = want.filter((w) => !text.includes(w));
    ok(`${space.product}/${code}: the guest navigation is in ${code}`, missing.length === 0,
      missing.length ? `missing ${missing.join(", ")}` : want.join(" / "));
    await fresh.close();
  }
}

// Leave both Spaces in English AND republished, so the next harness does
// not inherit a Hebrew published snapshot from the last loop iteration.
for (const space of SPACES) {
  await page.goto(`${BASE}/configurator/${space.path}/${space.tenant}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.click('button:has-text("English")').catch(() => {});
  await page.waitForTimeout(2000);
  const lang = await page.evaluate((sel) => document.querySelector(sel)?.getAttribute("lang"), SHELL);
  ok(`${space.product}: restored to English for the next run`, lang === "en", String(lang));
  const navLabel = space.product === "Flow" ? L.en["studio.navPreviewPublish"] : L.en["teach.previewAndPublish"];
  await page.locator("aside button, nav button").filter({ hasText: navLabel }).first().click().catch(() => {});
  await page.waitForTimeout(1000);
  for (const scope of ['form button[type="submit"]', "button"]) {
    const btn = page.locator(scope).filter({ hasText: L.en["studio.republish"] }).first();
    if (await btn.isVisible().catch(() => false)) { await btn.click(); break; }
  }
  await page.waitForFunction((busy) => ![...document.querySelectorAll("button")].some((b) => b.innerText.includes(busy)),
    L.en["studio.publishingNow"], { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const fresh = await browser.newContext({ extraHTTPHeaders: { "x-vercel-protection-bypass": BYPASS, "x-vercel-set-bypass-cookie": "true" } });
  const guest = await fresh.newPage();
  await guest.goto(`${BASE}/s/${space.slug}`, { waitUntil: "domcontentloaded" });
  const shellLang = await guest.evaluate(() => document.querySelector("[lang][dir]")?.getAttribute("lang"));
  ok(`${space.product}: and republished, so the live Guest App is English again`, shellLang === "en", String(shellLang));
  await fresh.close();
}

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(JSON.stringify({ base: BASE, total: results.length, failed: failed.length, results }, null, 1));
process.exit(failed.length ? 1 : 0);
