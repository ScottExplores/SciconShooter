# Scicon Weekly Run Frame v1

Dedicated lower drawer for the Home screen's connected Weekly Funding and Weekly Run assembly.

## Runtime asset

- `weekly-run-lower-frame.png`
  - 960 x 284 RGBA
  - Static, safely padded Scicon Neon-Frame chrome with a blank center.
  - Midnight navy glass, silver structure, cyan rails, and restrained emerald fixtures distinguish it from the taller Weekly Funding frame while keeping both pieces in one visual system.
  - Used as a CSS nine-slice with `border-image-slice: 48 66 64 66 fill`.

The Weekly Run title, status, score, ship icon, accessible name, and hit target remain live DOM content. The artwork contains no baked text or gameplay state and does not receive pointer events.
