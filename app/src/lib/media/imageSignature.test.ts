import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { MAX_SOURCE_IMAGE_DIMENSION, isCanonicalStoredImage, sniffImage } from "./imageSignature";

/**
 * TASK 032 (0045) - content validation from the bytes. Real images are
 * produced by sharp (the same library the upload path uses); hostile inputs
 * are synthesized byte for byte. No file name, extension or declared type is
 * ever an input to these functions.
 */

const solid = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 120, g: 80, b: 40 } } });
const real = {
  jpeg: () => solid(40, 30).jpeg().toBuffer(),
  png: () => solid(40, 30).png().toBuffer(),
  webpLossy: () => solid(40, 30).webp({ quality: 82 }).toBuffer(),
  webpLossless: () => solid(40, 30).webp({ lossless: true }).toBuffer(),
  webpAlpha: () => sharp({ create: { width: 40, height: 30, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 0.5 } } }).webp().toBuffer(),
  gif: () => solid(40, 30).gif().toBuffer(),
};

const bytes = (...parts: (number[] | string | Uint8Array)[]) =>
  Uint8Array.from(parts.flatMap((p) => (typeof p === "string" ? [...Buffer.from(p, "latin1")] : [...p])));

// Audio containers and hostile documents, as an attacker would name them "photo.jpg".
const MP3_ID3 = bytes("ID3", [4, 0, 0, 0, 0, 0, 0x21], new Uint8Array(40), [0xff, 0xfb, 0x90, 0x64], new Uint8Array(400));
const MP3_FRAMES = bytes([0xff, 0xfb, 0x90, 0x64], new Uint8Array(413), [0xff, 0xfb, 0x90, 0x64], new Uint8Array(413));
const WAV = bytes("RIFF", [0x24, 0x08, 0, 0], "WAVEfmt ", [16, 0, 0, 0, 1, 0, 1, 0, 0x44, 0xac, 0, 0, 0x88, 0x58, 1, 0, 2, 0, 16, 0], "data", [0, 8, 0, 0], new Uint8Array(2048));
const OGG = bytes("OggS", [0, 2], new Uint8Array(22), [1, 0x1e, 1], "vorbis", new Uint8Array(64));
const M4A = bytes([0, 0, 0, 0x20], "ftypM4A ", [0, 0, 2, 0], "M4A mp42isom", new Uint8Array(8), [0, 0, 0, 8], "mdat");
const AVIF = bytes([0, 0, 0, 0x1c], "ftypavif", [0, 0, 0, 0], "avifmif1miaf", new Uint8Array(32));
const HEIC = bytes([0, 0, 0, 0x18], "ftypheic", [0, 0, 0, 0], "mif1heic", new Uint8Array(32));
const HTML = bytes("<!doctype html><html><body><script>alert(1)</script></body></html>");
const SVG = bytes('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>');
const SVG_BOM = bytes([0xef, 0xbb, 0xbf], '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><script>x()</script></svg>');

describe("sniffImage - accepts the product's upload formats from their bytes", () => {
  it("real JPEG, PNG and WebP (lossy, lossless, alpha/VP8X) are recognised with their true dimensions", async () => {
    expect(sniffImage(await real.jpeg())).toEqual({ format: "jpeg", width: 40, height: 30 });
    expect(sniffImage(await real.png())).toEqual({ format: "png", width: 40, height: 30 });
    expect(sniffImage(await real.webpLossy())).toEqual({ format: "webp", width: 40, height: 30 });
    expect(sniffImage(await real.webpLossless())).toEqual({ format: "webp", width: 40, height: 30 });
    expect(sniffImage(await real.webpAlpha())).toEqual({ format: "webp", width: 40, height: 30 });
  });

  it("a JPEG whose frame header follows other segments (EXIF/APPn, DQT, fill bytes) is still found", async () => {
    const withExif = await solid(12, 9).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    expect(sniffImage(withExif)).toEqual({ format: "jpeg", width: 12, height: 9 });
  });
});

describe("sniffImage - refuses everything else, whatever it is called", () => {
  const refused: [string, Uint8Array][] = [
    ["MP3 with ID3 tag", MP3_ID3],
    ["raw MP3 frames", MP3_FRAMES],
    ["WAV (RIFF but not WEBP)", WAV],
    ["Ogg Vorbis", OGG],
    ["M4A (ftyp)", M4A],
    ["AVIF (not an accepted upload format)", AVIF],
    ["HEIC (not an accepted upload format)", HEIC],
    ["HTML with script", HTML],
    ["SVG with script", SVG],
    ["SVG with BOM + XML prolog", SVG_BOM],
    ["empty", new Uint8Array(0)],
  ];
  for (const [label, b] of refused) it(label, () => expect(sniffImage(b)).toBeNull());

  it("GIF is refused (not in ALLOWED_IMAGE_TYPES)", async () => {
    expect(sniffImage(await real.gif())).toBeNull();
  });

  it("truncated headers are refused", async () => {
    const png = await real.png();
    const jpeg = await real.jpeg();
    const webp = await real.webpLossy();
    expect(sniffImage(png.subarray(0, 24))).toBeNull(); // signature + part of IHDR
    expect(sniffImage(jpeg.subarray(0, 3))).toBeNull(); // SOI + first marker byte
    expect(sniffImage(jpeg.subarray(0, 20))).toBeNull(); // cut inside APP0, before the frame header
    expect(sniffImage(webp.subarray(0, 16))).toBeNull(); // RIFF....WEBPVP8 only
  });

  it("a magic number with a lying header (zero or absurd dimensions, scan before frame) is refused", () => {
    const pngHeader = (w: number, h: number) =>
      bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13], "IHDR", [w >>> 24, (w >> 16) & 255, (w >> 8) & 255, w & 255, h >>> 24, (h >> 16) & 255, (h >> 8) & 255, h & 255, 8, 2, 0, 0, 0, 0, 0, 0, 0]);
    expect(sniffImage(pngHeader(1, 1))).toEqual({ format: "png", width: 1, height: 1 });
    expect(sniffImage(pngHeader(0, 10))).toBeNull();
    expect(sniffImage(pngHeader(MAX_SOURCE_IMAGE_DIMENSION + 1, 10))).toBeNull();
    expect(sniffImage(pngHeader(0xffffffff, 0xffffffff))).toBeNull();
    // JPEG: SOI then straight into SOS (no frame header) - refused.
    expect(sniffImage(bytes([0xff, 0xd8, 0xff, 0xda, 0, 8], new Uint8Array(16)))).toBeNull();
    // JPEG: a segment length running past the end of the buffer - refused.
    expect(sniffImage(bytes([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xff], new Uint8Array(8)))).toBeNull();
  });

  it("an image magic number glued to audio bytes is not an image header", () => {
    expect(sniffImage(bytes([0xff, 0xd8, 0xff], MP3_FRAMES))).toBeNull();
    expect(sniffImage(bytes("RIFF", [0, 0, 1, 0], "WEBP", MP3_FRAMES))).toBeNull();
  });
});

describe("isCanonicalStoredImage - what the trusted pipeline may leave at an image path", () => {
  it("sharp's own WebP output (lossy, lossless, alpha) passes", async () => {
    expect(isCanonicalStoredImage(await real.webpLossy())).toBe(true);
    expect(isCanonicalStoredImage(await real.webpLossless())).toBe(true);
    expect(isCanonicalStoredImage(await real.webpAlpha())).toBe(true);
  });

  it("a WebP with audio appended (polyglot an <audio> element could play) fails", async () => {
    const webp = await real.webpLossy();
    expect(isCanonicalStoredImage(bytes(webp, MP3_FRAMES))).toBe(false);
    expect(isCanonicalStoredImage(bytes(webp, [0]))).toBe(true); // one RIFF pad byte is allowed
    expect(isCanonicalStoredImage(bytes(webp, [0, 0]))).toBe(false);
  });

  it("a truncated WebP fails", async () => {
    const webp = await real.webpLossy();
    expect(isCanonicalStoredImage(webp.subarray(0, webp.length - 4))).toBe(false);
  });

  it("other formats, audio and documents fail - even real JPEG/PNG (the pipeline only stores WebP)", async () => {
    for (const b of [await real.jpeg(), await real.png(), MP3_ID3, WAV, OGG, M4A, HTML, SVG]) expect(isCanonicalStoredImage(b)).toBe(false);
  });

  it("a WebP larger than the re-encode cap (MAX_IMAGE_DIMENSION) fails", async () => {
    expect(isCanonicalStoredImage(await solid(2001, 10).webp().toBuffer())).toBe(false);
    expect(isCanonicalStoredImage(await solid(2000, 10).webp().toBuffer())).toBe(true);
  });
});
