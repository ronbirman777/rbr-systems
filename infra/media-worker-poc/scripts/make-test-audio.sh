#!/usr/bin/env bash
# Synthetic POC audio built with macOS built-ins only (say + afconvert + node). Constant 96 kbps (-s 0, CBR) over a
# quiet noise bed, so bytes-per-listening-minute match the cost model's 0.72 MB/min. A spoken marker is placed at EXACTLY
# every 30 s ("thirty minutes, zero seconds"), so a tester can HEAR whether a seek landed where the player says.
# Output in $1:
#   marker-60min.m4a  AAC 96 kbps, 60:00 (the per-recording maximum) - Safari/iOS/Android seek tests
#   marker-5min.m4a   5:00 AAC - quick renewal/expiry tests
#   marker-5min.wav   5:00 PCM 44.1 kHz mono - WAV range tests / server-side duration measurement
set -euo pipefail
OUT="${1:?output dir}"; mkdir -p "$OUT/parts"
for ((s=0; s<3600; s+=30)); do
  m=$((s/60)); r=$((s%60))
  say -r 200 -o "$OUT/parts/$s.aiff" "$m minutes, $r seconds"
  afconvert -f WAVE -d LEI16@44100 -c 1 "$OUT/parts/$s.aiff" "$OUT/parts/$s.wav"
done
node - "$OUT" <<'JS'
const fs = require("fs"), path = require("path");
const out = process.argv[2], RATE = 44100;
function pcm(file) { const b = fs.readFileSync(file); let o = 12; while (o < b.length) { const id = b.toString("ascii", o, o + 4), n = b.readUInt32LE(o + 4); if (id === "data") return b.subarray(o + 8, o + 8 + n); o += 8 + n + (n & 1); } throw new Error("no data chunk"); }
function wav(samplesBuf) { const h = Buffer.alloc(44); h.write("RIFF", 0); h.writeUInt32LE(36 + samplesBuf.length, 4); h.write("WAVE", 8); h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(samplesBuf.length, 40); return Buffer.concat([h, samplesBuf]); }
for (const [name, total] of [["marker-60min", 3600], ["marker-5min", 300]]) {
  const buf = Buffer.alloc(total * RATE * 2);
  // quiet noise bed (about -40 dBFS) so the encoder spends realistic bits; the markers stay clearly audible
  let seed = 12345; for (let i = 0; i < buf.length; i += 2) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; buf.writeInt16LE(((seed >> 16) % 600) - 300, i); }
  for (let s = 0; s < total; s += 30) { const p = pcm(path.join(out, "parts", `${s}.wav`)); for (let i = 0; i + 1 < p.length; i += 2) buf.writeInt16LE(Math.max(-32768, Math.min(32767, p.readInt16LE(i) + buf.readInt16LE(s * RATE * 2 + i))), s * RATE * 2 + i); }
  fs.writeFileSync(path.join(out, `${name}.wav`), wav(buf));
}
JS
afconvert -f m4af -d aac -b 96000 -s 0 "$OUT/marker-60min.wav" "$OUT/marker-60min.m4a"
afconvert -f m4af -d aac -b 96000 -s 0 "$OUT/marker-5min.wav" "$OUT/marker-5min.m4a"
rm -rf "$OUT/parts" "$OUT/marker-60min.wav"   # 60-min PCM would exceed the 100 MB cap; keep only the AAC
for f in "$OUT"/*.m4a "$OUT"/*.wav; do echo "$(basename "$f"): $(afinfo "$f" | grep -E 'estimated duration' | sed 's/.*: //') s, $(stat -f %z "$f") bytes"; done
