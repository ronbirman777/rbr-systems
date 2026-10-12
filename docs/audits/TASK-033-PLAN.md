# TASK 033 — product polish: implementation plan (PLANNING ONLY)

Recorded 2026-10-11. The owner approved three requirements on 2026-10-11. **Nothing is implemented.** TASK 032 and TASK 032.5 stay the active priorities, and TASK 033 starts only on explicit instruction.

Evidence: read-only code reading; three read-only SELECTs on Production; two public `/api/media` GETs of Return to Balance images. No writes and no deploys.

**Recommended order (updated 2026-10-12, see §4.12):** 1 (Share Card) → 3 (Day Navigator) → §4 performance → §4 loading screen → §4 Currency/Country → 2 (tr/it) → QA. Original note: Requirements 1 and 3 add or change strings, so translating last avoids a second pass. Requirement 2 also fixes the date and casing helpers that 3 uses.

**DB / migrations:** none for any of the three. Each section below gives the reason.


## LOCKED OWNER DECISIONS (2026-10-11, "EXECUTION AUTHORIZATION" message)

These supersede the open "Owner decisions" at the end of this file. TASK 033 code changes are **not started** (A6). They are approved for later implementation.

| ID | Decision | Implementation consequence |
|---|---|---|
| A1 | **Retreat day numbering comes from actual calendar dates in the retreat's configured IANA timezone.** Example: Oct 14–19 2027 → Day 1–6. Never derived from list position. A date with no activities does not cause renumbering | `buildRetreatDays` uses the calendar offset from the **retreat start date**. The UI shows the localized weekday, the exact date and Day n |
| A2 | Marketing site, public sign-up, log-in and password recovery stay **English only** for every language. After authentication, the Studio and builder may offer the supported interface languages. Teach and Flow Guest Apps support all 7 (en/de/es/fr/he/tr/it) after translation and QA. tr/it are not Space-selectable until complete Guest/Studio translation and QA pass. User content is never auto-translated | Auth and marketing pages are out of scope. Remaining tr/it scope: common, teach, flow and studio (1,253 keys each) |
| A3 | **Defect confirmed by the owner:** they uploaded a new image and republished, but the Share Card still showed the previous image. The card must reflect the latest **published** image **and** brand state. Source order: published Space image → published Hero → brand gradient. Never mix published images with unpublished branding. After Republish, the new image appears without a manual reload | §1 changes 1–5 are confirmed. Verify against the Studio image fields and the owner's expected result. Checks: draft/published isolation, republish invalidation, same-session freshness, browser cache, export freshness, versioning, published logo/name/colours, QR |
| A4 | Teach Share Card: keep the working behaviour. Add image-version freshness and translated labels. Use the published Space image when available, with a documented fallback (Space → portrait → hero → gradient, to be confirmed in implementation). Do not introduce the Flow defect | §1 change 7, extended with the Space-image preference |
| A5 | Day Navigator: Teach calendar visual language, without the Teach image. Timeline stays below. Dates, selected state, timezone, RTL and a11y preserved. **A single-day retreat shows a polished date header, not a navigator** | §3; single-day branch = header |
| A6 | Approved for TASK 033 later. **No TASK 033 code during the Cloudflare/backup workstream** | — |

### A1 data-model limitation (must be resolved before implementing the navigator)

The current Flow data model **has no retreat start or end date**. Checked 2026-10-11: no start/end/arrival/departure field in `src/lib/modules`, `src/lib/schedule`, the retreat configurator, or the Retreat Profile. The only dates are `schedule[].date` on activities.

Consequences:
- Day numbering can be anchored only to the **earliest scheduled activity date**. Interior gaps are numbered correctly (calendar offset), but:
  1. If the real first day has no activities (for example an arrival day with nothing scheduled), every day is off by one.
  2. Days after the last activity are not shown.
- The complete range can't be determined, so per A1 this is **reported before implementation**.

**Proposed resolution (needs owner approval at TASK 033 start):**
- Add optional **retreat start date** and **end date** fields to the Retreat Profile settings JSON (`module_settings`; no SQL migration expected, to be verified).
- The navigator shows every date from start to end, including dates without activities, with an empty state.
- Fallback when they are unset: earliest to latest scheduled date, labelled as derived.
- Teach is unaffected.

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

## 4. ADDENDUM (2026-10-12): Guest App performance, loading experience, Country / Currency UX

Approved for audit and planning only. **Nothing is implemented.** The Cloudflare R2 POC, the B2 restore and Stripe work are untouched. Includes the owner's **FINAL UX DECISION UPDATE** of the same day, which overrides the addendum's Country and Guest Loading sections.

**Evidence base:**
- Read-only code audit.
- Two read-only metadata reads: Supabase `get_project` for both projects.
- Public GET-only browser measurements of the published Production guest apps:
  - `teacherexample`: Lena Hoffmann, Teach, Hebrew;
  - `example`: Flow.
- Tools: Playwright Chromium and WebKit (Firefox is not installed here), plus curl, run 2026-10-12 from a machine served by Vercel edge `sin1`.

No auth, no writes, no deploys.

### 4.1 Country field: dependency findings (Part A) and final decision

**Where it is stored:** `module_settings` row `module_key='spaceSettings'`, `data.country`, one row per tenant. The same JSON holds `locale`.
- Schema: `src/lib/spaceSettings/index.ts:33-37,56`.
- Card: `src/components/studio/space-country-card.tsx:27-103`.
- Mounted at `retreat-configurator.tsx:2301` and `teach-studio-sections.tsx:382`.
- Save path: `space/spaceSettingsActions.ts:40-64`, which merges patches onto the stored row.

**Actual dependencies (the card's help text is inaccurate):**

| Area | Uses the Studio country? | Evidence |
|---|---|---|
| Phone inputs | **No.** The card says it suggests a phone country, but no Studio phone input reads it. The only `PhoneField` is on sign-up, and it uses the sign-up form's own country | `components/forms/phone-field.tsx:44-62`, `(auth)/sign-up/page.tsx:158-166`, `lib/phone/index.ts:203-205` |
| Studio phone-like fields | Plain `TextField`s with a hard-coded Israeli placeholder `+972 50 000 0000`; no country default | Flow arrival `arrival-step.tsx:217-218`; Teach class registration WhatsApp `teach-studio-sections.tsx:1167,1961`; private-session methods `:1788` (placeholders `:1761-1762`); About WhatsApp `:1394` |
| Language card | **Yes.** It shows "Recommended" badges through `recommendedLocales(country)`. It never sets the locale | `space-language-card.tsx:84-99`, `lib/i18n/locales.ts:122+` |
| Guest Apps | Nothing displays it, **but** `publish_space()` copies the whole `spaceSettings` object, country included, into `published_spaces.modules`, which anonymous users can read. "Not shown to guests" is true only of the UI | 0031:263-274 … current definition 0043:659-669; RLS 0017:360 |
| Timezone | No (`tenants.timezone`) | — |
| Locale | Only the badges; the guest locale is `spaceSettings.locale` alone | `spaceSettings/index.ts:88-91` |
| Billing / tax | No. Stripe Checkout collects its own address (`billing_address_collection:"auto"`, `automatic_tax`). No country columns in 0036–0047 | `lib/billing/stripe/real.ts:53-54` |
| Space creation / onboarding | No seeding either way | — |

**Account-profile country (the owner's chosen source):** `public.profiles.country` (0019:29-37).
- Written once by trigger `handle_new_user_profile` from sign-up metadata. Sign-up requires a country (`sign-up/page.tsx:144-151`, `actions.ts:66-99`).
- RLS lets users read their own row only. There is no update policy and no profile edit page.
- **Accounts created before 0019 have no row** (no backfill).
- Nothing in `src/` reads it today.

**FINAL DECISION (owner, 2026-10-12): implementation plan**
1. **Remove** `<SpaceCountryCard>` from both Studios, along with its imports and the card file. Update `saveConfirmationLocale.test.ts:31`.
2. **Keep the data.** `spaceSettings.country` stays in the schema and in stored rows. Nothing is deleted, and `saveSpaceSettings` keeps merging it.
3. **Phone default = account country.** A server helper reads the signed-in owner's `profiles.country` (RLS own-row) once per Studio load and passes it as `suggestedCountry`.
   - Studio phone and WhatsApp fields move from free-text `TextField` to the existing `PhoneField`: Flow arrival `contactPhone` and `contactWhatsapp`; Teach class-registration WhatsApp; private-session phone and WhatsApp; About WhatsApp.
   - The calling code is always changeable per field.
   - **The suggestion applies only while a field is empty.** Existing saved numbers are never rewritten (current `PhoneField` behaviour, `phone-field.tsx:55-62`).
   - If the profile country is missing (pre-0019 accounts), there is no suggestion and the user picks the code manually.
   - Changing a calling code **never** writes to `profiles`.
4. **Storage compatibility.** Stored values stay strings. `PhoneField` emits E.164. Legacy free-text values are shown as typed until the owner edits them; there is no bulk normalisation. Guest `tel:` and `wa.me` links already handle `+` numbers (verify per screen during implementation).
5. **Remove the hard-coded `+972` placeholders.** The placeholder will come from the suggested country's example format, or a neutral `+`.
6. **Language card badges:** keep using a legacy stored `spaceSettings.country` if present, otherwise show no badge. **Account country is not used for language** (owner rule). See decision D-CC1.
7. **Never** use account country for class or retreat timezone, billing or tax country, or Guest App language.
8. **Privacy fix (recommended, needs D-CC2):** stop publishing `country`.
   - Change `publish_space()` to copy `jsonb_build_object('locale', data->'locale')` instead of the whole object, and update `publishSpaceRegression.test.ts:377-382`.
   - This needs a migration that re-creates the 0043 definition, plus new fingerprints for the Production release.
   - Snapshots published earlier keep the field until their next Republish.
9. **Strings.** Retire `studio.whereYouAre`, `countryCardHint` and `searchCountries`, and the unused `common.countryHelp`, in five dictionaries. Add "Calling code" strings (all 7 locales).

### 4.2 Currency selector design (Part B; unchanged by the final update)

**Current architecture (audited):** there is no Space-level currency. Each priced item stores `metadata.price` (a JSON number in **major units**, floats allowed) and `metadata.currency`.

| Surface | Schema | UI | Display |
|---|---|---|---|
| Flow Treatments & Extras | `treatment.ts:51-52`: `currency` free string ≤8, `.catch(null)`, **no ISO check, price-without-currency allowed** | `treatments-step.tsx:344-351`: free text, upper-cased, `maxLength 8` | `treatments-screen.tsx:142`: `"1500.5 EUR"` by string concatenation, **no locale digits or grouping** |
| Teach My Retreats | `teach/schemas.ts:561-570`: `^[A-Z]{3}$` (not ISO-checked); save requires a currency when there is a price (`retreats.ts:76`) | `teach-studio-sections.tsx:1939`: free text, 3 characters | `retreats.ts:50-57` `formatRetreatPrice`: locale digits, then `" " + code`. Deliberately not `style:"currency"` (hydration/ICU comment `:44-49`) |
| Teach Classes | `price` is free text (`schemas.ts:446`), e.g. "₪65 · 5-class card ₪280" | text | raw string (`teach-class-card.tsx:82`) |

- **Published payloads:** `publish_space` (0043:406) copies `price` and `currency` verbatim. `build_teach_payload` (0035:66) publishes all metadata.
- **Billing is fully separate:**
  - `lib/billing/money.ts` uses integer minor units, `char(3)` columns and its own `LOCALE_TAG` (`en-US`, versus the app's `en-GB` and `es-419`).
  - No billing code reads Studio currency.
- **No ISO 4217 list exists** in the repo, and there is no currency library dependency.

**Design:**
1. **Data:** a new generated static module `src/lib/currencies/data.ts`, produced by a script like `scripts/generate-countries.mjs`.
   - Each entry: ISO 4217 active code, English name and minor units.
   - Exclude funds, metals and test codes (XAU, XTS…).
   - No new dependency.
   - Localized names come at runtime from `Intl.DisplayNames(locale, {type:"currency"})`, with the English name as fallback.
2. **Component:** `CurrencySelect`, a searchable combobox reusing the `CountrySelect` interaction pattern.
   - Search matches code, English name and localized name.
   - Labels look like `USD — US Dollar`, `THB — Thai Baht`, `ILS — Israeli New Shekel`, `TRY — Turkish Lira`, `CHF — Swiss Franc`, `AUD — Australian Dollar`, `SGD — Singapore Dollar`, `GBP — British Pound`, `EUR — Euro`.
   - A pinned "common" group above the full list.
   - Keyboard, ARIA combobox and RTL behaviour.
3. **Scope:** item-level, as today. This replaces both free-text inputs. **Optional (D-CC3):** a Space-level default `spaceSettings.currency` that pre-fills new priced items. It is JSON with no migration, and `publish_space` already copies the object.
4. **Validation:** on save, the code must be in the ISO list (shared zod `isoCurrencySchema`).
   - Teach keeps "price needs currency".
   - Flow gains the same rule **for new or edited rows only**. Untouched legacy rows still publish (D-CC4).
5. **Legacy values:** existing non-ISO Flow values such as `€`, `BAHT` or `EURO` are **not rewritten**.
   - The Studio shows "Unrecognised currency "EURO", choose one" with the raw value visible.
   - The Guest App keeps today's raw-text fallback for unrecognised values, so no screen goes blank.
   - **The parse stays lenient** (`.catch`) so one bad row can never fail the whole `treatments` array (`published-space-screen.tsx:80`).
   - Before implementation, run a read-only count of non-ISO values on Staging and Production (`select … where metadata->>'currency' !~ '^[A-Z]{3}$'`).
6. **Changing currency:** the amount is never converted or reinterpreted.
   - When an item has a price, changing its currency shows an inline notice ("Amounts are not converted: 700 stays 700") until Save.
   - If D-CC3 adopts a Space default, changing it affects **new** items only. An explicit "Apply to N existing items" action needs confirmation, lists the count, and states that amounts are unchanged.
7. **Formatting:** one Studio and guest formatter `formatPrice(amount, currency, locale)` in `src/lib/currencies/format.ts`. It is separate from billing `money.ts`, which is left untouched.
   - Uses `Intl.NumberFormat(LOCALE_TAG[locale], {style:"currency", currency, currencyDisplay:"symbol"})`. This uses CLDR's disambiguated symbols, e.g. `US$`, `A$` or `SGD` in `en-GB`, rather than a bare `$` for non-local dollars. Unit tests assert that no bare `$` appears for AUD, SGD or USD in any of the 7 locales (requirement 9).
   - `minimumFractionDigits` = ISO minor units (JPY 0). `maximumFractionDigits` = max(minor units, decimals actually stored), so **no stored value is rounded or hidden** (requirement 6).
   - **Hydration:** guest prices are pre-formatted on the server and passed as strings, avoiding Node/browser ICU mismatch, which was the reason `style:"currency"` was avoided before. The Studio preview formats client-side only after mount.
   - Unrecognised legacy code: amount with locale digits plus the raw code (today's behaviour, but with locale digits).
8. **Guest consistency:** Flow Treatments, Teach Retreats list and detail (`teach-retreats.tsx:58,135`) and the Studio summary (`teach-studio-sections.tsx:2008`) all use `formatPrice`.
   - Teach Class free-text price stays as typed. Making it structured is a separate, optional decision (D-CC5).
   - Dictionary placeholders with `₪` or `€` (`classPricePlaceholder`) are neutralised.
9. **Seven locales:** snapshot tests for en, de, es, fr, he, tr and it × {USD, EUR, THB, GBP, ILS, TRY, CHF, AUD, SGD, JPY, KWD}, plus RTL bidi isolation in `he`. Add the missing tr/it currency strings (with §2).
10. **Billing separation (requirements 12–14):** no imports from `lib/billing`, and no change to Stripe, prices or `money.ts`. The base subscription stays USD 25/month before tax.
11. **Migrations:** none required (JSON metadata). Optional D-CC3 is JSON too.

### 4.3 Current Guest startup bottlenecks (Part D), measured

**Root cause #1: cross-Pacific database round trips.**
- Vercel functions run in **`iad1` (Washington DC)**. Seen in `x-vercel-id: sin1::iad1::…`; `app/vercel.json` sets no `regions`.
- Both Supabase projects are in **`ap-northeast-1` (Tokyo)** per `get_project`.
- Every sequential Supabase call from a function therefore crosses the Pacific (estimated 150–170 ms round trip).

The server-side chains:
- **Page:** `published_spaces` select → `tenants.status` → entitlement + subscription → `get_guest_access_mode` RPC (+ `get_guest_access_version` for code Spaces). That is 4–5 **sequential** round trips before any HTML (`lib/share/publishedSocialSpace.ts:46-74`, `guestAccess/effectiveAccess.ts:44-51`).
  - `/g/[tenantId]` runs the chain **twice** (layout + `g/page.tsx:61-70`).
  - Teach also re-runs it for each linked Flow Space (`teach/flowLinkServer.ts:25`).
- **Each image:** `/api/media` re-runs the same chain plus `createSignedUrl` (about 5–6 sequential calls), then 307s to a Supabase signed URL (`api/media/[...path]/route.ts:81-184`). There is no dedupe across images.
- **Edge cache:** public, versioned, published media get `public, max-age=60`. So for a low-traffic Space almost every real visit is a cold miss (`cachePolicy.ts:46-51,140-147`).

**Measured (Production public pages, 2026-10-12):**

| Measurement | Result |
|---|---|
| Lena page HTML, server, curl ×3 (first byte of body) | **1.84 / 2.27 / 2.81 s**, 338 KB HTML; Flow `example` 1.81 s |
| `/api/media` 307, **cold** (`?w=640`, edge MISS) | **2.10 s** |
| `/api/media` 307, edge-cached (within 60 s) | 0.15–0.21 s |
| Supabase transform after the 307: cold / warm | 0.50 s / 0.09 s |
| Lena cold, Chromium 390 px: images discovered → hero decoded | Media requests start at **3.38 s**; the hero 307 completes at 5.32 s; hero bytes at 6.60 s → **hero ready 6.6 s** in the worst run |

The ~3 s owner observation is explained by: **~2 s HTML (database round trips) + ~2 s cold `/api/media` (the same chain again) + ~0.5 s cold transform.** It is **not** oversized assets, hydration or decoding:
- Images are correctly sized through `srcset` (hero transform 44–57 KB, originals 62–322 KB never served to the hero).
- With everything cached, the hero is ready ~40 ms after FCP.

**Secondary contributors (measured or audited):**
1. **11 font files preloaded on every guest page** (≈350 KB, all fetched at t≈2.13 s alongside CSS) compete with the hero. Teach adds Cormorant and Lora (`app/document-shell.tsx:40-77`, `lib/teach/fonts.ts`).
2. **JS:** 384 KB transferred / 1.36 MB decoded (Teach and Flow alike). Each app is a single client component that imports every screen eagerly (`guest-app.tsx`, `teach-guest-app.tsx`). This is not the dominant cost on desktop CPUs; it needs a mobile-CPU check.
3. **The hero cannot start until the HTML arrives.** There is no `loading.tsx` or `<Suspense>` under `app/(guest)`, so nothing streams early; the browser receives only 103 Early Hints (fonts) at ~150 ms.
4. **Navigation before prefetch completes:** Flow Explore image ready in **2.72 s**, Teach "תכנים" (Explore) **2.81 s**. After prefetch has run, 0.04–0.22 s. Prefetch waits for `load` + idle (≤3 s; 1.2 s on Safari) (`components/shared/media-prefetch.tsx:13-73`).
5. Duplicate media requests: 2 on Teach 390 px, 3 at 1440 px (the same reading image and the portrait).
6. The Flow logo is a raw `<img>` at full 512×512 for a 24 px display (10 KB; minor).
7. Teach `tt-fade-in` (0.45 s opacity) starts at mount, not on image load.
8. CLS: 0–0.008 (good).
9. Failed media requests: 0.

### 4.4 Baseline performance measurements (BEFORE)

Production public pages, 2026-10-12. Chromium unless noted; "warm" = same browser context reload. Times in ms. **The browser's TTFB column is not usable** because Vercel sends 103 Early Hints at ~150 ms; the real HTML timing is the curl figure above.

| App | Width | Network | Visit | FCP | LCP | Hero ready | Total transfer | Requests | Media requests (dupes) |
|---|---|---|---|---|---|---|---|---|---|
| Teach (Lena) | 320 | fast | cold | 2336 | 2444 | 2439 | 779 KB | 48 | 22 (2) |
| Teach | 390 | fast | cold | 2056–3496 | 2140–6612 | 2128–6621 | 779 KB | 48 | 22 (2) |
| Teach | 390 | fast | warm | 1612–2220 | 1612–2220 | 1657–2258 | 18 KB | 48 | 22 |
| Teach | 1440 | fast | cold | 1768 | 2036 | 2030 | 779 KB | 50 | 24 (3) |
| Teach | 390 | 4G (9 Mbps/150 ms) | cold | 2800 | 3348 | 3418 | 779 KB | 48 | 22 |
| Teach | 390 | slow 3G (400 kbps/400 ms) | cold | 10140 | 19756 | 21678 | 779 KB | 48 | 22 |
| Flow (example) | 320 | fast | cold | 2064 | 5008 | 5010 | 773 KB | 40 | 14 (0) |
| Flow | 390 | fast | cold | 1628 | 1756 | 1742 | 773 KB | 40 | 14 |
| Flow | 1440 | fast | cold | 1760 | 2196 | 2201 | 773 KB | 40 | 14 |
| Flow | 390 | 4G | cold | 2244 | 2784 | 2780 | 773 KB | 40 | 14 |
| Flow | 390 | slow 3G | cold | 9104 | 20640 | 20646 | 773 KB | 40 | 14 |
| Teach | 390 / 768 | fast, **WebKit** | cold | 2734 / 2388 | 2836 / 2500 | 2944 / 5082 | 780 KB | 38–40 | 12–14 |
| Flow | 390 / 768 | fast, **WebKit** | cold | 2606 / 1918 | 4356 / 2112 | 4350 / 2110 | 774 KB | 30 | 4 |

- **Navigation to image ready (Chromium 390, fast):**
  - Click 0.3 s after load: Flow Team 189 ms, Flow Explore **2716 ms**; Teach Schedule 106 ms, About 380 ms, Explore **2811 ms**.
  - Click 5 s after load: all ≤ 217 ms.
- **Variance is high** (the same cell ranges 2.1–6.6 s). It is driven by cold `/api/media` invocations.
- **Not measured yet:** 360/430/820 widths, Firefox, real mobile CPU, Home → Facilities/Meals sub-pages, code-protected Spaces, and Staging.

### 4.5 Proposed loading-screen architecture (Parts C and G, final update)

**Principle:** the loading screen is a **streaming fallback plus a short hero-wait**, never a timer. It is visible only while critical content is genuinely missing.

1. **Server phase (streaming).**
   - A new `app/(guest)/s/[slug]/loading.tsx` / `<Suspense>` boundary (and `/g`) renders `GuestLoadingScreen` immediately while the published-payload and access chain resolves. This replaces today's blank wait of ~2 s.
   - To localize the phrase before the heavy payload, the layout first awaits a **single light query** for `spaceSettings.locale` of the published row (one indexed select). The full payload then streams inside the boundary.
   - Unknown or denied Space: the fallback resolves into the existing 404 or access screen, never a stuck spinner.
2. **Client phase (hero-wait).** After hydration, a small overlay stays only until the **hero image is decoded** (`img.decode()`), or the logo if there is no hero.
   - **Hard cap 1.5 s** (D-LD1), after which content is revealed regardless and the image fades in when ready.
   - No hero at all → reveal immediately.
   - Image error → reveal immediately; the `BrandImage` gradient fallback shows.
3. **No flicker:** the screen fades in with a CSS `animation-delay` of ~200 ms (pure CSS, no JS), so loads under ~200 ms never show it. Once visible, it fades out over 200 ms; there is no minimum dwell.
4. **Visual (approved):**
   - The existing circular `InnerDweSMark` (`components/brand/wordmark.tsx:43`) with the existing calm `idw-loading-breathe` keyframe (`globals.css:207-219`; scale 1 → 1.08, 2.2 s). No spin, no bounce.
   - Clean parchment background (`bg-idw-parchment`) with AA contrast.
   - Beneath it, **"Created with InnerDweS"** via the existing `attribution.createdWith` key ("Created with {brand}", present in all 7 dictionaries, `en.ts:1522-1526`). `{brand}` is always the untranslated "InnerDweS".
   - `role="status"`, `aria-live="polite"`, plus a visually hidden "Loading" in the Space locale.
   - `prefers-reduced-motion`: static mark (an existing override covers `.idw-loading-breathe`, `globals.css:230`).
5. **After loading** the customer's brand is primary. The existing subtle footer (`components/guest/created-with-footer.tsx`, Flow `guest-app.tsx:302`, Teach `teach-guest-app.tsx:260`) is kept, and no prominent InnerDweS branding is added to the normal layout.
6. **Layout shift:** the overlay is `position:fixed` over a reserved layout, so CLS stays 0. The hero keeps its explicit aspect box.
7. **Teach `tt-fade-in`** is changed to trigger on image load rather than mount, so the reveal is not double-faded.

### 4.6 Preload and caching strategy (Part E)

**Stage 0: remove the bottleneck (the real fix; must ship before the loading screen).**
- **P1. Co-locate compute with the database.** Set the Vercel function region to `hnd1` (Tokyo, same region as Supabase), via `app/vercel.json` `"regions": ["hnd1"]` or the project setting.
  - A config change that affects **all** functions, including the billing cron and Stripe webhooks: Production change, needs approval (D-PF1).
  - Trade-off: Americas/Europe guests pay one longer edge-to-function hop instead of N cross-Pacific database hops. Still a large net win (one hop versus 5–12).
  - Verify on Staging first (Staging is also Tokyo).
- **P2. One RPC for guest authorization.** `get_guest_space_access(slug | tenant_id)` returns availability, mode and version in one call (the recorded follow-up "single RPC for /api/media checks"). It is used by the page and `/api/media`, and wrapped in React `cache()` per request.
  - **Migration required** (new SECURITY DEFINER function, `search_path` pinned, anon-executable, returns no PII).
  - Removes the double chain on `/g` and on Teach Flow-link checks.
- **P3. `/api/media` reads only what it needs.** A targeted media-ref membership check instead of the whole `modules` JSON. It keeps the exact tenant, published-only and extension checks.
- **P4. Longer public cache for immutable published versions (D-PF2).**
  - Raise `PUBLISHED_MEDIA_CACHE_SECONDS` for versioned, published, **public** Spaces from 60 s, for example to 600 s, with the signed TTL equal to the window + 120 s.
  - The security trade-off is documented in `cachePolicy.ts`: after unpublish or a switch to code-protected, already-issued URLs stay valid for the window.
  - Code-protected Spaces, drafts and legacy paths stay `private, no-store`, unchanged.
- **P5. Font diet.** Preload only the fonts used above the fold for that product (`preload:false` on the others, drop unused families or weights). Target: ≤3 preloaded fonts instead of 11.

**Stage 1: critical.**
- Hero stays `priority`, `fetchPriority=high`, React `preload()`.
- Logo gets `sizes` and `srcset` (24–48 px).
- Nothing below the fold blocks render.

**Stage 2: high (start on hero decoded, not on `load`+idle).**
- First Team/About portrait, first Schedule-related image, and the first image on each other tab.
- Concurrency 2.

**Stage 3: background (`requestIdleCallback`).**
- Explore covers, then Facilities, Meals and Treatments first images, then the remaining About gallery.
- Budget-capped.

**Rules (extending the existing `lib/media/prefetch.ts`):**
- Skip on `saveData`, `2g`/`slow-2g` and `prefers-reduced-data`. Stage 3 is off on `3g` or when `deviceMemory ≤ 2`.
- Session budget: 12 (Stage 2) + 12 (Stage 3), at most 2 in flight.
- On tab press: queued, not-started prefetches are dropped, and the destination screen's images are requested immediately with `fetchPriority=high`.
- Optional `pointerdown` intent preload for the tab's first image.
- Reuse: the same `/api/media/...?w=` URL string is used for the prefetch and the `<img>`, so the HTTP cache serves both. Dedupe repeated refs (fixes the 2–3 duplicates).
- **Signed URLs are never cached by the app.** Only the stable `/api/media` URL is used. A prefetched 307 older than its window simply re-resolves, so expiry is safe.
- Only URLs already present in the **published** payload that was rendered to this visitor are prefetched. A code-protected Space renders its payload only after the access cookie is accepted, so no protected content is prefetched before access. Drafts are never referenced on guest routes.

**R2 coordination (Part H).** The R2 POC replaces `/api/media` with a Worker and short-lived tokens. To avoid two implementations:
- P2, P3 and P4 are written behind the existing `publicMediaUrl()` / `mediaSrcSet()` seam (`lib/media/path.ts:211`, `cachePolicy.ts:192`).
- The prefetcher only consumes URLs, so it works unchanged with either origin.
- If R2 cutover is approved before TASK 033 step 3, P3/P4 are dropped in favour of the Worker's token TTL.

### 4.7 Security and privacy implications

- **No change to tenant, draft/published or code-access isolation.**
  - P2 must reproduce `resolveGuestAccessDetailed` exactly. A parity test compares the old chain and the RPC over the fixture matrix (public / code / suspended / expired / legacy / unpublished).
- **P4 widens the post-unpublish validity window** of public published media (60 s → proposed 600 s). Code-protected and draft content are unaffected. Owner decision D-PF2.
- **P1 moves where Production functions execute.** No data residency change for stored data (the database is already in Tokyo). Logs move to the `hnd1` region.
- **The country privacy fix (4.1 #8)** removes a field from anonymous published snapshots.
- **No new tracking.** Performance evidence comes from lab tests. If real-user metrics are added later, they are aggregate only, with no listener or guest identifier, IP or user agent (same rule as metering).
- The loading screen is static, makes no third-party requests and sets no cookies.

### 4.8 Expected performance impact (to be verified, not claimed)

These are estimates from the measured round-trip structure. Acceptance uses measured after-numbers only.

- **P1 alone:** per database round trip ~150–170 ms → ~2–10 ms.
  - Page HTML: 1.8–2.8 s → **~0.3–0.6 s**.
  - Cold `/api/media`: 2.1 s → **~0.2–0.4 s**.
  - Cold hero ready (fast, 390 px): 2.1–6.6 s → **~0.8–1.5 s**.
- **P2 + P3:** a further ~30–50% off server time; removes the `/g` double chain.
- **P5:** frees ≈300 KB of competing early bandwidth. Matters most on 4G and 3G (slow-3G hero is 20 s today).
- **Earlier Stage 2:** time to Explore image ready after an early tab press, 2.7–2.8 s → under 0.5 s on fast networks.
- **Loading screen:** no performance gain by itself, and none will be claimed. It replaces blank time with a branded, honest state.

### 4.9 Affected components and files (planned)

- **Country:**
  - `components/studio/space-country-card.tsx` (remove), `retreat-configurator.tsx:2301`, `teach-studio-sections.tsx:382,1167,1394,1761-1762,1788,1961`, `arrival-step.tsx:217-218`
  - `components/forms/phone-field.tsx`, new server helper `lib/profile/accountCountry.ts`
  - `space-language-card.tsx`, dictionaries
  - (D-CC2) new migration re-creating `publish_space`, `publishSpaceRegression.test.ts`
- **Currency:**
  - new `lib/currencies/{data,format,index}.ts`, `scripts/generate-currencies.mjs`, `components/forms/currency-select.tsx`
  - `treatments-step.tsx:333-351`, `teach-studio-sections.tsx:1880-1939,2008`, `lib/modules/treatment.ts`, `lib/teach/{schemas,retreats}.ts`
  - `treatments-screen.tsx:142`, `published-space-screen.tsx`, `teach-retreats.tsx:58,135`, dictionaries
- **Performance and loading:**
  - `app/vercel.json` (P1)
  - new migration with the guest-access RPC (P2); `lib/guestAccess/*`, `lib/share/publishedSocialSpace.ts`, `app/api/media/[...path]/route.ts`, `lib/media/cachePolicy.ts` (P4)
  - `app/(guest)/{s/[slug],g/[tenantId]}/{layout,page,loading}.tsx`, new `components/guest/guest-loading-screen.tsx`
  - `components/shared/{brand-image,media-prefetch}.tsx`, `lib/media/prefetch.ts`, `app/document-shell.tsx`, `lib/teach/fonts.ts`
  - `today-screen.tsx:134`, `guest-access-screen.tsx:112-126`, `teach-guest-app.tsx` (fade), `globals.css`

### 4.10 Required migrations

| Item | Migration? | Notes |
|---|---|---|
| Country removal / phone default | **No** | Reads `profiles` (existing RLS select-own). Data kept |
| Country privacy fix (D-CC2) | **Yes** (re-create `publish_space`) | New Production fingerprints; regression test update |
| Currency selector, validation, formatting | **No** | JSON metadata; read-only non-ISO census first |
| Space default currency (D-CC3) | No | `spaceSettings` JSON |
| P1 region | No (config) | Production config change |
| P2 guest-access RPC | **Yes** (new function) | Additive; parity tests; rollback = drop function |
| Loading screen, prefetch, fonts, P3, P4 | No | Code only |

The next free number is decided at implementation (0048+), **after** any TASK 032.5 migrations, to avoid ledger collisions.

### 4.11 Test plan and acceptance thresholds (Part F)

**Harness:** extend the `perf-baseline` / `perf-nav` Playwright scripts used for 4.4 (to be committed as `app/scripts/guest-perf.mjs`). Each cell runs ×5 and the median is reported.

- **Widths:** 320, 360, 390, 430, 768, 820, 1440.
- **Engines:** Chromium, WebKit, and Firefox (install it).
- **Networks:** fast, 4G and slow 3G (CDP, Chromium only). WebKit and Firefox run on fast only, and this limitation is stated.
- **Scenarios:**
  - cold first visit, warm repeat visit;
  - direct entry (inner screens can't be deep-linked today, so this is "entry then immediate tab");
  - Home → About/Team, Schedule, Explore, Facilities, Meals.
- **Real devices:** iPhone Safari and an Android Chrome device with the owner. Emulation is never reported as device evidence.

**Acceptance (Staging, median, against the 4.4 baseline on the same harness):**
- **Cold hero ready (fast, 390):** ≤ 1.5 s and ≥ 40% better than baseline. **4G:** ≤ 2.5 s.
- **LCP (fast):** ≤ 1.8 s at 390; ≤ 2.5 s at 4G.
- **Page HTML first body byte (curl, cold):** ≤ 0.8 s.
- **Navigation to image ready** (tab press 0.3 s after load, fast): ≤ 0.8 s; after prefetch, ≤ 0.25 s.
- **Total transfer:** must not increase by more than 5% versus baseline (779/773 KB) unless documented. Font bytes reduced.
- **JS:** must not grow by more than 10 KB gzip. Duplicate media requests: 0. CLS ≤ 0.02. Failed media requests: 0.
- **Loading screen:**
  - never visible when ready in < 200 ms;
  - never visible more than 1.5 s after HTML arrives;
  - never stuck (a forced media 500, payload error and offline each resolve to content or an error state);
  - no raw keys in any of the 7 locales;
  - reduced-motion static;
  - axe clean;
  - contrast AA.
- **Security regressions:**
  - draft refs 404 anonymously;
  - foreign tenant 404;
  - a code-protected Space prefetches nothing before the code is entered (network log);
  - P2 parity matrix green;
  - existing media and guest-access tests green.
- **Currency:** 7 locales × 11 currencies formatting snapshots; no rounding of stored decimals; legacy non-ISO values render raw; no billing import (lint rule or test).
- **Country:** card absent; phone fields suggest the profile country only when empty; saved numbers unchanged; `profiles` is never written; there is no suggestion when the profile row is missing.

**Rejection rule:** any change that increases total transfer or worsens cold hero or LCP without a documented benefit is reverted.

### 4.12 Updated TASK 033 order (Part H)

1. Share Card freshness (§1)
2. Day Navigator (§3, after the A1 date-range decision)
3. **Guest startup performance:** Stage 0 (P1 region → P2 RPC → P3 → P5 fonts → P4 if approved), then the Stage 1–3 prefetch. Re-measure.
4. **Guest loading screen** (4.5)
5. **Currency and Country UX** (4.1, 4.2)
6. tr/it translations (§2; includes the new loading, currency and calling-code strings)
7. Seven-locale regression QA
8. Full Teach/Flow browser QA, including the 4.11 perf matrix and owner devices
9. Staging acceptance review
10. Production release approval request

P1 is the highest-value, lowest-code item. It could be proposed as a standalone config change earlier, **only** with explicit Production approval (D-PF1).

### 4.13 Open decisions and risks

| ID | Decision / risk |
|---|---|
| D-PF1 | Approve moving Vercel functions to `hnd1` (Tokyo). Affects all routes including billing cron and webhooks. Staging-verify first |
| D-PF2 | Public cache window for immutable published media: keep 60 s, or 600 s (recommended), or other. Trade-off: validity after unpublish |
| D-LD1 | Hero-wait cap 1.5 s (recommended) versus 1.0 s |
| D-CC1 | Language "Recommended" badges: legacy Space country only (recommended), versus none at all |
| D-CC2 | Stop publishing `spaceSettings.country` (migration). Recommended |
| D-CC3 | Add a Space-level default currency pre-filling new items. Optional |
| D-CC4 | Require a currency when a Flow price is set (new or edited rows only). Recommended |
| D-CC5 | Leave Teach Class free-text price as is (recommended) versus a structured price |
| Risk | P2 must exactly match the current access semantics. A parity suite is mandatory |
| Risk | R2 cutover overlapping step 3: keep work behind the `publicMediaUrl` seam |
| Risk | `Intl` currency output differs across ICU versions. Mitigated by server pre-formatting and snapshot tests pinned to Node ICU |
| Risk | Lab-only network throttling; WebKit and Firefox can't be throttled here. Owner devices are needed for the final word |
| Risk | Pre-0019 accounts have no profile country, so they get no phone suggestion (acceptable) |

---

## Owner decisions for TASK 033 (superseded by LOCKED OWNER DECISIONS above, except the native reviewers)

1. Which Return to Balance photo is the expected "current" one: Space image (today, a bungalow/sala) or hero (group on deck)?
2. Should Teach cards also prefer the Space image?
3. DAY n definition: (a) calendar offset (recommended) or (b) list position.
4. Show the navigator for single-day schedules?
5. Are auth and marketing pages in scope for tr/it?
6. Native reviewers for tr and it.
