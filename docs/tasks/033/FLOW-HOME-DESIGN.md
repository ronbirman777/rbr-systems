# TASK 033: Time to Flow Guest Home, design proposal (FOR OWNER REVIEW, not implemented)

Status: this is a design only. No Home layout code has been changed. Implementation waits for owner review, plus the
separate Dynamic Home approval for the live "Happening now" behaviour (`DYNAMIC-HOME-PROPOSAL.md` §8).

**Artifacts.** These are static HTML/PNG frames rendered from real app tokens. Figma was not used: no Figma skill was
loaded in this run, and the brief allows this fallback.
- Frames: `qa033/ux/home-design/frames/*.png` (session scratchpad).
- Overview: `qa033/ux/home-design/overview-mobile.png`.
- HTML source of a frame: `frames/frame-source-mobile.html`.
- Generator: `qa033/ux/home-design.mjs`.
- How they were rendered: inside the real local Guest page, so the self-hosted Flow fonts apply (DM Serif Display =
  `--rbr-font-display`, DM Sans = `--rbr-font-ui`).
- Palettes: the canonical presets from `lib/brand/presets.ts`, Forest (default) and Dusty Rose.
- Placeholders: images are labelled gradients, because no real photography is in the repo. The official symbol is
  the unchanged `InnerDweSMark` SVG, copied from the rendered app.

**Reference frames:** Teach Home and the current Flow Home at 390 and 1440 (`qa033/ux/home-design/reference/`,
`ref-390.png`).

## Frames

| # | State | Mobile 390 | Desktop 1440 |
|---|---|---|---|
| 1 | Before the retreat: day countdown + Day 1 preview (<= 4) | `1-before-retreat-390-forest.png` | - |
| 2 | During the retreat: Right now (1 card) + Up next | `2-during-retreat-390-forest.png` | `2-during-retreat-1440-forest.png` |
| 3 | After the retreat: thank-you + Stay connected | `3-after-retreat-390-forest.png` | - |
| 4 | With the optional feature image | `4-with-feature-image-390-dustyRose.png` | `4-with-feature-image-1440-dustyRose.png` |
| 5 | Without it (no empty placeholder) | `5-without-feature-image-390-dustyRose.png` | `5-without-feature-image-1440-forest.png` |
| 6 | Several activities at once: up to 3 cards, then "+N more · View schedule" | `6-simultaneous-activities-390-forest.png` | - |
| 7 | Between activities: Up next only, "Tomorrow · 07:00" + end-of-day line; never an empty live box | `7-between-activities-390-dustyRose.png` | - |

## Structure (mobile first)

1. **Hero:** the organizer's hero photo, full-bleed, 28px bottom radius, and a dark gradient for AA text.
   - Eyebrow: Space name · date range.
   - 40px display line: the time-of-day greeting (O10). "Welcome." before the retreat, "Until next time." after it.
   - Tagline.
   - The Hero is unchanged as a data source (`hero_image_ref`).
2. **HomeLive (directly under the hero):**
   - **Live:** eyebrow "Right now" (+ "· 3 at once" when there are several) and a polite status line ("Wed 14 Oct ·
     Day 2"). Then 1-3 cards. Each card shows:
     - the start time, then "until 08:15", or "from 07:00" when there is no end (O2: never an end time or "until"
       for a missing end);
     - the title (serif 18-21px), location · facilitator, a category chip or meal type ("Meal · Breakfast", O1);
     - a "Live" pill with a dot (static under reduced motion).
     - Simultaneous items are separate cards, each with its own time column and pill, so they are clearly
       distinguishable. Overnight items show e.g. "22:00–01:00" (O3).
   - **Up next:** one row, "Up next · 10:30" or "Tomorrow · 07:00".
   - **Before:** a large day count, the start date, "Day 1 of 5 · check-in" and the Day 1 preview list.
   - **Rest of day:** "That's everything on the program — enjoy the rest of your retreat."
   - **After:** the completion card with the symbol and Stay connected.
   - **Disabled or no data:** the block is absent (no empty card, no "Nothing scheduled").
3. **A word from your hosts:** the welcome message as an editorial serif quote (22px) + signature.
4. **Optional feature image:** 250px (mobile) / 300px (desktop), 24-28px radius, below the welcome. Reserved
   aspect ratio, lazy (below the fold). Absent when unset.
5. **Entry points:** a 2-up card grid, Schedule ("Today's program · N sessions") and Arrival ("Getting here ·
   Check-in 14:00").
6. **About the retreat:** short description, 14px/1.6.
7. **Daily inspiration:** a card with "Day n" from the same clock as the navigator.
8. **Explore:** module cards (Meals, Treatments, Facilities, Questions, ...).
9. Attribution, then the tab bar (unchanged).

**Desktop 1440:** the Teach-style wide frame (max 1180px).
- Top nav with the Space name and tabs.
- 420px hero with a 32px radius and a 64px display line.
- Then two columns: left = HomeLive + entry cards; right = hosts' word, feature image, Daily inspiration.

## Type, spacing, colour

| | Mobile | Desktop |
|---|---|---|
| Hero display | DM Serif Display 40/1.05 | 64/1.02 |
| Section eyebrow | DM Sans 10.5px 600, +0.18em, uppercase (Teach `Eyebrow`) | same |
| Card title | DM Serif Display 18-21px | 22px |
| Body | DM Sans 14/1.6 | 16/1.6 |
| Section gap | 26px | 30px |
| Card | `--rbr-cream`-like surface, 1px line, 20px radius, 14-18px padding (Teach card) | 20-22px padding |

Colour comes only from the Space's palette tokens:
- primary: Live pill, countdown number;
- accent: chips, dot;
- text-subtle: eyebrows and meta (AA, as in the D3 navigator tests);
- background / surface: ground and cards.

The hero text sits on a gradient scrim, so it reaches AA on any photo.

## Teach Home comparison

**Shared** (one InnerDweS design system):
- eyebrow + serif display hierarchy;
- card styling (surface, line, radius);
- pill buttons and chips;
- the desktop frame (max 1180px, wide hero, two columns);
- the Daily inspiration card;
- the tab bar, attribution and palette tokens.

**Different, and why:**
- Teach's arched/portrait hero is about a person; Flow's full-bleed landscape hero is about a place and a shared
  experience.
- Teach shows "Today's classes" (bookable, priced); Flow shows HomeLive, a time-aware state for a fixed group
  program with no booking.
- Flow adds the hosts' word and the Arrival entry point.
- Flow has no prices or availability on Home.

## Implementation plan (after approval)

**Components (new):**
- `components/guest/home/home-hero.tsx`
- `home-live.tsx`: states before / live / between / rest / after / absent, fed by the shared multi-item extension of
  `findNowItem`/`findNextItem` (O7). No second activity engine.
- `home-host-word.tsx`
- `home-feature-image.tsx`: only after the 0048 proposal is approved.
- `home-entry-cards.tsx`

**Files changed:**
- `components/today-screen.tsx` becomes a composition of these.
- `lib/schedule/types.ts` gets the multi-item helpers, also used by `schedule-screen.tsx`.
- `guest-app.tsx` wiring.

**Tokens:** the existing `--rbr-*` set; no new colours.

**Risks:**
- Live-state boundaries (clock ticks, midnight, Space timezone): one clock utility, tested with fake timers.
- RTL mirroring of the time column.
- Hero text contrast on light photos: the scrim + `safeTextColor`.
- CLS: reserve the image box with aspect-ratio.

**Tests:**
- unit tests for each HomeLive state, including the O1-O3 cases (meals, missing end, overnight <= 12 h);
- component markup tests: absent block, aria-live status, reduced-motion dot;
- browser QA at 320/390/430/1440 in both engines, with axe and CLS.

**Feature image:** blocked on the proposed migration `docs/tasks/033/proposed-migrations/HOME-FEATURE-IMAGE.sql`
(NOT applied).
