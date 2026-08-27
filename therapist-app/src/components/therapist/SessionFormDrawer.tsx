import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check } from 'lucide-react';
import { Drawer } from '@/components/ui/Overlay';
import { Button } from '@/components/ui/Button';
import { ChoiceRow, Field, Select, TextArea, TextInput } from '@/components/ui/Field';
import { useApp } from '@/state/AppProvider';
import { useToast } from '@/components/ui/Toast';
import { conflictsFor } from '@/services/selectors';
import type { RecurrenceRule, SessionMode } from '@/types';
import type { SessionDraft } from '@/state/store';
import { atTime, sessionWhen, todayISO } from '@/utils/date';
import { sessionModeLabel } from '@/utils/format';
import { cn } from '@/utils/cn';

const DURATIONS = [30, 45, 50, 60, 75, 90];
const MODES: SessionMode[] = ['video', 'in-person', 'phone', 'custom'];

const REPEATS: { value: RecurrenceRule; label: string }[] = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Monthly' },
];

/**
 * Create a session from anywhere. Conflicts are surfaced before saving rather
 * than after — the product never silently double-books.
 */
export function SessionFormDrawer({
  open,
  onClose,
  clientId,
  date,
  startTime,
}: {
  open: boolean;
  onClose: () => void;
  clientId?: string;
  date?: string;
  startTime?: string;
}) {
  const { state, dispatch } = useApp();
  const toast = useToast();

  const [form, setForm] = useState<SessionDraft>({
    clientId: clientId ?? state.clients[0].id,
    date: date ?? todayISO(),
    startTime: startTime ?? '10:00',
    durationMin: 60,
    mode: 'video',
    focus: '',
    repeat: 'none',
    reservesSlot: true,
  });
  const [customDuration, setCustomDuration] = useState(false);

  useEffect(() => {
    if (!open) return;
    const client = state.clients.find((c) => c.id === (clientId ?? state.clients[0].id));
    setForm((current) => ({
      ...current,
      clientId: clientId ?? current.clientId,
      date: date ?? current.date,
      startTime: startTime ?? current.startTime,
      focus: client?.focus ?? '',
    }));
  }, [open, clientId, date, startTime, state.clients]);

  const client = state.clients.find((c) => c.id === form.clientId);

  const conflicts = useMemo(
    () => conflictsFor(state, atTime(form.date, form.startTime), form.durationMin, { forClientId: form.clientId }),
    [state, form.date, form.startTime, form.durationMin, form.clientId],
  );

  const set = <K extends keyof SessionDraft>(key: K, value: SessionDraft[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = () => {
    dispatch({ type: 'session/create', draft: { ...form, focus: form.focus || client?.focus || 'Session' } });
    toast(
      form.repeat === 'none'
        ? `Session booked for ${sessionWhen(atTime(form.date, form.startTime).toISOString())}`
        : `Standing appointment created for ${client?.name}`,
    );
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      eyebrow="Calendar"
      title="New Session"
      description="Conflicts are checked before anything is saved."
      footer={
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            disabled={conflicts.length > 0}
            icon={<Check className="h-4 w-4" />}
          >
            {conflicts.length > 0 ? 'Time unavailable' : 'Schedule Session'}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <Field label="Client">
          {(id) => (
            <Select
              id={id}
              value={form.clientId}
              onChange={(e) => {
                const next = state.clients.find((c) => c.id === e.target.value);
                setForm((current) => ({
                  ...current,
                  clientId: e.target.value,
                  focus: next?.focus ?? current.focus,
                }));
              }}
            >
              {state.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.focus}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Date">
            {(id) => (
              <TextInput id={id} type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
            )}
          </Field>
          <Field label="Start time">
            {(id) => (
              <TextInput
                id={id}
                type="time"
                value={form.startTime}
                onChange={(e) => set('startTime', e.target.value)}
              />
            )}
          </Field>
        </div>

        <fieldset>
          <legend className="eyebrow mb-1.5">Duration</legend>
          <div className="grid grid-cols-4 gap-1.5">
            {DURATIONS.map((minutes) => (
              <button
                key={minutes}
                type="button"
                aria-pressed={!customDuration && form.durationMin === minutes}
                onClick={() => {
                  setCustomDuration(false);
                  set('durationMin', minutes);
                }}
                className={cn(
                  'min-h-[2.75rem] rounded-control border text-[0.8125rem] font-medium transition-colors',
                  !customDuration && form.durationMin === minutes
                    ? 'border-forest bg-forest text-cream'
                    : 'border-sage-line bg-white text-ink-soft hover:border-sage hover:text-ink',
                )}
              >
                {minutes}m
              </button>
            ))}
            <button
              type="button"
              aria-pressed={customDuration}
              onClick={() => setCustomDuration(true)}
              className={cn(
                'col-span-2 min-h-[2.75rem] rounded-control border text-[0.8125rem] font-medium transition-colors',
                customDuration
                  ? 'border-forest bg-forest text-cream'
                  : 'border-sage-line bg-white text-ink-soft hover:border-sage hover:text-ink',
              )}
            >
              Custom
            </button>
          </div>
          {customDuration && (
            <TextInput
              type="number"
              min={10}
              max={240}
              step={5}
              className="mt-2"
              value={form.durationMin}
              onChange={(e) => set('durationMin', Number(e.target.value))}
              aria-label="Custom duration in minutes"
            />
          )}
        </fieldset>

        <ChoiceRow<SessionMode>
          label="Session type"
          value={form.mode}
          onChange={(mode) => set('mode', mode)}
          columns={4}
          options={MODES.map((value) => ({ value, label: sessionModeLabel[value] }))}
        />

        {(form.mode === 'in-person' || form.mode === 'custom') && (
          <Field label="Location">
            {(id) => (
              <TextInput
                id={id}
                value={form.location ?? ''}
                onChange={(e) => set('location', e.target.value)}
                placeholder="Practice room"
              />
            )}
          </Field>
        )}

        <Field label="Focus">
          {(id) => (
            <TextInput id={id} value={form.focus} onChange={(e) => set('focus', e.target.value)} />
          )}
        </Field>

        <Field label="Repeat">
          {(id) => (
            <Select
              id={id}
              value={form.repeat}
              onChange={(e) => set('repeat', e.target.value as RecurrenceRule)}
            >
              {REPEATS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {form.repeat !== 'none' && (
          <button
            type="button"
            role="switch"
            aria-checked={form.reservesSlot}
            onClick={() => set('reservesSlot', !form.reservesSlot)}
            className="flex w-full items-start gap-3 rounded-control border border-sage-line bg-white px-4 py-3 text-left transition-colors hover:border-sage"
          >
            <span
              aria-hidden="true"
              className={cn(
                'mt-0.5 inline-flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors',
                form.reservesSlot ? 'bg-forest' : 'bg-sage-line',
              )}
            >
              <span
                className={cn(
                  'h-5 w-5 rounded-full bg-white transition-transform',
                  form.reservesSlot && 'translate-x-4',
                )}
              />
            </span>
            <span className="min-w-0">
              <span className="block text-[0.875rem] font-medium text-ink">
                Reserve this time for {client?.name}
              </span>
              <span className="mt-0.5 block text-2xs leading-relaxed text-ink-soft">
                The slot stops being offered to anyone else, even on weeks with no appointment yet.
              </span>
            </span>
          </button>
        )}

        <Field label="Note for the client" hint="Shown with the appointment in their companion.">
          {(id) => (
            <TextArea
              id={id}
              rows={2}
              value={form.noteForClient ?? ''}
              onChange={(e) => set('noteForClient', e.target.value)}
            />
          )}
        </Field>

        <Field label="Private note" hint="Only you will ever see this.">
          {(id) => (
            <TextArea
              id={id}
              rows={2}
              value={form.privateNote ?? ''}
              onChange={(e) => set('privateNote', e.target.value)}
            />
          )}
        </Field>

        {conflicts.length > 0 && (
          <div className="rounded-card border border-amber-line bg-amber-wash/60 p-4">
            <p className="flex items-center gap-2 text-[0.875rem] font-medium text-amber-deep">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              This time is not free
            </p>
            <ul className="mt-2 space-y-1">
              {conflicts.map((conflict, i) => (
                <li key={`${conflict.kind}-${i}`} className="text-[0.8125rem] leading-relaxed text-ink">
                  {conflict.label}
                  {conflict.clientId && conflict.clientId !== form.clientId && (
                    <span className="text-ink-soft">
                      {' '}
                      ({state.clients.find((c) => c.id === conflict.clientId)?.name})
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-2xs text-ink-soft">Choose another time, or shorten the session.</p>
          </div>
        )}
      </div>
    </Drawer>
  );
}
