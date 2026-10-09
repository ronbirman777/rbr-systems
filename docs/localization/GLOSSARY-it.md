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
