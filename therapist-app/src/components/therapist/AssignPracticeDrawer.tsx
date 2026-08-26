import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { Drawer } from '@/components/ui/Overlay';
import { Button } from '@/components/ui/Button';
import { ChoiceRow, DayPicker, Field, Select, TextArea, TextInput } from '@/components/ui/Field';
import { useApp } from '@/state/AppProvider';
import { useToast } from '@/components/ui/Toast';
import type { Frequency, PracticeType, ReminderRule } from '@/types';
import { practiceTypeLabel } from '@/utils/format';

const TYPES: PracticeType[] = ['breathing', 'meditation', 'journal', 'reflection', 'read', 'listen'];

const DEFAULT_TITLE: Record<PracticeType, string> = {
  breathing: 'Evening Breathing',
  meditation: 'Evening Grounding Meditation',
  journal: 'Evening Reflection',
  reflection: 'Morning Intention',
  read: 'A Short Reading',
  listen: 'Guided Audio',
};

/**
 * Assign Practice. Opens from the client workspace, the Sanctuary and
 * Continuous Care; on assignment the practice appears in the client companion
 * immediately, because both experiences read the same store.
 */
export function AssignPracticeDrawer({
  open,
  onClose,
  clientId,
  resourceId,
}: {
  open: boolean;
  onClose: () => void;
  clientId?: string;
  resourceId?: string;
}) {
  const { state, dispatch } = useApp();
  const toast = useToast();

  const [client, setClient] = useState(clientId ?? state.clients[0].id);
  const [type, setType] = useState<PracticeType>('meditation');
  const [title, setTitle] = useState(DEFAULT_TITLE.meditation);
  const [instructions, setInstructions] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('daily');
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [targetTime, setTargetTime] = useState('19:00');
  const [reminder, setReminder] = useState<ReminderRule>('at-time');
  const [resource, setResource] = useState(resourceId ?? '');

  useEffect(() => {
    if (!open) return;
    if (clientId) setClient(clientId);
    if (resourceId) {
      setResource(resourceId);
      const found = state.resources.find((r) => r.id === resourceId);
      if (found) setTitle(found.title);
    }
  }, [open, clientId, resourceId, state.resources]);

  const clientName = state.clients.find((c) => c.id === client)?.name ?? 'this client';

  const submit = () => {
    if (!title.trim()) return;
    dispatch({
      type: 'assignment/create',
      draft: {
        clientId: client,
        type,
        title: title.trim(),
        instructions:
          instructions.trim() ||
          state.resources.find((r) => r.id === resource)?.summary ||
          'A short practice between sessions.',
        frequency,
        days,
        targetTime,
        reminder,
        resourceId: resource || undefined,
      },
    });
    toast(`${title.trim()} assigned to ${clientName}`);
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      eyebrow="Continuous care"
      title="Assign Practice"
      description="It appears in the client companion straight away."
      footer={
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={!title.trim()} icon={<Check className="h-4 w-4" />}>
            Assign Practice
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <Field label="Client">
          {(id) => (
            <Select id={id} value={client} onChange={(e) => setClient(e.target.value)}>
              {state.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.focus}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <ChoiceRow<PracticeType>
          label="Practice type"
          value={type}
          onChange={(next) => {
            setType(next);
            if (!title || Object.values(DEFAULT_TITLE).includes(title)) setTitle(DEFAULT_TITLE[next]);
          }}
          options={TYPES.map((value) => ({ value, label: practiceTypeLabel[value] }))}
        />

        <Field label="Title">
          {(id) => <TextInput id={id} value={title} onChange={(e) => setTitle(e.target.value)} />}
        </Field>

        <Field label="Instructions / personal context" hint="Written to the client, in your own voice.">
          {(id) => (
            <TextArea
              id={id}
              rows={3}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder={`Hi ${clientName}, let's try this 5 minute practice when you finish your workday.`}
            />
          )}
        </Field>

        <ChoiceRow<Frequency>
          label="Frequency"
          value={frequency}
          onChange={setFrequency}
          columns={4}
          options={[
            { value: 'daily', label: 'Daily' },
            { value: 'weekdays', label: 'Weekdays' },
            { value: 'specific-days', label: 'Days' },
            { value: 'once', label: 'Once' },
          ]}
        />

        {frequency === 'specific-days' && <DayPicker value={days} onChange={setDays} />}

        <Field label="Target time">
          {(id) => (
            <TextInput id={id} type="time" value={targetTime} onChange={(e) => setTargetTime(e.target.value)} />
          )}
        </Field>

        <ChoiceRow<ReminderRule>
          label="Reminder"
          value={reminder}
          onChange={setReminder}
          columns={2}
          options={[
            { value: 'none', label: 'None' },
            { value: 'at-time', label: 'At the time' },
            { value: '15-min-before', label: '15 min before' },
            { value: 'morning-of', label: 'Morning of' },
          ]}
        />

        <Field label="Resource attachment">
          {(id) => (
            <Select id={id} value={resource} onChange={(e) => setResource(e.target.value)}>
              <option value="">No resource</option>
              {state.resources.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title} · {r.durationMin} min
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
    </Drawer>
  );
}
