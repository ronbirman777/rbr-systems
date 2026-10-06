/**
 * CP4 section 8, measured against the SHIPPED prefetcher.
 *
 * Section 9 established that revisiting a tab already costs nothing - the
 * per-document image cache covers it, before CP4 as well as after. So the
 * only cost left on a tab press is the FIRST visit to each tab, and the
 * only question section 8 has to answer is whether paying for those bytes
 * early is worth it. Three arms:
 *
 *   none        today's behaviour
 *   prefetch    lib/media/prefetch.ts, driven by the real inventory that
 *               teachPrefetchItems/guestPrefetchItems computed at render
 *               time, after load + idle, two at a time, low priority
 *   Save-Data   the same, with the metered-connection signal set, to
 *               prove the guard actually withholds it
 *
 * The tab pressed must be one the inventory actually warms, or the test
 * would be comparing the warming of one set of images against the
 * loading of another.
 */
import { chromium } from "playwright-core";

const BASE = process.argv[2];
const PRODUCT = process.argv[3] || "teach";
const TAB = process.argv[4] || "explore";
// How many of the inventory's entries to warm, to price the cap itself.
const CAP = Number(process.argv[5] || 0);

const snap = async () => (await fetch(`${BASE}/__stats`)).json();
const reset = async () => { await fetch(`${BASE}/__stats/reset`); };

async function once(browser, { prefetch, saveData }) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  // Set before any navigation, or the current document never sees it.
  if (saveData) {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "connection", {
        value: { saveData: true, effectiveType: "4g" }, configurable: true,
      });
    });
  }
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false, latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  await reset();
  await page.goto(`${BASE}/tabs-${PRODUCT}.html`, { waitUntil: "load", timeout: 30000 });

  if (prefetch) {
    // The real inventory, lifted from the rendered page that carries it,
    // then the real bundle - no reimplementation on either side.
    const src = PRODUCT === "teach" ? "/teach-home-prefetch.html" : "/flow-prefetch.html";
    const json = await page.evaluate(async (u) => {
      const html = await (await fetch(u)).text();
      const m = html.match(/id="prefetch-items"[^>]*>([\s\S]*?)<\/script>/);
      return m ? m[1] : "[]";
    }, src);
    const trimmed = CAP ? JSON.stringify(JSON.parse(json).slice(0, CAP)) : json;
    await page.evaluate((j) => {
      const s = document.createElement("script");
      s.id = "prefetch-items";
      s.type = "application/json";
      s.textContent = j;
      document.body.appendChild(s);
    }, trimmed);
    await page.addScriptTag({ url: "/prefetch.js" });
  }

  await page.waitForTimeout(4500); // load + idle + the warming itself
  const afterWarm = await snap();
  const started = await page.evaluate(() => window.__prefetchStarted ?? null);
  const warmed = await page.evaluate(() => document.querySelectorAll('link[rel="preload"][as="image"][fetchpriority="low"]').length);

  const pressed = await page.evaluate(async (t) => {
    const t0 = performance.now();
    window.__show(t);
    // Only the images the visitor can actually SEE. A lazy image below
    // the fold is never requested at all until it is scrolled toward, so
    // waiting on its load event waits forever - and it is not part of
    // what the press has to paint anyway.
    const visible = [...document.querySelectorAll("#screen img")].filter((i) => {
      const r = i.getBoundingClientRect();
      return r.bottom > 0 && r.top < window.innerHeight && r.width > 0;
    });
    const settle = (i) =>
      i.complete && i.naturalWidth
        ? Promise.resolve()
        : new Promise((r) => {
            i.addEventListener("load", r, { once: true });
            i.addEventListener("error", r, { once: true });
            setTimeout(r, 8000); // never hang the measurement on one image
          });
    await Promise.all(visible.map(settle));
    await Promise.all(visible.map((i) => i.decode().catch(() => {})));
    return { ms: Math.round(performance.now() - t0), images: visible.length };
  }, TAB);

  const end = await snap();
  await ctx.close();
  return {
    pressToPainted_ms: pressed.ms,
    imagesOnScreen: pressed.images,
    mediaRequestsAtPress: end.apiMedia - afterWarm.apiMedia,
    kb_spentBeforePress: Math.round(afterWarm.storageBytes / 1024),
    kb_spentAtPress: Math.round((end.storageBytes - afterWarm.storageBytes) / 1024),
    warmHintsInHead: warmed,
    warmingStartedAt_ms: started,
  };
}

const browser = await chromium.launch();
const out = { product: PRODUCT, pressed: TAB };
for (const [arm, opts] of [
  ["none", {}],
  ["prefetch", { prefetch: true }],
  ["prefetch + Save-Data", { prefetch: true, saveData: true }],
]) {
  out[arm] = await once(browser, opts);
}
await browser.close();
console.log(JSON.stringify(out, null, 1));
