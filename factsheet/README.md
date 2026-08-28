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
| `prepare_images.py` | Normalises every photograph to 300 dpi at the size the layout places it. |
| `images/` | Print-ready Wonderland photography. |
| `images/source/` | Untouched originals. The only thing `prepare_images.py` reads. |
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

| Slot | File | Caption |
| --- | --- | --- |
| Page 1 hero (pool variant) | `hero-pool-resort.jpg` | — |
| Page 1 hero (shala variant) | `hero-shala-interior.jpg` | — |
| Page 2 anchor | `restaurant-lounge.jpg` | Open-Air Restaurant |
| Gallery `t1` | `tropical-pathway.jpg` | Tropical Grounds |
| Gallery `t2` | `shala-yoga-class.jpg` | Yoga Shala |
| Gallery `t3` | `group-poolside.jpg` | Groups & Trainings |
| Gallery `t4` | `pool-wellness.jpg` | Swimming Pool |
| Gallery `t5` | `herbal-sauna-dome.jpg` | Herbal Sauna |
| Gallery `t6` | `aerial-yoga.jpg` | Aerial Yoga |

Each plate has a fixed aspect ratio, and `object-fit: cover` crops the photograph
to it. A source wider than its plate loses its sides, a narrower one loses top and
bottom — so when swapping a photograph, check which way it crops and set
`object-position` accordingly. The group photograph sits in `t3`, the widest
plate, precisely so that no one is cropped out of it.

### Known gaps

One subject from the design brief still has **no Wonderland photograph
available**, so nothing was invented or substituted for it:

- **Private accommodation** — guest rooms and dormitories.

The dining room is covered indirectly: the page 2 anchor shows the open-air
restaurant, but there is still no photograph of the food itself.

To add a photograph later, drop the original into `images/source/`, add it to
`PLACEMENTS` in `prepare_images.py` with the width of the plate it goes in, point
the corresponding `.plate` at it in **both** HTML variants, then rerun
`prepare_images.py` and `build.py`.

### Resolution

`PLACEMENTS` in `prepare_images.py` records the width in millimetres at which
the layout places each photograph, which fixes the pixel width it needs at
300 dpi. The script resamples every original to exactly that, in both directions:

- **Upsampled** — the two heroes (121 and 136 dpi as supplied) and
  `pool-wellness.jpg` (240 dpi). Lanczos plus an unsharp pass replaces the naive
  scaling a PDF viewer or printer RIP would do at output time, which measurably
  reduces softness. It does **not** recover detail that was never in the file, so
  **higher-resolution originals of the two heroes are still the real fix for
  offset litho** — ask the property for the camera files.
- **Downsampled** — everything else. `herbal-sauna-dome.jpg` arrived at 1471 dpi
  for its 26 mm plate; those pixels cannot print and only inflate the PDF.

The shala-interior hero is a phone frame held portrait, so the 2.04:1 hero band
keeps only 28 % of its height. The same room shot landscape would lose far less.
