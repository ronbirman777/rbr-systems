# Legal and consumer-rights strings: Turkish and Italian (for specialist review)

Status 2026-10-14, branch `i18n/033-tr-it-review`. **No lawyer, tax adviser or native speaker has reviewed these.**
The Italian register was switched from Lei to tu (owner decision). For the strings below **only the register changed**; their legal substance
(what is consented to, what rights exist, refund/no-refund, dates and deletion consequences) was deliberately kept identical. Turkish was
reworded only where listed ("TR (before this branch)").

What a specialist should check:
- Turkish: "cayma hakkı" (Mesafeli Sözleşmeler Yönetmeliği; Apple TR says "vazgeçme hakkı"), the consent-to-immediate-performance sentence,
  "vergiler hariç", "fatura / makbuz".
- Italian: "diritto di recesso" (Codice del Consumo art. 59), the consent sentence for immediate performance, "imposte escluse", "fattura / ricevuta"
  (fattura has a legal meaning under Italian e-invoicing), "disdetta" vs "annullamento".
- Whether tu is acceptable in consent checkboxes (consents are first person "Sono consapevole…", so they did not change).

### `billing.consentWithdrawal`

Right of withdrawal (statutory).

- EN: I understand that once the service has been fully provided, my statutory right of withdrawal may be lost, to the extent the law allows.
- TR: Hizmet tamamen ifa edildiğinde, yasaların izin verdiği ölçüde yasal cayma hakkımı kaybedebileceğimi anlıyorum.
- IT (now, tu): Sono consapevole che, una volta eseguito integralmente il servizio, potrei perdere il diritto di recesso, nei limiti consentiti dalla legge.

### `billing.consentImmediate`

Consent to immediate performance (linked to withdrawal right).

- EN: I want my Space to be created and activated immediately after payment.
- TR: Space'imin ödemenin hemen ardından oluşturulmasını ve etkinleştirilmesini istiyorum.
- IT (now, tu): Desidero che il mio Space venga creato e attivato subito dopo il pagamento.

### `billing.consentRequired`

Both consents required before payment.

- EN: Please confirm both statements to continue.
- TR: Devam etmek için lütfen her iki ifadeyi de onaylayın.
- IT (now, tu): Per proseguire, conferma entrambe le dichiarazioni.
- IT (before this branch, Lei): Per proseguire, confermi entrambe le dichiarazioni.

### `billing.termsLine`

Acceptance of Terms, Privacy Policy, Billing & Cancellation terms.

- EN: By continuing you accept the Terms of Service, the Privacy Policy and the Billing & Cancellation terms.
- TR: Devam ederek Hizmet Şartları'nı, Gizlilik Politikası'nı ve Faturalama ve İptal koşullarını kabul etmiş olursunuz.
- IT (now, tu): Proseguendo accetti le Condizioni di servizio, l'Informativa sulla privacy e le Condizioni di fatturazione e disdetta.
- IT (before this branch, Lei): Proseguendo accetta le Condizioni di servizio, l'Informativa sulla privacy e le Condizioni di fatturazione e disdetta.

### `billing.perSpaceNote`

Cancel any time; access until end of paid period.

- EN: Per Space. Cancel any time - you keep access until the end of the period you've paid for.
- TR: Her Space için geçerlidir. İstediğiniz zaman iptal edebilirsiniz; ödemesini yaptığınız dönemin sonuna kadar erişiminiz devam eder.
- IT (now, tu): Per ogni Space. Puoi disdire in qualsiasi momento: l'accesso resta attivo fino alla fine del periodo già pagato.
- IT (before this branch, Lei): Per ogni Space. Può disdire in qualsiasi momento: l'accesso resta attivo fino alla fine del periodo già pagato.

### `billing.cancelBody`

Cancellation effect; no refund for current period.

- EN: Cancelling stops future payments. You keep full access until the end of the period you've paid for. No refund is issued for the current period.
- TR: İptal ettiğinizde sonraki ödemeler durdurulur. Ödemesini yaptığınız dönemin sonuna kadar tüm özelliklere erişiminiz sürer. Geçerli dönem için iade yapılmaz.
- IT (now, tu): La disdetta interrompe i pagamenti futuri. L'accesso completo resta attivo fino alla fine del periodo già pagato. Il periodo in corso non viene rimborsato.

### `billing.cancelConfirmBody`

Access until date; resume before then.

- EN: You keep full access until {date}. You can resume before then.
- TR: {date} tarihine kadar tüm özelliklere erişiminiz sürer. O tarihten önce aboneliğinizi yeniden başlatabilirsiniz.
- IT (now, tu): L'accesso completo resta attivo fino al {date}. Prima di quella data puoi riattivare l'abbonamento.
- IT (before this branch, Lei): L'accesso completo resta attivo fino al {date}. Prima di quella data può riattivare l'abbonamento.

### `billing.emailCancelIntro`

Cancellation e-mail: end date and resume right.

- EN: Your subscription for {space} will end on {date}. You keep full access until then, and you can resume at any time before it ends.
- TR: {space} aboneliğiniz {date} tarihinde sona erecek. O zamana kadar tüm özelliklere erişiminiz sürer ve sona ermeden önce istediğiniz zaman aboneliğinizi yeniden başlatabilirsiniz.
- IT (now, tu): Il tuo abbonamento a {space} terminerà il {date}. Fino ad allora l'accesso completo resta attivo e puoi riattivare l'abbonamento in qualsiasi momento prima della scadenza.
- IT (before this branch, Lei): Il suo abbonamento a {space} terminerà il {date}. Fino ad allora l'accesso completo resta attivo e può riattivare l'abbonamento in qualsiasi momento prima della scadenza.

### `billing.emailPaymentFinalIntro`

Final payment after scheduled cancellation.

- EN: Thank you. This is your final payment: you scheduled cancellation, so your access continues until {date} and the subscription then ends.
- TR: Teşekkür ederiz. Bu son ödemenizdir: iptal planladığınız için erişiminiz {date} tarihine kadar devam eder, ardından abonelik sona erer.
- IT (now, tu): Grazie. Questo è il tuo ultimo pagamento: avendo programmato la disdetta, l'accesso resta attivo fino al {date}, poi l'abbonamento terminerà.
- IT (before this branch, Lei): Grazie. Questo è il suo ultimo pagamento: avendo programmato la disdetta, l'accesso resta attivo fino al {date}, poi l'abbonamento terminerà.

### `billing.taxNote`

Taxes computed at checkout (no VAT claim).

- EN: Any taxes are calculated and shown at secure checkout.
- TR: Varsa vergiler güvenli ödeme adımında hesaplanır ve gösterilir.
- IT (now, tu): Le eventuali imposte vengono calcolate e mostrate nella pagina di pagamento sicuro.

### `billing.nextCharge`

Tax-exclusive amount wording.

- EN: Next charge (before tax)
- TR: Sonraki ödeme (vergiler hariç)
- IT (now, tu): Prossimo addebito (imposte escluse)
- TR (before this branch): Sonraki tahsilat (vergi öncesi)

### `billing.emailOfficialDocument`

Which document is the official invoice/receipt.

- EN: Your official invoice / receipt is on the secure page linked above. You won't receive a separate receipt email from our payment provider.
- TR: Resmî faturanız / makbuzunuz yukarıdaki bağlantıdaki güvenli sayfadadır. Ödeme hizmeti sağlayıcımızdan ayrıca bir makbuz e-postası almazsınız.
- IT (now, tu): La fattura / ricevuta ufficiale è disponibile nella pagina sicura indicata sopra. Non riceverai una ricevuta separata dal nostro fornitore di servizi di pagamento.
- IT (before this branch, Lei): La fattura / ricevuta ufficiale è disponibile nella pagina sicura indicata sopra. Non riceverà una ricevuta separata dal nostro fornitore di servizi di pagamento.

### `billing.viewInvoice`

Invoice vs receipt naming.

- EN: View invoice / receipt
- TR: Faturayı / makbuzu görüntüle
- IT (now, tu): Visualizza fattura / ricevuta

### `billing.studioSuspendedDeadline`

Deletion eligibility after non-payment.

- EN: If this isn't resolved, the Space becomes eligible for deletion on {date}.
- TR: Sorun çözülmezse Space {date} tarihinden itibaren silinebilir hale gelir.
- IT (now, tu): Se il problema non viene risolto, lo Space potrà essere eliminato a partire dal {date}.

### `billing.emailStudioIntro`

Suspension and deletion eligibility.

- EN: Studio for {space} is suspended until your payment is resolved. Your content is safe. If it stays unresolved, the Space becomes eligible for deletion on {date}.
- TR: Ödemeniz tamamlanana kadar {space} için Studio askıya alındı. İçerikleriniz güvende. Sorun çözülmezse Space {date} tarihinden itibaren silinebilir hale gelir.
- IT (now, tu): Lo Studio di {space} è sospeso fino alla regolarizzazione del pagamento. I tuoi contenuti sono al sicuro. Se il pagamento resta in sospeso, lo Space potrà essere eliminato a partire dal {date}.
- IT (before this branch, Lei): Lo Studio di {space} è sospeso fino alla regolarizzazione del pagamento. I suoi contenuti sono al sicuro. Se il pagamento resta in sospeso, lo Space potrà essere eliminato a partire dal {date}.

### `billing.emailFinalIntro`

Final notice before deletion eligibility.

- EN: This is a final notice. If the payment for {space} isn't resolved, the Space becomes eligible for deletion on {date}. Resolving the payment now restores everything.
- TR: Bu bir son bildirimdir. {space} için ödeme tamamlanmazsa Space {date} tarihinden itibaren silinebilir hale gelir. Ödemeyi şimdi tamamlarsanız her şey geri yüklenir.
- IT (now, tu): Questo è un ultimo avviso. Se il pagamento per {space} non viene regolarizzato, lo Space potrà essere eliminato a partire dal {date}. Regolarizzando il pagamento ora, tutto viene ripristinato.

### `billing.nextActionDeletionEligible`

Deletion eligibility date.

- EN: Eligible for deletion from {date}
- TR: {date} tarihinden itibaren silinebilir
- IT (now, tu): Eliminazione possibile dal {date}

### `billing.emailFailedIntro`

Dunning timeline (24 h / 7 days).

- EN: We couldn't process your payment for {space}. Your Space stays available for now and we'll retry automatically. If it isn't resolved, your Guest App becomes unavailable after about 24 hours and Studio is suspended after 7 days.
- TR: {space} için ödemenizi işleyemedik. Space'iniz şimdilik kullanılabilir durumda ve ödemeyi otomatik olarak yeniden deneyeceğiz. Sorun çözülmezse Misafir Uygulamanız yaklaşık 24 saat sonra kullanılamaz hale gelir, Studio ise 7 gün sonra askıya alınır.
- IT (now, tu): Non è stato possibile elaborare il pagamento per {space}. Per ora il tuo Space resta disponibile e il pagamento verrà ritentato automaticamente. Se il problema non viene risolto, l'app per gli ospiti non sarà più disponibile dopo circa 24 ore e lo Studio verrà sospeso dopo 7 giorni.
- IT (before this branch, Lei): Non è stato possibile elaborare il pagamento per {space}. Per ora il suo Space resta disponibile e il pagamento verrà ritentato automaticamente. Se il problema non viene risolto, l'app per gli ospiti non sarà più disponibile dopo circa 24 ore e lo Studio verrà sospeso dopo 7 giorni.

### `billing.lifecycleReplacePaidBody`

Irreversible content deletion.

- EN: This discards “{space}”'s existing content — its published version, schedule, and module content — and starts a new draft in the same Space. This cannot be undone. Type the Space's current name to confirm.
- TR: Bu işlem “{space}” içindeki mevcut içeriği (yayınlanmış sürümü, programı ve modül içeriğini) siler ve aynı Space'te yeni bir taslak başlatır. Bu işlem geri alınamaz. Onaylamak için Space'in mevcut adını yazın.
- IT (now, tu): Questa operazione elimina il contenuto attuale di “{space}” (la versione pubblicata, il programma e il contenuto dei moduli) e avvia una nuova bozza nello stesso Space. Non può essere annullata. Per confermare, digita il nome attuale dello Space.
- IT (before this branch, Lei): Questa operazione elimina il contenuto attuale di “{space}” (la versione pubblicata, il programma e il contenuto dei moduli) e avvia una nuova bozza nello stesso Space. Non può essere annullata. Per confermare, digiti il nome attuale dello Space.

### `billing.lifecycleDeleteActiveSubscription`

Deletion blocked by active subscription.

- EN: This Space still has an active subscription, so nothing was deleted. Cancel the subscription on the Billing page and delete the Space after it has ended.
- TR: Bu Space'in hâlâ etkin bir aboneliği olduğu için hiçbir şey silinmedi. Aboneliği Faturalama sayfasından iptal edin ve abonelik sona erdikten sonra Space'i silin.
- IT (now, tu): Questo Space ha ancora un abbonamento attivo, quindi non è stato eliminato nulla. Disdici l'abbonamento nella pagina Fatturazione ed elimina lo Space quando sarà terminato.
- IT (before this branch, Lei): Questo Space ha ancora un abbonamento attivo, quindi non è stato eliminato nulla. Disdica l'abbonamento nella pagina Fatturazione ed elimini lo Space quando sarà terminato.
- TR (before this branch): Bu Space'in hâlâ aktif bir aboneliği olduğu için hiçbir şey silinmedi. Aboneliği Faturalama sayfasından iptal edin ve abonelik sona erdikten sonra Space'i silin.

### `billing.accountDeleteActiveSubscription`

Account deletion blocked by subscription.

- EN: One of your Spaces still has an active subscription, so nothing was deleted. Cancel it on that Space's Billing page and wait until the subscription has ended, then delete your account.
- TR: Space'lerinizden birinin hâlâ etkin bir aboneliği var, bu yüzden hiçbir şey silinmedi. Aboneliği o Space'in faturalama sayfasından iptal edin, abonelik sona erene kadar bekleyin, ardından hesabınızı silin.
- IT (now, tu): Uno dei tuoi Space ha ancora un abbonamento attivo, quindi non è stato eliminato nulla. Disdicilo dalla pagina di fatturazione di quello Space, attendi che l'abbonamento sia terminato e poi elimina il tuo account.
- IT (before this branch, Lei): Uno dei suoi Space ha ancora un abbonamento attivo, quindi non è stato eliminato nulla. Lo disdica dalla pagina di fatturazione di quello Space, attenda che l'abbonamento sia terminato e poi elimini il suo account.

### `teach.retreatPriceHint`

No in-app payment statement.

- EN: For information only. Guests don’t pay inside the app.
- TR: Yalnızca bilgi amaçlıdır. Misafirler uygulama içinde ödeme yapmaz.
- IT (now, tu): Solo a titolo informativo. Gli ospiti non pagano all’interno dell’app.

### `studio.featuredBody`

Submission/consent wording for public listing.

- EN: I’d like my retreat to be featured on InnerDweS. This is a submission for review - it does not automatically publish your retreat to a public directory. InnerDweS reviews every submission before it goes live.
- TR: İnzivamın InnerDweS'te öne çıkarılmasını istiyorum. Bu bir inceleme başvurusudur - inzivanızı herkese açık bir dizinde otomatik olarak yayınlamaz. InnerDweS her başvuruyu yayına almadan önce inceler.
- IT (now, tu): Desidero che il mio ritiro venga messo in evidenza su InnerDweS. Si tratta di una richiesta di revisione: non pubblica automaticamente il ritiro in una directory pubblica. InnerDweS esamina ogni richiesta prima che venga pubblicata.

### `teach.directoryBody`

Opt-in consent to directory listing.

- EN: Optional. Off unless you turn it on - we never list anyone automatically. If you opt in, you may be featured in the upcoming InnerDweS Teachers directory and on our website.
- TR: İsteğe bağlı. Siz açmadıkça kapalıdır; kimseyi otomatik olarak listelemeyiz. Katılmayı seçerseniz, yakında yayınlanacak InnerDweS Eğitmenler dizininde ve web sitemizde yer alabilirsiniz.
- IT (now, tu): Facoltativo. Disattivato finché non lo attivi tu: non inseriamo mai nessuno automaticamente. Se aderisci, potrai comparire nella futura directory degli insegnanti di InnerDweS e sul nostro sito.
- IT (before this branch, Lei): Facoltativo. Disattivato finché non lo attiva lei: non inseriamo mai nessuno automaticamente. Se aderisce, potrà comparire nella futura directory degli insegnanti di InnerDweS e sul nostro sito.
- TR (before this branch): İsteğe bağlı. Siz açmadıkça kapalıdır; kimseyi otomatik olarak listelemeyiz. Katılmayı seçerseniz, yakında yayınlanacak InnerDweS Eğitmenler rehberinde ve web sitemizde yer alabilirsiniz.

