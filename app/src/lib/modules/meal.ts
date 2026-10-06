import { z } from "zod";
import { imagePositionSchema } from "./imagePosition";

import { DEFAULT_LOCALE, translate, type Locale } from "@/lib/i18n";
/**
 * The explicit schema for the "meals" module_key. Reuses module_items'
 * common columns (name->title, description, imageRef, sort_order) plus a
 * validated metadata shape for the fields that don't fit the shared
 * columns (mealType, startTime, endTime, dietaryTags, location) - the
 * same pattern facilitators established, not a new architecture.
 */
export const MEAL_TYPES = ["breakfast", "brunch", "lunch", "dinner", "special", "other"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export const mealSchema = z.object({
  name: z.string().min(1),
  mealType: z.enum(MEAL_TYPES),
  startTime: z.string(), // "HH:MM"
  endTime: z.string().nullable(),
  description: z.string().nullable(),
  imageRef: z.string().nullable(),
  dietaryTags: z.array(z.string()),
  location: z.string().nullable(),
  /** TASK 020 - shared focal-point contract; see facilitator.ts's own
   * field comment for the full rationale. This module has no prior
   * established default, so it renders at true center when null. */
  imagePosition: imagePositionSchema,
});

export type PublicMeal = z.infer<typeof mealSchema>;
export type EditableMeal = PublicMeal & { id: string; imageUrl?: string | null };
export type DisplayMeal = PublicMeal & { imageUrl: string | null };

/**
 * The meal kind as a person reads it, in the Space's language.
 *
 * The stored value stays the canonical English enum ("breakfast"); only
 * the label is translated. Both the Studio's picker and the Guest meals
 * screen read it from here, so the two cannot disagree.
 */
export function mealTypeLabel(type: MealType, locale: Locale = DEFAULT_LOCALE): string {
  const keys = {
    breakfast: "mealBreakfast",
    brunch: "mealBrunch",
    lunch: "mealLunch",
    dinner: "mealDinner",
    special: "mealSpecial",
    other: "sessionMeal",
  } as const;
  return translate(locale, "flow", keys[type]);
}
