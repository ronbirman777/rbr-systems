import type { BrandConfig } from "@/lib/theme/tokens";
import type { PublicScheduleItem } from "@/lib/schedule/types";
import type { DisplayFacilitator } from "@/lib/modules/facilitator";
import type { DisplayMeal } from "@/lib/modules/meal";
import type { DisplayTreatment } from "@/lib/modules/treatment";
import type { TodayVisualItem } from "./product-visuals/today-visual";
import type { ScheduleVisualDay, ScheduleVisualItem } from "./product-visuals/schedule-visual";
import type { MealsVisualItem } from "./product-visuals/meals-visual";
import type { TeamVisualPerson } from "./product-visuals/team-visual";
import type { TreatmentsVisualItem } from "./product-visuals/treatments-visual";

/**
 * Curated demo content for a single fictional retreat ("Samadhi Retreat"),
 * used only to feed the REAL Guest App screen components
 * (TodayScreen/ScheduleScreen/etc.) for marketing display - never a
 * hand-built visual approximation of them. Names and content echo the
 * approved Figma reference so the marketing composition matches what was
 * already approved, while the pixels themselves come from the real
 * components. No product code is modified to support this - these are
 * just props.
 */
export const DEMO_TODAY_ISO = "2026-08-11";
export const DEMO_NOW_TIME = "09:15";

export const DEMO_BRAND: BrandConfig = {
  name: "Samadhi Retreat",
  logoUrl: null,
  palette: "forest-sage",
  customPrimary: null,
  atmosphere: "calm-organic",
  imageStyle: "rounded",
};

export const DEMO_SCHEDULE: PublicScheduleItem[] = [
  {
    date: DEMO_TODAY_ISO,
    startTime: "06:30",
    endTime: "07:00",
    title: "Morning Grounding",
    facilitator: "Maya Rodriguez",
    location: null,
    description: "Breathwork · 20 min",
    category: null,
  },
  {
    date: DEMO_TODAY_ISO,
    startTime: "08:00",
    endTime: "08:45",
    title: "Jungle Walk",
    facilitator: "Tomás Vargas",
    location: null,
    description: "Outdoor movement · 45 min",
    category: null,
  },
  {
    date: DEMO_TODAY_ISO,
    startTime: "09:30",
    endTime: "10:00",
    title: "Breakfast",
    facilitator: null,
    location: "Terrace",
    description: "Plant-based",
    category: null,
  },
  {
    date: DEMO_TODAY_ISO,
    startTime: "11:00",
    endTime: "12:15",
    title: "Yoga Nidra",
    facilitator: "Asha Mehta",
    location: "Studio A",
    description: "75 min · Rest",
    category: null,
  },
  {
    date: DEMO_TODAY_ISO,
    startTime: "14:00",
    endTime: "15:30",
    title: "Thai Massage",
    facilitator: "Treatment Room 2",
    location: null,
    description: "90 min",
    category: null,
  },
  {
    date: DEMO_TODAY_ISO,
    startTime: "19:00",
    endTime: "20:30",
    title: "Dinner & Sharing",
    facilitator: null,
    location: "Open Fire Terrace",
    description: "Whole group",
    category: null,
  },
];

export const DEMO_FACILITATORS: DisplayFacilitator[] = [
  { name: "Maya Rodriguez", role: "Lead Facilitator", bio: null, imageRef: null, imageUrl: null },
  { name: "Tomás Vargas", role: "Yoga & Breathwork", bio: null, imageRef: null, imageUrl: null },
  { name: "Asha Mehta", role: "Nutrition & Ayurveda", bio: null, imageRef: null, imageUrl: null },
  { name: "James Liu", role: "Integration Support", bio: null, imageRef: null, imageUrl: null },
];

export const DEMO_MEALS: DisplayMeal[] = [
  {
    name: "Garden Terrace Breakfast",
    mealType: "breakfast",
    startTime: "07:30",
    endTime: "09:30",
    description: "Açaí bowls, fresh papaya, avocado on sourdough, green juices.",
    imageRef: null,
    imageUrl: null,
    dietaryTags: ["Vegan", "GF option"],
    location: "Garden Terrace",
  },
  {
    name: "Lemongrass Broth Lunch",
    mealType: "lunch",
    startTime: "13:00",
    endTime: "14:00",
    description: "Lemongrass broth, nourish bowl, coconut water.",
    imageRef: null,
    imageUrl: null,
    dietaryTags: ["Plant-based"],
    location: "Main Hall",
  },
  {
    name: "Open Fire Dinner",
    mealType: "dinner",
    startTime: "19:00",
    endTime: "20:30",
    description: "Roasted vegetables, wild rice, miso-glazed aubergine.",
    imageRef: null,
    imageUrl: null,
    dietaryTags: [],
    location: "Open Fire Terrace",
  },
];

export const DEMO_TREATMENTS: DisplayTreatment[] = [
  {
    name: "Abhyanga Massage",
    shortDescription: "Warm oil, full body",
    description: null,
    durationMinutes: 90,
    imageRef: null,
    imageUrl: null,
    provider: "Maya R.",
    location: "Treatment Room 2",
    bookingInfo: "Tomorrow · 14:00",
  },
  {
    name: "Sound Bath",
    shortDescription: "Group session",
    description: null,
    durationMinutes: 60,
    imageRef: null,
    imageUrl: null,
    provider: null,
    location: "Sala",
    bookingInfo: "Wednesday · 17:00",
  },
  {
    name: "Private Ceremony",
    shortDescription: "Lead facilitator",
    description: null,
    durationMinutes: 120,
    imageRef: null,
    imageUrl: null,
    provider: "Lead facilitator",
    location: null,
    bookingInfo: "Enroll for an additional treatment",
  },
];

/**
 * Three retreat identities sharing one architecture - for "Your Retreat,
 * Your Identity". Each varies BOTH axes the real theme engine actually
 * supports - palette AND atmosphere (radius/spacing/surface warmth, see
 * lib/theme/tokens.ts) - not just a different accent color, so the three
 * genuinely look and feel distinct while staying within what a real
 * customer could configure today; no new customization capability is
 * invented here. Each has its own small schedule, rendered through the
 * real TodayScreen.
 */
export const DEMO_IDENTITIES: {
  tenantName: string;
  brand: BrandConfig;
  schedule: PublicScheduleItem[];
}[] = [
  {
    tenantName: "Samadhi Retreat",
    brand: { ...DEMO_BRAND, palette: "warm-earth", atmosphere: "warm-earthy" },
    schedule: [
      { date: DEMO_TODAY_ISO, startTime: "14:00", endTime: "15:30", title: "Massage", facilitator: null, location: "Treatment Room 2", description: null, category: null },
      { date: DEMO_TODAY_ISO, startTime: "19:00", endTime: "20:30", title: "Dinner", facilitator: null, location: "Open Fire Terrace", description: null, category: null },
    ],
  },
  {
    tenantName: "Soma Sanctuary",
    brand: { ...DEMO_BRAND, palette: "deep-forest", atmosphere: "clean-minimal", imageStyle: "square" },
    schedule: [
      { date: DEMO_TODAY_ISO, startTime: "05:45", endTime: "06:45", title: "Sunrise Yoga", facilitator: null, location: "Open Pavilion", description: null, category: null },
      { date: DEMO_TODAY_ISO, startTime: "07:30", endTime: "08:30", title: "Balinese Breakfast", facilitator: null, location: "Garden", description: null, category: null },
      { date: DEMO_TODAY_ISO, startTime: "10:00", endTime: "11:00", title: "Sound Healing", facilitator: null, location: "Sala", description: null, category: null },
    ],
  },
  {
    tenantName: "Threshold",
    brand: { ...DEMO_BRAND, palette: "soft-sand", atmosphere: "calm-organic" },
    schedule: [
      { date: DEMO_TODAY_ISO, startTime: "07:00", endTime: "08:00", title: "Dawn Walk", facilitator: null, location: "Glen Trail", description: null, category: null },
      { date: DEMO_TODAY_ISO, startTime: "09:00", endTime: "10:00", title: "Stillness Practice", facilitator: null, location: "Stone Circle", description: null, category: null },
      { date: DEMO_TODAY_ISO, startTime: "12:30", endTime: "13:30", title: "Highland Lunch", facilitator: null, location: "Bothy", description: null, category: null },
    ],
  },
];

/**
 * Content for the purpose-built marketing product-visuals (Hero, Flow
 * Showcase) - see product-visuals/*.tsx for why these exist instead of the
 * real screen components. Matches the Figma reference's content/hierarchy,
 * re-skinned into the light product direction.
 */
export const DEMO_TODAY_VISUAL_ITEMS: TodayVisualItem[] = [
  { time: "06:30", title: "Morning Grounding", meta: "Breathwork · 20 min", current: true },
  { time: "08:00", title: "Jungle Walk", meta: "Outdoor movement · 45 min" },
  { time: "09:30", title: "Breakfast", meta: "Terrace · Plant-based" },
  { time: "11:00", title: "Yoga Nidra", meta: "Studio A · 75 min" },
  { time: "14:00", title: "Thai Massage", meta: "Treatment Room 2 · 90 min" },
  { time: "19:00", title: "Dinner & Sharing", meta: "Open Fire Terrace" },
];

export const DEMO_SCHEDULE_VISUAL_DAYS: ScheduleVisualDay[] = [
  { label: "Mon", day: "11", selected: true },
  { label: "Tue", day: "12" },
  { label: "Wed", day: "13" },
  { label: "Thu", day: "14" },
  { label: "Fri", day: "15" },
];

export const DEMO_SCHEDULE_VISUAL_ITEMS: ScheduleVisualItem[] = [
  { time: "06:30", title: "Morning Grounding", meta: "Maya R.", tag: "Breathwork", tagTone: "clay" },
  { time: "08:00", title: "Jungle Walk", meta: "Tomás V.", tag: "Movement", tagTone: "sage" },
  { time: "11:00", title: "Yoga Nidra", meta: "Studio A", tag: "Rest", tagTone: "sage" },
  { time: "19:00", title: "Dinner & Sharing", meta: "Open Fire Terrace", tag: "Sharing", tagTone: "clay" },
];

export const DEMO_MEALS_VISUAL_ITEMS: MealsVisualItem[] = [
  {
    mealType: "Breakfast",
    time: "07:30–09:30",
    name: "Garden Terrace Breakfast",
    location: "Garden Terrace",
    description: "Açaí bowls, fresh papaya, avocado on sourdough, green juices.",
  },
  {
    mealType: "Lunch",
    time: "13:00–14:00",
    name: "Lemongrass Broth Lunch",
    location: "Main Hall",
    description: "Lemongrass broth, nourish bowl, coconut water.",
    current: true,
  },
  {
    mealType: "Dinner",
    time: "19:00–20:30",
    name: "Open Fire Dinner",
    location: "Open Fire Terrace",
    description: "Roasted vegetables, wild rice, miso-glazed aubergine.",
  },
];

export const DEMO_TEAM_VISUAL_PEOPLE: TeamVisualPerson[] = [
  { initials: "MR", name: "Maya Rodriguez", role: "Lead Facilitator", color: "clay" },
  { initials: "TV", name: "Tomás Vargas", role: "Yoga & Breathwork", color: "forest" },
  { initials: "AM", name: "Asha Mehta", role: "Nutrition & Ayurveda", color: "clay-text" },
  { initials: "JL", name: "James Liu", role: "Integration Support", color: "forest" },
];

export const DEMO_TREATMENTS_VISUAL_ITEMS: TreatmentsVisualItem[] = [
  { name: "Abhyanga Massage", detail: "90 min · Warm oil, full body", booking: "Tomorrow · 14:00", tagTone: "clay" },
  { name: "Sound Bath", detail: "60 min · Group session", booking: "Wednesday · 17:00", tagTone: "sage" },
  { name: "Private Ceremony", detail: "120 min · Lead facilitator", booking: "Enroll for an additional treatment", tagTone: "sage" },
];
