import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// ResultNote can render the step-up box, which is a <form> of its own. HTML forbids nested
// forms (the inner submit then posts the outer form), so ResultNote must never sit inside a <form>.
const dir = join(process.cwd(), "src/app/(site)/admin/_components");

describe("Admin components never nest the step-up form", () => {
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".tsx"))) {
    it(`${file}: <ResultNote> is never rendered inside a <form>`, () => {
      const src = readFileSync(join(dir, file), "utf8");
      let depth = 0;
      for (const m of src.matchAll(/<form\b|<\/form>|<ResultNote\b/g)) {
        if (m[0] === "<ResultNote") expect(depth, `${file} at offset ${m.index}`).toBe(0);
        else depth += m[0] === "</form>" ? -1 : 1;
      }
    });
  }
});
