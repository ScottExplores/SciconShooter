# Combat evolution energy artwork

Generated with the built-in image-generation tool on 2026-09-04. Original
Scicon-inspired artwork, not extracted from Galaxiga. No paid third-party
asset service or Galaxiga artwork was used.

Source: `docs/assets/combat-evolution-energy-sheet.png` (1536 × 1024).
Runtime frames: `public/game-art/generated/scicon-combat-evolution-v1/`.
Rebuild: `node tools/compile-combat-lab-art.mjs`.

The extraction script only chroma-keys the flat magenta background, crops the
fixed 256-pixel grid and downsamples with nearest-neighbor sampling to 128 ×
128. It does not invent or redraw sprite shapes. All output frames have real
alpha. Runtime textures use the existing nearest-neighbor Pixi asset pipeline.

## Accepted direction

BIO: green paired plasma. ETH: icy-violet energy diamonds. BTC: golden energy
pulses. Each uses the same silhouette at every upgrade level; presentation
scales size and wakes without changing collision geometry. Primary fire uses
frames 1–4; signatures use all six frames. RSC art is unchanged.

The six impact-study cells in the final row are extracted as source studies;
they are not wired into combat in this pass. Existing impact effects remain.

## Generation prompt

Use case: stylized-concept. Asset type: gameplay sprite sheet for Scicon
Shooter. 1536x1024 image. EXACTLY 6 columns x4 rows uniform grid, each
cell256x256. Solid flat pure magenta #ff00ff background everywhere between
sprites, NO gradients NO checkerboard NO labels NO lines. Crisp pixel art
(4px clusters), clean readable ARCADE ENERGY PROJECTILES. All point UP,
centered in each cell with generous padding. Critically these are ENERGY
BOLTS, NOT rockets or missiles or ships: no metal, no armor, no fins, no
thrusters, no weapon bodies, no ornate insect silhouettes. The user explicitly
dislikes upgrades evolving into weird rockets. Rows1-3 each show SIX animation
frames of a SAME simple glowing energy bolt, same size/silhouette throughout
row, tiny shifts of interior plasma plus tapering pixel trail below. Row1 BIO
green/lime thin plasma capsule, white hot center, organic subtle paired energy
strands but simple overall shape. Row2 ETH lavender/icy-cyan diamond energy
dart with bright center, clean elongated crystal silhouette. Row3 BTC
gold/amber thick luminous rectangular pulse bolt with rounded pixel corners,
white center, short tapering gold energy wake. Keep actual sprite under80px
wide and160px tall within its256cell. Row4: cells1,2,3 green plasma impact burst
expand/fade, cells4,5,6 gold/cyan spark impact burst expand/fade, similarly
centered. Limited rich arcade palettes, contrasting outlines, color
concentrated within sprites, no hazy effects contaminating magenta background.
Same registration every frame. No text, no rockets, no vehicles. This is a
real exportable sprite atlas, not concept art poster.

## Background correction prompt

Edit this exact sprite sheet: remove ALL background and glow outside the hard
pixel sprites. Replace background with a SINGLE FLAT PURE MAGENTA
RGB255,0,255, #FF00FF. Not green, not gray, not black, not a checkerboard. This
is a chroma key production asset. Preserve all 24 sprites, 6 columns x4 rows,
their exact positions, sizes, pixel shapes and colors. Do not alter
projectiles. The entire image behind these separate sprites must be
completely flat bright pink #FF00FF, identical in every gap. No gradient, no
shadow, no haze, no glow outside the hard pixel outlines. 1536x1024. Actual
visible magenta background is essential for extracting the sprites.
