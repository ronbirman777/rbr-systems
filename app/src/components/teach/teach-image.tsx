import type { CSSProperties } from "react";
import type { FocalPoint } from "@/lib/media/focalPoint";
import { BrandImage } from "@/components/shared/brand-image";

/**
 * Time to Teach's cover/crop image. The presentation behaviour now lives
 * in the shared BrandImage primitive (028B) so Flow can render media the
 * same way; this stays as the Teach-facing name every call site already
 * imports, and as the place a Teach-only default would go if one is ever
 * needed. Behaviour is unchanged for every existing call site: same
 * object-fit cover, same focal point, same branded fallback.
 */
export function TeachImage({
  src,
  focal,
  alt,
  className = "",
  style,
  fallback,
  fallbackLabel,
  priority,
  sizes,
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
  /** True only for an above-the-fold LCP candidate. */
  priority?: boolean;
  /** CSS `sizes`; supplying it turns on width-aware delivery. */
  sizes?: string;
}) {
  return (
    <BrandImage
      src={src}
      focal={focal}
      alt={alt}
      className={className}
      style={style}
      fallback={fallback}
      fallbackLabel={fallbackLabel}
      priority={priority}
      sizes={sizes}
    />
  );
}
