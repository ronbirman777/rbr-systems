#!/usr/bin/env python3
"""
Resample the two photographs that land below print resolution in the layout.

Every image in `images/` is placed at a known width on the A4 sheet, which fixes
its effective dpi. Most of them clear 300 dpi comfortably. Two do not, because the
only originals available are small:

    hero-pool-resort.jpg        placed 210.0 mm full bleed   1000 px -> 121 dpi
    shala-outdoor-meditation.jpg  placed  76.5 mm             576 px -> 191 dpi

This script resamples those two up to 300 dpi at their placed size with Lanczos,
then restores the local contrast that interpolation flattens. It does NOT recover
detail that was never in the file — it only replaces the naive scaling a PDF
viewer or printer RIP would otherwise do at output time, which measurably reduces
the softness. A genuinely higher-resolution original is still the real fix.

Untouched originals live in `images/source/`; this script only ever reads from
there, so it is safe to re-run and the resampling is reversible.

Usage:  python3 prepare_images.py
"""
import os

from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, "images", "source")
OUT = os.path.join(HERE, "images")

MM_PER_INCH = 25.4
TARGET_DPI = 300

# filename -> width in mm at which the layout places it
PLACEMENTS = {
    "hero-pool-resort.jpg": 210.0,
    "shala-outdoor-meditation.jpg": 76.5,
}


def prepare(name, placed_mm):
    src = Image.open(os.path.join(SOURCE, name)).convert("RGB")
    target_w = round(TARGET_DPI * placed_mm / MM_PER_INCH)
    if src.width >= target_w:
        print("%-30s already %d px, no resampling needed" % (name, src.width))
        return

    out = src.resize((target_w, round(target_w * src.height / src.width)), Image.LANCZOS)
    # Radius scaled to the upsample factor so the halo stays sub-pixel at 300 dpi.
    out = out.filter(ImageFilter.UnsharpMask(radius=1.6, percent=72, threshold=3))
    path = os.path.join(OUT, name)
    out.save(path, quality=90, subsampling=0, progressive=True, optimize=True)

    print("%-30s %d -> %d px  (%d -> %d dpi at %.1f mm)  %.0f KB" % (
        name, src.width, out.width,
        round(src.width * MM_PER_INCH / placed_mm), TARGET_DPI, placed_mm,
        os.path.getsize(path) / 1024))


if __name__ == "__main__":
    for name, placed_mm in PLACEMENTS.items():
        prepare(name, placed_mm)
