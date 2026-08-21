# RBR Therapist Companion

A working, click-through demonstration of a connected **therapist and client ecosystem**.

> Therapy does not end when the session ends.

The product helps a therapist stay in contact with clients between sessions — through
assigned practices, shared resources, reflections, session preparation, messaging, and a
quiet engagement-rhythm engine that surfaces meaningful changes without turning anyone
into a number.

The demo follows **John Miller**, a psychotherapist with nine active clients, and
**Emma Wilson**, the client whose story runs through the whole product.

---

## The five-minute demo

Open the app and follow the story. The "View as" control in the header moves between
John's and Emma's experience; both read and write the same shared state, so an action on
one side is immediately visible on the other.

| # | Do this | What it shows |
|---|---------|---------------|
| 1 | Land on **Therapist → Today** | Emma appears under *Needs Your Attention*: usual rhythm 91%, recent pattern 35% |
| 2 | Open **Emma** | Usual rhythm, recent pattern, weekly practice strip, missed evening practices, next session |
| 3 | Switch **View as → Emma** | Emma's own Today: her focus, her next session, her four practices |
| 4 | Open **Morning breathing** and mark it complete | Completion is written by the client, never by the therapist |
| 5 | Switch back to **John** | The completion is in *Recent Activity* and on Emma's profile — no toast, no interruption |
| 6 | On Today, press **Send check-in** on Emma's card | A suggested message John can edit, save or dismiss. Nothing sends itself |
| 7 | Switch to **Emma → Messages** and reply | Emma receives the check-in and answers it |
| 8 | Switch to **John → Messages** | The reply is there, marked unread until he opens it |
| 9 | On Today, press **Prepare** on Emma's 10:30 session | The Session Brief: what Emma completed since Tuesday, one reflection shared, one kept private |
| 10 | As Emma, complete the rest of the day's practices | Her rhythm recovers |
| 11 | Return to **John → Today** | Emma has moved to *Positive Momentum* with the status **Re-Engaged** |

Use the small reset control beside "View as" to return the demo to its starting state.

---

## What is in here

### Therapist app
- **Today** — a daily briefing, not a KPI dashboard: who may need attention, what is coming
  up, what is going well, and what has happened since John last looked.
- **Clients** — a searchable, filterable directory with each client's own rhythm comparison.
- **Client profile** — overview, engagement rhythm, practices, journey, sessions, messages
  and private notes for one person.
- **Continuous Care** — the operational view of everything assigned across the practice,
  filterable by client, activity type and state.
- **Sessions** — today, upcoming and past, with preparation state and session notes.
- **Session Brief** — a pre-session summary of observable activity since the last session.
- **Messages** — an internal, asynchronous thread per client.
- **Resources** — a curated library with previews and one-tap assignment.
- **Assign Activity** — a drawer that takes a few seconds: one or many clients, type, title,
  instructions, date, time, repeat, reminder, resource and an optional message.

### Client app (mobile-first)
- **Today** — focus, next session, today's practices, a message from John, journey, resources
  and a closing reflection.
- **Practice detail** — instructions, guided audio where applicable, an optional written
  reflection with an explicit privacy choice, and a gentle completion acknowledgement.
- **Journey** — chapters and milestones told as a narrative. No levels, points or badges.
- **Messages** — the same thread, from the other side.
- **Resources** — what John has chosen for this client.
- **Profile & Privacy** — what John can see, what stays private, and the ability to change
  the visibility of anything already written.

---

## Two rules the code enforces

**1. Completion belongs to the client.**
`practice/complete` is dispatched only from the client experience, and every completion
record carries `source: 'client'`. The therapist app has no control anywhere that would
let John mark a practice complete on a client's behalf; it shows *that* it was completed
and *when*. A future administrative correction feature would be a separate, clearly
labelled action — not a checkbox that impersonates the client.

**2. The system observes; the therapist interprets.**
`src/services/engagementEngine.ts` compares each client against **their own** usual rhythm —
never against other clients, and never against a universal completion threshold. It emits
plain observations ("Evening practices have been less consistent since Wednesday") and
never a risk score, a compliance rating or a clinical direction. The words *telemetry*,
*risk*, *compliance* and *non-compliant* appear nowhere in the interface.

### The engagement engine

`evaluateEngagement(signals, config)` accepts a full signal set — usual completion rate,
per-day recent completion, assigned volume, missed-activity sequence, days inactive,
response timing, session preparation and resource engagement — and returns a status,
a recency-weighted recent rhythm, plain-language observations and an ordering weight.
Thresholds live in `EngagementConfig`, so tuning the engine (or replacing the mock signals
with real ones) never touches a component.

Visible statuses: **On Track · Change Detected · Check-In Suggested · Recently Inactive ·
Re-Engaged · New Client**.

---

## Running locally

```bash
cd therapist-app
npm install
npm run dev          # http://localhost:5173
```

```bash
npm run build        # type-check and build to dist/
npm run preview      # serve the production build
npm run typecheck    # types only
```

Requires Node 20 or newer.

---

## Deploying to Netlify

`netlify.toml` in this folder is complete and includes the SPA redirect that every route
depends on.

**From the Netlify UI**

1. *Add new site → Import an existing project* and choose this GitHub repository.
2. Set **Base directory** to `therapist-app`.
   Build command (`npm run build`) and publish directory (`dist`) are read from `netlify.toml`.
3. Deploy. Netlify uses Node 20, pinned in `[build.environment]`.

**From the CLI**

```bash
npm i -g netlify-cli
cd therapist-app
netlify deploy --build --prod
```

No environment variables, no secrets, no paid add-ons. `public/_redirects` carries the same
SPA fallback for a plain drag-and-drop deploy.

---

## Pushing to GitHub

```bash
git add therapist-app
git commit -m "Add RBR Therapist Companion demo"
git push -u origin <branch>
```

`therapist-app/.gitignore` keeps `node_modules`, `dist` and `.netlify` out of the repository.
Nothing in the project reads a secret or an API key.

---

## Project structure

```
therapist-app/
├── netlify.toml                  Build, publish and SPA redirect configuration
├── index.html                    Fonts, PWA manifest, theme colour
├── public/
│   ├── manifest.webmanifest      Installable PWA metadata
│   ├── _redirects                SPA fallback for drag-and-drop deploys
│   ├── favicon.svg
│   └── icons/
└── src/
    ├── app/
    │   ├── App.tsx               Providers and every route
    │   └── ScrollToTop.tsx
    ├── components/
    │   ├── ui/                   Avatar, Button, Drawer, Field, Tabs, StatusPill, Toast…
    │   ├── layout/               TherapistShell, ClientShell, DemoSwitcher
    │   ├── therapist/            AttentionCard, ActivityStream
    │   ├── client/               PracticeCard, JourneyTimeline, AudioPlayer
    │   ├── engagement/           RhythmMeter, RhythmStrip
    │   ├── messages/             MessageThread, CheckInDrawer
    │   ├── sessions/             SessionRow, SessionBriefDrawer
    │   ├── resources/            ResourceGrid
    │   ├── practices/            PracticeRow, AssignActivityDrawer
    │   └── privacy/              PrivacyBadge, PrivateNoteBadge
    ├── data/                     people, practicePlans, mockPractices, mockSessions,
    │                             mockMessages, mockResources, mockNotes, mockJourney,
    │                             mockEvents
    ├── routes/
    │   ├── therapist/            Today, ClientDirectory, ClientProfile, ContinuousCare,
    │   │                         Sessions, Messages, Resources
    │   └── client/               Today, Practices, PracticeDetail, Journey, Messages,
    │                             Resources, Privacy
    ├── services/                 engagementEngine, selectors, sessionBrief, checkIn
    ├── state/                    ecosystemReducer, EcosystemProvider
    ├── types/                    The domain model
    ├── utils/                    date, format, cn
    └── index.css                 Design tokens and base layer
```

### Routes

```
/therapist/today                /client/:clientId/today
/therapist/clients              /client/:clientId/practices
/therapist/clients/:clientId    /client/:clientId/practices/:practiceId
/therapist/care                 /client/:clientId/journey
/therapist/sessions             /client/:clientId/messages
/therapist/messages             /client/:clientId/resources
/therapist/messages/:clientId   /client/:clientId/privacy
/therapist/resources
```

---

## Design system

| Token | Value | |
|---|---|---|
| Deep Forest | `#183C32` | Navigation rail, primary actions, focus surfaces |
| Forest Accent | `#285447` | Active states, completed marks |
| Sage | `#92A99C` | Secondary marks and dividers |
| Soft Sage | `#DDE7E0` | Calm fills |
| Warm Cream | `#F7F4EC` | Quiet surfaces |
| Ivory | `#FCFBF7` | Page ground |
| Dark Text | `#1D2924` | Body |
| Muted Text | `#5A6E65` | Secondary |

Amber (`#C99A4E`) and muted rose (`#B08383`) appear only as low-saturation washes for
non-alarming status. There is no red anywhere.

**Instrument Serif** carries selected editorial headings; **Plus Jakarta Sans** carries the
interface. Hierarchy comes from typography, whitespace and hairlines rather than from
wrapping everything in cards.

**Accessibility.** Status is never communicated by colour alone — every status carries a
label and an icon. Focus rings are visible on all interactive elements, drawers trap focus
and close on Escape, touch targets are at least 44px, and `prefers-reduced-motion` is
honoured.

---

## Architecture notes

State lives in one reducer (`src/state/ecosystemReducer.ts`) shaped like the responses a
real API would return. Components read through selectors in `src/services/selectors.ts`
rather than importing mock objects directly, so replacing the reducer with server calls is
a service-layer change and not a UI rewrite.

The type layer in `src/types/index.ts` already describes what a backend would need to
support: therapist and client accounts, row-level permissions on reflections and private
notes, message threads, an append-only activity event stream, resources, session records,
and the signal set the engagement engine consumes.

---

## Known demo limitations

- **All data is mock data held in the browser.** There is no backend and no authentication.
  Demo state is kept in `sessionStorage`, so an accidental refresh mid-story does not lose
  your place, while a new tab always opens clean. The reset control clears it outright.
- **The clock is fixed** to Friday, 21 August 2026, 08:15, so the narrative always lines up
  (`DEMO_NOW` in `src/utils/date.ts`). Emma's 10:30 session is later the same morning.
- **Portraits are referenced from a public demo endpoint** (`randomuser.me`) in
  `src/data/people.ts`. If an image cannot load, a designed monogram takes its place, so the
  demo never shows a broken frame. Drop licensed photography into `src/assets/` and change
  that one file to use it.
- **Guided audio has no recording behind it.** The player runs the session clock and the
  breathing motion so the practice feels real, but no audio file is bundled.
- **Reminders, push and email are represented in the data model but not delivered.** The
  fields exist on every assignment; nothing is sent.
- **The engagement engine uses realistic mock signals.** The signal set and configuration are
  the real ones; the values behind them are generated from `src/data/practicePlans.ts`.
- **No compliance claim is made.** This is a demonstration application. It does not claim
  HIPAA, GDPR, medical or clinical compliance, and it displays no certification badges.
