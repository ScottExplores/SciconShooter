from __future__ import annotations

import json
import math
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "tmp" / "imagegen" / "parallax-terrain-pack-v1"
ALPHA = SOURCE / "alpha"
OUT = ROOT / "public" / "game-art" / "generated" / "backgrounds" / "scicon-parallax-terrain-pack-v1"

MASTER_WIDTH = 512
SEGMENT_HEIGHT = 1536
OVERLAP = 256
MASTER_HEIGHT = SEGMENT_HEIGHT * 3 - OVERLAP * 2
PROP_CANVAS = 256
ATLAS_COLUMNS = 3
ATLAS_ROWS = 3


@dataclass(frozen=True)
class TerrainSpec:
    slug: str
    title: str
    source_background: str
    source_props: str
    prop_names: tuple[str, ...]
    original_references: tuple[str, ...]
    recommended_layers: tuple[dict[str, object], ...]


SPECS = (
    TerrainSpec(
        slug="desert",
        title="Desert Canyon",
        source_background="desert-background-source.png",
        source_props="desert-props-source-alpha.png",
        prop_names=(
            "sandstone-boulder-cluster",
            "sandstone-rock-spire",
            "cracked-sandstone-slab",
            "fossil-rib-cage",
            "dry-thorn-bush",
            "desert-research-beacon",
            "broken-desert-pipeline",
            "amber-crystal-cluster",
            "dust-impact-crater",
        ),
        original_references=(
            "/game-art/pixi/backgrounds/desert-terrain.png",
            "/game-art/pixi/backgrounds/desert-clouds.png",
        ),
        recommended_layers=(
            {"asset": "/game-art/pixi/backgrounds/desert-clouds.png", "speed": 0.18, "role": "far haze/cloud layer"},
            {"asset": "roundMaster", "speed": 0.42, "role": "terrain base"},
            {"asset": "propAtlas", "speed": 0.55, "role": "near silhouettes and landmarks"},
        ),
    ),
    TerrainSpec(
        slug="river",
        title="River Gorge",
        source_background="river-background-source.png",
        source_props="river-props-source-alpha.png",
        prop_names=(
            "mossy-river-boulders",
            "river-reed-clump",
            "river-lily-pads",
            "mossy-fallen-log",
            "river-stepping-stones",
            "river-research-buoy",
            "ancient-river-stone-ring",
            "cyan-river-crystals",
            "broken-mossy-arch",
        ),
        original_references=(
            "/game-art/pixi/backgrounds/river-terrain.png",
            "/game-art/pixi/backgrounds/river-props.png",
        ),
        recommended_layers=(
            {"asset": "roundMaster", "speed": 0.40, "role": "river and gorge base"},
            {"asset": "propAtlas", "speed": 0.54, "role": "banks, landmarks, and water props"},
            {"asset": "/game-art/pixi/backgrounds/river-props.png", "speed": 0.60, "role": "legacy near-water accents"},
        ),
    ),
    TerrainSpec(
        slug="space",
        title="Research Nebula",
        source_background="space-background-source.png",
        source_props="space-props-source-alpha.png",
        prop_names=(
            "space-asteroid-cluster",
            "violet-crater-moon",
            "rose-ringed-planet",
            "blue-crystal-asteroid",
            "research-satellite",
            "damaged-solar-array",
            "cyan-violet-energy-anomaly",
            "research-comet-fragment",
            "orbital-research-beacon",
        ),
        original_references=(
            "/game-art/backgrounds/menu-hero.png",
            "/game-art/backgrounds/bg-back.png",
            "/game-art/backgrounds/bg-stars.png",
            "/game-art/backgrounds/parallax-back.png",
            "/game-art/backgrounds/parallax-stars.png",
            "/game-art/backgrounds/parallax-far-planets.png",
        ),
        recommended_layers=(
            {"asset": "/game-art/backgrounds/parallax-back.png", "speed": 0.10, "role": "deep space color"},
            {"asset": "/game-art/backgrounds/parallax-stars.png", "speed": 0.20, "role": "far stars"},
            {"asset": "roundMaster", "speed": 0.34, "role": "nebula field"},
            {"asset": "propAtlas", "speed": 0.52, "role": "planets, debris, and research landmarks"},
        ),
    ),
)


def font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    candidates = (
        Path("C:/Windows/Fonts/arialbd.ttf") if bold else Path("C:/Windows/Fonts/arial.ttf"),
        Path("C:/Windows/Fonts/segoeuib.ttf") if bold else Path("C:/Windows/Fonts/segoeui.ttf"),
    )
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


def public_path(path: Path) -> str:
    return "/" + path.relative_to(ROOT / "public").as_posix()


def center_crop_to_ratio(image: Image.Image, width: int, height: int) -> Image.Image:
    target_ratio = width / height
    source_ratio = image.width / image.height
    if source_ratio > target_ratio:
        crop_width = round(image.height * target_ratio)
        left = (image.width - crop_width) // 2
        image = image.crop((left, 0, left + crop_width, image.height))
    else:
        crop_height = round(image.width / target_ratio)
        top = (image.height - crop_height) // 2
        image = image.crop((0, top, image.width, top + crop_height))
    return image.resize((width, height), Image.Resampling.LANCZOS)


def crossfade_segments(segment: Image.Image) -> Image.Image:
    master = Image.new("RGB", (MASTER_WIDTH, MASTER_HEIGHT))
    master.paste(segment, (0, 0))
    step = SEGMENT_HEIGHT - OVERLAP

    for copy_index in (1, 2):
        start_y = copy_index * step
        existing = master.crop((0, start_y, MASTER_WIDTH, start_y + OVERLAP))
        incoming = segment.crop((0, 0, MASTER_WIDTH, OVERLAP))
        mask = Image.new("L", (MASTER_WIDTH, OVERLAP))
        mask_pixels = mask.load()
        for y in range(OVERLAP):
            phase = y / max(1, OVERLAP - 1)
            eased = 0.5 - 0.5 * math.cos(math.pi * phase)
            value = round(eased * 255)
            for x in range(MASTER_WIDTH):
                mask_pixels[x, y] = value
        blended = Image.composite(incoming, existing, mask)
        master.paste(blended, (0, start_y))
        master.paste(segment.crop((0, OVERLAP, MASTER_WIDTH, SEGMENT_HEIGHT)), (0, start_y + OVERLAP))
    return master


def normalized_prop(cell: Image.Image) -> Image.Image:
    alpha = cell.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        raise ValueError("A prop cell is fully transparent")
    cropped = cell.crop(bbox)
    usable = round(PROP_CANVAS * 0.84)
    scale = min(usable / cropped.width, usable / cropped.height)
    resized = cropped.resize(
        (max(1, round(cropped.width * scale)), max(1, round(cropped.height * scale))),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", (PROP_CANVAS, PROP_CANVAS), (0, 0, 0, 0))
    canvas.alpha_composite(resized, ((PROP_CANVAS - resized.width) // 2, (PROP_CANVAS - resized.height) // 2))
    return canvas


def split_props(source: Image.Image) -> list[Image.Image]:
    props = []
    for row in range(ATLAS_ROWS):
        top = round(row * source.height / ATLAS_ROWS)
        bottom = round((row + 1) * source.height / ATLAS_ROWS)
        for column in range(ATLAS_COLUMNS):
            left = round(column * source.width / ATLAS_COLUMNS)
            right = round((column + 1) * source.width / ATLAS_COLUMNS)
            props.append(normalized_prop(source.crop((left, top, right, bottom))))
    return props


def build_atlas(props: list[Image.Image]) -> Image.Image:
    atlas = Image.new(
        "RGBA",
        (PROP_CANVAS * ATLAS_COLUMNS, PROP_CANVAS * ATLAS_ROWS),
        (0, 0, 0, 0),
    )
    for index, prop in enumerate(props):
        atlas.alpha_composite(
            prop,
            ((index % ATLAS_COLUMNS) * PROP_CANVAS, (index // ATLAS_COLUMNS) * PROP_CANVAS),
        )
    return atlas


def build_scroll_preview(master: Image.Image, output: Path) -> None:
    preview_width = 256
    preview_height = 384
    scaled = master.resize((preview_width, round(master.height * preview_width / master.width)), Image.Resampling.LANCZOS)
    max_y = scaled.height - preview_height
    frames: list[Image.Image] = []
    frame_count = 16
    for index in range(frame_count):
        y = round(max_y * index / (frame_count - 1))
        frame = scaled.crop((0, y, preview_width, y + preview_height)).convert("P", palette=Image.Palette.ADAPTIVE, colors=255)
        frames.append(frame)
    frames[0].save(
        output,
        save_all=True,
        append_images=frames[1:],
        duration=110,
        loop=0,
        disposal=2,
        optimize=False,
    )


def build_overview(cards: list[tuple[TerrainSpec, Image.Image, Image.Image]]) -> Image.Image:
    canvas = Image.new("RGB", (1800, 900), "#050a18")
    draw = ImageDraw.Draw(canvas)
    draw.text((60, 35), "SCICON PARALLAX TERRAIN PACK V1", fill="#e8f7ff", font=font(42, True))
    draw.text((60, 86), "Three 512 x 4096 round masters + 27 transparent terrain props", fill="#69d9ff", font=font(24))

    card_width = 540
    card_height = 700
    start_x = 60
    gap = 30
    for index, (spec, master, atlas) in enumerate(cards):
        x = start_x + index * (card_width + gap)
        y = 150
        draw.rounded_rectangle((x, y, x + card_width, y + card_height), radius=22, fill="#0b1730", outline="#249fd2", width=3)
        draw.text((x + 24, y + 20), spec.title.upper(), fill="#f5c75a", font=font(30, True))

        background_crop = master.crop((0, 300, master.width, 1040)).resize((250, 560), Image.Resampling.LANCZOS)
        canvas.paste(background_crop, (x + 22, y + 76))

        checker = Image.new("RGB", (230, 230), "#101a2b")
        checker_draw = ImageDraw.Draw(checker)
        square = 18
        for cy in range(0, 230, square):
            for cx in range(0, 230, square):
                if (cx // square + cy // square) % 2:
                    checker_draw.rectangle((cx, cy, cx + square - 1, cy + square - 1), fill="#16263f")
        atlas_preview = atlas.resize((230, 230), Image.Resampling.LANCZOS)
        checker.paste(atlas_preview, (0, 0), atlas_preview)
        canvas.paste(checker, (x + 288, y + 76))

        draw.text((x + 306, y + 325), "9 props", fill="#e8f7ff", font=font(24, True))
        draw.text((x + 306, y + 360), "transparent PNG", fill="#83a9c7", font=font(18))
        draw.text((x + 306, y + 395), "separate placement", fill="#83a9c7", font=font(18))
        draw.text((x + 306, y + 430), "parallax ready", fill="#83a9c7", font=font(18))
        draw.text((x + 22, y + 654), "Single long background strip — no mid-round tile seam", fill="#69d9ff", font=font(17))
    return canvas


def build() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    cards: list[tuple[TerrainSpec, Image.Image, Image.Image]] = []
    terrains = []

    for spec in SPECS:
        terrain_dir = OUT / spec.slug
        backgrounds_dir = terrain_dir / "backgrounds"
        props_dir = terrain_dir / "props"
        previews_dir = terrain_dir / "previews"
        backgrounds_dir.mkdir(parents=True, exist_ok=True)
        props_dir.mkdir(parents=True, exist_ok=True)
        previews_dir.mkdir(parents=True, exist_ok=True)

        background_source = Image.open(SOURCE / spec.source_background).convert("RGB")
        segment = center_crop_to_ratio(background_source, MASTER_WIDTH, SEGMENT_HEIGHT)
        master = crossfade_segments(segment)
        master_path = backgrounds_dir / f"{spec.slug}-round-master-512x4096.png"
        master.save(master_path, optimize=True)

        preview_path = previews_dir / f"{spec.slug}-round-scroll-preview.gif"
        build_scroll_preview(master, preview_path)

        prop_source = Image.open(ALPHA / spec.source_props).convert("RGBA")
        props = split_props(prop_source)
        prop_paths = []
        for index, (name, prop) in enumerate(zip(spec.prop_names, props), start=1):
            prop_path = props_dir / f"{spec.slug}-prop-{index:02d}-{name}.png"
            prop.save(prop_path, optimize=True)
            prop_paths.append(prop_path)

        atlas = build_atlas(props)
        atlas_path = props_dir / f"{spec.slug}-props-atlas-3x3.png"
        atlas.save(atlas_path, optimize=True)
        cards.append((spec, master, atlas))

        terrains.append(
            {
                "id": spec.slug,
                "title": spec.title,
                "originalReferences": list(spec.original_references),
                "roundMaster": public_path(master_path),
                "roundMasterSize": [MASTER_WIDTH, MASTER_HEIGHT],
                "scrollPreviewGif": public_path(preview_path),
                "propAtlas": public_path(atlas_path),
                "propAtlasGrid": {"columns": 3, "rows": 3, "cellWidth": 256, "cellHeight": 256},
                "props": [
                    {"id": name, "path": public_path(path), "anchor": [0.5, 0.5]}
                    for name, path in zip(spec.prop_names, prop_paths)
                ],
                "recommendedLayers": list(spec.recommended_layers),
            }
        )

    overview = build_overview(cards)
    overview_path = OUT / "scicon-parallax-terrain-pack-v1-overview.png"
    overview.save(overview_path, optimize=True)

    manifest = {
        "id": "scicon-parallax-terrain-pack-v1",
        "version": 1,
        "generated": date.today().isoformat(),
        "productionFormat": "Long vertical round master plus separately placed transparent props",
        "overview": public_path(overview_path),
        "roundMaster": {
            "size": [MASTER_WIDTH, MASTER_HEIGHT],
            "sourceSegmentSize": [MASTER_WIDTH, SEGMENT_HEIGHT],
            "internalCrossfadePx": OVERLAP,
            "scrollDirection": "vertical",
            "usage": "Use as one scrolling Sprite for a normal round. For rounds longer than 4096 art pixels, queue a second master and crossfade 256 px; do not hard-wrap the texture edge.",
        },
        "style": {
            "rendering": "semi-pixel illustrated Scicon shooter art",
            "readability": "open central combat lane with detail concentrated toward terrain edges",
            "props": "transparent and independently placed so collision, density, and parallax remain data-driven",
        },
        "terrains": terrains,
        "productionNotes": [
            "GIF files are gallery motion previews only; runtime backgrounds and props use PNG files.",
            "Keep collision geometry independent from decorative prop alpha.",
            "Place large props away from the player start zone and maintain the central firing lane.",
            "Existing legacy background files were preserved and are listed as reusable layer references.",
        ],
    }
    (OUT / "pack-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    readme = f"""# Scicon Parallax Terrain Pack v1

This pack extends the existing Desert Terrain, River Terrain, Menu Hero, BG Back,
and space parallax artwork into long production-ready round backgrounds.

## Included

- Three `{MASTER_WIDTH} x {MASTER_HEIGHT}` vertical round-master PNG files: Desert,
  River, and Space.
- Three transparent 3 x 3 prop atlases and 27 individual `{PROP_CANVAS} x
  {PROP_CANVAS}` prop PNG files.
- Three scroll-preview GIF files for the Sprite Gallery. GIFs are previews only.
- `pack-manifest.json` with layer speeds, paths, anchors, and implementation notes.

## Runtime protocol

Use the selected terrain's `roundMaster` as one scrolling Sprite for a normal
round. The source art is repeated internally with `{OVERLAP}`-pixel cosine
crossfades, so there are no hard joins inside the strip. Place props separately
from manifest data to create foreground depth and vary each run.

If a round needs more than `{MASTER_HEIGHT}` art pixels, queue a second copy and
crossfade the handoff over `{OVERLAP}` pixels. Do not hard-wrap the bottom edge to
the top edge. Keep collision shapes and gameplay text independent from these PNGs.

The original background files remain unchanged and can still be used as slower
far layers, as listed in the manifest.
"""
    (OUT / "README.md").write_text(readme, encoding="utf-8")


if __name__ == "__main__":
    build()
