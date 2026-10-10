/**
 * Server-side audio duration derivation (TASK B4b). Pure: bytes in, seconds
 * out, no I/O and no dependency. Used ONLY for billing-governed (paid) Spaces,
 * where the browser-reported length is not trusted (audioFinalize.server.ts
 * downloads the stored object and calls this).
 *
 * Threat model: the uploader controls every byte, including every header
 * field that "declares" a length (MP3 Xing/VBRI frame counts, MP4 mvhd/mdhd,
 * Ogg granule positions, WAV data sizes). A browser plays what it DECODES, not
 * what a header claims, so every parser here measures the decodable content
 * and, where a header claims more, takes the larger value. The result is an
 * UPPER bound on what a player will play (within a few hundredths of a second
 * for an honest file), never a header's word for it:
 *
 *   wav  - PCM / IEEE-float (incl. WAVE_FORMAT_EXTENSIBLE) only; the format
 *          fields must be self-consistent; length = every byte after the
 *          `data` chunk header / byte rate (a too-small declared data size
 *          cannot hide audio).
 *   mp3  - a full MPEG audio frame scan (Layer I/II/III, MPEG-1/2/2.5) with
 *          resynchronisation; Xing/Info/VBRI counts are ignored. The frames
 *          found must cover the file (ID3v2/ID3v1/APE tags excluded), so a
 *          different container hidden behind an .mp3 name is refused.
 *   aac  - the same scan over ADTS frames (MP4 bytes named .aac go to the
 *          MP4 parser; ADIF is refused).
 *   m4a  - ISO-BMFF: the first box must be `ftyp`, the top-level boxes must
 *          chain exactly to the end, exactly one `moov`, no fragments
 *          (`moof`/`mvex`). Per sound track the single sample entry must be
 *          `mp4a` with an AAC `esds`; the decoder floor is sample count x
 *          1024 / min(sample-entry rate, AudioSpecificConfig rate) - every
 *          header length is uploader-controlled, so it can only ADD:
 *          max(floor, sum of stts deltas, mdhd, tkhd, sum of elst segments -
 *          which can REPEAT media); overall max with mvhd. stts and stsz
 *          sample counts must agree; an mdhd timescale above 4x the codec
 *          rate, a 0/absurd rate, or a non-AAC entry is refused.
 *   ogg  - one logical stream only (Vorbis or Opus); every packet's decoded
 *          length is computed from the codec (Vorbis block sizes via the
 *          setup header's mode table, Opus TOC bytes) and summed; the larger
 *          of that and the last granule position wins. Pages must cover the
 *          file.
 *
 * Anything that cannot be measured this way returns `{ ok: false }` and the
 * caller fails closed (a paid Space refuses the upload and asks for MP3/M4A).
 */

export type AudioDurationFailure = "unsupported" | "malformed" | "unrecognized";
export type AudioDurationResult = { ok: true; seconds: number } | { ok: false; reason: AudioDurationFailure };

const fail = (reason: AudioDurationFailure): AudioDurationResult => ({ ok: false, reason });
const okSeconds = (seconds: number): AudioDurationResult =>
  Number.isFinite(seconds) && seconds >= 0 ? { ok: true, seconds } : fail("malformed");

/**
 * Whole seconds as stored in metadata.durationSeconds. Rounded to the
 * nearest second (the same rounding the Studio has always shown): an honest
 * "60:00" export carries encoder priming/padding of a few hundredths of a
 * second and must not be refused as 60:01.
 */
export function toWholeSeconds(exactSeconds: number): number {
  return Math.round(exactSeconds);
}

/** Gaps (bytes not accounted for by frames/pages) tolerated in a frame-scanned file. */
function maxGapBytes(regionBytes: number): number {
  return Math.max(64 * 1024, Math.floor(regionBytes * 0.03));
}

const ascii = (b: Uint8Array, p: number, s: string) => {
  if (p < 0 || p + s.length > b.length) return false;
  for (let i = 0; i < s.length; i++) if (b[p + i] !== s.charCodeAt(i)) return false;
  return true;
};
const u16le = (b: Uint8Array, p: number) => b[p] | (b[p + 1] << 8);
const u32le = (b: Uint8Array, p: number) => (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16)) + b[p + 3] * 0x1000000;
const u32be = (b: Uint8Array, p: number) => b[p] * 0x1000000 + ((b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]);
const u64be = (b: Uint8Array, p: number) => u32be(b, p) * 0x100000000 + u32be(b, p + 4);
const ALL_ONES_32 = 0xffffffff;

export function deriveAudioDuration(bytes: Uint8Array, ext: string): AudioDurationResult {
  if (!bytes || bytes.length < 4) return fail("malformed");
  switch (ext) {
    case "wav":
      return wavDuration(bytes);
    case "mp3":
      return mpegAudioDuration(bytes);
    case "aac":
      return ascii(bytes, 4, "ftyp") ? mp4Duration(bytes) : adtsDuration(bytes);
    case "m4a":
      return mp4Duration(bytes);
    case "ogg":
      return oggDuration(bytes);
    default:
      return fail("unsupported");
  }
}

// ---------------------------------------------------------------------------
// WAV (RIFF)
// ---------------------------------------------------------------------------

function wavDuration(b: Uint8Array): AudioDurationResult {
  if (!ascii(b, 0, "RIFF") || !ascii(b, 8, "WAVE")) return ascii(b, 0, "RF64") ? fail("unsupported") : fail("unrecognized");
  let p = 12;
  let byteRate = 0;
  while (p + 8 <= b.length) {
    const size = u32le(b, p + 4);
    const body = p + 8;
    if (ascii(b, p, "fmt ")) {
      if (size < 16 || body + 16 > b.length) return fail("malformed");
      let format = u16le(b, body);
      const channels = u16le(b, body + 2);
      const sampleRate = u32le(b, body + 4);
      const declaredByteRate = u32le(b, body + 8);
      const blockAlign = u16le(b, body + 12);
      const bits = u16le(b, body + 14);
      if (format === 0xfffe) {
        if (size < 40 || body + 26 > b.length) return fail("malformed");
        format = u16le(b, body + 24); // first two bytes of the SubFormat GUID
      }
      if (format !== 1 && format !== 3) return fail("unsupported"); // PCM / IEEE float only
      if (channels < 1 || sampleRate < 1 || bits < 8 || bits % 8 !== 0) return fail("malformed");
      if (blockAlign !== (channels * bits) / 8 || declaredByteRate !== sampleRate * blockAlign) return fail("malformed");
      byteRate = declaredByteRate;
    } else if (ascii(b, p, "data")) {
      if (!byteRate) return fail("malformed"); // `fmt ` must precede `data`
      // Every byte after the data chunk header counts, whatever the declared
      // size says: a too-small size cannot hide playable samples.
      return okSeconds((b.length - body) / byteRate);
    }
    if (size === ALL_ONES_32) return fail("malformed");
    p = body + size + (size & 1);
  }
  return fail("malformed");
}

// ---------------------------------------------------------------------------
// MPEG audio (MP3 and other layers) - full frame scan
// ---------------------------------------------------------------------------

const MPEG_KBPS: Record<string, readonly number[]> = {
  "1-1": [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  "1-2": [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  "1-3": [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  "2-1": [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  "2-2": [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  "2-3": [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const MPEG_RATES: Record<number, readonly number[]> = {
  3: [44100, 48000, 32000], // MPEG-1
  2: [22050, 24000, 16000], // MPEG-2
  0: [11025, 12000, 8000], // MPEG-2.5
};

type Frame = { len: number; samples: number; rate: number };

/** One MPEG audio frame header at `p`, or null. Free-format (bitrate 0) is refused. */
export function mpegFrameAt(b: Uint8Array, p: number): Frame | null {
  if (p + 4 > b.length || b[p] !== 0xff || (b[p + 1] & 0xe0) !== 0xe0) return null;
  const version = (b[p + 1] >> 3) & 3; // 0 = 2.5, 1 = reserved, 2 = MPEG-2, 3 = MPEG-1
  const layerBits = (b[p + 1] >> 1) & 3; // 1 = III, 2 = II, 3 = I
  if (version === 1 || layerBits === 0) return null;
  const bitrateIndex = b[p + 2] >> 4;
  const rateIndex = (b[p + 2] >> 2) & 3;
  if (bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) return null;
  if ((b[p + 3] & 3) === 2) return null; // reserved emphasis
  const layer = 4 - layerBits;
  const v1 = version === 3;
  const kbps = MPEG_KBPS[`${v1 ? 1 : 2}-${layer}`][bitrateIndex];
  const rate = MPEG_RATES[version][rateIndex];
  const padding = (b[p + 2] >> 1) & 1;
  if (layer === 1) return { len: (Math.floor((12000 * kbps) / rate) + padding) * 4, samples: 384, rate };
  if (layer === 2) return { len: Math.floor((144000 * kbps) / rate) + padding, samples: 1152, rate };
  return { len: Math.floor(((v1 ? 144000 : 72000) * kbps) / rate) + padding, samples: v1 ? 1152 : 576, rate };
}

/** One ADTS (AAC) frame header at `p`, or null. */
export function adtsFrameAt(b: Uint8Array, p: number): Frame | null {
  if (p + 7 > b.length || b[p] !== 0xff || (b[p + 1] & 0xf6) !== 0xf0) return null;
  const rateIndex = (b[p + 2] >> 2) & 0xf;
  const ADTS_RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
  if (rateIndex >= ADTS_RATES.length) return null;
  const len = ((b[p + 3] & 3) << 11) | (b[p + 4] << 3) | (b[p + 5] >> 5);
  const headerLen = b[p + 1] & 1 ? 7 : 9;
  if (len <= headerLen) return null;
  return { len, samples: ((b[p + 6] & 3) + 1) * 1024, rate: ADTS_RATES[rateIndex] };
}

/** Skips any number of leading ID3v2 tags (with optional footer). */
function skipId3v2(b: Uint8Array): number {
  let p = 0;
  while (ascii(b, p, "ID3") && p + 10 <= b.length) {
    const s = [b[p + 6], b[p + 7], b[p + 8], b[p + 9]];
    if (s.some((x) => x & 0x80)) break;
    const size = (s[0] << 21) | (s[1] << 14) | (s[2] << 7) | s[3];
    p += 10 + size + (b[p + 5] & 0x10 ? 10 : 0);
  }
  return Math.min(p, b.length);
}

/** End of the audio region: before a trailing ID3v1 tag and/or APEv2 tag. */
function trailingTagStart(b: Uint8Array, start: number): number {
  let end = b.length;
  if (end - 128 >= start && ascii(b, end - 128, "TAG")) end -= 128;
  if (end - 32 >= start && ascii(b, end - 32, "APETAGEX")) {
    const size = u32le(b, end - 32 + 12); // includes the footer, not the header
    const hasHeader = (b[end - 32 + 23] & 0x80) !== 0;
    const tagStart = end - size - (hasHeader ? 32 : 0);
    if (size >= 32 && tagStart >= start) end = tagStart;
  }
  return end;
}

/**
 * Frame scan with resynchronisation. A frame is accepted when its header is
 * valid and the next frame header (or the end of the audio region) follows
 * it (or it continues a chain), so random bytes are not mistaken for
 * audio; a byte that does not start an accepted frame is a gap. Bytes the scan cannot attribute to frames must
 * stay small, otherwise the file is refused: a decoder could be playing
 * something this scan does not understand.
 */
function frameScan(b: Uint8Array, frameAt: (b: Uint8Array, p: number) => Frame | null): AudioDurationResult {
  const start = skipId3v2(b);
  const end = trailingTagStart(b, start);
  if (end <= start) return fail("malformed");
  let p = start;
  let seconds = 0;
  let covered = 0;
  let frames = 0;
  let inChain = false; // the previous accepted frame ended exactly here
  while (p < end) {
    const f = frameAt(b, p);
    if (f) {
      const next = p + f.len;
      if (next >= end) {
        // Last (possibly truncated) frame: a decoder may still emit it - count it.
        seconds += f.samples / f.rate;
        covered += end - p;
        frames += 1;
        break;
      }
      // Inside a chain one valid header is enough (the frame before a gap
      // still plays); starting a chain needs the next header as confirmation.
      if (inChain || frameAt(b, next)) {
        seconds += f.samples / f.rate;
        covered += f.len;
        frames += 1;
        p = next;
        inChain = true;
        continue;
      }
    }
    inChain = false;
    p += 1;
  }
  if (frames === 0) return fail("unrecognized");
  if (end - start - covered > maxGapBytes(end - start)) return fail("unrecognized");
  return okSeconds(seconds);
}

function mpegAudioDuration(b: Uint8Array): AudioDurationResult {
  return frameScan(b, mpegFrameAt);
}

function adtsDuration(b: Uint8Array): AudioDurationResult {
  if (ascii(b, 0, "ADIF")) return fail("unsupported");
  return frameScan(b, adtsFrameAt);
}

// ---------------------------------------------------------------------------
// MP4 / M4A (ISO base media file format)
// ---------------------------------------------------------------------------

type Box = { type: string; start: number; end: number };

function readBoxes(b: Uint8Array, from: number, to: number, strict: boolean): Box[] | null {
  const boxes: Box[] = [];
  let p = from;
  while (p + 8 <= to) {
    let size = u32be(b, p);
    const type = String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7]);
    let header = 8;
    if (size === 1) {
      if (p + 16 > to) return null;
      size = u64be(b, p + 8);
      header = 16;
    } else if (size === 0) {
      size = to - p;
    }
    if (!Number.isSafeInteger(size) || size < header || p + size > to) return null;
    boxes.push({ type, start: p + header, end: p + size });
    p += size;
  }
  // Top level must chain exactly to the end (tolerating < 8 trailing bytes);
  // nested containers may carry padding.
  if (strict && to - p >= 8) return null;
  return boxes;
}

const child = (boxes: Box[] | null, type: string) => boxes?.find((x) => x.type === type) ?? null;

/** timescale + duration of an mvhd/mdhd full box (version 0 or 1). Duration null when "unknown" (all ones). */
function headerTimes(b: Uint8Array, box: Box): { timescale: number; duration: number | null } | null {
  const v = b[box.start];
  if (v === 1) {
    if (box.start + 32 > box.end) return null;
    const hi = u32be(b, box.start + 24);
    const lo = u32be(b, box.start + 28);
    return { timescale: u32be(b, box.start + 20), duration: hi === ALL_ONES_32 && lo === ALL_ONES_32 ? null : hi * 0x100000000 + lo };
  }
  if (box.start + 20 > box.end) return null;
  const d = u32be(b, box.start + 16);
  return { timescale: u32be(b, box.start + 12), duration: d === ALL_ONES_32 ? null : d };
}

function tkhdDuration(b: Uint8Array, box: Box): number | null {
  const v = b[box.start];
  if (v === 1) {
    if (box.start + 36 > box.end) return null;
    const hi = u32be(b, box.start + 28);
    const lo = u32be(b, box.start + 32);
    return hi === ALL_ONES_32 && lo === ALL_ONES_32 ? null : hi * 0x100000000 + lo;
  }
  if (box.start + 24 > box.end) return null;
  const d = u32be(b, box.start + 20);
  return d === ALL_ONES_32 ? null : d;
}

/** Sum of edit-list segment durations (movie timescale), or null if absent; "bad" for a rate we do not model. */
function elstTotal(b: Uint8Array, box: Box): number | "bad" {
  const v = b[box.start];
  const count = u32be(b, box.start + 4);
  const entry = v === 1 ? 20 : 12;
  if (box.start + 8 + count * entry > box.end) return "bad";
  let total = 0;
  for (let i = 0; i < count; i++) {
    const e = box.start + 8 + i * entry;
    total += v === 1 ? u64be(b, e) : u32be(b, e);
    const rateInt = (b[e + entry - 4] << 8) | b[e + entry - 3];
    const rateFrac = (b[e + entry - 2] << 8) | b[e + entry - 1];
    if (rateFrac !== 0 || (rateInt !== 0 && rateInt !== 1)) return "bad";
  }
  return total;
}

/** MPEG-4 audio sampling-frequency table (ISO/IEC 14496-3, 1.6.3.4). */
const MP4A_RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
/**
 * Audio object types whose decoded frame is AT MOST 1024 samples at the
 * AudioSpecificConfig (core) rate: AAC Main/LC/SSR/LTP, SBR/PS (HE-AAC v1/v2:
 * 1024 core samples = 2048 output samples at twice the rate, the same time),
 * ER AAC LC/LD/ELD (1024/960/512/480). Anything else (e.g. MP3-in-MP4, 1152
 * samples per frame) could decode longer than samples x 1024 and is refused.
 */
const MP4A_AOTS = new Set([1, 2, 3, 4, 5, 17, 23, 29, 39]);
const MIN_AUDIO_RATE = 7350;
const MAX_AUDIO_RATE = 96000;
/** mdhd timescale may be the output rate of HE-AAC (2x core); more than this is a forged clock. */
const MAX_TIMESCALE_TO_RATE = 4;

/** Bit reader over an AudioSpecificConfig. */
function ascRate(asc: Uint8Array): number | null {
  let pos = 0;
  const bits = (n: number) => {
    let v = 0;
    for (let k = 0; k < n; k++, pos++) {
      if (pos >> 3 >= asc.length) return -1;
      v = v * 2 + ((asc[pos >> 3] >> (7 - (pos & 7))) & 1);
    }
    return v;
  };
  const aot = () => {
    const v = bits(5);
    return v === 31 ? 32 + bits(6) : v;
  };
  const rate = () => {
    const i = bits(4);
    if (i === 15) return bits(24);
    return i >= 0 && i < MP4A_RATES.length ? MP4A_RATES[i] : -1;
  };
  const type = aot();
  if (!MP4A_AOTS.has(type)) return null;
  const core = rate(); // explicit SBR/PS: this is the CORE (AAC) rate; the extension rate follows
  if (type === 5 || type === 29) {
    bits(4); // channelConfiguration
    if (rate() < 0) return null; // extensionSamplingFrequency
    const coreType = aot();
    if (!MP4A_AOTS.has(coreType) || coreType === 5 || coreType === 29) return null;
  }
  return core > 0 ? core : null;
}

/** MPEG-4 descriptor (tag + 7-bit-chained size) at `p` inside [p, end). */
function descriptorAt(b: Uint8Array, p: number, end: number): { tag: number; start: number; end: number } | null {
  if (p >= end) return null;
  const tag = b[p];
  let size = 0;
  let q = p + 1;
  for (let i = 0; i < 4; i++, q++) {
    if (q >= end) return null;
    size = size * 128 + (b[q] & 0x7f);
    if (!(b[q] & 0x80)) {
      q += 1;
      return q + size <= end ? { tag, start: q, end: q + size } : null;
    }
  }
  return null;
}

/** AudioSpecificConfig sampling rate from an `esds` box, or null when absent/unparseable/not AAC. */
function esdsCoreRate(b: Uint8Array, esds: Box): number | null {
  const es = descriptorAt(b, esds.start + 4, esds.end);
  if (!es || es.tag !== 3 || es.start + 3 > es.end) return null;
  const flags = b[es.start + 2];
  let p = es.start + 3;
  if (flags & 0x80) p += 2; // dependsOn_ES_ID
  if (flags & 0x40) p += 1 + (p < es.end ? b[p] : 0); // URL
  if (flags & 0x20) p += 2; // OCR_ES_Id
  const dc = descriptorAt(b, p, es.end);
  if (!dc || dc.tag !== 4 || dc.start + 13 > dc.end) return null;
  const oti = b[dc.start];
  if (oti !== 0x40 && oti !== 0x66 && oti !== 0x67 && oti !== 0x68) return null; // MPEG-4 / MPEG-2 AAC
  const dsi = descriptorAt(b, dc.start + 13, dc.end);
  if (!dsi || dsi.tag !== 5 || dsi.end - dsi.start < 2) return null;
  return ascRate(b.subarray(dsi.start, dsi.end));
}

/**
 * The rate a decoder actually runs the track at: the single `stsd` entry
 * must be `mp4a` (AudioSampleEntry v0/v1) carrying an AAC `esds`. Returns
 * the SMALLER of the sample-entry rate and the AudioSpecificConfig rate
 * (smaller rate = longer measured duration, so HE-AAC declared at its output
 * rate is never under-counted), or a failure reason.
 */
function mp4aDecoderRate(b: Uint8Array, stsd: Box | null): number | AudioDurationFailure {
  if (!stsd || stsd.start + 8 > stsd.end) return "malformed";
  if (u32be(b, stsd.start + 4) !== 1) return "unsupported"; // one sample description only
  const entries = readBoxes(b, stsd.start + 8, stsd.end, false);
  const entry = entries?.[0];
  if (!entry) return "malformed";
  if (entry.type !== "mp4a") return "unsupported"; // ALAC, Opus-in-MP4, encrypted, ...
  if (entry.start + 28 > entry.end) return "malformed";
  const soundVersion = (b[entry.start + 8] << 8) | b[entry.start + 9];
  if (soundVersion > 1) return "unsupported";
  const entryRate = (b[entry.start + 24] << 8) | b[entry.start + 25]; // 16.16 fixed point, integer part
  const kids = readBoxes(b, entry.start + 28 + (soundVersion === 1 ? 16 : 0), entry.end, false);
  const esds = child(kids, "esds");
  if (!esds) return "malformed";
  const core = esdsCoreRate(b, esds);
  if (core === null) return "unsupported";
  const inRange = (r: number) => r >= MIN_AUDIO_RATE && r <= MAX_AUDIO_RATE;
  if (!inRange(entryRate) || !inRange(core)) return "malformed"; // 0 or absurd
  return Math.min(core, entryRate);
}

function mp4Duration(b: Uint8Array): AudioDurationResult {
  if (!ascii(b, 4, "ftyp")) return fail("unrecognized");
  const top = readBoxes(b, 0, b.length, true);
  if (!top || top[0]?.type !== "ftyp") return fail("malformed");
  if (top.some((x) => x.type === "moof")) return fail("unsupported");
  const moovs = top.filter((x) => x.type === "moov");
  if (moovs.length !== 1) return fail(moovs.length ? "malformed" : "unsupported");
  const moov = readBoxes(b, moovs[0].start, moovs[0].end, false);
  if (!moov) return fail("malformed");
  if (child(moov, "mvex")) return fail("unsupported"); // fragmented
  const mvhdBox = child(moov, "mvhd");
  const mvhd = mvhdBox ? headerTimes(b, mvhdBox) : null;
  if (!mvhd || mvhd.timescale <= 0) return fail("malformed");

  let longest = mvhd.duration === null ? 0 : mvhd.duration / mvhd.timescale;
  let soundTracks = 0;
  for (const trak of moov.filter((x) => x.type === "trak")) {
    const tk = readBoxes(b, trak.start, trak.end, false);
    const mdiaBox = child(tk, "mdia");
    const mdia = mdiaBox ? readBoxes(b, mdiaBox.start, mdiaBox.end, false) : null;
    const hdlr = child(mdia, "hdlr");
    if (!hdlr || hdlr.start + 12 > hdlr.end || !ascii(b, hdlr.start + 8, "soun")) continue;
    soundTracks += 1;
    const mdhdBox = child(mdia, "mdhd");
    const mdhd = mdhdBox ? headerTimes(b, mdhdBox) : null;
    if (!mdhd || mdhd.timescale <= 0) return fail("malformed");
    const minfBox = child(mdia, "minf");
    const minf = minfBox ? readBoxes(b, minfBox.start, minfBox.end, false) : null;
    const stblBox = child(minf, "stbl");
    const stbl = stblBox ? readBoxes(b, stblBox.start, stblBox.end, false) : null;
    const stts = child(stbl, "stts");
    const stsz = child(stbl, "stsz");
    if (!stts || !stsz || stts.start + 8 > stts.end || stsz.start + 12 > stsz.end) return fail("malformed");
    const entries = u32be(b, stts.start + 4);
    if (stts.start + 8 + entries * 8 > stts.end) return fail("malformed");
    let samples = 0;
    let ticks = 0;
    for (let i = 0; i < entries; i++) {
      const count = u32be(b, stts.start + 8 + i * 8);
      samples += count;
      ticks += count * u32be(b, stts.start + 12 + i * 8);
    }
    if (samples === 0 || samples !== u32be(b, stsz.start + 8)) return fail("malformed");
    // Every header length above is uploader-controlled (a huge mdhd timescale
    // or tiny stts deltas shrink it). The decoder plays one AAC frame of at
    // most 1024 samples per MP4 sample at the codec's rate, whatever the
    // headers say: that is the floor, the headers can only add to it.
    const rate = mp4aDecoderRate(b, child(stbl, "stsd"));
    if (typeof rate !== "number") return fail(rate);
    if (mdhd.timescale > rate * MAX_TIMESCALE_TO_RATE) return fail("malformed");
    let track = Math.max((samples * 1024) / rate, ticks / mdhd.timescale);
    if (mdhd.duration !== null) track = Math.max(track, mdhd.duration / mdhd.timescale);
    const tkhdBox = child(tk, "tkhd");
    const tkhd = tkhdBox ? tkhdDuration(b, tkhdBox) : null;
    if (tkhd !== null) track = Math.max(track, tkhd / mvhd.timescale);
    const edtsBox = child(tk, "edts");
    const elst = edtsBox ? child(readBoxes(b, edtsBox.start, edtsBox.end, false), "elst") : null;
    if (elst) {
      const total = elstTotal(b, elst);
      if (total === "bad") return fail("unsupported");
      track = Math.max(track, total / mvhd.timescale);
    }
    longest = Math.max(longest, track);
  }
  if (soundTracks === 0) return fail("unrecognized");
  return okSeconds(longest);
}

// ---------------------------------------------------------------------------
// Ogg (Vorbis / Opus)
// ---------------------------------------------------------------------------

type OggScan = { packets: Uint8Array[]; maxGranule: number; covered: number };

function scanOgg(b: Uint8Array): OggScan | "multi" | null {
  const packets: Uint8Array[] = [];
  let partial: Uint8Array[] | null = null;
  let serial: number | null = null;
  let maxGranule = 0;
  let covered = 0;
  let p = 0;
  while (p + 27 <= b.length) {
    if (!ascii(b, p, "OggS") || b[p + 4] !== 0) {
      p += 1;
      continue;
    }
    const segments = b[p + 26];
    const dataStart = p + 27 + segments;
    if (dataStart > b.length) break;
    let dataLen = 0;
    for (let i = 0; i < segments; i++) dataLen += b[p + 27 + i];
    if (dataStart + dataLen > b.length) break;
    const pageSerial = u32le(b, p + 14);
    if (serial === null) serial = pageSerial;
    else if (pageSerial !== serial) return "multi";
    const gLo = u32le(b, p + 6);
    const gHi = u32le(b, p + 10);
    if (!(gLo === ALL_ONES_32 && gHi === ALL_ONES_32)) {
      if (gHi > 0x1fffff) return null; // beyond 2^53: not a real position
      maxGranule = Math.max(maxGranule, gHi * 0x100000000 + gLo);
    }
    const continued = (b[p + 5] & 1) !== 0;
    if (!continued) partial = null; // an unfinished packet the next page did not continue is dropped
    let q = dataStart;
    let first = true;
    for (let i = 0; i < segments; i++) {
      const lace = b[p + 27 + i];
      const piece = b.subarray(q, q + lace);
      q += lace;
      if (first && continued && partial === null) {
        // continuation of a packet we never saw the start of: skip its pieces
        if (lace < 255) first = false;
        continue;
      }
      first = false;
      (partial ??= []).push(piece);
      if (lace < 255) {
        const total = partial.reduce((n, x) => n + x.length, 0);
        const packet = new Uint8Array(total);
        let o = 0;
        for (const x of partial) {
          packet.set(x, o);
          o += x.length;
        }
        packets.push(packet);
        partial = null;
      }
    }
    covered += dataStart + dataLen - p;
    p = dataStart + dataLen;
  }
  return { packets, maxGranule, covered };
}

/** Vorbis mode -> blockflag table, read backwards from the end of the setup header (the method FFmpeg's vorbis_parser uses). */
export function vorbisModeBlockflags(setup: Uint8Array): number[] | null {
  const n = setup.length;
  const totalBits = n * 8;
  // Reading the byte-reversed buffer MSB-first walks the LSB-first Vorbis bitstream backwards.
  const bit = (i: number) => (setup[n - 1 - (i >> 3)] >> (7 - (i & 7))) & 1;
  const bits = (i: number, count: number) => {
    let v = 0;
    for (let k = 0; k < count; k++) v = (v << 1) | bit(i + k);
    return v;
  };
  let pos = 0;
  let framing = -1;
  while (totalBits - pos > 97) {
    if (bit(pos++)) {
      framing = pos;
      break;
    }
  }
  if (framing < 0) return null;
  let modeCount = 0;
  let lastModeCount = 0;
  while (totalBits - pos >= 97) {
    const mapping = bits(pos, 8);
    const transform = bits(pos + 8, 16);
    const windowType = bits(pos + 24, 16);
    pos += 40;
    if (mapping > 63 || transform !== 0 || windowType !== 0) break;
    pos += 1; // blockflag
    modeCount += 1;
    if (modeCount > 64) break;
    if (bits(pos, 6) + 1 === modeCount) lastModeCount = modeCount;
  }
  if (!lastModeCount) return null;
  const flags = new Array<number>(lastModeCount);
  pos = framing;
  for (let i = lastModeCount - 1; i >= 0; i--) {
    pos += 40;
    flags[i] = bit(pos++);
  }
  return flags;
}

function vorbisDuration(scan: OggScan): AudioDurationResult {
  const [ident, comment, setup, ...audio] = scan.packets;
  if (!ident || ident.length < 30 || !comment || !setup) return fail("malformed");
  if (comment[0] !== 3 || !ascii(comment, 1, "vorbis") || setup[0] !== 5 || !ascii(setup, 1, "vorbis")) return fail("malformed");
  const sampleRate = u32le(ident, 12);
  const block = [1 << (ident[28] & 0x0f), 1 << (ident[28] >> 4)];
  if (sampleRate < 1 || block[0] < 64 || block[1] < block[0] || block[1] > 8192) return fail("malformed");
  const modeFlags = vorbisModeBlockflags(setup);
  if (!modeFlags) return fail("malformed");
  const modeCount = modeFlags.length;
  const modeBits = modeCount > 1 ? Math.ceil(Math.log2(modeCount)) : 0;
  const modeMask = ((1 << modeBits) - 1) << 1;
  const prevMask = (modeMask | 1) + 1;
  let samples = 0;
  let previous = -1;
  for (const packet of audio) {
    if (packet.length === 0) continue;
    if (packet[0] & 1) return fail("malformed"); // a header packet in the audio stream
    const mode = modeCount === 1 ? 0 : (packet[0] & modeMask) >> 1;
    if (mode >= modeCount) return fail("malformed");
    const current = block[modeFlags[mode]];
    let prev = previous < 0 ? current : previous;
    if (modeFlags[mode]) prev = block[packet[0] & prevMask ? 1 : 0];
    if (previous >= 0) samples += (prev + current) >> 2; // the first audio packet produces no output
    previous = current;
  }
  return okSeconds(Math.max(samples, scan.maxGranule) / sampleRate);
}

/** Samples (at 48 kHz) one Opus packet decodes to, from its TOC byte (RFC 6716 section 3.1). */
export function opusPacketSamples(packet: Uint8Array): number | null {
  if (packet.length < 1) return null;
  const config = packet[0] >> 3;
  let frame: number;
  if (config < 12) frame = [480, 960, 1920, 2880][config % 4];
  else if (config < 16) frame = [480, 960][config % 2];
  else frame = [120, 240, 480, 960][config % 4];
  const code = packet[0] & 3;
  if (code === 0) return frame;
  if (code === 1 || code === 2) return frame * 2;
  if (packet.length < 2) return null;
  const count = packet[1] & 0x3f;
  return count === 0 ? null : frame * count;
}

function opusDuration(scan: OggScan): AudioDurationResult {
  const [head, tags, ...audio] = scan.packets;
  if (!head || head.length < 19 || !tags || !ascii(tags, 0, "OpusTags")) return fail("malformed");
  const preSkip = u16le(head, 10);
  let samples = 0;
  for (const packet of audio) {
    if (packet.length === 0) continue;
    const n = opusPacketSamples(packet);
    if (n === null) return fail("malformed");
    samples += n;
  }
  return okSeconds(Math.max(0, Math.max(samples, scan.maxGranule) - preSkip) / 48000);
}

function oggDuration(b: Uint8Array): AudioDurationResult {
  if (!ascii(b, 0, "OggS")) return fail("unrecognized");
  const scan = scanOgg(b);
  if (scan === "multi") return fail("unsupported"); // multiplexed or chained streams
  if (!scan || scan.packets.length === 0) return fail("malformed");
  if (b.length - scan.covered > maxGapBytes(b.length)) return fail("unrecognized");
  const first = scan.packets[0];
  if (first[0] === 1 && ascii(first, 1, "vorbis")) return vorbisDuration(scan);
  if (ascii(first, 0, "OpusHead")) return opusDuration(scan);
  return fail("unsupported"); // FLAC/Speex/Theora/... in Ogg
}
