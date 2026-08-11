# Boss design: Bottleneck Drone V3

## Identity and scope

- Boss ID: `bottleneck-drone`
- Campaign role: M03 elite checkpoint.
- Story: a scientific lane regulator scans an intruder, closes two containment clamps around its aperture, commits one pulse from its lower emitter, then vents and resets.
- Scope: visual replacement only. Health, speed, damage, movement, cadence, projectile, reward, phase, count, and warning remain unchanged.

## Visual language

- Umbra Needlewing is the detail-density benchmark, not an anatomy reference.
- Large navy/gunmetal armor shapes, cyan energy, tiny amber hazard accents.
- Simple connected silhouette with two blunt jointed clamps, two sensor prongs, one containment lens, and one visible lower emitter.
- One shared 32-color palette, binary alpha, nearest-neighbor sampling, and a `140 x 160` equal canvas.
- Every output frame keeps at least four transparent pixels around its structure and one connected structural component.

## Mechanical animation story

1. **Neutral:** clamps open; lens calm; emitter at rest.
2. **Idle scan:** sensor prongs tilt and indicators step; hull stays fixed.
3. **Charge:** clamps rotate inward at their joints; lens focuses; emitter retracts.
4. **Fire/recoil:** emitter extends and owns the attached muzzle flash; hull does not squash.
5. **Recovery:** emitter retracts, vents open, and clamps restore the exact neutral joints.

The simulation selects these five visual states from its existing attack timer. The art never changes the M03 attack behavior.

## Frame-safety contract

- The source splitter keeps the largest connected structural subject per cell.
- Detached edge fragments are removed before resizing.
- A second subject larger than 15% of the main sprite fails the build.
- Final frames fail if structure enters the outer four-pixel margin.
- Pixi explicitly uses nearest sampling and clamp-to-edge texture addressing.

## Factory status

- Factory-compatible for this scoped flattened elite presentation.
- Not Factory-ready as a full modular four-attack boss.
- Final V3 gameplay capture is required before closing the visual gate.
