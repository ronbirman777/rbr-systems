import type { RequestResetState, UpdatePasswordState } from "./recoveryActions";

/**
 * Task 012: a `"use server"` file (recoveryActions.ts) may only export
 * async functions - not a plain const object - or the whole module fails
 * at runtime with "A 'use server' file can only export async functions,
 * found object" (the exact same defect class hit twice already in Task
 * 011 - lifecycleActions.ts/lifecycleActionsState.ts). These two initial-
 * state objects live here instead, exactly mirroring that fix.
 */
export const REQUEST_RESET_INITIAL_STATE: RequestResetState = { status: "idle", message: null };
export const UPDATE_PASSWORD_INITIAL_STATE: UpdatePasswordState = { status: "idle" };
