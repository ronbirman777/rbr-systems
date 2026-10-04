import { STUDIO_STATUS_LABEL, type StudioPublishState } from "@/lib/studio/status";

/** Draft / Published pill - the same wording in every Studio. */
export function StatusPill({ state, label }: { state: StudioPublishState; label?: string }) {
  const published = state === "published";
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide ${
        published ? "bg-[#E4EEE4] text-[#2D4A3E]" : "bg-[#F1E9DC] text-[#9A7B4F]"
      }`}
      data-testid="studio-status-pill"
      data-state={state}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${published ? "bg-[#6B9478]" : "bg-[#C4A36A]"}`} aria-hidden="true" />
      {label ?? STUDIO_STATUS_LABEL[state]}
    </span>
  );
}
