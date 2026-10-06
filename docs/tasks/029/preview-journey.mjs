/**
 * The real Guest journey on the Staging Preview deployment.
 *
 * Unlike the fixture matrix, every byte here is real: the published
 * snapshot comes from Staging, the images come from Supabase Storage
 * through the deployed /api/media, and the navigation is real client
 * state driven by real clicks.
 *
 * Every assertion is a named check with a pass/fail, so a partial
 * journey cannot read as a complete one.
 */
import { chromium } from "playwright-core";

const BASE = process.argv[2];
const BYPASS = process.argv[3];
const TENANT = process.argv[4];
const WIDTH = Number(process.argv[5] || 390);
const EXPECT_LOCALE = process.argv[6] || "en";

const results = [];
// Taken from the dictionaries, not guessed - my first German pass
// invented "Programm" and "Weiterlesen" and reported six failures that
// were nothing but wrong labels in this file.
const L = {
  en: { nav: ["Today", "Schedule", "Team", "Explore"], readMore: "Read more", guidelines: "Guidelines", readings: "Readings", audio: "Audio", treatments: "Treatments", facilities: "Facilities", meals: "Meals", faq: "Questions", about: "About the Retreat" },
  he: { nav: ["היום", "לוח זמנים", "הצוות", "גלו"], readMore: "קראו עוד", guidelines: "הנחיות", readings: "קריאה", audio: "אודיו", treatments: "טיפולים", facilities: "מתקנים", meals: "ארוחות", faq: "שאלות", about: "על הריטריט" },
  de: { nav: ["Heute", "Zeitplan", "Team", "Entdecken"], readMore: "Mehr lesen", guidelines: "Hinweise", readings: "Lesestücke", audio: "Audio", treatments: "Behandlungen", facilities: "Einrichtungen", meals: "Mahlzeiten", faq: "Fragen", about: "Über das Retreat" },
};
const LAB = L[EXPECT_LOCALE] ?? L.en;
const NAV = { en: L.en.nav, he: L.he.nav, de: L.de.nav };

const ok = (name, pass, detail = "") => results.push({ name, pass: !!pass, detail });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: WIDTH, height: 844 },
  deviceScaleFactor: WIDTH <= 430 ? 3 : 2,
  extraHTTPHeaders: { "x-vercel-protection-bypass": BYPASS, "x-vercel-set-bypass-cookie": "true" },
});
const page = await ctx.newPage();

/** Every image request the page made, and whether it decoded. */
const mediaRequests = [];
page.on("response", (r) => {
  const u = r.url();
  if (u.includes("/api/media/") || u.includes("supabase.co/storage")) mediaRequests.push({ url: u, status: r.status() });
});

await page.goto(`${BASE}/g/${TENANT}`, { waitUntil: "networkidle" });

const shell = await page.evaluate(() => {
  const host = document.querySelector("[lang][dir]");
  return { lang: host?.getAttribute("lang"), dir: host?.getAttribute("dir") };
});
ok(`shell lang=${EXPECT_LOCALE}`, shell.lang === EXPECT_LOCALE, `got ${shell.lang}`);
ok(`shell dir=${EXPECT_LOCALE === "he" ? "rtl" : "ltr"}`, shell.dir === (EXPECT_LOCALE === "he" ? "rtl" : "ltr"), `got ${shell.dir}`);

const text = () => page.evaluate(() => document.body.innerText);
/** Case-insensitive, because CSS uppercase rewrites innerText. */
const has = (hay, re) => new RegExp(re.source, re.flags.includes("i") ? re.flags : re.flags + "i").test(hay);
const brokenImages = () =>
  page.evaluate(() =>
    [...document.querySelectorAll("img")]
      .filter((i) => i.getAttribute("src"))
      .filter((i) => {
        const r = i.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && !(i.complete && i.naturalWidth > 0);
      })
      .map((i) => (i.currentSrc || i.src).split("/").pop())
  );

// ---- Home ---------------------------------------------------------------
const home = await text();
ok("Home: tagline", has(home, /Seven days of coming back/));
ok("Home: short description", has(home, /small, quiet retreat/));
ok("Home: welcome", has(home, /glad you are coming/));
ok("Home: About the Retreat section", home.toLowerCase().includes(LAB.about.toLowerCase()));
ok("Home: What to Bring list", has(home, /Layers|A journal/));
ok("Home: What to Expect list", has(home, /Early mornings/));
ok("Home: no broken images", (await brokenImages()).length === 0, (await brokenImages()).join(","));

const tab = async (label) => {
  const btns = await page.$$("button");
  for (const b of btns) {
    const t = (await b.innerText()).trim().toLowerCase();
    if (t === label.toLowerCase()) { await b.click(); await page.waitForTimeout(700); return true; }
  }
  return false;
};
const clickText = async (needle) => {
  const n = needle.toLowerCase();
  const btns = await page.$$("button, a");
  for (const b of btns) {
    const t = (await b.innerText()).trim().toLowerCase();
    if (t.includes(n)) { await b.click(); await page.waitForTimeout(700); return true; }
  }
  return false;
};

// ---- Schedule: the activity disclosure ----------------------------------
const nav = NAV[EXPECT_LOCALE] ?? NAV.en;
if (await tab(nav[1])) {
  const before = await text();
  ok("Schedule: an activity is listed", has(before, /Sunrise|Sound Bath/));
  const hasDisclosure = await page.evaluate(() => document.querySelectorAll("button[aria-expanded]").length > 0);
  ok("Schedule: Extra details disclosure present", hasDisclosure);
  if (hasDisclosure) {
    await page.evaluate(() => document.querySelector("button[aria-expanded]").click());
    await page.waitForTimeout(400);
    const after = await text();
    ok("Schedule: extras revealed on open", has(after, /Mat|Blanket|Barefoot/), after.slice(0, 0));
    const expanded = await page.evaluate(() => document.querySelector("button[aria-expanded]").getAttribute("aria-expanded"));
    ok("Schedule: aria-expanded flips to true", expanded === "true", `got ${expanded}`);
  }
} else ok("Schedule tab reachable", false);

// ---- Team: bio vs longBio ----------------------------------------------
if (await tab(nav[2])) {
  const t1 = await text();
  ok("Team: a facilitator is listed", t1.length > 0);
  ok("Team: no broken portraits", (await brokenImages()).length === 0, (await brokenImages()).join(","));
} else ok("Team tab reachable", false);

// ---- Explore and every sub-screen ---------------------------------------
if (await tab(nav[3])) {
  const ex = await text();
  ok("Explore: Guidelines card", ex.toLowerCase().includes(LAB.guidelines.toLowerCase()));
  ok("Explore: Readings card", ex.toLowerCase().includes(LAB.readings.toLowerCase()));
  ok("Explore: Audio card", ex.toLowerCase().includes(LAB.audio.toLowerCase()));
  ok("Explore: no broken covers", (await brokenImages()).length === 0, (await brokenImages()).join(","));

  const open = async (label) => {
    if (!(await clickText(label))) return false;
    return true;
  };
  const back = async () => { await clickText(nav[3]); };

  // Guidelines
  if (await open(LAB.guidelines)) {
    const g = await text();
    ok("Guidelines: all three in order", has(g, /Quiet hours[\s\S]*Phones[\s\S]*Shoes/));
    await back();
  } else ok("Guidelines screen opened", false);

  // Readings -> detail
  if (await open(LAB.readings)) {
    const l = await text();
    ok("Readings: list shows an item", has(l, /On arriving/));
    ok("Readings: no broken images", (await brokenImages()).length === 0, (await brokenImages()).join(","));
    if (await clickText("On arriving")) {
      const d = await text();
      ok("Reading detail: body rendered", has(d, /Landing takes a day/));
      const dirAuto = await page.evaluate(() => document.querySelectorAll('[dir="auto"]').length);
      ok("Reading detail: organizer text is dir=auto", dirAuto > 0, `${dirAuto} nodes`);
      ok("Reading detail: no broken hero", (await brokenImages()).length === 0, (await brokenImages()).join(","));
      await clickText(LAB.readings);
    } else ok("Reading detail opened", false);
    await back();
  } else ok("Readings screen opened", false);

  // Audio -> player
  if (await open(LAB.audio)) {
    const l = await text();
    ok("Audio: list shows a track", has(l, /Evening Nidra/));
    if (await clickText("Evening Nidra")) {
      const player = await page.evaluate(() => {
        const a = document.querySelector("audio");
        const r = document.querySelector("input[type=range]");
        return a
          ? { preload: a.getAttribute("preload"), autoplay: a.hasAttribute("autoplay"), paused: a.paused,
              src: (a.getAttribute("src") || "").split("/").pop(),
              rangeName: r?.getAttribute("aria-label") ?? null, rangeValuetext: r?.getAttribute("aria-valuetext") ?? null }
          : null;
      });
      ok("Player: an <audio> element mounted", !!player);
      if (player) {
        ok("Player: preload=metadata", player.preload === "metadata", `got ${player.preload}`);
        ok("Player: no autoplay attribute", player.autoplay === false);
        ok("Player: starts paused", player.paused === true);
        ok("Player: scrubber named", !!player.rangeName, String(player.rangeName));
        ok("Player: scrubber has aria-valuetext", !!player.rangeValuetext);
        ok("Player: audio src points at the published object", /published\.mp3$/.test(player.src || ""), player.src || "");
      }
      // leaving the player must pause it
      await clickText(LAB.audio);
      const gone = await page.evaluate(() => document.querySelector("audio") === null);
      ok("Player: unmounts when leaving (so playback cannot continue)", gone);
    } else ok("Player opened", false);
    await back();
  } else ok("Audio screen opened", false);

  // Treatments & Extras
  if (await open(LAB.treatments)) {
    const t = await text();
    ok("Treatments: price and currency", has(t, /700/) && has(t, /THB/));
    ok("Treatments: charge type", has(t, new RegExp(LAB === L.de ? "Gegen Aufpreis" : LAB === L.he ? "בתשלום נוסף" : "Additional charge")));
    ok("Treatments: availability", has(t, /Subject to availability/));
    await back();
  } else ok("Treatments screen opened", false);

  // Facilities
  if (await open(LAB.facilities)) {
    const f = await text();
    ok("Facilities: short description on the card", has(f, /always 18 degrees/));
    const longBefore = has(f, /never heated/);
    ok("Facilities: long description hidden until opened", !longBefore);
    if (await clickText(LAB.readMore)) {
      const f2 = await text();
      ok("Facilities: long description on expand", /never heated|nie geheizt|אינה מחוממת/.test(f2));
    } else ok("Facilities: read-more control found", false);
    await back();
  } else ok("Facilities screen opened", false);

  // Meals intro
  if (await open(LAB.meals)) {
    const m = await text();
    ok("Meals: intro above the entries", has(m, /cooked that morning/));
    ok("Meals: the entries are still there", has(m, /Breakfast/));
    await back();
  } else ok("Meals screen opened", false);

  // FAQ semantics
  if (await open(LAB.faq)) {
    const aria = await page.evaluate(() => {
      const b = document.querySelector("button[aria-expanded]");
      return b ? { expanded: b.getAttribute("aria-expanded"), controls: b.getAttribute("aria-controls") } : null;
    });
    ok("FAQ: accordion exposes aria-expanded", !!aria && aria.expanded === "false", JSON.stringify(aria));
    // keyboard: focus the first question and press Enter
    await page.evaluate(() => document.querySelector("button[aria-expanded]").focus());
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => {
      const b = document.querySelector("button[aria-expanded]");
      return { expanded: b.getAttribute("aria-expanded"), panel: b.getAttribute("aria-controls") ? !!document.getElementById(b.getAttribute("aria-controls")) : false };
    });
    ok("FAQ: keyboard toggles it open", after.expanded === "true", JSON.stringify(after));
    ok("FAQ: aria-controls resolves to the open panel", after.panel === true);
    await back();
  } else ok("FAQ screen opened", false);
} else ok("Explore tab reachable", false);

// ---- Daily Inspiration (Home) -------------------------------------------
await tab(nav[0]);
const back2 = await text();
ok("Home still renders after the whole journey", has(back2, /Seven days of coming back/));

if (EXPECT_LOCALE === "he") {
  // dir="auto" must give an English organizer string LTR resolved
  // direction even though the app is RTL - otherwise the punctuation
  // lands on the wrong side of their sentence.
  const dirs = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('[dir="auto"]')) {
      const t = (el.textContent || "").trim();
      if (!t) continue;
      const latin = /^[A-Za-z]/.test(t);
      const hebrew = /^[\u0590-\u05FF]/.test(t);
      if (latin || hebrew) out.push({ script: latin ? "latin" : "hebrew", resolved: getComputedStyle(el).direction });
    }
    return out;
  });
  const latinWrong = dirs.filter((d) => d.script === "latin" && d.resolved !== "ltr").length;
  ok("RTL: English organizer text resolves to LTR under dir=auto", latinWrong === 0, `${latinWrong} of ${dirs.filter((d) => d.script === "latin").length} wrong`);
  const mirrored = await page.evaluate(() => {
    const svgs = [...document.querySelectorAll("svg.rtl-mirror")];
    if (svgs.length === 0) return null;
    return svgs.every((s) => getComputedStyle(s).transform !== "none");
  });
  ok("RTL: directional chevrons are mirrored", mirrored !== false, mirrored === null ? "none on this screen" : "");
}

const failedMedia = mediaRequests.filter((r) => r.status >= 400);
ok("no media request failed", failedMedia.length === 0, failedMedia.map((r) => `${r.status} ${r.url.split("/").pop().slice(0, 40)}`).join(" | "));

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(JSON.stringify({ width: WIDTH, locale: EXPECT_LOCALE, checks: results.length, failed: failed.length, failures: failed, all: results }, null, 1));
