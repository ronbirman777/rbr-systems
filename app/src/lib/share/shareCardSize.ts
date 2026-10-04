/**
 * Card dimensions, kept free of any server-only/next-og import so metadata
 * (which only needs og:image:width/height) can read them without pulling
 * the image renderer into that path.
 *
 *   og    square link preview - WhatsApp and most social clients show a
 *         1:1 card at a usable size without cropping the teacher's face.
 *   card  4:5 portrait - the downloadable Share Card, sized for messaging,
 *         email and light printing.
 */
export const OG_SIZE = { width: 1200, height: 1200 } as const;
export const SHARE_CARD_SIZE = { width: 1080, height: 1350 } as const;

export type ShareCardVariant = "og" | "card";
