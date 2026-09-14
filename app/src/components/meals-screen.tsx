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
  special: "Special",
  other: "Meal",
};

/**
 * Visual Fidelity Phase 1 - ported from the approved Figma source's
 * MealsScreen. Figma's example hardcodes a special photo-bleed treatment
 * for exactly its 3rd meal - an artifact of that one fixed example, not a
 * generalizable rule for a real, variably-sized meal list. Reproduced
 * here as: the first meal gets the wide "featured" horizontal treatment,
 * every other meal gets the standard photo-top card - the same varied-
 * rhythm intent (not every card looks identical), generalized to any
 * number of real meals rather than fitted to exactly three.
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
        {meals.map((meal, idx) =>
          idx === 0 ? (
            <div
              key={idx}
              className="rounded-3xl overflow-hidden shadow-sm flex h-[140px]"
              style={{ background: "var(--rbr-cream)", border: "1px solid color-mix(in srgb, var(--rbr-sand) 30%, transparent)" }}
            >
              <div className="flex-1 p-4 flex flex-col justify-between min-w-0">
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-[10px] tracking-[0.18em] uppercase font-semibold" style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-mist)" }}>
                      {MEAL_TYPE_LABEL[meal.mealType] ?? meal.mealType}
                    </span>
                    <span className="text-[11px] font-medium" style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-secondary-foreground)" }}>
                      {meal.startTime}
                    </span>
                  </div>
                  <h3 className="text-[16px] leading-snug mt-1" style={{ fontFamily: "var(--rbr-font-display)", color: "var(--rbr-text)" }}>
                    {meal.name}
                  </h3>
                </div>
                {meal.dietaryTags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {meal.dietaryTags.map((t) => (
                      <DietaryTag key={t} tag={t} />
                    ))}
                  </div>
                )}
              </div>
              <div className="w-[130px] flex-shrink-0">
                {meal.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={meal.imageUrl} alt={meal.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full" style={{ background: "var(--rbr-sand)" }} />
                )}
              </div>
            </div>
          ) : (
            <div
              key={idx}
              className="rounded-3xl overflow-hidden shadow-sm"
              style={{ background: "var(--rbr-cream)", border: "1px solid color-mix(in srgb, var(--rbr-sand) 30%, transparent)" }}
            >
              <div className="relative h-[160px]">
                {meal.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={meal.imageUrl} alt={meal.name} className="w-full h-full object-cover" />
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
          )
        )}
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
