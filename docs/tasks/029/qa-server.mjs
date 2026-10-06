/**
 * The static+media server for the TASK 029 browser QA matrix.
 *
 * Serves the rendered fixtures, the real stylesheet from `next build`,
 * and a stand-in for /api/media that returns a real decodable image at
 * exactly the requested ladder width.
 *
 * WHAT IS REAL: the markup and CSS the app ships, every image request
 * the browser makes, the srcset candidate it picks, and the layout that
 * results. That is what this matrix is grading - overflow, clipping,
 * direction, and whether the chosen render matches the box.
 *
 * WHAT IS MODELLED: the bytes. Staging's own Storage objects are not
 * reachable from here (the Staging service key is write-only in Vercel,
 * so the published guest route fails closed locally - stated plainly in
 * the report rather than worked around). A generated image of the right
 * dimensions is enough for every assertion this file supports, and none
 * of them is about the photograph.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import sharp from "/Users/ronbirman/Desktop/RBR-029-worktree/app/node_modules/sharp/dist/index.cjs";

const ROOT = process.argv[2];
const PORT = Number(process.argv[3] || 4290);
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".webp": "image/webp" };

/** Natural sizes that match the real assets' shapes. */
function natural(file) {
  if (file.startsWith("hero")) return [1600, 1200];
  if (file.startsWith("profile")) return [1200, 1600];
  return [1600, 1067];
}

const cache = new Map();
async function image(file, width) {
  const key = `${file}@${width ?? "nat"}`;
  if (cache.has(key)) return cache.get(key);
  const [nw, nh] = natural(file);
  const w = width ?? nw;
  // Supabase does not upscale, and nor does this.
  const outW = Math.min(w, nw);
  const outH = Math.max(1, Math.round((outW / nw) * nh));
  const buf = await sharp({
    create: { width: outW, height: outH, channels: 3, background: { r: 120, g: 140, b: 120 } },
  })
    .png()
    .toBuffer();
  cache.set(key, buf);
  return buf;
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = decodeURIComponent(url.pathname);

  if (p.startsWith("/api/media/")) {
    const objectPath = p.slice("/api/media/".length);
    const file = objectPath.split("/").pop() ?? "";
    if (file.endsWith(".mp3")) {
      // An audio ref must be reachable, but nothing in this matrix
      // plays it - the player is asserted on its markup and its
      // preload attribute, not on decoded audio.
      res.writeHead(200, { "Content-Type": "audio/mpeg", "Content-Length": "0", "Cache-Control": "public, max-age=60, immutable" });
      return res.end();
    }
    const wRaw = url.searchParams.get("w");
    const w = wRaw ? Number(wRaw) : null;
    const buf = await image(file, w);
    res.writeHead(200, { "Content-Type": "image/png", "Content-Length": buf.length, "Cache-Control": "public, max-age=60, immutable" });
    return res.end(buf);
  }

  const rel = p === "/" ? "/index.html" : p;
  const full = join(ROOT, rel);
  if (!existsSync(full)) {
    res.writeHead(404);
    return res.end("not found");
  }
  res.writeHead(200, { "Content-Type": TYPES[extname(full)] ?? "application/octet-stream" });
  res.end(readFileSync(full));
}).listen(PORT, () => console.error(`qa server on ${PORT} serving ${ROOT}`));
