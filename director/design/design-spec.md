# Scicon Director design specification

## Source concepts

- `concepts/scorecard-studio.png` — Scorecard Studio desktop state.
- `concepts/wave-director.png` — Wave Director desktop state and primary implementation reference.
- `concepts/review-annotation.png` — Review and Annotation desktop state.

## Visual system

- Background: true deep navy/black (`#020817`, `#04101f`), never cream or warm gray.
- Surfaces: flat command-console panels (`#071525`, `#091a2c`) with one-pixel blue/cyan borders.
- Primary accent: cyan `#22d3ee`.
- Secondary accents: violet `#8b5cf6`, emerald `#34d399`, amber `#fbbf24`, red `#fb7185`.
- Text: white `#f8fafc`, secondary slate `#94a3b8`, subdued slate `#64748b`.
- Typography: Orbitron for product/screen titles and large numeric display; Inter for all editor chrome and body copy.
- Geometry: 6–10px radii, clipped/angular highlights where useful, restrained glow, no generic bento grid.
- Icons: consistent two-pixel SVG outlines, 18–22px in chrome, `currentColor`, no text glyph substitutes.
- Motion: short 140–220ms state transitions; timeline cursor and preview simulation may move continuously; respect reduced motion.

## Shared shell

- 78px left navigation rail with Scorecard, Waves, Review.
- 58px top command bar with `Scicon Director`, `Local only · 127.0.0.1:5174`, Undo, Reset, Save draft, Publish.
- Main workspace fills remaining viewport and may scroll vertically; inspector stays visible on wide screens.
- At tablet/mobile widths, navigation becomes a top section switcher and inspector follows the canvas.

## Scorecard Studio

- Copy allowed in the first viewport: Scorecard Studio, Sample run, Real run, Live preview, Canvas, Theme, Typography, Copy, Metrics, Encounter art, Draft saved locally.
- Large square scorecard preview is the focal point; inspector is a compact right rail.
- Preview displays MISSION RECORD, SCICON SHOOTER, CALLSIGN, FINAL SCORE, WAVE, TARGETS, COINS, FLIGHT, encounter, and integrity.
- Existing game art is used; concept imagery is not shipped as the scorecard itself.

## Wave Director

- Copy allowed in the first viewport: Wave Director, Wave 1, Wave 2, Wave 3, Launch, Phase 1, Mini-boss, Phase 2, Asteroid belt, Phase 3, Gatekeeper, Between waves, Recovery window, Inter-wave encounter, Play, Pause, Timing, Difficulty, Formations, Boss encounter, Background, Power-up drops.
- Timeline anatomy is mandatory and must remain visually readable at default zoom.
- Normal phases, boss/checkpoint encounters, and the between-wave band use different colors and shapes.
- Default sequence: Launch → Phase 1 → Mini-boss → Phase 2 → Asteroid belt → Phase 3 → Gatekeeper → Between waves (Recovery window → Inter-wave encounter).
- Preview includes play/pause, scrubber, seed, desktop/mobile viewport switch, current segment label, and actual repository art.
- Selecting a timeline segment changes the inspector and preview state.

## Review and Annotation

- Copy allowed in the first viewport: Review & Annotation, Scorecard preview, Wave preview, Capture current view, Change requests, Open, Resolved, All, New request, Add request, Saved locally, Export review packet.
- Review canvas dominates. Numbered pins correspond directly to request rows.
- Annotation positions are normalized and remain anchored while the canvas resizes.
- Right rail records target, note, timestamp, status, and resolve action.

## Container and interaction rules

- Prefer rails, timelines, lists, inspectors, and canvases over nested cards.
- Every control must have hover, focus-visible, active, and disabled states.
- Undo affects only the active editor state. Reset returns to the active revision and clears that editor's saved local draft.
- Publish is local-only: validate, create an immutable revision, advance the local active manifest; never deploy or call production writes.
