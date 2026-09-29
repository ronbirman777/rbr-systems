import { deriveThemeVars } from "@/lib/theme/deriveTheme";
import type { BrandConfig } from "@/lib/theme/tokens";
import type { DisplayMeal } from "@/lib/modules/meal";
import { objectPositionStyle } from "@/lib/modules/imagePosition";
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
  special: "Special",
  other: "Meal",
};

/**
 * Task 014 (item D, first-meal consistency fix): this component
 * previously special-cased `idx === 0` with an entirely different card
 * (a narrow horizontal "featured" layout that silently dropped
 * `description` and `location`) - ported directly from the approved
 * Figma source's one fixed 3-meal example, which hardcoded a distinct
 * treatment for its own 3rd meal. Generalizing that as "the first real
 * meal always looks different" was never a deliberate product rule for a
 * variable-length list, and it directly broke this same requirement:
 * "the guest sees the selected meal's primary image prominently... every
 * meal must use the same component/layout/data contract as the others."
 * Every meal - first or not - now renders through this one card shape,
 * with its own `imageUrl` (or a neutral placeholder when absent - never
 * another meal's image, never a broken layout), full name/time/type,
 * description, location, and dietary tags, apart from legitimate content
 * differences.
 */
export function MealsScreen({ brand, meals }: MealsScreenProps) {
  const vars = deriveThemeVars(brand) as CSSProperties;

  return (
    <div style={vars} className="flex-1 overflow-y-auto no-scrollbar">
      <div className="px-6 pt-7 pb-5">
        <p className="text-[10px] tracking-[0.18em] uppercase font-medium mb-1" style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-mist)" }}>
          Daily Nourishment
        </p>
        <h1 className="text-[24px] font-normal leading-tight" style={{ fontFamily: "var(--rbr-font-display)", color: "var(--rbr-text)" }}>
          Today&apos;s <em>Meals</em>
        </h1>
      </div>

      {meals.length === 0 && (
        <div className="px-6 text-xs" style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-mist)" }}>
          Nothing added yet.
        </div>
      )}

      <div className="px-4 pb-10 space-y-5">
        {meals.map((meal, idx) => (
          <div
            key={idx}
            className="rounded-3xl overflow-hidden shadow-sm"
            style={{ background: "var(--rbr-cream)", border: "1px solid color-mix(in srgb, var(--rbr-sand) 30%, transparent)" }}
          >
            <div className="relative h-[160px]">
              {meal.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={meal.imageUrl}
                  alt={meal.name}
                  className="w-full h-full object-cover"
                  style={{ objectPosition: objectPositionStyle(meal.imagePosition) }}
                />
              ) : (
                <div className="w-full h-full" style={{ background: "var(--rbr-sand)" }} />
              )}
            </div>
            <div className="p-4">
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-[10px] tracking-[0.18em] uppercase font-semibold" style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-mist)" }}>
                  {MEAL_TYPE_LABEL[meal.mealType] ?? meal.mealType}
                </span>
                <span className="text-[11px] font-medium" style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-clay)" }}>
                  {meal.startTime}
                </span>
              </div>
              <h3 className="text-[18px] leading-snug" style={{ fontFamily: "var(--rbr-font-display)", color: "var(--rbr-text)" }}>
                {meal.name}
              </h3>
              {meal.description && (
                <p className="text-[12px] leading-relaxed mt-1.5" style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-dusk)" }}>
                  {meal.description}
                </p>
              )}
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                {meal.location && (
                  <span className="text-[10px]" style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-mist)" }}>
                    {meal.location}
                  </span>
                )}
                {meal.dietaryTags.map((t) => (
                  <DietaryTag key={t} tag={t} />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DietaryTag({ tag }: { tag: string }) {
  return (
    <span
      className="text-[9px] px-2 py-0.5 rounded-full font-medium tracking-wide"
      style={{
        fontFamily: "var(--rbr-font-ui)",
        background: "var(--rbr-secondary-soft)",
        color: "var(--rbr-secondary-foreground)",
      }}
    >
      {tag}
    </span>
  );
}
