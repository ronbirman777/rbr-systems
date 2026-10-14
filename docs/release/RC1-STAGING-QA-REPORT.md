# InnerDweS Staging RC1: automated QA report (2026-10-14)

This report covers the owner-approved RC1 Staging QA run. Results come from the deployed build, observed with Playwright
1.63 (Chromium and WebKit) and with read-only REST checks. Assumptions are marked **[A]**. Emulated browsers are not
real devices, and WebKit is not iOS Safari.

**Not touched:** Production (`innerdwes.com`, Supabase `qzmsclkzbxrfohuxnitc`). Every browser and HTTP client ran on an
allow-list (the two Staging hosts plus `kkqjsspxupyxytddiumf.supabase.co`). The only host that was blocked was
`vercel.live` (the Vercel toolbar), and it was never reached. Beyond that: no `main` change, no deploy or redeploy by
this run, no migration, no billing state change, no Stripe, no DNS. The `qa-staging-retreat` Space and every other
tenant were not touched.

## 1. Deployment under test

| Item | Value |
|---|---|
| Commit | `8ed8ea5` (`integration/staging-rc1`). Vercel metadata `gitCommitSha` = `8ed8ea55dcbc…` |
| Deployment | `dpl_CZVtgEiBSaLifMTN28WYGAGPA58L`, `https://innerdwes-cp87hr2qy-inner-dwe-s.vercel.app`, READY, custom environment `staging` |
| Alias | `https://innerdwes-env-staging-inner-dwe-s.vercel.app` (serves the same build: `/s/qa-flow-1h8ve` returns 200 in both engines) |
| Supabase | Staging `kkqjsspxupyxytddiumf`. Paid checkout is off (`/admin/launch`: "DISABLED - paid checkout is off"; Stripe "not configured") |

## 2. Results per area

### Guest Flow and Teach (`qa-flow-1h8ve`, `qa-teach-staging`)

| Check | Result | Evidence |
|---|---|---|
| Shell: 2 Spaces × 7 widths (320/390/430/500/639/640/1440) × 2 engines, every bottom tab, Explore sub-screens at 320 and 390 | **PASS**: 172 non-axe checks, 0 failures | `out/guest-pre.json` |
| Column breakpoint | Full width up to **639 px**. From **640 px** there is a centred 430 px column. At 431–639 px the app is full width, not a column. That is the RC's documented decision (`GUEST_COLUMN_MIN_VIEWPORT = 640`). Teach keeps its phone layout up to 639 px (container query `@min-[40rem]`), so no desktop layout ever appears. **Owner decision** (O1) if "column from 431 px" is wanted | `shell …/500`, `…/639`, `…/640` |
| Horizontal overflow, raw translation keys, console/page errors | **PASS** on every page, tab and sub-screen | same |
| 404 inside the shell (`/s/<unknown>`, `/g/<unknown uuid>`) | **PASS**: 404 + `noindex`, column 430 px at 1440, no Space data leaked | `out/site.json` |
| Access-code screen (code set and removed on qa-flow through Studio) | **PASS**: 6-digit screen inside the shell (430 px at 1440), `noindex`, no content leak. A wrong code gives "That code didn't work". The right code opens the app in both engines at 390 and 1440. After "Disable code" the Space is public again. The per-IP limit (8 per 10 min) answered "Too many attempts" when the harness exceeded it, as designed | `out/studio-access.json` |
| Day navigator (dates 13–17 Oct, published during QA) | **PASS** (2 engines × 320/390/1440): 5 days, "Wed 14 … today" preselected. 13 Oct = QA sample 0. 14 Oct = the two identical "QA sample 1" twins. 15–17 Oct empty ("Nothing scheduled this day"). The 3 sessions dated 3 Oct (outside the dates) are hidden. End jumps to day 5, and arrows wrap from the selected day | `out/studio-publish.json` |
| Day navigator in Hebrew | **PASS**: RTL order (day 1 on the right), ArrowLeft = next day, Hebrew empty-day text | `out/rtl.json` |
| Prices | **PASS**: Flow treatment `700 THB` is shown as `THB 700.00` (he: `‏700.00 ‏฿`). Teach class price free text `₪65` is unchanged. "on request" is synthetic free text | `extras`, explore heads |
| Teach week strip and class card | **PASS**: 14-day strip with class counts. The card expands in place (repeat rule, description, price, length) | `shots/probe-teach-sheet.png` |
| Share Card route | **PASS**: `og:image` → `/s/<slug>/social/<v>` 200 `image/png` (1.4 MB / 1.25 MB). The og host is the Staging alias | `out/site.json` |
| Legal pages and gate | **PASS**: `/legal` + 7 documents (Terms, Privacy, DPA, Billing at v1.1; AUP, Copyright, Subprocessors at v1.0), `/legal/terms/v/1.0` (archived, `noindex`), `/terms` and `/privacy` redirect to `/legal/*`. axe on `/legal` and `/legal/terms`: 0 violations. `/legal/terms/v/1.1` is 404 **by design** (the current version is not served under `/v/`). Site `/` answered 200 with no preview-gate redirect | `out/site.json` |
| Hebrew, de, es, fr (Space language changed in Studio, then published) | **PASS**. Flow: he (4 widths × 2 engines, tabs + Explore), de/es/fr (320/390 × 2 engines). Teach: he, de. Every page had the right `lang`, `dir=rtl` only for he, localized navigation, no raw keys, no overflow. Studio UI in each language: no raw keys, he is `dir=rtl` | `out/studio-locale-*.json`, `out/guest-loc-*.json` |
| Loader (3 runs per Space: fast, 4G, slow 4G in Chromium, plus WebKit) | **PASS** 12/12: the loader never appears over painted content. Observation O4: on Teach, and on Flow in WebKit, a loader shows for about 50–100 ms, the page goes blank, then the loader shows again before the content | `out/loader-pre.json` |
| axe | No critical issues. **Serious `color-contrast`** on every Flow/Teach Guest page: mist `#9b8e84` on parchment (about 2.8:1) for small uppercase labels, times and inactive nav labels, plus 1 node on the access screen. **Moderate** `heading-order` on Teach Schedule. **Pre-existing**: the same rule and colours are in the TASK 033 baseline (`qa033/axe-compare.json`). See O2 | guest JSONs |

### Studio (synthetic automation account)

| Check | Result |
|---|---|
| Sign-in (`/log-in` → `/space`); log-in inputs 16 px on phones | **PASS** |
| Mobile drawer from the **bottom** of Brand and Schedule (Flow + Teach, 320/390/430, both engines) | **PASS**: the panel stays inside the viewport, focus moves into it, Escape closes it, the scroll position is kept |
| No zoom or overflow on every Studio step at 390 (both engines), and on the main steps at 320/430 | **PASS 140/142**. The 2 failures are **D1** (Stay connected `<select>` 13 px). A 320 px probe also found **D2** (Stay connected row 4 px too wide) |
| Every step/section at 1440 (Flow 17 steps + Publish/Share/Featured, Teach sections, My Spaces), both engines: loads, no errors, no raw keys, no overflow (existing data) | **PASS 72/72** |
| Schedule: Add → leave | **PASS**: "Leave without saving" dialog shown, **0 rows created**, no placeholder after reopening |
| Duplicate → Save | **PASS**: **exactly 1 new row**, prefilled from the source. The source and every other row are unchanged (ids and fields) |
| End time follows / override | **PASS**: 14:00 → 15:00, 15:30 → 16:30, a manual 17:00 is kept when the start changes. On an existing saved session the end never moves |
| Remove one keeps the others; save + reopen | **PASS**: only the removed row is deleted. Net DB state = baseline. Chromium 1440 and WebKit 390 |
| Out-of-range hint | **PASS**: "3 of your sessions fall outside the retreat dates…" |
| Arrival "Preparing for arrival" | **PASS**: Arrival edits the canonical `retreatProfile` lists. The legacy `arrivalInfo.whatToBring` string is never changed. Dates and other profile fields are unchanged. Retreat Home shows a pointer, not a second editor, and its Save keeps the Arrival lists. The live preview updates. Save + reopen works. Restored afterwards |
| Brand | **PASS**: 8 presets, Customize colors (Primary/Accent), Advanced colours. **Flow has no Background tint.** Teach has Background tint, with navigation/text colours behind its "Fine-tune" switch (by design; my first check expected them to be visible). No "Where You Are". Nothing saved (brand rows unchanged) |
| Publish → Guest matches Studio | **PASS**: after Republish, `published_spaces.modules` matches the draft for the schedule (6 rows), retreatProfile (incl. dates 13–17), arrivalInfo, spaceSettings, stayConnected and moduleIntros. The Guest App shows it (see Day navigator) |

### Admin (synthetic owner + billing_admin, real TOTP through the enrol page)

| Check | Result |
|---|---|
| Enrolment | **PASS**: `/admin` with no factor → `/admin/mfa/enroll`. QR + 32-character setup key. Wrong code refused (stays `aal1`). A real RFC 6238 code → `aal2` with `amr` totp `{method,timestamp}`. Auth Admin API: exactly 1 verified factor (assumption **A1 holds on hosted Staging**) |
| Role matrix: 6 personas (anon, non-admin, owner AAL1/AAL2, billing_admin AAL1/AAL2) × 20 URLs × 2 engines | **PASS 240/240**: owner AAL2 200 everywhere. billing_admin: owner sections and **`/admin/launch` 404 with no Admin nav**, billing pages 200. Non-admin 404. Anon → `/log-in`. AAL1 → `/admin/mfa/verify` (billing_admin AAL1: owner sections 404 first). At most 1 redirect hop, no loops |
| No customer e-mails on billing pages (owner and billing_admin) | **PASS**: the only addresses are the signed-in admin's own (header) plus the synthetic admin addresses in the Admin users list and the audit log. Customer addresses appear only on the **owner-only** Space detail page (Space owners), as specified |
| Exact counts vs an independent read-only REST computation | **PASS**, all equal: accounts 10, Spaces 5 (Flow 3, Teach 2, legacy 0), archived 0, published 4, published this month 4, draft never published 1, edits pending 1, subscriptions/paid 0, legacy (no subscription) 5. Viewing a Space detail wrote the app's own `view.space_detail` audit rows |
| MFA step-up (TOTP age above 600 s) | **PASS**: page reads still allowed. `?add=1` → `/admin/mfa/verify?stepup=1`; a code returns the admin, then a **backup authenticator** was enrolled (2 verified factors) |
| Sign-in with two authenticators | **FAIL → D3**: valid codes were refused on about half of the attempts ("That code was not accepted"; 6 of 13 sign-ins across both factors). The fix (`6490a1c`) is on `feat/032.6-admin-batch1` but was **not merged into RC1** |
| Inline step-up on a sensitive action | **Not exercised**: every such action changes billing or admin grants, which was not approved. The step-up redirect path above was exercised |
| Billing inert with paid checkout off | **PASS**: customer `/billing/<id>` → 404, `/create` shows only the slot message, no Stripe link/form/script. Admin launch: DISABLED. Stripe "not configured" |
| Entitlement-based 404 | **Skipped** on Staging (not re-approved, no SQL billing changes). Code level: `lib/billing/access.test.ts` (32 tests: `deriveSpaceAccess`, `combineCommercialAvailability`) passes on the fix branch |

### Supabase Staging "Limit duration of AAL1 sessions" (read-only observation)

Method: password sign-in through the Auth API, then a refresh plus `GET /user` at about 1, 17 and 20 minutes.

| Account | Refresh at 17 min | Refresh at 20 min |
|---|---|---|
| Automation account, **no MFA factor** | 200 (session alive) | 200 |
| Synthetic owner **with a verified TOTP factor**, no code entered (`aal1`) | 200 (session alive) | 200 |

- **Confirmed:** a non-MFA session survives longer than 15 min, so ordinary customers are not signed out.
- **New fact (O7):** on hosted Staging, the MFA user's AAL1 session was **not** ended at 17 or 20 min either. The local
  GoTrue test (Batch 1 report §10.4) did end such sessions.
- Either the dashboard setting is not active on Staging, or the hosted version enforces it differently **[A]**. The
  owner should check the setting before copying it to Production.

## 3. Defects (collected, classified, fixed in one batch)

| # | Severity | Defect | Fix |
|---|---|---|---|
| D3 | **High** (admin lockout risk: blocks the documented "verify with the backup" recovery) | With two TOTP factors, sign-in verification and step-up challenged only the first factor returned by Auth, whose order changes. Valid codes were refused intermittently on Staging | `151a7a5`: cherry-pick (`-x`) of `6490a1c`. `verifyWithAnyFactor` tries each verified factor. +9 tests |
| D1 | Medium | Flow Studio → Stay connected: the platform `<select>` was 13 px on phones, so iOS Safari zooms in on focus (measured in both engines at 390) | `2fceeca`: 16 px below `sm`, 13 px from `sm` up |
| D2 | Low | Stay connected row 4 px wider than a 320 px viewport (Remove button), so the page scrolls sideways | `2fceeca`: below `sm` the URL field wraps onto its own line and the select fills the first line. Unchanged from `sm` up |
| D4 | Low | Same zoom rule: My Spaces confirm inputs (archive/replace, delete Space, delete account) and the preview-gate password were 14 px | `2fceeca`: `text-base sm:text-sm`. New source guard (`studioMobileGuards.test.ts`) fails on any unprefixed sub-16 px text control. It found exactly these 6 controls before the fix |

The paid-checkout coupon field (`create/[type]/checkout-form.tsx`, 14 px) was left unchanged because billing is out of
scope. The guard excludes it explicitly.

### Observations (not fixed: by design, pre-existing, or owner decision)

- **O1:** column from 640 px, not 431 px. Documented RC decision; owner to choose.
- **O2:** axe colour contrast (mist labels). Pre-existing palette; design decision.
- **O3:** the Studio day strip shows only dates that already have sessions, so empty retreat days (15–17 Oct) are not
  directly selectable. A session can still be moved there with its date field. By design (code comment); a UX
  improvement candidate.
- **O4:** loader flash (L → blank → L, about 50–100 ms) on Teach and WebKit Flow. Low, cosmetic.
- **O5:** "Reserved successfully." shows on the Identity step without any action. Pre-existing since `6ab9f13`.
- **O6:** "2 of 1 Space slot used" for the automation account. An artefact of the approved manual membership insert,
  not a product defect.
- **O7:** see the AAL1 table above.
- **O8:** the Admin language switch offers tr/it. Admin UI only; Space languages are still en/de/es/fr/he.
- **O9:** Chromium sometimes showed no wrong-code message on the enrol page within 2.5 s. The code was refused and
  WebKit showed the message; harness timing.

## 4. Fix branch and gates

The fix branch is `fix/rc1-staging` in worktree `~/Desktop/RBR-rc1-fixes`. It is based on `8ed8ea5` and has these commits:

1. `151a7a5`: D3, the cherry-pick of `6490a1c`.
2. `2fceeca`: D1, D2, D4.
3. This report and the checklist.

**Not pushed, not deployed.**

Gates were run after `npm ci` in the worktree with `.next` removed first:

| Gate | Result |
|---|---|
| `next typegen` | exit 0 |
| `tsc --noEmit` | 0 errors |
| `eslint .` | 0 errors, 29 warnings (baseline) |
| `vitest run` | 217 files; 4041 passed / 30 skipped |
| `next build` | exit 0 |
| `vitest run` after build | 218 files; **4046 passed / 25 skipped** |
| `git diff --check 8ed8ea5..HEAD` | clean. No env, `.vercel`, package, lockfile, migration or `vercel.json` change |

Targeted tests (included in the full run): `admin/mfa/verifyAnyFactor.test.ts`, `admin/_components/stepUpRetry.test.ts`
and `configurator/retreat/studioMobileGuards.test.ts`. As a mutation check, the new guard fails on the unfixed sources.

**Re-check after the redeploy (coordinator):**

- Stay connected at 320/390 in WebKit: 16 px select, no overflow.
- Two-factor admin sign-in, 10 times in a row. This needs a new, approved admin bootstrap, because this run's admins
  are disabled.

## 5. Data: snapshot, restore, diff

- **Snapshot:** a read-only snapshot of both QA Spaces was taken first (`before-rc1.json`).
- **Synthetic changes made through the UI, then reverted through the UI:**
  - one duplicated session (saved, then removed);
  - one Arrival list item (saved, then removed);
  - access code enabled, then disabled;
  - Space language he/de/es/fr, then back to en;
  - publishes in each language.
- **Restored from the snapshot over REST (QA tenant ids only):**
  - both `published_spaces` rows. This makes the G5 dates and sessions unpublished again, as before;
  - `qa-teach-staging` `spaceSettings.data`. The language card had added `"currency": null`;
  - `tenants.content_updated_at` for both Spaces, so My Spaces and Admin show the same "edits pending" state as before.
- **Deleted:** the one `guest_access_ip_attempts` row created by this run.
- **Final diff:** 0 non-cosmetic differences. Every remaining difference is listed here:
  - `module_settings.updated_at` for Flow arrivalInfo, retreatProfile and spaceSettings, and for Teach spaceSettings;
  - `space_guest_access` (qa-flow): `failed_attempts` 5 → 15, `version` 8 → 16, `updated_at`. These are security
    counters and were deliberately **not** rolled back. A lower version could revive old access cookies.
- **Unchanged:** schedule rows (ids and fields), brand rows, entitlements, members (back to the 2 original owners per
  Space), storage (0 objects changed).
- **After the restore:** the Guest App shows the pre-QA published state (Flow: single day, 3 Oct).

## 6. Cleanup and revocation (verified read-only)

**Vercel bypass:**

- The temporary bypass was generated at the start and kept in a 0600 file. It was sent as a header only on the first
  request per engine and host; cookies were used after that.
- It was **revoked**: the project now has **0 bypass secrets**, and the revoked header gets **302** on both hosts.
- The file was removed with `rm -P`.

**Synthetic users:**

- `184948ef…` (automation), `caa4edf6…` (synthetic owner admin), `feace8bc…` (synthetic billing_admin): **banned**
  (`banned_until` 2126). Password sign-in now returns `400 user_banned`. **0 TOTP factors** (owner 2 and billing 1
  deleted).
- Their `tenant_members` rows were removed: 0 memberships remain.
- `admin_users`: 2 rows, both with `disabled_at` set, **0 active**.
- Audit rows `admin.grant` ×2 (bootstrap) and `admin.revoke` + `admin.mfa_reset` ×2 (cleanup) were written. The log is
  append-only. The owner's real account was never granted.

**What is left over:**

- the 3 banned users;
- their `profiles` and `user_space_slots` rows, created by the signup triggers;
- the 2 disabled `admin_users` rows;
- 9 audit rows.

Deleting the users would cascade-delete the disabled admin rows; ask if you want that.

**Scratch files:**

- All credential files were removed with `rm -P`: passwords, TOTP keys, session storage states, the bypass file, and the
  screenshot of the Studio access-code panel.
- Before deletion, 664 evidence files were scanned: 0 contained any secret value, and 0 contained a JWT.

Evidence: `/private/tmp/claude-501/-Users-ronbirman-Desktop-RBR-Project/220dc7e0-cf6b-4803-8d93-512f891783fe/scratchpad/rc1-qa/`
(`out/` JSON and logs, `shots/`, `before-rc1.json`, `after-rc1.json`, `out/diff.txt`).

## 7. Addendum (2026-10-15): re-check after batch-fix redeploy #1

This is a targeted re-check with the same rules, harness and cleanup pattern as sections 1–6. It used Playwright
Chromium and WebKit (emulated, not real devices) on an allow-list: the two Staging hosts plus the Staging Supabase host.
The only blocked host was `vercel.live`.

**Not touched:** Production, `main`, migrations, billing, Stripe and DNS. This run did no deploy or redeploy.

| Item | Value |
|---|---|
| Deployment | `dpl_Bq4FLMchTGY6SYw7nY9CHRJCMNNB`, `https://innerdwes-qn2p8nd0h-inner-dwe-s.vercel.app`, READY, custom environment `staging`. Alias `innerdwes-env-staging-inner-dwe-s.vercel.app` (200 on `/s/qa-flow-1h8ve` in both engines) |
| Commit | `53195cc` (`integration/staging-rc1`). This is `8ed8ea5` plus: D1–D4 (`151a7a5`, `2fceeca`); `fix/033-studio-ux` `f95bf51` (column from 431 px), `f2c39e3` (Teach-style day chips) and `53ae686` (height-aware image `sizes`); and main `b697b6b`/`3df158f`. Vercel metadata commit = `53195cc` |

### Results

| Check | Result | Evidence (`re1/out/`) |
|---|---|---|
| **D1** Flow Studio → Stay connected, 320 + 390, both engines: platform `<select>` and URL field | **PASS**: both 16 px (was 13 px) | `studio-d124.json` |
| **D2** same, horizontal overflow | **PASS**: `scrollWidth` = viewport at 320 and 390. The rightmost control ends at 285 / 355 px | same, `shots/d12-stay-*.png` |
| **D4** My Spaces confirm dialogs (Delete Space, Replace: both fields, Delete account), 320 + 390, both engines | **PASS**: every field 16 px, no overflow. Each dialog was opened, measured and cancelled; nothing was submitted | same |
| **D4** preview gate (`/preview-access`) password | **PASS**: 16 px at 320/390, both engines | same |
| **D3** admin with **two** TOTP factors (synthetic owner, enrolled through the real `/admin/mfa/enroll` page, codes computed by the harness) | **PASS**: **24/24** fresh sign-ins accepted, alternating first/backup factor, 12 per engine (6 per factor per engine). The Auth Admin API showed 2 verified factors. 0 refusals (before the fix: 6 of 13 refused) | `admin-d3.json` |
| **D3** step-up (TOTP age > 600 s), with the factor **not** used at sign-in | **PASS 4/4**: `?add=1` → `/admin/mfa/verify?stepup=1`; page reads are still allowed; the code is accepted (`aal2`); after that the add-authenticator page opens without a new challenge. Chromium 2/2 (ages 666 s / 671 s), WebKit 2/2 (634 s / 640 s), each factor once per engine. The first WebKit attempt hit a harness navigation race (`goto` interrupted by the idle page's own navigation) and was re-run with a retry | `admin-stepup2-chromium.log`, `admin-stepup2-webkit.json` |
| Guest shell, Flow + Teach × 320/390/430/431/600/1440 × 2 engines, every tab, Explore sub-screens at 320/390 | **PASS**: 24 shells, 96 tabs, 60 sub-screens, 24 consoles. At ≤ 430 px the app is full width. **From 431 px** it is a centred 430 px column (431: 1–431; 600: 85–515; 1440: 505–935). The bottom nav is inside the column every time. No overflow, no console or page errors | `guest-re1.json` |
| 404 inside the shell (`/s/<unknown>`, `/g/<unknown uuid>`) × 6 widths × 2 engines | **PASS**: 404 + `noindex`; column = viewport ≤ 430, 430 from 431. No Space data | `site.json` |
| Access-code screen (code set, then removed, through Studio) × 6 widths × 2 engines | **PASS**: 6 digits (22 px), no content leak, `noindex, nofollow`, same column rule. Wrong code: "That code didn't work". The right code opens the app (codes entered at 390 and 1440 only, to stay under the per-IP limit). After "Disable code" the Space is public | `studio-access.json` |
| Day navigator (Flow republished with the saved dates 13–17 Oct for this check, then restored) × 320/390/430/431/1440 × 2 engines | **PASS**: 5 chips, each **52 × 69.5 px with a 16 px radius, identical to the Teach strip chip** (Teach measured in the same run). Unselected chips are filled (`#fdfaf4` + hairline). The selected chip is the navigation colour. No "DAY n" text in the chip; "day n" is in each chip's accessible name. The date line reads "Wed 14 Oct · Day 2", and "Thu 15 Oct · Day 3" after choosing day 3. Keyboard: arrows move from the selected day; Home = day 1, End = day 5 | `daychips.json`, `shots/daychips-*.png` |
| Day navigator in Hebrew (Space language → he, published, then back to en) | **PASS** in both engines: chips run right to left (day 1 on the right), ArrowLeft = next day, `dir=rtl`, chips 52 px | same |
| Image sharpness: `currentSrc ?w=`, decoded pixels of that render, cover upscale = device px needed / decoded px. 390@3, 430@3, 1440@1, 1440@2, both engines | **PASS**: Teach Home portrait (230×290, `sizes=516px`): `?w=1600` at DPR 3 (0.97), `1280` at DPR 2 (0.81), `640` at DPR 1 (0.81). Flow Today hero (`sizes=498px`): `1600`/`1280`/`640`, 0.67–0.81. Teach "More from" cards (`196px`): 0.60–0.90. Both engines chose the same rung every time. No image was source-limited: the Staging originals are 1920×1080 / 1920×1280 / 1200×800. **Class thumbnails: N/A**, because no class in the QA Teach data has an image | `imgs.json`, `imgs-originals.json` |
| Legal pages + preview gate | **PASS, unchanged**: the 26 legal/axe entries are identical to the previous run (Terms, Privacy, DPA, Billing v1.1; AUP, Copyright, Subprocessors v1.0; `/v/1.0` archived `noindex`; `/v/1.1` 404 by design; `/terms`, `/privacy` redirect). axe on `/legal` and `/legal/terms`: 0. `/` answers 200 | `site.json` |
| Share Card | **PASS**: `og:image` 200 `image/png` for both Spaces, on the alias host | `site.json` |
| axe vs the previous RC1 run | **No new violation caused by this batch.** Same rules: `color-contrast` (serious) and `heading-order` (moderate). Teach Home/Schedule have +1 contrast node: the "Ended" badge, because the 14 Oct class is now in the past. Same token pair. The Flow Explore sub-screens were scanned for the first time; the previous run never reached them. They show the same rules, plus `scrollable-region-focusable` on Facilities and Guidelines (see O10) | `guest-re1.json`, `axe-probe.json` |

Harness notes (not product defects):

- The harness flagged the synthetic contact values `example.com` / `calendly.com` as raw translation keys. They are not.
- In WebKit, "TypeError: Load failed" appears on `/space` when the harness navigates away from it right after sign-in.
  It is the abort of an in-flight fetch.
- First-factor enrolment reached `aal2`. The harness's URL wait stopped at the intermediate `/admin` before the
  redirect to `/admin/overview`.
- A step-up deliberately lands on `/admin`, because the `step_up_required` redirect carries no `next`. That was
  already the behaviour in the previous run.

### New observation (no fix in this batch)

- **O10 (pre-existing, low):** axe `scrollable-region-focusable` (serious) on the Flow Guest Explore → Facilities and
  Guidelines screens. The screen's own scroll container (`flex-1 overflow-y-auto`) has no focusable child on these
  text-only pages, so keyboard-only users cannot scroll it.
  - The code is unchanged in this batch: every `*-screen.tsx` with this container has a 0-line diff `8ed8ea5..53195cc`.
  - Suggested fix for a later batch: `tabIndex={0}` plus an accessible name on the scroll region.

**New defects: none.** No code change was made, so no gates were re-run.

### Data, cleanup and revocation (verified read-only)

- **Snapshot before:** `re1/before-re1.json`.
- **Changes made through the UI, then reverted:**
  - three Flow publishes (en, he, en);
  - access code enabled, then disabled.
- **Restored over REST (QA tenant ids only):**
  - the Flow `published_spaces` row (back to the single 3 Oct day);
  - Flow `tenants.content_updated_at`;
  - the one `guest_access_ip_attempts` row this run created was deleted.
- **Final diff: 0 non-cosmetic differences.** The only remaining differences:
  - Flow `spaceSettings.updated_at`. Its data is identical: `{"locale":"en","country":"DE","currency":null}`;
  - `space_guest_access` security counters (`failed_attempts` 15 → 16, `version` 16 → 18). They were deliberately not
    rolled back.

**Synthetic users and admin rows:**

- What was temporarily changed, as approved:
  - the automation user `184948ef…` and the owner admin `caa4edf6…` were unbanned, each with a new random password
    kept in a 0600 file;
  - the automation user got owner membership on **only** the two QA Spaces;
  - the owner `admin_users` row was re-enabled, with an `admin.grant` audit row (`bootstrap-staging-rc1-recheck1`);
  - 2 TOTP factors were enrolled through the real page.
- `feace8bc…` (billing_admin) was **not** touched.
- What cleanup did:
  - removed the 2 memberships;
  - deleted 2 of 2 factors;
  - disabled the owner row again;
  - wrote `admin.revoke` and `admin.mfa_reset` audit rows (`cleanup-staging-rc1-recheck1`);
  - banned both users again (`banned_until` 2126).
- Verified afterwards:
  - all 3 synthetic users: banned, **0 factors**, **0 memberships**;
  - `admin_users`: 2 rows, **0 active**;
  - password sign-in for auto and owner returns `400 user_banned`;
  - this run wrote exactly 3 audit rows.

**Vercel bypass:**

- One temporary bypass was generated (the project had 0 before). It was used as a header only on the first request per
  engine and host.
- It was **revoked**: the project has **0 bypass secrets**, and the revoked header gets **302** on both hosts.

**Scratch files:**

- The bypass, passwords, TOTP keys, session storage states and the Studio access-code panel screenshot were removed
  with `rm -P`.
- Before deletion, 256 evidence files were scanned: 0 contained any secret value, and 0 contained a JWT or secret key.

Evidence: `/private/tmp/claude-501/-Users-ronbirman-Desktop-RBR-Project/220dc7e0-cf6b-4803-8d93-512f891783fe/scratchpad/rc1-qa/re1/`
(`out/` JSON and logs, `shots/`, `before-re1.json`, `after-re1.json`, `out/diff.txt`, `out/cleanup-verify.txt`,
`out/revoke.txt`).
