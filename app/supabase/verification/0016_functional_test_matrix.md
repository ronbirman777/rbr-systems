# 0016 Guest Access & Featured — Post-Migration Functional Test Matrix

Run this against Production only after `0016_guest_access_and_featured.sql` has been applied and
`0016_guest_access_and_featured_verification.sql` has passed. Every test below needs a real
signed-in owner session (or the Supabase SQL Editor as service_role for the RPC-level checks) —
none of this is executable pre-migration, since the functions/tables don't exist yet.

## Guest Access

| # | Test | Steps | Expected result |
|---|---|---|---|
| 1 | Default existing Space, no row | Call `get_guest_access_mode(tenant_id)` for any tenant with no `space_guest_access` row | Returns `'public'` |
| 2 | Enable 6-digit code | Owner calls `set_guest_access_code(tenant_id, '482731')` | Row created, `mode='code'`, `version=1` |
| 3 | Reject malformed codes | Call `set_guest_access_code` with `'123'`, `'abcdef'`, `'1234567'` | Each raises an exception, no row change |
| 4 | Wrong code | Trusted server flow: `verify_guest_access_code(tenant_id, '000000')` when real code differs | Returns `NULL`; `failed_attempts` increments by 1 |
| 5 | Correct code | `verify_guest_access_code(tenant_id, '<real code>')` | Returns the current `version` (integer) |
| 6 | Version returned only through trusted path | Attempt to call `verify_guest_access_code` directly from `anon`/`authenticated` role | `permission denied for function` — EXECUTE was revoked |
| 7 | Change code | Owner calls `set_guest_access_code` again with a new code | `version` increments by 1, old code now fails `verify_guest_access_code` |
| 8 | Old code rejected | `verify_guest_access_code` with the pre-change code | Returns `NULL` |
| 9 | New code accepted | `verify_guest_access_code` with the post-change code | Returns the new `version` |
| 10 | Version increments | Compare `version` before/after step 7 | New value = old value + 1 |
| 11 | Disable protection | Owner calls `disable_guest_access_code(tenant_id)` | `mode='public'`, `code_hash=NULL`, `version` incremented |
| 12 | Space returns public | `get_guest_access_mode(tenant_id)` after step 11 | Returns `'public'` |
| 13 | No code hash accessible to organizer browser | Owner's own authenticated client selects from `space_guest_access` directly | Permission denied — zero table grants for `authenticated` |
| 14 | No code hash accessible to anon | Anon client selects from `space_guest_access` directly | Permission denied — zero table grants for `anon` |
| 15 | No direct verify RPC for anon | Anon calls `verify_guest_access_code` | Permission denied |
| 16 | No direct rate-limit RPC for anon/authenticated | Either role calls `check_and_record_guest_attempt` | Permission denied for both |

## Rate limiting

| # | Test | Steps | Expected result |
|---|---|---|---|
| 17 | Attempts 1–8 allowed | Call `check_and_record_guest_attempt(tenant_id, ip_hmac)` 8 times in a row, same identity | All 8 return `true` |
| 18 | Attempt 9 blocked | 9th call, same identity, same window | Returns `false` |
| 19 | 10-minute reset | Wait (or manually backdate `window_start` past 10 minutes) then call again | `attempt_count` resets to 1, returns `true` |
| 20 | Different IP HMAC gets separate allowance | Call with the same `tenant_id`, a different `ip_hmac` | Independent counter, unaffected by the first identity's count |
| 21 | Different Space gets separate allowance | Call with the same `ip_hmac`, a different `tenant_id` | Independent counter |
| 22 | Same IP never stored raw | Inspect `guest_access_ip_attempts.ip_hmac` values directly | Every value is a 64-char hex HMAC-SHA256 digest, never a dotted-quad/IPv6 string |
| 23 | Concurrent attempts cannot lose increments | Fire 10 concurrent calls (e.g. `pgbench` or 10 parallel `psql` sessions) at the same identity | Final `attempt_count` = 10 exactly, no duplicate-key errors, no lost increments (see the concurrency proof in the migration review) |
| 24 | No global Space lockout | Exceed 8 attempts from many different IPs against the same tenant | Each IP is independently throttled; no code path blocks the Space as a whole |

## Featured on InnerDweS

| # | Test | Steps | Expected result |
|---|---|---|---|
| 25 | Owner can submit | Owner calls `submit_featured_listing(tenant_id, ...)` | Row upserted, `status='submitted'`, `submitted_at` set |
| 26 | Member can read where intended | A `tenant_members` row (non-owner) selects their tenant's `space_featured_submissions` row | Row returned (RLS: `is_tenant_member`) |
| 27 | Non-member cannot read | A user with no `tenant_members` row for that tenant selects the row | Zero rows returned |
| 28 | Anon cannot read | Anon client selects `space_featured_submissions` | Permission denied — zero table grants for `anon` |
| 29 | Organizer cannot directly INSERT/UPDATE/DELETE | Authenticated owner attempts a raw `insert`/`update`/`delete` against the table | Permission denied — no such grant exists, only `submit_featured_listing` can write |
| 30 | Organizer cannot self-approve | Inspect available RPCs/grants for any authenticated-callable "approve" function | None exists — approval is service-role-only, not exposed at all |
| 31 | Resubmission → submitted | Owner calls `submit_featured_listing` again after a prior `approved`/`rejected` outcome | `status` becomes `'submitted'` again |
| 32 | reviewed_at/reviewed_by reset | Same as #31 | Both become `NULL` |
| 33 | approved_snapshot preserved | Same as #31, where an `approved_snapshot` already existed | `approved_snapshot`/`approved_at`/`approved_by` unchanged |
| 34 | Last approved listing stays live while revision pending | Read `approved_snapshot is not null` for a tenant mid-resubmission | Still returns the OLD approved snapshot, independent of the new `'submitted'` status |
| 35 | Invalid `additional_links` rejected | `submit_featured_listing` with a non-array, or an object with extra keys, or a >6-item array | Insert fails the `is_valid_additional_links` CHECK constraint |
| 36 | Invalid website rejected | Submit `website = 'not-a-url'` | CHECK constraint violation (`~* '^https?://'` fails) |
| 37 | Invalid Instagram rejected | Submit `instagram = 'not valid!!'` | CHECK constraint violation |
| 38 | Length boundaries | `description` at 1000/1001 chars, `location` at 200/201, `website` at 500/501, `label`/`url` at their own boundaries | Exactly-at-limit succeeds, one-over fails |

## Notes on execution

- Tests 1–24 are best run via the Supabase SQL Editor using the service-role connection (bypasses RLS/grants, so both "should succeed" and "should fail with permission denied" paths can be exercised deliberately by switching role context with `set role`).
- Tests 6, 13–16, 28, 29 specifically need to be run **as** `anon`/`authenticated` (not service_role) to prove the denial is real — `set role authenticated; set role anon;` inside a transaction, or a real client-side call through the app.
- Test 23 (concurrency) is the one test that cannot be verified through the SQL Editor alone — it needs genuinely concurrent connections (see the migration review's own concurrency proof for the logical argument; this test is the empirical confirmation of it).
