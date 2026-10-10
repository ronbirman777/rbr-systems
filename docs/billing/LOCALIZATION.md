# Localization (TASK 032)

## Locales

Seven: `en, de, es, fr, he, tr, it` (`SUPPORTED_LOCALES`, selector order; Hebrew is the only RTL locale). `tr` and `it` were added in TASK 032. English is the canonical fallback; a missing key falls back to English deterministically (never machine translation at runtime).

## Two dictionary families

| Family | Where | Contents | Why separate |
|---|---|---|---|
| Shared / Guest | `lib/i18n/dictionaries/{en,de,es,fr,he,tr,it}.ts`, accessed through `translate()` / `createTranslator()` | Guest Apps, Studio, common copy. **`tr.ts` and `it.ts` are partial by design: only the `attribution` namespace** (19 lines each) | Imported by Guest client bundles |
| Account | `lib/i18n/dictionaries/billing.<locale>.ts` and `admin.<locale>.ts`, accessed through `translateAccount(locale, "billing" \| "admin", key, values)` | Create-Space funnel, Billing/Plan page, billing emails, Admin console. Complete in all seven locales | Server-rendered (or handed to client components already translated), so hundreds of keys x 7 locales never enter Guest bundles |

Both enforce typed keys against English, interpolation via `interpolate()`, and user-authored text (Space names, coupon codes) is never translated. Admin has its own language switch and sets `lang`/`dir`. Billing emails use the recipient's stored locale (`resolveLocale`), with English fallback and `dir="rtl"` for Hebrew.

## Space-selectable languages

`SPACE_SELECTABLE_LOCALES = ["en","de","es","fr","he"]` is the single switch for which language an organizer may pick for a Space's Studio and Guest App. The Space-settings zod schema (`lib/spaceSettings`) uses it, so `tr`/`it` cannot be stored as a Space language. Reason: the Teach, Flow and Studio namespaces are not translated into tr/it, so offering them would publish a half-English Guest App. **TASK 033 makes `tr` and `it` Space-selectable** after those namespaces are translated (POST-032-REQUIREMENTS.md).

What tr/it users get today: account-level surfaces (funnel, Billing, Admin, billing emails) in their language, and the Guest "Created with InnerDweS" signature in their language when the Space itself is in tr/it (which cannot currently happen).

## Glossaries

- `docs/localization/GLOSSARY-tr.md`
- `docs/localization/GLOSSARY-it.md`

Each lists concept, approved and rejected terms, context and sources (found by web search; contents taken from search summaries, not all fetched in full), and flags uncertain terms for native/legal review (for example tr "inziva" for retreat, tr "cayma hakkı" for right of withdrawal).

## Review status (honest)

| Locale | Account text (billing/admin/emails) | Guest attribution | Native review |
|---|---|---|---|
| en | source | source | n/a |
| tr | researched translation | present | **Unreviewed by a native speaker** (glossary says so) |
| it | researched translation | present | **Unreviewed by a native speaker** (glossary says so) |
| de, es, fr, he | new TASK 032 strings added | present | **New TASK 032 text is unreviewed by native speakers**; previously existing Studio/Guest copy in these locales is out of scope here |

Legal wording (consent, withdrawal, tax, terms) in every locale is unreviewed and is part of the legal launch gate (LAUNCH-GATES.md). Verified by tests: key parity against English (`adminDictionary.test.ts`, `i18n.test.ts`), no placeholder suffix patterns (`interpolationCallSites.test.ts`), terminology (`terminology.test.ts`), email rendering. Tests check structure, not linguistic quality.

My Spaces paid-mode Archive / Replace confirmations (`lifecycleArchivePaidBody`, `lifecycleReplacePaidBody`, billing namespace) are translated on the server in the account locale and handed to `SpaceLifecycleControls` with their own `lang`/`dir`; non-English text is UNREVIEWED (tr/it follow the glossaries: abonelik / abbonamento, disdire, Space). The rest of that legacy component (buttons, labels, the legacy slot copy) is pre-032 English and stays English until the legacy My Spaces page is localized, so a non-English customer sees a translated paragraph inside an otherwise English dialog. Pinned by `spaceLifecycleControlsCopy.test.ts` (no English literal in the paid branches, keys present in all seven locales) and `mySpaces.test.ts`.

Note: a comment in `emails/render.ts` still says "five locales"; the renderer itself serves all seven.
