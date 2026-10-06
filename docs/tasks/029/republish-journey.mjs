/**
 * The Flow top bar's Republish button, in a real browser.
 *
 * It used to be labelled "Republish" and only navigate to the publish
 * step. The claim under test is narrow and behavioural:
 *
 *   PUBLISHED Space   -> pressing it actually publishes: a saved edit the
 *                        Guest App could not see becomes visible, without
 *                        ever opening the Preview & Publish step.
 *   IN FLIGHT         -> the button is disabled and marked aria-busy, so a
 *                        second press cannot start a second publish.
 *   SUCCESS           -> something on screen says so, from whatever step
 *                        the organizer happened to be on.
 *   UNPUBLISHED Space -> it does NOT publish silently. It says what it
 *                        does ("Preview & Publish") and goes there.
 *
 * The unpublished half is checked without unpublishing anything: there is
 * no "unpublish", so it is asserted on the label contract instead, which
 * is the thing that was untruthful.
 *
 * Usage: see locale-journey.mjs.
 */
const { BASE, BYPASS, QA_EMAIL, QA_PW, PW, LABELS } = process.env;
const MARKER = process.env.MARKER || `rp${Date.now().toString(36)}`;
const { chromium } = await import(PW);
const L = JSON.parse(await (await import("node:fs/promises")).readFile(LABELS, "utf8"));
const FLOW = "3e6e4978-79a3-4912-98b5-c26d15d30155";
const EDITOR = '[data-testid="studio-editor"]';
const TOPBAR = '[data-testid="studio-top-bar"]';

const results = [];
const ok = (name, pass, detail = "") => results.push({ name, pass: !!pass, detail: String(detail).slice(0, 320) });

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
  await page.locator("aside button, nav button").filter({ hasText: name }).first().click();
  await page.waitForTimeout(600);
};
const topBarButton = () => page.locator(`${TOPBAR} button`).last();
const guestText = async () => {
  const fresh = await browser.newContext({ extraHTTPHeaders: { "x-vercel-protection-bypass": BYPASS, "x-vercel-set-bypass-cookie": "true" } });
  const g = await fresh.newPage();
  await g.goto(`${BASE}/s/qa-flow-1h8ve`, { waitUntil: "domcontentloaded" });
  await g.waitForLoadState("networkidle").catch(() => {});
  const text = await g.evaluate(() => document.body.innerText);
  await fresh.close();
  return text;
};

await studio();
const label = (await topBarButton().innerText()).trim();
const published = label === L.en["studio.republish"];
ok("the Space under test is already published, so the top bar says Republish",
  published, `top bar says "${label}"`);

// ---- a saved edit that the Guest App cannot see yet ----
await step(L.en["flow.homeStepTitle"]);
await page.locator(`${EDITOR} [aria-label="Tagline"]`).first().fill(`${MARKER} tagline`);
await page.locator("button").filter({ hasText: /^\s*save\b/i }).first().click();
await page.waitForFunction(
  () => ![...document.querySelectorAll("button")].some((b) => /saving/i.test(b.innerText)),
  null, { timeout: 30000 }
).catch(() => {});
await page.waitForTimeout(1200);
ok("the edit is saved but not yet visible to guests", !(await guestText()).includes(MARKER), MARKER);

// ---- press the top-bar button, from a step that is NOT Preview & Publish ----
const stepHeadingBefore = await page.locator(`${EDITOR} h1, ${EDITOR} h2`).first().innerText().catch(() => "");
await topBarButton().click();
// It must report itself busy, and refuse a second press while it is.
// NOT `button:last-of-type` - that is per-parent, and in this header it
// matches the "My Spaces" link's sibling. The publish control is the last
// button in the bar.
const busy = await page.waitForFunction(
  (sel) => {
    const list = [...document.querySelectorAll(`${sel} button`)];
    const b = list[list.length - 1];
    return !!b && (b.disabled || b.getAttribute("aria-busy") === "true");
  },
  TOPBAR, { timeout: 15000 }
).then(() => true).catch(() => false);
ok("while publishing, the button is disabled / aria-busy", busy);
if (busy) {
  const clickBlocked = await topBarButton().click({ timeout: 1500 }).then(() => false).catch(() => true);
  ok("a second press cannot start a second publish", clickBlocked);
}
await page.waitForFunction(
  (sel) => {
    const list = [...document.querySelectorAll(`${sel} button`)];
    const b = list[list.length - 1];
    return !!b && !b.disabled && b.getAttribute("aria-busy") !== "true";
  },
  TOPBAR, { timeout: 120000 }
).catch(() => {});
await page.waitForTimeout(1500);

const stepHeadingAfter = await page.locator(`${EDITOR} h1, ${EDITOR} h2`).first().innerText().catch(() => "");
ok("it published in place, without navigating to the publish step",
  stepHeadingAfter === stepHeadingBefore, `"${stepHeadingBefore}" -> "${stepHeadingAfter}"`);

const feedback = await page.evaluate(() => {
  const el = [...document.querySelectorAll('[role="status"], [role="alert"]')]
    .map((e) => e.innerText.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return el;
});
ok("success is announced on screen", feedback.some((f) => f.includes(L.en["flow.publishedNow"].slice(0, 20))),
  feedback.join(" | ").slice(0, 200));

ok("and the Guest App now serves the edit", (await guestText()).includes(MARKER), MARKER);

// ---- the unpublished contract: label truth ----
ok("an unpublished Space would be offered navigation, not a silent publish",
  L.en["studio.navPreviewPublish"] !== L.en["studio.republish"] &&
  L.en["studio.navPreviewPublish"] === "Preview & Publish",
  `${L.en["studio.navPreviewPublish"]} vs ${L.en["studio.republish"]}`);

// ---- keyboard: the control is reachable and operable without a mouse ----
await studio();
const reachable = await page.evaluate((sel) => {
  const list = [...document.querySelectorAll(`${sel} button`)];
  const b = list[list.length - 1];
  if (!b) return null;
  b.focus();
  return { focused: document.activeElement === b, tag: b.tagName, type: b.getAttribute("type"), form: b.getAttribute("form") };
}, TOPBAR);
ok("the publish control is a real focusable submit button", reachable?.focused === true && reachable.tag === "BUTTON" && reachable.type === "submit",
  JSON.stringify(reachable));
ok("and it submits the shared publish form rather than its own action",
  reachable?.form === "studio-top-bar-publish", JSON.stringify(reachable));

// ---- and operable by keyboard, not just focusable ----
// A submit button activated with Enter is the one path a keyboard user
// takes; asserting focusability alone would not prove the form submits.
const beforeKeyboard = await page.locator(`${EDITOR} h1, ${EDITOR} h2`).first().innerText().catch(() => "");
await page.locator(`${TOPBAR} button`).last().focus();
await page.keyboard.press("Enter");
const keyboardPublished = await page.waitForFunction(
  (sel) => {
    const list = [...document.querySelectorAll(`${sel} button`)];
    const b = list[list.length - 1];
    return !!b && (b.disabled || b.getAttribute("aria-busy") === "true");
  },
  TOPBAR, { timeout: 15000 }
).then(() => true).catch(() => false);
ok("pressing Enter on the focused button publishes, like a click", keyboardPublished);
await page.waitForFunction(
  (sel) => {
    const list = [...document.querySelectorAll(`${sel} button`)];
    const b = list[list.length - 1];
    return !!b && !b.disabled && b.getAttribute("aria-busy") !== "true";
  },
  TOPBAR, { timeout: 120000 }
).catch(() => {});
const afterKeyboard = await page.locator(`${EDITOR} h1, ${EDITOR} h2`).first().innerText().catch(() => "");
ok("and the keyboard path does not navigate either", afterKeyboard === beforeKeyboard,
  `"${beforeKeyboard}" -> "${afterKeyboard}"`);

ok("no uncaught client errors", pageErrors.length === 0, pageErrors.join(" ; "));
await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(JSON.stringify({ base: BASE, marker: MARKER, total: results.length, failed: failed.length, results }, null, 1));
process.exit(failed.length ? 1 : 0);
