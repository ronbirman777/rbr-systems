# InnerDweS — Requirements Traceability Matrix (technical verification register)

Created 2026-10-11 (TASK 032 / 032.5, Part 2). Owner of the register: the active task. Update it in the same commit as any change that alters a row's state.

## 0. Rules

- **Nothing is `VERIFIED` without cited evidence** for the state claimed: `file:line`, migration, test name, harness check id, QA script check id, run id, or a dated read-only query.
- The six lifecycle states are recorded **separately**:
  - **APR** approved
  - **CODE** implemented in code
  - **LOC** tested locally
  - **STG** verified on Staging
  - **PRD-D** deployed to Production
  - **PRD-V** verified in Production
- Cell values:
  - `✔ <evidence>`
  - `✘`: not done
  - `—`: not applicable
  - `?`: unknown
- **Status:** `VERIFIED · PARTIALLY IMPLEMENTED · IMPLEMENTED BUT UNTESTED · PLANNED · MISSING · CONFLICTING · UNKNOWN`. VERIFIED means verified at the furthest state the requirement is meant to be in today; the state columns show which.
- **Severity:** S1 security/data loss · S2 commercial/legal · S3 functional · S4 cosmetic.
- **Scope qualifiers are mandatory** for enforcement rows: *paid* (billing-governed), *legacy* (no billing row), *exempt*.
- If no written approval can be located, APR is `?` and the status is UNKNOWN or noted as such. **Approvals are never inferred from code.**
- Baselines used:
  - Staging (`kkqjsspxupyxytddiumf`): migrations 0036–0046 applied; deploy `innerdwes-d0ggdqjd1` = `05ab36b`.
  - Production (`qzmsclkzbxrfohuxnitc`): at 0035; `origin/main` `44426be` (TASK 031).
  - Local branch HEAD: `b20afc1` plus uncommitted 2026-10-11 W0 work (to be committed as one commit).

## 1. Requirement sources (index)

| Source | Location | Notes |
|---|---|---|
| Task specs 002–011 | `/Users/ronbirman/Desktop/RBR Project Tasks/` (outside the repo, untracked) | The only spec files that exist |
| Task specs 012–032.5 | **Chat prompts only** (Claude transcripts) | No spec files. That is the root cause in GAP-INVESTIGATION §F.1 |
| Task reports 006–020 | `/Users/ronbirman/Desktop/RBR Project Captures/` | Reports, not specs |
| Repo task notes | `tasks/` (untracked except `tasks/032`), `docs/tasks/028*–030` | Plans and baselines |
| TASK 032 docs | `docs/billing/*.md`, `docs/billing/research/*` | ENTITLEMENTS, LIFECYCLE, ARCHITECTURE, POST-032-REQUIREMENTS, … |
| TASK 032.5 docs | `docs/media/r2-audit/*` | Includes the access-code requirement (first written 2026-10-10) |
| Owner decisions 2026-10-10/11 | Chat prompts: TASK 032 FINAL INTERNAL HARDENING (audio entitlements, exemptions); TASK 032.5 approval (R2 direction); TASK 033 (product polish) | Dates recorded per row |

## 2. Matrix

### 2.1 Billing and commercial (TASK 032)

| ID | Requirement | Source / APR | Code · DB · enforcement | Tests (LOC) | Browser QA | STG | PRD-D / PRD-V | Status | Remaining gap | Sev | Next action |
|---|---|---|---|---|---|---|---|---|---|---|---|
| BIL-01 | Paid Space purchase via Stripe Checkout ($25/month) | TASK 032 brief, 2026-10-09 ✔ | `src/lib/billing/*`, `StripeGateway`; 0036–0041 | ✔ unit + fake-gateway journeys 10/10 (Staging DB) | ✘ real Checkout | Fake gateway only. **Real Stripe Test Mode ✘** | ✘ / ✘ | PARTIALLY IMPLEMENTED | Not connected to the sandbox; Managed Payments review pending | S2 | Owner: MP review, then the sandbox connection checklist |
| BIL-02 | Coupons (per-user, per-Space, unlimited within validity) | TASK 032 ✔ | 0037 coupon engine; Admin Coupons | ✔ unit, harness | Admin QA (create) ✔ | DB ✔; Stripe sync ✘ | ✘ | PARTIALLY IMPLEMENTED | Stripe sync untested; MP coupon compatibility unverified | S2 | After sandbox |
| BIL-03 | Lifecycle: Guest suspended at 24 h, Studio at 7 d, warning at 12 d, deletion-eligible at 14 d (no auto-delete) | TASK 032 + hardening D ✔ | 0038/0039/0042; cron `/api/cron/billing` | ✔ unit, harness | — | DB ✔ (harness); cron schedule ✘ | ✘ | IMPLEMENTED BUT UNTESTED (end-to-end) | Test clocks with real Stripe | S2 | Sandbox journeys 13–17 |
| BIL-04 | Payments/invoices; Admin total/due/paid/refunded | Addendum ✔ | 0040; `InvoiceAmounts` | ✔ | Admin QA 67/67 ✔ (2026-10-10) | ✔ Admin UI (no real invoices) | ✘ | PARTIALLY IMPLEMENTED | Real Stripe documents | S2 | Sandbox |
| BIL-05 | Billing emails (exactly one per event) | Completion Gate B3 ✔ | 0041 outbox; sender is fail-safe | ✔ | — | Enqueue ✔; delivery ✘ (no Resend) | ✘ | PARTIALLY IMPLEMENTED | Resend not configured | S2 | Owner: Resend R1–R6 |
| BIL-06 | Admin with MFA (AAL2) + step-up for sensitive actions | Gate F ✔ | Admin routes; `useAdminForm` | ✔ `noNestedForms.test.ts` | ✔ admin-qa 67/67 incl. F1b/F2/F3 | ✔ | ✘ | VERIFIED (Staging) | — | — | Production at release |
| BIL-07 | Internal exemptions preserved; never subscribed; Replace never transfers an exemption | Hardening 2026-10-10 ✔ | 0046 `EXEMPT_REPLACE_REQUIRES_ADMIN` | ✔ harness P10–P12 | — | ✔ | ✘ | VERIFIED (Staging) | Production list approval | S2 | Owner: PRODUCTION-EXEMPTION-LIST.md |
| BIL-08 | My Spaces paid slots | Gate B2 ✔ | slots provisioning | ✔ `slotProvisioning.test.ts` | ✔ (032 QA) | ✔ | ✘ | VERIFIED (Staging) | — | — | — |
| BIL-09 | "Created with InnerDweS" Guest attribution | Addendum ✔ | `created-with-footer.tsx` | ✔ | ✔ guestattr 8/8 | ✔ | ✘ | VERIFIED (Staging) | — | — | — |
| BIL-10 | 7 locales for Billing/Admin (en/de/es/fr/he/tr/it) | Addendum ✔ | `billing.*`, `admin.*` dictionaries | ✔ i18n tests | ✔ Admin locale sweep | ✔ | ✘ | VERIFIED (Staging, Billing/Admin only) | Native-language review; rest of the product: I18N-01 | S3 | TASK 033 |
| BIL-11 | Rollback chain 0036–0046 | Gate B1 ✔ | `supabase/verification/*_rollback.sql` | ✔ local rehearsal 132/132 | — | Hosted rehearsal **not run** (owner: do not run) | — | VERIFIED (local) | Isolated hosted rehearsal option pending approval | S2 | Owner decision |
| BIL-12 | Managed Payments (MoR) compatibility | MP audit 2026-10-10 ✔ (audit only) | — | — | — | — | — | PLANNED | Owner review of MANAGED-PAYMENTS-COMPATIBILITY-v2.md | S2 | Owner |
| BIL-13 | Do not sell the audio add-on until production-ready | 2026-10-10 ✔ | No purchase path; `space_subscription_addons` has no grants | ✔ harness | — | ✔ | ✘ | VERIFIED (Staging) | — | — | Keep |

### 2.2 Audio entitlements (TASK 032 hardening)

| ID | Requirement | Source / APR | Code · DB · enforcement | Tests | Browser QA | STG | PRD | Status | Gap | Sev | Next |
|---|---|---|---|---|---|---|---|---|---|---|---|
| AUD-01 | Library 240 min (+240 per add-on), **paid** | 2026-10-10 ✔ | Server `audioQuota.ts:122-177`; DB trigger 0046:259-342, assert 0046:348-428, `publish_space` 0043:677 | ✔ `audioQuota*.test.ts`; harness M11–M14 | ✘ | ✔ harness 242/242 (2026-10-10) | ✘ | VERIFIED (Staging, paid) | Studio display and browser pre-check missing (UX) | S4 | W0 planned UX |
| AUD-02 | Max 60 min per recording, **paid** | 2026-10-10 ✔ | Server-measured `audioFinalize.server.ts:47-59`; trigger 0046:309-313 | ✔; harness M5–M7, P2–P5 | ✘ | ✔ | ✘ | VERIFIED (Staging, paid) | No browser pre-check: a 100 MB upload finishes before the refusal | S4 | W0 planned UX |
| AUD-03 | Listening 100,000 min/month (+70,000 per add-on) | 2026-10-10 ✔ | **Display only** (Billing page) | ✘ | — | ✘ | ✘ | **MISSING** | No meter. Launch blocker (ENTITLEMENTS.md) | S2 | W4 (observe-only) |
| AUD-04 | Add-ons stack linearly | 2026-10-10 ✔ | 0038:728-743 | ✔; M12/M13 | — | ✔ | ✘ | VERIFIED (Staging, math) | Not sellable (intended) | — | — |
| AUD-05 | Legacy/exempt Spaces audio caps | **? no written decision** | 100 MB per file (app); 0047 Storage cap (local) | M17/M19 prove no duration or library cap | — | ✘ | ✘ | UNKNOWN (policy) | Is legacy meant to be unlimited? | S3 | Owner decision AW0-b |
| AUD-06 | Duration provenance (server-measured, recorded) | Final Hardening B ✔ | 0046 `billing_audio_verifications`, `attach_verified` | ✔ P1–P7, P14–P16 | — | ✔ | ✘ | VERIFIED (Staging, paid) | Legacy: client duration | S3 | — |
| AUD-07 | Backfill of existing durations | Hardening B ✔ | `scripts/audio-duration-backfill.mjs` | ✔ `audioBackfillCore.test.ts` | — | ✔ dry-run, 0 items | ✘ | VERIFIED (Staging dry-run) | Production run is part of the release plan | S3 | Release |

### 2.3 Media security

| ID | Requirement | Source / APR | Code · DB · enforcement | Tests | Browser QA | STG | PRD | Status | Gap | Sev | Next |
|---|---|---|---|---|---|---|---|---|---|---|---|
| MED-01 | Image content validation (magic bytes + re-encode) | Hardening A ✔ | `imageSignature.ts`; `retreat/actions.ts:91-105`; paid trusted writer; 0045 | ✔ `mediaContentGuard.test.ts`; O1–O8 | ✘ | ✔ | Magic bytes on Production? ✘ (032 not released) | VERIFIED (Staging, paid) | Legacy members can still write arbitrary bytes straight to Storage (O12/O13) | S3 | AW0-b |
| MED-02 | Audio content validation | Hardening A ✔ | Decoder parse (paid) `audioDuration.ts` | ✔ | — | ✔ | ✘ | PARTIALLY IMPLEMENTED | Legacy: declared type only | S3 | AW0-b |
| MED-03 | Bucket size / MIME limits | 032.5 W0 (planned 2026-10-10; owner approved gap closure 2026-10-11) | **0047** `file_size_limit` 100 MiB + MIME list | ✔ local DB apply/rollback; local Storage API 415/413/200 (2026-10-11) | — | ✘ | ✘ | IMPLEMENTED BUT UNTESTED (hosted) | Staging apply | S1 | AW0-a |
| MED-04 | File integrity (sha256, publish re-hash) | Hardening ✔ | `publish.ts:266-340`; 0046 | ✔ P8 | — | ✔ | ✘ | VERIFIED (Staging, paid) | — | — | — |
| MED-05 | Tenant isolation (storage + delivery) | TASK 022 / 027 ✔ | 0030 policies; `route.ts:76-90` | ✔ route tests 4, 9b; O9 | ✔ (TASK 022 QA) | ✔ | ✔ / ✔ (TASK 022 live) | VERIFIED (Production) | — | — | — |
| MED-06 | Draft / published isolation | TASK 023 ✔ | `route.ts:78,115`; 0029; 0045 | ✔ route tests; `publishedMediaImmutability.test.ts` | — | ✔ | ✔ / partial (pre-0045) | VERIFIED (paid, Staging); PARTIAL (legacy) | A legacy member can pre-create `published.*` | S3 | AW0-b |
| MED-07 | Playback authorization + commercial availability | TASK 022 / 032 ✔ | `isSpacePubliclyAvailable.ts:28-53` | ✔ route tests | — | ✔ | Guest code ✔ / billing ✘ | VERIFIED (Staging) | Signed URLs live 60–180 s after revocation | S3 | R2 W3 |
| MED-08 | Item deletion removes its draft media | TASK 023 ✔ | Teach `itemDraftRefs`; **Flow fixed 2026-10-11** (`draftRefs.ts`) | ✔ Teach `audioLifecycle.test.ts:229`; ✔ Flow `flowAudioDeletion.test.ts` (4) | — | Teach ✔ / Flow ✘ (fix not deployed) | Flow leak present on Production | PARTIALLY IMPLEMENTED | Deploy the Flow fix | S3 | AW0-a |
| MED-09 | Orphan draft handling | 032.5 W0 | Read-only report `orphan-media-report.sql`; **no sweeper** | — | — | Report: 0 orphans (2026-10-11) | Report: 0 orphans (2026-10-11) | PARTIALLY IMPLEMENTED | Prevention sweep needs retention approval | S3 | AW0-c / D7 |
| MED-10 | Space Guest access code (Space-wide), protects media | 008C / 022 ✔ | `effectiveAccess.ts`, 0016 RPCs, `/api/media` | ✔ | ✔ (009 live) | ✔ | ✔ / ✔ | VERIFIED (Production) | — | — | — |
| MED-11 | **Optional library access code** | First written 2026-10-10. Owner approved 2026-10-11 ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | PLANNED (design ready, 04 §D.1b) | Not implemented; no earlier approval found (GAP §A) | S2 | D4 → W3a |
| MED-12 | **Optional per-recording access code** | as MED-11 | ✘ | ✘ | ✘ | ✘ | ✘ | PLANNED | as above | S2 | D4 → W3a |
| MED-13 | Both codes required when both are configured | as MED-11 | ✘ | ✘ | ✘ | ✘ | ✘ | PLANNED | — | S2 | W3a |
| MED-14 | No persistent listener id / IP / UA / cross-Space tracking | Owner rule (032 readiness) ✔ | Current code stores none; the guest rate limit stores an IP **HMAC** (0016) for 10 min | ✔ (guest access tests) | — | ✔ | ✔ | VERIFIED (current code) | Must hold for the metering design (04 §F.7) | S2 | W4 tests |

### 2.4 Backups and disaster recovery (TASK 027)

| ID | Requirement | Source / APR | Implementation | Evidence | Status | Gap | Sev | Next |
|---|---|---|---|---|---|---|---|---|
| BKP-01 | Daily DB backups | TASK 027 ✔ | Supabase Pro physical backups | `supabase backups list` 2026-10-12: 7 COMPLETED, latest 2026-10-11T22:06Z; `pitr_enabled: false` | VERIFIED (Production) | PITR off (recovery point ~24 h) | S2 | 032.6 §6.7 |
| BKP-02 | Storage → B2 every ~4 h | TASK 027 ✔; 032.6 B/C released | Live: guarded `daily-storage-backup.yml` on infra `main` `1fca3e6` (merged 2026-10-13 09:49:09Z; pinned rclone, guard, main-only writer) | First guarded run 38379519351 (manual, 2026-10-13): 334/334, 0/0/0, validator 12/12, SHA-256 spot 12/12, 0 unexplained B2 versions. R4 (3 scheduled guarded runs): **0/3** at 2026-10-13 10:42Z (no scheduled slot delivered since 02:28Z) | VERIFIED (first guarded run, Production); R4 OPEN | GitHub delivers ~3.5 of 6 slots/day; gaps up to 11.4 h | S1 | R4 closure (read-only) |
| BKP-03 | Audio included in backups | 032.5 ✔ | Whole `tenant-media` (the only Production bucket) | 2026-10-12 restore: Production 334 / B2 334 live, 2 mp3 both decode | VERIFIED | — | — | — |
| BKP-04 | Prior versions ~14 days | TASK 027 ✔ | B2 lifecycle `daysFromHidingToDeleting: 14` (whole bucket) | Read-only `b2_list_buckets` 2026-10-12; 981 versions / 62 hide markers under tenant-media | VERIFIED (2026-10-12) | A key with `deleteFiles` defeats it | S2 | 032.6 WS-D/E |
| BKP-05 | Private / encrypted B2 | TASK 027 (historical) | `allPrivate`, default SSE-B2 (AES256), no CORS, no replication | Read-only `b2_list_buckets` 2026-10-12 | VERIFIED (2026-10-12) | — | — | — |
| BKP-06 | Immutability / deletion protection | 032.5 proposal (D3); 032.6 design | Live on `main` `1fca3e6`: deletion/erosion/empty-source guards, `--max-delete`, `--b2-hard-delete=false`. No Object Lock / vault yet | First guarded run 2026-10-13 (0 deletions planned/applied); guard tests 317 (CI); `file_lock_enabled: false` (2026-10-02) | PARTIALLY IMPLEMENTED (guards live; no immutable copy) | CI key still has `deleteFiles`; vault not created | S1 | WS-D/E packets: infra `task-032.6-dr-packets` `0ac90f5` (owner approval) |
| BKP-07 | Restore tested | 032.5 ✔ (owner 2026-10-12) | `infra/backup-restore-test/restore-test.mjs` (`9a5ca43`) | 2026-10-12: 334/334 restored, MD5 334/334 vs Production, B2 SHA-1 334/334, sizes 334/334, 0 missing/unexpected, 240.6 s; evidence `~/.config/innerdwes/dr-evidence/2026-10-12-b2-restore/` (SHA256SUMS digest `e724b8d5…`) | VERIFIED (media; one drill) | No runbook; DB restore never tested | S1 | 032.6 WS-H |
| BKP-08 | Off-platform DB copy | — | ✘ | Workflows copy Storage only (2026-10-12) | MISSING | Supabase-only DB recovery | S1 | 032.6 WS-G |
| BKP-09 | Backup failure alerting | 032.6 WS-F (owner decisions 2026-10-13) | Infra branch `task-032.6-wsf-watchdog` @ `774cc00` (local, not deployed): Cloudflare cron Worker every 30 min; stale 8 h warning / 12 h critical, failed/blocked runs (prompt), stuck runs/locks, invalid state, deletions > max(10, 5%)/24 h, count drop, credential expiry; Resend email with de-dup, 12 h reminders, recovery notices, incident history | 43 synthetic tests pass; read-only conformance check vs live state 2026-10-13; `docs/watchdog-runbook.md` | IMPLEMENTED (NOT DEPLOYED) | No checksum or cost alerts yet; deployment + credentials need owner approval | S2 | WS-F deployment |
| BKP-10 | Least-privilege backup credentials | 032.6 design | ✘ CI B2 key = read-and-write preset; Supabase S3 key = full access (cannot be scoped) | Preflight log 2026-10-02; Supabase docs *S3 Authentication* | MISSING | Compromise can delete source and backup | S1 | 032.6 WS-B/D/J |
| BKP-11 | Restored copies and operator machine secured | 032.6 | Restored Production media **deleted 2026-10-12** (owner-approved, verified 334/334 against the manifest first; evidence kept in `~/.config/innerdwes/dr-evidence/`). FileVault was off (owner troubleshooting) | `fdesetup status`; deletion log 2026-10-12 | PARTIALLY IMPLEMENTED | FileVault | S2 | Owner (WS-A3) |
| BKP-13 | Backup workflows: pinned tools, least token permissions, secrets only on main | 032.6 ✔ (owner 2026-10-12) | Released: infra `main` `1fca3e6` (merge of PR #1, head `5d5d31d`): SHA-256-pinned install action, `permissions: {}`, main-only writer gate, read-only branch dry run, shared concurrency, env-only remotes | 317 tests (CI 38341921758 / 38341926969); dry runs 38331450109, 38345649493; first guarded run 38379519351 PASS (2026-10-13); stale `task-027-*` branches deleted 2026-10-13 09:57Z (SHAs in rollout log) | VERIFIED (Production, first run) | GitHub Free: no branch protection; `task-027-*` workflows remain on `main` (separate cleanup) | S1 | R4 closure |
| BKP-14 | Backups and DR independent of the owner's Mac | 032.6 ✔ (owner 2026-10-12) | Live job on GitHub Actions; B2 storage; local restore copies deleted | Plan §14 | PARTIALLY IMPLEMENTED | Monitoring, vault, DB dumps and restore drills not built | S2 | WS-E/F/G/H |
| BKP-15 | Missed-run detection by an independent watchdog | 032.6 WS-F | Same Worker: `backup.missed_runs` (no run started > 8 h) + `backup.stale`; Healthchecks.io dead-man check on the watchdog itself (30 min period, 60 min grace; `/fail` when it cannot evaluate or email); independent of the Mac, Vercel, Supabase and the app | Tests: missed run, delayed run, outages (UNKNOWN, no false recovery), watchdog outage paths | IMPLEMENTED (NOT DEPLOYED) | Phase F2 (backup job pings) needs a reviewed merge to `main` | S2 | WS-F deployment |
| BKP-12 | First (unsafe) restore key revoked | 032.5 | Owner replaced it | Cannot be read without `listKeys` | UNKNOWN | — | S2 | Owner console check (WS-A1) |

### 2.5 Cloudflare R2 (TASK 032.5; approved in principle 2026-10-11; hosted synthetic POC deployed and measured 2026-10-12, product integration not implemented)

POC evidence (`docs/media/r2-audit/07-POC-ACCOUNTING.md`): Worker/bucket `innerdwes-media-poc`, mode `seg`, version `9ba64f4d`, 185 requests, CPU P99 5.86 ms / max 6.79 ms, 0 exceededResources; synthetic 60-min fixture only. Not proved: real devices (Safari/iOS/lock screen), entitlements, >60 min files, R2→B2 restore. Finding 2026-10-13: POC `epochOk` uses `ep >= epoch` at 1-s resolution (`infra/media-worker-poc/src/index.ts:59`), so a token minted in the revocation second survives — the product Worker must use a strictly increasing epoch.

| ID | Requirement | Status | Design reference | Next |
|---|---|---|---|---|
| R2-01 | Private R2 bucket + authenticated Worker | PLANNED | 04 §D, E | POC A1 |
| R2-02 | Time-limited playback tokens, renewal, revocation (epoch) | PLANNED | 04 §D.2, E.2 | POC P-TOK |
| R2-03 | Safe range requests (206/416/HEAD/If-Range), Safari/iOS | PLANNED | 04 §E.1, E.3 | POC P-STR |
| R2-04 | Subscription state enforcement at the token | PLANNED | 04 §D row 11 | POC P-TOK-05/06 |
| R2-05 | R2-aware replacement for the 0046 `storage.objects` checks | PLANNED | 04 §D.3 | W2 |
| R2-06 | Listening usage kept separate from delivered bandwidth; observe-only | PLANNED | 04 §F.7 | W4 |
| R2-07 | R2 → B2 DR with immutability | PLANNED | 05 §H; GAP §B; `docs/dr/TASK-032.6-BACKUP-DR-PLAN.md` §8 | 032.6 WS-I |
| R2-08 | Cost within the modelled envelope | PLANNED | 03 v2 | POC P-COST |

### 2.6 TASK 033 — product polish (approved 2026-10-11; planning only)

See `docs/audits/TASK-033-PLAN.md` for the plans and the **LOCKED OWNER DECISIONS A1–A6** (2026-10-11). APR ✔ for all. **2026-10-13: owner lifted A6 and approved implementation** — CODE/LOC ✔ on branch `feat/033-guest-experience` (local, not pushed; see `docs/tasks/033/INTEGRATION-REPORT.md`); STG and PRD ✘ (no deploy, no hosted migration).

| ID | Requirement | Status | Cause / notes | Next |
|---|---|---|---|---|
| T33-01 | Flow Share Card reflects the latest **published** image and brand state (Space image → Hero → gradient), fresh after Republish without reload | IMPLEMENTED LOCALLY (branch `feat/033-guest-experience` @ `e3ed1eb`; **on Staging** 2026-10-13, `innerdwes-85fff4s07`; Staging 2026-10-13 round 2: Share Card freshness PASS; not on Production; see `docs/tasks/033/STAGING-QA-REPORT.md`) | Evidenced: the card uses the published **Hero**, not the Space image (`[tenantId]/page.tsx` L253-258, `retreat-configurator.tsx` L3020). The prop goes stale after an in-session publish; logo, name and colours leak from the draft. This is a defect on Production too. Owner must confirm which photo is "current" (TASK-033-PLAN §1) | After TASK 032/032.5 gates |
| T33-02 | Teach Share Card: keep behaviour, add image versioning, translated labels, Space-image preference with fallback (A4) | IMPLEMENTED LOCALLY (branch `feat/033-guest-experience` @ `e3ed1eb`; **on Staging** 2026-10-13, `innerdwes-85fff4s07`; Staging: social image 200; Teach card `?v=` 200 signed-in / 404 anonymous, advances after Republish PASS; not on Production; see `docs/tasks/033/STAGING-QA-REPORT.md`) | Not the same defect: the server route reads `published_spaces` with no-store. Minor fixes: version parameter on the image URL, localized CTA | same |
| T33-03 | tr + it complete for the Studio/builder (after auth) and both Guest Apps (seven locales); **marketing, sign-up, log-in and recovery stay English only** (A2); not Space-selectable until QA passes | IMPLEMENTED LOCALLY: tr/it 1,253 keys each + integration keys; **not Space-selectable** until QA + native review (branch `feat/033-guest-experience` @ `e3ed1eb`; **on Staging** 2026-10-13, `innerdwes-85fff4s07`; Staging: tr/it absent from the Studio list; Hebrew RTL PASS; not on Production; see `docs/tasks/033/STAGING-QA-REPORT.md`) Acceptance 2 (local `56baec0`): tr/it key/placeholder/plural parity re-verified incl. all 27 keys since `d02ac99`; still not selectable; native-review checklist `docs/localization/NATIVE-REVIEW-CHECKLIST-tr-it.md`; switch = `SPACE_SELECTABLE_LOCALES`. | Gated by `SPACE_SELECTABLE_LOCALES` (tr/it hidden, correct). Font latin-ext, ordinals, Turkish casing and hardcoded literals still to do (TASK-033-PLAN §2) | same |
| T33-04 | Flow Retreat Day Navigator (weekday / date / DAY n from **calendar dates in the retreat IANA timezone**, a11y, RTL; single-day = date header) | IMPLEMENTED LOCALLY: optional start/end dates in `retreatProfile` (published by existing `publish_space`, no migration) (branch `feat/033-guest-experience` @ `e3ed1eb`; **on Staging** 2026-10-13, `innerdwes-85fff4s07`; Staging: multi-day navigator, empty days, Day 1 = start, Daily Inspiration, timezone PASS; D1 duplicate-key fix `e293838` (on Staging 2026-10-14, `innerdwes-4iqe9trhs` @ `182f47e`; not yet re-verified there); not on Production; see `docs/tasks/033/STAGING-QA-REPORT.md`) D4 WebKit #418 fixed `caa39b6` (Node vs WebKit timezone list in Flow + Teach Studio; `de` short dates, range spacing, Italian zero padding); local 0 hydration errors, 15 pages × 2 engines × 3 runs; not yet on Staging. | Existing strip lacks ARIA, keyboard, Today and DAY n. **Existing bug:** weekday uses the device locale and timezone (`schedule-screen.tsx` L34-40) (TASK-033-PLAN §3) | same |

**Addendum 2026-10-12** (TASK-033-PLAN §4; owner FINAL UX DECISION UPDATE). APR ✔ for audit and planning. CODE, LOC, STG and PRD are ✘.

| ID | Requirement | Status | Cause / notes | Next |
|---|---|---|---|---|
| T33-05 | Remove the Studio "Where you are / Country" section. The phone calling-code default comes from the **account profile country** (`profiles.country`) and is changeable per field. The account country is never changed by phone edits and is never used for timezone, billing/tax or Guest language. Existing data is kept | PLANNED | Audit: the Studio country feeds **no** phone input (the only `PhoneField` is sign-up). It drives the Language "Recommended" badges only, and it **is published in anonymous snapshots** (`publish_space` copies `spaceSettings`, 0043:659-669). Studio phone fields are free text with a hard-coded `+972` placeholder. Pre-0019 accounts have no profile row. Decisions D-CC1 and D-CC2 | TASK 033 step 5 |
| T33-06 | Searchable ISO 4217 currency selector. Locale-aware, unambiguous formatting in 7 locales. No conversion, no silent reinterpretation. Values preserved. Kept separate from InnerDweS billing (USD 25/month unchanged) | IMPLEMENTED LOCALLY: Space default `spaceSettings.currency` = EUR, per-item override, ISO selector, `formatPrice` (branch `feat/033-guest-experience` @ `e3ed1eb`; **on Staging** 2026-10-13, `innerdwes-85fff4s07`; Staging: EUR default, USD override, `€120.00`/`US$95.50` PASS; not on Production; see `docs/tasks/033/STAGING-QA-REPORT.md`) Legacy prices verified locally (Guest + Studio, both engines, en/he), locked in `legacyPricing.test.ts` `2869649`; no defect; D-CC4 leniency verified in the Studio UI; Teach accepts any 3 capitals (owner checklist §C1). | Audit: currency is per item (`metadata.currency`). Flow is free text ≤8 and unvalidated, displayed as `"1500.5 EUR"` without locale digits. Teach is `^[A-Z]{3}$` with locale digits. There is no ISO list. Billing has a separate `money.ts`. No migration required. D-CC3, D-CC4 and D-CC5 | TASK 033 step 5 |
| T33-07 | Guest startup performance: measure, fix real bottlenecks, staged prefetch (critical, high, background) with reduced-data, slow-network and memory rules. Isolation preserved | PARTIALLY IMPLEMENTED LOCALLY: `/g` single access chain, guest font preloads 11→3, staged prefetch, column `sizes`; **not done:** D-PF1 region, D-PF2 cache, P2 RPC, P3 media check; measured locally + Staging (branch `feat/033-guest-experience` @ `e3ed1eb`; **on Staging** 2026-10-13, `innerdwes-85fff4s07`; Staging: −31/−40 % bytes, −72 KB JS, 3 font preloads; hero time unchanged (server-bound); Flow first-byte rise = sampling noise (20 paired runs); not on Production; see `docs/tasks/033/STAGING-QA-REPORT.md`) | **Measured 2026-10-12 (Production public pages, lab):** Lena HTML 1.8–2.8 s server-side; cold `/api/media` 2.1 s; cold hero ready 2.1–6.6 s (fast, 390 px), 20 s on slow 3G. **Root cause:** Vercel functions in `iad1` versus Supabase `ap-northeast-1`, with 4–6 sequential database round trips per page and again per image. Assets are correctly sized. Fixes P1–P5 (P1 region and P2 RPC migration need approval: D-PF1, D-PF2). Acceptance thresholds in §4.11 | TASK 033 step 3 |
| T33-08 | Branded Guest loading screen: InnerDweS mark, calm breathe, "Created with InnerDweS" localized (brand untranslated), no forced wait, no flicker, reduced motion, never stuck. Customer brand primary afterwards; existing footer kept | IMPLEMENTED LOCALLY: Suspense fallback + hero-wait (1.5 s cap) (branch `feat/033-guest-experience` @ `e3ed1eb`; **on Staging** 2026-10-13, `innerdwes-85fff4s07`; Staging: loader never over painted content (fast + 4G, 3 runs each); not on Production; see `docs/tasks/033/STAGING-QA-REPORT.md`) | Today there is no `loading.tsx` or Suspense under `(guest)`, so there is a blank wait. Reuses `InnerDweSMark` and `idw-loading-breathe` and the `attribution.createdWith` key (7 locales). Streaming fallback plus a hero-wait capped at 1.5 s (D-LD1). Must ship **after** T33-07 Stage 0 | TASK 033 step 4 |
| T33-09 | Shared centered mobile-style desktop shell for Flow and Teach Guest Apps (owner 2026-10-13); mobile unchanged | IMPLEMENTED LOCALLY: ≥640 px viewport → centered column ≤480 px, brand-tinted backdrop (branch `feat/033-guest-experience` @ `e3ed1eb`; **on Staging** 2026-10-13, `innerdwes-85fff4s07`; Staging: PASS incl. access-code screen; Studio D2/D3 fixes `e293838` (on Staging 2026-10-14, `innerdwes-4iqe9trhs` @ `182f47e`; not yet re-verified there); not on Production; see `docs/tasks/033/STAGING-QA-REPORT.md`) D6 (draft-image 404 after replace) not reproducible locally; open, cosmetic. | `components/guest/guest-desktop-shell.tsx`; code-entry screen not yet in the shell | Browser QA |

### 2.8 Admin Operations & Business Dashboard (approved direction 2026-10-13; planning only)

Specification: `docs/admin/ADMIN-OPERATIONS-DASHBOARD-SPEC.md`. APR ✔ (owner, 2026-10-13) for planning only. CODE, LOC, STG and PRD are ✘ unless a row says otherwise.

| ID | Requirement | Status | Evidence / reuse | Next |
|---|---|---|---|---|
| ADM-01 | One extended `/admin` (no separate system); nine sections (Overview, Spaces & Customers, Revenue & Billing, Usage & Resources, Infrastructure & Providers, Backups & DR, Alerts & Incidents, Costs & Profitability, Settings & Integrations) | PLANNED | Reuses `admin/billing/*`, `AdminNav.tsx`, `_components/ui.tsx`; spec §2 | Phase 1 approval |
| ADM-02 | Server-side admin authorization on every page/action; owner-only financial sections; no secrets in the browser | PARTIALLY IMPLEMENTED | `lib/billing/admin/auth.ts:8-92` (session + `admin_users` + AAL2 + step-up), BIL-06 VERIFIED (Staging); role split for new sections not built (spec §9) | Phase 1 |
| ADM-03 | Business metrics from actual backend definitions (accounts, Spaces by type/state, published/draft, paid/unpaid/legacy/suspended, growth, cancellations) | PARTIALLY IMPLEMENTED | Billing counts exist (`metrics.ts`, `docs/billing/METRICS.md`); Space/account metrics defined in spec §4.1, queries not written; history needs snapshots | Phase 1 |
| ADM-04 | Revenue terminology kept distinct (gross, taxes, fees, net estimate, cash, recognized = not supported); no invented figures; respects BIL-12 | PARTIALLY IMPLEMENTED | MRR list/current and invoice amounts exist (0040); fees, payouts, MRR movements PLANNED (spec §4.2) | After BIL-12 decision |
| ADM-05 | Provider inventory with plan, usage/billing API availability, auth, thresholds, renewals; manual/estimated values labelled | PLANNED | Spec §3; several plans unverified (`?`), several APIs REQUIRES RESEARCH | Owner: confirm plans and domains |
| ADM-06 | Infrastructure usage only from real sources (Supabase SQL, B2 read-only key, GitHub, Cloudflare GraphQL, Stripe, Resend) | PLANNED | Spec §6 | Phase 4 |
| ADM-07 | Audio usage: library utilization now; listening minutes only after observe-only metering; estimates labelled; privacy (no listener identity, IP/UA, unique listeners) | PARTIALLY IMPLEMENTED | Library durations and entitlements exist (0038/0043/0046); listening NOT measured (R2-06 PLANNED) | Phase 6 |
| ADM-08 | Alert center: severities, fingerprint de-duplication, evidence, recommended action, ack/resolve history | PLANNED | Spec §7.1–7.2 | Phase 3 |
| ADM-09 | Critical alerts delivered independently of the app (dead-man switch + Cloudflare cron Worker + email); detects never-started and failed backups; recovery notices; no duplicates | BACKEND IMPLEMENTED (NOT DEPLOYED): WS-F Worker `774cc00` writes KV `summary/v1` for the future dashboard; dashboard view not built | Spec §7.3; DR plan §14.2; links BKP-09, BKP-15. **Owner priority 2026-10-13: build the WS-F watchdog right after B/C activation and before any expanded Admin UI** | WS-F after TASK 032.6 release |
| ADM-10 | Costs & profitability: actual vs calculated vs forecast, manual expenses, per-paid-Space and margin estimates; owner only | PLANNED | Spec §4.3 | Phase 5 |
| ADM-11 | Read-only boundary: no infrastructure-changing or destructive controls without separate approval; sensitive views and acknowledgements audited | PLANNED | `admin_audit_log` exists (0036:596); spec §9 | Each phase |
| ADM-12 | Data model, refresh frequencies and retention (snapshots 2 y, raw samples 90 d, alerts 1 y) | PLANNED | Spec §8 | Phase 1 migration |

### 2.7 Platform areas not yet audited (Part 13 scope)

These areas have shipped functionality but **no verification rows yet**. They are UNKNOWN until the platform-wide audit (`PLATFORM-AUDIT-PLAN.md`) runs. That audit is scheduled before the first paying customer.

| ID | Area | Status |
|---|---|---|
| PLT-01 | Auth (sign-up/in, reset, sessions) | UNKNOWN |
| PLT-02 | Profiles | UNKNOWN |
| PLT-03 | Create Space | UNKNOWN |
| PLT-04 | Publishing (snapshot fingerprints known; full review pending) | UNKNOWN |
| PLT-05 | Brand | UNKNOWN |
| PLT-06 | Custom Pages (sanitization) | UNKNOWN |
| PLT-07 | Analytics and consent | UNKNOWN |
| PLT-08 | Localization (non-billing surfaces) | UNKNOWN (see T33-03) |
| TCH-01..09 | Teach: Studio, Guest, Classes, Recurrence, Timezones, Facilitator, Readings, Audio, My Retreats | UNKNOWN |
| FLW-01..12 | Flow: Studio, Guest, Profile, Schedule, Meals, Facilities, Treatments, Arrival, FAQ, Guidelines, Custom Pages, Daily Inspiration | UNKNOWN (Daily Inspiration released and live-verified in TASK 030, per memory; re-verify) |
| OPS-01..06 | Stripe, Resend, Supabase, Vercel, Monitoring, Legal readiness | UNKNOWN / see BIL rows |
