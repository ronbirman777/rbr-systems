# TASK 032 rollback rehearsal (0036-0045)

This document follows on from `MIGRATION-RECOVERY.md`. §6 of that document said the rollback files had never been run against a database. This one records where they have now been run, what happened, and the plan for a hosted rehearsal, which still needs approval.

## 1. What was rehearsed, and where

**Where:** throwaway local databases only (`rbr_rh_*`). They were created inside the local Supabase Postgres container `supabase_db_app` (image `public.ecr.aws/supabase/postgres:17.6.1.167`, PostgreSQL 17.6) on the owner's machine, on 2026-10-10, and dropped afterwards. The local Colima VM was started to run it.

- Staging and Production were not touched.
- No Supabase branch or project was created.
- The local `postgres` database was only read: `pg_dump --schema-only` of `auth`, `storage` and `extensions`, used as scaffolding.

**How to reproduce** (from `app/`):

```
./supabase/verification/rehearse-billing-rollback.sh            # KEEP=1 keeps the dbs, OUT=dir keeps the files
```

The script refuses anything that is not local:

- the host in `LOCAL_DB_URL` must be a loopback address;
- any `supabase.co`, `supabase.com` or `pooler.` URL, including in `DATABASE_URL` or `SUPABASE_DB_URL`, aborts the run;
- in container mode, the container must publish the port that the URL names;
- it only creates and drops databases named `rbr_rh_*`.

**Databases:**

| db | contents |
|---|---|
| `rbr_rh_pre` | 0001..0035, giving the expected pre-TASK-032 catalog |
| `rbr_rh_m42`, `rbr_rh_m43` | 0001..0042 and 0001..0043 (intermediate references, added with the 0043/0044 extension, §2b) |
| `rbr_rh_full` | 0001..0044 (0001..0042 in the first runs, §2), then synthetic billing data, giving the expected post-0044 catalog |
| `rbr_rh_rb` | a clone of `full`, which is guard-tested, rolled back 0044 (first runs: 0042) to 0036, then re-applied forward |
| `rbr_rh_keepaudit` | a clone taken just before the 0036 rollback, used to run 0036 with its default (audit log kept) |

Default privileges were set the way Supabase sets them: `postgres` grants all on new `public` tables, sequences and functions to `anon`, `authenticated` and `service_role`. The migrations' own `revoke`s then act as they do on a hosted project. This was checked against Staging. A local 0001..0042 catalog is line-for-line identical to Staging's comparable catalog (`tasks/032/staging-fingerprints-2026-10-10.md`).

**Synthetic data**, all at RFC 2606 `.invalid` addresses with fixed UUIDs:

- one `auth.users` row;
- 2 tenants, one exempt and one with a canceled paid subscription;
- a Stripe test customer;
- a coupon and a completed redemption;
- a provisioned checkout;
- a processed webhook event;
- an acceptance;
- a sent outbox email, with `claimed_at` set;
- an Admin user and an audit row;
- a paid invoice;
- `next_payment_attempt_at` set on the subscription.

**Fingerprint:** one sorted line per catalog fact. The query is `tasks/032/fingerprints/fingerprint.sql`. It covers:

- every `public` function: signature, `md5(pg_get_functiondef)` and ACL;
- every `public` relation: kind, RLS and ACL;
- every column, with type, not-null and default;
- every constraint;
- indexes in `public` and `storage`;
- policies in `public` and `storage`;
- non-internal triggers in `public`, `storage` and `auth`.

The "comparable" form drops `storage` indexes and triggers, which storage-api manages and which differ between hosted and local. It still keeps every `storage.objects` policy.

## 2. Results (observed, final run 2026-10-10)

`RESULT: ALL CHECKS PASSED` (after the defect fix in §3).

**Guards refuse, and a refused run changes nothing.** The full fingerprint was identical before and after every refused attempt.

| Attempt | Refusal |
|---|---|
| 0042 with no token / wrong token | `set idw.rollback_confirm = '0042'` |
| 0042 with `paid_checkout_enabled = true` | paid checkout is ON |
| 0042 with an `active` subscription | a live paid subscription exists |
| 0041 before 0042 | 0042 is still applied |
| 0036 before everything | 0037 is still applied |
| 0040 before 0041 | 0041 is still applied |
| 0041 with an outbox row `sending` | an outbox email is being sent |
| 0039 before 0040 | 0040 is still applied |
| 0040 with a `payment_confirmation` outbox row | payment_confirmation rows exist |
| 0038 before 0039 | 0039 policies still exist |
| 0037 before 0038 | 0038 is still applied |
| 0038 with an `awaiting_payment` checkout | an open checkout exists (**new**, see §3) |
| 0038 with a `payment_confirmed` checkout | a paid checkout is not yet provisioned |
| 0036 before 0037 | 0037 is still applied |
| 0036 with a `payment_confirmed` checkout | an open or mid-payment checkout exists |

**Rollbacks 0042 → 0036 all ran** with their tokens. 0036 also had `idw.rollback_drop_audit = '0036-audit-exported'`. Legacy rows (tenants / tenant_members / user_space_slots = 2/2/1) were unchanged.

**Round trip:**

| Check | Result |
|---|---|
| Rolled-back catalog vs 0001..0035 | identical, 348 lines (comparable md5 `604435f98190abf98bd1a9cb6e931662`) |
| Restored functions vs the recorded baselines | `publish_space` `5088d120…6c14`, `handle_new_tenant` `e3526abc…be4cb93b`, `enforce_space_slot_capacity` `708dde46…4972991`, `restore_space` `9a31bcf9…7fdbcfa0`, `replace_space` `3a2af65a…6d5236`: all equal. The fresh 0001..0035 db produces the same five values. |
| 0036 with its default (audit log kept) | differs from 0001..0035 only by the 21 `admin_audit_log` lines (table, columns, constraint, indexes, triggers, `admin_audit_log_immutable()`) |
| 0036..0042 re-applied to the rolled-back db | identical to 0001..0042, 825 lines (comparable md5 `868f35d7f344ae4c02792f031addc0d9`) |

**Expected comparable fingerprint after each step.** Files are in `tasks/032/fingerprints/`.

| State | md5 | lines |
|---|---|---|
| post-0042 (Staging today) | `868f35d7f344ae4c02792f031addc0d9` | 796 |
| after 0042 rollback | `be58098960a720d6dbab333d6291cb3a` | 796 |
| after 0041 rollback | `62faef9bf37934153f0b722e013f97e9` | 787 |
| after 0040 rollback | `6d22099e17d52a0a288e86d6b80a2b1e` | 726 |
| after 0039 rollback | `e1c04b2251040c47d649b2bd331e524a` | 706 |
| after 0038 rollback | `7df18502c6fe71dabc06b339c6d2f2ed` | 691 |
| after 0037 rollback | `933b66c6137e4f13854237261fb14d21` | 685 |
| after 0036 rollback, audit dropped (= pre-0036) | `604435f98190abf98bd1a9cb6e931662` | 319 |
| after 0036 rollback, audit kept | `a85cfcc124fa4e59afb44ef3791ea459` | 340 |

**What the local rehearsal does not prove.** These are limits, not findings.

- Supabase's managed roles and event triggers, and hosted-only extensions, are only approximated. The catalog equality with Staging is the evidence that the approximation is close.
- The ledger (`supabase_migrations.schema_migrations`) was not exercised. The migrations were applied with `psql`, not `supabase db push`, so `migration repair --status reverted` and re-push are still unrehearsed.
- Lock and timing behaviour under concurrent traffic was not tested.
- Each rollback file fails, without changing anything, if it is run a second time: for example, 0038 errors on the trigger that is already gone. That is fail-closed, but the files are not idempotent.

## 2b. Extension to 0043 and 0044 (observed, run 2026-10-10)

The script now covers 0036..0044 (it previously stopped at 0042). Same machine, same container `supabase_db_app`, throwaway `rbr_rh_*` databases only, dropped afterwards. Staging and Production were not touched; 0043 and 0044 are not applied to any hosted project. `RESULT: ALL CHECKS PASSED`.

**0044 behaviour** (on `full`, inside one transaction that is rolled back; the catalog and data were unchanged afterwards). Each RPC was called directly as the owner (role `authenticated`, owner JWT claims), bypassing the Studio actions:

| Space | `set_guest_access_code` | `disable_guest_access_code` | `submit_featured_listing` |
|---|---|---|---|
| paid, Studio-suspended (`past_due`, payment failed 200 h ago) | `BILLING_LOCKED` | `BILLING_LOCKED` | `BILLING_LOCKED` |
| the same paid Space, `active` | allowed | allowed | allowed |
| exempt | allowed | allowed | allowed |
| legacy (no billing row) | allowed | allowed | allowed |

**New guard refusals** (catalog unchanged after each): 0044 with no token / wrong token; 0044 with the paid flag ON; 0044 with an `active` subscription; 0043 before 0044 ("0044 is still applied"); 0042 before 0043 ("0043 is still applied"). Every refusal from §2 was repeated and passed again.

**Step-by-step equality:**

| Check | Result |
|---|---|
| after the 0044 rollback vs a fresh 0001..0043 | identical, 829 lines |
| after the 0043 rollback vs a fresh 0001..0042 | identical, 825 lines |
| full chain 0044 -> 0036 vs a fresh 0001..0035 | identical, 348 lines |
| restored function md5s | the five from §2 plus `set_guest_access_code` `d5d835ac…7006f59`, `disable_guest_access_code` `c5e6be2b…53b0`, `submit_featured_listing` `4c81a4b7…0554599` (the Staging pre-0028 values): all equal |
| 0036..0044 re-applied to the rolled-back db vs `full` | identical, 829 lines |

**Expected comparable fingerprints for the new states** (the 0042 -> 0036 values in §2 are unchanged):

| State | md5 | lines |
|---|---|---|
| post-0044 | `c13f3ddd46a13ff5f109a3960af3730f` | 800 |
| after 0044 rollback (= post-0043) | `be50d56c49a7d26864ab04a13dd5f387` | 800 |
| after 0043 rollback (= post-0042) | `868f35d7f344ae4c02792f031addc0d9` | 796 |

The script's local-only refusals were re-checked: a non-loopback `LOCAL_DB_URL`, a `supabase.co` `DATABASE_URL`, and a port the container does not publish each abort before anything runs (exit 2).

## 2c. Extension to 0045 (observed, run 2026-10-10)

The script now covers 0036..0045 and builds a fourth reference, `rbr_rh_m44` (0001..0044); `full` is 0001..0045. Same container, throwaway `rbr_rh_*` databases only, dropped afterwards; 0045 is not applied to any hosted project. `RESULT: ALL CHECKS PASSED` (88 checks).

**0045 behaviour** (step 4b, on `full`, one transaction rolled back; catalog unchanged and no `storage.objects` rows left afterwards). Statements run as role `authenticated` with the owner's JWT claims, directly against `storage.objects` (so Storage RLS is evaluated exactly as storage-api's own INSERT/UPDATE would be; `storage.allow_delete_query` set as storage-api does for deletes) and `published_spaces`:

| Space | Check | Result |
|---|---|---|
| paid (active) | member INSERT `.../{uploadId}/draft.webp` (image), audio bytes named `draft.webp`, `published.mp3`, `published.webp`, unversioned `draft.mp3`, `draft.svg` | refused (`42501`) |
| paid | member INSERT versioned `draft.mp3` | allowed |
| paid | member UPDATE (metadata overwrite, rename/move) of an existing object | no row affected |
| paid | member DELETE | allowed |
| legacy / exempt | member INSERT `draft.webp`; legacy UPDATE of an unversioned object | allowed (unchanged) |
| paid | snapshot `imageRef` = audio object / another tenant's image / `..` traversal / non-string | `MEDIA_REF_INVALID` |
| paid | snapshot with an own `published.webp` (direct insert) | allowed |
| paid | direct snapshot update carrying an uncounted `audioRef` | `AUDIO_LIMIT` |
| paid | `publish_space()` | allowed |
| legacy / exempt | snapshot `imageRef` naming an audio object | allowed (unchanged) |

Negative control (manual, same run): on a clone of `full` with the 0045 rollback applied, the same member INSERTs of `draft.webp` and `published.mp3` on the paid Space both succeeded - the refusals above come from 0045.

**New guard refusals:** 0045 with no token / wrong token / paid flag ON / `active` subscription; 0044 before 0045 ("0045 is still applied"). The 0044 paid-flag and live-subscription refusals now run after the 0045 rollback (0044's 0045-applied check comes first).

| Comparison | Result |
|---|---|
| after the 0045 rollback vs a fresh 0001..0044 | identical, 829 lines |
| 0036..0045 re-applied to the rolled-back db vs `full` | identical, 834 lines |
| full chain 0045 -> 0036 vs a fresh 0001..0035 | identical, 348 lines |

| State | md5 (comparable) | lines |
|---|---|---|
| post-0045 | `35136de53d3d6ac4580c7b668a7cf95d` | 805 |
| after 0045 rollback (= post-0044) | `c13f3ddd46a13ff5f109a3960af3730f` | 800 |

## 3. Defect found and fixed

**Defect: the 0038 rollback ran with an open checkout.**

- *Before the fix.* `0038_billing_provisioning_lifecycle_rollback.sql` refused only on `payment_confirmed` and `provisioning`. With an `awaiting_payment` checkout it committed, and it dropped `billing_expire_open_checkouts()`. A customer could then still pay the open Stripe Checkout Session, and nothing in the database could provision or expire it.
- *Why it was a defect.* `MIGRATION-RECOVERY.md` §3 says that both the 0038 and 0036 rollbacks check for "no open or mid-payment checkouts". Only 0036 actually did.
- *Fix.* The 0038 guard now also refuses on `created`, `checkout_created` and `awaiting_payment`, with the message "an open checkout exists; expire or cancel it first". The header prerequisite explains how to expire one.
- *Regression test.* `app/src/lib/spaceTypes/billingRollback.test.ts`, "the 0038 and 0036 rollbacks refuse while any checkout is open or mid-payment". It fails on the old file and passes on the new one. `npx vitest run src/lib/spaceTypes` gives 4 files and 93 tests passing.
- *Re-run.* The rehearsal was run again after the fix and passed.

No other defect was found. Every drop and restore ran without error, in order, with no `CASCADE` needed.

## 4. Hosted rehearsal plan: REQUIRES OWNER APPROVAL, NOT EXECUTED

Nothing in this section has been run. Each step marked **[approval]** needs the owner's explicit approval for that environment. The data-destructive steps need their own explicit approval on top of that.

### 4.0 Choose the target

| Option | Pros | Cons |
|---|---|---|
| **A. Disposable Supabase branch** (recommended) | Isolated, so no QA disruption; can be deleted afterwards | **Billable.** Creating it is an approval-gated action. Assumption, not verified: the branch is built from the repo's migrations and starts with no billing data, so the synthetic seed from the script has to be inserted. |
| **B. Shared Staging** `kkqjsspxupyxytddiumf` | Real hosted catalog and real ledger | Interrupts Staging QA for the window. The TASK 032 app on the `staging` Vercel environment fails closed between the 0039 and 0036 rollbacks. **PITR is off**, so the only platform restore point is the last daily backup. |

The steps below are written for B. For A, skip 4.1 items 3 to 5, and replace the restore-forward data step with simply deleting the branch.

### 4.1 Preconditions (abort if any fails)

1. Owner approval for this rehearsal, naming the target, the date and the window **[approval]**.
2. Working tree at the rehearsed commit. `supabase/migrations/` must hold exactly 0001..0042: no unreleased 0043 or later, because otherwise `db push` in 4.5 would apply it. Confirm the linked ref with `cat app/supabase/.temp/project-ref`, which must print `kkqjsspxupyxytddiumf`.
3. Staging QA frozen and announced. The Stripe **test-mode** webhook endpoint for Staging is disabled. The billing cron routes are not scheduled for the `staging` environment.
4. A recent backup is present: `supabase backups list --project-ref kkqjsspxupyxytddiumf` shows one from within the last 24 h, status COMPLETED. Record its id and time. (On 2026-10-10 the latest was id 1916197952, `2026-10-09T17:14:00Z`.)
5. A logical export goes to an owner-controlled directory `$EXPORT` **outside the repository**, because it holds user ids and audit history:
   ```
   supabase db dump --linked -f "$EXPORT/staging-schema-$(date -u +%Y%m%dT%H%MZ).sql"
   supabase db dump --linked --data-only --schema public -f "$EXPORT/staging-public-data-$(date -u +%Y%m%dT%H%MZ).sql"
   ```
   Also run the step 0 `\copy` lines from each rollback file (0041, 0040 and 0036). Record every row count.
6. The read-only baseline matches. Run `tasks/032/fingerprints/fingerprint.sql` with `supabase db query --linked`, drop the `storage` idx/trg lines, sort, and check the md5 is `868f35d7f344ae4c02792f031addc0d9`. Also run the prerequisite query in `MIGRATION-RECOVERY.md` §5 and confirm: flag false, 0 live subscriptions, 0 open checkouts, 0 `sending`, 0 `payment_confirmation`. A different fingerprint means something changed since 2026-10-10. Stop and investigate.

### 4.2 Connection

The rollback files need `set idw.rollback_confirm` in the same session as the file, so they are run with `psql` over the direct connection. The owner supplies `STAGING_DB_URL` from the password manager, in the environment only. It is never echoed, logged or committed. No `psql` is installed on the host, so use the local image:

```
docker run --rm -i -e PGURL="$STAGING_DB_URL" public.ecr.aws/supabase/postgres:17.6.1.167 \
  sh -c 'psql "$PGURL" -X -v ON_ERROR_STOP=1 -c "set idw.rollback_confirm = '"'"'<token>'"'"'" -f -' \
  < app/supabase/verification/<file>
```

### 4.3 Steps, in strict order

After **every** step:

- re-run the fingerprint and compare it with the expected md5 in §2;
- run that file's own trailing verification query;
- run the legacy count query from `MIGRATION-RECOVERY.md` §5, and confirm tenants, published_spaces and module_items are unchanged from 4.1(6) (5 / 4 / 79 on 2026-10-10).

If the target already has 0043 and/or 0044 applied (Staging did not on 2026-10-10), run these first, in this order, and expect the baseline in 4.1(6) to be the post-0044 md5 `c13f3ddd46a13ff5f109a3960af3730f` (or post-0043 `be50d56c49a7d26864ab04a13dd5f387`):

| # | File | Token | Expected md5 after | Data-destructive |
|---|---|---|---|---|
| 0a | 0044 | `0044` | `be50d56c49a7d26864ab04a13dd5f387` | no |
| 0b | 0043 | `0043` | `868f35d7f344ae4c02792f031addc0d9` | no |

| # | File | Token | Expected md5 after | Data-destructive |
|---|---|---|---|---|
| 1 | 0042 | `0042` | `be58098960a720d6dbab333d6291cb3a` | no |
| 2 | 0041 | `0041-exported` | `62faef9bf37934153f0b722e013f97e9` | two columns (exported in 4.1(5)) **[approval]** |
| 3 | 0040 | `0040-exported` | `6d22099e17d52a0a288e86d6b80a2b1e` | `billing_invoices` (0 rows on 2026-10-10) **[approval]** |
| 4 | 0039 | `0039` | `e1c04b2251040c47d649b2bd331e524a` | no |
| 5 | 0038 | `0038` | `7df18502c6fe71dabc06b339c6d2f2ed` | no |
| 6 | 0037 | `0037` | `933b66c6137e4f13854237261fb14d21` | no |
| 7 | 0036 | `0036-exported` + `idw.rollback_drop_audit = '0036-audit-exported'` | `604435f98190abf98bd1a9cb6e931662` | **every billing table, plus `admin_audit_log` (139 rows on 2026-10-10)** **[separate approval]** |

Also check the five restored function md5s after steps 1, 4 and 5. They must equal the "Expected after rollback" column in `tasks/032/staging-fingerprints-2026-10-10.md`.

Why step 7 drops the audit log: re-applying 0036 unchanged fails if `admin_audit_log` is kept. A full round trip therefore needs the drop. The exported audit rows are re-inserted in 4.5. The table is append-only against UPDATE, DELETE and TRUNCATE, but INSERT is allowed.

**Optional guard checks** (no data change if they work as rehearsed). Before step 1, run 0041 with its token: it must refuse with "0042 is still applied". Before each later step, run the next-earlier file: it must refuse. Do **not** flip the paid flag or create subscriptions on Staging to test the other guards. Those were proven locally.

### 4.4 Abort criteria (stop, do not continue to the next step)

- Any rollback errors for a reason other than an expected refusal. The transaction rolls itself back, so re-fingerprint and confirm the catalog is the previous step's.
- A fingerprint after a step differs from the expected md5. Diff it against the matching `tasks/032/fingerprints/local-after-rollback-*.fp` file.
- Legacy counts change.
- A prerequisite stops holding, for example a checkout or outbox row appears. This would mean something is still writing.
- The window overruns.

On abort, go to 4.5 from whatever step was reached. Every forward migration from that point re-applies cleanly, because each rollback is the exact inverse of its migration.

### 4.5 Restore forward

1. Ledger, as a separate and explicit action **[approval]**. For each rolled-back version, highest first:
   ```
   supabase migration repair --status reverted <version>
   ```
   Confirm with `supabase migration list`.
2. Re-apply with `supabase db push --linked`, checking first that only 0036..0042 (or the subset that was rolled back) are pending **[approval]**. Alternatively, apply each file with the 4.2 `psql` command and then `supabase migration repair --status applied <version>`.
3. Fingerprint: the comparable md5 must be `868f35d7f344ae4c02792f031addc0d9` again. The five restated functions must equal the "Staging now" column.
4. Data:
   - re-insert the exported `admin_audit_log` rows (`\copy public.admin_audit_log from ...`);
   - diff the re-seeded `billing_settings` and `billing_plans` rows against the export, and restore any differences with `UPDATE` **[approval]**;
   - re-import any other billing rows that were non-zero in the export.
   Compare every row count with 4.1(5).
5. Re-enable the Staging test webhook endpoint and cron schedule, then unfreeze QA.
6. Last resort, if the catalog cannot be brought back: restore the 4.1(4) daily backup from the dashboard **[approval]**. With PITR off, this loses every Staging write since that backup.

### 4.6 Approval request (text to send)

> **Approval requested: TASK 032 billing-rollback rehearsal on [Staging `kkqjsspxupyxytddiumf` | a new disposable Supabase branch (billable)].**
> Window: [date/time, about 60 min]. Staging QA will be frozen, and the Staging test-mode Stripe webhook and billing crons disabled, for the window.
> Steps: export the schema, public data and billing tables to an owner-controlled folder; record the latest daily backup (PITR is off); run rollbacks 0042→0036 in order with the documented tokens; fingerprint after each step against the locally rehearsed values (`docs/billing/ROLLBACK-REHEARSAL.md` §2); mark 0036..0042 reverted in the ledger; re-apply 0036..0042; re-insert the 139 `admin_audit_log` rows; confirm the catalog returns to md5 `868f35d7…addc0d9`.
> Data-destructive steps needing your explicit yes: (a) the 0041 column drop, (b) the 0040 `billing_invoices` drop, (c) the 0036 drop of every billing table **including the audit log** (re-inserted from the export afterwards). Staging billing tables currently hold no customer data: 0 subscriptions, 0 invoices, 0 coupons. The audit log has 139 rows.
> Production is not touched. Do you approve: [ ] the rehearsal  [ ] (a)  [ ] (b)  [ ] (c)  [ ] the ledger repair and re-push  [ ] (branch option only) creating a billable Supabase branch?
