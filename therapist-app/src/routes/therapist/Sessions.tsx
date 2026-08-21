import { useMemo, useState } from 'react';
import { useEcosystem } from '@/state/EcosystemProvider';
import { pastSessions, prepProgress, todaysSessions, upcomingSessions } from '@/services/selectors';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Tabs';
import { SessionRow } from '@/components/sessions/SessionRow';
import { SessionBriefDrawer } from '@/components/sessions/SessionBriefDrawer';
import { EmptyState } from '@/components/ui/EmptyState';
import { Section } from '@/components/ui/Section';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { PrivateNoteBadge } from '@/components/privacy/PrivacyBadge';
import { TextArea } from '@/components/ui/Field';
import { useAssign } from '@/components/layout/TherapistShell';
import { clockTime, longDate, relativeDay } from '@/utils/date';
import { plural, sessionTypeLabel } from '@/utils/format';

type Tab = 'today' | 'upcoming' | 'past';

export default function TherapistSessions() {
  const { state, dispatch } = useEcosystem();
  const { openAssign } = useAssign();
  const [tab, setTab] = useState<Tab>('today');
  const [briefFor, setBriefFor] = useState<string | null>(null);
  const [notesFor, setNotesFor] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

  const today = useMemo(() => todaysSessions(state), [state]);
  const upcoming = useMemo(() => upcomingSessions(state), [state]);
  const past = useMemo(() => pastSessions(state), [state]);

  const list = tab === 'today' ? today : tab === 'upcoming' ? upcoming : past;

  return (
    <div className="animate-fade-in">
      <PageHeader
        eyebrow="Sessions"
        title="The shape of the week"
        lede={`${plural(today.length, 'session')} today, ${upcoming.length} scheduled beyond it.`}
      />

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        items={[
          { value: 'today', label: 'Today', count: today.length },
          { value: 'upcoming', label: 'Upcoming', count: upcoming.length },
          { value: 'past', label: 'Past', count: past.length },
        ]}
      />

      {tab === 'today' && today.length > 0 && (
        <p className="pt-6 text-sm text-ink-muted">{longDate()}</p>
      )}

      <div className="pt-4">
        {list.length === 0 ? (
          <EmptyState
            title={tab === 'today' ? 'No sessions today' : tab === 'upcoming' ? 'Nothing scheduled yet' : 'No past sessions'}
          />
        ) : tab === 'past' ? (
          <ul className="space-y-3">
            {list.map((session) => {
              const client = state.clients.find((c) => c.id === session.clientId)!;
              const open = notesFor === session.id;
              return (
                <li key={session.id} className="rounded-xl2 border border-sage-200 bg-white p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3.5">
                      <Avatar person={client} size="md" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink">
                          {client.firstName} {client.lastName}
                        </p>
                        <p className="text-xs text-ink-muted">
                          {relativeDay(session.startsAt)} · {clockTime(session.startsAt)} ·{' '}
                          {sessionTypeLabel[session.type]} · {session.durationMin} min
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setNotesFor(open ? null : session.id);
                          setNoteDraft(session.notes ?? '');
                        }}
                      >
                        {session.notes ? 'Session note' : 'Add note'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openAssign({ clientIds: [client.id] })}>
                        Assign follow-up
                      </Button>
                    </div>
                  </div>

                  {(open || session.notes) && (
                    <div className="mt-4 rounded-xl border border-sage-200 bg-cream/60 p-4">
                      <PrivateNoteBadge />
                      {open ? (
                        <>
                          <TextArea
                            rows={3}
                            className="mt-3"
                            value={noteDraft}
                            onChange={(e) => setNoteDraft(e.target.value)}
                            aria-label="Session note"
                            placeholder="What is worth remembering from this session?"
                          />
                          <div className="mt-3 flex justify-end gap-2">
                            <Button size="sm" variant="ghost" onClick={() => setNotesFor(null)}>
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => {
                                dispatch({ type: 'session/save-notes', sessionId: session.id, notes: noteDraft });
                                setNotesFor(null);
                              }}
                            >
                              Save note
                            </Button>
                          </div>
                        </>
                      ) : (
                        <p className="mt-3 text-sm leading-relaxed text-ink">{session.notes}</p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="hairline-list rounded-xl2 border border-sage-200 bg-white px-3 sm:px-5">
            {list.map((session) => (
              <div key={session.id}>
                <SessionRow session={session} showDay={tab !== 'today'} onPrepare={setBriefFor} />
                <p className="px-1 pb-3 text-2xs text-ink-faint md:hidden">
                  {prepProgress(session).answered} of {prepProgress(session).total} preparation prompts completed
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {tab === 'today' && upcoming.length > 0 && (
        <Section eyebrow="Later this week" title="What is coming after today">
          <div className="hairline-list rounded-xl2 border border-sage-200 bg-white px-3 sm:px-5">
            {upcoming.slice(0, 4).map((session) => (
              <SessionRow key={session.id} session={session} showDay compact onPrepare={setBriefFor} />
            ))}
          </div>
        </Section>
      )}

      <SessionBriefDrawer sessionId={briefFor} open={briefFor !== null} onClose={() => setBriefFor(null)} />
    </div>
  );
}
