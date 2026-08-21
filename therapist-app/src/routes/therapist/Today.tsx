import { useMemo, useState } from 'react';
import { ArrowUpRight, Plus } from 'lucide-react';
import { useEcosystem } from '@/state/EcosystemProvider';
import {
  attentionStatuses,
} from '@/services/engagementEngine';
import { clientsWithReadings, recentActivity, todaysSessions } from '@/services/selectors';
import { Section } from '@/components/ui/Section';
import { Button, ButtonLink } from '@/components/ui/Button';
import { AttentionCard } from '@/components/therapist/AttentionCard';
import { ActivityStream } from '@/components/therapist/ActivityStream';
import { SessionRow } from '@/components/sessions/SessionRow';
import { CheckInDrawer } from '@/components/messages/CheckInDrawer';
import { SessionBriefDrawer } from '@/components/sessions/SessionBriefDrawer';
import { EmptyState } from '@/components/ui/EmptyState';
import { Avatar } from '@/components/ui/Avatar';
import { StatusPill } from '@/components/ui/StatusPill';
import { useAssign } from '@/components/layout/TherapistShell';
import { greeting, longDate } from '@/utils/date';
import { plural } from '@/utils/format';

/**
 * Today is a daily briefing, not a dashboard. It answers four questions in
 * order: who may need attention, what is coming up, what is going well, and
 * what has happened since John last looked.
 */
export default function TherapistToday() {
  const { state } = useEcosystem();
  const { openAssign } = useAssign();
  const [checkInFor, setCheckInFor] = useState<string | null>(null);
  const [briefFor, setBriefFor] = useState<string | null>(null);

  const entries = useMemo(() => clientsWithReadings(state), [state]);
  const sessions = useMemo(() => todaysSessions(state), [state]);
  const activity = useMemo(() => recentActivity(state, 10), [state]);

  const attention = entries
    .filter((entry) => attentionStatuses.includes(entry.reading.status))
    .sort((a, b) => b.reading.attentionWeight - a.reading.attentionWeight);

  const momentum = entries.filter(
    (entry) => entry.reading.status === 're-engaged' || entry.client.reEngagedOn,
  );

  const primary = attention.slice(0, 2);
  const secondary = attention.slice(2);

  return (
    <div className="animate-fade-in">
      <header className="pb-2 pt-2">
        <p className="eyebrow mb-3">{longDate()}</p>
        <h1 className="editorial text-[2.25rem] leading-[1.05] sm:text-[3rem]">
          {greeting()}, {state.therapist.firstName}
        </h1>
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink-muted">
          <span>{plural(state.clients.length, 'active client')}</span>
          <span className="hidden h-1 w-1 rounded-full bg-sage-300 sm:block" aria-hidden="true" />
          <span>{plural(sessions.length, 'session')} today</span>
          <span className="hidden h-1 w-1 rounded-full bg-sage-300 sm:block" aria-hidden="true" />
          <span>
            {attention.length === 0
              ? 'Nothing is asking for your attention'
              : `${plural(attention.length, 'client')} you may want to look at`}
          </span>
        </div>
        <div className="mt-6 flex flex-wrap gap-2 sm:hidden">
          <Button variant="primary" size="sm" onClick={() => openAssign()} icon={<Plus className="h-4 w-4" />}>
            Assign activity
          </Button>
        </div>
      </header>

      <Section
        eyebrow="Needs your attention"
        title="What changed since you last looked"
        description="Each client is compared with their own usual rhythm, never with anyone else's."
      >
        {attention.length === 0 ? (
          <EmptyState
            title="Nothing needs your attention today"
            description="Every client's activity is in line with their own usual rhythm."
          />
        ) : (
          <div className="space-y-4">
            {primary.map((entry) => (
              <AttentionCard key={entry.client.id} entry={entry} onCheckIn={setCheckInFor} />
            ))}
            {secondary.length > 0 && (
              <div className="space-y-2 pt-1">
                <p className="text-xs text-ink-faint">Also worth a look</p>
                {secondary.map((entry) => (
                  <AttentionCard
                    key={entry.client.id}
                    entry={entry}
                    onCheckIn={setCheckInFor}
                    emphasis="compact"
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </Section>

      <Section
        eyebrow="Coming up today"
        title={sessions.length > 0 ? 'Your sessions' : 'No sessions today'}
        action={
          <ButtonLink to="/therapist/sessions" variant="ghost" size="sm" trailingIcon={<ArrowUpRight className="h-4 w-4" />}>
            All sessions
          </ButtonLink>
        }
      >
        {sessions.length === 0 ? (
          <EmptyState title="The day is clear" description="Nothing is scheduled. A good day for follow-ups." />
        ) : (
          <div className="hairline-list rounded-xl2 border border-sage-200 bg-white px-3 sm:px-5">
            {sessions.map((session) => (
              <SessionRow key={session.id} session={session} onPrepare={setBriefFor} />
            ))}
          </div>
        )}
      </Section>

      {momentum.length > 0 && (
        <Section eyebrow="Positive momentum" title="Worth noticing">
          <div className="grid gap-3 sm:grid-cols-2">
            {momentum.map((entry) => (
              <div
                key={entry.client.id}
                className="flex items-start gap-3.5 rounded-xl2 bg-sage-100/70 px-4 py-4"
              >
                <Avatar person={entry.client} size="md" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-ink">{entry.client.firstName} {entry.client.lastName}</p>
                    <StatusPill status="re-engaged" size="sm" />
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
                    {entry.client.firstName} has returned to the usual activity rhythm after a
                    quieter stretch.
                  </p>
                  <ButtonLink
                    to={`/therapist/clients/${entry.client.id}`}
                    variant="ghost"
                    size="sm"
                    className="-ml-3 mt-1"
                  >
                    View {entry.client.firstName}
                  </ButtonLink>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section
        eyebrow="Recent activity"
        title="Since you last looked"
        description="This updates on its own. You will not be interrupted every time someone completes a practice."
        action={
          <ButtonLink to="/therapist/care" variant="ghost" size="sm" trailingIcon={<ArrowUpRight className="h-4 w-4" />}>
            Continuous care
          </ButtonLink>
        }
      >
        <ActivityStream events={activity} />
      </Section>

      <CheckInDrawer clientId={checkInFor} open={checkInFor !== null} onClose={() => setCheckInFor(null)} />
      <SessionBriefDrawer sessionId={briefFor} open={briefFor !== null} onClose={() => setBriefFor(null)} />
    </div>
  );
}
