import { contactEntries } from "./links";
import type { TeachGuestData } from "./guestData";
import type { TeachExploreModule } from "./schemas";

export type ExploreModuleStatus = "off" | "empty" | "visible";

export const EXPLORE_MODULE_EMPTY_HINT: Record<TeachExploreModule, string> = {
  teachReadings: "This module is on, but guests won't see a card until you add at least one reading.",
  teachAudio: "This module is on, but guests won't see a card until a track has its audio file attached.",
  teachContact: "This module is on, but guests won't see a card until you add a contact method or address.",
  customPages: "This module is on, but guests won't see a card until you add a page and mark it visible.",
  teachRetreats: "This module is on, but guests won't see a card until you add a retreat and mark it visible.",
};

type StatusInput = Pick<TeachGuestData, "enabledExplore" | "readings" | "audio" | "customPages" | "retreats" | "settings">;

/** Whether an Explore module has anything to show. Shared by the Guest App and the Studio so they cannot disagree. */
export function exploreModuleHasContent(data: StatusInput, k: TeachExploreModule): boolean {
  switch (k) {
    case "teachReadings":
      return data.readings.length > 0;
    case "teachAudio":
      return data.audio.some((a) => a.metadata.audioRef);
    case "teachContact":
      return contactEntries(data.settings.teachContact).length > 0 || Boolean(data.settings.teachContact.address);
    case "customPages":
      return data.customPages.length > 0;
    case "teachRetreats":
      return data.retreats.length > 0;
  }
}

export function exploreModuleStatus(data: StatusInput, k: TeachExploreModule): ExploreModuleStatus {
  if (!data.enabledExplore.includes(k)) return "off";
  return exploreModuleHasContent(data, k) ? "visible" : "empty";
}
