# Post-TASK 032 requirements

## TASK 033 - LOCALIZATION QUALITY + SCHEDULE VISUAL UNIFICATION + TIMEZONE UX

**Status: APPROVED BUT NOT IMPLEMENTED.** Nothing below exists in the code today. It is recorded here so it is neither lost nor assumed done. Do not start without the 033 task being issued.

### 1. Localization quality

- Translate the Teach, Flow, Studio and common namespaces into `tr` and `it` (today `tr.ts`/`it.ts` hold only `attribution`; every other key falls back to English).
- Then add `"tr"` and `"it"` to `SPACE_SELECTABLE_LOCALES` (`lib/i18n/locales.ts`) so they become Space-selectable languages; the Space-settings schema follows automatically because it uses that constant.
- Native review of tr and it (including the TASK 032 account text and legal wording) and of the new TASK 032 text in de, es, fr, he. Resolve the "UNCERTAIN" items in `docs/localization/GLOSSARY-tr.md` and `GLOSSARY-it.md`.
- The schedule UX below must work in **all seven locales**, including RTL (he).

### 2. Schedule visual unification

- Refine the **Flow retreat Schedule** visual design.
- Add a **Retreat Day Navigator** showing weekday, date and "Day N".
- Give Flow and Teach schedules a **shared visual language**.

### 3. Timezone UX

| Requirement | Detail |
|---|---|
| Space default timezone | An IANA timezone per Space (today `tenants.timezone` exists; paid provisioning sets it to `UTC` via `DEFAULT_TIMEZONE`) |
| Override | Per-class and per-series override of the Space default |
| Recurrence | A recurring series preserves its timezone across occurrences |
| DST safety | Store **wall-clock local time + IANA timezone**, derive UTC from the pair per occurrence, so a 09:00 class stays 09:00 local across a DST change |
| No silent shifting | Changing the Space default timezone must not silently move existing scheduled items |
| Guest display | Review the Guest timezone-display UX (how a guest sees times relative to the retreat/class timezone) |
| No country inference | A country must **not** be used to infer a timezone (many countries span several zones); the organizer chooses explicitly |

### 4. Context for whoever implements

- Existing helpers: `lib/timezone.ts` (`todayInTimezone`, `currentTimeInTimezone`, `listTimezones`, `timezoneOptions`, `DEFAULT_TIMEZONE = "UTC"`).
- Published schedule payload is built in `publish_space` (date, `HH24:MI` start/end); any change is a new forward-only migration (never edit 0001-0041) and must keep legacy snapshots identical when new fields are absent.
- Out of scope for this record: billing, Stripe, pricing.
