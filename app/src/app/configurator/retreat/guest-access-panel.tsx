"use client";

import { useActionState, useState } from "react";
import { GUEST_BASE_PALETTE } from "@/lib/theme/tokens";
import { STUDIO_INPUT_CLASS } from "./studio-ui";
import {
  setGuestAccessCode,
  disableGuestAccessCode,
  type GuestAccessSettings,
  type SetGuestAccessCodeState,
  type DisableGuestAccessCodeState,
} from "./guestAccessActions";

export type GuestAccessPanelProps = {
  tenantId: string;
  initialSettings: GuestAccessSettings;
};

function randomSixDigitCode(): string {
  // crypto.getRandomValues, not Math.random - this value becomes the
  // organizer's real access code, so it should come from the same
  // quality of randomness as anything else security-relevant, even
  // though it's a client-side convenience (the organizer could type any
  // 6 digits themselves either way - this just saves them from picking
  // something guessable like their own birthday).
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  const n = bytes[0] % 1_000_000;
  return n.toString().padStart(6, "0");
}

/**
 * Distribution phase - Guest Access. Placed inside Share Your Space
 * (the "who can open this link" question belongs right next to the
 * link itself). Never displays the stored bcrypt hash, and never
 * re-displays a previously-saved code after a reload - only the code
 * the organizer JUST set/generated in this same browser session, held
 * in local state, never re-derived from the database (which only ever
 * stores the hash).
 */
export function GuestAccessPanel({ tenantId, initialSettings }: GuestAccessPanelProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [codeInput, setCodeInput] = useState("");
  const [revealedCode, setRevealedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const setInitial: SetGuestAccessCodeState = { error: null, settings: initialSettings };
  const disableInitial: DisableGuestAccessCodeState = { error: null, settings: initialSettings };

  const [setState, setFormAction, setPending] = useActionState(async (prev: SetGuestAccessCodeState, fd: FormData) => {
    const result = await setGuestAccessCode(prev, fd);
    if (!result.error) {
      setSettings(result.settings);
      setRevealedCode(String(fd.get("code") ?? ""));
    }
    return result;
  }, setInitial);

  const [disableState, disableFormAction, disablePending] = useActionState(
    async (prev: DisableGuestAccessCodeState, fd: FormData) => {
      const result = await disableGuestAccessCode(prev, fd);
      if (!result.error) {
        setSettings(result.settings);
        setRevealedCode(null);
        setCodeInput("");
      }
      return result;
    },
    disableInitial
  );

  const wantsCode = settings.mode === "code";

  function selectMode(next: "public" | "code") {
    if (next === "public") {
      // Switching the visible toggle to "public" doesn't itself disable
      // protection - only the explicit Disable Code action (below) does,
      // via its own real Server Action - this just controls which panel
      // is showing so the organizer can review before confirming.
      setSettings((s) => ({ ...s, mode: "public" }));
    } else {
      setSettings((s) => ({ ...s, mode: "code" }));
    }
  }

  async function handleCopy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable - the code is still visibly selectable text.
    }
  }

  return (
    <div className="mt-6 rounded-2xl border p-5" style={{ borderColor: "rgba(45,74,62,0.12)" }}>
      <div className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: GUEST_BASE_PALETTE.mist }}>
        Guest Access
      </div>
      <p className="text-[13px] leading-relaxed mb-4" style={{ color: GUEST_BASE_PALETTE.dusk }}>
        Choose who can open your Guest App with the link above.
      </p>

      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => selectMode("public")}
          className="flex-1 text-[12px] font-medium px-3 py-2.5 rounded-xl border transition-colors"
          style={
            !wantsCode
              ? { background: GUEST_BASE_PALETTE.forest, color: "white", borderColor: GUEST_BASE_PALETTE.forest }
              : { color: GUEST_BASE_PALETTE.forest, borderColor: "rgba(45,74,62,0.2)" }
          }
        >
          Anyone with the link
        </button>
        <button
          type="button"
          onClick={() => selectMode("code")}
          className="flex-1 text-[12px] font-medium px-3 py-2.5 rounded-xl border transition-colors"
          style={
            wantsCode
              ? { background: GUEST_BASE_PALETTE.forest, color: "white", borderColor: GUEST_BASE_PALETTE.forest }
              : { color: GUEST_BASE_PALETTE.forest, borderColor: "rgba(45,74,62,0.2)" }
          }
        >
          Require a 6-digit code
        </button>
      </div>

      {!wantsCode && settings.hasCode === false && (
        <p className="text-[12px]" style={{ color: GUEST_BASE_PALETTE.mist }}>
          Guests can open your app with just the link - no code required.
        </p>
      )}

      {wantsCode && (
        <div className="rounded-xl p-4" style={{ background: GUEST_BASE_PALETTE.parchmentDeep }}>
          {settings.hasCode && !revealedCode ? (
            <>
              <p className="text-[12px] mb-3" style={{ color: GUEST_BASE_PALETTE.forest }}>
                A code is set. It isn&apos;t stored in a form we can show you again - generate a new one if guests need it.
              </p>
              <div className="flex gap-2">
                <input
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  placeholder="New 6-digit code"
                  className={STUDIO_INPUT_CLASS}
                />
                <button
                  type="button"
                  onClick={() => setCodeInput(randomSixDigitCode())}
                  className="shrink-0 text-[11px] font-medium px-3 py-1.5 rounded-full border"
                  style={{ color: GUEST_BASE_PALETTE.forest, borderColor: "rgba(45,74,62,0.2)" }}
                >
                  Generate
                </button>
              </div>
              <form action={setFormAction} className="mt-3">
                <input type="hidden" name="tenantId" value={tenantId} />
                <input type="hidden" name="code" value={codeInput} />
                <button
                  type="submit"
                  disabled={codeInput.length !== 6 || setPending}
                  className="text-[12px] font-semibold px-4 py-2 rounded-full disabled:opacity-50"
                  style={{ background: GUEST_BASE_PALETTE.forest, color: "white" }}
                >
                  {setPending ? "Saving…" : "Change Code"}
                </button>
              </form>
            </>
          ) : revealedCode ? (
            <>
              <p className="text-[12px] mb-2" style={{ color: GUEST_BASE_PALETTE.forest }}>
                Your access code - copy it now, it won&apos;t be shown again:
              </p>
              <div className="flex items-center gap-2">
                <span className="text-[22px] font-semibold tracking-[0.2em]" style={{ color: GUEST_BASE_PALETTE.forest }}>
                  {revealedCode}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(revealedCode)}
                  className="text-[11px] font-medium px-3 py-1.5 rounded-full border"
                  style={{ color: GUEST_BASE_PALETTE.forest, borderColor: "rgba(45,74,62,0.2)" }}
                >
                  {copied ? "Copied!" : "Copy Code"}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-[12px] mb-3" style={{ color: GUEST_BASE_PALETTE.dusk }}>
                Choose a 6-digit code, or generate one.
              </p>
              <div className="flex gap-2">
                <input
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  placeholder="6-digit code"
                  className={STUDIO_INPUT_CLASS}
                />
                <button
                  type="button"
                  onClick={() => setCodeInput(randomSixDigitCode())}
                  className="shrink-0 text-[11px] font-medium px-3 py-1.5 rounded-full border"
                  style={{ color: GUEST_BASE_PALETTE.forest, borderColor: "rgba(45,74,62,0.2)" }}
                >
                  Generate
                </button>
              </div>
              <form action={setFormAction} className="mt-3">
                <input type="hidden" name="tenantId" value={tenantId} />
                <input type="hidden" name="code" value={codeInput} />
                <button
                  type="submit"
                  disabled={codeInput.length !== 6 || setPending}
                  className="text-[12px] font-semibold px-4 py-2 rounded-full disabled:opacity-50"
                  style={{ background: GUEST_BASE_PALETTE.forest, color: "white" }}
                >
                  {setPending ? "Saving…" : "Enable Code"}
                </button>
              </form>
            </>
          )}

          {setState.error && (
            <p className="text-[12px] mt-2 text-red-700" role="alert">
              {setState.error}
            </p>
          )}

          {settings.hasCode && (
            <form action={disableFormAction} className="mt-3">
              <input type="hidden" name="tenantId" value={tenantId} />
              <button
                type="submit"
                disabled={disablePending}
                className="text-[11px] font-medium disabled:opacity-50"
                style={{ color: GUEST_BASE_PALETTE.mist }}
              >
                {disablePending ? "Disabling…" : "Disable Code - make Space public again"}
              </button>
            </form>
          )}
          {disableState.error && (
            <p className="text-[12px] mt-2 text-red-700" role="alert">
              {disableState.error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
