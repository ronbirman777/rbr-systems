/**
 * Content (magic-byte) validation for images - TASK 032, migration 0045.
 *
 * Pure: no I/O. Every decision is made from the bytes themselves, never from
 * a file name, an extension, a declared MIME type or the Storage folder an
 * object sits in - those are all chosen by the uploader.
 *
 * Two questions, two functions:
 *
 *  - sniffImage(bytes): is this a real JPEG / PNG / WebP (the product's
 *    accepted upload formats, ALLOWED_IMAGE_TYPES in path.ts) with sane
 *    header dimensions? Used on the organizer's upload BEFORE it is handed to
 *    sharp, so audio, HTML, SVG (script-capable, and rasterised by librsvg if
 *    sharp were allowed to see it), GIF/AVIF/HEIC/TIFF and truncated headers
 *    are refused before any decoder runs. Trailing bytes after the image are
 *    tolerated here only because the upload is re-encoded anyway (sharp
 *    writes a brand-new WebP; nothing appended survives).
 *
 *  - isCanonicalStoredImage(bytes): is this a STORED object the trusted
 *    pipeline could have produced - a WebP whose RIFF length accounts for
 *    every byte of the file (no polyglot: an image with an MP3 appended,
 *    which an <audio> element would happily play, fails), with dimensions
 *    within the re-encode cap? Used by the service-role publish copy on
 *    billing-governed Spaces before a published image is allowed to stand.
 */
import { MAX_IMAGE_DIMENSION } from "./path";

export type SniffedImageFormat = "jpeg" | "png" | "webp";
export type SniffedImage = { format: SniffedImageFormat; width: number; height: number };

/**
 * Upper bound on a SOURCE image side. libvips cannot write a WebP wider than
 * 16383 px and sharp's default pixel limit is 16383^2; anything a header
 * claims beyond this is either hostile or unusable.
 */
export const MAX_SOURCE_IMAGE_DIMENSION = 16383;

const u16be = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
const u32be = (b: Uint8Array, o: number) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
const u16le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u24le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
const u32le = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + ((b[o + 3] << 24) >>> 0);
const ascii = (b: Uint8Array, o: number, s: string) => {
  if (o + s.length > b.length) return false;
  for (let i = 0; i < s.length; i++) if (b[o + i] !== s.charCodeAt(i)) return false;
  return true;
};

const saneSize = (w: number, h: number, max: number) =>
  Number.isInteger(w) && Number.isInteger(h) && w >= 1 && h >= 1 && w <= max && h <= max;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function sniffPng(b: Uint8Array): SniffedImage | null {
  // signature (8) + IHDR length (4) + "IHDR" (4) + width (4) + height (4) + depth/colour/... (5) + CRC (4)
  if (b.length < 33) return null;
  for (let i = 0; i < 8; i++) if (b[i] !== PNG_SIGNATURE[i]) return null;
  if (u32be(b, 8) !== 13 || !ascii(b, 12, "IHDR")) return null;
  return { format: "png", width: u32be(b, 16), height: u32be(b, 20) };
}

function sniffJpeg(b: Uint8Array): SniffedImage | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return null;
  let p = 2;
  // Walk the marker segments up to the first frame header (SOFn). Every
  // length is bounds-checked; a truncated or malformed header is refused.
  while (p + 4 <= b.length) {
    if (b[p] !== 0xff) return null;
    let m = b[p + 1];
    while (m === 0xff && p + 2 < b.length) {
      p++;
      m = b[p + 1];
    }
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
      p += 2; // standalone markers carry no length
      continue;
    }
    if (m === 0xd8 || m === 0xd9 || m === 0xda) return null; // SOI again / EOI / scan before any frame header
    if (p + 4 > b.length) return null;
    const len = u16be(b, p + 2);
    if (len < 2 || p + 2 + len > b.length) return null;
    const isSof = m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
    if (isSof) {
      if (len < 8) return null;
      return { format: "jpeg", width: u16be(b, p + 7), height: u16be(b, p + 5) };
    }
    p += 2 + len;
  }
  return null;
}

/** RIFF/WebP header parse. Returns the dimensions and the RIFF payload size. */
function parseWebp(b: Uint8Array): (SniffedImage & { riffSize: number }) | null {
  if (b.length < 30 || !ascii(b, 0, "RIFF") || !ascii(b, 8, "WEBP")) return null;
  const riffSize = u32le(b, 4);
  if (riffSize < 22) return null;
  if (ascii(b, 12, "VP8 ")) {
    // lossy: chunk header (8) + frame tag (3) + start code 9D 01 2A + 14-bit width/height
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return { format: "webp", width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff, riffSize };
  }
  if (ascii(b, 12, "VP8L")) {
    // lossless: signature byte 0x2F, then 14-bit (width-1) and (height-1)
    if (b[20] !== 0x2f) return null;
    const b1 = b[21], b2 = b[22], b3 = b[23], b4 = b[24];
    const width = 1 + (b1 | ((b2 & 0x3f) << 8));
    const height = 1 + ((b2 >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10));
    return { format: "webp", width, height, riffSize };
  }
  if (ascii(b, 12, "VP8X")) {
    // extended: 24-bit (canvas width-1) / (canvas height-1)
    return { format: "webp", width: 1 + u24le(b, 24), height: 1 + u24le(b, 27), riffSize };
  }
  return null;
}

/**
 * The image format and header dimensions of `bytes`, or null when the bytes
 * are not a JPEG, PNG or WebP with a complete, sane header. Nothing else is
 * accepted (no GIF, AVIF, HEIC, TIFF, BMP, SVG/HTML or any audio container).
 */
export function sniffImage(bytes: Uint8Array): SniffedImage | null {
  const found = sniffPng(bytes) ?? sniffJpeg(bytes) ?? parseWebp(bytes);
  if (!found) return null;
  if (!saneSize(found.width, found.height, MAX_SOURCE_IMAGE_DIMENSION)) return null;
  return { format: found.format, width: found.width, height: found.height };
}

/**
 * True only for bytes the trusted image pipeline can have written: a WebP
 * (the re-encode target, OPTIMIZED_IMAGE_MIME) whose RIFF size covers the
 * whole file exactly (one padding byte allowed), with dimensions inside
 * MAX_IMAGE_DIMENSION. Anything else stored under an image reference -
 * another format, a renamed audio file, an image with a payload appended - is
 * refused.
 */
export function isCanonicalStoredImage(bytes: Uint8Array): boolean {
  const webp = parseWebp(bytes);
  if (!webp) return false;
  const declared = webp.riffSize + 8;
  if (bytes.length !== declared && bytes.length !== declared + 1) return false;
  return saneSize(webp.width, webp.height, MAX_IMAGE_DIMENSION);
}
