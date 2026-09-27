import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Task 014 (item A, resend verification discoverability). Mocks the
 * Supabase server client the same way lifecycleActions.test.ts and
 * recoveryActions.test.ts do - these tests only prove the thin Server
 * Action layer (a) derives `unconfirmedEmail` from the RAW Supabase error
 * message rather than the already-localized display string, and (b)
 * forwards `resendConfirmationEmail`'s outcome without inventing success.
 * Real Supabase Auth behavior is not re-proven here.
 */

const mockSignInWithPassword = vi.fn();
const mockResend = vi.fn();
const mockSignOut = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
      resend: mockResend,
      signOut: mockSignOut,
    },
  }),
}));

const mockRedirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
vi.mock("next/navigation", () => ({ redirect: (path: string) => mockRedirect(path) }));

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("signIn - Task 014 unconfirmedEmail detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets unconfirmedEmail from the raw Supabase error message", async () => {
    mockSignInWithPassword.mockResolvedValue({ error: { message: "Email not confirmed" } });
    const { signIn } = await import("./actions");

    const result = await signIn({ error: null }, formData({ email: "a@b.com", password: "x" }));

    expect(result.unconfirmedEmail).toBe(true);
    expect(result.error).toBeTruthy();
  });

  it("does not set unconfirmedEmail for an unrelated auth error (e.g. wrong password)", async () => {
    mockSignInWithPassword.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    const { signIn } = await import("./actions");

    const result = await signIn({ error: null }, formData({ email: "a@b.com", password: "x" }));

    expect(result.unconfirmedEmail).toBe(false);
  });

  it("redirects to /space on success without setting unconfirmedEmail", async () => {
    mockSignInWithPassword.mockResolvedValue({ error: null });
    const { signIn } = await import("./actions");

    await expect(signIn({ error: null }, formData({ email: "a@b.com", password: "x" }))).rejects.toThrow(
      "REDIRECT:/space"
    );
  });
});

describe("resendConfirmationEmail - Task 014", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards to auth.resend with type=signup and returns no error on success", async () => {
    mockResend.mockResolvedValue({ error: null });
    const { resendConfirmationEmail } = await import("./actions");

    const result = await resendConfirmationEmail("a@b.com");

    expect(mockResend).toHaveBeenCalledWith(
      expect.objectContaining({ type: "signup", email: "a@b.com" })
    );
    expect(result.error).toBeNull();
  });

  it("never fabricates success when Supabase rejects the resend", async () => {
    mockResend.mockResolvedValue({ error: { message: "Email rate limit exceeded" } });
    const { resendConfirmationEmail } = await import("./actions");

    const result = await resendConfirmationEmail("a@b.com");

    expect(result.error).toBeTruthy();
  });
});
