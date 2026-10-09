# QA - customer billing funnel (TASK 032), real browser, no real Stripe

Run date 2026-10-09. Observed facts only; gaps are listed at the end.

## Method

- Local `next build` + `next start` (port 3217) wired to **Staging** Supabase (ref `kkqjsspxupyxytddiumf`; the built `.next` was grepped: the Production ref appears nowhere). `STRIPE_SECRET_KEY` was a fake `sk_test_...` value. The server ran with a preload that refuses any connection to `*.stripe.com` and logs the attempt: **Stripe was never contacted** (360 refused attempts logged, all from the "checkout cannot start" / cancel / update-payment clicks).
- Staging was changed temporarily: `billing_settings.paid_checkout_enabled` true (prior false), `billing_plans.stripe_test_price_id/product_id` set to FAKE ids (prior null). Both restored and verified afterwards.
- Seeding (`app/scripts/customer-funnel-qa.int.test.ts`, phase seed): the REAL services (`startCheckout`, `handleStripeWebhook`, `runBillingJobs`) over the real Staging DB with `FakeStripe`. 2 synthetic users (created by admin API), 6 coupons (inserted directly with fake Stripe ids, so no Admin audit rows), 7 paid Spaces for one owner, asserted through `space_access_state`: active, discounted (10% x3, cycle 1 of 3), canceling, payment_issue, guest_suspended, studio_suspended, ended; invoices and outbox rows from the real paths.
- Browser (`app/scripts/customer-funnel-qa.mjs`): Playwright Chromium, sessions minted from admin magic-link tokens and injected as cookies (no password typed, no account created in the UI). Locale set via the `idw_locale` cookie.
- Matrix: locales en, tr, it, he, de x widths 320, 360, 390, 430, 768, 820, 1440 = 35 combos.
- Per view the script checks: HTTP status/redirect; `lang` and computed `dir` (he = rtl); no raw i18n key; no unfilled `{placeholder}`; no undefined/NaN/null; no horizontal overflow; no clipped/ellipsis/outside-clip text; no English fallback copy in non-en; glossary "Rejected" terms (tr, it) absent; expected phrases built from the dictionaries plus `Intl` (money `$22,50` / `25,00 $`, long dates, grouped numbers) must be present; console errors, page errors, failed or 4xx/5xx same-origin requests.
- Cleanup: `runScopedDelete` (exact ids, counted before and after); then residue check.

## Results

| Area | Views | Result |
|---|---|---|
| Main matrix (35 combos) | create chooser, /create/teach, /create/flow, canceled banner, 8 coupon cases, consent error, checkout-cannot-start, /create/complete (unpaid, bad id, paid -> welcome), welcome, foreign-welcome 404, /billing x7 states, cancel dialog, cancel and update-payment errors, My Spaces, 2 Studio gates, non-gated Studio | **15,981 checks: 15,981 pass, 0 fail** (final run, after the fixes below) |
| "Checkout unavailable" (flag on, no Stripe key), 5 locales x 4 widths | /create, /create/teach redirect | 248 pass, 16 "fail" = a script artifact (the button text is CSS-uppercased, my case-sensitive compare missed it); text visually correct, Turkish shows `SPACE'LERİME DÖN` correctly. Counted as pass with this note. |
| Console / network | all 35 combos | Only 70 entries: the expected 404 for a foreign Space id on `/create/welcome/<unknown>` (35 x 2). No page errors, hydration warnings or failed requests. |
| Stripe isolation | | 0 requests reached Stripe; refusals logged. |

Coupon cases verified per locale/width with the exact localised message: valid 10% x3 (rows Due today / First 3 billing periods / Then), valid 20% forever, valid $5 first-month, lowercase code, invalid, expired, not-yet-started, deactivated, already-used (once-per-user, second Space), remove restores plain price; no price change after a refusal.

## Defects found and fixed (first runs failed these; final run passes)

1. **My Spaces dead end for paying customers** (all locales/widths): after buying one Space the page read "7 of 1 Space slot used - none available" and "+ New Space" was disabled (greyed, no link), so a customer could not reach the paid funnel for a second Space. Fix: in paid mode the slot line is hidden and "+ New Space" stays a link. File: `app/src/app/(site)/space/page.tsx` (adds `getCreateMode()`; lifecycle controls still use the real slot data).
2. **Billing chips and link on My Spaces had no language/direction** (page is the legacy English page; he chips rendered LTR inside lang=en; the CSS-uppercased "Billing" link in tr would use English casing rules). Fix: `lang`/`dir` on chips and the Billing link. Same file.
3. **Studio-suspended/ended gate had `dir` but no `lang`** (tr/he/it text under an English document; wrong screen-reader voice, Turkish i/İ). Fix: new optional `lang` prop on `StudioSuspended`; both Studio pages pass the account locale. Files: `app/src/components/billing/studio-suspended.tsx`, `app/src/app/(site)/configurator/teach/[tenantId]/page.tsx`, `app/src/app/(site)/configurator/retreat/[tenantId]/page.tsx`.
4. **Audio entitlement numbers not locale-grouped** ("100000 minutes" in every locale). Fix: `Intl.NumberFormat(LOCALE_TAG[locale])`. File: `app/src/lib/billing/billingPageModel.ts`. Verified: the QA expects `100,000` / `100.000` / `100.000` / he grouping.

Checks after the fixes: `tsc --noEmit` clean; `vitest run` 142 files passed, 2316 tests passed (3 files skipped, integration only); eslint: only pre-existing unused-import warnings.

## Observations (not defects, no change made)

- Turkish formatting verified against `Intl`: `$22,50`, `9 Ekim 2026 - 8 Kasim 2026`; Italian `Torna a I miei Space` is the glossary wording ("I miei Space"; "A I" is capitalised oddly: "Torna a I miei Space" reads as a title-case artefact; consider "Torna ai miei Space" - native review).
- Glossary scan found no rejected tr/it terms in any view. Both glossaries are marked UNREVIEWED by a native speaker; this QA cannot judge naturalness.
- Hebrew money renders `‏25.00 ‏$` (bidi marks from `Intl he-IL`); layout correct in screenshots at 320.
- Dates on the legacy My Spaces cards ("Updated 10/9/2026") use the browser locale of the server and are outside this task.

## NOT verified

- Any real Stripe round trip (Checkout page, redirect back, webhooks from Stripe, billing portal, real cancel/resume). Cancel/update-payment were only verified to fail with the localised generic error when Stripe is unreachable. The "success" state of cancel/resume is therefore unverified in a browser.
- The "Replace" / "Restore archived Space" controls on My Spaces still use the legacy slot count (`slotsAvailable`) in paid mode; behaviour for a paid customer was not analysed or fixed.
- Browsers other than Chromium (Safari/WebKit, Firefox), real devices, touch input, screen readers, keyboard-only traversal, zoom/large-text settings; only widths were emulated.
- Es and fr locales (out of the requested set), the emails, and the legacy English My Spaces/Studio UI.
- Native-speaker review of tr/it/he copy; legal wording (withdrawal consent).
- `/create/complete` polling beyond the unpaid and already-provisioned cases (no in-flight "processing" or "failed" states were seeded).
- Seeded dates: renewal history was not back-dated (a coupon reservation is checked against the DB clock), so the discounted Space shows cycle 1 of 3 only.
- Staging DB side effects of the app's own server actions (pending checkouts, reservations) were removed by user-id scope; `admin_audit_log` was not touched (the scripts call no Admin mutation).

## Cleanup evidence

Removed by `runScopedDelete`: outbox 16, invoices 10, events 13, redemptions 165, acceptances 7, subscriptions 7, tenants 7, pending checkouts 11, customers 1, coupons 6, plus 2 auth users. Post-check: flag false, plan Stripe test ids null, 0 subscriptions/coupons/pending checkouts/invoices/redemptions, 0 `qa032fun` users. Local server stopped.
