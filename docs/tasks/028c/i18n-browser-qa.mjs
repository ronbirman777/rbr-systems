/**
 * CP3B browser QA.
 *
 * For every (surface x locale x width) it checks the four things the
 * execution plan asks about, by measurement rather than by eye:
 *   - no horizontal overflow of the document or of any element
 *   - no clipped text (scrollWidth exceeding clientWidth on a text node)
 *   - every interactive control still meets a 44px touch target
 *   - no untranslated English system label leaking into he/de
 * and writes a screenshot per cell for visual review.
 */
import { chromium } from "playwright-core";
import { readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = process.argv[2];
const SHOTS = join(OUT, "shots");
mkdirSync(SHOTS, { recursive: true });
const WIDTHS = [320, 360, 390, 430, 768, 820, 1440];

// English system words that must never appear in a he/de render. Chosen to
// be unambiguous: each is a system label, none is organizer content in the
// fixtures, and none is a brand name.
const ENGLISH_LEAKS = [
  "Today’s classes", "No classes today", "See full schedule", "Get in touch",
  "About me", "Styles I teach", "Training & certificates", "Teaching philosophy",
  "Choose a day", "Schedule type", "Group classes", "Private sessions",
  "How to register", "How to get there", "Price", "Spots", "Length",
  "Your Retreat", "Meals", "Treatments", "Facilities", "Arrival", "Stay Connected",
  "Good morning.", "Up Next", "Happening Now", "Check-in", "Check-out",
  "Getting Here", "What to Bring", "Important Notes", "Open in Maps",
  "Your Guides", "Frequently Asked Questions", "Spaces & Amenities",
  "Breakfast", "Lunch", "Dinner", "Read more", "To book", "Nothing scheduled",
  // Studio
  "Save changes", "All changes saved", "Studio sections", "My teaching space",
  "Identity", "Brand", "Modules", "Preview & Publish", "Publish now",
  "Colour palette", "Palette presets", "Look & feel", "Primary colour",
  "Accent colour", "Background tint", "Typography pairing", "Card corners",
  "Hero layout", "Quote style", "Image overlay", "Section spacing",
  "Background texture", "Dividers", "Organic background shapes",
  "Who you are", "My name", "Teacher type", "Time zone", "Guest address",
  "Primary image", "Daily Inspiration", "Explore library", "Add class",
  "Readings", "Audio library", "Contact methods", "Pages", "Ready to publish?",
  // Flow Studio
  "Build your schedule", "Add your facilitators", "Brand your experience",
  "Tell us about your retreat", "Choose what your guests can access",
  "Retreat name", "Retreat details", "Guest address", "Share your Space",
  "Readability check", "Continue to Brand", "Continue to Modules",
  "Today is always included", "Arrival Info", "Custom Pages", "Stay Connected",
  "Save draft", "Check availability", "Reserve this address",
];

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM,
  args: ["--font-render-hinting=none"],
});
const results = [];

for (const file of readdirSync(OUT).filter((f) => f.endsWith(".html")).sort()) {
  const [surface, locale] = file.replace(".html", "").split(".");
  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    await page.goto("file://" + join(OUT, file));
    await page.waitForLoadState("load");

    const r = await page.evaluate((leaks) => {
      const doc = document.documentElement;
      const body = document.body;
      const pageOverflow = Math.max(doc.scrollWidth, body.scrollWidth) - doc.clientWidth;

      // Elements wider than the viewport, excluding deliberate
      // horizontal scrollers (the day strip, category chips).
      const overflowing = [];
      for (const el of document.querySelectorAll("*")) {
        const s = getComputedStyle(el);
        if (s.overflowX === "auto" || s.overflowX === "scroll") continue;
        let scroller = false;
        for (let p = el.parentElement; p; p = p.parentElement) {
          const ps = getComputedStyle(p);
          if (ps.overflowX === "auto" || ps.overflowX === "scroll") { scroller = true; break; }
        }
        if (scroller) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width > doc.clientWidth + 1) {
          overflowing.push({ tag: el.tagName, cls: String(el.className).slice(0, 60), w: Math.round(rect.width) });
        }
      }

      // Text that is cut off: a leaf element whose content is wider than
      // its box and which is not itself allowed to scroll or ellipsis.
      const clipped = [];
      for (const el of document.querySelectorAll("p,span,h1,h2,h3,button,a,dt,dd,label,li")) {
        if (el.children.length) continue;
        const s = getComputedStyle(el);
        if (s.textOverflow === "ellipsis" || s.overflowX !== "visible") continue;
        if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
          clipped.push({ text: (el.textContent || "").trim().slice(0, 48), over: el.scrollWidth - el.clientWidth });
        }
      }

      // Touch targets below 44px on a real control with a visible box.
      const small = [];
      for (const el of document.querySelectorAll("button,a[href],input,select,[role=button],[role=radio],[role=option],[role=tab]")) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        if (rect.height < 43.5) {
          small.push({ tag: el.tagName, h: Math.round(rect.height), text: (el.textContent || "").trim().slice(0, 32) });
        }
      }

      const text = body.innerText || "";
      const found = leaks.filter((l) => text.includes(l));
      const dir = doc.getAttribute("dir");
      const lang = doc.getAttribute("lang");
      // Mixed content: what direction did the browser RESOLVE for each
      // dir="auto" block? That is the actual rule being tested, not the
      // presence of the attribute.
      const autoBlocks = [...document.querySelectorAll('[dir="auto"]')].map((el) => ({
        resolved: getComputedStyle(el).direction,
        sample: (el.textContent || "").trim().slice(0, 36),
      }));
      // Directional icons must mirror in RTL and only in RTL.
      const mirrored = [...document.querySelectorAll(".rtl-mirror")].map((el) => getComputedStyle(el).transform);
      return { pageOverflow, overflowing, clipped, small, found, dir, lang, autoBlocks, mirrored };
    }, ENGLISH_LEAKS);

    const leaks = locale === "en" ? [] : r.found;
    await page.screenshot({ path: join(SHOTS, `${surface}.${locale}.${width}.png`), fullPage: true });
    results.push({ surface, locale, width, ...r, leaks });
    await page.close();
  }
}
await browser.close();
writeFileSync(join(OUT, "qa-results.json"), JSON.stringify(results, null, 1));

// ---- report ----
const bad = (r) => r.pageOverflow > 1 || r.overflowing.length || r.clipped.length || r.small.length || r.leaks.length;
console.log(`cells: ${results.length}`);
console.log(`clean: ${results.filter((r) => !bad(r)).length}`);
console.log(`issues: ${results.filter(bad).length}\n`);
for (const r of results.filter(bad)) {
  console.log(`${r.surface} ${r.locale} @${r.width}`);
  if (r.pageOverflow > 1) console.log(`   page overflows by ${r.pageOverflow}px`);
  for (const o of r.overflowing.slice(0, 3)) console.log(`   wide ${o.tag} ${o.w}px .${o.cls}`);
  for (const c of r.clipped.slice(0, 4)) console.log(`   clipped +${c.over}px: ${JSON.stringify(c.text)}`);
  for (const s of r.small.slice(0, 4)) console.log(`   target ${s.h}px ${s.tag} ${JSON.stringify(s.text)}`);
  for (const l of r.leaks) console.log(`   ENGLISH LEAK: ${JSON.stringify(l)}`);
}
console.log("\ndir / lang / mixed content / icon mirroring (at 390px):");
for (const r of results.filter((x) => x.width === 390)) {
  const flipped = r.mirrored.filter((m) => m.includes("-1")).length;
  console.log(`   ${r.surface.padEnd(22)} ${r.locale}  lang=${r.lang} dir=${r.dir}  rtl-mirror=${flipped}/${r.mirrored.length} flipped`);
  for (const a of r.autoBlocks) console.log(`        dir=auto resolved ${a.resolved}: ${JSON.stringify(a.sample)}`);
}
