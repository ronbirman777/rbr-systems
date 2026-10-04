# InnerDweS — TASK 028 Master Execution Plan

Date: 4 October 2026  
Scope: 028A Country + Phone · 028B Shared Brand · 028C Localization / i18n · 028D Guest Shell + Performance  
Audience: Claude implementation owner, project owner, and ChatGPT checkpoint reviewer.

## 1. Purpose and source of truth

Deliver one shared, backward-compatible foundation for Time to Flow and Time to Teach, covering country/phone entry, branding, English/Hebrew/German localization, RTL, and the remaining Guest shell/performance work. This is a complete execution pack with staged review gates, not permission to release everything automatically.

Source: the supplied preview and retrieved available history of **innerdwes main2**, conversation `6ab65b00-7208-83ec-a27d-ea6de49d5c34`, plus the owner's current instructions. Historical TASK 027.5 planning material was consulted for preserved architectural invariants only. Its old open phases, failures and authorization state are superseded by the owner's statement that **027.5 is closed**. Do not reopen them.

No current repository, database or deployment audit was performed when preparing this document. Reported facts below are a baseline to preserve, not fresh verification. The eight preset definitions, current schema, exact module inventory and repository documentation convention must be recovered from the active project; they are not supplied by the available conversation. Never invent canonical values.

This file is delivered outside an active repository because only dated scratch checkouts were found. At checkpoint 0, copy it into the active repository's existing task documentation convention. If none exists, use `docs/tasks/TASK-028-Master-Execution-Plan.md`. Record that path in the existing task index/README and maintain one authoritative copy there. Do not create a competing project-management system.

## 2. Closed baseline — preserve, do not duplicate

| Item | Accepted/reported state |
|---|---|
| TASK 027.5 | Closed. Preserve its integrated Teach/Flow and media/security outcomes. |
| Guest Share Polish | Released and verified live in the prior report. |
| Last reported main | `4b74b1291c29bb5994f946685e131763646f0d34`; inspect current main before work, never reset to this historical SHA. |
| Production | Reported READY, deployment SHA matched main at that release. |
| Public Guest origin | Production `NEXT_PUBLIC_GUEST_URL=https://innerdwes.com`; Preview remains isolated. Build-time public environment must exist before a release build. |
| Guest/public access | Narrow public Guest/social/media exceptions, with Studio/admin/internal protection preserved. Public route reachability does not bypass media authorization. |
| Social/share | OG and WhatsApp previews, QR, Share Card and WhatsApp sharing already work. QR for the example points to `https://innerdwes.com/s/teacherexample`. |
| Overflow | Shared root-cause repair accepted; Teach and Flow checked in Chromium/WebKit across seven widths. Exact historic width list was not supplied. |
| Lena | Owner confirms the name was changed to **Lena Hoffmann**. Do not ask the owner to rename again. Republish completion is not separately evidenced: read-only published-name smoke check is sufficient; report a discrepancy without bypassing owner authentication. |
| Prior release migration | Guest Share Polish required no migration. This does not establish that 028 needs none. |

Exclude rebuilding horizontal-overflow fixes, OG architecture, QR generation, Share Card, WhatsApp builders or public-route gating. Run bounded regression checks after affected changes. Reopen only a reproducible regression with a narrow fix. Preserve publish-versioned social URLs, absolute metadata, canonical origin handling and absence of token leakage.

## 3. Non-negotiable workflow and architecture

1. Inspect `AGENTS.md`, `CLAUDE.md`, task records, branch status and current architecture. Use a feature branch such as `feat/task-028-foundations`, based on verified current main. Preserve unrelated edits; never reset or overwrite them. Do not alter historical Teach branches.
2. No direct commits to main, main merge/push, Production deployment, Production data mutation or hosted migration without explicit owner approval for the concrete candidate and operation. Prior Guest Share release approval does not authorize TASK 028 release.
3. Local implementation and validation proceed within the approved checkpoint. Stop and return a reviewable report at every checkpoint. The initial start prompt authorizes checkpoint 0 only; later checkpoint acceptance unlocks the next local stage.
4. Feature-branch pushes can trigger hosted Preview deployments. Obtain approval for the named push/deployment and isolated Staging targets before doing so. Never assume a Preview frontend implies a non-production database or Storage bucket.
5. Share country data, phone normalization, brand resolver/tokens, locale infrastructure, shell primitives and media delivery logic. Flow/Teach adapters contain only actual product differences. Do not fork implementations or globally replace hardened shared files with older versions.
6. Derive product type, ownership and authorization from trusted server state. Preserve RLS, membership, slots, entitlements, access gates, published snapshots and product-aware routing. Client validation is never the sole write guard.
7. Preserve versioned create-only media, upload identity, exact-reference authorization, publish copy/idempotency, prior snapshot retention on failure, and Storage-first cleanup. Do not add versioned overwrites/upserts, broad DELETE restrictions, signing bypasses or anonymous draft access.
8. No broad dependency upgrades, Storage sweeps, redesigns of unrelated journeys, Billing implementation or unrelated cleanup. Document exceptions before expanding scope.

## 4. Execution order and checkpoints

| Gate | Deliverable | Exit / next action |
|---|---|---|
| **CP0 — Discover and agree contracts** | Verified branch/base; code and docs map; closed-baseline smoke results; canonical preset source; persistence/publish/locale contracts; dependency and migration assessment; performance baseline plan. | Report decisions and unresolved facts. Stop for review before implementation. Missing preset definitions block only preset-dependent work. |
| **CP1 — 028A** | Shared country/phone implementation, compatibility behavior and focused tests. | Commit locally, report, stop for acceptance. |
| **CP2 — 028B** | Shared brand resolver, eight exact presets, custom controls, image presentation and contrast rules. | Commit locally, show both products and legacy fixtures, stop for acceptance. |
| **CP3 — 028C** | Locale infrastructure, complete scoped strings in en/he/de, per-Space persistence and full RTL. | Commit locally, provide locale/device evidence, stop for acceptance. |
| **CP4 — 028D** | Shared Guest shell, measured loading improvements and media security/cache verification. | Commit locally, provide before/after evidence, stop for acceptance. |
| **CP5 — Integrated local readiness** | Combined candidate passes build, repository checks and critical cross-product journeys; migration and rollback pack complete. | Review readiness, then request specific Staging approval. |
| **CP6 — Authorized Staging QA** | Candidate deployed against verified isolated resources; migration rehearsal and browser/device/security/performance matrix. | Report exact SHA/resources and evidence. Stop for final release approval. |
| **CP7 — Approved release and Billing handoff** | Execute only approved integration/migration/deployment steps; verify live release; hand off contracts and deferred work. | Record actual outcomes, never infer approval or declare unrun checks passed. |

Dependencies: A's canonical data and B's token contract feed C; B/C feed D shell styling and direction. Performance instrumentation and fixture/translation inventories may be prepared early. Schema/publication contracts must precede consumers. Combined QA always follows integration.

Parallel work is optional, not authorization to spawn agents. After contracts are accepted, independent translation inventory, test fixtures, performance measurements and product-specific inspection can run alongside the approved implementation. Assign one owner to shared files, schema and migrations; integrate serially. Do not parallelize publication/cleanup on the same tenant or migration/reset operations on the same backend. Separate test data and use one candidate SHA for final evidence.

## 5. 028A — Country + Phone

### Deliverables

- Inventory all applicable country/phone fields in signup, profile, Space/Studio settings and Guest contact consumers. Record required/optional status and actual storage shape before changing them.
- One maintained country/territory source keyed by stable ISO country codes, with localized display names and phone calling-code metadata. Recover existing supported coverage/policies; explicitly record any exclusions. Do not duplicate lists in product components or treat calling codes as unique country IDs.
- Search/autocomplete country picker with keyboard navigation, accessible labels, active option, clear empty/no-results states, localized names and code search. Show selected value clearly; flags may supplement text, never replace it.
- Valid-only selection: arbitrary typed text is not a saved country. Validate on server as well as client. Optional fields may remain empty; required fields cannot. Preserve the input on validation failure.
- Phone country picker and shared parser/validator using the project's existing suitable library, or justify a narrowly scoped dependency. Support shared dialing prefixes, leading-zero rules and international paste. Keep readable display separate from canonical E.164 storage where compatible with the existing model.
- Space country may suggest a phone country, but users can choose another. Changing country must not silently rewrite an existing phone number. No SMS verification or proof-of-ownership claim is introduced.
- Validate on blur/submit with clear localized-ready errors. Treat extensions explicitly according to existing product policy; do not silently truncate. Reuse existing WhatsApp/contact link builders rather than creating another one.
- Legacy values: tolerant reads, deterministic mapping when unambiguous, explicit correction on relevant edits when invalid. Do not block unrelated saves or guess ambiguous numbers. No destructive bulk normalization.

### Acceptance

Both products use the same source and validator. Test Israel, Germany, a +1 region, a shared-prefix ambiguity, international paste, national input, empty optional/required values, invalid codes, malformed numbers, Unicode/spacing and legacy unmapped values. Confirm keyboard/mobile usability, save/reload and server rejection of tampered inputs. Contact and existing WhatsApp actions still produce the intended destination. Locale labels will be completed in CP3; keep keys ready now.

## 6. 028B — Shared Brand

### Deliverables

- Locate and record all **eight canonical preset IDs, names and exact values** from project authority. Preserve existing identifiers. Do not substitute eight invented themes. If definitions are missing, report the missing artifact while progressing independent resolver work.
- One shared typed token model and resolver for **Primary, Accent, Nav/App background, Text and Surface**. Confirm whether Nav and App background are one control or separate stored values; do not silently collapse existing fields. Include derived on-colors, borders, focus/selected/disabled states as needed, without expanding the owner-facing controls unnecessarily.
- Shared preset selection and **Custom Colors** editing across Flow and Teach, with draft preview, save, reload, publish and Guest rendering. Clearly distinguish preset-derived values from explicit custom overrides. Switching presets or resetting custom values must have predictable, tested semantics and must not discard saved customization accidentally.
- Define fallback precedence: valid explicit values → identified preset values → existing legacy/default behavior. Confirm exact precedence in CP0. Handle missing/partial/invalid values without crashing or rewriting legacy Spaces on read.
- Scope styles per Space/root so multiple previews and unrelated Studio surfaces do not leak colors. Reuse shared UI and CSS tokens; no independent product theme engines.
- Image presentation foundations: shared aspect/fit/container behavior, explicit dimensions, preserved focal points, consistent loading/failure states and alt text handling. Keep existing media identity and published rendering semantics.

### Contrast decision

Proposed acceptance target for owner review at CP0: WCAG AA contrast—normal text 4.5:1, large text 3:1, meaningful controls/focus indicators 3:1 where applicable. Test actual foreground/background pairs, not isolated palette swatches. All eight presets must satisfy supported combinations.

For new custom colors, provide immediate contrast feedback and safe derived foreground suggestions. Recommend preventing publication of known failing essential text/control pairs while allowing draft editing; confirm this product behavior at CP0 before implementing a new publish restriction. Do not silently alter user colors or introduce a new blanket legacy-publish blocker. Document the approved compatibility policy and any existing noncompliance separately.

### Acceptance

Test all eight presets plus valid, partial and invalid custom values on both products; legacy snapshots; save/reload/republish; contrast of text, navigation, buttons and error/focus states; no cross-Space style bleed; focal-point and image-layout regressions. Tests must prove both consumers use the shared contract.

## 7. 028C — Localization, Hebrew/German and RTL

### Deliverables

- Supported locales: `en`, `he`, `de`. Use the existing locale framework if suitable. Establish a shared message catalog and stable keys with interpolation/plural rules, deterministic fallback and missing-key checks. Avoid string concatenation and runtime machine translation of content.
- Inventory Studio and Guest product UI: navigation, onboarding/settings touched by 028, buttons, empty/loading/error states, validation, dialogs, accessible names, dates and applicable system messages. Include all supported modules in both products; record explicit exclusions for unrelated admin/legal/marketing surfaces.
- Persist locale **per Space** through validated server writes and the existing draft/publication lifecycle. Guest reads the appropriate published configuration; unsaved Studio edits must not leak publicly. Cross-Space navigation must not inherit a stale locale.
- Proposed default policy: existing Spaces retain current language behavior; new Spaces get a recommendation from selected country, with manual override always available. Israel may recommend Hebrew, Germany German, and unmapped countries English, subject to existing product rules. Country is never a lock and changing country never overwrites an explicit locale selection.
- Distinguish per-Space content/UI locale from any existing account/Studio interface preference. Resolve their precedence explicitly at CP0; do not force every Space into the account language. A visitor override is optional only if already supported; it must not mutate the Space setting.
- Set appropriate `lang` and `dir` at the rendering boundary. Hebrew uses RTL; English/German LTR. Replace directional layout assumptions with logical properties in shared surfaces. Handle text alignment, padding, margins, navigation, dialogs and keyboard interactions consistently.
- User-entered names, biographies, class titles, descriptions and custom-page text remain unchanged. Render mixed user content with `dir="auto"` where appropriate, with bidi isolation for inline embedded values. Phone numbers, URLs, codes and email addresses remain readable in their natural direction.
- Mirror directional navigation arrows when their meaning requires it; do not indiscriminately mirror logos, media controls or every icon. Confirm visual and keyboard order, focus behavior and screen-reader labels.
- Format dates, times, numbers and plurals with locale-aware utilities while retaining stored timestamps, existing timezone logic, recurrence and DST semantics. Language selection must not change event timezones or schedule calculations.
- Hebrew and German strings require language review; machine/generated translations must be labelled unreviewed until checked. Prevent clipped German labels and broken mixed Hebrew/Latin content.

### Acceptance

Both products × all three locales × Studio/Guest, including save/reload/publish, missing/invalid/legacy locale, manual override despite country, navigation between Spaces, mixed-direction content, long German strings and localized errors. Prove user text and recurrence/timezone data remain unchanged. No hydration mismatch, missing critical keys or unreadable RTL controls. Use actual screenshots and keyboard checks, not translation-key counts alone.

## 8. 028D — Guest Shell + Performance

### Shared shell

- Reuse the existing navigation model and product registry; one shared mobile bottom-navigation foundation with product-specific items supplied as data/adapters.
- Support short and long pages, active/focus states, accessible labels, safe-area insets, iOS dynamic browser chrome, portrait/landscape and keyboard-open states. Reserve bottom content space so navigation never covers the final action or content.
- Preserve route/deep-link/back behavior and appropriate scroll handling between tabs. Do not invent extra tabs or alter module availability. Ensure fixed navigation does not create nested scroll traps.
- Preserve the accepted overflow fix. Regression-test long tokens and large images; do not mask new layout defects with broad clipping.

### Measured loading and media delivery

1. Capture cold/warm load, current-tab readiness, LCP/CLS/INP where measurable, image/request bytes, number of `/api/media` and signing requests, tab-switch time and failed requests for representative Flow and Teach Spaces. Record device, network profile, cache state, dataset and candidate SHA.
2. Prioritize only the current tab's visible/likely LCP media. Reserve dimensions to prevent layout shift; lazy-load below-fold content. Do not mark every image as priority or preload every tab on initial load.
3. After current content is usable, perform bounded background preloading of likely next-tab assets. Deduplicate in-flight requests, limit concurrency, cancel or deprioritize obsolete work and respect reduced-data/slow-network signals when available. Do not bulk-prefetch audio or the whole library.
4. Audit `/api/media` before changing cache behavior. Preserve exact snapshot/draft reference authorization, access checks and tenant isolation on hits as well as misses. Cache keys must include the necessary tenant/content/version/variant and access context. Never publicly cache draft/private responses or a user-specific authorization result.
5. Avoid signed-request churn using safe request deduplication and appropriately scoped reuse within expiry constraints. Do not persist expiring signed URLs as durable content references. Verify expiry/retry, publish-version invalidation, access revocation/unpublish semantics and denied responses; never cache authorization failures as global truth.
6. Use responsive image variants/sizes appropriate to display size and pixel density; avoid full-resolution downloads for thumbnails. Evaluate WebP/AVIF through the existing image stack with compatible fallback and measured encoding/runtime cost. Do not bulk-rewrite stored originals or break the existing OG/social image workaround.
7. Keep image delivery and loading behavior shared between products. Image errors remain usable, retry loops bounded, and old published snapshots readable.

### Acceptance and performance budget

CP0 establishes reproducible baseline fixtures and CP4 records before/after measurements under identical conditions, preferably the median of at least three runs. Agree concrete per-fixture byte/request/tab-readiness targets after baseline; do not invent achieved numbers. Directional requirements: no new initial-load regression, no duplicate media/signing calls for the same in-flight asset, bounded background traffic, stable layout and visibly improved identified bottlenecks.

Use LCP ≤2.5s, CLS ≤0.1 and INP ≤200ms as proposed experience targets, not claims of measured field compliance. Lab checks cannot establish population percentiles. Missing real-user data must be reported honestly and must not trigger a new analytics project. Demonstrated severe regression blocks release; aspirational metric tuning after safe improvement is deferrable with owner-visible evidence.

## 9. Data and migration gates

- Audit country, phone, brand and locale storage, validation, payload builders, publish RPCs, snapshots and old readers before choosing changes. Prefer compatible application fallbacks when no schema change is necessary.
- **TASK 028 is a task number, not a migration number.** Inspect the current applied/repository chain. Never reuse historical `0028`/`0029`, renumber existing files, fill old gaps or assume a migration is unapplied because it is old.
- Before creating a migration, document the schema/payload change, consumers, compatibility, default semantics and why code-only is insufficient. Keep independent changes reviewable; do not mix cleanup or unrelated policies.
- Gate M1: local proposal review. Gate M2: disposable local apply, upgrade-path tests and rollback/forward-recovery rehearsal. Gate M3: explicit approval for named isolated Staging migration and deployment order. Gate M4: explicit Production migration approval after Staging evidence.
- Prefer additive nullable/default-compatible changes; no destructive normalization, eager full-table rewrite or automatic republish of all Spaces. Any necessary backfill must be separately scoped, idempotent, auditable and dry-run with counts and ambiguous cases reported.
- Test old app/new schema and new app/old snapshots where the release sequence requires them. If dual-version compatibility is impossible, stop for a reviewed maintenance/release sequence rather than guessing.
- Preserve publish functions' product branches, access fields, timestamps, covers/focal points and exact media references. A locale or brand change must not drop unrelated payload fields.
- Plan application rollback separately from database recovery. Do not assume a down migration is safe after new data has been written. Specify backup, recovery owner, feature fallback and cache invalidation as needed.
- Record **no migration required** with evidence if that is the actual result. No hosted operation is authorized by merely including it in this plan.

## 10. Integrated QA and Staging strategy

Use synthetic fixtures and authorized test tenants. Do not change Lena or real customer data for destructive testing. A read-only production smoke check does not replace Staging QA.

| Dimension | Required coverage |
|---|---|
| Products/surfaces | Flow + Teach, Studio + Guest; public, gated/private and draft access paths as applicable. |
| Locales | English LTR, Hebrew RTL, German LTR; mixed text and long labels. |
| Widths | Recover historic seven widths if available; otherwise proposed 320, 360, 375, 390, 430, 768, 1440 px. These are new QA choices, not claimed historical evidence. |
| Browsers/devices | Chromium and WebKit across width smoke matrix; actual iOS Safari safe-area/browser-chrome check, Android Chrome and desktop browser critical journeys. Emulation limitations explicitly recorded. |
| Data | Legacy and new Space, all eight presets/custom/partial brand, missing locale, invalid legacy phone, empty/full pages, long URLs, large/missing images, audio and mixed-direction text. |
| Lifecycle | Create/edit/save/reload, publish/republish, failure preserves old snapshot/media, cross-Space switching and product-aware routing. |
| Security | Anonymous draft denied/404 as applicable; cross-tenant and stale/unattached media denied; exact authorized published media allowed; private access not leaked through cache or preloads; Studio/admin gate preserved. |
| Performance | Cold/warm cache, constrained network, current/next tab, fast navigation, signed URL expiry, cache invalidation, offline/error fallback and bounded preloads. |
| Closed-work regression | No horizontal overflow; absolute OG metadata/social image; canonical Guest links; QR destination; Share Card/WhatsApp smoke. Only affected behavior receives deeper retest. |

Run repository-prescribed typecheck, lint, build, focused meaningful tests and the full required regression suite on the combined candidate. Do not remove tests to hide regressions or add tests that merely mirror constants. Capture screenshots and evidence paths; redact credentials/tokens. Mark each check PASS, FAIL or UNVERIFIED with reason and severity.

Before Staging: name frontend deployment, backend project, Storage resources and environment origins; verify none point to Production; confirm safe test accounts and migration order. Build with the appropriate isolated public origin. Test the actual deployed SHA, not a different local build. Retest affected coverage after fixes. Any main movement is reconciled on the feature branch and checked before final approval.

## 11. Release gates and Billing protection

### Hard blockers

Unauthorized access/cache leakage; data loss or destructive migration risk; broken publish/media lifecycle; cross-product regression; unusable country/phone writes; missing essential translation or broken RTL journeys; critical accessibility failure under the accepted contrast policy; navigation covering core actions; severe measured performance regression; failed required checks; unresolved essential Staging evidence; absent release approval.

### Must not delay Billing

Non-blocking visual refinements, rare-label polish, animation work, speculative preloading, codec tuning beyond measured needs, optional visitor language switching, unrelated refactors, test-tenant/orphan cleanup, legacy cosmetic inconsistencies and extra telemetry are tracked separately with owner, impact and follow-up. Do not label optional cleanup a dependency of Billing.

Billing readiness depends on stable shared country/locale/brand contracts and preserved entitlements/media behavior—not on every 028 polish item being perfected. If remaining 028 work is independent, explicitly document why Billing can begin and request acceptance of the handoff; do not wait silently for all backlog work. Security/data-integrity blockers remain blockers for affected release paths.

Final approval request includes candidate SHA/diff, completed scope, deferrals, test evidence, exact migrations/resources/order, deployment triggers, rollback plan and precise requested operations. Approval applies to that reviewed candidate; material changes require renewed review. Never interpret ChatGPT's technical acceptance as owner authorization to push main.

After authorized release, verify deployed SHA/alias/build-time origin, both Guest products, en/he/de and RTL, saved/published brand/country/locale behavior, media security/cache invalidation and core share regression. Check published Lena name read-only; if stale, report the owner-session republish need without repeating the rename. Record failures and follow the approved recovery plan.

## 12. Checkpoint report and completion checklist

At every checkpoint return:

1. Checkpoint, branch, start/end SHA, commits and clean/dirty state; changed files and behavior.
2. Shared architecture and backward-compatibility evidence for both products.
3. Decisions, unresolved facts and deviations from this plan.
4. Migration inventory, actual target, whether any hosted action occurred and its authorization.
5. Tests/build/browser/security/performance results; evidence paths and all unverified checks.
6. Blockers versus non-blocking deferrals; explicit impact on Billing.
7. Status: READY FOR REVIEW / BLOCKED / FAILED / DECISION REQUIRED; exact proposed next checkpoint. Then stop.

Final completion checklist:

- [ ] A: shared valid-only country/phone flow with compatible persistence and links.
- [ ] B: eight verified presets, Custom Colors, shared tokens, accepted contrast behavior, legacy rendering.
- [ ] C: en/he/de, per-Space locale, Studio + Guest, RTL and unchanged user content/timezone semantics.
- [ ] D: shared usable Guest navigation and measured safe media-loading improvements.
- [ ] Migration necessity and gates resolved; no unauthorized hosted changes.
- [ ] Integrated local and isolated Staging QA accepted for the exact candidate.
- [ ] Completed Guest Share/027.5 work preserved with no duplicate implementation.
- [ ] Explicit release approval obtained before main/Production actions; actual post-release outcome recorded.
- [ ] Billing handoff includes stable contracts, migration state, flags/fallbacks, remaining risks, deferred issue owners and which work can proceed immediately.

Document preparation is complete. Implementation, Staging verification and release remain future gated actions; none is claimed to have been performed by creating this file.
