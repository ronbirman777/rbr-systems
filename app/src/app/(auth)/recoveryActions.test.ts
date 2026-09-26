import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Task 012. Mocks the Supabase server client and the recovery-flow-
 * context helper the same way lifecycleActions.test.ts mocks
 * `@/lib/supabase/server` - these tests prove the thin Server Action
 * layer validates before calling Supabase, never leaks account
 * existence, never escalates sign-out scope, and never lets an
 * unauthenticated/out-of-context caller reach `updateUser()`. Real
 * Supabase Auth behavior (whether a given email actually has an
 * account, hosted rate limits, password policy) is not re-proven here.
 */

const mockGetUser = vi.fn();
const mockResetPasswordForEmail = vi.fn();
const mockUpdateUser = vi.fn();
const mockSignOut = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: mockGetUser,
      resetPasswordForEmail: mockResetPasswordForEmail,
      updateUser: mockUpdateUser,
      signOut: mockSignOut,
    },
  }),
}));

const mockHasRecoveryFlowContext = vi.fn();
const mockClearRecoveryFlowCookie = vi.fn();
const mockSetRecoveryFlowCookie = vi.fn();

vi.mock("@/lib/supabase/recovery", () => ({
  hasRecoveryFlowContext: (...args: unknown[]) => mockHasRecoveryFlowContext(...args),
  clearRecoveryFlowCookie: (...args: unknown[]) => mockClearRecoveryFlowCookie(...args),
  setRecoveryFlowCookie: (...args: unknown[]) => mockSetRecoveryFlowCookie(...args),
}));

async function loadActions() {
  const [actions, state] = await Promise.all([import("./recoveryActions"), import("./recoveryActionsState")]);
  return { ...actions, ...state };
}

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("recoveryActions - Task 012", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockHasRecoveryFlowContext.mockResolvedValue(true);
    mockUpdateUser.mockResolvedValue({ error: null });
    mockSignOut.mockResolvedValue({ error: null });
  });

  describe("requestPasswordReset", () => {
    it("rejects an empty email without ever calling Supabase", async () => {
      const { requestPasswordReset, REQUEST_RESET_INITIAL_STATE } = await loadActions();
      const result = await requestPasswordReset(REQUEST_RESET_INITIAL_STATE, formData({ email: "" }));

      expect(result.status).toBe("error");
      expect(mockResetPasswordForEmail).not.toHaveBeenCalled();
    });

    it("rejects a malformed email without ever calling Supabase", async () => {
      const { requestPasswordReset, REQUEST_RESET_INITIAL_STATE } = await loadActions();
      const result = await requestPasswordReset(REQUEST_RESET_INITIAL_STATE, formData({ email: "not-an-email" }));

      expect(result.status).toBe("error");
      expect(mockResetPasswordForEmail).not.toHaveBeenCalled();
    });

    it("trims the email before validating/sending", async () => {
      mockResetPasswordForEmail.mockResolvedValue({ error: null });
      const { requestPasswordReset, REQUEST_RESET_INITIAL_STATE } = await loadActions();
      await requestPasswordReset(REQUEST_RESET_INITIAL_STATE, formData({ email: "  person@example.test  " }));

      expect(mockResetPasswordForEmail).toHaveBeenCalledWith(
        "person@example.test",
        expect.objectContaining({ redirectTo: expect.stringContaining("/auth/confirm") })
      );
    });

    it("never accepts a caller-supplied redirect origin - only APP_URL + /auth/confirm is ever used", async () => {
      mockResetPasswordForEmail.mockResolvedValue({ error: null });
      const { requestPasswordReset, REQUEST_RESET_INITIAL_STATE } = await loadActions();
      await requestPasswordReset(
        REQUEST_RESET_INITIAL_STATE,
        formData({ email: "person@example.test", redirectTo: "https://evil.example/steal" })
      );

      const [, options] = mockResetPasswordForEmail.mock.calls[0] as [string, { redirectTo: string }];
      expect(options.redirectTo).not.toContain("evil.example");
      expect(options.redirectTo).toMatch(/\/auth\/confirm$/);
    });

    it("returns the same neutral accepted state for a genuine success", async () => {
      mockResetPasswordForEmail.mockResolvedValue({ error: null });
      const { requestPasswordReset, REQUEST_RESET_INITIAL_STATE } = await loadActions();
      const result = await requestPasswordReset(REQUEST_RESET_INITIAL_STATE, formData({ email: "person@example.test" }));

      expect(result.status).toBe("sent");
    });

    it("returns the identical neutral accepted state even when Supabase reports an unrecognized/existence-shaped error - never a distinct message", async () => {
      mockResetPasswordForEmail.mockResolvedValue({ error: { message: "some unexpected provider response" } });
      const { requestPasswordReset, REQUEST_RESET_INITIAL_STATE } = await loadActions();
      const result = await requestPasswordReset(REQUEST_RESET_INITIAL_STATE, formData({ email: "person@example.test" }));

      expect(result.status).toBe("sent");
    });

    it("shows a distinct safe retry message for a rate-limit response, without disclosing existence", async () => {
      mockResetPasswordForEmail.mockResolvedValue({ error: { message: "email rate limit exceeded" } });
      const { requestPasswordReset, REQUEST_RESET_INITIAL_STATE } = await loadActions();
      const result = await requestPasswordReset(REQUEST_RESET_INITIAL_STATE, formData({ email: "person@example.test" }));

      expect(result.status).toBe("error");
      expect(result.message).not.toMatch(/exist|regist/i);
    });

    it("shows a distinct safe retry message for a thrown network-level failure", async () => {
      mockResetPasswordForEmail.mockRejectedValue(new Error("fetch failed"));
      const { requestPasswordReset, REQUEST_RESET_INITIAL_STATE } = await loadActions();
      const result = await requestPasswordReset(REQUEST_RESET_INITIAL_STATE, formData({ email: "person@example.test" }));

      expect(result.status).toBe("error");
      expect(result.message).not.toMatch(/exist|regist/i);
    });
  });

  describe("updatePassword", () => {
    it("rejects missing fields without ever calling updateUser", async () => {
      const { updatePassword, UPDATE_PASSWORD_INITIAL_STATE } = await loadActions();
      const result = await updatePassword(UPDATE_PASSWORD_INITIAL_STATE, formData({ password: "", confirmPassword: "" }));

      expect(result.status).toBe("error");
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it("rejects a too-short password without ever calling updateUser", async () => {
      const { updatePassword, UPDATE_PASSWORD_INITIAL_STATE } = await loadActions();
      const result = await updatePassword(
        UPDATE_PASSWORD_INITIAL_STATE,
        formData({ password: "short1", confirmPassword: "short1" })
      );

      expect(result.status).toBe("error");
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it("rejects mismatched passwords without ever calling updateUser", async () => {
      const { updatePassword, UPDATE_PASSWORD_INITIAL_STATE } = await loadActions();
      const result = await updatePassword(
        UPDATE_PASSWORD_INITIAL_STATE,
        formData({ password: "correct-horse-1", confirmPassword: "correct-horse-2" })
      );

      expect(result.status).toBe("error");
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it("fails closed to no_session when there is no authenticated user, without calling updateUser", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const { updatePassword, UPDATE_PASSWORD_INITIAL_STATE } = await loadActions();
      const result = await updatePassword(
        UPDATE_PASSWORD_INITIAL_STATE,
        formData({ password: "correct-horse-1", confirmPassword: "correct-horse-1" })
      );

      expect(result.status).toBe("no_session");
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it("fails closed to no_session for a signed-in user with no recovery-flow context (session alone is not authorization)", async () => {
      mockHasRecoveryFlowContext.mockResolvedValue(false);
      const { updatePassword, UPDATE_PASSWORD_INITIAL_STATE } = await loadActions();
      const result = await updatePassword(
        UPDATE_PASSWORD_INITIAL_STATE,
        formData({ password: "correct-horse-1", confirmPassword: "correct-horse-1" })
      );

      expect(result.status).toBe("no_session");
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it("checks recovery-flow context against this exact authenticated user's id", async () => {
      const { updatePassword, UPDATE_PASSWORD_INITIAL_STATE } = await loadActions();
      await updatePassword(UPDATE_PASSWORD_INITIAL_STATE, formData({ password: "correct-horse-1", confirmPassword: "correct-horse-1" }));

      expect(mockHasRecoveryFlowContext).toHaveBeenCalledWith("user-1");
    });

    it("on a genuine success: calls updateUser once and reports success - WITHOUT touching the recovery cookie or session yet", async () => {
      const { updatePassword, UPDATE_PASSWORD_INITIAL_STATE } = await loadActions();
      const result = await updatePassword(
        UPDATE_PASSWORD_INITIAL_STATE,
        formData({ password: "correct-horse-1", confirmPassword: "correct-horse-1" })
      );

      expect(mockUpdateUser).toHaveBeenCalledTimes(1);
      expect(mockUpdateUser).toHaveBeenCalledWith({ password: "correct-horse-1" });
      // Deliberately NOT called here - see the long comment on
      // finalizeRecoverySession in recoveryActions.ts: doing this inside
      // the same form-bound action that must still report "success"
      // causes the invoking page's own server-side recovery-context gate
      // to react to it on the same round trip and hide the success state
      // it's supposed to be showing. Reproduced directly in a real
      // browser before this split existed.
      expect(mockClearRecoveryFlowCookie).not.toHaveBeenCalled();
      expect(mockSignOut).not.toHaveBeenCalled();
      expect(result.status).toBe("success");
    });

    it("never clears the recovery cookie or signs out when updateUser itself fails", async () => {
      mockUpdateUser.mockResolvedValue({ error: { message: "New password should be different from the old password." } });
      const { updatePassword, UPDATE_PASSWORD_INITIAL_STATE } = await loadActions();
      const result = await updatePassword(
        UPDATE_PASSWORD_INITIAL_STATE,
        formData({ password: "correct-horse-1", confirmPassword: "correct-horse-1" })
      );

      expect(result.status).toBe("error");
      expect(mockClearRecoveryFlowCookie).not.toHaveBeenCalled();
      expect(mockSignOut).not.toHaveBeenCalled();
    });

    it("never trims or normalizes the password value itself", async () => {
      const { updatePassword, UPDATE_PASSWORD_INITIAL_STATE } = await loadActions();
      await updatePassword(
        UPDATE_PASSWORD_INITIAL_STATE,
        formData({ password: "  spaced out  ", confirmPassword: "  spaced out  " })
      );

      expect(mockUpdateUser).toHaveBeenCalledWith({ password: "  spaced out  " });
    });
  });

  describe("finalizeRecoverySession", () => {
    it("on success: signs out with LOCAL scope only, then clears the recovery cookie, and reports success", async () => {
      const { finalizeRecoverySession } = await loadActions();
      const result = await finalizeRecoverySession();

      // The single most security-relevant assertion in this file: auth-js
      // defaults signOut() to `scope: 'global'` (every device) - this
      // must always pass 'local' explicitly.
      expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" });
      expect(mockClearRecoveryFlowCookie).toHaveBeenCalledTimes(1);
      expect(result.status).toBe("success");
    });

    it("on a failed sign-out: reports error and does NOT clear the recovery cookie, so a retry is still possible", async () => {
      mockSignOut.mockResolvedValue({ error: { message: "network error" } });
      const { finalizeRecoverySession } = await loadActions();
      const result = await finalizeRecoverySession();

      expect(result.status).toBe("error");
      expect(mockClearRecoveryFlowCookie).not.toHaveBeenCalled();
    });

    it("calling it again after a resolved failure still works (the retry path)", async () => {
      mockSignOut.mockResolvedValueOnce({ error: { message: "network error" } }).mockResolvedValueOnce({ error: null });
      const { finalizeRecoverySession } = await loadActions();
      const first = await finalizeRecoverySession();
      const second = await finalizeRecoverySession();

      expect(first.status).toBe("error");
      expect(second.status).toBe("success");
      expect(mockClearRecoveryFlowCookie).toHaveBeenCalledTimes(1);
    });
  });
});

/**
 * This exact guard - and the bug it guards against - was only found by
 * running the real password-recovery flow end to end in a browser
 * (Playwright + a local Supabase instance + real captured email): this
 * file originally exported `REQUEST_RESET_INITIAL_STATE`/
 * `UPDATE_PASSWORD_INITIAL_STATE` as plain const objects, which crashed
 * every request to /forgot-password and /reset-password at runtime with
 * "A 'use server' file can only export async functions, found object" -
 * the identical defect class as Task 008C's CRITICAL-1 and Task 011's
 * lifecycleActions.ts. Neither `tsc`, `eslint`, nor `next build` caught
 * it (Turbopack's server-actions export-shape validation only runs when
 * the action module is actually bundled/invoked at runtime, not during
 * type-checking or a production build's static generation) - only real
 * QA did. Fixed by moving both constants to recoveryActionsState.ts.
 */
describe('recoveryActions.ts - "use server" export shape (Task 012, same defect class as Task 008C\'s CRITICAL-1 and Task 011\'s lifecycleActions.ts)', () => {
  const source = readFileSync(path.join(process.cwd(), "src/app/(auth)/recoveryActions.ts"), "utf8");

  it('declares "use server" at module scope', () => {
    expect(source).toMatch(/^"use server";/);
  });

  it("exports only async functions at runtime (type-only exports are erased and don't count)", () => {
    const exportLines = source.split("\n").filter((line) => line.startsWith("export "));
    const runtimeExportLines = exportLines.filter((line) => !line.startsWith("export type "));
    for (const line of runtimeExportLines) {
      expect(line).toMatch(/^export async function\b/);
    }
    expect(runtimeExportLines.length).toBeGreaterThan(0);
  });

  it("does not export either initial-state constant itself (they moved to recoveryActionsState.ts)", () => {
    expect(source).not.toContain("export const REQUEST_RESET_INITIAL_STATE");
    expect(source).not.toContain("export const UPDATE_PASSWORD_INITIAL_STATE");
  });
});
