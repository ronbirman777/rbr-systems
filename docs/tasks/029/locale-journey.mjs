/**
 * The five-locale journey, in a real browser, against the real Staging
 * deployment, logged in as the synthetic Staging QA owner.
 *
 * What this exists to prove is one specific claim: choosing a language
 * changes the Studio shell AND the Live Draft Preview immediately,
 * without a reload. That is the bug this task fixed, and asserting it
 * from unit tests would only re-assert the hook - not that the two
 * surfaces actually turn over together in a running Studio.
 *
 * Every label comes from labels.json, extracted from the dictionaries
 * themselves. An earlier harness in this task invented German labels and
 * reported six failures that were nothing but wrong strings in the
 * harness, so nothing here is typed by hand.
 *
 * Usage:
 *   BASE=<staging preview> BYPASS=<secret> QA_EMAIL=... QA_PW=... \
 *   PW=<path to playwright-core> LABELS=<labels.json> \
 *   node docs/tasks/029/locale-journey.mjs [width] > result.json
 */
const { BASE, BYPASS, QA_EMAIL, QA_PW, PW, LABELS } = process.env;
const WIDTH = Number(process.argv[2] || 1280);
const { chromium } = await import(PW);
const L = JSON.parse(await (await import("node:fs/promises")).readFile(LABELS, "utf8"));

const FLOW = "3e6e4978-79a3-4912-98b5-c26d15d30155";
const TEACH = "cc51ee9a-9b39-4676-bc39-e20467180488";
const LOCALES = ["en", "de", "es", "fr", "he"];
const ORDER = ["English", "Deutsch", "Español", "Français", "עברית"];

const results = [];
const ok = (name, pass, detail = "") => results.push({ name, pass: !!pass, detail: String(detail).slice(0, 300) });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: WIDTH, height: WIDTH <= 430 ? 844 : 900 },
  deviceScaleFactor: WIDTH <= 430 ? 3 : 2,
  extraHTTPHeaders: { "x-vercel-protection-bypass": BYPASS, "x-vercel-set-bypass-cookie": "true" },
});
const page = await ctx.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 160)));

// ---- log in through the real form, as an organizer would ----
await page.goto(`${BASE}/log-in`, { waitUntil: "domcontentloaded" });
await page.fill('input[name="email"]', QA_EMAIL);
await page.fill('input[name="password"]', QA_PW);
await page.click('button[type="submit"]');
await page.waitForURL(/\/space/, { timeout: 45000 });
ok("login: the QA owner reaches My Spaces through the normal form", true, page.url());

/**
 * The Studio shell. Flow wraps its tree in a `display: contents` div so
 * the layout is untouched; Teach sets the attributes on the shell it
 * already had. Both carry lang+dir, which is the thing being asserted.
 */
const SHELL = 'div.contents[lang][dir], [data-testid="teach-studio"][lang][dir]';
const shell = () => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  return el ? { lang: el.getAttribute("lang"), dir: el.getAttribute("dir") } : null;
}, SHELL);
const heading = () => page.evaluate(() => {
  const h = document.querySelector("main h1, main h2");
  return h ? h.innerText.trim().replace(/\s+/g, " ") : "";
});
/**
 * The guest bottom navigation INSIDE the Live Draft Preview - a real
 * render of the real Guest App, not a mock. It is a plain div of
 * buttons rather than a <nav>, so it is found structurally: the last
 * container in the document whose children are all buttons, 3 to 6 of
 * them. Teach's is a real <nav>; Flow's is a plain div, which is noted
 * as an a11y follow-up rather than changed here.
 */
const previewNav = () => page.evaluate(() => {
  const pane = document.querySelector('[data-testid="studio-preview-pane"], [data-testid="studio-preview"]');
  if (!pane) return [];
  const groups = [...pane.querySelectorAll("div, nav")]
    .filter((d) => d.children.length >= 3 && d.children.length <= 6 &&
      [...d.children].every((c) => c.tagName === "BUTTON"))
    .map((d) => [...d.children].map((c) => c.innerText.trim().split("\n")[0]).filter(Boolean));
  return groups.length ? groups[groups.length - 1] : [];
});
const pickLocale = async (code) => {
  const label = ORDER[LOCALES.indexOf(code)];
  await page.evaluate(() => { window.__noReload = true; });
  await page.click(`button:has-text("${label}")`);
  // The optimistic change is a React state update; the commit is a Server
  // Action. Only the first is being timed here.
  await page.waitForFunction(
    ([want, sel]) => document.querySelector(sel)?.getAttribute("lang") === want,
    [code, SHELL],
    { timeout: 2500 }
  ).catch(() => {});
  return page.evaluate(() => window.__noReload === true);
};

for (const [product, tenant, navKeys, headKey] of [
  ["Flow", FLOW, ["flow.navToday", "flow.navSchedule", "flow.navTeam", "flow.navExplore"], "flow.identityTitle"],
  ["Teach", TEACH, ["teach.navHome", "teach.navSchedule", "teach.navAbout", "teach.navExplore"], "teach.sectionIdentity"],
]) {
  const url = `${BASE}/configurator/${product === "Flow" ? "retreat" : "teach"}/${tenant}`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  ok(`${product}: the Studio loads for a Space this owner belongs to`, (await shell()) !== null, await page.title());

  // ---- the selector's contract ----
  const opts = await page.$$eval("button", (els) =>
    els.map((e) => e.innerText.trim()).filter((t) => ["English", "Deutsch", "Español", "Français", "עברית"].some((l) => t.startsWith(l)))
  );
  ok(`${product}: exactly five languages are offered`, opts.length === 5, opts.join(" | "));
  ok(`${product}: the order is English / Deutsch / Español / Français / עברית`,
    opts.every((o, i) => o.startsWith(ORDER[i])), opts.join(" | "));
  const badged = opts.filter((o) => o !== ORDER[opts.indexOf(o)] && o.length > ORDER[opts.indexOf(o)].length);
  ok(`${product}: a recommendation badges an option, it does not reorder the list`,
    badged.length <= 1 && !badged.some((b) => b.startsWith("English")), badged.join(" | ") || "(none badged)");

  // ---- reactivity, per locale ----
  for (const code of LOCALES) {
    const before = await shell();
    const noReload = await pickLocale(code);
    const after = await shell();
    ok(`${product}/${code}: the shell switches language with no reload`,
      noReload && after?.lang === code, `${before?.lang} -> ${after?.lang}, noReload=${noReload}`);
    ok(`${product}/${code}: the shell direction is ${code === "he" ? "rtl" : "ltr"}`,
      after?.dir === (code === "he" ? "rtl" : "ltr"), after?.dir);
    const want = L[code][headKey];
    const got = await heading();
    ok(`${product}/${code}: the Studio heading is the ${code} string`, got === want, `want "${want}" got "${got}"`);
    // The preview pane is `hidden lg:flex` in both Studios, so below
    // 1024px there is nothing to assert. Recorded as skipped rather than
    // passed, so a narrow run cannot read as having checked it.
    const paneShown = await page.evaluate(() =>
      !!document.querySelector('[data-testid="studio-preview-pane"], [data-testid="studio-preview"]'));
    const wantNav = navKeys.map((k) => L[code][k]);
    if (paneShown) {
      const nav = await previewNav();
      ok(`${product}/${code}: the Live Draft Preview navigation is already in ${code}`,
        wantNav.every((w) => nav.includes(w)), `want ${wantNav.join("/")} got ${nav.join("/")}`);
    } else {
      results.push({ name: `${product}/${code}: the Live Draft Preview navigation is already in ${code}`, pass: true, skipped: true, detail: `preview pane is desktop-only; not rendered at ${WIDTH}px` });
    }
    // No horizontal overflow at this width, in this language.
    const over = await page.evaluate(() => {
      const d = document.documentElement;
      return { doc: d.scrollWidth - d.clientWidth, worst: Math.max(0, ...[...document.querySelectorAll("main *")].map((e) => Math.round(e.getBoundingClientRect().right - d.clientWidth))) };
    });
    ok(`${product}/${code}@${WIDTH}: nothing overflows horizontally`, over.doc <= 1 && over.worst <= 2, JSON.stringify(over));
  }

  // ---- it persists, and it persisted because it was SAVED ----
  await pickLocale("es");
  await page.waitForTimeout(1500); // let the Server Action land
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  ok(`${product}: the chosen language survives a reload`, (await shell())?.lang === "es", JSON.stringify(await shell()));
  await pickLocale("en");
  await page.waitForTimeout(1500);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  ok(`${product}: and it is restored to English for the next run`, (await shell())?.lang === "en", JSON.stringify(await shell()));
}

ok("no uncaught client errors during the whole journey", pageErrors.length === 0, pageErrors.join(" ; "));
await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(JSON.stringify({ base: BASE, width: WIDTH, total: results.length, failed: failed.length, results }, null, 1));
process.exit(failed.length ? 1 : 0);
