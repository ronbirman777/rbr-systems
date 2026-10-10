import { describe, expect, it } from "vitest";
import { decideSpaceLifecycle, isPaidLifecycleMode, lifecycleControlsView, usesLegacySlot, type LifecycleDecision } from "./lifecycleAccess";
import type { AccessInput } from "./access";

/** TASK 032 (B2): Restore / Replace decisions, both launch-flag modes. */

const NOW = new Date("2026-10-09T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
const sub = (over: Partial<AccessInput> = {}): AccessInput => ({
  status: "active",
  cancelAtPeriodEnd: false,
  currentPeriodEnd: new Date("2026-11-01T00:00:00Z"),
  paymentFailedAt: null,
  exemptExpiresAt: null,
  ...over,
});

const STATES: [string, AccessInput | null, "billing_ok" | "billing_locked" | "legacy"][] = [
  ["no billing row (legacy Space)", null, "legacy"],
  ["active", sub(), "billing_ok"],
  ["trialing", sub({ status: "trialing" }), "billing_ok"],
  ["payment issue (<24h)", sub({ status: "past_due", paymentFailedAt: hoursAgo(2) }), "billing_ok"],
  ["guest suspended (24h-7d)", sub({ status: "past_due", paymentFailedAt: hoursAgo(48) }), "billing_ok"],
  ["studio suspended (>=7d)", sub({ status: "unpaid", paymentFailedAt: hoursAgo(169) }), "billing_locked"],
  ["canceled", sub({ status: "canceled" }), "billing_locked"],
  ["incomplete_expired", sub({ status: "incomplete_expired" }), "billing_locked"],
  ["incomplete", sub({ status: "incomplete" }), "billing_locked"],
  ["paused", sub({ status: "paused" }), "billing_locked"],
  ["cancel-at-period-end, still inside the period", sub({ cancelAtPeriodEnd: true }), "billing_ok"],
  ["cancel-at-period-end, period over", sub({ cancelAtPeriodEnd: true, currentPeriodEnd: hoursAgo(7) }), "billing_locked"],
  ["exempt (Lena / Return to Balance / QA)", sub({ status: "exempt", currentPeriodEnd: null }), "billing_ok"],
  ["exempt, expired", sub({ status: "exempt", currentPeriodEnd: null, exemptExpiresAt: hoursAgo(1) }), "legacy"],
];

describe("isPaidLifecycleMode follows the launch flag, not Stripe availability", () => {
  it.each([["legacy", false], ["paid", true], ["unavailable", true]] as const)("%s -> %s", (mode, expected) => {
    expect(isPaidLifecycleMode(mode)).toBe(expected);
  });
});

describe("decideSpaceLifecycle - flag OFF (legacy): never decides, the 0017 RPC stays the authority", () => {
  it.each(STATES)("%s", (_label, subscription) => {
    for (const action of ["restore", "replace"] as const) {
      expect(decideSpaceLifecycle({ mode: "legacy", action, subscription, legacySlots: { slotsAllowed: 0, legacySpacesOwned: 9 }, now: NOW })).toEqual({
        allowed: true,
        governedBy: "legacy",
      });
    }
  });
});

describe("decideSpaceLifecycle - flag ON", () => {
  const roomy = { slotsAllowed: 1, legacySpacesOwned: 1 };
  it.each(STATES)("%s", (_label, subscription, kind) => {
    for (const action of ["restore", "replace"] as const) {
      const d = decideSpaceLifecycle({ mode: "paid", action, subscription, legacySlots: roomy, now: NOW });
      // TASK 032 (0046): an exempt Space (expired or not) is never replaced - tested separately below.
      if (action === "replace" && subscription?.status === "exempt") {
        expect(d).toEqual({ allowed: false, governedBy: "billing", blockedBy: "exempt_replace" });
        continue;
      }
      if (kind === "billing_ok") expect(d).toEqual({ allowed: true, governedBy: "billing" });
      if (kind === "billing_locked") expect(d).toEqual({ allowed: false, governedBy: "billing", blockedBy: "billing_locked" });
      if (kind === "legacy") expect(d).toEqual({ allowed: true, governedBy: "legacy" });
    }
  });

  it("billing-governed Spaces ignore the legacy slot allowance entirely (a paying customer is never slot-blocked)", () => {
    const full = { slotsAllowed: 0, legacySpacesOwned: 5 };
    expect(decideSpaceLifecycle({ mode: "paid", action: "restore", subscription: sub(), legacySlots: full, now: NOW }).allowed).toBe(true);
    expect(decideSpaceLifecycle({ mode: "paid", action: "restore", subscription: sub({ status: "exempt" }), legacySlots: null, now: NOW }).allowed).toBe(true);
  });

  it("legacy Space restore: over the legacy allowance is refused, at the allowance is fine (archived already counted)", () => {
    expect(decideSpaceLifecycle({ mode: "paid", action: "restore", subscription: null, legacySlots: { slotsAllowed: 1, legacySpacesOwned: 2 }, now: NOW })).toEqual({
      allowed: false,
      governedBy: "legacy",
      blockedBy: "slot_limit",
    });
    expect(decideSpaceLifecycle({ mode: "paid", action: "restore", subscription: null, legacySlots: { slotsAllowed: 2, legacySpacesOwned: 2 }, now: NOW }).allowed).toBe(true);
  });

  it("0046: an exempt Space cannot be replaced (expired or not); restore is unaffected; paid/legacy replace unchanged", () => {
    const blocked = { allowed: false, governedBy: "billing", blockedBy: "exempt_replace" };
    expect(decideSpaceLifecycle({ mode: "paid", action: "replace", subscription: sub({ status: "exempt" }), now: NOW })).toEqual(blocked);
    expect(decideSpaceLifecycle({ mode: "paid", action: "replace", subscription: sub({ status: "exempt", exemptExpiresAt: hoursAgo(1) }), now: NOW })).toEqual(blocked);
    expect(decideSpaceLifecycle({ mode: "paid", action: "restore", subscription: sub({ status: "exempt" }), legacySlots: null, now: NOW }).allowed).toBe(true);
    expect(decideSpaceLifecycle({ mode: "paid", action: "replace", subscription: sub(), now: NOW }).allowed).toBe(true);
    expect(decideSpaceLifecycle({ mode: "paid", action: "replace", subscription: null, now: NOW }).allowed).toBe(true);
    // My Spaces hides Replace for it (and does not call it "billing locked").
    const view = lifecycleControlsView({ mode: "paid", isArchived: true, slotsAvailable: 1, restore: { allowed: true, governedBy: "billing" }, replace: blocked as never });
    expect(view).toEqual({ showRestore: true, showReplace: false, billingLocked: false });
  });

  it("legacy Space replace never needs a slot", () => {
    expect(decideSpaceLifecycle({ mode: "paid", action: "replace", subscription: null, legacySlots: null, now: NOW }).allowed).toBe(true);
  });

  it("fails closed: unreadable billing row, or unknown legacy allowance for a restore", () => {
    for (const action of ["restore", "replace"] as const) {
      expect(decideSpaceLifecycle({ mode: "paid", action, subscription: null, subscriptionUnreadable: true, now: NOW })).toMatchObject({
        allowed: false,
        blockedBy: "billing_unreadable",
      });
    }
    expect(decideSpaceLifecycle({ mode: "paid", action: "restore", subscription: null, legacySlots: null, now: NOW })).toMatchObject({ allowed: false });
  });
});

describe("usesLegacySlot - only Spaces outside billing live in the legacy allowance", () => {
  it.each(STATES)("%s", (_label, subscription, kind) => {
    expect(usesLegacySlot(subscription, NOW)).toBe(kind === "legacy");
  });
});

describe("lifecycleControlsView", () => {
  const ok: LifecycleDecision = { allowed: true, governedBy: "billing" };
  const locked: LifecycleDecision = { allowed: false, governedBy: "billing", blockedBy: "billing_locked" };
  const slot: LifecycleDecision = { allowed: false, governedBy: "legacy", blockedBy: "slot_limit" };
  const unknown: LifecycleDecision = { allowed: false, governedBy: "unknown", blockedBy: "billing_unreadable" };

  describe("flag OFF reproduces the Task 011 rule exactly, whatever the decisions say", () => {
    it.each([
      [true, 0, { showRestore: true, showReplace: true, billingLocked: false }],
      [true, 3, { showRestore: true, showReplace: true, billingLocked: false }],
      [false, 0, { showRestore: false, showReplace: true, billingLocked: false }],
      [false, 1, { showRestore: false, showReplace: false, billingLocked: false }],
    ])("archived=%s slotsAvailable=%s", (isArchived, slotsAvailable, expected) => {
      expect(lifecycleControlsView({ mode: "legacy", isArchived, slotsAvailable, restore: locked, replace: locked })).toEqual(expected);
    });
  });

  describe("flag ON follows the per-Space decision, never the slot count", () => {
    it.each([
      ["archived, allowed", true, ok, ok, { showRestore: true, showReplace: true, billingLocked: false }],
      ["archived, billing locked", true, locked, locked, { showRestore: false, showReplace: false, billingLocked: true }],
      ["archived legacy, over allowance", true, slot, ok, { showRestore: true, showReplace: true, billingLocked: false }],
      ["archived, unreadable", true, unknown, unknown, { showRestore: false, showReplace: false, billingLocked: false }],
      ["live, allowed", false, ok, ok, { showRestore: false, showReplace: true, billingLocked: false }],
      ["live, billing locked", false, locked, locked, { showRestore: false, showReplace: false, billingLocked: true }],
    ] as const)("%s", (_label, isArchived, restore, replace, expected) => {
      for (const slotsAvailable of [0, 5]) {
        expect(lifecycleControlsView({ mode: "paid", isArchived, slotsAvailable, restore, replace })).toEqual(expected);
      }
    });
  });
});
