import { normalizeLegacyList, type RetreatProfile } from "./retreatProfile";

/**
 * TASK 033 item 4 (Part 1): "Preparing for arrival" (What to bring / What
 * to expect) is edited in the Arrival Info step again. No data model change:
 *
 *   canonical   module_settings.retreatProfile.whatToBring / whatToExpect
 *               (what the Guest App shows, via retreatWhatToBring())
 *   legacy      module_settings.arrivalInfo.whatToBring - one string from
 *               before TASK 029; read as a fallback, NEVER deleted or
 *               rewritten here
 *
 * The editor shows the canonical list; when it is empty and a legacy one
 * exists, the legacy list is offered (seeded) and only an explicit Save
 * writes it as canonical. When BOTH exist and differ, both are shown to
 * the organizer - the canonical one in the editor (what guests see) and
 * the older one read-only with "Use the older list" - nothing is dropped.
 */
export type BringSource = "canonical" | "legacy" | "none";

export type PreparationView = {
  bring: string[];
  bringSource: BringSource;
  /** The legacy list when it differs from a non-empty canonical one; else null. */
  olderBring: string[] | null;
  expect: string[];
};

const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export function preparationView(
  profile: Pick<RetreatProfile, "whatToBring" | "whatToExpect"> | null | undefined,
  arrival: { whatToBring: string | null } | null | undefined
): PreparationView {
  const canonical = profile?.whatToBring ?? [];
  const legacy = normalizeLegacyList(arrival?.whatToBring);
  const expect = profile?.whatToExpect ?? [];
  if (canonical.length > 0) {
    return { bring: canonical, bringSource: "canonical", olderBring: legacy.length > 0 && !same(canonical, legacy) ? legacy : null, expect };
  }
  if (legacy.length > 0) return { bring: legacy, bringSource: "legacy", olderBring: null, expect };
  return { bring: [], bringSource: "none", olderBring: null, expect };
}

/** Where the two editors live: Arrival Info when that module is on, else (as before) Retreat Home. */
export function preparationEditedInArrival(enabledModules: ReadonlySet<string> | readonly string[]): boolean {
  return Array.isArray(enabledModules) ? enabledModules.includes("arrivalInfo") : (enabledModules as ReadonlySet<string>).has("arrivalInfo");
}
