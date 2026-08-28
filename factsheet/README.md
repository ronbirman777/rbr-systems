# Wonderland Healing Center — Property Factsheet

Two-page A4 (210 × 297 mm) print-quality property factsheet, built for PDF export
and distribution to travel agents, retreat organizers, wellness partners and tour
operators.

## Files

| File | Purpose |
| --- | --- |
| `wonderland-factsheet.html` | **Source.** Edit this. References `fonts/` and `images/` locally. |
| `wonderland-factsheet-standalone.html` | Single self-contained file (fonts + photos inlined). Use this to email or hand off without the folder. |
| `wonderland-factsheet.pdf` | Exported 2-page A4 PDF. |
| `build.py` | Regenerates the standalone HTML and the PDF from the source. |
| `images/` | Wonderland photography used in the layout. |
| `fonts/` | Playfair Display + Inter, latin subset, self-hosted so print output is identical offline. |

## Rebuilding

```
python3 build.py            # standalone HTML + PDF
python3 build.py --html     # standalone HTML only (no Chrome needed)
CHROME=/path/to/chrome python3 build.py
```

## Manual PDF export

Open `wonderland-factsheet.html` in Chrome › **Print**:

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
| Page 1 hero | `hero-pool-resort.jpg` |
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

### Resolution note

The hero photograph is 1000 × 666 px, which is roughly 120 dpi when placed at full
A4 width. That is fine for a PDF that will be read on screen or desk-printed, but
it is below the 300 dpi wanted for offset litho. A higher-resolution original of
the pool image would lift the hero for commercial print; every other image is
placed small enough that its resolution holds up.
