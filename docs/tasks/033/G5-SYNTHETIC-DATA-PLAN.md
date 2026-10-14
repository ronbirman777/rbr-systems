# TASK 033 — G5 synthetic QA data plan (2026-10-14) — AWAITING APPROVAL, nothing created

Read-only facts gathered 2026-10-14 ~06:50 UTC (Supabase REST GETs, Staging only; code at `182f47e`).

## 1. Account and Spaces

| Item | Value |
|---|---|
| Project | Supabase Staging `kkqjsspxupyxytddiumf`; Vercel `staging` (`innerdwes-1fn3aanxu`, alias `innerdwes-env-staging-inner-dwe-s.vercel.app`) |
| Account | synthetic QA owner `innerdwes.staging.qa+028@qa.example` (`b7a0e045-0006-471c-8a2c-e91bc0c3980b`); password held by the owner only (G3 Option B) |
| Space A | `qa-flow-1h8ve` — tenant `3e6e4978-79a3-4912-98b5-c26d15d30155`, Flow, Europe/Lisbon, en, public |
| Space B | `qa-teach-staging` — tenant `cc51ee9a-9b39-4676-bc39-e20467180488`, Teach, Asia/Jerusalem, en, public |
| Owners | each Space: QA owner (`qa.example`) + one synthetic co-owner (`example.com`). No real customer account |
| Not touched | every other tenant (incl. `qa-staging-retreat`, `c585f413-…`, `9f7fbfe7-…`), Production, billing tables |
| Drafts pending | none (both: `content_updated_at` < `published_at`) → each Publish ships only the G5 change |
| Snapshot | `g5/before-g5.json` (0600, sha256 `ff0c3ddcc1e3228c`); re-checked 06:50 UTC: 0 differences |

## 2. Exact data (test day **D** = the day you run the iPhone checks, Lisbon date; example D = 2026-10-15)

**S1 — retreat dates (Space A, "Retreat dates")**: Start date **D − 1**, End date **D + 3** → 5 days, today = DAY 2.
Example: 2026-10-14 → 2026-10-18.

**S2 — sample activities (Space A, Schedule) — 6 new rows, no existing row edited**

| # | Day | Date (example) | Start–End | Title | Location |
|---|---|---|---|---|---|
| 1 | DAY 1 | 2026-10-14 | 08:00–09:00 | QA sample 0 | QA Room |
| 2 | DAY 2 | 2026-10-15 | 09:00–10:00 | QA sample 1 | QA Room |
| 3 | DAY 2 | 2026-10-15 | 09:00–10:00 | QA sample 1 (**twin** of #2, D1 check) | QA Room |
| 4 | DAY 2 | 2026-10-15 | 11:00–12:00 | QA sample 2 | QA Room |
| 5 | DAY 2 | 2026-10-15 | 15:00–16:00 | QA sample 3 | QA Room |
| 6 | DAY 3 | 2026-10-16 | 10:00–11:00 | QA sample 4 | QA Room |

No description, facilitator or category. DAY 4 and DAY 5 stay **empty**. The 5 existing activities (all 2026-10-03,
outside the range) are not edited.

**S3 — access code (Space A, "Guest Access")**: turn the code on. The Studio generates a 6-digit code and shows it
**once** — keep it on your device only; never send it to me or put it in screenshots.

**S4 — German (Space B, "Language")**: English → German (`de`).

Publish after each of S1–S4 (S1 + S2 can share one Publish).

## 3. Existing data that will be modified (and how it returns)

| Table / field | Change | After restore |
|---|---|---|
| `module_settings` A `retreatProfile.data` | adds `startDate`, `endDate` | keys **deleted** on clear (`saveRetreatDates`: `delete base.startDate/endDate`) → identical |
| `schedule_items` A | +6 rows | 6 rows deleted → identical (5 rows) |
| `space_guest_access` A | `mode` public → code, `code_hash` set, `version` +1 | off → `mode public`, `code_hash NULL` (`disable_guest_access_code`), `version` +2 total (cosmetic) |
| `guest_access_ip_attempts` A | wrong-code tries add/update counter rows (IP HMAC, no personal data) | **remain** (no UI removal) — residual, declared |
| `module_settings` B `spaceSettings.locale` | en → de | de → en → identical |
| `published_spaces` A + B, `tenants.content_updated_at` | rewritten by each Publish | content identical; `published_at` / `content_updated_at` advance (cosmetic) |

Nothing else changes: no other Space, no billing/entitlement row, no image, no Teach class, no account.

## 4. Cleanup and rollback

1. **Before you start**: I take a fresh read-only snapshot and confirm 0 differences against `before-g5.json`.
2. **After setup** (optional, read-only): I diff again and confirm only the rows/fields above changed.
3. **Cleanup** (you, Studio): delete the 6 activities "QA sample 0–4" → clear both retreat dates → Publish; Guest Access
   off → Publish; Space B Language → English → Publish.
4. **Verify** (me, read-only): new snapshot + `g5/diff.py` → expected **0 non-cosmetic differences**; cosmetic only:
   `published_at`, `content_updated_at`, `updated_at`, `space_guest_access.version`/`failed_attempts`, plus new
   `guest_access_ip_attempts` rows. Any other difference → I report it with the exact field and stop.
5. **If something goes wrong mid-way**: undo the step in the Studio (same controls as cleanup) and Publish. A data-level
   restore from the snapshot would be SQL and needs its own approval — not part of G5.

## 5. Credentials and owner actions

| Who | Action | Credentials |
|---|---|---|
| You | log in (Vercel SSO on the iPhone, then the QA account from your password manager); perform S1–S4, the iPhone checklist and the cleanup | your Vercel login; QA password (yours only) |
| Me | read-only snapshots/diffs before, after setup and after cleanup | existing Staging read key via the Supabase CLI (as before) — no new credential |
| Optional | guest-page check by me after setup (e.g. `/s/qa-flow-1h8ve` code screen, schedule days) | one fresh temporary bypass, revoked after — only if you ask |

No credential is created or reset; Claude never logs in as the QA owner.

**Approval line:** "Approve G5: S1–S4 exactly as in `G5-SYNTHETIC-DATA-PLAN.md` on `qa-flow-1h8ve` and
`qa-teach-staging`, test day D = <date>, performed by the owner, with read-only snapshot checks by Claude."
