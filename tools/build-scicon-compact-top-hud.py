from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "tmp" / "imagegen" / "compact-top-hud-v1" / "alpha"
OUT = ROOT / "public" / "game-art" / "generated" / "ui" / "scicon-compact-top-hud-v1"


@dataclass(frozen=True)
class SpriteSpec:
    slug: str
    group: str
    source: str
    cell: int
    canvas: tuple[int, int]
    role: str


SPRITES = (
    SpriteSpec("life-counter-frame", "frames", "frames", 0, (384, 128), "Blank lives/health counter with icon socket"),
    SpriteSpec("flask-progress-frame", "frames", "frames", 1, (512, 128), "Hollow flask meter frame; place a fill sprite behind it"),
    SpriteSpec("score-counter-frame", "frames", "frames", 2, (384, 128), "Blank score counter for live numeric text"),
    SpriteSpec("pause-button-normal", "buttons", "frames", 3, (160, 160), "Default pause control"),
    SpriteSpec("pause-button-selected", "buttons", "frames", 4, (160, 160), "Hover/focus/selected pause control"),
    SpriteSpec("pause-button-pressed", "buttons", "frames", 5, (160, 160), "Pressed pause control"),
    SpriteSpec("wave-counter-frame", "frames", "frames", 6, (384, 128), "Blank wave/level counter with icon socket"),
    SpriteSpec("boss-name-plaque", "frames", "frames", 7, (288, 96), "Blank boss name plaque for live text"),
    SpriteSpec("boss-integrity-frame", "frames", "frames", 8, (512, 96), "Hollow boss integrity frame; place a fill behind it"),
    SpriteSpec("heart-full-icon", "icons", "icons", 0, (96, 96), "Full life icon"),
    SpriteSpec("flask-icon", "icons", "icons", 1, (96, 96), "Flask/research-charge icon"),
    SpriteSpec("wave-chevron-icon", "icons", "icons", 2, (96, 96), "Wave/level chevrons"),
    SpriteSpec("flask-fill-cyan", "fills", "icons", 3, (420, 48), "Primary progress fill; crop or mask horizontally"),
    SpriteSpec("warning-fill-amber", "fills", "icons", 4, (420, 48), "Warning progress fill; crop or mask horizontally"),
    SpriteSpec("critical-fill-red", "fills", "icons", 5, (420, 48), "Critical progress fill; crop or mask horizontally"),
    SpriteSpec("heart-empty-icon", "icons", "icons", 6, (96, 96), "Lost/empty life icon"),
    SpriteSpec("flask-active-icon", "icons", "icons", 7, (96, 96), "Charged flask icon"),
    SpriteSpec("research-score-icon", "icons", "icons", 8, (96, 96), "Research-score medallion"),
    SpriteSpec("heart-health-shell", "meter-parts", "meters", 0, (128, 128), "Fixed hollow heart shell drawn above the health fill"),
    SpriteSpec("heart-health-fill", "meter-parts", "meters", 1, (128, 128), "Coral heart fill revealed bottom-up by remaining health"),
    SpriteSpec("heart-health-full-reference", "references", "meters", 2, (128, 128), "Registered full-heart composition reference"),
    SpriteSpec("beaker-charge-shell", "meter-parts", "meters", 3, (128, 128), "Fixed hollow beaker shell, exactly the progress-frame height"),
    SpriteSpec("beaker-charge-liquid", "meter-parts", "meters", 4, (128, 128), "Cyan liquid layer revealed bottom-up by charge"),
    SpriteSpec("beaker-charge-full-reference", "references", "meters", 5, (128, 128), "Registered full-beaker composition reference"),
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


def split_grid(source: Image.Image, columns: int, rows: int) -> list[Image.Image]:
    cells = []
    for row in range(rows):
        top = round(row * source.height / rows)
        bottom = round((row + 1) * source.height / rows)
        for column in range(columns):
            left = round(column * source.width / columns)
            right = round((column + 1) * source.width / columns)
            cells.append(source.crop((left, top, right, bottom)))
    return cells


def split_cells(source: Image.Image) -> list[Image.Image]:
    return split_grid(source, 3, 3)


def primary_component_crop(cell: Image.Image, padding: int = 8) -> Image.Image:
    """Crop around the main connected object to discard neighboring-cell slivers."""
    alpha = cell.getchannel("A")
    width, height = alpha.size
    pixels = alpha.load()
    remaining = {(x, y) for y in range(height) for x in range(width) if pixels[x, y] >= 16}
    components: list[list[tuple[int, int]]] = []
    while remaining:
        seed = remaining.pop()
        pending = [seed]
        component = [seed]
        while pending:
            x, y = pending.pop()
            for neighbor_x in range(max(0, x - 1), min(width, x + 2)):
                for neighbor_y in range(max(0, y - 1), min(height, y + 2)):
                    neighbor = (neighbor_x, neighbor_y)
                    if neighbor in remaining:
                        remaining.remove(neighbor)
                        pending.append(neighbor)
                        component.append(neighbor)
        components.append(component)
    if not components:
        raise ValueError("Sprite cell is fully transparent")
    primary = max(components, key=len)
    xs = [point[0] for point in primary]
    ys = [point[1] for point in primary]
    left = max(0, min(xs) - padding)
    top = max(0, min(ys) - padding)
    right = min(width, max(xs) + padding + 1)
    bottom = min(height, max(ys) + padding + 1)
    return cell.crop((left, top, right, bottom))


def normalize(cell: Image.Image, canvas: tuple[int, int]) -> Image.Image:
    bbox = cell.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("Sprite cell is fully transparent")
    cropped = cell.crop(bbox)
    usable_width = round(canvas[0] * 0.94)
    usable_height = round(canvas[1] * 0.90)
    scale = min(usable_width / cropped.width, usable_height / cropped.height)
    resized = cropped.resize(
        (max(1, round(cropped.width * scale)), max(1, round(cropped.height * scale))),
        Image.Resampling.LANCZOS,
    )
    result = Image.new("RGBA", canvas, (0, 0, 0, 0))
    result.alpha_composite(resized, ((canvas[0] - resized.width) // 2, (canvas[1] - resized.height) // 2))
    return result


def normalize_fill(cell: Image.Image, canvas: tuple[int, int]) -> Image.Image:
    """Make meter textures span their canvas so masking produces true 0-100% width."""
    bbox = cell.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("Fill cell is fully transparent")
    cropped = cell.crop(bbox)
    resized = cropped.resize((canvas[0] - 4, canvas[1] - 4), Image.Resampling.LANCZOS)
    result = Image.new("RGBA", canvas, (0, 0, 0, 0))
    result.alpha_composite(resized, (2, 2))
    return result


def normalize_frame(cell: Image.Image, canvas: tuple[int, int]) -> Image.Image:
    """Register blank horizontal HUD frames edge-to-edge for predictable overlays."""
    bbox = cell.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("Frame cell is fully transparent")
    cropped = cell.crop(bbox)
    resized = cropped.resize((canvas[0] - 4, canvas[1] - 4), Image.Resampling.LANCZOS)
    result = Image.new("RGBA", canvas, (0, 0, 0, 0))
    result.alpha_composite(resized, (2, 2))
    return result


def normalize_registered(cells: list[Image.Image], reference_index: int, canvas: tuple[int, int]) -> list[Image.Image]:
    """Use one crop and scale for shell, fill, and composite so layers align exactly."""
    bbox = cells[reference_index].getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("Reference meter cell is fully transparent")
    padding = 8
    left = max(0, bbox[0] - padding)
    top = max(0, bbox[1] - padding)
    right = min(cells[reference_index].width, bbox[2] + padding)
    bottom = min(cells[reference_index].height, bbox[3] + padding)
    crop_width = right - left
    crop_height = bottom - top
    usable = (round(canvas[0] * 0.94), round(canvas[1] * 0.94))
    scale = min(usable[0] / crop_width, usable[1] / crop_height)
    size = (max(1, round(crop_width * scale)), max(1, round(crop_height * scale)))
    results = []
    for cell in cells:
        resized = cell.crop((left, top, right, bottom)).resize(size, Image.Resampling.LANCZOS)
        result = Image.new("RGBA", canvas, (0, 0, 0, 0))
        result.alpha_composite(resized, ((canvas[0] - size[0]) // 2, (canvas[1] - size[1]) // 2))
        results.append(result)
    return results


def checker(size: tuple[int, int], square: int = 16) -> Image.Image:
    image = Image.new("RGB", size, "#0b1730")
    draw = ImageDraw.Draw(image)
    for y in range(0, size[1], square):
        for x in range(0, size[0], square):
            if (x // square + y // square) % 2:
                draw.rectangle((x, y, x + square - 1, y + square - 1), fill="#122442")
    return image


def fit(image: Image.Image, box: tuple[int, int]) -> Image.Image:
    copy = image.copy()
    copy.thumbnail(box, Image.Resampling.LANCZOS)
    return copy


def draw_live_text(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, size: int) -> None:
    draw.text(xy, text, font=font(size, True), fill="#f4fbff", stroke_width=2, stroke_fill="#071126")


def composite_top_bar(sprites: dict[str, Image.Image]) -> Image.Image:
    width, height = 1500, 250
    base = Image.new("RGB", (width, height), "#060a18")
    draw = ImageDraw.Draw(base)
    for x, y, color in ((45, 196, "#27d7ff"), (610, 35, "#7d59ff"), (1070, 205, "#ffffff"), (1290, 55, "#20e3b2")):
        draw.rectangle((x, y, x + 3, y + 3), fill=color)
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))

    life = sprites["life-counter-frame"].resize((315, 105), Image.Resampling.LANCZOS)
    overlay.alpha_composite(life, (24, 30))
    heart_x, heart_y, heart_size = 41, 38, 89
    heart_fill = sprites["heart-health-fill"].resize((heart_size, heart_size), Image.Resampling.LANCZOS)
    health_percent = 0.72
    heart_crop_y = round(heart_size * (1 - health_percent))
    overlay.alpha_composite(heart_fill.crop((0, heart_crop_y, heart_size, heart_size)), (heart_x, heart_y + heart_crop_y))
    heart_shell = sprites["heart-health-shell"].resize((heart_size, heart_size), Image.Resampling.LANCZOS)
    overlay.alpha_composite(heart_shell, (heart_x, heart_y))

    meter_x, meter_y = 440, 29
    meter = sprites["flask-progress-frame"].resize((500, 125), Image.Resampling.LANCZOS)
    fill_image = sprites["flask-fill-cyan"].resize((405, 46), Image.Resampling.LANCZOS)
    fill_width = round(fill_image.width * 0.68)
    overlay.alpha_composite(fill_image.crop((0, 0, fill_width, fill_image.height)), (meter_x + 50, meter_y + 40))
    overlay.alpha_composite(meter, (meter_x, meter_y))
    beaker_x, beaker_y, beaker_size = 320, meter_y, 125
    beaker_liquid = sprites["beaker-charge-liquid"].resize((beaker_size, beaker_size), Image.Resampling.LANCZOS)
    beaker_crop_y = round(beaker_size * (1 - 0.68))
    overlay.alpha_composite(beaker_liquid.crop((0, beaker_crop_y, beaker_size, beaker_size)), (beaker_x, beaker_y + beaker_crop_y))
    beaker_shell = sprites["beaker-charge-shell"].resize((beaker_size, beaker_size), Image.Resampling.LANCZOS)
    overlay.alpha_composite(beaker_shell, (beaker_x, beaker_y))

    score = sprites["score-counter-frame"].resize((360, 120), Image.Resampling.LANCZOS)
    overlay.alpha_composite(score, (960, 31))
    score_icon = sprites["research-score-icon"].resize((58, 58), Image.Resampling.LANCZOS)
    overlay.alpha_composite(score_icon, (980, 61))

    pause = sprites["pause-button-normal"].resize((112, 112), Image.Resampling.LANCZOS)
    overlay.alpha_composite(pause, (1372, 34))
    base = Image.alpha_composite(base.convert("RGBA"), overlay).convert("RGB")
    draw = ImageDraw.Draw(base)
    draw_live_text(draw, (177, 58), "3", 48)
    draw_live_text(draw, (1080, 65), "000936", 40)
    draw.text((540, 164), "FLASKS  68%", font=font(23, True), fill="#78dcff")
    return base


def make_fill_demo(sprites: dict[str, Image.Image], path: Path) -> None:
    frame = sprites["flask-progress-frame"].resize((500, 125), Image.Resampling.LANCZOS)
    fill_image = sprites["flask-fill-cyan"].resize((405, 46), Image.Resampling.LANCZOS)
    frames = []
    percentages = list(range(0, 101, 10)) + list(range(90, -1, -10))
    for percent in percentages:
        canvas = Image.new("RGBA", (560, 190), "#071126")
        draw = ImageDraw.Draw(canvas)
        width = round(fill_image.width * percent / 100)
        if width:
            canvas.alpha_composite(fill_image.crop((0, 0, width, fill_image.height)), (78, 73))
        canvas.alpha_composite(frame, (30, 33))
        draw.text((236, 151), f"{percent}%", font=font(21, True), fill="#dff8ff")
        frames.append(canvas.convert("P", palette=Image.Palette.ADAPTIVE, colors=255))
    frames[0].save(path, save_all=True, append_images=frames[1:], duration=90, loop=0, disposal=2, optimize=False)


def make_heart_damage_demo(sprites: dict[str, Image.Image], path: Path) -> None:
    counter = sprites["life-counter-frame"]
    shell = sprites["heart-health-shell"].resize((108, 108), Image.Resampling.LANCZOS)
    fill = sprites["heart-health-fill"].resize((108, 108), Image.Resampling.LANCZOS)
    percentages = (100, 100, 75, 75, 50, 50, 25, 25, 0, 0, 25, 50, 75)
    frames = []
    for percent in percentages:
        canvas = Image.new("RGBA", (440, 190), "#071126")
        canvas.alpha_composite(counter, (28, 27))
        crop_y = round(fill.height * (1 - percent / 100))
        if crop_y < fill.height:
            canvas.alpha_composite(fill.crop((0, crop_y, fill.width, fill.height)), (35, 36 + crop_y))
        canvas.alpha_composite(shell, (35, 36))
        frames.append(canvas.convert("P", palette=Image.Palette.ADAPTIVE, colors=255))
    frames[0].save(path, save_all=True, append_images=frames[1:], duration=260, loop=0, disposal=2, optimize=False)


def make_beaker_charge_demo(sprites: dict[str, Image.Image], path: Path) -> None:
    frame = sprites["flask-progress-frame"]
    horizontal_fill = sprites["flask-fill-cyan"]
    shell = sprites["beaker-charge-shell"]
    liquid = sprites["beaker-charge-liquid"]
    percentages = list(range(0, 101, 10)) + list(range(90, -1, -10))
    frames = []
    for percent in percentages:
        canvas = Image.new("RGBA", (700, 190), "#071126")
        beaker_x, beaker_y = 20, 25
        crop_y = round(liquid.height * (1 - percent / 100))
        if crop_y < liquid.height:
            canvas.alpha_composite(liquid.crop((0, crop_y, liquid.width, liquid.height)), (beaker_x, beaker_y + crop_y))
        canvas.alpha_composite(shell, (beaker_x, beaker_y))
        frame_x, frame_y = 160, 25
        fill_width = round(horizontal_fill.width * percent / 100)
        if fill_width:
            canvas.alpha_composite(horizontal_fill.crop((0, 0, fill_width, horizontal_fill.height)), (frame_x + 50, frame_y + 40))
        canvas.alpha_composite(frame, (frame_x, frame_y))
        frames.append(canvas.convert("P", palette=Image.Palette.ADAPTIVE, colors=255))
    frames[0].save(path, save_all=True, append_images=frames[1:], duration=100, loop=0, disposal=2, optimize=False)


def build_overview(sprites: dict[str, Image.Image], composed: Image.Image) -> Image.Image:
    canvas = Image.new("RGB", (1600, 1040), "#050a18")
    draw = ImageDraw.Draw(canvas)
    draw.text((50, 30), "SCICON COMPACT TOP HUD V1", font=font(42, True), fill="#e8f7ff")
    draw.text((50, 82), "Blank live-data frames + independent meter fills + pause states — no sound control", font=font(23), fill="#69d9ff")
    canvas.paste(composed, (50, 130))

    cards = (
        ("LIVE-DATA FRAMES", ("life-counter-frame", "flask-progress-frame", "score-counter-frame", "wave-counter-frame")),
        ("BUTTON STATES", ("pause-button-normal", "pause-button-selected", "pause-button-pressed")),
        ("ICONS + FILLS", ("heart-full-icon", "flask-icon", "wave-chevron-icon", "flask-fill-cyan", "warning-fill-amber", "critical-fill-red")),
    )
    top = 430
    for column, (title, names) in enumerate(cards):
        x = 50 + column * 515
        draw.rounded_rectangle((x, top, x + 480, 560 + top), radius=20, fill="#0b1730", outline="#259fd2", width=3)
        draw.text((x + 22, top + 18), title, font=font(25, True), fill="#f5c75a")
        card = checker((436, 470), 18)
        card_rgba = card.convert("RGBA")
        cursor_y = 18
        for name in names:
            sprite = fit(sprites[name], (400, 92 if "pause" not in name else 115))
            card_rgba.alpha_composite(sprite, ((436 - sprite.width) // 2, cursor_y))
            cursor_y += 105 if "pause" not in name else 130
        canvas.paste(card_rgba.convert("RGB"), (x + 22, top + 70))
    return canvas


def build() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    source_images = {
        "frames": split_cells(Image.open(SOURCE / "compact-top-hud-frames-source-alpha.png").convert("RGBA")),
        "icons": split_cells(Image.open(SOURCE / "compact-top-hud-icons-fills-clean-alpha.png").convert("RGBA")),
        "meters": split_grid(Image.open(SOURCE / "health-charge-components-source-alpha.png").convert("RGBA"), 3, 2),
    }

    registered_meters = {}
    for index, image in enumerate(normalize_registered(source_images["meters"][0:3], 2, (128, 128))):
        registered_meters[index] = image
    for offset, image in enumerate(normalize_registered(source_images["meters"][3:6], 2, (128, 128)), start=3):
        registered_meters[offset] = image

    sprites: dict[str, Image.Image] = {}
    manifest_assets = []
    for spec in SPRITES:
        cell = source_images[spec.source][spec.cell]
        if spec.source == "frames" and spec.cell in {0, 1, 2, 6, 7, 8}:
            cell = primary_component_crop(cell)
        if spec.source == "meters":
            sprite = registered_meters[spec.cell]
        elif spec.group == "fills":
            sprite = normalize_fill(cell, spec.canvas)
        elif spec.group == "frames":
            sprite = normalize_frame(cell, spec.canvas)
        else:
            sprite = normalize(cell, spec.canvas)
        directory = OUT / spec.group
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / f"{spec.slug}.png"
        sprite.save(path, optimize=True)
        sprites[spec.slug] = sprite
        manifest_assets.append(
            {
                "id": spec.slug,
                "group": spec.group,
                "role": spec.role,
                "path": public_path(path),
                "size": list(spec.canvas),
                "anchor": [0.5, 0.5],
            }
        )

    preview_dir = OUT / "previews"
    preview_dir.mkdir(exist_ok=True)
    composed = composite_top_bar(sprites)
    composed_path = preview_dir / "compact-top-hud-composed-preview.png"
    composed.save(composed_path, optimize=True)

    fill_demo_path = preview_dir / "compact-top-hud-fill-demo.gif"
    make_fill_demo(sprites, fill_demo_path)

    heart_damage_path = preview_dir / "heart-health-damage-preview.gif"
    make_heart_damage_demo(sprites, heart_damage_path)

    beaker_charge_path = preview_dir / "beaker-charge-fill-preview.gif"
    make_beaker_charge_demo(sprites, beaker_charge_path)

    overview = build_overview(sprites, composed)
    overview_path = OUT / "scicon-compact-top-hud-v1-overview.png"
    overview.save(overview_path, optimize=True)

    manifest = {
        "id": "scicon-compact-top-hud-v1",
        "version": 1,
        "generated": date.today().isoformat(),
        "overview": public_path(overview_path),
        "composedPreview": public_path(composed_path),
        "fillPreviewGif": public_path(fill_demo_path),
        "heartDamagePreviewGif": public_path(heart_damage_path),
        "beakerChargePreviewGif": public_path(beaker_charge_path),
        "soundControlIncluded": False,
        "assets": manifest_assets,
        "runtimeProtocol": {
            "text": "Render all numbers, labels, percentages, and boss names as live text above the blank PNG frames.",
            "progressFill": "Place a fill sprite behind the hollow frame and reveal it left-to-right with a rectangular mask or source crop. Do not scale the outer frame to represent progress.",
            "flaskFillRectAtNativeFrame": [50, 40, 405, 46],
            "heartHealth": "Draw heart-health-fill first, reveal only its bottom remaining-health percentage, then draw heart-health-shell above it. Keep the adjacent number panel blank in the PNG and render its value as live text.",
            "beakerCharge": "Draw beaker-charge-liquid first, reveal it bottom-to-top by charge percentage, then draw beaker-charge-shell above it. Both beaker layers are 128 px high, exactly matching flask-progress-frame height.",
            "pauseStates": {
                "default": "pause-button-normal",
                "hoverFocusSelected": "pause-button-selected",
                "pointerDown": "pause-button-pressed",
            },
            "sound": "No top-bar sound button is included or expected.",
        },
        "productionNotes": [
            "Use PNG files in React/Pixi; the GIF is a gallery behavior preview only.",
            "Keep the HUD fixed to the viewport rather than the scrolling game world.",
            "Use nearest-neighbor or integer scaling when presenting at pixel-art game scale.",
            "The cyan fill is the default flask charge. Amber and red are optional warning/critical states.",
            "The heart and beaker use registered shell/fill pairs. Never scale the fill independently from its shell; change only the mask height.",
        ],
    }
    (OUT / "pack-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    readme = """# Scicon Compact Top HUD v1

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
"""
    (OUT / "README.md").write_text(readme, encoding="utf-8")


if __name__ == "__main__":
    build()
