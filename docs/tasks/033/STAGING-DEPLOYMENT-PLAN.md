# TASK 033 — Staging deployment plan (prepared, NOT executed)

Gate: no existing authorization covers deploying TASK 033 to Staging (owner instruction 2026-10-13: "If an existing
authorization covers the specific Staging deployment, proceed; otherwise stop at the deployment gate"). This plan is
the approval packet.

## Read-only findings (2026-10-13 ~12:00 UTC)

| Check | Evidence | Result |
|---|---|---|
| Current Staging deployment | `vercel ls innerdwes`: `innerdwes-3i0hzkev6` (target `staging`, Ready, 2 d) = commit `25fca3e` (billing branch) | will be superseded, kept for rollback |
| Billing work overwrite | `25fca3e` is an ancestor of the TASK 033 base `d02ac99`; `git diff 25fca3e d02ac99 -- app/src` is empty (13 docs/infra commits only) | **no billing code lost**; deploy delta = exactly TASK 033 |
| Migrations | Staging ledger 0001–0047; `git diff 25fca3e <033 HEAD> -- app/supabase/migrations` empty | **no migration needed or introduced** |
| Stripe activation | Staging env var names: `GUEST_ACCESS_IP_HMAC_SECRET, GUEST_ACCESS_TOKEN_SECRET, NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_SITE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY` — no Stripe/Resend/cron secrets; Staging `billing_settings.paid_checkout_enabled = false` | **Stripe cannot activate** |
| Production | deploy uses `--target=staging` only; no `main` push, no promote, no Production env | **Production unchanged** |
| Access control | access chain, tenant/published/draft checks unchanged except the 404-preservation fix (owner requirement) and the access-screen shell — both covered by route tests before deploy | to be re-verified on Staging (status codes) |
| Draft/unpublished data | guest routes read `published_spaces` only; Share Card loader is owner-authenticated (RLS); prefetch only published `/api/media` URLs | to be re-verified on Staging |

## Exact sequence (after approval)

1. Integration HEAD = final commit after the correctness fixes and local QA; full suite, `tsc`, lint, `next build` green.
2. From the TASK 033 worktree root (`~/Desktop/RBR-033-worktree`, not `app/`):
   `vercel link --yes --project innerdwes` (creates a local, gitignored `.vercel/` link only), then
   `vercel deploy --target=staging --yes` → record the deployment URL/id and the commit.
3. Read-only post-deploy checks: deployment target `staging`; Production deployment unchanged; Staging env unchanged.
4. Staging QA (status codes for unknown/unpublished/suspended/unavailable → 404; code-protected access screen; public
   QA Spaces `qa-flow-1h8ve`, `qa-teach-staging`): Preview is SSO-protected → create a Protection Bypass for Automation
   secret via the Vercel API for the harness, **revoke it afterwards** and verify 0 remain (pattern used in TASK 028).
5. **Studio QA on Staging is blocked:** the synthetic QA owner's password is not recorded and setting it via the admin
   API was previously refused. Owner options: provide a password through a secure channel, or approve a password reset
   of the synthetic QA owner (`innerdwes.staging.qa+028@qa.example`) via the Supabase admin API. Without it, Studio
   checks (dates, currency, Share Card republish) are evidenced only by the local QA stack.
6. Rollback: redeploy the previous Staging build (`vercel deploy --target=staging` from `25fca3e`, or reassign the
   staging alias to `innerdwes-3i0hzkev6`). No data or schema change to undo.

## Approval needed (one line)

"Approve deploying `feat/033-guest-experience` @ <final SHA> to the Vercel `staging` environment with
`vercel deploy --target=staging`, plus a temporary protection-bypass secret for automated QA (revoked afterwards)."
Optional: "Approve resetting the synthetic Staging QA owner's password for Studio QA."
