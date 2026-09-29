-- Task 015 — Signup profile data (Full Name, Country, Phone, optional
-- Business/Retreat/Practice Name).
--
-- Source-of-truth/necessity gate: confirmed by direct inspection before
-- writing this migration that no `profiles`/`accounts` table or any
-- other durable per-account storage exists anywhere in this repository
-- (18 prior migrations searched) - `auth.users` itself has no columns
-- for these fields, and nothing in `raw_user_meta_data` is treated as
-- durable storage today. `tenants.name` is Space-level content, a
-- different concern from an account's own profile.
--
-- Architecture: the standard, canonical Supabase pattern for "persist
-- signup-time profile fields even when email confirmation is still
-- pending" - a `SECURITY DEFINER` trigger on `auth.users` insert reads
-- the values the client already sent as `auth.signUp()`'s own
-- `options.data` (written to `raw_user_meta_data` as part of user
-- creation itself, regardless of confirmation status) and copies them
-- into this new durable table. This avoids the real problem with a
-- direct client-side insert: right after signUp() when confirmation is
-- required, there is no session/JWT yet, so no RLS-gated client insert
-- could succeed at all - the trigger runs at the database layer instead,
-- with no session required.
--
-- Columns are nullable (no NOT NULL) even though the signup form
-- requires them: legacy accounts created before this migration have no
-- row at all (not a row with blanks), and constraining new rows more
-- tightly than legacy compatibility allows is not worth it for data the
-- application layer already validates before submission.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  country text,
  phone text,
  business_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Read-only from the client on purpose (Task 015 has no "edit profile"
-- page) - the row is populated once, by the trigger below, at signup.
-- Never granted to anon; a signed-out visitor has no legitimate reason to
-- read any profile row, own or otherwise.
create policy "profiles: users can select their own row"
  on public.profiles for select
  using (auth.uid() = id);

revoke all on public.profiles from public, anon;
grant select on public.profiles to authenticated;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.profiles (id, full_name, country, phone, business_name)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'country',
    new.raw_user_meta_data ->> 'phone',
    nullif(new.raw_user_meta_data ->> 'business_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.handle_new_user_profile();
