import type { SVGProps } from "react";

/** Line icons for Time to Teach (24px grid, 1.7 stroke, currentColor). */
const PATHS = {
  home: "M3 10.5 12 3l9 7.5M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5",
  calendar: "M3 7a2.5 2.5 0 0 1 2.5-2.5h13A2.5 2.5 0 0 1 21 7v12a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 19zM16 2.5v4M8 2.5v4M3 10h18",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1.5-4 4.5-6 8-6s6.5 2 8 6",
  compass: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm3.5-12.5-2 5-5 2 2-5z",
  chevronDown: "m6 9 6 6 6-6",
  chevronLeft: "m15 18-6-6 6-6",
  chevronRight: "m9 18 6-6-6-6",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  pin: "M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  users: "M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c1-3.5 3.5-5.5 6.5-5.5s5.5 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c2 .6 3.2 2.5 3.8 5.5",
  tag: "M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9zM7.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
  chat: "M4 20.5 5.3 16.3A8.5 8.5 0 1 1 8 19zM9 10.5c.5 2 2 3.5 4.5 4.5",
  mail: "M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm-2 2 9 6 9-6",
  phone: "M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z",
  instagram: "M8 3h8a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V8a5 5 0 0 1 5-5zm4 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm5.5-9.5h.01",
  facebook: "M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8z",
  youtube: "M6.5 5.5h11a4 4 0 0 1 4 4v5a4 4 0 0 1-4 4h-11a4 4 0 0 1-4-4v-5a4 4 0 0 1 4-4zm3.5 4 5 2.5-5 2.5z",
  tiktok: "M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5M14 3c.5 2.5 2.5 4.5 5 4.5",
  linkedin: "M4 9h3.5v11H4zM5.75 4a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5zM10.5 9H14v1.6c.6-1 1.8-1.8 3.4-1.8 3 0 3.6 2 3.6 4.5V20h-3.5v-5.8c0-1.4-.3-2.6-1.8-2.6s-1.9 1.1-1.9 2.5V20h-3.3z",
  telegram: "m21 4-18 7.5 6 2 2 6.5 3.5-4.5 5 3.5z",
  map: "m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14",
  external: "M7 17 17 7M8 7h9v9",
  leaf: "M5 19c0-8 5-14 15-14 0 10-6 15-14 15M5 19 13 11",
  award: "M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zm-3.5-1-1.5 7 5-3 5 3-1.5-7",
  book: "M3 5.5C5.5 4 9 4 12 6c3-2 6.5-2 9-.5V19c-2.5-1.5-6-1.5-9 .5-3-2-6.5-2-9-.5zM12 6v13.5",
  headphones: "M4 18v-6a8 8 0 0 1 16 0v6M4.5 14h2a1.5 1.5 0 0 1 1.5 1.5v4A1.5 1.5 0 0 1 6.5 21h-1A1.5 1.5 0 0 1 4 19.5zm13 0h2a.5.5 0 0 1 .5.5v5a1.5 1.5 0 0 1-1.5 1.5h-1a1.5 1.5 0 0 1-1.5-1.5v-4a1.5 1.5 0 0 1 1.5-1.5z",
  page: "M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6",
  back15: "M4 12a8 8 0 1 0 2.5-5.8M4 4v4h4",
  forward15: "M20 12a8 8 0 1 1-2.5-5.8M20 4v4h-4",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  sparkle: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6",
} as const;

export type TeachIconName = keyof typeof PATHS | "play" | "pause";

export function TeachIcon({ name, size = 18, strokeWidth = 1.7, ...rest }: { name: TeachIconName; size?: number; strokeWidth?: number } & SVGProps<SVGSVGElement>) {
  if (name === "play") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...rest}>
        <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
      </svg>
    );
  }
  if (name === "pause") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...rest}>
        <rect x="6.5" y="5" width="3.6" height="14" rx="1.2" fill="currentColor" />
        <rect x="13.9" y="5" width="3.6" height="14" rx="1.2" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
