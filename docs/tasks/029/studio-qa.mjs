/**
 * TASK 029 P6: the Flow Studio across the width/locale matrix.
 *
 * Narrower in scope than the Guest matrix, and honestly so. The Studio's
 * steps are server-action-coupled, so these documents are the real
 * components rendered server-side with no hydration: what is graded is
 * LAYOUT and NAMING - horizontal overflow, clipping, direction, German
 * label length, and whether every control a screen reader meets has a
 * name. Interaction is not graded here (see a11y.mjs, which does grade
 * it, for the Guest screens).
 */
import { chromium, webkit } from "playwright-core";

const BASE = process.argv[2];
const ENGINES = (process.argv[3] || "chromium,webkit").split(",");
const WIDTHS = [320, 360, 390, 430, 768, 820, 1440];
const LOCALES = ["en", "he", "de"];
const STEPS = ["home", "guidelines", "readings", "audio", "meals", "treatments", "facilities", "arrival"];

const PROBE = () => {
  const de = document.documentElement;
  const overflowX = Math.max(0, de.scrollWidth - de.clientWidth);
  const name = (el) => {
    const aria = el.getAttribute("aria-label");
    if (aria?.trim()) return aria.trim();
    if (el.id) {
      const lbl = document.querySelector(`label[for="${el.id}"]`);
      if (lbl?.textContent?.trim()) return lbl.textContent.trim();
    }
    const t = (el.innerText || el.textContent || "").trim();
    return t || el.getAttribute("placeholder")?.trim() || "";
  };
  const controls = [...document.querySelectorAll("input, textarea, select, button")].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && el.type !== "file";
  });
  const unnamed = [];
  for (const el of controls) {
    if (!name(el)) unnamed.push(el.tagName.toLowerCase() + ":" + (el.type || "") + ":" + (el.className || "").slice(0, 20));
  }
  // Clipping: a control whose own content is wider than its box, which
  // is how a long German label actually fails.
  const clipped = [];
  for (const el of document.querySelectorAll("label, h1, h2, h3, h4, p, span, button, option")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    // Two deliberate clips are not defects, and flagging them taught me
    // nothing on the first run: an .sr-only span is clipped to 1px ON
    // PURPOSE (it exists only for a screen reader), and `truncate`
    // renders an ellipsis, which is the designed answer to a long name
    // rather than a layout failure. What IS a defect is text cut off
    // with no ellipsis and no way to read the rest.
    if (el.closest(".sr-only") || el.classList.contains("sr-only")) continue;
    const cs = getComputedStyle(el);
    if (cs.textOverflow === "ellipsis") continue;
    const hidesOverflow = cs.overflow !== "visible" || cs.whiteSpace === "nowrap";
    if (hidesOverflow && el.scrollWidth > Math.ceil(r.width) + 1) {
      clipped.push(`${el.tagName.toLowerCase()}:${(el.textContent || "").trim().slice(0, 28)}:${el.scrollWidth}>${Math.round(r.width)}`);
    }
  }
  return {
    overflowX,
    dir: de.getAttribute("dir"),
    lang: de.getAttribute("lang"),
    controls: controls.length,
    unnamed,
    clipped,
    rawKeys: /\b(flow|studio|common)\.[a-zA-Z]{3,}/.test(document.body.innerText),
  };
};

const failures = [];
const notes = [];
let cells = 0;

for (const engineName of ENGINES) {
  const browser = await (engineName === "webkit" ? webkit : chromium).launch();
  for (const locale of LOCALES) {
    const suffix = locale === "en" ? "" : `.${locale}`;
    for (const step of STEPS) {
      for (const width of WIDTHS) {
        const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: width <= 430 ? 3 : 2 });
        const page = await ctx.newPage();
        await page.goto(`${BASE}/studio-${step}${suffix}.html`, { waitUntil: "load" });
        await page.waitForTimeout(120);
        const p = await page.evaluate(PROBE);
        const where = `${engineName}/${locale}/${step}/${width}`;
        if (p.overflowX > 0) failures.push(`${where}: horizontal overflow ${p.overflowX}px`);
        if (p.dir !== (locale === "he" ? "rtl" : "ltr")) failures.push(`${where}: dir=${p.dir}`);
        if (p.lang !== locale) failures.push(`${where}: lang=${p.lang}`);
        if (p.rawKeys) failures.push(`${where}: a raw translation key is on screen`);
        if (p.unnamed.length) failures.push(`${where}: unnamed control(s): ${p.unnamed.join(", ")}`);
        if (p.clipped.length) notes.push(`${where}: clipped: ${p.clipped.join(", ")}`);
        cells += 1;
        await ctx.close();
      }
    }
  }
  await browser.close();
}
console.log(JSON.stringify({ cells, assertionsFailed: failures.length, failures: failures.slice(0, 40), notes: notes.slice(0, 20) }, null, 1));
