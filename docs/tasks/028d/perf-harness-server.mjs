/**
 * CP4 performance harness.
 *
 * Serves the REAL rendered Guest HTML and a faithful model of the real
 * /api/media route, so before/after numbers come from the actual markup
 * and the actual request shape rather than from a guess.
 *
 * What is real here:
 *   - the HTML and CSS the Guest App actually renders
 *   - the number of image requests, their order, and their loading
 *     attributes
 *   - whether a tab switch refetches
 *   - response headers and therefore browser cache behaviour
 *
 * What is modelled:
 *   - database latency. The real route does three DB round trips per
 *     image (published_spaces select, tenants select, get_guest_access_mode
 *     RPC) plus a createSignedUrl call, then 302s. Each is modelled as a
 *     fixed delay, identical before and after, so the LCP DELTA is honest
 *     even though the absolute value is not Staging's.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { randomUUID } from "node:crypto";

const ROOT = process.argv[2];
const PORT = Number(process.argv[3] || 4178);

// One DB round trip, modelled. Staging is a remote Postgres; 25ms is a
// deliberately CONSERVATIVE single-trip estimate (real cross-region is
// often worse), and it is identical in the before and after runs.
const DB_MS = Number(process.env.DB_MS || 25);
const DB_TRIPS = 3;            // published_spaces, tenants, get_guest_access_mode
const SIGN_MS = Number(process.env.SIGN_MS || 20); // createSignedUrl
const STORAGE_MS = Number(process.env.STORAGE_MS || 30); // Storage edge

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ALLOWED_WIDTHS = new Set([96, 160, 320, 480, 640, 960, 1280, 1600]); // mirrors MEDIA_WIDTHS
const NATURAL_WIDTH = { "hero.png": 1600, "logo.png": 256, "card-1.png": 800, "card-2.png": 800, "card-3.png": 800, "card-4.png": 800, "profile.png": 600 };
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".webp": "image/webp", ".jpg": "image/jpeg", ".png": "image/png", ".js": "text/javascript" };

// Set by the variant under test. "legacy" reproduces today's behaviour.
const MODE = process.env.MEDIA_MODE || "legacy";

// Ground truth for "did this actually reach the server". The browser
// fires a request event even when it answers from cache, so counting in
// the page overstates network work; this does not.
const stats = { apiMedia: 0, storage: 0, storageBytes: 0, html: 0 };

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;

  if (p === "/__stats") {
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    return res.end(JSON.stringify(stats));
  }
  if (p === "/__stats/reset") {
    for (const k of Object.keys(stats)) stats[k] = 0;
    res.writeHead(200, { "Cache-Control": "no-store" });
    return res.end("ok");
  }

  // ---- modelled /api/media ------------------------------------------
  if (p.startsWith("/api/media/")) {
    stats.apiMedia++;
    const objectPath = p.slice("/api/media/".length);
    await sleep(DB_MS * DB_TRIPS);

    const w = url.searchParams.get("w");

    if (MODE === "legacy") {
      // Today: mint a NEW signed URL every time (new token => new cache
      // key => the browser can never reuse the bytes), 302, no-store.
      await sleep(SIGN_MS);
      res.writeHead(302, {
        Location: `/storage/${objectPath}?token=${randomUUID()}`,
        "Cache-Control": "private, no-store",
      });
      return res.end();
    }

    // "cached": a published, versioned, PUBLIC path is immutable, so the
    // redirect target is stable and the redirect itself is cacheable.
    // A width on the allowlist is forwarded as a Storage render request.
    await sleep(SIGN_MS);
    const q = w && ALLOWED_WIDTHS.has(Number(w)) ? `?v=1&w=${w}` : "?v=1";
    res.writeHead(302, {
      Location: `/storage/${objectPath}${q}`,
      "Cache-Control": "public, max-age=300, immutable",
    });
    return res.end();
  }

  // ---- modelled Storage ---------------------------------------------
  if (p.startsWith("/storage/")) {
    stats.storage++;
    await sleep(STORAGE_MS);
    // A published ref ends ".../published.<file>"; the fixture media is
    // stored under its bare filename.
    const name = (p.split("/").pop() || "").replace(/^published\./, "");
    const file = join(ROOT, "media", name);
    if (!existsSync(file)) { res.writeHead(404); return res.end(`missing ${name}`); }
    let body = readFileSync(file);

    // Model Storage's width render. The bytes do not have to be a real
    // resize for this measurement - what matters is the transfer size the
    // browser actually pulls, so the payload is scaled by area ratio
    // against the asset's natural width.
    const want = Number(url.searchParams.get("w") || 0);
    const natural = NATURAL_WIDTH[name] || 0;
    if (want && natural && want < natural) {
      const ratio = (want / natural) ** 2;
      body = body.subarray(0, Math.max(2048, Math.round(body.length * ratio)));
    }
    stats.storageBytes += body.length;
    res.writeHead(200, {
      "Content-Type": MIME[extname(file)] || "application/octet-stream",
      "Content-Length": body.length,
      // Supabase signs per-request, so a fresh token is effectively
      // uncacheable in the legacy mode regardless of this header.
      "Cache-Control": "public, max-age=31536000, immutable",
    });
    return res.end(body);
  }

  // ---- static ---------------------------------------------------------
  const file = join(ROOT, p === "/" ? "index.html" : p.replace(/^\//, ""));
  if (!existsSync(file)) { res.writeHead(404); return res.end("not found"); }
  const body = readFileSync(file);
  res.writeHead(200, { "Content-Type": MIME[extname(file)] || "text/plain", "Content-Length": body.length, "Cache-Control": "no-cache" });
  res.end(body);
});

server.listen(PORT, () => console.log(`harness on ${PORT} mode=${MODE} db=${DB_MS}x${DB_TRIPS}ms sign=${SIGN_MS}ms storage=${STORAGE_MS}ms`));
