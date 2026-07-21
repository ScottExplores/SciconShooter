"""Build the Simple Arcade Kit from generated effects and deterministic UI geometry."""

from __future__ import annotations

import hashlib
import json
import math
from datetime import date
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "tools" / "imagegen-sources" / "scicon-simple-arcade-kit-v1"
OUTPUT_DIR = ROOT / "public" / "game-art" / "generated" / "ui" / "scicon-simple-arcade-kit-v1"

COLORS = {
    "lime": (122, 255, 38),
    "cyan": (27, 225, 255),
    "gold": (255, 211, 38),
    "violet": (194, 74, 255),
    "red": (255, 74, 48),
    "white": (240, 249, 255),
    "silver": (166, 197, 220),
}
ANIMATION_DURATIONS = [110, 110, 110, 110, 110, 110, 110, 110]
TRACE_BOX_PHASES = {
    "label": 24,
    "card": 8,
    "wide": 8,
    "tall": 8,
}
TRACE_BOX_FRAME_DURATIONS = {
    "label": 45,
    "card": 110,
    "wide": 110,
    "tall": 110,
}

assets: list[dict[str, object]] = []


def public_path(path: Path) -> str:
    return "/" + path.relative_to(ROOT / "public").as_posix()


def sha256(image: Image.Image) -> str:
    return hashlib.sha256(image.tobytes()).hexdigest()


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def threshold_bbox(image: Image.Image, threshold: int = 18) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A").point(lambda value: 255 if value >= threshold else 0)
    bbox = alpha.getbbox()
    if bbox is None:
        raise ValueError("Generated source frame is empty")
    return bbox


def split_horizontal(image: Image.Image, count: int) -> list[Image.Image]:
    edges = [round(image.width * index / count) for index in range(count + 1)]
    return [image.crop((edges[index], 0, edges[index + 1], image.height)) for index in range(count)]


def normalize_relative_frames(raw: list[Image.Image], cell: int, content: int) -> list[Image.Image]:
    bboxes = [threshold_bbox(frame) for frame in raw]
    max_width = max(right - left for left, _, right, _ in bboxes)
    max_height = max(bottom - top for _, top, _, bottom in bboxes)
    scale = min(content / max_width, content / max_height)
    result: list[Image.Image] = []
    for frame, bbox in zip(raw, bboxes, strict=True):
        subject = frame.crop(bbox)
        size = (max(1, round(subject.width * scale)), max(1, round(subject.height * scale)))
        subject = subject.resize(size, Image.Resampling.NEAREST)
        canvas = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
        canvas.alpha_composite(subject, ((cell - size[0]) // 2, (cell - size[1]) // 2))
        result.append(canvas)
    return result


def recolor(image: Image.Image, color: tuple[int, int, int]) -> Image.Image:
    pixels = []
    for red, green, blue, alpha in image.convert("RGBA").getdata():
        lum = (red * 54 + green * 183 + blue * 19) // 256
        if lum < 42:
            amount = lum / 42
            rgb = tuple(round(5 + channel * 0.12 * amount) for channel in color)
        elif lum < 205:
            amount = (lum - 42) / 163
            shadow = tuple(max(8, round(channel * 0.22)) for channel in color)
            rgb = tuple(round(shadow[index] + (color[index] - shadow[index]) * amount) for index in range(3))
        else:
            amount = (lum - 205) / 50
            rgb = tuple(round(color[index] + (255 - color[index]) * amount) for index in range(3))
        pixels.append((*rgb, alpha))
    output = Image.new("RGBA", image.size, (0, 0, 0, 0))
    output.putdata(pixels)
    return output


def save_animation(
    directory: Path,
    asset_id: str,
    frames: list[Image.Image],
    durations: list[int],
    kind: str,
    transparent_center: bool = False,
) -> dict[str, object]:
    frame_dir = directory / "frames"
    frame_dir.mkdir(parents=True, exist_ok=True)
    frame_paths: list[Path] = []
    for index, frame in enumerate(frames, start=1):
        path = frame_dir / f"{asset_id}-{index:02d}.png"
        frame.save(path, optimize=True)
        frame_paths.append(path)

    sheet = Image.new("RGBA", (frames[0].width * len(frames), frames[0].height), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        sheet.alpha_composite(frame, (index * frame.width, 0))
    sheet_path = directory / f"{asset_id}-sprite-sheet.png"
    gif_path = directory / f"{asset_id}-preview.gif"
    sheet.save(sheet_path, optimize=True)
    frames[0].save(
        gif_path,
        save_all=True,
        append_images=frames[1:],
        duration=durations,
        loop=0,
        disposal=2,
        transparency=0,
        optimize=False,
    )
    record = {
        "id": asset_id,
        "kind": kind,
        "frames": [public_path(path) for path in frame_paths],
        "sheet": public_path(sheet_path),
        "previewGif": public_path(gif_path),
        "frameSize": [frames[0].width, frames[0].height],
        "frameHashes": [sha256(frame) for frame in frames],
        "transparentCenter": transparent_center,
    }
    assets.append(record)
    return record


def save_static(path: Path, image: Image.Image, asset_id: str, kind: str, transparent_center: bool) -> None:
    ensure_parent(path)
    image.save(path, optimize=True)
    assets.append({
        "id": asset_id,
        "kind": kind,
        "path": public_path(path),
        "size": [image.width, image.height],
        "hash": sha256(image),
        "transparentCenter": transparent_center,
    })


def sampled_path(points: list[tuple[int, int]], density: float = 1.0) -> list[tuple[int, int]]:
    samples: list[tuple[int, int]] = []
    for start, end in zip(points, points[1:]):
        distance = math.dist(start, end)
        steps = max(2, round(distance * density))
        for index in range(steps):
            amount = index / steps
            samples.append((round(start[0] + (end[0] - start[0]) * amount), round(start[1] + (end[1] - start[1]) * amount)))
    return samples


def draw_glow_path(
    image: Image.Image,
    points: list[tuple[int, int]],
    color: tuple[int, int, int],
    width: int,
    glow: int,
    closed: bool = False,
) -> None:
    if closed and points[0] != points[-1]:
        points = [*points, points[0]]
    glow_layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow_layer)
    glow_draw.line(points, fill=(*color, 180), width=width + glow, joint="curve")
    glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(max(1, glow // 2)))
    image.alpha_composite(glow_layer)
    draw = ImageDraw.Draw(image)
    draw.line(points, fill=(*color, 255), width=width, joint="curve")
    draw.line(points, fill=(244, 253, 255, 230), width=max(1, width // 3), joint="curve")


def trace_frame(
    size: tuple[int, int],
    outline: list[tuple[int, int]],
    color: tuple[int, int, int],
    phase: int,
    phases: int = 8,
) -> Image.Image:
    image = Image.new("RGBA", size, (0, 0, 0, 0))
    base = ImageDraw.Draw(image)
    base.line(outline, fill=(*tuple(round(channel * 0.26) for channel in color), 205), width=max(2, min(size) // 64), joint="curve")
    samples = sampled_path(outline)
    start = round(len(samples) * phase / phases)
    length = max(10, round(len(samples) * 0.17))
    segment = [samples[(start + index) % len(samples)] for index in range(length)]
    draw_glow_path(image, segment, color, max(3, min(size) // 42), max(8, min(size) // 18))
    return image


def build_diamond_selectors() -> None:
    for label, size, margin in (("mini", 128, 15), ("ship", 256, 27)):
        center = size // 2
        outer = [(center, margin), (size - margin, center), (center, size - margin), (margin, center), (center, margin)]
        inner_margin = margin + max(8, size // 14)
        inner = [(center, inner_margin), (size - inner_margin, center), (center, size - inner_margin), (inner_margin, center), (center, inner_margin)]
        for color_name in ("lime", "cyan", "gold", "violet"):
            color = COLORS[color_name]
            frames = []
            for phase in range(8):
                frame = trace_frame((size, size), outer, color, phase)
                ImageDraw.Draw(frame).line(inner, fill=(*color, 90), width=max(1, size // 96), joint="curve")
                frames.append(frame)
            asset_id = f"diamond-selector-{label}-{color_name}"
            directory = OUTPUT_DIR / "selectors" / "diamond" / label / color_name
            save_animation(directory, asset_id, frames, ANIMATION_DURATIONS, "diamond-selector", True)
            blank = frames[0].copy()
            blank_alpha = Image.new("RGBA", blank.size, (0, 0, 0, 0))
            draw = ImageDraw.Draw(blank_alpha)
            draw.line(outer, fill=(*color, 205), width=max(2, size // 64), joint="curve")
            draw.line(inner, fill=(*color, 90), width=max(1, size // 96), joint="curve")
            save_static(directory / f"{asset_id}-blank.png", blank_alpha, f"{asset_id}-blank", "diamond-selector", True)


def chamfer_outline(width: int, height: int, margin: int, cut: int) -> list[tuple[int, int]]:
    return [
        (margin + cut, margin),
        (width - margin - cut, margin),
        (width - margin, margin + cut),
        (width - margin, height - margin - cut),
        (width - margin - cut, height - margin),
        (margin + cut, height - margin),
        (margin, height - margin - cut),
        (margin, margin + cut),
        (margin + cut, margin),
    ]


def build_trace_boxes() -> None:
    sizes = {
        "label": (320, 96),
        "card": (320, 240),
        "wide": (512, 128),
        "tall": (512, 640),
    }
    for size_name, (width, height) in sizes.items():
        margin = max(8, min(width, height) // 12)
        outline = chamfer_outline(width, height, margin, max(8, margin))
        for color_name in ("cyan", "gold", "lime", "violet"):
            color = COLORS[color_name]
            phase_count = TRACE_BOX_PHASES[size_name]
            frames = [
                trace_frame((width, height), outline, color, phase, phase_count)
                for phase in range(phase_count)
            ]
            asset_id = f"trace-box-{size_name}-{color_name}"
            directory = OUTPUT_DIR / "trace-boxes" / size_name / color_name
            save_animation(
                directory,
                asset_id,
                frames,
                [TRACE_BOX_FRAME_DURATIONS[size_name]] * phase_count,
                "trace-box",
                True,
            )
            blank = Image.new("RGBA", (width, height), (0, 0, 0, 0))
            ImageDraw.Draw(blank).line(outline, fill=(*color, 210), width=max(3, min(width, height) // 32), joint="curve")
            save_static(directory / f"{asset_id}-blank.png", blank, f"{asset_id}-blank", "trace-box", True)


def build_projectiles() -> None:
    families = {
        "ring-bomb": ("01-ring-bomb-rgba.png", ("red", "cyan", "lime", "violet")),
        "needle-bolt": ("02-gold-needle-rgba.png", ("gold", "cyan", "lime", "violet", "red")),
        "plasma-seed": ("03-cyan-plasma-seed-rgba.png", ("cyan", "lime", "gold", "violet", "red")),
        "prism-shard": ("04-violet-prism-shard-rgba.png", ("violet", "cyan", "lime", "gold", "red")),
    }
    for family, (source_name, color_names) in families.items():
        source = Image.open(SOURCE_DIR / source_name).convert("RGBA")
        normalized = normalize_relative_frames(split_horizontal(source, 4), 128, 108)
        for color_name in color_names:
            frames = [recolor(frame, COLORS[color_name]) for frame in normalized]
            asset_id = f"projectile-{family}-{color_name}"
            directory = OUTPUT_DIR / "projectiles" / family / color_name
            save_animation(directory, asset_id, frames, [80, 80, 90, 120], "projectile")


def build_spiral_triangles() -> None:
    source = Image.open(SOURCE_DIR / "05-spiral-triangle-rgba.png").convert("RGBA")
    normalized = normalize_relative_frames(split_horizontal(source, 4), 192, 162)
    for color_name in ("lime", "cyan", "gold", "violet", "red"):
        frames = [recolor(frame, COLORS[color_name]) for frame in normalized]
        asset_id = f"spiral-triangle-{color_name}"
        directory = OUTPUT_DIR / "spiral-triangles" / color_name
        save_animation(directory, asset_id, frames, [120, 120, 120, 120], "spiral-triangle", True)


def draw_static_frame(size: tuple[int, int], color: tuple[int, int, int], header: bool = False) -> Image.Image:
    width, height = size
    image = Image.new("RGBA", size, (0, 0, 0, 0))
    margin = max(8, min(size) // 30)
    cut = max(10, min(size) // 22)
    outline = chamfer_outline(width, height, margin, cut)
    draw = ImageDraw.Draw(image)
    draw.line(outline, fill=(5, 18, 39, 255), width=max(8, min(size) // 24), joint="curve")
    draw.line(outline, fill=(*color, 255), width=max(3, min(size) // 55), joint="curve")
    inner = chamfer_outline(width, height, margin + max(6, min(size) // 36), cut)
    draw.line(inner, fill=(*color, 115), width=max(2, min(size) // 90), joint="curve")
    if header and height >= 240:
        y = margin + max(60, height // 8)
        draw.line([(margin + cut, y), (width - margin - cut, y)], fill=(*color, 170), width=max(2, min(size) // 80))
    return image


def build_panels_and_buttons() -> None:
    panels = {
        "compact": (480, 320),
        "standard": (640, 480),
        "tall": (720, 960),
        "wide": (960, 540),
    }
    buttons = {
        "small": (240, 72),
        "medium": (360, 88),
        "wide": (512, 96),
        "square": (96, 96),
    }
    for color_name in ("cyan", "gold"):
        color = COLORS[color_name]
        for name, size in panels.items():
            asset_id = f"menu-panel-{name}-{color_name}"
            image = draw_static_frame(size, color, header=True)
            save_static(OUTPUT_DIR / "panels" / color_name / f"{asset_id}.png", image, asset_id, "menu-panel", True)
        for name, size in buttons.items():
            asset_id = f"button-frame-{name}-{color_name}"
            image = draw_static_frame(size, color)
            save_static(OUTPUT_DIR / "buttons" / color_name / f"{asset_id}.png", image, asset_id, "button-frame", True)


def filled_chamfered_panel(size: tuple[int, int], border: tuple[int, int, int], header: bool = True) -> Image.Image:
    width, height = size
    image = Image.new("RGBA", size, (0, 0, 0, 0))
    margin = max(6, min(size) // 42)
    cut = max(10, min(size) // 24)
    outline = chamfer_outline(width, height, margin, cut)
    draw = ImageDraw.Draw(image)
    draw.polygon(outline[:-1], fill=(7, 20, 38, 255))
    draw.line(outline, fill=(2, 8, 18, 255), width=max(10, min(size) // 22), joint="curve")
    draw.line(outline, fill=(*border, 255), width=max(4, min(size) // 52), joint="curve")
    inner = chamfer_outline(width, height, margin + max(7, min(size) // 34), cut)
    draw.line(inner, fill=(*border, 105), width=max(2, min(size) // 90), joint="curve")
    if header and height >= 240:
        header_height = max(62, height // 8)
        header_box = [
            (margin + cut, margin + 8),
            (width - margin - cut, margin + 8),
            (width - margin - cut - 8, header_height),
            (margin + cut + 8, header_height),
        ]
        draw.polygon(header_box, fill=(*tuple(round(channel * 0.18) for channel in border), 255))
        draw.line(
            [(margin + cut + 8, header_height), (width - margin - cut - 8, header_height)],
            fill=(*border, 190),
            width=max(2, min(size) // 75),
        )
    return image


def filled_button(size: tuple[int, int], color: tuple[int, int, int]) -> Image.Image:
    width, height = size
    image = Image.new("RGBA", size, (0, 0, 0, 0))
    margin = max(4, height // 12)
    cut = max(7, height // 7)
    outline = chamfer_outline(width, height, margin, cut)
    draw = ImageDraw.Draw(image)
    shadow = tuple(max(0, round(channel * 0.18)) for channel in color)
    fill = tuple(max(0, round(channel * 0.72)) for channel in color)
    draw.polygon(outline[:-1], fill=(*fill, 255))
    draw.line(outline, fill=(4, 10, 19, 255), width=max(8, height // 8), joint="curve")
    draw.line(outline, fill=(*color, 255), width=max(3, height // 18), joint="curve")
    inner = chamfer_outline(width, height, margin + max(5, height // 12), cut)
    draw.line(inner, fill=(*shadow, 210), width=max(2, height // 30), joint="curve")
    highlight_y = margin + max(4, height // 12)
    draw.line((margin + cut, highlight_y, width - margin - cut, highlight_y), fill=(255, 255, 255, 105), width=max(2, height // 28))
    return image


def build_basic_menus() -> None:
    panel_palettes = {
        "blue": COLORS["cyan"],
        "charcoal": COLORS["silver"],
        "purple": COLORS["violet"],
    }
    panel_sizes = {
        "compact": (480, 320),
        "standard": (640, 480),
        "tall": (720, 960),
        "wide": (960, 540),
    }
    for palette_name, border in panel_palettes.items():
        for size_name, size in panel_sizes.items():
            asset_id = f"basic-menu-panel-{size_name}-{palette_name}"
            image = filled_chamfered_panel(size, border, header=True)
            save_static(
                OUTPUT_DIR / "basic-menus" / "panels" / palette_name / f"{asset_id}.png",
                image,
                asset_id,
                "basic-menu-panel",
                False,
            )

    button_palettes = {
        "cyan": COLORS["cyan"],
        "orange": (255, 151, 32),
        "green": COLORS["lime"],
        "gray": COLORS["silver"],
    }
    button_sizes = {
        "small": (240, 72),
        "medium": (360, 88),
        "wide": (512, 96),
        "square": (96, 96),
    }
    for palette_name, color in button_palettes.items():
        for size_name, size in button_sizes.items():
            asset_id = f"basic-menu-button-{size_name}-{palette_name}"
            save_static(
                OUTPUT_DIR / "basic-menus" / "buttons" / palette_name / f"{asset_id}.png",
                filled_button(size, color),
                asset_id,
                "basic-menu-button",
                False,
            )

    for color_name in ("cyan", "gold"):
        color = COLORS[color_name]
        for size_name, (width, height) in (("medium", (400, 48)), ("wide", (600, 56))):
            image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
            draw = ImageDraw.Draw(image)
            draw.rounded_rectangle((3, 8, width - 4, height - 9), radius=8, fill=(5, 16, 30, 255), outline=(*color, 255), width=3)
            asset_id = f"basic-menu-slider-track-{size_name}-{color_name}"
            save_static(
                OUTPUT_DIR / "basic-menus" / "sliders" / f"{asset_id}.png",
                image,
                asset_id,
                "basic-menu-slider-track",
                False,
            )
        knob = Image.new("RGBA", (72, 56), (0, 0, 0, 0))
        knob_draw = ImageDraw.Draw(knob)
        knob_draw.rounded_rectangle((4, 4, 67, 51), radius=8, fill=(235, 250, 255, 255), outline=(*color, 255), width=5)
        asset_id = f"basic-menu-slider-knob-{color_name}"
        save_static(OUTPUT_DIR / "basic-menus" / "sliders" / f"{asset_id}.png", knob, asset_id, "basic-menu-slider-knob", False)

        for state in ("off", "on"):
            toggle = Image.new("RGBA", (128, 56), (0, 0, 0, 0))
            toggle_draw = ImageDraw.Draw(toggle)
            track_color = color if state == "on" else (65, 77, 96)
            toggle_draw.rounded_rectangle((2, 3, 125, 52), radius=24, fill=(*track_color, 255), outline=(225, 240, 248, 255), width=3)
            knob_x = 98 if state == "on" else 30
            toggle_draw.ellipse((knob_x - 20, 8, knob_x + 20, 48), fill=(247, 252, 255, 255), outline=(7, 18, 31, 255), width=3)
            asset_id = f"basic-menu-toggle-{state}-{color_name}"
            save_static(OUTPUT_DIR / "basic-menus" / "toggles" / f"{asset_id}.png", toggle, asset_id, "basic-menu-toggle", False)

        for state in ("inactive", "active"):
            tab_color = color if state == "active" else (93, 107, 135)
            asset_id = f"basic-menu-tab-{state}-{color_name}"
            save_static(
                OUTPUT_DIR / "basic-menus" / "tabs" / f"{asset_id}.png",
                filled_button((320, 80), tab_color),
                asset_id,
                "basic-menu-tab",
                False,
            )

        for size_name, width in (("small", 320), ("medium", 512), ("wide", 768)):
            divider = Image.new("RGBA", (width, 20), (0, 0, 0, 0))
            divider_draw = ImageDraw.Draw(divider)
            divider_draw.line((4, 10, width - 5, 10), fill=(*color, 210), width=3)
            divider_draw.rectangle((width // 2 - 5, 5, width // 2 + 5, 15), fill=(*color, 255))
            asset_id = f"basic-menu-divider-{size_name}-{color_name}"
            save_static(OUTPUT_DIR / "basic-menus" / "dividers" / f"{asset_id}.png", divider, asset_id, "basic-menu-divider", False)


def build_boss_bars() -> None:
    for size_name, (width, height) in (("compact", (512, 64)), ("standard", (768, 80))):
        for color_name in ("silver", "gold", "cyan"):
            color = COLORS[color_name]
            image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
            outline = [
                (height // 2, 6), (width - height // 2, 6), (width - 6, height // 2),
                (width - height // 2, height - 6), (height // 2, height - 6), (6, height // 2),
                (height // 2, 6),
            ]
            draw = ImageDraw.Draw(image)
            draw.line(outline, fill=(7, 14, 26, 255), width=12, joint="curve")
            draw.line(outline, fill=(*color, 255), width=5, joint="curve")
            inner = [(x, y + (5 if y < height // 2 else -5)) for x, y in outline]
            draw.line(inner, fill=(*color, 90), width=2, joint="curve")
            for x in (height // 2, width - height // 2):
                draw.polygon([(x, 2), (x + 8, 10), (x, 18), (x - 8, 10)], fill=(*color, 255))
            asset_id = f"boss-health-bar-{size_name}-{color_name}"
            directory = OUTPUT_DIR / "boss-bars" / size_name
            save_static(directory / f"{asset_id}.png", image, asset_id, "boss-health-bar", True)

        mask = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        mask_draw = ImageDraw.Draw(mask)
        inset = height // 2
        mask_draw.rounded_rectangle((inset, 16, width - inset, height - 16), radius=max(2, height // 8), fill=(255, 255, 255, 255))
        save_static(
            OUTPUT_DIR / "boss-bars" / size_name / f"boss-health-fill-mask-{size_name}.png",
            mask,
            f"boss-health-fill-mask-{size_name}",
            "boss-health-fill-mask",
            False,
        )


GLYPHS = {
    "0": ("01110", "10001", "10011", "10101", "11001", "10001", "01110"),
    "1": ("00100", "01100", "00100", "00100", "00100", "00100", "01110"),
    "2": ("01110", "10001", "00001", "00010", "00100", "01000", "11111"),
    "3": ("11110", "00001", "00001", "01110", "00001", "00001", "11110"),
    "4": ("00010", "00110", "01010", "10010", "11111", "00010", "00010"),
    "5": ("11111", "10000", "10000", "11110", "00001", "00001", "11110"),
    "6": ("01110", "10000", "10000", "11110", "10001", "10001", "01110"),
    "7": ("11111", "00001", "00010", "00100", "01000", "01000", "01000"),
    "8": ("01110", "10001", "10001", "01110", "10001", "10001", "01110"),
    "9": ("01110", "10001", "10001", "01111", "00001", "00001", "01110"),
    "/": ("00001", "00010", "00010", "00100", "01000", "01000", "10000"),
    "W": ("10001", "10001", "10001", "10101", "10101", "10101", "01010"),
    "A": ("01110", "10001", "10001", "11111", "10001", "10001", "10001"),
    "V": ("10001", "10001", "10001", "10001", "10001", "01010", "00100"),
    "E": ("11111", "10000", "10000", "11110", "10000", "10000", "11111"),
}


def render_glyph(pattern: tuple[str, ...], color: tuple[int, int, int], cell: tuple[int, int] = (64, 80)) -> Image.Image:
    width, height = cell
    block = 8
    glyph_width = len(pattern[0]) * block
    glyph_height = len(pattern) * block
    x0 = (width - glyph_width) // 2
    y0 = (height - glyph_height) // 2
    core = Image.new("RGBA", cell, (0, 0, 0, 0))
    draw = ImageDraw.Draw(core)
    for row, line in enumerate(pattern):
        for column, value in enumerate(line):
            if value == "1":
                x = x0 + column * block
                y = y0 + row * block
                draw.rectangle((x, y, x + block - 1, y + block - 1), fill=(*color, 255))
                draw.line((x + 2, y + 1, x + block - 3, y + 1), fill=(248, 255, 255, 230), width=2)
    glow = core.getchannel("A").filter(ImageFilter.GaussianBlur(6))
    glow_layer = Image.new("RGBA", cell, (*color, 0))
    glow_layer.putalpha(glow.point(lambda value: round(value * 0.62)))
    glow_layer.alpha_composite(core)
    return glow_layer


def build_wave_glyphs() -> None:
    glyph_order = ["W", "A", "V", "E", *list("0123456789"), "/"]
    labels = {"/": "slash"}
    for color_name in ("cyan", "gold", "violet"):
        color = COLORS[color_name]
        frames = [render_glyph(GLYPHS[glyph], color) for glyph in glyph_order]
        atlas = Image.new("RGBA", (64 * len(frames), 80), (0, 0, 0, 0))
        glyph_map = {}
        for index, (glyph, frame) in enumerate(zip(glyph_order, frames, strict=True)):
            atlas.alpha_composite(frame, (index * 64, 0))
            glyph_id = labels.get(glyph, glyph.lower())
            path = OUTPUT_DIR / "wave-glyphs" / color_name / f"wave-glyph-{glyph_id}-{color_name}.png"
            save_static(path, frame, f"wave-glyph-{glyph_id}-{color_name}", "wave-glyph", False)
            glyph_map[glyph] = {"x": index * 64, "y": 0, "width": 64, "height": 80}
        atlas_path = OUTPUT_DIR / "wave-glyphs" / color_name / f"wave-glyph-atlas-{color_name}.png"
        atlas.save(atlas_path, optimize=True)
        assets.append({
            "id": f"wave-glyph-atlas-{color_name}",
            "kind": "wave-glyph-atlas",
            "path": public_path(atlas_path),
            "size": [atlas.width, atlas.height],
            "glyphs": glyph_map,
            "transparentCenter": False,
        })
        word = Image.new("RGBA", (64 * 4, 80), (0, 0, 0, 0))
        for index, frame in enumerate(frames[:4]):
            word.alpha_composite(frame, (index * 64, 0))
        save_static(
            OUTPUT_DIR / "wave-glyphs" / color_name / f"wave-title-{color_name}.png",
            word,
            f"wave-title-{color_name}",
            "wave-title",
            False,
        )


def build_overview() -> None:
    canvas = Image.new("RGBA", (1200, 1280), (5, 12, 28, 255))
    draw = ImageDraw.Draw(canvas)
    draw.text((36, 26), "SIMPLE ARCADE KIT", fill=(230, 248, 255, 255))

    y = 90
    for index, color_name in enumerate(("lime", "cyan", "gold", "violet")):
        path = OUTPUT_DIR / "selectors" / "diamond" / "ship" / color_name / f"diamond-selector-ship-{color_name}-blank.png"
        image = Image.open(path).convert("RGBA").resize((190, 190), Image.Resampling.NEAREST)
        canvas.alpha_composite(image, (45 + index * 285, y))

    y = 315
    for index, color_name in enumerate(("cyan", "gold", "lime", "violet")):
        path = OUTPUT_DIR / "trace-boxes" / "label" / color_name / f"trace-box-label-{color_name}-blank.png"
        image = Image.open(path).convert("RGBA").resize((250, 75), Image.Resampling.NEAREST)
        canvas.alpha_composite(image, (35 + index * 290, y))

    y = 430
    projectile_records = [record for record in assets if record["kind"] == "projectile"][:12]
    for index, record in enumerate(projectile_records):
        image = Image.open(ROOT / "public" / str(record["frames"][-1]).lstrip("/")).convert("RGBA")
        x = 45 + (index % 6) * 190
        py = y + (index // 6) * 150
        canvas.alpha_composite(image, (x, py))

    y = 760
    for index, color_name in enumerate(("lime", "cyan", "gold", "violet", "red")):
        path = OUTPUT_DIR / "spiral-triangles" / color_name / "frames" / f"spiral-triangle-{color_name}-03.png"
        image = Image.open(path).convert("RGBA").resize((150, 150), Image.Resampling.NEAREST)
        canvas.alpha_composite(image, (30 + index * 230, y))

    y = 940
    bar = Image.open(OUTPUT_DIR / "boss-bars" / "standard" / "boss-health-bar-standard-silver.png").convert("RGBA")
    canvas.alpha_composite(bar.resize((690, 72), Image.Resampling.NEAREST), (40, y))
    glyphs = Image.open(OUTPUT_DIR / "wave-glyphs" / "cyan" / "wave-glyph-atlas-cyan.png").convert("RGBA")
    canvas.alpha_composite(glyphs.resize((420, 38), Image.Resampling.NEAREST), (760, y + 18))

    panel = Image.open(OUTPUT_DIR / "basic-menus" / "panels" / "blue" / "basic-menu-panel-standard-blue.png").convert("RGBA")
    canvas.alpha_composite(panel.resize((480, 320), Image.Resampling.NEAREST), (40, 1040))
    button = Image.open(OUTPUT_DIR / "basic-menus" / "buttons" / "orange" / "basic-menu-button-wide-orange.png").convert("RGBA")
    canvas.alpha_composite(button.resize((430, 81), Image.Resampling.NEAREST), (650, 1100))
    path = OUTPUT_DIR / "simple-arcade-kit-overview.png"
    canvas.save(path, optimize=True)
    assets.append({"id": "simple-arcade-kit-overview", "kind": "overview", "path": public_path(path), "size": list(canvas.size), "transparentCenter": False})


def write_docs() -> None:
    (OUTPUT_DIR / "README.md").write_text(
        """# Scicon Simple Arcade Kit v1

This pack contains simpler reusable arcade UI and gameplay elements:

- animated hollow diamond ship selectors in two sizes and four colors;
- animated transparent-center trace boxes in four sizes and four colors;
- four projectile families with small-to-large launch frames and color variants;
- hollow spiral-triangle effects in five colors;
- transparent-center menu panels, button frames, and boss health-bar overlays;
- static filled menu dashboards, blank buttons, sliders, toggles, tabs, and dividers with no traveling tracer;
- `W`, `A`, `V`, `E`, digits `0-9`, and `/` as glowing bitmap glyphs.

Use the PNG frames at runtime. GIF files are gallery previews. Put live text or a
Pixi fill rectangle underneath the transparent UI overlays. For wave counters,
live text/BitmapFont is preferred; the glyph atlas is the fallback.
""",
        encoding="utf-8",
    )


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    build_diamond_selectors()
    build_trace_boxes()
    build_projectiles()
    build_spiral_triangles()
    build_panels_and_buttons()
    build_basic_menus()
    build_boss_bars()
    build_wave_glyphs()
    build_overview()
    write_docs()
    manifest = {
        "id": "scicon-simple-arcade-kit-v1",
        "version": 1,
        "generated": date.today().isoformat(),
        "sourceMode": "Mixed: OpenAI built-in image generation plus deterministic Pillow UI construction",
        "galleryCategory": "Simple Arcade Kit",
        "runtimeProtocol": {
            "animations": "Use PNG frames/sheets; GIF files are previews only.",
            "transparentCenters": "Place ships, live text, or tinted fill rectangles underneath the overlay images.",
            "waveText": "Prefer live text or BitmapFont. Use the included glyph atlas only when sprite lettering is required.",
            "projectiles": "Advance once from frame 1 through frame 4, then hold frame 4 while the projectile remains alive.",
        },
        "assets": assets,
    }
    (OUTPUT_DIR / "pack-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Built {len(assets)} Simple Arcade Kit asset groups in {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
