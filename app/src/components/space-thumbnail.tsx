/**
 * The Space Image's one shared rendering surface - Manual QA Fixes phase.
 * Deliberately its own small component (not inlined into My Spaces' card
 * markup) so the same "real image, or a premium branded fallback, never a
 * broken/empty image" treatment can be reused as-is by the upcoming
 * Share / QR / "Featured on InnerDweS" surfaces, which all need the exact
 * same Space-identity thumbnail, not a redesigned one per surface.
 *
 * The fallback is InnerDweS's own fixed platform brand (not the tenant's
 * dynamic Guest App colors) - this renders in Studio/account chrome,
 * which has always been InnerDweS-branded, never tenant-themed (the
 * tenant's own color system is exclusively for their Guest App - see the
 * brand/platform token-architecture plan).
 */
export function SpaceThumbnail({
  imageUrl,
  alt,
  className = "",
}: {
  imageUrl: string | null;
  alt: string;
  className?: string;
}) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={imageUrl} alt={alt} className={`object-cover ${className}`} />
    );
  }
  return (
    <div
      className={`flex items-center justify-center ${className}`}
      style={{ background: "linear-gradient(160deg, #192B21, #3E5C4B)" }}
      aria-hidden="true"
      role="img"
      aria-label={alt}
    >
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#EBE1D5" strokeWidth="1.4">
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12.5l2.5 2.5L16 9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
