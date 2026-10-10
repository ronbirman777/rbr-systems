# Stripe Managed Payments vs Standard Payments + Billing — Research

- **Date:** 2026-10-10
- **Scope:** Research only, no code or configuration changes. Sources are Stripe's official docs, legal, pricing and support pages, fetched on 2026-10-10.
- **Model A:** Standard Stripe Payments + Stripe Billing, with optional Stripe Tax. This is the current InnerDweS design.
- **Model B:** Stripe Managed Payments ("SMP"). Stripe's affiliate *Sold through Link, LLC* is the merchant of record (MoR), and customers see **Link** as the seller.
- **InnerDweS context:** SaaS at $25/month per Space. Each account has one Stripe Customer, with one subscription per Space. Checkout runs in `mode=subscription` with server-applied coupons through `discounts` (promotion codes off). Provisioning happens from webhooks (fetch-on-event). The app keeps its own invoice ledger and uses the Customer Portal, Smart Retries ending in `unpaid`, and `charge.refunded`. Stripe Tax is optional. Stripe emails are off and the app sends its own emails. The seller is likely in Singapore and may be an individual.

Legend: **SUPPORTED** / **SUPPORTED WITH CHANGES** / **UNVERIFIED** (the docs don't say) / **UNSUPPORTED**. Quotes are 15 words or fewer.

---

## 0. Status of Managed Payments

- **Generally available (GA).** Managed Payments was introduced as a public preview on 2026-02-25 (API `2026-02-25.preview`). It became GA on **2026-04-22**: "Managed Payments is now generally available to businesses in 39 countries". Sources: https://docs.stripe.com/payments/managed-payments/changelog and https://docs.stripe.com/changelog/clover/2026-02-25/managed-payments. Sessions 2026 said "All digital businesses can now use Managed Payments" (https://stripe.com/blog/everything-we-announced-at-sessions-2026).
- **Access is not automatic.** "Stripe determines access to Managed Payments based on an eligibility review" (https://docs.stripe.com/payments/managed-payments/eligibility). You must accept separate MP Terms of Service in the Dashboard first (https://docs.stripe.com/payments/managed-payments/set-up).
- **API version.** The set-up guide asks for `2025-03-31.basil` or later. The repo's installed `stripe` SDK v23.0.0 pins `2026-09-30.endive` (observed in `app/node_modules/stripe/cjs/apiVersion.js`), which meets this. The changelog lists `managed_payments` as added in `2026-02-25.preview` and `2026-04-22.dahlia`. This is a doc inconsistency, but it doesn't matter for the current SDK.
- **Do Billing features behave the same?** No single statement says so. The Billing behaviour that *is* documented as different for MP:
  - You can't create a subscription outside Checkout or Payment Links.
  - You can't set `default_payment_method` through the API.
  - There are no one-off invoices outside the billing period, and no customer-level pending invoice items.
  - Some emails are forced on.
  - Customers can manage subscriptions on Link.

  These are documented as working with MP: Customer Portal, subscription schedules (since 2026-02-09), invoice items / subscription items (since 2026-04-22), Pay Invoice (since 2026-10-05), and `payment_behavior` on updates.

  **Not documented for MP either way: Smart Retries, test clocks, and the after-final-retry `unpaid` setting.** These are UNVERIFIED.

---

## 1. Comparison matrix (30 topics)

| # | Topic | A: Standard | B: Managed Payments | Findings | Sources |
|---|---|---|---|---|---|
| 1 | Eligibility for a Singapore account / MP seller countries | SUPPORTED | SUPPORTED WITH CHANGES | **SG is a supported MP business location**. The list covers 39 countries: CA, US, EU/EEA, CH, GB, LI, NO, AU, HK, JP, SG. Access still depends on Stripe's eligibility review. Connect platforms, Express accounts and platform-controlled accounts are excluded. | https://docs.stripe.com/payments/managed-payments/eligibility ; https://docs.stripe.com/payments/managed-payments/changelog |
| 2 | Seller onboarding / verification | SUPPORTED | SUPPORTED WITH CHANGES | B first needs a normal Stripe account (SG verification rules apply). You then activate MP in Settings → Managed Payments and accept the MP Terms. "Eligibility review that considers factors such as business type and geography". New SG merchants from Sept 2026 must meet updated verification requirements (non-individual accounts). | https://docs.stripe.com/payments/managed-payments/set-up ; https://docs.stripe.com/payments/managed-payments/eligibility ; https://support.stripe.com/questions/2026-updates-to-singapore-verification-requirements ; https://support.stripe.com/questions/verification-requirements-for-stripe-accounts-in-singapore |
| 3 | Individual without a registered company | SUPPORTED | UNVERIFIED | A: Stripe says "You can use Stripe to sell… [without] a separate business entity". SG verification docs refer to "Individual accounts", and sole proprietorships are checked against ACRA/UEN. B: the MP docs don't say whether individual/unregistered accounts pass the eligibility review. They only say business type is a factor. | https://support.stripe.com/questions/selling-on-stripe-without-a-separate-business-entity ; https://support.stripe.com/questions/verification-requirements-for-stripe-accounts-in-singapore ; https://support.stripe.com/questions/troubleshooting-invalid-business-type-in-singapore ; https://docs.stripe.com/payments/managed-payments/eligibility |
| 4 | Test mode / sandboxes | SUPPORTED | SUPPORTED WITH CHANGES | B works in a sandbox with test cards. However: "In sandbox mode, you won't receive receipt emails automatically". "Test purchases won't appear in the Link app", so Link order management can only be tested in live mode. Test clocks with MP are not documented. | https://docs.stripe.com/payments/managed-payments/set-up ; https://docs.stripe.com/billing/testing |
| 5 | Checkout Session integration | SUPPORTED | SUPPORTED WITH CHANGES | B needs `managed_payments[enabled]=true` and an eligible `tax_code` on every product (e.g. `txcd_10103000`/`txcd_10103001` SaaS). It must be hosted or embedded Checkout or Payment Links; Elements/custom flows are unsupported. **You must remove these params:** `automatic_tax`, `tax_id_collection`, `subscription_data.default_tax_rates`, `adaptive_pricing`, `payment_method_types`, `payment_method_configuration`, `customer_update[name\|address]`, shipping params, Connect params, `subscription_data.invoice_settings`, `invoice_creation`. "Custom domains aren't supported on Managed Payments checkouts." `client_reference_id`, `metadata`, `customer` and `discounts` are **not** on the removal list. | https://docs.stripe.com/payments/managed-payments/update-checkout ; https://docs.stripe.com/payments/managed-payments/set-up ; https://docs.stripe.com/payments/managed-payments/how-it-works ; https://docs.stripe.com/payments/managed-payments |
| 6 | Recurring subscriptions | SUPPORTED | SUPPORTED WITH CHANGES | B supports `mode=subscription` through Billing. "Creating a subscription outside of Checkout or Payment Links" is unsupported. Recurring-capable payment methods: cards, Apple Pay, Google Pay, Link, and some local methods. Klarna is one-time only. | https://docs.stripe.com/payments/managed-payments ; https://docs.stripe.com/payments/managed-payments/how-it-works |
| 7 | Pending-checkout provisioning (client_reference_id / metadata / session retrieve) | SUPPORTED | UNVERIFIED (likely compatible) | The MP set-up guide tells you to fulfil from `checkout.session.completed` / `async_payment_succeeded` / `async_payment_failed`, and to avoid relying only on the success page. `client_reference_id`/`metadata` aren't on the unsupported list, but the MP docs never confirm them explicitly. | https://docs.stripe.com/payments/managed-payments/set-up ; https://docs.stripe.com/payments/managed-payments/update-checkout ; https://docs.stripe.com/checkout/fulfillment |
| 8 | Webhook events | SUPPORTED | SUPPORTED WITH CHANGES | B uses the same Checkout events, and the objects gain a `managed_payments` field (Checkout.Session, PaymentIntent, SetupIntent, Subscription). There's no published MP-specific event list. New sources of events the app doesn't trigger itself: Stripe-initiated refunds, Stripe-accepted or countered disputes, customer cancellations on Link, and Stripe cancelling subscriptions on customer data-deletion requests. | https://docs.stripe.com/payments/managed-payments/set-up ; https://docs.stripe.com/changelog/dahlia/2026-04-22/managed-payments ; https://docs.stripe.com/payments/managed-payments/how-it-works |
| 9 | Renewals | SUPPORTED | SUPPORTED WITH CHANGES | B renews through Billing. Stripe **always** sends an upcoming-renewal email before the 12-month anniversary (6 and 12 months for AU/UK customers), even if renewal emails are off. "When a customer purchases a subscription through Managed Payments, it only authorizes Managed Payments" to charge. | https://docs.stripe.com/payments/managed-payments/how-it-works ; https://docs.stripe.com/payments/managed-payments/set-up |
| 10 | Coupons / promotion codes | SUPPORTED | UNVERIFIED | A: `discounts[0][coupon]` on the Checkout Session, with at most one coupon or promotion code per Session. B: `discounts`/`allow_promotion_codes` are **not** on the unsupported list, and the Checkout overview lists "discounts and promo codes" for the Full-page UI that supports MP. But no MP page explicitly confirms coupons. | https://docs.stripe.com/payments/checkout/discounts ; https://docs.stripe.com/billing/subscriptions/coupons ; https://docs.stripe.com/payments/managed-payments/update-checkout ; https://docs.stripe.com/payments/checkout |
| 11 | Coupon duration and usage rules | SUPPORTED | UNVERIFIED | A: `duration` once/repeating(`duration_in_months`)/forever, plus `max_redemptions` and `redeem_by`. For B, the docs don't say how tax is calculated on discounted amounts or whether coupons behave the same. | https://docs.stripe.com/billing/subscriptions/coupons |
| 12 | Multiple subscriptions per customer (per Space) | SUPPORTED | UNVERIFIED | A: standard Billing. B: you can pass an existing `customer` (it gets updated with name/address). The docs don't address several MP subscriptions on one Customer. Customers manage each order on Link. | https://docs.stripe.com/payments/managed-payments/update-checkout ; https://docs.stripe.com/payments/managed-payments/how-it-works |
| 13 | Cancellation | SUPPORTED | SUPPORTED WITH CHANGES | B: you can still update subscriptions in the Dashboard or API. Customers can also "Cancel or update subscriptions" on link.com, outside the app's UI. Stripe cancels MP subscriptions when a customer requests data deletion. | https://docs.stripe.com/payments/managed-payments/how-it-works |
| 14 | Customer Portal | SUPPORTED | SUPPORTED WITH CHANGES | The portal lists Managed Payments under interoperability. MP docs: "You can also offer additional subscription management… using the Customer Portal". Link order management is available alongside the portal and can't be switched off (not documented as optional). | https://docs.stripe.com/customer-management ; https://docs.stripe.com/payments/managed-payments/how-it-works |
| 15 | Payment-method updates | SUPPORTED | SUPPORTED WITH CHANGES | B: you "can't update `subscription.default_payment_method` directly through the API". Customers update it through the Customer Portal or Link. You must not charge a stored payment method yourself without your own customer authorization (MP Terms). | https://docs.stripe.com/payments/managed-payments/how-it-works ; https://stripe.com/legal/managed-payments |
| 16 | Failed payments, retries, dunning | SUPPORTED | UNVERIFIED (partially documented) | A: Smart Retries / custom retry rules, and after the final retry the subscription is cancelled, `unpaid`, left past-due or paused. B: failed-payment and expired-card emails stay controllable in settings, and Pay Invoice works (2026-10-05). **Smart Retries and the `unpaid` end-state aren't documented for MP.** | https://docs.stripe.com/billing/revenue-recovery/smart-retries ; https://docs.stripe.com/payments/managed-payments/how-it-works ; https://docs.stripe.com/payments/managed-payments/changelog |
| 17 | Refunds API and responsibility | SUPPORTED | SUPPORTED WITH CHANGES | B: you can still issue refunds in the Dashboard or API. **Stripe/SMP may also refund within 60 days, overriding a stricter refund policy.** If you don't answer a Stripe query within 48h, Stripe may refund. The seller is liable for refunds, debited from the balance. In some jurisdictions, withheld tax on refunds is retained and charged back to the seller. | https://docs.stripe.com/payments/managed-payments/how-it-works ; https://docs.stripe.com/payments/managed-payments/eligibility ; https://stripe.com/legal/managed-payments |
| 18 | Disputes / fraud | SUPPORTED | SUPPORTED WITH CHANGES | B: "Stripe handles disputes for you", and may accept a dispute instead of countering it. The dispute *received* fee still applies (SG: $15.00). Stripe covers the evidence fee when it counters, but you pay it if you counter yourself. Stripe configures fraud rules, and you're charged for any dispute-prevention tools it enables. A: you handle disputes, using Radar. | https://docs.stripe.com/payments/managed-payments/how-it-works ; https://stripe.com/en-sg/pricing ; https://stripe.com/legal/managed-payments |
| 19 | Who issues invoices/receipts | SUPPORTED (you are the seller) | SUPPORTED WITH CHANGES | B: invoices are "issued by Sold through Link". The seller's business name appears with product details. The statement descriptor shows `LINK.COM* [descriptor]`. SMP invoices "in SMP's own name". Where SMP doesn't cover tax, invoices are in the seller's name. The seller receives a monthly self-billed (reverse) invoice plus two Stripe fee invoices. | https://docs.stripe.com/payments/managed-payments/changelog ; https://docs.stripe.com/payments/managed-payments/how-it-works ; https://docs.stripe.com/payments/managed-payments/tax-compliance ; https://support.stripe.com/questions/which-invoices-will-i-receive-for-managed-payments-transactions ; https://stripe.com/legal/managed-payments |
| 20 | Customer billing history | SUPPORTED | SUPPORTED WITH CHANGES | B: MP invoices return `hosted_invoice_url` (since 2026-02-09). Customers see order history on Link, and the portal can be offered as well. Whether `invoice_pdf` is present on MP invoices isn't stated (emails always attach PDFs). | https://docs.stripe.com/payments/managed-payments/changelog ; https://docs.stripe.com/payments/managed-payments/how-it-works |
| 21 | Tax responsibilities | SUPPORTED WITH CHANGES (seller is liable; Stripe Tax optional) | SUPPORTED WITH CHANGES | B: SMP calculates, collects, files and remits in 80+ countries. **Exception for SG sellers:** "Singapore (B2B domestic transactions specifically)" stays the seller's responsibility (B2B means the buyer says at checkout they're a business). For uncovered countries the seller is responsible, and Stripe Tax is free for those MP transactions. Income tax is always the seller's. | https://docs.stripe.com/payments/managed-payments/tax-compliance ; https://stripe.com/legal/managed-payments ; https://docs.stripe.com/tax |
| 22 | Buyer countries | SUPPORTED | SUPPORTED WITH CHANGES | B: buyers from 195+ countries, except Ascension Island, China, Cuba, Iran, Kosovo, North Korea, Russia, Syria and Tristan da Cunha. Tax coverage is a separate, smaller list. | https://docs.stripe.com/payments/managed-payments/eligibility ; https://docs.stripe.com/payments/managed-payments/tax-compliance |
| 23 | Payouts / settlement reporting | SUPPORTED | SUPPORTED WITH CHANGES | B: MP transactions appear next to other transactions. Proceeds are net of withheld tax. The Terms say the account "is treated as a Connected Account to SMP". Payout timing and schedule for MP aren't documented. | https://docs.stripe.com/payments/managed-payments/how-it-works ; https://stripe.com/legal/managed-payments ; https://support.stripe.com/questions/which-invoices-will-i-receive-for-managed-payments-transactions |
| 24 | Metrics / reconciliation | SUPPORTED | SUPPORTED WITH CHANGES | B: the `fee` column in Balance Change, Payout Reconciliation and Ending Balance reports **includes withheld tax** by default. Optional `withheld_tax` and `fee_net_of_withheld_tax` columns break it out. Sigma has `managed_payments_enabled`. Stripe Tax reports exclude MP volume. Presentment currency comes through `presentment_details` (Adaptive Pricing). | https://docs.stripe.com/payments/managed-payments/how-it-works ; https://support.stripe.com/questions/do-stripe-tax-reports-include-managed-payments ; https://docs.stripe.com/payments/managed-payments/changelog ; https://docs.stripe.com/payments/currencies/localize-prices/adaptive-pricing |
| 25 | Admin / dashboard requirements | SUPPORTED | SUPPORTED WITH CHANGES | B needs these Dashboard steps: activate MP, accept the Terms, set a product tax code, and keep the support email accurate (Stripe uses it for escalations). MP payment-method config **can't be changed in the Dashboard; you must contact Support**. Admin can't create subscriptions or one-off invoices through the API outside Checkout. | https://docs.stripe.com/payments/managed-payments/set-up ; https://docs.stripe.com/payments/managed-payments/how-it-works ; https://support.stripe.com/questions/payment-method-configurations-for-managed-payments ; https://docs.stripe.com/payments/managed-payments |
| 26 | Customer email notifications | SUPPORTED (can turn off Stripe emails) | SUPPORTED WITH CHANGES | B: "Stripe always sends receipts, invoices, and any refund or credit note notifications", from Link. Dashboard receipt settings have no effect. Trial-start, trial-ending and anniversary renewal emails are forced. Renewal, expired-card and failed-payment emails stay configurable. The app's own emails can still be sent, but customers will also get Link emails. | https://docs.stripe.com/payments/managed-payments/how-it-works |
| 27 | Webhook idempotency / semantics | SUPPORTED | SUPPORTED | Same rules for both: events can be duplicated (dedupe on event ID), ordering isn't guaranteed, and live-mode retries run up to 3 days. Nothing MP-specific is documented. | https://docs.stripe.com/webhooks |
| 28 | Migrating existing subscriptions | N/A | UNSUPPORTED (per docs), with nuance | Docs: "Existing subscriptions aren't eligible". MP only applies to new subscriptions bought through an MP Checkout. The MP Terms do mention "If User elects to manage its existing Customer subscriptions… through" SMP, and leaving MP. There's no documented self-serve path; confirm with Stripe. | https://docs.stripe.com/payments/managed-payments/update-checkout ; https://stripe.com/legal/managed-payments |
| 29 | Feature / availability restrictions | SUPPORTED | SUPPORTED WITH CHANGES | GA since 2026-04-22, subject to an eligibility review. **Digital products only:** professional services, physical goods and **live in-person events** are excluded. The product must be "fully automated"; human intervention such as live 1-1 coaching disqualifies it. You must sell directly, not through a marketplace. NFTs/crypto and the Prohibited/Restricted list are banned. No Connect. Stripe may offboard ineligible products or suspend MP. | https://docs.stripe.com/payments/managed-payments/eligibility ; https://stripe.com/legal/managed-payments ; https://docs.stripe.com/payments/managed-payments |
| 30 | Pricing | SUPPORTED | SUPPORTED WITH CHANGES | SG page: domestic cards **3.4% + $0.50**, international **+0.5%**, currency conversion **+2%** "if required", Billing **0.7%**, Tax **0.5%** per transaction where registered. **Managed Payments 3.5% "per successful transaction in addition to Payments fees"**. The MP fee is charged on the amount *including* tax, and Billing fees still apply to subscription payments. Adaptive Pricing (always on in MP): "You pay 0%", while customers pay 2–4% when paying in local currency. | https://stripe.com/en-sg/pricing ; https://support.stripe.com/questions/managed-payments-pricing ; https://docs.stripe.com/payments/currencies/localize-prices/adaptive-pricing |

### Illustrative fee comparison (my arithmetic from the SG rates above; not a Stripe quote)

For a $25 charge on an international card with no conversion:

- **A:** 3.4% + 0.5% + 0.7% Billing = **4.6% + $0.50**. Add 0.5% if Stripe Tax is used for registered jurisdictions.
- **B:** A's 4.6% + $0.50, plus **3.5% on the tax-inclusive total**, = roughly **8.1%+ + $0.50**.

Caveats:
- It's UNVERIFIED whether the +2% conversion fee applies to USD prices settling to an SG account under MP.
- It's UNVERIFIED whether the Billing 0.7% is charged on the tax-inclusive amount.
- Currency labels on the SG page are presumably SGD.

---

## 2. InnerDweS-specific implications (if Model B were adopted)

These are inferences from the cited docs, not code changes.

1. **Eligibility of the product needs a Stripe determination.** A "Space" is a SaaS subscription, so `txcd_10103000`/`txcd_10103001` are candidates. MP excludes "Live in-person events" and services with human intervention. If Stripe sees InnerDweS as supporting retreats or coaching rather than as automated software, it could rule the product ineligible.
2. **Webhooks must treat Stripe-initiated actions as normal.** That covers refunds within 60 days, disputes accepted by Stripe, cancellations by customers on Link, and cancellations plus data deletion after a customer deletion request. Data deletion may also remove PII from Customer, Invoice and Charge objects that the ledger references.
3. **Remove `automatic_tax`** and any `payment_method_types`, `customer_update`, `invoice_creation` and `subscription_data.invoice_settings` from Checkout creation. Add `managed_payments[enabled]=true` and set tax codes on products.
4. **Customer-facing branding changes.** The checkout shows Link as MoR, statements read `LINK.COM*`, receipts and invoices come from Link / Sold through Link, and custom checkout domains aren't allowed. The "Stripe emails off" policy can't fully hold, because receipts and some subscription emails are forced.
5. **Admin console limits.** Admin can't create subscriptions or one-off invoices through the API outside Checkout, and can't set `default_payment_method` through the API.
6. **Ledger and reporting must handle withheld tax.** The `fee` column includes withheld tax unless you use `fee_net_of_withheld_tax`. Seller proceeds are documented through a self-billed invoice.
7. **Domestic Singapore B2B GST stays with the seller under B.** Whether that matters depends on GST registration status. Ask a tax advisor; Stripe docs don't cover thresholds.
8. **No migration path for existing standard subscriptions** is documented. Only new MP Checkouts are covered.

---

## 3. UNVERIFIED — must confirm with Stripe (Support / Sales) before choosing B

1. Will an **individual / unregistered SG seller** (no ACRA UEN) pass the MP eligibility review? What documents does it need?
2. Is the InnerDweS product (a Space for retreat hosts, with media/audio and guest access) an **eligible fully automated digital product**? Which tax code (`txcd_10103000` vs `txcd_10103001`)?
3. Are **coupons applied through `discounts` on a Checkout Session** supported with MP, including `duration=repeating`/`forever` and `max_redemptions`? How does tax apply to discounted totals?
4. Can **one Customer hold several concurrent MP subscriptions** (one per Space)? How does Link display them?
5. Do **Smart Retries**, custom retry schedules and the **"mark as unpaid" after final retry** setting apply to MP subscriptions?
6. Do **test clocks** work with MP subscriptions in sandboxes?
7. Are `client_reference_id` and `metadata` preserved on MP Checkout Sessions and Subscriptions? (They're not on the unsupported list, but no MP doc confirms them.)
8. Is `invoice_pdf` populated on MP invoices?
9. **Payout schedule / timing** for MP proceeds. Is there a reserve or rolling hold?
10. Is the +2% currency-conversion fee charged on MP transactions (USD price, SG settlement)? Is the **Billing 0.7%** charged on the tax-inclusive amount? Is the **3.5% refunded on refunds**?
11. Is there an **assisted migration path** for existing subscriptions? The Terms mention it but the docs say "Existing subscriptions aren't eligible".
12. Can **Link-side subscription management** be disabled or limited so cancellations only go through InnerDweS? (Not documented as optional.)
13. Which **webhook events** fire for Stripe-initiated refunds, Stripe-accepted disputes and data-deletion cancellations? Are any events unique to MP?
14. Exact wording and branding of Link receipts, and whether the InnerDweS business name and support contact appear.
15. API version: confirm that `managed_payments` works on the account's pinned API version and webhook endpoint versions (docs say "basil or later", while the changelog lists preview/dahlia).

---

## 4. Source URL list (all fetched 2026-10-10)

**Managed Payments: docs**
- https://docs.stripe.com/payments/managed-payments
- https://docs.stripe.com/payments/managed-payments/how-it-works
- https://docs.stripe.com/payments/managed-payments/eligibility
- https://docs.stripe.com/payments/managed-payments/set-up
- https://docs.stripe.com/payments/managed-payments/update-checkout
- https://docs.stripe.com/payments/managed-payments/tax-compliance
- https://docs.stripe.com/payments/managed-payments/changelog
- https://docs.stripe.com/changelog/clover/2026-02-25/managed-payments
- https://docs.stripe.com/changelog/dahlia/2026-04-22/managed-payments

**Managed Payments: legal, pricing, support**
- https://stripe.com/legal/managed-payments (MP Terms, "Last modified: September 28, 2026")
- https://stripe.com/en-sg/pricing
- https://support.stripe.com/questions/managed-payments-pricing
- https://support.stripe.com/questions/which-invoices-will-i-receive-for-managed-payments-transactions
- https://support.stripe.com/questions/payment-method-configurations-for-managed-payments
- https://support.stripe.com/questions/do-stripe-tax-reports-include-managed-payments
- https://stripe.com/blog/everything-we-announced-at-sessions-2026

**Standard Payments / Billing / general**
- https://docs.stripe.com/payments/checkout
- https://docs.stripe.com/payments/checkout/discounts
- https://docs.stripe.com/billing/subscriptions/coupons
- https://docs.stripe.com/customer-management
- https://docs.stripe.com/payments/currencies/localize-prices/adaptive-pricing
- https://docs.stripe.com/webhooks
- https://docs.stripe.com/billing/revenue-recovery/smart-retries (cited for Model A; not fetched in full)
- https://docs.stripe.com/billing/testing (cited for Model A; not fetched in full)
- https://docs.stripe.com/checkout/fulfillment (linked from the MP set-up guide; not fetched)

**Singapore accounts**
- https://support.stripe.com/questions/verification-requirements-for-stripe-accounts-in-singapore
- https://support.stripe.com/questions/2026-updates-to-singapore-verification-requirements
- https://support.stripe.com/questions/troubleshooting-invalid-business-type-in-singapore
- https://support.stripe.com/questions/selling-on-stripe-without-a-separate-business-entity

**Notes on evidence quality**
- Some pages were read through a summarizing fetcher, so their quotes are short paraphrase-checked phrases. This applies to the SG pricing page, support articles and the Sessions blog. The full MP Terms text was downloaded and read directly.
- The plain stripe.com/pricing URL served the Thailand page, so the Singapore figures come from `/en-sg/pricing`.
