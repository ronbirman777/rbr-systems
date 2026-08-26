import { useState } from 'react';
import { Link, Navigate, NavLink, useParams } from 'react-router-dom';
import { ChevronRight, MapPin, Video } from 'lucide-react';
import { useApp } from '@/state/AppProvider';
import { nextSessionFor, readingFor } from '@/services/selectors';
import { Monogram } from '@/components/ui/Monogram';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { CheckInModal } from '@/components/therapist/CheckInModal';
import { AssignPracticeDrawer } from '@/components/therapist/AssignPracticeDrawer';
import { OverviewPanel } from '@/components/therapist/panels/OverviewPanel';
import { DailyPracticesPanel } from '@/components/therapist/panels/DailyPracticesPanel';
import { JourneyPanel } from '@/components/therapist/panels/JourneyPanel';
import { SessionsPanel } from '@/components/therapist/panels/SessionsPanel';
import { ReflectionsPanel } from '@/components/therapist/panels/ReflectionsPanel';
import { ResourcesPanel } from '@/components/therapist/panels/ResourcesPanel';
import { PrivateNotesPanel } from '@/components/therapist/panels/PrivateNotesPanel';
import { sessionWhen } from '@/utils/date';
import { sessionModeLabel } from '@/utils/format';
import { cn } from '@/utils/cn';

const TABS = [
  { slug: 'overview', label: 'Overview' },
  { slug: 'practices', label: 'Daily Practices' },
  { slug: 'journey', label: 'Journey' },
  { slug: 'sessions', label: 'Sessions' },
  { slug: 'reflections', label: 'Reflections' },
  { slug: 'resources', label: 'Resources' },
  { slug: 'notes', label: 'Private Notes' },
] as const;

type Tab = (typeof TABS)[number]['slug'];

export default function ClientWorkspace() {
  const { clientId = '', tab = 'overview' } = useParams();
  const { state } = useApp();
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);

  const client = state.clients.find((c) => c.id === clientId);
  if (!client) return <Navigate to="/practitioner/clients" replace />;
  if (!TABS.some((t) => t.slug === tab)) {
    return <Navigate to={`/practitioner/clients/${clientId}/overview`} replace />;
  }

  const reading = readingFor(state, client.id);
  const next = nextSessionFor(state, client.id);
  const ModeIcon = next?.mode === 'in-person' ? MapPin : Video;
  const active = tab as Tab;

  return (
    <div className="animate-fade-in">
      <div className="px-6 pb-0 pt-7 sm:px-10 lg:px-12">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[0.8125rem] text-ink-soft">
          <Link to="/practitioner/clients" className="hover:text-forest hover:underline">
            Clients
          </Link>
          <ChevronRight className="h-3.5 w-3.5 text-ink-faint" aria-hidden="true" />
          <span className="text-ink">{client.name}</span>
        </nav>

        <header className="mt-5 flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
          <div className="flex min-w-0 items-center gap-4">
            <Monogram person={client} size="lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="font-display text-[2rem] leading-none text-ink">{client.name}</h1>
                <StatusBadge state={reading.state} />
              </div>
              <p className="mt-2 flex flex-wrap items-center gap-x-2 text-[0.8125rem] text-ink-soft">
                <span>Focus: {client.focus}</span>
                {next && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>Next Session: {sessionWhen(next.startsAt)}</span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1">
                      <ModeIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      {sessionModeLabel[next.mode]}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="sm" onClick={() => setCheckInOpen(true)}>
              Send Check In
            </Button>
            <Button size="sm" onClick={() => setAssignOpen(true)}>
              Assign Practice
            </Button>
            {next && (
              <ButtonLink to={`/practitioner/sessions/${next.id}`} size="sm">
                Session Prep
              </ButtonLink>
            )}
          </div>
        </header>

        <div
          role="tablist"
          aria-label={`${client.name} workspace`}
          className="no-scrollbar -mx-6 mt-7 flex gap-6 overflow-x-auto border-b border-sage-line px-6 sm:-mx-10 sm:px-10 lg:-mx-12 lg:px-12"
        >
          {TABS.map((item) => (
            <NavLink
              key={item.slug}
              role="tab"
              aria-selected={item.slug === active}
              to={`/practitioner/clients/${client.id}/${item.slug}`}
              className={cn(
                'relative whitespace-nowrap pb-3 pt-1 text-[0.875rem] transition-colors',
                item.slug === active ? 'font-medium text-ink' : 'text-ink-soft hover:text-ink',
              )}
            >
              {item.label}
              <span
                aria-hidden="true"
                className={cn(
                  'absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-forest transition-opacity',
                  item.slug === active ? 'opacity-100' : 'opacity-0',
                )}
              />
            </NavLink>
          ))}
        </div>
      </div>

      {active === 'overview' && (
        <OverviewPanel
          client={client}
          reading={reading}
          onCheckIn={() => setCheckInOpen(true)}
          onAssign={() => setAssignOpen(true)}
        />
      )}
      {active === 'practices' && <DailyPracticesPanel client={client} onAssign={() => setAssignOpen(true)} />}
      {active === 'journey' && <JourneyPanel client={client} />}
      {active === 'sessions' && <SessionsPanel client={client} />}
      {active === 'reflections' && <ReflectionsPanel client={client} />}
      {active === 'resources' && <ResourcesPanel client={client} onAssign={() => setAssignOpen(true)} />}
      {active === 'notes' && <PrivateNotesPanel client={client} />}

      <CheckInModal clientId={client.id} open={checkInOpen} onClose={() => setCheckInOpen(false)} />
      <AssignPracticeDrawer open={assignOpen} onClose={() => setAssignOpen(false)} clientId={client.id} />
    </div>
  );
}
