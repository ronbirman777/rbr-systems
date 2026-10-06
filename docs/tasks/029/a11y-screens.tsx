/**
 * The screens the accessibility pass walks, in one place so the server
 * render and the client hydration mount the SAME tree - a mismatch would
 * make React discard the server HTML and the pass would be testing a
 * client-only render the app never serves.
 */
import { createElement as h } from "react";
import { flowFixture } from "./data";
import { ScheduleScreen } from "@/components/schedule-screen";
import { FacilitiesScreen } from "@/components/facilities-screen";
import { TreatmentsScreen } from "@/components/treatments-screen";
import { FacilitatorsScreen } from "@/components/facilitators-screen";
import { FaqScreen } from "@/components/faq-screen";
import { MealsScreen } from "@/components/meals-screen";
import { GuidelinesScreen } from "@/components/guest/guidelines-screen";
import { ReadingsScreen, ReadingDetailScreen } from "@/components/guest/readings-screen";
import { AudioScreen, AudioPlayerScreen } from "@/components/guest/audio-screen";
import { ExploreScreen } from "@/components/guest/explore-screen";
import { GuestApp } from "@/components/guest-app";

type Locale = "en" | "he" | "de";

export const A11Y_SCREENS: Record<string, (locale: Locale) => React.ReactNode> = {
  home: (locale) => h(GuestApp, flowFixture(locale)),
  schedule: (locale) => {
    const f = flowFixture(locale);
    return h(ScheduleScreen, { brand: f.brand, schedule: f.schedule, todayIso: f.todayIso, nowTime: f.nowTime, locale });
  },
  explore: (locale) => {
    const f = flowFixture(locale);
    return h(ExploreScreen, {
      brand: f.brand, enabledModules: f.enabledModules, meals: f.meals, treatments: f.treatments,
      facilities: f.facilities, arrivalInfo: f.arrivalInfo!, faq: f.faq ?? [], customPages: f.customPages ?? [],
      stayConnected: f.stayConnected!, guidelines: f.guidelines ?? [], readings: f.readings ?? [],
      audio: f.audio ?? [], mealsIntro: f.moduleIntros?.meals?.intro ?? null,
      moduleCoverImages: f.moduleCoverImages ?? {}, locale,
    });
  },
  meals: (locale) => {
    const f = flowFixture(locale);
    return h(MealsScreen, { brand: f.brand, meals: f.meals, intro: f.moduleIntros?.meals?.intro ?? null, locale });
  },
  treatments: (locale) => {
    const f = flowFixture(locale);
    return h(TreatmentsScreen, { brand: f.brand, treatments: f.treatments, locale });
  },
  facilities: (locale) => {
    const f = flowFixture(locale);
    return h(FacilitiesScreen, { brand: f.brand, facilities: f.facilities, locale });
  },
  facilitators: (locale) => {
    const f = flowFixture(locale);
    return h(FacilitatorsScreen, { brand: f.brand, facilitators: f.facilitators, locale });
  },
  faq: (locale) => {
    const f = flowFixture(locale);
    return h(FaqScreen, { brand: f.brand, faq: f.faq ?? [], locale });
  },
  guidelines: (locale) => {
    const f = flowFixture(locale);
    return h(GuidelinesScreen, { brand: f.brand, guidelines: f.guidelines ?? [], locale });
  },
  readings: (locale) => {
    const f = flowFixture(locale);
    return h(ReadingsScreen, { brand: f.brand, readings: f.readings ?? [], locale });
  },
  "reading-detail": (locale) => {
    const f = flowFixture(locale);
    return h(ReadingDetailScreen, { brand: f.brand, reading: (f.readings ?? [])[0]!, onBack: () => {}, locale });
  },
  audio: (locale) => {
    const f = flowFixture(locale);
    return h(AudioScreen, { brand: f.brand, tracks: f.audio ?? [], locale });
  },
  "audio-player": (locale) => {
    const f = flowFixture(locale);
    return h(AudioPlayerScreen, { brand: f.brand, track: (f.audio ?? [])[0]!, onBack: () => {}, locale });
  },
};
