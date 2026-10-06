/**
 * Renders the REAL Guest Apps to standalone HTML for the CP4 harness.
 *
 * Why this exists: the before/after numbers have to come from the actual
 * components, including the <head> hints React hoists during a STREAMING
 * render (renderToStaticMarkup does not hoist, so it would miss the very
 * thing being measured). The output is a complete document pointed at
 * the harness's modelled /api/media, plus a client bundle that hydrates
 * only what needs to be live.
 */
import { createElement as h } from "react";
import { renderToReadableStream } from "react-dom/server";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { TeachGuestApp } from "@/components/teach/teach-guest-app";
import { GuestApp } from "@/components/guest-app";
import { FacilitatorsScreen } from "@/components/facilitators-screen";
import { ExploreScreen } from "@/components/guest/explore-screen";
import { ScheduleScreen } from "@/components/schedule-screen";
import { MealsScreen } from "@/components/meals-screen";
import { TreatmentsScreen } from "@/components/treatments-screen";
import { FacilitiesScreen } from "@/components/facilities-screen";
import { FaqScreen } from "@/components/faq-screen";
import { GuidelinesScreen } from "@/components/guest/guidelines-screen";
import { ReadingsScreen } from "@/components/guest/readings-screen";
import { AudioScreen } from "@/components/guest/audio-screen";
import { deriveThemeVars } from "@/lib/theme/deriveTheme";
import { directionOf } from "@/lib/i18n";
import { teachPrefetchItems } from "@/components/teach/teach-guest-app";
import { guestPrefetchItems } from "@/components/guest-app";
import { teachFixture, flowFixture } from "./data";

const OUT = process.argv[2];
const CSS = process.argv[3]; // the harness's stylesheet path, served statically

/**
 * The inventory is computed HERE, by the app's own exported functions,
 * and handed to the page as data. The client bundle then has to carry
 * only lib/media/prefetch.ts - the code actually under measurement -
 * instead of all of React, which at ~1MB over a throttled link would
 * have dominated the very numbers it was meant to produce.
 */
async function doc(title: string, node: React.ReactNode, items: unknown[] | null) {
  const tree = h(
    "html",
    { lang: "en", dir: "ltr" },
    h(
      "head",
      null,
      h("meta", { charSet: "utf-8" }),
      h("meta", { name: "viewport", content: "width=device-width,initial-scale=1,viewport-fit=cover" }),
      h("title", null, title),
      h("link", { rel: "stylesheet", href: CSS })
    ),
    h(
      "body",
      null,
      h("div", { id: "root" }, node),
      items
        ? [
            h("script", {
              key: "items",
              id: "prefetch-items",
              type: "application/json",
              dangerouslySetInnerHTML: { __html: JSON.stringify(items) },
            }),
            h("script", { key: "boot", src: "/prefetch.js", defer: true }),
          ]
        : null
    )
  );
  const stream = await renderToReadableStream(tree);
  await stream.allReady;
  let html = "";
  for await (const chunk of stream) html += new TextDecoder().decode(chunk);
  return "<!doctype html>" + html;
}

const LOCALES = ["en", "he", "de"] as const;

/**
 * Flow's own route chrome, reproduced exactly.
 *
 * components/guest/published-space-screen.tsx is what the published
 * route actually renders: it owns the lang/dir pair AND the phone-width
 * `h-dvh` frame that CP4's bottom-nav work depends on. GuestApp alone
 * has neither, so rendering it bare would measure a shell that is never
 * served. Kept character-for-character in step with that file.
 */
function flowChrome(locale: "en" | "he" | "de", vars: React.CSSProperties, child: React.ReactNode) {
  return h(
    "main",
    {
      style: { ...vars, background: "var(--rbr-parchment-deep)" },
      lang: locale,
      dir: directionOf(locale),
      className: "guest-viewport flex-1 flex items-center justify-center sm:p-6 p-0 min-h-dvh",
    },
    h(
      "div",
      {
        className:
          "relative flex flex-col overflow-hidden sm:rounded-[44px] w-full h-dvh sm:w-[390px] sm:h-[780px]",
        style: { background: "var(--rbr-background)", boxShadow: "0 40px 100px rgba(45,74,62,0.2), 0 10px 30px rgba(45,74,62,0.1)" },
      },
      child
    )
  );
}

for (const locale of LOCALES) {
  const teach = teachFixture(locale);
  const flow = flowFixture(locale);
  const teachUrl = (r: string | null | undefined) => (r ? (teach.mediaUrls[r] ?? null) : null);
  const suffix = locale === "en" ? "" : `.${locale}`;

  for (const [name, node, items] of [
    ["teach-home", h(TeachGuestApp, { data: teach, initialTab: "home" }), teachPrefetchItems(teach, "home", teachUrl)],
    ["teach-about", h(TeachGuestApp, { data: teach, initialTab: "about" }), teachPrefetchItems(teach, "about", teachUrl)],
    ["teach-explore", h(TeachGuestApp, { data: teach, initialTab: "explore" }), teachPrefetchItems(teach, "explore", teachUrl)],
    ["flow", flowChrome(locale, deriveThemeVars(flow.brand) as React.CSSProperties, h(GuestApp, flow)), guestPrefetchItems(flow, "today")],
  ] as const) {
    writeFileSync(join(OUT, `${name}${suffix}.html`), await doc(name, node, null));
    writeFileSync(join(OUT, `${name}${suffix}-prefetch.html`), await doc(name, node, [...items]));
  }

  // Flow's shell always opens on Today, so its other two tabs are
  // emitted as the screens a tab press would mount. The QA matrix
  // stitches them into one switchable page, which is how a thumb
  // actually meets them - and they are where Flow's media density is.
  const vars = deriveThemeVars(flow.brand) as React.CSSProperties;
  writeFileSync(
    join(OUT, `flow-team${suffix}.html`),
    await doc("flow-team", flowChrome(locale, vars, h(FacilitatorsScreen, { brand: flow.brand, facilitators: flow.facilitators, locale })), null)
  );
  // TASK 029: every screen the P6 matrix must exercise, emitted as the
  // screens a press would mount - same treatment as flow-team and
  // flow-explore above. The Explore sub-screens are what this task
  // added or changed, so they are where the matrix needs to look.
  for (const [name, node] of [
    ["flow-schedule", h(ScheduleScreen, { brand: flow.brand, schedule: flow.schedule, todayIso: flow.todayIso, nowTime: flow.nowTime, locale })],
    ["flow-meals", h(MealsScreen, { brand: flow.brand, meals: flow.meals, intro: flow.moduleIntros?.meals?.intro ?? null, locale })],
    ["flow-treatments", h(TreatmentsScreen, { brand: flow.brand, treatments: flow.treatments, locale })],
    ["flow-facilities", h(FacilitiesScreen, { brand: flow.brand, facilities: flow.facilities, locale })],
    ["flow-faq", h(FaqScreen, { brand: flow.brand, faq: flow.faq ?? [], locale })],
    ["flow-guidelines", h(GuidelinesScreen, { brand: flow.brand, guidelines: flow.guidelines ?? [], locale })],
    ["flow-readings", h(ReadingsScreen, { brand: flow.brand, readings: flow.readings ?? [], locale })],
    ["flow-audio", h(AudioScreen, { brand: flow.brand, tracks: flow.audio ?? [], locale })],
  ] as const) {
    writeFileSync(join(OUT, `${name}${suffix}.html`), await doc(name, flowChrome(locale, vars, node), null));
  }

  writeFileSync(
    join(OUT, `flow-explore${suffix}.html`),
    await doc(
      "flow-explore",
      flowChrome(
        locale,
        vars,
        h(ExploreScreen, {
          brand: flow.brand,
          enabledModules: flow.enabledModules,
          meals: flow.meals,
          treatments: flow.treatments,
          facilities: flow.facilities,
          arrivalInfo: flow.arrivalInfo!,
          faq: flow.faq ?? [],
          customPages: flow.customPages ?? [],
          stayConnected: flow.stayConnected!,
          guidelines: flow.guidelines ?? [],
          readings: flow.readings ?? [],
          audio: flow.audio ?? [],
          mealsIntro: flow.moduleIntros?.meals?.intro ?? null,
          moduleCoverImages: flow.moduleCoverImages ?? {},
          locale,
        })
      ),
      null
    )
  );
}
console.log(`rendered documents into`, OUT);
