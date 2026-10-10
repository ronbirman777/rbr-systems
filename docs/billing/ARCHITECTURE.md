# TASK 032 - Billing architecture

Grounded in migrations `0036`-`0041` and `app/src/lib/billing/**`. Where something is not implemented, it says so.

## Authority split

| Concern | Authority |
|---|---|
| Money movement, invoice documents, subscription billing state | Stripe |
| Product state: who pays, for which Space, which plan/coupon, what happens next, access | InnerDweS database (synchronised from verified Stripe objects) |
| Price, currency, interval | `billing_plans` row only. The browser never names a price. |

## Components

| Component | Location | Role |
|---|---|---|
| Launch flag | `billing_settings.paid_checkout_enabled` (0036) | Server-side singleton; read by app (`funnelMode.ts`, `checkout.ts`) and by the DB trigger (0038) |
| Trusted plan catalog | `billing_plans` (0036) | `space_monthly_usd`, 2500 USD minor units / month, per-mode Stripe ids |
| Checkout service | `checkout.ts` | `previewCheckout`, `startCheckout`, `cancelCheckoutByUser` |
| Provisioning | `provisioning.ts` + `billing_provision_paid_space` (0038) | The only way a paid Space is created |
| Webhook | `app/api/billing/webhook/route.ts`, `webhook.ts` | Signature-verified, fetch-on-event |
| Sync | `sync.ts` | `syncSubscription`, `processInvoice` |
| Reconcile | `reconcile.ts` | Server-to-server recovery of a missed webhook; `getCheckoutUiState` for the success page |
| Cron | `app/api/cron/billing/route.ts`, `lifecycleJob.ts`, `vercel.json` (`*/15 * * * *`) | Expire, reconcile, resync, lifecycle, email flush |
| Access decision | `space_access_state()` (0038) / `access.ts` | Unified, SQL and TS twins |
| Email outbox | `billing_email_outbox` (0036/0041), `emails/**` | Transactional outbox, Resend sender |
| Admin console | `app/(site)/admin/**`, `lib/billing/admin/**` | admin_users + MFA, audit log |
| Stripe adapter | `stripe/gateway.ts`, `stripe/real.ts`, `stripe/mappers.ts` | Only file set that touches Stripe SDK shapes |

## Data flow: funnel to Space

```
/create (Create New Space) --previewCheckout--> pending_space_checkouts (created)
        |                                          + optional coupon reservation
        v startCheckout: consent -> trusted plan -> price-drift guard -> open pending
        |   -> coupon reserve + Stripe coupon drift check -> billing_acceptances
        |   -> Stripe customer (idempotent) -> Stripe Checkout Session (mode=subscription)
        v   status: checkout_created
Stripe hosted Checkout --pays--> redirect /create/complete?c=<pendingId>   (NOT trusted)
        |
        +--> webhook checkout.session.completed / async_payment_succeeded
        |      -> claim event -> retrieve session from Stripe -> provisionFromVerifiedSession
        +--> or reconcile (success-page poll /api/billing/checkout-status, or cron)
               -> retrieve session -> the SAME provisionFromVerifiedSession
                    -> billing_provision_paid_space (one transaction)
                    -> seedSpace defaults, process first invoice, refresh next action
```

The funnel is only used when `getCreateMode()` returns `paid` (flag on AND `STRIPE_SECRET_KEY` present). Flag off returns `legacy` (the pre-existing free flow, unchanged); flag on without Stripe returns `unavailable`. Any read error is treated as flag off.

## Provisioning only after verified payment

- A pending checkout never grants access. The success redirect carries no authority: opening `/create/complete` by hand yields `awaiting_payment`, never a Space.
- `provisionFromVerifiedSession` requires: the pending record exists; its `stripe_mode` equals the deployment mode; metadata `user_id`, `pending_checkout_id`, customer and session id all match; session `status = complete` with `payment_status` paid or `no_payment_required`; a subscription id. It then re-retrieves the subscription from Stripe and requires `active` or `trialing`.
- `billing_provision_paid_space` locks the pending row `FOR UPDATE`, in one transaction: upserts `billing_customers`, inserts `tenants`, `space_subscriptions`, finalises the coupon redemption, links `billing_acceptances`, marks `provisioned`. A repeat call returns `already_provisioned` with the same tenant. Any exception rolls the whole transaction back; the caller records `billing_fail_checkout` (status `failed`, recoverable by reconcile).
- Database enforcement of "no Space before payment" (0038): `enforce_space_slot_capacity` refuses a direct client tenant insert with hint `PAYMENT_REQUIRED` once the flag is on. The trusted path proves itself with the transaction-local setting `idw.provisioning = <pending checkout id>`, honoured only if that checkout is in `provisioning` and belongs to `new.created_by`. `handle_new_tenant` uses `coalesce(auth.uid(), new.created_by)` as owner. With the flag off and no provisioning context the trigger behaves as the 0017 definition.
- `guard_tenant_delete_with_subscription` refuses deleting a Space whose subscription status is not `exempt`, `canceled` or `incomplete_expired` (hint `ACTIVE_SUBSCRIPTION`).

## Webhook: fetch-on-event

`handleStripeWebhook`: (1) verify signature, timestamp tolerance (Stripe SDK `constructEvent`) and `livemode` equals the deployment mode, else 400; (2) `billing_claim_event`; (3) route; (4) `billing_finish_event`. Handlers do not trust the event body: they take only the object id and re-retrieve the session / subscription / invoice from Stripe, so duplicate, delayed or out-of-order events converge on Stripe's current truth. The event table stores ids and safe summaries only, never the raw payload.

Response codes: 400 bad signature; 200 `duplicate`; 409 `in progress` (Stripe retries); 200 `processed|ignored`; 200 `rejected:<code>` for permanent mismatches (`metadata_mismatch`, `wrong_mode`, `checkout_not_found`, stays `failed` for Admin); 500 on other failures (event marked `failed`, re-claimable); 503 if Stripe is not configured. The route and `/api/cron/billing` are the only paths exempt from the preview gate (`MACHINE_ENDPOINT_PATHS`, exact match).

## Idempotency map

| Operation | Mechanism |
|---|---|
| Webhook event | `billing_events` unique `(stripe_mode, stripe_event_id)`; `billing_claim_event` returns claimed / duplicate / in_progress; a `processing` claim older than 5 minutes is re-claimed; `failed` is re-claimable |
| Provisioning | pending row lock + `provisioning_key` unique + status check; one pending checkout gives one Space |
| Open checkout | partial unique index: one open checkout per `(user_id, space_type)` |
| Stripe customer / checkout session / coupon / product / price creation | Stripe idempotency keys (`idw-customer-…`, `idw-checkout-<pending>-<attempt>`, `idw-coupon-…`, `idw-product-…`, `idw-price-…`) |
| Coupon cycle counting | `coupon_redemptions.last_cycle_invoice_id` |
| Invoice | unique `(stripe_mode, stripe_invoice_id)`; `billing_upsert_invoice` never regresses `paid`/`void`; `newly_paid` true only on the transition |
| Lifecycle stamps | set once, to the deterministic deadline, only while the failure episode is open |
| Emails | `billing_email_outbox.dedupe_key` unique; lease via `billing_claim_emails`; provider `Idempotency-Key` = `idw-billing-email-<row id>` |

## Outbox

`billing_enqueue_email` (insert `ON CONFLICT (dedupe_key) DO NOTHING`) then `billing_claim_emails` (leases up to 20 due rows, `attempts < 5`, `FOR UPDATE SKIP LOCKED`; a `sending` row is re-leased only if its own `claimed_at` is older than 10 minutes) then `billing_finish_email` (only lands on a still-`sending` row). No `RESEND_API_KEY`/`BILLING_EMAIL_FROM` means no sender: emails stay queued. A recipient without an address is `skipped`. Templates in the DB allow-list: `subscription_started`, `payment_confirmation`, `payment_failed`, `guest_unavailable`, `studio_suspended`, `final_warning`, `cancellation_scheduled`, `subscription_ended`, `payment_recovered`. Seven are live (`EMAIL_TEMPLATES` in `lib/billing/emails/templates.ts`). `subscription_started` and `payment_recovered` are **retired** (kept in the DB check for compatibility, no migration): activation is the `first` variant and recovery the `recovered` variant of `payment_confirmation`, so a separate email would duplicate it. Enqueue refuses them, and a stray row is marked `skipped` ("retired template") by the outbox. See EMAILS-INVOICES.md.

## Unified access decision (SQL and TS parity)

`space_access_state(tenant, now)` (0038) and `deriveSpaceAccess()` (`access.ts`) implement the same table and are driven by shared vectors in `lib/billing/vectors/accessVectors.json` (the SQL side is exercised by `scripts/billing-db-verify.mjs` on Staging).

| Condition (evaluated in order) | decided | Studio writable | Guest available | Can publish | reason |
|---|---|---|---|---|---|
| No billing row | no (legacy fallback) | true | - | - | `no_subscription` |
| `exempt`, expired (`exempt_expires_at` reached) | no (legacy fallback) | true | - | - | `exemption_expired` |
| `exempt` | yes | true | true | true | `exempt` |
| `canceled`, `incomplete_expired`, or cancel-at-period-end and now > period end + 6h | yes | false | false | false | `subscription_ended` |
| `incomplete`, `paused` | yes | false | false | false | `subscription_not_active` |
| failure episode, now >= failed_at + 168h | yes | false | false | false | `studio_suspended` |
| failure episode, now >= failed_at + 24h | yes | true | false | true | `guest_suspended` |
| failure episode, under 24h | yes | true | true | true | `payment_issue` |
| otherwise | yes | true | true | true | `active` |

SQL extra: a signed-in caller who is not a member of the Space gets `decided=false, reason=forbidden` (no cross-Space billing visibility). Suspension never touches content or the published snapshot; recovery restores the Guest App with no republish.

Enforcement points: restrictive RLS write policies (0039, 20 policies, see RLS-GRANTS.md); `publish_space()` calls `space_access_state` first and falls back to the legacy `space_entitlements` guard only when `decided` is false; `combineCommercialAvailability()` (`commercialAccess.ts`) feeds the application layer; `studioGate.ts` renders the suspended gate.

## Legacy / internal exemption

Spaces without a billing row (every Space existing before 0036) take the legacy path byte-for-byte: nothing is locked or unlocked by this task. Internal Spaces (Lena, Return to Balance, QA) are marked with `space_subscriptions.status = 'exempt'` via `billing_set_internal_exempt` (reason of at least 5 characters, actor, optional expiry; refuses to overwrite a paid subscription). Exempt rows create no Stripe subscription, are ignored by `billing_apply_subscription_state` (`ignored_exempt`), and never count in paid metrics. Admin set/clear needs MFA step-up and is audited. Which Spaces are currently marked exempt on Staging or Production was not verified for this document.

## Media on paid Spaces: trusted writer (0043 audio, 0045 images)

For a billing-governed (paid, non-exempt) Space the database lets member sessions create only one kind of tenant-media object: a versioned draft audio file (the browser-direct upload, measured by the service role at attach - 0043). Everything else - every image object and every published copy - is written by the service role after the server has validated the bytes:

- Upload: Server Action -> `sniffImage` (JPEG/PNG/WebP magic bytes and header, every Space) -> sharp WebP re-encode -> `storeDraftImage` (service role on a paid Space, after a membership and `space_studio_writable` check; member session elsewhere).
- Publish: `resolveMediaWriter` picks the client once per publish; on a paid Space `copyDraftToPublished` / `copyDraftAudioToPublished` run on the service role, only for the tenant's own drafts, and each new published image is re-read and must be a canonical WebP (reject + delete both objects, publish fails before the RPC).
- Database (0045): restrictive Storage INSERT/UPDATE policies (member: draft audio only, no overwrite) and the `published_spaces` trigger (image refs must name the Space's own image paths; 0043's audio check re-run on the written row).
- Serve: `/api/media` additionally refuses a path whose extension does not match the snapshot field that names it.

Legacy and exempt Spaces keep member-session writes; only the upload content check and the serve-time extension check apply to them. Details and the residual risks: ENTITLEMENTS.md, "Media content guard (0045)".

## Not implemented (stated plainly)

- Paid add-ons are not sold; no code writes `space_subscription_addons`.
- Listening minutes (100000/month) are display-only; nothing meters playback (ENTITLEMENTS.md). Audio library and per-recording limits are enforced since 0043 (B4/B4b).
- The 14-day "deletion eligible" stamp opens a workflow only; no deletion job exists (see LIFECYCLE.md).
- `subscription_started` and `payment_recovered` are retired templates (allowed by the DB, never enqueued or rendered; see EMAILS-INVOICES.md).
