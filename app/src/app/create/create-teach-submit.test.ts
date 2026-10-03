import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * TASK 027.5 QA correction (Issue 1): the Time to Teach button must be disabled and
 * say so while the create action is in flight - the missing pending state is what let
 * a second click create a second Space.
 */
const status = vi.hoisted(() => ({ pending: false }));
vi.mock("react-dom", async (orig) => ({ ...(await orig<typeof import("react-dom")>()), useFormStatus: () => ({ pending: status.pending }) }));

import { CreateTeachSubmit } from "./create-teach-submit";

const html = () => renderToStaticMarkup(createElement(CreateTeachSubmit, { idleLabel: "Begin →", pendingLabel: "Creating your Space…" }, createElement("h2", null, "Time to Teach")));

beforeEach(() => {
  status.pending = false;
});

describe("CreateTeachSubmit", () => {
  it("is an enabled submit button with the idle label before submission", () => {
    const out = html();
    expect(out).toContain('type="submit"');
    expect(out).toContain('data-testid="create-teach"');
    expect(out).not.toMatch(/\sdisabled(=|\s|>)/);
    expect(out).toContain("Begin →");
    expect(out).not.toContain("Creating your Space…");
  });

  it("is disabled, aria-busy and relabelled while the create is pending (a second click cannot fire)", () => {
    status.pending = true;
    const out = html();
    expect(out).toMatch(/\sdisabled(=|\s|>)/);
    expect(out).toContain('aria-busy="true"');
    expect(out).toContain('data-pending="true"');
    expect(out).toContain("Creating your Space…");
    expect(out).not.toContain("Begin →");
  });
});
