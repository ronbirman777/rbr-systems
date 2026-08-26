# RBR Client Journey Hub

A working prototype of a connected practitioner and client ecosystem.

> Therapy does not end when the session ends.

The product creates supportive continuity between sessions: assigned practices, shared
resources, written reflections, session preparation, gentle check-ins, and an intelligence
layer that learns each client's own rhythm and surfaces meaningful changes in it.

The demo follows **John**, a practitioner with nine clients, and **Emma**, whose story runs
through both experiences.

---

## The story this prototype tells

Open it and follow the path. The **Client View / Practitioner View** control in the lower
right crosses between the two experiences; both read and write the same store, so an action
on one side is visible on the other immediately.

| Step | Where | What it shows |
|---|---|---|
| 1 | **Today** | Emma appears under Needs Attention — usual rhythm 91%, recent rhythm 35% |
| 2 | **View Context** | Personal Rhythm over a 21-day baseline, and what changed |
| 3 | **Read Full Reflection** | What Emma actually wrote, with a private thought attached |
| 4 | **Send a Gentle Check In** | A suggested message John edits and sends himself |
| 5 | **Assign Practice** | A new practice, live in Emma's companion straight away |
| 6 | **Client View** | Emma's day: her session, her practices, the new one among them |
| 7 | **Mark Complete** | Completion recorded by Emma, in a calm 300ms |
| 8 | **Resources → Breathwork** | A paced breathing practice with a working player |
| 9 | **Prepare for Session** | Three questions, answered one at a time |
| 10 | **Practitioner View** | The completion, the practice and the answers are all there |

Settings & Workspace has a reset that returns every screen to its opening state.

---

## Two rules the code enforces

**1. Baseline intelligence is private to the practitioner.**
`services/baselineEngine.ts` compares each client against *their own* learned rhythm — never
a cohort, never a universal target. Its output never crosses into the client companion:
no percentages, no adherence, no streaks, no overdue warnings, no red. The client routes do
not import the selectors that expose a reading, a private note or a private thought.

**2. Nothing is sent automatically.**
The system drafts a check-in; a person reads it, edits it and presses send. There is no code
path that messages a client without that step.

### What the engine actually reads

`readBaseline(signals, config)` takes a full signal set — the learned rhythm, per-day
completion across the baseline, days inactive, weeks together, reflections, session
preparation and resource engagement — and returns a state, a recency-weighted recent rhythm,
a plain sentence, and at most one pattern note. Thresholds live in `BaselineConfig`, so
tuning the engine never touches a component.

It emits ordinary language only. No anomaly score, no confidence value, no z-score, no risk
rating — the words *risk*, *adherence* and *compliance* appear nowhere in the interface.

States: **On Track · Change Detected · Check In Suggested · Recently Inactive · Re Engaged ·
Baseline Forming**.

---

## Completion ownership

A practice is completed in the client companion and nowhere else. The practitioner
workspace shows *that* it happened and *when*; it has no control that would mark a practice
complete on a client's behalf. `Daily Practices` says so on the screen itself.

---

## Running locally

```bash
cd therapist-app
npm install
npm run dev          # http://localhost:5173
npm run build        # type-check and build to dist/
npm run preview      # serve the production build
```

Requires Node 20 or newer.

## Deploying to Netlify

`netlify.toml` is complete, including the SPA redirect every route depends on.

1. *Add new site → Import an existing project*, and pick this repository.
2. Set **Base directory** to `therapist-app`. Build command and publish directory come from
   `netlify.toml`.
3. Deploy. Node 20 is pinned in `[build.environment]`.

Or `netlify deploy --build --prod` from this folder. No environment variables, no secrets,
no paid add-ons. `public/_redirects` carries the same fallback for a drag-and-drop deploy.

---

## Structure

```
therapist-app/
├── netlify.toml                SPA redirect, build and publish configuration
├── public/                     PWA manifest, service worker, icons
└── src/
    ├── app/App.tsx             Providers and the route table
    ├── components/
    │   ├── ui/                 Button, Monogram, StatusBadge, Overlay, Field, Toast…
    │   ├── layout/             Sidebar, PractitionerShell, ClientShell, ModeSwitch
    │   ├── shared/             RhythmMetrics, RhythmChart, PrivateNote
    │   ├── therapist/          PageHeader, SessionItem, CheckInModal,
    │   │   └── panels/         AssignPracticeDrawer, and the seven workspace panels
    │   └── client/             PracticeCard, AudioPlayer, BreathingGuide
    ├── data/                   people, assignments, practices, sessions, reflections,
    │                           resources, journey, checkIns, events
    ├── routes/
    │   ├── therapist/          Today, Clients, ClientWorkspace, ContinuousCare,
    │   │                       Sessions, SessionDetail, Sanctuary, SanctuaryResource,
    │   │                       Settings
    │   └── client/             Today, Journey, Resources, ResourceCategory,
    │                           ResourcePlayer, Sessions, SessionDetail, PreSession,
    │                           Practice
    ├── services/               baselineEngine, selectors, checkInSuggestion
    ├── state/                  store (reducer), AppProvider, persistence
    ├── types/                  the domain model
    └── utils/                  date, format, cn
```

### Routes

```
/practitioner/today                      /client/:id/today
/practitioner/clients                    /client/:id/journey
/practitioner/clients/:id/:tab           /client/:id/resources
/practitioner/care                       /client/:id/resources/:categoryId
/practitioner/sessions                   /client/:id/resource/:resourceId
/practitioner/sessions/:sessionId        /client/:id/sessions
/practitioner/sanctuary                  /client/:id/sessions/:sessionId
/practitioner/sanctuary/:resourceId      /client/:id/sessions/:sessionId/prepare
/practitioner/settings                   /client/:id/practice/:practiceId
```

The seven workspace tabs are real routes, so back and forward behave and any tab can be
linked to directly.

---

## Design system

| Token | Value | |
|---|---|---|
| Deep Forest | `#183C32` | Navigation rail, primary actions |
| Forest Accent | `#285447` | Active states, completed marks |
| Sage | `#92A99C` | Secondary marks, hairlines |
| Soft Sage | `#DDE7E0` | Calm fills |
| Warm Cream | `#F7F4EC` | Quiet surfaces |
| Ivory | `#FCFBF7` | Page ground |
| Primary Text | `#1D2924` | Body |
| Secondary Text | `#5A6E65` | Supporting |
| Soft Amber | `#E6A15C` | A changed rhythm, never an alarm |
| Muted Rose | `#D97770` | A quiet stretch, never an alarm |

**Cormorant Garamond** carries display headings and quoted reflections; **Plus Jakarta Sans**
carries the interface and every figure. Cards are 12px, controls 8px, spacing is on an 8px
step, and depth comes from surface, hairline and space rather than shadow.

**Accessibility.** State always carries a label and an icon, never colour alone. Focus rings
are visible everywhere, overlays trap focus and close on Escape, icon-only controls are a
real 44×44, and `prefers-reduced-motion` disables the animations including the breathing
guide.

---

## Architecture notes

State lives in one reducer (`src/state/store.ts`) shaped like the rows a Postgres schema
would return. Components read through `src/services/selectors.ts` rather than importing mock
data, so moving to Supabase is a service-layer change and not a UI rewrite. The type layer
already describes what a backend would need: practitioner and client accounts, assignments
and dated practice instances, sessions with preparation, reflections with a private
practitioner field, resources, check-ins, and an append-only activity stream.

---

## Known limitations

- **All data is demonstration data held in the browser.** No server, no authentication.
  Changes persist in `localStorage` so a refresh mid-demo keeps its place; the reset in
  Settings clears it.
- **This is a prototype, not clinical infrastructure.** It implements no authentication or
  encryption and makes no HIPAA, GDPR, medical or regulatory claim.
- **The clock is fixed** to Wednesday 26 August 2026, 11:45 (`DEMO_NOW` in `utils/date.ts`),
  the one moment at which the whole narrative lines up.
- **People are shown as monograms, not photographs** — the references draw them that way, and
  a prototype should not invent portraits of therapy clients.
- **Audio players have no recording behind them.** The transport, clock and breathing pace are
  real; no audio file is bundled, and the screens say so.
- **Reminders and notifications exist in the data model but are not delivered.**
- **Join Session is intentionally inert**, labelled with when it opens rather than pretending
  to connect a call.
