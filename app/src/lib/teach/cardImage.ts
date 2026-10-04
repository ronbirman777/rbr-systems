import type { FocalPoint } from "@/lib/media/focalPoint";
import type { TeachGuestData } from "./guestData";

type CardModule = "teachReadings" | "teachAudio";
type CardItem = { imageRef: string | null; metadata: { imagePosition?: FocalPoint | null } };

/**
 * Image for a Reading/Audio card: the item's own image, else the module's
 * Explore cover, else null (the caller's initial placeholder). The focal point
 * always belongs to the image actually chosen. Reads only refs already present
 * in `data.mediaUrls`, so media authorization is unchanged.
 */
export function cardImage(data: TeachGuestData, module: CardModule, item: CardItem): { src: string | null; focal: FocalPoint | null } {
  const own = item.imageRef ? data.mediaUrls[item.imageRef] : null;
  if (own) return { src: own, focal: item.metadata.imagePosition ?? null };
  const cover = data.settings.teachExplore.cards[module];
  const coverSrc = cover?.imageRef ? data.mediaUrls[cover.imageRef] : null;
  if (coverSrc) return { src: coverSrc, focal: cover?.imagePosition ?? null };
  return { src: null, focal: null };
}
