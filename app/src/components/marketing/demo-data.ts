import type { BrandConfig } from "@/lib/theme/tokens";
import type { PublicScheduleItem } from "@/lib/schedule/types";
import type { DisplayFacilitator } from "@/lib/modules/facilitator";
import type { DisplayMeal } from "@/lib/modules/meal";
import type { DisplayTreatment } from "@/lib/modules/treatment";
import type { ScheduleVisualDay, ScheduleVisualSession } from "./product-visuals/schedule-visual";

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
/**
 * Three retreat identities for "Your Retreat, Your Identity" - now built on
 * the same premium TodayVisual used everywhere else on this site (per
 * explicit direction: the simplified real TodayScreen undersold the
 * product here), varied along real, currently-supported theme axes only
 * (imagery/color-grade, card radius, spacing rhythm, accent color) - no
 * customization capability invented beyond what Time to Flow's theme
 * system actually has. atmosphereLabel/paletteLabel surface the real
 * ATMOSPHERES/PALETTES config labels so the differentiation is legible
 * even without reading the phone content closely.
 */
export const DEMO_IDENTITIES: {
  tenantName: string;
  guestName: string;
  intention: string;
  live: { category: string; title: string; time: string; facilitator: string; location: string };
  photoSrc: string;
  photoFilter: string;
  radius: "soft" | "sharp" | "generous";
  accent: "clay" | "sage" | "clay-text";
  atmosphereLabel: string;
  paletteLabel: string;
}[] = [
  {
    tenantName: "Samadhi Retreat",
    guestName: "Lucia",
    intention: "Warmth is a practice. Let the terrace hold you today.",
    live: { category: "Bodywork", title: "Abhyanga Massage", time: "14:00 · 90 min", facilitator: "Maya R.", location: "Treatment Room 2" },
    photoSrc: "/marketing/hero-pathway.jpg",
    photoFilter: "saturate(1.15) brightness(0.75) sepia(0.15) hue-rotate(-6deg)",
    radius: "generous",
    accent: "clay",
    atmosphereLabel: "Warm & Earthy",
    paletteLabel: "Warm Earth",
  },
  {
    tenantName: "Soma Sanctuary",
    guestName: "Anders",
    intention: "Stillness first. Everything else follows.",
    live: { category: "Sound", title: "Sound Healing", time: "10:00 · 60 min", facilitator: "Studio Team", location: "Sala" },
    photoSrc: "/marketing/problem-lotus.jpg",
    photoFilter: "saturate(0.7) brightness(0.65) contrast(1.05)",
    radius: "sharp",
    accent: "sage",
    atmosphereLabel: "Clean & Minimal",
    paletteLabel: "Deep Forest",
  },
  {
    tenantName: "Threshold",
    guestName: "Rowan",
    intention: "The highland air asks for nothing but your attention.",
    live: { category: "Movement", title: "Dawn Walk", time: "07:00 · 60 min", facilitator: "Trail Guide", location: "Glen Trail" },
    photoSrc: "/marketing/hero-pathway.jpg",
    photoFilter: "saturate(0.55) brightness(0.85) grayscale(0.25)",
    radius: "soft",
    accent: "clay-text",
    atmosphereLabel: "Calm & Organic",
    paletteLabel: "Soft Sand",
  },
];

/**
 * Content for the purpose-built marketing product-visuals (Hero, Flow
 * Showcase, Creator -> Guest, Retreat Identity) - see product-visuals/*.tsx
 * for why these exist instead of the real screen components. Matches the
 * supplied premium product reference screenshots' content/hierarchy.
 */
export const DEMO_TODAY_VISUAL: {
  guestName: string;
  dayLabel: string;
  intention: string;
  live: { category: string; title: string; time: string; facilitator: string; location: string };
  upNext: { title: string; time: string };
} = {
  guestName: "Maya",
  dayLabel: "Day 2 · Samadhi Retreat",
  intention: "Take your time today. There is nowhere else you need to be.",
  live: {
    category: "Yoga",
    title: "Morning Grounding",
    time: "06:30 · 20 min",
    facilitator: "Maya R.",
    location: "Yoga Shala",
  },
  upNext: { title: "Jungle Walk", time: "08:00" },
};

export const DEMO_SCHEDULE_VISUAL_DAYS: ScheduleVisualDay[] = [
  { label: "Mon", day: "11" },
  { label: "Tue", day: "12" },
  { label: "Wed", day: "13", selected: true, isToday: true },
  { label: "Thu", day: "14" },
  { label: "Fri", day: "15" },
  { label: "Sat", day: "16" },
];

export const DEMO_SCHEDULE_VISUAL_SESSIONS: ScheduleVisualSession[] = [
  { time: "06:30", title: "Sunrise Meditation", meta: "Maya R. · Meditation Deck", tag: "Meditation", state: "past" },
  { time: "08:30", title: "Morning Grounding", meta: "Maya R. · Yoga Shala", tag: "Yoga", state: "now" },
  { time: "11:00", title: "Breathwork & Pranayama", meta: "Maya R. · Yoga Shala", tag: "Breathwork", state: "upcoming" },
];

export const DEMO_MEALS_VISUAL: { category: string; name: string; time: string; location: string } = {
  category: "Lunch",
  name: "Garden Terrace Buffet",
  time: "13:00 – 14:00",
  location: "Garden Terrace",
};

export const DEMO_TEAM_VISUAL: { name: string; role: string; tags: string[]; bio: string } = {
  name: "Maya Rodriguez",
  role: "Yoga & Breathwork Facilitator",
  tags: ["Vinyasa Flow", "Pranayama", "Yin Yoga", "Breathwork"],
  bio: "Ten years teaching across Asia, blending vinyasa flow with pranayama practice.",
};

export const DEMO_TREATMENTS_VISUAL: { name: string; detail: string; booking: string } = {
  name: "Abhyanga Massage",
  detail: "90 min · Warm oil, full body",
  booking: "Tomorrow · 14:00",
};
