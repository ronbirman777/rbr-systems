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
1. Backup/baseline: record Production ledger (0035), table/policy counts, `publish_space` md5 (5088d120877f74c02f845df398206c14), `build_teach_payload`/`jsonb_pick` fingerprints, Lena / Return to Balance rows, published_spaces count.
2. Migrations 0036 -> 0042 to Production via CLI after explicitly re-linking to qzmsclkzbxrfohuxnitc (one at a time, each verified). Expected after: 31 public tables (17 + 14 billing), as on Staging; `billing_settings.paid_checkout_enabled=false`; existing Spaces untouched. Mark Lena, Return to Balance and internal/QA Spaces exempt (`billing_set_internal_exempt`) BEFORE anything else, and verify they stay publicly available.
3. Vercel Production env (names only; values set by the owner): STRIPE_SECRET_KEY (live), STRIPE_WEBHOOK_SECRET, STRIPE_AUTOMATIC_TAX, CRON_SECRET, RESEND_API_KEY, BILLING_EMAIL_FROM. Stripe live webhook endpoint -> /api/billing/webhook. Do not set live keys until Phase 5.
4. Merge to `main` (auto-deploys Production). Smoke: site, guest apps (incl. "Created with InnerDweS"), Admin gate (signed-out 404/redirect, MFA enrollment for the owner admin), webhook returns 503/400 safely, cron authorized only with CRON_SECRET. Flag still OFF -> legacy Space creation unchanged.
5. Admin: grant admin_users, enroll TOTP, sync plan to Stripe LIVE from Admin (creates live product/price), create launch coupons (Stripe sync).
6. Live dress rehearsal with a real card under owner control and a 100%-off or small refundable payment; verify one Space provisioned, one confirmation email, invoice listed, refund path.
7. Flip `paid_checkout_enabled` (Admin, step-up MFA) only after 1-6 pass and the owner gives the explicit go.
## Rollback
- Flag OFF restores legacy creation instantly (server-side).
- Migrations are additive. Rollback SQL for 0036-0042 now exists in `app/supabase/verification/00{36..42}_*_rollback.sql`, with the order, prerequisites, data-destructive steps and verification queries in `MIGRATION-RECOVERY.md`. The files are statically checked but have not yet been executed against any database: rehearse them on a throwaway database or branch, and have them reviewed, before Phase 2. Prefer a forward fix, or setting the flag OFF.
- Vercel: promote the previous Production deployment.
