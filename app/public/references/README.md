# GPT Image 2 reference bundle

The Life Sketch image-edit call (`generateLifeSketch`) optionally accepts
two reference images alongside the locked Three.js anchor. Drop these
files here so the route loader picks them up. Both are content tasks and
ship as binary; do not commit the binaries unless explicitly approved.

Required filenames (case-sensitive):

- `brand-v3-poster.png` — Built-To-Kanso brand v3 atmospheric poster.
  Provides the brand's tonal language (sumi-e, washi, equatorial light)
  to GPT Image 2 so the materialized HDB interior reads on-brand.
- `japandi-material-board.png` — Japandi material board for HDB context.
  Light oak floor, off-white limewash walls, sheer linen curtains, plain
  wooden-bladed ceiling fan. Avoid Kyoto/temple/Nordic-snow drift.

Both are optional. When absent, the route falls back to single-image
edit (anchor only). When present, each reference's bytes participate in
the sketch cache key, so swapping a reference invalidates cached output.

## Hard rule

Image 1 (the anchor) is the structural source of truth. References are
atmospheric only. If GPT Image 2 ever drifts away from anchor geometry,
remove the references and re-run with anchor only.
