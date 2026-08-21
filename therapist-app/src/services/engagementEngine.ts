import type { ClientStatus, ISODate } from '@/types';

/**
 * Engagement Rhythm engine.
 *
 * Two rules shape everything here:
 *
 *  1. A client is compared against *their own* usual rhythm, never against
 *     other clients and never against a universal completion threshold.
 *  2. The engine reports **observable behaviour only**. It never interprets,
 *     never scores risk, and never implies a clinical direction. Interpretation
 *     belongs to the therapist.
 *
 * The demo feeds this engine mock signals, but the signal set below is the real
 * one: a future backend can populate the same `EngagementSignals` from stored
 * activity events and every consumer keeps working unchanged.
 */

export interface EngagementSignals {
  /** The client's own baseline completion rate across prior weeks, 0–100. */
  usualCompletionRate: number;
  /** Per-day completion for the recent window, oldest first. */
  recentDays: DaySignal[];
  /** Practices assigned across the recent window. */
  assignedRecent: number;
  /** Practices completed across the recent window. */
  completedRecent: number;
  /** Consecutive assigned practices missed, most recent run. */
  missedStreak: number;
  /** Whole days since the last recorded activity of any kind. */
  daysInactive: number;
  /** The client's usual reply time, in hours. */
  typicalReplyHours: number;
  /** Hours the client's most recent reply actually took, if there was one. */
  lastReplyHours?: number;
  /** Session-preparation prompts answered / total for the next session. */
  sessionPrep?: { answered: number; total: number };
  /** Resources opened across the recent window. */
  resourceOpens: number;
  /** Weeks the pair has been working together — a new client has little baseline. */
  weeksTogether: number;
}

export interface DaySignal {
  date: ISODate;
  assigned: number;
  completed: number;
  /** Practice titles missed that day, for plain-language observations. */
  missedTitles?: string[];
  /** Part-of-day buckets that were missed, for pattern wording. */
  missedPartsOfDay?: ('morning' | 'midday' | 'evening')[];
}

export interface EngagementConfig {
  /** Days in the "recent pattern" window. */
  window: number;
  /**
   * Recency weights applied to the window, oldest → newest. Recent days matter
   * more than the edge of the window, so the pattern reacts without whiplash.
   */
  recencyWeights: number[];
  /** Percentage-point drop from usual rhythm that counts as a real change. */
  meaningfulDropPoints: number;
  /** Percentage-point drop that is worth a suggested check-in. */
  checkInDropPoints: number;
  /** Days without any activity before the client reads as recently quiet. */
  inactivityDays: number;
  /** Fraction of usual rhythm a client must reach today to read as re-engaged. */
  reEngagementRatio: number;
  /** A day below this fraction of its own plan counts as a quiet day. */
  quietDayRatio: number;
  /** Quiet days immediately before a return before it reads as re-engagement. */
  quietDaysBeforeReturn: number;
  /** How much of a day's plan must be complete for it to count as a return. */
  returnDayCompleteness: number;
  /** Consecutive assigned practices missed that reads as a pattern. */
  missedStreakSignal: number;
  /** Below this many weeks together, the baseline is treated as provisional. */
  newClientWeeks: number;
}

export const defaultEngagementConfig: EngagementConfig = {
  window: 3,
  recencyWeights: [0.2, 0.4, 0.4],
  meaningfulDropPoints: 25,
  checkInDropPoints: 15,
  inactivityDays: 3,
  reEngagementRatio: 0.8,
  quietDayRatio: 0.8,
  quietDaysBeforeReturn: 2,
  returnDayCompleteness: 0.6,
  missedStreakSignal: 3,
  newClientWeeks: 3,
};

export interface EngagementReading {
  status: ClientStatus;
  /** Recency-weighted completion across the recent window, 0–100. */
  recentRhythm: number;
  /** The client's own baseline, echoed for convenience. */
  usualRhythm: number;
  /** Signed percentage-point change against the client's own usual rhythm. */
  changePoints: number;
  /** One calm sentence describing what changed — observation, not judgement. */
  headline: string;
  /** Supporting observable notes. Never interpretive. */
  observations: string[];
  /**
   * Ordering weight for "Needs Your Attention". Deliberately *not* called a
   * risk score: it only ranks how much a client's rhythm differs from their own.
   */
  attentionWeight: number;
  /** Which signals actually contributed, so the UI can show its reasoning. */
  contributing: string[];
}

function weightedRecent(days: DaySignal[], config: EngagementConfig): number {
  const window = days.slice(-config.window);
  if (window.length === 0) return 0;
  const weights = config.recencyWeights.slice(-window.length);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0) || 1;
  const score = window.reduce((sum, day, i) => {
    const rate = day.assigned === 0 ? 0 : day.completed / day.assigned;
    return sum + rate * (weights[i] ?? 0);
  }, 0);
  return Math.round((score / totalWeight) * 100);
}

/**
 * A return is a day where the client picked their plan back up after a quiet
 * run. It is deliberately not "one completion after a gap" — a single tick does
 * not describe a rhythm, and surfacing it that way would overstate the signal.
 */
function detectReturn(
  days: DaySignal[],
  usualRhythm: number,
  config: EngagementConfig,
): { date: ISODate; quietRun: number } | null {
  for (let i = days.length - 1; i >= Math.max(0, days.length - 2); i -= 1) {
    const day = days[i];
    if (!day || day.assigned === 0 || day.completed === 0) continue;
    if (day.completed < config.returnDayCompleteness * day.assigned) continue;
    const rate = (day.completed / day.assigned) * 100;
    if (rate < usualRhythm * config.reEngagementRatio) continue;

    let quietRun = 0;
    for (let j = i - 1; j >= 0; j -= 1) {
      const prev = days[j];
      if (!prev || prev.assigned === 0) continue; // days with no plan are not quiet days
      if (prev.completed / prev.assigned < config.quietDayRatio) quietRun += 1;
      else break;
    }
    if (quietRun >= config.quietDaysBeforeReturn) return { date: day.date, quietRun };
  }
  return null;
}

function partOfDayPattern(days: DaySignal[]): { part: string; since?: ISODate } | null {
  const counts = new Map<string, ISODate>();
  const tally = new Map<string, number>();
  for (const day of days) {
    for (const part of day.missedPartsOfDay ?? []) {
      tally.set(part, (tally.get(part) ?? 0) + 1);
      if (!counts.has(part)) counts.set(part, day.date);
    }
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [part, count] of tally) {
    if (count > bestCount) {
      best = part;
      bestCount = count;
    }
  }
  if (!best || bestCount < 2) return null;
  return { part: best, since: counts.get(best) };
}

/**
 * Evaluate a client's engagement rhythm.
 *
 * Note there is no universal "35%" rule anywhere in here — thresholds are
 * relative to `usualCompletionRate` and configurable per practice.
 */
export function evaluateEngagement(
  signals: EngagementSignals,
  config: EngagementConfig = defaultEngagementConfig,
): EngagementReading {
  const recentRhythm = weightedRecent(signals.recentDays, config);
  const usualRhythm = Math.round(signals.usualCompletionRate);
  const changePoints = recentRhythm - usualRhythm;
  const drop = -changePoints;
  const observations: string[] = [];
  const contributing: string[] = [];

  const pattern = partOfDayPattern(signals.recentDays.slice(-config.window - 1));
  if (pattern) {
    const sinceDay = pattern.since
      ? new Date(`${pattern.since}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' })
      : null;
    observations.push(
      sinceDay
        ? `${cap(pattern.part)} practices have been less consistent since ${sinceDay}.`
        : `${cap(pattern.part)} practices have been less consistent than usual.`,
    );
    contributing.push('missed activity sequence');
  }

  if (signals.assignedRecent > 0) {
    observations.push(
      `Completed ${signals.completedRecent} of ${signals.assignedRecent} assigned activities over the last ${config.window} days.`,
    );
    contributing.push('recent completion');
  }

  if (signals.daysInactive >= config.inactivityDays) {
    observations.push(
      `No recorded activity for ${signals.daysInactive} ${signals.daysInactive === 1 ? 'day' : 'days'}.`,
    );
    contributing.push('days inactive');
  }

  if (signals.missedStreak >= config.missedStreakSignal) {
    observations.push(`${signals.missedStreak} assigned activities in a row have not been marked complete.`);
    contributing.push('missed activity sequence');
  }

  if (
    signals.lastReplyHours !== undefined &&
    signals.lastReplyHours > signals.typicalReplyHours * 2 &&
    signals.lastReplyHours >= 12
  ) {
    observations.push('Replies have taken longer than usual this week.');
    contributing.push('response timing');
  }

  if (signals.sessionPrep && signals.sessionPrep.total > 0) {
    const { answered, total } = signals.sessionPrep;
    observations.push(`${answered} of ${total} session preparation prompts completed.`);
    contributing.push('session preparation');
  }

  if (signals.resourceOpens > 0) {
    contributing.push('resource engagement');
  }

  const returned = detectReturn(signals.recentDays, usualRhythm, config);

  let status: ClientStatus;
  if (signals.weeksTogether < config.newClientWeeks) {
    status = 'new-client';
  } else if (returned) {
    status = 're-engaged';
    contributing.push('re-engagement after a quiet stretch');
    observations.unshift(
      `Picked the plan back up after ${returned.quietRun} quieter ${
        returned.quietRun === 1 ? 'day' : 'days'
      }.`,
    );
  } else if (signals.daysInactive >= config.inactivityDays) {
    status = 'recently-inactive';
  } else if (drop >= config.meaningfulDropPoints) {
    status = 'change-detected';
  } else if (drop >= config.checkInDropPoints || signals.missedStreak >= config.missedStreakSignal) {
    status = 'check-in-suggested';
  } else {
    status = 'on-track';
  }

  const headline = buildHeadline(status, {
    drop,
    window: config.window,
    daysInactive: signals.daysInactive,
    pattern: pattern?.part,
  });

  /**
   * Ordering weight for "Needs Your Attention" — deliberately not a risk score.
   * A change that is still unfolding ranks above a client who has been quiet for
   * a while: the unfolding one is what a therapist can still respond to between
   * sessions, while a longer quiet stretch is usually a state they already know
   * about. The missed-run term is capped so a long silence cannot dominate the
   * ordering twice over (it already shows up in the drop).
   */
  const statusBonus: Partial<Record<ClientStatus, number>> = {
    'change-detected': 100,
    'recently-inactive': 70,
    'check-in-suggested': 30,
  };
  const attentionWeight =
    (statusBonus[status] ?? 0) + Math.max(0, drop) + Math.min(signals.missedStreak, 3) * 3;

  return {
    status,
    recentRhythm,
    usualRhythm,
    changePoints,
    headline,
    observations,
    attentionWeight,
    contributing: Array.from(new Set(contributing)),
  };
}

function buildHeadline(
  status: ClientStatus,
  ctx: { drop: number; window: number; daysInactive: number; pattern?: string },
): string {
  switch (status) {
    case 'recently-inactive':
      return `No activity recorded for ${ctx.daysInactive} days.`;
    case 'change-detected':
      return `Engagement has decreased during the last ${ctx.window} days.`;
    case 'check-in-suggested':
      return ctx.pattern
        ? `${cap(ctx.pattern)} practices have shifted from the usual pattern.`
        : 'Activity has been slightly below the usual rhythm.';
    case 're-engaged':
      return 'Returned to the usual activity rhythm.';
    case 'new-client':
      return 'Getting started — a usual rhythm is still forming.';
    case 'on-track':
    default:
      return 'Activity is in line with the usual rhythm.';
  }
}

function cap(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/* ------------------------------------------------------- presentation model */

export const statusLabel: Record<ClientStatus, string> = {
  'on-track': 'On Track',
  'change-detected': 'Change Detected',
  'check-in-suggested': 'Check-In Suggested',
  'recently-inactive': 'Recently Inactive',
  're-engaged': 'Re-Engaged',
  'new-client': 'New Client',
};

/**
 * Calm, non-alarming treatments. Status is *never* communicated by colour
 * alone — every consumer also renders the label and an icon.
 */
export const statusTone: Record<ClientStatus, { chip: string; dot: string; icon: string }> = {
  'on-track': { chip: 'bg-sage-100 text-forest-600 ring-sage-200', dot: 'bg-sage-400', icon: 'steady' },
  'change-detected': { chip: 'bg-amber-wash text-[#8A6224] ring-[#EADCC2]', dot: 'bg-amber-soft', icon: 'shift' },
  'check-in-suggested': { chip: 'bg-amber-wash text-[#8A6224] ring-[#EADCC2]', dot: 'bg-amber-soft', icon: 'check-in' },
  'recently-inactive': { chip: 'bg-rose-wash text-[#8E5F5F] ring-[#EBD8D8]', dot: 'bg-rose-soft', icon: 'quiet' },
  're-engaged': { chip: 'bg-sage-200 text-forest-700 ring-sage-300', dot: 'bg-forest-600', icon: 'return' },
  'new-client': { chip: 'bg-cream text-ink-muted ring-sage-200', dot: 'bg-sage-300', icon: 'new' },
};

export const statusOrder: ClientStatus[] = [
  'recently-inactive',
  'change-detected',
  'check-in-suggested',
  're-engaged',
  'new-client',
  'on-track',
];

/** Statuses that place a client in "Needs Your Attention". */
export const attentionStatuses: ClientStatus[] = [
  'recently-inactive',
  'change-detected',
  'check-in-suggested',
];
