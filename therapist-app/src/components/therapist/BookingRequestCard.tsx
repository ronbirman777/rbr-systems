import { useState } from 'react';
import { CalendarClock, Check, X } from 'lucide-react';
import type { BookingRequest } from '@/types';
import { useApp } from '@/state/AppProvider';
import { useToast } from '@/components/ui/Toast';
import { Monogram } from '@/components/ui/Monogram';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Primitives';
import { TextInput } from '@/components/ui/Field';
import { conflictsFor } from '@/services/selectors';
import { atTime, sessionWhen, toISODate } from '@/utils/date';
import { sessionModeLabel } from '@/utils/format';

/**
 * A request waiting on a person. Accepting creates the appointment and confirms
 * it to the client; suggesting another time hands the choice back to them.
 */
export function BookingRequestCard({ request }: { request: BookingRequest }) {
  const { state, dispatch } = useApp();
  const toast = useToast();
  const [suggesting, setSuggesting] = useState(false);
  const [date, setDate] = useState(toISODate(new Date(request.startsAt)));
  const [time, setTime] = useState(new Date(request.startsAt).toTimeString().slice(0, 5));

  const client = state.clients.find((c) => c.id === request.clientId);
  if (!client) return null;

  // The request itself holds the time it is asking for — it must not be read as
  // a conflict with itself, or nothing could ever be accepted.
  const conflicts = conflictsFor(state, new Date(request.startsAt), request.durationMin, {
    forClientId: request.clientId,
    ignoreRequestId: request.id,
  });
  const suggestionConflicts = conflictsFor(state, atTime(date, time), request.durationMin, {
    forClientId: request.clientId,
    ignoreRequestId: request.id,
  });

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start gap-3.5">
        <Monogram person={client} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <p className="font-display text-lg leading-tight text-ink">{client.name}</p>
            <span className="rounded-[6px] bg-amber-wash px-2.5 py-1 text-2xs font-medium text-amber-deep ring-1 ring-inset ring-amber-line">
              Booking Request
            </span>
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-[0.875rem] text-ink">
            <CalendarClock className="h-3.5 w-3.5 shrink-0 text-sage" aria-hidden="true" />
            {sessionWhen(request.startsAt)} · {sessionModeLabel[request.mode]} · {request.durationMin} min
          </p>
          {request.note && (
            <p className="mt-2 font-display text-[0.9375rem] italic leading-relaxed text-ink-soft">
              “{request.note}”
            </p>
          )}
          {conflicts.length > 0 && (
            <p className="mt-2 text-[0.8125rem] text-amber-deep">
              {conflicts[0].label} Suggest another time instead.
            </p>
          )}

          {suggesting ? (
            <div className="mt-4 space-y-2.5">
              <div className="flex gap-2">
                <TextInput
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  aria-label="Suggested date"
                />
                <TextInput
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  aria-label="Suggested time"
                />
              </div>
              {suggestionConflicts.length > 0 && (
                <p className="text-[0.8125rem] text-amber-deep">{suggestionConflicts[0].label}</p>
              )}
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setSuggesting(false)}>
                  Back
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={suggestionConflicts.length > 0}
                  onClick={() => {
                    dispatch({
                      type: 'booking/suggest',
                      requestId: request.id,
                      startsAt: atTime(date, time).toISOString(),
                    });
                    toast(`Suggested ${sessionWhen(atTime(date, time).toISOString())} to ${client.name}`);
                    setSuggesting(false);
                  }}
                >
                  Send suggestion
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="primary"
                size="sm"
                disabled={conflicts.length > 0}
                icon={<Check className="h-4 w-4" />}
                onClick={() => {
                  dispatch({ type: 'booking/accept', requestId: request.id });
                  toast(`Confirmed ${sessionWhen(request.startsAt)} with ${client.name}`);
                }}
              >
                Accept
              </Button>
              <Button size="sm" onClick={() => setSuggesting(true)}>
                Suggest Another Time
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={<X className="h-4 w-4" />}
                onClick={() => {
                  dispatch({ type: 'booking/decline', requestId: request.id });
                  toast(`Declined — ${client.name} can choose another time`);
                }}
              >
                Decline
              </Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
