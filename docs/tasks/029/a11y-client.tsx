/**
 * Hydrates exactly the tree the server rendered (a11y-screens.tsx), into
 * exactly the element it rendered it into. Any difference and React
 * discards the server HTML, and the pass would be grading a client-only
 * render the app never serves.
 */
import { hydrateRoot } from "react-dom/client";
import { A11Y_SCREENS } from "./a11y-screens";

const cfg = JSON.parse(document.getElementById("a11y-screen")!.textContent!);
const frame = document.getElementById("root")!.firstElementChild as HTMLElement;
hydrateRoot(frame, A11Y_SCREENS[cfg.screen]!(cfg.locale));
