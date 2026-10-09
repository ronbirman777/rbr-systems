# Stripe mapping

## Objects

| Stripe object | Used for | InnerDweS record | Notes |
|---|---|---|---|
| Customer | One per account per mode | `billing_customers` (unique `(user_id, stripe_mode)` and `(stripe_mode, stripe_customer_id)`) | Created with idempotency key `idw-customer-<mode>-<user>`; metadata `innerdwes_user_id` only |
| Product / Price | The base plan | `billing_plans.stripe_{test,live}_{product,price}_id` | Created by Admin "sync plan"; checkout refuses unless Price amount, currency, interval (count 1) and `active` equal the plan row (`price_drift`) |
| Coupon | The discount attached to a session | `coupons.stripe_{test,live}_coupon_id`, snapshot in `coupon_redemptions.stripe_coupon_id` | Stripe never sees the customer-typed code; `allow_promotion_codes: false`. Promotion codes are not used |
| Checkout Session (`mode: subscription`) | Payment page | `pending_space_checkouts.stripe_checkout_session_id` | `client_reference_id` = pending checkout id; metadata `pending_checkout_id`, `user_id`, `space_type`, `plan_key`, `coupon`; TTL 60 min |
| Subscription | One per Space | `space_subscriptions` (one row per tenant, unique `(mode, subscription id)`) | Metadata copied from the session |
| Invoice | Each billing event | `billing_invoices` (unique `(mode, invoice id)`) | Stripe-hosted URLs stored; Stripe is the issuer of the document |
| PaymentIntent / Charge | Receipt URL, refund mapping | `billing_invoices.receipt_url`, `amount_refunded_minor` | Best effort |
| Billing Portal session | Update payment method | not stored | `openBillingPortalAction` |

Money is integer minor units everywhere. Cancel is `cancel_at_period_end` (no automatic refund). Stripe API calls use `maxNetworkRetries: 2`.

## Subscription state mapping

Stripe `status` is stored verbatim in `space_subscriptions.status` (an unknown status throws in the mapper). Local-only extra value: `exempt`.

| Stripe status | Stored | Access (`space_access_state`) |
|---|---|---|
| `incomplete` | `incomplete` | Studio, Guest, publish off (`subscription_not_active`). Never creates a Space: provisioning requires active/trialing |
| `incomplete_expired` | same | ended; episode closes |
| `trialing`, `active` | same | full access unless a failure episode is open |
| `past_due`, `unpaid` | same | failure episode starts if not open: `payment_failed_at` = observed failure time or now |
| `paused` | `paused` | off (`subscription_not_active`) |
| `canceled` | `canceled` | ended; `ended_at` stamped once; `subscription_ended` email |
| any + `cancel_at_period_end` | flag stored | after period end + 6h treated as ended even if the delete webhook was missed |
| (local) | `exempt` | everything on; Stripe state ignored |

Failure and recovery are derived from the latest invoice (`sync.ts subscriptionToState`): `latest_invoice_failed` is true if forced by a `payment_failed` event, or the latest invoice is `open` with `attempt_count > 0` and the subscription is not `incomplete*`. Recovery = status active/trialing and not failed while an episode was open: clears `payment_failed_at`, guest/studio suspension, warning and deletion stamps, stamps `recovered_at`.

## Webhook events handled (`webhook.ts`)

Subscribe the endpoint to exactly these; anything else is acknowledged as `ignored`.

| Event | Handling |
|---|---|
| `checkout.session.completed`, `checkout.session.async_payment_succeeded` | Retrieve session, `provisionFromVerifiedSession` |
| `checkout.session.expired` | Pending checkout to `expired` (releases coupon reservation) |
| `customer.subscription.created`, `.updated`, `.deleted`, `.paused`, `.resumed`, `.pending_update_applied` | `syncSubscription` (re-fetch and apply) |
| `invoice.paid`, `invoice.payment_succeeded` | `processInvoice`: record, count discount cycle (only `subscription_create`/`subscription_cycle` invoices), apply state, queue the one confirmation email |
| `invoice.payment_failed` | `processInvoice` with failure time = event time; queues `payment_failed` (not for `subscription_create`) |
| `invoice.finalized`, `.updated`, `.voided`, `.marked_uncollectible`, `.created` | Record only; no email |
| `charge.refunded` | Find the invoice via the PaymentIntent and mirror `amount_refunded_minor` |

Not handled: `checkout.session.async_payment_failed`, dispute events, `customer.deleted`, payment-method events, `invoice.upcoming`. Each event's body is never trusted: only the object id is used (fetch-on-event).

## Webhook behaviour table

| Case | Response |
|---|---|
| Invalid or missing signature, or wrong `livemode` | 400 |
| Already processed | 200 `duplicate` |
| Being processed now | 409 (Stripe retries) |
| `metadata_mismatch`, `wrong_mode`, `checkout_not_found` | 200 `rejected:<code>`, event stays `failed` for Admin |
| Any other error | 500, event `failed`, re-claimable |
