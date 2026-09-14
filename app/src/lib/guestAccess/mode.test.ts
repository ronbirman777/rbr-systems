import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRpc = vi.fn();
vi.mock("@/lib/supabase/public", () => ({
  createPublicClient: () => ({ rpc: mockRpc }),
}));

const { getGuestAccessMode } = await import("./mode");

describe("getGuestAccessMode - pre/post-migration tolerance", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the RPC's value when it says 'code'", async () => {
    mockRpc.mockResolvedValue({ data: "code", error: null });
    expect(await getGuestAccessMode("tenant-1")).toBe("code");
  });

  it("returns 'public' when the RPC returns 'public'", async () => {
    mockRpc.mockResolvedValue({ data: "public", error: null });
    expect(await getGuestAccessMode("tenant-1")).toBe("public");
  });

  it("falls back to 'public' when the function doesn't exist yet (PGRST202 - migration not applied)", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    expect(await getGuestAccessMode("tenant-1")).toBe("public");
  });

  it("falls back to 'public' for the raw Postgres undefined_function code (42883)", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: "42883", message: "function does not exist" } });
    expect(await getGuestAccessMode("tenant-1")).toBe("public");
  });

  it("fails closed (throws) on a genuine, non-missing-function error after the migration has shipped", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: "500", message: "connection timeout" } });
    await expect(getGuestAccessMode("tenant-1")).rejects.toBeTruthy();
  });
});
