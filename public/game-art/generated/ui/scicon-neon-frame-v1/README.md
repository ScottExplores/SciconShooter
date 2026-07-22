# Scicon Neon-Frame v1

Production UI registration for the Home dashboard's Weekly Funding command card and primary navigation.

## Visual system

**Scicon Neon-Frame** is the project's shared UI language: chamfered midnight-navy arcade chrome, dark glass, cyan and emerald live-light rails, restrained research-gold hardware, and small localized illumination cycles. The Start Mission control is a **Neon-Frame Action Panel** within this system.

## Runtime assets

- `../scicon-pixel-action-buttons-v1/start-mission-panel.png`
  - 896 x 256 RGBA
  - The Weekly Funding and weekly high-score content use this exact approved Start Mission chrome as a CSS nine-slice.
  - The border owns real layout space so live text, scores, and proposal art cannot escape the inner glass area.
- `dashboard-nav-icons-static.png`
  - 1280 x 256 RGBA
  - 5 columns x 1 row
  - 256 x 256 per cell
  - Columns: Proposals, Trophies, Home, Hangar, More
  - One static, safely padded state. Selection illumination belongs to the tab frame, never the icon geometry.

`dashboard-nav-icons-spritesheet.png` and `weekly-funding-frame-spritesheet.png` remain as generation studies only. The dashboard study crossed nominal cell boundaries, so `tools/build-static-neon-dashboard-icons.py` isolates its approved idle artwork and repacks it into registered cells. Runtime labels, scores, wallet locks, notification dots, proposal details, and hit targets remain live UI and are not baked into the artwork.

## Generation prompts

The built-in image generator was used with the existing Start Mission shell and dashboard icons as style/semantic references.

### Weekly frame

> Create twelve identical wide 2:1 Scicon Neon-Frame command panels in an exact 3x4 grid. Animate only the embedded cyan and emerald fixtures from dim to peak and back. Use midnight navy chrome, dark glass, restrained gold hardware, generous blank centers, no text, no icons, no characters, no perspective, and no watermark.

### Dashboard icons

> Create a strict 5x4 dashboard sprite grid for Proposals, Trophies, Home, Hangar, and More. Each column preserves one icon's geometry while rows show idle, warm, peak, and settle illumination. Use readable pixel-art silhouettes, navy chrome, cyan/emerald rails, restrained violet research cores and gold details, on a flat removable chroma background. No text, card frames, logos, or watermark.
