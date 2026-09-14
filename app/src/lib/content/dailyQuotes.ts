/**
 * The Daily Inspiration quote set. Extracted verbatim from the Wonderland
 * Guest App source (`Wonderland App/index.html`, `DAILY_QUOTES`) at the
 * user's explicit request - not invented. Fixed, InnerDweS-owned content,
 * identical across every tenant (like GUEST_BASE_PALETTE) - not organizer-
 * editable, so it needs no persistence of its own; only the per-tenant
 * on/off state lives in module_configs (module_key "dailyInspiration").
 */
export type DailyQuote = { text: string; source: string };

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
