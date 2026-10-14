# Native-speaker review checklist: Turkish (tr) and Italian (it)

Status 2026-10-14 (TASK 033 acceptance, branch `fix/033-acceptance-2`): tr and it are **complete but unreviewed** and
**not selectable** for a Space. One reviewer per language walks everything below and signs off in the format at the end.
Only after both sign-offs (plus fixes) is the release switch thrown (last section).

## Completeness evidence (script check, 2026-10-14)

| Check | tr | it |
|---|---|---|
| Keys vs English: common 74, teach 506, flow 406, studio 294, attribution 2 | all present, 0 extra | all present, 0 extra |
| Keys added since the TASK 033 base `d02ac99` (27: P1–P3, integration, Staging fixes) | 27/27 translated | 27/27 translated |
| Placeholder set identical to English (`{name}`, `{count}`, …) | 0 mismatches | 0 mismatches |
| Empty / whitespace-only strings | 0 | 0 |
| ICU `{n, plural, …}` syntax | not used anywhere; plurals are One/Many key pairs (`classOne` / count form) | same |
| Values identical to English (loanwords, brand names, samples) | 12, all intentional (Yoga, WhatsApp, Brunch, Modern…) | 22, all intentional (Home, Brand, Audio, Check-in…) |
| Account-level files (`billing.*.ts` 198 keys, `admin.*.ts` 502 keys) | complete, 0 placeholder mismatches | complete, 0 placeholder mismatches |
| Release switch | `tr` **not** in `SPACE_SELECTABLE_LOCALES` | `it` **not** in it |

The vitest guards `src/lib/i18n/trIt.test.ts`, `terminology.test.ts` and `interpolationCallSites.test.ts` enforce the same
rules on every run. Machine checks cannot judge tone, register, idiom, truncation or legal meaning. That is the reviewer's job.

## How the reviewer sees the strings

tr/it cannot be chosen in the product yet, so the reviewer needs one of these (the owner decides):

1. **Review build (recommended):** a throwaway branch that adds `"tr", "it"` to `SPACE_SELECTABLE_LOCALES`, deployed to
   Staging only (needs a Staging deploy approval), with one synthetic Flow Space and one Teach Space per language. The branch
   is never merged; the real switch is a separate one-line release change.
2. **Screenshots:** a full set captured on the local QA stack with the same throwaway switch. This is cheaper but does not
   allow interaction or check truncation on the reviewer's own phone.
3. **Strings only:** `app/src/lib/i18n/dictionaries/{tr,it}.ts` side by side with `en.ts`. Use this only to complement 1 or 2,
   because context is lost.

Review on a real phone (iPhone Safari and an Android Chrome if available) at 320–430 px and once on desktop.

## Glossaries (read first)

- `docs/localization/GLOSSARY-tr.md`: register (formal "siz", plain imperative buttons), product nouns (Space'iniz,
  Studio'da), "inziva", suffix rule, **"Items for native review (P5)" 1–10**, Admin items.
- `docs/localization/GLOSSARY-it.md`: register (Lei), "ritiro", guide/facilitatori, **"Items for native review (P5)" 1–11**.

Confirm or replace each glossary decision marked UNCERTAIN or listed under "Items for native review".

## Screens and flows to walk

Tick each item and note the key name (visible in the dictionary) for any change.

### Time to Flow Guest App (`/s/<slug>`)
- [ ] Loading screen ("Created with InnerDweS") and access-code screen: keypad label, wrong-code and rate-limit messages
- [ ] Today: greeting, date line (long date), "Happening now / Up next", Daily Inspiration card
- [ ] Schedule: Day Navigator (weekday, date, "DAY n", Today, aria labels), empty-day state, single-day header, session cards
- [ ] Explore heading and every module: Facilitators, Meals, Treatments & Extras (prices, "included" / "additional", availability),
      Facilities, Arrival info, Guidelines, FAQ, Readings, Audio, Custom pages, Stay connected
- [ ] Bottom navigation labels at 320 px (no truncation)
- [ ] 404 / unavailable Space page

### Time to Teach Guest App
- [ ] Home: today's classes, short dates (`formatShortDateLocalized`), "Up next" line, quote attribution
- [ ] Schedule: week view, class card (time range, price free text, "until {date}", spots), recurrence summary
      ("every week on Mon, Wed", "day 5 of the month", "until {date}")
- [ ] About Me, Certificates, Contact (registration CTAs: WhatsApp / Instagram / e-mail / venue link)
- [ ] Explore: Readings, Audio, Gallery, **My Retreats** (date range, price, "Open the retreat app")
- [ ] Share Card CTA text

### Studio: Time to Flow (configurator)
- [ ] Every step: Identity (name, timezone help), Brand, Modules, Retreat Home (start/end dates, unsaved-changes dialog),
      Schedule, each module step, Treatments (price, **currency picker**, "Unrecognised currency", "Choose a currency for the
      price of …", "Amounts are not converted"), Preview & Publish, Share your Space (Share Card canvas lines), Featured
- [ ] Every error / success message on save and publish, the language card (Recommended badges), Guest Access panel

### Studio: Time to Teach
- [ ] Every section: Profile, timezone, slug, Classes (recurrence editor, DST conflict messages, exceptions), Readings, Audio
      (allowance messages), Gallery, Certificates, My Retreats (dates, price + currency, Flow link errors), Contact, Publish

### Account level (already tr/it since TASK 032, also unreviewed, lower priority)
- [ ] Create New Space funnel, Billing pages and e-mails (`billing.*.ts`), Admin (`admin.*.ts`, internal)

## High-risk strings (review word by word)

| Area | Why | Where |
|---|---|---|
| **Legal / consumer** | Statutory meaning (tr "cayma hakkı", it "diritto di recesso"), terms, privacy, cancellation | `billing.*.ts`, glossary "Right of withdrawal" (UNCERTAIN, legal review advised) |
| **Pricing** | Amount and currency must be unambiguous. Output comes from Intl (tr: `USD 50,00`, `€120,00`, `₺400,00`, `฿700,00`; it: `50,00 USD`, `120,00 €`, `400,00 TRY`, `700,00 ฿`), so check symbol vs code, order and spacing; a bare `$` is never shown for an ISO dollar; Teach class price is free text | Treatments, My Retreats, `classPricePlaceholder` (sample values), `retreatCurrencyPlaceholder` |
| **Dates** | Short / long / range forms come from Intl (tr: "14 Eki Çar", "14–20 Eki 2026"; it: "mer 14 ott", "3 gen – 31 mag 2026") | Teach Home / Schedule, Day Navigator, My Retreats |
| **Ordinals** | tr writes "5." (`ordinalDayLocalized`), it writes a bare "5" ("il giorno 5") | recurrence summaries, glossary tr item 2 |
| **Casing** | Turkish dotted/dotless i: "İ/i", "I/ı". Uppercase is done by CSS under `lang="tr"` and by `capitalizeFirst(text, "tr")`; check every UPPERCASE label (Day Navigator weekday, Share Card kicker "İNZİVA …", Studio buttons) | Guest + Studio |
| **Suffixes (tr)** | No suffix may touch a `{placeholder}`; label forms are used instead ("Kimden: {name}") | glossary tr item 1 |
| **Plural workarounds (it)** | "giorno/i", "lezione/i" | glossary it item 7 |
| **Register** | tr formal "siz" vs imperative buttons; it Lei may read stiff in onboarding | glossaries |
| **Length** | Share Card canvas lines, bottom nav, buttons at 320 px | Share step, Guest nav |

## Sign-off format (one per language)

```
LANGUAGE REVIEW SIGN-OFF
Language: tr | it
Reviewer: <name>, native speaker of <language>, <relevant background>
Date: YYYY-MM-DD
Build reviewed: <deployment URL or screenshot set> @ <commit SHA>
Devices: <e.g. iPhone 15 Safari iOS 19, Pixel 8 Chrome, desktop Chrome>
Scope walked: Flow Guest [x]  Teach Guest [x]  Flow Studio [x]  Teach Studio [x]  Account/Billing [ ] (optional)
Glossary decisions: all confirmed | changes listed below
Changes required (key -> proposed text, reason):
  - <namespace.key>: "<current>" -> "<proposed>" (<reason>)
Legal strings reviewed by a qualified person: yes / no / not applicable
Verdict: APPROVED | APPROVED AFTER CHANGES | NOT APPROVED
```

Approved changes are applied in a follow-up commit and the vitest guards are re-run. If the changes are substantial,
the reviewer re-checks them.

## The single release switch

`app/src/lib/i18n/locales.ts`:

```ts
export const SPACE_SELECTABLE_LOCALES = ["en", "de", "es", "fr", "he"] as const satisfies readonly Locale[];
// after both sign-offs:            ["en", "de", "es", "fr", "he", "tr", "it"]
```

This one constant drives the Studio language selector (`components/studio/space-language-card.tsx`) and the Space-settings
schema that refuses to store tr/it (`lib/spaceSettings/index.ts`). When it flips, the test "the release switch for Turkish
and Italian is still off" in `trIt.test.ts` must be updated in the same commit. It is a release change and follows the normal
Staging, then Production gates.
