import type { ReactNode } from "react";

/**
 * Shared Studio empty state: says what is missing and what to do next.
 * Used wherever a list/section has nothing in it yet.
 */
export function EmptyState({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div
      className="rounded-2xl border border-dashed border-[#D4C5A9] bg-white/60 px-6 py-8 text-center flex flex-col items-center gap-2"
      data-testid="studio-empty-state"
    >
      {icon ? <div className="text-[#9A7B4F]" aria-hidden="true">{icon}</div> : null}
      <p className="text-[15px] text-[#192B21]" style={{ fontFamily: "var(--font-fraunces), serif" }}>
        {title}
      </p>
      <p className="text-[12.5px] text-[#6F6C66] leading-relaxed max-w-[44ch]">{body}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
