/**
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
  generalInfo: { label: "General Information", implemented: false },
  contact: { label: "Contact", implemented: false },
  audio: { label: "Audio", implemented: false },
  announcements: { label: "Announcements", implemented: false },
} as const;

export type OptionalModuleKey = keyof typeof OPTIONAL_MODULES;

export const IMPLEMENTED_OPTIONAL_MODULES = (
  Object.keys(OPTIONAL_MODULES) as OptionalModuleKey[]
).filter((k) => OPTIONAL_MODULES[k].implemented);
