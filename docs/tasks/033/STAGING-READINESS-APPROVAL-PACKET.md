# TASK 033 — Staging readiness approval packet (2026-10-14, v2)

Owner approval "INNERDWES — TASK 033 STAGING QA CONTINUATION" (2026-10-14): G3 = Option B, G4 approved, G5 prepare,
G6 prepare; **stop at G1 and G2**. Production, `main`, Stripe (off) and the tr/it gate are unchanged. Completed deployment
and QA evidence is preserved in `STAGING-QA-REPORT.md` (rounds 1–3) and the session scratchpad `qa033/stg3/`.

| Gate | Status |
|---|---|
| G1 404 SQL | **DONE 2026-10-14** — PASS, restored byte-identical (`STAGING-QA-REPORT.md` round 4) |
| G2 site address | **G2a + G2b DONE 2026-10-14** — Staging now `innerdwes-1fn3aanxu` (`182f47e`); Supabase Site URL unchanged (round 4) |
| G3 QA login | Option B (owner-controlled). Nothing done by Claude; no reset |
| G4 bypass | **Done and closed:** 1 temporary secret → baseline run → revoked; **0 active** remain |
| G5 synthetic data | Snapshot **taken**; exact changes listed; changes not made (owner performs them, Option B) |
| G6 iPhone | Checklist ready: `IPHONE-CHECKLIST.md` (21 steps) |

## 0. Current state (read-only, 2026-10-14 ~06:00 UTC)

| Item | Value |
|---|---|
| Staging deployment | `dpl_EME1Fuq7cxYeDbEdC4AfnETsuy61` — `https://innerdwes-4iqe9trhs-inner-dwe-s.vercel.app` (`182f47e`), alias `innerdwes-env-staging-inner-dwe-s.vercel.app`; rollback `innerdwes-85fff4s07` (`e3ed1eb`) |
| Production | `innerdwes-cdlnhanhr` (`44426be`), unchanged; Supabase Production `qzmsclkzbxrfohuxnitc` not touched |
| Staging billing | `paid_checkout_enabled = false`; `space_subscriptions` 0 rows; no Stripe env names |
| tr/it | not in `SPACE_SELECTABLE_LOCALES` (en, de, es, fr, he) |

Synthetic Spaces: `qa-flow-1h8ve` (`3e6e4978-…`, Flow, Europe/Lisbon, en, public, one schedule date 2026-10-03, no retreat
dates) and `qa-teach-staging` (`cc51ee9a-…`, Teach, Asia/Jerusalem, en, public). Both owned by the QA owner
(`qa.example`) plus one synthetic co-owner (`example.com`); no real customer account. 404 target `qa-staging-retreat`
(`4eb19601-…`) is owned by an `example.com` synthetic user only.

---

## G1 — Commercially-unavailable 404 test — EXACT SQL FOR APPROVAL

| Item | Value |
|---|---|
| Project | **`kkqjsspxupyxytddiumf` (InnerDweS Staging) only**; runner: Supabase connector `execute_sql` with that project id. Production id never passed |
| Target tenant | **`4eb19601-1f88-4753-a13d-989de04ac935`** (`qa-staging-retreat`, synthetic, not a QA-owner Space) |
| Target row (re-verified 2026-10-14) | `public.space_entitlements`: `access_type complimentary`, `starts_at = created_at = updated_at = 2026-10-03T07:05:32.450636+00:00`, `access_ends_at = 2027-10-03T07:05:32.450636+00:00`, Stripe ids null |
| Other facts | 0 `space_subscriptions` rows; no trigger on `space_entitlements` in 0001–0047; tenant `c585f413-…` has the **same** `access_ends_at`, so every statement also filters by `tenant_id` |
| Rule | unavailable once `now > access_ends_at + 168 h` (`app/src/lib/entitlements/availability.ts`); `−8 days` is past the grace |

**Guards:** each write is a `DO` block that raises (and so changes nothing) unless **exactly one** row matches tenant id +
access type + expected current value. Step 1 must match before step 2 runs.

**Step 1 — read-only pre-check**
```sql
select tenant_id, access_type, access_ends_at, updated_at
from public.space_entitlements
where tenant_id = '4eb19601-1f88-4753-a13d-989de04ac935';
-- expect exactly 1 row: complimentary | 2027-10-03 07:05:32.450636+00 | 2026-10-03 07:05:32.450636+00
```

**Step 2 — make unavailable**
```sql
do $$
declare n int;
begin
  update public.space_entitlements
     set access_ends_at = now() - interval '8 days'
   where tenant_id = '4eb19601-1f88-4753-a13d-989de04ac935'
     and access_type = 'complimentary'
     and access_ends_at = '2027-10-03T07:05:32.450636+00:00';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'expected exactly 1 row, got %', n; end if;
end $$;
```

**Step 3 — test** (needs a fresh temporary bypass, same G4 method, revoked after): `/s/qa-staging-retreat` and
`/g/4eb19601-1f88-4753-a13d-989de04ac935` → 404 + `noindex`, no Space name/content, no `/api/media` request, Chromium +
WebKit; `/s/qa-flow-1h8ve`, `/s/qa-teach-staging` still 200. Baseline before (G4 run): all six `/s`+`/g` paths 200.

**Step 4 — restoration (immediately after step 3, also if step 3 fails part-way)**
```sql
do $$
declare n int;
begin
  update public.space_entitlements
     set access_ends_at = '2027-10-03T07:05:32.450636+00:00',
         updated_at     = '2026-10-03T07:05:32.450636+00:00'
   where tenant_id = '4eb19601-1f88-4753-a13d-989de04ac935'
     and access_type = 'complimentary'
     and access_ends_at < now() - interval '7 days';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'expected exactly 1 row, got %', n; end if;
end $$;
```

**Step 5 — verify restoration:** step 1 again → byte-identical to the pre-check (incl. `updated_at`); both paths 200
again. Window step 2 → step 4: < 15 minutes.

**Approval line:** "Approve G1: run steps 1–5 on Staging `kkqjsspxupyxytddiumf` exactly as written, with a temporary
bypass for step 3 revoked afterwards."

---

## G2 — D5 Staging site address — impact and rollback (read-only checks done)

### G2.1 Supabase Auth URL configuration (Staging, read in the dashboard, nothing saved)

| Setting | Current value |
|---|---|
| Site URL | `https://innerdwes-git-feat-time-to-teach-integration-inner-dwe-s.vercel.app` → Preview `innerdwes-bviwf3kkc` (`dpl_BMKptWcQTBMBNw3w4mCVL5pwsGHm`, 2026-10-03) |
| Redirect URLs (1) | `https://innerdwes-git-feat-time-to-teach-integration-inner-dwe-s.vercel.app/**` |

**Finding:** the current `NEXT_PUBLIC_APP_URL` (`…git-fix-0275-teach-qa-corrections…`) is **not** on the allow-list, so
today Staging sign-up/recovery email links already fall back to the Site URL — a **third** old build. Changing the Vercel
value alone does **not** fix email links; the allow-list needs the new host too (G2b). Password login does not use either.

### G2.2 Every consumer of the shared Vercel records

Records: `NEXT_PUBLIC_SITE_URL` `AbjueOWmjqDQY5eE`, `NEXT_PUBLIC_APP_URL` `wPHMblsr1yFkI5xb`; both value
`https://innerdwes-git-fix-0275-teach-qa-corrections-inner-dwe-s.vercel.app`; targets: Preview branch
`fix/027.5-teach-qa-corrections` **and** custom environment `staging` (`env_fTINl69sF95hUnVgvL8Evl95HlAv`).

| Consumer | Effect of the change |
|---|---|
| Future `staging` builds — CLI `vercel deploy --target=staging`, **and** Git pushes to `feat/task-028-guest-performance` (the staging branch matcher; branch exists on origin `5d402c1`) | get the new value. Existing builds keep the old one (inlined at build time) |
| Future Preview builds of `fix/027.5-teach-qa-corrections` (branch exists on origin `d6a4901`; project is Git-linked, so a push would build) | get the Staging alias. 1 existing deployment (`innerdwes-c9csggnnm`) unchanged. No push planned |
| Code (`182f47e`): `metadataBase` (`document-shell.tsx`), `robots.ts`, `sitemap.ts`, `GUEST_PUBLIC_ORIGIN` → share URL/QR/Copy Link (`guestSpaceUrl.ts`), `og:url`/`og:image`/canonical (`share/socialMetadata.ts`), Teach→Flow link builder + host check (`teach/retreats.ts`), demo links (`billing/demos.ts`) | SITE_URL: all point at the Staging alias. Teach host check also accepts any `*.vercel.app`, so existing links keep working |
| Code: auth email redirects (`(auth)/actions.ts`, `recoveryActions.ts`), billing `appUrl` (`billing/deps.server.ts`) | APP_URL: email links target the alias **only if G2b adds it**; billing inert (Stripe off) |
| Not consumers | Production records (`0vVC93RGNLxYEgfD`, `0V1i61hw5io8efss`); `NEXT_PUBLIC_GUEST_URL` (Production only, `wA2z9Emka83uyW4E`); other branch-scoped Preview records; R2 POC Worker (`ALLOWED_ORIGIN "*"`); R2 product Worker (not deployed; Staging origin is a placeholder → should become the same alias at R2 G1); no hard-coded host in any repo outside docs |
| Stored data | QA Space data contains one pasted host `innerdwes-hajqi9jcv-…` (content, unaffected) |

**Baseline (G4 run, both engines, 390 px):** all six `/s` + `/g` paths 200, `og:image`, `og:url` and canonical host =
`innerdwes-git-fix-0275-teach-qa-corrections-…`, 0 console errors.

### G2a — Vercel change (proposed, not executed)

1. `vercel api "/v9/projects/$P/env/AbjueOWmjqDQY5eE?teamId=$O" -X PATCH --input <0600 file>` with
   `{"value":"https://innerdwes-env-staging-inner-dwe-s.vercel.app"}`; same for `wPHMblsr1yFkI5xb`.
2. Verify via metadata GET: targets, branch and `customEnvironmentIds` unchanged, only `updatedAt` moved; in-process
   equality check; Production records' `updatedAt` unchanged.
3. Redeploy the **same commit** `182f47e` from the clean detached worktree: `vercel deploy --target=staging --yes`.
4. Check (temporary bypass, revoked after): `og:image`/`og:url`/canonical host = `innerdwes-env-staging-inner-dwe-s.vercel.app`; guest pages 200; Production unchanged.

**Rollback:** PATCH both records back to `https://innerdwes-git-fix-0275-teach-qa-corrections-inner-dwe-s.vercel.app`
and redeploy `182f47e` from `innerdwes-4iqe9trhs`'s commit (or deploy the old build's commit again). No data or schema.

### G2b — Supabase Auth allow-list (proposed, not executed; Staging project only)

Add Redirect URL `https://innerdwes-env-staging-inner-dwe-s.vercel.app/**` (dashboard → Authentication → URL
Configuration → Add URL). **Keep** the existing entry. Optional: set Site URL to the same alias (only then do fallback
links stop pointing at an old build). **Rollback:** remove the added entry; restore Site URL to
`https://innerdwes-git-feat-time-to-teach-integration-inner-dwe-s.vercel.app`.

**Approval lines:** "Approve G2a" (Vercel records + redeploy) and, separately, "Approve G2b" (allow-list add; say whether
the Site URL changes too).

---

## G3 — QA login (Option B, owner-controlled)

Account `innerdwes.staging.qa+028@qa.example` (`b7a0e045-…`, Staging only). The password set on 2026-10-13 sits only in
this session's scratchpad `stg033b/qa-owner.pw` (0600); Claude does not print, send, log or use it, and does not reset
the account. **The scratchpad ends with this session** — copy it to your password manager first:

1. In this session: `! pbcopy < "/private/tmp/claude-501/-Users-ronbirman-Desktop-RBR-Project/220dc7e0-cf6b-4803-8d93-512f891783fe/scratchpad/stg033b/qa-owner.pw"` (prints nothing).
2. Paste into your password manager entry for `innerdwes-env-staging-inner-dwe-s.vercel.app`; then `! pbcopy < /dev/null`.
3. iPhone Safari → `https://innerdwes-env-staging-inner-dwe-s.vercel.app/log-in` → your **Vercel** login first (team SSO),
   then the QA email + password from the password manager.

If sign-in fails: stop; a reset is a separate approval.

---

## G4 — Temporary bypass (approved; executed and closed)

| Step | Evidence |
|---|---|
| Before | 0 bypass secrets on the project |
| Generate | Vercel API `PATCH /v1/projects/<id>/protection-bypass` (`generate`), scope `automation-bypass`; value written to a 0600 scratch file, never printed |
| Use | read-only baseline: 6 paths × Chromium + WebKit, GETs/navigation only, header once per host per engine, host allow-list (only `vercel.live` blocked); `qa033/stg4/baseline.json` + screenshots |
| Revoke | `revoke` with `regenerate:false` → **0 active bypass secrets**; revoked header → **302** (SSO); local copy `rm -P`; value found in 0 evidence files |

G1 step 3 and G2a step 4 each need a fresh secret by the same method (state it in the G1/G2 approval).

---

## G5 — Synthetic QA data: snapshot + exact changes (owner performs in the Studio, Option B)

**Snapshot taken** 2026-10-14 (read-only REST, Staging secret key, scoped to the two QA tenant ids, asserts the QA owner
owns both): `g5/before-g5.json` (0600, sha256 prefix `ff0c3ddcc1e3228c`). Tables: tenants, tenant_members,
module_settings 5+8, module_configs 13+5, module_items 42+21, schedule_items 5+0, brand_configs, space_guest_access
(code hashes stored as digests only), access_code_redemptions 0, published_spaces, space_entitlements,
guest_access_ip_attempts 2+1. Diff tool `g5/diff.py` (self-test 0 differences).

| # | Allowed area | Exact change (Studio UI, then Publish) | Restore (Studio UI, then Publish) |
|---|---|---|---|
| S1 | Multi-day Flow dates | `qa-flow-1h8ve` → "Retreat dates": Start date start = test day − 1, End date = test day + 3 (Space timezone Europe/Lisbon) | clear both dates (snapshot: no `startDate`/`endDate`) |
| S2 | Sample activities + empty days | Schedule: add 3 activities "QA sample 1/2/3" on day 2 (09:00, 11:00, 15:00) and 1 on day 3 (10:00); add one **twin** = exact copy of "QA sample 1" on day 2; leave day 4 and day 5 **empty** | delete the 5 added activities (snapshot: 5 items, all 2026-10-03) |
| S3 | Access code | `qa-flow-1h8ve` → "Guest Access" → turn the access code on; the Studio shows a generated **6-digit code once** — keep it on your device only, never send it in chat | "Guest Access" → turn the code off (snapshot: mode `public`) |
| S4 | German Teach | `qa-teach-staging` → "Language" → German (`de`) | "Language" → English (snapshot: `locale en`) |

**Restore check (Claude, read-only):** a new snapshot + `diff.py` against `before-g5.json` → expected 0 non-cosmetic
differences. Expected cosmetic / residual: `published_at`, `content_updated_at`, `updated_at`, `space_guest_access.version`;
**new `guest_access_ip_attempts` rows** from the wrong-code test (rate-limit counters, IP HMACs, no personal data) —
cannot be removed from the UI; left in place unless you approve a separate cleanup.

No other Space is touched (the snapshot scope and the diff cover only the two QA tenant ids).

---

## G6 — Real-iPhone checklist

`IPHONE-CHECKLIST.md` — 21 steps: Flow multi-day (I-1–I-7), Teach (I-8–I-11), Share Cards (I-12–I-15), access codes
(I-16–I-21). Best after G2a (QR/links point at the current Staging host); runs with or without it (limits stated there).

## Still gated

tr/it native review → `SPACE_SELECTABLE_LOCALES`; Stripe (final launch phase); Production (TASK 032 gates first); no
`main` merge or push.

## Recommended order

G1 (approve SQL) and G2a/G2b (approve) → one Claude session: fresh bypass → G2a + check → G1 steps 1–5 → revoke → you:
G3 + G5 setup + G6 on the iPhone + G5 restore → Claude: restore diff → round-4 report.
