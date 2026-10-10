# Staging catalog baseline, 2026-10-10 (TASK 032, read-only)

Project: Staging `kkqjsspxupyxytddiumf` (the linked ref in `app/supabase/.temp/project-ref`).
Captured: 2026-10-10, with `supabase db query --linked` (Management API). Every statement was a `SELECT`. Nothing was written, and no rollback, DDL or repair was run. The CLI printed "Initialising login role...", which is its own temporary login-role handling for the Management API query path; no SQL of ours wrote anything.

This is the baseline a real Staging rollback rehearsal would start from. See `docs/billing/ROLLBACK-REHEARSAL.md`.

## Fingerprint method

The query is `tasks/032/fingerprints/fingerprint.sql`. It is the same text the local rehearsal uses, taken from `app/supabase/verification/rehearse-billing-rollback.sh`. It produces one sorted line for each of these:

- every `public` function: signature, `md5(pg_get_functiondef)` and ACL;
- every `public` relation: kind, RLS flag and ACL;
- every `public` column: type, not-null and a default md5;
- every `public` constraint: `md5(pg_get_constraintdef)`;
- every index in `public` and `storage`;
- every policy in `public` and `storage`: permissive, cmd, roles, and qual / with_check md5;
- every non-internal trigger in `public`, `storage` and `auth`.

"Comparable" means the full set minus `storage` indexes and triggers. Supabase's storage-api manages those, and their versions differ between hosted and local. The comparable set still includes every `storage.objects` policy.

## Result

| Set | Lines | md5 of the sorted file |
|---|---|---|
| Staging, full | 823 | `70f7bdc48477187006e021a9f5370e24` |
| Staging, comparable | 796 | `868f35d7f344ae4c02792f031addc0d9` |
| Local 0001..0042 (rehearsal), comparable | 796 | `868f35d7f344ae4c02792f031addc0d9` |
| Local 0001..0035 (rehearsal), comparable: **expected after a full Staging rollback** | 319 | `604435f98190abf98bd1a9cb6e931662` |

**Observed:** the comparable Staging catalog is identical, line for line, to a fresh local database with 0001..0042 applied. The full sets differ only in storage-api internals:

- the local storage schema has iceberg indexes and older `objects` version indexes;
- Staging has `idx_objects_delete_markers`, different `objects` version-index definitions, and three `protect_bucket_control_*` triggers on `storage.buckets`.

None of these is an InnerDweS object.

Files are in `tasks/032/fingerprints/`: `staging-2026-10-10-{full,comparable}.fp`, `local-pre0036-{full,comparable}.fp` and `local-post0042-{full,comparable}.fp`.

### Restated functions on Staging (`md5(pg_get_functiondef)`)

| Function | Staging now (0042 applied) | Equals local post-0042 | Expected after rollback |
|---|---|---|---|
| `publish_space(uuid)` | `db254f1eb184d2d25deb7f83dfb09ac1` | yes | `5088d120877f74c02f845df398206c14` |
| `handle_new_tenant()` | `34bbee47661ba2e561b396210532e2ef` | yes | `e3526abc627aa30a11616295c39cebef` |
| `enforce_space_slot_capacity()` | `c0aa990267c42c4564bf6eb7f243d1a6` | yes | `708dde46d74624be4cb93b48d4972991` |
| `restore_space(uuid)` | `6ab6da11bc94d61d1c4044856bce46f4` | yes | `9a31bcf90162a2ce7001078d1fdbcfa0` |
| `replace_space(uuid, text)` | `8713a71475f4591eda86c741851e35f6` | yes | `3a2af65a96d60ac2dfc90ee6f73d5236` |

### Ledger

`supabase_migrations.schema_migrations` has 41 rows. The tail is `0030 ... 0035, 0036, 0037, 0038, 0039, 0040, 0041, 0042`, so 0036..0042 are all recorded as applied. There is no 0023 file in the repository, which is why there are 41 rows.

### Billing row counts (and the rollback prerequisites)

| Table / check | Count |
|---|---|
| billing_settings | 1 (`paid_checkout_enabled = false`) |
| billing_plans | 1 |
| billing_customers | 0 |
| coupons | 0 |
| pending_space_checkouts | 0 (open or mid-payment: 0) |
| space_subscriptions | 0 (live: 0, exempt: 0) |
| space_subscription_addons | 0 |
| coupon_redemptions | 0 |
| billing_events | 0 |
| billing_acceptances | 0 |
| billing_email_outbox | 0 (sending: 0, payment_confirmation: 0) |
| admin_users | 0 |
| admin_audit_log | 139 |
| billing_invoices | 0 |
| tenants / published_spaces / module_items (legacy surface) | 5 / 4 / 79 |

Every prerequisite the rollback guards can see from SQL currently holds on Staging: the flag is off, there are no live subscriptions, no open checkouts, nothing in `sending` and no `payment_confirmation` rows. A rehearsal must re-check them immediately before it starts, because QA may have added rows by then.

## Backups (read-only CLI: `supabase backups list --project-ref kkqjsspxupyxytddiumf`)

- `pitr_enabled: false`, `walg_enabled: true`, region `ap-northeast-1`.
- Daily physical backups, status COMPLETED. The latest is `2026-10-09T17:14:00Z`; others are 10-08, 10-07, 10-06, 10-05, 10-04, 10-03 (two).
- **Assumption, not verified:** a restore is done from the dashboard (or `supabase backups restore`) and replaces the whole project database. A restore is approval-gated and was not tried. With no PITR, the restore point is the last daily backup, not the moment before the rehearsal. A rehearsal therefore needs its own logical export too (see the plan).
