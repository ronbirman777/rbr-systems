-- ===========================================================================
-- ADM-M1 (PROPOSED, NOT APPLIED) - Admin metric snapshots and exclusions
-- ===========================================================================
-- STATUS: DRAFT FOR REVIEW. This file is deliberately NOT in
-- app/supabase/migrations/. It has no migration number: 0048+ is contested
-- (ADMIN-IMPLEMENTATION-BATCHES.md P-5), and hosted migrations are not
-- approved. Do not run it against Staging or Production. To adopt it:
--   1. get a centrally assigned number, copy it to
--      app/supabase/migrations/<NNNN>_admin_metric_snapshots.sql;
--   2. review, apply locally, then Staging, then (after P-2) Production;
--   3. ship the snapshot writer (design note at the end) in the same batch.
-- Validated only by parsing/applying inside a rolled-back transaction on the
-- local stack (Batch 1 report, "ADM-M1 draft").
--
-- Pattern: like admin_users (0036 §11) - RLS on, NO policies, every privilege
-- revoked from public/anon/authenticated. Only the service role reads/writes,
-- after requireAdminPage({ roles: ["owner"] }) / the bearer-gated cron.
-- Rollback: drop table public.admin_metric_exclusions; drop table
-- public.admin_metric_snapshots; (no dependants).
-- ===========================================================================

-- One row per (snapshot date, metric key, dimensions). History survives
-- deletions of Spaces/accounts; growth.* and ov.net_new_paid_month read it.
create table public.admin_metric_snapshots (
  id bigint generated always as identity primary key,
  snapshot_date date not null,                       -- UTC day the values describe
  metric_key text not null check (metric_key ~ '^[a-z][a-z0-9_.]{1,79}$'),
  dimensions jsonb not null default '{}'::jsonb      -- e.g. {"product_type":"retreat"} or {"currency":"USD"}
    check (jsonb_typeof(dimensions) = 'object'),
  value numeric not null,                            -- a missing source is NOT written as 0: no row is written
  unit text not null check (unit in ('count','bytes','minutes','hours','percent') or unit ~ '^minor:[A-Z]{3}$' or unit = 'minor:unknown'),
  source text not null check (length(source) between 3 and 80),
  quality text not null check (quality in ('actual','calculated','estimated','manual')),
  environment text not null check (environment in ('production','staging','preview','development','local')),
  collected_at timestamptz not null default now(),
  -- Idempotency: re-running the writer for the same day replaces, never duplicates.
  constraint admin_metric_snapshots_one_per_day unique (snapshot_date, metric_key, dimensions, environment)
);
create index admin_metric_snapshots_key_date_idx on public.admin_metric_snapshots (metric_key, snapshot_date desc);
alter table public.admin_metric_snapshots enable row level security;
revoke all on public.admin_metric_snapshots from public, anon, authenticated;

-- Owner-approved QA/demo exclusions (ADMIN-METRIC-CONTRACTS.md §1.5). Adding or
-- clearing one is an audited, step-up action (metrics.exclusion_set /
-- metrics.exclusion_clear, to be added to ADMIN_ACTIONS with requiresStepUp).
create table public.admin_metric_exclusions (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('account','space')),
  subject_id uuid not null,                          -- auth.users.id or tenants.id; no FK so history survives deletion
  reason text not null check (length(reason) between 3 and 300),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  cleared_at timestamptz,
  cleared_by uuid references auth.users(id) on delete set null
);
-- At most one ACTIVE exclusion per subject.
create unique index admin_metric_exclusions_active_uniq on public.admin_metric_exclusions (subject_type, subject_id) where cleared_at is null;
alter table public.admin_metric_exclusions enable row level security;
revoke all on public.admin_metric_exclusions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- DESIGN NOTE (not SQL): the daily snapshot writer
-- ---------------------------------------------------------------------------
-- * Route: app/src/app/api/cron/admin-snapshots/route.ts, same pattern as
--   /api/cron/billing (Authorization: Bearer CRON_SECRET, fail closed when the
--   secret is unset). vercel.json gets a second cron entry ONLY in the batch that
--   ships this migration; frequency is plan-dependent (PROVIDER-USAGE-AND-COSTS
--   §2.1); once daily (e.g. "15 0 * * *") is enough.
-- * It computes the Batch 1 live metrics (lib/admin/queries/spaces.ts,
--   overview.ts) and upserts one row per ok/stale-free metric with
--   on conflict (snapshot_date, metric_key, dimensions, environment) do update.
--   Metrics in any state other than ok are NOT written (missing is not 0); the
--   run records which keys were skipped in its response/log.
-- * Exclusions are applied by the writer (accounts.total, spaces.*) and the
--   applied exclusion count is itself snapshotted (metric_key
--   'exclusions.applied') so a figure can be explained later.
-- * Readers: growth.* = consecutive snapshot rows; ov.net_new_paid_month =
--   today's paid_subscriptions minus the month-start row; fewer than 2 rows ->
--   not_measured (already the Batch 1 rendering).
-- * Retention (spec §8, ADM-12): 2 years; a purge job needs its own approval.
-- * Tests to add with it: one row per date and key on a double run (idempotency);
--   a non-ok metric writes no row; exclusions are audited with step-up.
