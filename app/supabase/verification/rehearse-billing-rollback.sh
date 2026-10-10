#!/usr/bin/env bash
# TASK 032: rehearse the 0036-0046 billing rollbacks on THROWAWAY LOCAL
# databases, start to finish, and compare catalog fingerprints.
#
#   1. db PRE   = 0001..0035                 -> expected pre-TASK-032 fingerprint
#      db M42   = 0001..0042, db M43 = 0001..0043, db M44 = 0001..0044,
#      db M45   = 0001..0045 (intermediate references)
#   2. db FULL  = 0001..0046 + synthetic data -> expected post-0046 fingerprint
#   3. behaviour on FULL (inside transactions that are rolled back): the 0044
#      definer-RPC guards refuse a Studio-suspended paid Space with
#      BILLING_LOCKED and allow active paid, exempt and legacy Spaces; the
#      0045 media guard (Storage RLS as a real `authenticated` session, and the
#      published_spaces trigger) refuses member image/published writes and
#      foreign/audio image refs on a paid Space and leaves legacy/exempt alone;
#      the 0046 provenance rules (unverified length refused at publish and on
#      a bare trusted write, verified attach through the finalize RPC, members
#      can neither read nor forge provenance, the backfill recorder stamps only
#      matching rows - and only in the item's own folder - and never changes
#      a duration; a published sibling already in the upload folder is refused
#      by the finalize RPC; provenance is bound to its item at publish), the
#      exempt-Replace refusal (paid and legacy Replace unchanged), and the
#      invariant that a subscription row never becomes non-exempt on a Space
#      that already holds media.
#   4. guard checks on FULL: wrong token, paid flag ON, live subscription,
#      out-of-order (every rollback is tried once BEFORE its turn), and the
#      data-specific refusals (sending email, payment_confirmation outbox row,
#      open checkout). Each refusal must leave the fingerprint unchanged.
#   5. rollbacks 0046 -> 0036 in order with their tokens (0036 also with the
#      audit-drop token); after 0046 the catalog must equal M45, after 0045
#      M44, after 0044 M43, after 0043 M42, at the end it must equal PRE exactly.
#   6. variant on a clone of FULL: 0036 with the default (audit log KEPT) ->
#      the only difference from PRE must be the admin_audit_log objects.
#   7. re-apply 0036..0046 forward on the rolled-back db -> fingerprint must
#      equal FULL exactly.
#
# SAFETY. It only ever talks to a LOCAL Postgres:
#   - LOCAL_DB_URL must have a loopback host (127.0.0.1 / localhost / ::1); any
#     *.supabase.co / *.supabase.com / pooler host, or any other host, is refused;
#   - with no host psql, it runs psql inside the local Supabase db container
#     (DB_CONTAINER, default supabase_db_app) and checks that the container
#     publishes the LOCAL_DB_URL port, so the URL and the container agree;
#   - it creates and drops only databases named rbr_rh_* and never writes to
#     any other database (auth/storage scaffolding is READ from `postgres` with
#     pg_dump --schema-only);
#   - DATABASE_URL / SUPABASE_DB_URL pointing at a hosted project abort the run
#     (so a copy-pasted remote shell cannot be used by accident).
#
# Run from app/:
#   ./supabase/verification/rehearse-billing-rollback.sh
#   KEEP=1 OUT=/some/dir ./supabase/verification/rehearse-billing-rollback.sh
set -euo pipefail

C="${DB_CONTAINER:-supabase_db_app}"
LOCAL_DB_URL="${LOCAL_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
OUT="${OUT:-$(mktemp -d -t rbr_rh)}"
P="rbr_rh"
PRE="${P}_pre"; FULL="${P}_full"; RB="${P}_rb"; KEEPAUDIT="${P}_keepaudit"; M42="${P}_m42"; M43="${P}_m43"; M44="${P}_m44"; M45="${P}_m45"
MIG=supabase/migrations
VER=supabase/verification
FAILS=0

say()  { printf '\n== %s\n' "$1"; }
ok()   { printf '   PASS  %s\n' "$1"; }
bad()  { printf '   FAIL  %s\n' "$1"; FAILS=$((FAILS + 1)); }
die()  { printf 'ABORT: %s\n' "$1" >&2; exit 2; }

# --------------------------------------------------------------------------
# 0. Local-only guard
# --------------------------------------------------------------------------
[ -d "$MIG" ] && [ -d "$VER" ] || die "run from app/ (supabase/migrations not found)"
for v in "$LOCAL_DB_URL" "${DATABASE_URL:-}" "${SUPABASE_DB_URL:-}"; do
  case "$v" in *supabase.co*|*supabase.com*|*pooler.*) die "a hosted Supabase URL is set; this script is LOCAL ONLY" ;; esac
done
hostport="${LOCAL_DB_URL#*://}"; hostport="${hostport#*@}"; hostport="${hostport%%/*}"
host="${hostport%:*}"; port="${hostport##*:}"; [ "$port" = "$hostport" ] && port=5432
case "$host" in 127.0.0.1|localhost|"[::1]"|::1) ;; *) die "LOCAL_DB_URL host '$host' is not loopback" ;; esac

if command -v psql > /dev/null 2>&1; then
  MODE=host
  BASE="${LOCAL_DB_URL%/*}"
  run_psql() { local db=$1; shift; psql "$BASE/$db" -X -q -v ON_ERROR_STOP=1 "$@"; }
  run_dump() { pg_dump "$BASE/postgres" "$@"; }
else
  MODE=container
  docker port "$C" 5432 2> /dev/null | grep -qE "(0\.0\.0\.0|127\.0\.0\.1|\[::\]):$port\$" \
    || die "container $C does not publish local port $port (LOCAL_DB_URL); refusing"
  docker inspect -f '{{.Config.Image}}' "$C" | grep -q 'supabase/postgres' || die "$C is not a supabase/postgres container"
  run_psql() { local db=$1; shift; docker exec -i "$C" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d "$db" "$@"; }
  run_dump() { docker exec "$C" pg_dump -U postgres -d postgres "$@"; }
fi
q()  { run_psql "$1" -tA -c "$2"; }
mkdir -p "$OUT"
echo "mode=$MODE container=$C out=$OUT"

newdb() { case "$1" in ${P}_*) ;; *) die "refusing to touch database $1" ;; esac
  q postgres "drop database if exists $1;" > /dev/null; q postgres "create database $1 ${2:+template $2};" > /dev/null; }
dropdb_() { case "$1" in ${P}_*) q postgres "drop database if exists $1;" > /dev/null ;; esac; }

apply() { # db file...
  local db=$1; shift
  for f in "$@"; do run_psql "$db" -f - < "$f" > /dev/null 2>> "$OUT/apply.log" || { tail -5 "$OUT/apply.log"; die "apply failed: $f on $db"; }; done; }

# rollback db file token [extra-set-statement]; prints psql stderr; returns psql status
rollback() {
  local db=$1 file=$2 token=$3 extra=${4:-}
  run_psql "$db" -c "set idw.rollback_confirm = '$token'" ${extra:+-c "$extra"} -f - < "$file" 2>&1 > /dev/null
}

# Fingerprint: every catalog fact a rollback could get wrong, one line each, sorted.
FP_SQL=$(cat <<'SQL'
select line from (
  select 'fn|' || p.oid::regprocedure::text || '|' || md5(pg_get_functiondef(p.oid))
         || '|acl=' || coalesce(array_to_string(p.proacl, ','), '') as line
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind <> 'a'
  union all
  select 'tbl|' || c.relname || '|' || c.relkind::text || '|rls=' || c.relrowsecurity
         || '|acl=' || coalesce(array_to_string(c.relacl, ','), '')
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p', 'S')
  union all
  select 'col|' || c.relname || '.' || a.attname || '|' || format_type(a.atttypid, a.atttypmod)
         || '|nn=' || a.attnotnull || '|def=' || coalesce(md5(pg_get_expr(d.adbin, d.adrelid)), '')
    from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where n.nspname = 'public' and c.relkind in ('r', 'p', 'v') and a.attnum > 0 and not a.attisdropped
  union all
  select 'con|' || c.conrelid::regclass::text || '|' || c.conname || '|' || md5(pg_get_constraintdef(c.oid))
    from pg_constraint c join pg_namespace n on n.oid = c.connamespace where n.nspname = 'public'
  union all
  select 'idx|' || schemaname || '.' || indexname || '|' || md5(indexdef)
    from pg_indexes where schemaname in ('public', 'storage')
  union all
  select 'pol|' || schemaname || '.' || tablename || '|' || policyname || '|' || permissive || '|' || cmd
         || '|' || array_to_string(roles, ',') || '|' || md5(coalesce(qual, '')) || '|' || md5(coalesce(with_check, ''))
    from pg_policies where schemaname in ('public', 'storage')
  union all
  select 'trg|' || t.tgrelid::regclass::text || '|' || t.tgname || '|' || md5(pg_get_triggerdef(t.oid))
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
   where not t.tgisinternal and n.nspname in ('public', 'storage', 'auth')
) s order by 1;
SQL
)
fp() { q "$1" "$FP_SQL" > "$OUT/$2.fp"; printf '%s' "$(md5sum < "$OUT/$2.fp" 2>/dev/null || md5 -q "$OUT/$2.fp")" | cut -c1-32; }
same() { # label fileA fileB
  if diff -u "$OUT/$2.fp" "$OUT/$3.fp" > "$OUT/$2-vs-$3.diff"; then ok "$1 ($(wc -l < "$OUT/$2.fp" | tr -d ' ') catalog lines identical)";
  else bad "$1 - see $OUT/$2-vs-$3.diff"; head -40 "$OUT/$2-vs-$3.diff"; fi; }

expect_refusal() { # label db file token pattern [extra]
  local before after msg; before=$(fp "$2" _guard_before)
  if msg=$(rollback "$2" "$3" "$4" "${6:-}"); then bad "$1: rollback RAN (expected refusal)"; return; fi
  after=$(fp "$2" _guard_after)
  if printf '%s' "$msg" | grep -q "$5" && [ "$before" = "$after" ]; then ok "$1 -> $(printf '%s' "$msg" | grep -o 'ROLLBACK [0-9]* REFUSED[^"]*' | head -1 | cut -c1-110)";
  else bad "$1: unexpected result (fingerprint unchanged: $([ "$before" = "$after" ] && echo yes || echo NO)): $msg"; fi; }

expect_ok() { # label db file token [extra]
  local msg; if msg=$(rollback "$2" "$3" "$4" "${5:-}"); then ok "$1"; else bad "$1: $msg"; die "rollback failed; stopping"; fi
  if [ "$2" = "$RB" ]; then local n; n=$(basename "$3" | cut -c1-4); fp "$RB" "after_rb_$n" > /dev/null; fi; }

ls "$MIG" | grep -q '^004[7-9]' && echo "NOTE: a migration beyond 0046 is present in migrations/; this rehearsal deliberately covers 0001..0046 only."
M_PRE=$(ls "$MIG"/00*.sql | awk -F/ '{print $NF}' | awk '$0 < "0036"' | sed "s|^|$MIG/|")
M_032=$(ls "$MIG"/003[6-9]_*.sql "$MIG"/004[0-6]_*.sql)
M_032_TO45=$(ls "$MIG"/003[6-9]_*.sql "$MIG"/004[0-5]_*.sql)
M_032_TO44=$(ls "$MIG"/003[6-9]_*.sql "$MIG"/004[0-4]_*.sql)
M_032_TO42=$(ls "$MIG"/003[6-9]_*.sql "$MIG"/004[0-2]_*.sql)
M_032_TO43=$(ls "$MIG"/003[6-9]_*.sql "$MIG"/004[0-3]_*.sql)
RESTATED="'publish_space','handle_new_tenant','enforce_space_slot_capacity','restore_space','replace_space','set_guest_access_code','disable_guest_access_code','submit_featured_listing'"
RBF() { ls "$VER"/"$1"_*_rollback.sql; }

# --------------------------------------------------------------------------
# 1. Throwaway databases with Supabase-equivalent scaffolding
# --------------------------------------------------------------------------
say "1/8  scaffolding (auth/storage/extensions schema read from local 'postgres')"
run_dump --schema-only -n auth -n storage -n extensions > "$OUT/scaffold.sql"
prep() {
  newdb "$1"
  run_psql "$1" -v ON_ERROR_STOP=0 -f - < "$OUT/scaffold.sql" > /dev/null 2>&1 || true
  q "$1" "create schema if not exists extensions; create extension if not exists pgcrypto with schema extensions;
          alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
          alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
          alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;
          grant usage on schema public to anon, authenticated, service_role;" > /dev/null 2>&1
}

say "2/8  PRE = 0001..0035 ; M42 = 0001..0042 ; M43 = 0001..0043 ; M44 = 0001..0044 ; M45 = 0001..0045 ; FULL = 0001..0046"
prep "$PRE";  apply "$PRE"  $M_PRE
prep "$M42";  apply "$M42"  $M_PRE $M_032_TO42
prep "$M43";  apply "$M43"  $M_PRE $M_032_TO43
prep "$M44";  apply "$M44"  $M_PRE $M_032_TO44
prep "$M45";  apply "$M45"  $M_PRE $M_032_TO45
prep "$FULL"; apply "$FULL" $M_PRE $M_032
fp "$PRE" pre > /dev/null
fp "$M42" m42 > /dev/null
fp "$M43" m43 > /dev/null
fp "$M44" m44 > /dev/null
fp "$M45" m45 > /dev/null
q "$PRE" "select proname || ' ' || md5(pg_get_functiondef(oid)) from pg_proc where pronamespace = 'public'::regnamespace
          and proname in ($RESTATED) order by 1" \
  | tee "$OUT/pre_restated.txt"

# --------------------------------------------------------------------------
# 3. Synthetic billing data (no real people; RFC 2606 .invalid addresses)
# --------------------------------------------------------------------------
say "3/8  seed synthetic billing data in FULL"
q "$FULL" "
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rehearsal-owner@example.invalid', now(), now());
insert into public.user_space_slots (user_id, slots_allowed) values ('00000000-0000-4000-8000-0000000000a1', 5)
  on conflict (user_id) do update set slots_allowed = 5;
select set_config('request.jwt.claims', '{\"sub\":\"00000000-0000-4000-8000-0000000000a1\",\"role\":\"authenticated\"}', false);
insert into public.tenants (id, name, product_type) values
  ('00000000-0000-4000-8000-0000000000b1', 'Rehearsal exempt space', 'retreat'),
  ('00000000-0000-4000-8000-0000000000b2', 'Rehearsal paid space', 'teach');
insert into public.billing_customers (id, user_id, stripe_mode, stripe_customer_id)
  values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', 'test', 'cus_rehearsal1');
insert into public.space_subscriptions (id, tenant_id, billing_owner_user_id, status, exempt_reason, exempt_at)
  values ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', 'exempt', 'rehearsal', now());
insert into public.space_subscriptions (id, tenant_id, billing_owner_user_id, billing_customer_id, plan_id, stripe_mode, stripe_subscription_id, status, currency, base_amount_minor, canceled_at, ended_at)
  select '00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000a1',
         '00000000-0000-4000-8000-0000000000c1', id, 'test', 'sub_rehearsal2', 'canceled', currency, unit_amount_minor, now(), now()
    from public.billing_plans order by plan_key limit 1;
insert into public.coupons (id, code, normalized_code, discount_type, percent_off, usage_rule, duration_type)
  values ('00000000-0000-4000-8000-0000000000e1', 'REHEARSE10', 'REHEARSE10', 'percent', 10, 'once_per_user', 'once');
insert into public.pending_space_checkouts (id, user_id, space_type, plan_id, status, stripe_mode, expires_at, tenant_id)
  select '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1', 'teach', id, 'provisioned', 'test', now() - interval '1 day',
         '00000000-0000-4000-8000-0000000000b2' from public.billing_plans order by plan_key limit 1;
insert into public.coupon_redemptions (id, coupon_id, user_id, pending_checkout_id, tenant_id, space_subscription_id, status, usage_rule, discount_type, percent_off, duration_type, stripe_mode, reservation_expires_at, redeemed_at)
  values ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000f1',
          '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000d2', 'completed', 'once_per_user', 'percent', 10, 'once', 'test', now(), now());
insert into public.billing_events (stripe_event_id, stripe_mode, event_type, status) values ('evt_rehearsal1', 'test', 'customer.subscription.deleted', 'processed');
insert into public.billing_acceptances (user_id, pending_checkout_id, terms_version, privacy_version, billing_terms_version, immediate_service_consent, withdrawal_acknowledged, consent_text_id)
  values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000f1', 't1', 'p1', 'b1', true, true, 'consent-rehearsal');
insert into public.billing_email_outbox (dedupe_key, user_id, template, status) values ('rehearsal-sent-1', '00000000-0000-4000-8000-0000000000a1', 'subscription_ended', 'sent');
insert into public.admin_users (user_id, role) values ('00000000-0000-4000-8000-0000000000a1', 'owner');
insert into public.admin_audit_log (admin_user_id, action, target_type, target_id) values ('00000000-0000-4000-8000-0000000000a1', 'rehearsal.seed', 'coupon', 'REHEARSE10');
insert into public.billing_invoices (stripe_mode, stripe_invoice_id, space_subscription_id, tenant_id, user_id, status, currency, total_minor)
  values ('test', 'in_rehearsal1', '00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000a1', 'paid', 'EUR', 1000);
update public.space_subscriptions set next_payment_attempt_at = now() + interval '1 day' where id = '00000000-0000-4000-8000-0000000000d2';
update public.billing_email_outbox set claimed_at = now() where dedupe_key = 'rehearsal-sent-1';
" > /dev/null
LEGACY_SQL="select (select count(*) from public.tenants) || '/' || (select count(*) from public.tenant_members) || '/' || (select count(*) from public.user_space_slots)"
LEGACY_BEFORE=$(q "$FULL" "$LEGACY_SQL")
echo "   legacy rows tenants/tenant_members/user_space_slots = $LEGACY_BEFORE"
fp "$FULL" full > /dev/null

# --------------------------------------------------------------------------
# 3b. 0044 behaviour (one transaction, ROLLED BACK: FULL's data is unchanged)
# --------------------------------------------------------------------------
say "4/8  0044 definer-RPC guards: direct calls as the owner (transaction rolled back)"
BEHAVIOUR_DO=$(cat <<'SQL'
do $$
declare
  t record; v_hint text; outcome text;
begin
  for t in select * from tmp_cases loop
    begin
      execute t.stmt;
      outcome := 'allowed';
    exception when others then
      get stacked diagnostics v_hint = pg_exception_hint;
      outcome := coalesce(nullif(v_hint, ''), 'error: ' || sqlerrm);
    end;
    raise notice 'BEHAVIOUR|%|%|%', case when outcome = t.want then 'PASS' else 'FAIL' end, t.label, outcome;
  end loop;
end;
$$;
SQL
)
B1=00000000-0000-4000-8000-0000000000b1; B2=00000000-0000-4000-8000-0000000000b2; B3=00000000-0000-4000-8000-0000000000b3
calls() { # label-prefix tenant want
  printf "('%s: set_guest_access_code', 'select public.set_guest_access_code(''%s'', ''123456'')', '%s'),\n" "$1" "$2" "$3"
  printf "('%s: disable_guest_access_code', 'select public.disable_guest_access_code(''%s'')', '%s'),\n" "$1" "$2" "$3"
  printf "('%s: submit_featured_listing', 'select public.submit_featured_listing(''%s'', ''rehearsal'', null, null, null, ''[]''::jsonb)', '%s')" "$1" "$2" "$3"
}
BEHAVIOUR_OUT=$(run_psql "$FULL" -f - 2>&1 <<SQL || true
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
insert into public.tenants (id, name, product_type) values ('$B3', 'Rehearsal legacy space', 'retreat');
create temp table tmp_cases (label text, stmt text, want text) on commit drop;
grant select on tmp_cases to authenticated;
-- Phase 1: paid Space Studio-suspended (payment failed 200 h ago).
update public.space_subscriptions set status = 'past_due', payment_failed_at = now() - interval '200 hours' where id = '00000000-0000-4000-8000-0000000000d2';
insert into tmp_cases values $(calls "studio-suspended paid" "$B2" "BILLING_LOCKED");
set local role authenticated;
$BEHAVIOUR_DO
reset role;
truncate tmp_cases;
-- Phase 2: the same paid Space active; the exempt and the legacy Space.
update public.space_subscriptions set status = 'active', payment_failed_at = null where id = '00000000-0000-4000-8000-0000000000d2';
insert into tmp_cases values $(calls "active paid" "$B2" "allowed"),
  $(calls "exempt" "$B1" "allowed"),
  $(calls "legacy (no billing row)" "$B3" "allowed");
set local role authenticated;
$BEHAVIOUR_DO
rollback;
SQL
)
printf '%s\n' "$BEHAVIOUR_OUT" | grep -o 'BEHAVIOUR|.*' > "$OUT/behaviour_0044.txt" || true
NB=$(wc -l < "$OUT/behaviour_0044.txt" | tr -d ' ')
[ "$NB" = "12" ] || { bad "0044 behaviour: expected 12 results, got $NB"; printf '%s\n' "$BEHAVIOUR_OUT" | tail -20; }
while IFS='|' read -r _ verdict label outcome; do
  [ "$verdict" = "PASS" ] && ok "0044 $label -> $outcome" || bad "0044 $label -> $outcome"
done < "$OUT/behaviour_0044.txt"
fp "$FULL" full_after_behaviour > /dev/null
same "behaviour transaction left FULL's catalog unchanged" full full_after_behaviour
[ "$(q "$FULL" "select count(*) from public.tenants where id = '$B3'")" = "0" ] && ok "behaviour transaction rolled back (no legacy tenant left behind)" || bad "behaviour transaction left data behind"

# --------------------------------------------------------------------------
# 3c. 0045 behaviour (one transaction, ROLLED BACK): Storage RLS evaluated for a
#     real `authenticated` session on storage.objects, and the published_spaces
#     trigger, on a paid (active), an exempt and a legacy Space.
# --------------------------------------------------------------------------
say "4b/8 0045 media content guard: Storage RLS + published_spaces trigger as the owner (transaction rolled back)"
U1=00000000-0000-4000-8000-0000000000c9; U2=00000000-0000-4000-8000-0000000000ca; I1=00000000-0000-4000-8000-0000000000cb
B45_DO=$(cat <<'SQL'
do $$
declare
  t record; v_hint text; v_state text; n integer; outcome text;
begin
  for t in select * from tmp_cases order by ord loop
    begin
      execute t.stmt;
      get diagnostics n = row_count;
      outcome := case when n = 0 then 'noop' else 'allowed' end;
    exception when others then
      get stacked diagnostics v_hint = pg_exception_hint, v_state = returned_sqlstate;
      outcome := case when v_state = '42501' then 'denied' else coalesce(nullif(v_hint, ''), 'error: ' || sqlerrm) end;
    end;
    raise notice 'B45|%|%|%', case when outcome = t.want then 'PASS' else 'FAIL' end, t.label, outcome;
  end loop;
end;
$$;
SQL
)
obj() { printf "'insert into storage.objects (bucket_id, name) values (''tenant-media'', ''%s'')'" "$1"; }
snap() { # tenant modules-json
  printf "'insert into public.published_spaces (tenant_id, product_type, name, theme, timezone, enabled_modules, modules) values (''%s'', ''teach'', ''r'', ''{}''::jsonb, ''UTC'', ''{}'', ''%s''::jsonb) on conflict (tenant_id) do update set modules = excluded.modules'" "$1" "$2"; }
B45_OUT=$(run_psql "$FULL" -f - 2>&1 <<SQL || true
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
insert into public.tenants (id, name, product_type) values ('$B3', 'Rehearsal legacy space', 'retreat');
update public.space_subscriptions set status = 'active' where id = '00000000-0000-4000-8000-0000000000d2';
-- Objects already written by a trusted (non-member) writer.
insert into storage.objects (bucket_id, name) values
  ('tenant-media', '$B2/brand/hero/draft.webp'), ('tenant-media', '$B3/brand/hero/draft.webp');
create temp table tmp_cases (ord int, label text, stmt text, want text) on commit drop;
grant select on tmp_cases to authenticated;
insert into tmp_cases values
 (1,  'paid: member uploads an image object (draft.webp)', $(obj "$B2/brand/hero/$U1/draft.webp"), 'denied'),
 (2,  'paid: member uploads audio bytes named as an image', $(obj "$B2/teachAudioFile/$I1/$U1/draft.webp"), 'denied'),
 (3,  'paid: member uploads a versioned draft audio object', $(obj "$B2/teachAudioFile/$I1/$U1/draft.mp3"), 'allowed'),
 (4,  'paid: member pre-creates a published audio copy', $(obj "$B2/teachAudioFile/$I1/$U1/published.mp3"), 'denied'),
 (5,  'paid: member pre-creates a published image copy', $(obj "$B2/brand/hero/$U2/published.webp"), 'denied'),
 (6,  'paid: member uploads draft audio at an unversioned path', $(obj "$B2/teachAudioFile/$I1/draft.mp3"), 'denied'),
 (7,  'paid: member uploads SVG/HTML disguised under a media folder', $(obj "$B2/customPages/$I1/$U1/draft.svg"), 'denied'),
 (8,  'paid: member overwrites an existing object (update)', 'update storage.objects set metadata = ''{"x":1}''::jsonb where name = ''$B2/brand/hero/draft.webp''', 'noop'),
 (9,  'paid: member renames (moves) an object', 'update storage.objects set name = ''$B2/brand/hero/$U2/draft.webp'' where name = ''$B2/brand/hero/draft.webp''', 'noop'),
 (10, 'paid: member deletes an object (allowed)', 'delete from storage.objects where name = ''$B2/brand/hero/draft.webp''', 'allowed'),
 (11, 'legacy: member uploads an image object (unchanged)', $(obj "$B3/brand/hero/$U1/draft.webp"), 'allowed'),
 (12, 'legacy: member overwrites an unversioned object (unchanged)', 'update storage.objects set metadata = ''{"x":1}''::jsonb where name = ''$B3/brand/hero/draft.webp''', 'allowed'),
 (13, 'exempt: member uploads an image object (unchanged)', $(obj "$B1/brand/hero/$U1/draft.webp"), 'allowed'),
 (20, 'paid: snapshot imageRef naming an audio object', $(snap "$B2" "{\"brand\":{\"hero\":{\"imageRef\":\"$B2/teachAudioFile/$I1/$U1/published.mp3\"}}}"), 'MEDIA_REF_INVALID'),
 (21, 'paid: snapshot imageRef naming another tenant''s image', $(snap "$B2" "{\"brand\":{\"hero\":{\"imageRef\":\"$B1/brand/hero/$U1/published.webp\"}}}"), 'MEDIA_REF_INVALID'),
 (22, 'paid: snapshot imageRef with traversal', $(snap "$B2" "{\"x\":[{\"imageRef\":\"$B2/../brand/hero/published.webp\"}]}"), 'MEDIA_REF_INVALID'),
 (23, 'paid: snapshot imageRef that is not a string', $(snap "$B2" "{\"x\":{\"imageRef\":42}}"), 'MEDIA_REF_INVALID'),
 (24, 'paid: snapshot with an own published image (direct insert)', $(snap "$B2" "{\"brand\":{\"hero\":{\"imageRef\":\"$B2/brand/hero/$U1/published.webp\"}},\"y\":{\"imageRef\":null}}"), 'allowed'),
 (25, 'paid: direct snapshot update smuggling an uncounted audioRef', $(snap "$B2" "{\"x\":{\"audioRef\":\"$B2/teachAudioFile/$I1/$U1/published.mp3\"}}"), 'AUDIO_LIMIT'),
 (26, 'paid: publish_space() still succeeds', 'select public.publish_space(''$B2'')', 'allowed'),
 (27, 'legacy: snapshot imageRef naming an audio object (unchanged)', $(snap "$B3" "{\"x\":{\"imageRef\":\"$B3/audioFile/$I1/$U1/published.mp3\"}}"), 'allowed'),
 (28, 'exempt: snapshot imageRef naming an audio object (unchanged)', $(snap "$B1" "{\"x\":{\"imageRef\":\"$B1/audioFile/$I1/$U1/published.mp3\"}}"), 'allowed');
-- What storage-api sets for its own deletes (storage.protect_delete refuses direct SQL deletes otherwise).
set local storage.allow_delete_query = 'true';
set local role authenticated;
$B45_DO
rollback;
SQL
)
printf '%s\n' "$B45_OUT" | grep -o 'B45|.*' > "$OUT/behaviour_0045.txt" || true
NB=$(wc -l < "$OUT/behaviour_0045.txt" | tr -d ' ')
[ "$NB" = "22" ] || { bad "0045 behaviour: expected 22 results, got $NB"; printf '%s\n' "$B45_OUT" | tail -20; }
while IFS='|' read -r _ verdict label outcome; do
  [ "$verdict" = "PASS" ] && ok "0045 $label -> $outcome" || bad "0045 $label -> $outcome"
done < "$OUT/behaviour_0045.txt"
fp "$FULL" full_after_b45 > /dev/null
same "0045 behaviour transaction left FULL's catalog unchanged" full full_after_b45
[ "$(q "$FULL" "select count(*) from storage.objects where bucket_id = 'tenant-media'")" = "0" ] && ok "0045 behaviour transaction rolled back (no storage rows left behind)" || bad "0045 behaviour transaction left storage rows behind"

# --------------------------------------------------------------------------
# 3d. 0046 behaviour (one transaction, ROLLED BACK): audio provenance and the
#     exempt-Replace refusal. Rows "attached before 0046" (browser-reported
#     length, no provenance) are created with the 0043 trigger disabled INSIDE
#     the transaction - the state a pre-0046 paid Space is in.
# --------------------------------------------------------------------------
say "4c/8 0046 audio provenance + exempt Replace (transaction rolled back)"
IU=00000000-0000-4000-8000-0000000000cc; I2=00000000-0000-4000-8000-0000000000cd; IB=00000000-0000-4000-8000-0000000000ce; IE=00000000-0000-4000-8000-0000000000cf
REFU="$B2/teachAudioFile/$IU/$U1/draft.mp3"; REFB="$B2/teachAudioFile/$IB/$U1/draft.mp3"
REF2="$B2/teachAudioFile/$I2/$U1/draft.mp3"; REF3="$B2/teachAudioFile/$I2/$U2/draft.mp3"
IX=00000000-0000-4000-8000-0000000000dd; U3=00000000-0000-4000-8000-0000000000de
REF4="$B2/teachAudioFile/$I2/$U3/draft.mp3"; PUB4="$B2/teachAudioFile/$I2/$U3/published.mp3"
B46_DO=$(cat <<'SQL'
do $$
declare
  t record; v_hint text; v_state text; n integer; outcome text;
begin
  for t in select * from tmp_cases order by ord loop
    if t.as_role = 'authenticated' then set local role authenticated; end if;
    begin
      execute t.stmt;
      get diagnostics n = row_count;
      outcome := case when n = 0 then 'noop' else 'allowed' end;
    exception when others then
      get stacked diagnostics v_hint = pg_exception_hint, v_state = returned_sqlstate;
      outcome := case when v_state = '42501' then 'denied' else coalesce(nullif(v_hint, ''), 'error: ' || sqlerrm) end;
    end;
    reset role;
    raise notice 'B46|%|%|%', case when outcome = t.want then 'PASS' else 'FAIL' end, t.label, outcome;
  end loop;
end;
$$;
SQL
)
truthy() { printf "'select 1 / (case when %s then 1 else 0 end)'" "$1"; }
B46_OUT=$(run_psql "$FULL" -f - 2>&1 <<SQL || true
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
insert into public.tenants (id, name, product_type) values ('$B3', 'Rehearsal legacy space', 'retreat');
update public.space_subscriptions set status = 'active' where id = '00000000-0000-4000-8000-0000000000d2';
alter table public.module_items disable trigger billing_guard_module_item_audio;
insert into public.module_items (id, tenant_id, module_key, title, metadata) values
  ('$IU', '$B2', 'teachAudio', 'pre-0046 browser length', '{"audioRef":"$REFU","durationSeconds":30}'),
  ('$IB', '$B2', 'teachAudio', 'pre-0046 backfill candidate', '{"audioRef":"$REFB","durationSeconds":20}'),
  ('$IX', '$B2', 'teachAudio', 'borrows the ref of I2, in another item folder', '{"audioRef":"$REF2","durationSeconds":10}');
alter table public.module_items enable trigger billing_guard_module_item_audio;
insert into storage.objects (bucket_id, name) values ('tenant-media', '$B3/brand/hero/draft.webp');
insert into public.module_items (id, tenant_id, module_key, title, metadata) values ('$I2', '$B2', 'teachAudio', 'new upload', '{}');
create temp table tmp_cases (ord int, as_role text, label text, stmt text, want text) on commit drop;
grant select on tmp_cases to authenticated;
insert into tmp_cases values
 (1,  'postgres', 'paid: a bare trusted file write without provenance is refused', 'update public.module_items set metadata = ''{"audioRef":"$REF2","durationSeconds":10}''::jsonb where id = ''$I2''', 'AUDIO_UNVERIFIED'),
 (2,  'postgres', 'paid: the finalize RPC attaches a measured file (provenance + metadata)', 'select public.billing_audio_attach_verified(''$B2'', ''$I2'', ''{"audioRef":"$REF2","durationSeconds":10}''::jsonb, 4096, repeat(''a'', 64))', 'allowed'),
 (3,  'postgres', 'paid: the finalize RPC over the per-recording maximum is refused', 'select public.billing_audio_attach_verified(''$B2'', ''$I2'', ''{"audioRef":"$REF3","durationSeconds":3601}''::jsonb, 4096, repeat(''d'', 64))', 'AUDIO_LIMIT'),
 (4,  'postgres', 'paid: ...and its provenance row was rolled back with it', $(truthy "(select audio_ref || duration_seconds from public.billing_audio_verifications where item_id = ''$I2'') = ''${REF2}10''"), 'allowed'),
 (5,  'postgres', 'paid: the finalize RPC refuses a file outside the item folder', 'select public.billing_audio_attach_verified(''$B2'', ''$I2'', ''{"audioRef":"$REFU","durationSeconds":10}''::jsonb, 4096, repeat(''a'', 64))', 'AUDIO_UNVERIFIED'),
 (6,  'postgres', 'paid: plant a published object in a new upload folder of I2', 'insert into storage.objects (bucket_id, name) values (''tenant-media'', ''$PUB4'')', 'allowed'),
 (7,  'postgres', 'paid: the finalize RPC refuses when a published copy already exists in the upload folder', 'select public.billing_audio_attach_verified(''$B2'', ''$I2'', ''{"audioRef":"$REF4","durationSeconds":10}''::jsonb, 4096, repeat(''a'', 64))', 'AUDIO_REUPLOAD'),
 (8,  'postgres', 'paid: ...and the item keeps its previous verified file', $(truthy "(select metadata->>''audioRef'' from public.module_items where id = ''$I2'') = ''$REF2''"), 'allowed'),
 (9,  'authenticated', 'paid: a member cannot read provenance', 'select count(*) from public.billing_audio_verifications', 'denied'),
 (10, 'authenticated', 'paid: a member cannot forge provenance', 'insert into public.billing_audio_verifications (item_id, tenant_id, audio_ref, duration_seconds, size_bytes, sha256, source) values (''$IU'', ''$B2'', ''$REFU'', 30, 1, repeat(''e'', 64), ''server'')', 'denied'),
 (11, 'authenticated', 'paid: a member cannot change provenance', 'update public.billing_audio_verifications set duration_seconds = 1', 'denied'),
 (12, 'authenticated', 'paid: a member cannot call the finalize RPC', 'select public.billing_audio_attach_verified(''$B2'', ''$IU'', ''{"audioRef":"$REFU","durationSeconds":30}''::jsonb, 1, repeat(''e'', 64))', 'denied'),
 (13, 'authenticated', 'paid: a member cannot call the backfill recorder', 'select public.billing_audio_backfill_record(''rehearsal-run-1'', ''$B2'', ''$IU'', ''$REFU'', 30, 1, repeat(''e'', 64), ''ok'')', 'denied'),
 (14, 'authenticated', 'paid: publish with a browser-length (unverified) file is refused', 'select public.publish_space(''$B2'')', 'AUDIO_UNVERIFIED'),
 (15, 'authenticated', 'paid: a direct snapshot write while an unverified file is attached is refused', $(snap "$B2" "{\"x\":{\"audioRef\":\"$B2/teachAudioFile/$IU/$U1/published.mp3\"}}"), 'AUDIO_UNVERIFIED'),
 (16, 'postgres', 'backfill: a matching re-measurement stamps provenance', $(truthy "public.billing_audio_backfill_record(''rehearsal-run-1'', ''$B2'', ''$IB'', ''$REFB'', 20, 4096, repeat(''b'', 64), ''ok'') = ''stamped''"), 'allowed'),
 (17, 'postgres', 'backfill: a mismatch is flagged, nothing stamped, the stored length kept', $(truthy "public.billing_audio_backfill_record(''rehearsal-run-1'', ''$B2'', ''$IU'', ''$REFU'', 999, 4096, repeat(''c'', 64), ''mismatch'') = ''flagged'' and (select metadata->>''durationSeconds'' from public.module_items where id = ''$IU'') = ''30'' and not exists (select 1 from public.billing_audio_verifications where item_id = ''$IU'')"), 'allowed'),
 (18, 'postgres', 'backfill: an ok verdict that disagrees with the stored length is still flagged', $(truthy "public.billing_audio_backfill_record(''rehearsal-run-1'', ''$B2'', ''$IU'', ''$REFU'', 999, 4096, repeat(''c'', 64), ''ok'') = ''flagged''"), 'allowed'),
 (19, 'postgres', 'backfill: a stale read (ref changed since the script read it) is skipped', $(truthy "public.billing_audio_backfill_record(''rehearsal-run-1'', ''$B2'', ''$IU'', ''$REFB'', 30, 4096, repeat(''c'', 64), ''ok'') = ''skipped_changed''"), 'allowed'),
 (20, 'postgres', 'backfill: a ref outside the own folder of the item is flagged, never stamped', $(truthy "public.billing_audio_backfill_record(''rehearsal-run-1'', ''$B2'', ''$IX'', ''$REF2'', 10, 4096, repeat(''a'', 64), ''ok'') = ''flagged'' and not exists (select 1 from public.billing_audio_verifications where item_id = ''$IX'')"), 'allowed'),
 (21, 'postgres', 'backfill: every call left one audit row carrying the run id (5)', $(truthy "(select count(*) from public.billing_audio_backfill_findings where run_id = ''rehearsal-run-1'') = 5"), 'allowed'),
 (22, 'authenticated', 'paid: still refused while the mismatched file is attached', 'select public.publish_space(''$B2'')', 'AUDIO_UNVERIFIED'),
 (23, 'authenticated', 'paid: a member can detach the unverified file', 'update public.module_items set metadata = metadata || ''{"audioRef":null,"durationSeconds":null}''::jsonb where id = ''$IU''', 'allowed'),
 (24, 'authenticated', 'paid: a file borrowing the provenance of another item, same ref and length, is still unverified', 'select public.publish_space(''$B2'')', 'AUDIO_UNVERIFIED'),
 (25, 'authenticated', 'paid: a member can detach the borrowing file', 'update public.module_items set metadata = metadata || ''{"audioRef":null,"durationSeconds":null}''::jsonb where id = ''$IX''', 'allowed'),
 (26, 'authenticated', 'paid: publish with only server-verified files succeeds', 'select public.publish_space(''$B2'')', 'allowed'),
 (27, 'authenticated', 'exempt: replace is refused (EXEMPT_REPLACE_REQUIRES_ADMIN)', 'select public.replace_space(''$B1'', ''rehearsal replaced'')', 'EXEMPT_REPLACE_REQUIRES_ADMIN'),
 (28, 'postgres', 'exempt: nothing was reset by the refused replace', $(truthy "(select name from public.tenants where id = ''$B1'') = ''Rehearsal exempt space''"), 'allowed'),
 (29, 'authenticated', 'exempt: a member writes a 5 h file directly (unchanged)', 'insert into public.module_items (id, tenant_id, module_key, title, metadata) values (''$IE'', ''$B1'', ''audio'', ''exempt long'', ''{"audioRef":"$B1/audioFile/$IE/$U1/draft.mp3","durationSeconds":18000}''::jsonb)', 'allowed'),
 (30, 'authenticated', 'exempt: publish is unaffected (unchanged)', 'select public.publish_space(''$B1'')', 'allowed'),
 (31, 'postgres', 'invariant: an exempt Space holding media cannot be flipped to paid', 'update public.space_subscriptions set status = ''active'' where id = ''00000000-0000-4000-8000-0000000000d1''', 'BILLING_SPACE_HAS_MEDIA'),
 (32, 'postgres', 'invariant: a paid row cannot be inserted for an existing Space holding media', 'insert into public.space_subscriptions (tenant_id, billing_owner_user_id, billing_customer_id, plan_id, stripe_mode, stripe_subscription_id, status, currency, base_amount_minor) select ''$B3'', ''00000000-0000-4000-8000-0000000000a1'', ''00000000-0000-4000-8000-0000000000c1'', id, ''test'', ''sub_rehearsal3'', ''active'', currency, unit_amount_minor from public.billing_plans order by plan_key limit 1', 'BILLING_SPACE_HAS_MEDIA'),
 (33, 'authenticated', 'legacy: replace still works (unchanged)', 'select public.replace_space(''$B3'', ''rehearsal legacy replaced'')', 'allowed'),
 (34, 'authenticated', 'paid: replace still works (unchanged)', 'select public.replace_space(''$B2'', ''rehearsal paid replaced'')', 'allowed'),
 (35, 'postgres', 'paid: replace removed the Space provenance rows (FK cascade)', $(truthy "not exists (select 1 from public.billing_audio_verifications where tenant_id = ''$B2'')"), 'allowed'),
 (36, 'postgres', 'invariant: a status change between paid statuses is unaffected', 'update public.space_subscriptions set status = ''past_due'' where id = ''00000000-0000-4000-8000-0000000000d2''', 'allowed');
$B46_DO
rollback;
SQL
)
printf '%s\n' "$B46_OUT" | grep -o 'B46|.*' > "$OUT/behaviour_0046.txt" || true
NB=$(wc -l < "$OUT/behaviour_0046.txt" | tr -d ' ')
[ "$NB" = "36" ] || { bad "0046 behaviour: expected 36 results, got $NB"; printf '%s\n' "$B46_OUT" | tail -20; }
while IFS='|' read -r _ verdict label outcome; do
  [ "$verdict" = "PASS" ] && ok "0046 $label -> $outcome" || bad "0046 $label -> $outcome"
done < "$OUT/behaviour_0046.txt"
fp "$FULL" full_after_b46 > /dev/null
same "0046 behaviour transaction left FULL's catalog unchanged" full full_after_b46
[ "$(q "$FULL" "select count(*) from public.module_items where tenant_id = '$B2'")" = "0" ] && [ "$(q "$FULL" "select count(*) from public.billing_audio_backfill_findings")" = "0" ] \
  && ok "0046 behaviour transaction rolled back (no items or findings left behind)" || bad "0046 behaviour transaction left rows behind"

newdb "$RB" "$FULL"            # the db we roll back (FULL stays as the post-0046 reference)

# --------------------------------------------------------------------------
# 4. Guards refuse when prerequisites fail
# --------------------------------------------------------------------------
say "5/8  guard refusals (each must abort and leave the catalog unchanged)"
expect_refusal "0046 without token"      "$RB" "$(RBF 0046)" ""       "REFUSED: set idw.rollback_confirm"
expect_refusal "0046 with wrong token"   "$RB" "$(RBF 0046)" "0045"   "REFUSED: set idw.rollback_confirm"
q "$RB" "update public.billing_settings set paid_checkout_enabled = true" > /dev/null
expect_refusal "0046 with paid flag ON"  "$RB" "$(RBF 0046)" "0046"   "paid checkout is ON"
q "$RB" "update public.billing_settings set paid_checkout_enabled = false" > /dev/null
q "$RB" "update public.space_subscriptions set status = 'active' where id = '00000000-0000-4000-8000-0000000000d2'" > /dev/null
expect_refusal "0046 with live subscription" "$RB" "$(RBF 0046)" "0046" "live paid subscription"
q "$RB" "update public.space_subscriptions set status = 'canceled' where id = '00000000-0000-4000-8000-0000000000d2'" > /dev/null
expect_refusal "0045 before 0046 (out of order)" "$RB" "$(RBF 0045)" "0045" "0046 is still applied"
expect_refusal "0045 without token"      "$RB" "$(RBF 0045)" ""       "REFUSED: set idw.rollback_confirm"
expect_refusal "0045 with wrong token"   "$RB" "$(RBF 0045)" "0044"   "REFUSED: set idw.rollback_confirm"
expect_refusal "0044 before 0045 (out of order)" "$RB" "$(RBF 0044)" "0044" "0045 is still applied"
expect_refusal "0044 without token"      "$RB" "$(RBF 0044)" ""       "REFUSED: set idw.rollback_confirm"
expect_refusal "0044 with wrong token"   "$RB" "$(RBF 0044)" "0043"   "REFUSED: set idw.rollback_confirm"
expect_refusal "0043 before 0044 (out of order)" "$RB" "$(RBF 0043)" "0043" "0044 is still applied"
expect_refusal "0036 before everything"          "$RB" "$(RBF 0036)" "0036-exported" "still applied"

# --------------------------------------------------------------------------
# 5. Rollbacks in order; before each step, try the NEXT-EARLIER file (must refuse)
# --------------------------------------------------------------------------
say "6/8  rollbacks 0046 -> 0036"
expect_ok "0046 rollback" "$RB" "$(RBF 0046)" "0046"
same "after the 0046 rollback the catalog == M45 (0001..0045)" m45 after_rb_0046
# 0045's own data guards (checked after 0046 is gone: the 0046-applied refusal comes first).
q "$RB" "update public.billing_settings set paid_checkout_enabled = true" > /dev/null
expect_refusal "0045 with paid flag ON"  "$RB" "$(RBF 0045)" "0045"   "paid checkout is ON"
q "$RB" "update public.billing_settings set paid_checkout_enabled = false" > /dev/null
q "$RB" "update public.space_subscriptions set status = 'active' where id = '00000000-0000-4000-8000-0000000000d2'" > /dev/null
expect_refusal "0045 with live subscription" "$RB" "$(RBF 0045)" "0045" "live paid subscription"
q "$RB" "update public.space_subscriptions set status = 'canceled' where id = '00000000-0000-4000-8000-0000000000d2'" > /dev/null
expect_ok "0045 rollback" "$RB" "$(RBF 0045)" "0045"
same "after the 0045 rollback the catalog == M44 (0001..0044)" m44 after_rb_0045
# 0044's own data guards (checked after 0045 is gone: the 0045-applied refusal comes first).
q "$RB" "update public.billing_settings set paid_checkout_enabled = true" > /dev/null
expect_refusal "0044 with paid flag ON"  "$RB" "$(RBF 0044)" "0044"   "paid checkout is ON"
q "$RB" "update public.billing_settings set paid_checkout_enabled = false" > /dev/null
q "$RB" "update public.space_subscriptions set status = 'active' where id = '00000000-0000-4000-8000-0000000000d2'" > /dev/null
expect_refusal "0044 with live subscription" "$RB" "$(RBF 0044)" "0044" "live paid subscription"
q "$RB" "update public.space_subscriptions set status = 'canceled' where id = '00000000-0000-4000-8000-0000000000d2'" > /dev/null
expect_ok "0044 rollback" "$RB" "$(RBF 0044)" "0044"
same "after the 0044 rollback the catalog == M43 (0001..0043)" m43 after_rb_0044
expect_refusal "0042 before 0043 (out of order)" "$RB" "$(RBF 0042)" "0042" "0043 is still applied"
expect_ok "0043 rollback" "$RB" "$(RBF 0043)" "0043"
same "after the 0043 rollback the catalog == M42 (0001..0042)" m42 after_rb_0043
expect_refusal "0041 before 0042 (out of order)" "$RB" "$(RBF 0041)" "0041-exported" "0042 is still applied"
expect_ok "0042 rollback" "$RB" "$(RBF 0042)" "0042"
expect_refusal "0040 before 0041 (out of order)" "$RB" "$(RBF 0040)" "0040-exported" "0041 is still applied"
q "$RB" "update public.billing_email_outbox set status = 'sending' where dedupe_key = 'rehearsal-sent-1'" > /dev/null
expect_refusal "0041 while an email is 'sending'" "$RB" "$(RBF 0041)" "0041-exported" "being sent"
q "$RB" "update public.billing_email_outbox set status = 'sent' where dedupe_key = 'rehearsal-sent-1'" > /dev/null
expect_ok "0041 rollback" "$RB" "$(RBF 0041)" "0041-exported"
expect_refusal "0039 before 0040 (out of order)" "$RB" "$(RBF 0039)" "0039" "0040 is still applied"
q "$RB" "insert into public.billing_email_outbox (dedupe_key, template) values ('rehearsal-pc-1', 'payment_confirmation')" > /dev/null
expect_refusal "0040 with a payment_confirmation outbox row" "$RB" "$(RBF 0040)" "0040-exported" "payment_confirmation"
q "$RB" "delete from public.billing_email_outbox where dedupe_key = 'rehearsal-pc-1'" > /dev/null
expect_ok "0040 rollback" "$RB" "$(RBF 0040)" "0040-exported"
expect_refusal "0038 before 0039 (out of order)" "$RB" "$(RBF 0038)" "0038" "run the 0039 rollback first"
expect_ok "0039 rollback" "$RB" "$(RBF 0039)" "0039"
expect_refusal "0037 before 0038 (out of order)" "$RB" "$(RBF 0037)" "0037" "0038 is still applied"
q "$RB" "update public.pending_space_checkouts set status = 'awaiting_payment' where id = '00000000-0000-4000-8000-0000000000f1'" > /dev/null
expect_refusal "0038 with an open (awaiting_payment) checkout" "$RB" "$(RBF 0038)" "0038" "checkout"
q "$RB" "update public.pending_space_checkouts set status = 'payment_confirmed' where id = '00000000-0000-4000-8000-0000000000f1'" > /dev/null
expect_refusal "0038 with a paid, unprovisioned checkout" "$RB" "$(RBF 0038)" "0038" "checkout"
q "$RB" "update public.pending_space_checkouts set status = 'provisioned' where id = '00000000-0000-4000-8000-0000000000f1'" > /dev/null
expect_ok "0038 rollback" "$RB" "$(RBF 0038)" "0038"
expect_refusal "0036 before 0037 (out of order)" "$RB" "$(RBF 0036)" "0036-exported" "0037 is still applied"
expect_ok "0037 rollback" "$RB" "$(RBF 0037)" "0037"
newdb "$KEEPAUDIT" "$RB"       # clone at "only 0036 left" for the audit-kept variant
q "$RB" "update public.pending_space_checkouts set status = 'payment_confirmed' where id = '00000000-0000-4000-8000-0000000000f1'" > /dev/null
expect_refusal "0036 with a mid-payment checkout" "$RB" "$(RBF 0036)" "0036-exported" "open or mid-payment checkout"
q "$RB" "update public.pending_space_checkouts set status = 'provisioned' where id = '00000000-0000-4000-8000-0000000000f1'" > /dev/null
expect_ok "0036 rollback (audit log dropped, separately confirmed)" "$RB" "$(RBF 0036)" "0036-exported" "set idw.rollback_drop_audit = '0036-audit-exported'"

LEGACY_AFTER=$(q "$RB" "$LEGACY_SQL")
[ "$LEGACY_BEFORE" = "$LEGACY_AFTER" ] && ok "legacy rows unchanged ($LEGACY_AFTER)" || bad "legacy rows changed: $LEGACY_BEFORE -> $LEGACY_AFTER"
fp "$RB" rolledback > /dev/null
q "$RB" "select proname || ' ' || md5(pg_get_functiondef(oid)) from pg_proc where pronamespace = 'public'::regnamespace
         and proname in ($RESTATED) order by 1" \
  > "$OUT/rolledback_restated.txt"

say "7/8  compare"
same "rolled-back catalog == PRE (0001..0035)" pre rolledback
for kv in "publish_space 5088d120877f74c02f845df398206c14" "handle_new_tenant e3526abc627aa30a11616295c39cebef" \
          "enforce_space_slot_capacity 708dde46d74624be4cb93b48d4972991" "restore_space 9a31bcf90162a2ce7001078d1fdbcfa0" \
          "replace_space 3a2af65a96d60ac2dfc90ee6f73d5236" "set_guest_access_code d5d835ac1a663482387a3d07a7006f59" \
          "disable_guest_access_code c5e6be2b4739200c2d6b4b29afe353b0" "submit_featured_listing 4c81a4b7e8fd63e63305c50b50554599"; do
  grep -qx "$kv" "$OUT/rolledback_restated.txt" && ok "recorded baseline md5 $kv" || bad "recorded baseline md5 mismatch: want $kv, got $(grep "^${kv%% *} " "$OUT/rolledback_restated.txt")"
done
expect_ok "0036 rollback, default (audit log KEPT) on a clone" "$KEEPAUDIT" "$(RBF 0036)" "0036-exported"
fp "$KEEPAUDIT" keepaudit > /dev/null
EXTRA=$(diff "$OUT/pre.fp" "$OUT/keepaudit.fp" | grep '^[<>]' || true)
if [ -n "$EXTRA" ] && ! printf '%s\n' "$EXTRA" | grep -v '^> ' > /dev/null && ! printf '%s\n' "$EXTRA" | grep -vq 'admin_audit_log'; then
  ok "audit-kept variant differs from PRE only by $(printf '%s\n' "$EXTRA" | wc -l | tr -d ' ') admin_audit_log lines"
else bad "audit-kept variant: unexpected difference"; printf '%s\n' "$EXTRA" | head -20; fi

# --------------------------------------------------------------------------
# 7. Restore forward
# --------------------------------------------------------------------------
say "8/8  re-apply 0036..0046 on the rolled-back db"
apply "$RB" $M_032
fp "$RB" reapplied > /dev/null
same "re-applied catalog == FULL (0001..0046)" full reapplied

if [ "${KEEP:-0}" = "1" ]; then say "kept databases: $PRE $M42 $M43 $M44 $M45 $FULL $RB $KEEPAUDIT"
else for d in "$PRE" "$M42" "$M43" "$M44" "$M45" "$FULL" "$RB" "$KEEPAUDIT"; do dropdb_ "$d"; done; say "throwaway databases dropped"; fi
# "Comparable" = without storage-api-managed storage indexes/triggers, which differ between
# hosted and local; this is the form to compare with a hosted environment.
say "expected comparable fingerprints (md5 of sorted lines) per state"
for f in pre m42 m43 m44 m45 full after_rb_0046 after_rb_0045 after_rb_0044 after_rb_0043 after_rb_0042 after_rb_0041 after_rb_0040 after_rb_0039 after_rb_0038 after_rb_0037 after_rb_0036 reapplied keepaudit; do
  [ -f "$OUT/$f.fp" ] || continue
  grep -vE '^(idx|trg)\|storage\.' "$OUT/$f.fp" > "$OUT/$f.comparable.fp"
  printf '   %-16s %s  %s lines\n' "$f" "$( (md5sum < "$OUT/$f.comparable.fp" 2>/dev/null || md5 -q "$OUT/$f.comparable.fp") | cut -c1-32)" "$(wc -l < "$OUT/$f.comparable.fp" | tr -d ' ')"
done
echo "fingerprints and diffs: $OUT"
[ "$FAILS" -eq 0 ] && { echo "RESULT: ALL CHECKS PASSED"; exit 0; } || { echo "RESULT: $FAILS CHECK(S) FAILED"; exit 1; }
