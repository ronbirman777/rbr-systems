# 033 Shell Gap Release (`release/033-shell-gap`)

Status: **prepared locally, NOT pushed, NOT deployed.** Branch base: `94de158` (= Production `main` per the task
brief; not re-fetched from `origin` in this session - no hosted calls). No migration, no dependency, no env change.

## 1. Scope

One presentation fix, backported from `fix/033-studio-ux` commit `f95bf51`:

| Before (main) | After |
|---|---|
| The shared Guest shell (backport `e9c844e`) became a 430px column only from **640px**. Windows **431-639px** (phones in landscape, narrow desktop windows, split-screen tablets) got a full-width app up to 639px. | The column applies from **431px** (`GUEST_COLUMN_MAX_WIDTH + 1`): phones <= 430px stay full width, every wider window is the centred 430px column on the branded backdrop. |

Owner rule: Guest Apps are the mobile-app shell on every device, max 430px.

**Excluded:** the Flow Day Navigator Teach-chip match (`f2c39e3` on `fix/033-studio-ux`). It builds on the TASK 033 P2
navigator, which is not on main. Also excluded: everything else in TASK 033 (the 404-in-shell page, loading overlay,
`.guest-column-fixed` and so on, which main does not have).

## 2. Diff audit (`94de158..HEAD`, presentation only)

Fix commit `9f7b07e`: 8 files under `app/src`. This document is a separate commit.

| File | Change |
|---|---|
| `app/globals.css` | `@media (min-width: 640px)` -> `@media (min-width: 431px)` on the `.guest-desktop-shell` block; comment |
| `lib/guest/column.ts` | `GUEST_COLUMN_MIN_VIEWPORT = GUEST_COLUMN_MAX_WIDTH + 1` (431, was 640); comment |
| `components/guest/guestDesktopShell.test.ts` | guard: breakpoint = 431 = max + 1, media string, the shell has exactly one media block, every QA width resolves to an app <= 430px |
| `guest-desktop-shell.tsx`, `guest-access-screen.tsx`, `teach-published-screen.tsx`, `flow-media-sizes.ts`, `teach-media-sizes.ts` | comments only |

- The only runtime effects are the CSS breakpoint and the media condition inside image `sizes` strings, which is
  derived from `GUEST_COLUMN_MEDIA`. At 431-639px images now ask for the 430px column box instead of the viewport
  width, which means a smaller or equal download. `GUEST_COLUMN_MIN_VIEWPORT`/`GUEST_COLUMN_MEDIA` have no other
  consumers: no JS `matchMedia`, no logic.
- None of these changed: data access, Server Actions, routes, Guest Access, client-IP handling, auth, Supabase,
  migrations, `package.json` or the lockfile, `vercel.json`, `next.config`, env, or Stripe/billing.
- Diff hygiene: no `.env*`, `.vercel`, `.netlify`, `supabase/.temp` or build output is staged, and no secrets are in
  the diff.

## 3. Gates (this tree, after `npm ci` with the existing lockfile)

| Gate | Main baseline | This branch |
|---|---|---|
| type generation | no script in `app/package.json` (n/a) | n/a |
| `npx tsc --noEmit -p .` | clean | **clean** |
| `npx eslint .` | 0 errors / 3 warnings | **0 errors / 3 warnings** |
| `npx vitest run` | 2132 passed / 6 skipped | **2134 passed / 6 skipped** (+2 new guard tests) |
| `npx next build` | OK | **OK** (exit 0) |

## 4. QA (local only: local Supabase stack `innerdwes-local-qa`, synthetic fixtures, no hosted calls)

Matrix: Flow (Today, Schedule, Team, Explore), Flow Hebrew Explore, Teach (Home, Schedule, About Me, Explore),
the access-code screen and a 404, at 320/390/430/431/480/600/639/640/768/1440, in Chromium and WebKit. That is
220 page states per build. Each state is checked for: horizontal overflow; any element escaping the column; at
> 430px a column of exactly 430px, centred, over a painted backdrop; at <= 430px a column equal to the viewport;
the bottom tab bar inside the column and on screen after scrolling to the bottom; and console/page errors.

| Build | Problems | Notes |
|---|---|---|
| `94de158` (pristine main, `git archive`) | 100 | 80 = the gap: at 431/480/600/639 every Guest page is full width (column 431-639px). 20 = the 404 (see below). |
| this branch | **20** | **All 20 are the 404 rows.** Every Flow, Teach and access-code state passes: column 430 and centred above 430px, full width at or below 430px, nothing escapes, no overflow, nav inside and reachable. 0 console errors. |

- **404:** on main, an unknown Space renders the bare framework 404 outside the shell, at every width, before and
  after. That is unchanged and out of scope; the 404-inside-the-shell page is TASK 033 work that is not on main.
  It has no overflow.
- **Pixel identity outside the gap** (before vs after screenshots, threshold 0): **132/132 identical** at
  320/390/430/640/768/1440, both engines, all pages. Inside the gap, 80/80 app states changed (the intended
  change). The 8 unchanged gap states are the bare 404.
- Evidence: `qa033/shell/gap/main-before/`, `qa033/shell/gap/main-after/` (screenshots, `shell.json`,
  `pixdiff-vs-before.json`) in the session scratchpad.
- **Not verified:** real iPhone/iPad/Android hardware, Staging and Production. Playwright WebKit is desktop WebKit
  with mobile emulation.

## 5. Rollback

Promote the previous Production deployment in Vercel (the one built from `94de158`), or revert the fix commit on
main. Nothing in data, migrations or env needs to be rolled back.

## 6. Release command (for later approval - NOT run)

Pushing `main` deploys Production automatically, so this needs the owner's release approval:

```
INNERDWES_RELEASE=1 git push origin release/033-shell-gap:main
```
