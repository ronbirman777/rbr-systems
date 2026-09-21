/**
 * `VerifyGuestCodeState` and its initial value, split out of verifyAction.ts.
 *
 * verifyAction.ts has "use server" at module scope, and Next.js requires
 * every export of a "use server" file to be an async function - a plain
 * object export (verifyGuestCodeInitialState) violates that and crashes
 * every invocation of the action at module-instantiation time with
 * "A 'use server' file can only export async functions, found object"
 * (confirmed via Vercel Production runtime logs - see Task 008C evidence).
 * This file carries the non-function pieces so verifyAction.ts can export
 * nothing but the action itself.
 */
export type VerifyGuestCodeState = { error: string | null; success: boolean };

export const verifyGuestCodeInitialState: VerifyGuestCodeState = { error: null, success: false };
