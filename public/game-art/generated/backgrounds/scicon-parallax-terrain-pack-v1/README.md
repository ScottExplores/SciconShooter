# Scicon Parallax Terrain Pack v1

This pack extends the existing Desert Terrain, River Terrain, Menu Hero, BG Back,
and space parallax artwork into long production-ready round backgrounds.

## Included

- Three `512 x 4096` vertical round-master PNG files: Desert,
  River, and Space.
- Three transparent 3 x 3 prop atlases and 27 individual `256 x
  256` prop PNG files.
- Three scroll-preview GIF files for the Sprite Gallery. GIFs are previews only.
- `pack-manifest.json` with layer speeds, paths, anchors, and implementation notes.

## Runtime protocol

Use the selected terrain's `roundMaster` as one scrolling Sprite for a normal
round. The source art is repeated internally with `256`-pixel cosine
crossfades, so there are no hard joins inside the strip. Place props separately
from manifest data to create foreground depth and vary each run.

If a round needs more than `4096` art pixels, queue a second copy and
crossfade the handoff over `256` pixels. Do not hard-wrap the bottom edge to
the top edge. Keep collision shapes and gameplay text independent from these PNGs.

The original background files remain unchanged and can still be used as slower
far layers, as listed in the manifest.
