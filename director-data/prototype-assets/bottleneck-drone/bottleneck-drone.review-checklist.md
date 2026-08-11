# Bottleneck Drone V3 review checklist

## Scope and identity

- [x] Bottleneck Drone remained the only rebuilt encounter.
- [x] M03 behavior and balance data were not edited.
- [x] The simpler checkpoint-regulator story is readable from the anatomy and animation.

## Reference and frame integrity

- [x] Five accepted states use one `140 x 160` canvas and one 32-color palette.
- [x] Structural alpha is binary and nearest-neighbor rendering is retained.
- [x] Every runtime frame contains exactly one connected structural component.
- [x] Every runtime frame keeps at least four fully transparent edge pixels.
- [x] Source-sheet dividers have verified transparent gutters before extraction.
- [x] The generated sheet round-trips pixel-for-pixel to its individual runtime frames.
- [x] Horizontal frame centroids stay within two pixels of one another.

## Mechanical animation

- [x] Idle moves the sensors/indicators without compressing the hull.
- [x] Charge rotates the clamps inward at visible joints and focuses the aperture.
- [x] Fire extends the visible lower emitter and uses a connected muzzle flash.
- [x] Recovery vents and restores the exact neutral root.
- [x] Canvas and Pixi presentation paths select the same state sequence.
- [x] Every state frame is preloaded for campaign and mobile preview startup.

## Collision and gameplay

- [x] The unchanged projectile originates beneath the visible bottom-center emitter.
- [x] V3 neutral owns the regenerated alpha collision mask.
- [x] Health, speed, damage, cadence, projectile speed, count, phase, score, and drop remain locked by a focused test.
- [x] Actual Boss Sandbox playback shows no amputated limb, cross-cell fragment, drift, or opposite-edge ghost.
- [x] Browser playback has no console errors.

## Scope disclosure

- [x] This remains Factory-compatible, not Factory-ready: it uses flattened equal-canvas states rather than a modular hierarchy.
- [x] The Sprite Gallery groups the accepted files under **Elite Enemies**.
