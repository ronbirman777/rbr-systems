import type { AttentionState, ISODate, PartOfDay } from '@/types';

/**
 * Individual Baseline Intelligence.
 *
 * Three rules shape everything in this file:
 *
 *  1. A client is compared against **their own** learned rhythm. There is no
 *     cohort average, no universal benchmark and no fixed completion target
 *     anywhere in this product.
 *  2. The output is **observable behaviour**, phrased in ordinary language. No
 *     anomaly score, no confidence value, no z-score, no risk rating — and no
 *     terminology that could be mistaken for a clinical judgement.
 *  3. Everything here is **private to the practitioner**. None of it is exposed
 *     in the client experience; see `services/clientView.ts`.
 *
 * The demo feeds this engine mock signals, but the signal set is the real one:
 * a future Supabase-backed implementation can populate the same
 * `BaselineSignals` from stored activity and every consumer keeps working.
 */

export interface DaySignal {
  date: ISODate;
  /** Practices scheduled that day. */
  assigned: number;
  completed: number;
  /** Parts of the day whose practices came and went without being completed. */
  missedPartsOfDay: PartOfDay[];
}

export interface BaselineSignals {
  /** The client's own learned completion rate over `baselineDays`, 0–100. */
  usualRhythm: number;
  baselineDays: number;
  /** Per-day history, oldest first. At least `window` entries. */
  days: DaySignal[];
  /** Whole days since any recorded activity. */
  daysInactive: number;
  /** Weeks working together — a new client has no baseline to deviate from. */
  weeksTogether: number;
  /** Reflections submitted inside the recent window. */
  recentReflections: number;
  /** Preparation answered for the next session, when there is one. */
  sessionPrep?: { answered: number; total: number };
  /** Resources opened inside the recent window. */
  resourceOpens: number;
}

export interface BaselineConfig {
  /** Days in the "recent rhythm" window. */
  window: number;
  /**
   * Recency weights across the window, oldest → newest. Recent days matter more
   * than the far edge, so the reading moves without whiplash.
   */
  recencyWeights: number[];
  /** Points below the client's own rhythm that read as a meaningful change. */
  changePoints: number;
  /** Points below their own rhythm that are worth a suggested check in. */
  checkInPoints: number;
  /** Days with no activity at all before a client reads as recently inactive. */
  inactiveDays: number;
  /** Share of their own rhythm a return day must reach. */
  returnRatio: number;
  /** A day below this share of its own plan counts as a quiet day. */
  quietDayRatio: number;
  /** Quiet days immediately before a return before it reads as re-engagement. */
  quietDaysBeforeReturn: number;
  /** How much of a day's plan must be done for that day to count as a return. */
  returnCompleteness: number;
  /** Below this many weeks together, the baseline is still forming. */
  baselineFormingWeeks: number;
  /** Times a part of the day must be missed inside the window to read as a pattern. */
  patternThreshold: number;
}

export const defaultBaselineConfig: BaselineConfig = {
  window: 3,
  recencyWeights: [0.2, 0.4, 0.4],
  changePoints: 25,
  checkInPoints: 15,
  inactiveDays: 3,
  returnRatio: 0.8,
  quietDayRatio: 0.8,
  quietDaysBeforeReturn: 2,
  returnCompleteness: 0.6,
  baselineFormingWeeks: 3,
  patternThreshold: 2,
};

export interface BaselineReading {
  state: AttentionState;
  /** The client's own learned rhythm, echoed for convenience. */
  usualRhythm: number;
  /** Recency-weighted completion across the recent window, 0–100. */
  recentRhythm: number;
  /** Signed change in points against their own rhythm. */
  changePoints: number;
  /** One calm sentence. An observation, never a conclusion. */
  headline: string;
  /** A single supporting pattern note, when one is actually present. */
  insight?: string;
  /** Further observable notes, in plain language. */
  observations: string[];
  /** Ordering weight for the briefing. Deliberately not a score shown anywhere. */
  attentionWeight: number;
  /** Which inputs actually contributed, so the reasoning can be shown. */
  contributing: string[];
}

const PART_LABEL: Record<PartOfDay, string> = {
  morning: 'Morning',
  midday: 'Midday',
  evening: 'Evening',
  night: 'Night',
};

function weightedRecent(days: DaySignal[], config: BaselineConfig): number {
  const window = days.slice(-config.window);
  if (window.length === 0) return 0;
  const weights = config.recencyWeights.slice(-window.length);
  const total = weights.reduce((sum, w) => sum + w, 0) || 1;
  const score = window.reduce((sum, day, i) => {
    const rate = day.assigned === 0 ? 0 : day.completed / day.assigned;
    return sum + rate * (weights[i] ?? 0);
  }, 0);
  return Math.round((score / total) * 100);
}

/** Which part of the day has slipped most often inside the window. */
function partOfDayPattern(days: DaySignal[], config: BaselineConfig): PartOfDay | null {
  const tally = new Map<PartOfDay, number>();
  for (const day of days.slice(-config.window - 1)) {
    for (const part of day.missedPartsOfDay) {
      tally.set(part, (tally.get(part) ?? 0) + 1);
    }
  }
  let best: PartOfDay | null = null;
  let bestCount = 0;
  for (const [part, count] of tally) {
    if (count > bestCount) {
      best = part;
      bestCount = count;
    }
  }
  return best && bestCount >= config.patternThreshold ? best : null;
}

/**
 * A return is a day where the client picked their plan back up after a quiet
 * run — deliberately not "one completion after a gap", which does not describe
 * a rhythm and would overstate the signal.
 */
function detectReturn(
  days: DaySignal[],
  usualRhythm: number,
  config: BaselineConfig,
): { date: ISODate; quietRun: number } | null {
  for (let i = days.length - 1; i >= Math.max(0, days.length - 2); i -= 1) {
    const day = days[i];
    if (!day || day.assigned === 0 || day.completed === 0) continue;
    if (day.completed < config.returnCompleteness * day.assigned) continue;
    if ((day.completed / day.assigned) * 100 < usualRhythm * config.returnRatio) continue;

    let quietRun = 0;
    for (let j = i - 1; j >= 0; j -= 1) {
      const prev = days[j];
      if (!prev || prev.assigned === 0) continue; // a day with no plan is not a quiet day
      if (prev.completed / prev.assigned < config.quietDayRatio) quietRun += 1;
      else break;
    }
    if (quietRun >= config.quietDaysBeforeReturn) return { date: day.date, quietRun };
  }
  return null;
}

export function readBaseline(
  signals: BaselineSignals,
  config: BaselineConfig = defaultBaselineConfig,
): BaselineReading {
  const usualRhythm = Math.round(signals.usualRhythm);
  const recentRhythm = weightedRecent(signals.days, config);
  const changePoints = recentRhythm - usualRhythm;
  const drop = -changePoints;

  const observations: string[] = [];
  const contributing: string[] = [];
  const window = signals.days.slice(-config.window);
  const assignedRecent = window.reduce((sum, d) => sum + d.assigned, 0);
  const completedRecent = window.reduce((sum, d) => sum + d.completed, 0);

  const pattern = partOfDayPattern(signals.days, config);

  if (assignedRecent > 0) {
    observations.push(
      `${completedRecent} of ${assignedRecent} practices completed over the last ${config.window} days.`,
    );
    contributing.push('recent completion');
  }
  if (signals.daysInactive >= config.inactiveDays) {
    observations.push(
      `No recorded activity for ${signals.daysInactive} ${signals.daysInactive === 1 ? 'day' : 'days'}.`,
    );
    contributing.push('days inactive');
  }
  if (signals.recentReflections > 0) {
    observations.push(
      `${signals.recentReflections} ${signals.recentReflections === 1 ? 'reflection' : 'reflections'} shared this week.`,
    );
    contributing.push('reflections');
  }
  if (signals.sessionPrep && signals.sessionPrep.total > 0) {
    observations.push(
      `${signals.sessionPrep.answered} of ${signals.sessionPrep.total} session preparation questions answered.`,
    );
    contributing.push('session preparation');
  }
  if (signals.resourceOpens > 0) contributing.push('resource engagement');

  const returned = detectReturn(signals.days, usualRhythm, config);

  let state: AttentionState;
  if (signals.weeksTogether < config.baselineFormingWeeks) {
    state = 'baseline-forming';
  } else if (returned) {
    state = 're-engaged';
    contributing.push('return after a quiet stretch');
    observations.unshift(
      `Picked the plan back up after ${returned.quietRun} quieter ${returned.quietRun === 1 ? 'day' : 'days'}.`,
    );
  } else if (signals.daysInactive >= config.inactiveDays) {
    state = 'recently-inactive';
  } else if (drop >= config.changePoints) {
    state = 'change-detected';
  } else if (drop >= config.checkInPoints) {
    state = 'check-in-suggested';
  } else {
    state = 'on-track';
  }

  /**
   * Ordering weight for the briefing — not a risk score, and never shown as a
   * number. A change that is still unfolding ranks above a longer quiet
   * stretch, because it is the one a practitioner can still respond to between
   * sessions; a client who has been quiet for days is usually a state they have
   * already noticed.
   */
  const stateBonus: Partial<Record<AttentionState, number>> = {
    'change-detected': 100,
    'recently-inactive': 70,
    'check-in-suggested': 30,
  };
  const attentionWeight = (stateBonus[state] ?? 0) + Math.max(0, drop);

  /**
   * The pattern note only earns its place where the shape of the week is the
   * story. When a client has simply been quiet, or has just come back, the
   * headline already says the useful thing and a pattern note would be noise.
   */
  const showPattern = state === 'change-detected' || state === 'check-in-suggested' || state === 'on-track';
  const insight =
    pattern && showPattern
      ? `${PART_LABEL[pattern]} practices have been missed more often this week.`
      : undefined;
  if (insight) contributing.push('missed practice pattern');

  return {
    state,
    usualRhythm,
    recentRhythm,
    changePoints,
    headline: headlineFor(state, { drop, window: config.window, daysInactive: signals.daysInactive }),
    insight,
    observations,
    attentionWeight,
    contributing: Array.from(new Set(contributing)),
  };
}

function headlineFor(
  state: AttentionState,
  ctx: { drop: number; window: number; daysInactive: number },
): string {
  switch (state) {
    case 'recently-inactive':
      return `Inactive for ${ctx.daysInactive} days.`;
    case 'change-detected':
      return 'Recent activity is noticeably different from the usual rhythm.';
    case 'check-in-suggested':
      return 'Recent activity is a little below the usual rhythm.';
    case 're-engaged':
      return 'Back in the usual rhythm after a quieter stretch.';
    case 'baseline-forming':
      return 'Early weeks — a usual rhythm is still forming.';
    case 'on-track':
    default:
      return 'Activity is in line with the usual rhythm.';
  }
}

/* ----------------------------------------------------------- presentation */

/** Calm treatments. State is never carried by colour alone — always a label too. */
export const attentionTone: Record<AttentionState, { chip: string; dot: string }> = {
  'on-track': { chip: 'bg-sage-wash text-forest-accent ring-sage-soft', dot: 'bg-sage' },
  'change-detected': { chip: 'bg-amber-wash text-amber-deep ring-amber-line', dot: 'bg-amber' },
  'check-in-suggested': { chip: 'bg-amber-wash text-amber-deep ring-amber-line', dot: 'bg-amber' },
  'recently-inactive': { chip: 'bg-rose-wash text-rose-deep ring-rose-line', dot: 'bg-rose' },
  're-engaged': { chip: 'bg-sage-soft text-forest ring-sage', dot: 'bg-forest-accent' },
  'baseline-forming': { chip: 'bg-cream text-ink-soft ring-sage-soft', dot: 'bg-sage' },
};

/** States that place a client under "Needs Attention". */
export const attentionStates: AttentionState[] = [
  'change-detected',
  'recently-inactive',
  'check-in-suggested',
];
