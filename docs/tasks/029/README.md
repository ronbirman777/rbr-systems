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

## 4. `pj-*.json` — the real Staging Preview journey

`preview-journey.mjs` drives the **deployed Preview** (target `staging`)
against the **real published Staging snapshot**: real images through the
deployed `/api/media`, real client navigation, real clicks. 47 named
checks per run, at 390 and 820, in all three locales.

```sh
node docs/tasks/029/preview-journey.mjs <preview-url> <bypass-secret> <tenantId> <width> <locale>
```

Nothing here is modelled. The one thing it cannot cover is noted in each
result file: three image refs in the synthetic fixture were created by
SQL, so no bytes were ever uploaded through the real pipeline and those
three 404 at Storage. The Space that WAS populated through the real
pipeline in an earlier task (`3e6e4978-…`) reports zero failed media
requests and zero broken images, which is the real-media evidence.

`dupcheck.mjs` is the one-off that caught the duplication bug: a Space
with a canonical packing list AND a legacy one rendered the canonical
list on Home and the legacy string again on the Arrival screen. It is
kept because the fix has a unit test now, and this is how the defect was
actually found.

### Why this journey needed a browser rather than curl

Grepping the served HTML gave two confident false readings, both
recorded here so the next person does not repeat them:

- Next serialises the published snapshot into the RSC payload, so a
  string can appear in the HTML without being rendered anywhere. Only
  `innerText` distinguishes the two.
- CSS `text-transform: uppercase` changes `innerText`, so every text
  match has to be case-insensitive. Getting that wrong stranded the
  journey inside the first sub-screen and produced six "failures" that
  were nothing of the kind.

---

# The authenticated harnesses (locale completion phase)

The gap named above — "the Flow Studio was not driven through a real
login" — is closed. The synthetic Staging QA owner's password was reset
through the documented Auth Admin API, and everything below ran as that
owner, in a real browser, against a real Staging deployment, through the
normal login form. No service-role impersonation, no hand-minted
session, no direct snapshot writes.

All four scripts take the same environment:

```sh
BASE=https://<staging deployment>      # vercel deploy --target=staging
BYPASS=<Vercel protection bypass>      # revoked after QA
QA_EMAIL=<synthetic Staging QA owner>
QA_PW=<reset for the session, never stored>
PW=<path to playwright-core/index.mjs>
LABELS=<labels.json, extracted from the dictionaries>
```

`LABELS` matters. Every expected string is read from the dictionaries
rather than typed into the harness, because the earlier phase's
`preview-journey.mjs` invented German labels and reported six failures
that were nothing but wrong strings in the harness.

## `locale-journey.json` — the reactivity claim, 7 widths × 5 locales

This exists to prove one thing: choosing a language changes the Studio
shell AND the Live Draft Preview immediately, with no reload. A unit test
can only re-assert the hook; this asserts that the two surfaces actually
turn over together in a running Studio, by marking `window` before the
click and checking the mark survived.

Per product, per locale: the shell's `lang`/`dir`, the step heading in
that language, the preview's guest navigation in that language, and no
horizontal overflow. Plus the selector's contract — exactly five
options, in the fixed order, with a recommendation badging an option
rather than reordering the list — and that the choice survives a reload.

320 / 390 / 430 / 768 / 820 / 1024 / 1440, en/de/es/fr/he, Flow + Teach.

## `content-journey.json` — the P3–P5 editors, for real

Every editor this task added or changed: opened, typed into,
dirty-checked, saved, reloaded and read back. Then the unsaved-changes
guard and its discard path, a module turned on and its editor appearing,
and publish gating both ways — a saved edit absent from the Guest App
before publishing and present after.

Two scoping rules are load-bearing, and both were learned the hard way.
It reads only inside `[data-testid="studio-editor"]`, because the Live
Draft Preview renders the same words and an earlier version passed on
edits that had not saved. And it fills the LAST field of a list, because
editors that list items inline append the new row at the end — filling
the first one edited somebody else's row, which is how a guideline saved
as "Untitled".

This is the harness that found `longBio` being wiped on every save.

## `guest-locale.json` — the last link

Choose the language, publish, then fetch the public guest URL in a fresh
context with no Studio session, and check the shell's `lang`/`dir` and
the navigation labels. Both products, all five languages: 10 real
publishes. A locale that only looks right in the Studio is not done.

## `leak-audit.json` — English leakage, measured

A dictionary audit only sees strings that reach `t()`. It is blind to
copy that was never wired up, and grepping for that drowns in code
comments and type literals. So this drives both Studios in Hebrew and
reports every visible run of Latin prose, walking each step and opening
the first editor panel. In a Hebrew Space, Latin is a brand name, a file
format, a unit — or a leak.

First run: 38. Final run: 0.

Two of its own bugs are worth knowing about, because both produced fake
findings rather than missed ones: its word pattern could not contain
digits (so it scanned from the middle of fixture titles), and its
allowlist held a bare `"X"` for the platform, which substring-stripped
every string containing that letter.
