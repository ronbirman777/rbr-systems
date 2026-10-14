# Staging Admin access: first-owner bootstrap, lockout analysis and recovery (PROPOSED, NOT EXECUTED)

Date: 2026-10-14. Applies to branch `feat/032.6-admin-batch1` (commits `474a37a` … `24f83cd`) deployed to the Vercel
`staging` environment (Supabase Staging `kkqjsspxupyxytddiumf`). **Nothing in this document has been executed.** Each
Supabase mutation below needs explicit, per-run owner approval under the repo constitution, and none of them may be run
"to test".

## 1. Facts (separated from assumptions)

Observed read-only on Staging by the coordinator (2026-10-14, about 09:40 UTC):

- `public.admin_users` has **0 rows**. There is no Admin on Staging yet.
- Auth MFA: TOTP is **enabled**, with at most 10 factors per user. SMS MFA is disabled.
- "Enhanced MFA Security → Limit duration of AAL1 sessions" is **ON**: the session is terminated unless a factor is
  verified within **15 min** of sign-in.

From the code on this branch:

- Admin gate: the session must be valid; the user must have an `admin_users` row with a known role and
  `disabled_at` null; the JWT must have `aal = aal2` **and** an `amr` entry `{ method: "totp", timestamp }`; and a
  **still-existing verified TOTP factor**, created no later than that timestamp (+5 s), must be returned by the Auth
  Admin API. That factor check is fresh for every server action and every step-up. Page reads cache it for 60 s.
  Step-up = a TOTP within 600 s.
- The enrol page and enrol actions need only an active `admin_users` row when the user has **no** verified factor.
  Adding a **backup** factor (`/admin/mfa/enroll?add=1`, linked as "Add backup authenticator" in the Admin header)
  needs a fresh step-up.
- The first-owner bootstrap has **no code path**. It is a manual service-role/SQL insert by the project owner
  (`docs/billing/ADMIN-RECOVERY.md`, "First Admin bootstrap"; 0036 comment). There is no bootstrap script in
  `app/scripts/` (`admin-qa.mjs` is a QA harness, not a bootstrap).

Assumptions (UNVERIFIED on Staging):

- **A1.** After a real TOTP verification, Staging issues `amr: [{ "method": "totp", "timestamp": … }, …]`. This is the
  standard Supabase format (auth-js `AMREntry`). A **custom access-token hook** that rewrote `amr` as strings
  (`["totp"]`) would fail the new check. Read-only check: Staging Dashboard → Authentication → Hooks shows no custom
  access token hook.
- **A2.** It is unknown whether "Limit duration of AAL1 sessions" applies only to users **with** a verified factor or
  to **every** session. If it applies to every session, ordinary Staging customers (no MFA) are signed out after
  15 min. That is a product question to confirm before the setting is copied to Production. It does not block Admin.
- **A3.** The owner already has (or will create) a normal Staging account with a confirmed email.

## 2. First-owner bootstrap on Staging (PROPOSED, approval-gated)

Order matters because of the 15-minute AAL1 window. **Grant first, then sign in, then enrol at once.**

1. **Account.** The owner signs up or signs in on the Staging site with the owner address, so that a row exists in
   `auth.users`. Sign out afterwards.
2. **Grant (one approved SQL run, Staging SQL editor, as `postgres`):**

   ```sql
   -- PROPOSED. Staging (kkqjsspxupyxytddiumf) only. Replace <OWNER ADDRESS>. Expect exactly 1 row; otherwise ROLLBACK.
   begin;
   insert into public.admin_users (user_id, role, note)
   select id, 'owner', 'Staging first owner bootstrap (approved <date>)'
   from auth.users where lower(email) = lower('<OWNER ADDRESS>')
   on conflict (user_id) do nothing
   returning user_id, role;
   -- Record it in the append-only log (the app records grants itself; a manual grant must be recorded by hand).
   insert into public.admin_audit_log (admin_user_id, action, target_type, target_id, after_state, reason, request_id)
   select user_id, 'admin.grant', 'admin_user', user_id::text, '{"role":"owner"}'::jsonb,
          'bootstrap: first owner on Staging (manual SQL, approved)', 'bootstrap-staging'
   from public.admin_users where note like 'Staging first owner bootstrap%';
   commit;
   ```

   Verify (read-only): `select role, disabled_at is null as active from public.admin_users;` should return exactly
   `owner | true`.
3. **Sign in fresh**, then open `/admin`. With no verified factor you are sent to `/admin/mfa/enroll`. Scan the QR code
   and enter the first code **within 15 minutes of signing in**. If the window passes, Auth ends the session: sign in
   again and restart enrolment (an abandoned unverified factor is removed automatically).
4. **Check the session (proves A1).** After the code, `/admin` must land on `/admin/overview`. If you are sent back to
   `/admin/mfa/verify` again and again after entering correct codes, the session does not carry `amr` totp. **Stop**,
   and use §5 (rollback). Do not loop.
5. **Add a backup authenticator now** (header → "Add backup authenticator"; it needs the code you just entered, valid
   for 600 s). Use a second device, or a password manager that stores TOTP. Recommendation: **at least 2 TOTP factors
   per Admin**. Store each recovery location in the account security inventory (names only).
6. Optional: grant a second owner from inside the app (Settings → Admin users). That is step-up and audited. A second
   owner is the strongest guard against a single-person lockout.

## 3. Lost device / lockout recovery

| Situation | Recovery | Approval |
|---|---|---|
| One device lost, a backup factor works | Sign in, verify with the backup, add a new backup (`?add=1`). Then remove the lost factor in Dashboard → Authentication → Users → user → MFA factors. Sessions verified with the backup keep working (the backing check is per factor creation time) | Factor removal is a Supabase mutation: approval |
| All factors lost, another owner exists | The other owner checks `admin_audit_log` for that `admin_user_id`, then the project owner removes the user's factors (Dashboard, or Auth Admin API `auth.admin.mfa.deleteFactor({ userId, id })` with the service role), and **signs the user out everywhere**. The user signs in, enrols within 15 min, adds a backup | Approval per run |
| All factors lost, sole owner | Same as above, done by the Supabase **project owner** in the Dashboard. There is no in-app bypass and none may be added | Approval per run |
| Sole owner's account lost | The project owner repeats §2 for another account (new `admin_users` owner row + manual audit row). Optionally disable the old row (`update admin_users set disabled_at = now() where user_id = …`) | Approval per run |
| Stolen device | Remove that factor at once (Dashboard), sign the user out everywhere, rotate the password, review `admin_audit_log` since the loss. A removed factor stops authorizing mutations and step-up **immediately**, and page reads within **≤ 60 s** (cache), even while the old AAL2 JWT is still valid | Approval |

Each recovery is recorded in the task log (who, when, why). Supabase-side factor changes are not in
`admin_audit_log`, so add a manual audit row the same way as in §2 (action `admin.mfa_reset`, reason …) when it is
approved.

**The owner cannot be permanently locked out** while someone controls the Supabase project Dashboard: every recovery
path ends in Dashboard or service-role actions that the app does not depend on. That makes the Supabase account's own
MFA and its recovery custody the real root of trust (account security inventory F-8).

## 4. Interaction details

- **New `amr` totp requirement:** it is satisfied by standard Supabase TOTP sessions (A1). A session refresh keeps the
  original TOTP timestamp. Step-up therefore ages from the real verification, and after 600 s the inline
  re-verification box asks for a new code (it does not log you out).
- **Factor backing rule:** a factor created **after** the session's last TOTP verification does not back that session.
  After a re-enrolment, the old session is sent to `/admin/mfa/verify` once, and one code fixes it. Known limit: with
  two factors, removing the one that verified the session is not detected while the other, older factor still exists
  (`amr` carries no factor id).
- **AAL1 window (15 min):** it only constrains the first enrolment and each sign-in's code entry. An admin with a
  verified factor sees the verify page immediately after sign-in.
- **billing_admin** (when one is granted later): the same enrolment flow. Owner-only pages (`/admin/overview`,
  `/admin/spaces`, `/admin/launch`, …) are plain 404s for them.

## 5. Rollback

- **Code:** redeploy the previous Staging deployment (Vercel → staging → previous build → Redeploy), or revert the
  branch commits (`git revert 24f83cd fd0249b 71f1acb 474a37a`) and redeploy. There is **no data-side rollback** for
  the code: there is no migration and no schema change.
- **Targeted fallback if A1 fails** (sessions lack `amr` totp): revert the `isAal2` change in
  `app/src/lib/billing/admin/amr.ts` (back to `aal === "aal2"`) **and** relax `factorBacksSession` to "a verified TOTP
  factor exists". That is a reviewed code change plus a redeploy, not a data change.
- **Bootstrap data:** the `admin_users` owner row may stay. It is inert without the console. Removing it is
  `update … set disabled_at = now()` (approval). The audit rows are append-only and stay.
