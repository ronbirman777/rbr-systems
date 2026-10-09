import { describe, expect, it } from "vitest";
import { completeView, isTerminal, nextPollDelay, parseCheckoutStatus, POLL_MAX_MS, POLL_START_MS } from "./checkoutPolling";

describe("nextPollDelay", () => {
  it("starts at 1.5s, grows, and caps at 6s", () => {
    expect(nextPollDelay(0)).toBe(POLL_START_MS);
    expect(nextPollDelay(1)).toBeGreaterThan(nextPollDelay(0));
    expect(nextPollDelay(50)).toBe(POLL_MAX_MS);
    for (let i = 0; i < 30; i++) expect(nextPollDelay(i)).toBeLessThanOrEqual(POLL_MAX_MS);
  });
});

describe("parseCheckoutStatus", () => {
  it("accepts the documented shapes and rejects the rest", () => {
    expect(parseCheckoutStatus({ state: "awaiting_payment" })).toEqual({ state: "awaiting_payment" });
    expect(parseCheckoutStatus({ state: "processing", delayed: true })).toEqual({ state: "processing", delayed: true });
    expect(parseCheckoutStatus({ state: "processing" })).toEqual({ state: "processing", delayed: false });
    expect(parseCheckoutStatus({ state: "ready", tenantId: "11111111-1111-4111-8111-111111111111", spaceType: "teach" })?.state).toBe("ready");
    expect(parseCheckoutStatus({ state: "ready", tenantId: "../x" })).toBeNull();
    expect(parseCheckoutStatus({ state: "paid" })).toBeNull();
    expect(parseCheckoutStatus(null)).toBeNull();
  });
  it("only ready/canceled/expired are terminal", () => {
    expect(isTerminal({ state: "expired" })).toBe(true);
    expect(isTerminal({ state: "processing", delayed: true })).toBe(false);
    expect(isTerminal(null)).toBe(false);
  });
});

describe("completeView - never claims a payment the server has not reported", () => {
  it("shows setting up with no server answer", () => {
    expect(completeView(null, 0, false)).toBe("setting_up");
  });
  it("awaiting_payment becomes 'no payment yet' after ~20s, never 'confirmed'", () => {
    expect(completeView({ state: "awaiting_payment" }, 5_000, false)).toBe("setting_up");
    expect(completeView({ state: "awaiting_payment" }, 21_000, false)).toBe("no_payment_yet");
    expect(completeView({ state: "awaiting_payment" }, 1, true)).toBe("no_payment_yet");
  });
  it("confirmation requires processing or ready", () => {
    expect(completeView({ state: "processing", delayed: false }, 0, false)).toBe("confirmed");
    expect(completeView({ state: "processing", delayed: true }, 0, false)).toBe("still_preparing");
    expect(completeView({ state: "ready", tenantId: "t", spaceType: "teach" }, 0, false)).toBe("ready");
    expect(completeView({ state: "expired" }, 0, false)).toBe("expired");
    expect(completeView(null, 0, true)).toBe("gave_up");
  });
});
