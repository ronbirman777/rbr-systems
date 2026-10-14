import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { COVER_SOURCE_ASPECT, columnCoverSizes, coverWidthPx, fixedCoverSizes } from "./coverSizes";
import { MEDIA_WIDTHS } from "./cachePolicy";
import { GUEST_COLUMN_MAX_WIDTH, GUEST_COLUMN_MIN_VIEWPORT } from "@/lib/guest/column";
import { FLOW_SIZES } from "@/components/flow-media-sizes";
import { TEACH_SIZES } from "@/components/teach/teach-media-sizes";

/**
 * Guest image sharpness. Every Guest image is object-fit: cover, so the
 * width it must be rendered at is max(boxW, boxH x sourceAspect), not
 * boxW. These tests evaluate each `sizes` value the way a browser does
 * and check it against that need.
 */

/** Evaluate a `sizes` attribute at a viewport width, as a browser would (min-width, px, vw, max()). */
function evalSizes(sizes: string, vw: number): number {
  const length = (v: string): number => {
    v = v.trim();
    const max = v.match(/^max\((.*)\)$/);
    if (max) return Math.max(...max[1].split(",").map(length));
    const m = v.match(/^([\d.]+)(px|vw)$/);
    if (!m) throw new Error(`unparsed length: ${v}`);
    return m[2] === "px" ? Number(m[1]) : (Number(m[1]) * vw) / 100;
  };
  // Split on top-level commas only (max() has its own).
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of sizes) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  for (const part of parts) {
    const p = part.trim();
    const cond = p.match(/^\(min-width:\s*(\d+)px\)\s+(.*)$/);
    if (cond) {
      if (vw >= Number(cond[1])) return length(cond[2]);
      continue;
    }
    return length(p);
  }
  throw new Error(`no matching clause in "${sizes}"`);
}

/** The ladder rung a browser picks for a claim at a DPR (smallest candidate >= claim x dpr). */
function pick(claimCss: number, dpr: number): number {
  return MEDIA_WIDTHS.find((w) => w >= claimCss * dpr) ?? MEDIA_WIDTHS[MEDIA_WIDTHS.length - 1];
}

const LANDSCAPE = 1376 / 768; // the real demo uploads, 1.79:1

describe("coverWidthPx / fixedCoverSizes", () => {
  it("portrait cover: the 230x290 Teach arch needs the HEIGHT term, not 230px", () => {
    expect(fixedCoverSizes(230, 290)).toBe("516px");
    // DPR 2: previously w=480 for a 290px-tall box (2.2x upscale). Now >= the need.
    const need = 290 * LANDSCAPE * 2;
    expect(pick(516, 2)).toBeGreaterThanOrEqual(need);
    expect(pick(230, 2) / need).toBeLessThan(0.5); // the old claim, for the record
  });

  it("thumbnail: the 76x90 class card thumb claims 160px - sharp at DPR 3 without a full-resolution download", () => {
    expect(fixedCoverSizes(76, 90)).toBe("160px");
    expect(pick(160, 3)).toBe(480);
    expect(pick(160, 3)).toBeGreaterThanOrEqual(Math.floor(90 * COVER_SOURCE_ASPECT * 3));
    expect(pick(160, 3)).toBeLessThan(1376);
  });

  it("hero: the 430x280 Flow Today hero claims 498px everywhere (it was 430px / 100vw)", () => {
    expect(FLOW_SIZES.todayHero).toBe("498px");
    expect(coverWidthPx(430, 280)).toBe(498);
  });

  it("a wide box keeps its width: height is only a floor", () => {
    expect(coverWidthPx(430, 120)).toBe(430);
    expect(columnCoverSizes(430, 100, 200)).toBe(`(min-width: ${GUEST_COLUMN_MIN_VIEWPORT}px) 430px, max(100vw, 356px)`);
  });

  it("collapses to one constant when the height term exceeds every possible box width", () => {
    expect(columnCoverSizes(215, 50, 140)).toBe("249px");
    expect(columnCoverSizes(430, 100, 360)).toBe("640px");
  });
});

/**
 * The box of every table entry, read off its call site's className.
 * `phone` is the width as a fraction of the viewport below the column
 * breakpoint, `column` the width inside the column; fixed boxes give `w`.
 * Adding a table entry without a box here fails the coverage test below.
 */
type Box = { w: number; h: number } | { phone: number; column: number; h: number };
const C = GUEST_COLUMN_MAX_WIDTH;
const FLOW_BOXES: Record<keyof typeof FLOW_SIZES, Box> = {
  todayHero: { phone: 1, column: C, h: 280 },
  accessHero: { phone: 1, column: C, h: 220 },
  facilitatorCard: { phone: 1, column: C, h: 300 },
  treatmentCard: { phone: 1, column: C, h: 200 },
  mealCard: { phone: 1, column: C, h: 160 },
  facilityFeatured: { phone: 1, column: C, h: 220 },
  facilityCard: { phone: 1, column: C, h: 160 },
  customPageCover: { phone: 1, column: C, h: 180 },
  readingFeatured: { phone: 1, column: C, h: 200 },
  readingCover: { phone: 1, column: C, h: 200 },
  readingRow: { w: 88, h: 120 },
  audioRow: { w: 76, h: 76 },
  audioArtwork: { w: 280, h: 280 },
  exploreMeals: { phone: 1, column: C, h: 180 },
  exploreTreatments: { phone: 1, column: C, h: 200 },
  exploreTile: { phone: 0.5, column: C / 2, h: 140 },
};
const TEACH_BOXES: Record<keyof typeof TEACH_SIZES, Box> = {
  navAvatar: { w: 36, h: 36 },
  heroPortraitArch: { w: 230, h: 290 },
  heroPortraitCircle: { w: 168, h: 168 },
  heroFullbleed: { phone: 1, column: C, h: 360 },
  aboutPortrait: { w: 150, h: 150 },
  homeMoreCard: { phone: 0.45, column: Math.round(C * 0.45), h: 110 },
  galleryTall: { phone: 0.5, column: C / 2, h: 220 },
  galleryShort: { phone: 0.5, column: C / 2, h: 140 },
  certificate: { w: 48, h: 48 },
  readingFeatured: { phone: 1, column: C, h: 200 },
  readingRow: { w: 78, h: 78 },
  readingCover: { phone: 1, column: C, h: 260 },
  audioFeatured: { phone: 1, column: C, h: 190 },
  audioRow: { w: 64, h: 64 },
  audioArtwork: { w: 300, h: 300 },
  pageCover: { phone: 1, column: C, h: 240 },
  retreatCard: { phone: 1, column: C, h: 180 },
  retreatCover: { phone: 1, column: C, h: 240 },
  classCardThumb: { w: 76, h: 90 },
  exploreCard: { phone: 1, column: C, h: 200 },
};

const VIEWPORTS = [320, 360, 390, 414, 430, 431, 640, 768, 1440];

function boxAt(box: Box, vw: number): { w: number; h: number } {
  if ("w" in box) return box;
  return { w: vw >= GUEST_COLUMN_MIN_VIEWPORT ? box.column : box.phone * vw, h: box.h };
}

describe.each([
  ["Flow", FLOW_SIZES as Record<string, string>, FLOW_BOXES as Record<string, Box>],
  ["Teach", TEACH_SIZES as Record<string, string>, TEACH_BOXES as Record<string, Box>],
])("%s sizes table is height-aware for cover", (_name, table, boxes) => {
  it("every entry has a declared box (no untested entry)", () => {
    expect(Object.keys(table).sort()).toEqual(Object.keys(boxes).sort());
  });

  it.each(Object.keys(table))("%s never under-claims a cover box and over-claims by at most 10%%", (key) => {
    for (const vw of VIEWPORTS) {
      const { w, h } = boxAt(boxes[key], vw);
      const need = coverWidthPx(w, h);
      const claim = evalSizes(table[key], vw);
      expect(claim, `${key} at ${vw}px: claims ${claim}, cover needs ${need}`).toBeGreaterThanOrEqual(need - 0.5);
      expect(claim, `${key} at ${vw}px: claims ${claim}, cover needs ${need}`).toBeLessThanOrEqual(Math.ceil(need * 1.1));
    }
  });

  it.each(Object.keys(table))("%s has no bare width-only vw term", (key) => {
    // A vw term outside max() is a width-only claim again.
    const withoutMax = table[key].replace(/max\([^)]*\)/g, "");
    expect(withoutMax).not.toMatch(/vw/);
  });
});

describe("regression guard: every Guest cover image passes a height-aware sizes", () => {
  const root = path.resolve(__dirname, "../../components");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx$/.test(e.name) && !/\.test\./.test(e.name) && !p.includes(`${path.sep}marketing${path.sep}`)) files.push(p);
    }
  };
  walk(root);

  it("BrandImage is object-fit: cover (the premise of this table)", () => {
    const src = fs.readFileSync(path.join(root, "shared/brand-image.tsx"), "utf8");
    expect(src).toMatch(/className=\{`object-cover /);
  });

  it("no BrandImage/TeachImage call site declares a literal, width-only or ad-hoc sizes", () => {
    const allowed = /^(TEACH_SIZES\.\w+|FLOW_SIZES\.\w+|EXPLORE_COVER_SIZES\.\w+|EXPLORE_CARD_SIZES|EXPLORE_FEATURE_CARD_SIZES|ABOUT_PORTRAIT_SIZES|HERO_FULLBLEED_SIZES|sizes)$/;
    const offenders: string[] = [];
    let checked = 0;
    for (const file of files) {
      const src = fs.readFileSync(file, "utf8");
      const re = /<(BrandImage|TeachImage)\b([\s\S]*?)\/>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        const attr = m[2].match(/\bsizes=(\{([^{}]*)\}|"[^"]*")/);
        if (!attr) continue; // no sizes = no srcset = the original; not a selection problem
        checked++;
        const expr = attr[2]?.trim();
        const terms = expr ? expr.split(/[?:]/).map((t) => t.trim()).filter(Boolean) : [];
        const bad =
          !expr ||
          /FLOW_SIZES\.(frame|tile)\b|columnSizes\(/.test(expr) ||
          terms.slice(expr.includes("?") ? 1 : 0).some((t) => !allowed.test(t));
        if (bad) offenders.push(`${path.relative(root, file)}: sizes=${attr[1]}`);
      }
    }
    expect(checked).toBeGreaterThan(30);
    expect(offenders).toEqual([]);
  });

  it("EXPLORE prefetch tables only use height-aware entries", async () => {
    const { EXPLORE_COVER_SIZES, EXPLORE_CUSTOM_PAGE_SIZES } = await import("@/components/guest/explore-screen");
    const flowValues = new Set(Object.values(FLOW_SIZES));
    for (const v of [...Object.values(EXPLORE_COVER_SIZES), EXPLORE_CUSTOM_PAGE_SIZES]) expect(flowValues.has(v as never)).toBe(true);
  });
});
