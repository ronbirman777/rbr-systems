# InnerDweS — platform-wide audit plan (scope only; not executed)

Prepared 2026-10-11 under TASK 032.5, Part 13. **This audit has not been run.** It is scheduled **before the first paying customer** (execution order step 10). It must not run in parallel with sensitive Billing work (TASK 032 / Managed Payments integration), because both touch Staging data and Admin.

## 1. Purpose

Compare the **complete approved product specification** against the **actual deployed system**. The trigger is the problem described in INNERDWES-REQUIREMENTS-MATRIX.md §0: capabilities were described as done but were missing or not enforced. Every requirement ends up in that matrix with one of:

`VERIFIED · PARTIALLY IMPLEMENTED · IMPLEMENTED BUT UNTESTED · PLANNED · MISSING · CONFLICTING · UNKNOWN`

Each requirement also records separate evidence for the six lifecycle states:

`APPROVED → IMPLEMENTED IN CODE → TESTED LOCALLY → VERIFIED ON STAGING → DEPLOYED TO PRODUCTION → VERIFIED IN PRODUCTION`

## 2. Method (applies to every area)

1. **Specification capture.** Collect every approved requirement for the area from the task specs (`tasks/**`, the requirements-source index in the matrix §2), the owner messages quoted in task files, and the docs. Record the source and its date. If no written approval can be found, the status is `UNKNOWN`. Approval is never inferred from code.
2. **Evidence per layer (12 layers):**
   1. source code
   2. DB schema
   3. migrations
   4. RLS/grants
   5. API routes
   6. server enforcement
   7. Studio UI
   8. Guest App UI
   9. Staging/Production configuration
   10. automated tests
   11. real-browser behaviour
   12. operational infrastructure
   Each cell cites `file:line`, a migration, a test name, a QA script check id, or a dated read-only query result.
3. **Bypass tests.** Every "enforced" claim must be tested in two ways: through the UI, and around it (direct PostgREST insert/update, RPC call, Storage upload, crafted request). A rule enforced only in the browser is `PARTIALLY IMPLEMENTED`.
4. **Environment truth.** Read-only checks:
   - Staging and Production migration ledgers;
   - function fingerprints (md5 of `prosrc`);
   - policy/grant listings;
   - Vercel env var names per environment (never values);
   - the deployed SHA (`meta.gitCommitSha`).
5. **Browser QA.** Real browser on Staging with synthetic users (admin API plus cookie injection, never password entry), at desktop and phone widths, in all 7 locales where text changes. Production browser checks are limited to anonymous public pages unless separately authorized.
6. **Findings:**
   - severity: S1 security/data loss, S2 commercial/legal, S3 functional, S4 cosmetic;
   - a fix proposal for each finding;
   - no fix is applied inside the audit unless it is separately authorized.

## 3. Coverage

### Shared infrastructure
| Area | Key checks |
|---|---|
| Auth | Sign-up, sign-in, magic link/OTP, password reset, session refresh, sign-out everywhere, MFA (Admin AAL2 + step-up), rate limits, redirect allow-list |
| Profiles | Ownership, RLS, deletion/export (GDPR), avatar upload validation |
| My Spaces | Listing, slots, paid vs legacy vs exempt display, archive/restore, Replace (exemption non-transfer, 0046) |
| Create Space | Type choice, slug rules/reservations, entitlement checks before creation, duplicate prevention |
| Billing | Separate the three states: simulated (fake gateway), real Stripe Test Mode, Live readiness. Managed Payments decision. Lifecycle 24 h / 7 d / 12 d / 14 d, emails, invoices, refunds |
| Coupons | Per-user, per-Space and unlimited modes; expiry vs discount duration; Stripe sync drift |
| Admin | MFA, step-up, audit log append-only, QA-row exclusion from metrics, payments breakdown, exemptions |
| Publishing | Snapshot immutability, `publish_space` fingerprint, media re-hash, rollback of a publish |
| Media | Upload validation (MIME/magic bytes/size), duration provenance, integrity, tenant isolation, draft/published separation, all deletion paths, orphan handling, playback authorization |
| Storage | Bucket config (`file_size_limit`, `allowed_mime_types`), policies, quotas, backups (B2), restore drill |
| Brand | Logo/colour/fonts upload and rendering, OG images |
| Custom Pages | CRUD, sanitization (XSS), ordering, publish inclusion |
| Security | Guest Access gate (fail-closed, trusted Vercel IP), CSP/headers, secrets in bundles, SSRF, open redirects, dependency audit |
| Analytics | What is collected, consent, no listener identity (owner rule), cookie inventory |
| Localization | en/de/es/fr/he/tr/it coverage, RTL (he), overflow, native-language review status |

### Time to Teach
- Studio:
  - Classes;
  - Recurrence, including DST edges;
  - Timezones (organizer vs guest display);
  - Facilitator profile;
  - Readings;
  - Audio (library, limits, provenance, access codes once approved);
  - My Retreats.
- Guest App:
  - every module renders from the snapshot only;
  - the gate;
  - phone layout.

### Time to Flow
- Studio:
  - Retreat Profile;
  - Schedule;
  - Meals;
  - Facilities;
  - Treatments;
  - Arrival;
  - FAQ;
  - Guidelines;
  - Custom Pages;
  - Daily Inspiration (TASK 030);
  - Audio (Flow library; draft-audio deletion fix W0-3).
- Guest App: same checks as Teach.

### Operational
| System | Checks (read-only unless authorized) |
|---|---|
| Stripe | Account mode, keys per environment (names only), webhook endpoint + events + API version, Customer Portal, retries, emails off, tax / Managed Payments settings |
| Resend | Domain verification, tracking off, key scope, sender, bounce handling |
| Supabase | Plan, backups and PITR state, advisors (security/performance), auth settings, Storage config, ledger parity Staging vs Production |
| Vercel | Environments, env var names, deployment protection, cron, domains/aliases, preview isolation from Production |
| Backblaze | Bucket privacy/encryption, lifecycle/versions, last successful sync per bucket, credential scope |
| Cloudflare (if adopted) | Bucket privacy, Worker routes, keys/rotation, budget alerts, logs/IP settings |
| Backups / DR | A dated restore drill (DB plus media) into an isolated target with documented RPO/RTO |
| Monitoring | Uptime, error alerting, cron failure alerting, cost alerts 70/85/95 |
| Legal readiness | Operator/issuer identity, ToS, privacy notice (metering, Cloudflare/Stripe processors), refund policy, tax/MoR, cookie notice |

## 4. Sequencing and safety

1. **Prerequisite:** TASK 032 is held at its Managed Payments gate or closed, so no Billing change is in flight.
2. **Phase 1:** specification capture (documents only). **Phase 2:** code and DB layers (read-only). **Phase 3:** Staging browser QA. **Phase 4:** Production read-only verification. **Phase 5:** report and matrix update.
3. **Safety rules:**
   - No Production writes.
   - No destructive Staging cleanup without approval; run-scoped cleanup only, under the QA-SAFETY.md rules.
   - No secrets in output.
   - `admin_audit_log` rows are never deleted.
4. **Effort estimate:** about 3–5 working sessions. It can be split by product (Shared → Teach → Flow → Operational), but each part must finish its matrix rows before the next starts.

## 5. Exit criteria

- Every approved requirement has a matrix row with a status and evidence.
- Every S1/S2 finding has an owner-approved fix plan or explicit acceptance.
- No row is marked `VERIFIED` without cited evidence for the state it claims.
