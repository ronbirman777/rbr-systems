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
