# Stripe Managed Payments (Stripe as Merchant of Record): code impact inventory

Status: **research only**. Nothing in this document has been implemented, and the app has not been changed.
Scope: what OUR code assumes today, and where a switch to Stripe Managed Payments (MoR) would touch it.
Stripe's own documentation was **not** consulted, on purpose. Every statement about how MoR behaves is a
hypothesis from the task brief. Those statements are marked **UNKNOWN-UNTIL-STRIPE-CONFIRMS**.

Baseline: branch `feat/032-commercial-platform-foundation`, HEAD `1fbd5c1`, audited 2026-10-10. Migrations 0036-0045 are committed.
Uncommitted work in the tree (`0046_billing_audio_provenance_and_exemption.sql`, `lib/media/fingerprint.ts`, the audio/media
edits) is a different concern (audio provenance). It does not touch any Stripe, checkout, invoice or email code and is
ignored here. One effect: the first free migration number for MoR work is **0047**, or later.

## Classification legend

| Class | Meaning |
|---|---|
| UNCHANGED | Works the same under either model as far as our code is concerned |
| CONFIG-ONLY | A Stripe Dashboard, env, or Admin setting changes. No TypeScript or SQL change |
| CODE CHANGE LIKELY | Our code or copy hard-codes a standard-model assumption that would be wrong or contradictory under MoR |
| UNKNOWN-UNTIL-STRIPE-CONFIRMS | The impact depends on a Stripe behaviour we have not verified |

---

## 1. Stripe adapter

### 1.1 `app/src/lib/billing/stripe/real.ts`: `createStripeGateway().createCheckoutSession`

The only place a Checkout Session is created. Parameters sent today:

| Param | Value today | Assumption | Class |
|---|---|---|---|
| `mode` | `"subscription"` | A subscription is the product type | UNKNOWN-UNTIL-STRIPE-CONFIRMS (MoR may support subscriptions only for eligible product types) |
| `customer` | Our pre-created `cus_` (from `ensureCustomer`) | We own the Customer object and reuse it across purchases | UNKNOWN-UNTIL-STRIPE-CONFIRMS |
| `line_items` | `[{ price, quantity: 1 }]` | Price created by `ensureProductAndPrice` without a tax code | CODE CHANGE LIKELY (see 1.3, product tax code) |
| `discounts` | `[{ coupon }]` when a coupon is reserved | Stripe applies OUR coupon object to the session | UNKNOWN-UNTIL-STRIPE-CONFIRMS (coupons/discounts may be restricted) |
| `allow_promotion_codes` | `false` | Stripe never sees a typed code | UNCHANGED |
| `client_reference_id`, `metadata`, `subscription_data.metadata` | pending id, user id, space type, plan key, coupon | Reconciliation relies on these coming back on the session and subscription | UNCHANGED (add `payment_model` to metadata, see section 9) |
| `success_url`, `cancel_url`, `expires_at` | From `urls.ts`, 60-minute TTL | Standard hosted Checkout redirect flow | UNCHANGED (likely) |
| `billing_address_collection` | `"auto"` | Address is only needed when Stripe Tax needs it | UNKNOWN-UNTIL-STRIPE-CONFIRMS (an MoR may require `"required"`) |
| `automatic_tax` | `{ enabled: a.automaticTax }`, from env `STRIPE_AUTOMATIC_TAX` | **We** choose the tax engine. Stripe Tax runs on our account as our agent | CODE CHANGE LIKELY: must be omitted or forced, and must not be configurable, under MoR |
| `locale` | Account locale (en/de/es/fr/he/tr/it) | Hosted page localisation | UNCHANGED |
| Managed-payments flag | **Absent** | n/a | CODE CHANGE LIKELY: a new param, set only when the snapshotted model is `managed_payments` |
| Not sent at all | `payment_method_collection`, `customer_update`, `tax_id_collection`, `consent_collection`, `invoice_creation`, `custom_text`, `phone_number_collection` (grep: none appear in `src/`) | Stripe defaults apply | UNKNOWN-UNTIL-STRIPE-CONFIRMS (MoR may require `customer_update` / `tax_id_collection`, or own the consent/terms collection itself) |

The idempotency key `idw-checkout-<pending>-<attemptKey>` does not include the payment model. If the model can change while a
checkout is open, add the model to `attemptKey` (in `checkout.ts`), so Stripe's 24-hour idempotency cache can never return
a session created under the other model. Class: CODE CHANGE LIKELY.

### 1.2 `real.ts`: other gateway methods

| Method | What it does | Assumption | Class |
|---|---|---|---|
| `ensureCustomer` | `customers.create({ email, metadata.innerdwes_user_id })`, idempotent per user and mode | We create and own the customer | UNKNOWN-UNTIL-STRIPE-CONFIRMS |
| `checkPrice` | Price-drift guard: active, amount, currency, recurring monthly, `interval_count` 1 | Price shape is enough to sell | CODE CHANGE LIKELY: under MoR also verify the **product tax code** (and price `tax_behavior` if Stripe requires it). Today neither is read |
| `retrieveSubscription` | Expands `discounts`, then reads the latest invoice to compute `effectiveAmountMinor = subtotal - discount` | Subscription and invoice live on our account as Stripe Billing objects | UNKNOWN-UNTIL-STRIPE-CONFIRMS (object shape and ownership under MoR) |
| `setCancelAtPeriodEnd` | `subscriptions.update({ cancel_at_period_end })` from our Billing page | We can change the subscription directly | UNKNOWN-UNTIL-STRIPE-CONFIRMS |
| `retrieveInvoice` | Invoice, then `payments` expand, then PaymentIntent, then `latest_charge.receipt_url` (best effort) | The invoice and receipt are on our account. The receipt URL is ours to show | UNKNOWN-UNTIL-STRIPE-CONFIRMS (who issues the document, and whether the URLs are still exposed) |
| `retrieveChargeRefund` / `findInvoiceIdForPaymentIntent` | Mirror the charge's cumulative `amount_refunded`. `invoicePayments.list` maps PI to invoice | Refunds appear as charge refunds on our account | UNKNOWN-UNTIL-STRIPE-CONFIRMS (Stripe-initiated MoR refunds may arrive differently) |
| `createBillingPortalSession` | `billingPortal.sessions.create({ customer, return_url })` | The Customer Portal is available and configured by us | UNKNOWN-UNTIL-STRIPE-CONFIRMS (the portal may be restricted under MoR) |
| `createCoupon` / `retrieveCoupon` | Our coupons become Stripe coupons. Drift guard compares the terms | Coupons are usable with the session | UNKNOWN-UNTIL-STRIPE-CONFIRMS |
| `ensureProductAndPrice` | `products.create({ name, metadata })` and `prices.create({ unit_amount, currency, recurring })` | **No `tax_code`, no `tax_behavior`** | CODE CHANGE LIKELY: pass a required tax code (eligible SaaS category), and possibly `tax_behavior`. Existing products created without a code need a backfill or update path |
| `verifyWebhook` | Signature, then `livemode` equals key mode, then `eventToDto` | Same endpoint and signing secret | UNCHANGED |

### 1.3 `app/src/lib/billing/stripe/gateway.ts` (interface and DTOs)

- `createCheckoutSession` args include `automaticTax: boolean`. These args need a `paymentModel: "standard" | "managed_payments"`
  (or a discriminated union, so that `automaticTax` cannot be expressed under MoR). Class: CODE CHANGE LIKELY.
- `ensureProductAndPrice` / `checkPrice` args need `taxCode` (expected). Class: CODE CHANGE LIKELY.
- `CheckoutSessionDTO` has no field for the session's managed-payments state. Add a field, so provisioning can verify the
  session was created under the model the pending checkout recorded. Class: CODE CHANGE LIKELY.
- `InvoiceDTO.hostedInvoiceUrl/invoicePdfUrl/receiptUrl/number/taxMinor`: the semantics may change (issuer = Stripe). Class: UNKNOWN-UNTIL-STRIPE-CONFIRMS.

### 1.4 `app/src/lib/billing/stripe/mappers.ts`

- `mapInvoice`: `taxMinor` = sum of `total_taxes`, `discountMinor` = sum of `total_discount_amounts`, the period from the
  subscription line, `hosted_invoice_url` / `invoice_pdf`. Correct for Stripe Billing invoices. Under MoR the tax may be
  presented differently (for example tax-inclusive, or not as `total_taxes`). Class: UNKNOWN-UNTIL-STRIPE-CONFIRMS.
- `mapCheckoutSession`: needs to read the managed-payments indicator once it is known. Class: CODE CHANGE LIKELY.
- `eventToDto`: handles `charge.refunded` and `charge.refund.updated` only. Class: UNCHANGED, unless MoR refunds use other events (UNKNOWN).
- `effectiveAmountFromInvoice`: pre-tax `subtotal - discount`. Class: UNCHANGED.

### 1.5 `app/src/lib/billing/stripe/mode.ts`

Test/live mode from the key prefix. Class: UNCHANGED. The payment model is orthogonal to the mode and must not be derived from it.

### 1.6 `app/src/lib/billing/safeRedirect.ts`: `isStripeHostedUrl`

Follows only `https://*.stripe.com` (checkout and portal). Class: UNKNOWN-UNTIL-STRIPE-CONFIRMS. If an MoR Checkout or
portal URL lives on another host, every redirect fails closed with `unavailable`, which is safe but blocks sales.

---

## 2. Checkout service: `app/src/lib/billing/checkout.ts`

| Function | Today | Class |
|---|---|---|
| `resolvePlan` | Trusted plan by `BASE_PLAN_KEY` and mode. Requires `stripePriceId` | UNCHANGED (add a tax-code presence check under MoR, together with `checkPrice`) |
| `assertPriceMatches` | Calls `checkPrice` | CODE CHANGE LIKELY (pass the expected tax code when the model is MoR) |
| `ensureOpenCheckout` | Reuses an open pending checkout for `(user, spaceType)` | CODE CHANGE LIKELY: must also require `existing.paymentModel === currentModel`, otherwise expire it and create a new one |
| `previewCheckout` | Server quote, coupon reservation | UNCHANGED, unless coupons are forbidden under MoR. Then the coupon UI and this path must refuse with a mapped reason (UNKNOWN) |
| `startCheckout` | consent, plan, drift guard, pending checkout, coupon reserve plus `couponMatchesStripe`, `saveAcceptance(LEGAL_VERSIONS)`, `ensureCustomer`, `createCheckoutSession({ automaticTax: deps.automaticTax })` | CODE CHANGE LIKELY: (a) read and snapshot the payment model; (b) pass `paymentModel` and drop `automaticTax` under MoR; (c) include the model in `attemptKey` and in `metadata.payment_model`; (d) when reusing `pending.sessionId`, require the same model as well as the same coupon; (e) write the model and the seller entity to the acceptance |
| `cancelCheckoutByUser` | Expire the session, mark the pending checkout canceled | UNCHANGED |

## 3. Provisioning, reconcile, sync, webhook

| File / function | Today | Class |
|---|---|---|
| `provisioning.ts` `provisionFromVerifiedSession` | Verifies pending checkout, mode, metadata user/checkout, customer, session id, `complete` plus `paid`, then active subscription | CODE CHANGE LIKELY (small): add `metadata.payment_model` and the session flag versus `pending.paymentModel` as a further `metadata_mismatch` check. Pass the model into `toProvisionInput` |
| `provisioning.ts` `toProvisionInput` | Builds the `p_sub` jsonb for `billing_provision_paid_space` | CODE CHANGE LIKELY: add `payment_model` |
| `reconcile.ts` `reconcileCheckout` / `getCheckoutUiState` | Re-retrieves the session, then the same provisioning | UNCHANGED |
| `sync.ts` `syncSubscription` / `subscriptionToState` | Re-fetch the subscription and apply status, failure and recovery | UNCHANGED (UNKNOWN if MoR changes the dunning / `past_due` behaviour) |
| `sync.ts` `processInvoice` | Upserts the invoice, counts the discount cycle, then **enqueues `payment_confirmation`** (paid) and **`payment_failed`** (first failure of a renewal) | CODE CHANGE LIKELY: email gating per payment model (see section 5). `invoiceToRpc` should carry the model, or the RPC derives it from the subscription |
| `webhook.ts` `route` | Handles checkout, subscription, invoice and refund events; everything else is `ignored` | UNCHANGED for the core set. UNKNOWN-UNTIL-STRIPE-CONFIRMS whether MoR adds events we must handle (Stripe-initiated refunds, dispute outcomes, tax or document events). Disputes are not handled today under either model |
| `lifecycleJob.ts` | Reconcile stuck checkouts, resync subscriptions, lifecycle notices, flush emails | UNCHANGED (the lifecycle notices `guest_unavailable` / `studio_suspended` / `final_warning` describe OUR access consequences and stay ours) |

## 4. Tax

| Location | Today | Class |
|---|---|---|
| `deps.server.ts` `BILLING_ENV.stripeAutomaticTax` and `getBillingDeps().automaticTax` | `STRIPE_AUTOMATIC_TAX === "true"` | CODE CHANGE LIKELY: under MoR this toggle is irrelevant and probably forbidden. Either ignore it, or fail closed at `startCheckout` and in `adminSetPaidCheckout` when the model is MoR and the env says `true` (config conflict). Must not be passed as `automatic_tax` alongside the MoR flag |
| `deps.ts` `BillingDeps.automaticTax` | Single tax-source switch | CODE CHANGE LIKELY (doc comment and semantics) |
| `quote.ts` `buildQuote` | Pre-tax informational quote | UNCHANGED (comment wording only) |
| `billing.*.ts` `taxNote` ("Any taxes are calculated and shown at secure checkout.") and `nextCharge` ("Next charge (before tax)") | Tax-exclusive presentation | UNKNOWN-UNTIL-STRIPE-CONFIRMS (an MoR may present tax-inclusive prices per country. The "before tax" labels on the Billing page and in Admin `sdExpectedCharge` may then be wrong) |
| `billing_invoices.tax_minor` | Mirror of `total_taxes` | UNKNOWN-UNTIL-STRIPE-CONFIRMS |
| `docs/billing/TAX.md` | "Exactly one tax source: Stripe Tax" plus a list of open operator/registration decisions | Doc change: under MoR most of the "Open decisions" table moves to Stripe. The product tax code stays ours |

## 5. Emails and invoice/receipt wording

| Location | Today | Class |
|---|---|---|
| `emails/templates.ts` header and `emails/enqueue.ts` header | "Stripe's own customer emails stay OFF". One InnerDweS email per paid invoice, linking the Stripe-hosted document | CODE CHANGE LIKELY: under MoR, Stripe as seller probably sends its own receipt/invoice emails, possibly without an opt-out. The "one email per event" model must become "Stripe sends the receipt; we send a service confirmation" (or we suppress ours) |
| `enqueue.ts` `enqueuePaymentConfirmation` | Payload includes amount paid, discount, invoice number, hosted/PDF/receipt URLs | CODE CHANGE LIKELY: decide per model whether to include financial rows and the invoice number, or a service-only confirmation |
| `sync.ts` `processInvoice`, the `payment_failed` enqueue | Our failed-payment notice | UNKNOWN-UNTIL-STRIPE-CONFIRMS (if Stripe sends dunning emails under MoR, ours duplicates them. The gate would sit at this call site, keyed by the invoice's or subscription's model) |
| `emails/render.ts` `renderBillingEmail("payment_confirmation")` | Rows "Amount paid", "Invoice", button "View invoice / receipt", footnote `emailOfficialDocument` | CODE CHANGE LIKELY: copy plus a model-dependent branch |
| `billing.en.ts:201` `emailOfficialDocument` | "Your official invoice / receipt is on the secure page linked above. **You won't receive a separate receipt email from our payment provider.**" | CODE CHANGE LIKELY: **false under MoR** if Stripe sends receipts. Needs an MoR variant, e.g. "issued by Stripe as the seller", in all 7 locales |
| `billing.en.ts:200,148` `emailViewInvoice` / `viewInvoice` ("View invoice / receipt") | Neutral | CONFIG-ONLY / copy: optional "issued by Stripe" wording |
| `billing.en.ts:198` `emailFooter`, and the `layout()` brand header "InnerDweS" | Brand as sender | UNCHANGED (service emails stay ours), unless legal review says otherwise |
| `emails/outbox.ts`, `resend.ts` | Delivery | UNCHANGED |
| `docs/billing/EMAILS-INVOICES.md` "Stripe receipts and customer emails must be OFF" | Manual Dashboard gate | Doc change: inverted or removed under MoR |

## 6. Legal acceptance and seller identity

| Location | Today | Class |
|---|---|---|
| `legal.ts` `LEGAL_VERSIONS` | Draft identifiers. Comment: "contracting operator and the tax/invoice issuer ... NOT decided here" | CODE CHANGE LIKELY: the versions must be model-specific (MoR terms name Stripe as reseller/seller), e.g. `LEGAL_VERSIONS[model]` or separate `consentText` ids |
| `checkout.ts` `startCheckout`, `saveAcceptance` | Stores terms/privacy/billing-terms versions, consent text id, locale | CODE CHANGE LIKELY: also record `payment_model` (and the seller-of-record label) |
| `billing.*.ts` `consentImmediate`, `consentWithdrawal`, `termsLine` | We collect the immediate-service consent and the withdrawal acknowledgement ourselves. `termsLine` names our ToS, Privacy, and Billing & Cancellation terms | UNKNOWN-UNTIL-STRIPE-CONFIRMS: under MoR the withdrawal right is owed by the seller (Stripe). Stripe may collect consent itself (`consent_collection`), and our checkbox wording may need to change or move. `termsLine` probably needs to reference Stripe's buyer terms |
| `billing.en.ts:131` `cancelBody` ("No refund is issued for the current period.") | Our refund policy | UNKNOWN-UNTIL-STRIPE-CONFIRMS (under MoR the refund policy may be Stripe's) |
| `checkout-form.tsx` | Renders the above, `required` checkboxes | CODE CHANGE LIKELY only if the consent moves to Stripe |
| `0036` `billing_acceptances_consent_required` CHECK (both booleans true) | DB requires our two consents | UNKNOWN-UNTIL-STRIPE-CONFIRMS (if the consents move to Stripe, this constraint needs a model-aware form) |
| Legal pages | **No Terms/Privacy/Billing pages exist in `app/(site)`** (grep). Nothing names a seller anywhere in the code | n/a: the gap exists under both models |

## 7. Customer UI

| File | Today | Class |
|---|---|---|
| `app/(site)/create/[type]/page.tsx`, `checkout-form.tsx`, `create/billingActions.ts` (`applyCouponAction`, `startCheckoutAction`, `cancelCheckoutAction`) | Coupon field, two consents, `taxNote`, redirect only to a Stripe host | UNCHANGED in code, except: coupon UI hidden or refused if MoR forbids discounts (UNKNOWN). Consent and terms copy (section 6) |
| `app/(site)/create/complete/*`, `api/billing/checkout-status/route.ts` | Server-state polling | UNCHANGED |
| `app/(site)/billing/[tenantId]/actions.ts` `cancelSubscriptionAction` / `resumeSubscriptionAction` | `setCancelAtPeriodEnd` plus resync | UNKNOWN-UNTIL-STRIPE-CONFIRMS |
| same, `openBillingPortalAction` | Stripe Customer Portal ("Update payment method", also the failed-payment recovery path) | UNKNOWN-UNTIL-STRIPE-CONFIRMS. If the portal is restricted, failure recovery needs another path (e.g. the hosted invoice page link) |
| `billing-sections.tsx`, `billingPageModel.ts` `invoiceLink` (hosted invoice, falling back to receipt) | Payment history with a "View invoice / receipt" link | UNCHANGED in logic. Copy may say "issued by Stripe" |
| `customerView.ts` `loadBillingView` / `toCustomerInvoices` | Reads `billing_invoices` | UNCHANGED (optionally select `payment_model`) |

## 8. Admin

| File / function | Today | Class |
|---|---|---|
| `admin/service.ts` `adminSyncPlanToStripe` | `ensureProductAndPrice`, then `checkPrice` | CODE CHANGE LIKELY: pass and verify the product tax code. Audit the tax code |
| `admin/service.ts` `adminSetPaidCheckout` | Technical prerequisites (Stripe configured, price synced, no drift). Legal/tax are a manual checklist | CODE CHANGE LIKELY: when the model is MoR, also refuse if the tax code is missing or mismatched, or if `STRIPE_AUTOMATIC_TAX=true` (conflict). Optionally refuse if any `discounts` coupon is active and MoR forbids coupons (UNKNOWN) |
| new `adminSetPaymentModel` (does not exist) | n/a | CODE CHANGE LIKELY: step-up MFA, audited, and refused while `paid_checkout_enabled` is true or while any checkout is open, so a switch never happens mid-funnel |
| `admin/service.ts` `adminCreateCoupon` / `adminUpdateCoupon` / `adminSyncCouponToStripe` | Create Stripe coupons per mode | UNKNOWN-UNTIL-STRIPE-CONFIRMS |
| `app/(site)/admin/billing/settings/page.tsx` | Flag state, gate list (`stGateLegal`, `stGateTax`, `stGateStripe`, `stGateDpa`), plan sync | CODE CHANGE LIKELY: show the current payment model and the tax code. The gate list differs per model (`stGateTax` becomes "Managed Payments enabled; product tax code eligible") in 7 `admin.*.ts` dictionaries |
| `app/(site)/admin/billing/payments/page.tsx`, `admin/ui/labels.ts` `invoiceAmountLines` / `payAmountsHelp` | Total / due / paid / refunded / net. "Invoice total is what Stripe billed after discounts and tax" | CODE CHANGE LIKELY (small): add a payment-model column. "Paid" is what the customer paid, not what InnerDweS receives. Under MoR the payout is net of the MoR fee and remitted tax, and **no payout or fee reporting exists in the code under either model** |
| `admin/metrics.ts` | MRR from `base_amount_minor` / `current_effective_amount_minor` (pre-tax list prices) | UNCHANGED (definition stays). Net revenue after MoR fees is not modelled. That would be a new feature |
| `admin/queries.ts` `loadOverview` | Reads `billing_settings.paid_checkout_enabled` | CODE CHANGE LIKELY: also read `payment_model` |
| `app/(site)/admin/billing/subscriptions/[id]/page.tsx` | Subscription detail, "Expected charge (before tax)" | CODE CHANGE LIKELY (small): show the per-subscription model. Before-tax wording is UNKNOWN |

## 9. Making the MoR decision explicit and auditable: one setting, threaded

### 9.1 Recommended source of truth

Use **`billing_settings.payment_model text not null default 'standard' check (payment_model in ('standard','managed_payments'))`**
rather than (or in addition to) an env var such as `PAYMENT_MODEL`. Reasons:

- It sits next to `paid_checkout_enabled`, which already follows the pattern of being server-only, step-up gated and audited (`admin_audit_log`).
- It can be shown in Admin and is identical for every server instance. An env var differs per Vercel environment and leaves no audit trail.
- If an env var is still wanted as a deployment guard (e.g. `PAYMENT_MODEL_ALLOWED=managed_payments`), checkout must
  fail closed when the two disagree, as `stripeModeFromSecretKey` does for mode.

The model is **snapshotted per checkout** and never re-read later, so existing standard subscriptions keep renewing,
emailing and showing documents under the model they were sold under. A mixed fleet is expected after a switch, unless Stripe
can migrate subscriptions (UNKNOWN).

### 9.2 DB columns (new migration, 0047 or later; additive)

| Table | Column | Written by | Purpose |
|---|---|---|---|
| `billing_settings` | `payment_model` (+ reuse `updated_by` / `updated_at`) | `adminSetPaymentModel` | Current model for **new** checkouts |
| `pending_space_checkouts` | `payment_model text not null` (default `'standard'` for existing rows) | `store.createPendingCheckout` (from `startCheckout` / `ensureOpenCheckout`) | Immutable snapshot. Provisioning compares it with the session |
| `space_subscriptions` | `payment_model text` (null for `exempt`; CHECK: not null when `status <> 'exempt'`) | `billing_provision_paid_space` from `pending_space_checkouts.payment_model` (do **not** trust `p_sub` for it) | Per-subscription model for email gating, Admin and reports |
| `billing_invoices` | `payment_model text` | `billing_upsert_invoice`, derived from the linked `space_subscriptions` row when mapped (unmapped early invoices get it on the provisioning re-run, which already happens) | Which document issuer and wording applies to this invoice |
| `billing_acceptances` | `payment_model text not null`, optionally `seller_of_record text` | `saveAcceptance` | Evidence of WHICH legal set (InnerDweS terms vs Stripe-reseller terms) the buyer accepted |
| `billing_plans` (optional) | `stripe_tax_code text` | Admin plan sync | Expected product tax code for the MoR drift guard |

Functions to change in SQL: `billing_provision_paid_space` (0038; copy the model to `space_subscriptions`),
`billing_upsert_invoice` (0040; derive the model), and possibly `billing_acceptances_consent_required` (section 6).
Rollback files under `app/supabase/verification/` and `rehearse-billing-rollback.sh` must gain the 0047 step, following the existing chain.

### 9.3 Exact functions the setting must be threaded through

| # | Function (file) | Change |
|---|---|---|
| 1 | `BillingStore.paymentModel()` (new) / `createSupabaseBillingStore` (`store.ts`) | Read `billing_settings.payment_model`. A read error counts as `standard` **and blocks paid checkout** (fail closed: do not silently sell under the wrong model) |
| 2 | `BillingStore.createPendingCheckout` (`store.ts`), `ensureOpenCheckout` (`checkout.ts`) | Write the snapshot. Reuse an open checkout only if the model matches |
| 3 | `startCheckout` (`checkout.ts`) | Pass `paymentModel` to the gateway. Add to `attemptKey` and `metadata.payment_model`. Session reuse must match the model. Write it to `saveAcceptance`. Pick `LEGAL_VERSIONS[model]` |
| 4 | `StripeGateway.createCheckoutSession` (`gateway.ts`), `createStripeGateway().createCheckoutSession` (`real.ts`), `FakeStripe.createCheckoutSession` (`testing/fakeGateway.ts`) | Set the MoR flag. Omit `automatic_tax` (and anything else forbidden) under MoR. The fake records the args so tests can assert them |
| 5 | `getBillingDeps` (`deps.server.ts`), `BillingDeps.automaticTax` (`deps.ts`) | Under MoR `automaticTax` is ignored, or its conflict is reported |
| 6 | `checkPrice` / `ensureProductAndPrice` (`gateway.ts`, `real.ts`, fake), `assertPriceMatches` (`checkout.ts`), `adminSyncPlanToStripe`, `adminSetPaidCheckout` (`admin/service.ts`) | Product tax code (required under MoR) |
| 7 | `mapCheckoutSession` (`mappers.ts`), `CheckoutSessionDTO` | Expose the session's MoR indicator |
| 8 | `provisionFromVerifiedSession`, `toProvisionInput` (`provisioning.ts`) | Verify session model == `pending.paymentModel` (`metadata_mismatch`). The SQL copies the model from pending |
| 9 | `processInvoice` (`sync.ts`), `enqueuePaymentConfirmation`, `enqueueSimpleNotice` (`emails/enqueue.ts`) | Read the subscription's model. Choose the confirmation payload or variant. Suppress `payment_failed` if Stripe sends dunning (UNKNOWN) |
| 10 | `renderBillingEmail` (`emails/render.ts`), `billing.{en,de,es,fr,he,tr,it}.ts` | Model-aware `emailOfficialDocument` and invoice-row wording ("issued by Stripe") |
| 11 | `create/[type]/page.tsx` labels, `checkout-form.tsx` | Model-aware `termsLine`, consents and `taxNote`. Hide coupons if forbidden |
| 12 | `billingPageModel.ts`, `billing-sections.tsx`, `customerView.ts` | Optional "issued by" wording per invoice `payment_model` |
| 13 | `admin/queries.ts` `loadOverview`, `admin/billing/settings/page.tsx`, new `adminSetPaymentModel` + its form/action in `admin/billing/actions.ts`, `admin/policy.ts` (step-up list) | Display and audited change. Per-model gate list |
| 14 | `admin/billing/payments/page.tsx`, `subscriptions/[id]/page.tsx`, `admin/ui/labels.ts` | Model column and wording |
| 15 | `testing/harness.ts`, `integration/journeys.int.test.ts`, `scripts/customer-funnel-qa.int.test.ts` | Deps or fake-store default `standard`. Add MoR journeys |
| 16 | Docs: `TAX.md`, `EMAILS-INVOICES.md`, `STRIPE-MAPPING.md`, `LAUNCH-GATES.md`, `ENVIRONMENT.md`, `ARCHITECTURE.md`, `COUPONS.md` | Per-model sections. Launch gate "Stripe customer emails OFF" inverted under MoR |

## 10. Launch gates and docs affected

- `LAUNCH-GATES.md`: legal gates "contracting operator", "invoice issuer" and "tax registration" change owner under MoR (Stripe). The
  operational gate "Stripe Dashboard: invoice and receipt emails OFF" and live-key step 8 become wrong under MoR. Live-key
  step 2 ("Decide automatic tax ...") is replaced by "enable Managed Payments and set an eligible product tax code".
- `ENVIRONMENT.md`: `STRIPE_AUTOMATIC_TAX` is documented as the tax switch. It needs an "ignored / conflict under MoR" note. Add `PAYMENT_MODEL*` only if the env guard is chosen.
- `STRIPE-MAPPING.md`: "Invoice ... Stripe is the issuer of the document" is already worded neutrally. The coupon row, the portal row and the refund row become UNKNOWN under MoR.
- `COUPONS.md`: the whole Stripe-sync section depends on coupons being allowed under MoR.

## 11. Tests

### 11.1 Existing tests covering these areas

| Test file | Covers | Affected by MoR? |
|---|---|---|
| `src/lib/billing/stripe/stripe.test.ts` | Mode from key, webhook signature, refund event reduction, `mapSubscription` / `mapInvoice` / `mapCheckoutSession` | Extend the mapper tests (session MoR flag, invoice tax under MoR once fixtures are known) |
| `src/lib/billing/checkout.test.ts` | Flag off refusal, consents, trusted plan, price drift, acceptance evidence, metadata minimality, customer reuse, second-tab reuse, coupons and coupon drift | Extend (model snapshot, reuse by model, `metadata.payment_model`, acceptance model) |
| `src/lib/billing/provisioning.test.ts` | Verified-session provisioning, mismatches, idempotency, first invoice | Extend (model mismatch → `metadata_mismatch`; model copied to subscription) |
| `src/lib/billing/webhook.test.ts` | Intake, duplicates, 409/500, mismatch acknowledgement, expiry | Mostly unchanged |
| `src/lib/billing/payments.test.ts` | Confirmation email, renewals, discounts, recovery, failure notice, void, refunds (partial/out of order/failed) | Extend (per-model email gating, refunds on MoR invoices) |
| `src/lib/billing/emails/emailModel.test.ts` | Exact outbox rows, retired templates, variant precedence, dedupe keys | Extend (MoR rows) |
| `src/lib/billing/emails/render.test.ts` | Includes **"tells the customer the official document is the linked page and that there is no second provider receipt"** | **Would fail or need a split** under MoR copy |
| `src/lib/billing/invoiceHistory.test.ts`, `admin/ui/invoiceAmounts.test.ts` | Customer / Admin amount presentation | Unchanged logic. Add model-column cases if added |
| `src/lib/billing/admin/admin.test.ts` | Step-up policy (launch flag, plan sync), coupon validation, `couponMatchesStripe`, metrics | Extend (step-up for `adminSetPaymentModel`) |
| `src/lib/billing/checkoutView.test.ts`, `paidDialogCopy.test.ts`, `admin/ui/adminDictionary.test.ts`, `admin/ui/labels.test.ts` | Locale parity of funnel/admin copy | Will enforce parity for any new MoR keys in 7 locales |
| `src/lib/billing/integration/journeys.int.test.ts`, `scripts/customer-funnel-qa.int.test.ts` | End-to-end journeys with fakes (`automaticTax: false`) | Add an MoR journey |
| `scripts/billing-db-verify.mjs` (Staging DB checks), `app/supabase/verification/*rollback*.sql` + `rehearse-billing-rollback.sh` | SQL-level verification and rollback chain | Add 0047 column/constraint checks and a rollback step |

Gap today, under both models: **no test asserts the actual `stripe.checkout.sessions.create` params** in `real.ts`
(`automatic_tax`, `billing_address_collection`, `discounts`, `allow_promotion_codes`), and `FakeStripe.createCheckoutSession`
does not record `automaticTax`. A param-level test with a mocked Stripe client is the most valuable new test, because it
pins the standard model before the MoR branch is added.

### 11.2 New tests needed

1. `real.ts` param snapshot (mock `stripe.checkout.sessions.create`): standard → `automatic_tax.enabled` follows env and there is no MoR flag; MoR → the MoR flag is set, `automatic_tax` is absent, and forbidden params are absent.
2. `startCheckout` snapshots `billing_settings.payment_model` onto the pending checkout and the acceptance. A model change between preview and start expires the old pending checkout or session and creates a new one (no reuse across models). `attemptKey` differs per model.
3. A model read failure means paid checkout is refused (fail closed), not "standard".
4. `STRIPE_AUTOMATIC_TAX=true` with MoR → `startCheckout` and `adminSetPaidCheckout` refuse with a config-conflict code (if that policy is chosen).
5. `provisionFromVerifiedSession` rejects a session whose MoR indicator or `metadata.payment_model` disagrees with the pending row. The subscription row gets the model from the pending row, not from Stripe metadata.
6. `checkPrice` / `adminSyncPlanToStripe` under MoR: a missing or wrong product tax code is drift and refuses the sale.
7. Email model: an MoR subscription's paid invoice → the confirmation row uses the MoR variant/payload (or no row, per decision). `payment_failed` is suppressed if Stripe dunning applies. A standard subscription in the same store is unchanged (mixed fleet).
8. Render: the MoR `emailOfficialDocument` never claims "no separate receipt from our payment provider". The standard copy keeps today's claim. Locale parity for new keys.
9. Admin: `adminSetPaymentModel` requires step-up, is audited, and is refused while paid checkout is on or checkouts are open.
10. SQL (Staging verify plus local rehearsal): `space_subscriptions.payment_model` not null for non-exempt rows. `billing_invoices.payment_model` filled after mapping. Rollback restores 0046 state.
11. Coupons (only if Stripe confirms they are restricted under MoR): `previewCheckout` / `startCheckout` refuse coupons with a mapped reason, and the Admin coupon sync explains why.

## 12. Summary by class

| Class | Components |
|---|---|
| UNCHANGED | `mode.ts`, `verifyWebhook`, `reconcile.ts`, `lifecycleJob.ts`, `syncSubscription` state machine, `webhook.ts` core routing, idempotency keys (except the checkout `attemptKey`), `outbox.ts` / `resend.ts`, access/lifecycle (`access.ts`, 0038 `space_access_state`), metrics definitions, `quote.ts` math, success-page polling |
| CONFIG-ONLY | Stripe Dashboard: Managed Payments enablement, the receipt-email setting (inverted vs today's gate), webhook event subscription additions. `STRIPE_AUTOMATIC_TAX` unset under MoR. Invoice "view" link wording |
| CODE CHANGE LIKELY | `real.ts` `createCheckoutSession` (MoR flag, drop `automatic_tax`), `ensureProductAndPrice` / `checkPrice` (tax code), `gateway.ts` types, `mappers.ts` `mapCheckoutSession`, `checkout.ts` (`startCheckout`, `ensureOpenCheckout`, `attemptKey`, acceptance), `provisioning.ts` (model check), `deps*.ts` (tax toggle semantics), `sync.ts` / `emails/enqueue.ts` / `emails/render.ts` + 7 `billing.*.ts` dictionaries (`emailOfficialDocument` is false under MoR), `legal.ts` versions per model, Admin settings / plan sync / paid-checkout toggle / new model toggle / payments column, new migration (0047+) columns, docs (TAX, EMAILS-INVOICES, LAUNCH-GATES, ENVIRONMENT, STRIPE-MAPPING, ARCHITECTURE) |
| UNKNOWN-UNTIL-STRIPE-CONFIRMS | Coupons/`discounts` on MoR sessions; Customer Portal (`openBillingPortalAction`: the payment-method update and failure-recovery path); `setCancelAtPeriodEnd` from our UI; pre-created `customer` reuse; required `billing_address_collection` / `customer_update` / `tax_id_collection` / `consent_collection`; invoice object shape (`in_` ids enforced by the 0040 CHECK, `total_taxes`, hosted/PDF/receipt URLs, invoice number issuer); refund and dispute flows and events; Stripe dunning emails vs our `payment_failed`; tax-inclusive presentation vs our "before tax" labels; withdrawal-right consent ownership and the 0036 `billing_acceptances_consent_required` CHECK; checkout/portal host for `isStripeHostedUrl`; migration of existing standard subscriptions; fee and payout reporting (not modelled at all today) |
