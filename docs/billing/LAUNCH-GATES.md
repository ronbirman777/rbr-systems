# Paid launch gates

Status: **paid checkout is OFF.** `billing_settings.paid_checkout_enabled` seeds `false` in 0036 and nothing in 0036-0041 turns it on. All legacy behaviour is unchanged while it is off.

## The flag

| Aspect | Fact |
|---|---|
| Where | `public.billing_settings` singleton row, no client grants (RLS on, all privileges revoked) |
| Read by | `billing_is_paid_checkout_required()` (DB trigger) and `getCreateMode()` / `ensureOpenCheckout` (app). A read error counts as OFF |
| Changed by | Admin Settings: `adminSetPaidCheckout`. Step-up MFA required. Audited (`settings.paid_checkout`); reverted if the audit write fails |
| Technical prerequisites enforced in code when enabling | Stripe configured for this mode; plan has a Stripe price; `checkPrice` matches the plan row (amount, currency, interval, active) |
| NOT enforced in code | Legal and tax gates below. Code cannot verify them, which is why the owner flips the flag deliberately |
| Effect when ON | Create flow becomes `paid` (if Stripe configured) or `unavailable`; direct client Space creation is refused by the DB (`PAYMENT_REQUIRED`) |

## Legal gates (blockers)

| Item | Current state in code | Status |
|---|---|---|
| Terms of Service version | `LEGAL_VERSIONS.terms = "draft-2026-10"` (`legal.ts`) | Draft identifier, no reviewed document. **Blocker** |
| Privacy Policy version | `"draft-2026-10"` | Draft. **Blocker** |
| Billing terms version | `"draft-2026-10"` | Draft. **Blocker** |
| Consent text id | `"checkout-consent-draft-2026-10"` | Draft. **Blocker** |
| Contracting operator (legal entity selling the service) | Not decided / not in code | Undecided. **Blocker** |
| Invoice issuer (legal name, address, numbering, what the document legally is) | Not stored; whatever Stripe renders from the Stripe account configuration | Undecided. **Blocker** |
| Tax registration (VAT/GST/sales tax) | None configured; `STRIPE_AUTOMATIC_TAX` off | Undecided. **Blocker** (see TAX.md) |
| Right of withdrawal / immediate-service consent | Two separate required booleans (`immediate_service_consent`, `withdrawal_acknowledged`), DB check requires both | Mechanism built; wording unreviewed. The translations (tr, it especially) are unreviewed by natives; "cayma hakkı" is flagged for legal review in the tr glossary |

`billing_acceptances` records which draft ids a buyer accepted; bump a version only together with the real, reviewed document.

## Operational gates

- [ ] Stripe Dashboard: invoice and receipt emails OFF (Settings > Billing > Emails), so exactly one email per payment (EMAILS-INVOICES.md)
- [ ] Resend: open and click tracking OFF on the sending domain; sender domain verified
- [ ] Webhook endpoint registered per mode with the events in STRIPE-MAPPING.md; secret stored as `STRIPE_WEBHOOK_SECRET`
- [ ] `CRON_SECRET` set on the target environment; cron confirmed running
- [ ] Admin: first Admin bootstrapped, TOTP enrolled, recovery procedure read (ADMIN-RECOVERY.md)
- [ ] Plan synced per mode (Admin "sync plan"); price-drift check passes
- [ ] Internal and legacy Spaces marked exempt where intended (Lena, Return to Balance, QA)
- [ ] Production migrations 0036-0041 applied (application state per environment not verified by this document)
- [ ] Real-Stripe Test-mode end to end on Staging completed (not yet evidenced)

## Stripe live key activation checklist

Do not start until every legal and operational gate above is closed and the task explicitly authorises it.

1. Stripe account activated for live payments under the decided operator; business details, payout account and tax settings complete.
2. Decide automatic tax and head-office address in Stripe Tax before any live charge (TAX.md).
3. Create a **restricted or secret live key**; store it only as `STRIPE_SECRET_KEY` on Production in Vercel. Never in git, logs or chat.
4. Create the live webhook endpoint; store its signing secret as `STRIPE_WEBHOOK_SECRET` on Production.
5. Set `CRON_SECRET`, `RESEND_API_KEY`, `BILLING_EMAIL_FROM` on Production.
6. Deploy; in Admin run "sync plan" (live product/price) and "sync coupon" for each coupon in live mode.
7. Verify live Price equals plan row (the flag toggle also checks this).
8. Disable Stripe customer emails (invoice, receipt, failed-payment) again for live mode if they are per-mode.
9. Do one controlled live purchase with an internal card, confirm Space provisioned, one email, invoice recorded; then refund per policy.
10. Only then set `paid_checkout_enabled = true` via Admin (step-up MFA).
11. Rollback: set the flag back to false in Admin. Existing paid Spaces keep working; new Spaces revert to the legacy flow.
