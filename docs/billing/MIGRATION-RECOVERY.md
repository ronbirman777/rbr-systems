# TASK 032 migration recovery (0036-0043)

This document covers how to recover if one of the TASK 032 billing migrations (0036-0043) causes a problem in an environment. The rollback scripts are in `app/supabase/verification/`, one per migration:

| Migration | Rollback file |
|---|---|
| 0036 core tables | `0036_billing_core_tables_rollback.sql` |
| 0037 coupon engine | `0037_billing_coupon_engine_rollback.sql` |
| 0038 provisioning / lifecycle | `0038_billing_provisioning_lifecycle_rollback.sql` |
| 0039 access enforcement | `0039_billing_access_enforcement_rollback.sql` |
| 0040 payments / invoices | `0040_billing_payments_invoices_rollback.sql` |
| 0041 event / email primitives | `0041_billing_event_email_primitives_rollback.sql` |
| 0042 Space lifecycle guards | `0042_billing_space_lifecycle_guards_rollback.sql` |
| 0043 audio enforcement (B4b) | `0043_billing_audio_enforcement_rollback.sql` |

**Rollback is never automatic.** Nothing runs these files on its own: not CI, not the Supabase CLI (it only reads `migrations/`), not the application. Each file:

- refuses to run unless the operator sets `idw.rollback_confirm` to that file's token in the same session;
- re-checks the prerequisites it can see from SQL, and raises an exception (rolling back everything) if any one fails;
- runs as a single `begin; ... commit;` transaction and never uses `CASCADE`, so an unexpected dependent object makes it fail instead of silently dropping more than intended.

`app/src/lib/spaceTypes/billingRollback.test.ts` checks the following statically:

- every file exists;
- every object a migration creates is dropped by its rollback;
- each file is transactional, gated on its token, and free of `CASCADE`;
- each file refuses to run until the next-later rollback has run;
- every restored function body equals the previous migration's body, both after stripping comments and as raw text.

## 1. Prefer a forward fix

A forward fix is a new migration, numbered 0042 or later, that corrects the defect. It is the default response. Rolling back is a last resort, for these reasons:

- **The launch flag already gives an instant, data-preserving off switch.** `billing_settings.paid_checkout_enabled = false` is the default and is set through Admin with an MFA step-up. With the flag off, Space creation is the legacy 0017 behaviour, and every Space with no billing row behaves exactly as it did before TASK 032.
- **The application can be rolled back separately.** Promoting the previous Vercel Production deployment removes every TASK 032 code path. The additive tables and functions are inert without the application.
- **Only 0036 and 0040 hold data that a rollback destroys.** Dropping them loses financial and legal records (coupon terms, acceptances, exemptions) that exist nowhere else.
- **A rolled-back migration has to be reconciled with the ledger.** Its ledger row must be marked reverted before the same file can be re-applied. 0036 also cannot simply be re-applied if `admin_audit_log` was kept (see §4).

Use a rollback only when a forward fix is impossible or would take too long, and only with explicit owner approval for that environment. Production rollbacks follow the same rules as Production releases: an explicitly authorised task with all of its gates passing.

## 2. Dependencies between the migrations

An arrow `A -> B` means A depends on B. Hard dependencies are ones Postgres records and enforces (foreign keys, policy expressions, trigger-to-function links, `RETURNS SETOF <table>`). Call dependencies are calls inside plpgsql or SQL function bodies, which Postgres does not record. Breaking one only shows up as a runtime error.

| From | To | Kind | Detail |
|---|---|---|---|
| 0037 functions | 0036 tables | call | `coupons`, `coupon_redemptions`, `pending_space_checkouts`, `billing_plans` |
| 0038 `billing_provision_paid_space` | 0037 `billing_finalize_coupon_redemption` | call | in the same transaction |
| 0038 `billing_expire_open_checkouts` | 0037 `billing_release_coupon_reservation` | call | |
| 0038 `enforce_space_slot_capacity` (restated) | 0038 `billing_is_paid_checkout_required` -> 0036 `billing_settings` | call | |
| 0038 `enforce_space_slot_capacity` (restated) | 0036 `pending_space_checkouts` | call | trusted-provisioning proof |
| 0038 trigger `tenants_guard_delete_with_subscription` | 0038 `guard_tenant_delete_with_subscription` -> 0036 `space_subscriptions` | hard (trigger), call | |
| 0038 `space_access_state` / `space_studio_writable` / `space_audio_entitlements` | 0036 `space_subscriptions`, `billing_plans`, `space_subscription_addons` | call | |
| **0039 restrictive policies (20)** | **0038 `space_studio_writable`** | **hard** | dropping the function is refused while the policies exist |
| 0039 `publish_space` (restated) | 0038 `space_access_state` | call | |
| 0040 `billing_invoices` | 0036 `space_subscriptions`, `coupon_redemptions`, `tenants`, `auth.users` | hard (FK) | |
| 0040 constraint `billing_email_outbox_template_check` | 0036 `billing_email_outbox` | hard | 0040 adds the `payment_confirmation` template |
| 0041 columns | 0036 `space_subscriptions`, `billing_email_outbox` | hard | |
| 0041 `billing_claim_emails` | 0036 `billing_email_outbox` row type | hard (`RETURNS SETOF`) | |
| 0041 `billing_transition_checkout` | 0037 `billing_release_coupon_reservation` | call | |
| 0043 trigger `billing_guard_module_item_audio` on `module_items` | 0043 `billing_guard_module_item_audio` -> `billing_audio_policy` -> 0038 `space_audio_entitlements`, 0036 `space_subscriptions` | hard (trigger), call | |
| 0043 `publish_space` (restated) | 0043 `billing_audio_assert_publishable`, 0038 `space_access_state` | call | |

Functions that TASK 032 restates, and the definition each rollback restores:

| Function | Restated by | Previous definition (restored verbatim) | Expected `md5(pg_get_functiondef(...))` after rollback |
|---|---|---|---|
| `publish_space(uuid)` | 0039 | `0034_flow_daily_inspiration.sql` | `5088d120877f74c02f845df398206c14` (the Production value recorded before TASK 032 in `tasks/031/production-baseline.md`) |
| `handle_new_tenant()` | 0038 | `0001_init.sql` | `e3526abc627aa30a11616295c39cebef` (recorded on Staging before 0028) |
| `enforce_space_slot_capacity()` | 0038 | `0017_space_management_slots.sql` | `708dde46d74624be4cb93b48d4972991` (recorded on Staging before 0028) |
| `restore_space(uuid)` | 0042 | `0017_space_management_slots.sql` | `9a31bcf90162a2ce7001078d1fdbcfa0` (recorded on Staging before 0028) |
| `replace_space(uuid, text)` | 0042 | `0027_replace_space_reset_module_covers.sql` | `3a2af65a96d60ac2dfc90ee6f73d5236` (recorded on Staging before 0028) |
| `publish_space(uuid)` | 0043 | `0039_billing_access_enforcement.sql` | not recorded on a hosted project; `md5(prosrc)` = `85c5b820eab3e57a3e98ed4d455d312b` (0039 body; observed on a throwaway local database after the 0043 rollback) |

The test reproduces these three fingerprints from the rollback text, by rebuilding what `pg_get_functiondef` prints. No migration from 0002 to 0037 redefines or alters `handle_new_tenant` or `enforce_space_slot_capacity`. The Production values for those two were not recorded in this repository. Capture them in the release baseline before 0038 is applied, and confirm they match.

TASK 032 does not touch any other pre-existing object. 0036, 0037, 0040 and 0041 are purely additive. 0038 restates two trigger functions and adds one trigger on `tenants`. 0039 adds restrictive policies and restates `publish_space`.

## 3. Safe order

Roll back in strict reverse order, one file at a time, verifying each one before starting the next:

```
0043 -> 0042 -> 0041 -> 0040 -> 0039 -> 0038 -> 0037 -> 0036
```

Each file's guard refuses until the next-later rollback has run. The order is required in these places:

- 0043 must come first: its restated `publish_space` and its trigger call `space_audio_entitlements` (0038), and it restates `publish_space` on top of 0039. The 0042 file refuses while `billing_audio_policy` (0043) still exists.
- 0042 must come before 0038, because its restated `restore_space`/`replace_space` call `space_access_state`, `space_studio_writable` and `billing_is_paid_checkout_required`. The 0041 file refuses while the 0042 guard (`BILLING_LOCKED`) is still present.
- 0039 must come before 0038, because of the hard policy-to-function dependency and because `publish_space` calls `space_access_state`.
- 0038 and 0041 must come before 0037, because they call its functions.
- Everything must come before 0036, which owns the tables.

0040 and 0041 do not depend on each other, but the files enforce numeric order anyway so there is a single path to follow.

A partial rollback is valid. Stopping after 0039 is the most likely useful one: it removes all database enforcement and keeps every billing record. Stopping after 0038 additionally restores the legacy tenant-creation triggers.

### Prerequisites (every step)

1. Paid checkout is off: `billing_settings.paid_checkout_enabled = false`. The files check this.
2. There are no live paid subscriptions. Cancel them in Stripe and wait for the webhook to record the cancellation. Every `space_subscriptions` row must be `exempt`, `canceled` or `incomplete_expired`. The files check this.
3. There are no open or mid-payment checkouts. The 0038 and 0036 rollbacks check this. A customer who has paid but has not been provisioned must be provisioned or refunded first.
4. The application is on a pre-TASK-032 deployment, the Stripe webhook endpoint is disabled, and the billing cron routes are not scheduled. The TASK 032 code calls these functions, and the 0039 and 0038 rollbacks would make its Studio and webhook paths fail closed.
5. A fresh backup or PITR point exists and its time has been recorded.
6. Owner approval has been given, plus a separate explicit approval for every data-destructive step.

### What each step costs

| Rollback | Reversible by re-running the migration | Data-destructive | Notes |
|---|---|---|---|
| 0043 | yes | none | Audio limits on paid Spaces are enforced only by the Studio server actions again: a member could write `metadata.audioRef`/`durationSeconds` through PostgREST or publish through a direct RPC call |
| 0042 | yes | none | Restore/Replace stop consulting billing at the database; restore counts every owned Space against the legacy allowance again |
| 0041 | yes | small: `next_payment_attempt_at` (a copy of Stripe's retry time, re-derivable) and `claimed_at` (a send lease) | refuses while any email is `sending` |
| 0040 | yes (schema) | **yes: every `billing_invoices` row** (re-syncable from Stripe, but the local copy is lost) | refuses if any outbox row uses `payment_confirmation`; it never deletes those rows itself |
| 0039 | yes | none | Spaces governed by billing with no current `space_entitlements` row can no longer publish (pre-check query in the file); published snapshots are not affected |
| 0038 | yes | none (rows written through its functions become inert) | tenant creation reverts to 0017 behaviour; the server-side paid provisioning path disappears |
| 0037 | yes | none | coupon rows stay, but nothing can reserve or redeem them |
| 0036 | schema only | **yes: every billing table**, including exemptions (Lena, Return to Balance, QA), coupon terms, legal acceptances, the webhook ledger, the outbox and Admin grants | `admin_audit_log` is **kept** unless a second token is set |

Every data-destructive step starts with step 0, a `\copy` export of the affected tables, listed in that file. Store the export outside the repository, under the owner's control: it contains user ids, Stripe ids and legal-acceptance evidence. Record the row counts. The 0036 rollback prints the counts it is about to drop, so they can be compared with the export before it commits.

## 4. Running a step

From `app/`, against the environment's direct database connection:

```
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -c "set idw.rollback_confirm = '<token>'" \
  -f supabase/verification/<file>
```

| File | Token |
|---|---|
| 0043 | `0043` |
| 0042 | `0042` |
| 0041 | `0041-exported` |
| 0040 | `0040-exported` |
| 0039 | `0039` |
| 0038 | `0038` |
| 0037 | `0037` |
| 0036 | `0036-exported`; also `idw.rollback_drop_audit = '0036-audit-exported'` only to drop the audit trail |

Afterwards, mark that migration as reverted in the ledger, as a separate and explicit action. Check the version string first with `supabase migration list`:

```
supabase migration repair --status reverted <version>
```

**Re-applying after a rollback.** Mark the version reverted, then apply the same migration file again. There is one exception. If 0036 was rolled back but `admin_audit_log` was kept (the default), 0036 cannot be re-applied unchanged, because its `create table public.admin_audit_log` would fail. Re-introduce the billing tables with a new forward migration instead. Never edit 0036.

## 5. Verification queries (read-only)

Each rollback file ends with its own read-only checks. The queries below give a whole-picture check of where an environment stands. They are safe to run at any time.

```sql
-- Which TASK 032 objects exist right now.
select 'table' as kind, table_name as name from information_schema.tables
 where table_schema = 'public' and table_name in (
   'billing_settings','billing_plans','billing_customers','coupons','pending_space_checkouts',
   'space_subscriptions','space_subscription_addons','coupon_redemptions','billing_events',
   'billing_acceptances','billing_email_outbox','admin_users','admin_audit_log','billing_invoices')
union all
select 'function', p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and (p.proname like 'billing\_%' or p.proname in (
   'space_access_state','space_studio_writable','space_audio_entitlements',
   'guard_tenant_delete_with_subscription','admin_audit_log_immutable'))
union all
select 'policy', tablename || ': ' || policyname from pg_policies
 where policyname like '%: billing allows studio writes (%' or policyname like 'billing_invoices:%'
union all
select 'trigger', tgname from pg_trigger where tgname in (
   'tenants_guard_delete_with_subscription','admin_audit_log_no_update','admin_audit_log_no_truncate')
order by 1, 2;

-- Restated functions: compare with the table in section 2.
select p.proname, md5(pg_get_functiondef(p.oid)) as functiondef_md5,
       position('space_access_state' in pg_get_functiondef(p.oid)) > 0 as uses_billing_guard
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('publish_space','handle_new_tenant','enforce_space_slot_capacity');

-- Rollback prerequisites (all expected false / 0).
select (select paid_checkout_enabled from public.billing_settings) as paid_checkout_on,
       (select count(*) from public.space_subscriptions
         where status not in ('exempt','canceled','incomplete_expired')) as live_paid_subscriptions,
       (select count(*) from public.pending_space_checkouts
         where status in ('created','checkout_created','awaiting_payment','payment_confirmed','provisioning')) as open_checkouts;

-- Ledger state.
select version from supabase_migrations.schema_migrations where version >= '0036' order by version;

-- The legacy surface is intact: Space and content counts are unchanged from the baseline.
select (select count(*) from public.tenants) as tenants,
       (select count(*) from public.published_spaces) as published_spaces,
       (select count(*) from public.module_items) as module_items;
```

Run the prerequisites query only while 0036 is still present. After a full rollback those tables no longer exist.

## 6. What was verified, and what was not

**Verified statically, in this repository:**

- the restored bodies are copied verbatim from 0034, 0001 and 0017, and the test enforces this;
- the reconstructed `pg_get_functiondef` fingerprints equal the recorded baseline values;
- every created object has a matching drop.

**Rehearsed locally (2026-10-10):** every file has been executed, in order, on throwaway local databases by `app/supabase/verification/rehearse-billing-rollback.sh`. The guards refused on a missing or wrong token, the paid flag being on, a live subscription, out-of-order runs, a `sending` email, a `payment_confirmation` outbox row, and open or mid-payment checkouts. The rolled-back catalog equalled a fresh 0001-0035 database exactly, and re-applying 0036-0042 equalled a fresh 0001-0042 database exactly. The rehearsal found one defect, which is now fixed: the 0038 rollback did not refuse on an open checkout. See `ROLLBACK-REHEARSAL.md` for the results, the expected fingerprints after each step, and the hosted (Staging or branch) rehearsal plan.

**Not verified:** no rollback has been run on a hosted Supabase project. The ledger repair and re-push path has not been exercised. A hosted rehearsal requires owner approval (`ROLLBACK-REHEARSAL.md` §4).
