# Scicon Mini Squadron Pack v1 — ImageGen prompts

Mode: OpenAI built-in image generation. The supplied squad-card screenshot was
used only as a style and scale reference. Each result was generated on a flat
chroma-key field, then converted locally to RGBA.

## Shared prompt

```text
Use case: stylized-concept
Asset type: three-frame game sprite sheet for a miniature squadron companion spaceship
Input images: Image 1 is a style and scale reference only; do not copy its UI, text, cards, or exact ships.
Primary request: Create one original compact mini spaceship shown as exactly three animation frames in one horizontal row.
Style/medium: crisp semi-pixel-art game sprite, top-down vertical-scrolling space shooter, deliberately chunky pixel clusters, limited palette, dark navy/black 1–2 pixel outline, readable at roughly 48–64 gameplay pixels, polished Scicon science-space aesthetic.
Composition/framing: exactly 3 equal columns, one full ship per column, centered with generous padding. Nose points straight up in every frame. Same ship identity and identical base silhouette.
Animation: frame 1 neutral idle; frame 2 only small side mechanisms or winglets flex inward a few pixels and the energy core dims slightly; frame 3 only those parts flex outward a few pixels and the energy core brightens slightly. The motion must feel mechanical and alive.
Hard invariants: keep hull/body position, center point, overall scale, nose, tail, and main boosters fixed across all three frames. No whole-ship translation, rotation, banking, zooming, squash/stretch, recoil, projectile, exhaust burst, or changing camera. Do not make the ship smaller or larger between frames.
Scene/backdrop: perfectly flat uniform chroma-key background for local removal.
Constraints: background is one exact solid color with no shadows, gradients, texture, floor, reflections, or lighting variation. Do not use the chroma-key color in the ship. No text, numbers, UI cards, borders, logos, watermark, cast shadow, or extra objects.
```

## Ship-specific additions

1. **Citation Dart** — compact white and cool-silver research escort with cyan glass core, short swept triangular fins, tiny blue sensor nodes, precise clean scientific silhouette. `#ff00ff` key.
2. **Helix Wasp** — compact bio-engineered green and dark-teal escort with paired leaf-like armor petals, lime energy core, small gold biotech joints, wasp-like silhouette without being an insect character. `#ff00ff` key.
3. **Photon Manta** — broad but tiny cobalt-blue and violet energy skimmer with manta-like swept panels, bright cyan diamond reactor, tiny white edge pixels, sleek curved silhouette. `#ff00ff` key.
4. **Quorum Crab** — compact red and burnished-gold armored escort with two small claw-shaped side nacelles, central turquoise reactor, sturdy mechanical crab-like silhouette, not a creature. `#ff00ff` key.
5. **Axiom Orbiter** — compact circular navy and copper microcraft with a central cyan orb, two thin symmetrical orbit-ring fins, tiny white science lights, strong round silhouette. `#ff00ff` key.
6. **Archive Beetle** — compact teal and amber archive drone with a rounded shielded body, two short segmented shell-wing panels, a small luminous cyan database core, sturdy beetle-inspired mechanical silhouette, not a creature. `#ff00ff` key.
7. **Beacon Kite** — compact golden-yellow and cyan signal escort with a sharp kite-shaped nose, two small swept antenna fins, bright aqua beacon crystal in the center, clean triangular silhouette. `#ff00ff` key.
8. **Prism Skimmer** — compact magenta, violet, and cyan crystalline escort with two short faceted side blades, central white-cyan prism reactor, vivid gemlike but mechanical silhouette. `#00ff00` key.
9. **Ledger Hammer** — compact orange, gunmetal, and white heavy escort with a broad squared nose, two short blocky side pods, cyan accounting-core window, powerful hammerhead silhouette. `#ff00ff` key.
10. **Nebula Tern** — compact midnight-navy and lime exploration escort with narrow birdlike swept winglets, violet-blue nebula core, tiny silver sensor pixels, agile tern-inspired mechanical silhouette, not a bird character. `#ff00ff` key.
