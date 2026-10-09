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
| Coupon code | kupon kodu | indirim kodu, promosyon kodu | Product is called "coupon" in the UI and admin; "kupon" is commonly understood in Turkish e-commerce. Codes are never translated. "İndirim" used for the discount itself. | https://www.qrcode-tiger.com/tr/stripe-payment-method-qrtiger (general) |
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
