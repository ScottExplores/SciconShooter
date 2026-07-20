# Scicon Ground-Prop Perspective Pack v1

These PNGs are spatial perspective states, not animation loops.

Each prop sheet is `768 x 256` with three `256 x 256` columns:

1. `ahead` — the prop is north/ahead of the player; show its south/front face.
2. `overhead` — the prop is crossing the player's flight line; show its top.
3. `behind` — the prop is south/behind the player; show its north/rear face.

The desert and river runtime masters are `768 x 2304`: the same three columns,
with the nine existing terrain props in their original atlas row order. Every
view shares the same ground-contact line so a texture swap does not move the
prop. The live Pixi renderer selects a column from prop Y relative to player Y;
it does not advance these frames by time, GIF playback, or `AnimatedSprite`.

Ground props remain presentation-only and registered to the terrain master.
Their scale, alpha, placement, layering, and collision behavior are independent
of the selected perspective state. Space landmarks are intentionally excluded.
