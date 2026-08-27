import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarOff, ChevronLeft, ChevronRight, Plus, Ban } from 'lucide-react';
import { useApp } from '@/state/AppProvider';
import {
  bookableSlots,
  exceptionsOn,
  isLive,
  pendingRequests,
  sessionsOnDay,
} from '@/services/selectors';
import { windowsOn } from '@/services/scheduling';
import { PageHeader } from '@/components/therapist/PageHeader';
import { SessionItem } from '@/components/therapist/SessionItem';
import { SessionFormDrawer } from '@/components/therapist/SessionFormDrawer';
import { AvailabilityDrawer } from '@/components/therapist/AvailabilityDrawer';
import { BlockTimeDrawer, reasonLabel } from '@/components/therapist/BlockTimeDrawer';
import { BookingRequestCard } from '@/components/therapist/BookingRequestCard';
import { Button } from '@/components/ui/Button';
import { EmptyState, Eyebrow } from '@/components/ui/Primitives';
import {
  addDays,
  clockTime,
  fullDate,
  monthShort,
  todayISO,
  toISODate,
  weekOf,
  weekdayShort,
} from '@/utils/date';
import { cn } from '@/utils/cn';

type View = 'day' | 'week' | 'month';

/**
 * Calendar & Sessions.
 *
 * Three things live here and stay visually distinct: appointments, the
 * availability they can be booked into, and time that is blocked out.
 */
export default function CalendarAndSessions() {
  const { state } = useApp();
  const [view, setView] = useState<View>('week');
  const [anchor, setAnchor] = useState(todayISO());
  const [sessionForm, setSessionForm] = useState<{ date?: string; time?: string } | null>(null);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [blockFor, setBlockFor] = useState<string | null>(null);

  const requests = useMemo(() => pendingRequests(state), [state]);
  const step = view === 'month' ? 30 : view === 'week' ? 7 : 1;

  const move = (direction: 1 | -1) => {
    if (view === 'month') {
      const d = new Date(`${anchor}T00:00:00`);
      d.setMonth(d.getMonth() + direction);
      setAnchor(toISODate(d));
    } else {
      setAnchor(toISODate(addDays(anchor, direction * step)));
    }
  };

  const label =
    view === 'day'
      ? fullDate(anchor)
      : view === 'week'
        ? (() => {
            const days = weekOf(anchor);
            return `${monthShort(days[0])} ${Number(days[0].slice(8))} – ${monthShort(days[6])} ${Number(days[6].slice(8))}`;
          })()
        : new Date(`${anchor}T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="animate-fade-in">
      <div className="border-b border-sage-line px-6 py-8 sm:px-10 lg:px-12">
        <PageHeader
          eyebrow="Calendar & Sessions"
          title="The shape of the week"
          lede="Appointments, the hours clients can book, and the time you have kept back."
          action={
            <>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setSessionForm({})}
                icon={<Plus className="h-4 w-4" />}
              >
                New Session
              </Button>
              <Button size="sm" onClick={() => setAvailabilityOpen(true)}>
                Manage Availability
              </Button>
              <Button size="sm" onClick={() => setBlockFor(anchor)} icon={<Ban className="h-4 w-4" />}>
                Block Time
              </Button>
            </>
          }
        />
      </div>

      {requests.length > 0 && (
        <section className="border-b border-sage-line px-6 py-7 sm:px-10 lg:px-12">
          <Eyebrow className="mb-4">
            Booking {requests.length === 1 ? 'Request' : 'Requests'} · {requests.length} waiting
          </Eyebrow>
          <div className="grid gap-3 xl:grid-cols-2">
            {requests.map((request) => (
              <BookingRequestCard key={request.id} request={request} />
            ))}
          </div>
        </section>
      )}

      <div className="px-6 py-7 sm:px-10 lg:px-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex gap-1.5" role="tablist" aria-label="Calendar view">
            {(['day', 'week', 'month'] as View[]).map((option) => (
              <button
                key={option}
                role="tab"
                aria-selected={option === view}
                onClick={() => setView(option)}
                className={cn(
                  'min-h-[2.25rem] rounded-full border px-4 text-[0.8125rem] font-medium capitalize transition-colors',
                  option === view
                    ? 'border-forest bg-forest text-cream'
                    : 'border-sage-line bg-white text-ink-soft hover:border-sage hover:text-ink',
                )}
              >
                {option}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <Button size="sm" className="w-10 px-0" aria-label="Previous" onClick={() => move(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="sm" onClick={() => setAnchor(todayISO())} disabled={anchor === todayISO()}>
              Today
            </Button>
            <Button size="sm" className="w-10 px-0" aria-label="Next" onClick={() => move(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <h2 className="mt-6 font-display text-[1.625rem] leading-tight text-ink">{label}</h2>

        {view === 'day' && <DayView date={anchor} onBlock={() => setBlockFor(anchor)} onNew={(time) => setSessionForm({ date: anchor, time })} />}
        {view === 'week' && <WeekView anchor={anchor} onPick={(date) => { setAnchor(date); setView('day'); }} />}
        {view === 'month' && <MonthView anchor={anchor} onPick={(date) => { setAnchor(date); setView('day'); }} />}

        <Legend />
      </div>

      <SessionFormDrawer
        open={sessionForm !== null}
        onClose={() => setSessionForm(null)}
        date={sessionForm?.date}
        startTime={sessionForm?.time}
      />
      <AvailabilityDrawer open={availabilityOpen} onClose={() => setAvailabilityOpen(false)} />
      <BlockTimeDrawer open={blockFor !== null} onClose={() => setBlockFor(null)} date={blockFor ?? undefined} />
    </div>
  );
}

function Legend() {
  const items = [
    { label: 'Appointment', className: 'bg-forest' },
    { label: 'Available to book', className: 'border border-dashed border-sage bg-sage-wash' },
    { label: 'Blocked', className: 'bg-rose-wash ring-1 ring-inset ring-rose-line' },
  ];
  return (
    <ul className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-2xs text-ink-soft">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2">
          <span className={cn('h-3 w-3 rounded-[4px]', item.className)} aria-hidden="true" />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function DayView({
  date,
  onBlock,
  onNew,
}: {
  date: string;
  onBlock: () => void;
  onNew: (time: string) => void;
}) {
  const { state, dispatch } = useApp();
  const sessions = sessionsOnDay(state, date).filter(isLive);
  const cancelled = sessionsOnDay(state, date).filter((s) => !isLive(s));
  const windows = windowsOn(date, state.availability);
  const blocks = exceptionsOn(state, date);
  const open = bookableSlots(state, date, 60);

  return (
    <div className="mt-5 space-y-8">
      <section>
        <Eyebrow className="mb-3">Appointments</Eyebrow>
        {sessions.length === 0 ? (
          <EmptyState title="Nothing scheduled on this day" description="Available hours are shown below." />
        ) : (
          <div className="hairlines border-y border-sage-line">
            {sessions.map((session) => (
              <SessionItem key={session.id} session={session} showFinished />
            ))}
          </div>
        )}
        {cancelled.length > 0 && (
          <ul className="mt-3 space-y-1">
            {cancelled.map((session) => (
              <li key={session.id} className="text-[0.8125rem] text-ink-faint line-through">
                {clockTime(session.startsAt)} ·{' '}
                {state.clients.find((c) => c.id === session.clientId)?.name} · cancelled
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <Eyebrow>Availability</Eyebrow>
          <span className="text-2xs text-ink-faint">
            {windows.map((w) => `${clockTime(w.start)} – ${clockTime(w.end)}`).join(' · ') ||
              'No availability set for this day'}
          </span>
        </div>
        {open.length === 0 ? (
          <EmptyState
            title="No bookable time left"
            description="Every open hour is either booked or blocked."
          />
        ) : (
          <ul className="flex flex-wrap gap-2">
            {open.map((slot) => (
              <li key={slot.startsAt}>
                <button
                  type="button"
                  onClick={() => onNew(new Date(slot.startsAt).toTimeString().slice(0, 5))}
                  className="min-h-[2.5rem] rounded-control border border-dashed border-sage bg-sage-wash px-4 text-[0.875rem] font-medium text-forest-accent transition-colors hover:border-forest hover:bg-sage-soft"
                >
                  {clockTime(slot.startsAt)}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-2xs text-ink-faint">
          Open hours a client could book. Tap one to schedule it yourself.
        </p>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <Eyebrow>Blocked</Eyebrow>
          <Button size="sm" variant="ghost" onClick={onBlock} icon={<Ban className="h-3.5 w-3.5" />}>
            Block time
          </Button>
        </div>
        {blocks.length === 0 ? (
          <p className="text-[0.8125rem] text-ink-faint">Nothing blocked on this day.</p>
        ) : (
          <ul className="space-y-2">
            {blocks.map((block) => (
              <li
                key={block.id}
                className="flex items-center justify-between gap-3 rounded-card bg-rose-wash px-4 py-2.5 ring-1 ring-inset ring-rose-line"
              >
                <span className="text-[0.875rem] text-ink">
                  <CalendarOff className="mr-2 inline h-3.5 w-3.5 align-[-2px] text-rose-deep" aria-hidden="true" />
                  {block.allDay
                    ? 'All day'
                    : `${clockTime(block.startTime ?? '')} – ${clockTime(block.endTime ?? '')}`}
                  <span className="ml-2 text-ink-soft">{reasonLabel[block.reason]}</span>
                  {block.note && <span className="ml-1 text-ink-faint">· {block.note}</span>}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => dispatch({ type: 'availability/unblock', exceptionId: block.id })}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function WeekView({ anchor, onPick }: { anchor: string; onPick: (date: string) => void }) {
  const { state } = useApp();
  const days = weekOf(anchor);

  return (
    <div className="mt-5 grid gap-2.5 md:grid-cols-7">
      {days.map((date) => {
        const sessions = sessionsOnDay(state, date).filter(isLive);
        const blocks = exceptionsOn(state, date);
        const open = bookableSlots(state, date, 60);
        const isToday = date === todayISO();

        return (
          <div
            key={date}
            className={cn(
              'rounded-card border p-3',
              isToday ? 'border-sage bg-sage-wash/40' : 'border-sage-line bg-white',
            )}
          >
            <button
              type="button"
              onClick={() => onPick(date)}
              className="mb-2 block w-full text-left"
              aria-label={`Open ${fullDate(date)}`}
            >
              <span
                className={cn(
                  'text-2xs font-semibold uppercase tracking-eyebrow',
                  isToday ? 'text-forest' : 'text-ink-faint',
                )}
              >
                {weekdayShort(date)} {Number(date.slice(8))}
              </span>
            </button>

            <ul className="space-y-1.5">
              {sessions.map((session) => {
                const client = state.clients.find((c) => c.id === session.clientId);
                return (
                  <li key={session.id}>
                    <Link
                      to={`/practitioner/sessions/${session.id}`}
                      className="block rounded-[8px] bg-forest px-2.5 py-1.5 text-cream transition-opacity hover:opacity-90"
                    >
                      <span className="block text-2xs tabular-nums text-sage-soft">
                        {clockTime(session.startsAt)}
                      </span>
                      <span className="block truncate text-[0.8125rem] font-medium">{client?.name}</span>
                    </Link>
                  </li>
                );
              })}

              {blocks.map((block) => (
                <li
                  key={block.id}
                  className="rounded-[8px] bg-rose-wash px-2.5 py-1.5 ring-1 ring-inset ring-rose-line"
                >
                  <span className="block text-2xs text-rose-deep">
                    {block.allDay ? 'All day' : clockTime(block.startTime ?? '')}
                  </span>
                  <span className="block truncate text-[0.75rem] text-ink-soft">
                    {reasonLabel[block.reason]}
                  </span>
                </li>
              ))}

              {open.length > 0 && (
                <li>
                  <button
                    type="button"
                    onClick={() => onPick(date)}
                    className="w-full rounded-[8px] border border-dashed border-sage bg-sage-wash/60 px-2.5 py-1.5 text-left text-2xs text-forest-accent transition-colors hover:bg-sage-soft"
                  >
                    {open.length} open {open.length === 1 ? 'hour' : 'hours'}
                  </button>
                </li>
              )}

              {sessions.length === 0 && blocks.length === 0 && open.length === 0 && (
                <li className="text-2xs text-ink-faint">—</li>
              )}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function MonthView({ anchor, onPick }: { anchor: string; onPick: (date: string) => void }) {
  const { state } = useApp();
  const first = new Date(`${anchor.slice(0, 7)}-01T00:00:00`);
  const offset = (first.getDay() + 6) % 7; // Monday-anchored grid
  const gridStart = addDays(first, -offset);
  const cells = Array.from({ length: 42 }, (_, i) => toISODate(addDays(gridStart, i)));
  const month = anchor.slice(0, 7);

  return (
    <div className="mt-5">
      <div className="grid grid-cols-7 gap-1.5 pb-2">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
          <p key={day} className="text-center text-2xs font-semibold uppercase tracking-eyebrow text-ink-faint">
            {day}
          </p>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((date) => {
          const inMonth = date.slice(0, 7) === month;
          const sessions = sessionsOnDay(state, date).filter(isLive);
          const blocks = exceptionsOn(state, date);
          const open = bookableSlots(state, date, 60);
          const isToday = date === todayISO();

          return (
            <button
              key={date}
              type="button"
              onClick={() => onPick(date)}
              className={cn(
                'flex min-h-[4.5rem] flex-col rounded-card border p-2 text-left transition-colors',
                isToday
                  ? 'border-forest bg-sage-wash/60'
                  : inMonth
                    ? 'border-sage-line bg-white hover:border-sage'
                    : 'border-transparent bg-cream/40',
              )}
            >
              <span
                className={cn(
                  'text-2xs tabular-nums',
                  isToday ? 'font-semibold text-forest' : inMonth ? 'text-ink-soft' : 'text-ink-faint',
                )}
              >
                {Number(date.slice(8))}
              </span>
              {inMonth && (
                <span className="mt-auto flex flex-wrap items-center gap-1">
                  {sessions.slice(0, 3).map((session) => (
                    <span key={session.id} className="h-1.5 w-1.5 rounded-full bg-forest" aria-hidden="true" />
                  ))}
                  {sessions.length > 3 && (
                    <span className="text-3xs text-ink-faint">+{sessions.length - 3}</span>
                  )}
                  {blocks.length > 0 && (
                    <span className="h-1.5 w-1.5 rounded-full bg-rose" aria-hidden="true" />
                  )}
                  {open.length > 0 && sessions.length === 0 && blocks.length === 0 && (
                    <span className="text-3xs text-forest-accent">{open.length} open</span>
                  )}
                </span>
              )}
              <span className="sr-only">
                {fullDate(date)}: {sessions.length} appointments, {open.length} open hours
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
