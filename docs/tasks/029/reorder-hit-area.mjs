/**
 * The reorder arrows, measured the way a finger meets them.
 *
 * WHY THIS EXISTS. a11y-names.mjs already measured these controls and
 * passed them: it takes the union of the button's box and its ::after
 * pseudo-element, so a 10x15 arrow carrying an invisible 44x44 ::after
 * counted as a 44x44 target. It was, in isolation. What that measurement
 * cannot see is the ARRANGEMENT: the ▲ and ▼ sit ~17px apart, so every
 * ▼'s 44-tall area reached 22px upward and covered the ▲ above it
 * completely, and - being later in DOM order with no z-index - won every
 * hit test. Production QA found "move up" moving items DOWN, in a Studio
 * whose target-size audit was green.
 *
 * So this harness never asks how big a control is. It asks the only two
 * questions that matter:
 *
 *   1. OCCLUSION - at the exact centre of each arrow, is
 *      document.elementFromPoint() that same arrow? A control nothing can
 *      land on is not a control.
 *   2. EFFECT - after a REAL mouse click at that point, did the item move
 *      in the direction the glyph promised? This is the half a DOM
 *      assertion can never cover, because the old bug dispatched a
 *      perfectly valid click - on the wrong button.
 *
 * It also asserts the two hit boxes do not intersect at all, which is the
 * structural property that made the bug possible.
 *
 * Covers all three Flow editors that stack reorder arrows: Questions
 * (faq), Custom Pages (customPages) and Stay connected (stayConnected).
 *
 * Usage: see locale-journey.mjs. Needs BASE, BYPASS, QA_EMAIL, QA_PW, PW
 * and a Flow tenant id in TENANT.
 */
const { BASE, BYPASS, QA_EMAIL, QA_PW, PW, TENANT } = process.env;
const WIDTH = Number(process.argv[2] || 1280);
const { chromium } = await import(PW);

const STEPS = [
  { key: "faq", add: /add question/i, label: "Questions" },
  { key: "customPages", add: /add page/i, label: "Custom Pages" },
  { key: "stayConnected", add: /add link/i, label: "Stay connected" },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: WIDTH, height: WIDTH <= 430 ? 844 : 950 },
  extraHTTPHeaders: { "x-vercel-protection-bypass": BYPASS, "x-vercel-set-bypass-cookie": "true" },
});
const page = await ctx.newPage();

const failures = [];
let checks = 0;
const check = (ok, what) => {
  checks++;
  if (!ok) failures.push(what);
};

await page.goto(`${BASE}/log-in`, { waitUntil: "domcontentloaded" });
await page.fill('input[name="email"]', QA_EMAIL);
await page.fill('input[name="password"]', QA_PW);
await page.click('button[type="submit"]');
await page.waitForURL(/\/space/, { timeout: 45000 });

/** The ▲/▼ pairs on screen, with the geometry this harness cares about. */
const readPairs = () =>
  page.evaluate(() => {
    const editor = document.querySelector('[data-testid="studio-editor"]');
    if (!editor) return [];
    const isArrow = (b) => ["▲", "▼", "↑", "↓"].includes((b.textContent || "").trim());
    const arrows = [...editor.querySelectorAll("button")].filter((b) => isArrow(b) && b.getClientRects().length);

    const pairs = [];
    for (let i = 0; i + 1 < arrows.length; i += 2) {
      const up = arrows[i];
      const down = arrows[i + 1];
      const describe = (b) => {
        const r = b.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const at = document.elementFromPoint(cx, cy);
        return {
          glyph: (b.textContent || "").trim(),
          disabled: b.disabled,
          rect: { x: r.left, y: r.top, w: r.width, h: r.height },
          centre: { x: cx, y: cy },
          // The question that matters: is the thing at my own centre me?
          centreHitsSelf: at === b || b.contains(at),
          centreHitsGlyph: at ? (at.textContent || "").trim().slice(0, 2) : null,
        };
      };
      pairs.push({ index: pairs.length, up: describe(up), down: describe(down) });
    }
    return pairs;
  });

const intersects = (a, b) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** The visible item titles, in order, so a move can be proved by effect. */
const readOrder = () =>
  page.evaluate(() => {
    const editor = document.querySelector('[data-testid="studio-editor"]');
    if (!editor) return [];
    return [...editor.querySelectorAll("input[type=text], input:not([type])")]
      .filter((i) => i.getClientRects().length)
      .map((i) => i.value)
      .filter(Boolean);
  });

for (const step of STEPS) {
  await page.goto(`${BASE}/configurator/retreat/${TENANT}`, { waitUntil: "domcontentloaded" });
  const nav = page.locator(`[data-step="${step.key}"]`);
  if (!(await nav.count())) {
    failures.push(`${step.label}: step not available - is the module enabled on this Space?`);
    continue;
  }
  await nav.first().click();
  await page.waitForTimeout(800);

  // Three items, so the middle one has an enabled arrow in both
  // directions - the case where the old bug produced a visibly WRONG
  // move rather than silence.
  const addButton = page.locator("button").filter({ hasText: step.add });
  while ((await readPairs()).length < 3) {
    if (!(await addButton.count())) break;
    await addButton.first().click();
    await page.waitForTimeout(400);
    const done = page.locator("button").filter({ hasText: /^done$/i });
    if (await done.count()) await done.first().click();
    await page.waitForTimeout(300);
  }

  const pairs = await readPairs();
  if (pairs.length < 3) {
    failures.push(`${step.label}: needed 3 rows to test, got ${pairs.length}`);
    continue;
  }

  for (const pair of pairs) {
    for (const arrow of [pair.up, pair.down]) {
      if (arrow.disabled) continue;
      check(
        arrow.centreHitsSelf,
        `${step.label} row ${pair.index}: the centre of "${arrow.glyph}" hits "${arrow.centreHitsGlyph}" instead of itself`
      );
    }
    check(
      !intersects(pair.up.rect, pair.down.rect),
      `${step.label} row ${pair.index}: the ▲ and ▼ boxes intersect`
    );
    check(
      pair.up.rect.h >= 20 && pair.up.rect.w >= 40,
      `${step.label} row ${pair.index}: ▲ is ${Math.round(pair.up.rect.w)}x${Math.round(pair.up.rect.h)}, below the tiled 44x22`
    );
  }

  // EFFECT. The middle row's "move up" must move it up by one.
  const before = await readOrder();
  const middle = (await readPairs())[1];
  await page.mouse.click(middle.up.centre.x, middle.up.centre.y);
  await page.waitForTimeout(600);
  const after = await readOrder();

  if (before.length >= 3 && after.length >= 3) {
    check(
      after[0] === before[1] && after[1] === before[0],
      `${step.label}: clicking "move up" on row 1 gave [${after.slice(0, 3).join(" | ")}], expected the first two swapped from [${before.slice(0, 3).join(" | ")}]`
    );
  } else {
    failures.push(`${step.label}: could not read the row order to prove the move`);
  }

  // And back down again, so the direction is proved both ways rather than
  // by one swap that a mirrored bug would also produce.
  const backDown = (await readPairs())[0];
  await page.mouse.click(backDown.down.centre.x, backDown.down.centre.y);
  await page.waitForTimeout(600);
  const restored = await readOrder();
  check(
    restored[0] === before[0] && restored[1] === before[1],
    `${step.label}: "move down" did not undo the move - got [${restored.slice(0, 3).join(" | ")}]`
  );
}

await browser.close();

console.log(`reorder hit area @${WIDTH}: ${checks} checks, ${failures.length} failed`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failures.length ? 1 : 0);
