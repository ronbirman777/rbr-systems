/**
 * HYDRATED fixtures for the TASK 029 accessibility pass.
 *
 * The CP4 fixtures are server-rendered only - deliberately, because its
 * measurements were about bytes and a React bundle would have dominated
 * them. But every disclosure, the list-to-detail step and the player
 * itself are client state, so a static document cannot be clicked and an
 * accessibility pass over one would check only half the markup.
 *
 * So these documents carry a real client bundle and hydrate the real
 * screen. The bundle's size is irrelevant here: nothing in this pass is
 * a timing measurement.
 */
import { createElement as h } from "react";
import { renderToReadableStream } from "react-dom/server";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { flowFixture } from "./data";
import { A11Y_SCREENS } from "./a11y-screens";
import { deriveThemeVars } from "@/lib/theme/deriveTheme";
import { directionOf } from "@/lib/i18n";

const OUT = process.argv[2];
const CSS = process.argv[3];
const LOCALES = ["en", "he", "de"] as const;

async function doc(locale: (typeof LOCALES)[number], screen: string, node: React.ReactNode) {
  const flow = flowFixture(locale);
  const vars = deriveThemeVars(flow.brand) as React.CSSProperties;
  const tree = h(
    "html",
    { lang: locale, dir: directionOf(locale) },
    h(
      "head",
      null,
      h("meta", { charSet: "utf-8" }),
      h("meta", { name: "viewport", content: "width=device-width,initial-scale=1,viewport-fit=cover" }),
      h("title", null, screen),
      h("link", { rel: "stylesheet", href: CSS })
    ),
    h(
      "body",
      null,
      h(
        "main",
        {
          id: "root",
          style: { ...vars, background: "var(--rbr-parchment-deep)" },
          lang: locale,
          dir: directionOf(locale),
          className: "guest-viewport flex-1 flex items-center justify-center sm:p-6 p-0 min-h-dvh",
        },
        h(
          "div",
          {
            className: "relative flex flex-col overflow-hidden sm:rounded-[44px] w-full h-dvh sm:w-[390px] sm:h-[780px]",
            style: { background: "var(--rbr-background)" },
          },
          node
        )
      ),
      h("script", { id: "a11y-screen", type: "application/json", dangerouslySetInnerHTML: { __html: JSON.stringify({ locale, screen }) } }),
      h("script", { src: "/a11y.js", defer: true })
    )
  );
  const stream = await renderToReadableStream(tree);
  await stream.allReady;
  let html = "";
  for await (const chunk of stream) html += new TextDecoder().decode(chunk);
  return "<!doctype html>" + html;
}

for (const locale of LOCALES) {
  const suffix = locale === "en" ? "" : `.${locale}`;
  for (const name of Object.keys(A11Y_SCREENS)) {
    const node = A11Y_SCREENS[name]!(locale);
    writeFileSync(join(OUT, `a11y-${name}${suffix}.html`), await doc(locale, name, node));
  }
}
console.log("a11y fixtures written");
