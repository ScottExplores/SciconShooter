#!/usr/bin/env python3
"""Split and package the generated Scicon Interface Pack v1.

The script consumes chroma-removed sprite sheets, exports named transparent PNG
assets, builds a complete contact-sheet preview, and renders a layered floating
window/thruster animation preview. Generated GIFs are gallery references only;
the PNG parts and manifests are the production assets.
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
from collections import deque
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


@dataclass(frozen=True)
class AssetSpec:
    relative_path: str
    canvas: tuple[int, int]


@dataclass(frozen=True)
class SheetSpec:
    filename: str
    columns: int
    rows: int
    assets: tuple[AssetSpec, ...]


SHEETS = (
    SheetSpec(
        "system-icons.png",
        4,
        2,
        tuple(
            AssetSpec(f"icons/system/{name}.png", (384, 384))
            for name in ("home", "pause", "settings", "resume", "back", "close", "sound", "music")
        ),
    ),
    SheetSpec(
        "social-icons.png",
        4,
        2,
        tuple(
            AssetSpec(f"icons/communication/{name}.png", (384, 384))
            for name in ("feedback", "mail", "friends", "support", "help", "notifications", "privacy", "server-switch")
        ),
    ),
    SheetSpec(
        "navigation-actions.png",
        4,
        2,
        (
            AssetSpec("buttons/navigation/hangar.png", (384, 384)),
            AssetSpec("buttons/navigation/map.png", (384, 384)),
            AssetSpec("buttons/navigation/missions.png", (384, 384)),
            AssetSpec("buttons/navigation/shop.png", (384, 384)),
            AssetSpec("buttons/navigation/upgrades.png", (384, 384)),
            AssetSpec("buttons/navigation/multiplayer.png", (384, 384)),
            AssetSpec("buttons/actions/primary.png", (512, 256)),
            AssetSpec("buttons/actions/secondary.png", (512, 256)),
        ),
    ),
    SheetSpec(
        "panels.png",
        2,
        2,
        tuple(
            AssetSpec(f"panels/{name}.png", (768, 512))
            for name in ("main-menu", "pause-window", "settings-window", "reward-shop-window")
        ),
    ),
    SheetSpec(
        "controls.png",
        4,
        2,
        (
            AssetSpec("controls/toggle-on.png", (512, 256)),
            AssetSpec("controls/toggle-off.png", (512, 256)),
            AssetSpec("controls/checkbox-on.png", (320, 320)),
            AssetSpec("controls/checkbox-off.png", (320, 320)),
            AssetSpec("controls/slider.png", (512, 192)),
            AssetSpec("controls/progress-empty.png", (512, 192)),
            AssetSpec("controls/progress-full.png", (512, 192)),
            AssetSpec("controls/tab-pair.png", (512, 256)),
        ),
    ),
    SheetSpec(
        "resources.png",
        4,
        2,
        tuple(
            AssetSpec(f"resources/{name}.png", (320, 320))
            for name in ("energy-cell", "credits", "crystal", "rank-badge", "lock", "notification-beacon", "reward-chest", "trophy")
        ),
    ),
    SheetSpec(
        "floating-rig.png",
        4,
        2,
        (
            AssetSpec("animations/floating-window/parts/window-body.png", (512, 512)),
            AssetSpec("animations/floating-window/parts/thruster-left.png", (256, 384)),
            AssetSpec("animations/floating-window/parts/thruster-right.png", (256, 384)),
            AssetSpec("animations/floating-window/parts/flame-short.png", (192, 320)),
            AssetSpec("animations/floating-window/parts/flame-medium.png", (192, 320)),
            AssetSpec("animations/floating-window/parts/flame-long.png", (192, 320)),
            AssetSpec("animations/floating-window/parts/connector-bracket.png", (512, 256)),
            AssetSpec("animations/floating-window/parts/energy-glow.png", (512, 192)),
        ),
    ),
)


def load_font(size: int) -> ImageFont.ImageFont:
    for font_path in (Path(r"C:\Windows\Fonts\segoeuib.ttf"), Path(r"C:\Windows\Fonts\arialbd.ttf")):
        if font_path.exists():
            return ImageFont.truetype(str(font_path), size)
    return ImageFont.load_default()


def alpha_trim(image: Image.Image, margin: int = 0) -> Image.Image:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("Generated cell contains no visible pixels")
    if margin:
        bbox = (
            max(0, bbox[0] - margin),
            max(0, bbox[1] - margin),
            min(image.width, bbox[2] + margin),
            min(image.height, bbox[3] + margin),
        )
    return image.crop(bbox)


def fit_to_canvas(image: Image.Image, canvas_size: tuple[int, int], padding: int = 10) -> Image.Image:
    image = alpha_trim(image, margin=2)
    max_width = canvas_size[0] - padding * 2
    max_height = canvas_size[1] - padding * 2
    scale = min(max_width / image.width, max_height / image.height, 1.0)
    if scale < 1.0:
        image = image.resize(
            (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
            Image.Resampling.LANCZOS,
        )
    canvas = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
    canvas.alpha_composite(image, ((canvas.width - image.width) // 2, (canvas.height - image.height) // 2))
    return canvas


def remove_edge_debris(image: Image.Image) -> Image.Image:
    """Remove tiny disconnected neighbors accidentally crossing a grid boundary."""
    alpha = image.getchannel("A")
    pixels = alpha.load()
    width, height = image.size
    visited = bytearray(width * height)
    components: list[tuple[list[tuple[int, int]], tuple[int, int, int, int]]] = []
    for y in range(height):
        for x in range(width):
            index = y * width + x
            if visited[index] or pixels[x, y] <= 20:
                continue
            visited[index] = 1
            queue = deque([(x, y)])
            points: list[tuple[int, int]] = []
            min_x = max_x = x
            min_y = max_y = y
            while queue:
                current_x, current_y = queue.popleft()
                points.append((current_x, current_y))
                min_x, max_x = min(min_x, current_x), max(max_x, current_x)
                min_y, max_y = min(min_y, current_y), max(max_y, current_y)
                for next_x, next_y in ((current_x - 1, current_y), (current_x + 1, current_y), (current_x, current_y - 1), (current_x, current_y + 1)):
                    if not (0 <= next_x < width and 0 <= next_y < height):
                        continue
                    next_index = next_y * width + next_x
                    if visited[next_index] or pixels[next_x, next_y] <= 20:
                        continue
                    visited[next_index] = 1
                    queue.append((next_x, next_y))
            components.append((points, (min_x, min_y, max_x + 1, max_y + 1)))
    if not components:
        return image
    largest_area = max(len(points) for points, _ in components)
    cleaned_alpha = alpha.copy()
    cleaned_pixels = cleaned_alpha.load()
    for points, bbox in components:
        touches_edge = bbox[0] <= 2 or bbox[1] <= 2 or bbox[2] >= width - 2 or bbox[3] >= height - 2
        # Generated grid cells occasionally contain a substantial slice of the
        # neighboring sprite, so the cutoff must be more generous than a
        # conventional dust/speck filter. Legitimate multi-piece assets (tabs,
        # coins, wings) are retained because their parts are not narrow edge
        # fragments.
        is_small_neighbor = len(points) < largest_area * 0.40
        is_thin_divider = (bbox[2] - bbox[0] <= 8 and bbox[3] - bbox[1] > height * 0.55) or (bbox[3] - bbox[1] <= 8 and bbox[2] - bbox[0] > width * 0.55)
        near_edge = bbox[0] < width * 0.08 or bbox[1] < height * 0.08 or bbox[2] > width * 0.92 or bbox[3] > height * 0.92
        is_narrow_fragment = bbox[2] - bbox[0] < width * 0.06 or bbox[3] - bbox[1] < height * 0.06
        is_generation_speck = len(points) < 32
        if is_generation_speck or ((touches_edge or (near_edge and is_narrow_fragment)) and (is_small_neighbor or is_thin_divider)):
            for x, y in points:
                cleaned_pixels[x, y] = 0
    cleaned_alpha = cleaned_alpha.point(lambda value: 0 if value <= 20 else value)
    cleaned = image.copy()
    cleaned.putalpha(cleaned_alpha)
    return cleaned


def split_sheet(sheet_path: Path, spec: SheetSpec, output_root: Path) -> list[Path]:
    with Image.open(sheet_path) as source:
        sheet = source.convert("RGBA")
    outputs: list[Path] = []
    expected = spec.columns * spec.rows
    if len(spec.assets) != expected:
        raise ValueError(f"{spec.filename}: expected {expected} asset specs")
    for index, asset in enumerate(spec.assets):
        column = index % spec.columns
        row = index // spec.columns
        if spec.filename == "floating-rig.png" and sheet.size == (1536, 1024):
            # This generated sheet includes visible separator lines and a wider
            # first column. Use their measured cell edges instead of assuming
            # mathematically equal columns.
            x_edges = (4, 456, 816, 1176, 1531)
            y_edges = (4, 512, 1020)
            left, right = x_edges[column] + 5, x_edges[column + 1] - 5
            top, bottom = y_edges[row] + 5, y_edges[row + 1] - 5
        else:
            left = round(column * sheet.width / spec.columns) + 6
            right = round((column + 1) * sheet.width / spec.columns) - 6
            top = round(row * sheet.height / spec.rows) + 6
            bottom = round((row + 1) * sheet.height / spec.rows) - 6
        cell = remove_edge_debris(sheet.crop((left, top, right, bottom)))
        prepared = fit_to_canvas(cell, asset.canvas)
        output_path = output_root / asset.relative_path
        output_path.parent.mkdir(parents=True, exist_ok=True)
        prepared.save(output_path, optimize=True)
        outputs.append(output_path)
    return outputs


def display_name(path: Path) -> str:
    return path.stem.replace("-", " ").title()


def make_overview(asset_paths: list[Path], output_root: Path) -> Path:
    columns = 8
    tile_width, tile_height = 240, 230
    header_height = 82
    rows = math.ceil(len(asset_paths) / columns)
    canvas = Image.new("RGBA", (columns * tile_width, header_height + rows * tile_height), (5, 10, 28, 255))
    draw = ImageDraw.Draw(canvas)
    title_font = load_font(30)
    label_font = load_font(15)
    draw.text((24, 19), "SCICON INTERFACE PACK V1", font=title_font, fill=(236, 247, 250, 255))
    draw.text((24, 53), f"{len(asset_paths)} transparent production assets • runtime text remains separate", font=label_font, fill=(103, 230, 241, 255))
    for index, path in enumerate(asset_paths):
        column = index % columns
        row = index // columns
        x = column * tile_width
        y = header_height + row * tile_height
        draw.rectangle((x + 5, y + 5, x + tile_width - 5, y + tile_height - 5), fill=(10, 19, 40, 255), outline=(39, 75, 101, 255), width=1)
        image = alpha_trim(Image.open(path).convert("RGBA"))
        image.thumbnail((tile_width - 28, tile_height - 58), Image.Resampling.LANCZOS)
        canvas.alpha_composite(image, (x + (tile_width - image.width) // 2, y + 12 + (tile_height - 58 - image.height) // 2))
        label = display_name(path)
        text_box = draw.textbbox((0, 0), label, font=label_font)
        draw.text((x + (tile_width - (text_box[2] - text_box[0])) // 2, y + tile_height - 35), label, font=label_font, fill=(199, 215, 225, 255))
    destination = output_root / "previews/scicon-interface-pack-v1-overview.png"
    destination.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(destination, optimize=True)
    return destination


def resized_trim(path: Path, maximum: tuple[int, int]) -> Image.Image:
    image = alpha_trim(Image.open(path).convert("RGBA"))
    scale = min(maximum[0] / image.width, maximum[1] / image.height, 1.0)
    if scale < 1.0:
        image = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
    return image


def gif_frame(source: Image.Image) -> Image.Image:
    alpha = source.getchannel("A")
    paletted = source.convert("RGB").quantize(colors=255, method=Image.Quantize.MEDIANCUT)
    transparency_mask = alpha.point(lambda value: 255 if value <= 12 else 0)
    paletted.paste(255, mask=transparency_mask)
    paletted.info["transparency"] = 255
    paletted.info["disposal"] = 2
    return paletted


def build_floating_preview(output_root: Path) -> tuple[Path, Path]:
    parts = output_root / "animations/floating-window/parts"
    body = resized_trim(parts / "window-body.png", (480, 360))
    thruster_left = resized_trim(parts / "thruster-left.png", (128, 230))
    thruster_right = resized_trim(parts / "thruster-right.png", (128, 230))
    flames = [
        resized_trim(parts / "flame-short.png", (78, 118)),
        resized_trim(parts / "flame-medium.png", (82, 142)),
        resized_trim(parts / "flame-long.png", (86, 166)),
    ]
    energy_glow = resized_trim(parts / "energy-glow.png", (560, 110))
    canvas_size = (900, 590)
    frames: list[Image.Image] = []
    frame_count = 48
    for index in range(frame_count):
        phase = index / frame_count * math.tau
        bob = round(math.sin(phase) * 7.0)
        panel = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
        body_x = (canvas_size[0] - body.width) // 2
        body_y = 78 + bob
        left_x = body_x - thruster_left.width + 46
        right_x = body_x + body.width - 46
        pod_y = body_y + 74

        glow = energy_glow.copy()
        glow_alpha = glow.getchannel("A").point(lambda value: round(value * (0.30 + 0.08 * math.sin(phase * 2.0))))
        glow.putalpha(glow_alpha)
        panel.alpha_composite(glow, ((canvas_size[0] - glow.width) // 2, body_y + body.height - 18))
        panel.alpha_composite(body, (body_x, body_y))
        panel.alpha_composite(thruster_left, (left_x, pod_y))
        panel.alpha_composite(thruster_right, (right_x, pod_y))

        flame_index = (index // 2) % len(flames)
        left_flame = flames[flame_index]
        right_flame = flames[(flame_index + 1) % len(flames)]
        left_flame_x = left_x + thruster_left.width // 2 - left_flame.width // 2 + 6
        right_flame_x = right_x + thruster_right.width // 2 - right_flame.width // 2 - 6
        flame_y = pod_y + max(thruster_left.height, thruster_right.height) - 25
        panel.alpha_composite(left_flame, (left_flame_x, flame_y))
        panel.alpha_composite(right_flame, (right_flame_x, flame_y + (index % 3 - 1) * 2))

        halo = panel.getchannel("A").filter(ImageFilter.GaussianBlur(8))
        halo = halo.point(lambda value: round(value * 0.025))
        glow_layer = Image.new("RGBA", canvas_size, (31, 201, 255, 0))
        glow_layer.putalpha(halo)
        combined = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
        combined.alpha_composite(glow_layer)
        combined.alpha_composite(panel)
        frames.append(combined)

    preview_root = output_root / "animations/floating-window/previews"
    preview_root.mkdir(parents=True, exist_ok=True)
    gif_path = preview_root / "scicon-floating-window-hover.gif"
    gif_frames = [gif_frame(frame) for frame in frames]
    gif_frames[0].save(
        gif_path,
        save_all=True,
        append_images=gif_frames[1:],
        duration=40,
        loop=0,
        transparency=255,
        disposal=2,
        optimize=False,
    )
    poster_path = preview_root / "scicon-floating-window-hover-poster.png"
    frames[12].save(poster_path, optimize=True)
    return gif_path, poster_path


def write_manifests(output_root: Path, asset_paths: list[Path]) -> None:
    relative_assets = [path.relative_to(output_root).as_posix() for path in asset_paths]
    pack_manifest = {
        "id": "scicon-interface-pack-v1",
        "displayName": "Scicon Interface Pack v1",
        "productionFormat": "transparent layered PNG",
        "styleGuide": "docs/scicon-animation-audio-style-guide.md",
        "runtimeText": True,
        "assetCount": len(relative_assets),
        "assets": relative_assets,
        "designNotes": [
            "Original Scicon UI family derived from the project's navy/cyan/violet/bronze design language.",
            "All labels and values are intentionally blank so runtime code controls wording and localization.",
            "Generated GIFs are gallery previews only; use layered PNG parts in production.",
        ],
    }
    (output_root / "pack-manifest.json").write_text(json.dumps(pack_manifest, indent=2) + "\n", encoding="utf-8")

    animation_manifest = {
        "id": "scicon-floating-window-hover",
        "productionFormat": "layered-png",
        "partsRoot": "parts",
        "parts": {
            "windowBody": "parts/window-body.png",
            "leftThruster": "parts/thruster-left.png",
            "rightThruster": "parts/thruster-right.png",
            "flames": ["parts/flame-short.png", "parts/flame-medium.png", "parts/flame-long.png"],
            "energyGlow": "parts/energy-glow.png",
        },
        "motion": {
            "durationMs": 1920,
            "loop": True,
            "windowTranslateY": {"wave": "sine", "amplitudePx": 7},
            "thrusterFlames": {"mode": "frame-cycle", "frameDurationMs": 80, "asynchronous": True},
            "energyGlow": {"wave": "sine", "opacity": [0.30, 0.38]},
        },
        "audioFamily": "Use the restrained futuristic pressure-door/servo family in docs/scicon-animation-audio-style-guide.md when the window enters; hover should usually remain silent.",
        "preview": "previews/scicon-floating-window-hover.gif",
    }
    animation_root = output_root / "animations/floating-window"
    (animation_root / "animation-manifest.json").write_text(json.dumps(animation_manifest, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sheet-root", type=Path, default=Path("tmp/imagegen/scicon-ui-pack-v1/transparent"))
    parser.add_argument("--output-root", type=Path, default=Path("public/game-art/generated/ui/scicon-interface-pack-v1"))
    args = parser.parse_args()
    sheet_root = args.sheet_root.resolve()
    output_root = args.output_root.resolve()
    output_root.mkdir(parents=True, exist_ok=True)

    asset_paths: list[Path] = []
    sprite_sheet_root = output_root / "sprite-sheets"
    sprite_sheet_root.mkdir(parents=True, exist_ok=True)
    for spec in SHEETS:
        sheet_path = sheet_root / spec.filename
        if not sheet_path.exists():
            raise FileNotFoundError(sheet_path)
        shutil.copy2(sheet_path, sprite_sheet_root / spec.filename)
        asset_paths.extend(split_sheet(sheet_path, spec, output_root))

    overview = make_overview(asset_paths, output_root)
    floating_gif, floating_poster = build_floating_preview(output_root)
    write_manifests(output_root, asset_paths)
    print(f"Built {len(asset_paths)} transparent production PNGs")
    print(f"Overview: {overview}")
    print(f"Floating preview: {floating_gif}")
    print(f"Floating poster: {floating_poster}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
