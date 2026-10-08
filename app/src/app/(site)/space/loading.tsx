import { LoadingTransition } from "@/components/loading-transition";

/**
 * TASK 031 (W3): the instant response when anything navigates to My Spaces.
 *
 * /space is force-dynamic and waits on the signed-in user, several
 * queries and the card images, so without a loading boundary the app sat
 * on the page the person had just left - with no sign their tap had
 * registered - until all of it resolved. Next prefetches this boundary for
 * every <Link>, so it shows on the very next frame, for every way in: the
 * Studio back controls, Create, the logo, and the log-in redirect.
 */
export default function MySpacesLoading() {
  return <LoadingTransition message="Opening My Spaces…" />;
}
