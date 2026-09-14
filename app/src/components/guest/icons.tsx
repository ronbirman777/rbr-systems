/**
 * Time to Flow Visual Fidelity Phase 1 - the approved Guest App icon
 * language, transcribed exactly (same viewBox, same path data, same
 * stroke width) from the audited Figma Make source
 * (SunIcon/CalIcon/PeopleIcon/CompassIcon/ChevronLeft in that export's
 * App.tsx). Adapted in exactly one respect: color comes from this app's
 * existing CSS-custom-property theme mechanism (deriveThemeVars's
 * --rbr-navigation / --rbr-mist, inherited from an ancestor's inline style)
 * via `stroke="currentColor"` + inline `color`, not a Tailwind
 * text-forest/text-mist utility class - those classes don't exist in
 * this app's Tailwind theme, since tenant-facing colors are computed at
 * runtime per tenant, never compiled in. Geometry is untouched.
 *
 * Shared by GuestApp's bottom nav today; available for any future screen
 * that needs the same exact glyphs (e.g. Explore's card icons, Arrival's
 * pin/clock/phone icons) without re-deriving the paths again.
 */

type IconProps = { active?: boolean; className?: string };

function activeColor(active: boolean | undefined) {
  return active ? "var(--rbr-navigation)" : "var(--rbr-text-muted)";
}

export function TodayIcon({ active }: IconProps) {
  return (
    <svg
      className="w-[22px] h-[22px]"
      style={{ color: activeColor(active) }}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      viewBox="0 0 24 24"
    >
      <circle cx="12" cy="12" r="4" />
      <path
        strokeLinecap="round"
        d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
      />
    </svg>
  );
}

export function ScheduleIcon({ active }: IconProps) {
  return (
    <svg
      className="w-[22px] h-[22px]"
      style={{ color: activeColor(active) }}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      viewBox="0 0 24 24"
    >
      <rect x="3" y="4" width="18" height="18" rx="3" />
      <path strokeLinecap="round" d="M16 2v4M8 2v4M3 10h18" />
      <path strokeLinecap="round" d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
    </svg>
  );
}

export function TeamIcon({ active }: IconProps) {
  return (
    <svg
      className="w-[22px] h-[22px]"
      style={{ color: activeColor(active) }}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      viewBox="0 0 24 24"
    >
      <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

export function ExploreIcon({ active }: IconProps) {
  return (
    <svg
      className="w-[22px] h-[22px]"
      style={{ color: activeColor(active) }}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      viewBox="0 0 24 24"
    >
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z" />
    </svg>
  );
}

export function ChevronLeftIcon({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={`w-4 h-4 ${className}`} style={style} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

export function ChevronRightIcon({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={`w-4 h-4 ${className}`} style={style} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

type SmallIconProps = { className?: string; style?: React.CSSProperties };

export function PinIcon({ className = "", style }: SmallIconProps) {
  return (
    <svg className={`w-3 h-3 ${className}`} style={style} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z"
      />
      <circle cx="12" cy="11" r="2" />
    </svg>
  );
}

export function PersonIcon({ className = "", style }: SmallIconProps) {
  return (
    <svg className={`w-3 h-3 ${className}`} style={style} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}

export function ClockIcon({ className = "", style }: SmallIconProps) {
  return (
    <svg className={`w-3 h-3 ${className}`} style={style} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" d="M12 7v5l3 3" />
    </svg>
  );
}

/**
 * Product Completion phase - Stay Connected / Facilitator social icons.
 * Same minimal stroke-based language as every other icon in this file
 * (currentColor, 1.6-1.8 stroke), not literal brand marks - deliberately
 * simple glyphs standing in for each platform rather than reproducing
 * trademarked logos pixel-for-pixel.
 */
export function InstagramIcon({ className = "", style }: SmallIconProps) {
  return (
    <svg className={`w-4 h-4 ${className}`} style={style} fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function FacebookIcon({ className = "", style }: SmallIconProps) {
  return (
    <svg className={`w-4 h-4 ${className}`} style={style} fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 8.5h2.5V5H14c-2 0-3.5 1.5-3.5 3.5V11H8v3.5h2.5V21H14v-6.5h2.5l.5-3.5h-3V9c0-.4.1-.5.5-.5z" />
    </svg>
  );
}

export function YoutubeIcon({ className = "", style }: SmallIconProps) {
  return (
    <svg className={`w-4 h-4 ${className}`} style={style} fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
      <rect x="3" y="6" width="18" height="12" rx="3" />
      <path d="M10.5 9.5l5 2.5-5 2.5v-5z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function TiktokIcon({ className = "", style }: SmallIconProps) {
  return (
    <svg className={`w-4 h-4 ${className}`} style={style} fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 3v10.5a3.5 3.5 0 11-3.5-3.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 3c0 2.5 2 4.5 4.5 4.5" />
    </svg>
  );
}

export function LinkedinIcon({ className = "", style }: SmallIconProps) {
  return (
    <svg className={`w-4 h-4 ${className}`} style={style} fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8" cy="8.5" r="0.9" fill="currentColor" stroke="none" />
      <path strokeLinecap="round" d="M8 11v6M12 11v6M12 13.5c0-1.4 1-2.5 2.5-2.5S17 12.1 17 13.5V17" />
    </svg>
  );
}

export function WebsiteIcon({ className = "", style }: SmallIconProps) {
  return (
    <svg className={`w-4 h-4 ${className}`} style={style} fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" d="M3 12h18M12 3c2.5 2.5 3.8 6 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-6-3.8-9S9.5 5.5 12 3z" />
    </svg>
  );
}

export function QuestionIcon({ className = "", style }: SmallIconProps) {
  return (
    <svg className={`w-4 h-4 ${className}`} style={style} fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" d="M9.5 9.3a2.5 2.5 0 114.2 1.8c-.7.6-1.7 1-1.7 2.4" />
      <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function PagesIcon({ className = "", style }: SmallIconProps) {
  return (
    <svg className={`w-4 h-4 ${className}`} style={style} fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 3h7l4 4v14H7z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v4h4" />
      <path strokeLinecap="round" d="M9.5 13h5M9.5 16.5h5" />
    </svg>
  );
}
