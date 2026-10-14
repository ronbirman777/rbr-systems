# Guest image sharpness (Time to Teach + Time to Flow)

Branch `release/guest-image-sharpness`, based on `origin/main` b697b6b (the Production
commit at the time of work; the shell-gap release landed on main after fa98923).
LOCAL ONLY: not pushed, merged or deployed. No hosted writes.

## Root cause (confirmed on Production, read-only GETs)

Guest images are served from `/api/media/...` with an 8-rung width srcset
(`?w=96,160,320,480,640,960,1280,1600`, `/api/media` -> Supabase transform `width` +
`resize: contain`) and a `sizes` attribute. Every Guest image goes through `BrandImage`,
which is always `object-fit: cover`. The `sizes` tables declared only the box WIDTH, but
a cover image must be painted at `max(boxW, boxH x sourceAspect)` CSS px. The uploads are
landscape (the demo originals are 1376x768 = 1.79:1), so every box taller than about 16:9
got a render sized to its width that cover then stretched to fill its height.

Measured on `https://innerdwes.com/s/teacherexample`, Chromium 1440 px DPR 2:
Teach Home portrait (Lena Hoffmann) `sizes="230px"`, box 230x290, browser picked `?w=480`
(decoded 480x268); cover needs 290 x 1.79 x 2 = 1040 device px -> 2.17x upscale.
Class thumbnails `sizes="76px"`, box 76x90 -> `?w=160`, 2.0x upscale. About Me portrait
150x150 -> 1.68x. Flow Today hero `(min-width: 431px) 430px, 100vw`, box 430x280 -> 1.05x
at DPR 1/2 and 1.18x on a 390 px phone at DPR 3. Same selection in WebKit.

Quality is NOT the problem: renders are WebP at Supabase's default quality (80, the
transform passes no `quality`); a 1280x714 render is 77 KB = 0.67 bits/pixel, the
1376x768 original is 105 KB. Quality was left unchanged. Originals are high resolution;
no stored data changes needed.

## Fix

`sizes` now states the width cover actually needs:

- `app/src/lib/media/coverSizes.ts` (new): `COVER_SOURCE_ASPECT = 16/9`,
  `coverWidthPx(w, h) = ceil(max(w, h x 16/9))`, `fixedCoverSizes(w, h)` and
  `columnCoverSizes(columnPx, phoneVw, h)` -> `(min-width: 431px) <column>px, max(<vw>vw, <h x 16/9>px)`,
  collapsing to one constant when the height term exceeds every possible box width.
  16:9 is a conservative landscape assumption: a portrait/square source just gets a
  slightly generous claim; a wider-than-16:9 panorama keeps a residual shortfall of the
  ratio of the aspects, far below the 2x it replaces. If a browser could not parse
  `max()` in `sizes`, the attribute is invalid and falls back to `100vw` (bigger, never
  blurrier). Verified `max()` selection in Chromium and WebKit.
- `app/src/components/flow-media-sizes.ts`: the width-only `frame`/`tile` replaced by one
  height-aware entry per box (todayHero 280, accessHero 220, facilitatorCard 300,
  treatmentCard 200, mealCard 160, facilityFeatured 220 / facilityCard 160,
  customPageCover 180, readingFeatured/readingCover 200, readingRow 88x120, audioRow 76x76,
  audioArtwork 280x280, exploreMeals 180, exploreTreatments 200, exploreTile 140).
- `app/src/components/teach/teach-media-sizes.ts`: every entry height-aware; new entries
  heroPortraitArch 230x290 (516px), heroPortraitCircle 168x168, heroFullbleed h360,
  aboutPortrait 150x150 (267px), galleryTall/galleryShort (220/140), exploreCard h200;
  classCardThumb 76x90 -> 160px, etc.
- Call sites switched to their entry: `today-screen`, `guest-access-screen`,
  `facilitators-screen`, `treatments-screen`, `meals-screen`, `facilities-screen`
  (first card vs rest), `custom-page-screen`, `guest/readings-screen`, `guest/audio-screen`,
  `guest/explore-screen` (EntryCard now receives `sizes` from `EXPLORE_COVER_SIZES`, the
  same value the prefetcher warms), `guest-app` (facilitator prefetch),
  `teach/teach-guest-app` (portrait by layout, about portrait, explore cards, gallery).
- Unchanged: srcset ladder, `/api/media`, transform/quality, storage paths, container
  sizes, layout, the 430 px shell, cropping/focal points, schema, RLS, uploads, media data.
- Known residual (pre-existing, Studio only): Teach `@min-[40rem]`/`@4xl` container-query
  sizes only occur in a wide Studio preview, never in the published 430 px column.

Tests (`app/src/lib/media/coverSizes.test.ts`, 82 cases): portrait-cover, thumbnail and
hero unit tests; a `sizes` evaluator checking every FLOW_SIZES/TEACH_SIZES entry against
its declared box at 320-1440 px (never under the cover need, at most 10% over); no bare
width-only `vw` term; a source guard that no `BrandImage`/`TeachImage` call site passes a
literal, `columnSizes(...)` or width-only `sizes` (mutation-checked: a literal `"76px"`
fails it); EXPLORE prefetch tables only use table entries. `guestDesktopShell.test.ts`
expectations updated.

## QA

Method (labelled honestly):
1. Local production build of this branch against the local Supabase stack
   (`supabase_*_innerdwes-local-qa`, no imgproxy -> no transforms; spaces `qa-teach`,
   `qa-flow-la`): Chromium + WebKit at 390@3, 430@3, 1440@1, 1440@2. Every rendered
   `sizes` equals the expected new value (32/32 cover images; the only other image is
   the Flow logo, object-contain, intentionally unchanged) and `currentSrc ?w=` is the
   expected rung (e.g. portrait `516px` -> 1280 at DPR 2, 1600 at DPR 3).
2. Before: Production read-only GETs (`/s/teacherexample`, `/s/example`), Home/Schedule/
   About Me/Explore and Today/Team/Explore tabs. After: the same Production pages with the
   new `sizes` values applied by Playwright evaluation only (SIMULATED, for transform-real
   decoded dimensions, bytes and screenshots). Network allow-list innerdwes.com +
   qzmsclkzbxrfohuxnitc.supabase.co.

Per image (Chromium; WebKit selects the identical rung for every image - 120 compared, the
only differences are a Chromium cache artefact of the simulation: Chromium reused an
already-warmed larger render of the same photo for the Teach 'More from' card). "?w=" is
the rung the browser selects from the sizes (matches the measured `currentSrc`); upscale
= needed device px / decoded width (target <= 1.0-1.1). KB = real Production render size.

| Viewport | Image | Box CSS | sizes before -> after | ?w= before -> after | decoded before -> after | needed device px | upscale before -> after | KB before -> after |
|---|---|---|---|---|---|---|---|---|
| 390@3 | Teach Home portrait (arch) | 230x290 | `230px` -> `516px` | 960 -> 1600 | 960x536 -> 1376x768 | 1560 | 1.63 -> 1.13 | 55 -> 95 |
| 390@3 | Teach class thumb (Home) | 76x90 | `76px` -> `160px` | 320 -> 480 | 320x179 -> 480x268 | 483 | 1.51 -> 1.01 | 14 -> 24 |
| 390@3 | Teach Home 'More from' card | 172x110 | `(min-width: 431px) 194px, 45vw` -> `196px` | 640 -> 640 | 640x357 -> 640x357 | 591 | 0.92 -> 0.92 | 21 -> 21 |
| 390@3 | Teach About Me portrait | 150x150 | `150px` -> `267px` | 480 -> 960 | 480x268 -> 960x536 | 807 | 1.68 -> 0.84 | 17 -> 49 |
| 390@3 | Teach About gallery (tall) | 175x220 | `(min-width: 431px) 215px, (min-width: 576px) 33vw, 50vw` -> `392px` | 640 -> 1280 | 640x357 -> 1280x714 | 1182 | 1.85 -> 0.92 | 47 -> 115 |
| 390@3 | Teach About gallery (short) | 175x140 | `(min-width: 431px) 215px, (min-width: 576px) 33vw, 50vw` -> `249px` | 640 -> 960 | 640x357 -> 960x536 | 753 | 1.18 -> 0.78 | 39 -> 69 |
| 390@3 | Teach Explore card | 358x200 | `(min-width: 431px) 430px, (min-width: 576px) 50vw, 100vw` -> `(min-width: 431px) 430px, max(100vw, 356px)` | 1280 -> 1280 | 1280x714 -> 1280x714 | 1077 | 0.84 -> 0.84 | 46 -> 46 |
| 390@3 | Teach Explore card | 358x170 | `(min-width: 431px) 430px, (min-width: 576px) 50vw, 100vw` -> `(min-width: 431px) 430px, max(100vw, 356px)` | 1280 -> 1280 | 1280x714 -> 1280x714 | 1074 | 0.84 -> 0.84 | 142 -> 142 |
| 430@3 | Teach Home portrait (arch) | 230x290 | `230px` -> `516px` | 960 -> 1600 | 960x536 -> 1376x768 | 1560 | 1.63 -> 1.13 | 55 -> 95 |
| 430@3 | Teach class thumb (Home) | 76x90 | `76px` -> `160px` | 320 -> 480 | 320x179 -> 480x268 | 483 | 1.51 -> 1.01 | 14 -> 24 |
| 430@3 | Teach Home 'More from' card | 192x110 | `(min-width: 431px) 194px, 45vw` -> `196px` | 640 -> 640 | 640x357 -> 640x357 | 591 | 0.92 -> 0.92 | 21 -> 21 |
| 430@3 | Teach About Me portrait | 150x150 | `150px` -> `267px` | 480 -> 960 | 480x268 -> 960x536 | 807 | 1.68 -> 0.84 | 17 -> 49 |
| 430@3 | Teach About gallery (tall) | 195x220 | `(min-width: 431px) 215px, (min-width: 576px) 33vw, 50vw` -> `392px` | 960 -> 1280 | 960x536 -> 1280x714 | 1182 | 1.23 -> 0.92 | 82 -> 115 |
| 430@3 | Teach About gallery (short) | 195x140 | `(min-width: 431px) 215px, (min-width: 576px) 33vw, 50vw` -> `249px` | 960 -> 960 | 960x536 -> 960x536 | 753 | 0.78 -> 0.78 | 69 -> 69 |
| 430@3 | Teach Explore card | 398x200 | `(min-width: 431px) 430px, (min-width: 576px) 50vw, 100vw` -> `(min-width: 431px) 430px, max(100vw, 356px)` | 1600 -> 1600 | 1376x768 -> 1376x768 | 1194 | 0.87 -> 0.87 | 56 -> 56 |
| 430@3 | Teach Explore card | 398x170 | `(min-width: 431px) 430px, (min-width: 576px) 50vw, 100vw` -> `(min-width: 431px) 430px, max(100vw, 356px)` | 1600 -> 1600 | 1600x893 -> 1600x893 | 1194 | 0.75 -> 0.75 | 187 -> 187 |
| 1440@1 | Teach Home portrait (arch) | 230x290 | `230px` -> `516px` | 320 -> 640 | 320x179 -> 640x357 | 520 | 1.63 -> 0.81 | 13 -> 33 |
| 1440@1 | Teach class thumb (Home) | 76x90 | `76px` -> `160px` | 96 -> 160 | 96x53 -> 160x89 | 162 | 1.69 -> 1.01 | 2 -> 5 |
| 1440@1 | Teach Home 'More from' card | 192x110 | `(min-width: 431px) 194px, 45vw` -> `196px` | 320 -> 320 | 320x179 -> 320x179 | 197 | 0.62 -> 0.62 | 9 -> 9 |
| 1440@1 | Teach About Me portrait | 150x150 | `150px` -> `267px` | 160 -> 320 | 160x90 -> 320x179 | 268 | 1.68 -> 0.84 | 4 -> 9 |
| 1440@1 | Teach About gallery (tall) | 195x220 | `(min-width: 431px) 215px, (min-width: 576px) 33vw, 50vw` -> `392px` | 320 -> 480 | 320x179 -> 480x268 | 394 | 1.23 -> 0.82 | 16 -> 31 |
| 1440@1 | Teach About gallery (short) | 195x140 | `(min-width: 431px) 215px, (min-width: 576px) 33vw, 50vw` -> `249px` | 320 -> 320 | 320x179 -> 320x179 | 250 | 0.78 -> 0.78 | 13 -> 13 |
| 1440@1 | Teach Explore card | 398x200 | `(min-width: 431px) 430px, (min-width: 576px) 50vw, 100vw` -> `(min-width: 431px) 430px, max(100vw, 356px)` | 480 -> 480 | 480x268 -> 480x268 | 398 | 0.83 -> 0.83 | 15 -> 15 |
| 1440@1 | Teach Explore card | 398x170 | `(min-width: 431px) 430px, (min-width: 576px) 50vw, 100vw` -> `(min-width: 431px) 430px, max(100vw, 356px)` | 480 -> 480 | 480x268 -> 480x268 | 398 | 0.83 -> 0.83 | 34 -> 34 |
| 1440@2 | Teach Home portrait (arch) | 230x290 | `230px` -> `516px` | 480 -> 1280 | 480x268 -> 1280x714 | 1040 | 2.17 -> 0.81 | 23 -> 75 |
| 1440@2 | Teach class thumb (Home) | 76x90 | `76px` -> `160px` | 160 -> 320 | 160x90 -> 320x179 | 322 | 2.01 -> 1.01 | 5 -> 14 |
| 1440@2 | Teach Home 'More from' card | 192x110 | `(min-width: 431px) 194px, 45vw` -> `196px` | 480 -> 480 | 480x268 -> 480x268 | 394 | 0.82 -> 0.82 | 15 -> 15 |
| 1440@2 | Teach About Me portrait | 150x150 | `150px` -> `267px` | 320 -> 640 | 320x179 -> 640x357 | 538 | 1.68 -> 0.84 | 9 -> 27 |
| 1440@2 | Teach About gallery (tall) | 195x220 | `(min-width: 431px) 215px, (min-width: 576px) 33vw, 50vw` -> `392px` | 480 -> 960 | 480x268 -> 960x536 | 788 | 1.64 -> 0.82 | 31 -> 82 |
| 1440@2 | Teach About gallery (short) | 195x140 | `(min-width: 431px) 215px, (min-width: 576px) 33vw, 50vw` -> `249px` | 480 -> 640 | 480x268 -> 640x357 | 502 | 1.05 -> 0.78 | 25 -> 39 |
| 1440@2 | Teach Explore card | 398x200 | `(min-width: 431px) 430px, (min-width: 576px) 50vw, 100vw` -> `(min-width: 431px) 430px, max(100vw, 356px)` | 960 -> 960 | 960x536 -> 960x536 | 796 | 0.83 -> 0.83 | 34 -> 34 |
| 1440@2 | Teach Explore card | 398x170 | `(min-width: 431px) 430px, (min-width: 576px) 50vw, 100vw` -> `(min-width: 431px) 430px, max(100vw, 356px)` | 960 -> 960 | 960x536 -> 960x536 | 796 | 0.83 -> 0.83 | 96 -> 96 |
| 390@3 | Flow Today card | 390x280 | `(min-width: 431px) 430px, 100vw` -> `498px` | 1280 -> 1600 | 1280x714 -> 1600x893 | 1506 | 1.18 -> 0.94 | 142 -> 187 |
| 390@3 | Flow Team card | 356x300 | `(min-width: 431px) 430px, 100vw` -> `534px` | 1280 -> 1600 | 1280x714 -> 1376x768 | 1614 | 1.26 -> 1.17 | 74 -> 94 |
| 390@3 | Flow Explore card | 358x180 | `(min-width: 431px) 430px, 100vw` -> `(min-width: 431px) 430px, max(100vw, 320px)` | 1280 -> 1280 | 1280x714 -> 1280x714 | 1074 | 0.84 -> 0.84 | 124 -> 124 |
| 390@3 | Flow Explore card | 358x200 | `(min-width: 431px) 430px, 100vw` -> `(min-width: 431px) 430px, max(100vw, 356px)` | 1280 -> 1280 | 1280x714 -> 1280x714 | 1077 | 0.84 -> 0.84 | 122 -> 122 |
| 390@3 | Flow Explore card | 173x140 | `(min-width: 431px) 215px, 50vw` -> `249px` | 640 -> 960 | 640x357 -> 960x536 | 753 | 1.18 -> 0.78 | 43 -> 77 |
| 430@3 | Flow Today card | 430x280 | `(min-width: 431px) 430px, 100vw` -> `498px` | 1600 -> 1600 | 1600x893 -> 1600x893 | 1506 | 0.94 -> 0.94 | 187 -> 187 |
| 430@3 | Flow Team card | 396x300 | `(min-width: 431px) 430px, 100vw` -> `534px` | 1600 -> 1600 | 1376x768 -> 1376x768 | 1614 | 1.17 -> 1.17 | 94 -> 94 |
| 430@3 | Flow Explore card | 398x180 | `(min-width: 431px) 430px, 100vw` -> `(min-width: 431px) 430px, max(100vw, 320px)` | 1600 -> 1600 | 1600x893 -> 1600x893 | 1194 | 0.75 -> 0.75 | 162 -> 162 |
| 430@3 | Flow Explore card | 398x200 | `(min-width: 431px) 430px, 100vw` -> `(min-width: 431px) 430px, max(100vw, 356px)` | 1600 -> 1600 | 1376x768 -> 1376x768 | 1194 | 0.87 -> 0.87 | 160 -> 160 |
| 430@3 | Flow Explore card | 193x140 | `(min-width: 431px) 215px, 50vw` -> `249px` | 960 -> 960 | 960x536 -> 960x536 | 753 | 0.78 -> 0.78 | 77 -> 77 |
| 1440@1 | Flow Today card | 430x280 | `(min-width: 431px) 430px, 100vw` -> `498px` | 480 -> 640 | 480x268 -> 640x357 | 502 | 1.05 -> 0.78 | 34 -> 53 |
| 1440@1 | Flow Team card | 396x300 | `(min-width: 431px) 430px, 100vw` -> `534px` | 480 -> 640 | 480x268 -> 640x357 | 538 | 1.12 -> 0.84 | 23 -> 33 |
| 1440@1 | Flow Explore card | 398x180 | `(min-width: 431px) 430px, 100vw` -> `(min-width: 431px) 430px, max(100vw, 320px)` | 480 -> 480 | 480x268 -> 480x268 | 398 | 0.83 -> 0.83 | 32 -> 32 |
| 1440@1 | Flow Explore card | 398x200 | `(min-width: 431px) 430px, 100vw` -> `(min-width: 431px) 430px, max(100vw, 356px)` | 480 -> 480 | 480x268 -> 480x268 | 398 | 0.83 -> 0.83 | 30 -> 30 |
| 1440@1 | Flow Explore card | 193x140 | `(min-width: 431px) 215px, 50vw` -> `249px` | 320 -> 320 | 320x179 -> 320x179 | 250 | 0.78 -> 0.78 | 14 -> 14 |
| 1440@2 | Flow Today card | 430x280 | `(min-width: 431px) 430px, 100vw` -> `498px` | 960 -> 1280 | 960x536 -> 1280x714 | 1004 | 1.05 -> 0.78 | 96 -> 142 |
| 1440@2 | Flow Team card | 396x300 | `(min-width: 431px) 430px, 100vw` -> `534px` | 960 -> 1280 | 960x536 -> 1280x714 | 1076 | 1.12 -> 0.84 | 54 -> 74 |
| 1440@2 | Flow Explore card | 398x180 | `(min-width: 431px) 430px, 100vw` -> `(min-width: 431px) 430px, max(100vw, 320px)` | 960 -> 960 | 960x536 -> 960x536 | 796 | 0.83 -> 0.83 | 84 -> 84 |
| 1440@2 | Flow Explore card | 398x200 | `(min-width: 431px) 430px, 100vw` -> `(min-width: 431px) 430px, max(100vw, 356px)` | 960 -> 960 | 960x536 -> 960x536 | 796 | 0.83 -> 0.83 | 86 -> 86 |
| 1440@2 | Flow Explore card | 193x140 | `(min-width: 431px) 215px, 50vw` -> `249px` | 480 -> 640 | 480x268 -> 640x357 | 502 | 1.05 -> 0.78 | 27 -> 43 |

Worst after-fix upscale: 1.01 at DPR <= 2 everywhere; 1.13-1.17 only at DPR 3 for the
Teach portrait and Flow Team photo, where the 1376 px ORIGINAL is the limit (the 1600
rung returns the original) - a source-resolution limit, not a selection one.

Sharpness of the DPR 2 crops (variance of the Laplacian, higher = more detail; Chromium /
WebKit): Teach portrait 84 -> 169 / 122 -> 181; class thumb 358 -> 755 / 655 -> 895;
Schedule thumb 351 -> 782 / 557 -> 831; About portrait 350 -> 570 / 421 -> 587; gallery
309 -> 777 / 507 -> 878; Flow Today hero 820 -> 972 / 895 -> 997; Flow Team 165 -> 176;
unchanged boxes (Explore cards) identical. Screenshots: scratchpad
`qa033/img/{before,after}/crop-*-1440-dpr2.png` (after = simulated, see method).

### Payload (all images displayed across the four tabs, deterministic rung model priced
with real Production render sizes; a render shared by two boxes counted once)

| App | Viewport | Box/images | Before KB | After KB | Delta |
|---|---|---|---|---|---|
| teach | 390@3 | 18 | 863.8 | 1239.8 | +376.1 KB (+44%) |
| teach | 430@3 | 18 | 1194 | 1357.3 | +163.3 KB (+14%) |
| teach | 1440@1 | 18 | 255.1 | 316.1 | +60.9 KB (+24%) |
| teach | 1440@2 | 18 | 564.3 | 816.3 | +252 KB (+45%) |
| flow | 390@3 | 9 | 680 | 898.9 | +218.8 KB (+32%) |
| flow | 430@3 | 9 | 974.7 | 974.7 | +0 KB (+0%) |
| flow | 1440@1 | 9 | 192.2 | 222 | +29.8 KB (+16%) |
| flow | 1440@2 | 9 | 459.9 | 602.8 | +142.9 KB (+31%) |

The increase is the cost of sharpness: the blurry boxes were under-fetching. Small
thumbnails stay small (class thumb 480 px at DPR 3, 24 KB; never the original).

## Gates (this worktree, after `npm ci`)

- `next typegen` OK; `tsc --noEmit` 0 errors
- `eslint`: 0 errors, 3 warnings (pre-existing)
- `vitest run`: 133 files passed, 1 skipped; 2235 tests passed, 6 skipped
- `next build`: OK

## Rollback

Revert the single commit on this branch (`git revert <sha>`); no data, schema, storage or
config is involved, so a revert fully restores the previous `sizes`.

## Release (NOT run - needs the release gate)

```
INNERDWES_RELEASE=1 git push origin release/guest-image-sharpness:main
```

Pushing main auto-deploys Production.
