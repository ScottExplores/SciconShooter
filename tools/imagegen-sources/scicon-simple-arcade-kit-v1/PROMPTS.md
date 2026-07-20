# Scicon Simple Arcade Kit v1 — ImageGen prompts

Mode: OpenAI built-in image generation. Screenshot `Screenshot_20260719-145847.png`
was used only as a gameplay-scale and projectile-readability reference. Every
source was generated on flat `#ff00ff`, then converted locally to RGBA.

## Shared projectile prompt

```text
Use case: stylized-concept
Asset type: transparent-ready pixel-art projectile animation sprite sheet
Input images: Image 1 is a gameplay reference only for compact projectile scale and readability; do not copy the ship, boss, HUD, text, or background.
Style/medium: simple arcade pixel art, crisp blocky pixels, black/navy single-pixel outline, bright readable glow accents, intentionally simpler than ornate Scicon assets.
Composition/framing: exactly four equal columns in one horizontal row, one centered projectile per column, generous separation and padding.
Animation: frame 1 is the tiny just-emitted state, frame 2 is slightly larger, frame 3 is the full powered size, frame 4 is the brightest full-size firing state. Keep the projectile upright and centered. Size growth should be clear but controlled.
Scene/backdrop: perfectly flat uniform #ff00ff chroma-key background for local removal.
Constraints: no text, no ships, no UI, no scenery, no watermark, no cast shadow. Background must be one exact solid color with no gradients or texture. Do not use #ff00ff in the projectile.
```

Ship-specific source additions:

1. **Ring bomb:** tiny red-orange square-ring bomb with a hollow square center, white-hot corner pixels, and restrained red glow.
2. **Gold needle:** tiny upright gold-orange needle bolt with a white-hot spear tip and short amber energy tail.
3. **Cyan plasma seed:** compact cyan-blue oval energy capsule with a bright white center and two small side pixels.
4. **Violet prism shard:** upright violet/electric-blue crystalline shard with a white pointed tip and compact diamond body.
5. **Spiral triangle:** hollow triangle made from three curved lime energy arms spiraling around an empty center; four simple animation poses; no ship or UI.

The final additional colorways, hollow selector frames, boxes, bars, panels, and
bitmap glyphs were produced deterministically by `tools/build-scicon-simple-arcade-kit.py`.
