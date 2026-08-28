# Wonderland Healing Center — Property Factsheet

Two-page A4 (210 × 297 mm) print-quality property factsheet, built for PDF export
and distribution to travel agents, retreat organizers, wellness partners and tour
operators.

## Files

There are two variants of the same document. They are identical apart from the
page 1 hero photograph — layout, copy and the whole of page 2 are shared.

| File | Purpose |
| --- | --- |
| `wonderland-factsheet.html` | **Source, pool hero.** Edit this. |
| `wonderland-factsheet-shala.html` | **Source, shala-interior hero.** |
| `factsheet.css` | The layout, shared by both variants so they cannot drift apart. |
| `*-standalone.html` | One self-contained file per variant (CSS, fonts and photos inlined). Use these to email or hand off without the folder. |
| `*.pdf` | Exported 2-page A4 PDF per variant. |
| `build.py` | Regenerates the standalone HTML and the PDF for every variant. |
| `prepare_images.py` | Resamples the two photographs that fall below print resolution. |
| `images/` | Print-ready Wonderland photography. |
| `images/source/` | Untouched originals of the two resampled photographs. |
| `fonts/` | Playfair Display + Inter, latin subset, self-hosted so print output is identical offline. |

## Rebuilding

```
python3 build.py                                  # both variants
python3 build.py --html                           # standalone HTML only (no Chrome)
python3 build.py wonderland-factsheet-shala.html  # one variant
CHROME=/path/to/chrome python3 build.py
```

## Manual PDF export

Open either source HTML in Chrome › **Print**:

- Destination: **Save as PDF**
- Paper size: **A4**
- Margins: **None**
- Scale: **100 %** (do not use "Fit to page")
- **Background graphics: ON**

The page geometry is fixed in millimetres and `@page { size: A4; margin: 0 }` is
set, so the result is two exact A4 sheets with no browser margins and no content
clipping. Both pages also display as exact A4 sheets on screen.

## Visual system

| Role | Value |
| --- | --- |
| Background | Warm Parchment `#F4EFE5` |
| Primary | Deep Forest `#2D4A32` |
| Secondary | Muted Sage `#7A9E7E` |
| Accent | Warm Gold `#C4A35A` |
| Text | Dark warm charcoal `#33302A` |
| Display type | Playfair Display (serif) |
| Facts & captions | Inter (sans) |

Structure is carried by hairline rules (0.3 mm) rather than cards: no rounded
corners, no shadows, no gradients, no app UI components.

## Layout

**Page 1** — full-bleed cinematic hero (103 mm, 34.7 % of page height) · lotus
emblem · masthead · location · disciplines · intro · four-section factsheet grid
on deliberately unequal columns (16 / 25 / 25 / 34) with sage dividers in the
gutters · "Page 1 of 2" marker.

**Page 2** — section title with sage rule · two-column composition (four editorial
highlights left, one vertical anchor image right) · six-image asymmetric gallery
on a 12-column grid, one plate spanning two rows and one spanning two columns ·
Deep Forest footer strip.

## Photography

All imagery is real Wonderland material, taken from the 2026/27 retreat flyer and
the repository's `enviorment pics/` set.

| Slot | File |
| --- | --- |
| Page 1 hero (pool variant) | `hero-pool-resort.jpg` |
| Page 1 hero (shala variant) | `hero-shala-interior.jpg` |
| Page 2 anchor | `shala-outdoor-meditation.jpg` |
| Gallery | `tropical-pathway.jpg`, `shala-yoga-class.jpg`, `shala-flower-ceremony.jpg`, `pool-wellness.jpg`, `lotus-pond.jpg`, `plantbased-coconut.jpg` |

### Known gaps

Three gallery subjects from the design brief have **no Wonderland photograph
available** in the supplied material, so nothing was invented or substituted for
them:

1. **Private accommodation** (guest rooms / dormitories)
2. **Plant-based cuisine** — a plated meal or restaurant shot. The gallery
   currently uses a fresh coconut, which is genuine but is not the dining room.
3. **Herbal steam sauna / cold plunge**

To drop them in later, replace the `src` of the corresponding `.plate` in
`wonderland-factsheet.html` and rerun `build.py`. Suggested swaps: accommodation →
`t1`, cuisine → `t6`, sauna/plunge → `t5`.

### Resolution

Each image is placed at a known width, which fixes its effective dpi. Most clear
300 dpi as supplied. Three did not, because the only originals available are small:

| Image | Placed at | Original | As supplied | Now |
| --- | --- | --- | --- | --- |
| `hero-pool-resort.jpg` | 210 mm full bleed | 1000 px | 121 dpi | 2480 px, 300 dpi |
| `hero-shala-interior.jpg` | 210 mm full bleed | 1125 px | 136 dpi | 2480 px, 300 dpi |
| `shala-outdoor-meditation.jpg` | 76.5 mm | 576 px | 191 dpi | 904 px, 300 dpi |

`prepare_images.py` resamples those from `images/source/` with Lanczos and
restores the local contrast interpolation flattens. This replaces the naive
scaling a PDF viewer or printer RIP would do at output time, and measurably
reduces softness at 300 dpi — but it does not recover detail that was never in
the file. **Higher-resolution originals of the hero photographs are still the real
fix for offset litho**; ask the property for the camera files. The shala interior
is a phone frame held portrait, so the 2.04:1 hero band keeps only 28 % of its
height — the same room shot landscape would lose far less.

`pool-wellness.jpg` sits at 240 dpi and was left alone — that is within normal
print tolerance, and resampling it would add artefacts without adding detail.
