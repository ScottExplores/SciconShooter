from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageChops, ImageEnhance, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
PACK = ROOT / "public" / "game-art" / "generated" / "scicon-player-weapon-fx-v1"
FRAME_SIZE = (96, 128)
FAMILIES = ("research", "bio", "eth", "btc")
FRAME_COUNT = 4
LEVEL_FINAL_HEIGHT = (78, 84, 90, 96, 102, 108, 114, 120)
FRAME_SCALE = (0.28, 0.52, 0.76, 1.0)
FRAME_BRIGHTNESS = (0.86, 0.93, 0.99, 1.05)
FRAME_GLOW_ALPHA = (0.06, 0.1, 0.14, 0.18)
FRAME_MIN_WIDTH = (6, 9, 12, 16)


def crop_quadrant(atlas: Image.Image, tier: int) -> Image.Image:
    half_w, half_h = atlas.width // 2, atlas.height // 2
    col, row = tier % 2, tier // 2
    quadrant = atlas.crop((col * half_w, row * half_h, (col + 1) * half_w, (row + 1) * half_h))
    alpha_box = quadrant.getchannel("A").getbbox()
    if not alpha_box:
        raise RuntimeError(f"Tier {tier + 1} has no visible pixels")
    return quadrant.crop(alpha_box)


def fit_sprite(source: Image.Image, level: int, frame: int) -> Image.Image:
    tier = level // 2
    progress = FRAME_SCALE[frame]
    max_w = FRAME_SIZE[0] - 8
    max_h = max(8, round(LEVEL_FINAL_HEIGHT[level] * progress))
    height_ratio = max_h / source.height
    target_w = round(source.width * height_ratio)
    size = (max(FRAME_MIN_WIDTH[frame], min(max_w, target_w)), max_h)
    sprite = source.resize(size, Image.Resampling.NEAREST)
    resized_bounds = sprite.getchannel("A").getbbox()
    if resized_bounds and resized_bounds != (0, 0, sprite.width, sprite.height):
        sprite = sprite.crop(resized_bounds).resize(size, Image.Resampling.NEAREST)
    sprite = ImageEnhance.Brightness(sprite).enhance(FRAME_BRIGHTNESS[frame])

    canvas = Image.new("RGBA", FRAME_SIZE, (0, 0, 0, 0))
    x = (FRAME_SIZE[0] - sprite.width) // 2
    # Keep every phase attached to the same muzzle baseline so the art grows
    # upward into its full projectile instead of breathing around its center.
    y = FRAME_SIZE[1] - 6 - sprite.height

    # A restrained color-matched bloom preserves the hard pixel silhouette.
    glow_alpha = sprite.getchannel("A").filter(ImageFilter.GaussianBlur(radius=1.2 + tier * 0.35))
    glow = Image.new("RGBA", sprite.size, (100, 235, 255, 0))
    glow.putalpha(glow_alpha.point(lambda value: round(value * (FRAME_GLOW_ALPHA[frame] + tier * 0.01))))
    canvas.alpha_composite(glow, (x, y))
    canvas.alpha_composite(sprite, (x, y))

    if level >= 4 and frame >= 2:
        spark_color = (160, 245, 255, 230)
        spark_y = max(4, FRAME_SIZE[1] // 2 - 18 - tier * 5)
        for sx in (max(2, x - 5), min(FRAME_SIZE[0] - 4, x + sprite.width + 2)):
            canvas.paste(spark_color, (sx, spark_y, sx + 2, spark_y + 2))
    return canvas


def checkerboard(width: int, height: int, cell: int = 8) -> Image.Image:
    image = Image.new("RGBA", (width, height), (4, 10, 25, 255))
    pixels = image.load()
    for y in range(height):
        for x in range(width):
            if (x // cell + y // cell) % 2:
                pixels[x, y] = (10, 24, 48, 255)
    return image


def build_launch_preview(frames: list[Image.Image]) -> list[Image.Image]:
    """Show one launch and release, not a back-and-forth pulse loop."""
    preview_size = (FRAME_SIZE[0], FRAME_SIZE[1] + 64)
    preview_frames: list[Image.Image] = []
    for frame_index, frame in enumerate(frames):
        canvas = Image.new("RGBA", preview_size, (0, 0, 0, 0))
        canvas.alpha_composite(frame, (0, 64 - frame_index * 16))
        preview_frames.append(canvas)

    for offset_y in (-12, -40):
        canvas = Image.new("RGBA", preview_size, (0, 0, 0, 0))
        canvas.alpha_composite(frames[-1], (0, offset_y))
        preview_frames.append(canvas)
    preview_frames.append(Image.new("RGBA", preview_size, (0, 0, 0, 0)))
    return preview_frames


def visible_metrics(frame: Image.Image) -> tuple[int, int, int, int]:
    alpha = frame.getchannel("A")
    bounds = alpha.getbbox()
    if not bounds:
        raise RuntimeError("Generated weapon frame is empty")
    width = bounds[2] - bounds[0]
    height = bounds[3] - bounds[1]
    area = sum(1 for value in alpha.get_flattened_data() if value > 0)
    return width, height, area, bounds[3]


def build_family(family: str) -> dict[str, object]:
    atlas_path = PACK / "sources" / f"{family}-atlas.png"
    atlas = Image.open(atlas_path).convert("RGBA")
    sources = [crop_quadrant(atlas, tier) for tier in range(4)]
    family_dir = PACK / family
    all_frames: list[list[str]] = []

    sheet = Image.new("RGBA", (FRAME_SIZE[0] * FRAME_COUNT, FRAME_SIZE[1] * 8), (0, 0, 0, 0))
    gallery_preview = checkerboard(FRAME_SIZE[0] * FRAME_COUNT, FRAME_SIZE[1] * 8)
    level_sheets: list[str] = []
    for level in range(8):
        level_dir = family_dir / f"level-{level}"
        level_dir.mkdir(parents=True, exist_ok=True)
        frames: list[Image.Image] = []
        paths: list[str] = []
        level_sheet = Image.new("RGBA", (FRAME_SIZE[0] * FRAME_COUNT, FRAME_SIZE[1]), (0, 0, 0, 0))
        for frame_index in range(FRAME_COUNT):
            frame = fit_sprite(sources[level // 2], level, frame_index)
            frame_path = level_dir / f"frame-{frame_index + 1}.png"
            frame.save(frame_path, optimize=True)
            paths.append("/" + frame_path.relative_to(ROOT / "public").as_posix())
            frames.append(frame)
            sheet.alpha_composite(frame, (frame_index * FRAME_SIZE[0], level * FRAME_SIZE[1]))
            gallery_preview.alpha_composite(frame, (frame_index * FRAME_SIZE[0], level * FRAME_SIZE[1]))
            level_sheet.alpha_composite(frame, (frame_index * FRAME_SIZE[0], 0))

        level_sheet_path = level_dir / "sprite-sheet.png"
        level_sheet.save(level_sheet_path, optimize=True)
        level_sheets.append("/" + level_sheet_path.relative_to(ROOT / "public").as_posix())

        metrics = [visible_metrics(frame) for frame in frames]
        heights = [metric[1] for metric in metrics]
        areas = [metric[2] for metric in metrics]
        if any(left >= right for left, right in zip(heights, heights[1:])):
            raise RuntimeError(f"{family} level {level} launch heights are not strictly increasing: {heights}")
        if any(left >= right for left, right in zip(areas, areas[1:])):
            raise RuntimeError(f"{family} level {level} launch areas are not strictly increasing: {areas}")
        if heights[-1] != LEVEL_FINAL_HEIGHT[level]:
            raise RuntimeError(f"{family} level {level} full height is {heights[-1]}, expected {LEVEL_FINAL_HEIGHT[level]}")
        if any(metric[3] != FRAME_SIZE[1] - 6 for metric in metrics):
            raise RuntimeError(f"{family} level {level} launch frames do not share the muzzle baseline")
        for frame_index, frame in enumerate(frames):
            crop = level_sheet.crop((
                frame_index * FRAME_SIZE[0],
                0,
                (frame_index + 1) * FRAME_SIZE[0],
                FRAME_SIZE[1],
            ))
            if ImageChops.difference(crop, frame).getbbox():
                raise RuntimeError(f"{family} level {level} sprite-sheet frame {frame_index + 1} differs from its PNG")

        preview_frames = build_launch_preview(frames)
        preview_path = level_dir / "preview.gif"
        preview_frames[0].save(
            preview_path,
            save_all=True,
            append_images=preview_frames[1:],
            duration=(90, 85, 80, 100, 95, 95, 220),
            loop=0,
            disposal=2,
            transparency=0,
        )
        with Image.open(preview_path) as preview:
            if preview.n_frames != len(preview_frames):
                raise RuntimeError(f"{family} level {level} launch GIF lost animation frames")
            durations = []
            for frame_index in range(preview.n_frames):
                preview.seek(frame_index)
                durations.append(preview.info.get("duration", 0))
            if durations[-1] < 200:
                raise RuntimeError(f"{family} level {level} launch GIF needs a visible reset gap")
        all_frames.append(paths)

    sheet_path = family_dir / f"{family}-weapon-levels-sprite-sheet.png"
    sheet.save(sheet_path, optimize=True)
    preview_path = family_dir / f"{family}-weapon-levels-gallery-preview.png"
    gallery_preview.save(preview_path, optimize=True)
    for level, paths in enumerate(all_frames):
        for frame_index, frame_path in enumerate(paths):
            expected = Image.open(ROOT / "public" / frame_path.lstrip("/")).convert("RGBA")
            actual = sheet.crop((
                frame_index * FRAME_SIZE[0],
                level * FRAME_SIZE[1],
                (frame_index + 1) * FRAME_SIZE[0],
                (level + 1) * FRAME_SIZE[1],
            ))
            if ImageChops.difference(actual, expected).getbbox():
                raise RuntimeError(f"{family} master-sheet level {level} frame {frame_index + 1} differs from its PNG")
    return {
        "family": family,
        "frameSize": list(FRAME_SIZE),
        "layout": {"columns": "launch frames", "rows": "gun levels 0-7"},
        "levels": all_frames,
        "levelSpriteSheets": level_sheets,
        "spriteSheet": "/" + sheet_path.relative_to(ROOT / "public").as_posix(),
        "galleryPreview": "/" + preview_path.relative_to(ROOT / "public").as_posix(),
    }


def main() -> None:
    PACK.mkdir(parents=True, exist_ok=True)
    manifest = {
        "id": "scicon-player-weapon-fx-v1",
        "animationFramesPerLevel": FRAME_COUNT,
        "gunLevels": 8,
        "families": [build_family(family) for family in FAMILIES],
    }
    (PACK / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Built {len(FAMILIES) * 8 * FRAME_COUNT} projectile frames in {PACK}")


if __name__ == "__main__":
    main()
