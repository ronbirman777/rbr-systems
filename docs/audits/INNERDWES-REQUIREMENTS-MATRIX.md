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
| BKP-01 | Daily DB backups | TASK 027 ✔ | Supabase Pro physical backups | `supabase backups list` 2026-10-11: 7 COMPLETED, latest 2026-10-10T22:06Z | VERIFIED (Production) | PITR off (RPO ~24 h) | S2 | D8 |
| BKP-02 | Storage → B2 every ~4 h | TASK 027 ✔ | `innerdwes_backup_infra/.github/workflows/daily-storage-backup.yml` | 39/39 runs ok; last `38119667145` 2026-10-11T06:55Z, 332 objects | VERIFIED (Production) | Actual gaps up to ~10 h | S3 | External scheduler if needed |
| BKP-03 | Audio included in backups | 032.5 ✔ | Whole `tenant-media` | B2 332 objects / 2 mp3 = Production 332 / 2 audio (2026-10-11) | VERIFIED | — | — | — |
| BKP-04 | Prior versions ~14 days | TASK 027 ✔ | B2 lifecycle 14 days after hiding | Preflight runs 2026-10-02 | VERIFIED (as of 2026-10-02) | Re-read | S3 | Owner console check |
| BKP-05 | Private / encrypted B2 | TASK 027 (historical) | ? | none | UNKNOWN | — | S1 | Owner console check |
| BKP-06 | Immutability / deletion protection | 032.5 proposal (D3) | ✘ (no Object Lock; CI key can delete) | preflight `file_lock_enabled: false` | MISSING | Deletes propagate | S1 | W5 / D3 |
| BKP-07 | Restore tested | — | ✘ | none | MISSING | No runbook or drill | S1 | W5 drill |
| BKP-08 | Off-platform DB copy | — | ✘ | none | MISSING | — | S2 | Owner decision |
| BKP-09 | Backup failure alerting | — | ✘ | none | MISSING | — | S2 | W5 |

### 2.5 Cloudflare R2 (TASK 032.5; approved in principle 2026-10-11, not implemented)

| ID | Requirement | Status | Design reference | Next |
|---|---|---|---|---|
| R2-01 | Private R2 bucket + authenticated Worker | PLANNED | 04 §D, E | POC A1 |
| R2-02 | Time-limited playback tokens, renewal, revocation (epoch) | PLANNED | 04 §D.2, E.2 | POC P-TOK |
| R2-03 | Safe range requests (206/416/HEAD/If-Range), Safari/iOS | PLANNED | 04 §E.1, E.3 | POC P-STR |
| R2-04 | Subscription state enforcement at the token | PLANNED | 04 §D row 11 | POC P-TOK-05/06 |
| R2-05 | R2-aware replacement for the 0046 `storage.objects` checks | PLANNED | 04 §D.3 | W2 |
| R2-06 | Listening usage kept separate from delivered bandwidth; observe-only | PLANNED | 04 §F.7 | W4 |
| R2-07 | R2 → B2 DR with immutability | PLANNED | 05 §H; GAP §B | W5 |
| R2-08 | Cost within the modelled envelope | PLANNED | 03 v2 | POC P-COST |

### 2.6 TASK 033 — product polish (approved 2026-10-11; planning only)

See `docs/audits/TASK-033-PLAN.md` for the plans. APR ✔ 2026-10-11 for all three. All other states are ✘.

| ID | Requirement | Status | Cause / notes | Next |
|---|---|---|---|---|
| T33-01 | Flow Share Card uses the CURRENT published Space image (with fallback, readable text, correct QR, export preserved) | **CONFLICTING → PLANNED** | Evidenced: the card uses the published **Hero**, not the Space image (`[tenantId]/page.tsx` L253-258, `retreat-configurator.tsx` L3020). The prop goes stale after an in-session publish; logo, name and colours leak from the draft. This is a defect on Production too. Owner must confirm which photo is "current" (TASK-033-PLAN §1) | After TASK 032/032.5 gates |
| T33-02 | Teach Share Card checked for the same issue | PLANNED | Not the same defect: the server route reads `published_spaces` with no-store. Minor fixes: version parameter on the image URL, localized CTA | same |
| T33-03 | tr + it complete across the whole product (seven fully supported locales); not exposed in the Space selector until QA passes | PARTIALLY IMPLEMENTED (billing/admin 700 keys ✔ Staging; common/teach/flow/studio **0 of 1,253** keys) | Gated by `SPACE_SELECTABLE_LOCALES` (tr/it hidden, correct). Font latin-ext, ordinals, Turkish casing and hardcoded literals still to do (TASK-033-PLAN §2) | same |
| T33-04 | Flow Retreat Day Navigator (weekday / date / DAY n, a11y, RTL, timezone-aware) | PLANNED | Existing strip lacks ARIA, keyboard, Today and DAY n. **Existing bug:** weekday uses the device locale and timezone (`schedule-screen.tsx` L34-40) (TASK-033-PLAN §3) | same |

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
