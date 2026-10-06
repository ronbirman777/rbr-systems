"use client";

import { gradeBrandRoles, type RolePairReport } from "@/lib/brand/accessibility";

import { createTranslator, DEFAULT_LOCALE, type Locale } from "@/lib/i18n";
/**
 * Live contrast feedback for the Brand step, shared by Flow and Teach.
 *
 * Three deliberate properties:
 *
 *   1. It reports, it never blocks. There is no publish gate here and no
 *      caller may add one: a Space whose heading lands at 4.2:1 is still
 *      a Space its owner must be able to publish. The feedback exists so
 *      the choice is informed, not so the product overrides it.
 *   2. It grades REAL pairs - the colour against the thing it is actually
 *      drawn on - rather than comparing two swatches to produce a number
 *      that means nothing.
 *   3. It never suggests changing a stored colour. Where a pair is weak
 *      the Guest App already substitutes an accessible foreground
 *      (lib/brand/accessibility), so the message explains what the app
 *      will do, instead of asking the organizer to abandon their colour.
 */

/**
 * The three graded roles, named in the reader's language. The grading data
 * (lib/brand/accessibility.ts) is shared with tests that pin its English
 * labels, so the label is translated here at the render site.
 */
const ROLE_LABEL: Record<RolePairReport["role"], "contrastRoleText" | "contrastRolePrimary" | "contrastRoleNavigation"> = {
  text: "contrastRoleText",
  primary: "contrastRolePrimary",
  navigation: "contrastRoleNavigation",
  // Accent and surface are never graded (see gradeBrandRoles); these
  // entries exist only to keep the map total.
  accent: "contrastRoleText",
  surface: "contrastRoleText",
};

const TONE: Record<RolePairReport["grade"], { dot: string; text: string; prefix: string }> = {
  pass: { dot: "#4E7A5B", text: "#4E7A5B", prefix: "✓" },
  warn: { dot: "#A8643C", text: "#A8643C", prefix: "!" },
  fail: { dot: "#8F3B3B", text: "#8F3B3B", prefix: "!" },
};

function messageKey(report: RolePairReport) {
  if (report.grade === "pass") return "contrastClear" as const;
  if (report.grade === "warn") {
    return report.level === "normalText" ? ("contrastHeadingsOnly" as const) : ("contrastUsable" as const);
  }
  return "contrastTooLow" as const;
}

export function BrandContrastFeedback({
  primary,
  accent,
  navigation,
  text,
  surface,
  className = "",
  locale = DEFAULT_LOCALE,
}: {
  primary: string;
  accent: string;
  navigation: string;
  text: string;
  surface: string;
  className?: string;
  locale?: Locale;
}) {
  const { t } = createTranslator(locale);
  const reports = gradeBrandRoles({ primary, accent, navigation, text, surface });

  return (
    <div className={`flex flex-col gap-2 ${className}`} data-testid="brand-contrast-feedback">
      <p className="text-[10.5px] tracking-[0.14em] uppercase font-semibold text-[#8C8A84]">{t("studio", "readability")}</p>
      <ul className="flex flex-col gap-1.5">
        {reports.map((report) => {
          const tone = TONE[report.grade];
          return (
            <li key={report.role} className="flex items-start gap-2 text-[12px]" data-grade={report.grade} data-role={report.role}>
              <span aria-hidden="true" className="mt-[5px] h-2 w-2 shrink-0 rounded-full" style={{ background: tone.dot }} />
              <span className="min-w-0">
                <span className="text-[#232926]">{t("studio", ROLE_LABEL[report.role])}</span>
                <span className="text-[#8C8A84]"> — {report.displayRatio}</span>
                <span style={{ color: tone.text }}>
                  {" "}
                  {tone.prefix} {t("studio", messageKey(report))}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-[11.5px] text-[#8C8A84] max-w-[56ch]">
        {t("studio", "contrastPolicy")}
      </p>
    </div>
  );
}
