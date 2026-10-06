#!/usr/bin/env bash
# TASK 029: rehearse 0033 on a THROWAWAY local database, start to finish.
# This is the script that produced the evidence in the 0033 review report;
# it exists so the result can be reproduced rather than taken on trust.
#
# It NEVER touches Staging, Production, or an existing local database: it
# creates a database of its own inside whatever local Postgres container
# you point it at, and drops it again at the end unless KEEP=1.
#
# Requires: a running local Supabase Postgres container (the auth/storage
# schemas are cloned from its `postgres` database, which is only READ).
#
#   DB_CONTAINER=supabase_db_app ./supabase/verification/0033_local_rehearsal.sh
#
# Run from app/.
set -euo pipefail

C="${DB_CONTAINER:-supabase_db_app}"
DB="${REHEARSAL_DB:-rbr0033}"
say() { printf '\n== %s\n' "$1"; }

say "0/6  throwaway database $DB in container $C"
docker exec "$C" psql -U postgres -d postgres -q \
  -c "drop database if exists $DB;" -c "create database $DB;"

say "1/6  clone the auth / storage / extensions scaffolding (read-only on postgres)"
docker exec "$C" bash -lc "pg_dump -U postgres -d postgres --schema-only -n auth -n storage -n extensions > /tmp/scaffold.sql"
docker exec "$C" psql -U postgres -d "$DB" -q -f /tmp/scaffold.sql > /dev/null 2>&1 || true
docker exec "$C" psql -U postgres -d "$DB" -q \
  -c "create schema if not exists extensions; create extension if not exists pgcrypto with schema extensions;" > /dev/null

say "2/6  apply every migration, 0001 to head"
docker exec "$C" mkdir -p /tmp/m0033
for f in supabase/migrations/0*.sql; do docker cp "$f" "$C:/tmp/m0033/" > /dev/null; done
docker exec "$C" bash -lc 'cd /tmp/m0033 && for f in 0*.sql; do psql -U postgres -d '"$DB"' -q -v ON_ERROR_STOP=1 -f "$f" > /dev/null; done'

say "3/6  Supabase-equivalent table grants, so RLS is what gates access"
docker exec "$C" psql -U postgres -d "$DB" -q -c "
  grant usage on schema public to anon, authenticated, service_role;
  grant all on all tables in schema public to anon, authenticated, service_role;
  grant all on all sequences in schema public to anon, authenticated, service_role;
  grant all on all functions in schema public to anon, authenticated, service_role;"

say "4/6  publish-shape verification (self-contained, rolls back)"
docker cp supabase/verification/0033_flow_content_expansion_verification.sql "$C:/tmp/v.sql" > /dev/null
docker exec "$C" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -f /tmp/v.sql

say "5/6  snapshot equivalence against 0032 (needs the function swap)"
docker cp supabase/migrations/0032_brand_surface.sql "$C:/tmp/0032.sql" > /dev/null
docker cp supabase/migrations/0033_flow_content_expansion.sql "$C:/tmp/0033.sql" > /dev/null
docker cp supabase/verification/0033_flow_content_expansion_equivalence.sql "$C:/tmp/eq.sql" > /dev/null
docker exec "$C" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -f /tmp/eq.sql

say "6/6  the ADD COLUMN does not rewrite the table"
docker exec "$C" psql -U postgres -d "$DB" -q -c "
  create table public._rw_probe (id int, filler text);
  insert into public._rw_probe select g, repeat('x', 100) from generate_series(1, 20000) g;"
BEFORE=$(docker exec "$C" psql -U postgres -d "$DB" -t -A -c "select relfilenode from pg_class where oid='public._rw_probe'::regclass;")
docker exec "$C" psql -U postgres -d "$DB" -c "\timing on" -c \
  "alter table public._rw_probe add column if not exists metadata jsonb not null default '{}'::jsonb;"
AFTER=$(docker exec "$C" psql -U postgres -d "$DB" -t -A -c "select relfilenode from pg_class where oid='public._rw_probe'::regclass;")
if [ "$BEFORE" = "$AFTER" ]; then
  echo "   relfilenode unchanged ($BEFORE): catalog-only, no table rewrite"
else
  echo "   REWRITE DETECTED ($BEFORE -> $AFTER) - investigate before applying"; exit 1
fi

if [ "${KEEP:-0}" = "1" ]; then
  say "done - $DB kept for inspection"
else
  docker exec "$C" psql -U postgres -d postgres -q -c "drop database if exists $DB;"
  say "done - $DB dropped"
fi
