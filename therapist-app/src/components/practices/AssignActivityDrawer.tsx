import { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { Drawer } from '@/components/ui/Drawer';
import { Button } from '@/components/ui/Button';
import { Field, TextInput, TextArea, Select, ChoiceGroup } from '@/components/ui/Field';
import { Toggle } from '@/components/ui/Toggle';
import { Avatar } from '@/components/ui/Avatar';
import { useEcosystem } from '@/state/EcosystemProvider';
import { useToast } from '@/components/ui/Toast';
import type { PracticeType, ReminderRule, RepeatRule } from '@/types';
import type { AssignDraft } from '@/state/ecosystemReducer';
import { practiceTypeLabel } from '@/utils/format';
import { todayISO } from '@/utils/date';
import { cn } from '@/utils/cn';

const TYPE_ORDER: PracticeType[] = [
  'breathing',
  'meditation',
  'reflection',
  'journal',
  'grounding',
  'reading',
  'audio',
  'video',
  'questionnaire',
  'session-prep',
  'follow-up',
];

const DEFAULT_TITLES: Partial<Record<PracticeType, string>> = {
  breathing: 'Morning breathing',
  meditation: 'Ten minutes of stillness',
  reflection: 'Evening reflection',
  journal: 'One line about today',
  grounding: 'Evening grounding',
  reading: 'A short reading',
  audio: 'Guided audio',
  video: 'Short video',
  questionnaire: 'Check-in questionnaire',
  'session-prep': 'Before our next session',
  'follow-up': 'After our session',
};

export function AssignActivityDrawer({
  open,
  onClose,
  presetClientIds = [],
  presetResourceId,
}: {
  open: boolean;
  onClose: () => void;
  presetClientIds?: string[];
  presetResourceId?: string;
}) {
  const { state, dispatch } = useEcosystem();
  const toast = useToast();

  const [clientIds, setClientIds] = useState<string[]>(presetClientIds);
  const [type, setType] = useState<PracticeType>('breathing');
  const [title, setTitle] = useState(DEFAULT_TITLES.breathing ?? '');
  const [instructions, setInstructions] = useState('');
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState('07:00');
  const [repeat, setRepeat] = useState<RepeatRule>('daily');
  const [reminder, setReminder] = useState<ReminderRule>('at-time');
  const [resourceId, setResourceId] = useState<string>(presetResourceId ?? '');
  const [message, setMessage] = useState('');
  const [invitesReflection, setInvitesReflection] = useState(false);

  useEffect(() => {
    if (!open) return;
    setClientIds(presetClientIds);
    setResourceId(presetResourceId ?? '');
  }, [open, presetClientIds, presetResourceId]);

  const resource = state.resources.find((r) => r.id === resourceId);

  const summary = useMemo(() => {
    if (clientIds.length === 0) return 'Choose at least one client';
    if (clientIds.length === 1) {
      const client = state.clients.find((c) => c.id === clientIds[0]);
      return `Assign to ${client?.firstName ?? 'client'}`;
    }
    return `Assign to ${clientIds.length} clients`;
  }, [clientIds, state.clients]);

  const toggleClient = (id: string) =>
    setClientIds((current) =>
      current.includes(id) ? current.filter((c) => c !== id) : [...current, id],
    );

  const submit = () => {
    if (clientIds.length === 0 || !title.trim()) return;
    const draft: AssignDraft = {
      clientIds,
      type,
      title: title.trim(),
      instructions: instructions.trim() || resource?.summary || '',
      date,
      time,
      repeat,
      reminder,
      resourceId: resourceId || undefined,
      message: message.trim() || undefined,
      invitesReflection,
    };
    dispatch({ type: 'practice/assign', draft });
    toast(
      clientIds.length === 1
        ? `${title.trim()} assigned to ${state.clients.find((c) => c.id === clientIds[0])?.firstName}`
        : `${title.trim()} assigned to ${clientIds.length} clients`,
    );
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      eyebrow="Continuous care"
      title="Assign an activity"
      description="A few seconds to set up. It appears in the client's app straight away."
      width="lg"
      footer={
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            disabled={clientIds.length === 0 || !title.trim()}
            icon={<Check className="h-4 w-4" />}
          >
            {summary}
          </Button>
        </div>
      }
    >
      <div className="space-y-7 pb-4">
        <fieldset>
          <legend className="mb-3 block text-xs font-semibold uppercase tracking-widest2 text-ink-muted">
            Who is this for
          </legend>
          <div className="flex flex-wrap gap-2">
            {state.clients.map((client) => {
              const active = clientIds.includes(client.id);
              return (
                <button
                  key={client.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleClient(client.id)}
                  className={cn(
                    'flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm transition',
                    active
                      ? 'border-forest-900 bg-forest-900 text-cream'
                      : 'border-sage-300 bg-white text-ink hover:border-forest-600/60',
                  )}
                >
                  <Avatar person={client} size="xs" />
                  {client.firstName}
                  {active && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 block text-xs font-semibold uppercase tracking-widest2 text-ink-muted">
            Activity type
          </legend>
          <div className="flex flex-wrap gap-2">
            {TYPE_ORDER.map((option) => {
              const active = option === type;
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setType(option);
                    if (!title || Object.values(DEFAULT_TITLES).includes(title)) {
                      setTitle(DEFAULT_TITLES[option] ?? '');
                    }
                    setInvitesReflection(['reflection', 'journal'].includes(option));
                  }}
                  className={cn(
                    'rounded-full border px-3.5 py-1.5 text-xs font-medium transition',
                    active
                      ? 'border-forest-900 bg-forest-900 text-cream'
                      : 'border-sage-300 bg-white text-ink-muted hover:border-forest-600/60 hover:text-forest-700',
                  )}
                >
                  {practiceTypeLabel[option]}
                </button>
              );
            })}
          </div>
        </fieldset>

        <Field label="Title">
          {(id) => (
            <TextInput
              id={id}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Evening grounding"
            />
          )}
        </Field>

        <Field label="Instructions" hint="Plain, unhurried language works best here.">
          {(id) => (
            <TextArea
              id={id}
              rows={3}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="What to do, and what not to worry about."
            />
          )}
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Date">
            {(id) => <TextInput id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
          </Field>
          <Field label="Time">
            {(id) => <TextInput id={id} type="time" value={time} onChange={(e) => setTime(e.target.value)} />}
          </Field>
        </div>

        <ChoiceGroup<RepeatRule>
          label="Repeat"
          value={repeat}
          onChange={setRepeat}
          options={[
            { value: 'once', label: 'Once' },
            { value: 'daily', label: 'Daily', hint: 'Next 7 days' },
            { value: 'weekdays', label: 'Weekdays' },
            { value: 'weekly', label: 'Weekly', hint: 'Next 4 weeks' },
          ]}
        />

        <ChoiceGroup<ReminderRule>
          label="Reminder"
          value={reminder}
          onChange={setReminder}
          options={[
            { value: 'none', label: 'None' },
            { value: 'at-time', label: 'At the time' },
            { value: '15-min-before', label: '15 min before' },
            { value: 'morning-of', label: 'Morning of' },
          ]}
        />

        <Field label="Attach a resource" hint={resource?.summary}>
          {(id) => (
            <Select id={id} value={resourceId} onChange={(e) => setResourceId(e.target.value)}>
              <option value="">No resource</option>
              {state.resources.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title} · {r.durationMin} min
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Optional message" hint="Shown with the activity in the client's app.">
          {(id) => (
            <TextArea
              id={id}
              rows={2}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Something short and warm, if it helps."
            />
          )}
        </Field>

        <Toggle
          checked={invitesReflection}
          onChange={setInvitesReflection}
          label="Invite a written reflection"
          description="The client chooses whether to keep it private or share it with you. You will always see that the activity was completed."
        />
      </div>
    </Drawer>
  );
}
