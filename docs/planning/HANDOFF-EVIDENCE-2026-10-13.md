# Master workboard handoff — evidence report (Claude, 2026-10-13 ~10:40–11:00 UTC)

Executes `INNERDWES-REMAINING-WORK-MASTER.md` §12; format §13. Facts are dated; "?" = no evidence. No cloud account,
secret, workflow, DNS, payment flag or Production data was changed. Secrets, object names and customer data omitted.

## 0. Reconciliation (read-only)

| Repo / checkout | Branch | HEAD | Upstream | State |
|---|---|---|---|---|
| App `~/Desktop/RBR Project` | `feat/032-commercial-platform-foundation` | `dffd4fe` → this report's commit | none | untracked `tasks/*` (pre-existing), `docs/planning/` master (ChatGPT-owned, left untracked/unedited), `docs/dr/TASK-032.6-ROLLOUT-LOG.md` (Claude, held until R4) |
| Infra `~/Desktop/innerdwes_backup_infra` | `task-032.6-wsf-watchdog` | `bc078dd` (= `774cc00` + deployment packet) | none (removed: cannot push to main by default) | clean |
| Infra worktree `~/Desktop/innerdwes_backup_infra-dr` (new) | `task-032.6-dr-packets` | `0ac90f5` (from `main` `1fca3e6`) | none | clean |
| Infra `origin/main` | — | `1fca3e6` (B/C merge, 2026-10-13 09:49:09Z) | — | not re-merged |

App worktrees: **37** (`git worktree list`), 6 with local changes (main repo, RBR-005B, RBR-015, RBR-029, two Codex
work dirs) — inspected read-only, nothing touched. Local infra remote-tracking refs still list the three deleted
`task-027-*` branches (stale refs; remote deleted 09:57Z). App local `origin/main` ref `44426be` (not fetched).

## 1. Status table (§13 format)

| ID | APR/scope/source | CODE/commit | LOC/evidence | STG/evidence | PRD-D/version | PRD-V/date/run | next/blocker | owner |
|---|---|---|---|---|---|---|---|---|
| A1 B/C hardening | owner gates R2.1/R2.2 (2026-10-13) | infra `1fca3e6` | 317 tests CI | n/a | merged 09:49:09Z | run 38379519351 PASS 09:53Z (334/334, 0/0/0, 12/12, 12/12) | none | Claude |
| A2 R4 | autonomous B/C auth. | `r4_retro.py` (private evidence) | resumable validator PASS on run 38379519351 | n/a | n/a | **0/3 scheduled** at 10:42Z; no slot since 02:28Z | wait for GitHub; key expiry 2026-10-20 08:46Z | Claude (read-only) |
| A3 R3 | owner: PARTIALLY VERIFIED | `fixture_hide_test.py` `0ac90f5` (not run) | historical 2/2 versions, version-at restore SHA-1 equal | n/a | n/a | n/a | **approval: fixture bucket + K1-shaped fixture key** (packet) | owner |
| A4 WS-F | implement/test isolated (owner 2026-10-13) | `774cc00` + packet `bc078dd` | 43/43, tsc, bundle 23 KB `385824f8…`, live-format conformance | n/a | not deployed | n/a | **approval: 6 resources + deploy + drills** (`docs/watchdog-deployment-packet.md`) | owner |
| A5 D | not authorized beyond planning | packet `0ac90f5` | — | — | — | — | D2 via fixture; D1/D3/D5 owner | owner |
| A5 E | not authorized | packet `0ac90f5` | — | — | — | — | decide lifecycle 31 d (rec.) vs 45 d; Object Lock irreversible | owner |
| A5 G | not authorized | packet (design only) | — | — | — | — | Staging role (hosted SQL), age key, depends on E | owner |
| A5 J | not authorized | packet | — | — | — | — | after D closes | owner |
| B1 Stripe/billing | TASK 032 (Staging scope) | billing code on app branch; 0036–0046 | fake gateway 10/10 vs Staging DB | MFA, exemptions VERIFIED; invoices UI 67/67 (no real invoices) | Production at 0035 | none | external setup S2–S11, R1–R6, C1–C2; MP decision | owner + Claude |
| B2 gaps | per matrix | 0047 local | local tests | not applied | — | — | Staging apply of 0047 (approval) | — |
| B3 R2 | direction approved; POC hosted | `infra/media-worker-poc` | — | POC `9ba64f4d` (2026-10-12) | none | none | product Worker + media index (0048) + token mint; **epoch `>=` defect** recorded | — |
| C TASK 033 | A1–A6 approved later; A6 blocks code | none | absence confirmed in code (no currencies lib, tr/it 19-line stubs, no loading.tsx, no Flow start/end) | — | — | — | owner start + A6 release + desktop shell / start-end / EUR persistence decisions | — |
| D1 Admin | planning only | spec | — | — | — | — | after WS-F PRD-V | — |
| D2 Legal | — | `legal.ts` `draft-2026-10` | acceptance in checkout only | — | — | — | operator/issuer/tax/MoR, final texts, vault-retention disclosure | owner |
| D3 Security | — | — | inventory (metadata) mostly unknown per provider | — | — | — | MFA/recovery inventory by owner; FileVault; old restore-key revoke; TASK_027 secrets | owner |

## 2. Work done in this handoff

1. R4 rebuilt read-only (10:42Z): 0/3, 0 unexplained B2 versions, lock released, state 334 = visible 334. Watcher still running.
2. WS-F re-verified (10:43Z) and **deployment packet** committed (`bc078dd`): fixed resource names, pinned `wrangler@4.143.0`
   (released 2026-09-28), secret entry by prompt only, recipient as secret, drills on a separate drill copy with its own KV
   and Healthchecks check (live watchdog never paused), evidence list, rollback, one-line final approval.
3. **Approval packets** for R3 active test and WS-D/E/G/J (`0ac90f5`) + isolated fixture test script (offline refusal paths
   tested). Key insight: one disposable fixture bucket with a K1-shaped key closes both R3 and D2 without touching Production.
4. Matrix: BKP-02, BKP-06, BKP-13 brought up to the release facts; R2 section header/POC evidence + epoch finding.
5. Read-only inventories (billing/Stripe, R2 gaps, TASK 033, legal/security) — findings below.

## 3. Contradictions found (with sources)

| # | Contradiction | Sources | Resolution proposed |
|---|---|---|---|
| 1 | "No Stripe account exists" vs sandbox exists (Singapore, product MP "Eligible") | `docs/billing/EXTERNAL-SETUP-CHECKLIST.md:3`, `EMAILS-INVOICES:53` vs `research/MANAGED-PAYMENTS-COMPATIBILITY-v2.md:13,17`, GAP `:100` | owner-reported sandbox is newer; update checklist; "Eligible" ≠ onboarding approval (MP-v2 `:50-55`) |
| 2 | Checklist S11 "Sync plan creates Product/Price" vs MP-v2 "adopt existing ids, never sync while null" | checklist `:47`, `:38` vs MP-v2 `:233`, `:274` | adopt path needs code or authorized Staging SQL; do not press Sync |
| 3 | Code always sends `automatic_tax`; MP requires omitting it | `app/src/lib/billing/stripe/real.ts:54`; MP-v2 `:240`, `:313` | open code gap, only if MP chosen |
| 4 | "Stripe emails OFF" vs MP forces receipts/invoices on | checklist S10, LAUNCH-GATES `:33` vs MP-v2 `:329-350` | depends on MP decision |
| 5 | Resend domain "pending DNS" vs verified | checklist R2 `:60` vs Resend read-only check 2026-10-13 (`innerdwes.com` verified, sending enabled) | verified for sending; billing key/sender still not configured |
| 6 | LAUNCH-GATES "0036–0041"; release plan "0043–0045 not applied anywhere" vs Staging 0036–0046 | LAUNCH-GATES `:3,:40`; release plan `:16`; matrix `:25` | docs stale; matrix newer |
| 7 | R2 docs "nothing created" vs POC deployed | `00-EXECUTION-PLAN.md:3`, `06-POC-PLAN.md:3`, `04:3`, matrix R2 header (fixed) | 07-POC-ACCOUNTING governs |
| 8 | Counting `TransformStream` still recommended | `04:199`, `02-VENDOR-RESEARCH.md:136` vs `07:10-15` | do not reintroduce (master §B3) |
| 9 | Metering v1 bytes→minutes / Durable Object | `DECISION-GATE.md:19` vs `07:63`, `DECISION-GATE:116-117` | superseded |
| 10 | Supabase originals: delete 30 d after cutover vs keep 14 d after reconciliation, never delete in this phase | `05:86-87`, `DECISION-GATE:84` vs master `:181-182` | needs one owner decision |
| 11 | POC on Workers Free + `innerdwes-media-poc` vs plan Workers Paid + `innerdwes-media-staging` | `06:13-14`, `DECISION-GATE:127` vs `07:3` | record as executed variant |
| 12 | Vault lifecycle 45 d vs 31 d | DR plan `:313` vs `:522` | recommend 31 d (packet) |
| 13 | TASK-033 plan "no migrations" vs addendum needs D-CC2/P2 migrations; DAY-n listed open though A1/A5 decided | `TASK-033-PLAN.md:9` vs `:554-563`; `:225-229` vs `:18,:22` | plan text stale |
| 14 | Two different "A1–A6" label sets | `TASK-033-PLAN.md:16-23` vs `docs/media/r2-audit/DECISION-GATE.md:123-131` | prefix them (T33-A6 vs R2-A6) |
| 15 | Admin spec calls Stripe merchant of record; MoR undecided | `ADMIN-OPERATIONS-DASHBOARD-SPEC.md:132-133` vs BIL-12 | spec wording to fix with D1 |
| 16 | Migration numbers 0048+ claimed by both R2 (0048/0049/0050) and TASK 033 | `00:289-301`; `TASK-033-PLAN.md:566` | central assignment needed |
| 17 | Matrix has no SEC-/LEG- rows; legal sits under OPS-01..06 | matrix `:180` | add rows when D2/D3 start |
| 18 | DR plan: D2 "prove hides on `__backup_test`" — not isolated (inside tenant-media) | DR plan §10 WS-D | replaced by fixture-bucket test |
| 19 | No TASK 033 readiness report file in repo; master cites it as attached to the conversation | master `:21` | ChatGPT to supply/commit if needed |

## 4. Defects / risks found

- **R2 POC epoch revocation** (`infra/media-worker-poc/src/index.ts:59`, `:260`, `:275`): `ep >= epoch`, both whole seconds →
  a token minted in the revocation second survives. POC only (synthetic); product Worker must use a strictly increasing
  epoch (counter or ms + `>`). Not changed (POC not in scope).
- POC `ALLOWED_ORIGIN = "*"`, no rate limiting, `/poc/mint` + `/poc/player` behind a flag — must not carry into product.
- `task-027-*` workflows remain on infra `main` and reference `TASK_027_*` secrets — check before secret removal.

## 5. Approvals needed (exact final actions; nothing re-requested that is already valid)

1. **WS-F deploy** — `innerdwes_backup_infra/docs/watchdog-deployment-packet.md` §9 (6 resources, deploy from `774cc00`, recipient, 2 drills; optional push of the branch for review, no merge).
2. **R3 active + D2** — create `innerdwes-backup-fixture` (no Object Lock, 1-day hidden lifecycle) + 7-day fixture key (exact K1 capabilities); run `fixture_hide_test.py` once.
3. **WS-E lifecycle decision** — 31 d (recommended) or 45 d; then E1 (irreversible Object Lock) separately.
4. **Billing** — MP decision (BIL-12); then Stripe sandbox setup S2–S11 (metadata in `EXTERNAL-SETUP-CHECKLIST.md`), Resend billing key/sender, `CRON_SECRET`; then the 20 journeys on Staging.
5. **TASK 033** — explicit start + A6 release + decisions: desktop shell contract, Flow start/end fields, EUR default persistence (D-CC3), timezone backlog scope.
6. **Owner-only checks** — FileVault, old restore key revoked, provider MFA/recovery inventory.

## 6. Proposed master-workboard updates (for ChatGPT)

- §2 TASK 032.6 B/C row: add "first guarded run 38379519351 PASS; R4 0/3 at 10:42Z".
- §2 WS-F row: "deployment packet ready `bc078dd`; pinned wrangler 4.143.0; drill copy isolated".
- §5 A3: replace "prepare isolated path" with the concrete fixture-bucket packet (`0ac90f5`); it also satisfies WS-D D2.
- §5 A5: E lifecycle recommendation 31 d; G workflow intentionally not drafted before E1/G2.
- §6 B3: add epoch `>=` defect and POC CORS/rate-limit items to the product gap list.
- §9: worktree count 37 (6 dirty) as of 2026-10-13; new infra worktree `innerdwes_backup_infra-dr` (owned paths: `docs/dr-approval-packets.md`, `scripts/fixture_hide_test.py`).
- §3/§10: contradictions 1–19 above; migration-number reservation 0048+ needs one owner.

**Completed for stated environment:** local/docs only (packets, tests, matrix). **Remaining gaps:** everything requiring
cloud resources, merges, hosted SQL or owner decisions (§5). **Change to precedence:** none. **Exact approvals:** §5.
