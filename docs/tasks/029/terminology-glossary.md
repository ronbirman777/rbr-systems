# InnerDweS terminology glossary — five locales

**Status: all 11 recommendations APPROVED by the product owner and
implemented. AI-reviewed; still not native-speaker verified.**

Owner approval is not the same as native-speaker sign-off. Every wording
below was reviewed by the product owner and by AI; no professional speaker
of German, Spanish or French has checked them, and `he.ts` still carries
its own UNREVIEWED banner. That review remains open — see §7.

Approved wordings are pinned in `src/lib/i18n/terminology.test.ts`, which
fails if any of them is "tidied up" later.

Scope: both products (Time to Flow, Time to Teach), 1190 keys per locale,
5 locales. Surfaces read: Studio module management, Guest Explore cards,
Guest bottom navigation, detail-screen headings, empty states, settings,
Live Draft Preview, Publish & Share.

## The product voice this review holds everything to

| Locale | Address | Register |
|---|---|---|
| en | second person, implied | calm, warm, clear |
| de | `du` / `dein` | informal, natural compounds |
| es | `tú` / `tu` | international Spanish, no regionalisms |
| fr | `tu` / `ton` / `ta` / `tes` | informal, warm |
| he | plural imperative (`שתפו`, `עזרו`) | modern Israeli Hebrew |

Automated voice audit over all 1190 keys × 5 locales:

| Check | Result |
|---|---|
| Spanish `usted` / `ustedes` | **0** |
| French `vous` / `votre` / `vos` / `veuillez` | **0** |
| German formal `Sie` / `Ihr` / `Ihnen` as address | **0** (2 matches, both the feminine pronoun "sie/Sie ist…", correct) |
| Latin-script leakage in Hebrew values | **3**: `HTML` (a technical acronym, in a Markdown help string) and the two Share Card canvas labels, whose English fallback is deliberate and pinned by a test. Was 34 before R11 removed `ה-Guest App` from 15 strings. |

That audit is now a test: `src/lib/i18n/terminology.test.ts` fails if a
formal register reappears anywhere in Spanish or French.

---

## 1. Module glossary — Time to Flow

| Concept | Context | en | de | es | fr | he | Note |
|---|---|---|---|---|---|---|---|
| Schedule | Studio step, guest nav | Schedule | Zeitplan | Programa | Programme | לוח זמנים | es/fr deliberately non-literal: a retreat has a *programme*, not a timetable. ✓ |
| Facilitators | Studio step | Facilitators / Teachers | Begleitung / Lehrende | **Equipo / profesores** | Équipe / intervenants | מנחים / מורים | R2 applied. |
| Team | Guest nav | Team | Team | Equipo | Équipe | הצוות | Shorter guest-side form of the same concept. Intentional contextual variation. ✓ |
| Meals | Studio step, Explore card | Meals | Mahlzeiten | Comidas | Repas | ארוחות | ✓ |
| Treatments | Studio step, Explore card | Treatments | Behandlungen | Tratamientos | Soins | טיפולים | fr `Soins` is exactly the word a French spa uses. ✓ |
| Facilities | Studio step, Explore card | Facilities | **Räume** | **Espacios** | Lieux | **מרחבים ומתקנים** | R1 applied. Name and description now agree in all five. |
| Arrival Info | Studio step, Explore card | Arrival Info | Ankunftsinfos | Llegada | Arrivée | פרטי הגעה | ✓ |
| Daily Inspiration | Studio toggle, Today screen | Daily Inspiration | Täglicher Impuls | Inspiración diaria | Inspiration du jour | השראה יומית | de `Impuls` is idiomatic in this market. ✓ |
| Questions (FAQ) | Studio step, Explore accordion | Questions | Fragen | Preguntas | Questions | שאלות | ✓ |
| Guidelines | Studio step, Explore card | Guidelines | Hinweise | **Normas de convivencia** | Règles du lieu | הנחיות | R4 applied. 21 chars — checked rendered, see §8. |
| Readings | Studio step, Explore card | Readings | **Texte** | Lecturas | Lectures | **קטעי קריאה** | R3 applied — one German word for a piece of writing in both products. |
| Custom Pages | Studio step | Custom Pages | Eigene Seiten | Páginas propias | Pages libres | עמודים משלכם | ✓ |
| Stay connected | Studio step, Explore card | Stay connected | In Kontakt bleiben | Sigue en contacto | Restons en lien | נשארים בקשר | fr `Restons en lien` — warm, natural. ✓ |
| Audio | Studio step, Explore card | Audio | Audio | Audio | Audio | אודיו | ✓ |
| Resources | catalog only, not built | Resources | Materialien | Recursos | Ressources | חומרים | ✓ |
| Announcements | catalog only, not built | Announcements | Mitteilungen | Avisos | Annonces | הודעות | ✓ |
| Today | Guest nav | Today | Heute | Hoy | Aujourd'hui | היום | fr is 11 chars; owner kept it — no shorter natural French form. |

## 2. Module glossary — Time to Teach

| Concept | Context | en | de | es | fr | he | Note |
|---|---|---|---|---|---|---|---|
| Home | Guest nav | Home | Start | Inicio | Accueil | בית | ✓ |
| Schedule | Guest nav | Schedule | **Kursplan** | Horarios | Horaires | לוח שיעורים | R5 applied — Teach only; Flow keeps `Zeitplan`. |
| About Me | Guest nav, detail screen | About Me | Über mich | Sobre mí | **À propos** | עליי | R6 applied. |
| Explore | Guest nav | Explore | Entdecken | Descubre | Explorer | **תכנים** | R7 applied — a noun, and it reads as "חזרה לתכנים" on the back button. |
| My Readings | Explore card, section heading | My Readings | Meine Texte | Mis lecturas | Mes lectures | **קטעי הקריאה שלי** | **[owner-ruled]** — the benchmark |
| My Audio | Explore card, section heading | My Audio | **Meine Aufnahmen** | Mis audios | Mes audios | **קטעי האודיו שלי** | R3 applied. |
| Get in touch | Explore card | Get in touch | Kontakt aufnehmen | Escríbeme | Me contacter | צרו קשר | es `Escríbeme` is personal and warm. ✓ |

## 3. Why the possessive differs between products

The brief asks that "My" not be forced into every language. It is not:

- **Teach** content belongs to one named teacher, so the possessive is
  carried in all five: `Meine Texte`, `Mis lecturas`, `Mes lectures`,
  `קטעי הקריאה שלי`.
- **Flow** content belongs to the retreat, not to the organizer reading
  it, so Flow's equivalents are bare: `Texte`, `Lecturas`,
  `Lectures`, `קטעי קריאה`. A Hebrew `קטעי הקריאה שלי` on a Flow module
  would make the retreat's library sound like the organizer's personal
  one.

This asymmetry is now pinned by a test rather than left to be "tidied up"
into consistency later.

---

## 4. Implemented this pass

Clear defects only — number agreement and a wording the owner had already
ruled on in the sibling product.

| # | Key | Locale | Was | Now | Why |
|---|---|---|---|---|---|
| F1 | `teach.exploreAudio` | es | `Mi audio` | `Mis audios` | Singular where it names a library of tracks, sitting directly beside `Mis lecturas` in the same Explore list. A number error, not a preference. |
| F2 | `flow.readings` | he | `קריאה` | `קטעי קריאה` | `קריאה` is the *activity* of reading; the module is a *collection*. Exactly the defect the owner corrected in Teach (`הקריאות שלי` → `קטעי הקריאה שלי`), applied to the one place in Flow that still had it. |

Both are pinned in `src/lib/i18n/terminology.test.ts`.

---

## 5. Approved and applied — R1 to R11

All eleven were approved by the product owner. Where the owner chose a
different wording from the one recommended, the owner's wording is what
shipped and the difference is noted.

| # | Key / concept | Locale | Was | Now | Surfaces |
|---|---|---|---|---|---|
| R1 | `flow.facilities` | de | Einrichtungen | **Räume** | Studio step + Modules card + toggle `aria-label` + cover-image label + Save button; Guest Explore card + detail heading |
| R1 | `flow.facilities` | es | Instalaciones | **Espacios** | same |
| R1 | `flow.facilities` | he | מתקנים | **מרחבים ומתקנים** | same. Owner chose the compound over the recommended bare `מרחבים` — see the note below. |
| R2 | `flow.moduleFacilitatorsLabel` | es | Equipo / profesorado | **Equipo / profesores** | Studio step label + Modules card. Owner chose `profesores` over the recommended `docentes`. Guest side is a separate key (`navTeam` → *Equipo*) and is untouched. |
| R3 | `flow.readings` | de | Lesestücke | **Texte** | Studio step + Modules card + Save button; Guest Explore card + detail heading + **back-button label** |
| R3 | `teach.exploreAudio` | de | Meine Audios | **Meine Aufnahmen** | Teach Studio section header + nav label + default Explore card title; Guest Explore card + section eyebrow + list title |
| R4 | `flow.guidelines` | es | Normas | **Normas de convivencia** | Studio step + Modules card + Save button; Guest Explore card + detail heading |
| R5 | `teach.navSchedule` | de | Zeitplan | **Kursplan** | Teach Studio section header; Guest bottom nav. **Flow's `navSchedule` deliberately still reads `Zeitplan`** — the two were explicitly kept apart. |
| R6 | `teach.navAbout` | fr | À propos de moi | **À propos** | Guest bottom nav **and** the Teach Studio section header, which share one key. `À propos` reads correctly as a section heading, so no second key was introduced. `flow.navToday` was left as `Aujourd'hui` per the owner. |
| R7 | `teach.navExplore` | he | גלו | **תכנים** | Guest bottom nav; library back buttons (×2); the back `aria-label` via `common.backTo` → **"חזרה לתכנים"** |
| R8 | `flow.moduleAudioDesc` | he | …יכולים **להשמיע** | …יכולים **להאזין להם** | Studio Modules list. `להשמיע` is to play something *for others to hear*; a guest pressing play is listening. |
| R9 | `flow.moduleGuidelinesDesc` | de | Hausregeln und **Gut-zu-wissen** | Hausregeln und **Wissenswertes** | Studio Modules list |
| R10 | `flow.moduleAudioDesc` | fr | …**causeries**… | …**enseignements**… | Studio Modules list. Sits as one of three kinds beside *Méditations* and *pratiques*, so the sentence does not claim every recording is a teaching. |
| R11 | "Guest App" | he | ה-Guest App (**15** strings) | **אפליקציית האורחים** | Studio throughout: Publish & Share, guest-access panel, public-link card, QR `alt` text, draft-preview copy, contrast policy, cover-image prompt |

### R11 was not a find-and-replace

`אפליקציה` is **feminine**; the old Latin term had been treated as
masculine in five strings. Those agreements were flipped by hand:

| Key | Was | Now |
|---|---|---|
| `teach.draftPreviewBody` | ה-Guest App **האמיתי** | אפליקציית האורחים **האמיתית** |
| `flow.previewPublishBody` | **החי מתעדכן** | **החיה מתעדכנת** |
| `flow.viewLiveGuestApp` | ב-Guest App **החי** | באפליקציית האורחים **החיה** |
| `flow.needCoverImage` | שה-Guest App **יקבל** | שאפליקציית האורחים **תקבל** |
| `studio.contrastPolicy` | ה-Guest App **בוחר** | אפליקציית האורחים **בוחרת** |

Construct state (סמיכות) also moves the definite article onto `האורחים`,
so prefixes attach to `אפליקציית` directly: `ב+` → `באפליקציית`, `ל+` →
`לאפליקציית`, `ש+` → `שאפליקציית`. `teach.draftPreviewBody`'s second
sentence already said `האפליקציה החיה` — the two halves of that string now
finally agree with each other.

### One deliberate overlap to keep an eye on

`מרחב` is already the fixed Hebrew term for **Space**, the product's own
top-level concept (`he.ts` header). The owner's `מרחבים ומתקנים` for
Facilities therefore shares a word with it. The compound is what keeps
them apart in practice — Facilities reads as "spaces and amenities" and
is a guest-facing module name, while *Space* is the organizer's word for
their whole Space and never appears beside it. Recorded here so it is a
known choice rather than a later surprise.

## 6. Known limitation, not a defect

The Share Card's two canvas labels (`flow.cardKicker`,
`flow.cardScanLabel`) fall back to English for Hebrew. The canvas font has
no Hebrew coverage and the letter-spacing routine advances left to right
one glyph at a time, so Hebrew would render as tofu or reversed. This is
deliberate and already pinned by a test in `i18n.test.ts`; everything
around the card in the Studio is Hebrew. Fixing it needs a Hebrew-capable
face and a direction-aware text routine, which is its own task.

---

## 7. What has not been verified

- **No native-speaker review.** Owner-approved is not speaker-verified.
  Five languages ship on owner + AI judgement, and `he.ts` still carries
  its own UNREVIEWED banner. One speaker per language, ten minutes each,
  is the whole remaining cost — recommended before Production.
- **Hebrew guest `dir="rtl"` on a real deployment.** Proven
  deterministically for all five locales by
  `src/app/guestDocumentLanguage.test.ts`, and observed in the Production
  Studio, but not yet served from a Hebrew-published Space on Staging.
