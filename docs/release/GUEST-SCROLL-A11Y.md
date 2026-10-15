# Guest scroll regions keyboard-focusable (QA O10)

Branch `release/guest-scroll-a11y`, based on `3df158f` (Production `main` at the time of
work). Backport of `fix/033-studio-ux` 3f69e4c. LOCAL ONLY: not pushed, merged or
deployed. No hosted calls.

## Finding

QA O10 (low, pre-existing): axe `scrollable-region-focusable` on the Flow Guest app,
Explore -> Facilities and Explore -> Guidelines. Every Flow Guest screen scrolls inside
its own `flex-1 overflow-y-auto` box (the shell is `h-dvh overflow-hidden`, so the page
never scrolls). A screen with no focusable child (Guidelines, Facilities whose cards
have no "Read more", a plain custom page) gave keyboard-only guests no way to scroll it.
Reproduced on the base build: 1 node on each of the two screens, Chromium + WebKit, 390
and 1440.

## Fix (presentation/a11y only)

- `app/src/components/guest/guest-scroll-region.ts` (new): `guestScrollRegion(label)`
  returns `{ tabIndex: 0, role: "region", "aria-label": label }`; `{ landmark: false }`
  omits the role for the reading detail, which is already an `<article>`.
- The 16 Flow Guest scroll boxes spread it and gain the class `guest-scroll-region`:
  Today, Schedule, Team (facilitators), Explore, Meals, Treatments, Facilities, Arrival,
  FAQ, Stay connected, Guidelines, custom page, Audio list + player, Readings list +
  detail. The accessible name is each screen's existing title string (`flow.navToday`,
  `flow.facilities`, `flow.guidelines`, ...) or its own data title (custom page, track,
  reading). No new dictionary strings.
- `app/src/app/globals.css`: `.guest-scroll-region:focus-visible` sets the existing
  global ring (2px solid) to the Space's `--rbr-primary` (fallback `--idw-clay`) with
  `outline-offset: -2px`. Inset, because the shell clips anything outside the box. It
  only applies on `:focus-visible`: there is no styling when unfocused, and a mouse
  click or tap that focuses the box shows no ring (checked in Chromium and WebKit).
- Teach is unchanged. Its Guest app scrolls the document, which the browser already
  makes keyboard-scrollable. Its only `overflow-y-auto` box is conditional on `embedded`
  (the Studio preview) and always contains tabs and cards.

### Diff audit

15 source files plus 1 new test. Each changed line adds `{...guestScrollRegion(...)}`
and the `guest-scroll-region` class to an existing scroll box opening tag, or the
matching import. The CSS adds one rule scoped to `:focus-visible`. Nothing touches
layout classes, data, fetching, routing, state, schema, RLS, storage, env or config.
The only behaviour difference is one added Tab stop per screen (the region), which is
the fix itself. The modified hunks are identical to 3f69e4c on `fix/033-studio-ux`. The
one difference is in the test: it checks the second locale as German ("Hinweise")
because main has no Italian dictionary.

### Guard test

`app/src/components/guest/guestScrollRegion.test.ts` (22 cases):
- scans every Guest source file (components root, `guest/`, `teach/`) and requires each
  `overflow-y-auto` opening tag to carry `{...guestScrollRegion(` and the class, with at
  least 16 found;
- requires Teach's exemption to stay conditional on `embedded`;
- unit-tests the helper;
- checks that the CSS rule is inset, primary-coloured and only on `:focus-visible`;
- renders Guidelines (en, de) and Facilities and asserts `tabindex="0"`, `role="region"`
  and the localized `aria-label`.

## Gates (this worktree, after `npm ci`)

- `next typegen` OK. `tsc --noEmit`: 0 errors.
- `eslint`: 0 errors, 3 warnings (pre-existing, unchanged).
- `vitest run`: 134 files passed, 1 skipped. 2257 tests passed, 6 skipped (baseline
  2235 / 6, plus the 22 new cases).
- `next build`: OK.
- `git diff --check`: clean. No `.env*`, build output or dependencies committed.

## QA (local only)

Local production builds (`next start`) against the local Supabase stack
(`127.0.0.1:55321`). Before = this worktree at 3df158f. After = this branch. Fixture: one
synthetic Flow Space `qa-o10-flow` with 6 text-only facilities and 14 guidelines, long
enough to overflow. It was removed afterwards. Playwright Chromium + WebKit at 390x844
and 1440x900, reduced motion. Screens checked: Today, Schedule, Explore, Facilities,
Guidelines, FAQ, Meals.

- axe: `scrollable-region-focusable` went from 1 node to 0 on Facilities and Guidelines,
  in both browsers and at both widths. No new violation on any of the 28
  screen/browser/width combinations. The violations that remain were there before and
  are unchanged: `color-contrast` and `heading-order` on the synthetic Space. No page
  errors.
- Keyboard: Tab reaches the region (Chromium: 2 presses, after the Explore back link;
  WebKit: 1). Focus style: 2px solid, offset -2px, the Space primary
  `rgb(27, 46, 36)`, `:focus-visible` true. The region scrolls (Facilities 390, scrollTop):
  - Chromium: ArrowDown x3 0 -> 40 -> 80 -> 120, PageDown -> 802, Space -> 1484, End
    -> bottom, Home -> 0.
  - WebKit: the first ArrowDown after Tab does not scroll, then 40 -> 80, PageDown ->
    762, Space, End and Home behave as in Chromium.
  - Guidelines and 1440 behave the same way.
- Pixels: 28 unfocused before/after screenshots (7 screens x 2 browsers x 2 widths),
  pixelmatch threshold 0: 0 differing pixels. The ring appears only when the region
  has keyboard focus.

## Rollback

Revert the single commit on this branch (`git revert <sha>`). No data, schema, storage
or config is involved.

## Release (NOT run - needs the release gate)

```
INNERDWES_RELEASE=1 git push origin release/guest-scroll-a11y:main
```

Pushing main auto-deploys Production.
