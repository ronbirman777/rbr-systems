# TASK 033 — product polish: implementation plan (PLANNING ONLY)

Recorded 2026-10-11. The owner approved three requirements on 2026-10-11. **Nothing is implemented.** TASK 032 and TASK 032.5 stay the active priorities, and TASK 033 starts only on explicit instruction.

Evidence: read-only code reading; three read-only SELECTs on Production; two public `/api/media` GETs of Return to Balance images. No writes and no deploys.

**Recommended order:** 1 (Share Card) → 3 (Day Navigator) → 2 (tr/it). Requirements 1 and 3 add or change strings, so translating last avoids a second pass. Requirement 2 also fixes the date and casing helpers that 3 uses.

**DB / migrations:** none for any of the three. Each section below gives the reason.

---

## 1. Time to Flow — Share Card image

### Cause (evidenced)

- **Wrong image field.**
  - The Flow card is drawn in the browser (`retreat/shareCard.ts`, `drawShareCard`, hero at L248-273). It receives `heroImageUrl={publishedHeroImageUrl}` (`retreat-configurator.tsx` L3020).
  - That value is built from `published_spaces.modules.brand.hero.imageRef` (`[tenantId]/page.tsx` L253-258).
  - So it uses the published **Hero**, not the published **Space image**. Production `origin/main` has the same wiring.
- **Stale in-session prop.**
  - `publishSpace` returns only `{error, publishedAt}` (`actions.ts` L1485/L1524), and the configurator never calls `router.refresh()`.
  - So after an in-session publish, the card keeps the image from the snapshot before that publish until a full reload.
- **Draft leakage.** The logo, name and colours on the card come from draft state. Only the hero is published.
- **Not the cause:**
  - CDN or media caching: `/api/media` URLs change per versioned item; the guest routes are dynamic.
  - Fixture or hardcoded assets: there are none in `public/` or in the code.
  - The published snapshot: Production snapshot published 2026-10-11 09:14 UTC is in sync with the draft for hero, space and logo.

### Owner confirmation needed

Today the **current published Space image of Return to Balance is itself a thatched bungalow/sala**, and the hero is the group meditation on a deck. So switching the card to the Space image will show *that* bungalow.
- The owner should confirm which photo "current" means.
- One Staging browser repro should establish which outdated image was seen. It may have been the stale hero prop, or the 64px status thumbnail, which shows the *draft* Space image.

### Changes

1. Add a shared helper, `lib/share/publishedCardImage.ts`.
   - Source: the published snapshot, `brand.space.imageRef`, then `brand.hero.imageRef`, then the existing gradient fallback (the same order as `lib/spaces/cardImage.ts`).
   - Validation: tenant prefix (`isTenantMediaRef`), and the ref must be in `collectMediaRefs(modules)` (published only).
   - Rename the prop to `publishedCardImageUrl`.
2. The card uses **published** name, logo and theme only (`modules.brand.logo`, `brandFromPublishedTheme`).
3. Refresh after publish: `router.refresh()` when `publishedAt` changes, or `publishSpace` returns the new card fields. Add `publishedAt` to the draw effect's dependencies.
4. Keep the gradient fallback (`shareCard.ts` L266-273) and the dark overlay (L280-286). Keep the QR (`qrImagePath(tenantId)` → `/s/<slug>`) and the fetch → blob path (canvas taint).
5. The 64px status thumbnail uses the same published card image.
6. Copy: update `flow.spaceImageBody`, which today says the Space image is separate from the Hero. All locales.
7. **Teach (separate server route `/api/share-card/[tenantId]`):**
   - Not the same defect: it already reads `published_spaces` with `no-store`.
   - Risks to fix: a constant image URL may be reused from the in-session browser memory cache after republish, so add `?v=<publishedAt>`. Also, `SHARE_CARD_CTA` is hardcoded English; add a `teach.shareCardCta` key.
   - Whether Teach should prefer the Space image over portrait/hero is an owner decision. Default: keep it.

### Tests

- **Helper unit tests:**
  - the Space image wins;
  - the hero is the fallback;
  - otherwise null;
  - a foreign-tenant ref is rejected;
  - a ref missing from the snapshot is rejected;
  - a draft path is never returned.
- **Props test:** a draft change without republish leaves the card unchanged.
- **Refresh test:** the card updates after publish.
- **Teach test:** the share-card URL carries the version.

### Browser QA (Staging)

- Replace the Space image and the hero: the card is unchanged until publish. Publish: it updates without a reload.
- Remove the Space image: the hero shows. Remove both: the gradient shows.
- The exported image matches the preview.
- The QR scans to the slug.
- Long names in de/he/tr/it.
- Viewports 390/768/1440.

**Staging acceptance:** the card shows the current published Space image, refreshes after publish, never shows draft content, and the fallback and QR are correct. Teach is unchanged except the version parameter and the localized CTA.

**Production gate:** explicit authorization of the main merge (a main push deploys Production), owner confirmation of the expected photo, a green suite and build, and a read-only post-deploy check on `example`.

**DB:** none. The snapshot already carries `brand.space.imageRef`.

---

## 2. Complete Turkish (tr) and Italian (it) — seven fully supported locales

### Current coverage (keys)

| Namespace | en | de/es/fr/he | tr / it |
|---|---|---|---|
| common | 74 | 74 | **0** |
| teach | 505 | 505 | **0** |
| flow | 390 | 390 | **0** |
| studio | 284 | 284 | **0** |
| billing | 198 | 198 | 198 ✔ |
| admin | 502 | 502 | 502 ✔ |

**Remaining work:** 1,253 keys per locale (about 6,250 English words), so about 2,506 strings for tr and it together. Plus about 5–10 new keys from requirements 1 and 3, plus hardcoded literals.

### Gating

- Single switch: `SPACE_SELECTABLE_LOCALES` (`lib/i18n/locales.ts` L46). It drives the Space language selector (`space-language-card.tsx` L110) and the settings schema (`spaceSettings/index.ts` L48).
- Account pages already accept tr/it.
- **tr/it stay hidden** until parity, QA and native review pass.

### Changes

1. **Fill the dictionaries.** Fill `dictionaries/tr.ts` and `it.ts` for common, teach, flow and studio.
   - Use researched wellness/yoga/retreat terminology, extending `docs/localization/GLOSSARY-tr.md` and `GLOSSARY-it.md`. The tr glossary is marked unreviewed.
   - Do not translate English literally.
   - Never auto-translate user content.
2. **Fonts.** Add the `latin-ext` subset (Turkish ğ ş ı İ) in `document-shell.tsx` L42-75 and `lib/teach/fonts.ts`.
3. **Dates.** `ordinalDayLocalized` (`datetime.ts` L167-175) needs tr ("5.") and it ("5"). Verify the Intl time and range output.
4. **Turkish casing.**
   - `capitalizeFirst` → `toLocaleUpperCase(tag)`.
   - Replace `.toUpperCase()` in `teach-guest-app.tsx` L703/L862 with CSS `uppercase` plus a correct `lang`.
5. **Hardcoded English.**
   - `MONTHS_SHORT` (`teach-guest-app.tsx` L604)
   - `SHARE_CARD_CTA`
   - Flow `weekdayLabel` (requirement 3)
   - Re-run `docs/tasks/028c/i18n-string-audit.py` for the rest.
6. **Recommended locales.** In `recommendedLocales`, add TR→tr and IT/SM/VA→it.
7. **Expose tr/it.** Add them to `SPACE_SELECTABLE_LOCALES` only in the release that passes QA.
8. **Owner decision:** auth pages and marketing are not localized for any locale today. Are they in scope?

### Tests

- Parity across all 7 (`missingKeys` over `SUPPORTED_LOCALES`).
- Placeholder parity for tr/it.
- Flip the `parseSpaceSettings({locale:"it"})` assertion.
- The selector shows 7 options.
- Ordinals.
- `capitalizeFirst("istanbul","tr")` → "İstanbul".
- tr/it terminology rules in `terminology.test.ts`.

### Browser QA

- **Scripts:** `docs/tasks/029/locale-journey.mjs`, `guest-locale.mjs`, `a11y.mjs`, `leak-audit.mjs`.
- **Matrix:** 7 locales × 320/360/390/430/768/820/1440, Chromium and WebKit.
- **Surfaces:**
  - Teach and Flow Studio and Guest;
  - My Spaces, Create, Billing, Admin;
  - Custom Pages, Share Cards;
  - system and validation messages;
  - empty, error and loading states.
- **Checks:**
  - no English leaks;
  - no overflow at 320;
  - Hebrew RTL intact;
  - Turkish glyphs in the correct face.

**Staging acceptance:**
- Parity is green.
- Synthetic tr and it Spaces show zero English UI strings in Studio and Guest.
- Share Cards are localized.
- There is no overflow.
- A native-speaker sign-off is recorded.

**Production gate:** main authorization, native review, a green suite and build. tr/it become selectable only then.

**Risks:**
- Text expansion: tabs, chips, buttons, canvas title fit.
- Turkish suffixes next to `{placeholders}`.
- The guest bundle grows by about 2×36k characters. Per-locale dynamic import is optional; all five locales already ship today.

**DB:** none. The locale lives in the `spaceSettings` JSON, parsed in TypeScript, with no SQL whitelist.

---

## 3. Time to Flow — Retreat Day Navigator

### Current state

- Component: `components/schedule-screen.tsx`. The day strip is at L93-130 and shows only for more than one date.
- It has no selected-state ARIA, no keyboard support, no Today indicator and no "DAY n".
- The same component is used in Guest (`guest-app.tsx` L162), the Studio preview and the Publish preview.
- **Bug:** `weekdayLabel` (L34-40) uses `toLocaleDateString(undefined, …)` on a local-time Date. That gives the device locale and timezone, not the Space's. It risks hydration mismatches and shifts the weekday in negative-offset zones.
- **Dates:** `todayInTimezone(timezone)`. Guest uses `published_spaces.timezone`; Studio uses the draft timezone. Days are the distinct `schedule[].date` values. The default selection is today, else the next day, else the first (L63-67), and is kept.
- **Overlaps and meal windows:** no overlap layout or meal-window rendering exists in ScheduleScreen today; Meals is a separate module. "Preserve" therefore means: leave the timeline (L132-247) untouched. To confirm with the owner.

### Changes

1. **New component `components/guest/retreat-day-navigator.tsx`, using Flow `--rbr-*` tokens.**
   - Each chip shows:
     - weekday, via `shortWeekdayName` on a UTC-noon date (Space locale);
     - date number;
     - "DAY n";
     - a Today dot.
   - Sizing and states:
     - chip about 56×72, at least 44px;
     - `aria-selected`, roving tabindex;
     - ←/→ (reversed in RTL), Home/End;
     - scroll the selected chip into view, smooth only without `prefers-reduced-motion`;
     - 150 ms colour transitions.
   - Localized per-chip `aria-label`.
   - Visual language borrowed from the Teach strip (`teach-guest-app.tsx` L700-730, L855-866). No image, no class-count or booking semantics.
2. **Pure helper `lib/schedule/retreatDays.ts`:** `buildRetreatDays(dates, todayIso)` returns `{date, dayNumber, isToday}`, UTC/ISO only.
   - Owner decision on **DAY n**:
     - (a) calendar days since the first scheduled date + 1 (honours gaps; recommended);
     - (b) position in the list.
3. **Update `schedule-screen.tsx`.** Replace L93-130 with the navigator and delete `weekdayLabel`.
   - Owner decision: show the navigator for single-day schedules too. Recommended for consistency.
4. **New keys (7 locales):** `flow.dayN`, `flow.dayOptionLabel`, `flow.chooseDay` (or move to common), and the Today label (reuse `common.today`).

### Tests

- **`buildRetreatDays`:**
  - gaps;
  - timezone independence;
  - Today in and out of range;
  - numbering.
- **Component:**
  - roles and `aria-selected`;
  - a single `tabIndex=0`;
  - arrows, Home/End;
  - RTL reversal;
  - the weekday is correct with TZ=America/Los_Angeles;
  - the Today marker;
  - labels in 7 locales.
- **Guard:** no `toLocaleDateString(undefined` in schedule-screen.

### Browser QA

- **Environments:** 7 viewports × 7 locales, plus Hebrew RTL.
- **Accessibility:** keyboard only, VoiceOver and TalkBack, 44px touch targets, reduced motion.
- **Data and timezone:** device timezone far from the Space's; schedules of 1, 3, 14 and 30 days.
- **Consistency:** the Studio preview matches Guest; timeline screenshots are unchanged.

**Staging acceptance:** the navigator shows weekday, date, DAY n, selected state and Today. Keyboard, screen-reader and axe checks pass. The timeline is unchanged. Correct in all locales and RTL.

**Production gate:** main authorization, green suite and build, recorded QA evidence, and owner sign-off on the DAY-n definition and single-day behaviour.

**Risks:**
- Hydration mismatch on "Today": compute it from the Space timezone and gate it on mount like Teach.
- The now/next logic depends on `todayIso === activeDate`.
- iOS horizontal scroll trapping vertical scroll.
- "GÜN n" / "GIORNO n" width.

**DB:** none.

---

## Owner decisions for TASK 033

1. Which Return to Balance photo is the expected "current" one: Space image (today, a bungalow/sala) or hero (group on deck)?
2. Should Teach cards also prefer the Space image?
3. DAY n definition: (a) calendar offset (recommended) or (b) list position.
4. Show the navigator for single-day schedules?
5. Are auth and marketing pages in scope for tr/it?
6. Native reviewers for tr and it.
