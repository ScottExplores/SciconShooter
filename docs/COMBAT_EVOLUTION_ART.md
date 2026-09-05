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

## Breakwater sector environment artwork — September 4

Generated with the built-in image tool as original Scicon artwork. No Galaxiga
assets, new rendering library, or 3D engine were used. Runtime files live in
`public/game-art/generated/scicon-breakwater-v1/`:

- `far-space.png`: sparse navy star field and dim cyan nebula.
- `approach.png`: transparent orbital observatory/relay structures.
- `wreckfield.png`: transparent damaged modules, satellites and cargo.
- `gate.png`: transparent drydock/relay towers.

All four are 853 × 1844 PNGs, passed through without image post-processing.
The three landmark strips have actual alpha and an empty central combat lane.
The existing nearest-neighbor Pixi pipeline loads just the selected strip and
shared far layer. Initial preloading warms approach plus the upcoming wreck
field (three textures total), not every campaign background.

Concept and original generation outputs remain in the local generated-images
folder `C:/Users/scott/.codex/generated_images/019ffe92-376c-7141-81f7-b8717e407916/`:

- Concept: `exec-15ff81fa-00fd-4b8d-a1c8-fb73e2b48082.png`.
- Far space: `exec-e26d5c00-94ac-4465-b8ad-3d4062ed6ea8.png`.
- Approach: `exec-5dbbb2b0-aaed-49d4-8739-326053e5bb53.png`.
- Wreck field: `exec-8a003ec0-0c3e-4a48-a60e-9cf0ed3ba64b.png`.
- Gate: `exec-70331d21-b63f-4831-b0b6-395a7b7a42c0.png`.

### Prompt direction

Portrait 390:844 concept of an original 16-bit pixel-art orbital shipyard
arcade shooter. Central 65% is a dark readable combat lane. Navy/slate
industrial structures frame the edges, with cyan service lights and sparse
amber beacons. Tiny enemies follow streaming S-shaped entrances. No large
central planets, decorative lightning frame, realistic smooth 3D or copied
game art. Preserve room for a fixed mobile HUD and visible player below.

Production far-space edit: remove all ships, HUD, structures and bullets;
retain only sparse stars and dim nebula, with quiet tile boundaries.

Production overlays: separate approach, wreck field and gate images; real
transparent background and empty central 65%; no ships, HUD or projectiles.
Use low-contrast pixel clusters, industrial edge silhouettes, sparse light
accents and generous transparent top/bottom margins. Different structures
make the three Missions' environment beats recognizable without hiding fire.

The generated strips did not fully obey the requested empty top/bottom
margins; a few structures meet the tile edge. They are low-contrast background
scenery, not collision surfaces. Vertical-loop seam polish remains an art
refinement, not a reason to alter the combat model.

### Fidelity decisions

1. Keep the concept's dark center and bright combat contrast.
2. Keep edge-framed industrial scale with three distinct landmark sets.
3. Keep pixel texture sampling, restrained lighting and slow layer parallax.
4. Keep actual existing player/enemy sprites and fixed HUD, deliberately not
   the concept's invented fighter or mock UI.
5. Give weapons readable independent energy pulses; do not bake concept
   bullets, enemies or effects into the scenery.
