import { z } from "zod";

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
});

export type PublicMeal = z.infer<typeof mealSchema>;
export type EditableMeal = PublicMeal & { id: string; imageUrl?: string | null };
export type DisplayMeal = PublicMeal & { imageUrl: string | null };
