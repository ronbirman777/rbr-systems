# 033 UX Fast Release (`release/033-ux-fast`)

Status: **prepared locally, NOT pushed, NOT deployed.** Branch base: `be1f9e8` (= `origin/main` = current Production).
Production database stays at migration **0035**. This release has **no migration** and **no dependency on 0036+**.

## 1. Scope (included)

| # | Item | Source commit | Backport commit on this branch | Kind |
|---|------|---------------|--------------------------------|------|
| 1 | Mobile Studio menu: viewport-fixed, scroll-locked drawer (Flow + Teach) | `757e478` | `7eb48e8` | presentation / navigation |
| 2 | Brand editor: shared preset cards + "Customize colors" (Flow + Teach), advanced colours preserved | `94344fd` | `31ba2e6` | presentation / client editor state |
| 3 | Branded Studio route loader (mark + halo), Studio part only | `ae76391` | `202941a` | presentation |
| 4 | One shared Guest App shell (Flow + Teach): full width on phones, centred 430 px column on desktop | `fd5e9fe` (shell part only) | `e9c844e` | presentation / layout |

Release-doc commit: see `git log` (this file).

## 2. Excluded (with reasons)

| Item | Reason |
|------|--------|
| `18a2aab` Arrival "Preparing for arrival" | Owner scope change: **excluded, later release** (saved-data behaviour change). Never cherry-picked here. |
| `5c844ec` Schedule: Duplicate, automatic end time, no placeholder rows, explicit deletes | Owner scope change: **excluded, later release** (save/delete data behaviour). Never cherry-picked here. |
| `ccc1051`, `0cd085c` Day Navigator | TASK 033 P2, not on main. |
| Guest App branded loader from `ae76391` (GuestLoadingScreen, guest layouts, hero-wait, desktop shell hook, `lib/guest/loaderPalette.ts`, "Preparing your retreat/classes" strings) | Builds on TASK 033 P4 guest-loading files that are not on main (main has no guest loading screen). |
| Localised Studio loader text from `ae76391` (`LocalizedStatusText`, `translateAll`, `common.openingStudio`) | Reads the `idw_locale` account-language cookie, which comes from TASK 032 (not on main). main's English loader messages are kept. |
| From `fd5e9fe`: hero-wait overlay, `.guest-column-fixed`, Suspense/loading layouts, font diet, staged prefetch, logo srcset, access-chain/page loader changes, Teach agenda month / uppercase i18n | TASK 033 P4 loading / performance / i18n parts, not shell/layout. |
| it/tr dictionary hunks, `docs/tasks/033/*` hunks | Files not on main (main has en/de/es/fr/he only). |
| Home design docs, Home Feature Image migration proposal, Dynamic Home, Admin, billing, tr/it enabling | Out of scope. |

## 3. Adaptations per item

**1 - Studio drawer (`7eb48e8`).** Code applied cleanly. Only the `docs/tasks/033/STUDIO-UX-PACKAGE.md` hunk was dropped (the file is absent on main). No test changes.

**2 - Brand editor (`31ba2e6`).** Owner requirements implemented on top of the source editor:
- **Advanced colour editing kept.** `BrandPaletteEditor` has an `advanced` slot. It is rendered inside "Customize colors" behind an **"Advanced colours"** disclosure (`aria-expanded`/`aria-controls`, collapsed by default).
  - Flow passes its existing **Navigation colour** and **Text colour** pickers, with the same state setters, the same `markDirty("identityAndBrand")`, the same hidden form fields, the same hints and preset swatches.
  - Teach passes its existing **"Fine-tune navigation and text colours"** toggle and its two fields, unchanged: toggle off sets navigation/text to `null` (they follow primary); edits set `teachStyle.preset = "custom"`; applying a preset turns the toggle on.
- **Flow Background tint omitted** (`showSurface={false}`). The Flow Guest App does not pass `custom_surface` to `deriveThemeVars` (`published-space-screen.tsx`, `publishedIdentity.ts`), so the control would do nothing for guests. Omitting it is clearer than a disabled control.
  - A preset still writes `custom_surface` exactly as before, and a saved value is kept and resubmitted unchanged.
  - Guest rendering is unchanged: QA confirms the Flow Guest ground stays `#F5F0E8` after publish.
- **Teach Background tint** (`teachStyle.background`) works as before and stays.
- `ColorField` swatches get a 44 px hit area around the unchanged 32 px dot.
- New string `studio.advancedColours` in en/de/es/fr/he.
- Import `@/lib/i18n/core` became `@/lib/i18n/locales` (main's module name).
- Tests:
  - The source branch's rewrites of `sharedStudioComponents.test.ts` and `teachBrandPresets.test.ts` are kept, because `BrandPresetChips` no longer exists.
  - Added: `showSurface`, the Advanced disclosure, Teach advanced writes and toggle reset, and a Flow call-site guard (`retreat/flowBrandEditorBackport.test.ts`).
  - Mutation check: 5 mutations, each failing exactly one test (Flow surface shown, Flow text write dropped, Teach toggle reset dropped, editor ignores `showSurface`, editor drops `advanced`).

**3 - Studio loader (`202941a`).** `LoadingTransition` (Flow Studio, Teach Studio and My Spaces route loaders) now shows the official mark breathing inside a decorative transform/opacity halo (`idw-loading-halo`; static and faint under reduced motion). The message colour changed from forest/70 to /80. The `loading.tsx` files and their English messages are unchanged and stay static. `brandedLoading.test.ts` was reduced to the Studio part. Mutation check: removing the halo class fails it.

**4 - Guest shell (`e9c844e`).** `GuestDesktopShell` (`components/guest/guest-desktop-shell.tsx`), geometry in `globals.css`, mirrored in `lib/guest/column.ts`:
- Below 640 px it is an inert wrapper.
- From 640 px it is a centred, full-window-height column of **at most 430 px** (P4 used 480 px). The backdrop is `color-mix(in srgb, var(--rbr-primary) 10%, var(--rbr-parchment-deep))`, and the column edge is a hairline plus a soft shadow.
- It is used by:
  - **Flow** (`published-space-screen.tsx`): replaces the fixed 390x780 rounded device frame; the app box stays `h-dvh`.
  - **Teach** (`teach-published-screen.tsx`): replaces the full-width desktop website.
  - The **access-code screen** (`guest-access-screen.tsx`), which had its own 390x780 frame.
- Teach's desktop switches (the `@container` root, `@min-[40rem]`/`@4xl` classes, the ResizeObserver agenda switch) all measure the app's own container. Inside the column, Teach therefore renders its phone presentation at every window width: bottom tabs, no top nav, single-column hero, day strip. No viewport (`sm:`/`md:`/`lg:`) classes exist in the Teach Guest App, and a test guards this.
- Image `sizes` follow the column (`FLOW_SIZES`, `TEACH_SIZES`, Teach hero/About/Explore constants); phone values are unchanged.
- Neither Guest App has `position: fixed` elements, so nothing escapes the column.
- The 404 page is untouched.
- Tests: `components/guest/guestDesktopShell.test.ts`, adapted from `fd5e9fe`. It uses 430 px. Overlay assertions were removed along with the overlay, and footer assertions were removed because main has no "Created with" footer. Access-screen and Teach container-switch guards were added.
- Mutation check: column 480 px, Teach without the shell, and access screen not using the shell `<main>` each fail one test.

## 4. Behaviour audit (every non-presentational change)

| Item | Handlers / state | Server actions, data writes, publish, auth |
|------|------------------|--------------------------------------------|
| 1 | Flow `mobileNavigate`: choosing the open step only closes the drawer; another step scrolls to top. `attemptNavigate` (unsaved-changes guard) still wraps every step change. Teach `goTo`: same. `releaseScrollLock()` before navigation. | None. |
| 2 | Client editor state only: preset apply, colour edit, keep-last-custom "Restore my custom colours" (editor memory, never saved on its own). Same setters and dirty marking as before. | None. Same hidden form fields and the same existing Save actions; no auto-save; never publishes. `ColorField` upper-cases a typed or picked hex (Flow's old picker kept the typed case). Values are equivalent, and an untouched field is resubmitted byte-identical (verified in QA). |
| 3 | None. | None. |
| 4 | None (wrapper markup / CSS only; image `sizes` strings). | None. No route, data loader, publish, access-code verification, auth or availability change. |

Items 1-4 are presentation/UX only. No item touches billing, `space_subscriptions`, entitlements, 0036+ objects, Stripe, Admin or migrations. A source grep of the full diff `be1f9e8..HEAD` for `subscription|billing|stripe|entitlement|idw_locale|admin|0036-0047` and any `supabase/` or migration path found nothing.

## 5. Gates (clean `npm ci` in `app/`)

| Gate | Baseline `be1f9e8` | After (this branch) |
|------|--------------------|---------------------|
| `next typegen` + `tsc --noEmit -p .` | clean | clean |
| `eslint` | 0 errors / 3 warnings | 0 errors / 3 warnings (same 3, pre-existing) |
| `vitest run` | 1962 passed / 6 skipped | **2019 passed / 6 skipped** (127 files passed, 1 skipped) |
| `next build` | OK | OK |
| `git diff --check`, no `.env*` / `.vercel` / `.next` / `node_modules` / `supabase/.temp` | - | clean |

## 6. Local browser QA

Local only, against `supabase_*_innerdwes-local-qa`. **Note:** that local stack is at migrations 0001-0047, which is AHEAD of Production (0035). That is fine for UI checks, and nothing in this release reads 0036+ objects (see section 4). Local "Publish" in QA used the local stack's `publish_space`, not Production's. A baseline `be1f9e8` build was served side by side for comparisons. Evidence is in the scratchpad `qa033/ux-fast/` and `qa033/shell/`.

| Area | Matrix | Result |
|------|--------|--------|
| Studio drawer | Flow Brand/Schedule/Publish + Teach Brand/About/Publish x top/middle/bottom x 320x568 / 390x844 / 430x932 x Chromium + WebKit (108 openings) + 12 "Brand bottom -> Schedule" navigations | 108/108 inside viewport, background locked, exact scroll restore, focus trapped, focus returned, Menu reachable, 0 horizontal overflow; 12/12 navigations land at top with drawer closed |
| Brand editor | Flow + Teach x 320/390/430/1440 x Chromium + WebKit; 8 presets each; Customize / Advanced; save / reopen; no-edit save; keyboard; Restore; local publish + guest; Hebrew RTL Space at 320/390 | **394/394** checks pass. Includes: the selected card has a check mark plus "Selected" text; Flow main fields = Primary/Accent (no Background tint), Teach = Primary/Accent/Background tint; Advanced shows the existing controls; no-edit save leaves the row byte-identical; advanced values round-trip; Teach fine-tune off clears navigation/text; a Flow custom edit keeps the saved `custom_surface`; Flow Guest ground stays parchment after publish; inputs 16 px; cards/inputs/swatches >= 44 px; RTL mirrored arrows |
| Studio loader | My Spaces route loader x 390/1440 x reduced-motion on/off x Chromium + WebKit | 6/6: mark + halo, `aria-hidden` decoration, polite status text, halo static under reduced motion. Studio (`/configurator/...`) route loader: not reachable by client navigation on main (the Manage button's own pending state shows instead; identical on baseline), so it is covered by unit render only |
| Guest shell | Flow (qa-flow-la) + Teach (qa-teach) x 320/390/430/768/1440, Hebrew Flow + Teach x 390/1440, x Chromium + WebKit; every bottom-nav tab, an Explore detail page, access-code screen (390/768/1440), 404 | **820/820** checks pass. At >= 640 px: centred column exactly 430 px, full height, nothing painted outside it, largest unclipped content box <= column. On phones: fills the width. Bottom nav sits inside the column at the viewport bottom before and after scrolling; exactly the pressed tab is active; Teach top nav never shown; 0 horizontal overflow; 404 keeps status 404; 0 console/hydration errors |
| Phone unchanged | Pixel diff baseline vs after, Flow + Teach every tab x 320/390/430 x Chromium + WebKit | **0 px** difference on all 48 Flow/Teach screens. Access-code screen differs **intentionally**: on baseline phones its card floated mid-screen (`h-full` unresolved); now it fills the screen |

Accessibility (axe wcag2a/aa/21aa/22aa, Chromium):
- Brand step: Flow color-contrast went from 34 to 27 nodes, with the same colour families as baseline. Teach went from 36 to 36, plus 1 `target-size` hit. That hit is a swatch partly under the sticky Studio header at the analysed scroll position; with the swatch centred it reports 0, so it is not a size regression.
- Guest shell: at 390 px every tab is identical to baseline. At 1440 px every tab equals today's phone counts (the phone presentation now shown), with no new rule types.
- All remaining hits are pre-existing colour-contrast tokens (e.g. `#8C8A84` labels), not introduced here.

Console:
- WebKit logs React #418 (hydration text mismatch) on the Flow Studio's default step. It reproduces identically on baseline `be1f9e8`, so it is pre-existing and not introduced here.
- 2 "Load failed" errors are external requests aborted by the QA network sandbox.

Fixtures: three local QA Spaces were seeded for the Brand QA and deleted afterwards (DB rows removed; no storage objects). Local fixture values were restored after each run. `app/.env.local` (0600, gitignored) was deleted at the end, and the temporary baseline worktree was removed.

## 7. Production compatibility

- No migration. No reference to any 0036+ table, function or column. No billing, Stripe, entitlement, Admin or account-locale code.
- Saved data: no write path changed. The Brand editor submits through the same actions with the same fields. Flow `custom_surface` is still written by presets and preserved otherwise, and is still not rendered by the Flow Guest App.
- Guest App: routing, publishing, access codes, availability checks, localisation and module behaviour are unchanged. Only the wrapper layout changes, plus image `sizes` hints.

## 8. Not verified

- No real iPhone / iPad Safari test; WebKit via Playwright only.
- No Preview/Staging deployment.
- Studio route loader in-browser (see section 6).
- The owner's reference "Meet the Facilitators (Lena Hoffmann)" page was checked with the local fixtures: the Flow Team tab ("Meet the Facilitators") and the Teach About tab ("Lena QA Yoga"). The Production Space itself was not opened.

## 9. Rollback

Promote the previous Production deployment in Vercel (the deployment built from `be1f9e8`). No data or migration needs to be rolled back.

## 10. Release command (for later approval - NOT run)

```
INNERDWES_RELEASE=1 git push origin release/033-ux-fast:main
```

Pushing `main` auto-deploys Production; it requires the release gate and explicit approval.
