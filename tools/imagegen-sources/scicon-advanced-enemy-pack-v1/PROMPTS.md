# Scicon Advanced Enemy Pack v1 — ImageGen prompts

Mode: OpenAI built-in image generation. The existing active Scicon enemy art
was supplied as a style reference only. Each family was generated separately
on a flat magenta chroma-key field and converted locally to RGBA.

## Shared prompt

```text
Use case: stylized-concept
Asset type: three-frame enemy spaceship sprite strip for a vertical-scrolling arcade shooter.
Primary request: Create one original late-game enemy craft shown as exactly three animation frames in one horizontal row.
Style/medium: crisp semi-pixel-art game sprite, top-down view, deliberately chunky pixel clusters, limited palette, dark navy/black 1–2 pixel outline, polished Scicon science-space aesthetic, readable at roughly 48–64 gameplay pixels. Match the supplied Scicon enemy reference only in finish and visual language; do not copy its silhouette.
Composition/framing: exactly three equal columns with one complete enemy in each. Keep the nose pointing straight up, the camera orthographic, and the craft centered with generous padding.
Animation: frame 1 neutral idle; frame 2 charge pose with only articulated fins, armor, or cannon mechanisms moving slightly and the core beginning to glow; frame 3 attack pose with those mechanisms fully opened and the core brightest.
Hard invariants: identical craft identity, center point, main hull position, overall scale, camera, and registration across all frames. No translation, rotation, banking, zoom, squash/stretch, recoil, projectile, beam, exhaust burst, baked aura, or warning marker.
Scene/backdrop: one perfectly flat uniform #ff00ff chroma-key background with no shadows, gradients, texture, floor, reflections, or lighting variation. Do not use magenta in the craft.
Constraints: no text, numbers, UI, card borders, logos, watermark, cast shadow, extra craft, or extra objects.
```

## Family-specific additions

1. **Quasar Lancer** — long, narrow spearhead interceptor; dark navy and gunmetal hull, cyan edge lights, restrained gold fittings, a small red targeting aperture, and a central gold-white lance reactor. Its paired forward prongs subtly energize from neutral to attack.
2. **Null Bastion** — broad armored shield carrier with layered navy/gunmetal plates, cyan shield core and outlines, amber reactor vents, and a heavy wedge silhouette. Its side armor closes, braces, then opens into a charged defensive stance.
3. **Vector Reaver** — agile crimson, white-silver, navy, and cyan scissor-wing raider with a needle nose and compact cyan core. Its hooked lower blades change angle across the charge and attack poses.
4. **Rift Weaver** — teal, lime, and navy crescent craft with two tall curved ribbon fins winding around a luminous aqua orb. The fins curl inward, then spread and flare with brighter lime circuitry.
5. **Pulse Herald** — circular navy/gunmetal command craft with gold mechanical fittings, cyan central reactor, red top sensor, and four radial armored vanes. The horizontal cannon/relay arms extend as the core charges.
