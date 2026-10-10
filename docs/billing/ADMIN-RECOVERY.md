# Admin access, MFA and lost-authenticator recovery

## Authorization model (`lib/billing/admin/auth.ts`)

Three independent server-side gates, all required, evaluated on every page and every server action (`requireAdminPage` / `requireAdminAction`). Any error resolving a gate is a denial.

| Gate | Check | Failure |
|---|---|---|
| Authenticated | `supabase.auth.getClaims()` (signature-verified JWT) | page: redirect to `/log-in?next=/admin` |
| Authorized | A row in `public.admin_users` for `claims.sub` with `disabled_at` null, read through the service-role client | page: plain 404 (the area does not advertise itself) |
| MFA | JWT `aal` is `aal2` (a TOTP was verified in this session) | no verified TOTP factor: `/admin/mfa/enroll`; has one: `/admin/mfa/verify` |

Not used for authorization: email strings, profile data, client metadata, a hidden URL, an environment switch.

`admin_users`: `user_id` (FK `auth.users`, cascade), `role` (`owner` | `billing_admin`), `note`, `created_by`, `created_at`, `disabled_at`. RLS enabled, **no policies**, all privileges revoked from `anon`/`authenticated`: only the service role reads or writes it. Granting needs `owner` role (`adminGrantAdmin`), step-up, audit. Revoking sets `disabled_at`; it refuses revoking yourself or the last owner.

**First Admin bootstrap** is a manual service-role/SQL insert by the project owner (stated in the 0036 comment). It is not in code and was not re-performed for this document.

## TOTP enrolment

Supabase Auth owns the factor; InnerDweS never generates, stores or checks an OTP secret. Only a signed-in user already present in `admin_users` can reach the enrol action. `startMfaEnrollmentAction` removes abandoned unverified TOTP factors, enrols a new one and shows the QR and the secret; `completeMfaEnrollmentAction` verifies the first code, marking the factor verified and upgrading the session to AAL2.

## Step-up (600 seconds)

`ADMIN_STEP_UP_MAX_AGE_SECONDS = 600`. Dangerous actions call `requireAdminAction({ recentMfa: true })`: the latest `amr` entry with `method: "totp"` must be at most 600 s old (and not more than 60 s in the future). Otherwise a page render redirects to `/admin/mfa/verify?stepup=1`, and a server action answers `step_up_required`, which opens an inline re-verify box next to the form. That box calls `stepUpVerifyAction` (verifies the code through Supabase Auth, writes the refreshed session cookies, and returns without navigating), then re-sends the pending action with the FormData the admin already submitted (`useAdminForm.retry`; `ConfirmActionButton` re-runs its action). The form keeps its values: Admin forms submit through `onSubmit` rather than `<form action>`, because React resets uncontrolled fields after a `<form action>` submission. Security is unchanged: the retried action runs `requireAdminAction({ recentMfa: true })` again on the server. Pinned by `admin/_components/stepUpRetry.test.ts` and `noNestedForms.test.ts`; `scripts/admin-qa.mjs` F1b-F3 check it in a browser (not re-run since this change).

| Needs step-up | Does not |
|---|---|
| plan sync, exemption set/clear, paid-checkout flag, admin grant/revoke | coupon disable / enable / sync to Stripe, reads |
| coupon create when duration is `forever` or percent >= 50 | other coupon creates |
| coupon update when the coupon already has redemptions | coupon update when unused |

## Lost authenticator: recovery procedure

There is **no self-service recovery in the application**, by design. A locked-out Admin has a verified factor but no AAL2 session, so the app sends them to the verify page, not the enrol page; the app code offers no path that removes a verified factor (the enrol action only clears abandoned *unverified* ones). Recovery is an operator action on Supabase Auth.

1. Confirm identity out of band (the project owner confirms it is the same person; never accept an email request alone).
2. Confirm the user's `admin_users` row exists and `disabled_at` is null. If another Admin with a working factor exists, prefer having them check the audit log first for suspicious activity.
3. The project owner removes the lost **TOTP factor** of that user: Supabase Dashboard > Authentication > Users > the user > MFA factors > delete, or the Auth Admin API `mfa.deleteFactor` with the service role. This is a Supabase mutation: under the repo constitution it needs explicit task authorisation each time; do not run it "to test". Never touch other users' factors.
4. Optionally revoke the user's sessions (sign out everywhere) so the old AAL2 session cannot be reused.
5. The user signs in, is redirected to `/admin/mfa/enroll` (no verified factor), enrols a new authenticator and verifies the first code.
6. Record the recovery: the project owner writes a note in the task log (who, when, why). The Admin console audit log does not record Supabase-side factor removal, because it happens outside the app.
7. If the lost device is believed stolen, also rotate the user's password and review `admin_audit_log` for that `admin_user_id` since the loss.

If the **only owner** is locked out and the service role is not available, recovery is a Supabase project-owner action in the Dashboard; there is no in-app bypass and none must be added.

## Audit log

`admin_audit_log` is append-only: a trigger raises on UPDATE, DELETE and TRUNCATE for every role including `service_role`. `admin_user_id` is deliberately not a foreign key so deleting an account never needs an UPDATE. Mutations that fail to write their audit row are reverted (coupon update, coupon enable/disable, exemption set, paid-checkout flag). Entries from QA runs are identified by `request_id` starting `qa032` (see QA-SAFETY.md).
