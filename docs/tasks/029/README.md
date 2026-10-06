# TASK 029 (P3–P6) — how the QA numbers were produced

Three harnesses, each committed with the result it produced, so the
figures in the report can be re-derived rather than taken on trust.

All three drive the **real components**. What is modelled, and what is
not, is stated per harness below — and so is the one thing that could
not be covered at all.

## What could NOT be covered, and why

**The Flow Studio was not driven through a real login.** The Staging
`SUPABASE_SECRET_KEY` is a write-only (sensitive) Vercel variable: it
exists, but `vercel env pull` returns it empty, by design. Without it
`isSpacePubliclyAvailable()` cannot read `space_entitlements`, so a
locally-run app **fails closed** and every published guest route 404s —
which is the correct behaviour, not a bug. Setting a password on the
synthetic Staging QA owner needs the same key, so there is no way in.

That is a real gap in coverage and it is named in the report rather than
papered over. What replaces it is narrower and honest: `studio-qa.mjs`
grades the Studio's **layout and naming** from server-rendered documents
of the real editors, and the publish behaviour it would have exercised is
covered instead by SQL against Staging (see the report's publish-contract
section) and by the committed unit tests.

## 1. `browser-qa-*.json` — the Guest matrix

Reuses `docs/tasks/028d/browser-qa.mjs` unchanged except for a `products`
argument, so the grading is the same one CP4 accepted: horizontal
overflow, bottom-nav gap against the VISIBLE viewport, `dir`/`lang`,
RTL mirroring, broken images, and whether the render the browser picked
matches the box it has to fill.

7 widths × 3 locales × 2 engines, each cell walking **12 Flow screens
twice**, plus an orientation change and back.

```sh
# 1. the real stylesheet, from a production build
cd app && npm run build && cat .next/static/chunks/*.css > $SITE/app.css

# 2. render the fixtures (the real screens, the real locales)
#    fixture-data.ts + fixture-render.tsx, bundled the same way CP4's were
#    (docs/tasks/028d/fixture-build.sh), then stitched into one
#    switchable document per locale by build-tab-fixtures.py
# 3. serve them
node docs/tasks/029/qa-server.mjs $SITE 4290
# 4. grade
node docs/tasks/028d/browser-qa.mjs http://localhost:4290 chromium cells.ndjson flow
```

Modelled: the image BYTES. Staging's own objects are unreachable (see
above), so `qa-server.mjs` generates a decodable image at exactly the
requested ladder width and never upscales, which is what Supabase does.
Nothing this matrix asserts is about the photograph.

## 2. `a11y.json` — the accessibility pass

13 Guest screens × 3 locales, **hydrated** — `a11y-render.tsx` +
`a11y-client.tsx` mount the real components with a real React bundle, so
every disclosure, the list-to-detail step and the player are actually
clicked. The CP4 fixtures are server-only on purpose (a React bundle
would have dominated its byte measurements); for this pass the bundle
costs nothing, because nothing here is a timing measurement.

Asserted: every interactive element has an accessible name; Tab reaches
every control; every disclosure has `aria-expanded` and an
`aria-controls` that resolves; the scrubber has a name and a value text;
every touch target is at least 44px.

Two findings came out of it and are fixed in the code, not excused: the
reading/audio category chips were 31px tall and the audio scrubber 24px.
Two more were defects in the harness itself and are fixed there, with the
reason recorded in the file: identifying a focused element by its
viewport position (focus scrolls it, so controls collided), and flagging
`.sr-only` and `truncate` as clipping (both are deliberate).

## 3. `studio-qa.json` — the Studio matrix

8 editors × 7 widths × 3 locales × 2 engines = 336 cells. Server-rendered
documents of the real editors (written by a throwaway vitest file, which
is the only way to mock `next/headers` out of the server actions every
step imports).

Graded: horizontal overflow, `dir`/`lang`, raw translation keys on
screen, controls with no accessible name, and text clipped with no
ellipsis. NOT graded: interaction, for the reason in the first section.

It found German overflowing at 320 and 360 in seven of the eight
editors — fixed by making the fixed `grid-cols-2`/`grid-cols-3` collapse
to one column below `sm`, and by letting the Back/Save/Next row wrap.
