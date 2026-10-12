#!/usr/bin/env bash
# TASK 032.5 controlled POC - provision + deploy against the OWNER-CREATED resources only (Option 1, 2026-10-12):
#   Worker innerdwes-media-poc, R2 bucket innerdwes-media-poc  (never created, renamed or deleted by this script)
#
#   scripts/provision.sh verify      READ-ONLY: config guard + Cloudflare API checks. Changes nothing.
#   scripts/provision.sh provision   creates ONLY the missing KV namespace innerdwes-media-poc-epochs and Queue
#                                    innerdwes-media-poc-listen, writes the KV id into wrangler.toml, generates POC
#                                    keys locally (0600). Does NOT deploy.
#   scripts/provision.sh deploy      deploys src/ to innerdwes-media-poc (workers.dev), uploads the two secrets, then
#                                    re-verifies that the Worker's bindings match EXACTLY. Owner approval required.
# Analytics Engine datasets need no provisioning: they are created on first write.
#
# Credentials: OWNER-CREATED ~/.config/innerdwes/cf-staging.env (chmod 600), never printed:
#   CLOUDFLARE_ACCOUNT_ID=...   CLOUDFLARE_API_TOKEN=...
# Token: account-scoped, ONLY Workers Scripts:Edit, Workers R2 Storage:Edit, Workers KV Storage:Edit, Queues:Edit
# (+ optional Account Settings:Read for the account-name check). No zone/DNS permissions.
set -euo pipefail
cd "$(dirname "$0")/.."
PHASE="${1:-}"; shift || true
for a in "$@"; do case "$a" in --env*|-e|--name*) echo "REFUSING: --env/--name not allowed"; exit 2;; esac; done
case "$PHASE" in verify|provision|deploy) ;; *) echo "usage: $0 verify|provision|deploy"; exit 2;; esac
ENV_FILE="${CF_ENV_FILE:-$HOME/.config/innerdwes/cf-staging.env}"
KEYS_FILE="$HOME/.config/innerdwes/poc-keys.json"
W="npx --no-install wrangler"
[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE (owner creates it)"; exit 1; }
set -a; . "$ENV_FILE"; set +a
unset CLOUDFLARE_ENV WRANGLER_ENV || true      # never let an ambient env var redirect the target
export WRANGLER_SEND_METRICS=false

echo "== guard (pre)"; node scripts/guard.mjs remote
[ "$PHASE" = verify ] && exit 0

if [ "$PHASE" = provision ]; then
  echo "== KV innerdwes-media-poc-epochs"
  kv_id() { $W kv namespace list 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const n=JSON.parse(s).find(x=>x.title==="innerdwes-media-poc-epochs");process.stdout.write(n?n.id:"")}catch{}})'; }
  KV_ID="$(kv_id)"
  if [ -z "$KV_ID" ]; then $W kv namespace create innerdwes-media-poc-epochs >/dev/null; KV_ID="$(kv_id)"; fi
  [[ "$KV_ID" =~ ^[0-9a-f]{32}$ ]] || { echo "STOP: could not resolve KV id"; exit 1; }
  sed -i '' -E "s/(binding = \"EPOCHS\", id = \")[A-Za-z0-9_]+(\")/\1$KV_ID\2/" wrangler.toml
  grep -q "id = \"$KV_ID\"" wrangler.toml || { echo "STOP: failed to bind KV id"; exit 1; }
  echo "== Queue innerdwes-media-poc-listen"
  $W queues list 2>/dev/null | grep -q "innerdwes-media-poc-listen" || $W queues create innerdwes-media-poc-listen >/dev/null
  echo "== POC keys (local, 0600; values never printed)"
  mkdir -p "$(dirname "$KEYS_FILE")"; chmod 700 "$(dirname "$KEYS_FILE")"
  if [ ! -f "$KEYS_FILE" ]; then
    umask 077
    node -e 'const c=require("crypto");const k=()=>c.randomBytes(32).toString("base64url");require("fs").writeFileSync(process.argv[1],JSON.stringify({KEYS:{p1:k()},ADMIN:k()}),{mode:0o600})' "$KEYS_FILE"
  fi
  echo "== guard (after provisioning)"; node scripts/guard.mjs remote
  echo "provisioned. Deploy only after owner approval: scripts/provision.sh deploy"
  exit 0
fi

# ---- deploy ----
grep -q 'REPLACE_WITH_POC_KV_ID' wrangler.toml && { echo "STOP: run 'provision' first (KV id not set)"; exit 1; }
[ -f "$KEYS_FILE" ] || { echo "STOP: $KEYS_FILE missing (run 'provision')"; exit 1; }
echo "== deploy -> innerdwes-media-poc (workers.dev only)"
$W deploy --name innerdwes-media-poc 2>&1 | grep -E "workers\.dev|Uploaded|Deployed|rror|arning" || true
node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1]));process.stdout.write(JSON.stringify(j.KEYS))' "$KEYS_FILE" | $W secret put MEDIA_TOKEN_KEYS --name innerdwes-media-poc >/dev/null
node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1]));process.stdout.write(j.ADMIN)' "$KEYS_FILE" | $W secret put MEDIA_ADMIN_KEY --name innerdwes-media-poc >/dev/null
echo "== guard (post-deploy, exact bindings)"; node scripts/guard.mjs remote --post
echo "done. Next: node scripts/seed.mjs <audio dir> https://innerdwes-media-poc.<subdomain>.workers.dev"
