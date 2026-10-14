# InnerDweS account and credential security inventory (METADATA ONLY)

Status: **template + known facts from repository documents, 2026-10-14.** Workboard §8 D3.

**This file never contains a secret value.** It holds no key, key id, token, password, recovery code, ping URL,
connection string, cookie, TOTP seed, customer data or personal email address. Credentials are named by their
**variable name or label** only. Personal addresses are written as "owner address".

Facts I could not establish from the repository are marked **UNVERIFIED** (believed, not proven) or **UNKNOWN** (no
information). Every value marked UNVERIFIED or UNKNOWN is filled in by the owner from the provider console, with the date
in `last verified`. A replaced key is **not** proof that the old key is revoked (workboard §8 D3).

---

## 1. Template

### 1.1 Account rows (one per provider account)

| Field | Meaning |
|---|---|
| `provider` / `account label` | e.g. "Backblaze: InnerDweS backup account" (no account id if sensitive) |
| `purpose` | What InnerDweS uses it for |
| `environment(s)` | Production / Staging / Preview / tooling |
| `owner` | The person who legally controls the account |
| `admins/members` | Count and roles (no personal emails here) |
| `MFA` | Enforced for every member? Method (TOTP / passkey / SMS) |
| `recovery custody` | Where the recovery codes live (e.g. "password manager, owner vault"), and whether a second trustee exists |
| `billing contact / plan` | Plan name; renewal date |
| `last verified` | Date + who checked it in the console |
| `status` | OK / ACTION NEEDED / UNKNOWN |

### 1.2 Credential rows (one per key/token/secret)

| Field | Meaning |
|---|---|
| `name` | Variable or label name only |
| `provider` · `stored in` | e.g. "GitHub Actions repo secret", "Vercel Production env (sensitive)", "Cloudflare Worker secret", "owner Mac `~/.config/innerdwes/…` (0600)" |
| `environment` | Production / Staging / Preview / CI / local |
| `scope / capabilities` | Exact capabilities (e.g. `listFiles, readFiles`, prefix `_backup-state/`) |
| `least privilege?` | yes / no (+ why not) |
| `created` · `expires` · `renewal/rotation` | Dates and policy |
| `used by` | Workflow, route or person |
| `revocation of predecessor` | VERIFIED (how) / UNVERIFIED |
| `last verified` | Date + method |

---

## 2. Accounts: known facts

| Provider | Purpose | Env | Known facts (source) | MFA | Recovery custody | Last verified | Status |
|---|---|---|---|---|---|---|---|
| GitHub (`ronbirman777`) | App repo `rbr-systems`; private infra repo `innerdwes_backup_infra` (backup workflows, CI) | CI / Prod backups | Plan: Free implied by "no branch protection" (BKP-13), "not verified" (DR plan §9). Infra `main` has a main-only writer gate (BKP-13) | UNVERIFIED | UNKNOWN | — | ACTION NEEDED |
| Supabase | Production `qzmsclkzbxrfohuxnitc`, Staging `kkqjsspxupyxytddiumf` | Prod / Staging | Pro (pricing basis, unconfirmed). Supabase CLI is authenticated on the owner Mac (it can issue project keys, project memory) | UNVERIFIED | UNKNOWN | — | ACTION NEEDED |
| Vercel | Project "innerdwes": Production, Preview (SSO-protected), `staging` custom env | Prod / Preview / Staging | Preview no longer inherits Production Supabase env (project memory). The protection-bypass secret is revoked after QA (procedure). The CLI is authenticated on the owner Mac | UNVERIFIED | UNKNOWN | — | ACTION NEEDED |
| Cloudflare | R2 media POC (Worker, R2, KV, Queue, Analytics Engine); planned watchdog | POC / future Prod | Workers Free (owner 2026-10-12). POC Worker `innerdwes-media-poc` **is deployed with a public `workers.dev` URL** (synthetic fixture only). wrangler is logged in on the owner Mac | UNVERIFIED | UNKNOWN | — | ACTION NEEDED |
| Backblaze B2 | `innerdwes-production-backup` (media mirror) | Prod backups | Private, SSE-B2, 14-day hidden-version lifecycle (BKP-04/05). The account-level admin key (K4) should exist only in the owner's password manager (DR plan §4): UNVERIFIED | UNVERIFIED | UNKNOWN | — | ACTION NEEDED |
| Stripe | Billing (sandbox only) | Test | Sandbox account (Singapore). Live not activated. Operator undecided (LAUNCH-GATES) | UNVERIFIED | UNKNOWN | — | Later |
| Resend | Billing email (not configured); planned watchdog alerts | — | Account exists; `innerdwes.com` verified for sending (2026-10-13) | UNVERIFIED | UNKNOWN | — | ACTION NEEDED |
| Healthchecks.io | Dead-man check for the watchdog | — | **Not created** | — | — | — | Planned |
| Registrar (Namecheap, owner to confirm) | `innerdwes.com` (+ others UNKNOWN) | — | Expiry, **auto-renew**, registrar lock and DNS host: UNKNOWN | UNKNOWN | UNKNOWN | — | ACTION NEEDED |
| Email (owner mailbox receiving alerts) | Destination of watchdog, GitHub and provider alerts | — | Provider UNKNOWN (Google Workspace scope UNKNOWN, spec §3) | UNKNOWN | UNKNOWN | — | ACTION NEEDED |
| Netlify (legacy) | None at runtime (CLAUDE.md) | — | Any remaining credentials or charges UNKNOWN | UNKNOWN | — | — | Review for decommission |
| InnerDweS Admin (`admin_users`) | Billing admin console | Staging (Production after the TASK 032 release) | Roles `owner` / `billing_admin`. AAL2 TOTP required; step-up 600 s. First Admin bootstrapped manually by SQL. No in-app recovery (ADMIN-RECOVERY.md) | Enforced in code (BIL-06, Staging) | Lost-factor recovery = owner action in Supabase Auth | Staging QA 2026-10-10 | OK (Staging) |
| Operator Mac | Development; holds CLI sessions and `~/.config/innerdwes/*` | tooling | **FileVault was OFF** (DR plan §1.6, 2026-10-12); later state UNVERIFIED (BKP-11). No Time Machine. Restored media deleted 2026-10-12 | — | — | 2026-10-12 | ACTION NEEDED |

## 3. Credentials: known facts (names only)

| Name / label | Provider · stored in | Env | Scope (source) | Least privilege? | Expires | Predecessor revoked | Status |
|---|---|---|---|---|---|---|---|
| `B2_APPLICATION_KEY(_ID)` (CI) | GitHub Actions repo secret, set 2026-09-30 | Prod backup | Bucket-restricted, but the "Read and Write" preset: includes `deleteFiles`, `writeBuckets`, `writeBucketLifecycleRules`, `writeBucketEncryption`, … (DR plan §1.3) | **No** (BKP-10) | UNKNOWN | — | WS-D rotation planned |
| `SUPABASE_S3_ACCESS_KEY_ID/SECRET` (CI) | GitHub Actions repo secret, set 2026-09-30 | Prod Storage | Full read/write/delete on every bucket; bypasses RLS; **cannot be scoped** | **No** (inherent) | UNKNOWN | — | WS-J rotation planned (rotation is not a fix for scope) |
| `TASK_027_SUPABASE_SECRET_KEY`, `TASK_027_MANIFEST_KEY` | GitHub Actions repo secrets, set 2026-10-01 | Prod | Service-level Production secret API key + manifest key (DR plan §1.3, gap G6) | **No** (standing exposure after TASK 027 closed) | UNKNOWN | — | **Check usage before removal**: `task-027-*` workflows still exist on infra `main` |
| Owner B2 verification key | Owner Mac `~/.config/innerdwes/` (0600) | tooling | Read-only, bucket-restricted (rollout log) | Yes | **2026-10-20T08:46:24Z** | Earlier verification key expired 2026-10-13T09:57Z (by expiry) | Expires soon; the watchdog needs its own key |
| First (unsafe) restore key | B2 | — | Read-and-write preset | No | UNKNOWN | **UNVERIFIED**: needs `listKeys`, deliberately not held (BKP-12, G11) | **ACTION NEEDED** (owner console) |
| `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Vercel env per environment (the secret key is "sensitive", write-only on Staging) | Prod / Staging | Service role (secret); publishable (public by design) | Secret: server-only | — | — | OK (names) |
| `GUEST_ACCESS_TOKEN_SECRET`, `GUEST_ACCESS_IP_HMAC_SECRET` | Vercel env | Prod / Staging | Guest cookie signing; IP pseudonymization key | Server-only | — | — | Rotation policy UNKNOWN |
| `INNERDWES_PREVIEW_PASSWORD` | Vercel env | Preview/Prod gate | Shared staff gate password | — | — | — | Rotation policy UNKNOWN |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_AUTOMATIC_TAX` | Vercel env (not set on Staging, as reported in ENVIRONMENT.md) | — | Restricted test key planned (EXTERNAL-SETUP S2) | Planned | — | — | Not configured |
| `CRON_SECRET` | Vercel env | Prod / Staging | Bearer for `/api/cron/billing` | Yes | — | — | Not set on Staging (as reported) |
| `RESEND_API_KEY`, `BILLING_EMAIL_FROM` | Vercel env | — | Sending-only, domain-restricted (planned) | Planned | — | — | Not configured |
| R2 POC keys (`MEDIA_TOKEN_KEYS`, admin/ingest keys) | Cloudflare Worker secrets + owner Mac `~/.config/innerdwes/poc-keys.json` | POC | POC only, synthetic data | — | — | — | Decide: decommission the POC or keep; remove local key files when done |
| Watchdog set: `B2_KEY_ID/B2_APP_KEY`, `GITHUB_TOKEN`, `RESEND_API_KEY`, `ALERT_TO`, `HEALTHCHECKS_PING_URL` | Cloudflare Worker secrets (planned) | Prod monitoring | B2: `listFiles,readFiles`, prefix `_backup-state/`, 365 d. GitHub: one repo, Actions read, 1 y. Resend: sending-only `innerdwes.com` (watchdog runbook §3) | Yes (designed) | 1 y (planned) | n/a | **Not created** (deployment approval pending) |
| Cloudflare deploy access | Owner `wrangler login` session | tooling | Workers Scripts + KV edit | — | session | — | Never stored in a Worker |
| Supabase CLI / Vercel CLI / wrangler sessions | Owner Mac | tooling | Account-level | No (interactive admin) | session | — | Depends on FileVault (BKP-11) |
| Proposed dashboard credentials (KV read token, Vercel read token, Stripe restricted read key, Healthchecks read key, Supabase PAT) | Vercel Production server env (proposed) | Prod | Read-only (scope granularity UNVERIFIED per provider) | Target yes | — | — | Not created (Batches 3–6) |

## 4. Follow-ups (owner unless stated)

| # | Item | Why | Done when |
|---|---|---|---|
| F-1 | **FileVault** status on the operator Mac; enable it if off | The Mac holds CLI sessions and `~/.config/innerdwes/*` (DR plan §1.6, G10, BKP-11) | `fdesetup status` = On, recorded with date |
| F-2 | **Confirm the first unsafe restore key is revoked** | BKP-12 / G11. Replacing it is not revoking it | Owner reads B2 → App Keys; records "absent" + date |
| F-3 | **Dedicated watchdog credentials** (B2, GitHub, Resend, Healthchecks) | WS-F deployment; the owner's verification key expires 2026-10-20 | Created per `watchdog-owner-setup.md`; preflight `RESULT PASS` |
| F-4 | **WS-D: B2 CI key rotation** to K1 (no `deleteFiles`), then revoke the old key after 3 green scheduled runs | BKP-10, G2 | Old key absent in the console |
| F-5 | **WS-J: Supabase S3 key rotation** after guard stability | Standing full-access key | New key in use; old key revoked; 3 green runs |
| F-6 | **TASK_027 secrets**: check usage by the `task-027-*` workflows on infra `main`, then remove the workflows and secrets with approval | G6 | Workflows removed or justified; secrets deleted |
| F-7 | **Domain auto-renew**, expiry date, registrar lock, registrar MFA | Domain loss breaks email, the Resend domain and the site | Recorded in §2 with date |
| F-8 | **MFA + recovery custody** for every account in §2 | Account takeover = data loss | Every row has MFA = yes and a recovery location |
| F-9 | Secrets bound to protected environments (GitHub environments may be unavailable on Free) | G7 | Capability confirmed; secrets moved, or the risk accepted |
| F-10 | Separate **source-compromise vs backup-compromise** credentials (the vault on a separate key, optionally a separate account) | DR plan §14.3 | WS-E design approved |
| F-11 | R2 POC: decommission, or keep with the `workers.dev` URL documented; remove local POC key files | Unneeded public surface | Owner decision recorded |
| F-12 | Webhook / outbox / cron error monitoring for billing (before paid launch) | OPERATIONS.md | Alerts defined (Admin Batch 4) |
| F-13 | Rotation policy for `GUEST_ACCESS_*` and `INNERDWES_PREVIEW_PASSWORD` | No documented policy | Policy recorded |

## 5. Proposed matrix row text (not edited here)

The matrix has no SEC-* rows (HANDOFF-EVIDENCE contradiction #17). Proposed additions:
- **SEC-01** · Account MFA + recovery custody inventory · UNKNOWN · `docs/security/ACCOUNT-SECURITY-INVENTORY.md` §2 · Owner fills.
- **SEC-02** · Operator Mac encrypted (FileVault) · UNVERIFIED (OFF on 2026-10-12) · BKP-11 · Owner.
- **SEC-03** · First unsafe restore key revoked · UNKNOWN · BKP-12 · Owner console check.
- **SEC-04** · Standing TASK_027 Production secrets removed after a usage check · MISSING · DR plan G6 · Approval.
- **SEC-05** · Domain renewal/auto-renew/lock recorded · UNKNOWN · inventory §2 · Owner.
