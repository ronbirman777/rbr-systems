/* eslint-disable @next/next/no-img-element */
import type { CSSProperties } from "react";
import { focalPointToObjectPosition, type FocalPoint } from "@/lib/media/focalPoint";

/**
 * Every Time to Teach cover/crop image renders through this: object-fit
 * cover + the shared focal point as object-position, so the teacher's chosen
 * subject stays in frame at every aspect ratio. With no image it renders an
 * intentional fallback surface (never a broken image).
 */
export function TeachImage({
  src,
  focal,
  alt,
  className = "",
  style,
  fallback,
  fallbackLabel,
}: {
  src: string | null | undefined;
  focal?: FocalPoint | null;
  alt: string;
  className?: string;
  style?: CSSProperties;
  /** CSS background for the no-image state. */
  fallback?: string;
  /** Optional large initial shown on the fallback surface. */
  fallbackLabel?: string | null;
}) {
  if (!src) {
    return (
      <div
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
        className={`relative overflow-hidden flex items-center justify-center ${className}`}
        style={{ background: fallback ?? "linear-gradient(150deg, var(--rbr-primary-soft), var(--rbr-secondary-soft))", ...style }}
      >
        {fallbackLabel ? (
          <span
            aria-hidden="true"
            style={{ fontFamily: "var(--tt-font-display)", color: "var(--rbr-primary)", opacity: 0.55 }}
            className="text-3xl"
          >
            {fallbackLabel.slice(0, 1).toUpperCase()}
          </span>
        ) : null}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={`object-cover tt-fade-in ${className}`}
      style={{ objectPosition: focalPointToObjectPosition(focal), ...style }}
    />
  );
}
