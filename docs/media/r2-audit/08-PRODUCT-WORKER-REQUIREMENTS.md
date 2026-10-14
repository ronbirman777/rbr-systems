# R2 product Worker — mandatory requirements carried from the POC review (2026-10-13)

Status: **requirements only.** No product Worker exists; no Production media is migrated. The hosted POC
(`innerdwes-media-poc`, synthetic fixture, `07-POC-ACCOUNTING.md`) stays a POC and is not modified.

## REQ-1 Token-epoch revocation must be strict (confirmed defect in the POC)

- Evidence: `infra/media-worker-poc/src/index.ts:59` `return cur === null || ep >= Number(cur);` with the revocation
  epoch written as whole seconds at `:260` (`Math.floor(Date.now() / 1000)`) and tokens minted with `ep: now` in whole
  seconds at `:275`.
- Effect: a token minted in the same second as a revocation — including one minted just **before** the revocation call in
  that second — passes the check and keeps playing until it expires.
- Required in the product Worker: a strictly increasing per-tenant epoch (monotonic counter incremented on revoke, or
  millisecond precision with mint `ep` taken from the current stored epoch) and a check that rejects any token whose
  `ep` is lower than the current epoch, with a test that a token minted before a revocation in the same second fails and
  one minted after succeeds. KV failure stays fail-closed (as in the POC).

## REQ-2 No permissive CORS

POC: `ALLOWED_ORIGIN = "*"` (`infra/media-worker-poc/wrangler.toml:13`, pinned by `scripts/guard.mjs:23`).
Product: exact allow-list per environment (the app origins only), no wildcard, `Vary: Origin`; test that a foreign
origin gets no CORS grant.

## REQ-3 No unrestricted minting / POC endpoints

POC: `/poc/mint` and `/poc/player` behind `POC=1` (`index.ts:265-313`). Product: tokens are minted **only by the app
server** after the existing tenant, published/draft, subscription and access-code checks; the Worker has no mint route
and no player route; admin epoch endpoint keeps HMAC + timestamp window and returns 404 on any failure.

## REQ-4 Rate limiting

POC: none. Product: per-IP and per-token request limits on media routes (Cloudflare rate-limiting binding or an
equivalent counter), 429 with `Retry-After`; test under burst; limits documented with the cost model.

## REQ-5 Carried POC constraints (unchanged)

Keep `seg` streaming (the counting `TransformStream` is rejected: CPU quota); exact/bounded delivered bytes separate
from client-reported observe-only listening; Analytics Engine is sampled and never an enforcement ledger; no listening
enforcement or audio add-on sale without a separate decision; re-measure CPU for the longest allowed recording.

## Gate

None of this is implemented. Product Worker work starts only with the R2 integration task; Production media migration,
cutover and cleanup each need separate approval (master workboard §6 B3).
