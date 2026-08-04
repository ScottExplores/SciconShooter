# Scicon Enemy Squadron v1

Seven cohesive regular-enemy families for the mobile campaign. Each family has
three transparent 128x128 PNG frames with fixed registration and a shared
Scicon silhouette, cyan reactor language, and restrained role accent.

## Runtime contract

- Play the three frames as a `1-2-3-2` ping-pong idle at 8 fps.
- Randomize each entity's starting frame so a formation does not pulse in lockstep.
- Keep collision geometry, health, speed, weapons, scoring, and role behavior
  independent from the selected family or animation frame.
- Render from the individual PNGs in `frames/`; the sheet is reference art only.
- Frame canvases stay 128x128 with transparent corners and horizontal padding;
  tall silhouettes may use the top or bottom boundary without crowding adjacent
  formation columns.

The canonical family-to-role assignments and file hashes are in
`pack-manifest.json`.
