import { useEffect, useState } from 'react';
import { Check, Copy, Plus, X } from 'lucide-react';
import { Drawer } from '@/components/ui/Overlay';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/Field';
import { useApp } from '@/state/AppProvider';
import { useToast } from '@/components/ui/Toast';
import { Eyebrow } from '@/components/ui/Primitives';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS = [1, 2, 3, 4, 5];

interface Window {
  startTime: string;
  endTime: string;
}

/**
 * Weekly availability — when clients may book, not appointments themselves.
 * Bookable slots are derived from these windows once real commitments are
 * removed, so widening a window never overbooks anything.
 */
export function AvailabilityDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, dispatch } = useApp();
  const toast = useToast();
  const [week, setWeek] = useState<Record<number, Window[]>>({});

  useEffect(() => {
    if (!open) return;
    const next: Record<number, Window[]> = {};
    for (let day = 0; day < 7; day += 1) {
      next[day] = state.availability
        .filter((rule) => rule.dayOfWeek === day)
        .map((rule) => ({ startTime: rule.startTime, endTime: rule.endTime }))
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
    }
    setWeek(next);
  }, [open, state.availability]);

  const update = (day: number, index: number, patch: Partial<Window>) =>
    setWeek((current) => ({
      ...current,
      [day]: current[day].map((w, i) => (i === index ? { ...w, ...patch } : w)),
    }));

  const addWindow = (day: number) =>
    setWeek((current) => ({
      ...current,
      [day]: [...(current[day] ?? []), { startTime: '09:00', endTime: '13:00' }],
    }));

  const removeWindow = (day: number, index: number) =>
    setWeek((current) => ({ ...current, [day]: current[day].filter((_, i) => i !== index) }));

  const copyTo = (from: number, targets: number[]) =>
    setWeek((current) => {
      const next = { ...current };
      for (const day of targets) next[day] = current[from].map((w) => ({ ...w }));
      return next;
    });

  const save = () => {
    const rules = Object.entries(week).flatMap(([day, windows]) =>
      windows
        .filter((w) => w.startTime < w.endTime)
        .map((w) => ({ dayOfWeek: Number(day), startTime: w.startTime, endTime: w.endTime })),
    );
    dispatch({ type: 'availability/replace', rules });
    toast('Availability updated');
    onClose();
  };

  const total = Object.values(week).reduce((sum, windows) => sum + windows.length, 0);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      eyebrow="Calendar"
      title="Manage Availability"
      description="The hours clients may book. Appointments and blocked time are removed from these automatically."
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-2xs text-ink-faint">
            {total} {total === 1 ? 'window' : 'windows'} across the week
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} icon={<Check className="h-4 w-4" />}>
              Save Availability
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {DAYS.map((name, day) => {
          const windows = week[day] ?? [];
          return (
            <section key={name}>
              <div className="flex items-center justify-between gap-3">
                <Eyebrow>{name}</Eyebrow>
                {windows.length > 0 && (
                  <div className="flex gap-1">
                    {day === 1 && (
                      <button
                        type="button"
                        onClick={() => copyTo(1, [2, 3, 4, 5])}
                        className="inline-flex min-h-[1.75rem] items-center gap-1.5 rounded-full px-2 text-2xs text-forest-accent transition-colors hover:bg-sage-wash"
                      >
                        <Copy className="h-3 w-3" aria-hidden="true" />
                        Apply to weekdays
                      </button>
                    )}
                    {day !== 1 && WEEKDAYS.includes(day) && (
                      <button
                        type="button"
                        onClick={() => copyTo(day, WEEKDAYS.filter((d) => d !== day))}
                        className="inline-flex min-h-[1.75rem] items-center gap-1.5 rounded-full px-2 text-2xs text-ink-faint transition-colors hover:bg-sage-wash hover:text-forest-accent"
                      >
                        <Copy className="h-3 w-3" aria-hidden="true" />
                        Copy to weekdays
                      </button>
                    )}
                  </div>
                )}
              </div>

              {windows.length === 0 ? (
                <p className="mt-1.5 text-[0.8125rem] text-ink-faint">Not available</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {windows.map((window, index) => (
                    <li key={index} className="flex items-center gap-2">
                      <TextInput
                        type="time"
                        value={window.startTime}
                        onChange={(e) => update(day, index, { startTime: e.target.value })}
                        aria-label={`${name} window ${index + 1} start`}
                        className="flex-1"
                      />
                      <span className="text-2xs text-ink-faint">to</span>
                      <TextInput
                        type="time"
                        value={window.endTime}
                        onChange={(e) => update(day, index, { endTime: e.target.value })}
                        aria-label={`${name} window ${index + 1} end`}
                        className="flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => removeWindow(day, index)}
                        aria-label={`Remove ${name} window ${index + 1}`}
                        className="tap-target shrink-0 rounded-control text-ink-faint transition-colors hover:bg-sage-wash hover:text-rose-deep"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <button
                type="button"
                onClick={() => addWindow(day)}
                className="mt-2 inline-flex min-h-[2rem] items-center gap-1.5 text-[0.8125rem] font-medium text-forest-accent transition-colors hover:underline"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Add another window
              </button>
            </section>
          );
        })}
      </div>
    </Drawer>
  );
}
