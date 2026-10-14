# InnerDweS platform handover (outline, 2026-10-14)

Purpose: one entry point for whoever operates InnerDweS next. It is an outline that **points to** the authoritative
documents. It does not copy them. Gaps are marked **GAP**. Facts are as of the cited evidence. Re-verify anything
time-sensitive (deployed SHAs, key expiry) before you rely on it.

## 1. Architecture

```
Browser ──► Vercel (Next.js app in app/, functions iad1) ──► Supabase Production (ap-northeast-1)
                │   /api/media (signed URLs)                    Postgres · Auth · Storage tenant-media
                │   /api/cron/billing (every 15 min, Production only; needs CRON_SECRET)
                └─► Stripe (billing, not live) · Resend (email, not configured)
GitHub Actions (infra repo) ──every 4 h (best effort)──► Backblaze B2 innerdwes-production-backup (versions 14 d)
Cloudflare: R2 media POC Worker (synthetic only) · planned backup watchdog Worker (+ KV) ──► email; Healthchecks.io
```

| Component | Doc |
|---|---|
| App and products (Time to Flow `retreat`, Time to Teach `teach`, legacy `client_hub`) | `app/` · `lib/brand/productFamilies.ts` |
| Billing architecture | `docs/billing/ARCHITECTURE.md`, `LIFECYCLE.md`, `ENTITLEMENTS.md`, `STRIPE-MAPPING.md` |
| Media / R2 plan | `docs/media/r2-audit/00-…08` (POC evidence: `07-POC-ACCOUNTING.md`; product requirements: `08-PRODUCT-WORKER-REQUIREMENTS.md`) |
| Guest access and trusted IP | `lib/guestAccess/*` (fail-closed; only `x-vercel-forwarded-for` is trusted) · project `CLAUDE.md` |
| Backups / DR | `docs/dr/TASK-032.6-BACKUP-DR-PLAN.md` |
| Admin | `docs/admin/*` (spec, contracts, providers, backup view, batches) |

**GAP:** no single architecture diagram is maintained in the repo apart from this outline and the DR plan §14.

## 2. Environments

| Env | App | Database | Notes |
|---|---|---|---|
| Production | Vercel Production; **pushing app `main` auto-deploys Production** | Supabase `qzmsclkzbxrfohuxnitc`, migrations at **0035** (`origin/main` `44426be`, TASK 031) | Billing (0036+) is not released. Paid checkout OFF |
| Staging | Vercel `staging` custom environment (`vercel deploy --target=staging` from the repo root) | Supabase `kkqjsspxupyxytddiumf`, 0036–0046 (+0047 per the 2026-10-12 checkpoint) | Synthetic QA owner; Studio login blocked (no password, per project memory) |
| Preview | Vercel Preview, SSO-protected; does **not** inherit Production Supabase env | none by default | Bypass secrets are revoked after QA |
| Local | `next dev` | local Supabase | Local-only IP fallback (explicit, tested) |

Env var **names**: `docs/billing/ENVIRONMENT.md`. Values never live in the repo.
**GAP:** an env-name matrix per environment that has been read from Vercel (names only) is not recorded. It is part of the platform audit (PLATFORM-AUDIT-PLAN §2.4).

## 3. Repositories and branches

| Repo | Purpose | Key refs (as of the cited docs) |
|---|---|---|
| `ronbirman777/rbr-systems` (app) | Next.js app, migrations, docs | `origin/main` `44426be` (Production). Feature branch `feat/032-commercial-platform-foundation` (billing, R2 POC, DR docs; unreleased). This doc: `docs/032.6-admin-launch-prep` from `b06a195` |
| `ronbirman777/innerdwes_backup_infra` (private) | Backup workflows, guard, restore tool, watchdog | `main` `1fca3e6` (guarded backup, live). `task-032.6-wsf-watchdog` (watchdog `774cc00` + packet `bc078dd` + setup `fae9722`; local, not pushed). `task-032.6-dr-packets` `0ac90f5`. `task-032.6-backup-hardening` `5d5d31d` |

Rules: there are two different repos, so never mix the infra `main` SHA with the app release base (workboard §9). Many app worktrees exist (37 counted on 2026-10-13; recount before reuse). Migration numbers are allocated centrally: **0048+ is contested** between R2 and TASK 033 (HANDOFF-EVIDENCE #16), and Admin needs its own reservation.

## 4. Release process

| Change | Process | Doc |
|---|---|---|
| App to Production | Release packet: exact SHAs, migration order, fresh backup + restore evidence, flags, rollback, Staging QA, owner decisions, then the push to `main` (= deploy), then read-only post-deploy verification | Workboard §8 D4; `docs/billing/PRODUCTION-RELEASE-PLAN.md`; `MIGRATION-RECOVERY.md`; `ROLLBACK-REHEARSAL.md` |
| Migrations | Append-only; local isolated DB apply/rollback → Staging (approved) → Production (release gate) | `app/supabase/migrations/`, `supabase/verification/*_rollback.sql` |
| Pre-commit checks | Type generation, typecheck, lint, full tests, production build, diff hygiene, in a clean state | Project `CLAUDE.md` |
| Infra `main` | A merge changes the live backup workflow (a separate approval) | DR plan §15; rollout log |
| Watchdog | Deployment packet with owner approval | infra `docs/watchdog-deployment-packet.md` |
| Paid launch | `docs/billing/LAUNCH-GATES.md` + `docs/launch/LEGAL-PRIVACY-LAUNCH-GATES.md` | — |

## 5. Backups, DR and the watchdog runbooks

| Topic | Where |
|---|---|
| DR plan, gaps, credential plan, RPO/RTO targets | `docs/dr/TASK-032.6-BACKUP-DR-PLAN.md` (§2 gaps, §4 credentials, §14.4 RPO/RTO) |
| Rollout evidence (B/C release, R3, R4) | `docs/dr/TASK-032.6-ROLLOUT-LOG.md` |
| Backup guard behaviour and rollback triggers | infra `docs/storage-backup-guard.md` |
| Scale / performance | infra `docs/backup-performance-and-scale.md` |
| Watchdog: runbook, incident responses A–H | infra `docs/watchdog-runbook.md` |
| Watchdog: deployment packet / owner setup | infra `docs/watchdog-deployment-packet.md`, `docs/watchdog-owner-setup.md` |
| Restore tool | app `infra/backup-restore-test/restore-test.mjs` (`9a5ca43`) |
| Approval packets D/E/G/J, R3 fixture test | infra `task-032.6-dr-packets` (`0ac90f5`) |
| Admin billing recovery (lost TOTP) | `docs/billing/ADMIN-RECOVERY.md` |
| Billing operations (cron, stuck webhook/outbox) | `docs/billing/OPERATIONS.md` |

**GAPs:** no restore runbook for media or DB (BKP-07, G13); the DB restore has never been tested; no off-platform DB copy (BKP-08); no vault (BKP-06); R3 is partially verified.

## 6. Account and credential inventory

`docs/security/ACCOUNT-SECURITY-INVENTORY.md` (metadata only; follow-ups F-1…F-13). **GAP:** MFA and recovery custody are UNVERIFIED for every provider account.

## 7. On-call and alerts

| Signal | Delivered by | State |
|---|---|---|
| Backup failed / stale / missed / deletions / stuck / credential expiry | Watchdog Worker → email (Resend); 12 h reminders; recovery notices | **NOT DEPLOYED** (BKP-09/15) |
| Watchdog itself down | Healthchecks.io → email | **Not created** |
| Failed scheduled GitHub run | GitHub default email | Delivery UNVERIFIED (DR plan §1.5) |
| Billing cron / webhook / outbox failures | Vercel logs + Admin overview counts (manual check) | No push alert. **GAP** (OPERATIONS.md; Admin Batch 4) |
| Uptime / error tracking | — | **None** (spec §1: "not present") |
| Cost / quota alerts | — | **None** (Admin Batches 5–6) |

On-call: owner only (single person). **GAP:** no second responder, no escalation path, no documented response-time expectation. The alert recipient is a Worker secret (never in the repo).

## 8. Open gaps summary (for the next operator)

1. Deploy and drill the watchdog. 2. Production release of billing (0036+) with legal/tax/MoR gates. 3. DB backup + restore drill (WS-G/H).
4. Vault (WS-E) after the retention decision. 5. Least-privilege rotations (WS-D/J). 6. Platform audit (PLT-*, TCH-*, FLW-*, OPS-* UNKNOWN).
7. Account MFA/recovery inventory. 8. Uptime and error monitoring. 9. Listening metering before paid launch (AUD-03).
