# Product completion phase

The prototype already told one day well. This phase gave it the rest of the loop — the
part where a session is arranged, prepared for, held, written up, and followed by the next
one.

> Availability → booking → preparation → session → private notes → follow-up →
> daily practices → engagement rhythm → supportive check-in → next session.

Nothing was rebuilt. The visual language, the baseline engine, the privacy boundary and
every screen that already worked are untouched; what follows was added around them.

---

## 1. What the app could not do before

| Missing | Where it now lives |
|---|---|
| Any notion of when the practitioner is free | `data/availability.ts`, `services/scheduling.ts` |
| A calendar beyond a list of today's sessions | `routes/therapist/Sessions.tsx` — day, week, month |
| Creating, moving or cancelling a session | `SessionFormDrawer`, `RescheduleModal`, `CancelModal` |
| Recurring appointments | `SessionSeries` + `expandSeries()` in the store |
| Blocked time and one-off exceptions | `BlockTimeDrawer`, `AvailabilityException` |
| A client booking anything at all | `routes/client/Book.tsx` |
| Approval, decline, or suggesting another time | `BookingRequestCard` |
| Attaching preparation to a specific session | `PreparationDrawer` |
| A place to close a session out | `CompleteSessionDrawer` |
| Editing the Sanctuary rather than reading it | `ResourceFormDrawer`, `AssignResourceDrawer` |
| Two-way messages | `MessageThread`, `MessagesPanel`, `routes/client/Messages.tsx` |
| Creating anything from anywhere | `components/layout/QuickCreate.tsx` |

---

## 2. The one scheduling rule

Everything the calendar and the booking flow show comes from a single statement, in
`services/scheduling.ts`:

```
bookable  =  availability
           − booked sessions
           − reserved recurring slots
           − blocked time
           − accepted requests
           − pending requests
```

Two consequences the code depends on:

**Recurrence is expanded, not interpreted.** A `SessionSeries` is materialised into real
`Session` rows across an 84-day horizon (`expandSeries`), so conflict detection only ever
reasons about concrete appointments. Editing a series re-lays the occurrences still ahead
and leaves everything already held, completed or cancelled exactly as it was.

**Conflicts are reported in full, in plain language.** `findConflicts` returns every clash
rather than the first — *"Another appointment is already booked at this time."*,
*"This time is blocked out."*, *"A booking request is waiting on this time."* — so a form
can explain the whole picture at once.

---

## 3. What each side sees

The client is offered **times, and nothing else**. `bookableSlots` returns start times with
no reason attached, so Emma never learns that a slot is missing because Daniel has it, or
because the hour is blocked, or that another client's standing appointment reserves it.

The practitioner sees all three concepts kept visually distinct on the calendar:
appointments as solid cards, bookable availability as dashed sage chips, blocked time in
rose, with a legend that names them.

Booking runs in one of two modes (`state.bookingMode`): **request** — every booking waits
for the practitioner — or **instant**, where a confirmed time is held the moment the client
confirms. The client copy changes with the mode rather than promising something untrue.

---

## 4. Privacy, still structural

Private clinical notes, the baseline reading, private thoughts on reflections and the
rhythm figures are practitioner-only, and that is enforced by what the client routes are
allowed to import — not by hiding a component. No file under `routes/client/` or
`components/client/` imports `readingFor`, `readBaseline`, `privateNotes`, `privateThought`,
`usualRhythm`, `RhythmMetrics` or `PrivateNote`.

The end-to-end test walks Emma's six routes after John writes a private note about her and
asserts the text appears on none of them.

---

## 5. State

One reducer, 37 actions, shaped like rows a Postgres schema would return.

```
practice/complete · assignment/create · reflection/*
session/create|reschedule|cancel|complete|private-notes|toggle-action|pre-session
series/update
availability/replace|block|unblock
booking/mode|request|accept|decline|suggest
preparation/attach|complete|remove
resource/save|archive|restore|duplicate|assign|open
message/send|save-draft|mark-read · notification/read|read-all
mode/set · demo/reset
```

Cancellation never deletes. A cancelled session keeps its row with `status: 'cancelled'`,
who cancelled it and why, and stays in the client's history. Series actions carry a scope —
`this | future | series` — so one occurrence can be dropped without disturbing the rest.

---

## 6. Verification

Run against the production build (`vite preview`), not the dev server.

**The full demo scenario** — availability → Emma books → John accepts → preparation attached
→ Emma completes it → John completes the session with a private note → the note never
crosses to Emma. 10 stages, **0 problems**. The times Emma is offered for Tuesday
1 September are exactly:

```
9:00 AM   10:00 AM   12:00 PM   2:00 PM   3:00 PM   4:00 PM
```

11:00 is absent because Daniel has it; 1:00 PM is absent because the hour is blocked for
lunch. Emma is told neither.

**Recurring appointments** — a weekly Tuesday 10:30 standing hour reserves its slot on every
future Tuesday, is refused to other clients, moves its future occurrences when the series is
edited, and keeps a cancelled occurrence in history while the others stand.

**Layout** — 19 routes × 8 widths from 375px to 1728px: no horizontal overflow, no console
or page errors.

**Controls** — around 200 enabled buttons across 17 routes, each clicked from a clean state and
checked for an effect. Every no-op was then verified by hand; all are correct behaviour —
an already-selected filter chip, and the demo reset on a store that is already pristine.

**The earlier narrative** — the original thirteen-step walkthrough (dashboard → reflection →
check-in → assign → complete → resource → prepare → John sees it → survives a refresh) still
passes end to end.

### Six defects this found and fixed

1. **No booking request could ever be accepted.** A pending request overlaps the time it is
   asking for, so it was detected as a conflict with itself and the Accept button was
   permanently disabled. `findConflicts` now takes `ignoreRequestId`, and the card passes
   its own id.
2. **The whole-card tap target in the client companion was dead.** The overlay button that
   opens a practice sat at `z-index: -1`, behind its own card background, so it could not be
   tapped anywhere. It now sits above the card, and the action button inside lifts clear of
   it.
3. **Editing a standing appointment left the old hour blocked.** `series/update` changed the
   rule but not the appointments it had already produced, so moving a series to 11:30 blocked
   *both* 10:30 and 11:30. Future occurrences are now re-laid from the new definition.

4. **The breathing practice had no way to start.** Widening the resource formats moved
   `4 7 8 Parasympathetic` from `audio` to `breathing`, and only audio, meditation and video
   rendered a transport — so the guide sat at *Ready* with no control. Formats that run on a
   clock now carry a transport whether or not a recording exists behind it; the
   *no recording is bundled* note stays with the formats that would have had one.
5. **Two lists could render nothing and say nothing** — a client's sessions and their journey
   chapters. Both now have an empty state, as does the client's own journey view.
6. **The session brief contradicted the screen it sat on.** It counted preparation from the
   older free-form questions against a hard-coded total of three, so it read
   *0 of 3 session preparation questions answered* directly above *1 of 1 completed* and the
   answer itself. It now counts what is actually attached, and falls back to the older
   questions only for a session with nothing attached.

Two smaller corrections: a session more than a week out now reads *"Tuesday Sep 22, 2:00 PM"*
rather than an ambiguous *"Tuesday"*, and completing a session is reachable before the hour
has passed — with the drawer saying so — so the arc can be walked in one sitting.

---

## 7. Known limitations

- **Time does not pass.** The clock is fixed to Wednesday 26 August 2026, 11:45. Sessions do
  not become past while you watch, and reminders do not fire.
- **Availability is a weekly pattern plus exceptions**, with a single timezone and no
  practitioner-side travel, holidays as ranges, or per-client rules.
- **Recurrence covers weekly, biweekly and monthly** with no end date, no "third Thursday",
  and an 84-day expansion horizon.
- **Everything is in the browser.** No server, no authentication, no calendar sync, no email
  or push delivery, no video provider behind Start Video.
- **Double-booking protection is advisory in one direction only** — the practitioner can be
  warned and still choose; a client is never offered a taken time in the first place.

## 8. What a backend would need

The type layer already describes it: practitioner and client accounts; availability rules and
dated exceptions; session series and their materialised occurrences; sessions with
preparation, private notes and action items; booking requests with a status machine;
assignments and dated practice instances; reflections with a private practitioner field;
resources and per-client assignments; messages; and an append-only activity stream.

The work that is genuinely server-side: authentication and per-client authorisation, a
timezone-correct availability service, transactional booking so two clients cannot take one
slot, delivery of reminders and notifications, and encryption of the private note field at
rest.
