# RLS, grants and policies (from migrations 0036-0045)

Stance: every new table has RLS enabled and `REVOKE ALL ... FROM public, anon, authenticated`. Only the narrow SELECT grants and policies below exist. Every write goes through service-role server code or SECURITY DEFINER functions. No browser client can write a billing row, substitute a Stripe id or change a price. `service_role` bypasses RLS as usual. Written from the migration text; the live grants on Staging/Production were not re-queried for this document.

## Tables

| Table (migration) | Client grants | Policies | Intent |
|---|---|---|---|
| `billing_settings` (0036) | none | none | Launch flag; server only |
| `billing_plans` (0036) | none | none | Trusted catalog; server only |
| `billing_customers` (0036) | none | none | Stripe customer map; a user never needs their Stripe id |
| `coupons` (0036) | none | none | Admin console and server only |
| `pending_space_checkouts` (0036) | `SELECT` to `authenticated` | `"pending_space_checkouts: users can select their own"`: `user_id = auth.uid()` | Success page reads own provisioning state; no client insert/update/delete |
| `space_subscriptions` (0036; column `next_payment_attempt_at` added 0041) | `SELECT` to `authenticated` | `"space_subscriptions: owners can select"`: `is_tenant_owner(tenant_id)` | Billing/Plan surface for the Space owner; no client write |
| `space_subscription_addons` (0036) | none | none | Entitlement infrastructure |
| `coupon_redemptions` (0036) | none | none | Reservation/redemption ledger |
| `billing_events` (0036) | none | none | Webhook idempotency and audit; ids and safe summaries only |
| `billing_acceptances` (0036) | none | none | Checkout consent evidence; inserted server-side |
| `billing_email_outbox` (0036; `claimed_at` 0041; template list widened 0040) | none | none | Transactional outbox |
| `admin_users` (0036) | none | none (deliberately) | Admin authorization; an ordinary user cannot read or grant themselves a row |
| `admin_audit_log` (0036) | none | none | Append-only: triggers `admin_audit_log_no_update` (UPDATE/DELETE) and `admin_audit_log_no_truncate` raise `42501` for every role incl. service role |
| `billing_invoices` (0040) | `SELECT` to `authenticated` | `"billing_invoices: billing owner can select"`: `user_id = auth.uid()` | Owner sees own payment history; Admin reads via service role behind MFA |

Foreign keys to `auth.users` are `ON DELETE SET NULL` on financial rows (anonymise, do not delete) except `admin_users` (cascade). Account deletion must refuse while a non-ended paid subscription exists (stated in the 0036 comment; the deletion routine itself was not audited here).

## Functions

All `SECURITY DEFINER` with `search_path = pg_catalog, pg_temp`, `REVOKE ALL FROM public, anon, authenticated`, `GRANT EXECUTE TO service_role`, **except**:

| Function | Grants | Why |
|---|---|---|
| `space_access_state(uuid, timestamptz)` (0038) | revoked from `public`, `anon`; executable by `authenticated`, `service_role` | RLS policies and owners need it. A signed-in non-member gets `decided=false, reason=forbidden` |
| `space_studio_writable(uuid)` (0038) | same | Used inside the restrictive policies |
| `handle_new_tenant`, `enforce_space_slot_capacity` (0038, restated, `security definer`, `search_path public`) | trigger functions (existing grants unchanged) | See ARCHITECTURE.md |
| `guard_tenant_delete_with_subscription`, `admin_audit_log_immutable` | revoked from all client roles | Trigger functions |
| `publish_space(uuid)` (0039 restated) | unchanged: `security invoker`, same signature and grants | Billing decision first, legacy guard as fallback |
| `restore_space(uuid)`, `replace_space(uuid, text)` (0042 restated) | unchanged: `security definer`, `search_path public`, executable by `authenticated` only | Refuse with hint `BILLING_LOCKED` when `space_studio_writable()` is false (see below) |
| `billing_audio_policy(uuid)`, `billing_audio_assert_publishable(uuid, jsonb)` (0043) | revoked from `public`, `anon`; executable by `authenticated`, `service_role` | Called from the audio trigger and `publish_space`; a signed-in non-member gets `unavailable` |
| `billing_guard_module_item_audio()` (0043) | revoked from all client roles | Trigger function on `module_items` |
| `publish_space(uuid)` (0043 restated) | unchanged: `security invoker`, same signature and grants | Adds one marked audio check before the snapshot is written |
| `billing_media_member_write_allowed(text, text)` (0045) | `security definer`, `search_path = pg_catalog, pg_temp`; revoked from `public`, `anon`; executable by `authenticated`, `service_role` | Used inside the two 0045 Storage policies (they run as `authenticated`). Legacy/exempt -> true; enforced or unavailable -> member INSERT only for a versioned `draft.{mp3,m4a,aac,wav,ogg}`, never UPDATE |
| `billing_guard_published_media()` (0045) | revoked from all client roles; `security invoker`, `search_path public` | Trigger function on `published_spaces` |
| `set_guest_access_code(uuid, text)`, `disable_guest_access_code(uuid)`, `submit_featured_listing(uuid, text, text, text, text, jsonb)` (0044 restated) | unchanged from 0016: `security definer`, `search_path public`, revoked from `public`, `anon`; executable by `authenticated` | Refuse with hint `BILLING_LOCKED` when `space_studio_writable()` is false (see below) |

Service-role-only functions: `billing_normalize_coupon_code`, `billing_reserve_coupon`, `billing_release_coupon_reservation`, `billing_expire_stale_reservations`, `billing_finalize_coupon_redemption`, `billing_record_discount_cycle`, `billing_is_paid_checkout_required`, `billing_confirm_checkout_payment`, `billing_fail_checkout`, `billing_expire_open_checkouts`, `billing_provision_paid_space`, `billing_apply_subscription_state`, `billing_apply_lifecycle`, `billing_set_next_action`, `billing_set_internal_exempt`, `billing_clear_internal_exempt`, `space_audio_entitlements`, `billing_set_next_payment_attempt`, `billing_claim_event`, `billing_finish_event`, `billing_enqueue_email`, `billing_claim_emails`, `billing_finish_email`, `billing_transition_checkout`, `billing_upsert_invoice`, `billing_set_invoice_refund`.

## Restrictive write policies (0039, 20 policies)

`AS RESTRICTIVE ... TO authenticated`, ANDed with the existing permissive policies (which still decide WHO may write). They only add "billing has not suspended Studio writes for this Space" via `space_studio_writable(tenant_id)`. SELECT is never restricted, so a suspended owner can still sign in, see the problem and recover. Legacy Spaces (no billing row) return true.

| Table | Operations restricted |
|---|---|
| `brand_configs` | insert, update |
| `module_configs` | insert, update |
| `module_items` | insert, update, delete |
| `module_settings` | insert, update, delete |
| `schedule_items` | insert, update, delete |
| `published_spaces` | insert, update, delete |
| `tenants` | update (uses `id`) |
| `storage.objects` (bucket `tenant-media` only; first path folder must be the tenant uuid, other buckets and non-uuid folders pass) | insert, update, delete |

## Media content guard (0045)

Two more `AS RESTRICTIVE ... TO authenticated` policies on `storage.objects`, scoped to bucket `tenant-media` (other buckets pass), ANDed with the 0006/0030 permissive policies, 0029's versioned-immutability policy and the 0039 billing-writable policies:

| Policy | Command | Expression |
|---|---|---|
| `"tenant media: paid spaces accept member uploads of draft audio only"` | insert (with check) | `bucket_id <> 'tenant-media' or billing_media_member_write_allowed(name, 'insert')` |
| `"tenant media: paid spaces refuse member overwrites"` | update (using + with check) | `bucket_id <> 'tenant-media' or billing_media_member_write_allowed(name, 'update')` |

DELETE and SELECT are not restricted. `service_role` bypasses RLS, so the application's validated image writes and published copies (lib/media/trustedMedia.server.ts) are unaffected; the application re-checks membership and `space_studio_writable()` itself before using the service role. Legacy and exempt Spaces: the predicate returns true, so nothing changes.

Trigger `billing_guard_published_media` (BEFORE INSERT OR UPDATE on `published_spaces`, only when `modules` or `tenant_id` changes): on an enforced Space every `imageRef` in the snapshot must be null, empty or `{tenant}/{2-3 segments}/{draft|published}.{webp,png,jpg,jpeg}` (hint `MEDIA_REF_INVALID`), and `billing_audio_assert_publishable` (0043) runs on the written row (hint `AUDIO_LIMIT`). This also covers a direct owner write to `published_spaces` (the owner holds INSERT/UPDATE through the 0017 policies because `publish_space()` is SECURITY INVOKER). Rollback: `0045_billing_media_content_guard_rollback.sql`.

## SECURITY DEFINER Studio writes (0042, 0044)

A SECURITY DEFINER function runs as its owner, so the 0039 restrictive policies never see the rows it writes. Every pre-existing definer RPC that performs a Studio write for a tenant therefore checks the same predicate itself, right after its ownership check and before any write:

| Function | Guarded by | Refusal |
|---|---|---|
| `restore_space`, `replace_space` | 0042 | `errcode P0001`, hint `BILLING_LOCKED` |
| `set_guest_access_code`, `disable_guest_access_code`, `submit_featured_listing` | 0044 | `errcode P0001`, hint `BILLING_LOCKED` |

`space_studio_writable()` is true for every Space billing does not decide (no billing row, or an expired exemption), so legacy Spaces behave exactly as before; it is also true for exempt, active, payment-issue and guest-suspended paid Spaces. It is false only for Studio-suspended, ended and incomplete/paused subscriptions. A non-owner is refused by the ownership check first and never learns the billing state. The Studio actions (`lifecycleActions.ts`, `guestAccessActions.ts`, `featuredActions.ts`) pre-check the same predicate and map a database `BILLING_LOCKED` refusal to the localized "billing must be resolved" message. `archive_space` is deliberately not gated (see 0042).

Rollback: `app/supabase/verification/0039_billing_access_enforcement_rollback.sql` (the file named in the 0039 header) drops the 20 restrictive policies and restores the 0034 `publish_space` body verbatim. Run it only in the order and under the conditions given in `MIGRATION-RECOVERY.md`. Rollback files for 0036-0045 sit beside it.
