# Italian (it) billing glossary - TASK 032

Status: UNREVIEWED by a native speaker. Register: formal "Lei" in sentences, impersonal infinitive on buttons/labels (Netflix/Spotify IT use "tu"; Lei chosen for a paid, account-level surface). Search access was limited to snippets; sources below are the pages surfaced by research, not full-page audits.

| Concept | Approved IT | Rejected | Context | Rationale |
|---|---|---|---|---|
| Subscription | abbonamento | sottoscrizione, iscrizione | plan/status | Netflix/Spotify IT "abbonamento" |
| Cancel subscription (customer ends) | disdire / disdetta | cancellare, annullare | Billing page, emails | "Disdire" is the standard consumer term (Netflix IT "Come disdire l'abbonamento"); "annullare" kept only for an abandoned checkout ("pagamento annullato") |
| Resume | riattivare | riprendere, ripristinare | resumeButton | Reverses a scheduled disdetta |
| Renewal | rinnovo | rinnovazione | nextAction | Common |
| Billing | fatturazione | billing, addebito (only for "charge") | page title, cycle | Stripe IT "fatturazione" |
| Billing cycle | ciclo di fatturazione | periodo di billing | pre-checkout | Stripe IT / Google Play IT |
| Charge | addebito | carica, costo | nextCharge | Netflix IT "addebito" |
| Invoice / receipt | fattura / ricevuta | bolletta | document links | Kept both, as source does; fiscal nature is a legal matter (Airbnb IT distinguishes) |
| Payment method | metodo di pagamento | modalita' di pagamento | updatePayment | Netflix IT "metodo di pagamento" |
| Payment failed | pagamento non riuscito | fallito | email/status | Natural, non-alarmist; Netflix IT "non e' riuscito a elaborare" |
| Payment issue | problema di pagamento | errore | chips | Netflix IT "problema con il tuo ultimo pagamento" |
| Unresolved payment | regolarizzare il pagamento | risolvere (calque) | CTAs | Idiomatic Italian admin register |
| Uncollectible | insoluto | non riscuotibile | invoice status | Standard accounting term |
| Secure checkout | pagamento sicuro | checkout | funnel | "Checkout" avoided; Stripe IT uses "pagamento sicuro" |
| Coupon code | codice sconto | coupon, codice promozionale | funnel, errors | Airbnb IT community uses both "coupon" and "codice"; "codice sconto" clearer. Codes themselves never translated |
| Tax | imposte | tasse, IVA | taxNote | Generic, no rates stated; IVA avoided because tax treatment is not final |
| Right of withdrawal | diritto di recesso | diritto di ritiro | consent | Italian consumer-law term (Codice del Consumo) - needs legal review |
| Suspended | sospeso | bloccato | Studio status | Netflix IT "account sospeso" |
| Delete | eliminare | cancellare | deletion notices | Avoids clash with disdetta |
| Retreat | ritiro | retreat | teach/flow copy | Yoga sites (Graubuenden IT, Yumping IT) use "ritiro" and "yoga retreat"; "ritiro" for plain copy |
| Guest App | app per gli ospiti | Guest App | all copy | Hospitality term "ospiti"; lowercase mid-sentence. Studio UI still English until TASK 033 - see uncertain items |
| Space | Space (invariable; "I miei Space", "uno Space") | spazio | all | Product noun, as in de/fr; article "lo" before s+consonant |
| Studio | Studio ("lo Studio") | Studio di insegnamento | all | Product noun, capitalised |
| Students | allievi | studenti, alunni | teachPoint | Yoga context; "studenti" sounds academic |
| Daily schedule | programma della giornata | agenda | flowPoint1 | Retreat sites: "programma giornaliero" |
| Time to Teach / Time to Flow | untouched | - | product names | Brand rule |

## Attribution (it.ts)
- `attribution.createdWith`: "Creato con {brand}" (already correct; no change)
- `attribution.linkLabel`: "{brand} - si apre in una nuova scheda" (already correct; no change)

## Sources
- https://help.netflix.com/it/node/41049 (Fatturazione e pagamenti)
- https://help.netflix.com/it/node/407 (Come disdire l'abbonamento)
- https://help.netflix.com/it/node/2065 (account sospeso per problema di pagamento)
- https://stripe.com/it/billing/subscriptions
- https://support.spotify.com/sm-it/article/refund-policy/
- https://www.smartworld.it/guide/come-disdire-spotify-premium.html
- https://news.airbnb.com/it/come-usare-bonus-vacanze-airbnb/
- https://www.smoobu.com/it/guides/booking-com/politica-di-cancellazione/
- https://www.graubuenden.ch/it/eventi/alpine-reset-yoga-retreat
- https://www.yumping.com/it/offerte/surf-camp/cadiz/ritiro-di-surf-e-yoga-a-chiclana-puente-del-pilar--o53214

## Admin (admin.it.ts)

Status: UNREVIEWED by a native speaker. Internal tool: formal "Lei" in sentences, impersonal infinitive/noun on labels and buttons. Research: GitHub Docs IT-style wording "app di autenticazione/TOTP", "codice QR", "chiave di configurazione" (setup key); Google Account Help IT uses "Verifica in due passaggi" (https://support.google.com/accounts/answer/185839?hl=it). Search access gave summaries only, not full-page audits.

| Concept | Approved IT | Rejected | Rationale |
|---|---|---|---|
| Audit log | registro di controllo (nav: Registro) | audit log, log di audit | Italian IT/accounting register; "controllo" matches Microsoft IT "Log di controllo". Short nav label "Registro". |
| Step-up (re-verify before sensitive change) | "Conferma della sua identità" + nuovo codice | step-up, passaggio superiore | No Italian term; user-facing meaning is re-confirming identity. |
| Authenticator app | app di autenticazione | autenticatore, authenticator | Google/Microsoft IT usage. |
| Setup key | chiave di configurazione | chiave di setup, chiave segreta | GitHub IT "chiave di configurazione". |
| QR | codice QR | QR code | Italian word order, as GitHub/Google IT. |
| TOTP | password monouso basate sul tempo | TOTP | Spelled out once; abbreviation not shown. |
| MFA / two-step verification | verifica in due passaggi | autenticazione a più fattori, 2FA | Google IT "Verifica in due passaggi". AAL2 never shown. |
| Webhook | webhook (invariable) | gancio web | Stripe IT keeps "webhook"; "eventi webhook". |
| Reconciliation / resync | risincronizza (da Stripe) | riconcilia, rielabora | "Riconciliazione" implies bank reconciliation; here state is re-read from Stripe. |
| Sync to Stripe | sincronizza con Stripe | sincronizza su Stripe | "con" is natural for sync. |
| Exempt (non-paying Space) | esente / esenzione | gratuito, escluso | Fiscal/administrative term; "gratuito" would imply a free plan. |
| Internal / legacy | interno / legacy | ereditato | "Legacy" is used as-is in Italian IT. |
| Outbox (if surfaced) | coda di invio (outbox) | posta in uscita | Not currently shown in admin copy; reserved wording. |
| Admin | amministratore (brand: InnerDweS Admin) | admin | Lowercase generic noun; "Proprietario" for Owner. |
| Paid checkout switch | acquisto a pagamento | checkout | Per main glossary "checkout" avoided. |
| Cancel dialog button | Annulla | Disdici | "Annulla" is the dialog convention; "disdetta" stays for subscriptions. |
| Revoke | revoca / revocare | eliminare | Access rights are revoked, not deleted. |
| Canceled subscription | disdetto | annullato | Per main glossary. |
| Uncollectible invoice | insoluta | non riscuotibile | Per main glossary. |

Punctuation: guillemets «» for quoted terms; accents and elisions checked (un'app, l'accesso, dell'esenzione, all'eliminazione, uno Space, lo Studio, gli Space).

Items for native review: "registro di controllo" vs "registro di audit"; "(Lei)" label for the current admin in lists; "Scaduto" for past_due.

## Studio and Guest Apps (it.ts, TASK 033 P5)

Status: PENDING NATIVE REVIEW. Every `common`, `teach`, `flow` and `studio` key is translated (74 / 505 / 390 / 284 keys);
`it` is still NOT in `SPACE_SELECTABLE_LOCALES` (owner decision A2: added only after QA + native review). Register: formal
"Lei" in sentences addressing the organizer, short imperative on buttons ("Salva", "Pubblica"), neutral/impersonal
phrasing for guests; never "tu" (test-pinned). Pinned in `app/src/lib/i18n/terminology.test.ts`.

| Concept | Approved (pending review) | Rejected | Rationale |
|---|---|---|---|
| Guest App | app per gli ospiti | Guest App | As billing glossary; no Latin "Guest App" in it.ts (test-pinned). |
| Space / Studio | Space, Studio (lo Space, gli Space, I miei Space, lo Studio) | spazio | Product nouns. "spazio" appears only as an ordinary word ("Il mio spazio di insegnamento"). |
| Retreat | ritiro (I miei ritiri, Home del ritiro) | retreat | |
| Teacher / students / class / session | insegnante / allievi / lezione / sessione; sessione privata; individuale | studenti, corso | |
| Facilitators | Guide (singular guida); catalog "Guide / Insegnanti" | facilitatori | Warmer; native review may prefer "facilitatori". |
| Schedule (nav) | Teach "Calendario" (class timetable), Flow "Programma" (retreat programme) | Orario | Same distinction as German R5. |
| Readings / Audio | Letture, Le mie letture / Audio, I miei audio | | |
| Facilities | Ambienti (eyebrow "Luoghi") | Spazi, Strutture | Rooms, not equipment (R1); "Spazi" would clash with "Space". |
| Treatments | Trattamenti; "Trattamenti ed extra" | | |
| Meals / Guidelines / FAQ | Pasti / Regole (guidelinesShort identical) / Domande, Domande frequenti | Linee guida | |
| Arrival | Informazioni per l’arrivo; Check-in / Check-out kept | | Standard Italian hospitality usage. |
| Daily Inspiration | Ispirazione del giorno; quote = citazione; reflection = riflessione | | |
| Custom Pages / Modules / Identity / Brand | Pagine personalizzate / Moduli / Identità / Brand | Marchio | |
| Preview & Publish | Anteprima e pubblicazione; Pubblicato; Ripubblica; Bozza | | |
| Hero / cover image | immagine principale, foto principale / immagine di copertina; punto focale | | |
| Guest Access / access code | Accesso ospiti / codice di accesso | | |
| Share Card | card di condivisione; canvas lines "IL RITIRO A PORTATA DI MANO", "SCANSIONA PER APRIRE L’APP DEL RITIRO" | biglietto | |
| Space slot | slot Space | | |
| Live (published status) | Online; live session badge "Dal vivo" | | |
| Recurrence | "ogni settimana di lun, mer", "il giorno 5", "Fino al {date}", "Si ripete {summary}" | | `ordinalDayLocalized` returns a bare "5" for it. |

Items for native review (P5):
1. Lei register in onboarding steps ("Ci racconti il suo ritiro", "Salvi prima l’Identità") - may read stiff.
2. `flow.exploreHeading` "{em}" + "Il ritiro" (avoids choosing "Il suo/Il tuo ritiro"); `facilitatorsHeading` "Ecco le guide".
3. "Guide" vs "facilitatori"; "Ambienti" / "Luoghi".
4. Share Card kicker "IL RITIRO A PORTATA DI MANO" (canvas width to be checked).
5. `teach.getInTouch` "Mettiamoci in contatto" (long for a button), noun-phrase CTAs "Iscrizione via WhatsApp".
6. `catBreathworkR` "Respirazione", `catMindfulness` "Consapevolezza" (Italian studios often keep the English).
7. `unitDays` "giorno/i", `readinessNoRegistration` "{count} lezione/i" plural workarounds.
8. `listMeOnInnerDwes` "Voglio comparire su InnerDweS".
9. `common.live` "Online", `flow.live` "Dal vivo", `chargeAdditional` "A pagamento".
10. Localised examples (`retreatCurrencyPlaceholder` "es. EUR", `classPricePlaceholder` "15 € · carnet 5 lezioni 65 €", `locationLinePlaceholder` "Milano · …").
11. ~~Intl range output for it zero-pads the day across months ("14 ott – 03 nov 2026")~~ - Node ICU 78 behaviour (browsers write "3"); **fixed** 2026-10-14 in `formatDateRangeLocalized` (leading zero stripped, TASK 033 D4). Reviewer: confirm "3 gen – 31 mag 2026" reads naturally.
