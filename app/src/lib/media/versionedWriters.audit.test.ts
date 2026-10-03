import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * TASK 027.5 Phase 3C - no versioned media writer may need Storage UPDATE.
 * A static scan of production source: Storage `upsert: true` (which needs
 * UPDATE) and `.move(` (which rewrites an object) are forbidden everywhere
 * except the one allowlisted legacy stable-path publish branch. This is what
 * lets a later migration deny UPDATE for every versioned object.
 */
const ROOT = join(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.|test-util/.test(name)) out.push(full);
  }
  return out;
}

const files = walk(ROOT).map((f) => ({ rel: relative(ROOT, f), src: readFileSync(f, "utf8") }));
const read = (rel: string) => files.find((f) => f.rel === rel)!.src;

describe("versioned media writers never need Storage UPDATE", () => {
  it("`upsert: true` appears only in the legacy stable-path publish branch", () => {
    const hits = files.filter((f) => /upsert:\s*true/.test(f.src)).map((f) => f.rel);
    expect(hits).toEqual(["lib/media/publish.ts"]);
    const publish = read("lib/media/publish.ts");
    expect(publish.match(/upsert:\s*true/g)).toHaveLength(1);
    // The single occurrence sits after the versioned early-return, i.e. it is
    // only reachable for a non-versioned (legacy) draft path.
    const versionedReturn = publish.indexOf("isVersionedMediaPath(draftPath)");
    expect(versionedReturn).toBeGreaterThan(-1);
    expect(publish.indexOf("upsert: true")).toBeGreaterThan(publish.indexOf("return publishedPath;", versionedReturn));
  });

  it("Storage move() is never used", () => {
    expect(files.filter((f) => /\.move\(/.test(f.src)).map((f) => f.rel)).toEqual([]);
  });

  it("every image/audio upload in a Studio action is create-only (upsert: false)", () => {
    for (const rel of ["app/configurator/retreat/actions.ts", "app/configurator/teach/actions.ts", "lib/teach/audioUpload.ts"]) {
      const src = read(rel);
      const uploads = src.match(/\.upload\([^)]*\)/g) ?? [];
      expect(uploads.length).toBeGreaterThan(0);
      for (const call of uploads) expect(call).toMatch(/upsert:\s*false/);
    }
  });

  it("the retreat image uploads all use a fresh uploadId path", () => {
    const src = read("app/configurator/retreat/actions.ts");
    expect((src.match(/newUploadId\(\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("Storage writes in the non-legacy tools are create-only or DELETE (no update/overwrite)", () => {
    const legacy = read("lib/media/legacyMigration.ts");
    for (const call of legacy.match(/\.upload\([^)]*\)/g) ?? []) expect(call).not.toMatch(/upsert:\s*true/);
  });
});
