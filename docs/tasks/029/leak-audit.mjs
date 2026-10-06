/**
 * English leakage, measured instead of grepped.
 *
 * A dictionary audit (missingKeys / untranslatedKeys, in i18n.test.ts)
 * can only see strings that go THROUGH the dictionary. It is blind to the
 * one failure that matters most: copy that was never wired to t() at all.
 * Grepping for it drowns in code comments and type literals.
 *
 * So this walks the real Studio in the real browser with the Space set to
 * Hebrew, and reports every visible run of Latin prose. In a Hebrew Space
 * anything Latin is either a proper noun, a file format, a unit - or a
 * leak. The allowlist below is the first group; everything else is a
 * finding. Organizer-authored content is excluded by construction: field
 * values, the Live Draft Preview and the item rows are skipped.
 *
 * Usage: see locale-journey.mjs. Writes one JSON report.
 */
const { BASE, BYPASS, QA_EMAIL, QA_PW, PW } = process.env;
const { chromium } = await import(PW);
const FLOW = "3e6e4978-79a3-4912-98b5-c26d15d30155";
const TEACH = "cc51ee9a-9b39-4676-bc39-e20467180488";

/** Latin that is correct in a Hebrew UI: brands, products, formats, units. */
const ALLOW = [
  "InnerDweS", "WhatsApp", "Instagram", "Facebook", "TikTok", "YouTube", "Pinterest",
  "LinkedIn", "Spotify", "Threads", "X", "QR", "UTC", "URL", "HTTPS", "HTTP", "WCAG AA", "WCAG",
  "JPG", "PNG", "WebP", "MP3", "M4A", "AAC", "WAV", "OGG", "MB", "KB", "px",
  "TIME TO TEACH", "TIME TO FLOW", "Time to Teach", "Time to Flow",
  "Space", "Spaces", "Guest App", "Studio", "Vinyasa", "Yin", "Pranayama",
  "Yoga", "Nidra", "Pilates", "Maya", "Levin", "Aa", "RYT", "Alliance",
];

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

const collect = () => page.evaluate((allow) => {
  const SKIP = new Set(["SCRIPT", "STYLE", "INPUT", "TEXTAREA", "SELECT", "OPTION", "svg", "path"]);
  const out = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const el = n.parentElement;
    if (!el || SKIP.has(el.tagName)) continue;
    // Organizer content and chrome that is not system copy.
    if (el.closest('[data-testid="studio-preview-pane"], [data-testid="studio-preview"]')) continue;
    if (el.closest("[aria-expanded]")) continue;      // item row labels = organizer titles
    if (!el.getClientRects().length) continue;         // not visible at this width
    let text = n.textContent.replace(/\s+/g, " ").trim();
    if (!text) continue;
    for (const a of allow) text = text.split(a).join(" ");
    // What remains: Latin word runs of two or more words.
    const runs = text.match(/[A-Za-z][A-Za-z’'-]*(?:\s+[A-Za-z][A-Za-z’'-]*)+/g) || [];
    for (const r of runs) {
      if (r.trim().split(/\s+/).length < 2) continue;
      out.push({ text: r.trim().slice(0, 120), where: (el.tagName + "." + (el.className || "").toString().split(" ")[0]).slice(0, 40) });
    }
  }
  return out;
}, ALLOW);

const report = {};
for (const [product, tenant] of [["Flow", FLOW], ["Teach", TEACH]]) {
  const path = product === "Flow" ? "retreat" : "teach";
  await page.goto(`${BASE}/configurator/${path}/${tenant}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  // Put the Space into Hebrew for the walk, then put it back.
  await page.click('button:has-text("עברית")');
  await page.waitForFunction(() =>
    document.querySelector('div.contents[lang][dir], [data-testid="teach-studio"][lang][dir]')?.getAttribute("lang") === "he",
    null, { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(1200);

  const steps = await page.$$eval('[data-testid="studio-sidebar"] button, aside button', (els) =>
    els.map((e, i) => i).slice(0, 40));
  report[product] = {};
  for (const i of steps) {
    const btns = page.locator('[data-testid="studio-sidebar"] button, aside button');
    const btn = btns.nth(i);
    const name = (await btn.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    if (!name) continue;
    await btn.click().catch(() => {});
    await page.waitForTimeout(450);
    // Several editors keep their item panel closed, and the first pass of
    // this audit therefore never looked inside one - which is where five
    // more leaks were hiding ("Editing {name}"). So open the first row.
    const opener = page.locator('[data-testid="studio-editor"] button').filter({ hasText: /^(edit|ערוך|עריכה)$/i }).first();
    if (await opener.isVisible().catch(() => false)) {
      await opener.click().catch(() => {});
      await page.waitForTimeout(400);
    }
    const hits = await collect();
    if (hits.length) report[product][name] = hits;
  }
  // The language card lives on the Identity step, so the Space has to be
  // back there before English can be restored. Leaving the Space in
  // Hebrew would quietly break every later harness.
  await page.goto(`${BASE}/configurator/${path}/${tenant}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.click('button:has-text("English")');
  await page.waitForFunction(() =>
    document.querySelector('div.contents[lang][dir], [data-testid="teach-studio"][lang][dir]')?.getAttribute("lang") === "en",
    null, { timeout: 4000 });
  await page.waitForTimeout(1800);
}

await browser.close();
const total = Object.values(report).reduce((a, p) => a + Object.values(p).reduce((b, h) => b + h.length, 0), 0);
console.log(JSON.stringify({ base: BASE, locale: "he", latinRuns: total, report }, null, 1));
