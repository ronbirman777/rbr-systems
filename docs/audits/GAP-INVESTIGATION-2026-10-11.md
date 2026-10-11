# Gap investigation — 2026-10-11 (TASK 032 / 032.5, Part 3)

Method:
- read-only checks of the code, migrations, transcripts, task files, the backup infra repo (GitHub, read-only), and Staging/Production (SELECT only);
- nothing hosted was changed;
- evidence is cited for every finding.

Confidence labels:
- **EVIDENCED**: a primary source was found.
- **INFERRED**: reasoned from evidence.
- **NOT FOUND**: searched and absent.

---

## A. Audio access codes (library / per-recording)

| Question | Finding | Confidence |
|---|---|---|
| Where is the requirement written? | It first appears in the TASK 032.5 brief, a user message on **2026-10-10**, as items 6–8 of the 20 mandatory requirements, worded "**Preserve** optional library access code…". The owner approved the direction on 2026-10-11 (this task). The only place it is written down in the repo is `docs/media/r2-audit/*` (commit `b20afc1`). | EVIDENCED |
| Was it approved earlier? | No earlier approval was found. Sources searched: task specs 002–011 (`Desktop/RBR Project Tasks/`), reports 006–020 (`Desktop/RBR Project Captures/`), the repo `tasks/` and `docs/`, every `RBR-*` worktree, all memory files, the full transcripts from 2026-09-14 onward, Codex sessions, and `git log --all --grep`. | NOT FOUND |
| Which task owned it? | No earlier owner. The first task that names it is TASK 032.5, which planned it as WS6 pending owner decision D4. | EVIDENCED (absence across the sources listed) |
| Omitted, postponed, or confused? | **Neither omitted nor postponed.** It was never in an earlier written spec. The closest earlier requirement is TASK 022 (Shared Media Authorization, 2026-09-30): "If a Space requires a guest access code: media requests must require the equivalent valid guest access state." That rule is the **Space-wide** Guest code protecting media. It is implemented: `/api/media` → `resolveGuestAccessDetailed`, with route tests "9. private/code-gated…". The brief's word "Preserve" suggests the Space-wide code that protects audio was remembered as library or recording codes. Approval outside the searched sources (another chat tool, voice, paper) cannot be ruled out. | INFERRED |
| Did any report claim it was implemented? | **No.** Every earlier "access code" report refers to the Space Guest code (008C, 009, 022, and the 027.5 audit). Every 032.5 output says the codes do not exist. | EVIDENCED |

**Resolution:** the codes are now an **approved new feature** (2026-10-11). The implementation-ready design is in `04-SECURITY-STREAMING-METERING.md` §D.1 and §D.1b. The recommendation is to ship it before R2, as workstream W3a.

---

## B. Media backups (TASK 027 Backblaze B2)

The source of truth is **outside the app repo**: the private GitHub repo `ronbirman777/innerdwes_backup_infra`, workflow `.github/workflows/daily-storage-backup.yml` (main `7f9649b0`).

| Claim | Evidence | Status |
|---|---|---|
| Supabase daily DB backups | `supabase backups list` (read-only) shows 7 physical backups, all COMPLETED, daily at about 22:06Z from 2026-10-04 to 2026-10-10. Latest at 2026-10-10T22:06:43Z | **VERIFIED** |
| PITR | `pitr_enabled: false` | **VERIFIED off**. DB recovery point up to ~24 h |
| Storage → B2 sync | rclone sync of every bucket the Supabase S3 key can see, into `b2:<bucket>/supabase-storage/<bucket>`. **39 runs, all successful**, from 2026-09-30 to 2026-10-11 | **VERIFIED** |
| Source is Production | The endpoint variable matches the Production ref only (masked check; no value printed) | **VERIFIED**. Staging is not covered |
| Cadence about 4 h | cron `0 */4 * * *`. Actual GitHub runs: 3–5 per day, with gaps up to about 10 h | **PARTIAL**. Media recovery point is about 4–10 h |
| Last success | Run `38119667145`, 2026-10-11T06:55:58Z: `tenant-media`, 332 objects, 14.8 MiB, 332/332 | **VERIFIED** |
| Audio included | The whole `tenant-media` bucket is synced. The 2 mp3s (`teachAudioFile`) were first copied by run `37210251714` on 2026-10-04. A read-only Production query on 2026-10-11 shows **332 objects, 2 of them audio/mpeg**, an exact match with B2's 332 objects and 2 mp3s | **VERIFIED** |
| Prior versions kept 14 days | B2 lifecycle `days_from_hiding_to_deleting: 14`, read in TASK 027 preflight runs on 2026-10-02 | VERIFIED on 2026-10-02; not re-read since |
| B2 bucket private / encrypted | Not reported by any run | **UNVERIFIED**. The owner must check in the B2 console |
| Immutability | `file_lock_enabled: false`. The CI key holds `deleteFiles` and lifecycle/encryption write rights | **NOT IMMUTABLE** |
| Restore ever tested | No restore run, runbook or log anywhere | **UNVERIFIED (none)** |
| Off-platform DB copy | None. The workflow copies Storage only | **GAP** |
| Failure alerting | None in the workflow | **UNVERIFIED** |

**Recovery limitations:**
- rclone `sync` carries deletions to B2 with no `--max-delete` guard, so a mass deletion in Supabase reaches B2 within 4–10 h and becomes permanent after 14 days.
- The only check is `rclone size`; there is no checksum.
- Credentials are broad.
- There is no restore runbook and no drill.

**Sufficiency:**
- **Today's media:** adequate as an interim measure. 332 small objects, no paying customers.
- **Paid audio and the R2 design:** **not yet sufficient**. It needs:
  1. copy with delayed deletion, or B2 Object Lock (governance mode, 30 days);
  2. a CI key without delete or lifecycle rights;
  3. `--max-delete` or a fail-closed check on the source object count;
  4. a sha256 manifest with `rclone check`;
  5. failed-run and missed-run alerts;
  6. a restore runbook and a timed drill;
  7. an encrypted off-platform `pg_dump`, so the database rows that point to audio can be restored with the files.

All of these are owner-approved changes to the infra repo (W5). This task changed none of them.

**Correction to TASK 032.5 v1:** `01-CURRENT-AUDIO-ARCHITECTURE.md` §23 and the decision-gate answer said there was "no media DR / no standing backup". **That was wrong.** A standing Production Storage → B2 sync has run since 2026-09-30. The error came from searching only the app repo. See §F.

---

## C. Audio quota enforcement

Scope rule:
- Enforcement applies to **billing-governed paid Spaces** only, via `billing_audio_policy`.
- **Legacy** Spaces (no billing row; all 23 Production Spaces today) and **exempt** Spaces are deliberately unenforced.
- When billing data can't be read, enforcement fails closed.

| Rule | Shown | Browser check | Server enforced | DB enforced | Direct-API protected | Tests |
|---|---|---|---|---|---|---|
| Library 240 min (+240 per add-on) | Billing page only. **Not in Studio** | **None** | Paid: attach and publish (`audioQuota.ts:122-177`; Flow `retreat/actions.ts:2173-2195`; Teach `teach/actions.ts:761-780`) | Paid: trigger `billing_guard_module_item_audio` (0046) and publish assert (0043/0046) | Paid: member file-field writes refused (`AUDIO_SERVER_ONLY`); provenance required; `publish_space` RPC covered | vitest `audioQuota*.test.ts`; harness M11–M14 |
| Max 60 min per recording | Billing page only | **None.** Duration is detected in the browser but never compared to 60 | Paid: measured from stored bytes (`audioFinalize.server.ts`) | Paid: trigger and assert | Paid: same | vitest; harness M5–M7, P2–P5 |
| Listening 100,000 / month (+70,000) | Billing page (display string) | n/a | **None** | **None** | n/a | none |
| Stackable add-ons | Billing page uses quantity | n/a | Paid: limit read from `space_audio_entitlements` | 0038 (linear in quantity; the per-recording max never increases) | `space_subscription_addons` has no grants; **no purchase path** (correct: not for sale) | vitest; harness M12/M13 |
| Legacy cap | — | 100 MB per file | 100 MB at prepare and attach | **None** (harness M17 proves a member can write a 5 h file) | **None**. 0047 (new) adds a Storage-level 100 MiB / MIME cap | M17, M19 |

**Verdict:**
- Library and per-recording limits: **VERIFIED locally and on Staging for paid Spaces** (harness 242/242 on Staging, 2026-10-10).
- Studio display and browser pre-check: **MISSING**. This is UX only; the server is authoritative.
- Listening minutes: **MISSING**, display only. That is a known launch blocker (ENTITLEMENTS.md).
- Legacy Spaces: **unenforced by design**. Owner awareness item.

---

## D. Billing: three different states

| State | What exists | Evidence |
|---|---|---|
| **Simulated integration** | Fake `StripeGateway`; 10 journeys over the real Staging DB; 242 DB checks; Admin QA 67/67 | 2026-10-10 runs |
| **Genuine Stripe Test Mode** | **Not run.** A sandbox exists (SG account, `prod_VPlfieVxXI41Pw` / `price_1UOw85HruEyzzzcj7xgzM5Fy`) but is **not connected**: 0 billing env vars in every Vercel environment, and `billing_plans.stripe_test_*` is empty | `EXTERNAL-SETUP-CHECKLIST.md` §0 |
| **Live commercial readiness** | **Not ready.** Pending: Managed Payments review, legal issuer and tax, listening metering, native-language review, Live checklist | `MANAGED-PAYMENTS-COMPATIBILITY-v2.md` |

No fake-gateway result is presented as proof that real Stripe works.

---

## E. Media security

| Area | Paid Spaces | Legacy / exempt | Evidence |
|---|---|---|---|
| Image content (magic bytes + re-encode) | VERIFIED-LOCAL + Staging | PARTIAL by design: a member can put any bytes at an image path straight through Storage (O12/O13) | `imageSignature.ts`; harness O |
| Audio content (decoder-grade parse) | VERIFIED-LOCAL | PARTIAL: declared type and size only | `audioDuration.ts` |
| Bucket size / MIME limits | **Was MISSING.** Now **0047 prepared and tested locally**, not applied to Staging | same | §G |
| Duration provenance | VERIFIED (0046; P1–P7) | none | |
| File integrity (sha256, publish re-hash) | VERIFIED (P8) | none | `publish.ts:266-340` |
| Tenant isolation | VERIFIED | VERIFIED | 0030 policies; route tests 4 and 9b |
| Draft / published isolation | VERIFIED | Residual: a legacy member can pre-create `published.*` before the first publish | 0029/0045; route tests |
| `/api/media` authorization and entitlement at playback | VERIFIED. Suspended or archived gives 404. Already-issued signed URLs live 60–180 s | same | route tests |
| Deletion: Teach item, Space delete, Replace, Flow detach/replace | VERIFIED | VERIFIED | lifecycle and audio tests |
| Deletion: **Flow item delete / Save dropping a track** | **Was a leak (draft audio left behind). Fixed locally on 2026-10-11** (`rowDraftRefs`); 4 new tests, which fail without the fix | same | §G |
| Orphan drafts never attached | No sweeper. Read-only count on 2026-10-11: **0 orphans on Staging (43 drafts) and Production (188 drafts)** | same | `supabase/verification/orphan-media-report.sql` |

---

## F. Why earlier reports overstated (or understated) implementation

Several causes appear repeatedly. The evidence is in the sections above.

1. **Specs existed only as chat prompts.** TASK 012–032.5 have no spec file; only 002–011 do. Requirement lists were later rebuilt from memory, by the owner or by agents. For example, 032.5's 20 requirements were reconstructed because the list was not in the repo. "Preserve X" in a brief was taken as a premise and not checked.
2. **Unscoped claims.** "Audio limits enforced" was true for **paid** Spaces only. Reports did not always say that legacy and exempt Spaces are unenforced. "Listening 100,000/month" appears on the Billing page and in entitlements, but nothing meters it.
3. **Lifecycle states conflated.** Implemented, tested locally, verified on Staging, deployed and verified in Production were sometimes reported with a single word ("done", "enforced").
4. **Wrong source of truth for operations (my own error, the opposite direction).** TASK 032.5 v1 reported "no media DR" because only the app repo was searched. The backup system lives in a separate infra repo and has run since 2026-09-30. Absence in one repo was treated as absence in the system.
5. **Simulations at risk of standing in for integrations.** Fake-gateway Stripe tests are thorough, but they are not Test Mode. Previous docs did keep them separate. The matrix now enforces it.
6. **Sub-agent output accepted without a second source.** Mitigation: every matrix row cites a primary artefact (`file:line`, migration, test name, run id, or a dated query).
7. **Cost estimates repeated as facts.** The v1 "$75/month at 2,000 Spaces" left out the metering infrastructure and was quoted in the decision gate. It is withdrawn in 03 v2.

**Process changes adopted (effective now):**
- `docs/audits/INNERDWES-REQUIREMENTS-MATRIX.md` is the verification register. No row is `VERIFIED` without cited evidence, and the six lifecycle states are recorded separately.
- At the start of each task, the brief is saved verbatim to `tasks/<id>/SPEC.md`. This needs owner agreement because it stores owner text in the repo. Approvals are recorded with their date.
- Every "enforced" claim states its scope (paid / legacy / exempt; UI / server / DB / direct-API).
- Operational claims (backups, cron, DNS, env) need a dated read of the live system, never just a repo search.
- Cost figures always carry scenario labels and are never quoted without them.

---

## G. Fixes made on 2026-10-11 (local branch only, not deployed, not applied to any hosted DB)

| Fix | Files | Verification |
|---|---|---|
| W0-3 Flow draft-audio deletion leak | `app/src/lib/media/draftRefs.ts` (new), `app/src/app/(site)/configurator/retreat/actions.ts` (2 selects + 2 cleanup calls) | `retreat/flowAudioDeletion.test.ts` (4 tests). 2 fail when the fix is reverted, so it is a real regression test |
| W0-1 Bucket limits | `app/supabase/migrations/0047_media_bucket_limits.sql`, `app/supabase/verification/0047_media_bucket_limits_rollback.sql` | Local Docker DB: apply → rollback → re-apply. Local Storage API, even with the service role: `text/html` 415, `application/octet-stream` 415, 100 MiB + 100 B 413, webp/mp3 200. The test objects were removed. **Not applied to Staging** (needs approval) |
| W0-2 Orphan report | `app/supabase/verification/orphan-media-report.sql` (read-only) | Run read-only on Staging and Production: 0 orphans |
| Test update | `publishSpaceRegression.test.ts`: migration head 0046 → 0047 | passes |

The **orphan-prevention sweep** (automatic deletion of unattached drafts) was **not** implemented. It is an automatic destructive deletion and needs the approved retention workflow (owner decision D7).
