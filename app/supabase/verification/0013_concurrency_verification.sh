#!/usr/bin/env bash
# Concurrency verification for redeem_access_code() (Time to Flow
# Commercial Access Phase 1, migration 0013). NOT run automatically -
# review this script, then run it by hand AFTER 0013 is applied and
# approved. Requires: bash, curl, jq. Reads SUPABASE_URL /
# NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / SUPABASE_SECRET_KEY from
# app/.env.local (never printed).
#
# Every tenant/user/code this script creates is disposable and prefixed
# "0013-concurrency-test-" - cleanup() runs on exit (success OR failure,
# via trap) and re-sweeps to confirm zero residue, matching this
# session's established pattern for every live check so far.
#
# Proves two things a single SQL session cannot (see part D of
# 0013_code_normalization_verification.sql, which only proves the lock
# is PRESENT in the function - this proves it actually WORKS):
#
#   SCENARIO 1 - two DIFFERENT valid codes redeemed concurrently for the
#   SAME tenant (the exact race this fix closes). Expected: exactly one
#   redemption succeeds; exactly one access_code_redemptions row exists;
#   only the winning code's redemption_count increments; the losing
#   code's redemption_count is unchanged; exactly one space_entitlements
#   row exists; the loser's response is "This Space already has valid
#   access" (blocked by the no-stacking guard, not a code-validity error -
#   proves it lost the tenant lock race, not that its own code was bad).
#
#   SCENARIO 2 - multiple DIFFERENT tenants racing for the FINAL
#   redemption slot of ONE code (the pre-existing capacity-safety
#   property from adjustment #5, preserved here explicitly per this
#   review). Expected: exactly one redemption succeeds; the code's
#   redemption_count lands at exactly max_redemptions, never exceeding
#   it; the loser's response is "That code is not valid" (capacity
#   exhausted - a different error than Scenario 1's, because the loser
#   here has no conflicting entitlement of its own, it simply lost the
#   race for the code's last slot).

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.local"

SUPABASE_URL=$(grep -E "^NEXT_PUBLIC_SUPABASE_URL=" "$ENV_FILE" | cut -d= -f2-)
PUBLISHABLE_KEY=$(grep -E "^NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=" "$ENV_FILE" | cut -d= -f2-)
SERVICE_KEY=$(grep -E "^SUPABASE_SECRET_KEY=" "$ENV_FILE" | cut -d= -f2-)

TAG="0013-concurrency-test-$(date +%s)"
# macOS ships bash 3.2 (no ${VAR^^} support) - derive uppercase via tr instead.
TAG_UPPER=$(echo "$TAG" | tr '[:lower:]' '[:upper:]')
PASSWORD="Test-$(date +%s)-Aa1!"

# cleanup() sweeps by TAG prefix at the end (tenants/codes via a `like`
# filter, users via their deterministic email pattern) rather than
# tracking created ids in arrays: every helper below is invoked as
# `X=$(fn ...)`, which runs the function in a SUBSHELL - any array
# append a helper made to a "global" tracking array would be invisible
# to the parent shell once the subshell exits. Confirmed live: an
# earlier version of this script tracked ids in arrays exactly that way
# and cleanup() silently found them all empty, leaving 5 disposable
# tenants + 3 disposable codes + 5 disposable auth users behind in
# Production until a manual sweep caught it. TAG-prefix sweeping has no
# such gap - it doesn't depend on any in-process bookkeeping surviving
# subshells.

admin() { # method path [json_body]
  curl -sS -X "$1" "$SUPABASE_URL$2" \
    -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
    -H "Content-Type: application/json" ${3:+-d "$3"}
}

rest() { # method path json_body [extra_header]
  curl -sS -X "$1" "$SUPABASE_URL/rest/v1$2" \
    -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
    -H "Content-Type: application/json" -H "Prefer: return=representation" \
    ${4:+-H "$4"} ${3:+-d "$3"}
}

create_disposable_user() { # email -> prints user_id
  local email="$1"
  local resp
  resp=$(admin POST "/auth/v1/admin/users" "{\"email\":\"$email\",\"password\":\"$PASSWORD\",\"email_confirm\":true}")
  echo "$resp" | jq -r '.id'
}

get_user_token() { # email -> prints access_token
  curl -sS -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
    -H "apikey: $PUBLISHABLE_KEY" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"$PASSWORD\"}" | jq -r '.access_token'
}

create_disposable_tenant() { # name owner_user_token -> prints tenant_id
  # Created via the OWNER'S OWN token, not the service role. tenants has an
  # AFTER INSERT trigger (handle_new_tenant(), migration 0001) that inserts
  # the owner's tenant_members row using auth.uid() - under the service
  # role, auth.uid() is NULL, which would violate tenant_members.user_id
  # NOT NULL and abort the whole insert. Using the real user's token makes
  # auth.uid() resolve correctly and lets the trigger do its job, exactly
  # like the real app's tenant-creation path.
  local tenant_id
  tenant_id=$(curl -sS -X POST "$SUPABASE_URL/rest/v1/tenants" \
    -H "apikey: $PUBLISHABLE_KEY" -H "Authorization: Bearer $2" \
    -H "Content-Type: application/json" -H "Prefer: return=representation" \
    -d "{\"name\":\"$1\",\"product_type\":\"retreat\"}" | jq -r '.[0].id')
  echo "$tenant_id"
}

create_disposable_code() { # code duration_days max_redemptions -> prints code_id
  rest POST "/access_codes" "{\"code\":\"$1\",\"duration_days\":$2,\"max_redemptions\":$3}" | jq -r '.[0].id'
}

redeem() { # user_token tenant_id code out_file (runs in background by caller)
  curl -sS -X POST "$SUPABASE_URL/rest/v1/rpc/redeem_access_code" \
    -H "apikey: $PUBLISHABLE_KEY" -H "Authorization: Bearer $1" \
    -H "Content-Type: application/json" \
    -d "{\"p_tenant_id\":\"$2\",\"p_code\":\"$3\"}" > "$4"
}

cleanup() {
  echo "--- cleanup ---"
  local id
  for id in $(rest GET "/tenants?name=like.$TAG*&select=id" "" | jq -r '.[].id'); do
    rest DELETE "/access_code_redemptions?tenant_id=eq.$id" "" > /dev/null || true
    rest DELETE "/space_entitlements?tenant_id=eq.$id" "" > /dev/null || true
    rest DELETE "/tenant_members?tenant_id=eq.$id" "" > /dev/null || true
    rest DELETE "/tenants?id=eq.$id" "" > /dev/null || true
  done
  for id in $(rest GET "/access_codes?code=like.$TAG_UPPER*&select=id" "" | jq -r '.[].id'); do
    rest DELETE "/access_codes?id=eq.$id" "" > /dev/null || true
  done
  # Every disposable user's email is deterministic (built from $TAG), so
  # rather than needing a wildcard search against the admin API, just
  # try deleting each exact address this run could have created.
  local email uid
  for email in "$TAG-u1@example.com" "$TAG-filler1@example.com" "$TAG-filler2@example.com" "$TAG-race1@example.com" "$TAG-race2@example.com"; do
    uid=$(admin GET "/auth/v1/admin/users?email=$email" | jq -r '.users[0].id // empty')
    [ -n "$uid" ] && admin DELETE "/auth/v1/admin/users/$uid" > /dev/null || true
  done

  # Re-sweep: confirm zero residue tagged with this run.
  local leftover_tenants leftover_codes
  leftover_tenants=$(rest GET "/tenants?name=like.$TAG*&select=id" "" | jq 'length')
  leftover_codes=$(rest GET "/access_codes?code=like.$TAG_UPPER*&select=id" "" | jq 'length')
  if [ "$leftover_tenants" != "0" ] || [ "$leftover_codes" != "0" ]; then
    echo "WARNING: residue left behind - tenants=$leftover_tenants codes=$leftover_codes (tag: $TAG)"
  else
    echo "Cleanup confirmed: zero residue for $TAG"
  fi
}
trap cleanup EXIT

echo "=== SCENARIO 1: two different codes racing for the same tenant ==="

U1_EMAIL="$TAG-u1@example.com"
U1_ID=$(create_disposable_user "$U1_EMAIL")
U1_TOKEN=$(get_user_token "$U1_EMAIL")
T1_ID=$(create_disposable_tenant "$TAG-t1" "$U1_TOKEN")

CODE30_ID=$(create_disposable_code "$TAG_UPPER-CODE30" 30 5)
CODE60_ID=$(create_disposable_code "$TAG_UPPER-CODE60" 60 5)

OUT_A=$(mktemp) OUT_B=$(mktemp)
redeem "$U1_TOKEN" "$T1_ID" "$TAG_UPPER-CODE30" "$OUT_A" &
redeem "$U1_TOKEN" "$T1_ID" "$TAG_UPPER-CODE60" "$OUT_B" &
wait

echo "Response A (CODE30): $(cat "$OUT_A")"
echo "Response B (CODE60): $(cat "$OUT_B")"

CODE30_COUNT=$(rest GET "/access_codes?id=eq.$CODE30_ID&select=redemption_count" "" | jq '.[0].redemption_count')
CODE60_COUNT=$(rest GET "/access_codes?id=eq.$CODE60_ID&select=redemption_count" "" | jq '.[0].redemption_count')
REDEMPTION_ROWS=$(rest GET "/access_code_redemptions?tenant_id=eq.$T1_ID&select=id" "" | jq 'length')
ENTITLEMENT_ROWS=$(rest GET "/space_entitlements?tenant_id=eq.$T1_ID&select=tenant_id" "" | jq 'length')

echo "CODE30 redemption_count=$CODE30_COUNT  CODE60 redemption_count=$CODE60_COUNT"
echo "access_code_redemptions rows for T1=$REDEMPTION_ROWS  space_entitlements rows for T1=$ENTITLEMENT_ROWS"

WINNERS=$(( (CODE30_COUNT == 1 ? 1 : 0) + (CODE60_COUNT == 1 ? 1 : 0) ))
if [ "$WINNERS" != "1" ] || [ "$REDEMPTION_ROWS" != "1" ] || [ "$ENTITLEMENT_ROWS" != "1" ]; then
  echo "SCENARIO 1: FAIL - expected exactly one winner, one redemption row, one entitlement row"
else
  echo "SCENARIO 1: PASS - exactly one code won, no stacking occurred"
fi

echo ""
echo "=== SCENARIO 2: multiple tenants racing for the final slot of one code ==="

CODE_LAST_ID=$(create_disposable_code "$TAG_UPPER-LASTSLOT" 30 3)

# Consume 2 of 3 slots sequentially with filler tenants, leaving exactly 1.
for n in 1 2; do
  FE="$TAG-filler$n@example.com"
  FID=$(create_disposable_user "$FE")
  FTOKEN=$(get_user_token "$FE")
  FTENANT=$(create_disposable_tenant "$TAG-filler$n" "$FTOKEN")
  curl -sS -X POST "$SUPABASE_URL/rest/v1/rpc/redeem_access_code" \
    -H "apikey: $PUBLISHABLE_KEY" -H "Authorization: Bearer $FTOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"p_tenant_id\":\"$FTENANT\",\"p_code\":\"$TAG_UPPER-LASTSLOT\"}" > /dev/null
done

R1_EMAIL="$TAG-race1@example.com"
R1_ID=$(create_disposable_user "$R1_EMAIL")
R1_TOKEN=$(get_user_token "$R1_EMAIL")
R1_TENANT=$(create_disposable_tenant "$TAG-race1" "$R1_TOKEN")

R2_EMAIL="$TAG-race2@example.com"
R2_ID=$(create_disposable_user "$R2_EMAIL")
R2_TOKEN=$(get_user_token "$R2_EMAIL")
R2_TENANT=$(create_disposable_tenant "$TAG-race2" "$R2_TOKEN")

OUT_R1=$(mktemp) OUT_R2=$(mktemp)
redeem "$R1_TOKEN" "$R1_TENANT" "$TAG_UPPER-LASTSLOT" "$OUT_R1" &
redeem "$R2_TOKEN" "$R2_TENANT" "$TAG_UPPER-LASTSLOT" "$OUT_R2" &
wait

echo "Response race1: $(cat "$OUT_R1")"
echo "Response race2: $(cat "$OUT_R2")"

FINAL_COUNT=$(rest GET "/access_codes?id=eq.$CODE_LAST_ID&select=redemption_count" "" | jq '.[0].redemption_count')
R1_HAS_ENTITLEMENT=$(rest GET "/space_entitlements?tenant_id=eq.$R1_TENANT&select=tenant_id" "" | jq 'length')
R2_HAS_ENTITLEMENT=$(rest GET "/space_entitlements?tenant_id=eq.$R2_TENANT&select=tenant_id" "" | jq 'length')

echo "Final redemption_count=$FINAL_COUNT (max_redemptions=3)  race1_has_entitlement=$R1_HAS_ENTITLEMENT  race2_has_entitlement=$R2_HAS_ENTITLEMENT"

RACE_WINNERS=$((R1_HAS_ENTITLEMENT + R2_HAS_ENTITLEMENT))
if [ "$FINAL_COUNT" != "3" ] || [ "$RACE_WINNERS" != "1" ]; then
  echo "SCENARIO 2: FAIL - expected redemption_count to land at exactly max_redemptions (3) with exactly one racer winning"
else
  echo "SCENARIO 2: PASS - capacity never exceeded, exactly one racer won the final slot"
fi
