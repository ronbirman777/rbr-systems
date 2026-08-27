import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, CalendarPlus, MapPin, Video } from 'lucide-react';
import { useApp } from '@/state/AppProvider';
import { hasFinished, preparationProgress, requestsOf, sessionsOf } from '@/services/selectors';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card, EmptyState, Eyebrow } from '@/components/ui/Primitives';
import { Modal } from '@/components/ui/Overlay';
import { TextArea } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { fullDate, sessionWhen } from '@/utils/date';
import { sessionModeLabel } from '@/utils/format';

export default function ClientSessions() {
  const { clientId = 'emma' } = useParams();
  const { state, dispatch } = useApp();
  const toast = useToast();
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const client = state.clients.find((c) => c.id === clientId) ?? state.clients[0];
  const base = `/client/${client.id}`;

  const all = sessionsOf(state, client.id);
  const ahead = all.filter((s) => s.status === 'scheduled' && !hasFinished(s));
  const held = all.filter((s) => hasFinished(s) && s.status !== 'cancelled').reverse();
  const cancelled = all.filter((s) => s.status === 'cancelled');
  const requests = requestsOf(state, client.id).filter((r) => r.status === 'pending');

  return (
    <div className="animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[1.875rem] leading-tight text-ink">Sessions</h1>
          <p className="mt-1.5 text-[0.9375rem] text-ink-soft">With {state.practitioner.name}.</p>
        </div>
        <ButtonLink to={`${base}/book`} size="sm" icon={<CalendarPlus className="h-4 w-4" />}>
          Book
        </ButtonLink>
      </div>

      {requests.length > 0 && (
        <section className="mt-7">
          <Eyebrow className="mb-2.5">Waiting to be confirmed</Eyebrow>
          <ul className="space-y-2.5">
            {requests.map((request) => (
              <li key={request.id}>
                <Card className="p-4">
                  <p className="text-[1.0625rem] font-semibold text-ink">{sessionWhen(request.startsAt)}</p>
                  <p className="mt-1 text-[0.8125rem] text-ink-soft">
                    {sessionModeLabel[request.mode]} · {request.durationMin} minutes
                  </p>
                  <p className="mt-2 text-[0.8125rem] text-amber-deep">
                    {request.suggestedAt
                      ? `${state.practitioner.name} suggested ${sessionWhen(request.suggestedAt)} instead.`
                      : `${state.practitioner.name} will confirm this shortly.`}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      {ahead.length > 0 ? (
        <section className="mt-7">
          <Eyebrow className="mb-2.5">Coming up</Eyebrow>
          <ul className="space-y-3">
            {ahead.map((session) => {
              const ModeIcon = session.mode === 'in-person' ? MapPin : Video;
              const prep = preparationProgress(state, session.id);
              return (
                <li key={session.id}>
                  <Card className="p-4">
                    <Link to={`${base}/sessions/${session.id}`} className="block">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[1.0625rem] font-semibold text-ink">
                            {sessionWhen(session.startsAt)}
                          </p>
                          <p className="mt-1 flex items-center gap-1.5 text-[0.8125rem] text-ink-soft">
                            <ModeIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            {sessionModeLabel[session.mode]} · {session.durationMin} minutes
                          </p>
                          {prep.total > 0 && (
                            <p className="mt-1.5 text-[0.75rem] text-forest-accent">
                              Preparation · {prep.completed} of {prep.total} completed
                            </p>
                          )}
                        </div>
                        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-ink-faint" aria-hidden="true" />
                      </div>
                    </Link>
                    <div className="mt-3.5 flex flex-wrap gap-2">
                      <ButtonLink to={`${base}/sessions/${session.id}/prepare`} size="sm">
                        Prepare
                      </ButtonLink>
                      <ButtonLink to={`${base}/book`} size="sm" variant="ghost">
                        Reschedule
                      </ButtonLink>
                      <Button size="sm" variant="ghost" onClick={() => setCancelId(session.id)}>
                        Cancel
                      </Button>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <div className="mt-7">
          <EmptyState
            title="No upcoming session"
            description={`Choose a time from the hours ${state.practitioner.name} has open.`}
          />
          <ButtonLink
            to={`${base}/book`}
            variant="primary"
            className="mt-4 w-full"
            icon={<CalendarPlus className="h-4 w-4" />}
          >
            Book your next session
          </ButtonLink>
        </div>
      )}

      {held.length > 0 && (
        <section className="mt-8">
          <Eyebrow className="mb-2.5">Past sessions</Eyebrow>
          <ul className="hairlines border-y border-sage-line">
            {held.slice(0, 8).map((session) => (
              <li key={session.id} className="flex items-center justify-between gap-3 py-3.5">
                <span className="text-[0.875rem] text-ink">{fullDate(session.startsAt.slice(0, 10))}</span>
                <span className="text-[0.8125rem] text-ink-soft">{sessionModeLabel[session.mode]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {cancelled.length > 0 && (
        <section className="mt-8">
          <Eyebrow className="mb-2.5">Cancelled</Eyebrow>
          <ul className="space-y-1.5">
            {cancelled.map((session) => (
              <li key={session.id} className="text-[0.8125rem] text-ink-faint">
                {fullDate(session.startsAt.slice(0, 10))}
                {session.cancelledReason ? ` · ${session.cancelledReason}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}

      <Modal
        open={cancelId !== null}
        onClose={() => setCancelId(null)}
        eyebrow="Sessions"
        title="Cancel this session?"
        description="You can book another time whenever you are ready."
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setCancelId(null)}>
              Keep it
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!cancelId) return;
                dispatch({
                  type: 'session/cancel',
                  sessionId: cancelId,
                  scope: 'this',
                  reason: reason.trim() || undefined,
                  by: 'client',
                });
                toast('Session cancelled');
                setCancelId(null);
                setReason('');
              }}
            >
              Cancel session
            </Button>
          </div>
        }
      >
        <TextArea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Anything you would like John to know? Optional."
          aria-label="Reason"
        />
      </Modal>
    </div>
  );
}
