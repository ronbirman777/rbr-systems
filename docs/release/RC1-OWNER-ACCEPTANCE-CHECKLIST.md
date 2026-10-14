# RC1 on Staging: owner acceptance checklist

This list covers what is deployed on Staging: `53195cc` (RC1 `8ed8ea5` plus the D1–D4 fixes, the 431 px column, the
Teach-style day chips and sharper Guest images). Items marked **(fix redeploy #1)** were re-checked automatically on
2026-10-15 (report section 7). They still need your eyes on a real iPhone.

**Before you start**

- Use one session: a real iPhone, then a desktop browser.
- Staging is protected. Sign in to Vercel when it asks.
- Staging address: **https://innerdwes-env-staging-inner-dwe-s.vercel.app**. Every link below starts with it.
- Test Spaces: **QA Flow Retreat (synthetic)** and **QA Teacher**. Please do not edit `qa-staging-retreat`.

## Flow Guest App: [/s/qa-flow-1h8ve](https://innerdwes-env-staging-inner-dwe-s.vercel.app/s/qa-flow-1h8ve)

- [ ] On iPhone it fills the screen. In any window wider than a large phone (from 431 px, including a tablet or a
      narrow desktop window) it is a phone-width column in the middle, with a soft backdrop on both sides. There is no
      in-between stretched layout **(fix redeploy #1)**.
- [ ] The bottom bar (Today, Schedule, Team, Explore) stays inside the app on desktop. Nothing scrolls sideways.
- [ ] **Today:** greeting, date, tagline, "What to bring" / "What to expect", and the quote all show.
- [ ] **Schedule:** sessions show for 3 October. (The retreat dates 13–17 Oct are saved in Studio but not published,
      on purpose.)
- [ ] **Day chips (optional, needs a Republish of QA Flow):** after a Republish, the retreat days 13–17 Oct show as
      chips that look like Teach's week strip: rounded, filled, with the weekday and date, and the selected day in the
      navigation colour. "Day 2" moves to the line under the chips ("Wed 14 Oct · Day 2"). In Hebrew the chips run
      right to left **(fix redeploy #1)**.
- [ ] **Images:** on a Retina screen and on iPhone, the Today hero photo is sharp, not soft **(fix redeploy #1)**.
- [ ] **Explore:** each card opens (Meals, Treatments, Facilities, Arrival information, Guidelines, Questions, Readings,
      Audio, Stay connected, custom pages). Back returns to Explore.
- [ ] **Treatments:** the price reads "THB 700.00".
- [ ] While the page loads you see the InnerDweS loader, then the app. The loader never covers the app once it has
      appeared.
- [ ] A wrong address, for example [/s/qa-no-such-space](https://innerdwes-env-staging-inner-dwe-s.vercel.app/s/qa-no-such-space),
      shows "This Space isn't available" inside the same phone-width frame.

## Teach Guest App: [/s/qa-teach-staging](https://innerdwes-env-staging-inner-dwe-s.vercel.app/s/qa-teach-staging)

- [ ] Phone layout with the bottom tabs (Home, Schedule, About Me, Explore) on iPhone and on desktop. Never a wide
      website layout.
- [ ] **Images:** the teacher portrait on Home, the "More from" cards, and any class photo are sharp on a Retina screen
      and on iPhone **(fix redeploy #1)**. The QA classes have no photos, so check class thumbnails on a Space that
      has them.
- [ ] **Schedule:** the week strip shows 14 days with class counts. Tapping a class opens its details in place (repeat
      rule, description, price "₪65", length).
- [ ] **Explore:** Readings, Audio, Retreats, Contact and the custom page each open.

## Flow Studio: [/space](https://innerdwes-env-staging-inner-dwe-s.vercel.app/space), then Manage Space on QA Flow Retreat

Sign in on iPhone at [/log-in](https://innerdwes-env-staging-inner-dwe-s.vercel.app/log-in). The page must not zoom in
when you tap a field.

- [ ] **Menu:** scroll to the very bottom of **Brand**, then tap the menu button. The menu opens fully on screen.
      Closing it returns you to the same place. Do the same from the bottom of **Schedule**.
- [ ] **Schedule**, "+ Add Session":
  - [ ] An edit panel opens with 09:00–10:00.
  - [ ] Change the start time: the end time moves with it and keeps one hour.
  - [ ] Type your own end time, then change the start again: your end time stays.
  - [ ] Leave the step without saving and choose "Leave without saving". When you come back there is **no new or
        "Untitled" row**.
- [ ] **Schedule**, Duplicate:
  - [ ] Duplicate a session and save: exactly **one** copy appears. The original is unchanged.
  - [ ] Remove the copy and save: only the copy is gone.
- [ ] **Schedule:** a note says that sessions outside the retreat dates are hidden from guests.
- [ ] **Arrival Info**, "Preparing for arrival":
  - [ ] What to bring / What to expect are edited here. Save, then reopen: they are kept.
  - [ ] **Retreat Home** points you to Arrival Info for these lists instead of showing a second editor.
- [ ] **Brand:**
  - [ ] There are 8 colour presets.
  - [ ] "Customize colors" gives Primary and Accent.
  - [ ] "Advanced colours" gives navigation and text colours.
  - [ ] There is **no** "Background tint" in Flow.
- [ ] **Share your Space:**
  - [ ] Turn on "Require a 6-digit code", then open the Guest App in a private window. You get the code screen, a wrong
        code is refused, and the right code opens the app.
  - [ ] Turn the code off again.
- [ ] **Identity → Language:** switch to עברית and publish, then check the Guest App reads right-to-left. Switch back to
      English and publish.
- [ ] **Stay connected** on iPhone **(fix redeploy #1)**: tapping the platform picker does not zoom the page. At the
      smallest phone width the row fits without sideways scrolling.
- [ ] **My Spaces** confirm boxes (Archive / Replace / Delete) on iPhone **(fix redeploy #1)**: typing in them does
      not zoom the page.

## Teach Studio: [/space](https://innerdwes-env-staging-inner-dwe-s.vercel.app/space), then Manage Space on QA Teacher

- [ ] **Menu:** opened from the bottom of **Brand** and of **Schedule**, it shows fully on screen.
- [ ] **Brand:**
  - [ ] There are 8 presets and "Customize colors" (Primary, Accent, **Background tint**).
  - [ ] "Advanced colours" contains the "Fine-tune navigation and text colours" switch.
- [ ] **Publish** opens the Publish section, and Republish updates the Guest App.

## Admin: [/admin](https://innerdwes-env-staging-inner-dwe-s.vercel.app/admin)

Your own account is not an admin. These checks need your own first Staging admin grant, which is a separate approval.
Until then, `/admin` shows a plain 404. That is correct.

- [ ] After your grant, `/admin` takes you to set up an authenticator. Scan the QR code, enter a code, and you land on
      **Overview**.
- [ ] **Overview** and **Spaces & Customers:** today's counts are 5 Spaces (3 Flow, 2 Teach), 4 published,
      1 never-published draft, 0 paid subscriptions.
- [ ] **Launch & exemptions** shows "Paid checkout: DISABLED". Do not turn it on.
- [ ] Billing pages show no customer e-mail addresses. Only admin addresses appear (you, the admin list, the audit log).
- [ ] Add a backup authenticator (header link). Then sign out and sign in with the **backup** several times in a row.
      Every correct code must be accepted, with either authenticator **(fix redeploy #1)**. The automated re-check
      accepted 24 of 24 sign-ins, alternating both factors.

## Languages

- [ ] A Space's language can be English, Deutsch, Español, Français or עברית. Turkish and Italian are not offered for
      Spaces.
- [ ] In Hebrew, the Guest App and Studio read right-to-left, and the day picker moves the right way.

## Legal: [/legal](https://innerdwes-env-staging-inner-dwe-s.vercel.app/legal)

- [ ] Seven documents open: Terms, Privacy, DPA and Billing at Version 1.1; Acceptable Use, Copyright and
      Subprocessors at 1.0.
- [ ] [/terms](https://innerdwes-env-staging-inner-dwe-s.vercel.app/terms) and
      [/privacy](https://innerdwes-env-staging-inner-dwe-s.vercel.app/privacy) lead to them.
