import { LoadingTransition } from "@/components/loading-transition";

/**
 * Shown the instant the redirect from Create (or a click on Manage Space)
 * lands, while the Studio loads its draft - the Teach twin of the Retreat
 * Studio's loading.tsx. Without it the Create screen looked idle for seconds.
 */
export default function Loading() {
  return <LoadingTransition message="Opening your studio…" />;
}
