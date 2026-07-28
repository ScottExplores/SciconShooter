# Scicon Neon dashboard icons v2

Five static, safely padded dashboard glyphs in the Scicon Neon-Frame palette.

- Sheet: `dashboard-nav-icons-static.png`
- Grid: 5 columns × 1 row
- Cell: 256 × 256
- Order: Proposals, Trophies, Home, Hangar, More
- Runtime selection light remains on the tab frame; the glyph geometry does not animate.
- Boss Archive command: `boss-archive-defeated-emblem-v1.png` (384 × 384 transparent PNG), a defeated mechanical-boss skull with a piercing energy spear.

The built-in image generator produced a flat-magenta keyed source. The installed image-generation helper produced `tools/generated-image-sources/scicon-neon-dashboard-icons-v2/dashboard-nav-icons-transparent-source.png`, and `tools/build-scicon-neon-dashboard-icons-v2.py` normalizes the approved silhouettes into the production strip. Only the optimized runtime sheet is shipped from `public/`.

Generation prompt summary: a strict five-cell pixel-art UI strip with a proposal document, research trophy, home ship/dock, three-ship hangar squad, and three connected menu nodes; midnight navy chrome, cyan and emerald rails, restrained research gold, no text, no logos, no cell overlap.
