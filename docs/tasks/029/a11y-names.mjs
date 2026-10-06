/**
 * Accessible names and target sizes, on the real Studio.
 *
 * The earlier phase's a11y pass ran against hydrated fixtures and
 * reported 26 unnamed controls in the OLDER editors as a follow-up. This
 * checks the real thing, every step, both products: every interactive
 * control must have an accessible name, and every one must be at least
 * 44x44 (or 24px with spacing, the WCAG 2.2 minimum - reported
 * separately so the two are not conflated).
 *
 * Usage: see locale-journey.mjs.
 */
const { BASE, BYPASS, QA_EMAIL, QA_PW, PW } = process.env;
const WIDTH = Number(process.argv[2] || 1280);
const { chromium } = await import(PW);
const EDITOR = '[data-testid="studio-editor"]';
const SPACES = [
  { product: "Flow", tenant: "3e6e4978-79a3-4912-98b5-c26d15d30155", path: "retreat" },
  { product: "Teach", tenant: "cc51ee9a-9b39-4676-bc39-e20467180488", path: "teach" },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: WIDTH, height: WIDTH <= 430 ? 844 : 950 },
  deviceScaleFactor: WIDTH <= 430 ? 3 : 2,
  extraHTTPHeaders: { "x-vercel-protection-bypass": BYPASS, "x-vercel-set-bypass-cookie": "true" },
});
const page = await ctx.newPage();
await page.goto(`${BASE}/log-in`, { waitUntil: "domcontentloaded" });
await page.fill('input[name="email"]', QA_EMAIL);
await page.fill('input[name="password"]', QA_PW);
await page.click('button[type="submit"]');
await page.waitForURL(/\/space/, { timeout: 45000 });

const scan = () => page.evaluate((sel) => {
  const col = document.querySelector(sel);
  if (!col) return null;
  const controls = [...col.querySelectorAll("button, a[href], input, select, textarea, [role=button], [tabindex='0']")]
    .filter((e) => e.getClientRects().length && e.type !== "hidden");
  const named = (e) => {
    const aria = e.getAttribute("aria-label");
    if (aria && aria.trim()) return true;
    const labelledBy = e.getAttribute("aria-labelledby");
    if (labelledBy && labelledBy.split(/\s+/).some((id) => document.getElementById(id)?.innerText.trim())) return true;
    if (e.id && [...document.querySelectorAll(`label[for="${e.id}"]`)].some((l) => l.innerText.trim())) return true;
    if (e.closest("label")?.innerText.trim()) return true;
    if ((e.innerText || "").trim()) return true;
    if (e.title && e.title.trim()) return true;
    if (e.tagName === "INPUT" && e.placeholder && e.placeholder.trim()) return false; // a placeholder is not a name
    return false;
  };
  /**
   * The real target, not the painted box. Two things make them differ,
   * and both are deliberate in this Studio:
   *   - a small control can carry an invisible ::after hit area, so the
   *     pseudo-element's box counts;
   *   - a checkbox inside its own <label> is hit by clicking the label,
   *     so the label's box counts.
   * Measuring only getBoundingClientRect() reported 82 controls as too
   * small, most of which a finger could already hit.
   */
  const hitArea = (e) => {
    const r = e.getBoundingClientRect();
    let w = r.width, hh = r.height;
    const after = getComputedStyle(e, "::after");
    if (after && after.content && after.content !== "none") {
      const aw = parseFloat(after.width), ah = parseFloat(after.height);
      if (Number.isFinite(aw)) w = Math.max(w, aw);
      if (Number.isFinite(ah)) hh = Math.max(hh, ah);
    }
    const label = e.closest("label");
    if (label && (e.type === "checkbox" || e.type === "radio")) {
      const lr = label.getBoundingClientRect();
      w = Math.max(w, lr.width);
      hh = Math.max(hh, lr.height);
    }
    return { w, h: hh };
  };

  const unnamed = [], small = [], tiny = [];
  for (const e of controls) {
    const { w, h } = hitArea(e);
    const tag = `${e.tagName.toLowerCase()}${e.type ? `[${e.type}]` : ""}`;
    const size = `${Math.round(w)}x${Math.round(h)}`;
    if (!named(e)) unnamed.push({ tag, cls: (e.className || "").toString().slice(0, 50) });
    // 44x44 is the goal; 24x24 is the WCAG 2.2 AA floor. Reported apart so
    // "not ideal" is never confused with "fails".
    if (Math.min(w, h) < 44) small.push({ tag, size });
    if (Math.min(w, h) < 24) tiny.push({ tag, size, cls: (e.className || "").toString().slice(0, 60) });
  }
  return { controls: controls.length, unnamed, small, tiny };
}, EDITOR);

const report = {};
for (const space of SPACES) {
  await page.goto(`${BASE}/configurator/${space.path}/${space.tenant}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  // Below lg the sidebar is hidden and the steps are in the mobile menu,
  // so it has to be opened before the step list exists at all.
  const menu = page.locator("button").filter({ hasText: /menu|תפריט|Menü|menú/i }).first();
  if (await menu.isVisible().catch(() => false)) await menu.click().catch(() => {});
  await page.waitForTimeout(400);
  const navSel = (await page.locator("aside button").count()) > 0 ? "aside button" : "nav button";
  const steps = await page.$$eval(navSel, (els) => els.map((_, i) => i));
  report[space.product] = {};
  for (const i of steps) {
    const btns = page.locator(navSel);
    const name = (await btns.nth(i).innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    if (!name) continue;
    await btns.nth(i).click().catch(() => {});
    await page.waitForTimeout(450);
    const opener = page.locator(`${EDITOR} button`).filter({ hasText: /^edit$/i }).first();
    if (await opener.isVisible().catch(() => false)) {
      await opener.click().catch(() => {});
      await page.waitForTimeout(400);
    }
    const r = await scan();
    if (r) report[space.product][name] = r;
  }
}
await browser.close();

const totals = { controls: 0, unnamed: 0, under44: 0, under24: 0 };
for (const p of Object.values(report)) {
  for (const s of Object.values(p)) {
    totals.controls += s.controls;
    totals.unnamed += s.unnamed.length;
    totals.under44 += s.small.length;
    totals.under24 += s.tiny.length;
  }
}
console.log(JSON.stringify({ base: BASE, width: WIDTH, totals, report }, null, 1));
process.exit(totals.unnamed === 0 ? 0 : 1);
