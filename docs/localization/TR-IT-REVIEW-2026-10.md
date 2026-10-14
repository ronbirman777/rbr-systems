# Turkish and Italian translation review (2026-10)

Branch `i18n/033-tr-it-review` (base `e8d2d03`). Local only. **No native speaker has reviewed or certified any of these strings.**
This is a research-based review by an AI agent. It does not replace the sign-off in `NATIVE-REVIEW-CHECKLIST-tr-it.md`.

## Method

1. Dumped every key of `en`, `tr` and `it` side by side (shared dictionary 1,285 keys: common 74, teach 506, flow 409, studio 294, attribution 2;
   billing 198; admin 502; 1,985 per language) and read all of them (Admin, an internal tool, was read faster and with lower priority).
2. Researched real usage in parallel (web search plus page fetches): Booking.com, Airbnb, Google (Calendar, Drive, Account, Play), Apple,
   Stripe docs, Shopify, Wix, Notion, WordPress (full Turkish .po file), Microsoft Italian style guide, Turkish and Italian yoga studio, retreat and
   spa sites, and Italian/Turkish public and banking sites for register. F = page fetched and string read; S = search summary only.
3. Changed only translation values, line by line (a script replaced the string literal of one key at a time and checked the old value first).
   No keys added, removed, renamed or reordered; no code, tests or `SPACE_SELECTABLE_LOCALES` touched. Placeholders unchanged (test-enforced).
4. Checked usage in components where meaning depended on context (e.g. `common.cancel` is also the "cancel this class date" button, so Turkish
   keeps "İptal" there; `common.live` is the Space status chip; `flow.live` is the badge on a session in progress).

## Sources (terminology decisions)

| # | URL | Supports | F/S |
|---|---|---|---|
| T1 | https://gunesayyoga.com/mardin-yoga-inzivasi/ | "Yoga İnzivası", "eğitmen" | F |
| T2 | https://www.mandarinoriental.com/tr/bodrum/paradise-bay/spa | "İnzivalar", "Spa Bakımları", "Rezervasyon Yapın" | F |
| T3 | https://soultreatstravel.com (event pages) | "Kış İnzivası", "Mekanlarımız", "Kayıt Ol" | F |
| T4 | https://www.xanthospatara.com/tr/yoga/ | "yoga inzivaları" next to "Yoga Kampı" | F |
| T5 | https://guzelbahceyoga.com/dersler/ | "Ders Programı", "katılım", "KDV dahildir" | F |
| T6 | https://apps.apple.com/tr/app/id6743429691 | "derslere rezervasyon yapabilirsiniz", "ders programı" | F |
| T7 | https://support.google.com/calendar/answer/37064?hl=tr , /37115?hl=tr | siz register, "Saat dilimi", "Tekrarlanmaz", "Tüm gün" | F |
| T8 | https://support.google.com/drive/answer/2494822?hl=tr | "Paylaş", "Bağlantıyı kopyala", "Bağlantıya sahip olan herkes" | F |
| T9 | https://translate.wordpress.org/projects/wp/dev/tr/default/ (export .po) | "Yayınla", "Taslak", "Önizleme", "Vazgeç", "Yazı tipi" | F |
| T10 | https://www.airbnb.com.tr (search widget) | "Giriş" / "Çıkış", "Tarih ekleyin" | F |
| T11 | https://help.shopify.com/tr/manual/checkout-settings/checkout-style , /tr/manual/discounts | "İndirim kodu" | F |
| T12 | https://support.google.com/googleplay/answer/7018481?hl=tr ; https://support.apple.com/tr-tr/118428 | "Aboneliği iptal et", "faturalandırma dönemi" | F |
| T13 | https://www.tdk.gov.tr/icerik/yazim-kurallari/kisaltmalar/ ; /kesme-isareti/ | MB'den (last-letter reading), apostrophe on proper names | F |
| T14 | https://yogazone.ist | "Kontenjan sınırlıdır" | F |
| T15 | https://www.kempinski.com/tr/ (spa) | "Masajlar & Uygulamalar", "bakımlar" | F |
| I1 | https://www.booking.com/content/about.it.html | tu register | F |
| I2 | https://www.airbnb.it/help/article/2908 | tu register, "check-out" | F |
| I3 | https://support.google.com/calendar/answer/37115?hl=it , /37064?hl=it | tu, "Non si ripete", "fuso orario" | F |
| I4 | https://support.google.com/drive/answer/2494822?hl=it | "Condividi", "Copia link", "Chiunque abbia il link" | F |
| I5 | https://support.apple.com/it-it/118428 | tu, "Annulla abbonamento" | F |
| I6 | https://docs.stripe.com/payments/checkout/discounts?locale=it-IT | tu, "codici promozionali", "coupon" | F |
| I7 | https://www.shopify.com/it | tu, "brand" | F |
| I8 | https://www.notion.com/it/help/public-pages-and-web-publishing | tu, "Pubblica" | F |
| I9 | https://help.netflix.com/it/node/407 | "disdire", mixed tu/Lei | F |
| I10 | Microsoft Italian Style Guide (download.microsoft.com, ita-ita-StyleGuide.pdf) | tu, sentence case, avoid formal tone | F |
| I11 | https://www.eventiyoga.it | "Ritiri", "Insegnanti", tu | F |
| I12 | https://www.istitutoiyengaryogafirenze.it | "Orario corsi", "Insegnanti", tu | F |
| I13 | https://www.yogafestival.it | "ritiri", "programma", tu | F |
| I14 | https://www.intesasanpaolo.com ; https://www.poste.it ; https://www.inps.it ; https://www.agenziaentrate.gov.it | tu even for bank/public services | F |
| I15 | https://www.zenamu.com/it/yoga-booking-system/ | the one Lei example (non-Italian booking SaaS) | F |

Not retrievable: Booking.com TR/IT form labels, Stripe Checkout TR/IT field labels, Eversports/Mindbody/Momence/bsport (403 or no TR/IT UI), Notion TR.

## Register decisions

**Turkish: formal "siz" in sentences, bare imperative on buttons. Confirmed** (Google TR help, Airbnb TR placeholders, WordPress TR). Unchanged.

**Italian: switched from Lei to tu (owner decision, 2026-10-14; commit `04f7e39`).** Every live Italian interface checked uses tu (I1-I14),
including banks and public bodies; Lei appears only in formal letters/contracts and in one non-Italian SaaS (I15). The owner approved the switch for
the Studio, the guest apps and the account/billing/Admin UI. See "Italian tu conversion" below.

## Terminology decisions

### Turkish

| Term | Chosen | Rejected | Evidence |
|---|---|---|---|
| retreat | inziva | retreat, kamp, tatil | T1-T4: 0 Turkish uses of "retreat"; "kamp" is the budget register |
| teacher / class / session | eğitmen / ders / seans | öğretmen, hoca | T1, T5 (38 vs 9 hits) |
| class timetable | Ders programı (Studio section); Program (guest tab, length) | Takvim | T5, T6 |
| booking | rezervasyon yap; kayıt for registration | yer ayırt | T2, T6 |
| meals | Yemekler | öğünler | workshopix (F) |
| facilities | Mekânlar (kept, test-pinned) | tesis | T3 |
| treatments | Terapiler (kept, OPEN) | Bakımlar (spa usage T2, T15) | native decision |
| publish / draft / preview | Yayınla / Taslak / Önizleme | Yayımla | T9 |
| link / share | Bağlantı / Bağlantıyı kopyala / Paylaş | link | T8, T9 |
| check-in / out | Giriş / Çıkış | Check-in | T10 |
| capacity | Kontenjan | | T14 |
| coupon (customer) | İndirim kodu | kupon kodu | T11 |
| cancel subscription | Aboneliği iptal et | | T12 |
| dialog dismiss | Vazgeç (billing/admin); common.cancel stays İptal (also cancels a class date) | | T9 |
| MB suffix | MB'den / MB'ye | MB'tan / MB'a | T13 |
| day number | {n}. Gün | Gün {n} | Turkish ordinal counting |
| library | kitaplık | kütüphane | consistency |
| live status | Yayında (Space), Sürüyor (session) | Canlı | context |

### Italian

| Term | Chosen | Rejected | Evidence |
|---|---|---|---|
| register | **tu** (applied, owner decision) | Lei | I1-I15 |
| retreat | ritiro | retreat | I11, I13 |
| class / teacher | lezione / insegnante | maestro, corso (single class) | I12 |
| schedule | Calendario (Teach), Programma (Flow), test-pinned; "Orario" open | | I12, I13 |
| facilitators | Guide (test-pinned); "Insegnanti" open | facilitatori | I11 |
| share / link | Condividi / Copia link | | I4 |
| brand / palette | Brand / palette | marchio, tavolozza | I7 |
| cancel subscription | Disdici (kept); "Annulla abbonamento" open | | I5, I9 |
| coupon | Codice sconto (kept); "Codice promozionale" open | coupon | I6 |
| recurrence | ogni settimana il lun, mer | di lun | I3 pattern |
| library | libreria | raccolta | Apple IT |
| past_due | In ritardo | Scaduto (= expired) | |
| live example / live badge | esempio reale / Adesso | dal vivo (= in person) | |

## Change counts (values changed)

| Namespace | tr | it |
|---|---|---|
| common | 3 | 0 |
| teach | 12 | 5 |
| flow | 13 | 10 |
| studio | 10 | 3 |
| billing | 19 | 4 |
| admin | 1 | 3 |
| **Total** | **58** | **25** |

Italian is lower because its wording was already accurate. The register switch that followed is counted separately below.

## Italian tu conversion (commit `04f7e39`)

Owner decision: modern, friendly **tu** everywhere in the Italian UI (Studio, guest apps, account/billing/Admin). The 25 corrections above were kept.

| File | Values changed |
|---|---|
| it.ts: common 2, studio 68, flow 67, teach 67 | 204 |
| billing.it.ts | 46 |
| admin.it.ts | 43 |
| **Total** | **293** |

Rules applied: tu verbs and imperatives (Riprova, Inserisci, Scegli, Carica, Controlla, Disdici, Digita); possessives tuo/tua/tuoi/tue; clitics ti/te
("gli ospiti ti troveranno", "pronto per te", "ti verrà chiesto"); "Ci racconti il suo ritiro" → "Raccontaci il tuo ritiro"; teacher-voice CTAs
"Mi scriva su WhatsApp" → "Scrivimi su WhatsApp", "Mettiamoci in contatto" → "Contattami"; guest-written WhatsApp templates "Buongiorno … Potrebbe" →
"Ciao … Puoi", and the gendered "sono interessato/a" → "mi interessa"; billing e-mail greeting "Buongiorno," → "Ciao,"; `admin.you` "(Lei)" → "(tu)".
Third-person "suo/sua" referring to customers or objects in Admin was rephrased ("le relative fatture", "la finestra di disponibilità") so the guard can
ban the possessive outright. Gendered agreement with the user is avoided ("Tutto pronto…", "Hai modifiche non salvate").

Guard (`terminology.test.ts`): the old test "never addresses anyone informally in Italian" (shared dictionary only) became "addresses everyone with
the informal tu in Italian, never with Lei". It now scans the shared dictionary **and** billing and Admin (1,985 strings, asserted > 1,900), bans
`lei|suo|sua|suoi|sue` and the Lei-only imperatives (inserisca, scelga, aggiunga, apra, attenda, chieda, condivida, disdica, scriva, esegua, "ci
racconti", "mi scriva", "ci contatti"), and pins five tu strings across Studio, guest app, billing and Admin. Ambiguous forms (riprovi, carichi, usi,
lasci, pubblichi are also tu indicatives) are deliberately not banned.

Legal and consumer-rights strings: register only, substance unchanged; listed for specialist review in
`docs/localization/LEGAL-STRINGS-tr-it.md` (24 keys, EN/TR/IT side by side with the pre-branch Italian).

Terminology re-check for tu UIs: Booking.com (I1), Airbnb (I2), Google Calendar/Drive (I3, I4), Apple (I5), Stripe docs (I6), Shopify (I7), Notion (I8)
and the Microsoft Italian style guide (I10) all use the same tu imperatives on buttons ("Salva", "Condividi", "Copia link", "Annulla") that the product
already used, so button labels did not need to change.

### Local browser spot-check (Italian, tu)

Local `next build` + `next start` on port 3135 against the local Supabase stack (`supabase_*_innerdwes-local-qa`), Playwright Chromium. Temporary,
reverted after the run (none committed): `"it"` added to `SPACE_SELECTABLE_LOCALES`; a local `.env.local` with the local stack's demo keys; local DB:
`qa-teach-de` set to `it` (restored to `de`) and `billing_settings.paid_checkout_enabled` set true (restored to false); a placeholder
`STRIPE_SECRET_KEY` in the server's process environment only so the pre-checkout page renders (no Stripe call is made by rendering it).

Screens (scratchpad `qa033/it-tu/`, plus `result.json` with page text): guest Flow home and Programma (390 px), guest Teach home and Calendario
(390 px), Studio Flow entry / Programma / Brand, Studio Teach entry / Calendario / Brand (1440 px), pre-checkout `/create/flow`, create chooser
`/create`, billing page of a past-due QA Space. Result: every screen rendered Italian tu copy; 0 Lei forms found in visible text; no English UI strings
from the dictionaries (the English/German texts visible are the QA Spaces' own content). Observation: account pages set `lang` on their `<main>`,
so `document.documentElement.lang` reads `en` there (pre-existing, not a translation issue). This is Chromium emulation, not a real phone.

## Notable fixes (before → after)

Turkish:
1. `common.live` (Space status) "Canlı" → "Yayında".
2. `flow.dayN` "Gün {n}" → "{n}. Gün" (and the two aria labels).
3. `studio.audioRefInvalid*`, `imageRefInvalidReupload` "… başvurusu geçerli değildi" ("application") → "… tanınamadı".
4. `teach.directoryBody` "Eğitmenler rehberinde" → "dizininde" ("rehber" is the facilitators' word).
5. `billing.coupon*` (11 keys) "kupon" → "indirim kodu".
6. `billing.nextCharge` "Sonraki tahsilat (vergi öncesi)" → "Sonraki ödeme (vergiler hariç)".
7. `teach.bookWithNamed` "Rezervasyon: {venue}" → "{venue} üzerinden rezervasyon yapın".
8. `flow.retreatDatesTooLong` "… şu kadar gün sürebilir: {max}." → "… en fazla {max} gün sürebilir."
9. `teach.saveFirstFailed` "Önce kaydedilemedi" → "Yayınlamadan önce kaydedilemedi".
10. MB suffixes "MB'tan / MB'a" → "MB'den / MB'ye" (TDK).

Italian:
1. `studio.backToMySpaces` "Torna a I miei Space" → "Torna ai miei Space" (same for `openingMySpaces`, `billing.returnToSpaces`).
2. `admin.status_past_due` "Scaduto" → "In ritardo".
3. `flow.live` "Dal vivo" → "Adesso".
4. `billing.viewExample` "Vedi l'esempio dal vivo" → "Vedi un esempio reale".
5. `studio.readyToPublish` "Pronto per la pubblicazione?" → "Tutto pronto per la pubblicazione?" (gender-neutral).
6. `teach.maxParticipantsLabel` "Partecipanti massimi" → "Numero massimo di partecipanti".
7. `teach.readinessNoRegistration` "{count} lezione/i senza…" → "Lezioni senza…: {count}. …".
8. `teach.recurOnDays` "di {days}" → "il {days}".
9. Review vocabulary unified: "candidatura/verifica" → "richiesta/revisione" (4 keys).
10. `flow.sessionsOutsideRetreatDates` stray capital "Sue" → "sue".

## Full change log

### tr

| Key | Before | After | Why |
|---|---|---|---|
| common.seek | İlerlet | Oynatma konumu | aria label of the audio scrubber; 'İlerlet' (advance) describes one action, not the slider |
| common.live | Canlı | Yayında | Space status chip (published & public); 'Canlı' reads as a live broadcast; product uses 'Yayında' for published |
| common.backTo | Geri: {label} | {label} bölümüne dön | natural Turkish; suffix sits on 'bölüm', not on the placeholder |
| studio.primaryColourHelp | Temel işlemler, gezinme vurguları ve etkileyici anlar için kullanılır. | Temel işlemler, gezinme vurguları ve tam ekran bölümler için kullanılır. | 'etkileyici anlar' was a literal calque of 'immersive moments' |
| studio.audioRefInvalid | Bir ses dosyası başvurusu geçerli değildi. | Bir ses dosyası tanınamadı. | 'başvuru' means application/petition, not a file reference |
| studio.audioRefInvalidReupload | Bir ses dosyası başvurusu geçerli değildi - lütfen yeniden yükleyin. | Bir ses dosyası tanınamadı - lütfen yeniden yükleyin. | as above |
| studio.imageRefInvalidReupload | Bir görsel başvurusu geçerli değildi - lütfen yeniden yükleyin. | Bir görsel tanınamadı - lütfen yeniden yükleyin. | as above |
| studio.currencySearchPlaceholder | Para birimi arayın… | Para birimi ara… | search placeholders use the short imperative like 'Ülke ara' |
| studio.spaceCurrencyNotSet | Henüz seçilmedi; yeni öğeler şunu kullanır: {code}. | Henüz seçilmedi - yeni öğelerde {code} kullanılır. | 'şunu kullanır:' was stilted; new phrasing keeps the placeholder suffix-free |
| studio.presetTerracotta | Terrakota | Terakota | TDK spelling is 'terakota' |
| teach.inspirationFrom | Günün ilhamı · Kimden: {name} | Günün ilhamı · {name} | 'Kimden:' is e-mail header wording; attribution line reads naturally with the name alone |
| teach.bookWithNamed | Rezervasyon: {venue} | {venue} üzerinden rezervasyon yapın | matches sibling bookWithVenue 'Mekân üzerinden rezervasyon yapın'; no suffix on the placeholder |
| teach.availableForPrivate | Özel seans için uygun | Özel seans için müsait | same label had two wordings (availabilityLabelPlaceholder uses 'müsait'); 'müsait' is the natural word for a person's availability |
| teach.howToRegisterPlaceholder | Matınızı ayırmak için bana WhatsApp'tan yazın. Birkaç saat içinde yanıt veririm. | Yerinizi ayırtmak için bana WhatsApp'tan yazın. Birkaç saat içinde yanıt veririm. | 'save your mat' idiom does not carry over; Turkish studios say 'yerinizi ayırtın' |
| teach.spacingCompact | Sıkı | Kompakt | 'Sıkı' means tight/strict; 'Kompakt' is the common UI density term |
| teach.identityEyebrow | Eğitim alanım | Eğitmenlik alanım | aligned with myTeachingSpace 'Eğitmenlik Alanım'; 'eğitim' means education |
| teach.shortExcerpt | Kısa alıntı | Kısa özet | an excerpt/teaser of one's own article is an 'özet'; 'alıntı' is a quotation |
| teach.saveFirstFailed | Önce kaydedilemedi: {reason} | Yayınlamadan önce kaydedilemedi: {reason} | 'Önce kaydedilemedi' read as 'could not be saved earlier' |
| teach.directoryBody | İsteğe bağlı. Siz açmadıkça kapalıdır; kimseyi otomatik olarak listelemeyiz. Katılmayı seçerseniz, yakında yayınlanacak InnerDweS Eğitmenler rehberinde ve web sitemizde yer alabilirsiniz. | İsteğe bağlı. Siz açmadıkça kapalıdır; kimseyi otomatik olarak listelemeyiz. Katılmayı seçerseniz, yakında yayınlanacak InnerDweS Eğitmenler dizininde ve web sitemizde yer alabilirsiniz. | 'rehber' is reserved for facilitators; a listing is a 'dizin' (as in studio.featuredBody) |
| teach.fromMyLibrary | Kütüphanemden | Kitaplığımdan | one word for 'library': 'kitaplık' (Ses kitaplığı, Keşfet kitaplığı) |
| flow.live | Canlı | Sürüyor | badge on an in-person session in progress; 'Canlı' suggests a stream |
| flow.dayN | Gün {n} | {n}. Gün | Turkish counts days with an ordinal ('1. gün', as already used in retreatDatesBody) |
| flow.dayOptionLabel | {date}, gün {n} | {date}, {n}. gün | as dayN |
| flow.dayOptionLabelToday | {date}, gün {n}, bugün | {date}, {n}. gün, bugün | as dayN |
| flow.retreatDatesTooLong | Bir inziva en fazla şu kadar gün sürebilir: {max}. | Bir inziva en fazla {max} gün sürebilir. | the number fits in the sentence without a suffix; 'şu kadar gün: N' was stilted |
| flow.identityBody | Bu bilgiler misafir deneyiminin her yerinde görünür ve misafirlerinizin kendilerini yönlenmiş ve hoş karşılanmış hissetmelerine yardımcı olur. | Bu bilgiler misafir deneyiminin her yerinde görünür ve misafirlerinizin kendilerini rahat ve hoş karşılanmış hissetmelerine yardımcı olur. | 'yönlenmiş hissetmek' is not idiomatic Turkish |
| flow.excerpt | Alıntı | Özet | as teach.shortExcerpt |
| flow.uploadAudio | Ses yükle | Ses dosyası yükle | one wording with teach.uploadAudio |
| flow.replaceAudio | Sesi değiştir | Ses dosyasını değiştir | one wording with teach.replaceAudio; 'Sesi değiştir' can read as 'change the voice/volume' |
| flow.availability | Uygunluk | Müsaitlik | matches its own placeholder 'Müsaitliğe bağlı' |
| flow.fullBiographyPlaceholder | Kendi sayfası için daha uzun versiyon. | Kendi sayfası için daha uzun metin. | avoid the loanword 'versiyon' (product uses 'sürüm') |
| flow.featuredPendingBody | Bu revizyon incelemeyi beklerken daha önce onaylanan kaydınız InnerDweS'te yayında kalır. Yeni sürüm onaylanana kadar değiştirilmez. | Bu güncelleme incelemeyi beklerken daha önce onaylanan kaydınız InnerDweS'te yayında kalır. Yeni sürüm onaylanana kadar değiştirilmez. | 'revizyon' is technical jargon; 'güncelleme' is plain |
| billing.flowPoint1 | Günlük program, öğünler ve terapiler | Günlük program, yemekler ve terapiler | glossary term for Meals is 'Yemekler' (module name in the app) |
| billing.flowPoint2 | Varış bilgileri ve olanaklar | Varış bilgileri ve mekânlar | Facilities module is 'Mekânlar' in the app |
| billing.includedAudio | {library} dakikalık ses kütüphanesi, kayıt başına en fazla {max} dakika, ayda {listening} dakika dinleme. | {library} dakikalık ses kitaplığı, kayıt başına en fazla {max} dakika, ayda {listening} dakika dinleme. | one word for library ('Ses kitaplığı' in Teach Studio) |
| billing.lifecycleDeleteActiveSubscription | Bu Space'in hâlâ aktif bir aboneliği olduğu için hiçbir şey silinmedi. Aboneliği Faturalama sayfasından iptal edin ve abonelik sona erdikten sonra Space'i silin. | Bu Space'in hâlâ etkin bir aboneliği olduğu için hiçbir şey silinmedi. Aboneliği Faturalama sayfasından iptal edin ve abonelik sona erdikten sonra Space'i silin. | status word is 'Etkin' everywhere else |
| billing.lifecycleArchivePaidBody | “{space}” arşivlendiğinde aktif/herkese açık kullanımdan kaldırılır. Misafirler artık ona erişemez. Arşivlemek aboneliği iptal etmez. | “{space}” arşivlendiğinde etkin/herkese açık kullanımdan kaldırılır. Misafirler artık ona erişemez. Arşivlemek aboneliği iptal etmez. | as above |
| billing.emailDiscountProgressValue | {total} ödemenin {done}. ödemesi | Ödeme {done} / {total} | the old phrase was grammatical but clumsy; matches the '{used} / {max}' pattern used in Studio |
| billing.nextCharge | Sonraki tahsilat (vergi öncesi) | Sonraki ödeme (vergiler hariç) | 'tahsilat' is the merchant's word; customers see 'ödeme'; 'hariç' is the standard tax-exclusive wording (KDV hariç) |
| billing.emailRowNextCharge | Beklenen sonraki tahsilat | Beklenen sonraki ödeme | as nextCharge |
| admin.sdExpectedCharge | Beklenen tahsilat (vergi öncesi) | Beklenen tahsilat (vergiler hariç) | standard tax-exclusive wording |
| teach.sectionSchedule | Program | Ders programı | Turkish studios call the class timetable 'Ders programı' (guzelbahceyoga, Yoga Iatro app); the 12-char guest tab keeps 'Program' |
| teach.audioTooLarge100 | Ses dosyası 100 MB'tan küçük olmalı. | Ses dosyası 100 MB'den küçük olmalı. | TDK: suffix on an uppercase abbreviation follows the last letter's reading (MB -> 'be' -> MB'den) |
| flow.audioTooLarge | Bu dosya 100 MB'tan büyük. | Bu dosya 100 MB'den büyük. | TDK abbreviation rule |
| studio.imageTooLarge | Görsel 8 MB'tan küçük olmalıdır. | Görsel 8 MB'den küçük olmalıdır. | TDK abbreviation rule |
| studio.imageOptimizeHint | 8 MB'a kadar görseller. Hızlı yüklenmeleri için otomatik olarak optimize ediyoruz. | 8 MB'ye kadar görseller. Hızlı yüklenmeleri için otomatik olarak optimize ediyoruz. | TDK abbreviation rule |
| studio.imageFormats8mb | 8 MB'a kadar JPG, PNG veya WebP. | 8 MB'ye kadar JPG, PNG veya WebP. | TDK abbreviation rule |
| billing.couponLabel | Kupon kodu | İndirim kodu | Shopify TR checkout uses 'İndirim kodu'; customers know the field by that name. Admin keeps 'kupon' for the internal object |
| billing.couponInvalid | Bu kupon kodu geçerli değil. | Bu indirim kodu geçerli değil. | as couponLabel |
| billing.couponInactive | Bu kupon artık etkin değil. | Bu indirim kodu artık etkin değil. | as couponLabel |
| billing.couponNotStarted | Bu kupon henüz kullanılabilir değil. | Bu indirim kodu henüz kullanılamıyor. | as couponLabel; smoother verb form |
| billing.couponExpired | Bu kuponun süresi dolmuş. | Bu indirim kodunun süresi dolmuş. | as couponLabel |
| billing.couponNotApplicable | Bu kupon bu satın alma için uygulanamıyor. | Bu indirim kodu bu satın alma işlemine uygulanamıyor. | as couponLabel |
| billing.couponUnavailable | Bu kupon şu anda uygulanamıyor. | Bu indirim kodu şu anda uygulanamıyor. | as couponLabel |
| billing.couponAlreadyUsed | Bu kuponu daha önce kullandınız. | Bu indirim kodunu daha önce kullandınız. | as couponLabel |
| billing.couponInUseElsewhere | Bu kupon, başka bir ödeme işleminiz için zaten ayrılmış durumda. | Bu indirim kodu, başka bir ödeme işleminiz için zaten ayrılmış durumda. | as couponLabel |
| billing.couponLimitReached | Bu kupon kullanım sınırına ulaştı. | Bu indirim kodu kullanım sınırına ulaştı. | as couponLabel |
| billing.couponSection | Kupon | İndirim kodu | as couponLabel |

### it

| Key | Before | After | Why |
|---|---|---|---|
| studio.backToMySpaces | Torna a I miei Space | Torna ai miei Space | 'a I miei' is not Italian; preposition must contract ('ai miei'), as billing.backToSpaces already does |
| studio.openingMySpaces | Apertura di I miei Space… | Apertura dei miei Space… | same contraction error ('di I' -> 'dei') |
| billing.returnToSpaces | Vai a I miei Space | Vai ai miei Space | same contraction error |
| studio.readyToPublish | Pronto per la pubblicazione? | Tutto pronto per la pubblicazione? | 'Pronto' agrees with a masculine user; 'Tutto pronto' is gender-neutral |
| flow.sessionsOutsideRetreatDates | {count} delle Sue sessioni cadono fuori dalle date del ritiro, quindi gli ospiti non le vedranno nel programma. Le sposti nelle date oppure modifichi le date. | {count} delle sue sessioni cadono fuori dalle date del ritiro, quindi gli ospiti non le vedranno nel programma. Le sposti nelle date oppure modifichi le date. | only string with capital 'Sue'; everywhere else the possessive is lowercase |
| flow.live | Dal vivo | Adesso | badge on the session happening now; 'Dal vivo' means a live (in-person/unrecorded) performance; heading above already says 'In corso' |
| flow.eyebrowReadings | Leggere | Da leggere | bare infinitive read as an instruction/heading fragment; 'Da leggere' is the natural label |
| flow.eyebrowAudio | Ascoltare | Da ascoltare | as eyebrowReadings |
| flow.untitledFacility | Ambiente senza titolo | Ambiente senza nome | a place has a name, not a title |
| flow.featuredRejectedBody | Questa candidatura non è stata approvata. Può aggiornare i dettagli qui sotto e inviarla di nuovo. | Questa richiesta non è stata approvata. Può aggiornare i dettagli qui sotto e inviarla di nuovo. | one word for the submission: 'richiesta' (studio.featuredBody) |
| flow.submitForReview | Invia per la verifica | Invia per la revisione | one word for review: 'revisione' (statusPending 'In attesa di revisione') |
| flow.resubmitForReview | Invia di nuovo per la verifica | Invia di nuovo per la revisione | as submitForReview |
| flow.featuredPendingBody | La scheda approvata in precedenza resta visibile su InnerDweS mentre questa revisione è in attesa di verifica. Non verrà sostituita finché la nuova versione non sarà approvata. | La scheda approvata in precedenza resta visibile su InnerDweS mentre questa modifica è in attesa di revisione. Non verrà sostituita finché la nuova versione non sarà approvata. | 'revisione ... in attesa di verifica' mixed the two terms; now 'modifica ... in attesa di revisione' |
| teach.fromMyLibrary | Dalla mia raccolta | Dalla mia libreria | one word for library ('Libreria audio', 'Libreria Esplora'; Apple IT 'Libreria') |
| teach.saveFirstFailed | Impossibile salvare prima: {reason} | Salvataggio prima della pubblicazione non riuscito: {reason} | 'salvare prima' was ambiguous (earlier vs before publishing) |
| teach.maxParticipantsLabel | Partecipanti massimi | Numero massimo di partecipanti | 'partecipanti massimi' is ungrammatical (adjective on people); standard form-field wording |
| teach.readinessNoRegistration | {count} lezione/i senza una modalità di iscrizione funzionante: non comparirà alcun pulsante di iscrizione | Lezioni senza una modalità di iscrizione funzionante: {count}. Per queste non comparirà alcun pulsante di iscrizione | removes the 'lezione/i' slash plural (glossary item 7) with a count-label construction |
| billing.createSubtitle | Dia prima un'occhiata: gli esempi dal vivo sono gratuiti. Il pagamento è richiesto solo quando è pronto a creare il suo Space. | Dia prima un'occhiata: gli esempi sono gratuiti. Il pagamento è richiesto solo al momento di creare il suo Space. | 'esempi dal vivo' means in-person examples; 'quando è pronto' was masculine-only |
| billing.viewExample | Vedi l'esempio dal vivo | Vedi un esempio reale | 'dal vivo' = in person; the demo is a real, working app |
| billing.flowPoint2 | Informazioni per l'arrivo e servizi della struttura | Informazioni per l'arrivo e ambienti | Facilities module is 'Ambienti' in the app |
| flow.previewPublishBody | Controlli le modifiche e pubblichi quando è pronto. L’app per gli ospiti online si aggiorna solo quando sceglie di pubblicare. | Controlli le modifiche e pubblichi quando è tutto pronto. L’app per gli ospiti online si aggiorna solo quando sceglie di pubblicare. | 'quando è pronto' was masculine-only |
| admin.status_past_due | Scaduto | In ritardo | 'Scaduto' means expired and collided with 'Incompleto (scaduto)'; past_due is an overdue payment |
| admin.metric_paidSubscriptions | Attivi o in prova, non esenti. Quelli scaduti sono conteggiati in Pagamenti non riusciti. | Attivi o in prova, non esenti. Quelli con pagamento in ritardo sono conteggiati in Pagamenti non riusciti. | as status_past_due |
| admin.metric_paidSpaces | Space distinti con un abbonamento non esente e non terminato (inclusi quelli scaduti). | Space distinti con un abbonamento non esente e non terminato (inclusi quelli con pagamento in ritardo). | as status_past_due |
| teach.recurOnDays | di {days} | il {days} | Italian calendars say 'ogni settimana il lunedì'; 'di lun' is colloquial |

## Remaining doubts for a native speaker

Turkish:
- "Terapiler" vs "Bakımlar" / "Masaj ve Bakımlar" for Treatments (spa sites use "bakım").
- `teach.endsAfter` "Şu kadar tekrardan sonra" (Google Calendar TR wording not verified).
- "MB'den" (TDK) vs the colloquial "MB'tan" (read as "megabayt").
- Label forms that avoid suffixes on names ("Bir not · {name}", "Daha fazlası: {name}").
- `flow.cardKicker` "İNZİVA YOL ARKADAŞINIZ"; `teach.bookWithNamed` length on a button.
- "cayma hakkı" consent sentence: legal review still needed.

Italian:
- The tu wording of the 293 converted strings (natural flow, CTA tone such as "Contattami", "Scrivimi su {method}").
- "Guide" vs "Insegnanti"; "Calendario" vs "Orario"; "Ambienti" for facilities.
- "Disdici" vs "Annulla abbonamento"; "Codice sconto" vs "Codice promozionale" (Stripe Checkout's own label not verified).
- Straight apostrophes in billing/admin vs typographic ’ in it.ts (cosmetic).
- "diritto di recesso" consent sentence: legal review still needed.

## Test results (local, worktree, after `npm ci`)

- `npx vitest run src/lib/i18n`: 6 files, 113 tests passed.
- Full suite `npx vitest run`: 193 files passed, 3 skipped; 3,317 tests passed, 20 skipped, 0 failed.
- `npx tsc --noEmit -p .`: exit 0.
- `npx eslint`: 0 errors, 29 warnings (all in files this branch does not touch).
- After the tu switch (commit `04f7e39`): i18n 6 files / 113 tests passed; full suite 193 files passed, 3 skipped; 3,317 tests passed,
  20 skipped, 0 failed; tsc exit 0; eslint 0 errors (29 pre-existing warnings).
- Browser spot-check: see "Local browser spot-check" above (Chromium emulation only).

## Recommendation on enabling tr / it for Spaces

**Do not enable yet.** No native-speaker certification has occurred. These strings were reviewed by an AI agent against observed usage; that is not
the sign-off the checklist requires.

- **Turkish** is close to ready: terminology and register are consistent with what Turkish booking and wellness sites use. Enable after one native
  reviewer walks the checklist (Treatments wording, suffix label forms, Share Card lines) and a legal check of "cayma hakkı".
- **Italian** now uses tu (owner decision applied). Remaining blockers before enabling: native review of the converted wording; legal check of the
  strings in `LEGAL-STRINGS-tr-it.md` ("diritto di recesso", consent sentences, "fattura / ricevuta", "imposte escluse"); the open terminology items
  above; a real-device check (truncation at 320 px, bottom nav, Share Card canvas lines).

Blockers common to both languages before adding them to `SPACE_SELECTABLE_LOCALES` (not done here):
1. Native-speaker sign-off per `NATIVE-REVIEW-CHECKLIST-tr-it.md` (none has happened).
2. Legal/consumer-rights review of `LEGAL-STRINGS-tr-it.md`.
3. Real-device QA (iPhone Safari, Android Chrome) at 320-430 px; Share Card glyph coverage for Turkish İ/ş/ğ in the canvas fonts.
4. The release change itself: flip the constant and update "the release switch for Turkish and Italian is still off" in `trIt.test.ts` in the same
   commit, then the normal Staging → Production gates.
