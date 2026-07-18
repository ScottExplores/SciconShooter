#!/usr/bin/env python3
"""Build the Scicon victory signet preview and its runtime animation manifest.

The GIF is a gallery/approval preview. The layered PNG files and manifest are the
production assets intended for PixiJS, where every wing can rotate around its
own hinge without baking gameplay or menu animation into a GIF.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


CANVAS = (1000, 480)
PLAQUE_SIZE = (520, 195)
WING_SIZE = (230, 158)
HINGE_IN_WING = (32, 79)
WING_LAYER_SIZE = 430
FINAL_PLAQUE_CENTER = (500, 222)


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def ease_out_cubic(value: float) -> float:
    value = clamp(value)
    return 1.0 - (1.0 - value) ** 3


def ease_out_back(value: float, overshoot: float = 1.45) -> float:
    value = clamp(value) - 1.0
    return 1.0 + value * value * ((overshoot + 1.0) * value + overshoot)


def load_rgba(path: Path) -> Image.Image:
    with Image.open(path) as source:
        return source.convert("RGBA")


def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = (
        Path(r"C:\Windows\Fonts\arialbd.ttf"),
        Path(r"C:\Windows\Fonts\segoeuib.ttf"),
    )
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


def glow_from_alpha(
    source: Image.Image,
    color: tuple[int, int, int, int],
    radius: float,
) -> Image.Image:
    alpha = source.getchannel("A").filter(ImageFilter.GaussianBlur(radius))
    glow = Image.new("RGBA", source.size, color)
    glow.putalpha(alpha.point(lambda value: int(value * color[3] / 255)))
    return glow


def paste_rotated_at_hinge(
    destination: Image.Image,
    part: Image.Image,
    hinge: tuple[float, float],
    angle: float,
    world_hinge: tuple[float, float],
) -> None:
    layer = Image.new("RGBA", (WING_LAYER_SIZE, WING_LAYER_SIZE), (0, 0, 0, 0))
    center = WING_LAYER_SIZE // 2
    layer.alpha_composite(part, (round(center - hinge[0]), round(center - hinge[1])))
    rotated = layer.rotate(
        angle,
        resample=Image.Resampling.BICUBIC,
        center=(center, center),
        expand=False,
    )
    destination.alpha_composite(
        rotated,
        (round(world_hinge[0] - center), round(world_hinge[1] - center)),
    )


def draw_victory_text(plaque: Image.Image, alpha: int) -> None:
    if alpha <= 0:
        return
    overlay = Image.new("RGBA", plaque.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    font = load_font(62)
    text = "VICTORY"
    bbox = draw.textbbox((0, 0), text, font=font, stroke_width=3)
    x = (plaque.width - (bbox[2] - bbox[0])) // 2
    y = (plaque.height - (bbox[3] - bbox[1])) // 2 - 8
    draw.text(
        (x, y),
        text,
        font=font,
        fill=(255, 219, 78, alpha),
        stroke_width=5,
        stroke_fill=(38, 8, 69, alpha),
    )
    # A one-pixel-ish warm highlight keeps the rasterized title game-readable.
    draw.line((x + 7, y + 7, x + (bbox[2] - bbox[0]) - 7, y + 7), fill=(255, 247, 181, alpha // 2), width=1)
    plaque.alpha_composite(overlay)


def make_local_signet(
    assets: dict[str, Image.Image],
    open_amount: float,
    wing_amount: float,
    hover_phase: float,
    text_amount: float,
    sparkle_amount: float,
) -> Image.Image:
    signet = Image.new("RGBA", CANVAS, (0, 0, 0, 0))

    plaque_left = FINAL_PLAQUE_CENTER[0] - PLAQUE_SIZE[0] // 2
    plaque_top = FINAL_PLAQUE_CENTER[1] - PLAQUE_SIZE[1] // 2
    left_root_x = plaque_left + 20
    right_root_x = plaque_left + PLAQUE_SIZE[0] - 20
    upper_root_y = plaque_top + 69
    lower_root_y = plaque_top + 126

    flutter_a = math.sin(hover_phase) * 2.6
    flutter_b = math.sin(hover_phase + 1.25) * 3.4
    right_upper_angle = -75.0 + wing_amount * (69.0 + flutter_a)
    right_lower_angle = 63.0 + wing_amount * (-55.0 + flutter_b)
    left_upper_angle = 75.0 + wing_amount * (-69.0 - flutter_a)
    left_lower_angle = -63.0 + wing_amount * (55.0 - flutter_b)

    # Lower membranes sit behind the upper wings and plaque.
    paste_rotated_at_hinge(
        signet,
        assets["lower_left"],
        (WING_SIZE[0] - HINGE_IN_WING[0], HINGE_IN_WING[1]),
        left_lower_angle,
        (left_root_x, lower_root_y),
    )
    paste_rotated_at_hinge(
        signet,
        assets["lower_right"],
        HINGE_IN_WING,
        right_lower_angle,
        (right_root_x, lower_root_y),
    )
    paste_rotated_at_hinge(
        signet,
        assets["upper_left"],
        (WING_SIZE[0] - HINGE_IN_WING[0], HINGE_IN_WING[1]),
        left_upper_angle,
        (left_root_x, upper_root_y),
    )
    paste_rotated_at_hinge(
        signet,
        assets["upper_right"],
        HINGE_IN_WING,
        right_upper_angle,
        (right_root_x, upper_root_y),
    )

    plaque_width = max(22, round(PLAQUE_SIZE[0] * (0.10 + 0.90 * open_amount)))
    plaque = assets["plaque"].resize((plaque_width, PLAQUE_SIZE[1]), Image.Resampling.LANCZOS)
    draw_victory_text(plaque, round(255 * clamp(text_amount)))
    plaque_x = FINAL_PLAQUE_CENTER[0] - plaque_width // 2
    signet.alpha_composite(plaque, (plaque_x, plaque_top))

    if sparkle_amount > 0:
        draw = ImageDraw.Draw(signet)
        sparkles = ((121, 86), (875, 115), (89, 295), (905, 308), (500, 23), (500, 404))
        for index, (x, y) in enumerate(sparkles):
            pulse = clamp(sparkle_amount * 1.7 - index * 0.09)
            radius = max(1, round(2 + pulse * 6))
            color = (93, 238, 255, round(235 * pulse)) if index % 2 == 0 else (192, 81, 255, round(230 * pulse))
            draw.line((x - radius, y, x + radius, y), fill=color, width=2)
            draw.line((x, y - radius, x, y + radius), fill=color, width=2)

    glow = glow_from_alpha(signet, (44, 190, 255, 62), 7)
    combined = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    combined.alpha_composite(glow)
    combined.alpha_composite(signet)
    return combined


def transform_group(source: Image.Image, scale: float, offset_y: float) -> Image.Image:
    width = max(1, round(source.width * scale))
    height = max(1, round(source.height * scale))
    scaled = source.resize((width, height), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    x = (CANVAS[0] - width) // 2
    y = (CANVAS[1] - height) // 2 + round(offset_y)
    canvas.alpha_composite(scaled, (x, y))
    return canvas


def build_frames(assets: dict[str, Image.Image]) -> list[Image.Image]:
    frames: list[Image.Image] = []
    total_frames = 56
    entrance_frames = 19
    settle_frames = 9

    for index in range(total_frames):
        if index < entrance_frames:
            t = index / max(1, entrance_frames - 1)
            drop = ease_out_back(t)
            open_amount = ease_out_cubic(clamp((t - 0.13) / 0.74))
            wing_amount = ease_out_back(clamp((t - 0.18) / 0.76), overshoot=1.10)
            scale = 0.27 + 0.73 * drop
            # Begin as a small, closed badge near the top of the menu instead of
            # completely off-canvas; this mirrors the readable anticipation pose.
            offset_y = -150.0 * (1.0 - ease_out_cubic(t))
            text_amount = clamp((open_amount - 0.48) / 0.35)
            sparkle_amount = clamp((t - 0.62) / 0.28)
            phase = 0.0
        elif index < entrance_frames + settle_frames:
            t = (index - entrance_frames) / max(1, settle_frames - 1)
            open_amount = 1.0
            wing_amount = 1.0
            phase = t * math.pi
            scale = 1.0 + math.sin(t * math.pi) * 0.025
            offset_y = math.sin(t * math.pi * 2.0) * 3.0
            text_amount = 1.0
            sparkle_amount = 1.0 - t * 0.65
        else:
            t = (index - entrance_frames - settle_frames) / max(1, total_frames - entrance_frames - settle_frames - 1)
            phase = t * math.tau
            open_amount = 1.0
            wing_amount = 1.0
            scale = 1.0 + math.sin(phase) * 0.007
            offset_y = math.sin(phase) * 4.0
            text_amount = 1.0
            sparkle_amount = 0.18 + 0.12 * math.sin(phase * 2.0)

        local = make_local_signet(
            assets,
            open_amount=open_amount,
            wing_amount=wing_amount,
            hover_phase=phase,
            text_amount=text_amount,
            sparkle_amount=sparkle_amount,
        )
        frames.append(transform_group(local, scale=scale, offset_y=offset_y))
    return frames


def gif_frame(source: Image.Image) -> Image.Image:
    # Reserve palette index 255 for pixels that should remain transparent.
    alpha = source.getchannel("A")
    quantized = source.convert("RGB").quantize(colors=255, method=Image.Quantize.MEDIANCUT)
    mask = alpha.point(lambda value: 255 if value <= 12 else 0)
    quantized.paste(255, mask=mask)
    quantized.info["transparency"] = 255
    quantized.info["disposal"] = 2
    return quantized


def save_contact_sheet(frames: list[Image.Image], destination: Path) -> None:
    picks = (0, 6, 13, 20, 34)
    thumb_size = (400, 192)
    sheet = Image.new("RGBA", (thumb_size[0] * len(picks), thumb_size[1]), (5, 10, 28, 255))
    for column, frame_index in enumerate(picks):
        thumb = frames[frame_index].resize(thumb_size, Image.Resampling.LANCZOS)
        sheet.alpha_composite(thumb, (column * thumb_size[0], 0))
    sheet.save(destination, optimize=True)


def write_manifest(destination: Path) -> None:
    manifest = {
        "id": "scicon-victory-signet",
        "displayName": "Scicon Victory Signet",
        "productionFormat": "layered-png",
        "previewFormat": "animated-gif",
        "coordinateSpace": {"width": CANVAS[0], "height": CANVAS[1], "origin": "top-left"},
        "parts": {
            "plaque": {"path": "parts/scicon-victory-plaque.png", "displaySize": list(PLAQUE_SIZE), "anchor": [0.5, 0.5]},
            "upperLeft": {"path": "parts/scicon-victory-wing-upper-left.png", "displaySize": list(WING_SIZE), "pivot": [198, 79]},
            "upperRight": {"path": "parts/scicon-victory-wing-upper-right.png", "displaySize": list(WING_SIZE), "pivot": [32, 79]},
            "lowerLeft": {"path": "parts/scicon-victory-wing-lower-left.png", "displaySize": list(WING_SIZE), "pivot": [198, 79]},
            "lowerRight": {"path": "parts/scicon-victory-wing-lower-right.png", "displaySize": list(WING_SIZE), "pivot": [32, 79]},
        },
        "timeline": {
            "dropAndOpen": {"startMs": 0, "durationMs": 760, "motion": ["translateY", "scale", "plaque.scaleX", "wing.rotation"]},
            "settle": {"startMs": 760, "durationMs": 360, "motion": ["scaleOvershoot", "sparkleBurst"]},
            "hoverLoop": {"startMs": 1120, "durationMs": 1260, "loop": True, "motion": ["translateY.sine", "scale.sine", "independentWingRotation.sine"]},
        },
        "audio": {
            "format": "stereo 48 kHz 16-bit PCM WAV",
            "cues": [
                {"event": "mechanismOpen", "startMs": 0, "path": "audio/ui/victory-signet/victory-signet-open.wav", "gain": 0.72},
                {"event": "plaqueLock", "startMs": 620, "path": "audio/ui/victory-signet/victory-signet-lock.wav", "gain": 0.58},
                {"event": "energySettle", "startMs": 700, "path": "audio/ui/victory-signet/victory-signet-power-settle.wav", "gain": 0.46},
                {"event": "hoverLoop", "startMs": 1120, "path": "audio/ui/victory-signet/victory-signet-hover-loop.wav", "gain": 0.12, "loop": True, "fadeOutMs": 180},
            ],
            "galleryPreview": "audio/ui/victory-signet/victory-signet-preview-mix.wav",
            "implementation": "Trigger cues from animation events. Do not bake the mixdown into gameplay.",
            "styleGuide": "docs/scicon-animation-audio-style-guide.md",
        },
        "runtimeNotes": [
            "Render VICTORY as runtime text so localization and rewards screens can reuse the frame.",
            "Rotate each wing sprite around its circular cyan hinge; do not rotate around the image center.",
            "The GIF is an approval/gallery preview only. Use the layered PNGs in PixiJS for crisp, controllable animation.",
        ],
    }
    destination.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--asset-root",
        type=Path,
        default=Path("public/game-art/generated/ui/animations/victory-signet"),
        help="Victory signet asset directory, relative to the current working directory by default.",
    )
    args = parser.parse_args()
    root = args.asset_root.resolve()
    parts = root / "parts"
    previews = root / "previews"
    previews.mkdir(parents=True, exist_ok=True)

    raw = {
        "plaque": load_rgba(parts / "scicon-victory-plaque.png"),
        "upper_left": load_rgba(parts / "scicon-victory-wing-upper-left.png"),
        "upper_right": load_rgba(parts / "scicon-victory-wing-upper-right.png"),
        "lower_left": load_rgba(parts / "scicon-victory-wing-lower-left.png"),
        "lower_right": load_rgba(parts / "scicon-victory-wing-lower-right.png"),
    }
    assets = {
        "plaque": raw["plaque"].resize(PLAQUE_SIZE, Image.Resampling.LANCZOS),
        "upper_left": raw["upper_left"].resize(WING_SIZE, Image.Resampling.LANCZOS),
        "upper_right": raw["upper_right"].resize(WING_SIZE, Image.Resampling.LANCZOS),
        "lower_left": raw["lower_left"].resize(WING_SIZE, Image.Resampling.LANCZOS),
        "lower_right": raw["lower_right"].resize(WING_SIZE, Image.Resampling.LANCZOS),
    }

    frames = build_frames(assets)
    gif_frames = [gif_frame(frame) for frame in frames]
    gif_path = previews / "scicon-victory-signet-animation.gif"
    gif_frames[0].save(
        gif_path,
        save_all=True,
        append_images=gif_frames[1:],
        duration=45,
        loop=0,
        transparency=255,
        disposal=2,
        optimize=False,
    )
    frames[-7].save(previews / "scicon-victory-signet-final.png", optimize=True)
    save_contact_sheet(frames, previews / "scicon-victory-signet-sequence.png")
    write_manifest(root / "animation-manifest.json")

    print(f"Built {len(frames)} frames")
    print(f"GIF: {gif_path}")
    print(f"Manifest: {root / 'animation-manifest.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
