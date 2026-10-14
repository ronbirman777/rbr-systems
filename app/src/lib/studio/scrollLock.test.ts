import { afterEach, describe, expect, it } from "vitest";
import { isScrollLocked, lockScroll, releaseScrollLock, trapFocusIndex, type ScrollLockEnv } from "./scrollLock";

/** TASK 033 mobile Studio menu: the scroll-lock / restore rules, without a DOM. */
function fakeEnv(scrollY = 1234, scrollX = 0) {
  const calls: { x: number; y: number; behavior: string }[] = [];
  const html: Record<string, string> = { scrollBehavior: "smooth" };
  const body: Record<string, string> = { position: "", top: "", left: "", right: "", width: "", overflow: "" };
  const env: ScrollLockEnv = {
    win: { scrollX, scrollY, scrollTo: (x, y) => calls.push({ x, y, behavior: html.scrollBehavior }) },
    doc: { documentElement: { style: html }, body: { style: body } },
  };
  return { env, calls, html, body };
}

afterEach(() => releaseScrollLock());

describe("lockScroll", () => {
  it("pins the body at the current position (iOS-safe: position fixed + negative top)", () => {
    const { env, body } = fakeEnv(2510);
    lockScroll(env);
    expect(isScrollLocked()).toBe(true);
    expect(body).toMatchObject({ position: "fixed", top: "-2510px", left: "0", right: "0", width: "100%", overflow: "hidden" });
  });

  it("restores the exact position and the previous inline styles on release, with smooth scrolling suspended for the jump", () => {
    const { env, body, calls, html } = fakeEnv(2510, 3);
    body.overflow = "clip";
    const release = lockScroll(env);
    release();
    expect(isScrollLocked()).toBe(false);
    expect(body).toEqual({ position: "", top: "", left: "", right: "", width: "", overflow: "clip" });
    expect(calls).toEqual([{ x: 3, y: 2510, behavior: "auto" }]);
    expect(html.scrollBehavior).toBe("smooth");
  });

  it("is idempotent per lock", () => {
    const { env, calls } = fakeEnv(10);
    const release = lockScroll(env);
    release();
    release();
    expect(calls).toHaveLength(1);
  });

  it("counts nested locks: only the last release restores", () => {
    const { env, calls, body } = fakeEnv(500);
    const a = lockScroll(env);
    const b = lockScroll(env);
    a();
    expect(body.position).toBe("fixed");
    expect(calls).toHaveLength(0);
    b();
    expect(calls).toEqual([{ x: 0, y: 500, behavior: "auto" }]);
  });

  it("releaseScrollLock() restores early, and the overlay's own later release is then a no-op", () => {
    const { env, calls } = fakeEnv(900);
    const release = lockScroll(env);
    releaseScrollLock();
    expect(calls).toHaveLength(1);
    // the caller now navigates and jumps to the top...
    env.win.scrollTo(0, 0);
    // ...and the drawer's cleanup must not drag the page back to 900
    release();
    expect(calls.at(-1)).toEqual({ x: 0, y: 0, behavior: "smooth" });
    expect(calls).toHaveLength(2);
  });

  it("does nothing without a browser environment", () => {
    expect(() => lockScroll(null)()).not.toThrow();
    expect(isScrollLocked()).toBe(false);
  });
});

describe("trapFocusIndex - Tab stays inside the open drawer", () => {
  it("wraps forward and backward", () => {
    expect(trapFocusIndex(0, 3, false)).toBe(1);
    expect(trapFocusIndex(2, 3, false)).toBe(0);
    expect(trapFocusIndex(0, 3, true)).toBe(2);
    expect(trapFocusIndex(1, 3, true)).toBe(0);
  });
  it("pulls focus back in from outside", () => {
    expect(trapFocusIndex(-1, 3, false)).toBe(0);
    expect(trapFocusIndex(-1, 3, true)).toBe(2);
  });
  it("handles an empty or single list", () => {
    expect(trapFocusIndex(0, 0, false)).toBe(-1);
    expect(trapFocusIndex(0, 1, false)).toBe(0);
    expect(trapFocusIndex(0, 1, true)).toBe(0);
  });
});
