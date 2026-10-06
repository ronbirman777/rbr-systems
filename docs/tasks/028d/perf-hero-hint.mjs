/**
 * The hero preload hint, judged on what a visitor actually sees rather
 * than on LCP alone.
 *
 * LCP turned out to be a misleading single number here: making the hero
 * arrive sooner can hand the LCP title to a DIFFERENT, smaller, later
 * image, so the metric worsens while the page genuinely got faster. So
 * this measures three things per arm:
 *
 *   heroPainted  - when the hero image itself is decoded and on screen
 *   aboveFold    - when every image inside the first viewport is decoded
 *   lcp          - the metric, kept for continuity, with its element
 */
import { chromium } from "playwright-core";
const BASE = process.argv[2];
const RUNS = Number(process.argv[3] || 5);
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function run(browser, path) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6*1024*1024)/8, uploadThroughput: (750*1024)/8 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  // Installed before any markup is parsed, so no image load is missed.
  await page.addInitScript(() => {
    window.__paint = [];
    const stamp = (img) => {
      const done = () => window.__paint.push({
        src: img.currentSrc || img.src, t: Math.round(performance.now()),
        area: img.getBoundingClientRect().width * img.getBoundingClientRect().height,
        top: img.getBoundingClientRect().top,
        eager: img.getAttribute("loading") === "eager",
      });
      if (img.complete && img.naturalWidth) done();
      else img.addEventListener("load", done, { once: true });
    };
    new MutationObserver((recs) => {
      for (const r of recs) for (const n of r.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.tagName === "IMG") stamp(n);
        else n.querySelectorAll?.("img").forEach(stamp);
      }
    }).observe(document, { childList: true, subtree: true });
  });

  await page.goto(BASE + path, { waitUntil: "load" });
  await page.waitForTimeout(2400);
  const out = await page.evaluate(() => new Promise((res) => {
    let lcp = { t: 0, el: "?" };
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) lcp = {
      t: Math.round(e.startTime),
      el: e.element ? e.element.tagName + (e.element.currentSrc ? ":" + e.element.currentSrc.split("/").slice(-1)[0].slice(0, 22) : "") : "?",
    }; }).observe({ type: "largest-contentful-paint", buffered: true }); } catch {}
    setTimeout(() => {
      const p = window.__paint;
      const hero = p.filter((x) => x.eager).sort((a, b) => b.area - a.area)[0];
      const fold = p.filter((x) => x.top < 844 && x.area > 2000);
      res({
        heroPainted: hero ? hero.t : null,
        aboveFold: fold.length ? Math.max(...fold.map((x) => x.t)) : null,
        aboveFoldCount: fold.length,
        aboveFoldLazy: fold.filter((x) => !x.eager).map((x) => x.src.split("/").slice(-1)[0].slice(0, 24)),
        lcp: lcp.t, lcpEl: lcp.el,
      });
    }, 300);
  }));
  await ctx.close();
  return out;
}

const browser = await chromium.launch();
const results = {};
for (const name of ["teach-home", "flow"]) {
  const arms = {};
  for (const [arm, path] of [["plain", `/${name}.html`], ["preload", `/${name}-preload.html`]]) {
    const rs = [];
    for (let i = 0; i < RUNS; i++) rs.push(await run(browser, path));
    arms[arm] = {
      heroPainted: median(rs.map((r) => r.heroPainted)),
      aboveFold: median(rs.map((r) => r.aboveFold)),
      lcp: median(rs.map((r) => r.lcp)),
      lcpEl: rs[0].lcpEl,
      aboveFoldCount: rs[0].aboveFoldCount,
      aboveFoldLazy: rs[0].aboveFoldLazy,
    };
  }
  results[name] = arms;
}
await browser.close();
console.log(JSON.stringify(results, null, 1));
