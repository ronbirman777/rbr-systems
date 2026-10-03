"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

/**
 * Submit button for the Time to Teach card. Disabled for as long as the create
 * action (and the redirect into the Studio that follows it) is in flight, so a
 * second click cannot start a second create. `aria-disabled` + `disabled` also
 * keep keyboard Enter/Space from re-submitting.
 */
export function CreateTeachSubmit({
  children,
  idleLabel,
  pendingLabel,
  className,
  style,
}: {
  children?: ReactNode;
  idleLabel: string;
  pendingLabel: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      data-testid="create-teach"
      disabled={pending}
      aria-disabled={pending}
      aria-busy={pending}
      data-pending={pending ? "true" : undefined}
      className={`${className ?? ""} ${pending ? "cursor-progress opacity-70" : ""}`.trim()}
      style={style}
    >
      {children}
      <span className="inline-block mt-6 text-xs font-semibold uppercase tracking-wide text-idw-forest/50 group-hover:text-idw-forest transition-colors">
        {pending ? pendingLabel : idleLabel}
      </span>
    </button>
  );
}
