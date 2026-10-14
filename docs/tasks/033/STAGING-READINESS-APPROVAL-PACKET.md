# TASK 033 — Staging readiness approval packet (2026-10-14)

Owner instruction: "Continue TASK 033 Staging readiness … Return one consolidated approval packet." **Nothing in this
packet has been executed.** No SQL was run, no site setting changed, no credential reset or created. Production, `main`,
Stripe (off) and the tr/it gate are unchanged. Completed deployment and QA evidence: `STAGING-QA-REPORT.md` (rounds 1–3).

Facts below were gathered read-only on 2026-10-14 05:00–05:35 UTC (Supabase REST GETs with the Staging secret key,
Vercel API GETs for env **metadata**, and an in-process equality check of two public `NEXT_PUBLIC_*` values against the
host already visible in the page HTML — values not printed).

## 0. Current state

| Item | Value |
|---|---|
| Staging deployment | `dpl_EME1Fuq7cxYeDbEdC4AfnETsuy61` — `https://innerdwes-4iqe9trhs-inner-dwe-s.vercel.app` (`182f47e`), alias `innerdwes-env-staging-inner-dwe-s.vercel.app` |
| Rollback build | `innerdwes-85fff4s07` (`e3ed1eb`, READY) |
| Production | latest `innerdwes-cdlnhanhr` (`44426be`), unchanged; Supabase Production `qzmsclkzbxrfohuxnitc` not touched |
| Bypass secrets on the project | 0 |
| Staging billing | `paid_checkout_enabled = false`; `space_subscriptions` 0 rows; no Stripe env names |
| tr/it | not in `SPACE_SELECTABLE_LOCALES` (en, de, es, fr, he) |

Staging synthetic Spaces (read-only):

| Tenant | Slug | Type | Zone | Language | Guest access | Notes |
|---|---|---|---|---|---|---|
| `3e6e4978-…` | `qa-flow-1h8ve` | Flow | Europe/Lisbon | en | public | QA owner's; schedule 5 items, **one date** (2026-10-03); retreatProfile has **no start/end dates** |
| `cc51ee9a-…` | `qa-teach-staging` | Teach | Asia/Jerusalem | en | public | QA owner's |
| `4eb19601-…` | `qa-staging-retreat` | Flow | UTC | — | public | **not** the QA owner's (owner on `example.com`); 404-test target |
| `c585f413-…` | (no slug) | Flow | UTC | en | — | not the QA owner's; **same `access_ends_at` as the 404 target** → the SQL filters by `tenant_id` |

---

## G1 — Commercially-unavailable 404 test (SQL, Staging only, synthetic tenant)

**Target row (re-verified 2026-10-14):** `public.space_entitlements` where `tenant_id = '4eb19601-1f88-4753-a13d-989de04ac935'`:
`access_type complimentary`, `starts_at = created_at = updated_at = 2026-10-03T07:05:32.450636+00:00`,
`access_ends_at = 2027-10-03T07:05:32.450636+00:00`, Stripe ids null. No `space_subscriptions` rows exist. No trigger on
`space_entitlements` in migrations 0001–0047. Availability rule (`app/src/lib/entitlements/availability.ts`): unavailable
once `now > access_ends_at + 168 h`; `−8 days` is past the grace.

**Runner:** Supabase SQL on project **`kkqjsspxupyxytddiumf` (InnerDweS Staging)** only, via the Supabase connector
`execute_sql` with that exact project id (Production id `qzmsclkzbxrfohuxnitc` never passed). Each step is one statement
that refuses to act unless exactly one row matches.

**Step 1 — read-only pre-check**
```sql
select tenant_id, access_type, access_ends_at, updated_at
from public.space_entitlements
where tenant_id = '4eb19601-1f88-4753-a13d-989de04ac935';
-- expect exactly 1 row: complimentary, 2027-10-03 07:05:32.450636+00, 2026-10-03 07:05:32.450636+00
```

**Step 2 — make the synthetic Space commercially unavailable**
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

**Step 3 — test (read-only, needs a temporary bypass secret, see G4)**: `/s/qa-staging-retreat` and
`/g/4eb19601-1f88-4753-a13d-989de04ac935` → **404**, `<meta name="robots" content="noindex">`, no Space name/content, no
`/api/media` request; Chromium + WebKit; plus `/s/qa-flow-1h8ve` and `/s/qa-teach-staging` still 200 (no collateral).

**Step 4 — rollback (immediately after step 3, also if step 3 fails part-way)**
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
**Step 5 — verify:** repeat step 1 (row byte-identical to the pre-check, `updated_at` included); `/s/qa-staging-retreat`
and `/g/4eb19601-…` → 200 again. Expected window between step 2 and step 4: < 15 minutes.

Not covered: Studio "inactive" view for that tenant's owner (not our account; would need another login). Guest-suspended
(billing) state stays verified locally only.

**Approval line:** "Approve G1: run steps 1–5 of the 404 test SQL on Staging `kkqjsspxupyxytddiumf` exactly as written."

---

## G2 — D5: Staging site-address setting (Vercel env + redeploy, Staging only)

**Finding:** both Staging values equal `https://innerdwes-git-fix-0275-teach-qa-corrections-inner-dwe-s.vercel.app`
(no trailing slash). That alias currently serves an **11-day-old Preview build** (`innerdwes-c9csggnnm`,
`dpl_7ic1i9FDwiumW1RQaspJmrZbjBUa`, 2026-10-03). Effects on Staging today:

| Code path | Variable | Effect now |
|---|---|---|
| `metadataBase` → `og:image`, canonical, sitemap/robots (`document-shell.tsx`, `robots.ts`, `sitemap.ts`) | `NEXT_PUBLIC_SITE_URL` | point at the old build |
| Guest share links / QR / Copy Link (`GUEST_PUBLIC_ORIGIN`; `NEXT_PUBLIC_GUEST_URL` is **Production-only**, so Staging falls back to SITE_URL) | `NEXT_PUBLIC_SITE_URL` | QR on iPhone opens the old build |
| Sign-up / resend / password-recovery email redirect (`actions.ts`, `recoveryActions.ts`) | `NEXT_PUBLIC_APP_URL` | links land on the old build |
| Billing `appUrl` (`billing/deps.server.ts`) | `NEXT_PUBLIC_APP_URL` | inert (Stripe off) |

**The env records are shared:** each is one record targeting Preview branch `fix/027.5-teach-qa-corrections` **and**
the `staging` custom environment (`env_fTINl69sF95hUnVgvL8Evl95HlAv`):
`NEXT_PUBLIC_SITE_URL` id `AbjueOWmjqDQY5eE`, `NEXT_PUBLIC_APP_URL` id `wPHMblsr1yFkI5xb`. Production records
(`0vVC93RGNLxYEgfD`, `0V1i61hw5io8efss`, `wA2z9Emka83uyW4E`) are separate and are **not touched**.

**New value (both):** `https://innerdwes-env-staging-inner-dwe-s.vercel.app` — the stable Staging alias, which follows
every Staging redeploy. Still SSO-protected (Production unaffected; no domain or DNS change).

**Exact change** (from `~/Desktop/RBR-033-deploy`, project/team ids from its gitignored `.vercel/project.json`; the body is
written to a 0600 scratch file, not echoed):
1. `vercel api "/v9/projects/$P/env/AbjueOWmjqDQY5eE?teamId=$O" -X PATCH --input body.json` with
   `{"value":"https://innerdwes-env-staging-inner-dwe-s.vercel.app"}`; same for `wPHMblsr1yFkI5xb`.
2. Verify (metadata GET): both records keep `target ["preview"]`, `gitBranch fix/027.5-teach-qa-corrections`,
   `customEnvironmentIds [staging]`; only `updatedAt` changes; in-process equality check against the new value; Production
   records' `updatedAt` unchanged.
3. `NEXT_PUBLIC_*` values are inlined at build time → **redeploy the same commit** `182f47e` from the clean detached
   worktree: `vercel deploy --target=staging --yes` (no code change). Record the new deployment id.
4. Read-only check (with G4 bypass): `og:image` / canonical host = `innerdwes-env-staging-inner-dwe-s.vercel.app`;
   Studio "Guest App link" and QR target the same host (needs G3 login); guest pages 200; Production unchanged.

**Side effect, stated:** any *future* Preview build of the old branch `fix/027.5-teach-qa-corrections` would also get the
Staging alias. No such build is planned; existing deployments are unchanged (values are baked in).
Alternative (cleaner, more steps): detach `staging` from the shared records and create two staging-only records — offered
only if you prefer it.

**Unverified dependency:** the Supabase Staging Auth "Site URL / Redirect URLs" allow-list. Reading it needs the Supabase
CLI token from the macOS keychain, which raised a keychain prompt; I stopped instead of waiting. If
`https://innerdwes-env-staging-inner-dwe-s.vercel.app/auth/confirm` is not allowed, email links fall back to the
Supabase Site URL. **Password login (G3) does not use it.** Owner check: Supabase dashboard → InnerDweS Staging →
Authentication → URL Configuration (read only; any change there is a separate approval).

**Rollback:** PATCH both records back to `https://innerdwes-git-fix-0275-teach-qa-corrections-inner-dwe-s.vercel.app`
and redeploy `182f47e`; or immediately point Staging back at `innerdwes-4iqe9trhs` (build with the old value baked in) by
redeploying from it. No data or schema involved.

**Approval line:** "Approve G2: set the two shared Staging `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_APP_URL` records to
`https://innerdwes-env-staging-inner-dwe-s.vercel.app` and redeploy `182f47e` to `staging`."

---

## G3 — Existing Staging QA account: login procedure (no reset)

| Item | Value |
|---|---|
| Account | `innerdwes.staging.qa+028@qa.example`, id `b7a0e045-0006-471c-8a2c-e91bc0c3980b`, Staging only; owner of `qa-flow-1h8ve` and `qa-teach-staging` |
| Password | set 2026-10-13 under the earlier approval; stored only in this session's scratchpad `stg033b/qa-owner.pw` (0600). Never printed, logged or committed |
| Lifetime | the scratchpad is session-scoped. When this session ends the file is gone and only a **new reset** (separate approval) restores access, unless you copy it to your password manager first (option B) |

**A — Claude-run (automated Studio checks):** Playwright reads the file in-process and types it into `/log-in` on the
Staging host only; tracing/video off during the login step; no screenshot of the field; logs redacted; session cookie
kept in memory. Needs a temporary bypass secret (G4). Sign out at the end.

**B — Owner on iPhone/Mac (no value in chat):**
1. On the Mac, type in this session: `! pbcopy < "/private/tmp/claude-501/-Users-ronbirman-Desktop-RBR-Project/220dc7e0-cf6b-4803-8d93-512f891783fe/scratchpad/stg033b/qa-owner.pw"` (copies, prints nothing).
2. Paste it into your password manager entry for the Staging host (recommended), or paste on the iPhone via Universal Clipboard.
3. Clear the clipboard: `! pbcopy < /dev/null`.
4. iPhone Safari → `https://innerdwes-env-staging-inner-dwe-s.vercel.app/log-in`. Vercel first asks for **your Vercel
   login** (team SSO; no bypass secret needed for you), then the app log-in with the QA email + pasted password.

**Validity:** not re-tested today (testing it is a login). The first sign-in is the check. If it fails: stop, **no
reset** without a separate approval.

**Approval line (only for A):** "Approve G3-A: Claude signs in as the existing Staging QA owner for Studio checks."
(B needs no approval from me — it is your action.)

---

## G4 — Temporary protection-bypass secret (credential, Staging project)

Needed by Claude for G1 step 3, G2 step 4 and G3-A (you on the iPhone use Vercel SSO instead). Same procedure as rounds
1–3: generate via the Vercel API, value 0600 in scratch, header on the first request per host only, **revoke** after the
run, verify 0 remain and that the revoked header gets 302, then delete the file.

**Approval line:** "Approve G4: one temporary bypass secret for this QA run, revoked afterwards."

---

## G5 — Synthetic Studio data for the iPhone pass (QA owner's Spaces only, via the Studio UI)

Needed because Staging has no multi-day Flow, no German Space and no access code today. All changes on `qa-flow-1h8ve` /
`qa-teach-staging` only, Studio UI only (no SQL), each logged, restored afterwards, and diffed against a read-only REST
snapshot taken before (round-2 pattern; cosmetic differences such as `published_at` advancing are expected).

| # | Change | Restore |
|---|---|---|
| S1 | `qa-flow-1h8ve` retreat dates: start = test day − 1, end = test day + 3 (Europe/Lisbon), Publish | clear both dates, Publish |
| S2 | `qa-flow-1h8ve`: copy existing activities onto two more days; add one **twin** (same date, time and title) on day 2 (D1 check) | delete the added activities, Publish |
| S3 | `qa-flow-1h8ve`: set a guest access code (chosen by **you**, typed on the device, never sent in chat), Publish | remove the code, Publish → `public` |
| S4 | `qa-teach-staging`: Space language `de` (D4 German dates on real WebKit), Publish | back to `en`, Publish |

Who: you on the iPhone (also exercises Studio on iPhone) or Claude beforehand (needs G3-A + G4). Restore + snapshot diff:
Claude (read-only) afterwards.

**Approval line:** "Approve G5: synthetic Studio changes S1–S4 on the two QA Spaces, restored afterwards."

---

## G6 — Real-iPhone checklist (owner)

Order: after G2 (so QR and links point at the current Staging host) and G5 setup. Latest iOS Safari; an older iOS too if
available. Emulation already passed these in Playwright WebKit — this is the real-device confirmation only.
Send back: one folder `iphone-<model>-ios<version>/`, files `I-<n>-<name>.png|mov`, plus one line per item PASS/FAIL + note.

### Flow — multi-day Day Navigator (`/s/qa-flow-1h8ve`, needs S1 + S2)

| # | Check | Pass when |
|---|---|---|
| I-1 | Schedule opens on **today** (Lisbon date) | the selected tab is today's, labelled `<WEEKDAY> <date> · DAY 2` (S1 puts today on day 2); Today control visible |
| I-2 | Swipe the day strip; tap each day | smooth, no horizontal page scroll, each day shows only its own activities; tab targets easy to hit (56×72) |
| I-3 | Empty day (if one in range) | empty-day message, no stale cards |
| I-4 | Twin activity day (S2) | both twins show once each on day 2; switching quickly between days leaves **no stale card** (D1) |
| I-5 | Leave Schedule (Today / Explore) and come back | same selected day and content |
| I-6 | Daily Inspiration | anchored to the retreat start (day-n text matches) |
| I-7 | Rotate to landscape; then text size larger (Settings → Display → Text Size) | nothing clipped, nav not under the home indicator |

### Teach (`/s/qa-teach-staging`)

| # | Check | Pass when |
|---|---|---|
| I-8 | Home, week strip, tap through 14 days | counts match the cards; "0 classes" days show the empty state with "Next:" |
| I-9 | Class sheet (e.g. Mon 26 Oct) opens/closes, scrolls | price free text `₪65`; sheet not under the notch/home indicator |
| I-10 | Retreats list prices | `THB 700.00`, `€450.00`, `€1,250.50` |
| I-11 | With S4 (`de`): Home + schedule | German dates like `Mi., 14. Okt.`; no flash of different text after load; in Safari on the Mac (Web Inspector console) **no React #418** |

### Share Cards

| # | Check | Pass when |
|---|---|---|
| I-12 | Studio (Flow) → "Share your Space" on the iPhone | iOS share sheet opens with the card image + link; link host = `innerdwes-env-staging-…` (after G2) |
| I-13 | Open the card image route in Safari: `/s/qa-flow-1h8ve/social/<v>` (link from the page's share) | 1200×1200 image of the published Space photo |
| I-14 | Teach Share Card in Teach Studio | card shows the portrait/hero; after a Republish the card updates |
| I-15 | Studio QR scanned with the iPhone camera | opens the current Staging host (after G2), SSO login then the Space |
| — | **Limit:** WhatsApp/iMessage **link previews** cannot fetch the card on Staging (SSO-protected; crawlers have no Vercel login) → expected "no preview" on Staging; verifiable only on a public host (Production release or a separately approved protection exception) | record what you see, not a FAIL |

### Access codes (needs S3)

| # | Check | Pass when |
|---|---|---|
| I-16 | Open `/s/qa-flow-1h8ve` | code screen inside the shell, no Space content or images before the code |
| I-17 | Keypad | numeric keypad; SMS/one-time-code suggestion does not insert garbage; paste of a full code works |
| I-18 | Wrong code | error shown; after ~5 tries rate-limited message |
| I-19 | Right code | unlocks; still unlocked after closing and reopening Safari |
| I-20 | Same link opened from Messages / WhatsApp (in-app browser) | same code screen; unlock works |
| I-21 | After S3 restore | Space public again without a code |

General (any page): no blank page > ~2 s on 4G/5G; loader never on top of painted content; safe areas respected
(portrait + landscape).

**Approval needed:** none from me — your action. Depends on G2, G5 and your Vercel SSO on the iPhone.

---

## Still gated (not requested here)

- tr/it: native review (`docs/localization/NATIVE-REVIEW-CHECKLIST-tr-it.md`) → then `SPACE_SELECTABLE_LOCALES`.
- Stripe: off until the final launch phase.
- Production: needs the TASK 032 release gates first (Staging 0001–0047, Production 0035); no `main` merge or push.
- Optional code-only speed-up (parallel access reads) — `OWNER-ACCEPTANCE-CHECKLIST.md` B4.

## Recommended order (one session)

G4 → G2 (env + redeploy + check) → G1 (404 test, < 15 min, rollback) → G3 (A or B) → G5 setup → G6 iPhone → G5 restore +
snapshot diff → revoke G4 → report round 4.
