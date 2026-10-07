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
const mockSignUp = vi.fn();
const mockGetUser = vi.fn();
const mockOwnedTenantsSelect = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
      resend: mockResend,
      signOut: mockSignOut,
      signUp: mockSignUp,
      getUser: mockGetUser,
    },
    from: (table: string) => {
      if (table === "tenant_members") {
        return { select: () => ({ eq: () => ({ eq: mockOwnedTenantsSelect }) }) };
      }
      throw new Error(`unexpected table in test: ${table}`);
    },
  }),
}));

// Task 017: deleteAccount() imports "server-only" transitively through
// lib/supabase/admin.ts - the same reason every other test file that
// touches that module (e.g. guestAccess/verifyAction.test.ts) mocks it
// out, since Vitest has no Next.js-specific handling of that package.
vi.mock("server-only", () => ({}));

const mockDeleteUser = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ auth: { admin: { deleteUser: (...args: unknown[]) => mockDeleteUser(...args) } } }),
}));

// Task 017: deleteAccount() reuses deleteSpaceCompletely() (Space Storage
// Cleanup + delete_space) once per owned Space - mocked here so these
// tests prove only the account-deletion ORCHESTRATION (order, gating on
// confirmation, stopping before auth.users on any failure), not
// Storage/RPC behavior that lifecycleActions.test.ts already covers.
const mockDeleteSpaceCompletely = vi.fn();
vi.mock("@/app/(site)/configurator/retreat/lifecycleActions", () => ({
  deleteSpaceCompletely: (...args: unknown[]) => mockDeleteSpaceCompletely(...args),
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

/**
 * Task 015 - server-side re-validation of the new signup fields. This is
 * the REAL enforcement boundary (a Server Action can always be invoked
 * directly, bypassing whatever the client already checked) - every case
 * here asserts `supabase.auth.signUp` is never even called when a
 * required gate fails, proving "invalid submission must not invoke the
 * signup operation" server-side, not just via a disabled client button.
 */
function signUpFormData(overrides: Record<string, string> = {}) {
  return formData({
    fullName: "Jane Doe",
    email: "jane@example.com",
    password: "Sup3rSecret!",
    confirmPassword: "Sup3rSecret!",
    country: "US",
    dialCode: "+1",
    phoneNumber: "5551234567",
    businessName: "",
    ...overrides,
  });
}

describe("signUp - Task 015 field validation and metadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a blank full name without calling signUp", async () => {
    const { signUp } = await import("./actions");
    const result = await signUp({ error: null, checkEmail: false, email: null }, signUpFormData({ fullName: "   " }));
    expect(result.error).toMatch(/full name/i);
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("rejects a password/confirmPassword mismatch without calling signUp", async () => {
    const { signUp } = await import("./actions");
    const result = await signUp(
      { error: null, checkEmail: false, email: null },
      signUpFormData({ confirmPassword: "Different!123" })
    );
    expect(result.error).toMatch(/match/i);
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("rejects an unrecognized country without calling signUp", async () => {
    const { signUp } = await import("./actions");
    const result = await signUp({ error: null, checkEmail: false, email: null }, signUpFormData({ country: "ZZ" }));
    expect(result.error).toMatch(/country/i);
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("rejects a malformed phone number without calling signUp", async () => {
    const { signUp } = await import("./actions");
    const result = await signUp({ error: null, checkEmail: false, email: null }, signUpFormData({ phoneNumber: "abc" }));
    expect(result.error).toMatch(/phone/i);
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("calls signUp with full_name/country/phone/business_name in metadata, never confirmPassword or password", async () => {
    mockSignUp.mockResolvedValue({ data: { session: null }, error: null });
    const { signUp } = await import("./actions");
    await signUp({ error: null, checkEmail: false, email: null }, signUpFormData({ businessName: "Sunrise Retreats" }));

    expect(mockSignUp).toHaveBeenCalledTimes(1);
    const call = mockSignUp.mock.calls[0][0];
    expect(call.email).toBe("jane@example.com");
    expect(call.password).toBe("Sup3rSecret!");
    // Exact-match (not partial) on purpose: this is what proves
    // confirmPassword - and nothing else - never rides along in
    // metadata. A stray extra key here would fail this assertion.
    expect(call.options.data).toEqual({
      full_name: "Jane Doe",
      country: "US",
      phone: "+15551234567",
      business_name: "Sunrise Retreats",
    });
    expect(Object.keys(call)).not.toContain("confirmPassword");
  });

  it("omitted optional business name is stored as null, not an empty string", async () => {
    mockSignUp.mockResolvedValue({ data: { session: null }, error: null });
    const { signUp } = await import("./actions");
    await signUp({ error: null, checkEmail: false, email: null }, signUpFormData({ businessName: "" }));

    const call = mockSignUp.mock.calls[0][0];
    expect(call.options.data.business_name).toBeNull();
  });
});

/**
 * Task 017 (Account Deletion). These tests prove the thin orchestration
 * layer only: confirmation gating, that every owned Space is deleted
 * before auth.users is ever touched, that any Space-deletion failure
 * stops the whole operation before reaching auth.admin.deleteUser, and
 * that the account being acted on is always the CALLER's own id - never
 * something read from form data. Real Storage/RPC deletion behavior is
 * proven by lifecycleActions.test.ts, not re-proven here.
 */
describe("deleteAccount - Task 017", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1", email: "jane@example.com" } } });
  });

  it("requires being logged in before touching anything", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const { deleteAccount } = await import("./actions");

    const result = await deleteAccount({ error: null }, formData({ confirmEmail: "jane@example.com" }));

    expect(result.error).toBeTruthy();
    expect(mockOwnedTenantsSelect).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it("refuses to proceed unless the typed confirmation matches the account's own email exactly", async () => {
    const { deleteAccount } = await import("./actions");

    const result = await deleteAccount({ error: null }, formData({ confirmEmail: "not-jane@example.com" }));

    expect(result.error).toMatch(/email/i);
    expect(mockOwnedTenantsSelect).not.toHaveBeenCalled();
    expect(mockDeleteSpaceCompletely).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it("deletes every owned Space before ever calling auth.admin.deleteUser, then signs out and redirects", async () => {
    mockOwnedTenantsSelect.mockResolvedValue({ data: [{ tenant_id: "t1" }, { tenant_id: "t2" }], error: null });
    mockDeleteSpaceCompletely.mockResolvedValue({ ok: true });
    mockDeleteUser.mockResolvedValue({ error: null });
    const { deleteAccount } = await import("./actions");

    await expect(deleteAccount({ error: null }, formData({ confirmEmail: "jane@example.com" }))).rejects.toThrow(
      "REDIRECT:/log-in?accountDeleted=1"
    );

    expect(mockDeleteSpaceCompletely).toHaveBeenCalledTimes(2);
    expect(mockDeleteSpaceCompletely).toHaveBeenNthCalledWith(1, expect.anything(), "user-1", "t1");
    expect(mockDeleteSpaceCompletely).toHaveBeenNthCalledWith(2, expect.anything(), "user-1", "t2");
    expect(mockDeleteUser).toHaveBeenCalledWith("user-1");
    expect(mockSignOut).toHaveBeenCalled();
  });

  it("never calls auth.admin.deleteUser if any owned Space fails to delete completely", async () => {
    mockOwnedTenantsSelect.mockResolvedValue({ data: [{ tenant_id: "t1" }, { tenant_id: "t2" }], error: null });
    mockDeleteSpaceCompletely.mockResolvedValueOnce({ ok: false, reason: "could not remove Space media" });
    const { deleteAccount } = await import("./actions");

    const result = await deleteAccount({ error: null }, formData({ confirmEmail: "jane@example.com" }));

    expect(result.error).toBeTruthy();
    expect(mockDeleteSpaceCompletely).toHaveBeenCalledTimes(1);
    expect(mockDeleteUser).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("reports failure rather than fabricating success when auth.admin.deleteUser itself fails", async () => {
    mockOwnedTenantsSelect.mockResolvedValue({ data: [], error: null });
    mockDeleteUser.mockResolvedValue({ error: { message: "boom" } });
    const { deleteAccount } = await import("./actions");

    const result = await deleteAccount({ error: null }, formData({ confirmEmail: "jane@example.com" }));

    expect(result.error).toBeTruthy();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("an account with no owned Spaces skips straight to account deletion", async () => {
    mockOwnedTenantsSelect.mockResolvedValue({ data: [], error: null });
    mockDeleteUser.mockResolvedValue({ error: null });
    const { deleteAccount } = await import("./actions");

    await expect(deleteAccount({ error: null }, formData({ confirmEmail: "jane@example.com" }))).rejects.toThrow(
      "REDIRECT:/log-in?accountDeleted=1"
    );

    expect(mockDeleteSpaceCompletely).not.toHaveBeenCalled();
    expect(mockDeleteUser).toHaveBeenCalledWith("user-1");
  });
});
