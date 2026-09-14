"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import type { SocialLink } from "@/lib/modules/socialLinks";
import { SOCIAL_PLATFORMS, SOCIAL_PLATFORM_LABEL } from "@/lib/modules/socialLinks";
import { SocialIcon } from "@/components/guest/social-icon";
import { GUEST_BASE_PALETTE } from "@/lib/theme/tokens";
import { STUDIO_INPUT_CLASS, StudioHeading, StudioIntro } from "./studio-ui";
import { saveStayConnected, type SaveStayConnectedState } from "./actions";
import { useRegisteredSave, type StudioSectionEditorProps } from "./studioSection";

const initialState: SaveStayConnectedState = { error: null };

export type StayConnectedStepProps = {
  tenantId: string;
  links: SocialLink[];
  setLinks: Dispatch<SetStateAction<SocialLink[]>>;
  onBack: () => void;
  onContinue: () => void;
} & StudioSectionEditorProps;

/**
 * Space-level social/contact links - module_settings singleton
 * (module_key="stayConnected"), an ordered array of {platform, url}.
 * Zero or more links, only configured ones ever render to guests. Same
 * shared platform vocabulary/icons as Facilitator social links.
 */
export function StayConnectedStep({ tenantId, links, setLinks, onBack, onContinue, onDirty, onSaved, registerSave }: StayConnectedStepProps) {
  const [state, setState] = useState<SaveStayConnectedState>(initialState);
  const [pending, setPending] = useState(false);

  function update(index: number, patch: Partial<SocialLink>) {
    onDirty();
    setLinks((items) => items.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= links.length) return;
    onDirty();
    setLinks((items) => {
      const next = [...items];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function handleAdd() {
    onDirty();
    const used = new Set(links.map((l) => l.platform));
    const next = SOCIAL_PLATFORMS.find((p) => !used.has(p)) ?? SOCIAL_PLATFORMS[0];
    setLinks((items) => [...items, { platform: next, url: "" }]);
  }

  function handleRemove(index: number) {
    onDirty();
    setLinks((items) => items.filter((_, i) => i !== index));
  }

  async function handleSave(): Promise<boolean> {
    const formData = new FormData();
    formData.set("tenantId", tenantId);
    formData.set("links", JSON.stringify(links.filter((l) => l.url.trim().length > 0)));
    setPending(true);
    const result = await saveStayConnected(initialState, formData);
    setPending(false);
    setState(result);
    // A failed save must NOT clear the guard - the edits are still
    // only in memory, so the section stays dirty and the Unsaved
    // Changes dialog keeps protecting them.
    if (result.error) return false;
    onSaved();
    return true;
  }

  useRegisteredSave(registerSave, handleSave);

  return (
    <div className="max-w-2xl">
      <StudioHeading>Stay Connected</StudioHeading>
      <StudioIntro>Add the platforms your guests can find you on. Only links with a URL are shown.</StudioIntro>

      <div className="space-y-3 mb-4">
        {links.map((link, i) => (
          <div
            key={i}
            className="flex items-center gap-2 sm:gap-3 rounded-2xl p-2.5 sm:p-3.5 border bg-white"
            style={{ borderColor: `${GUEST_BASE_PALETTE.sand}80` }}
          >
            {/* Reorder controls - fixed-width area, identical every row
                since its content (▲/▼) never varies by link. */}
            <div className="flex flex-col gap-0.5 shrink-0">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="text-[10px] disabled:opacity-20" style={{ color: GUEST_BASE_PALETTE.mist }}>
                ▲
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === links.length - 1} className="text-[10px] disabled:opacity-20" style={{ color: GUEST_BASE_PALETTE.mist }}>
                ▼
              </button>
            </div>

            {/* Platform icon - fixed-width area. */}
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(45,74,62,0.08)", color: GUEST_BASE_PALETTE.forest }}>
              <SocialIcon platform={link.platform} />
            </div>

            {/* Platform selector - fixed-width area, narrower on small
                viewports so the row's fixed-width controls plus the
                flexible URL field fit without overflow at 375-430px.
                Written as its own class string rather than appending a
                width onto STUDIO_INPUT_CLASS - that class bakes in
                `w-full`, and a second width utility appended after it
                (e.g. `w-36`) has no reliably-guaranteed precedence over
                it (both are equal-specificity Tailwind utilities), which
                was the actual root cause of the row-to-row width
                inconsistency. */}
            <select
              value={link.platform}
              onChange={(e) => update(i, { platform: e.target.value as SocialLink["platform"] })}
              className="shrink-0 w-[92px] sm:w-36 bg-white border border-[#D4C5A9]/70 rounded-xl px-2 sm:px-3.5 py-2.5 text-[13px] text-[#2D4A3E] outline-none focus:ring-2 focus:ring-[#2D4A3E]/15 focus:border-[#2D4A3E]/30 transition-all"
            >
              {SOCIAL_PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {SOCIAL_PLATFORM_LABEL[p]}
                </option>
              ))}
            </select>

            {/* URL field - the one genuinely flexible area. `min-w-0`
                overrides the flex item default automatic minimum size
                (content-based), which is what let a long URL value push
                the row wider than its container on some rows and not
                others; `flex-1` (flex-basis: 0%) is what actually
                governs its width, not the `w-full` it inherits from
                STUDIO_INPUT_CLASS. */}
            <input
              value={link.url}
              onChange={(e) => update(i, { url: e.target.value })}
              placeholder="https://..."
              className={`${STUDIO_INPUT_CLASS} flex-1 min-w-0`}
            />

            {/* Remove - fixed-width area; content is constant text, so
                intrinsic sizing is already identical across rows. */}
            <button
              type="button"
              onClick={() => handleRemove(i)}
              className="shrink-0 text-[11px] px-2 sm:px-2.5 py-1.5 rounded-lg border whitespace-nowrap"
              style={{ color: GUEST_BASE_PALETTE.mist, borderColor: `${GUEST_BASE_PALETTE.sand}80` }}
            >
              Remove
            </button>
          </div>
        ))}
        {links.length === 0 && (
          <p className="text-[13px]" style={{ color: GUEST_BASE_PALETTE.mist }}>
            No links yet.
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={handleAdd}
        disabled={links.length >= SOCIAL_PLATFORMS.length}
        className="w-full border-2 border-dashed rounded-2xl py-3 text-[12px] font-medium transition-all mb-4 disabled:opacity-40"
        style={{ borderColor: `${GUEST_BASE_PALETTE.sand}99`, color: GUEST_BASE_PALETTE.mist }}
      >
        + Add Link
      </button>

      {state.error && (
        <p className="text-sm text-red-700 mt-4" role="alert">
          {state.error}
        </p>
      )}

      <div className="mt-8 flex gap-3 items-center">
        <button type="button" onClick={onBack} className="rounded-full border border-idw-forest/20 text-idw-forest text-sm font-semibold uppercase tracking-wide px-6 py-3">
          Back
        </button>
        <button type="button" disabled={pending} onClick={handleSave} className="rounded-full bg-idw-forest text-idw-parchment text-sm font-semibold uppercase tracking-wide px-6 py-3 disabled:opacity-60">
          {pending ? "Saving…" : "Save Links"}
        </button>
        <button type="button" onClick={onContinue} className="text-xs font-semibold uppercase tracking-wide text-idw-forest/50 hover:text-idw-forest">
          Continue →
        </button>
      </div>
    </div>
  );
}
