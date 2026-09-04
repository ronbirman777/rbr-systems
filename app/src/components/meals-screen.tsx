import { deriveThemeVars } from "@/lib/theme/deriveTheme";
import type { BrandConfig } from "@/lib/theme/tokens";
import type { DisplayMeal } from "@/lib/modules/meal";
import type { CSSProperties } from "react";

export type MealsScreenProps = {
  brand: BrandConfig;
  meals: DisplayMeal[];
};

const MEAL_TYPE_LABEL: Record<string, string> = {
  breakfast: "Breakfast",
  brunch: "Brunch",
  lunch: "Lunch",
  dinner: "Dinner",
  special: "Special Dinner",
  other: "Meal",
};

/**
 * The dedicated InnerDweS-controlled renderer for the "meals" module -
 * hospitality-oriented, not a database list: each entry reads like a menu
 * card (photo, meal type, time, description, dietary tags) rather than a
 * row of fields. Same principle as every other module renderer - the
 * organizer supplies content, InnerDweS owns every pixel of layout.
 */
export function MealsScreen({ brand, meals }: MealsScreenProps) {
  const vars = deriveThemeVars(brand) as CSSProperties;

  return (
    <div
      style={{
        ...vars,
        background: "var(--rbr-background)",
        borderRadius: "var(--rbr-radius-lg)",
        padding: "var(--rbr-spacing-unit)",
        fontFamily: "var(--font-geist-sans), sans-serif",
      }}
      className="w-full h-full flex flex-col gap-3 overflow-y-auto"
    >
      <div className="text-[10px] uppercase tracking-[0.16em] text-black/40 px-1">Meals</div>
      {meals.length === 0 && <div className="text-xs text-black/40 px-1">Nothing planned yet.</div>}
      {meals.map((meal, i) => (
        <div
          key={i}
          style={{ background: "var(--rbr-surface)", borderRadius: "var(--rbr-radius-md)" }}
          className="overflow-hidden flex gap-3"
        >
          {meal.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={meal.imageUrl} alt="" className="w-20 shrink-0 object-cover self-stretch" />
          ) : (
            <div className="w-20 shrink-0 self-stretch" style={{ background: "var(--rbr-secondary)" }} aria-hidden="true" />
          )}
          <div className="py-3 pr-3 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
                style={{ background: "var(--rbr-primary)", color: "var(--rbr-on-primary)" }}
              >
                {MEAL_TYPE_LABEL[meal.mealType] ?? meal.mealType}
              </span>
              <span className="text-[10px] text-black/45">
                {meal.startTime}
                {meal.endTime ? `–${meal.endTime}` : ""}
              </span>
            </div>
            <div className="text-base font-serif mt-1" style={{ color: "var(--rbr-primary)" }}>
              {meal.name}
            </div>
            {meal.location && <div className="text-xs text-black/45 mt-0.5">{meal.location}</div>}
            {meal.description && <div className="text-xs text-black/60 mt-1.5 leading-relaxed">{meal.description}</div>}
            {meal.dietaryTags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {meal.dietaryTags.map((tag, j) => (
                  <span key={j} className="text-[9px] text-black/50 border border-black/15 rounded-full px-1.5 py-0.5">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
