import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { Drawer } from '@/components/ui/Overlay';
import { Button } from '@/components/ui/Button';
import { ChoiceRow, Field, TextInput } from '@/components/ui/Field';
import { useApp } from '@/state/AppProvider';
import { useToast } from '@/components/ui/Toast';
import type { ExceptionReason } from '@/types';
import { fullDate, todayISO } from '@/utils/date';
import { cn } from '@/utils/cn';

export const reasonLabel: Record<ExceptionReason, string> = {
  vacation: 'Vacation',
  personal: 'Personal Time',
  conference: 'Conference',
  lunch: 'Lunch',
  'private-appointment': 'Private Appointment',
  unavailable: 'Unavailable',
};

const REASONS: ExceptionReason[] = [
  'lunch',
  'personal',
  'private-appointment',
  'vacation',
  'conference',
  'unavailable',
];

/** Time John is not available. Never offered to a client, and never explained to one. */
export function BlockTimeDrawer({
  open,
  onClose,
  date,
}: {
  open: boolean;
  onClose: () => void;
  date?: string;
}) {
  const { dispatch } = useApp();
  const toast = useToast();

  const [day, setDay] = useState(date ?? todayISO());
  const [allDay, setAllDay] = useState(false);
  const [startTime, setStartTime] = useState('13:00');
  const [endTime, setEndTime] = useState('14:00');
  const [reason, setReason] = useState<ExceptionReason>('lunch');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open && date) setDay(date);
  }, [open, date]);

  const save = () => {
    dispatch({
      type: 'availability/block',
      date: day,
      allDay,
      startTime: allDay ? undefined : startTime,
      endTime: allDay ? undefined : endTime,
      reason,
      note: note.trim() || undefined,
    });
    toast(`${reasonLabel[reason]} blocked on ${fullDate(day).split(',')[0]}`);
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      eyebrow="Calendar"
      title="Block Time"
      description="Blocked time never appears as a bookable slot, and clients are never told why."
      footer={
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={save}
            disabled={!allDay && startTime >= endTime}
            icon={<Check className="h-4 w-4" />}
          >
            Block Time
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <Field label="Date">
          {(id) => <TextInput id={id} type="date" value={day} onChange={(e) => setDay(e.target.value)} />}
        </Field>

        <button
          type="button"
          role="switch"
          aria-checked={allDay}
          onClick={() => setAllDay(!allDay)}
          className="flex w-full items-center gap-3 rounded-control border border-sage-line bg-white px-4 py-3 text-left transition-colors hover:border-sage"
        >
          <span
            aria-hidden="true"
            className={cn(
              'inline-flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors',
              allDay ? 'bg-forest' : 'bg-sage-line',
            )}
          >
            <span
              className={cn('h-5 w-5 rounded-full bg-white transition-transform', allDay && 'translate-x-4')}
            />
          </span>
          <span className="text-[0.875rem] font-medium text-ink">All day</span>
        </button>

        {!allDay && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="From">
              {(id) => (
                <TextInput
                  id={id}
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              )}
            </Field>
            <Field label="To">
              {(id) => (
                <TextInput id={id} type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              )}
            </Field>
          </div>
        )}

        <ChoiceRow<ExceptionReason>
          label="Reason"
          value={reason}
          onChange={setReason}
          columns={3}
          options={REASONS.map((value) => ({ value, label: reasonLabel[value] }))}
        />

        <Field label="Note" hint="Optional, and only ever visible to you.">
          {(id) => <TextInput id={id} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
      </div>
    </Drawer>
  );
}
