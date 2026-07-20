# ImageGen prompt set

Mode: OpenAI built-in image generation/editing. Each terrain's existing `3x3`
prop atlas was the edit target. Outputs used a flat `#ff00ff` background, then
the installed ImageGen chroma-key helper produced the `*-rgba.png` sources.

## Shared constraints

Use case: `precise-object-edit`

Asset type: Scicon Shooter ground-prop perspective atlas.

Preserve the exact semi-pixel illustrated sprite style, chunky pixel clusters,
crisp stair-stepped outlines, palette, materials, wear, proportions, and each
prop's recognizable design. Preserve the exact `3 by 3` grid, object order, and
relative scale. Include exactly all nine original props once, centered in equal
square cells with consistent ground-contact points and no overlap. Do not add,
remove, merge, relabel, redesign, duplicate, or reorder props.

Use a perfectly flat solid `#ff00ff` chroma-key background with no gradient,
texture, floor, reflection, lighting variation, grid lines, text, frame borders,
or watermark. Do not use `#ff00ff` in the props. Avoid photorealism, vector
smoothness, blur, painterly treatment, scenery, and animation trails. River
props retain their small attached water footprints but no extra environment.

## Ahead / north

Re-render all nine props from the approaching/ahead viewpoint used when the
player's ship is south of the prop and flying north toward it. The camera is
south of each prop, looking north and downward at a shallow three-quarter angle,
so the south/front face is visible.

## Overhead

Re-render all nine props from a true directly overhead top-down viewpoint used
at the instant the player's ship passes over it. The camera optical axis is
perpendicular to the terrain; show the footprint and top surfaces while
naturally minimizing vertical faces. Keep each prop upright in world orientation.

## Behind / south

Re-render all nine props from the departing/behind viewpoint used after the
player's ship has flown north past it. The camera is north of each prop, looking
south and downward at a shallow three-quarter angle, so the north/rear face is
visible. This is a genuine rear-side view—not a vertical flip, upside-down
sprite, or clockwise rotation.
