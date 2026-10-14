# Legal and privacy launch gates (preparation checklist)

> **This is not legal advice.** It is an engineering checklist that lists the decisions and documents a qualified
> adviser and the owner must provide. It records what the code does today. It makes no legal determination about
> any jurisdiction, and it does not decide what any text must say.
>
> **Paid checkout stays OFF.** `billing_settings.paid_checkout_enabled` is seeded `false` (0036). Nothing in this document
> changes it. Turning it on is an owner action in Admin (step-up MFA, audited), and only after every gate here and in
> `docs/billing/LAUNCH-GATES.md` is closed. The audio add-on is not sold (BIL-13).

Status: 2026-10-14. Workboard §8 D2. It builds on `docs/billing/LAUNCH-GATES.md` and `docs/billing/TAX.md`, and it does not
replace them.

Legend: ☐ open · ☑ done (with evidence) · **BLOCKER** = paid launch cannot happen without it.

---

## 1. What exists today (facts from the code)

| Item | Fact | Source |
|---|---|---|
| Legal version ids | `terms`, `privacy`, `billingTerms` = `"draft-2026-10"`; `consentText` = `"checkout-consent-draft-2026-10"` | `app/src/lib/billing/legal.ts` |
| Acceptance record | `billing_acceptances`: `terms_version`, `privacy_version`, `billing_terms_version`, `consent_text_id`, `immediate_service_consent`, `withdrawal_acknowledged` (a DB check requires both to be true), `locale`, `accepted_at`, `user_id` (on delete set null). No client access | `0036:506-535`; writer `lib/billing/store.ts:345`; versions passed in `lib/billing/checkout.ts:139-140` |
| Checkout copy | "By continuing you accept the Terms of Service, the Privacy Policy and the Billing & Cancellation terms." plus two consent checkboxes | `lib/i18n/dictionaries/billing.en.ts:57-59`; `create/[type]/checkout-form.tsx:135` |
| **Published legal documents** | **None found.** No Terms, Privacy or Billing page or route exists in `app/src/app/**`, and the checkout line names the documents **without linking to them** | repo search 2026-10-14 |
| Operator / invoice issuer / tax | Undecided. Automatic tax off | LAUNCH-GATES; TAX.md |
| Managed Payments (MoR) | Decision BIL-12 pending; "Eligible" ≠ onboarded | HANDOFF-EVIDENCE #1, #3, #4 |

---

## 2. Gates

### G1. Operator and issuer decision record: **BLOCKER**
☐ Contracting operator: the legal entity, its country and its registered address.
☐ Invoice issuer: legal name, address, numbering responsibility, and what the document legally is (Stripe renders it from the account config).
☐ Stripe account ownership matches the operator (the sandbox account is in Singapore; the live operator is undecided).
☐ Customer-support and legal-notice contact (published address, not a personal one).
☐ Decision recorded in one dated document, signed off by the owner, with the adviser named (no personal data in the repo).

### G2. Tax and merchant-of-record decision: **BLOCKER**
☐ BIL-12: Managed Payments (Stripe as MoR) **or** InnerDweS as seller. This changes who collects and remits tax, which Stripe emails are forced on,
whether `automatic_tax` must be omitted (code gap if MP: `stripe/real.ts:54`), and the revenue labels in Admin (`ADMIN-METRIC-CONTRACTS.md` §0 C6).
☐ If not MoR: jurisdictions to register in, product tax code, tax-inclusive or exclusive presentation, B2B tax ID collection (TAX.md "Open decisions").
☐ The Stripe Tax configuration is completed per mode (Test and Live are separate) **before** `STRIPE_AUTOMATIC_TAX=true`.

### G3. Final legal texts: **BLOCKER**
☐ Terms of Service.
☐ Privacy Policy (contents per G4–G6).
☐ Billing & Cancellation terms: price, frequency, auto-renewal, the cancellation method (cancel at period end, via the Customer Portal), refunds, the lifecycle effects (Guest suspended at 24 h, Studio at 7 d, warning at 12 d, deletion-eligible at 14 d, no auto-delete: BIL-03), and what happens to content.
☐ Right-of-withdrawal / immediate-service wording: the mechanism exists (two separate booleans). The **text is unreviewed**. The adviser decides the wording per market.
☐ If MP is chosen: the disclosures MP requires at or before checkout (MP-v2 notes amount, frequency, auto-renewal and the cancellation method).
☐ Pages published at stable URLs, **linked from the checkout line** (today it links nowhere), the sign-up flow and the site footer.
☐ Translations: Billing/Admin are in 7 locales. Legal texts need a native, legally reviewed translation per offered locale or an explicit "the English text governs" decision. The tr glossary flags "cayma hakkı" for legal review. Marketing and sign-up stay English-only (T33-03 A2), so decide which legal texts are needed in which languages.

### G4. Subprocessors and data locations
Repository facts (verify each at signing; DPA/terms per provider are UNKNOWN unless noted):

| Subprocessor | Data | Location (repo evidence) | Status |
|---|---|---|---|
| Vercel | All web traffic; function execution; platform request logs (which include IP addresses: retention plan-dependent, UNKNOWN) | Functions `iad1` (US East) (TASK-033-PLAN §4); edge global | DPA UNKNOWN |
| Supabase | Accounts (email, auth), all Space content, media files, billing tables | Production `ap-northeast-1` (Tokyo) (matrix T33-07); Staging region UNKNOWN | DPA UNKNOWN |
| Backblaze B2 | A copy of all media (backups) | Bucket region **UNKNOWN** | DPA UNKNOWN |
| GitHub Actions | Media transits the runners during backups (no artifacts kept) | Runner region UNKNOWN | — |
| Stripe | Payment data, billing address, invoices | Account Singapore; processing global | When live |
| Resend | Recipient email + message content (billing; later watchdog alerts to the owner only) | UNKNOWN | When configured |
| Cloudflare | Today a POC with synthetic data only. Future: audio delivery + observe-only listening aggregates | UNKNOWN (global network) | Before R2 production |
| Healthchecks.io | Watchdog heartbeat; owner email only; no customer data | UNKNOWN | When created |
| Registrar / DNS / mailbox provider | Domain, mail routing | UNKNOWN | — |

☐ The subprocessor list is published (or kept on request, as the adviser decides), with the purpose and region per row.
☐ Cross-border transfer basis, per the adviser.

### G5. Privacy inventory (what the product stores about visitors)

**Cookies set by the application** (repo facts, 2026-10-14; exact names and attributes to be confirmed in a browser during the platform audit):

| Cookie | Purpose | Lifetime | Contents | Source |
|---|---|---|---|---|
| `idw_guest_access_<tenantId>` | Guest passed a Space access code | 7 days | Signed token `{tenantId, version, exp}` (no identity) | `lib/guestAccess/cookieToken.ts:17-23` |
| `idw_preview_access` | Staff preview gate (pre-launch) | 30 days | SHA-256 of the shared gate password | `lib/preview-gate/config.ts:10-12` |
| `idw_locale` | Account UI language | 1 year | Locale code | `lib/i18n/accountLocale.ts:14`; `create/billingActions.ts:98` |
| `idw_recovery_uid` | Password recovery flow | 15 min | User id | `lib/supabase/recovery.ts:31-35` |
| Supabase Auth session cookies (`sb-…`) | Signed-in session | Supabase defaults | Auth tokens | `@supabase/ssr` via `proxy.ts:119-122` |

The application uses no `localStorage`, `sessionStorage` or IndexedDB (repo search), and it includes **no analytics or measurement SDK** (repo search).
☐ The adviser decides which cookies are "strictly necessary" and whether a notice or consent is needed (PLT-07 is still UNKNOWN in the matrix).

**Rate limiting and security signals**
- `guest_access_ip_attempts (tenant_id, ip_hmac, window_start, attempt_count)`: an HMAC-keyed IP pseudonym, used for 8 attempts per 10-minute window
  (`0016:50-58, 86-106`; `lib/guestAccess/ipHmac.ts`). **Finding:** the 10 minutes is the counting window, **not** a retention period. There is
  no sweep, so rows persist until the Space is deleted (cascade). The matrix MED-14 phrase "stores an IP HMAC for 10 min" should be corrected.
  ☐ Decide a retention period (e.g. delete rows whose window is older than N hours) and disclose it. A sweep needs a migration and approval.
- `space_guest_access.failed_attempts`: a per-Space counter (no identity).
- Vercel and Supabase platform logs contain IPs and user agents outside the app's control. Their retention is UNKNOWN (plan-dependent).

**Measurement (planned, not built)**
- Listening metering: observe-only, per-Space hourly aggregates. No listener id, IP, UA, cookie or unique-listener count (R2-06; MED-14;
  `docs/media/r2-audit/04-SECURITY-STREAMING-METERING.md` §F.7). ☐ Disclose before it ships.
- Admin dashboard: aggregates only. The owner sees Space owners' emails on a detail page only (`ADMIN-METRIC-CONTRACTS.md` §1.4).

### G6. Retention, erasure and backups
| Store | Current behaviour (repo) | Erasure consequence | Decision needed |
|---|---|---|---|
| Supabase DB | Live rows. Managed daily backups (7 observed; PITR off) | Deleted data remains in managed backups for up to their retention (~7 days observed) | ☐ Disclose the backup retention |
| Supabase Storage → B2 mirror | Deletions propagate on the next run (every 4 h, with gaps up to ~11 h); hidden versions are deleted 14 days later (BKP-04) | A deleted file remains in B2 for ≤ ~15 days | ☐ Disclose |
| Immutable vault (WS-E, **not created**) | Proposed: Object Lock governance 30 d + lifecycle 31 d (recommended) or 45 d (conflicting proposals) | Erasure is delayed up to the lock + lifecycle, unless the owner-held `bypassGovernance` key is used | ☐ **Decide before creating the vault** (Object Lock is irreversible): the retention period, the erasure-override procedure and the disclosure (HANDOFF-EVIDENCE §1 D2 row) |
| Off-platform DB dumps (WS-G, **not built**) | Proposed 35 d / 12 months | Erased accounts persist in dumps for that period | ☐ Decide the retention vs erasure policy (e.g. a re-erasure log applied on restore) |
| `billing_acceptances` | Kept. `user_id` set null on account deletion | Evidence of acceptance survives deletion, without the link | ☐ Retention period for the legal evidence |
| `admin_audit_log` | **Append-only for every role** (trigger). `admin_user_id` and `target_id` are kept verbatim; payloads are redacted (`0036:589-630`) | Personal identifiers in audit rows cannot be erased in place | ☐ Adviser: legitimate-interest retention or a pseudonymization design (a schema change) |
| `billing_email_outbox` | Payload + recipient retained; no sweep found | — | ☐ Retention period |
| `guest_access_ip_attempts` | See G5 | — | ☐ Retention period |
| Stripe / Resend / Vercel logs | Provider-side | Outside the app | ☐ Document per provider |
| Account deletion flow | GDPR deletion/export is in the platform audit scope (PLATFORM-AUDIT-PLAN §3 "Profiles") and UNKNOWN (PLT-02) | — | ☐ Verify before launch |

### G7. Version ids and the acceptance mapping: **BLOCKER**
☐ Each final document gets an immutable version id (proposal: `terms-YYYY-MM-DD`, `privacy-YYYY-MM-DD`, `billing-YYYY-MM-DD`,
`checkout-consent-YYYY-MM-DD`), and the exact published text for each id is archived (a document repo or a PDF with a hash).
☐ `LEGAL_VERSIONS` is bumped **only together with** the published, reviewed text (the `legal.ts` header rule). No draft id may reach a paying customer.
☐ Mapping table: version id → URL → archived text hash → effective date → locales.
☐ `consent_text_id` maps to the exact checkbox and terms-line wording per locale (the dictionary keys `consentImmediate`, `consentWithdrawal`, `termsLine`).
☐ A test (future code change) fails the build if paid checkout can be enabled while any `LEGAL_VERSIONS` value contains `draft`. Today the flag toggle checks
only the Stripe prerequisites (LAUNCH-GATES "NOT enforced in code"). This is a proposed guard and needs approval.
☐ Re-acceptance policy when the Terms change (existing subscribers).

### G8. Related non-legal launch gates (pointers)
Real Stripe Test-mode journeys (BIL-01); listening metering gate (AUD-03); approved exemptions (BIL-07); email (Resend), cron and admin recovery;
Production release of 0036+ with fresh backups and restore evidence; the platform audit before the first paying customer (PLATFORM-AUDIT-PLAN).
Source: `docs/billing/LAUNCH-GATES.md`, workboard §8 D2/D4.

---

## 3. Owner decisions needed (summary)
1. Operator + invoice issuer (G1). 2. MoR / Managed Payments (G2, BIL-12). 3. The adviser engaged for texts and translations (G3).
4. Vault retention vs erasure, **before WS-E** (G6). 5. Retention periods for the IP-HMAC rows, outbox, acceptances and audit (G5/G6).
6. Which legal texts appear in which locales (G3).

## 4. Proposed matrix row text (not edited here)
- **LEG-01** · Operator + invoice issuer decided · MISSING · `docs/launch/LEGAL-PRIVACY-LAUNCH-GATES.md` G1 · Owner.
- **LEG-02** · Final Terms/Privacy/Billing published and linked from checkout · MISSING (no pages; the checkout line has no links) · G3 · Adviser + owner.
- **LEG-03** · Version ids bumped with the real texts; a draft-guard on the paid flag · PLANNED · G7.
- **LEG-04** · Retention/erasure incl. backups and the vault · PLANNED · G6 · decide before WS-E.
- **LEG-05** · Privacy inventory (cookies, IP-HMAC rate limit, logs, metering) · PARTIALLY IMPLEMENTED (inventory drafted) · G5.
- **MED-14** (correct the Code column): "the guest rate limit stores an IP HMAC per (Space, IP) with a 10-min counting window; rows persist until the Space is deleted (no sweep)".
