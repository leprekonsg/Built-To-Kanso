# GPT Image 2 reference bundle

The Life Sketch image-edit call always sends structural inputs first:
Image 1 is the locked camera-view greybox anchor and Image 2 is the
top-down plan proof. Optional style references come after those.

Regenerate the local PNGs with:

```bash
npm run prebake:references
```

Required filenames (case-sensitive):

- `brand-v3-poster.png` — Built-To-Kanso brand v3 atmospheric poster.
  Provides the brand's tonal language (sumi-e, washi, equatorial light)
  to GPT Image 2 so the materialized HDB interior reads on-brand.
- `hdb-material-board.png` — HDB material board for local context.
  Light oak floor, off-white limewash walls, sheer linen curtains, plain
  wooden-bladed ceiling fan. Avoid Kyoto/temple/Nordic-snow drift.

`japandi-material-board.png` is still read as a legacy fallback. These
style references are optional. When present, each reference's bytes
participate in the sketch cache key.

The generated PNGs contain no visible text, logos, rooms, or compliance
geometry. They are atmosphere and material references only.

## Hard rule

Image 1 locks camera and visible geometry. Image 2 is topology support
only. Style references are atmospheric only.
