# Scicon Flight Motion Pack v1

This pack contains production PNG frames for four player ships, a dedicated
selection-screen idle for each player ship, four regular enemy families, and
two early mini-bosses. The GIFs are gallery previews only.

## Renderer protocol

- Player ships: choose `hard-left`, `bank-left`, `neutral`, `bank-right`, or
  `hard-right` from normalized horizontal input or velocity. These are complete
  redrawn views that progress from a broad neutral top view through a 3/4 bank
  to a narrow, nearly edge-on hard-bank profile. The nose still points toward
  12 o'clock; never rotate one flat sprite in the image plane. Use a small
  deadzone and about 90 ms of visual easing so keyboard and touch steering do
  not flicker between states.
- Ship-selection idle pulses: play the selected ship's six PNG frames at 8 fps.
  Keep the hull stationary and pulse only its identity-specific components:
  ResearchHub laboratory nodes, BIO gene membrane and pods, ETH crystal reactor
  and conduits, or Bitcoin hash rails and token rim. Every frame must use exactly
  the same scale and registration. Booster flames remain locked to their resting
  appearance because this is a selection-screen animation, not acceleration.
- Regular enemies: play the three PNG frames in a ping-pong loop at the FPS in
  `pack-manifest.json`. Give each enemy a random starting phase so formations do
  not pulse in perfect synchronization.
- Mini-bosses: use the first three frames for idle/attack presentation, switch
  to `damage-50` at or below 50% health, and use `critical-15` at or below 15%.
- Keep collision sizes and simulation rules unchanged when a visual frame
  changes. Presentation must not resize the hitbox.

The complete path map and timing metadata are in `pack-manifest.json`.
