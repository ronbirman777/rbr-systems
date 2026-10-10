# Stripe Managed Payments: InnerDweS compatibility review (v2)

- **Date:** 2026-10-10
- **Status:** Research and documentation only. No app code, database, Vercel or Stripe setting was changed. No Stripe account was accessed. No secret is recorded here.
- **Supersedes:** where it disagrees, this file replaces `STRIPE-MANAGED-PAYMENTS-RESEARCH.md` (v1) and the "UNKNOWN-UNTIL-STRIPE-CONFIRMS" hypotheses in `MANAGED-PAYMENTS-CODE-IMPACT.md`. Corrections are listed in section 9.
- **Method:** Every Stripe statement was re-fetched on 2026-10-10 from docs.stripe.com, support.stripe.com, stripe.com/legal and stripe.com/en-sg/pricing. The Managed Payments Terms were downloaded and searched as full text. Quotes are 15 words or fewer. A capability counts as supported only if a Managed Payments (MP) page, the MP Terms or the MP changelog says so. General Stripe Billing/Checkout support is never counted as MP support.
- **Code facts** come from the working tree on branch `feat/032-commercial-platform-foundation` (HEAD `1fbd5c1`, with uncommitted audio-provenance edits that don't touch Stripe code). They are marked *(observed in code)*.

Legend: **SUPPORTED** / **SUPPORTED WITH CHANGES** (works, but our integration or operations must change) / **UNVERIFIED** (official docs don't say) / **UNSUPPORTED**.

### Facts reported by the owner (not verified by me)

- A Stripe **sandbox** exists. Account country: **Singapore**. MP is being evaluated.
- Product "InnerDweS Space Subscription", `prod_VPlfieVxXI41Pw`.
- Price `price_1UOw85HruEyzzzcj7xgzM5Fy`: USD 25.00, monthly, `tax_behavior=exclusive`.
- Product tax category "SaaS — business use", which is `txcd_10103001` in the eligible-code table.
- The product shows MP status **"Eligible"**.

---

## 1. Eligibility findings

### 1.1 Singapore account
SG is a supported MP business location: the Asia Pacific list is AU, HK, JP, SG (https://docs.stripe.com/payments/managed-payments/eligibility).

Being in a listed country is necessary but not enough:
- "Stripe determines access to Managed Payments based on an eligibility review" (same page).
- You must activate MP and accept the MP Terms in the Dashboard. The guide says "You must accept the Managed Payments terms of service" (https://docs.stripe.com/payments/managed-payments/set-up).
- Connect platforms, Express accounts and platform-controlled accounts are excluded.

### 1.2 Individual vs company
- **MP docs don't mention individuals or sole proprietors.** They only say the review considers "factors such as business type and geography".
- Stripe Financial Services Terms §2.1: "User must be a business (including sole proprietor)" (https://stripe.com/legal/ssa-service-terms). So a sole proprietor is a permitted Stripe user in general. Whether an unregistered individual passes the **MP** review is **UNVERIFIED**.
- Singapore onboarding recognises Individual accounts. The 2026 SG verification update applies to "most non-individual Singapore accounts, including sole proprietorships". Individual accounts are excluded from the new requirements (https://support.stripe.com/questions/2026-updates-to-singapore-verification-requirements; https://support.stripe.com/questions/verification-requirements-for-stripe-accounts-in-singapore).
- Neither page says whether an individual without an ACRA registration/UEN can use MP.

### 1.3 Residency and business registration
- Financial Services Terms §2.1: the user "must be located in the same country where Stripe is providing the Services" (https://stripe.com/legal/ssa-service-terms).
- MP: "Your business must be based in one of the supported business locations" (eligibility page).
- **Consequence:** the SG account must belong to a business (or sole proprietor) that is actually located in Singapore. A non-SG-resident owner using an SG account is not covered by any doc and needs Stripe confirmation.
- Registration: the SG verification article lists ACRA BizFile for "locally incorporated businesses". The 2026 update makes Business Registered Address match ACRA records for non-individual accounts.

### 1.4 Sandbox availability
MP works in sandboxes, with documented limits:
- "In sandbox mode, you won't receive receipt emails automatically after purchase" (set-up page).
- "Test purchases won't appear in the Link app." So Link order management can only be tested in live mode.
- Sandbox webhook retries: "three times over the course of a few hours" (https://docs.stripe.com/webhooks).
- **Sandbox MP use is not evidence of live-account approval.** Nothing in the docs ties the two together.

### 1.5 What the product status "Eligible" means
- The docs describe only the **tax-code label**: "Eligible tax codes are labeled `Eligible for Managed Payments`" (set-up and update-checkout pages).
- "Eligible" therefore means the product's tax code is on the eligible list. It does **not** mean the account passed the review, and it does not prove the product meets the substantive rules:
  - "You sell a fully automated digital product".
  - The unsupported categories, which include "Live in-person events" and professional services.
- Stripe can later decide otherwise: "If Stripe determines that your product is ineligible", you must stop using MP for it (eligibility page). The Terms add that SMP "may ... offboard the ineligible products".
- **Risk for InnerDweS:** the Space is software for retreat hosts and teachers. Stripe must accept that the subscription sells software and not the retreats or coaching.

### 1.6 The "SaaS — business use" tax code (`txcd_10103001`)
- **It doesn't change who the merchant of record is.** No MP page links the tax code to MoR status.
- The business/personal distinction is "relevant only if you have sales in the US". That note appears on every eligible SaaS code (eligibility page).
- Stripe's guidance: "You may choose a business use PTC if your product is exclusively for business use". If a "serious hobbyist" might use it personally, a personal-use code may fit better (https://support.stripe.com/questions/selecting-the-right-product-tax-code-for-managed-payments). This is a **tax-advisor decision**. Some hosts may be hobbyists, and the code changes US taxability.
- **Singapore domestic B2B exception:** MP handles domestic sales "except Singapore (B2B domestic transactions specifically)". "For Singapore, a transaction is considered a B2B sale if the customer indicates" so at checkout (https://docs.stripe.com/payments/managed-payments/tax-compliance).
  - B2B status comes from the **buyer's declaration at checkout, not from the product tax code**.
  - For those sales the seller is "responsible for calculating, collecting, filing, and remitting".
  - SMP still issues the invoice, "on behalf of Seller in Seller's name" (MP Terms §4.1(b), https://stripe.com/legal/managed-payments).
- **Reverse charge:** no MP page documents B2B reverse-charge treatment, for example for EU VAT-registered buyers. `tax_id_collection` is a parameter you **must remove** under MP (update-checkout page). Whether MP collects buyer tax IDs itself and applies reverse charge is **UNVERIFIED**.

---

## 2. 40-item compatibility matrix (Managed Payments)

| # | Item | Status | Finding (InnerDweS impact) | Evidence (quote ≤15 words) and URL |
|---|---|---|---|---|
| 1 | SG account eligibility | SUPPORTED WITH CHANGES | SG is listed, but access is decided by a review. You must activate MP and accept its Terms. | "Your business must be based in one of the supported business locations." https://docs.stripe.com/payments/managed-payments/eligibility |
| 2 | Individual eligibility | UNVERIFIED | MP docs are silent. General Stripe terms allow sole proprietors. Ask Stripe whether an individual SG account (no UEN) can be approved for MP. | "User must be a business (including sole proprietor)" https://stripe.com/legal/ssa-service-terms ; "eligibility review that considers factors such as business type and geography" (eligibility page) |
| 3 | Residency / registration | SUPPORTED WITH CHANGES | The seller must be located in SG. Non-individual accounts need ACRA-consistent data. | "must be located in the same country where Stripe is providing the Services" https://stripe.com/legal/ssa-service-terms ; https://support.stripe.com/questions/2026-updates-to-singapore-verification-requirements |
| 4 | Sandbox / test | SUPPORTED WITH CHANGES | Works with test cards. No automatic receipts, and Link doesn't show test purchases. Test clocks with MP are **not documented**. | "In sandbox mode, you won't receive receipt emails automatically after purchase" https://docs.stripe.com/payments/managed-payments/set-up |
| 5 | Checkout | SUPPORTED WITH CHANGES | Hosted or embedded Checkout only. Set `managed_payments[enabled]=true`, remove the unsupported parameters (see 6.5), no custom domain. | "some parameters aren't available when using Managed Payments" https://docs.stripe.com/payments/managed-payments/update-checkout ; "Custom domains aren't supported on Managed Payments checkouts." https://docs.stripe.com/payments/managed-payments/how-it-works |
| 6 | Subscription-mode Sessions | SUPPORTED | `mode=subscription` is documented with the MP flag. Subscriptions can't be created outside Checkout or Payment Links. | "To create a Checkout Session for your subscription, set the mode to subscription." (set-up) ; unsupported: "Creating a subscription outside of Checkout or Payment Links" https://docs.stripe.com/payments/managed-payments |
| 7 | $25 monthly recurring | SUPPORTED | A recurring monthly USD price on a product with an eligible tax code is the documented pattern. Customers may see a converted local amount (item 38). | "For subscriptions, prices also represent how frequently you charge your customer." ; "You must use a tax code that's eligible for Managed Payments" (set-up) |
| 8 | Tax-exclusive price under MP | SUPPORTED | MP **allows and respects** `tax_behavior=exclusive`, and doesn't require it. Unset behaves like exclusive by default. Tax is added on top, based on the billing address entered at checkout. The exact on-page tax line layout isn't described (see 3). | "Managed Payments uses the tax behavior specified on your price." ; "If you don't specify the price's tax behavior, Managed Payments adds tax on top" (set-up, update-checkout) |
| 9 | MoR behaviour | SUPPORTED WITH CHANGES | SMP ("Sold through Link, LLC") is MoR. The customer sees Link. Statement shows `LINK.COM* [descriptor]`. Nuance in the Terms: SMP is MoR but "not the seller of record" and doesn't book the revenue. It acts as undisclosed agent. | "SMP is the merchant of record for Transactions using the Stripe Managed Payments Service." ; "User agrees that SMP is not the seller of record" https://stripe.com/legal/managed-payments ; "The customer sees Link as the merchant of record" (how-it-works) |
| 10 | Renewals | SUPPORTED WITH CHANGES | Renewals run through Billing. Stripe always sends an anniversary renewal reminder (6 and 12 months for AU/UK customers, 12 months elsewhere). The customer authorizes only MP to charge. | "it only authorizes Managed Payments to charge their payment method" (set-up) ; https://docs.stripe.com/payments/managed-payments/how-it-works |
| 11 | Coupons / promotion codes | UNVERIFIED | No MP page mentions coupons, `discounts` or `allow_promotion_codes`. Neither is on the "remove" list. We send `discounts:[{coupon}]` and `allow_promotion_codes:false` *(observed in code)*. Test this in the sandbox and get written confirmation from Stripe. | Removal list has no discounts: https://docs.stripe.com/payments/managed-payments/update-checkout ; general rule only: "Checkout Sessions currently support up to one coupon or promotion code." https://docs.stripe.com/payments/checkout/discounts |
| 12 | Once-per-user | UNVERIFIED (blocked only by #11) | Stripe-native: a coupon **can't** be restricted per customer. Promotion codes support `customer` and `restrictions.first_time_transaction`, but MP support for them isn't documented, and "first-time" counts *any* prior payment on the account, which is the wrong semantics for us. **Our own engine already enforces this** (`usage_rule='once_per_user'` in 0037, server-side reservation) *(observed in code)*. Keep our engine and use Stripe only to apply the discount. | Coupon table: "Restrict to a specific customer ❌ Unsupported" ; "customers who have no prior transaction history" https://docs.stripe.com/billing/subscriptions/coupons |
| 13 | Once-per-Space | UNVERIFIED (blocked only by #11) | Stripe has no Space concept. Enforced only by our engine (0037 `usage_rule`) *(observed in code)*. | n/a (our feature); dependency is #11 |
| 14 | Unlimited during validity | UNVERIFIED (blocked only by #11) | Our Stripe coupons are created **without** `max_redemptions`/`redeem_by` *(observed in `real.ts` `createCoupon`)*, so Stripe imposes no cap. The validity window is ours (`valid_until`, checked when the reservation is made). | "max_redemptions ... Maximum number of times a coupon can be redeemed across all customers." (coupons page) |
| 15 | Multi-cycle (`duration=repeating`) | UNVERIFIED | Billing semantics are documented in general. MP docs don't confirm that discount durations behave the same on MP subscriptions, or how tax applies to the discounted base. | "Set duration=repeating with duration_in_months to apply a discount for multiple months" https://docs.stripe.com/billing/subscriptions/coupons |
| 16 | Forever | UNVERIFIED | Same as 15. | "duration=forever to apply it to all invoices indefinitely" (coupons page) |
| 17 | Coupon expiration (`redeem_by`) | UNVERIFIED (not used by us) | `redeem_by` only limits when the coupon can be applied. We don't set it, because our `valid_until` gates new reservations. MP is silent. | "The latest date at which you can apply this coupon to customers." (coupons page) |
| 18 | Customer Portal | SUPPORTED | Explicitly allowed alongside Link order management. The portal lists MP under interoperability. | "You can also offer additional subscription management from your own website using the Customer Portal" (how-it-works) ; https://docs.stripe.com/customer-management |
| 19 | Cancel at period end | SUPPORTED WITH CHANGES | Our API update (`subscriptions.update cancel_at_period_end`) is covered by "update subscriptions ... with the API". **Customers can also cancel on link.com**, outside our UI. Link's cancel timing (immediate vs period end) isn't documented. Our webhook sync must treat it as normal. | "You can issue refunds and update subscriptions in the Dashboard or with the API." ; Link: "Cancel or update subscriptions" (how-it-works) |
| 20 | Payment-method updates | SUPPORTED WITH CHANGES | We can't set `subscription.default_payment_method` through the API. The Customer Portal and Link can. Our code never sets it *(observed in code)*, so our portal-based flow is compatible. | "you can't update `subscription.default_payment_method` directly through the API" ; "Customers can update this field through the Customer Portal." (how-it-works) |
| 21 | Failed-payment retries | UNVERIFIED | Smart Retries, custom schedules and the "mark unpaid after final retry" setting are **not documented for MP**. Documented for MP: failed-payment emails stay configurable, and Pay Invoice works (2026-10-05). | "You can control emails for upcoming renewals, expired cards, and failed payments" (how-it-works) ; https://docs.stripe.com/payments/managed-payments/changelog |
| 22 | Subscription lifecycle webhooks | UNVERIFIED | MP docs list only the Checkout events. The `managed_payments` field was added to Checkout.Session, PaymentIntent, SetupIntent, Subscription and PaymentLink, **not Invoice**. The installed SDK v23 also has no Invoice field *(observed in `node_modules/stripe`)*. `customer.subscription.*` and `invoice.*` events for MP subscriptions aren't enumerated anywhere, though MP creates Subscription and Invoice objects (set-up "Payment details"). | Events table: checkout.session.completed / async_payment_succeeded / async_payment_failed (set-up) ; https://docs.stripe.com/changelog/dahlia/2026-04-22/managed-payments |
| 23 | First-payment provisioning | SUPPORTED | Our design (provision from a verified `checkout.session.completed` / `async_payment_succeeded`, with success-page polling only as UX) is what MP prescribes. | "Avoid only using your success page to trigger post-checkout actions." (set-up) |
| 24 | Webhook idempotency | SUPPORTED (our side) | The rules are platform-wide and MP adds no exception: duplicates possible, no ordering guarantee. We dedupe on event id and re-fetch state *(observed in `webhook.ts`)*. Note that Stripe can emit "two separate Event objects" for one change, which our fetch-on-event design already tolerates. | "Webhook endpoints might occasionally receive the same event more than once." https://docs.stripe.com/webhooks |
| 25 | Subscription recovery | SUPPORTED WITH CHANGES | Portal payment-method update, hosted invoice URL (since 2026-02-09) and the Pay Invoice endpoint (since 2026-10-05) are documented. Automatic retry behaviour is UNVERIFIED (#21). | "You can now use the Pay Invoice endpoint ... on a Managed Payments invoice." (changelog, paraphrase of 2026-10-05 entry) |
| 26 | Refunds | SUPPORTED WITH CHANGES | We can refund. **SMP may refund within 60 days regardless of our policy**, or after 48h of no reply. In some jurisdictions the withheld tax is not returned to us. Our `charge.refunded` / `charge.refund.updated` mirror applies, assuming the same events fire for Stripe-initiated refunds (UNVERIFIED). | "SMP reserves the right to issue refunds within 60 days" https://stripe.com/legal/managed-payments ; "If you don't respond within 48 hours, Stripe might issue a refund" (how-it-works) |
| 27 | Disputes | SUPPORTED WITH CHANGES | Stripe handles disputes and may accept instead of countering. The dispute received fee (S$15.00) is still charged. Our code ignores dispute events *(observed in code)*. Dispute events for MP aren't enumerated. | "Stripe handles disputes for you." (how-it-works) ; "$15.00 for each dispute you receive" https://stripe.com/en-sg/pricing |
| 28 | Invoice generation | SUPPORTED WITH CHANGES | Subscription invoices are created. `invoice_creation` and `subscription_data.invoice_settings` must be removed. No one-off invoices outside the billing period, and no customer-level pending invoice items. | "Managed Payments handles post-sale actions, such as invoicing and confirmation emails." (update-checkout) ; https://docs.stripe.com/payments/managed-payments |
| 29 | Receipt generation | SUPPORTED (forced) | Stripe always sends receipts and invoices from Link, with PDFs. Dashboard receipt settings have no effect. | "Stripe always sends receipts, invoices, and any refund or credit note notifications" (how-it-works) |
| 30 | Official invoice issuer | SUPPORTED WITH CHANGES | **"Sold through Link"** in covered jurisdictions. Where SMP isn't responsible for tax (SG domestic B2B, uncovered countries), SMP issues the invoice in **our** name using our Dashboard Invoice settings. We must not issue a competing official invoice (see 3.3). | "Invoices are now issued by Sold through Link" (changelog 2026-04-22) ; "SMP will communicate with and invoice the customer in SMP's own name" (MP Terms §4.1(e)) |
| 31 | Tax collection / remittance | SUPPORTED WITH CHANGES | Calculated, collected, filed and remitted in 80+ countries, including cross-border SG buyers. Exceptions: SG domestic B2B, Japan domestic, uncovered countries (Stripe Tax is free there). Only Stripe Tax is compatible. Income tax stays ours. | "except Singapore (B2B domestic transactions specifically)" ; "Stripe Tax is the only tax solution that's compatible with Managed Payments." https://docs.stripe.com/payments/managed-payments/tax-compliance |
| 32 | Customer billing history | SUPPORTED WITH CHANGES | `hosted_invoice_url` is returned (2026-02-09). Customers also see orders on Link, and the portal can show invoices. Whether `invoice_pdf` is populated on the API object is not stated. Our UI links `hosted_invoice_url` first *(observed in code)*. | "Managed Payments invoices return the hosted_invoice_url" (changelog 2026-02-09) |
| 33 | Admin payment visibility | SUPPORTED WITH CHANGES | Dashboard transactions can be filtered by type. The report `fee` column includes withheld tax unless you use `fee_net_of_withheld_tax`. Sigma has `managed_payments_enabled`. Our Admin ledger has no payout or fee model *(observed in code)*. | "the fee column ... includes both Stripe fees and withheld tax" (how-it-works) |
| 34 | Our Resend confirmation emails | UNVERIFIED (no prohibition found) | No MP doc or Terms clause forbids our own service emails. The Terms forbid issuing **our own invoices to SMP** (self-billing), not emails to customers. Our current `payment_confirmation` copy says there is no provider receipt, which becomes **false** under MP (see 6.9). | "User must not issue its own invoices to SMP or its Affiliates" (MP Terms §4.5) ; receipts by SMP are "binding on User" (MP Terms) |
| 35 | Forced Stripe customer emails | SUPPORTED (documented) | Forced: receipts, invoices, refund/credit-note notices, trial start/ending, anniversary renewal reminder. Configurable: upcoming renewals, expired cards, failed payments. | "Your receipt settings in the Dashboard don't affect these emails." (how-it-works) |
| 36 | Settlement reports | SUPPORTED WITH CHANGES | Each month, within the first 10 days, three documents arrive: a Stripe fee invoice, an MP fee invoice and a self-billed (reverse) invoice. Proceeds are net of withheld tax. The account is treated as a Connected Account to SMP. MP-specific payout timing isn't documented. | "Stripe generates three documents within the first 10 days of the following month" https://support.stripe.com/questions/which-invoices-will-i-receive-for-managed-payments-transactions ; "treated as a Connected Account to SMP" (MP Terms §3.1) |
| 37 | Fees | SUPPORTED WITH CHANGES | SG: cards 3.4% + S$0.50, international +0.5%, conversion +2% "if required", Billing 0.7%, Tax 0.5%, **MP 3.5% on the tax-inclusive amount, on top of Payments fees**. Billing fees still apply. See section 5. | "3.5% per successful Managed Payments transaction in addition to Payments fees" https://stripe.com/en-sg/pricing ; "including any indirect taxes assessed on the transaction" https://support.stripe.com/questions/managed-payments-pricing |
| 38 | Currency conversion / Adaptive Pricing | SUPPORTED WITH CHANGES | Always on under MP, so `adaptive_pricing` must not be sent. The customer pays 2–4% when paying in local currency; we pay 0%. Adaptive Pricing requires the price currency to be one of the account's **settlement currencies**, so check that USD is a settlement currency on the SG account. Cross-border subscriptions: cards, Link, Apple Pay and Google Pay only. | "If Adaptive Pricing is enabled, Stripe does not charge a currency conversion fee." (MP pricing) ; "requires the currency for your prices to be one of your settlement currencies" https://docs.stripe.com/payments/currencies/localize-prices/adaptive-pricing |
| 39 | Migrating existing subscriptions | UNSUPPORTED (per docs) | Only new MP Checkout subscriptions qualify. The Terms contemplate moving existing subscriptions under SMP, but there's no documented self-serve path. This is moot if no standard subscriptions exist at launch. | "Existing subscriptions aren't eligible." (update-checkout) ; "If User elects to manage its existing Customer subscriptions" (MP Terms §3.2) |
| 40 | Switching back to standard | UNVERIFIED (obligations documented, process not) | If we stop using SMP for subscriptions, we must have our own right to charge and **notify customers** that SMP no longer charges them. The card authorization covers MP only, so new customer consent (most safely, a new standard Checkout) is likely needed. SMP may itself suspend or terminate MP use. There's no documented API to convert an MP subscription to standard. | "elects to stop managing Customer subscriptions ... through Stripe Managed Payments" (MP Terms §3.2) ; "only authorizes Managed Payments to charge" (set-up) |

---

## 3. Tax and invoices for "$25 before tax, added at checkout"

### 3.1 How MP computes and shows tax for a tax-exclusive price
1. The price `price_1UOw85…` is `tax_behavior=exclusive`. MP "uses the tax behavior specified on your price", so tax is **added on top of USD 25.00** (set-up, "Optional: Configure the tax behavior").
2. Tax is "based on product classification and customer location" (how-it-works). The customer enters a name and billing address. MP needs both and always writes them to the Customer (changelog 2025-08-22).
3. Thresholds can produce `taxability_reason: not_subject_to_tax` in covered countries (tax-compliance). Some buyers will see **no tax**, and "before tax" then equals the total.
4. With Adaptive Pricing, the customer may see the amount converted into local currency, including a 2–4% conversion fee they pay.
5. **Not documented:** the exact layout of the tax line on the MP Checkout page. The docs only say you can "enter different billing addresses to see how Managed Payments calculates tax". Verify the wording visually in the sandbox before keeping our "Any taxes are calculated and shown at secure checkout" / "Next charge (before tax)" copy *(observed in `billing.*.ts`)*. On current docs that copy is **consistent** with MP for an exclusive price.
6. On refunds, "the refund includes any sales tax the customer paid". In some jurisdictions Stripe keeps and remits the original tax, so our balance is reduced by that amount (how-it-works).

### 3.2 Who issues the official invoice
- **Covered sales:** the invoice is issued by **Sold through Link**, with our business name and product details (changelog 2026-04-22; MP Terms §4.1(e): SMP invoices "in SMP's own name").
- **SG domestic B2B and uncovered countries:** "These invoices use your business name and tax details, instead of Sold through Link, LLC". Stripe still sends them and they're configured in Dashboard → Invoice settings (tax-compliance). MP Terms §4.1(b) says these are issued "in Seller's name" and the seller is responsible for their legal adequacy.
- **Receipts:** always sent by Stripe from Link, with PDFs, and "binding on User" (MP Terms §2.2 area, receipt clause).

### 3.3 Consequences for InnerDweS
- InnerDweS must **not** issue its own official/tax invoice for MP transactions. Two documents for one sale, with different issuers, would contradict the undisclosed-agent model the Terms describe.
- Our ledger (`billing_invoices`) stays an internal mirror.
- Customer-facing wording should call the document "Invoice/receipt from Link (Sold through Link)", not "issued by Stripe" or "our invoice".
- The current email footnote `emailOfficialDocument` ("You won't receive a separate receipt email from our payment provider") would be **false** and must change before an MP launch *(observed in `billing.en.ts`; no change made here)*.
- **If InnerDweS is GST-registered in Singapore**, domestic B2B sales stay our GST responsibility, invoiced by SMP in our name. Our Dashboard Invoice settings (legal name, address, GST number) must then be accurate. Whether registration is required depends on Singapore thresholds that Stripe docs don't cover. This needs a tax advisor.

---

## 4. Coupons and subscriptions

### 4.1 One customer with several MP subscriptions
- **UNVERIFIED.** No MP page addresses it.
- What is documented:
  - Passing an existing `customer` is allowed, and "that object is updated with any changes to the customer's name or billing address" (update-checkout).
  - Link lists "order history" per order.
- **Inferred risk (not stated by Stripe):** each new Space checkout can overwrite the shared Customer's name and address. That could move the tax location used for the user's *other* subscriptions at renewal. Ask Stripe, and test in the sandbox with two Spaces and two addresses.
- A data-deletion request cancels **all** MP subscriptions of that customer. Our `customer.subscription.deleted` sync would move every one of that user's Spaces into the lifecycle (how-it-works, "Handle data deletion requests").

### 4.2 Discounts on MP sessions
- **UNVERIFIED** (#11). `discounts` and `allow_promotion_codes` aren't on the MP removal list. They aren't on any MP "supported" list either.
- The general one-discount-per-Session rule applies to Checkout; our code sends at most one coupon *(observed in code)*.
- MP docs say nothing on:
  - whether the amount after discount is the MP tax base;
  - whether `duration=once/repeating/forever` behaves as in Billing on MP subscriptions;
  - how a discount appears on Link receipts.

### 4.3 Recommendation
1. Keep our server-side coupon engine (once-per-user, once-per-Space, unlimited, validity window, global cap) as the only eligibility authority.
2. Use Stripe only to apply the discount, through `discounts[0][coupon]`.
3. Before any MP launch:
   - in the sandbox, create an MP Session with a `repeating` coupon and confirm that the API accepts it and the invoices show the discount for N cycles (a test clock can't be assumed; see #4);
   - get Stripe's written confirmation that coupons, and their duration semantics, are supported with MP.
4. If coupons turn out to be unsupported, the coupon UI must refuse under MP, as the CODE-IMPACT doc §11.2 item 11 describes.

---

## 5. Fees and settlement: worked example

### Assumptions (mine, not Stripe's)
- List price USD 25.00, tax-exclusive. Applicable indirect tax 9%, so tax is USD 2.25 and the customer total is **USD 27.25**. The 9% is illustrative; the actual rate depends on the buyer's location.
- International card, no dispute, no refund. The customer pays in USD (no Adaptive Pricing conversion).
- SG fee schedule (https://stripe.com/en-sg/pricing, SGD page): 3.4% + S$0.50, +0.5% international, Billing 0.7%, Tax 0.5%, MP 3.5%.
- **Assumed rate 1 USD = 1.30 SGD**, so S$0.50 ≈ USD 0.385. This rate is not from Stripe.
- Percentages are applied to the amount charged (27.25). MP 3.5% is documented on the tax-inclusive amount. The base for Billing 0.7% and Tax 0.5% isn't documented as tax-inclusive or exclusive, so the inclusive amount is used here; the difference is about USD 0.02.

### Model A: Standard Payments + Billing + Stripe Tax (seller registered and remitting 9%)

| Line | USD |
|---|---|
| Customer pays | 27.25 |
| Card 3.4% + intl 0.5% (3.9% × 27.25) | −1.063 |
| Fixed S$0.50 | −0.385 |
| Billing 0.7% | −0.191 |
| Stripe Tax 0.5% | −0.136 |
| Tax the **seller** must remit | −2.250 |
| **Net to InnerDweS** | **≈ 23.23** |
| If a 2% conversion applies (USD charge into an SGD-only balance) | −0.545 → ≈ 22.68 |

Without Stripe Tax and with no tax charged, the customer pays 25.00 and the net is ≈ 23.47. The seller still carries any tax liability that exists.

### Model B: Managed Payments

| Line | USD |
|---|---|
| Customer pays | 27.25 |
| Card 3.4% + intl 0.5% | −1.063 |
| Fixed S$0.50 | −0.385 |
| MP 3.5% × 27.25 (tax-inclusive, documented) | −0.954 |
| Billing 0.7% (MP pricing: Billing fees "apply separately") | −0.191 |
| Stripe Tax fee | 0 (MP covers it; Stripe Tax is free for uncovered MP transactions) |
| Tax **withheld and remitted by Stripe** | −2.250 |
| Currency conversion | 0 if Adaptive Pricing is enabled ("Stripe does not charge a currency conversion fee") |
| **Net to InnerDweS** | **≈ 22.41** |
| Report `fee` column for this charge (fees + withheld tax) | ≈ 4.84 |

### Reading the comparison
- **Cost against the USD 25 list price:** Model A ≈ USD 1.77 (7.1%), plus our own tax compliance work and registrations. Model B ≈ USD 2.59 (10.4%), with tax compliance included.
- The dispute received fee is S$15.00 under both models.
- **UNVERIFIED:**
  - whether the 0.5% international surcharge and the S$0.50 fixed fee apply unchanged to MP charges (MP pricing says "in addition to Payments fees");
  - whether the settlement leg (USD → SGD) is fee-free under MP when no USD settlement currency is configured;
  - whether the 3.5% MP fee is returned on refunds;
  - MP payout timing or reserves.
- Settlement documents: monthly Stripe fee invoice, MP fee invoice, and a self-billed invoice for gross proceeds minus withheld tax (support article above). MP Terms §4.5 requires us to accept the self-billed invoices, give SMP our GST number if registered, and **not** invoice SMP ourselves.

---

## 6. Sandbox configuration plan (exact steps, no secrets)

All steps are for the **Stripe sandbox** and the Vercel **`staging`** custom environment only. Nothing here touches Production, `main`, DNS, or live keys.

### 6.1 API key → `STRIPE_SECRET_KEY` (staging only)
1. In the sandbox, create a **restricted key** (`rk_test_…`). Fall back to `sk_test_…` only if a needed permission can't be granted.
2. Permissions, from `docs/billing/EXTERNAL-SETUP-CHECKLIST.md` S2, re-derived from `real.ts`:

   | Permission | Needed for |
   |---|---|
   | Checkout Sessions: write | create / expire / retrieve |
   | Customers: write | `ensureCustomer` |
   | Subscriptions: write | retrieve / `cancel_at_period_end` |
   | Prices: read, Products: read | `checkPrice`. Write is only needed if Admin "Sync plan" may create objects, which it must **not** (6.4) |
   | Coupons: write | `createCoupon` / `retrieveCoupon` |
   | Invoices: read, Invoice Payments: read | `invoicePayments.list` |
   | PaymentIntents: read, Charges: read | receipts and refunds |
   | Customer portal: write | `billingPortal.sessions.create` |
   | Webhook / Events: read | |
3. Put the key in Vercel → Project → Settings → Environment Variables → **`STRIPE_SECRET_KEY`**, environment **`staging`** only. Never Preview or Production.
4. `stripeModeFromSecretKey` derives **test** mode from the `_test_` prefix, so the app reads `billing_plans.stripe_test_*` *(observed in `mode.ts` / `store.ts`)*. Product and price ids are **sandbox-scoped**: the key must come from the same sandbox that holds `prod_VPlfieVxXI41Pw`.
5. **`STRIPE_AUTOMATIC_TAX`:** leave it unset or not `"true"` on staging. This is necessary but not enough. Today the code always sends `automatic_tax: { enabled: … }`, and MP requires the parameter to be **removed** (6.5).

### 6.2 Webhook endpoint → `STRIPE_WEBHOOK_SECRET`
1. URL: `https://<stable-staging-host>/api/billing/webhook?x-vercel-protection-bypass=<automation-bypass-secret>`. The route exists at `app/src/app/api/billing/webhook/route.ts` *(observed)*. The bypass secret is created in Vercel → Deployment Protection → Protection Bypass for Automation (checklist S5). Treat that URL as secret.
2. In Workbench → Webhooks → Create an event destination:
   - **Your account**.
   - Payload **Snapshot**, not Thin, even though Workbench recommends Thin. Our handler uses `webhooks.constructEvent` and reads `data.object` *(observed in `real.ts`/`mappers.ts`)*.
   - API version: choose **`2026-09-30.endive`**, the version pinned by the installed SDK v23.0.0 *(observed)*. MP needs "`2025-03-31.basil` or later".
3. Copy the endpoint's `whsec_…` into Vercel **`STRIPE_WEBHOOK_SECRET`** (`staging` only). Redeploy staging (`vercel deploy --target=staging` from the repo root).

### 6.3 Events to subscribe

Exactly the 19 types routed in `app/src/lib/billing/webhook.ts` *(observed)*:
- `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`
- `customer.subscription.created`, `.updated`, `.deleted`, `.paused`, `.resumed`, `.pending_update_applied`
- `invoice.paid`, `invoice.payment_succeeded`, `invoice.payment_failed`, `invoice.finalized`, `invoice.updated`, `invoice.voided`, `invoice.marked_uncollectible`, `invoice.created`
- `charge.refunded`, `charge.refund.updated`

Optional additions for MP:
- `checkout.session.async_payment_failed`. The MP set-up guide lists it. Our router has no branch for it, so it is recorded as `ignored`, and the pending checkout then ends by expiry or reconcile. Async methods mainly appear with local-currency payment methods.
- Dispute events `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`, `charge.dispute.funds_withdrawn`, `charge.dispute.funds_reinstated`. MP docs don't *require* them, since Stripe handles disputes. Our code currently ignores them, so subscribing only adds an audit trail in `billing_events`. Subscribe once a handler or Admin view exists; Stripe advises against listening to unneeded events (https://docs.stripe.com/webhooks).

### 6.4 Use the EXISTING product and price, not "Sync plan" duplicates

**What the code does today** *(observed)*:
- `adminSyncPlanToStripe` (`admin/service.ts`, step-up gated by `plan.sync_stripe` in `admin/policy.ts`) calls `ensureProductAndPrice` with `existingProductId = billing_plans.stripe_test_product_id` and `existingPriceId = …stripe_test_price_id`.
- `ensureProductAndPrice` (`stripe/real.ts`):
  - if the product id is null, it **creates** a product named `billing_plans.display_name` ("InnerDweS Space") with idempotency key `idw-product-test-space_monthly_usd`, **with no `tax_code`**;
  - if the price id is null, it **creates** a price **with no `tax_behavior`**.
  - If both ids are set, it makes **no** Stripe call and returns them.
- It then calls `checkPrice` and writes the ids back, with audit `plan.sync_stripe`.
- Seed: `billing_plans` row `space_monthly_usd`, `USD`, `unit_amount_minor=2500`, `billing_interval='month'`, Stripe ids **NULL** (0036).

**So never press "Sync plan" while `stripe_test_*` is null.** It would create a duplicate product without an MP-eligible tax code and a price without `tax_behavior`.

**Safe sequence:**
1. **Set the two ids through an audited path.** Choose one:
   - **(a) Preferred, needs a future code task:** a new step-up Admin action, "adopt existing Stripe price". It accepts the product and price ids, retrieves both, verifies everything in step 3 below, writes `stripe_test_product_id` / `stripe_test_price_id`, and audits it. It refuses if ids are already set.
   - **(b) Staging only, needs an explicit Supabase-mutation authorization in a task:** a single guarded statement on the **Staging** database:

     ```sql
     update public.billing_plans
        set stripe_test_product_id = 'prod_VPlfieVxXI41Pw',
            stripe_test_price_id   = 'price_1UOw85HruEyzzzcj7xgzM5Fy',
            updated_at = now()
      where plan_key = 'space_monthly_usd'
        and stripe_test_product_id is null
        and stripe_test_price_id is null;
     ```

     Expect exactly 1 row. Record before/after in the task report. Not executed here.
2. **Then press Admin → Settings → "Sync plan" (MFA step-up).**
   - `ensureProductAndPrice` returns the stored ids without creating anything.
   - `checkPrice` verifies `active`, `unit_amount === 2500`, currency `usd` (compared upper-case), `type=recurring`, `interval=month`, `interval_count=1`.
   - The ids are re-written and an audit row `plan.sync_stripe` with before/after is created. This gives the audit trail for path (b).
3. **What `checkPrice` does *not* check** *(observed)*:
   - It never reads `tax_behavior`, so **`exclusive` is not rejected**, and neither is `inclusive` or unset.
   - It never checks that the price belongs to the stored product (`price.product`).
   - It never checks the product's `tax_code` or MP eligibility.

   The owner-reported price therefore passes, if it is active, 2500, USD, monthly with interval_count 1. But a wrong-product or tax-inclusive price would pass too. A future code task should add `price.product === stripe_test_product_id`, `price.tax_behavior === 'exclusive'` (to keep the "before tax" copy true) and `product.tax_code ∈ {expected code}` to `checkPrice`/`adminSetPaidCheckout`.
4. The Stripe product name "InnerDweS Space Subscription" differs from `display_name` "InnerDweS Space". That's harmless: the name is only used when creating a product.

### 6.5 MP Checkout parameters: what the code would need (NOT changed)

Today `createCheckoutSession` (`stripe/real.ts`) sends *(observed)*:
- `mode`, `customer`, `line_items[{price,quantity:1}]`, `discounts?`, `client_reference_id`, `metadata`, `subscription_data.metadata`
- `success_url`, `cancel_url`, `expires_at` (60 min; the API allows 30 min–24 h), `billing_address_collection:"auto"`
- **`automatic_tax:{enabled}`**, `allow_promotion_codes:false`, `locale?`

Required for MP:
1. Add `managed_payments: { enabled: true }`, typed in SDK v23 as `SessionCreateParams.ManagedPayments` *(observed)*. Only add it when the snapshotted payment model is MP.
2. **Omit `automatic_tax` entirely.** It's on the MP removal list, and sending `{enabled:false}` is not documented as acceptable.
3. Never send these (we don't today): `adaptive_pricing`, `tax_id_collection`, `subscription_data.default_tax_rates`, `payment_method_types`, `payment_method_configuration`, `customer_update[name|address]`, shipping, Connect params, `subscription_data.invoice_settings`, `invoice_creation`.
4. Keep `customer`, `client_reference_id`, `metadata` and `subscription_data.metadata`. They're not on the removal list, though no MP page positively confirms them; the sandbox run should verify they round-trip.
5. Keep `billing_address_collection:"auto"`. It isn't on the list, and MP collects name and address itself.
6. `discounts`: UNVERIFIED (#11).
7. Mapper and DTO: read `session.managed_payments?.enabled` and `subscription.managed_payments?.enabled`, and verify the flag against the pending checkout's model. Invoices carry no flag, so derive it from the subscription.
8. Add the payment model to the idempotency `attemptKey` and `metadata`, as in CODE-IMPACT §2/§9.
9. `isStripeHostedUrl`: the MP docs show the redirect `Location: https://checkout.stripe.com/c/pay/cs_test_...` (set-up, "Test your endpoint"), and custom domains are unsupported. So the existing `*.stripe.com` allow-list should accept MP Checkout. CODE-IMPACT §1.6 can be downgraded from UNKNOWN.

### 6.6 Customer Portal (sandbox: Settings → Billing → Customer portal)
- Turn **on**: payment-method update (the only API-less way to change `default_payment_method` under MP) and invoice history.
- Cancellation: **at end of billing period** only, no cancellation-deflection coupon.
- Turn **off**: plan switching, quantity changes, promotion codes.
- Customer information: leave the address editable. MP needs a valid billing address for tax, and portal edits change the tax location.
- Link order management stays available in addition. No doc says it can be disabled.

### 6.7 Stripe notification settings under MP (Settings → Billing → Subscriptions and emails)
- **Can't turn off (forced):**
  - receipts, invoices, refund/credit-note notices (sent from Link, with PDFs);
  - trial start/ending emails;
  - the anniversary renewal reminder (12 months; 6 and 12 for AU/UK customers; default 15 days before, minimum 7).
- **Configurable:** upcoming renewals (each cycle), expired cards, failed payments.
- Recommended for InnerDweS:
  - upcoming renewals **off**; the forced anniversary email still goes out;
  - choose **one** sender for failed-payment and expired-card notices. Either keep Stripe's off and our Resend `payment_failed` on (today's design), or the reverse. Never both.
- Retry policy (Billing → Revenue recovery → Retries): set it as in checklist S10 (Smart Retries, then "mark unpaid"). **Whether MP subscriptions honour it is UNVERIFIED.** Observe it in the sandbox and get Stripe's confirmation.
- In the sandbox, receipts don't send automatically. Use "Send receipt" on a payment to preview the Link receipt.

### 6.8 Dashboard business details used by MP
- Support email: Stripe uses it "for all customer support escalations" (how-it-works).
- Checkout settings: custom Terms and Privacy URLs shown on the MP checkout footer.
- Invoice settings: business name and tax details for invoices issued in our name (SG domestic B2B, uncovered countries).

### 6.9 Resend coordination (avoid duplicate receipts)
- Under MP the customer always gets the Link receipt and invoice. Our `payment_confirmation` email *(observed in `emails/render.ts`, `billing.*.ts`)* currently shows "Amount paid", "Invoice", a "View invoice / receipt" button, and the claim of no separate provider receipt.
- For MP subscriptions it should become a **service confirmation**: Space active, manage billing link.
  - It must not claim to be the receipt or invoice.
  - It may link the Link-issued `hosted_invoice_url` with wording such as "Your receipt from Link (Sold through Link)".
  - Lifecycle notices (`guest_unavailable`, `studio_suspended`, `final_warning`) stay ours.
- These are code or copy changes for a future task. None were made here.
- In the sandbox only our emails are delivered automatically, so the duplicate-email risk can only be seen in live mode or with manual "Send receipt" previews.

---

## 7. Recommended integration approach and required confirmations

### 7.1 Recommendation
1. **Keep both models in the code, chosen per checkout**, as designed in CODE-IMPACT §9: `billing_settings.payment_model`, snapshotted on `pending_space_checkouts`, `space_subscriptions` and `billing_acceptances`. Standard stays the default until Stripe approves the live account for MP **and** the open items below are answered.
2. **Sandbox first, then decide:**
   - Adopt the existing product and price (6.4).
   - Implement only the MP Checkout branch (6.5) in a feature task.
   - Run these scenarios: plain purchase; purchase with a `repeating` coupon; two Spaces on one customer with different addresses; cancel at period end; portal payment-method update; failed renewal (`4000 0000 0000 0341` with a short trial); refund; and data-deletion behaviour if Stripe can simulate it.
   - Record the observed events, invoice fields (`total_taxes`, `hosted_invoice_url`, `invoice_pdf`) and Checkout tax display.
3. **Copy and legal:**
   - Under MP, make the email footnote, the "issued by" wording, `termsLine` and the refund statement ("No refund is issued for the current period" conflicts with SMP's 60-day refund right) model-specific.
   - Consents must also cover MP Terms §3.2, which requires disclosing subscription amount, frequency, auto-renewal and the cancellation method before or at checkout.
4. **Don't change Production** or the live account until the confirmations below are in writing.

### 7.2 Owner and Stripe confirmations required

| # | Ask | Who |
|---|---|---|
| C1 | Is the **live** SG account approved for MP after review, given its business type (individual / sole proprietor / company) and the owner's residency? | Stripe Support / Sales |
| C2 | Is InnerDweS (software Spaces for retreat hosts and teachers, with media and guest access; the retreats themselves are not sold) an eligible "fully automated digital product"? Is the SaaS code right (`txcd_10103001` business vs `txcd_10103000` personal)? | Stripe + tax advisor |
| C3 | Are `discounts` (one coupon) on MP Checkout Sessions supported, including `duration=repeating`/`forever`? What is the tax base: the amount after discount? | Stripe |
| C4 | Can one Customer hold several concurrent MP subscriptions? Does a new session's address update change tax on the customer's other subscriptions? | Stripe |
| C5 | Do Smart Retries, custom schedules and "mark unpaid after final retry" apply to MP subscriptions? Do test clocks work with MP in sandboxes? | Stripe |
| C6 | Which webhook events fire for Stripe-initiated refunds, Stripe-handled disputes, Link-side cancellations and data-deletion cancellations? Are there MP-only events? | Stripe |
| C7 | Is `invoice_pdf` populated on MP invoices? Are `total_taxes` and the discount amounts populated as for Billing invoices? | Stripe / sandbox |
| C8 | Fees: do the international surcharge and fixed fee apply unchanged? Is USD → SGD settlement fee-free under MP? Is the 3.5% returned on refunds? Payout timing and reserves for MP? | Stripe |
| C9 | Is USD a settlement currency on the SG account (Adaptive Pricing requires it), or should one be added? | Owner (Dashboard → Balances) |
| C10 | Is there an assisted path to migrate standard subscriptions into MP, and to move MP subscriptions back to standard? What customer re-consent is required? | Stripe |
| C11 | Can Link-side cancellation be limited? What are its semantics: immediate or at period end? | Stripe |
| C12 | SG domestic B2B: is InnerDweS GST-registered, or must it register? Is our Dashboard Invoice settings data complete for invoices issued in our name? | Owner + tax advisor |
| C13 | Reverse charge and tax-ID collection for business buyers outside SG under MP. | Stripe |
| C14 | Is it acceptable for InnerDweS to send its own service-confirmation email alongside the Link receipt, and are there wording constraints? | Stripe / legal |

---

## 8. Source list (all fetched 2026-10-10)

**MP docs:**
- https://docs.stripe.com/payments/managed-payments
- https://docs.stripe.com/payments/managed-payments/how-it-works
- https://docs.stripe.com/payments/managed-payments/eligibility
- https://docs.stripe.com/payments/managed-payments/set-up
- https://docs.stripe.com/payments/managed-payments/update-checkout
- https://docs.stripe.com/payments/managed-payments/use-payment-links
- https://docs.stripe.com/payments/managed-payments/tax-compliance
- https://docs.stripe.com/payments/managed-payments/changelog
- https://docs.stripe.com/changelog/clover/2026-02-25/managed-payments
- https://docs.stripe.com/changelog/dahlia/2026-04-22/managed-payments
- https://docs.stripe.com/api/checkout/sessions/create (`managed_payments.enabled`)

**Legal:**
- https://stripe.com/legal/managed-payments (MP Terms, "Last modified: September 28, 2026"; full text searched)
- https://stripe.com/legal/ssa-service-terms (Stripe Financial Services Terms §2.1)

**Pricing and support:**
- https://stripe.com/en-sg/pricing
- https://stripe.com/en-sg/billing/pricing
- https://support.stripe.com/questions/managed-payments-pricing
- https://support.stripe.com/questions/which-invoices-will-i-receive-for-managed-payments-transactions
- https://support.stripe.com/questions/payment-method-configurations-for-managed-payments
- https://support.stripe.com/questions/selecting-the-right-product-tax-code-for-managed-payments
- https://support.stripe.com/questions/get-started-with-stripe-managed-payments
- https://support.stripe.com/questions/adaptive-pricing

**Singapore:**
- https://support.stripe.com/questions/verification-requirements-for-stripe-accounts-in-singapore
- https://support.stripe.com/questions/2026-updates-to-singapore-verification-requirements
- https://support.stripe.com/questions/selling-on-stripe-without-a-separate-business-entity
- https://support.stripe.com/questions/troubleshooting-invalid-business-type-in-singapore

**General (cited only for our side or Model A, never as MP evidence):**
- https://docs.stripe.com/payments/checkout/discounts
- https://docs.stripe.com/billing/subscriptions/coupons
- https://docs.stripe.com/customer-management
- https://docs.stripe.com/billing/revenue-recovery/smart-retries
- https://docs.stripe.com/payments/currencies/localize-prices/adaptive-pricing
- https://docs.stripe.com/payouts/multicurrency-settlement
- https://docs.stripe.com/webhooks
- https://docs.stripe.com/disputes/how-disputes-work

**Evidence quality:**
- Support articles, pricing pages and the SG verification pages were read through a summarizing fetcher. Their quotes are the fetcher's verbatim extracts.
- The MP docs pages, the MP Terms text (downloaded and grepped) and the Financial Services Terms clause were checked directly.

---

## 9. Corrections and changes against v1 (`STRIPE-MANAGED-PAYMENTS-RESEARCH.md`) and CODE-IMPACT

1. **MP launch history.** v1 said MP "was introduced as a public preview on 2026-02-25". The MP changelog has dated entries back to **2025-08-13**, for example one-time payments on 2025-09-22. `2026-02-25.preview` and `2026-04-22.dahlia` are the API-version changelog entries that add the `managed_payments` parameter. GA on 2026-04-22 (39 countries) is confirmed.
2. **Tax behaviour.** v1 and CODE-IMPACT treated tax-inclusive/exclusive presentation as unknown. It is **documented**: MP "uses the tax behavior specified on your price", and unset means added on top. Our tax-exclusive "$25 before tax" model is compatible (#8).
3. **Individuals and residency.** v1 cited the support article only. The **Financial Services Terms §2.1** require a business "(including sole proprietor)" located in the account's country. MP-specific individual eligibility is still UNVERIFIED.
4. **Currency conversion fee.** v1 left the +2% as UNVERIFIED. The MP pricing article says that with Adaptive Pricing enabled, "Stripe does not charge a currency conversion fee", and Adaptive Pricing is always on under MP. New finding: Adaptive Pricing **requires the price currency to be a settlement currency** (owner check C9).
5. **Customer reuse, portal and API updates.** CODE-IMPACT marked these UNKNOWN. MP docs confirm that an existing `customer` can be passed (and is updated), the Customer Portal can be offered, and subscriptions can be updated by API. Only `default_payment_method` is API-blocked.
6. **Checkout host.** CODE-IMPACT §1.6 marked it UNKNOWN. The MP docs show `checkout.stripe.com` redirects and custom domains are unsupported, so the existing allow-list fits.
7. **MoR wording.** CODE-IMPACT suggested copy like "issued by Stripe as the seller". The documents are issued by **"Sold through Link"** (SMP). The Terms say SMP is MoR but "not the seller of record" and acts as undisclosed agent. Copy should name Link / Sold through Link.
8. **Invoice object flag.** New: `managed_payments` exists on Session, PaymentIntent, SetupIntent, Subscription and PaymentLink, **not on Invoice** (changelog and SDK v23 typings). Invoice-level model detection must come from the subscription.
9. **Webhook payload format.** New: Workbench recommends **Thin** events. Our handler needs **Snapshot**, so this is a configuration trap. Sandbox webhook retries are only "three times over the course of a few hours".
10. **Dispute and async-failure events.** v1/CODE-IMPACT left the event list for MP open. MP docs list only the three Checkout events. Dispute events are optional for us (Stripe handles disputes), and `checkout.session.async_payment_failed` is listed by MP but is currently unrouted in our code.
11. **"Sync plan" duplicate risk.** Not covered before. With null `stripe_test_*` ids, Sync plan creates a duplicate product without a tax code and a price without `tax_behavior`. `checkPrice` doesn't validate `tax_behavior`, product ownership or the tax code (6.4).
12. **Coupons.** Still UNVERIFIED, as v1 said. Newly made explicit: Stripe-native coupons can't be restricted per customer, and promotion-code "first-time" semantics don't match ours. The decision is to keep our engine as the authority (#12–#14).
13. **Switching back.** v1 only mentioned "leaving MP". The Terms §3.2 obligations (own charging rights, customer notice) are now quoted, together with "only authorizes Managed Payments to charge". The process itself is still undocumented (#40).
14. **Confirmed unchanged from v1:** SG verification updates, the 60-day/48-hour refund rules, forced emails, the report `fee` column including withheld tax, the three monthly documents, payment-method configuration only through Support, "Existing subscriptions aren't eligible", SG fee figures, and the MP fee on the tax-inclusive amount.
