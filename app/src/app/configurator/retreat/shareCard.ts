import { mixHex } from "@/lib/theme/contrast";
import { GUEST_BASE_PALETTE } from "@/lib/theme/tokens";

/**
 * The Retreat Share Card - a finished digital invitation, not a raw QR
 * export. One drawing function, called against differently-sized canvases
 * (a small preview canvas inside Share Your Space, and the full 1080x1350
 * export canvas used for Save/Share) - both always draw in the same
 * 1080x1350 logical coordinate space via ctx.scale(), so the preview is
 * pixel-faithful to what actually gets shared, never a separate
 * approximation drifting out of sync with it.
 *
 * Design language deliberately reused from the approved Time to Flow
 * Guest App itself (today-screen.tsx / facilitators-screen.tsx), not
 * invented fresh for this card:
 *  - a photo/color "hero" band with a directional dark-overlay gradient
 *    for guaranteed text legibility, never a flat color swap that fights
 *    a light organizer color - same technique TodayScreen's own hero
 *    photo uses (rgba(0,0,0,x) top-to-bottom, text pinned to one edge).
 *  - a small uppercase-tracked "kicker" label paired with a large
 *    sentence-case DM Serif Display headline directly below it - the
 *    exact "Your Guides" -> "Meet the Facilitators" pairing, not
 *    everything shouting in caps.
 *  - the identity lockup (logo + a small label) sits inline near the top
 *    of the hero, the same position TodayScreen places its own
 *    logo+tenant-name row - not an isolated floating badge.
 *  - parchment/cream as the dominant surrounding surface, with the
 *    organizer's Primary color reserved for the one true "hero" moment
 *    and Accent used only as a restrained detail (a thin rule), matching
 *    how Primary is reserved for the single "Happening Now" card rather
 *    than painted across the whole screen.
 *  - rounded-2xl cards with a subtle ~30-50%-mixed border, not a stark
 *    color-inverted block.
 */
export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

export type ShareCardOptions = {
  name: string;
  logoUrl: string | null;
  /** The PUBLISHED Hero image URL (via the public media route, the exact
   * same one guests already see) - never a draft ref, never a new
   * Storage copy. Null falls back to a branded Primary-color treatment. */
  heroImageUrl: string | null;
  qrUrl: string;
  primaryHex: string;
  secondaryHex: string;
};

const PARCHMENT = GUEST_BASE_PALETTE.parchment;
const CREAM = GUEST_BASE_PALETTE.cream;
const FOREST = GUEST_BASE_PALETTE.forest;
const DUSK = GUEST_BASE_PALETTE.dusk;
const MIST = GUEST_BASE_PALETTE.mist;
const SAND = GUEST_BASE_PALETTE.sand;

async function loadBitmap(url: string): Promise<ImageBitmap> {
  // Fetch + createImageBitmap(blob) rather than new Image()+drawImage -
  // once the bytes are safely in a Blob, drawing them never taints the
  // canvas regardless of the origin's CORS headers, so toBlob()/toDataURL
  // on the finished card keeps working for Save/Share either way.
  //
  // Deliberately the default (no `credentials: "include"`): the QR route
  // is same-origin and needs the session cookie regardless, which the
  // browser attaches to same-origin requests automatically. The logo URL
  // is a signed Supabase Storage URL carrying its own auth in the query
  // string - fetching it credentialed fails outright, because Supabase
  // Storage serves `Access-Control-Allow-Origin: *`, and browsers reject
  // any credentialed cross-origin request against a wildcard ACAO
  // (confirmed directly: `fetch(signedUrl, {credentials:"include"})`
  // throws "Failed to fetch"; the same call without it succeeds).
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load image: ${url}`);
  const blob = await res.blob();
  return createImageBitmap(blob);
}

function drawTrackedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  y: number,
  letterSpacingPx: number
) {
  // Manual letter-spacing draw (not ctx.letterSpacing) - broader browser
  // support, including older mobile Safari, than the experimental
  // CanvasRenderingContext2D.letterSpacing property.
  const widths = [...text].map((ch) => ctx.measureText(ch).width);
  const totalWidth = widths.reduce((a, b) => a + b, 0) + letterSpacingPx * (text.length - 1);
  let x = centerX - totalWidth / 2;
  const align = ctx.textAlign;
  ctx.textAlign = "left";
  [...text].forEach((ch, i) => {
    ctx.fillText(ch, x, y);
    x += widths[i] + letterSpacingPx;
  });
  ctx.textAlign = align;
}

/** Greedy word-wrap into at most `maxLines`; returns null if it doesn't
 * fit at the given font size even wrapped, so the caller can shrink and
 * retry - this is what makes long retreat names degrade gracefully
 * instead of overflowing or getting silently clipped. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] | null {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
      if (lines.length >= maxLines) return null;
    }
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) return null;
  if (lines.some((l) => ctx.measureText(l).width > maxWidth)) return null;
  return lines;
}

/** Sentence case throughout (never force-uppercased) - matching how
 * TodayScreen renders "Good morning." and FacilitatorsScreen renders a
 * facilitator's own name: real content in this design language is never
 * shouted in caps, only short meta labels are. */
function fitTitle(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startPx: number,
  minPx: number
): { px: number; lines: string[] } {
  for (let px = startPx; px >= minPx; px -= 3) {
    ctx.font = `400 ${px}px "DM Serif Display", serif`;
    const oneLine = wrapText(ctx, text, maxWidth, 1);
    if (oneLine) return { px, lines: oneLine };
    const twoLines = wrapText(ctx, text, maxWidth, 2);
    if (twoLines) return { px, lines: twoLines };
  }
  ctx.font = `400 ${minPx}px "DM Serif Display", serif`;
  const forced = wrapText(ctx, text, maxWidth, 2) ?? [text];
  return { px: minPx, lines: forced.slice(0, 2) };
}

/** CSS `object-fit: cover` semantics - fills the target box exactly,
 * cropping whichever axis overflows, never distorting aspect ratio. */
function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: ImageBitmap,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const imgRatio = img.width / img.height;
  const boxRatio = w / h;
  let sx = 0;
  let sy = 0;
  let sw = img.width;
  let sh = img.height;
  if (imgRatio > boxRatio) {
    sw = img.height * boxRatio;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / boxRatio;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function drawShareCard(canvas: HTMLCanvasElement, options: ShareCardOptions): Promise<void> {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Ensure the webfont is actually ready before measuring/drawing text
  // with it - a well-known Canvas gotcha (drawing text before a webfont
  // finishes loading silently falls back to a system font).
  try {
    await document.fonts.load('400 76px "DM Serif Display"');
    await document.fonts.load('italic 400 32px "DM Serif Display"');
    await document.fonts.load('600 24px "DM Sans"');
    await document.fonts.ready;
  } catch {
    // Font API unavailable/failed - draw with whatever's already
    // resolved rather than blocking the card entirely.
  }

  const scale = canvas.width / CARD_WIDTH;
  ctx.save();
  ctx.scale(scale, scale);
  ctx.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  const centerX = CARD_WIDTH / 2;

  // ---- Body ground: parchment, the same fixed neutral the whole Guest
  // App is built on - never derived from the organizer's own color, so
  // the QR's contrast and quiet zone are never at the mercy of their
  // brand choice (§D). ----
  ctx.fillStyle = PARCHMENT;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // ---- Hero: full-bleed, the dominant visual - the actual published
  // Hero Photography whenever one exists, exactly like TodayScreen's own
  // hero photo (object-cover + a directional dark overlay for legible
  // text), so the card reads as an extension of the real Guest App
  // rather than a generic color card with a small image pasted inside
  // it. Falls back to a branded Primary-color treatment only when no
  // Hero image is configured. ----
  const heroHeight = 600; // ~44% of CARD_HEIGHT - photography-led but not dominant
  let heroIsPhoto = false;
  if (options.heroImageUrl) {
    try {
      const hero = await loadBitmap(options.heroImageUrl);
      drawImageCover(ctx, hero, 0, 0, CARD_WIDTH, heroHeight);
      heroIsPhoto = true;
    } catch {
      // Falls through to the branded color treatment below.
    }
  }
  if (!heroIsPhoto) {
    const heroDeep = mixHex(options.primaryHex, "#0F1F17", 0.55);
    const heroGrad = ctx.createLinearGradient(0, 0, CARD_WIDTH, heroHeight);
    heroGrad.addColorStop(0, options.primaryHex);
    heroGrad.addColorStop(1, heroDeep);
    ctx.fillStyle = heroGrad;
    ctx.fillRect(0, 0, CARD_WIDTH, heroHeight);
  }

  // Directional overlay - lighter at the very top (identity lockup still
  // needs to read against sky/foliage), heaviest at the bottom (where
  // the retreat name sits) - the exact today-screen.tsx technique,
  // tuned slightly heavier here since a photo has far more visual noise
  // than a flat gradient.
  const overlay = ctx.createLinearGradient(0, 0, 0, heroHeight);
  overlay.addColorStop(0, "rgba(10,14,12,0.32)");
  overlay.addColorStop(0.4, "rgba(10,14,12,0.08)");
  overlay.addColorStop(0.72, "rgba(10,14,12,0.28)");
  overlay.addColorStop(1, "rgba(10,14,12,0.72)");
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, CARD_WIDTH, heroHeight);

  // Identity lockup - logo and kicker as ONE tight left-anchored group
  // (not split across the width) - exactly where TodayScreen places its
  // own logo+tenant-name row, never an isolated floating badge.
  const identityY = 84;
  let cursorX = 64;
  if (options.logoUrl) {
    try {
      const logo = await loadBitmap(options.logoUrl);
      const boxH = 40;
      const boxW = 96;
      const fit = Math.min(boxW / logo.width, boxH / logo.height, 1);
      const w = logo.width * fit;
      const h = logo.height * fit;
      ctx.drawImage(logo, cursorX, identityY - h / 2, w, h);
      cursorX += w + 16;
    } catch {
      // Logo failed to load - the kicker alone still anchors the lockup
      // (see "if no Logo exists, layout should remain intentional").
    }
  }
  ctx.fillStyle = "rgba(253,250,244,0.78)";
  ctx.font = '600 19px "DM Sans", sans-serif';
  ctx.textAlign = "left";
  ctx.fillText("TIME TO FLOW", cursorX, identityY + 6);
  ctx.textAlign = "center";

  // Retreat name - the dominant editorial element, pinned to the bottom
  // of the photo (same placement as "Good morning." on the real hero),
  // sentence case, large DM Serif Display, never uppercase.
  const { px: titlePx, lines: titleLines } = fitTitle(ctx, options.name, 920, 88, 46);
  ctx.font = `400 ${titlePx}px "DM Serif Display", serif`;
  ctx.fillStyle = "#FDFAF4";
  const lineHeight = titlePx * 1.14;
  const titleBottomY = heroHeight - 64;
  const titleTopY = titleBottomY - (titleLines.length - 1) * lineHeight;
  titleLines.forEach((line, i) => {
    drawTrackedText(ctx, line, centerX, titleTopY + i * lineHeight, 0.2);
  });

  // ---- Body: parchment ground, a quiet transition straight into the QR,
  // no filler copy - a short kicker label, a small Accent-colored detail,
  // then the QR itself, then the footer. Fixed budget, arithmetic-
  // checked to fit CARD_HEIGHT (previous versions of this function
  // overflowed exactly this way and were caught only by rendering and
  // measuring, not by inspection alone). ----
  let cursorY = heroHeight + 60; // = 660

  ctx.fillStyle = MIST;
  ctx.font = '600 20px "DM Sans", sans-serif';
  drawTrackedText(ctx, "YOUR RETREAT COMPANION", centerX, cursorY, 3);
  cursorY += 30; // = 690

  // Small Accent-colored detail - a single restrained dot, not a stripe.
  ctx.beginPath();
  ctx.arc(centerX, cursorY, 4, 0, Math.PI * 2);
  ctx.fillStyle = options.secondaryHex;
  ctx.fill();
  cursorY += 42; // = 732

  // QR card - restrained: a thin brand-tinted border, whitespace doing
  // most of the work, shadow only enough to lift it gently off the
  // parchment rather than announce itself. Sized generously - QR
  // scannability takes priority over composition minimalism (§ "must
  // remain large and highly scannable").
  const qrPanel = 460;
  const qrPanelX = centerX - qrPanel / 2;
  const qrPanelY = cursorY;
  ctx.save();
  ctx.shadowColor = "rgba(27,46,36,0.08)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = CREAM;
  roundedRectPath(ctx, qrPanelX, qrPanelY, qrPanel, qrPanel, 24);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = mixHex(PARCHMENT, options.primaryHex, 0.14);
  ctx.lineWidth = 1;
  roundedRectPath(ctx, qrPanelX + 0.5, qrPanelY + 0.5, qrPanel - 1, qrPanel - 1, 24);
  ctx.stroke();

  try {
    const qrImg = await loadBitmap(options.qrUrl);
    const qrSize = 380;
    ctx.drawImage(qrImg, centerX - qrSize / 2, qrPanelY + (qrPanel - qrSize) / 2, qrSize, qrSize);
  } catch {
    // If the QR genuinely fails to load, the card still renders with an
    // empty panel rather than throwing - Save/Share still work, just
    // without a scannable code, which is at least visibly obvious rather
    // than a hard failure.
  }
  cursorY = qrPanelY + qrPanel + 36; // = 732 + 460 + 36 = 1228

  ctx.fillStyle = DUSK;
  ctx.font = '600 20px "DM Sans", sans-serif';
  drawTrackedText(ctx, "SCAN TO OPEN THE RETREAT APP", centerX, cursorY, 2);
  cursorY += 38; // = 1266

  // Footer - a thin hairline + restrained InnerDweS attribution, never
  // competing with the retreat's own identity above. Positioned relative
  // to the content actually above it, not a fixed CARD_HEIGHT anchor.
  const footerRuleY = cursorY;
  ctx.strokeStyle = `${SAND}80`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(centerX - 60, footerRuleY);
  ctx.lineTo(centerX + 60, footerRuleY);
  ctx.stroke();

  ctx.fillStyle = `${FOREST}66`;
  ctx.font = '600 17px "DM Sans", sans-serif';
  drawTrackedText(ctx, "POWERED BY INNERDWES", centerX, footerRuleY + 26, 2);

  ctx.restore();
}

export async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not export image"))), "image/png");
  });
}
