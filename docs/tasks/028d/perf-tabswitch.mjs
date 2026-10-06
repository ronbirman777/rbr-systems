/**
 * CP4 section 9: what a REAL tab press costs.
 *
 * The Guest bottom nav is a React state switch inside one already-loaded
 * document, so this drives the fixture the same way a thumb does - press
 * a tab, wait for its images to settle, read the server's own counters -
 * and reports per-step cost rather than one total, because the question
 * is specifically "does revisiting a tab refetch unchanged media".
 */
import { chromium, webkit } from "playwright-core";

const BASE = process.argv[2] || "http://localhost:4178";
const LABEL = process.argv[3] || "run";
const ENGINE = process.argv[4] || "chromium";

async function throttle(page) {
  if (ENGINE !== "chromium") return;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false, latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
}

const snap = async () => (await fetch(`${BASE}/__stats`)).json();
const reset = async () => { await fetch(`${BASE}/__stats/reset`); };

const browser = await (ENGINE === "webkit" ? webkit : chromium).launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
await throttle(page);

await reset();
await page.goto(`${BASE}/tabs-teach.html`, { waitUntil: "load" });
await page.waitForTimeout(2500);

const steps = [];
let prev = await snap();
steps.push({ step: "initial load (home)", apiMedia: prev.apiMedia, storage: prev.storage, kb: Math.round(prev.storageBytes / 1024) });

// First visits, a revisit of each, then an image-heavy screen and back.
for (const tab of ["explore", "about", "home", "explore", "about", "heavy", "explore", "heavy"]) {
  // Driven through the switch itself rather than a synthetic click: the
  // captured screens carry the real app's own fixed bottom nav, which
  // sits over the harness's, and what is being measured is the subtree
  // swap, not hit testing.
  await page.evaluate((t) => window.__show(t), tab);
  // Scroll the whole panel so lazy images below the fold actually commit,
  // then back to the top - a thumb does this, and without it "lazy"
  // would flatter the numbers.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(800);
  const now = await snap();
  steps.push({
    step: `press ${tab}`,
    apiMedia: now.apiMedia - prev.apiMedia,
    storage: now.storage - prev.storage,
    kb: Math.round((now.storageBytes - prev.storageBytes) / 1024),
  });
  prev = now;
}

const total = await snap();
await browser.close();
console.log(JSON.stringify({
  label: LABEL, engine: ENGINE, steps,
  total: { apiMedia: total.apiMedia, storage: total.storage, kb: Math.round(total.storageBytes / 1024) },
}, null, 1));
