import { describe, expect, it } from "vitest";
import { adtsFrameAt, deriveAudioDuration, mpegFrameAt, opusPacketSamples, toWholeSeconds, vorbisModeBlockflags } from "./audioDuration";
import { checkAudioAttach, type AudioQuotaPolicy } from "@/lib/billing/audioQuota";

/**
 * TASK B4b - server-side duration derivation. Every fixture is synthesised
 * here, byte by byte, so the expected length is known exactly. The "forged"
 * cases model a hostile paying organizer who controls every header field.
 */

// ---------------------------------------------------------------------------
// byte helpers
// ---------------------------------------------------------------------------
const cat = (...parts: (Uint8Array | number[])[]) => {
  const arrs = parts.map((p) => (p instanceof Uint8Array ? p : Uint8Array.from(p)));
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of arrs) {
    out.set(a, o);
    o += a.length;
  }
  return out;
};
const str = (s: string) => Uint8Array.from([...s].map((c) => c.charCodeAt(0)));
const le16 = (v: number) => [v & 0xff, (v >> 8) & 0xff];
const le32 = (v: number) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff];
const be32 = (v: number) => [(v >>> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
const zeros = (n: number) => new Uint8Array(n);
const seconds = (b: Uint8Array, ext: string) => {
  const r = deriveAudioDuration(b, ext);
  if (!r.ok) throw new Error(`expected a duration, got ${r.reason}`);
  return r.seconds;
};
const failure = (b: Uint8Array, ext: string) => {
  const r = deriveAudioDuration(b, ext);
  return r.ok ? `ok:${r.seconds}` : r.reason;
};

// ---------------------------------------------------------------------------
// WAV
// ---------------------------------------------------------------------------
function wav(o: { rate?: number; channels?: number; bits?: number; dataBytes: number; declaredData?: number; format?: number; byteRate?: number; extensible?: boolean }) {
  const rate = o.rate ?? 100;
  const channels = o.channels ?? 1;
  const bits = o.bits ?? 8;
  const blockAlign = (channels * bits) / 8;
  const fmtBody = o.extensible
    ? cat(le16(0xfffe), le16(channels), le32(rate), le32(o.byteRate ?? rate * blockAlign), le16(blockAlign), le16(bits), le16(22), le16(bits), le32(0), le16(o.format ?? 1), zeros(14))
    : cat(le16(o.format ?? 1), le16(channels), le32(rate), le32(o.byteRate ?? rate * blockAlign), le16(blockAlign), le16(bits));
  const fmt = cat(str("fmt "), le32(fmtBody.length), fmtBody);
  const data = cat(str("data"), le32(o.declaredData ?? o.dataBytes), zeros(o.dataBytes));
  return cat(str("RIFF"), le32(4 + fmt.length + data.length), str("WAVE"), fmt, data);
}

describe("WAV", () => {
  it("PCM: data bytes / byte rate (16-bit stereo 44.1 kHz, 2.5 s)", () => {
    expect(seconds(wav({ rate: 44100, channels: 2, bits: 16, dataBytes: 44100 * 4 * 2.5 }), "wav")).toBeCloseTo(2.5, 6);
  });

  it("WAVE_FORMAT_EXTENSIBLE with a PCM / float subformat", () => {
    expect(seconds(wav({ rate: 48000, channels: 2, bits: 32, dataBytes: 48000 * 8, extensible: true, format: 3 }), "wav")).toBeCloseTo(1, 6);
  });

  it("FORGED: a too-small declared data size cannot hide samples - every byte after the header counts", () => {
    expect(seconds(wav({ dataBytes: 360_100, declaredData: 100 }), "wav")).toBe(3601);
  });

  it("FORGED: an inflated byte rate that does not match the format is refused", () => {
    expect(failure(wav({ dataBytes: 1000, byteRate: 1_000_000 }), "wav")).toBe("malformed");
  });

  it("compressed formats inside WAV, RF64 and a data chunk before fmt are refused", () => {
    expect(failure(wav({ dataBytes: 1000, format: 0x55 }), "wav")).toBe("unsupported");
    expect(failure(cat(str("RF64"), zeros(40)), "wav")).toBe("unsupported");
    expect(failure(cat(str("RIFF"), le32(20), str("WAVE"), str("data"), le32(4), zeros(4)), "wav")).toBe("malformed");
    expect(failure(cat(str("OggS"), zeros(40)), "wav")).toBe("unrecognized");
  });
});

// ---------------------------------------------------------------------------
// MPEG audio (MP3)
// ---------------------------------------------------------------------------
/** MPEG-2.5 Layer III, 8 kbit/s, 8 kHz: 72-byte frames of 576 samples = 0.072 s each. */
const LOW = [0xff, 0xe3, 0x18, 0x00];
/** MPEG-1 Layer III, 128 kbit/s, 44.1 kHz: 417-byte frames of 1152 samples. */
const STD = [0xff, 0xfb, 0x90, 0x00];
const frame = (header: number[], len: number, fill = 0) => {
  const f = new Uint8Array(len).fill(fill);
  f.set(header);
  return f;
};
function mp3(frames: number, header = LOW, len = 72) {
  const one = frame(header, len);
  const out = new Uint8Array(frames * len);
  for (let i = 0; i < frames; i++) out.set(one, i * len);
  return out;
}
const id3v2 = (bodyBytes: number) => cat(str("ID3"), [4, 0, 0], [(bodyBytes >> 21) & 0x7f, (bodyBytes >> 14) & 0x7f, (bodyBytes >> 7) & 0x7f, bodyBytes & 0x7f], zeros(bodyBytes));

describe("MP3 (full frame scan)", () => {
  it("frame header arithmetic for MPEG-1 and MPEG-2.5 Layer III", () => {
    expect(mpegFrameAt(Uint8Array.from(STD), 0)).toEqual({ len: 417, samples: 1152, rate: 44100 });
    expect(mpegFrameAt(Uint8Array.from(LOW), 0)).toEqual({ len: 72, samples: 576, rate: 8000 });
    expect(mpegFrameAt(Uint8Array.from([0xff, 0xfb, 0x00, 0x00]), 0)).toBeNull(); // free format refused
    expect(mpegFrameAt(Uint8Array.from([0xff, 0xfb, 0xf0, 0x00]), 0)).toBeNull(); // bad bitrate
  });

  it("sums every frame: 50,000 frames = exactly 3600 s", () => {
    expect(seconds(mp3(50_000), "mp3")).toBeCloseTo(3600, 6);
  });

  it("skips ID3v2 (with embedded art containing fake sync bytes) and a trailing ID3v1 tag", () => {
    const art = id3v2(4096);
    art.fill(0xff, 20, 4000); // looks like sync words, must not be counted
    const tagged = cat(art, mp3(1000), str("TAG"), zeros(125));
    expect(seconds(tagged, "mp3")).toBeCloseTo(72, 6);
  });

  it("FORGED: a Xing header claiming 10 frames is ignored - the 1000 real frames are counted", () => {
    const xing = frame(STD, 417);
    xing.set(str("Xing"), 36);
    xing.set([0, 0, 0, 1, 0, 0, 0, 10], 40); // flags: frames; frame count = 10
    const file = cat(xing, mp3(1000, STD, 417));
    expect(seconds(file, "mp3")).toBeCloseTo((1001 * 1152) / 44100, 6);
  });

  it("FORGED: another container behind an .mp3 name is refused (MP4 bytes, ID3 + MP4)", () => {
    const m4a = mp4({ ticks: 1000, timescale: 1000 });
    expect(failure(m4a, "mp3")).toBe("unrecognized");
    expect(failure(cat(id3v2(64), m4a), "mp3")).toBe("unrecognized");
  });

  it("FORGED: real frames hidden among undecodable bytes are refused rather than under-counted", () => {
    // Half the file is not audio this scan understands: refuse (fail closed).
    expect(failure(cat(mp3(1000), new Uint8Array(200_000).fill(0x55)), "mp3")).toBe("unrecognized");
    // Frames separated by a byte of junk never chain: refuse.
    const interleaved = cat(...Array.from({ length: 2000 }, () => cat(frame(LOW, 72), [0x00])));
    expect(failure(interleaved, "mp3")).toBe("unrecognized");
  });

  it("resynchronises over a small gap and keeps counting", () => {
    expect(seconds(cat(mp3(500), zeros(100), mp3(500)), "mp3")).toBeCloseTo(72, 6);
  });

  it("an empty or tiny file is refused", () => {
    expect(failure(new Uint8Array(0), "mp3")).toBe("malformed");
    expect(failure(zeros(1000), "mp3")).toBe("unrecognized");
  });
});

// ---------------------------------------------------------------------------
// ADTS (AAC)
// ---------------------------------------------------------------------------
function adts(frames: number, payload = 20) {
  const len = 7 + payload;
  const h = [0xff, 0xf1, 0x60, 0x40 | ((len >> 11) & 3), (len >> 3) & 0xff, ((len & 7) << 5) | 0x1f, 0xfc];
  const one = frame(h, len);
  const out = new Uint8Array(frames * len);
  for (let i = 0; i < frames; i++) out.set(one, i * len);
  return out;
}

describe("AAC (ADTS)", () => {
  it("1024 samples per raw block at the header's sample rate (16 kHz)", () => {
    expect(adtsFrameAt(adts(1), 0)).toEqual({ len: 27, samples: 1024, rate: 16000 });
    expect(seconds(adts(1000), "aac")).toBeCloseTo(64, 6);
  });

  it("an MP4 file named .aac is measured as MP4; ADIF is refused", () => {
    expect(seconds(mp4({ ticks: 5000, timescale: 1000 }), "aac")).toBe(5);
    expect(failure(cat(str("ADIF"), zeros(100)), "aac")).toBe("unsupported");
  });
});

// ---------------------------------------------------------------------------
// MP4 / M4A
// ---------------------------------------------------------------------------
const box = (type: string, ...parts: (Uint8Array | number[])[]) => {
  const body = cat(...parts);
  return cat(be32(8 + body.length), str(type), body);
};
type Mp4Opts = {
  ticks: number; // total stts ticks
  timescale: number;
  mvhd?: number; // movie duration (movie timescale = 1000)
  mdhd?: number;
  stszCount?: number;
  elst?: number[]; // segment durations (movie timescale)
  handler?: string;
  fragmented?: boolean;
  trailing?: Uint8Array;
};
function mp4(o: Mp4Opts) {
  const movieTs = 1000;
  const mvhd = box("mvhd", [0, 0, 0, 0], be32(0), be32(0), be32(movieTs), be32(o.mvhd ?? 0), zeros(80));
  const tkhd = box("tkhd", [0, 0, 0, 3], be32(0), be32(0), be32(1), be32(0), be32(0), zeros(60));
  const mdhd = box("mdhd", [0, 0, 0, 0], be32(0), be32(0), be32(o.timescale), be32(o.mdhd ?? 0), zeros(4));
  const hdlr = box("hdlr", [0, 0, 0, 0], be32(0), str(o.handler ?? "soun"), zeros(12), [0]);
  // One stts entry: `ticks` samples of delta 1.
  const stts = box("stts", [0, 0, 0, 0], be32(1), be32(o.ticks), be32(1));
  const stsz = box("stsz", [0, 0, 0, 0], be32(4), be32(o.stszCount ?? o.ticks));
  const stbl = box("stbl", stts, stsz);
  const mdia = box("mdia", mdhd, hdlr, box("minf", stbl));
  const edts = o.elst ? box("edts", box("elst", [0, 0, 0, 0], be32(o.elst.length), ...o.elst.map((d) => cat(be32(d), be32(0), [0, 1, 0, 0])))) : new Uint8Array(0);
  const trak = box("trak", tkhd, edts, mdia);
  const moov = box("moov", mvhd, trak, o.fragmented ? box("mvex", zeros(8)) : new Uint8Array(0));
  return cat(box("ftyp", str("M4A "), be32(0), str("M4A ")), moov, box("mdat", zeros(32)), o.trailing ?? new Uint8Array(0));
}

describe("M4A (ISO-BMFF)", () => {
  it("sound track length from the sample table: 3600000 ticks at 1 kHz = 3600 s", () => {
    expect(seconds(mp4({ ticks: 3_600_000, timescale: 1000 }), "m4a")).toBe(3600);
  });

  it("FORGED: a small mvhd/mdhd cannot shorten the sample table", () => {
    expect(seconds(mp4({ ticks: 3_601_000, timescale: 1000, mvhd: 10, mdhd: 10 }), "m4a")).toBe(3601);
  });

  it("FORGED: an edit list that REPEATS the media is counted (2 x 1800 s = 3600 s)", () => {
    expect(seconds(mp4({ ticks: 1_800_000, timescale: 1000, elst: [1_800_000, 1_800_000] }), "m4a")).toBe(3600);
  });

  it("header durations longer than the samples are honoured (upper bound)", () => {
    expect(seconds(mp4({ ticks: 1000, timescale: 1000, mvhd: 9000 }), "m4a")).toBe(9);
  });

  it("refuses what it cannot measure: fragments, sample-count mismatch, no sound track, trailing junk, not MP4", () => {
    expect(failure(mp4({ ticks: 1000, timescale: 1000, fragmented: true }), "m4a")).toBe("unsupported");
    expect(failure(mp4({ ticks: 1000, timescale: 1000, stszCount: 10 }), "m4a")).toBe("malformed");
    expect(failure(mp4({ ticks: 1000, timescale: 1000, handler: "vide" }), "m4a")).toBe("unrecognized");
    expect(failure(mp4({ ticks: 1000, timescale: 1000, trailing: new Uint8Array(100).fill(0x55) }), "m4a")).toBe("malformed");
    expect(failure(mp3(100), "m4a")).toBe("unrecognized");
  });
});

// ---------------------------------------------------------------------------
// Ogg (Opus / Vorbis)
// ---------------------------------------------------------------------------
function oggPage(serial: number, seq: number, granule: number, type: number, packets: Uint8Array[]) {
  const lacing: number[] = [];
  for (const p of packets) {
    let n = p.length;
    while (n >= 255) {
      lacing.push(255);
      n -= 255;
    }
    lacing.push(n);
  }
  return cat(str("OggS"), [0, type], le32(granule), le32(0), le32(serial), le32(seq), le32(0), [lacing.length], lacing, ...packets);
}
/** Pages of up to 200 packets each; granule = cumulative samples given per packet. */
function oggStream(headers: Uint8Array[], audio: Uint8Array[], samplesPerPacket: number, o: { serial?: number; granuleOverride?: number } = {}) {
  const serial = o.serial ?? 7;
  const pages = [oggPage(serial, 0, 0, 2, [headers[0]])];
  let seq = 1;
  for (const h of headers.slice(1)) pages.push(oggPage(serial, seq++, 0, 0, [h]));
  let done = 0;
  for (let i = 0; i < audio.length; i += 200) {
    const chunk = audio.slice(i, i + 200);
    done += chunk.length;
    pages.push(oggPage(serial, seq++, o.granuleOverride ?? done * samplesPerPacket, i + 200 >= audio.length ? 4 : 0, chunk));
  }
  return cat(...pages);
}
const opusHead = (preSkip: number) => cat(str("OpusHead"), [1, 1], le16(preSkip), le32(48000), [0, 0, 0]);
const opusTags = cat(str("OpusTags"), le32(0), le32(0));

describe("Ogg Opus", () => {
  it("TOC arithmetic (RFC 6716): 60 ms SILK, 20 ms CELT, code 1/2 = two frames, code 3 = N frames", () => {
    expect(opusPacketSamples(Uint8Array.from([0x18]))).toBe(2880);
    expect(opusPacketSamples(Uint8Array.from([(31 << 3) | 0]))).toBe(960);
    expect(opusPacketSamples(Uint8Array.from([(31 << 3) | 1]))).toBe(1920);
    expect(opusPacketSamples(Uint8Array.from([(31 << 3) | 3, 6]))).toBe(5760);
    expect(opusPacketSamples(Uint8Array.from([(31 << 3) | 3, 0]))).toBeNull();
  });

  it("sums packets and subtracts pre-skip: 60,000 x 60 ms = 3600 s", () => {
    const audio = Array.from({ length: 60_000 }, () => Uint8Array.from([0x18, 0]));
    const s = seconds(oggStream([opusHead(312), opusTags], audio, 2880), "ogg");
    expect(s).toBeCloseTo(3600 - 312 / 48000, 6);
    expect(toWholeSeconds(s)).toBe(3600);
  });

  it("FORGED: a tiny final granule position cannot shorten what the packets decode to", () => {
    const audio = Array.from({ length: 1000 }, () => Uint8Array.from([0x18, 0]));
    expect(seconds(oggStream([opusHead(0), opusTags], audio, 2880, { granuleOverride: 48 }), "ogg")).toBeCloseTo(60, 6);
  });

  it("a second logical stream (multiplexed / chained) is refused", () => {
    const a = oggStream([opusHead(0), opusTags], [Uint8Array.from([0x18])], 2880, { serial: 1 });
    const b = oggStream([opusHead(0), opusTags], [Uint8Array.from([0x18])], 2880, { serial: 2 });
    expect(failure(cat(a, b), "ogg")).toBe("unsupported");
  });
});

/** LSB-first bit writer (the Vorbis bit packing). */
function vorbisSetup(modes: number[]) {
  const out: number[] = [];
  let cur = 0;
  let n = 0;
  const put = (v: number, count: number) => {
    for (let i = 0; i < count; i++) {
      cur |= ((v >> i) & 1) << n;
      if (++n === 8) {
        out.push(cur);
        cur = 0;
        n = 0;
      }
    }
  };
  for (let i = 0; i < 24; i++) put(0xff, 8); // stands in for codebooks/floors/residues/mappings
  put(modes.length - 1, 6);
  for (const flag of modes) {
    put(flag, 1);
    put(0, 16);
    put(0, 16);
    put(0, 8);
  }
  put(1, 1); // framing
  if (n) out.push(cur);
  return cat([5], str("vorbis"), out);
}
const vorbisIdent = (rate: number) => cat([1], str("vorbis"), le32(0), [1], le32(rate), le32(0), le32(0), le32(0), [0xb8, 1]); // blocks 256 / 2048
const vorbisComment = cat([3], str("vorbis"), le32(0), le32(0), [1]);

describe("Ogg Vorbis", () => {
  it("reads the mode table backwards from the setup header", () => {
    expect(vorbisModeBlockflags(vorbisSetup([0, 1]))).toEqual([0, 1]);
    expect(vorbisModeBlockflags(vorbisSetup([1]))).toEqual([1]);
  });

  it("sums decoded samples per packet ((prev + cur) / 4): long-long packets of 1024 samples", () => {
    // Sample rate 1024 Hz makes every long-long packet exactly one second.
    const longPacket = Uint8Array.from([0b0110]); // type 0, mode 1 (long), previous window long
    const audio = Array.from({ length: 3601 }, () => longPacket);
    // An honest final granule: 3600 s (the first packet decodes to nothing).
    expect(seconds(oggStream([vorbisIdent(1024), vorbisComment, vorbisSetup([0, 1])], audio, 1024, { granuleOverride: 3600 * 1024 }), "ogg")).toBe(3600);
  });

  it("FORGED: a zero granule cannot hide the packets", () => {
    const audio = Array.from({ length: 11 }, () => Uint8Array.from([0b0110]));
    expect(seconds(oggStream([vorbisIdent(1024), vorbisComment, vorbisSetup([0, 1])], audio, 1024, { granuleOverride: 0 }), "ogg")).toBe(10);
  });

  it("short blocks count (256 + 256) / 4 = 128 samples", () => {
    const audio = Array.from({ length: 9 }, () => Uint8Array.from([0b0000])); // mode 0 (short)
    expect(seconds(oggStream([vorbisIdent(128), vorbisComment, vorbisSetup([0, 1])], audio, 128, { granuleOverride: 0 }), "ogg")).toBe(8);
  });

  it("FLAC-in-Ogg and non-Ogg bytes are refused", () => {
    expect(failure(oggStream([cat([0x7f], str("FLAC"), zeros(30))], [], 0), "ogg")).toBe("unsupported");
    expect(failure(mp3(100), "ogg")).toBe("unrecognized");
  });
});

// ---------------------------------------------------------------------------
// The 60:00 boundary end to end (measured seconds -> the attach rule)
// ---------------------------------------------------------------------------
describe("3600 s passes, 3601 s is refused - measured from real bytes in every container", () => {
  const PAID: AudioQuotaPolicy = { mode: "enforced", limits: { libraryMinutes: 240, maxRecordingMinutes: 60, listeningMinutesPerMonth: 100_000 } };
  const check = (b: Uint8Array, ext: string) => {
    const r = deriveAudioDuration(b, ext);
    return checkAudioAttach(PAID, { claimedSeconds: 1, serverSeconds: r.ok ? toWholeSeconds(r.seconds) : null, otherItems: [] });
  };
  const cases: [string, Uint8Array, Uint8Array, string][] = [
    ["wav", wav({ dataBytes: 360_000 }), wav({ dataBytes: 360_100 }), "wav"],
    ["mp3", mp3(50_000), mp3(50_014), "mp3"],
    ["m4a", mp4({ ticks: 3_600_000, timescale: 1000 }), mp4({ ticks: 3_601_000, timescale: 1000 }), "m4a"],
    ["aac", adts(56_250), adts(56_266), "aac"],
  ];
  for (const [label, at, over, ext] of cases) {
    it(label, () => {
      expect(check(at, ext)).toEqual({ ok: true, durationSeconds: 3600 });
      expect(check(over, ext)).toEqual({ ok: false, issue: { code: "recordingTooLong", maxMinutes: 60 } });
    });
  }

  it("an unmeasurable file is refused even with a plausible browser claim", () => {
    expect(check(zeros(5000), "mp3")).toEqual({ ok: false, issue: { code: "durationUnknown" } });
  });

  it("toWholeSeconds rounds to the nearest second (encoder padding on an honest 60:00 export passes)", () => {
    expect(toWholeSeconds(3600.05)).toBe(3600);
    expect(toWholeSeconds(3600.5)).toBe(3601);
  });

  it("an unknown extension is unsupported", () => {
    expect(failure(zeros(100), "flac")).toBe("unsupported");
  });
});
