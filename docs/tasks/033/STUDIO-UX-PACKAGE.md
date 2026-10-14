# TASK 033 - Studio UX package (mobile zoom, Duplicate, end time) + addenda A, B, D

Branch `fix/033-studio-ux` (based on `86404b3`, app code = `182f47e`). LOCAL ONLY: no push, merge,
deploy, Staging or Production action; no migration, dependency, lockfile or env change. All browser
evidence is from Playwright Chromium and WebKit against a local `next build && next start` and the local
Supabase stack (`supabase_*_innerdwes-local-qa`). **Emulation is not a real iPhone** - see section 9.

Evidence folder (session scratchpad): `qa033/ux/` - `base2/` and `after/` (Studio audit JSON + screenshots),
`nav/before|after|after-final/` (navigator screenshots, `a11y.json`), `nav/side-by-side-<engine>-<width>.png`,
`e2e/<engine>-<width>/` (flow screenshots + `result.json`). "Before" = a pristine `git archive 86404b3` build.

## 1. Commits

| sha | subject |
|---|---|
| `67f077c` | fix(033/studio-mobile): stop iOS zoom and horizontal overflow in the Studio |
| `ccc1051` | fix(033/guest): explicit retreat start+end are the Day Navigator's exact boundaries |
| `5c844ec` | feat(033/schedule): Duplicate session, automatic end time, no placeholder rows, explicit deletes |
| `0cd085c` | feat(033/guest): Flow Day Navigator matches the Teach day strip |
| (this doc) | docs(033/ux): Studio UX package report |

## 2. Issue 1 - mobile zoom / clipping: root causes (observed)

Audit: 40 screens (auth x3, My Spaces, Create, 11 Flow steps + Edit Session, 6 Flow steps + Edit Session in a
German Space, 11 Teach Studio sections) x 320/360/375/390/430/1280/1440 x Chromium/WebKit (`isMobile`,
`hasTouch` below 1024). Measured `scrollWidth - clientWidth`, every box and absolutely positioned
`::before/::after` past the viewport, control computed font sizes, control-vs-cell overflow and pairwise
control overlaps.

1. **Sub-16px form controls (zoom on focus).** 115 visible controls on mobile were 13-14px:
   `STUDIO_INPUT_CLASS` (13px, every Flow editor), `studio-fields` `INPUT` (14px, Teach + Flow item rows),
   `country-select`/`currency-select`/`phone-field` (14px), brand hex inputs and the Guest address input
   (13px), and the **log-in / sign-up / recovery inputs (14px)**. iOS Safari zooms in when a focused control
   is below 16px and keeps that zoom. The owner logs in, then the server action `redirect("/space")` is a
   soft navigation, so the zoom carries into the Studio - which matches "appears zoomed in when entering,
   must pinch out". (Inference from iOS behaviour + the measured 14px; not reproducible in emulation.)
2. **Sideways hit areas + non-wrapping footers (real horizontal overflow).** `after:-inset-x-2` hit areas on
   the last control of a row (e.g. footer `Next ->`, `button.text-xs...uppercase` with `::after` right edge
   325px at 320px) and step footers (`div.mt-8.flex.gap-3`) that never wrap: page overflow +5px
   (Flow Facilitators, 320px, EN) and +22..37px on 7 German steps at 320px (`WEITER ->` at right 334-357px).
   Overflow is what lets iOS pinch OUT / pan sideways.
3. **Edit Session grid.** `grid-cols-2` at every width: at 320px each cell was 109px, the native date input
   clipped its own value ("10 / 12 / 202"), and Start/End inputs sat 15px apart vertically at 320/360px
   because "END TIME (OPTIONAL)" wraps. (No control actually overflowed its cell in desktop WebKit; iOS
   native time/date controls have larger intrinsic widths - not measurable here.)
4. **Schedule rows.** Edit/Remove were `opacity-0 group-hover:opacity-100` - invisible on touch - but still
   took width, squeezing the session title to 44px (clipped) at 320-390px.

### Fixes - shared vs Flow-only

| fix | scope |
|---|---|
| `text-base` (16px) below `sm`, previous size from `sm` up: `STUDIO_INPUT_CLASS`, `INPUT`, country/currency/phone primitives | **shared** (Flow + Teach Studio) |
| same for log-in, sign-up, recovery, onboarding name field | shared (Studio entry) |
| `after:-inset-x-2` -> `after:inset-x-0` (30 occurrences: all Flow step files, module photo fields) | shared Flow primitives |
| step footers `flex-wrap` | Flow-only |
| Edit Session: 1 column below `sm`; time pair 2 columns from 360px with `min-w-0`, bottom-aligned; `col-span-full` | Flow-only |
| row actions on their own line below `sm`, always visible, 44x44 (`STUDIO_ROW_ACTION_CLASS`); hover-reveal + focus-within from `sm` | Flow-only |
| brand hex + guest-address inputs 16px on mobile | Flow-only |

Not done (forbidden or out of scope): no `maximum-scale`/`user-scalable`, no `overflow-x:hidden` masking.
`create/[type]/checkout-form.tsx` coupon input is 14px - left alone (billing path out of scope).

### Before / after (pristine 86404b3 build vs this branch; 40 screens per row)

| engine | width | pages with h-overflow | pseudo hit areas past viewport | controls <16px (of 115) | control overlap / cell overflow | Edit Session time pair (width / top delta) |
|---|---|---|---|---|---|---|
| Chromium | 320 | 8 -> **0** | 10 -> **0** | 115 -> **0** | 0 -> 0 | 109/109, 15px -> stacked 230px |
| Chromium | 360 | 0 -> 0 | 0 -> 0 | 115 -> **0** | 0 -> 0 | 129/129, 15px -> 129/129, **0px** |
| Chromium | 375 / 390 / 430 | 0 -> 0 | 0 -> 0 | 115 -> **0** | 0 -> 0 | 137 / 144 / 164, 0px (unchanged) |
| Chromium | 1280 / 1440 | 0 -> 0 | 0 -> 0 | 115 -> 115 (desktop size kept by design) | 0 -> 0 | unchanged |
| WebKit | 320 | 8 -> **0** | 10 -> **0** | 115 -> **0** | 0 -> 0 | 109/109, 15px -> stacked 230px |
| WebKit | 360 | 0 -> 0 | 0 -> 0 | 115 -> **0** | 0 -> 0 | 129/129, 15px -> 129/129, **0px** |
| WebKit | 375 / 390 / 430 | 0 -> 0 | 0 -> 0 | 115 -> **0** | 0 -> 0 | unchanged, 0px |
| WebKit | 1280 / 1440 | 0 -> 0 | 0 -> 0 | 115 -> 115 (by design) | 0 -> 0 | unchanged |

Desktop pixel diff (148 screenshots, 1280/1440, both engines): 127 identical; the rest differ only in the
Flow schedule screens' guest **preview pane** (intended navigator change, section 6), the Teach publish page's
`localhost:3141` vs `:3140` link text, and 17 anti-aliasing pixels on one German Modules shot.
Console: the only error in both before and after is WebKit `TypeError: Load failed` on `/space` (a request
aborted by the next `page.goto`); no hydration warnings.

## 3. Issue 2 - Duplicate session

"Duplicate" row action (visible text per locale, accessible name "Duplicate session", `title` tooltip,
keyboard reachable, 44x44 on phones). `duplicateScheduleItem()` returns a separate session with a new
`crypto.randomUUID()` id, every editable field copied (date, start, end, title, facilitator, location,
category, description, whatToBring, whatToExpect; lists copied, not shared) and opens it in the editor.
The original is never mutated. Publish is unchanged (`publish_space`).

**Stub decision (superseded by addendum B):** neither Add nor Duplicate writes a row any more; both live in
editor state until Save (section 5).

## 4. Issue 3 - automatic end time

- Add prefills 09:00-10:00. While a session created in this editor (Add or Duplicate) still has an
  untouched end, a start edit moves the end: new = start + 1h; **duplicate = keeps the original's duration**
  (07:30-09:00 duplicated, start -> 10:00 => end 11:30; original without an end follows +1h).
- A hand edit of the end stops the follow for good (`endFollows` per session id, editor state).
- Existing saved sessions never auto-change (verified: start 09:00 -> 09:15 left end 10:00).
- **Midnight:** the model has no end date (`publicScheduleItemSchema` endTime is `"HH:MM" | null`; guest
  `findNowItem` and the timeline compare strings, so an end before its start is never "happening"). A
  suggestion reaching 24:00 is therefore not made: 23:00/23:30 -> end left **empty** (null, already valid);
  22:59 -> 23:59. A cleared/partial start leaves the end alone.

## 5. Addendum B - no placeholder rows, explicit deletes

- Removed `lib/modules/persistSchedule.ts`, `createScheduleItemStub`, `deleteScheduleItem` (no other callers).
- Add / Duplicate / Remove change editor state only and mark the Schedule dirty, so the existing
  unsaved-changes dialog and unload warning cover them; "Leave without saving" creates nothing.
- `saveSchedule` previously deleted every tenant row absent from the submitted list - so a Save from a stale
  editor (a second tab, a row created elsewhere after load) silently deleted rows it never loaded. Now the
  editor tracks `persisted` / `removed` ids (`scheduleSave.ts`) and sends `removedIds`; only those are
  deleted, never an id that is also saved; malformed `removedIds` fails closed with no write. Removing a
  never-saved session sends nothing. Twins (same date/time/title, distinct ids) are separate rows and kept.
- Side effect (documented): a Remove now takes effect on Save, not instantly; Add + Remove of the same new
  session leaves the section marked dirty until Save/discard (harmless no-op save).
- `module_items` (Meals, Treatments, Facilities, Facilitators...) use the same stub pattern
  (`persistItem.ts` `persistNewItemStub`; their photo upload needs the row) - **reported, not changed**.

## 6. Addendum A - retreat date boundaries

- Both dates set: `buildRetreatDays()` lists exactly start..end (Day 1 = start, empty days included);
  activities outside do not extend the strip and are stored untouched. Owner example pinned:
  2026-10-13..17 + two activities on 2026-10-03 -> exactly 5 tabs, Day 1..Day 5 (unit test + browser).
- **One side only:** unchanged - the missing side is derived from the activities; with only a start, earlier
  activities are still listed unnumbered (`outsideRange`). Justification: the configuration is incomplete,
  and hiding sessions on a guess is worse than showing them unnumbered.
- **Out-of-range for guests:** not shown anywhere - off the strip, and Today's Happening Now / Up Next now
  uses the same `isWithinRetreatDates()` filter. **Studio:** a non-blocking hint "{count} of your sessions
  fall outside the retreat dates, so guests won't see them..." (all 7 dictionaries; tr/it still not
  selectable), based on the saved dates.
- **Today / Daily Inspiration:** Day 1 anchor is `retreatDayOne()` = start date (unchanged). Today outside
  the range marks no chip; the default day is the next/first in-range day (unchanged rule).
- Tests whose expectations encoded the old extension rule were rewritten (declared in `ccc1051`).

## 7. Addendum D - Flow Day Navigator vs Teach day strip

Local seed (deleted after QA): Flow Space dates 2026-10-13..17, Day 1 two sessions, Day 2 twin "Sound Bath",
Days 3-5 empty, two rows on 2026-10-03; Hebrew copy; Teach guest `qa-teach`; Flow single-day `qa-flow-single`.
Screenshots: `nav/before/`, `nav/after-final/`, composites `nav/side-by-side-{chromium,webkit}-{320,390,430}.png`
(before Flow | after Flow | Teach | before single | after single).

| aspect | Teach | Flow before | Flow after | matched |
|---|---|---|---|---|
| header | eyebrow 10.5px caps + 32px display title, 20px edge | 26px title, no eyebrow, 24px edge | eyebrow (retreat date range) + 32px title, 20px edge | yes |
| range shown | 14 days from today | 15 chips (10-03..10-17, stray dates extended) | 5 chips, exactly start..end | semantics per addendum A |
| chip size / radius | 52x70, 16px | 56x72, 16px | 56x69, 16px (56 wide keeps "DAY n" / "GIORNO 12") | ~yes |
| typography | weekday 10px caps, date 19px display | weekday 10px, date 21px, DAY n 10px | weekday 10px, date **19px**, DAY n 9-10px | yes (+ Flow's DAY n) |
| colours / selected | surface + line; selected = navigation | cream + sand; selected = navigation | unchanged tokens (D3 contrast kept) | yes |
| dot | has classes | Today | **has activities** | yes |
| Today marker | none | dot | solid `--rbr-text` ring (+ outer ring if selected) | Flow-only addition |
| gap / edge padding | 8px / 20px | 8px / 16px | 8px / 20px | yes |
| scroll | free scroll, no auto-scroll | auto-scroll, `inline:center` (chips cut at both edges) | auto-scroll `inline:nearest` | experience matched; keeps selected in view |
| line under strip | "Wed 14 Oct - 1 class" | none | "Wed 14 Oct - Day 2" | yes |
| panel below | cards | timeline | timeline (unchanged) | n/a (content differs) |
| touch target | 52x70 | 56x72 | 56x69 (>=44) | yes |
| keyboard / SR | listbox/option, Tab per chip | tablist/tab/tabpanel, roving, arrows | unchanged (stronger kept) | kept |
| RTL | mirrored by dir | mirrored, arrows swapped | mirrored, arrows swapped (verified) | yes |
| single day | no equivalent (always 14 days) | date header card | date header card kept | documented |

Browser checks (390px, both engines, reduced motion emulated): chip order ascending in LTR and descending in
RTL; ArrowRight (LTR) / ArrowLeft (he) moves to the next day with focus following; End/Home -> 10-17 / 10-13
(before: Home went to the stray 10-03); names e.g. "Wednesday 14 October, day 2, today"; reduced motion
`transition-property: none`; no console or hydration errors. Overflow 0 at 320/360/375/390/430.
axe (wcag2a/aa/21aa/22aa): identical before/after - Flow 6 / single 5 / Teach 21 `color-contrast` nodes, all
pre-existing timeline/card `--rbr-mist` text, none in the navigator -> **0 new violations**.
**Teach unchanged:** `teach-guest-app.tsx` not modified; Teach guest screenshots pixel-identical before/after
at 320/390/430 in both engines.

## 8. Tests and checks (observed)

| check | result |
|---|---|
| type generation | no script in `app/package.json` - n/a |
| `npx tsc --noEmit -p .` | pass |
| `npx eslint` | 0 errors, 29 warnings (= baseline) |
| `npx vitest run` (worktree, final) | **3319 passed / 18 skipped** (baseline 3215 / 18; +104 new) |
| `npx next build` | pass at every commit (isolated copy of the staged tree, same lockfile, `npm ci`) |
| per-commit isolated vitest | all pass except `scripts/qaScripts.audit.test.ts`, which needs a git repo (passes in the worktree) |
| diff hygiene | no `.env*`, `.vercel`, `supabase/.temp`, migrations, `package.json`/lockfile changes; no secrets |

New tests: `lib/schedule/sessionTimes.test.ts`, `lib/schedule/scheduleSave.test.ts`,
`configurator/retreat/saveSchedule.test.ts`, `scheduleEditorWiring.test.ts`, `studioMobileGuards.test.ts`;
updated: `retreatDays.test.ts`, `retreatDayNavigator.test.ts`, `retreatDayNavigatorContrast.test.ts`.

Local end-to-end (`e2e.mjs`, 32 checks) - **32/32 in Chromium and WebKit at 320, 390 and 1440**, 0 console
errors: Add -> 09:00/10:00, no DB row before Save; start follow; manual end kept; 23:30 -> empty end; guard
dialog -> Leave without saving -> no row; existing session end not auto-changed; Duplicate prefilled (title,
times, location, category), no row before Save, duration kept; Save -> exactly one new row, new id, original
fields unchanged, twins and stray rows intact; reload lists both; Studio hint "2"; a row inserted "elsewhere"
after load survives this editor's Save; local publish -> guest Day 1 shows original + copy, exactly 5 tabs;
Remove -> nothing deleted until Save, then exactly that row; cleanup restored the initial rows. All seeded
QA tenants were deleted from the local stack afterwards.

## 9. Limits

- Playwright WebKit is desktop WebKit with mobile emulation: it does **not** reproduce iOS focus-zoom, the
  iOS native date/time control widths, or pinch zoom. The zoom root cause is inferred from the measured
  sub-16px controls + iOS behaviour; overflow and layout numbers are measured.
- No Staging or real-device verification was performed. Staging still runs `182f47e`.

## 10. Owner re-check on a real iPhone (after an authorised Staging deploy)

1. Log out, log in typing email + password: the page must not zoom; land in My Spaces at normal scale.
2. Open the Flow Studio in an English and a German Space: no sideways pan / pinch-out on any step.
3. Schedule -> Edit a session: every field full width; tap Start, End, Date, Category - no zoom; Start/End aligned.
4. Row actions visible without hovering: Edit / Duplicate / Remove, easy to tap.
5. Add Session -> 09:00-10:00; change start -> end follows; edit end, then start -> end stays; 23:30 -> end empty.
6. Duplicate a session -> change something -> Save -> reload: original unchanged, copy present; publish -> guest shows both.
7. Add Session, then leave without saving -> no "Untitled" activity anywhere (Studio list or guest).
8. Retreat with both dates and an activity outside them: Studio hint shows the count; guest strip = exactly
   start..end (Day 1 = start); that activity appears nowhere for guests; Today screen does not show it.
9. Guest Schedule on iPhone vs Teach: header, chip size, dots, date line; Hebrew order mirrored.
10. Teach Studio fields (Identity, About, Contact): no zoom on focus.

## 11. Coordinator verification and Staging QA plan (2026-10-14)

Independently re-run in the worktree at `104171f`: `tsc` clean; eslint 0 errors / 29 warnings (baseline); vitest
3319 passed / 18 skipped; `next build` exit 0. Diff `86404b3..104171f`: 48 files, no migrations, package/lock, env,
`vercel.json` or `next.config` changes; no secret-like strings; no zoom-disabling or overflow masking.

Visual assessment (side-by-side composites, `qa033/ux/nav/`): Flow now has Teach's eyebrow + title, 20 px edge, date
line under the strip, and the exact 5-day range; the chips still differ from Teach (outlined, with a "DAY n" line;
Teach chips are filled, weekday + date only). Owner to judge on the iPhone whether this is close enough.

### Proposed Staging deployment (needs approval)
`vercel deploy --target=staging --yes` from a clean detached checkout of `104171f` (`~/Desktop/RBR-033-deploy`),
no env change, no migration (Staging 0001–0047). Rollback: redeploy `182f47e` / point back to `innerdwes-1fn3aanxu`
(`dpl_BV2H4q1emg3So83NbqvLjHcoHoPi`). Optional: one temporary bypass for automated checks, revoked afterwards.

### Staging QA after deployment (owner on iPhone; Claude read-only snapshots)
1. Studio entry after log-in: no zoom-in, no sideways scroll (log-in → My Spaces → Flow configurator → Schedule).
2. Edit Session panel: date/start/end fully visible, no overlap; tap fields → no auto-zoom.
3. Add Session → leave without saving → no new row (Claude snapshot diff: 0 rows added).
4. Add Session: start 09:00 → end 10:00 automatically; change end by hand → change start → end stays.
5. Duplicate "QA sample 0" → change its date to 2026-10-15 (DAY 3) and time 11:00 → Save → original unchanged, new row
   (Claude diff: exactly 1 new row, original fields identical). This also covers the missing "activity on a later day".
6. Publish (S1 dates + S2 + step 5) → Guest: exactly DAY 1–DAY 5 (13–17 Oct), 3 Oct activities not shown, twins on DAY 2,
   empty days 4–5, Today marker on today, Daily Inspiration from 13 Oct.
7. Compare the Flow strip with the Teach strip (`/s/qa-teach-staging`) on the same iPhone.
8. S3/S4 (access code, German) as planned after this, then cleanup per `G5-SYNTHETIC-DATA-PLAN.md`.
Note: Remove now applies on Save (not instantly); unsaved Add/Duplicate/Remove trigger the unsaved-changes guard.
9. Mobile Studio Menu (section 12): on Flow Brand and Teach Brand, scroll to the very bottom, tap Menu -> the panel
   is fully on screen; the page behind does not scroll; close with x, a tap on the dim area, and by choosing the
   current section -> back at the same spot; choose another section -> it opens at its top. Repeat from the middle
   of Flow Schedule. Hebrew Space: drawer reads right-to-left. Landscape phone (short screen): the menu list scrolls
   inside the panel.

## 12. Mobile Studio menu (queued item 1)

**Root cause (measured, Chromium + WebKit, `qa033/ux/menu/before/probe.json`):**
- **Teach Studio:** "Menu" lived in the sticky header, but the menu itself was an IN-FLOW block rendered under that
  header at the top of the document. Opened from the bottom of Brand it rendered at top **-2441px** (390x844,
  scrollY 2510), at -3023px (320x568) and at -2225px (430x932): entirely above the viewport. No scroll lock (the page
  scrolled behind it), no Escape.
- **Flow configurator:** the drawer was already `position: fixed` with no transformed ancestor (so it was inside the
  viewport). But its Menu button sat in a non-sticky bar that scrolled away (button top -2051px at the bottom of
  Brand). There was also no scroll lock, no focus trap, no Escape and no focus return.
- Not the cause: no ancestor with transform/filter/contain was found around the Flow drawer. The Teach header has
  `backdrop-blur`, which WOULD re-anchor a fixed child, so the new drawer is portalled out of every shell.

**Change (shared, `components/studio/studio-mobile-drawer.tsx` + `lib/studio/scrollLock.ts`, used by BOTH Studios;
covers every Flow step and every Teach section because both shells mount one drawer):**
- Portalled to `<body>`, `fixed inset-0`, `h-dvh` (inset-0 is the no-dvh fallback); the panel is `max-h-dvh` with
  `env(safe-area-inset-top/bottom/left)` padding, and the list scrolls inside it (`overflow-y-auto overscroll-contain`).
- Background scroll is locked iOS-safely (`body{position:fixed; top:-scrollY}`, restored with an instant `scrollTo`,
  smooth scroll-behavior suspended for that jump); the rest of `<body>` is `inert` while open.
- `role="dialog"` + `aria-modal="true"` + label "Studio menu" (a modal overlay over inert content is a dialog, not a
  plain `nav` landmark; the nav list inside keeps its own semantics). Escape / x (44x44) / backdrop close it, Tab is
  trapped, and focus returns to the Menu button (via `aria-controls` when Safari did not focus the button on tap).
  The Menu button has `aria-expanded` + `aria-controls`; the current item has `aria-current`. There is no animation,
  so reduced motion is respected by construction.
- Choosing the open section closes the drawer at the exact scroll position. Choosing another section restores first
  (`releaseScrollLock()`), then opens the new section at its top (Flow did not scroll to the top before; Teach did).
- Flow's mobile Menu bar is now `sticky top-0`, so the Menu can be reached from anywhere on a long step.
- Flow drawer group labels: `/40` -> `/70` opacity (was an axe contrast finding inside the drawer).

**QA (after, `qa033/ux/menu/after/menu.json` + `summary.json`):** 7 pages (Flow Brand, Schedule, Treatments, Publish;
Teach Brand, About, Publish), each opened from the top, middle and bottom, x 320x568 / 320x740 / 390x844 / 430x932 x
Chromium + WebKit = **168 openings**:

| check | result |
|---|---|
| Menu button on screen when tapped | 168/168 |
| drawer panel fully inside the viewport (bounding rect) | 168/168 (before: Teach 0/6 from the bottom) |
| background did not scroll (wheel + `scrollBy`) | 168/168 (before: scrolled 300px) |
| focus starts on "Close Studio menu"; 25 Tab/Shift+Tab presses stay inside | 168/168 |
| background inert while open | 168/168 (>= 3 body children inert) |
| closed by Escape / x / backdrop / current item, exact scroll restored, focus back on Menu, `aria-expanded=false` | 48 / 40 / 40 / 40, all pass |
| internal scrolling when the list is taller than the panel (320x568, Flow) | 66/66 scrolled |
| another section from the bottom of Brand -> drawer closed, new section at scrollY 0, body unlocked | 16/16 |
| horizontal overflow | 0 |
| desktop 1440 (both Studios, both engines): no Menu button, sidebar shown, screenshots before vs after | pixel-identical |
| axe, drawer open (390, Chromium) | Flow: 34 -> **0** violations (the page behind is inert); Teach: 37 -> 3 (the 3 are the shared sidebar group labels `#8C8A84`, pre-existing, also on desktop, left unchanged to keep desktop identical) |
| axe, drawer closed | unchanged before/after (pre-existing page contrast findings only) |
| console / hydration | none, apart from the WebKit `TypeError: Load failed` noted earlier (pre-existing) |

Tests: `lib/studio/scrollLock.test.ts` (lock/restore exact position + previous styles, idempotent, nested,
early release, no-DOM; focus-trap wrap), `components/studio/studioMobileDrawer.test.ts` (dialog/portal/inert/Escape/
focus return/safe areas/44px close, both Studios wired, Teach no longer in-flow, Flow bar sticky).

Not verified: real iPhone (iOS rubber-banding, the address-bar resize with `dvh`, VoiceOver), and the Flow Audio step
(no local Space has the Audio module enabled; it uses the same shell and drawer).
