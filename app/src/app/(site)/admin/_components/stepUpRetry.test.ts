import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// A step-up re-verify must not cost the admin what they typed (TASK 032 follow-up):
//  - the step-up box verifies in place (stepUpVerifyAction returns, it never redirects / reloads),
//  - every Admin component that can show the box (renders <ResultNote>) hands it a retry for the pending action,
//  - those forms submit through onSubmit (useAdminForm), because React resets every uncontrolled field after a
//    `<form action={fn}>` submission, which is what wiped the coupon form on "step_up_required".
const dir = join(process.cwd(), "src/app/(site)/admin/_components");
const read = (f: string) => readFileSync(join(dir, f), "utf8");

describe("Admin step-up keeps form state", () => {
  it("the inline step-up box uses the non-redirecting verify action", () => {
    const src = read("CodeForm.tsx");
    expect(src).toContain("stepUpVerifyAction");
    expect(src).not.toMatch(/verifyMfaAction/);
    const actions = readFileSync(join(process.cwd(), "src/app/(site)/admin/mfa/actions.ts"), "utf8");
    const body = actions.slice(actions.indexOf("export async function stepUpVerifyAction"));
    expect(body).toContain("requireAdminForMfaPages()");
    expect(body).toContain("verifyWithAnyFactor(");
    expect(actions).toMatch(/async function verifyWithAnyFactor[\s\S]*challengeAndVerify/);
    // the only redirect allowed is "no factor -> enrol"; success returns in place
    expect(body.match(/redirect\(/g) ?? []).toHaveLength(1);
    expect(body).toContain('redirect("/admin/mfa/enroll")');
  });

  for (const file of readdirSync(dir).filter((f) => f.endsWith(".tsx") && f !== "ResultNote.tsx")) {
    const src = read(file);
    if (!src.includes("<ResultNote")) continue;
    it(`${file}: every <ResultNote> gets onRetry and no form posts through <form action>`, () => {
      for (const m of src.matchAll(/<ResultNote\b[^>]*>/g)) expect(m[0], `${file}: ${m[0]}`).toMatch(/onRetry=\{/);
      expect(src).not.toMatch(/<form\s+action=\{/);
    });
  }
});
