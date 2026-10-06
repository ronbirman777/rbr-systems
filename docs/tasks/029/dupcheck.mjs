import { chromium } from "playwright-core";
const [, , U, B] = process.argv;
const b = await chromium.launch();
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  extraHTTPHeaders: { "x-vercel-protection-bypass": B, "x-vercel-set-bypass-cookie": "true" },
});
const p = await ctx.newPage();
await p.goto(`${U}/g/3e6e4978-79a3-4912-98b5-c26d15d30155`, { waitUntil: "networkidle" });
const count = (s, n) => (s.match(new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
const home = await p.evaluate(() => document.body.innerText);
console.log("RENDERED on Home:");
console.log("  canonical 'Canonical towel':        ", count(home, "Canonical towel"), "(expected 1)");
console.log("  legacy 'A towel, a water bottle':   ", count(home, "A towel, a water bottle"), "(expected 0 - canonical wins)");
console.log("  legacy welcome 'Welcome QA':        ", count(home, "Welcome QA"), "(expected 1 - the fallback, no canonical welcome set)");
const click = async (needle) => {
  for (const el of await p.$$("button")) {
    const t = (await el.innerText()).trim().toLowerCase();
    if (t.includes(needle)) { await el.click(); await p.waitForTimeout(700); return true; }
  }
  return false;
};
console.log("  explore tab:", await click("explore"), "| arrival card:", await click("arrival"));
const arrival = await p.evaluate(() => document.body.innerText);
console.log("RENDERED on the Arrival screen:");
console.log("  legacy 'A towel, a water bottle':   ", count(arrival, "A towel, a water bottle"), "(expected 0)");
console.log("  legacy welcome 'Welcome QA':        ", count(arrival, "Welcome QA"), "(expected 0)");
console.log("  canonical 'Canonical towel':        ", count(arrival, "Canonical towel"), "(expected 0 - Home owns it)");
console.log("  the fields that stayed (check-in):  ", /15:00|11:00/.test(arrival));
console.log("  'What to Bring' heading gone:       ", !/what to bring/i.test(arrival));
await b.close();
