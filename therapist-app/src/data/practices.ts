import type { Practice } from '@/types';
import { plans, type AssignmentSeed, type ClientPlan } from './assignments';
import { DEMO_NOW, addDays, atTime, toISODate } from '@/utils/date';

/** How far back the demo carries practice history, and how far forward it runs. */
export const HISTORY_DAYS = 21;
export const HORIZON_DAYS = 5;

const isScheduled = (seed: AssignmentSeed, day: Date) =>
  !seed.days || seed.days.includes(day.getDay());

function completedKeys(plan: ClientPlan, offset: number, scheduled: AssignmentSeed[]): string[] {
  // Negative offsets are stored as string keys in the plan literals; JS resolves
  // `obj[-3]` to the `'-3'` key, so one lookup covers both.
  const explicit = plan.completed[offset];
  if (explicit) return explicit;
  return plan.fallback === 'all' ? scheduled.map((s) => s.key) : plan.fallback;
}

function build(plan: ClientPlan): Practice[] {
  const out: Practice[] = [];

  for (let offset = -HISTORY_DAYS + 1; offset <= HORIZON_DAYS; offset += 1) {
    const day = addDays(DEMO_NOW, offset);
    const date = toISODate(day);
    const scheduled = plan.assignments.filter((seed) => isScheduled(seed, day));
    const done = offset <= 0 ? completedKeys(plan, offset, scheduled) : [];

    for (const seed of scheduled) {
      const target = atTime(date, seed.targetTime);
      const completedAt = new Date(target.getTime() + (seed.usualDelayMin ?? 12) * 60_000);
      const isDone = done.includes(seed.key) && completedAt <= DEMO_NOW;

      out.push({
        id: `pr-${plan.clientId}-${seed.key}-${date}`,
        assignmentId: `as-${plan.clientId}-${seed.key}`,
        clientId: plan.clientId,
        date,
        type: seed.type,
        title: seed.title,
        instructions: seed.instructions,
        targetTime: seed.targetTime,
        partOfDay: seed.partOfDay,
        durationMin: seed.durationMin,
        resourceId: seed.resourceId,
        optional: seed.optional,
        completedAt: isDone ? completedAt.toISOString() : undefined,
      });
    }
  }

  return out;
}

export const practices: Practice[] = plans.flatMap(build);
