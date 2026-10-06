/**
 * The one new media surface this task added: an audio file on a Flow
 * track. Uploaded through the real file input, in the real Studio, as the
 * synthetic Staging QA owner - so the whole path is exercised: the
 * upload action, the versioned create-only object path, the duration
 * probe, the save, the publish, and whether a guest can actually play it.
 *
 * The file is a real 2-second MP3 (generated with ffmpeg, not a renamed
 * text file), because the server reads its duration.
 *
 * Usage: see locale-journey.mjs. Adds AUDIO=<path to an .mp3>.
 */
const { BASE, BYPASS, QA_EMAIL, QA_PW, PW, AUDIO } = process.env;
const { chromium } = await import(PW);
const FLOW = "3e6e4978-79a3-4912-98b5-c26d15d30155";
const EDITOR = '[data-testid="studio-editor"]';

const results = [];
const ok = (name, pass, detail = "") => results.push({ name, pass: !!pass, detail: String(detail).slice(0, 300) });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 950 },
  extraHTTPHeaders: { "x-vercel-protection-bypass": BYPASS, "x-vercel-set-bypass-cookie": "true" },
});
const page = await ctx.newPage();
await page.goto(`${BASE}/log-in`, { waitUntil: "domcontentloaded" });
await page.fill('input[name="email"]', QA_EMAIL);
await page.fill('input[name="password"]', QA_PW);
await page.click('button[type="submit"]');
await page.waitForURL(/\/space/, { timeout: 45000 });

const studio = async () => {
  await page.goto(`${BASE}/configurator/retreat/${FLOW}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
};
const openAudio = async () => {
  await studio();
  await page.locator("aside button, nav button").filter({ hasText: /^\d+\s*Audio$/i }).first().click();
  await page.waitForTimeout(700);
  const edits = page.locator(`${EDITOR} button`).filter({ hasText: /^edit$/i });
  const n = await edits.count();
  if (n > 0) {
    await edits.nth(n - 1).click();
    await page.waitForTimeout(700);
  }
  return n;
};
const save = async () => {
  await page.locator("button").filter({ hasText: /^\s*save\b/i }).first().click();
  await page.waitForFunction(
    () => ![...document.querySelectorAll("button")].some((b) => /saving/i.test(b.innerText)),
    null, { timeout: 60000 }
  ).catch(() => {});
  await page.waitForTimeout(1500);
};

/**
 * The audio control's OWN text, not the editor column's. The column lists
 * every track, and a track with no file says so - reading the column made
 * the first run of this harness report two failures that were really
 * other rows' empty states.
 */
const audioFieldText = () => page.evaluate((sel) => {
  const input = document.querySelector(`${sel} input[type="file"][accept*="audio"]`);
  if (!input) return "";
  // Walk up only until the audio control's OWN hint is in scope, and no
  // further: one level too high and the photo field next to it comes
  // along, which is what an earlier run compared against.
  let e = input.parentElement;
  for (let i = 0; i < 5 && e; i += 1) {
    const text = (e.innerText || "");
    if (/MP3/.test(text)) {
      if (/Images up to|optimize them/i.test(text)) return (e.parentElement === null ? text : text);
      return text.replace(/\s+/g, " ").trim();
    }
    e = e.parentElement;
  }
  return "";
}, EDITOR);

const rows = await openAudio();
ok("the Audio editor opens an existing track", rows > 0, `${rows} track rows`);

const before = await audioFieldText();
const input = page.locator(`${EDITOR} input[type="file"][accept*="audio"]`).first();
ok("the track editor has an audio file input", await input.count() > 0);
await input.setInputFiles(AUDIO);
// The upload is a Server Action; it finishes when the control stops
// saying it is uploading and the editor names a file.
await page.waitForFunction(
  (sel) => {
    const el = document.querySelector(sel);
    return el && !/uploading|wird hochgeladen/i.test(el.innerText);
  },
  EDITOR, { timeout: 120000 }
).catch(() => {});
await page.waitForTimeout(2500);
const after = await audioFieldText();
// NOT "the text changed": a track that already had a file from a previous
// run shows the same file name and duration again, so comparing before
// and after is a check that can only fail for the wrong reason. The real
// post-condition is that the control names a file at all. That the upload
// created a NEW versioned object rather than overwriting the old one is
// not visible here - it is asserted against storage.objects in the report.
ok("after uploading, the control names a file", /\.(mp3|m4a|aac|wav|ogg)\b/i.test(after), after.slice(0, 120));
ok("the control no longer says there is no file", !/no file (uploaded )?yet/i.test(after), after.slice(0, 120));
// A duration means the server actually decoded the file, not just stored it.
const duration = /(\d+):(\d\d)/.exec(after);
ok("a duration was detected from the file itself", !!duration, duration ? duration[0] : after.replace(/\n/g, " ").slice(0, 120));

await save();
await openAudio();
const reloaded = await audioFieldText();
ok("the attached file survives a save and a reload",
  !/no file (uploaded )?yet/i.test(reloaded) && /\d+:\d\d/.test(reloaded), reloaded.slice(0, 120));

// Publish, then try to fetch the audio as a guest would.
await studio();
await page.locator("aside button, nav button").filter({ hasText: /Preview & Publish/i }).first().click();
await page.waitForTimeout(900);
await page.locator('form button[type="submit"]').filter({ hasText: /publish/i }).first().click();
await page.waitForFunction(
  () => !/publishing/i.test(document.body.innerText), null, { timeout: 90000 }
).catch(() => {});
await page.waitForTimeout(3000);

const fresh = await browser.newContext({
  viewport: { width: 390, height: 844 },
  extraHTTPHeaders: { "x-vercel-protection-bypass": BYPASS, "x-vercel-set-bypass-cookie": "true" },
});
const guest = await fresh.newPage();
const mediaResponses = [];
guest.on("response", (r) => {
  if (/\/api\/media/.test(r.url())) mediaResponses.push({ status: r.status(), type: r.headers()["content-type"] || "" });
});
await guest.goto(`${BASE}/s/qa-flow-1h8ve`, { waitUntil: "domcontentloaded" });
await guest.waitForLoadState("networkidle").catch(() => {});
// Reach the audio screen the way a guest does: Explore, then the card.
await guest.locator("button").filter({ hasText: /Explore/i }).first().click().catch(() => {});
await guest.waitForTimeout(1200);
const audioCard = guest.locator("button, a").filter({ hasText: /Audio|Listen/i }).first();
await audioCard.click().catch(() => {});
await guest.waitForTimeout(1500);
// The player mounts when a track is opened, so open one.
const track = guest.locator("button").filter({ hasText: /nidra/i }).first();
await track.click().catch(() => {});
await guest.waitForTimeout(2000);
const sources = await guest.evaluate(() =>
  [...document.querySelectorAll("audio, audio source")].map((e) => e.getAttribute("src") || "").filter(Boolean));
ok("the published Guest App exposes an audio source", sources.length > 0 || mediaResponses.length > 0,
  JSON.stringify({ sources: sources.slice(0, 2), media: mediaResponses.slice(0, 3) }));
if (sources.length) {
  const url = sources[0].startsWith("http") ? sources[0] : new URL(sources[0], BASE).toString();
  const res = await fresh.request.get(url);
  ok("and that source is actually fetchable", res.status() === 200 || res.status() === 206,
    `${res.status()} ${res.headers()["content-type"] || ""}`);
}
await fresh.close();

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(JSON.stringify({ base: BASE, total: results.length, failed: failed.length, results }, null, 1));
process.exit(failed.length ? 1 : 0);
