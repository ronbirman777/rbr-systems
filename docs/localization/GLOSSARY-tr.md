# Turkish (tr) localization glossary

Status: UNREVIEWED by a native speaker. Register: formal "siz", calm tone.
Rule: avoid attaching Turkish suffixes to `{placeholders}` (use "için", "tarihinde", "ile"); suffixes on fixed terms use an apostrophe (Space'iniz, Studio'yu).
Search note: sources below were located with web search; page contents were taken from search summaries, not all fetched in full.

| Concept | Approved | Rejected | Context / rationale | Sources |
|---|---|---|---|---|
| Subscription | abonelik | üyelik | Netflix/Spotify use "üyelik" for consumer membership; this is a recurring SaaS plan, and Stripe/Turkish SaaS docs use "abonelik". | https://help.netflix.com/tr/node/407 , https://support.spotify.com/tr/article/how-to-cancel-your-subscription/ , https://dynamoi.com/tr/docs/billing/invoices-payments |
| Billing / invoicing | faturalama, fatura | tahakkuk | "Faturalama ve Ödemeler" is Netflix TR's own section name. | https://help.netflix.com/tr/node/41049 |
| Billing cycle / period | faturalama dönemi | fatura döngüsü | Netflix TR wording. | https://help.netflix.com/tr/node/54896 |
| Invoice / receipt | fatura / makbuz | fiş, dekont | "Fiş" is a retail till receipt; "makbuz" fits a payment receipt, "fatura" the tax document. Kept both with slash like source. No claim of e-Arşiv/legal status. | iyzico/Stripe TR docs (general usage) |
| Payment method | ödeme yöntemi | ödeme aracı | Netflix TR "ödeme yöntemleri". | https://help.netflix.com/tr/node/113408 |
| Coupon code | indirim kodu (customer-facing billing); kupon (Admin, internal object) | kupon kodu (customer-facing), promosyon kodu | Changed 2026-10 review: Shopify TR checkout labels the field "İndirim kodu" (https://help.shopify.com/tr/manual/checkout-settings/checkout-style). Admin keeps "kupon" because it names the managed object. Codes are never translated. | https://help.shopify.com/tr/manual/discounts |
| Cancel | iptal et / dönem sonunda iptal et | sonlandır | Spotify/Netflix TR use "iptal". Period-end cancellation phrased explicitly. | https://help.netflix.com/tr/node/407 , https://support.spotify.com/tr/article/how-to-cancel-your-subscription/ |
| Resume subscription | aboneliği yeniden başlat | devam ettir | Clear action verb; Netflix uses "yeniden başlat" for restart. | https://help.netflix.com/tr/node/407 |
| Renewal | yenileme / yenilenir | uzatma | Standard in Turkish subscription copy. | Netflix/Spotify TR help |
| Payment failed | Ödeme başarısız | ödeme hatası | Neutral, not alarmist; matches iyzico dashboard wording. | iyzico help center (https://iyzico.com/en/support/help-center/destek) |
| Suspend (account) | askıya al | dondur, engelle | "Askıya alınır" is the standard administrative term; "engel" sounds punitive. | general usage |
| Studio | Studio (untranslated) | Stüdyo | Studio is the product's console name (a proper noun), not a yoga studio; kept in Latin form and suffixed with apostrophe (Studio'yu). Real yoga studios say "stüdyo" which would confuse. | product decision |
| Space | Space (untranslated) | alan, mekan, çalışma alanı | Product's workspace unit and a navigation term already used untranslated in de/fr/es; "alan" is ambiguous. Plural/possessives with apostrophe (Space'lerim). | product decision |
| Guest App | Misafir Uygulaması | Guest App | Matches the already-approved attribution copy; "misafir" is the natural term for retreat guests. | https://www.enuygun.com/otel/detay/shivoham-yoga-retreats-35649081/ (guest vocabulary) |
| Retreat | inziva | retreat, kamp | "Inziva" (seclusion) is used in Turkish media for yoga retreats; "retreat" is also seen on booking sites, "kamp" suggests camping/sports camps. Chosen "inziva" for calm tone. UNCERTAIN: some wellness operators use English "retreat"; native review recommended. | https://www.posta.com.tr/tuba-unsalin-30-bin-liralik-inzivasi-2223295 , https://sthavishtah-retreat.secure.retreat.guru/program/return-to-balance-a-yoga-retreat |
| Tax | vergi | KDV | No percentage and no VAT-specific claim; generic "vergi". | product rule |
| Right of withdrawal | cayma hakkı | iade hakkı | Statutory term in Turkish consumer (mesafeli sözleşme) law; "iade" would suggest refund. UNCERTAIN: legal review advised. | general legal usage |
| Check out / secure payment | güvenli ödeme / ödeme sayfası | kasa | "Kasa" is cashier; Turkish sites use "ödeme". | iyzico docs |
| Product names | Time to Teach, Time to Flow | translated | Brand names, no gloss. | product rule |
| Brand | InnerDweS | - | Never translated. | project rule |

## Attribution (tr.ts)

- `attribution.createdWith`: "{brand} ile oluşturuldu" (already correct; "ile" attaches to the brand with no suffix risk).
- `attribution.linkLabel`: "{brand} - yeni sekmede açılır" (already correct, kept).

## Items for native review

1. inziva vs retreat.
2. makbuz vs fiş / fatura wording for "invoice / receipt".
3. "cayma hakkı" legal consent sentence.
4. "Space" kept untranslated with apostrophe suffixes (Space'inize); confirm acceptable.
5. "kupon" vs "indirim kodu".
6. Casing: no text relies on CSS uppercase. If UI uppercases chips with `text-transform`, set `lang="tr"` so i/İ are handled correctly.

## Admin (admin.tr.ts)

Status: UNREVIEWED by a native speaker. Internal tool: formal "siz", terse labels. Research: Google Account Help TR (https://support.google.com/accounts/answer/1066447?hl=tr) uses "2 Adımlı Doğrulama", "Kimlik doğrulayıcıyı ayarla" and QR code scanning for authenticator apps; Microsoft/GitHub TR docs use "kimlik doğrulayıcı uygulaması" and "kurulum anahtarı". Search access gave summaries only, not full-page audits.

| Concept | Approved | Rejected | Rationale |
|---|---|---|---|
| Audit log | denetim kaydı (nav: Denetim) | audit logu, günlük | "Denetim kaydı" is the standard Turkish IT term for an audit trail; "günlük" reads as a diary/plain log. |
| Step-up (re-verify before sensitive change) | "Kimliğinizi doğrulayın" + "yeni kod" | adım yükseltme | No natural Turkish term; user-facing meaning is re-confirming identity with a fresh code. |
| Authenticator app | kimlik doğrulayıcı uygulaması | doğrulayıcı, otantikatör | Google TR "Kimlik doğrulayıcı" / "Authenticator uygulaması". |
| Setup key | kurulum anahtarı | gizli anahtar, kurulum kodu | Matches GitHub/Google TR "kurulum anahtarı"; "kod" is reserved for the 6-digit code. |
| QR code | QR kodu | karekod | "QR kodu" is used on the existing Flow copy and by Google TR; "karekod" is a legitimate Turkish alternative (BKM/payment) but less common in IT docs. |
| TOTP | zamana dayalı tek kullanımlık şifre | OTP, TOTP | Spelled out once (mfaStep1Body); abbreviation not shown to users. |
| MFA / two-step verification | iki adımlı doğrulama | çok faktörlü kimlik doğrulama, 2FA | Google TR "2 Adımlı Doğrulama". AAL2 is never shown. |
| Webhook | webhook (untranslated) | web kancası | Stripe's TR dashboard keeps "webhook"; "olay" used for events. |
| Reconciliation / resync | yeniden eşitle (Stripe'tan yeniden eşitle) | uzlaştır, senkronize et | "Eşitle" is the plain Turkish for sync; "uzlaştırma" suggests accounting reconciliation which this is not (it re-reads Stripe state). |
| Sync to Stripe | Stripe'a eşitle | Stripe'a senkronize et | Same verb; apostrophe suffix on proper noun. |
| Exempt (non-paying Space) | muaf / muafiyet | istisna, ücretsiz | "Muaf" is a formal exemption; "ücretsiz" would imply a free plan and is not the same as the Billing "Dahil" status. |
| Internal / legacy | dahili / eski | iç, miras | Standard IT usage. |
| Outbox (email/event outbox, if surfaced) | giden kutusu / giden olay kuyruğu | outbox | Not currently shown in admin copy; reserved wording. |
| Admin role | yönetici (brand: InnerDweS Admin untranslated) | admin | Lowercase generic noun; "Sahip" for Owner. |
| Cancel dialog button | Vazgeç | İptal | Avoids clash with "iptal" = subscription cancellation. |
| Revoke access | erişimi iptal et | geri al | Consistent with "iptal". |
| Dunning/suspension labels | askıya alındı / askıda | donduruldu | Per main glossary. |
| MRR | MRR (untranslated) | aylık yinelenen gelir | Kept as the finance acronym; captions explain. |

Suffix rule applied: no suffix is attached to `{placeholders}`; dates use "{time} tarihinden beri", "{time} tarihine kadar"; counts use "{n} dönem sonra". Uppercase badges are written out in Turkish (ETKİN, DEVRE DIŞI) so İ is correct.

Items for native review: kimlik doğrulayıcı vs doğrulayıcı uygulaması; "Denetim kaydı" vs "Denetim günlüğü"; "muaf" wording; "Vadesi geçmiş" for past_due.

## Studio and Guest Apps (tr.ts, TASK 033 P5)

Status: PENDING NATIVE REVIEW. Every `common`, `teach`, `flow` and `studio` key is translated (74 / 505 / 390 / 284 keys);
`tr` is still NOT in `SPACE_SELECTABLE_LOCALES` (owner decision A2: added only after QA + native review). Register: formal
"siz" in sentences, plain imperative on buttons ("Kaydet", "Yayınla"); dialog cancel "İptal". Pinned in
`app/src/lib/i18n/terminology.test.ts` ("Turkish and Italian terminology").

| Concept | Approved (pending review) | Rejected | Rationale |
|---|---|---|---|
| Guest App | Misafir Uygulaması (mid-sentence "misafir uygulamanız") | Guest App | Matches billing copy; no Latin "Guest App" anywhere in tr.ts (test-pinned). |
| Space / Studio | Space, Studio (apostrophe suffixes: Space'lerim, Studio'da) | alan, stüdyo | Product nouns. A real yoga studio/venue is "stüdyo" / "mekân". |
| Retreat | inziva (İnzivalarım, İnziva Ana Sayfası) | retreat, kamp | As billing glossary; one word in Teach and Flow. |
| Teacher / class / session | eğitmen / ders / seans; özel seans; birebir | öğretmen | "Yoga eğitmeni" is the market term. |
| Facilitators | Rehberler (singular rehber); catalog "Rehberler / Eğitmenler" | kolaylaştırıcı | Calque avoided; neutral, ungendered. |
| Schedule (nav) | Program (Teach and Flow) | Takvim | Fits the 12-character tab bar. |
| Readings | Yazılar / Yazılarım | Okumalar | A collection of writing, not the act of reading (cf. Hebrew/German R3). |
| Audio | Ses kayıtları / Ses Kayıtlarım; a track = ses kaydı | Sesler | |
| Facilities | Mekânlar (eyebrow "Alanlar") | Tesisler, olanaklar | Rooms, not equipment (cf. R1). "Olanaklar" kept for amenities. |
| Treatments | Terapiler; Treatments & Extras "Terapiler ve Ekstralar" | Bakımlar, tedaviler | "Tedavi" is medical. |
| Meals | Yemekler | Öğünler | |
| Guidelines | Kurallar (guidelinesShort identical) | Yönergeler | Shorter and warmer. |
| FAQ | Sorular / Sıkça Sorulan Sorular | SSS | |
| Arrival information | Varış bilgileri; Check-in/out "Giriş" / "Çıkış" | Check-in | |
| Daily Inspiration | Günün İlhamı; quote = söz; Flow reflection = düşünce | alıntı | |
| Custom Pages / Modules / Identity / Brand | Özel Sayfalar / Modüller / Kimlik / Marka | | |
| Preview & Publish | Önizle ve Yayınla; Published "Yayında"; Republish "Yeniden yayınla"; Draft "Taslak" | | |
| Hero / cover image | ana görsel, ana fotoğraf / kapak görseli; focus point "odak noktası" | | |
| Guest Access / access code | Misafir Erişimi / erişim kodu | | |
| Share Card | Paylaşım Kartı; canvas lines "İNZİVA YOL ARKADAŞINIZ", "İNZİVA UYGULAMASINI AÇMAK İÇİN TARAYIN" | rehber (clashes with facilitators) | Needs latin-ext glyphs in the canvas fonts (P4 owns fonts). |
| Space slot | Space hakkı | yuva, slot | |
| Recurrence | "her hafta Pzt, Çar günleri", "ayın 5. günü", "{date} tarihine kadar", "Tekrar: {summary}" | | Ordinal "5." from `ordinalDayLocalized`. |

Placeholder rule applied everywhere (test-pinned): no suffix touches a `{placeholder}`; label forms are used instead
("Kimden: {name}", "Rezervasyon: {venue}", "Kaydet: {section}", "{year} yılından beri eğitmen", "{time} saatine kadar").

Items for native review (P5):
1. Label forms that avoid suffixes: `teach.fromTeacher` "Kimden: {name}", `noteFrom` "Bir not · {name}", `moreFrom` "Daha fazlası: {name}", `common.backTo` "Geri: {label}", `thisWeekWith` "Bu hafta · {name}".
2. `teach.recurOnDayOfMonth` assembled reads "Her ay ayın 5. günü" (slightly redundant).
3. `flow.exploreHeading` "{em}" + "İnzivanız"; `facilitatorsHeading` "Rehberlerinizle tanışın"; "Okunacak / Dinlenecek bir şeyler".
4. Share Card kicker "İNZİVA YOL ARKADAŞINIZ".
5. `typoEditorial` "Dergi", `spots` "Kontenjan", `eyebrowOptional` "Üst başlık / alt başlık", `fallbackN` "Yedek {index}".
6. `teaching` / `myTeachingSpace` "Eğitmenlik Alanım" ("alan" vs the product noun Space).
7. `endsAfter` "Şu kadar tekrardan sonra" next to a number input.
8. `featuredOnInnerDwes` "InnerDweS'te öne çıkarılma".
9. MB suffixes "8 MB'tan" / "8 MB'a" (assumes "megabayt").
10. Localised sample values (`classLocationPlaceholder` "Zeytin Ağacı Stüdyosu · Kadıköy", `classPricePlaceholder` "₺400 · 5 derslik kart ₺1.800").

## 2026-10 research-based review (TASK 033 follow-up, branch `i18n/033-tr-it-review`)

Still NOT native-reviewed. Full method, sources and change log: `docs/localization/TR-IT-REVIEW-2026-10.md`.
Decisions confirmed or changed by observed usage (F = page fetched, S = search summary only):

| Concept | Decision | Evidence |
|---|---|---|
| Retreat | **inziva** confirmed (glossary item 1 can close) | 0 uses of "retreat" in Turkish running text across 12 operator pages; "Mardin Yoga İnzivası" (gunesayyoga.com, F), "Spa Paketleri ve İnzivalar" (mandarinoriental.com/tr, F), "Kış İnzivası" (soultreatstravel.com, F). "Kamp" is the budget register. |
| Register | formal **siz** in sentences, bare imperative on buttons, confirmed | Google TR help "Saat diliminizi değiştirebilirsiniz" (support.google.com/calendar/answer/37064?hl=tr, F); Airbnb TR "Tarih ekleyin" (F). |
| Teacher / class / session | eğitmen / ders / seans confirmed | "eğitmen" 38 vs "öğretmen" 9 hits on studio pages (F). |
| Class timetable | Studio section **Ders programı**; guest tab stays **Program** (length) | "Ders Programı" (guzelbahceyoga.com/dersler, F); Yoga Iatro App Store TR (F). |
| Meals | **Yemekler** everywhere (billing "öğünler" fixed) | "Yemekler Hakkında" (workshopix, F); "öğün" rare. |
| Publish / draft / preview | Yayınla / Taslak / Önizleme confirmed | WordPress TR .po (F), Wix TR (F). |
| Link / share | Bağlantı / Bağlantıyı kopyala / Paylaş confirmed | Google Drive TR (support.google.com/drive/answer/2494822?hl=tr, F). |
| Check-in / out | Giriş / Çıkış confirmed | Airbnb TR search widget labels (F). |
| Capacity | Kontenjan confirmed | "Kontenjan sınırlıdır" (yogazone.ist, F). |
| Dialog cancel | "Vazgeç" for dismiss buttons (billing/admin); `common.cancel` stays **İptal** because it is also the "cancel this class date" button | WordPress TR "Vazgeç" (F); AOSP Calendar "İptal" (F). |
| Abbreviation suffixes | **MB'den / MB'ye** (was MB'tan / MB'a) | TDK Kısaltmalar: uppercase abbreviations take the suffix of the last letter's reading (tdk.gov.tr, F). |
| Day number | **"{n}. Gün"** (was "Gün {n}") | Turkish ordinal counting, already used in retreatDatesBody "1. gün". |
| Live status | Space chip `common.live` **Yayında**; session badge `flow.live` **Sürüyor** | "Canlı" reads as a live broadcast. |
| Library | **kitaplık** everywhere (kütüphane removed) | Consistency with "Ses kitaplığı". |
| Treatments | **Terapiler** kept, but OPEN | Spa menus use "Bakımlar" / "Spa hizmetleri" (mandarinoriental, kempinski TR, F); "terapi" covers healing sessions better. Native reviewer to decide. |
| Withdrawal right | **cayma hakkı** kept, legal review still required | Mesafeli Sözleşmeler Yönetmeliği (secondary sources, S); Apple uses "vazgeçme hakkı" (F). |

New items for native review: "Terapiler" vs "Bakımlar"; "{venue} üzerinden rezervasyon yapın" length on a button; "Şu kadar tekrardan sonra" (`teach.endsAfter`, Google Calendar wording not verified); "MB'den" vs the common colloquial "MB'tan".
