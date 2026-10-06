import { createElement as h, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createTranslator, type Locale } from "@/lib/i18n";
import { StudioButton } from "./studio-fields";
import { CollapsibleItemRow } from "./collapsible-item-row";

/**
 * TASK 029 Phase 1 - the Studio list row moved out of Teach's ItemList
 * into a shared component so Flow's new modules can use it. "Shared" is
 * only safe if it renders what Teach rendered before, so the extracted
 * component is compared against a verbatim copy of the pre-extraction
 * markup, as HTML, across every combination of the things that vary.
 *
 * (createElement rather than JSX because the vitest include is *.test.ts,
 * the same reason components/shared/brandImage.test.ts is written that way.)
 */

const noop = () => {};

/** app/configurator/teach/teach-studio-sections.tsx at d3f4bed, verbatim. */
function preExtractionRow(opts: {
  locale: Locale;
  moduleKey: string;
  summary: { title: string; sub: string; thumb?: string | null };
  isOpen: boolean;
  reorder: boolean;
  order: boolean;
  index: number;
  itemsLength: number;
  busy: boolean;
  children: ReactNode;
}) {
  const { t } = createTranslator(opts.locale);
  const { summary: s, isOpen, reorder, order, index, itemsLength, busy } = opts;
  return h(
    "div",
    {
      className: `rounded-xl border ${isOpen ? "border-[#9A7B4F]/60 bg-[#FBF8F2]" : "border-[#E2DACD] bg-white"}`,
      "data-testid": `item-${opts.moduleKey}`,
    },
    h(
      "div",
      { className: "flex items-center gap-3 p-3" },
      s.thumb !== undefined
        ? s.thumb
          ? h("img", { src: s.thumb, alt: "", className: "w-11 h-11 rounded-lg object-cover shrink-0" })
          : h("span", { className: "w-11 h-11 rounded-lg bg-[#F1E9DC] shrink-0", "aria-hidden": "true" })
        : null,
      h(
        "button",
        { type: "button", onClick: noop, "aria-expanded": isOpen, className: "flex-1 min-w-0 text-left min-h-11" },
        h("span", { className: "block text-[14px] font-semibold text-[#192B21] truncate" }, s.title || t("common", "untitled")),
        h("span", { className: "block text-[11.5px] text-[#8C8A84] truncate" }, s.sub)
      ),
      reorder && !order
        ? h(
            "span",
            { className: "flex" },
            h(
              "button",
              {
                type: "button",
                onClick: noop,
                "aria-label": t("studio", "moveUp"),
                className: "w-9 h-9 rounded-lg text-[#6F6C66] hover:bg-black/5",
                disabled: index === 0,
              },
              "↑"
            ),
            h(
              "button",
              {
                type: "button",
                onClick: noop,
                "aria-label": t("studio", "moveDown"),
                className: "w-9 h-9 rounded-lg text-[#6F6C66] hover:bg-black/5",
                disabled: index === itemsLength - 1,
              },
              "↓"
            )
          )
        : null,
      h(
        "button",
        {
          type: "button",
          onClick: noop,
          "aria-label": isOpen ? t("studio", "collapse") : t("common", "edit"),
          className: "w-9 h-9 rounded-lg text-[#6F6C66] hover:bg-black/5",
        },
        isOpen ? "▴" : "▾"
      )
    ),
    isOpen
      ? h(
          "div",
          { className: "px-3 sm:px-4 pb-4 flex flex-col gap-4 border-t border-[#E2DACD] pt-4" },
          opts.children,
          h(
            "div",
            { className: "flex justify-end" },
            h(StudioButton, { kind: "danger", onClick: noop, disabled: busy, children: busy ? t("common", "removing") : t("common", "remove") })
          )
        )
      : null
  );
}

const LOCALES: Locale[] = ["en", "he", "de"];
const THUMBS: (string | null | undefined)[] = [undefined, null, "https://example.test/t.webp"];
const editor = () => h("p", null, "editor fields");

describe("CollapsibleItemRow renders exactly what Teach's ItemList rendered", () => {
  it("matches for every locale, thumbnail state, open state, position and busy state", () => {
    let compared = 0;
    for (const locale of LOCALES) {
      for (const thumb of THUMBS) {
        for (const isOpen of [false, true]) {
          // First, middle and last of three: the three distinct arrow states.
          for (const index of [0, 1, 2]) {
            for (const busy of [false, true]) {
              // The middle one is untitled, to exercise the fallback label.
              const summary = { title: index === 1 ? "" : "Morning Practice", sub: "Evening · 10:12", thumb };
              const before = renderToStaticMarkup(
                preExtractionRow({
                  locale,
                  moduleKey: "teachAudio",
                  summary,
                  isOpen,
                  reorder: true,
                  order: false,
                  index,
                  itemsLength: 3,
                  busy,
                  children: editor(),
                })
              );
              const after = renderToStaticMarkup(
                h(
                  CollapsibleItemRow,
                  {
                    locale,
                    testId: "item-teachAudio",
                    title: summary.title,
                    sub: summary.sub,
                    thumb,
                    open: isOpen,
                    onToggle: noop,
                    move: { up: noop, down: noop, upDisabled: index === 0, downDisabled: index === 2 },
                    onRemove: noop,
                    removing: busy,
                    children: editor(),
                  }
                )
              );
              expect(after, `${locale}/${String(thumb)}/open=${isOpen}/index=${index}/busy=${busy}`).toBe(before);
              compared += 1;
            }
          }
        }
      }
    }
    expect(compared).toBe(LOCALES.length * THUMBS.length * 2 * 3 * 2);
  });

  it("hides the arrows when the list is shown in a derived order, as before", () => {
    const before = renderToStaticMarkup(
      preExtractionRow({
        locale: "en",
        moduleKey: "teachClasses",
        summary: { title: "A", sub: "b", thumb: null },
        isOpen: true,
        reorder: true,
        order: true,
        index: 0,
        itemsLength: 3,
        busy: false,
        children: editor(),
      })
    );
    const after = renderToStaticMarkup(
      h(
        CollapsibleItemRow,
        { locale: "en", testId: "item-teachClasses", title: "A", sub: "b", thumb: null, open: true, onToggle: noop, onRemove: noop, children: editor() }
      )
    );
    expect(after).toBe(before);
    expect(after).not.toContain("↑");
  });

  it("keeps the testid Studio selectors rely on, and drops the editor when collapsed", () => {
    const out = renderToStaticMarkup(
      h(CollapsibleItemRow, { locale: "en", testId: "item-teachAudio", title: "A", sub: "b", open: false, onToggle: noop, children: editor() })
    );
    expect(out).toContain('data-testid="item-teachAudio"');
    expect(out).not.toContain("editor fields");
    expect(out).toContain('aria-expanded="false"');
  });
});
