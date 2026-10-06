
import { DEFAULT_LOCALE, translate, type Locale } from "@/lib/i18n";/**
 * The Time to Flow module catalog. Home/Today is mandatory - it's not in
 * this list, it always exists. Everything here is optional and organizer-
 * controlled: which ones are enabled decides what's in guest navigation,
 * never how any of them look (that's InnerDweS's dedicated renderer per
 * module_key - see components/). Schedule, Facilitators, Meals, Treatments,
 * Facilities and Arrival Information are implemented; the rest remain
 * catalog entries only - present so the Modules-step UI and future work
 * have one place to extend from, not an invitation to build their editors
 * yet.
 */
export const OPTIONAL_MODULES = {
  schedule: { label: "Schedule", implemented: true },
  facilitators: { label: "Facilitators / Teachers", implemented: true },
  meals: { label: "Meals", implemented: true },
  treatments: { label: "Treatments", implemented: true },
  facilities: { label: "Facilities", implemented: true },
  resources: { label: "Resources", implemented: false },
  arrivalInfo: { label: "Arrival Information", implemented: true },
  dailyInspiration: { label: "Daily Inspiration", implemented: true },
  faq: { label: "FAQ", implemented: true },
  customPages: { label: "Custom Pages", implemented: true },
  stayConnected: { label: "Stay Connected", implemented: true },
  audio: { label: "Audio", implemented: false },
  announcements: { label: "Announcements", implemented: false },
} as const;

export type OptionalModuleKey = keyof typeof OPTIONAL_MODULES;

export const IMPLEMENTED_OPTIONAL_MODULES = (
  Object.keys(OPTIONAL_MODULES) as OptionalModuleKey[]
).filter((k) => OPTIONAL_MODULES[k].implemented);

/**
 * The module's name as a person reads it, in the Space's language.
 *
 * The catalog's own `label` stays English: it is the canonical,
 * code-facing name used in comments, tests and logs. This is the display
 * path, and it is the only one a Studio should render.
 */
export function moduleLabel(key: OptionalModuleKey, locale: Locale = DEFAULT_LOCALE): string {
  const keys: Record<OptionalModuleKey, Parameters<typeof translate<"flow">>[2]> = {
    schedule: "navSchedule",
    facilitators: "moduleFacilitatorsLabel",
    meals: "meals",
    treatments: "treatments",
    facilities: "facilities",
    resources: "moduleResources",
    arrivalInfo: "moduleArrivalInfo",
    dailyInspiration: "moduleDailyInspiration",
    faq: "faq",
    customPages: "moduleCustomPages",
    stayConnected: "stayConnected",
    audio: "moduleAudio",
    announcements: "moduleAnnouncements",
  };
  return translate(locale, "flow", keys[key]);
}
