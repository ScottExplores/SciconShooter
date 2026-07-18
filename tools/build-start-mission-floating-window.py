from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "tmp" / "imagegen" / "start-mission-floating-window" / "alpha" / "start-mission-floating-window-source-alpha.png"
OUT = ROOT / "public" / "game-art" / "generated" / "ui" / "scicon-ui-system-v2" / "animations" / "start-mission-floating-window"
CANVAS = (768, 1024)


def font(size: int) -> ImageFont.ImageFont:
    candidates = (
        Path("C:/Windows/Fonts/arialbd.ttf"),
        Path("C:/Windows/Fonts/segoeuib.ttf"),
        Path("C:/Windows/Fonts/consolab.ttf"),
    )
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


def normalized_shell() -> Image.Image:
    source = Image.open(SOURCE).convert("RGBA")
    bbox = source.getchannel("A").getbbox()
    if not bbox:
        raise ValueError("Start Mission source is fully transparent")
    cropped = source.crop(bbox)
    max_width, max_height = 690, 930
    scale = min(max_width / cropped.width, max_height / cropped.height)
    resized = cropped.resize(
        (round(cropped.width * scale), round(cropped.height * scale)),
        Image.Resampling.LANCZOS,
    )
    shell = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    shell.alpha_composite(resized, ((CANVAS[0] - resized.width) // 2, 47))
    return shell


def button_content() -> Image.Image:
    overlay = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    label = "START MISSION"
    label_font = font(42)
    text_bbox = draw.textbbox((0, 0), label, font=label_font, stroke_width=1)
    text_width = text_bbox[2] - text_bbox[0]
    text_height = text_bbox[3] - text_bbox[1]
    icon_radius = 24
    gap = 18
    total_width = icon_radius * 2 + gap + text_width
    left = (CANVAS[0] - total_width) // 2
    center_y = 850

    icon_center = (left + icon_radius, center_y)
    draw.ellipse(
        (
            icon_center[0] - icon_radius,
            icon_center[1] - icon_radius,
            icon_center[0] + icon_radius,
            icon_center[1] + icon_radius,
        ),
        fill=(245, 253, 255, 242),
        outline=(91, 238, 255, 255),
        width=3,
    )
    triangle_x = icon_center[0] - 6
    draw.polygon(
        (
            (triangle_x, center_y - 11),
            (triangle_x, center_y + 11),
            (triangle_x + 18, center_y),
        ),
        fill=(3, 62, 89, 255),
    )

    text_x = left + icon_radius * 2 + gap
    text_y = center_y - text_height // 2 - text_bbox[1]
    draw.text((text_x + 3, text_y + 4), label, font=label_font, fill=(4, 31, 55, 230), stroke_width=2, stroke_fill=(4, 31, 55, 230))
    draw.text((text_x, text_y), label, font=label_font, fill=(255, 255, 255, 255), stroke_width=2, stroke_fill=(9, 61, 91, 255))
    return overlay


def energy_glow(shell: Image.Image) -> Image.Image:
    alpha = shell.getchannel("A")
    blurred = alpha.filter(ImageFilter.GaussianBlur(18))
    glow = Image.new("RGBA", CANVAS, (25, 221, 255, 0))
    glow.putalpha(blurred.point(lambda value: round(value * 0.30)))
    return glow


def preview_background() -> Image.Image:
    background = Image.new("RGBA", CANVAS, "#050b1d")
    draw = ImageDraw.Draw(background)
    stars = (
        (44, 75, "#30d8ff"), (112, 185, "#ffffff"), (690, 91, "#f5bd3c"),
        (720, 266, "#7d5cff"), (70, 360, "#36e6bd"), (658, 470, "#ffffff"),
        (101, 611, "#e16aff"), (701, 724, "#30d8ff"), (43, 887, "#ffffff"),
        (636, 953, "#f5bd3c"), (344, 42, "#7d5cff"), (419, 984, "#36e6bd"),
    )
    for x, y, color in stars:
        draw.rectangle((x, y, x + 2, y + 2), fill=color)
    return background


def shifted(layer: Image.Image, y_offset: int) -> Image.Image:
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    result.alpha_composite(layer, (0, y_offset))
    return result


def build() -> None:
    parts = OUT / "parts"
    previews = OUT / "previews"
    parts.mkdir(parents=True, exist_ok=True)
    previews.mkdir(parents=True, exist_ok=True)

    shell = normalized_shell()
    content = button_content()
    glow = energy_glow(shell)
    shell.save(parts / "start-mission-window-shell.png", optimize=True)
    content.save(parts / "start-mission-button-content.png", optimize=True)
    glow.save(parts / "start-mission-energy-glow.png", optimize=True)

    final = shell.copy()
    final.alpha_composite(content)
    final.save(previews / "start-mission-floating-window-final.png", optimize=True)

    poster = preview_background()
    poster.alpha_composite(glow)
    poster.alpha_composite(final)
    poster.convert("RGB").save(previews / "start-mission-floating-window-poster.png", optimize=True)

    frame_count = 12
    preview_frames = []
    for index in range(frame_count):
        phase = index / frame_count * math.tau
        y_offset = round(math.sin(phase) * 6)
        glow_opacity = 0.80 + 0.20 * ((math.sin(phase + math.pi / 2) + 1) / 2)
        frame = preview_background()
        animated_glow = glow.copy()
        animated_glow.putalpha(animated_glow.getchannel("A").point(lambda value: round(value * glow_opacity)))
        frame.alpha_composite(shifted(animated_glow, y_offset))
        frame.alpha_composite(shifted(final, y_offset))
        preview_frames.append(frame.convert("P", palette=Image.Palette.ADAPTIVE, colors=255))

    preview_frames[0].save(
        previews / "start-mission-floating-window.gif",
        save_all=True,
        append_images=preview_frames[1:],
        duration=160,
        loop=0,
        disposal=2,
        optimize=False,
    )

    manifest = {
        "id": "start-mission-floating-window",
        "productionFormat": "layered-png-plus-live-ui",
        "partsRoot": "parts",
        "parts": {
            "shell": "parts/start-mission-window-shell.png",
            "buttonContentReference": "parts/start-mission-button-content.png",
            "energyGlow": "parts/start-mission-energy-glow.png",
        },
        "integration": {
            "screen": "home",
            "action": "existing onStart callback",
            "buttonText": "START MISSION",
            "buttonTextMode": "Render as live HTML/React text over the orange CTA cradle; the PNG overlay is a design reference.",
            "centralWindow": "Reserved for existing dynamic ship-selection/home content.",
            "clickTarget": "Use one accessible real button over the complete orange CTA cradle.",
        },
        "motion": {
            "durationMs": 1920,
            "loop": True,
            "translateY": {"wave": "sine", "amplitudePx": 6},
            "scaleInvariant": True,
            "energyGlowOpacity": [0.80, 1.0],
            "reducedMotion": "Disable translation and show the final static state.",
        },
        "preview": "previews/start-mission-floating-window.gif",
        "productionNote": "Use the layered transparent PNGs and live text. The GIF and labeled final PNG are gallery previews only.",
    }
    (OUT / "animation-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    build()
