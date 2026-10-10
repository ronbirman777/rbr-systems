# TASK 032 — Production release PLAN (not executed)

Status: PLAN ONLY. Release candidate: branch `feat/032-commercial-platform-foundation` (final SHA in the TASK 032 report). Nothing here has been run. Production is at `main` 44426be, migration head 0035, 17 tables, 37 policies (32 public + 5 storage) — verified read-only at the end of TASK 032.
Every step below needs its own explicit owner authorization; "paid checkout" stays OFF throughout until Phase 7.

## Preconditions (all must be true)
1. Legal operator/issuer, tax treatment (Stripe Tax on/off, registrations) and final Terms / Privacy / Billing & Cancellation versions decided; `legal.ts` draft version ids replaced (docs/billing/LAUNCH-GATES.md, TAX.md).
2. Stripe Test Mode QA completed end to end with real test keys (NOT yet done in TASK 032 — no Stripe/Resend/cron variables exist in any Vercel environment): Checkout, webhook signature, reconciliation, failed-payment timeline, coupons sync, Customer Portal, Smart Retries -> mark unpaid, Stripe receipt/invoice emails OFF.
3. Resend domain verified, tracking OFF, `BILLING_EMAIL_FROM` set.
4. Native-speaker review of tr/it (and he/de/es/fr new strings) billing + Admin copy.
5. Owner decisions on the known gaps listed in the final report (audio entitlement enforcement, add-on sale, day-14 deletion job, in-app MFA recovery).

## Phases
0. Freeze: confirm origin/main == 44426be; branch `feat/032-commercial-platform-foundation` rebased/merged state agreed; full clean validation (npm ci, typegen, tsc, eslint, vitest, build) on the exact tree.
1. Backup/baseline: record Production ledger (0035), table/policy counts, `publish_space` md5 (5088d120877f74c02f845df398206c14), `build_teach_payload`/`jsonb_pick` fingerprints, the md5 of the functions TASK 032 restates (expected = the values in MIGRATION-RECOVERY.md §2, incl. `set_guest_access_code` d5d835ac1a663482387a3d07a7006f59, `disable_guest_access_code` c5e6be2b4739200c2d6b4b29afe353b0, `submit_featured_listing` 4c81a4b7e8fd63e63305c50b50554599 for 0044), Lena / Return to Balance rows, published_spaces count.
2. Migrations 0036 -> 0045 to Production via CLI after explicitly re-linking to qzmsclkzbxrfohuxnitc (one at a time, each verified). 0042 = Restore/Replace billing guards; 0043 = database-level audio enforcement for paid Spaces (trigger `billing_guard_module_item_audio` on `module_items`, `billing_audio_policy` / `billing_audio_assert_publishable`, one marked check in `publish_space`; legacy and exempt Spaces unaffected); 0044 = `BILLING_LOCKED` guards in the SECURITY DEFINER `set_guest_access_code` / `disable_guest_access_code` / `submit_featured_listing` (legacy Spaces unaffected; creates no object). 0045 = media content guard for paid Spaces (two restrictive `storage.objects` policies: members may create only versioned draft audio objects and never overwrite; trigger `billing_guard_published_media` on `published_spaces`; legacy and exempt Spaces unaffected; restates nothing). 0043, 0044 and 0045 must first be applied and verified on Staging (`billing-db-verify.mjs` sections M, N and O) under their own authorisation; none has been applied to any hosted project yet. 0045 needs the matching application code deployed (service-role image writes and publish copies on paid Spaces), otherwise image uploads and publishes on paid Spaces fail closed. Expected after: 31 public tables (17 + 14 billing), as on Staging; `publish_space` last defined by 0043; `billing_settings.paid_checkout_enabled=false`; existing Spaces untouched. Verify Lena, Return to Balance and internal/QA Spaces stay publicly available (they have no billing row, so they are on the unchanged legacy path). Exemption is done later through Admin (see "Internal exemptions" below: after Phase 5, before Phase 7), because the audited Admin path only exists once the code is deployed and an Admin is enrolled; doing it in Phase 2 would need direct SQL without an audit row.
3. Vercel Production env (names only; values set by the owner): STRIPE_SECRET_KEY (live), STRIPE_WEBHOOK_SECRET, STRIPE_AUTOMATIC_TAX, CRON_SECRET, RESEND_API_KEY, BILLING_EMAIL_FROM. Stripe live webhook endpoint -> /api/billing/webhook. Do not set live keys until Phase 5.
4. Merge to `main` (auto-deploys Production). Smoke: site, guest apps (incl. "Created with InnerDweS"), Admin gate (signed-out 404/redirect, MFA enrollment for the owner admin), webhook returns 503/400 safely, cron authorized only with CRON_SECRET. Flag still OFF -> legacy Space creation unchanged.
5. Admin: grant admin_users, enroll TOTP, sync plan to Stripe LIVE from Admin (creates live product/price), create launch coupons (Stripe sync). Then mark the internal Spaces exempt per "Internal exemptions" below and verify them.
6. Live dress rehearsal with a real card under owner control and a 100%-off or small refundable payment; verify one Space provisioned, one confirmation email, invoice listed, refund path.
7. Flip `paid_checkout_enabled` (Admin, step-up MFA) only after 1-6 pass and the owner gives the explicit go.
## Rollback
- Flag OFF restores legacy creation instantly (server-side).
- Migrations are additive. Rollback SQL for 0036-0045 exists in `app/supabase/verification/00{36..45}_*_rollback.sql` (strict order 0045 -> 0036), with the order, prerequisites, data-destructive steps and verification queries in `MIGRATION-RECOVERY.md`. The files are statically checked and the full chain 0045 -> 0036 (and forward again) was rehearsed on throwaway LOCAL databases (`ROLLBACK-REHEARSAL.md` §2, §2b, §2c); no rollback has been run on a hosted project. Have them reviewed, and decide on a hosted rehearsal (ROLLBACK-REHEARSAL.md §4), before Phase 2. Prefer a forward fix, or setting the flag OFF.
- Vercel: promote the previous Production deployment.

## Internal exemptions (procedure; NOT executed, Production NOT queried)

Nothing below was run. Production was not queried for this plan (no SELECT, no MCP). Which Production Spaces are exempt today is unknown; before 0036 is applied none can be (the table does not exist).

### What an exemption does and does not change (from the code)

| Aspect | No billing row (every pre-0036 Space) | `status = 'exempt'` (unexpired) |
|---|---|---|
| Studio, Guest, publish | Legacy path: `space_entitlements` decides (no row = Studio yes, publish no, not public; `complimentary`/`active` rows expire at `access_ends_at` + 168h) | Billing decides: everything allowed, independent of `space_entitlements` and of the launch flag |
| Audio quota (B4) | Not enforced | Not enforced |
| `restore_space` with the flag ON (0042) | Counts against the owner's legacy slot allowance | Not counted; restore allowed while Studio is writable |
| Delete guard, lifecycle job, paid metrics | Unaffected / not shown | Delete allowed; ignored by lifecycle; shown only in the Admin `exempt` count |
| New Space creation by that owner with the flag ON | Refused (`PAYMENT_REQUIRED`) - an exemption is per Space and does **not** change this | same |

So an exemption is not needed to keep a legacy Space working on day one. It is needed so the demos (a) stop depending on a legacy complimentary entitlement that can expire, (b) are visible and labelled as internal in Admin, and (c) do not consume the owner's legacy slots on a restore once paid checkout is on.

### Identification criteria (decide each Space explicitly; never by pattern alone)

| Space | How to identify it | Expected |
|---|---|---|
| Lena teacher demo | `published_spaces.slug = 'teacherexample'` (`DEMO_SPACE_SLUGS.teach`, linked from `/create`), its `tenant_id`; cross-check `tenants.slug` and `product_type` | 1 row, published |
| Return to Balance | `published_spaces.slug = 'example'` (`DEMO_SPACE_SLUGS.retreat`), its `tenant_id`; name "Return to Balance" | 1 row, published |
| QA / internal Spaces | Spaces owned (`tenant_members.role = 'owner'`) by accounts the owner names explicitly as internal. Synthetic QA accounts are Staging-only by the QA-SAFETY rules; any QA-looking Space on Production (e.g. names/slugs with `qa`, owner e-mails at test domains) is a candidate only, confirmed by the owner before exemption | owner-confirmed list |
| Customer-facing legacy Spaces | NOT exempted by this procedure; they stay on the legacy path until a separate commercial decision | - |

### Read-only identification query (run only under an explicit task authorisation for a read-only Production SELECT)

```sql
-- READ ONLY. Returns ids and names only; no personal data columns.
select t.id as tenant_id, t.name, t.product_type, t.status, t.slug as tenant_slug,
       ps.slug as published_slug, ps.published_at,
       se.access_type as legacy_access, se.access_ends_at as legacy_access_ends_at,
       s.status as billing_status, s.exempt_reason, s.exempt_expires_at
from public.tenants t
left join public.published_spaces ps on ps.tenant_id = t.id
left join public.space_entitlements se on se.tenant_id = t.id
left join public.space_subscriptions s on s.tenant_id = t.id   -- only after 0036
where ps.slug in ('teacherexample', 'example')
   or t.id in (/* owner-confirmed internal tenant ids */);
```

Record the result (ids, names, legacy access and its end date) in the task log; never paste owner e-mails or guest codes.

### Marking (after migrations 0036-0044 are on Production, flag still OFF)

1. Preferred path: Admin > Billing > Settings > "Internal / legacy exemption" card (`setExemptAction` -> `adminSetInternalExempt` -> `billing_set_internal_exempt`). Requires an Admin with TOTP and a fresh step-up; writes `admin_audit_log`. One Space at a time, with tenant id, a reason of at least 5 characters (for example `internal demo: teacherexample` / `internal demo: Return to Balance` / `internal QA`), and **no expiry** for the demos.
2. The function refuses a Space that already has a non-exempt subscription; it is idempotent for one that is already exempt.
3. Do not use direct SQL for this unless the task explicitly authorises it; direct SQL skips the audit log.
4. Verify for each Space: Admin subscription detail shows `exempt` with the reason; the public Guest URL (`/s/teacherexample`, `/s/example`) still returns 200 and renders; Studio for the owner still opens and can publish; Admin metrics count it under `exempt` only (not paid, not revenue).
5. Rollback per Space: Admin subscription detail > "Remove exemption" (`adminClearInternalExempt` -> `billing_clear_internal_exempt` deletes only the exempt row, so the Space returns to the legacy path).
