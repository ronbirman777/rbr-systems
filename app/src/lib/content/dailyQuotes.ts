/**
 * The Daily Inspiration quote set. Extracted verbatim from the Wonderland
 * Guest App source (`Wonderland App/index.html`, `DAILY_QUOTES`) at the
 * user's explicit request - not invented. Fixed, InnerDweS-owned content,
 * identical across every tenant (like GUEST_BASE_PALETTE) - not organizer-
 * editable, so it needs no persistence of its own; only the per-tenant
 * on/off state lives in module_configs (module_key "dailyInspiration").
 */
export type DailyQuote = {
  text: string;
  source: string;
  /** True for organizer-authored text (TASK 030 W1.5): rendered dir="auto"
   * and untranslated, with no attribution line when `source` is empty. */
  custom?: boolean;
};

export const DAILY_QUOTES: readonly DailyQuote[] = [
  { text: "The journey of a thousand miles begins with a single step.", source: "Lao Tzu · Tao Te Ching" },
  { text: "Yoga is the stilling of the changing states of the mind.", source: "Patanjali · Yoga Sutras" },
  { text: "Do you have the patience to wait until your mud settles and the water is clear?", source: "Lao Tzu · Tao Te Ching" },
  { text: "Peace comes from within. Do not seek it without.", source: "The Buddha" },
  { text: "Yoga is not about touching your toes. It is about what you learn on the way down.", source: "Jigar Gor" },
  { text: "Knowing others is wisdom. Knowing yourself is enlightenment.", source: "Lao Tzu · Tao Te Ching" },
  { text: "The mind is everything. What you think, you become.", source: "The Buddha" },
  { text: "In yoga, the body is the bow, the asana is the arrow, and the soul is the target.", source: "B.K.S. Iyengar" },
  { text: "Nature does not hurry, yet everything is accomplished.", source: "Lao Tzu · Tao Te Ching" },
  { text: "Three things cannot be long hidden: the sun, the moon, and the truth.", source: "The Buddha" },
  { text: "Yoga is the art of listening — to the body, to the breath, to the silence within.", source: "T.K.V. Desikachar" },
  { text: "Water is fluid, soft, and yielding. But water will wear away rock. Be like water.", source: "Lao Tzu · Tao Te Ching" },
  { text: "Do not dwell in the past, do not dream of the future — concentrate the mind on the present moment.", source: "The Buddha" },
  { text: "The rhythm of the body, the melody of the mind, and the harmony of the soul create the symphony of life.", source: "B.K.S. Iyengar" },
  { text: "To the mind that is still, the whole universe surrenders.", source: "Lao Tzu · Tao Te Ching" },
  { text: "Radiate boundless love towards the entire world — above, below, and across — unhindered, without ill will, without enmity.", source: "The Buddha · Metta Sutta" },
  { text: "Yoga is a light which, once lit, will never dim. The better your practice, the brighter your flame.", source: "B.K.S. Iyengar" },
  { text: "He who knows that enough is enough will always have enough.", source: "Lao Tzu · Tao Te Ching" },
  { text: "In separateness lies the world's great misery; in compassion lies the world's true strength.", source: "The Buddha" },
  { text: "Yoga teaches us to cure what need not be endured and endure what cannot be cured.", source: "B.K.S. Iyengar" },
  { text: "The Tao that can be told is not the eternal Tao. The name that can be named is not the eternal name.", source: "Lao Tzu · Tao Te Ching, Ch. 1" },
  { text: "You yourself, as much as anybody in the entire universe, deserve your love and affection.", source: "The Buddha" },
  { text: "Inhale, and God approaches you. Hold the inhalation, and God remains with you. Exhale, and you approach God.", source: "Krishnamacharya" },
  { text: "Simplicity, patience, compassion — these three are your greatest treasures.", source: "Lao Tzu · Tao Te Ching" },
  { text: "Health is the greatest gift, contentment the greatest wealth, faithfulness the best relationship.", source: "The Buddha · Dhammapada" },
  { text: "Yoga does not just change the way we see things, it transforms the person who sees.", source: "B.K.S. Iyengar" },
  { text: "When you realise there is nothing lacking, the whole world belongs to you.", source: "Lao Tzu · Tao Te Ching" },
  { text: "If you are quiet enough, you will hear the flow of the universe. You will feel its rhythm. Go with this flow.", source: "The Buddha" },
  { text: "The poses we avoid the most are the ones we need the most.", source: "Yoga teaching" },
  { text: "Act without expectation. Lead without dominating. Succeed without taking credit.", source: "Lao Tzu · Tao Te Ching" },
  { text: "Better than a thousand hollow words is one word that brings peace.", source: "The Buddha · Dhammapada" },
] as const;

/**
 * Deterministic by day-of-month, no randomness. `dateIso` must already be
 * computed in the Space's own timezone (see lib/timezone's
 * `todayInTimezone`) - never the guest device's local date - so every
 * guest sees the same quote on the same calendar day regardless of where
 * they are. Day 1 -> index 0 ... day 31 -> index 30, matching the source
 * exactly; a defensive clamp (not the source's modulo) guards day 29-31
 * cleanly if this list were ever shorter.
 */
export function getDailyQuote(dateIso: string): DailyQuote {
  const day = Number(dateIso.slice(8, 10));
  const index = Math.min(Math.max(day - 1, 0), DAILY_QUOTES.length - 1);
  return DAILY_QUOTES[index];
}

/**
 * Time to Teach (shared, additive): a Space may author its own Daily
 * Inspiration list. Same determinism rule as getDailyQuote - one quote per
 * calendar day in the Space's time zone, identical for every guest - but
 * rotating through the tenant's list by day-of-year so any list length
 * cycles evenly. An empty list falls back to the shared InnerDweS set when
 * `useFallback` is on, otherwise shows nothing. getDailyQuote() above is
 * unchanged, so Time to Flow's behaviour is untouched.
 */
export function getDailyQuoteFrom(
  dateIso: string,
  customQuotes: readonly string[],
  useFallback = true,
  source: string | null = null
): DailyQuote | null {
  const quotes = customQuotes.map((q) => q.trim()).filter(Boolean);
  if (quotes.length === 0) return useFallback ? getDailyQuote(dateIso) : null;
  const d = new Date(`${dateIso}T12:00:00Z`);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1, 12);
  const dayOfYear = Number.isNaN(d.getTime()) ? 0 : Math.round((d.getTime() - start) / 86_400_000);
  return { text: quotes[dayOfYear % quotes.length], source: source ?? "" };
}

/**
 * Time to Flow (TASK 030 W1.5): the quote of the day when a Space has
 * authored its own reflections.
 *
 * No custom reflections -> exactly the built-in getDailyQuote(), so every
 * existing Flow Space renders what it always did.
 *
 * With reflections the choice is still one-per-calendar-day in the Space's
 * timezone, identical for every guest, but it is anchored to the
 * RETREAT rather than the calendar year when the Space has a schedule:
 * the first scheduled day shows the first reflection, the second day the
 * second, and so on, cycling when the list is shorter than the stay. That
 * is what lets an organizer write "Day 1 ... Day 7" and have it land on
 * those days. Before the first scheduled day (or with no schedule at all)
 * it falls back to day-of-year rotation, which needs no anchor.
 * `anchorIso` must be a YYYY-MM-DD date; anything else is ignored.
 */
export function getFlowDailyQuote(
  dateIso: string,
  custom: readonly { text: string; label: string | null }[],
  anchorIso: string | null = null
): DailyQuote {
  const items = custom.filter((c) => c.text.trim());
  if (items.length === 0) return getDailyQuote(dateIso);
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  let index: number;
  if (anchorIso && ISO.test(anchorIso) && ISO.test(dateIso) && dateIso >= anchorIso) {
    const days = Math.round((Date.parse(`${dateIso}T12:00:00Z`) - Date.parse(`${anchorIso}T12:00:00Z`)) / 86_400_000);
    index = days % items.length;
  } else {
    const picked = getDailyQuoteFrom(dateIso, items.map((i) => i.text));
    index = items.findIndex((i) => i.text.trim() === picked?.text);
    if (index < 0) index = 0;
  }
  const item = items[index];
  return { text: item.text.trim(), source: item.label?.trim() ?? "", custom: true };
}
