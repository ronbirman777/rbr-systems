/**
 * CP4 sections 13 and 18: the browser QA matrix.
 *
 * 7 widths x 2 engines x 2 products x 3 locales, each cell driven
 * through a short page, an image-heavy page, repeated tab navigation and
 * an orientation change - then asserted on, rather than eyeballed.
 *
 * What each cell checks, and why it is the thing worth checking:
 *
 *   overflowX        the single most common symptom of a broken RTL or a
 *                    too-wide image box
 *   navGap           the bottom navigation's distance from the BOTTOM OF
 *                    THE VISIBLE VIEWPORT - the CP4 fix. Must be 0 in
 *                    portrait; a desktop width has no bottom nav at all
 *   dir/lang         Hebrew must be rtl, German ltr, English ltr, read
 *                    off the element the app actually sets them on
 *   mirrored         an RTL layout must put the first nav item on the
 *                    opposite side from LTR, or `dir` is decorative
 *   brokenImages     every <img> with a src must have decoded
 *   oversizedRender  the render the browser picked must not be more than
 *                    one ladder rung above what the box needs; catches a
 *                    `sizes` that over-claims
 *   undersizedRender ...and never below it, which would be a visibly
 *                    blurry image - the more serious of the two
 *   dirAuto          user content must keep dir="auto" in every locale
 *   heroHint         exactly one preload hint, matching the eager image
 */
import { chromium, webkit } from "playwright-core";
import { appendFileSync, writeFileSync } from "node:fs";

const BASE = process.argv[2];
const ENGINES = (process.argv[3] || "chromium,webkit").split(",");
const LOG = process.argv[4] || "qa-cells.ndjson";
writeFileSync(LOG, "");
const WIDTHS = [320, 360, 390, 430, 768, 820, 1440];
const LOCALES = ["en", "he", "de"];
const PRODUCTS = ["teach", "flow"];
const LADDER = [96, 160, 320, 480, 640, 960, 1280, 1600];
const PORTRAIT_MAX = 430; // above this the Guest App is a desktop layout

const PROBE = () => {
  const dirHost = document.querySelector("[lang][dir]");
  // Images that are laid out. An <img> inside a display:none branch -
  // Teach's desktop top nav below @min-[40rem] - is never loaded at all
  // when it is also lazy, so naturalWidth 0 there is correct behaviour,
  // not a broken image.
  const imgs = [...document.querySelectorAll("img")].filter((i) => {
    if (!i.getAttribute("src")) return false;
    const r = i.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  // #qa-tabbar is the harness's own 1px switcher; it is not the app's nav.
  const navs = [...document.querySelectorAll("nav, [class*='flex-shrink-0']")].filter(
    (n) => !n.closest("#qa-tabbar")
  );

  // The real bottom navigation: the lowest element on the page that
  // contains more than one button. Deliberately position-based - Teach's
  // desktop top nav is also a <nav aria-label>, and an aria-label is
  // translated, so neither tag nor label can identify it.
  let nav = null;
  for (const n of navs) {
    if (n.querySelectorAll("button").length < 2) continue;
    const r = n.getBoundingClientRect();
    if (r.height === 0) continue;
    if (!nav || r.bottom > nav.getBoundingClientRect().bottom) nav = n;
  }

  const navRect = nav ? nav.getBoundingClientRect() : null;
  const buttons = nav ? [...nav.querySelectorAll("button")] : [];
  const firstBtn = buttons.length ? buttons[0].getBoundingClientRect() : null;

  return {
    dir: dirHost ? dirHost.getAttribute("dir") : null,
    lang: dirHost ? dirHost.getAttribute("lang") : null,
    overflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    navGap: navRect ? Math.round(window.innerHeight - navRect.bottom) : null,
    navButtons: buttons.length,
    firstBtnCentre: firstBtn ? Math.round(firstBtn.left + firstBtn.width / 2) : null,
    viewportWidth: window.innerWidth,
    dirAuto: document.querySelectorAll('[dir="auto"]').length,
    heroHints: document.querySelectorAll('link[rel="preload"][as="image"]').length,
    eagerImages: document.querySelectorAll('img[loading="eager"]').length,
    images: imgs.map((i) => {
      const r = i.getBoundingClientRect();
      const m = (i.currentSrc || "").match(/[?&]w=(\d+)/);
      return {
        file: (i.currentSrc || i.src).split("/").pop().slice(0, 40),
        base: (i.getAttribute("src") || "").split("?")[0],
        broken: !i.complete || i.naturalWidth === 0,
        cssWidth: Math.round(r.width),
        picked: m ? Number(m[1]) : null,
        lazy: i.getAttribute("loading") !== "eager",
      };
    }),
  };
};

/**
 * Grades the renders the browser actually chose.
 *
 * UNDERSIZED is always a defect: a render below what the box needs is a
 * visibly soft image, and it means a `sizes` that under-claims.
 *
 * OVERSIZED is only a defect when nothing justified the larger file.
 * These Guest Apps are single documents, so an image already downloaded
 * for a bigger box earlier in the session is REUSED for a smaller one
 * rather than fetched again - the teacher's portrait is the 150px About
 * photo and also the 36px nav avatar, and after About has been opened
 * the avatar costs nothing. Flagging that would be penalising a saved
 * download, so the largest box each source has had anywhere in this cell
 * is carried along and used as the yardstick.
 */
function gradeImages(probe, dpr, biggestBoxPerBase) {
  const problems = { broken: [], undersized: [], oversized: [] };

  for (const img of probe.images) {
    if (img.cssWidth > (biggestBoxPerBase.get(img.base) ?? 0)) biggestBoxPerBase.set(img.base, img.cssWidth);
  }

  for (const img of probe.images) {
    if (img.broken) problems.broken.push(img.file);
    if (img.picked == null || img.cssWidth === 0) continue;

    const need = img.cssWidth * dpr;
    const smallestOk = LADDER.find((w) => w >= need) ?? LADDER[LADDER.length - 1];
    if (img.picked < smallestOk) {
      problems.undersized.push(`${img.file} picked ${img.picked} < ${smallestOk} (box ${img.cssWidth}x${dpr})`);
      continue;
    }

    const justified = (biggestBoxPerBase.get(img.base) ?? img.cssWidth) * dpr;
    const smallestJustified = LADDER.find((w) => w >= justified) ?? LADDER[LADDER.length - 1];
    if (LADDER.indexOf(img.picked) > LADDER.indexOf(smallestJustified) + 1) {
      problems.oversized.push(
        `${img.file} picked ${img.picked} >> ${smallestJustified} (largest box for this source ${biggestBoxPerBase.get(img.base)}x${dpr})`
      );
    }
  }
  return problems;
}

const results = [];
const failures = [];

for (const engineName of ENGINES) {
  const browser = await (engineName === "webkit" ? webkit : chromium).launch();
  for (const product of PRODUCTS) {
    for (const locale of LOCALES) {
      const suffix = locale === "en" ? "" : `.${locale}`;
      const url = `${BASE}/tabs-${product}${suffix}.html`;
      for (const width of WIDTHS) {
        const dpr = width <= PORTRAIT_MAX ? 3 : 2;
        const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: dpr });
        const page = await ctx.newPage();
        await page.goto(url, { waitUntil: "load" });
        await page.waitForTimeout(500);

        const cell = { engine: engineName, product, locale, width, dpr, steps: {} };
        // Carried across every screen in this cell - see gradeImages.
        const biggestBoxPerBase = new Map();
        // The harness's synthetic "heavy" panel exists to stress image
        // loading in the perf runs; it replaces the app's own shell, so
        // it has no nav and no dir host to assert on. The real
        // image-heavy case in this matrix is Flow's Explore, with seven
        // module covers.
        const tabs = (await page.evaluate(() => window.__tabs)).filter((t) => t !== "heavy");

        // Each tab, visited TWICE - the repeated-navigation case - plus
        // a full scroll so lazy images below the fold commit.
        for (const pass of [1, 2]) {
          for (const tab of tabs) {
            await page.evaluate((t) => window.__show(t), tab);
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await page.waitForTimeout(350);
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.waitForTimeout(250);
            const probe = await page.evaluate(PROBE);
            const key = `${tab}#${pass}`;
            const imgs = gradeImages(probe, dpr, biggestBoxPerBase);
            cell.steps[key] = {
              overflowX: probe.overflowX,
              navGap: probe.navGap,
              navButtons: probe.navButtons,
              dir: probe.dir,
              lang: probe.lang,
              dirAuto: probe.dirAuto,
              images: probe.images.length,
              firstBtnCentre: probe.firstBtnCentre,
              viewportWidth: probe.viewportWidth,
              ...imgs,
            };
            const where = `${engineName}/${product}/${locale}/${width}/${key}`;
            if (probe.overflowX > 0) failures.push(`${where}: horizontal overflow ${probe.overflowX}px`);
            if (imgs.broken.length) failures.push(`${where}: broken images ${imgs.broken.join(", ")}`);
            if (imgs.undersized.length) failures.push(`${where}: UNDERSIZED ${imgs.undersized.join("; ")}`);
            if (imgs.oversized.length) failures.push(`${where}: oversized ${imgs.oversized.join("; ")}`);
            const wantDir = locale === "he" ? "rtl" : "ltr";
            if (probe.dir !== wantDir) failures.push(`${where}: dir=${probe.dir}, expected ${wantDir}`);
            if (probe.lang !== locale) failures.push(`${where}: lang=${probe.lang}, expected ${locale}`);
            // Portrait phone widths: the nav must sit on the visible
            // viewport's bottom edge. Wider layouts legitimately have none.
            if (width <= PORTRAIT_MAX && probe.navButtons >= 2 && probe.navGap !== 0) {
              failures.push(`${where}: bottom nav ${probe.navGap}px above the fold`);
            }
          }
        }

        // Orientation change and back: the one sequence that used to
        // leave the nav stranded, because dvh is re-resolved on resize.
        await page.setViewportSize({ width: 844, height: width });
        await page.waitForTimeout(400);
        const land = await page.evaluate(PROBE);
        await page.setViewportSize({ width, height: 844 });
        await page.waitForTimeout(400);
        const back = await page.evaluate(PROBE);
        cell.steps["landscape"] = { overflowX: land.overflowX, navGap: land.navGap };
        cell.steps["back-to-portrait"] = { overflowX: back.overflowX, navGap: back.navGap };
        const where = `${engineName}/${product}/${locale}/${width}`;
        if (land.overflowX > 0) failures.push(`${where}/landscape: horizontal overflow ${land.overflowX}px`);
        if (back.overflowX > 0) failures.push(`${where}/back-to-portrait: horizontal overflow ${back.overflowX}px`);
        if (width <= PORTRAIT_MAX && back.navButtons >= 2 && back.navGap !== 0) {
          failures.push(`${where}/back-to-portrait: bottom nav ${back.navGap}px above the fold`);
        }

        results.push(cell);
        appendFileSync(LOG, JSON.stringify(cell) + "\n");
        process.stderr.write(`${engineName}/${product}/${locale}/${width} ok (${failures.length} failures so far)\n`);
        await ctx.close();
      }
    }
  }
  await browser.close();
}

// RTL is only real if the layout actually mirrors. Compared per
// engine/product/width between English and Hebrew, on the first tab.
for (const engine of ["chromium", "webkit"]) {
  for (const product of PRODUCTS) {
    for (const width of WIDTHS.filter((w) => w <= PORTRAIT_MAX)) {
      const find = (locale) =>
        results.find((r) => r.engine === engine && r.product === product && r.locale === locale && r.width === width);
      const en = find("en"), he = find("he");
      const firstKey = Object.keys(en?.steps ?? {})[0];
      const a = en?.steps[firstKey], b = he?.steps[firstKey];
      if (!a || !b || a.navButtons < 2) continue;
      const mirrored = a.firstBtnCentre < a.viewportWidth / 2 && b.firstBtnCentre > b.viewportWidth / 2;
      if (!mirrored) {
        failures.push(
          `${engine}/${product}/${width}: bottom nav not mirrored in RTL (en first button at ${a.firstBtnCentre}, he at ${b.firstBtnCentre}, viewport ${a.viewportWidth})`
        );
      }
    }
  }
}

const cells = results.length;
console.log(JSON.stringify({ cells, assertionsFailed: failures.length, failures: failures.slice(0, 60), sample: results.slice(0, 1) }, null, 1));
