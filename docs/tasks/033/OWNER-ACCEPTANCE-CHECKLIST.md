# TASK 033 — owner acceptance checklist (2026-10-14)

This lists what still needs **the owner**: real devices, and approvals. Everything here is beyond what emulation can
prove. Playwright WebKit is not iOS Safari, emulated viewports are not a phone, and CDP throttling is not a mobile network.

Already accepted, do not repeat: Staging QA rounds 1 + 2 passed owner items 1–7 and 9 (dates, Day Navigator, Daily
Inspiration, Share Card freshness, currency, shell/access code, Hebrew) — `STAGING-QA-REPORT.md`.

## Context: local acceptance round 2 (branch `fix/033-acceptance-2`, local only)

| Item | Result |
|---|---|
| D4 WebKit #418 on the Studio Flow configurator | **Fixed.** Cause: timezone `<select>` rendered `Intl.supportedValuesOf("timeZone")` on the server (Node lists legacy aliases such as `Asia/Calcutta`; WebKit lists canonical names plus `Etc/GMT±n`). Same bug in Teach Studio. Teach Guest `de` #418 (pre-existing) had a related ICU cause (`Mi., 14. Okt.` vs `Mi. 14. Okt.`), also fixed, plus range spacing / Italian `03` |
| Legacy prices (`700 baht`, `$50`, `50 USD`, `usd`, no currency, `0`, `12.345`, JPY/KWD, `€`, `EURO`) | Render unchanged and safely in Flow + Teach Guest and in Studio, both engines, en + he; D-CC4 leniency verified. No defect |
| tr/it | Complete (0 missing keys, placeholders identical), still not selectable. Native review needed (below) |
| D6 404 after image replace | **Not reproduced locally** (both engines, Space image + Hero, full Staging sequence). Open, see below |

## A. Real-device checks (owner)

Do these on **Staging after the redeploy in B1** (the fixes above are not on Staging yet). Use the synthetic QA Spaces
`qa-flow-1h8ve` (Flow) and `qa-teach-staging` (Teach) and the synthetic Studio QA owner.

### A1. iPhone Safari (latest iOS; add an older iOS if one is available)

| # | Check | Pass when | Send back |
|---|---|---|---|
| 1 | Open the Flow Guest App link from Messages/WhatsApp, normal 4G/5G | branded loader then content; never a blank page longer than ~2 s; never the loader on top of painted content | screen recording from tap to content |
| 2 | **Slow mobile network**: Settings → Developer → Network Link Conditioner "3G" or "Very Bad Network" (needs a Mac-paired iPhone), or a weak-signal spot | loader appears, page completes; no stuck loader; images arrive later without layout jumps | recording |
| 3 | **Safe areas** (notch / Dynamic Island / home indicator), portrait and landscape | bottom navigation and buttons not under the home indicator; header not under the notch; no white bars | screenshots portrait + landscape (Flow Today, Teach Home) |
| 4 | **Home-screen web app**: Share → Add to Home Screen, open from the icon | opens the Space; icon and title sensible. Note: there is no web app manifest, so it opens as a Safari page (no standalone mode) — confirm that is acceptable | screenshot of the icon + first screen |
| 5 | **Lock screen**: start an Audio track in the Guest App, lock the phone | audio keeps playing; the lock screen shows Safari's default controls (no custom artwork/title — no Media Session yet); play/pause works | photo/screenshot of the lock screen |
| 6 | **Access-code keypad** on a code-protected Space (temporarily set a code in the Studio, remove afterwards) | the numeric keypad opens; SMS/one-time-code suggestion does not insert garbage; paste of a full code works; wrong code shows the error; correct code unlocks and persists after reopening | recording |
| 7 | **RTL Hebrew** (temporarily set the Space language to he, restore afterwards) | layout mirrored, Day Navigator order and swipe/arrow behaviour feel right, prices and times not reordered (`₪700`, `09:00`) | screenshots Today, Schedule, Treatments |
| 8 | **Share sheet** in the Studio "Share your Space" (Flow) | the iOS share sheet opens with the card image + link; sharing to WhatsApp/Instagram shows the right card | screenshot of the share sheet + received message |
| 9 | **QR**: scan the Share Card / Studio QR with the iPhone camera | opens the correct Guest App URL (Staging host) | screenshot |
| 10 | Day Navigator touch: swipe/scroll the day strip, tap days, Today | smooth, no accidental horizontal page scroll | recording |
| 11 | Studio on iPhone: open the Flow configurator and Teach Studio, change the timezone, pick a currency, Save | no error banner/flash on load (D4), pickers usable with the on-screen keyboard | screenshots |
| 12 | Text size: Settings → Display → Text Size larger | nothing clipped in navigation, cards, prices | screenshot |

### A2. iPad Safari

| # | Check | Send back |
|---|---|---|
| 1 | Guest App portrait + landscape: centred mobile column with brand backdrop (≥640 px), nothing stretched | screenshots |
| 2 | Studio Flow configurator + Teach Studio, landscape: sidebar, preview pane, Share step | screenshots |
| 3 | Split View / Slide Over (narrow width): Guest App switches to full width | screenshot |

### A3. Android Chrome (relevant: guests share links via WhatsApp; recommended)

| # | Check | Send back |
|---|---|---|
| 1 | Items A1.1, A1.3, A1.6, A1.7, A1.8 (Android share sheet), A1.9 on one mid-range Android phone | recordings/screenshots |
| 2 | Chrome "Add to Home screen" | screenshot |

### A4. Desktop (quick)

Safari on macOS: open the Flow configurator with Web Inspector → Console open; reload 3×. **No React #418** (confirms D4 on
a real WebKit). Send a screenshot of the empty console.

**Format to send back:** one folder per device (`iphone-<model>-ios<version>/`, `ipad-…/`, `android-…/`), files named
`A1-03-safe-area-portrait.png` etc., plus one line per item: PASS / FAIL + note.

## B. Approvals still needed

| # | Approval | Exact action | Why |
|---|---|---|---|
| B1 | **Staging redeploy of the latest integration HEAD** | `vercel deploy --target=staging --yes` from a clean worktree at the integration SHA (coordinator fills in), plus a temporary Protection Bypass for Automation secret, revoked afterwards. Pattern as in `STAGING-DEPLOYMENT-PLAN.md` | puts D1–D3 (`e293838`) and this round's D4 fix on Staging for section A; no migration (Staging already 0001–0047) |
| B2 | **Commercially-unavailable 404 test (SQL, Staging only)** | exact statements, rollback and checks are in `STAGING-QA-REPORT.md` → "Proposal — commercially unavailable 404 test": one-row `update public.space_entitlements set access_ends_at = now() - interval '8 days' …` on synthetic tenant `4eb19601-…`, test `/s` + `/g` → 404, then the rollback `update` restoring `2027-10-03T07:05:32.450636+00:00` | the only Staging-unverified access state (verified locally) |
| B3 | **D5: Staging site-URL setting** | set the Staging environment's public site/app URL values (`NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_APP_URL`, names only) to the current Staging host instead of the old `innerdwes-git-fix-0275-teach-qa-corrections-…` alias, then redeploy (can combine with B1) | Studio "Guest App link" and `og:image` point at an old branch host. Configuration, not code; Production is unaffected |
| B4 | **Optional: parallel access-check speed-up** | code-only: run the tenant-keyed access reads (tenant status, entitlement ∥ subscription, access mode) in parallel, keeping the decision order and fail-closed behaviour; ~0.35–0.4 s per guest page on Staging (`STAGING-QA-REPORT.md` → "Flow first-byte investigation") | performance; security-sensitive path, so it needs explicit approval and its own tests |
| B5 | **tr/it native review** | per language: a reviewer walks `docs/localization/NATIVE-REVIEW-CHECKLIST-tr-it.md` and signs off; the owner chooses the review build (recommended: throwaway Staging build with the switch on, needs a deploy approval) | then the single switch `SPACE_SELECTABLE_LOCALES` in `app/src/lib/i18n/locales.ts` gets `"tr", "it"` |

## C. Owner decisions / notes (no action unless you disagree)

1. **Teach retreat currency** (documented, unchanged since TASK 031): the server accepts any three capital letters (`XYZ`
   shows as `700 XYZ`), not only ISO codes. The Studio picker only offers ISO codes. A stored non-three-letter value
   (`baht`, `€`, only possible via direct SQL) is dropped on read, so guests see `700` with no currency, and that retreat
   needs a currency before it can be saved again. Option: restrict the server to ISO for new/edited rows (as Flow D-CC4).
   This is a decision, not a defect.
2. **Flow legacy free-text prices** are shown raw: `700 baht`, `50 $`, `99.99 €`, `1,500.5 EURO`. Lower-case ISO codes are
   recognised (`usd` → `US$50.00`). Editing an untouched legacy row's name/text saves; changing its price or currency asks for
   an ISO code.
3. **German short dates** are now always `Mi., 14. Okt.` (with comma). The previous output varied by engine.
4. **D6** (low, cosmetic console 404 after replacing a draft image on Staging): not reproducible locally. On Staging only
   the page URL was logged, not the failing resource. Next Staging run (after B1): record the `response` URL of any 4xx
   during an image replace. Likely a request for the old draft object made in the window after the server deleted it and
   before the client switched to the new signed URL (Staging round trips are much longer than local ones); inference, not
   verified. No user-visible effect observed.
