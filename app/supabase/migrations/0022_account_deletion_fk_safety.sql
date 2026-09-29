-- Task 017 — Account Deletion FK safety.
--
-- Deleting a user's auth.users row (the only way to remove an account -
-- there is no other path) is currently blocked by four foreign keys that
-- reference auth.users(id) with the default ON DELETE NO ACTION
-- (restrict), confirmed directly against this project's live schema
-- (pg_constraint), not assumed from migration source text alone:
--
--   tenants.created_by                          -> auth.users(id)  [restrict]
--   access_code_redemptions.redeemed_by         -> auth.users(id)  [restrict, NOT NULL]
--   space_featured_submissions.reviewed_by      -> auth.users(id)  [restrict]
--   space_featured_submissions.approved_by      -> auth.users(id)  [restrict]
--
-- (published_spaces.published_by does NOT need fixing - it was already
-- dropped entirely by 0005_modules_timezone_atomic_publish.sql and no
-- longer exists as a column, let alone a constraint.)
--
-- Task 017's own account-deletion routine (see (auth)/actions.ts
-- deleteAccount) already deletes every tenant the departing user OWNS
-- before ever touching auth.users, which clears `tenants.created_by` and
-- cascade-removes that tenant's own `space_featured_submissions` row for
-- the normal case. These four FKs still need fixing for the cases the
-- app-level ordering cannot reach on its own: a tenant this user does NOT
-- own but once created (created_by, if that ever diverges from
-- ownership), a coupon/access-code redemption recorded against a SPACE
-- this user doesn't own, or a featured-listing review/approval this user
-- performed for someone else's Space (both plausibly an operator/admin
-- account, not a Space owner - see 0016_guest_access_and_featured.sql:
-- reviewed_by/approved_by are only ever writable through a privileged
-- path, never by an ordinary authenticated client).
--
-- Fix, in every case: ON DELETE SET NULL, never CASCADE. This keeps the
-- referencing record itself alive (a Space, a coupon-redemption audit
-- row, a featured-listing review) and only detaches the specific
-- person-identifier once their account no longer exists - never deletes
-- someone else's Space, or a redemption/security-relevant record, as a
-- side effect of a different user's account deletion.
--
-- access_code_redemptions.redeemed_by is the one judgment call here: it
-- is currently NOT NULL, and this migration makes it nullable so SET
-- NULL is possible. redeemed_by existing purely to prevent
-- double-redemption fraud and support an entitlement audit trail is a
-- plausible legal/security reason to retain the record - this migration
-- deliberately ANONYMIZES it (keeps code_id/tenant_id/redeemed_at/
-- access_ends_at_granted, nulls out who redeemed it) rather than
-- inventing a longer retention policy or silently deleting the row.
-- Whether this exact anonymize-not-delete approach is the desired policy
-- (versus, say, full erasure) is a genuine retention-policy decision this
-- migration does not attempt to make on its own - see
-- TASK-017-FINAL-REPORT.md, "Retention requirement flagged separately."
--
-- Never edit 0001-0021. Forward-only.

alter table public.tenants
  drop constraint tenants_created_by_fkey,
  add constraint tenants_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;

alter table public.access_code_redemptions
  alter column redeemed_by drop not null;

alter table public.access_code_redemptions
  drop constraint access_code_redemptions_redeemed_by_fkey,
  add constraint access_code_redemptions_redeemed_by_fkey
    foreign key (redeemed_by) references auth.users(id) on delete set null;

alter table public.space_featured_submissions
  drop constraint space_featured_submissions_reviewed_by_fkey,
  add constraint space_featured_submissions_reviewed_by_fkey
    foreign key (reviewed_by) references auth.users(id) on delete set null;

alter table public.space_featured_submissions
  drop constraint space_featured_submissions_approved_by_fkey,
  add constraint space_featured_submissions_approved_by_fkey
    foreign key (approved_by) references auth.users(id) on delete set null;
