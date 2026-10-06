import { z } from "zod";

/**
 * "moduleIntros" module_key - one optional paragraph above a module's list.
 *
 * GENERIC ON PURPOSE (TASK 029, decision 2). The stored shape is
 *
 *   { "<moduleKey>": { "intro": "..." } }
 *
 * so Meals getting an introduction costs one settings row, and Facilities
 * or Treatments getting one later costs nothing further - no new column,
 * no new table, no migration 0034. publish_space() (0033) publishes this
 * object whole, and only when it is non-empty, so a Space that has never
 * written one carries no `moduleIntros` key at all.
 *
 * It is NOT stored on the module's items, because an introduction is a
 * property of the module, not of Breakfast. It is not stored in
 * module_configs either: that row is about whether a module is on and
 * what its cover is, and a column there would have needed DDL.
 */
export const moduleIntroSchema = z.object({
  intro: z.string().nullable().default(null),
});

export const moduleIntrosSchema = z.record(z.string(), moduleIntroSchema);

export type ModuleIntro = z.infer<typeof moduleIntroSchema>;
export type ModuleIntros = z.infer<typeof moduleIntrosSchema>;

export const MODULE_INTROS_KEY = "moduleIntros";

export const EMPTY_MODULE_INTROS: ModuleIntros = {};

/**
 * The modules that may carry an introduction today.
 *
 * An allowlist rather than "any key", for the same reason
 * publish_space()'s own allowlists exist: the Studio should offer the
 * field where it has been designed for, and a stray key should not
 * silently become guest-facing content. Adding a module here is a
 * one-line change and needs no migration - which is the whole point of
 * the generic shape.
 */
export const MODULE_INTRO_KEYS = ["meals"] as const;
export type ModuleIntroKey = (typeof MODULE_INTRO_KEYS)[number];

/** The intro for one module, or null when it has none. */
export function moduleIntro(intros: ModuleIntros | null | undefined, moduleKey: string): string | null {
  const text = intros?.[moduleKey]?.intro?.trim();
  return text ? text : null;
}

/**
 * The object to store, with every empty entry dropped.
 *
 * This is what keeps `modules.moduleIntros` absent rather than present
 * and empty: clearing the only intro leaves `{}`, which publish_space()
 * then does not emit, so the published payload returns to exactly the
 * shape it had before anyone typed anything.
 */
export function pruneModuleIntros(intros: ModuleIntros): ModuleIntros {
  const out: ModuleIntros = {};
  for (const [key, value] of Object.entries(intros)) {
    const text = value?.intro?.trim();
    if (text) out[key] = { intro: text };
  }
  return out;
}

export function moduleIntrosAreEmpty(intros: ModuleIntros): boolean {
  return Object.keys(pruneModuleIntros(intros)).length === 0;
}
