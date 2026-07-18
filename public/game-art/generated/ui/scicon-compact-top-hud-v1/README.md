# Scicon Compact Top HUD v1

This pack provides a compact mobile top bar matching the established Scicon
navy/cobalt, cyan-energy, orange-gold semi-pixel interface family.

Production frames are deliberately blank. Render lives, score, flask percentage,
wave count, boss name, and other changing values as live React/Pixi text.

## Filling a meter

1. Draw the selected fill PNG behind the hollow meter frame.
2. Reveal the fill from left to right with a rectangular mask or source crop.
3. Set the revealed width to `fillWidth * clamp(value / max, 0, 1)`.
4. Draw the hollow frame above it. Never resize the frame to represent progress.

## Draining the heart

Draw `heart-health-fill.png`, reveal only its bottom `health / maxHealth`
fraction, and draw `heart-health-shell.png` above it. The adjacent panel remains
blank artwork so the game can render the current numeric value as live text.

## Filling the beaker

Draw `beaker-charge-liquid.png`, reveal it from bottom to top, and draw
`beaker-charge-shell.png` above it. Both layers are 128 pixels high, exactly the
same native height as `flask-progress-frame.png`.

The GIF is a gallery preview only. The top bar intentionally has no sound button.
