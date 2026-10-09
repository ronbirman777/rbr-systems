"use client";

import type { MouseEvent, ReactNode } from "react";
import { PendingNavLink } from "@/components/nav/pending-nav-link";
import { InnerDweSMark } from "@/components/brand/wordmark";

import { createTranslator, DEFAULT_LOCALE, type Locale } from "@/lib/i18n";
/**
 * Shared Studio top bar (desktop): back to My Spaces, Space name, product
 * badge, save status and the primary Publish action. Presentational only -
 * the caller owns navigation guards and save/publish behaviour, and passes
 * `publishPending` when its own publish is in flight so this button can
 * show that and refuse a second click.
 */
export function StudioTopBar({
  name,
  fallbackName,
  productBadge,
  saveStatus,
  onBeforeBack,
  onPublish,
  publishLabel,
  publishPending = false,
  publishFormId,
  trailing,
  backHref = "/space",
  backLabel,
  locale = DEFAULT_LOCALE,
}: {
  name: string;
  fallbackName: string;
  productBadge: string;
  saveStatus: ReactNode;
  /**
   * An unsaved-changes guard for the back control: receives `go`, and
   * navigates only if (and when) it calls it. Absent, the control just goes.
   */
  onBeforeBack?: (go: () => void) => void;
  /**
   * Receives the click. With `publishFormId` set the button is a real
   * submit, so a handler that wants to stop it (an unsaved-changes guard,
   * a publish already in flight) calls preventDefault.
   */
  onPublish: (event: MouseEvent<HTMLButtonElement>) => void;
  publishLabel?: string;
  /**
   * True while the publish this button triggered is in flight. The button
   * then shows a spinner and refuses further clicks - it is the only
   * protection against a double publish, because the action is dispatched
   * from here rather than from a form the browser would disable.
   */
  publishPending?: boolean;
  /**
   * The id of a form whose action publishes. When given, this button
   * SUBMITS that form rather than calling an action programmatically.
   * That is not a style preference: dispatching a Server Action outside a
   * form made Next navigate the route, show its loading.tsx and remount
   * the Studio - which discarded the pending state and the confirmation
   * the button had just set. A submit keeps the tree mounted.
   */
  publishFormId?: string;
  trailing?: ReactNode;
  backHref?: string;
  backLabel?: string;
  locale?: Locale;
}) {
  const { t } = createTranslator(locale);
  const back = (
    <>
      <InnerDweSMark size={20} />
      {backLabel ?? t("studio", "mySpaces")}
    </>
  );
  return (
    <header
      className="hidden lg:flex sticky top-0 z-30 h-16 shrink-0 items-center justify-between gap-3 px-6 bg-[#F3EFE7]/95 backdrop-blur border-b border-[#E2DACD]"
      data-testid="studio-top-bar"
    >
      <div className="flex items-center gap-3 min-w-0">
        <PendingNavLink
          href={backHref}
          beforeNavigate={onBeforeBack}
          pendingLabel={t("studio", "openingMySpaces")}
          testId="studio-back"
          className="gap-2 pe-3 text-[12.5px] font-medium text-[#192B21] hover:bg-[#192B21]/5"
        >
          {back}
        </PendingNavLink>
        <span className="text-[#8C8A84]">/</span>
        <span className="truncate text-[16px] italic text-[#192B21]" style={{ fontFamily: "var(--font-fraunces), serif" }}>
          {name || fallbackName}
        </span>
        <span className="px-2.5 py-1 rounded-full bg-[#F1E9DC] text-[10px] font-semibold tracking-[0.12em] text-[#9A7B4F] uppercase">
          {productBadge}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[12px] text-[#8C8A84]" role="status" aria-live="polite">
          {saveStatus}
        </span>
        {trailing}
        <button
          type={publishFormId ? "submit" : "button"}
          form={publishFormId}
          onClick={onPublish}
          disabled={publishPending}
          aria-busy={publishPending || undefined}
          className="min-h-10 px-4 rounded-full bg-[#192B21] text-white text-[12.5px] font-semibold disabled:opacity-60 inline-flex items-center gap-2"
        >
          {publishPending ? (
            <span
              className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin shrink-0"
              aria-hidden="true"
            />
          ) : null}
          {publishLabel ?? t("studio", "publish")}
        </button>
      </div>
    </header>
  );
}
