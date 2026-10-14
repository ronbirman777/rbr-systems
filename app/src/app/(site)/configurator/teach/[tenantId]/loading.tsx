import { LoadingTransition } from "@/components/loading-transition";
import { translateAll } from "@/lib/i18n/translateAll";

/**
 * Shown the instant the redirect from Create (or a click on Manage Space)
 * lands, while the Studio loads its draft - the Teach twin of the Retreat
 * Studio's loading.tsx. Without it the Create screen looked idle for seconds.
 */
export default function Loading() {
  // TASK 033: every language, picked on the client - loading.tsx stays static (prefetchable).
  return <LoadingTransition messages={translateAll("common", "openingStudio")} />;
}
