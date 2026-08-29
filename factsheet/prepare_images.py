#!/usr/bin/env python3
"""
Normalise every photograph in the layout to 300 dpi at the size it is placed.

The A4 sheet places each image at a fixed width in millimetres, which fixes the
pixel width it actually needs. PLACEMENTS below records those widths, so this
file doubles as the resolution spec for the document.

Originals rarely arrive at that size:

  * Too small — a 1000 px pool photograph across the 210 mm full-bleed hero is
    121 dpi. Upsampling with Lanczos and restoring the local contrast that
    interpolation flattens replaces the naive scaling a PDF viewer or printer
    RIP would do at output time, which measurably reduces softness. It does NOT
    recover detail that was never in the file — a higher-resolution camera
    original is still the real fix.

  * Too large — a 1500 px photograph in a 26 mm gallery tile is 1470 dpi. Those
    pixels cannot print; they only inflate the PDF, so they are resampled down.

Originals live untouched in `images/source/` and are the only thing this script
reads, so it is safe to re-run and every step is reversible.

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
    # page 1 hero, full bleed (one per variant)
    "hero-pool-resort.jpg": 210.0,
    "hero-shala-interior.jpg": 210.0,
    # page 2 anchor
    "restaurant-lounge.jpg": 76.5,
    # page 2 gallery: spans of 4, 3, 5, 4, 2 and 3 of the 12 columns
    "bungalows-pond.jpg": 56.3,       # t1
    "shala-yoga-class.jpg": 41.1,     # t2
    "lounge-community.jpg": 71.5,     # t3
    "yoga-class-studio.jpg": 56.3,    # t4
    "aerial-yoga.jpg": 25.9,          # t5
    "herbal-sauna-dome.jpg": 41.1,    # t6
}


def prepare(name, placed_mm):
    src = Image.open(os.path.join(SOURCE, name)).convert("RGB")
    target_w = round(TARGET_DPI * placed_mm / MM_PER_INCH)
    if src.width == target_w:
        print("%-28s already %d px" % (name, src.width))
        return

    out = src.resize((target_w, round(target_w * src.height / src.width)), Image.LANCZOS)
    # Upsampling needs the stronger pass; downsampling only needs the edge
    # definition that any resample softens.
    if target_w > src.width:
        out = out.filter(ImageFilter.UnsharpMask(radius=1.6, percent=72, threshold=3))
        verb = "up"
    else:
        out = out.filter(ImageFilter.UnsharpMask(radius=0.8, percent=40, threshold=3))
        verb = "down"

    path = os.path.join(OUT, name)
    out.save(path, quality=90, subsampling=0, progressive=True, optimize=True)
    print("%-28s %5d -> %4d px  %-4s (%4d -> %d dpi at %5.1f mm)  %4.0f KB" % (
        name, src.width, out.width, verb,
        round(src.width * MM_PER_INCH / placed_mm), TARGET_DPI, placed_mm,
        os.path.getsize(path) / 1024))


if __name__ == "__main__":
    for name, placed_mm in sorted(PLACEMENTS.items()):
        prepare(name, placed_mm)
