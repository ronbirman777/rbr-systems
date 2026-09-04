"use client";

import { useActionState, type Dispatch, type SetStateAction } from "react";
import { ModuleItemPhotoField } from "@/components/module-item-photo-field";
import { persistNewItemStub, persistItemRemoval } from "@/lib/modules/persistItem";
import { MEAL_TYPES, type EditableMeal, type MealType } from "@/lib/modules/meal";
import { saveMeals, type SaveMealsState } from "./actions";

const initialState: SaveMealsState = { error: null };

export function blankMeal(): EditableMeal {
  return {
    id: crypto.randomUUID(),
    name: "",
    mealType: "breakfast",
    startTime: "08:00",
    endTime: null,
    description: null,
    imageRef: null,
    imageUrl: null,
    dietaryTags: [],
    location: null,
  };
}

export type MealsStepProps = {
  tenantId: string;
  meals: EditableMeal[];
  setMeals: Dispatch<SetStateAction<EditableMeal[]>>;
  onBack: () => void;
  onContinue: () => void;
};

export function MealsStep({ tenantId, meals, setMeals, onBack, onContinue }: MealsStepProps) {
  const [state, formAction, pending] = useActionState(saveMeals, initialState);

  function update(id: string, patch: Partial<EditableMeal>) {
    setMeals((items) => items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  return (
    <form action={formAction} className="max-w-lg">
      <input type="hidden" name="tenantId" value={tenantId} />
      <input
        type="hidden"
        name="items"
        value={JSON.stringify(
          meals.map(({ id, name, mealType, startTime, endTime, description, imageRef, dietaryTags, location }) => ({
            id,
            name,
            mealType,
            startTime,
            endTime,
            description,
            imageRef,
            dietaryTags,
            location,
          }))
        )}
      />
      <h1 className="font-ui text-[26px] tracking-[-0.01em] text-idw-forest">Meals</h1>
      <p className="text-sm text-idw-forest/60 mt-1">What&apos;s on the table, and when.</p>

      <div className="mt-8 flex flex-col gap-4">
        {meals.map((m, i) => (
          <div key={m.id} className="rounded-lg border border-idw-forest/12 p-4">
            <div className="flex justify-between items-start gap-2">
              <input
                value={m.name}
                onChange={(e) => update(m.id, { name: e.target.value })}
                placeholder="Meal name, e.g. Sunrise Breakfast"
                className="flex-1 text-sm font-medium text-idw-forest outline-none border-b border-transparent focus:border-idw-sage pb-1"
              />
              <button
                type="button"
                onClick={() => {
                  setMeals((items) => items.filter((it) => it.id !== m.id));
                  persistItemRemoval(tenantId, m.id);
                }}
                className="text-idw-forest/30 hover:text-idw-forest text-xs shrink-0"
              >
                Remove
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <select
                value={m.mealType}
                onChange={(e) => update(m.id, { mealType: e.target.value as MealType })}
                className="rounded-md border border-idw-forest/15 px-2 py-1.5 text-xs outline-none focus:border-idw-sage"
              >
                {MEAL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t[0].toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
              <input
                value={m.location ?? ""}
                onChange={(e) => update(m.id, { location: e.target.value || null })}
                placeholder="Location"
                className="rounded-md border border-idw-forest/15 px-2 py-1.5 text-xs outline-none focus:border-idw-sage"
              />
              <input
                type="time"
                value={m.startTime}
                onChange={(e) => update(m.id, { startTime: e.target.value })}
                className="rounded-md border border-idw-forest/15 px-2 py-1.5 text-xs outline-none focus:border-idw-sage"
              />
              <input
                type="time"
                value={m.endTime ?? ""}
                onChange={(e) => update(m.id, { endTime: e.target.value || null })}
                placeholder="End (optional)"
                className="rounded-md border border-idw-forest/15 px-2 py-1.5 text-xs outline-none focus:border-idw-sage"
              />
            </div>
            <textarea
              value={m.description ?? ""}
              onChange={(e) => update(m.id, { description: e.target.value || null })}
              placeholder="Short description"
              rows={2}
              className="mt-2 w-full rounded-md border border-idw-forest/15 px-2 py-1.5 text-xs outline-none focus:border-idw-sage resize-none"
            />
            <input
              value={m.dietaryTags.join(", ")}
              onChange={(e) =>
                update(m.id, {
                  dietaryTags: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder="Dietary tags, comma separated (e.g. Vegan, Gluten-free)"
              className="mt-2 w-full rounded-md border border-idw-forest/15 px-2 py-1.5 text-xs outline-none focus:border-idw-sage"
            />
            <ModuleItemPhotoField
              tenantId={tenantId}
              moduleKey="meals"
              itemId={m.id}
              title={m.name}
              description={m.description}
              sortOrder={i}
              imageRef={m.imageRef}
              imageUrl={m.imageUrl}
              onChange={(patch) => update(m.id, patch)}
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => {
            const item = blankMeal();
            setMeals((items) => [...items, item]);
            persistNewItemStub(tenantId, "meals", item.id, meals.length);
          }}
          className="rounded-lg border border-dashed border-idw-forest/25 text-idw-forest/60 hover:text-idw-forest hover:border-idw-forest/50 text-sm py-3 transition-colors"
        >
          + Add meal
        </button>
      </div>

      {state.error && (
        <p className="text-sm text-red-700 mt-4" role="alert">
          {state.error}
        </p>
      )}

      <div className="mt-8 flex gap-3 items-center">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full border border-idw-forest/20 text-idw-forest text-sm font-semibold uppercase tracking-wide px-6 py-3"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-idw-forest text-idw-parchment text-sm font-semibold uppercase tracking-wide px-6 py-3 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save Meals"}
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="text-xs font-semibold uppercase tracking-wide text-idw-forest/50 hover:text-idw-forest"
        >
          Continue →
        </button>
      </div>
    </form>
  );
}
