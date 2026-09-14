"use client";

import { useActionState, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ClipboardEvent } from "react";
import { useRouter } from "next/navigation";
import { GUEST_BASE_PALETTE } from "@/lib/theme/tokens";
import { verifyGuestCode, verifyGuestCodeInitialState, type VerifyGuestCodeState } from "@/lib/guestAccess/verifyAction";

export type GuestAccessScreenProps = {
  tenantId: string;
  name: string;
  heroImageUrl: string | null;
  logoUrl: string | null;
  vars: CSSProperties;
};

const DIGIT_COUNT = 6;

/**
 * The premium protected-Space entry screen (Distribution phase, Guest
 * Access §8) - shown instead of the Guest App itself whenever a Space
 * is in "code" mode and this browser has no valid cookie yet. Uses the
 * exact same published-safe hero/logo/theme identity the real Guest App
 * renders with (extractPublishedGuestIdentity), so this reads as part
 * of the same product, not a generic auth wall.
 *
 * Error states are deliberately uninformative beyond "that didn't
 * work" or "too many attempts" - verifyGuestCode (the trusted Server
 * Action this calls) never returns which digit was wrong, a hash, or
 * an attempt count, and this component has no way to display
 * information it was never given.
 */
export function GuestAccessScreen({ tenantId, name, heroImageUrl, logoUrl, vars }: GuestAccessScreenProps) {
  const router = useRouter();
  const boundAction = verifyGuestCode.bind(null, tenantId);
  const [state, formAction, pending] = useActionState<VerifyGuestCodeState, FormData>(boundAction, verifyGuestCodeInitialState);
  const [digits, setDigits] = useState<string[]>(Array(DIGIT_COUNT).fill(""));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    // The cookie was just set server-side inside verifyGuestCode - the
    // page component that renders THIS screen decides code-screen-vs-
    // real-Guest-App at request time, so a refresh is what lets the
    // server re-evaluate with the new cookie now present, without a
    // full navigation or exposing the URL/QR to a second address.
    if (state.success) router.refresh();
  }, [state.success, router]);

  const code = digits.join("");
  const isComplete = code.length === DIGIT_COUNT;

  function setDigitAt(index: number, value: string) {
    setDigits((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  function handleChange(index: number, raw: string) {
    const value = raw.replace(/\D/g, "").slice(-1);
    setDigitAt(index, value);
    if (value && index < DIGIT_COUNT - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
      setDigitAt(index - 1, "");
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < DIGIT_COUNT - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, DIGIT_COUNT);
    if (!pasted) return;
    e.preventDefault();
    const next = Array(DIGIT_COUNT).fill("");
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setDigits(next);
    const focusIndex = Math.min(pasted.length, DIGIT_COUNT - 1);
    inputRefs.current[focusIndex]?.focus();
  }

  return (
    <main style={{ ...vars, background: "var(--rbr-parchment-deep)" }} className="flex-1 flex items-center justify-center sm:p-6 p-0">
      <div
        className="relative flex flex-col overflow-hidden sm:rounded-[44px] w-full sm:w-[390px] sm:h-[780px] h-full"
        style={{ background: "var(--rbr-background)", boxShadow: "0 40px 100px rgba(45,74,62,0.2), 0 10px 30px rgba(45,74,62,0.1)" }}
      >
        {/* Identity hero - same treatment as the real Today hero (photo
            or gradient fallback + directional overlay), so this screen
            reads as belonging to the retreat, not as a generic gate. */}
        <div className="relative h-[220px] shrink-0">
          {heroImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={heroImageUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full" style={{ background: "linear-gradient(135deg, var(--rbr-primary), var(--rbr-forest-mid))" }} />
          )}
          <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.35), rgba(0,0,0,0.2), rgba(0,0,0,0.7))" }} />
          <div className="absolute top-0 left-0 right-0 px-6 pt-4 flex items-center gap-2">
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-6 w-auto max-w-[88px] object-contain shrink-0" />
            )}
            <span className="text-white/60 text-[10px] tracking-[0.22em] font-medium uppercase" style={{ fontFamily: "var(--rbr-font-ui)" }}>
              {name}
            </span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 px-6 pb-5">
            <p className="text-white/70 text-[10px] tracking-[0.2em] uppercase font-medium mb-1" style={{ fontFamily: "var(--rbr-font-ui)" }}>
              Private Retreat
            </p>
            <h1 className="text-white text-[1.9rem] leading-[1.1] font-normal" style={{ fontFamily: "var(--rbr-font-display)" }}>
              {name}
            </h1>
          </div>
        </div>

        <form action={formAction} className="flex-1 flex flex-col px-6 pt-8 pb-8">
          <p className="text-[15px] leading-relaxed mb-6" style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-text)" }}>
            Enter your 6-digit access code
          </p>

          <input type="hidden" name="code" value={code} />
          <div className="flex justify-center gap-2.5" role="group" aria-label="6-digit access code">
            {digits.map((digit, i) => (
              <input
                key={i}
                ref={(el) => {
                  inputRefs.current[i] = el;
                }}
                type="text"
                inputMode="numeric"
                autoComplete={i === 0 ? "one-time-code" : "off"}
                pattern="[0-9]*"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                onPaste={handlePaste}
                aria-label={`Digit ${i + 1} of 6`}
                disabled={pending}
                className="w-11 h-14 text-center text-[22px] rounded-xl border outline-none transition-colors disabled:opacity-50"
                style={{
                  borderColor: state.error ? "#B23B3B" : "color-mix(in srgb, var(--rbr-sand) 70%, transparent)",
                  color: "var(--rbr-text)",
                  background: "var(--rbr-cream)",
                  fontFamily: "var(--rbr-font-ui)",
                }}
              />
            ))}
          </div>

          {state.error && (
            <p role="alert" className="text-[13px] mt-4 text-center" style={{ color: "#B23B3B", fontFamily: "var(--rbr-font-ui)" }}>
              {state.error}
            </p>
          )}

          <div className="flex-1" />

          <button
            type="submit"
            disabled={!isComplete || pending}
            className="w-full rounded-2xl py-3.5 text-sm font-semibold disabled:opacity-50 transition-opacity"
            style={{ background: "var(--rbr-primary)", color: "var(--rbr-on-primary)", fontFamily: "var(--rbr-font-ui)" }}
          >
            {pending ? "Checking…" : "Open Retreat"}
          </button>
          <p className="text-center text-[11px] mt-4" style={{ color: GUEST_BASE_PALETTE.mist, fontFamily: "var(--rbr-font-ui)" }}>
            Ask your retreat organizer for the access code.
          </p>
        </form>
      </div>
    </main>
  );
}
