# Scicon Neon-Frame v1

Production UI sprite sheets for the Home dashboard's Weekly Funding command card and primary navigation.

## Visual system

**Scicon Neon-Frame** is the project's shared UI language: chamfered midnight-navy arcade chrome, dark glass, cyan and emerald live-light rails, restrained research-gold hardware, and small localized illumination cycles. The Start Mission control is a **Neon-Frame Action Panel** within this system.

## Sheets

- `weekly-funding-frame-spritesheet.png`
  - 1536 x 1024 RGB
  - 3 columns x 4 rows
  - 12 frames, row-major
  - 512 x 256 per frame
  - Intended loop: 4800 ms
- `dashboard-nav-icons-spritesheet.png`
  - 1535 x 1024 RGBA
  - 5 columns x 4 rows
  - 307 x 256 per cell
  - Columns: Proposals, Trophies, Home, Hangar, More
  - Rows: idle, warm, peak, settle
  - Intended active loop: 3400 ms

The dashboard sheet was generated on a flat chroma background, converted locally to alpha with the installed image-generation helper, then cropped by one transparent pixel so every grid cell is integral. The twelve Weekly frames were normalized to a shared registered bounding box after generation so the chrome never drifts while its lights pulse. Runtime labels, scores, wallet locks, notification dots, proposal details, and hit targets remain live UI and are not baked into the artwork.

## Generation prompts

The built-in image generator was used with the existing Start Mission shell and dashboard icons as style/semantic references.

### Weekly frame

> Create twelve identical wide 2:1 Scicon Neon-Frame command panels in an exact 3x4 grid. Animate only the embedded cyan and emerald fixtures from dim to peak and back. Use midnight navy chrome, dark glass, restrained gold hardware, generous blank centers, no text, no icons, no characters, no perspective, and no watermark.

### Dashboard icons

> Create a strict 5x4 dashboard sprite grid for Proposals, Trophies, Home, Hangar, and More. Each column preserves one icon's geometry while rows show idle, warm, peak, and settle illumination. Use readable pixel-art silhouettes, navy chrome, cyan/emerald rails, restrained violet research cores and gold details, on a flat removable chroma background. No text, card frames, logos, or watermark.
