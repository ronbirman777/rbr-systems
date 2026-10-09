# Coupons

Tables `coupons` and `coupon_redemptions` (0036), functions in 0037. No client access to either table. All functions are SECURITY DEFINER, executable by `service_role` only.

## Definition

| Field | Rule |
|---|---|
| `code` / `normalized_code` | 3-32 chars; lookup key is `upper(btrim(code))`, the only unique column, so codes differing by case or whitespace cannot coexist. Matching is case-insensitive |
| Discount | `percent` (0 < p <= 100) or `fixed_amount` (minor units + currency). A fixed amount at or above the plan price, or in another currency, is `not_applicable` |
| `duration_type` | `once` (1 cycle), `repeating` (`duration_cycles` 2-60 in the Admin schema, >= 2 in DB), `forever` |
| Applicability | `plan_keys`, `space_types` (null = any) |
| `global_max_redemptions` | Optional cap on successful redemptions |
| `max_redemptions_per_user` | Column exists, enforced in the reserve function, but the Admin form does not set it (reserved for later) |

## Usage rules (per coupon, snapshotted on each redemption)

| `usage_rule` | Meaning | Enforcement |
|---|---|---|
| `once_per_user` | The same user may use it once across all Spaces | Check under the coupon row lock + partial unique index `(coupon_id, user_id)` over reserved/redeemed/completed/canceled |
| `once_per_space` | Never twice for the same Space | Partial unique `(coupon_id, tenant_id)` over used rows. For a brand-new purchase the Space does not exist at reservation, so it binds only once a tenant is attached (future re-subscription flows; none exist yet) |
| `unlimited_during_validity` | Repeatable across Spaces while the window is open | Only the one-coupon-per-checkout index applies |

A universal `UNIQUE(user, coupon)` is deliberately not used (it would forbid the unlimited rule).

## Validity window vs discount duration

Two different concepts:

- `valid_from` / `valid_until`: decide only whether a **new reservation** may start (`not_started`, `expired`).
- `duration_type` / `duration_cycles`: how long an **already redeemed** discount continues. `billing_record_discount_cycle` never reads `valid_until`, so closing the window never cuts a running discount short.
- For a monthly plan one cycle is one month; `discount_ends_at` = start + N months (null for `forever`).

## Reservation lifecycle

```
typing / Apply  -> reserve (status reserved, expires in 75 min)   [not a redemption]
Start checkout  -> same reservation, Stripe coupon drift check
paid + provisioned -> finalize -> redeemed (terms + window stamped, same transaction as the Space)
each paid cycle invoice -> cycles_completed + 1 (idempotent per invoice id) -> completed when used up
abandoned / expired checkout / coupon removed / replaced -> released | expired
```

Statuses: `reserved`, `redeemed`, `completed`, `canceled`, `released`, `expired`. Abandoned reservations never consume the global cap or a once-per-user allowance: stale `reserved` rows are expired lazily on every reserve and in bulk by the cron job.

`billing_reserve_coupon` takes `SELECT ... FOR UPDATE` on the coupon row, so concurrent attempts (last cap slot, double tab) queue and re-read committed state. It returns refusals as data: `invalid`, `inactive`, `not_started`, `expired`, `not_applicable`, `unavailable` (no Stripe counterpart in this mode), `already_used`, `in_use_elsewhere`, `limit_reached`, `checkout_closed`. Re-applying the same coupon to the same checkout is idempotent; switching coupons releases the previous reservation.

Late payment: if a reservation expired but the customer genuinely paid the discounted price, finalize revives it when policy still allows; if another customer took the allowance meanwhile it returns `coupon_overrun` and the paying customer still gets their Space.

Stripe truth: if a cycle invoice shows no discount applied, the redemption is closed (`completed_discount_not_applied`) so Admin never claims a discount Stripe stopped giving.

## Immutability

- Terms are snapshotted onto `coupon_redemptions` at reservation. Editing or disabling a coupon affects only new redemptions.
- Once any reservation or redemption exists, `checkCouponUpdate` locks the financial fields: discount type, percent, amount, currency, duration type, cycles, usage rule (`financial_terms_locked`). Dates, active flag, description and applicability stay editable; the cap cannot go below usage (`cap_below_usage`); the code itself is frozen once used.
- Unused coupon with changed financial terms: a **new** Stripe coupon is created (Stripe coupons are immutable) and the new id replaces the mode column.

## Stripe sync

- Create: DB row first, then the Stripe coupon (idempotency key includes the terms), then the id is saved and audited; on any failure the unused row is deleted.
- "Sync coupon" creates the counterpart in the deployment's current mode (needed after switching a deployment to Live); test and live ids are separate columns.
- A coupon with no Stripe id in the current mode cannot be reserved (`unavailable`), preventing "Admin says 10%, Stripe charges 20%".
- At `startCheckout`, `couponMatchesStripe` re-reads the Stripe coupon and compares type, value, currency, duration and months; any difference releases the reservation (`stripe_coupon_drift`) and refuses.
- Admin step-up: create when `forever` or percent >= 50; update when it has redemptions.
