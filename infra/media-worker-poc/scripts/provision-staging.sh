#!/usr/bin/env bash
# TASK 032.5 controlled POC - provision the STAGING-ONLY Cloudflare resources and deploy the POC Worker.
# Owner-approved 2026-10-11 (Workers Paid ~$5/month + <= $10 POC usage; workers.dev only; no DNS).
#
# Reads credentials from an OWNER-CREATED local file (never committed, never printed):
#   ~/.config/innerdwes/cf-staging.env   CLOUDFLARE_ACCOUNT_ID=...  CLOUDFLARE_API_TOKEN=...
# The API token must be account-scoped with ONLY: Workers Scripts:Edit, Workers R2 Storage:Edit,
# Workers KV Storage:Edit, Queues:Edit, Account Analytics:Read. No zone / DNS permissions.
#
# Creates (idempotent; refuses to touch anything not named innerdwes-media-poc*):
#   R2 bucket  innerdwes-media-poc-staging   (private: no public r2.dev access, no custom domain)
#   KV         innerdwes-media-poc-epochs
#   Queue      innerdwes-media-poc-listen
#   Worker     innerdwes-media-poc-staging   (workers.dev)
# Generates POC token/admin keys locally into ~/.config/innerdwes/poc-keys.json (0600) and uploads them as Worker secrets.
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE="${CF_ENV_FILE:-$HOME/.config/innerdwes/cf-staging.env}"
KEYS_FILE="$HOME/.config/innerdwes/poc-keys.json"
[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE (owner creates it)"; exit 1; }
set -a; . "$ENV_FILE"; set +a
[ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ] && [ -n "${CLOUDFLARE_API_TOKEN:-}" ] || { echo "CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN missing"; exit 1; }
W="npx wrangler"

echo "== whoami (token check)"; $W whoami 2>&1 | grep -vi "token" | head -8

echo "== R2 bucket"
$W r2 bucket list 2>/dev/null | grep -q "innerdwes-media-poc-staging" || $W r2 bucket create innerdwes-media-poc-staging
$W r2 bucket dev-url disable innerdwes-media-poc-staging -y >/dev/null 2>&1 || true   # make sure r2.dev public access is OFF

echo "== KV"
KV_ID=$($W kv namespace list 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const n=JSON.parse(s).find(x=>x.title==="innerdwes-media-poc-epochs");process.stdout.write(n?n.id:"")}catch{}})')
if [ -z "$KV_ID" ]; then $W kv namespace create innerdwes-media-poc-epochs >/dev/null; KV_ID=$($W kv namespace list | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{process.stdout.write(JSON.parse(s).find(x=>x.title==="innerdwes-media-poc-epochs").id)})'); fi
sed -i '' "s/id = \"[A-Za-z0-9_]*\" }/id = \"$KV_ID\" }/" wrangler.toml
grep -q "$KV_ID" wrangler.toml || { echo "failed to bind KV id"; exit 1; }

echo "== Queue"
$W queues list 2>/dev/null | grep -q "innerdwes-media-poc-listen" || $W queues create innerdwes-media-poc-listen

echo "== keys (local, 0600; values never printed)"
mkdir -p "$(dirname "$KEYS_FILE")"
if [ ! -f "$KEYS_FILE" ]; then
  umask 077
  node -e 'const c=require("crypto");const k=()=>c.randomBytes(32).toString("base64url");require("fs").writeFileSync(process.argv[1],JSON.stringify({KEYS:{p1:k()},ADMIN:k()}),{mode:0o600})' "$KEYS_FILE"
fi

echo "== deploy (workers.dev only)"
$W deploy --env staging 2>&1 | grep -E "workers.dev|Uploaded|Deployed|error" || true
node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1]));process.stdout.write(JSON.stringify(j.KEYS))' "$KEYS_FILE" | $W secret put MEDIA_TOKEN_KEYS --env staging >/dev/null
node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1]));process.stdout.write(j.ADMIN)' "$KEYS_FILE" | $W secret put MEDIA_ADMIN_KEY --env staging >/dev/null
echo "done. Next: scripts/seed-staging.sh"
