/**
 * CP4 cold/warm load, measured on the REAL rendered Guest Apps.
 *
 * Pages come from fixture/render.tsx, which streams the actual
 * components (so React's head hoisting happens, and the LCP preload hint
 * is present exactly as it ships). /api/media is modelled: 3 DB round
 * trips and a signing call per request, identical in both arms, so the
 * deltas are honest even though the absolute latency is not Staging's.
 *
 * Arms: `legacy` = no-store with a fresh token per request, i.e. today.
 *       `cached` = the CP4 policy for a versioned published object in a
 *                  public Space, plus width-aware renders.
 */
import { chromium } from "playwright-core";

const BASE = process.argv[2];
const LABEL = process.argv[3];
const RUNS = Number(process.argv[4] || 5);
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const snap = async () => (await fetch(`${BASE}/__stats`)).json();
const reset = async () => { await fetch(`${BASE}/__stats/reset`); };

async function throttled(ctx) {
  const page = await ctx.newPage();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false, latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  return page;
}

async function vitals(page) {
  await page.waitForTimeout(2400);
  return page.evaluate(() => new Promise((res) => {
    const out = { lcp: 0, fcp: 0, hero: 0 };
    const f = performance.getEntriesByName("first-contentful-paint")[0];
    if (f) out.fcp = Math.round(f.startTime);
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) out.lcp = Math.round(e.startTime); })
      .observe({ type: "largest-contentful-paint", buffered: true }); } catch {}
    // The hero specifically: the one image the app marked eager.
    const eager = [...document.querySelectorAll('img[loading="eager"]')];
    const times = eager
      .map((i) => performance.getEntriesByType("resource").find((r) => r.name.endsWith(i.currentSrc.split(location.origin)[1] || "@@")))
      .filter(Boolean).map((r) => Math.round(r.responseEnd));
    out.hero = times.length ? Math.max(...times) : 0;
    setTimeout(() => res(out), 300);
  }));
}

const browser = await chromium.launch();
const out = {};
for (const [name, path] of [["teach", "/teach-home.html"], ["flow", "/flow.html"]]) {
  const cold = [], warm = [];
  let coldSrv, warmSrv;
  for (let i = 0; i < RUNS; i++) {
    let ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    let page = await throttled(ctx);
    await reset();
    await page.goto(BASE + path, { waitUntil: "load" });
    cold.push(await vitals(page));
    if (i === 0) coldSrv = await snap();
    await ctx.close();

    // Warm: the same context visits twice; only the second is counted.
    ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    page = await throttled(ctx);
    await page.goto(BASE + path, { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await reset();
    await page.goto(BASE + path, { waitUntil: "load" });
    warm.push(await vitals(page));
    if (i === 0) warmSrv = await snap();
    await ctx.close();
  }
  const sum = (rs, srv) => ({
    lcp: median(rs.map((r) => r.lcp)), fcp: median(rs.map((r) => r.fcp)),
    heroReady: median(rs.map((r) => r.hero)),
    serverApiMedia: srv.apiMedia, serverStorage: srv.storage,
    storageKB: Math.round(srv.storageBytes / 1024),
  });
  out[name] = { cold: sum(cold, coldSrv), warm: sum(warm, warmSrv) };
}
await browser.close();
console.log(JSON.stringify({ label: LABEL, ...out }, null, 1));
