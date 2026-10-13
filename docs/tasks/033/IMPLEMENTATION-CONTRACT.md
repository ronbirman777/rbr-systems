# TASK 033 — implementation contract (integration owner: Claude main session)

Authorization: owner, 2026-10-13 ("EXECUTION CONTINUATION"): start TASK 033 on an isolated branch/worktree; A6 lifted
for the approved product requirements. **No Production change, no deploy, no merge to main, no hosted migration.**
Plan: `docs/audits/TASK-033-PLAN.md` (locked decisions A1–A5 apply).

## Base and dependencies (verified 2026-10-13)

- Integration branch `feat/033-guest-experience` in worktree `~/Desktop/RBR-033-worktree`, base `d02ac99`
  (`feat/032-commercial-platform-foundation`). Reason: 28 TASK 033 surface files (dictionaries, locales, spaceSettings,
  guest-app, teach-guest-app, /api/media) and the live `publish_space` definition (0043) already differ from `main`.
  **Release dependency:** TASK 033 reaches Production only with/after the TASK 032 release (migrations 0036–0047).
- Hosted DB (read-only `list_migrations`): Staging 0001–0047 (0047 applied; older docs say local-only — stale);
  Production 0001–0035. No 0023 in either ledger.
- Currency census (read-only): priced items with missing/non-ISO currency — Production 4 of 6, Staging 8 of 13.
  Legacy values exist → lenient parsing and raw display are mandatory.
- Baseline at `d02ac99`: vitest 2874 passed / 18 skipped (167 files), `tsc --noEmit` clean, eslint 0 errors (29 warnings).

## Product decisions applied (owner-locked or owner instruction 2026-10-13)

| ID | Decision |
|---|---|
| A3/A4 | Share Card = latest **published** state only: Flow: published Space image → published Hero → brand gradient; published name/logo/theme; refresh after Republish without reload. Teach: keep behaviour, add `?v=<publishedAt>` freshness, translated CTA, prefer published Space image (Space → portrait → hero → gradient) |
| Shell | Shared **centered mobile-style column** on desktop for Flow and Teach Guest Apps; mobile layout unchanged |
| A1/A5 | Day Navigator in Teach visual language (no image); timeline unchanged below; day number = calendar offset from the **retreat start date** in the Space IANA timezone; days without activities shown with an empty state; single-day retreat = date header |
| Dates | Optional retreat **start/end dates** (ISO `YYYY-MM-DD`, Space timezone) in Studio; fallback when unset = earliest→latest scheduled date (labelled derived). Must publish without a SQL migration (verify the publish path) |
| D-CC3 | Space-level default currency `spaceSettings.currency`, default **EUR**, pre-fills new priced items; per-item override; no conversion ever; changing the default affects new items only |
| D-CC4 | Flow: currency required for new/edited priced rows; untouched legacy rows still publish |
| D-CC5 | Teach Class free-text price unchanged |
| D-LD1 | Branded loading: streaming fallback + hero-wait capped at **1.5 s**, CSS 200 ms appearance delay, reduced motion static |
| Perf | Code-only improvements. **Not in this package:** D-PF1 region move (`vercel.json`, Production config), D-PF2 cache window (stays 60 s), P2 RPC (needs a hosted migration + parity on a real DB) |
| A2 | tr/it: full common/teach/flow/studio. **Not added to `SPACE_SELECTABLE_LOCALES`** until QA + native review (single switch at release). Marketing/auth pages stay English |
| Out of scope here | Country card removal / phone default (§4.1), D-CC2 publish privacy migration, billing/Stripe, R2 |

## Packages and owned paths (one writer each)

| Pkg | Agent branch / worktree | Owns |
|---|---|---|
| P1 Share | `feat/033-p1-share` | `lib/share/publishedCardImage*`, `configurator/retreat/shareCard.ts`, `components/studio/share-card-panel.tsx`, `/api/share-card/**`, configurator `[tenantId]/page.tsx` card props; minimal publish-refresh edit in `retreat-configurator.tsx` |
| P2 Schedule | `feat/033-p2-schedule` | `lib/schedule/retreatDays*`, `components/guest/retreat-day-navigator*`, `components/schedule-screen.tsx`, start/end date fields (new component + minimal mount in the Studio), their schema/publish path |
| P3 Currency | `feat/033-p3-currency` | `lib/currencies/**`, `scripts/generate-currencies.mjs`, `components/forms/currency-select*`, `spaceSettings` currency field, `treatments-step.tsx`, `treatment.ts`, `lib/teach/{schemas,retreats}.ts` currency parts, teach-studio retreat price fields, `treatments-screen.tsx`, `teach-retreats.tsx` |
| P4 Guest shell + loading + perf | `feat/033-p4-guest` | `app/(guest)/**`, new `components/guest/{guest-desktop-shell,guest-loading-screen}*`, `guest-app.tsx`, `teach-guest-app.tsx`, `shared/{brand-image,media-prefetch}`, `lib/media/prefetch*`, `document-shell.tsx`, `lib/teach/fonts.ts` (incl. latin-ext), `globals.css` |
| P5 tr/it | `feat/033-p5-i18n` | `dictionaries/tr.ts`, `dictionaries/it.ts`, `lib/i18n/datetime.ts` (tr/it ordinals, `capitalizeFirst`), `recommendedLocales`, glossaries, i18n parity/terminology tests |

Shared-file rules:
- `en.ts` + `de/es/fr/he.ts`: feature packages may **add** keys in their own namespace area with all five translations;
  never edit or delete existing keys. tr/it for new keys are added at integration.
- `retreat-configurator.tsx`, `teach-studio-sections.tsx`, `published-space-screen.tsx`: minimal, localized edits only;
  prefer a new component mounted with a one-line change. The integration owner resolves conflicts.
- No migrations, no `vercel.json`, no lockfile changes, no new dependencies, no billing imports.
- Every package: targeted tests + `tsc --noEmit` + eslint (0 errors) + full `vitest run` green before handing back; commit
  only owned paths on its own branch; never push.

## Migration reservation

This package uses **no migration**. Numbers 0048+ remain unassigned (R2 placeholders 0048/0049/0050 and TASK 033 P2/D-CC2
are both pending); assign at the first real use.
