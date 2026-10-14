# TASK 033 — real-iPhone checklist (owner, Staging)

21 steps on a **real iPhone** (latest iOS Safari; an older iOS too if available). Playwright WebKit already passed these
in emulation — this is the real-device confirmation, which emulation cannot give.

**Before you start**
- Staging: `https://innerdwes-env-staging-inner-dwe-s.vercel.app` (`182f47e`). Safari asks for your **Vercel login**
  first (team SSO), then shows the page.
- Studio: log in as the Staging QA owner (packet G3, password from your password manager; never sent in chat).
- Synthetic setup from packet G5 on the two QA Spaces only: S1 dates, S2 sample activities + twin + empty days, S3 access
  code (for I-16–I-21), S4 Teach German (for I-11). Restore all four afterwards and tell me, so I can run the read-only
  restore diff.
- Before G2a, QR codes and share links point at an **old build** (`innerdwes-git-fix-0275-…`); I-12 and I-15 then show
  that host. Record what you see.

**Send back:** folder `iphone-<model>-ios<version>/`, files `I-<n>-<name>.png|mov`, plus one line per step:
`I-n PASS|FAIL – note`. Do not include the access code or the password in screenshots or notes.

## Flow — multi-day Day Navigator (`/s/qa-flow-1h8ve`; needs S1 + S2)

| # | Do | Pass when |
|---|---|---|
| I-1 | Open the Space → Schedule | today's tab is selected (`<WEEKDAY> <date> · DAY 2`, Lisbon date); Today control visible |
| I-2 | Swipe the day strip; tap every day | smooth; no sideways page scroll; each day shows only its own activities; tabs easy to hit |
| I-3 | Tap day 4 and day 5 (empty) | empty-day message; no leftover cards |
| I-4 | Day 2 (twin activity), then switch fast between days 2 ↔ 3 ↔ 2 several times | both twins shown once each on day 2; **never a stale card** on another day (D1) |
| I-5 | Go to Today / Explore, then back to Schedule | same day and content as before |
| I-6 | Daily Inspiration | its day number counts from the retreat start date |
| I-7 | Landscape; then Settings → Display → Text Size larger and reopen | nothing clipped; bottom nav not under the home indicator; header not under the notch |

## Teach (`/s/qa-teach-staging`)

| # | Do | Pass when |
|---|---|---|
| I-8 | Home → week strip, tap through all 14 days | each day's count matches its cards; "0 classes" days show the empty state with "Next:" |
| I-9 | Open a class sheet (e.g. Mon 26 Oct), scroll, close | free-text price `₪65`; sheet clear of notch and home indicator |
| I-10 | Retreats list | prices `THB 700.00`, `€450.00`, `€1,250.50` |
| I-11 | With S4 (German): Home and schedule; also open the same page in Safari on the Mac with Web Inspector → Console | German dates like `Mi., 14. Okt.`; no text "jump" after load; Mac console shows **no React #418** |

## Share Cards

| # | Do | Pass when |
|---|---|---|
| I-12 | Flow Studio → "Share your Space" → share | iOS share sheet opens with the card image + link; note the link host |
| I-13 | Open the shared link's card image route `/s/qa-flow-1h8ve/social/<v>` in Safari | 1200×1200 image of the published Space photo |
| I-14 | Teach Studio → Share Card; change nothing, Republish, reopen the card | card shows the Teach portrait/hero; card version updates after Republish |
| I-15 | Scan the Studio QR with the iPhone camera | opens the Space (after the Vercel login); note the host |

Known Staging limit: WhatsApp / iMessage **link previews** stay empty on Staging (SSO-protected; preview bots have no
Vercel login). Record what you see — not a FAIL.

## Access codes (`/s/qa-flow-1h8ve`; needs S3)

| # | Do | Pass when |
|---|---|---|
| I-16 | Open the Space in a fresh Private tab | code screen inside the app frame; no Space content or images before the code |
| I-17 | Tap the code field | numeric keypad; the SMS/one-time-code suggestion does not insert anything odd; pasting a full 6-digit code works |
| I-18 | Enter wrong codes ~6 times | error each time; then a "too many tries" message. **Wait 10 minutes** (rate-limit window) before I-19 |
| I-19 | Enter the right code; close Safari fully; reopen the link | unlocks; still unlocked after reopening |
| I-20 | Open the same link from Messages or WhatsApp (in-app browser) | same code screen; the right code unlocks |
| I-21 | After S3 restore (code off), reload | Space opens without a code |

General, any page: no blank page longer than ~2 s on 4G/5G; the loader never covers content that already appeared.
