import { LoadingTransition } from "@/components/loading-transition";

/**
 * Task 011 (item D): Next.js's route-level loading convention - shown
 * automatically for both the initial async Server Component render of
 * this route AND client-side navigations into it (e.g. My Spaces'
 * "Manage Space"/"Preview" links), for exactly as long as the route is
 * genuinely not ready yet, no longer. Unmounts itself the instant the
 * real page below is ready - nothing here fakes a minimum duration or
 * needs manual dismissal.
 */
export default function Loading() {
  return <LoadingTransition message="Opening your space…" />;
}
