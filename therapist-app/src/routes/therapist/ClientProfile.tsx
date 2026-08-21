import { useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarClock, MessageCirclePlus, Plus, Smartphone } from 'lucide-react';
import { useEcosystem } from '@/state/EcosystemProvider';
import {
  activityFor,
  buildDaySignals,
  chaptersForClient,
  lastSessionFor,
  nextSessionFor,
  notesFor,
  practicesFor,
  practicesOn,
  readingFor,
  resourcesForClient,
  sessionsFor,
  unreadForTherapist,
} from '@/services/selectors';
import { Avatar } from '@/components/ui/Avatar';
import { Button, ButtonLink } from '@/components/ui/Button';
import { StatusPill } from '@/components/ui/StatusPill';
import { Tabs } from '@/components/ui/Tabs';
import { Section } from '@/components/ui/Section';
import { RhythmMeter } from '@/components/engagement/RhythmMeter';
import { RhythmStrip, RhythmLegend } from '@/components/engagement/RhythmStrip';
import { ActivityStream } from '@/components/therapist/ActivityStream';
import { PracticeRow } from '@/components/practices/PracticeRow';
import { MessageThread } from '@/components/messages/MessageThread';
import { CheckInDrawer } from '@/components/messages/CheckInDrawer';
import { SessionBriefDrawer } from '@/components/sessions/SessionBriefDrawer';
import { SessionRow } from '@/components/sessions/SessionRow';
import { PrivacyBadge, PrivateNoteBadge } from '@/components/privacy/PrivacyBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { TextArea, ChoiceGroup } from '@/components/ui/Field';
import { useAssign } from '@/components/layout/TherapistShell';
import { JourneyTimeline } from '@/components/client/JourneyTimeline';
import { ResourceGrid } from '@/components/resources/ResourceGrid';
import { clockTime, lastDays, relativeDay, shortDate, timeAgo, todayISO, weekOf, whenLabel } from '@/utils/date';
import { noteTypeLabel, plural } from '@/utils/format';
import type { NoteType } from '@/types';

type Tab = 'overview' | 'rhythm' | 'practices' | 'journey' | 'sessions' | 'messages' | 'notes';

export default function ClientProfile() {
  const { clientId = '' } = useParams();
  const { state, dispatch } = useEcosystem();
  const { openAssign } = useAssign();
  const [tab, setTab] = useState<Tab>('overview');
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [briefFor, setBriefFor] = useState<string | null>(null);
  const [noteBody, setNoteBody] = useState('');
  const [noteType, setNoteType] = useState<NoteType>('observation');

  const client = state.clients.find((c) => c.id === clientId);
  const reading = useMemo(() => (client ? readingFor(state, client.id) : null), [state, client]);

  if (!client || !reading) return <Navigate to="/therapist/clients" replace />;

  const next = nextSessionFor(state, client.id);
  const last = lastSessionFor(state, client.id);
  const all = practicesFor(state, client.id);
  const today = practicesOn(state, client.id, todayISO());
  const week = weekOf().map((date) => ({ date, practices: practicesOn(state, client.id, date) }));
  const trailing = lastDays(7).map((date) => ({ date, practices: practicesOn(state, client.id, date) }));
  const notes = notesFor(state, client.id);
  const unread = unreadForTherapist(state, client.id);

  const history = all
    .filter((p) => p.date <= todayISO())
    .slice()
    .reverse()
    .slice(0, 40);

  const sharedReflections = all.filter((p) => p.completion?.reflection?.visibility === 'shared');
  const privateReflections = all.filter((p) => p.completion?.reflection?.visibility === 'private');

  const saveNote = () => {
    if (!noteBody.trim()) return;
    dispatch({ type: 'note/add', clientId: client.id, noteType, body: noteBody.trim() });
    setNoteBody('');
  };

  return (
    <div className="animate-fade-in">
      <Link
        to="/therapist/clients"
        className="mb-6 inline-flex items-center gap-2 text-sm text-ink-muted transition hover:text-forest-700"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All clients
      </Link>

      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-6 pb-7">
        <div className="flex min-w-0 items-start gap-5">
          <Avatar person={client} size="2xl" className="hidden sm:inline-flex" />
          <Avatar person={client} size="xl" className="sm:hidden" />
          <div className="min-w-0">
            <h1 className="editorial text-[2rem] leading-[1.1] sm:text-[2.5rem]">
              {client.firstName} {client.lastName}
            </h1>
            <p className="mt-1.5 text-base text-ink-muted">{client.focus}</p>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-muted">
              <StatusPill status={reading.status} />
              <span>{plural(client.weeksTogether, 'week')} together</span>
              {next && (
                <span className="flex items-center gap-1.5">
                  <CalendarClock className="h-4 w-4" aria-hidden="true" />
                  Next session {whenLabel(next.startsAt)}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="sm" onClick={() => openAssign({ clientIds: [client.id] })} icon={<Plus className="h-4 w-4" />}>
            Assign activity
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setCheckInOpen(true)}
            icon={<MessageCirclePlus className="h-4 w-4" />}
          >
            Send check-in
          </Button>
          <ButtonLink
            to={`/client/${client.id}/today`}
            variant="ghost"
            size="sm"
            icon={<Smartphone className="h-4 w-4" />}
          >
            Open {client.firstName}'s app
          </ButtonLink>
        </div>
      </header>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        items={[
          { value: 'overview', label: 'Overview' },
          { value: 'rhythm', label: 'Engagement rhythm' },
          { value: 'practices', label: 'Practices' },
          { value: 'journey', label: 'Journey' },
          { value: 'sessions', label: 'Sessions' },
          { value: 'messages', label: 'Messages', count: unread },
          { value: 'notes', label: 'Private notes' },
        ]}
      />

      {tab === 'overview' && (
        <div className="animate-fade-in">
          <Section title="Where things stand" divider={false}>
            <div className="grid gap-8 lg:grid-cols-[1.15fr,1fr]">
              <div>
                <p className="editorial text-xl leading-relaxed text-forest-900">{reading.headline}</p>
                <ul className="mt-4 space-y-2 text-sm text-ink-muted">
                  {reading.observations.map((observation) => (
                    <li key={observation} className="flex gap-2.5">
                      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-sage-400" aria-hidden="true" />
                      {observation}
                    </li>
                  ))}
                </ul>
                <p className="mt-5 max-w-lg rounded-xl bg-sage-100/70 px-4 py-3 text-xs leading-relaxed text-ink-muted">
                  These are observations about activity, not conclusions about how {client.firstName} is.
                  What they mean is yours to decide.
                </p>
              </div>
              <div className="space-y-6">
                <RhythmMeter usual={reading.usualRhythm} recent={reading.recentRhythm} status={reading.status} />
                <div>
                  <p className="eyebrow mb-3">This week</p>
                  <RhythmStrip days={week} />
                </div>
              </div>
            </div>
          </Section>

          <Section title="Today's plan" eyebrow="Continuous care">
            {today.length === 0 ? (
              <EmptyState title="Nothing assigned for today" />
            ) : (
              <div className="hairline-list rounded-xl2 border border-sage-200 bg-white px-4 sm:px-5">
                {today.map((practice) => (
                  <PracticeRow key={practice.id} practice={practice} clientName={client.firstName} />
                ))}
              </div>
            )}
          </Section>

          <Section title="What is shared with you" eyebrow="Privacy">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl2 border border-sage-200 bg-white p-5">
                <PrivacyBadge visibility="shared" />
                <p className="editorial mt-3 text-2xl text-forest-900">{sharedReflections.length}</p>
                <p className="text-sm text-ink-muted">
                  {sharedReflections.length === 1 ? 'reflection' : 'reflections'} {client.firstName} chose to
                  share with you.
                </p>
              </div>
              <div className="rounded-xl2 border border-sage-200 bg-white p-5">
                <PrivacyBadge visibility="private" />
                <p className="editorial mt-3 text-2xl text-forest-900">{privateReflections.length}</p>
                <p className="text-sm text-ink-muted">
                  {privateReflections.length === 1 ? 'reflection' : 'reflections'} kept private. You can see
                  they happened; the content is {client.firstName}'s.
                </p>
              </div>
            </div>
          </Section>

          <Section title="Resources in use" eyebrow="Library">
            <ResourceGrid
              resources={resourcesForClient(state, client.id)}
              onAssign={(resourceId) => openAssign({ clientIds: [client.id], resourceId })}
            />
          </Section>

          <Section title="Recent activity">
            <ActivityStream events={activityFor(state, client.id, 12)} showClient={false} />
          </Section>
        </div>
      )}

      {tab === 'rhythm' && (
        <div className="animate-fade-in">
          <Section title="Engagement rhythm" divider={false} description={`${client.firstName} compared with ${client.firstName}'s own usual pattern — never with other clients.`}>
            <div className="grid gap-8 lg:grid-cols-[1fr,1.1fr]">
              <div className="space-y-6">
                <RhythmMeter usual={reading.usualRhythm} recent={reading.recentRhythm} status={reading.status} />
                <div className="rounded-xl2 bg-cream px-5 py-4">
                  <p className="eyebrow mb-2">Observed</p>
                  <p className="text-base leading-relaxed text-ink">{reading.headline}</p>
                  <ul className="mt-3 space-y-2 text-sm text-ink-muted">
                    {reading.observations.map((observation) => (
                      <li key={observation} className="flex gap-2.5">
                        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-sage-400" aria-hidden="true" />
                        {observation}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="eyebrow mb-2">Signals in this reading</p>
                  <div className="flex flex-wrap gap-2">
                    {reading.contributing.map((signal) => (
                      <span key={signal} className="rounded-full bg-sage-100 px-3 py-1 text-2xs text-forest-700">
                        {signal}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <p className="eyebrow mb-4">Practice rhythm · last 7 days</p>
                <RhythmStrip days={trailing} />
                <div className="mt-5">
                  <RhythmLegend />
                </div>

                <div className="mt-8">
                  <p className="eyebrow mb-3">Day by day</p>
                  <ul className="hairline-list overflow-hidden rounded-xl2 border border-sage-200 bg-white">
                    {buildDaySignals(state, client.id, 7)
                      .slice()
                      .reverse()
                      .map((day) => (
                        <li key={day.date} className="flex items-center justify-between gap-4 px-4 py-3">
                          <span className="text-sm text-ink">{relativeDay(day.date)}</span>
                          <span className="text-sm tabular-nums text-ink-muted">
                            {day.completed} of {day.assigned} completed
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              </div>
            </div>
          </Section>
        </div>
      )}

      {tab === 'practices' && (
        <div className="animate-fade-in">
          <Section
            title="Daily practices"
            divider={false}
            description="Completion always comes from the client app. Nothing here lets you mark a practice complete on their behalf."
            action={
              <Button size="sm" variant="secondary" onClick={() => openAssign({ clientIds: [client.id] })} icon={<Plus className="h-4 w-4" />}>
                Assign
              </Button>
            }
          >
            <div className="hairline-list rounded-xl2 border border-sage-200 bg-white px-4 sm:px-5">
              {history.map((practice) => (
                <PracticeRow key={practice.id} practice={practice} showDate clientName={client.firstName} />
              ))}
            </div>
          </Section>
        </div>
      )}

      {tab === 'journey' && (
        <div className="animate-fade-in">
          <Section title="The journey so far" divider={false}>
            <JourneyTimeline chapters={chaptersForClient(state, client.id)} />
          </Section>
        </div>
      )}

      {tab === 'sessions' && (
        <div className="animate-fade-in">
          <Section title="Sessions" divider={false}>
            <div className="hairline-list rounded-xl2 border border-sage-200 bg-white px-3 sm:px-5">
              {sessionsFor(state, client.id)
                .slice()
                .reverse()
                .map((session) => (
                  <SessionRow
                    key={session.id}
                    session={session}
                    showDay
                    onPrepare={session.status === 'upcoming' ? setBriefFor : undefined}
                  />
                ))}
            </div>
            {last?.notes && (
              <div className="mt-6 rounded-xl2 border border-sage-200 bg-white p-5">
                <PrivateNoteBadge />
                <p className="mt-3 text-sm leading-relaxed text-ink">{last.notes}</p>
                <p className="mt-2 text-2xs text-ink-faint">
                  Session on {shortDate(last.startsAt)} at {clockTime(last.startsAt)}
                </p>
              </div>
            )}
          </Section>
        </div>
      )}

      {tab === 'messages' && (
        <div className="animate-fade-in">
          <Section title="Messages" divider={false}>
            <MessageThread clientId={client.id} viewer="therapist" className="max-h-[36rem]" />
          </Section>
        </div>
      )}

      {tab === 'notes' && (
        <div className="animate-fade-in">
          <Section
            title="Private therapist notes"
            divider={false}
            description={`Visible only to you. ${client.firstName} has no route to this area anywhere in the product.`}
          >
            <div className="rounded-xl2 border border-forest-600/30 bg-forest-900/[0.03] p-5">
              <PrivateNoteBadge />
              <div className="mt-4 space-y-4">
                <ChoiceGroup<NoteType>
                  label="Note type"
                  value={noteType}
                  onChange={setNoteType}
                  columns={3}
                  options={(['session', 'observation', 'follow-up', 'reminder', 'progress'] as NoteType[]).map(
                    (value) => ({ value, label: noteTypeLabel[value] }),
                  )}
                />
                <TextArea
                  rows={3}
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  placeholder="Write a note only you will see."
                  aria-label="New private note"
                />
                <div className="flex justify-end">
                  <Button variant="primary" size="sm" onClick={saveNote} disabled={!noteBody.trim()}>
                    Save note
                  </Button>
                </div>
              </div>
            </div>

            <ul className="mt-6 space-y-3">
              {notes.map((note) => (
                <li key={note.id} className="rounded-xl2 border border-sage-200 bg-white p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="rounded-full bg-cream px-2.5 py-1 text-2xs font-semibold uppercase tracking-widest2 text-ink-muted">
                      {noteTypeLabel[note.type]}
                    </span>
                    <span className="text-2xs text-ink-faint">{timeAgo(note.createdAt)}</span>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-ink">{note.body}</p>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}

      <CheckInDrawer clientId={client.id} open={checkInOpen} onClose={() => setCheckInOpen(false)} />
      <SessionBriefDrawer sessionId={briefFor} open={briefFor !== null} onClose={() => setBriefFor(null)} />
    </div>
  );
}
