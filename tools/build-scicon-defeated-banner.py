#!/usr/bin/env python3
"""Build the layered Scicon Defeated Banner and its approval previews.

The GIF and contact sheet are gallery/approval files. Runtime should compose the
registered PNG parts and follow animation-manifest.json so text, rotors, light
scans, and damaged wing motion remain independently controllable in PixiJS.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


CANVAS = (1100, 460)
BANNER_SIZE = (960, 225)
BANNER_CENTER = (550, 230)
LEFT_HINGE = (round(BANNER_SIZE[0] * 0.209), round(BANNER_SIZE[1] * 0.426))
RIGHT_HINGE = (round(BANNER_SIZE[0] * 0.791), round(BANNER_SIZE[1] * 0.426))
ROTOR_SIZE = 96


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def ease_out_cubic(value: float) -> float:
    value = clamp(value)
    return 1.0 - (1.0 - value) ** 3


def ease_out_back(value: float, overshoot: float = 1.35) -> float:
    value = clamp(value) - 1.0
    return 1.0 + value * value * ((overshoot + 1.0) * value + overshoot)


def font(size: int) -> ImageFont.ImageFont:
    for candidate in (Path("C:/Windows/Fonts/arialbd.ttf"), Path("C:/Windows/Fonts/segoeuib.ttf")):
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


def load_master(path: Path) -> Image.Image:
    with Image.open(path) as image:
        source = image.convert("RGBA")
    bbox = source.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("Defeated banner source is fully transparent")
    return source.crop(bbox).resize(BANNER_SIZE, Image.Resampling.LANCZOS)


def mask_horizontal(source: Image.Image, left: int, right: int) -> Image.Image:
    result = Image.new("RGBA", source.size, (0, 0, 0, 0))
    crop = source.crop((left, 0, right, source.height))
    result.alpha_composite(crop, (left, 0))
    return result


def split_parts(master: Image.Image) -> dict[str, Image.Image]:
    left_cut = LEFT_HINGE[0] - 14
    right_cut = RIGHT_HINGE[0] + 14
    return {
        "plaque": mask_horizontal(master, left_cut - 26, right_cut + 26),
        "left_wing": mask_horizontal(master, 0, left_cut),
        "right_wing": mask_horizontal(master, right_cut, master.width),
    }


def rotate_registered(source: Image.Image, angle: float, pivot: tuple[int, int]) -> Image.Image:
    return source.rotate(
        angle,
        resample=Image.Resampling.BICUBIC,
        center=pivot,
        expand=False,
    )


def make_rotor() -> Image.Image:
    rotor = Image.new("RGBA", (ROTOR_SIZE, ROTOR_SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(rotor)
    center = ROTOR_SIZE // 2
    draw.ellipse((4, 4, 91, 91), fill=(10, 15, 28, 248), outline=(34, 65, 98, 255), width=6)
    draw.ellipse((12, 12, 83, 83), fill=(35, 8, 17, 246), outline=(162, 24, 34, 255), width=5)
    draw.ellipse((21, 21, 74, 74), fill=(12, 7, 14, 255), outline=(255, 50, 51, 255), width=4)
    draw.ellipse((35, 35, 60, 60), fill=(103, 7, 17, 255), outline=(255, 83, 57, 255), width=3)
    for angle in range(0, 360, 45):
        radians = math.radians(angle)
        inner = (center + math.cos(radians) * 19, center + math.sin(radians) * 19)
        outer = (center + math.cos(radians) * 31, center + math.sin(radians) * 31)
        draw.line((*inner, *outer), fill=(230, 38, 45, 235), width=4)
    return rotor


def make_scan_particle() -> Image.Image:
    particle = Image.new("RGBA", (70, 12), (0, 0, 0, 0))
    draw = ImageDraw.Draw(particle)
    draw.rounded_rectangle((2, 3, 67, 8), radius=3, fill=(22, 211, 255, 86))
    draw.rounded_rectangle((18, 2, 57, 9), radius=3, fill=(88, 244, 255, 210))
    draw.line((27, 5, 49, 5), fill=(225, 255, 255, 255), width=2)
    return particle


def draw_text(banner: Image.Image, alpha: int) -> None:
    if alpha <= 0:
        return
    overlay = Image.new("RGBA", banner.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    text = "DEFEATED"
    face = font(67)
    bbox = draw.textbbox((0, 0), text, font=face, stroke_width=4)
    x = (banner.width - (bbox[2] - bbox[0])) // 2
    y = (banner.height - (bbox[3] - bbox[1])) // 2 - 11
    draw.text(
        (x, y),
        text,
        font=face,
        fill=(82, 221, 230, alpha),
        stroke_width=5,
        stroke_fill=(54, 4, 14, alpha),
    )
    draw.line((x + 8, y + 8, x + (bbox[2] - bbox[0]) - 8, y + 8), fill=(183, 255, 255, alpha // 2), width=1)
    banner.alpha_composite(overlay)


def add_light_scans(banner: Image.Image, particle: Image.Image, phase: float, strength: float) -> None:
    if strength <= 0:
        return
    travel = (math.sin(phase - math.pi / 2) + 1.0) / 2.0
    x_top = round(265 + travel * 370)
    x_bottom = round(640 - travel * 360)
    pulse = 0.55 + 0.45 * math.sin(phase * 2.0) ** 2
    alpha = round(255 * clamp(strength) * pulse)
    scan = particle.copy()
    scan.putalpha(scan.getchannel("A").point(lambda value: round(value * alpha / 255)))
    banner.alpha_composite(scan, (x_top, 31))
    red_scan = scan.copy()
    red_layer = Image.new("RGBA", red_scan.size, (255, 46, 48, 0))
    red_layer.putalpha(red_scan.getchannel("A"))
    banner.alpha_composite(red_layer, (x_bottom, 187))


def add_wind_streaks(banner: Image.Image, phase: float, strength: float) -> None:
    if strength <= 0:
        return
    draw = ImageDraw.Draw(banner)
    for index, (base_x, base_y, direction) in enumerate(((19, 62, -1), (34, 158, -1), (941, 71, 1), (925, 167, 1))):
        local = (phase / math.tau + index * 0.19) % 1.0
        offset = round(local * 18) * direction
        fade = math.sin(local * math.pi) * strength
        length = 8 + index % 2 * 5
        color = (103, 191, 209, round(105 * fade))
        draw.line((base_x + offset, base_y, base_x + offset + length * direction, base_y), fill=color, width=2)


def make_local_banner(
    assets: dict[str, Image.Image],
    open_amount: float,
    wing_amount: float,
    phase: float,
    text_amount: float,
    live_amount: float,
) -> Image.Image:
    local = Image.new("RGBA", BANNER_SIZE, (0, 0, 0, 0))
    flutter_left = math.sin(phase) * 1.65 * live_amount
    flutter_right = math.sin(phase + 1.05) * 1.35 * live_amount
    left_angle = 67.0 * (1.0 - wing_amount) + flutter_left
    right_angle = -67.0 * (1.0 - wing_amount) + flutter_right
    local.alpha_composite(rotate_registered(assets["left_wing"], left_angle, LEFT_HINGE))
    local.alpha_composite(rotate_registered(assets["right_wing"], right_angle, RIGHT_HINGE))
    local.alpha_composite(assets["plaque"])

    rotor_angle = math.degrees(phase) * 0.44
    left_rotor = assets["rotor"].rotate(rotor_angle, Image.Resampling.BICUBIC)
    right_rotor = assets["rotor"].rotate(-rotor_angle * 0.82, Image.Resampling.BICUBIC)
    local.alpha_composite(left_rotor, (LEFT_HINGE[0] - ROTOR_SIZE // 2, LEFT_HINGE[1] - ROTOR_SIZE // 2))
    local.alpha_composite(right_rotor, (RIGHT_HINGE[0] - ROTOR_SIZE // 2, RIGHT_HINGE[1] - ROTOR_SIZE // 2))
    add_light_scans(local, assets["scan"], phase, live_amount)
    add_wind_streaks(local, phase, live_amount)
    draw_text(local, round(255 * clamp(text_amount)))

    width = max(20, round(local.width * (0.08 + 0.92 * open_amount)))
    return local.resize((width, local.height), Image.Resampling.LANCZOS)


def place_group(source: Image.Image, scale: float, offset_y: float) -> Image.Image:
    width = max(1, round(source.width * scale))
    height = max(1, round(source.height * scale))
    scaled = source.resize((width, height), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    x = BANNER_CENTER[0] - width // 2
    y = BANNER_CENTER[1] - height // 2 + round(offset_y)
    canvas.alpha_composite(scaled, (x, y))
    return canvas


def build_frames(assets: dict[str, Image.Image]) -> list[Image.Image]:
    frames: list[Image.Image] = []
    total_frames = 72
    entrance_frames = 20
    settle_frames = 8
    for index in range(total_frames):
        if index < entrance_frames:
            t = index / max(1, entrance_frames - 1)
            drop = ease_out_back(t, 1.18)
            open_amount = ease_out_cubic(clamp((t - 0.12) / 0.72))
            wing_amount = ease_out_back(clamp((t - 0.20) / 0.72), 0.82)
            scale = 0.34 + 0.66 * drop
            offset_y = -125.0 * (1.0 - ease_out_cubic(t))
            text_amount = clamp((open_amount - 0.48) / 0.30)
            live_amount = clamp((t - 0.73) / 0.20)
            phase = 0.0
        elif index < entrance_frames + settle_frames:
            t = (index - entrance_frames) / max(1, settle_frames - 1)
            open_amount = 1.0
            wing_amount = 1.0
            phase = t * math.pi * 0.8
            scale = 1.0 + math.sin(t * math.pi) * 0.018
            offset_y = math.sin(t * math.pi * 2.0) * 2.5
            text_amount = 1.0
            live_amount = 0.55 + t * 0.45
        else:
            t = (index - entrance_frames - settle_frames) / max(1, total_frames - entrance_frames - settle_frames - 1)
            phase = t * math.tau
            open_amount = 1.0
            wing_amount = 1.0
            scale = 1.0 + math.sin(phase) * 0.0035
            offset_y = math.sin(phase) * 2.2
            text_amount = 1.0
            live_amount = 1.0

        banner = make_local_banner(assets, open_amount, wing_amount, phase, text_amount, live_amount)
        frames.append(place_group(banner, scale, offset_y))
    return frames


def gif_frame(source: Image.Image) -> Image.Image:
    alpha = source.getchannel("A")
    quantized = source.convert("RGB").quantize(colors=255, method=Image.Quantize.MEDIANCUT)
    mask = alpha.point(lambda value: 255 if value <= 12 else 0)
    quantized.paste(255, mask=mask)
    quantized.info["transparency"] = 255
    quantized.info["disposal"] = 2
    return quantized


def save_sequence(frames: list[Image.Image], destination: Path) -> None:
    picks = (0, 5, 10, 15, 20, 30, 48)
    thumb_size = (390, 163)
    sheet = Image.new("RGBA", (thumb_size[0] * len(picks), thumb_size[1]), (5, 10, 28, 255))
    for column, frame_index in enumerate(picks):
        thumb = frames[frame_index].resize(thumb_size, Image.Resampling.LANCZOS)
        sheet.alpha_composite(thumb, (column * thumb_size[0], 0))
    sheet.save(destination, optimize=True)


def save_registered_parts(assets: dict[str, Image.Image], root: Path, master: Image.Image) -> None:
    source_dir = root / "source"
    parts_dir = root / "parts"
    source_dir.mkdir(parents=True, exist_ok=True)
    parts_dir.mkdir(parents=True, exist_ok=True)
    master.save(source_dir / "scicon-defeated-banner-open-master.png", optimize=True)
    assets["plaque"].save(parts_dir / "scicon-defeated-plaque.png", optimize=True)
    assets["left_wing"].save(parts_dir / "scicon-defeated-wing-left.png", optimize=True)
    assets["right_wing"].save(parts_dir / "scicon-defeated-wing-right.png", optimize=True)
    assets["rotor"].save(parts_dir / "scicon-defeated-warning-rotor.png", optimize=True)
    assets["scan"].save(parts_dir / "scicon-defeated-light-scan.png", optimize=True)


def write_manifest(path: Path) -> None:
    manifest = {
        "id": "scicon-defeated-banner-v1",
        "displayName": "Scicon Defeated Banner",
        "productionFormat": "layered-png",
        "previewFormat": "animated-gif",
        "coordinateSpace": {"width": CANVAS[0], "height": CANVAS[1], "origin": "top-left"},
        "bannerDisplaySize": list(BANNER_SIZE),
        "parts": {
            "plaque": {"path": "parts/scicon-defeated-plaque.png", "displaySize": list(BANNER_SIZE), "anchor": [0.5, 0.5]},
            "leftWing": {"path": "parts/scicon-defeated-wing-left.png", "displaySize": list(BANNER_SIZE), "pivot": list(LEFT_HINGE)},
            "rightWing": {"path": "parts/scicon-defeated-wing-right.png", "displaySize": list(BANNER_SIZE), "pivot": list(RIGHT_HINGE)},
            "warningRotor": {"path": "parts/scicon-defeated-warning-rotor.png", "displaySize": [ROTOR_SIZE, ROTOR_SIZE], "anchor": [0.5, 0.5]},
            "lightScan": {"path": "parts/scicon-defeated-light-scan.png", "displaySize": [70, 12], "anchor": [0.5, 0.5]},
        },
        "timeline": {
            "dropOpen": {"startMs": 0, "durationMs": 855, "motion": ["translateY", "group.scale", "banner.scaleX", "wing.rotation"]},
            "damagedSettle": {"startMs": 855, "durationMs": 360, "motion": ["scaleOvershoot", "wingDamping", "warningPowerUp"]},
            "decayedIdleLoop": {"startMs": 1215, "durationMs": 1980, "loop": True, "motion": ["translateY.sine", "independentWingRotation.sine", "warningRotor.rotation", "lightScan.translateX", "emergencyLight.flicker"]},
        },
        "text": {
            "value": "DEFEATED",
            "mode": "runtime-live-text",
            "anchor": [0.5, 0.5],
            "recommendedColor": "#52dde6",
            "recommendedStroke": "#36040e",
        },
        "audio": {
            "status": "not-authored",
            "recommendedEvents": ["damagedMechanismOpen", "weakLatch", "warningRotorStart", "lowPowerIdle"],
            "implementation": "Trigger future audio from timeline events. Never bake audio into the GIF preview.",
        },
        "runtimeNotes": [
            "Render DEFEATED as runtime text so localization and defeat-state copy can change without replacing artwork.",
            "All plaque and wing PNGs share the same 960 x 225 registered canvas. Preserve their registration and rotate only around the supplied hinge pivots.",
            "Rotate the warning rotor sprites in opposite directions at low speed; keep the motion subtle rather than arcade-fast.",
            "Move light-scan particles along the damaged upper and lower energy rails and modulate alpha with a restrained flicker.",
            "The GIF and sequence PNG are gallery/approval previews only. Use the layered PNG parts and timeline in PixiJS.",
        ],
    }
    path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        type=Path,
        default=Path("tmp/imagegen/defeated-banner-v1/scicon-defeated-banner-alpha.png"),
    )
    parser.add_argument(
        "--asset-root",
        type=Path,
        default=Path("public/game-art/generated/ui/animations/defeated-banner"),
    )
    args = parser.parse_args()
    source = args.source.resolve()
    root = args.asset_root.resolve()
    previews = root / "previews"
    previews.mkdir(parents=True, exist_ok=True)

    master = load_master(source)
    assets = split_parts(master)
    assets["rotor"] = make_rotor()
    assets["scan"] = make_scan_particle()
    save_registered_parts(assets, root, master)

    frames = build_frames(assets)
    gif_frames = [gif_frame(frame) for frame in frames]
    gif_path = previews / "scicon-defeated-banner-animation.gif"
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
    frames[-9].save(previews / "scicon-defeated-banner-final.png", optimize=True)
    save_sequence(frames, previews / "scicon-defeated-banner-sequence.png")
    write_manifest(root / "animation-manifest.json")

    readme = """# Scicon Defeated Banner\n\nThis pack is a layered, animation-ready defeat announcement. Use the PNG parts\nand `animation-manifest.json` at runtime. The GIF and sequence PNG are approval\nand Sprite Gallery previews, not the production animation format.\n\nThe live hold loop combines slight independent torn-wing movement, opposing\nwarning-rotor turns, traveling light scans, weak emergency flicker, and a very\nsmall hover. Keep `DEFEATED` as live UI text.\n"""
    (root / "README.md").write_text(readme, encoding="utf-8")

    print(f"Built {len(frames)} frames")
    print(f"GIF: {gif_path}")
    print(f"Manifest: {root / 'animation-manifest.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
