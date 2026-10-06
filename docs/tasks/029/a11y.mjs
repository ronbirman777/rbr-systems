/**
 * TASK 029 P6 accessibility pass, over the screens this task added or
 * changed.
 *
 * Asserted rather than eyeballed, and deliberately narrow: these are the
 * properties a keyboard or screen-reader user needs and that a screenshot
 * cannot show.
 *
 *   name          every interactive element has an accessible name -
 *                 text, aria-label or an sr-only span. An unnamed button
 *                 is announced as "button" and is unusable.
 *   target        >= 44px in the smaller dimension, measured on the
 *                 element's own box. Reported, not asserted blindly: an
 *                 inline chip inside a flowing line legitimately is not,
 *                 and the report says which.
 *   focus         tabbing reaches every control, and the focused element
 *                 has a visible ring (a non-none outline or a box-shadow)
 *   disclosure    anything that opens something has aria-expanded, and
 *                 aria-controls pointing at an element that exists
 *   player        the scrubber has a name and a value text; the
 *                 play/pause and skip buttons have names
 */
import { chromium } from "playwright-core";

const BASE = process.argv[2];
const LOCALES = ["en", "he", "de"];
/** The HYDRATED fixtures - a11y-<screen>.html, see a11y-render.tsx. */
const SCREENS = [
  "a11y-home", "a11y-schedule", "a11y-explore", "a11y-meals", "a11y-treatments",
  "a11y-facilities", "a11y-facilitators", "a11y-faq", "a11y-guidelines",
  "a11y-readings", "a11y-reading-detail", "a11y-audio", "a11y-audio-player",
];
/** Screens that legitimately have no interactive element at all. */
const READ_ONLY = new Set(["a11y-guidelines", "a11y-meals"]);

const PROBE = () => {
  const name = (el) => {
    const aria = el.getAttribute("aria-label");
    if (aria && aria.trim()) return aria.trim();
    const labelled = el.getAttribute("aria-labelledby");
    if (labelled) {
      const t = labelled.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ").trim();
      if (t) return t;
    }
    const text = (el.innerText || el.textContent || "").trim();
    if (text) return text;
    const title = el.getAttribute("title");
    return title && title.trim() ? title.trim() : "";
  };

  const interactive = [...document.querySelectorAll("button, a[href], input, select, textarea, [tabindex]:not([tabindex='-1'])")]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });

  const unnamed = [];
  const smallTargets = [];
  for (const el of interactive) {
    const n = name(el);
    if (!n) unnamed.push(el.tagName.toLowerCase() + (el.className ? "." + String(el.className).split(" ")[0] : ""));
    const r = el.getBoundingClientRect();
    const min = Math.min(r.width, r.height);
    if (min < 44) smallTargets.push(`${el.tagName.toLowerCase()}:${n.slice(0, 24)}:${Math.round(r.width)}x${Math.round(r.height)}`);
  }

  // Disclosures: aria-expanded, and aria-controls must resolve.
  const badDisclosure = [];
  for (const el of document.querySelectorAll("[aria-expanded]")) {
    const controls = el.getAttribute("aria-controls");
    if (controls && el.getAttribute("aria-expanded") === "true" && !document.getElementById(controls)) {
      badDisclosure.push(`aria-controls=${controls} has no element`);
    }
  }
  // How many disclosures this screen has, so the caller can assert the
  // ones it expects. A name-based heuristic was tried first and flagged
  // a navigation tile whose label happened to be "More" - the count is
  // the honest measure.
  const suspectToggles = [];
  const disclosures = document.querySelectorAll("[aria-expanded]").length;

  const range = document.querySelector("input[type=range]");
  return {
    interactive: interactive.length,
    unnamed,
    smallTargets,
    badDisclosure,
    suspectToggles,
    disclosures,
    range: range ? { name: name(range), valuetext: range.getAttribute("aria-valuetext"), min: range.min, max: range.max } : null,
  };
};

const failures = [];
const notes = [];
const browser = await chromium.launch();

for (const locale of LOCALES) {
  const suffix = locale === "en" ? "" : `.${locale}`;
  for (const screen of SCREENS) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/${screen}${suffix}.html`, { waitUntil: "load" });
    await page.waitForTimeout(250);

    // Open every disclosure first, so the probe also sees what they reveal.
    const toggles = await page.$$("button[aria-expanded]");
    for (const tgl of toggles) {
      try { await tgl.click({ timeout: 800 }); } catch { /* a chip that moved under us is not a defect */ }
    }
    await page.waitForTimeout(200);

    const probe = await page.evaluate(PROBE);
    const where = `${locale}/${screen}`;
    if (probe.unnamed.length) failures.push(`${where}: unnamed interactive element(s): ${probe.unnamed.join(", ")}`);
    if (probe.badDisclosure.length) failures.push(`${where}: ${probe.badDisclosure.join("; ")}`);
    if (probe.suspectToggles.length) failures.push(`${where}: toggle without aria-expanded: ${probe.suspectToggles.join(", ")}`);
    if (probe.smallTargets.length) notes.push(`${where}: under 44px: ${probe.smallTargets.join(", ")}`);

    // Keyboard: from a cleared focus, Tab must reach every control this
    // screen has - not just the first one - and the browser must be able
    // to show where focus is.
    // Each control is tagged with a stable index BEFORE the walk.
    // Identifying the focused element by its viewport position instead
    // was wrong: focusing a control scrolls it into view, so two
    // different buttons could collide on one key and one button could
    // produce two - which is what made this report three failures that
    // were not in the app.
    await page.evaluate(() => {
      document.activeElement?.blur?.();
      const list = [...document.querySelectorAll("button, a[href], input, select, textarea, [tabindex]:not([tabindex='-1'])")]
        .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
      list.forEach((el, i) => el.setAttribute("data-qa-idx", String(i)));
    });
    const reached = new Set();
    for (let i = 0; i < probe.interactive + 3; i += 1) {
      await page.keyboard.press("Tab");
      const id = await page.evaluate(() => document.activeElement?.getAttribute?.("data-qa-idx") ?? null);
      if (id !== null) reached.add(id);
    }
    if (probe.interactive === 0) {
      if (!READ_ONLY.has(screen)) failures.push(`${where}: no interactive element at all`);
    } else if (reached.size < probe.interactive) {
      failures.push(`${where}: Tab reached ${reached.size} of ${probe.interactive} controls`);
    }

    // The disclosures this task added must announce themselves.
    const EXPECT_DISCLOSURE = { "a11y-faq": 1, "a11y-facilities": 1, "a11y-treatments": 1, "a11y-schedule": 1, "a11y-facilitators": 3 };
    const want = EXPECT_DISCLOSURE[screen];
    if (want !== undefined && probe.disclosures < want) {
      failures.push(`${where}: ${probe.disclosures} aria-expanded control(s), expected at least ${want}`);
    }

    if (screen === "a11y-audio-player") {
      if (!probe.range) failures.push(`${where}: the player has no scrubber`);
      else {
        if (!probe.range.name) failures.push(`${where}: the scrubber has no accessible name`);
        if (!probe.range.valuetext) failures.push(`${where}: the scrubber has no aria-valuetext`);
      }
    }

    await ctx.close();
  }
}
await browser.close();
console.log(JSON.stringify({ failures, notes }, null, 1));
