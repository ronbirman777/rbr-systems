/**
 * `LifecycleActionState`'s initial value, split out of lifecycleActions.ts.
 *
 * lifecycleActions.ts has "use server" at module scope, and Next.js
 * requires every export of a "use server" file to be an async function -
 * a plain object export (INITIAL_LIFECYCLE_STATE) violates that and
 * crashes every invocation of every action in that file at
 * module-instantiation time with "A 'use server' file can only export
 * async functions, found object" (the exact same defect class as Task
 * 008C's CRITICAL-1 - caught here by `next build` before ever reaching
 * Production, unlike that incident). This file carries the initial-value
 * constant so lifecycleActions.ts can export nothing but its actions and
 * types.
 */
import type { LifecycleActionState } from "./lifecycleActions";

export const INITIAL_LIFECYCLE_STATE: LifecycleActionState = { error: null };
