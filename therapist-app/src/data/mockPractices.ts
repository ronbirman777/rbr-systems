import type { Practice } from '@/types';
import { plans, type ClientPlan, type PlanItem } from './practicePlans';
import { DEMO_NOW, addDays, atTime, toISODate } from '@/utils/date';

/** How far back the demo carries practice history. */
export const HISTORY_DAYS = 14;
/** How far forward assignments already exist. */
export const HORIZON_DAYS = 4;

function isScheduled(item: PlanItem, date: Date): boolean {
  if (!item.weekdays) return true;
  return item.weekdays.includes(date.getDay());
}

function completedKeys(plan: ClientPlan, offset: number, scheduled: PlanItem[]): string[] {
  // Negative offsets are stored as string keys in the plan literals; JS resolves
  // `obj[-3]` to the `'-3'` key, so a single lookup covers both.
  const explicit = plan.completed[offset];
  if (explicit) return explicit;
  if (plan.defaultCompleted === 'all') return scheduled.map((item) => item.key);
  return plan.defaultCompleted;
}

function reflectionFor(item: PlanItem, offset: number) {
  if (!item.reflections) return undefined;
  return item.reflections[offset];
}

function buildPracticesFor(plan: ClientPlan): Practice[] {
  const out: Practice[] = [];

  for (let offset = -HISTORY_DAYS + 1; offset <= HORIZON_DAYS; offset += 1) {
    const day = addDays(DEMO_NOW, offset);
    const date = toISODate(day);
    const scheduled = plan.items.filter((item) => isScheduled(item, day));
    const done = offset <= 0 ? completedKeys(plan, offset, scheduled) : [];

    for (const item of scheduled) {
      const scheduledAt = atTime(date, item.time);
      const isDone = done.includes(item.key);
      const completedAt = new Date(scheduledAt.getTime() + (item.usualDelayMin ?? 12) * 60_000);
      const reflection = reflectionFor(item, offset);

      out.push({
        id: `p-${plan.clientId}-${item.key}-${date}`,
        clientId: plan.clientId,
        assignmentId: `a-${plan.clientId}-${item.key}`,
        type: item.type,
        title: item.title,
        instructions: item.instructions,
        date,
        time: item.time,
        partOfDay: item.partOfDay,
        durationMin: item.durationMin,
        repeat: item.weekdays ? 'weekdays' : 'daily',
        reminder: item.partOfDay === 'morning' ? 'at-time' : '15-min-before',
        resourceId: item.resourceId,
        message: item.message,
        invitesReflection: Boolean(item.invitesReflection),
        assignedAt: new Date(scheduledAt.getTime() - 6 * 86_400_000).toISOString(),
        assignedBy: 'john',
        completion:
          isDone && completedAt <= DEMO_NOW
            ? {
                completedAt: completedAt.toISOString(),
                source: 'client',
                reflection: reflection ? { text: reflection.text, visibility: reflection.visibility } : undefined,
              }
            : undefined,
      });
    }
  }

  return out;
}

export const practices: Practice[] = plans.flatMap(buildPracticesFor);
