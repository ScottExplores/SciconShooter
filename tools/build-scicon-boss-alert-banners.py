#!/usr/bin/env python3
"""Build the Scicon Boss Alert Banner Pack v1.

Production uses registered transparent frame PNGs plus live text/effect overlays.
GIFs, labeled finals, sequences, and the overview are approval/gallery assets.
"""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "tmp" / "imagegen" / "boss-alert-banners-v1"
OUT = ROOT / "public" / "game-art" / "generated" / "ui" / "animations" / "boss-alert-banners-v1"
REGISTERED_SIZE = (1024, 360)
PREVIEW_CANVAS = (1200, 500)


@dataclass(frozen=True)
class AlertSpec:
    slug: str
    title: str
    example_boss: str
    source: str
    accent: tuple[int, int, int]
    secondary: tuple[int, int, int]
    ring_positions: tuple[tuple[float, float], ...]
    scan_rows: tuple[int, int]
    text_y: int


SPECS = (
    AlertSpec(
        "mini-boss",
        "MINI-BOSS DETECTED",
        "BOTTLENECK HARVESTER",
        "mini-boss-alpha.png",
        (255, 174, 49),
        (70, 226, 255),
        ((0.205, 0.50), (0.795, 0.50)),
        (105, 252),
        176,
    ),
    AlertSpec(
        "boss-incoming",
        "BOSS INCOMING",
        "PAYWALL BASTION",
        "boss-incoming-alpha.png",
        (255, 56, 66),
        (55, 211, 255),
        ((0.196, 0.49), (0.804, 0.49)),
        (85, 273),
        177,
    ),
    AlertSpec(
        "apex-boss",
        "APEX THREAT",
        "ASTRAL CROWNCLAW",
        "apex-boss-alpha.png",
        (187, 92, 255),
        (63, 225, 255),
        ((0.183, 0.51), (0.817, 0.51), (0.438, 0.765), (0.562, 0.765)),
        (91, 268),
        176,
    ),
)


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def ease_out_cubic(value: float) -> float:
    value = clamp(value)
    return 1.0 - (1.0 - value) ** 3


def ease_out_back(value: float, overshoot: float = 1.25) -> float:
    value = clamp(value) - 1.0
    return 1.0 + value * value * ((overshoot + 1.0) * value + overshoot)


def font(size: int, bold: bool = True) -> ImageFont.ImageFont:
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


def register_source(path: Path) -> Image.Image:
    with Image.open(path) as image:
        source = image.convert("RGBA")
    bbox = source.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError(f"Fully transparent alert source: {path}")
    crop = source.crop(bbox)
    max_width, max_height = 970, 324
    scale = min(max_width / crop.width, max_height / crop.height)
    resized = crop.resize(
        (max(1, round(crop.width * scale)), max(1, round(crop.height * scale))),
        Image.Resampling.LANCZOS,
    )
    registered = Image.new("RGBA", REGISTERED_SIZE, (0, 0, 0, 0))
    registered.alpha_composite(
        resized,
        ((REGISTERED_SIZE[0] - resized.width) // 2, (REGISTERED_SIZE[1] - resized.height) // 2),
    )
    return registered


def make_ring(color: tuple[int, int, int]) -> Image.Image:
    size = 112
    ring = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(ring)
    center = size // 2
    draw.ellipse((7, 7, 104, 104), outline=(*color, 145), width=7)
    draw.ellipse((20, 20, 91, 91), outline=(*color, 235), width=5)
    draw.ellipse((42, 42, 69, 69), fill=(*color, 190), outline=(235, 255, 255, 235), width=2)
    for angle in range(0, 360, 45):
        radians = math.radians(angle)
        inner = (center + math.cos(radians) * 24, center + math.sin(radians) * 24)
        outer = (center + math.cos(radians) * 40, center + math.sin(radians) * 40)
        draw.line((*inner, *outer), fill=(*color, 220), width=4)
    return ring


def make_scan(color: tuple[int, int, int]) -> Image.Image:
    scan = Image.new("RGBA", (128, 14), (0, 0, 0, 0))
    draw = ImageDraw.Draw(scan)
    draw.rounded_rectangle((2, 4, 125, 9), radius=3, fill=(*color, 72))
    draw.rounded_rectangle((25, 3, 101, 10), radius=3, fill=(*color, 185))
    draw.line((42, 6, 85, 6), fill=(236, 255, 255, 245), width=2)
    return scan


def glow(source: Image.Image, color: tuple[int, int, int], radius: float, strength: float) -> Image.Image:
    alpha = source.getchannel("A").filter(ImageFilter.GaussianBlur(radius))
    alpha = alpha.point(lambda value: round(value * clamp(strength)))
    layer = Image.new("RGBA", source.size, (*color, 0))
    layer.putalpha(alpha)
    return layer


def draw_live_text(canvas: Image.Image, spec: AlertSpec, alpha: int, glitch: int = 0) -> None:
    if alpha <= 0:
        return
    draw = ImageDraw.Draw(canvas)
    tier_font = font(28)
    boss_font = font(54)
    tier_bbox = draw.textbbox((0, 0), spec.title, font=tier_font, stroke_width=2)
    boss_bbox = draw.textbbox((0, 0), spec.example_boss, font=boss_font, stroke_width=3)
    tier_x = (canvas.width - (tier_bbox[2] - tier_bbox[0])) // 2 + glitch
    boss_x = (canvas.width - (boss_bbox[2] - boss_bbox[0])) // 2 - glitch
    tier_y = spec.text_y - 47
    boss_y = spec.text_y - 8
    shadow = (9, 6, 20, alpha)
    draw.text((tier_x, tier_y), spec.title, font=tier_font, fill=(*spec.accent, alpha), stroke_width=3, stroke_fill=shadow)
    draw.text((boss_x, boss_y), spec.example_boss, font=boss_font, fill=(229, 249, 255, alpha), stroke_width=4, stroke_fill=shadow)


def add_effects(
    canvas: Image.Image,
    spec: AlertSpec,
    rings: dict[str, Image.Image],
    scans: dict[str, Image.Image],
    phase: float,
    strength: float,
) -> None:
    if strength <= 0:
        return
    ring_key = "amber" if spec.slug == "mini-boss" else "red" if spec.slug == "boss-incoming" else "violet"
    ring = rings[ring_key]
    for index, (rx, ry) in enumerate(spec.ring_positions):
        angle = math.degrees(phase) * (0.42 if index % 2 == 0 else -0.34)
        rotated = ring.rotate(angle, Image.Resampling.BICUBIC)
        pulse = 0.64 + 0.36 * math.sin(phase * 2.0 + index * 0.8) ** 2
        rotated.putalpha(rotated.getchannel("A").point(lambda value: round(value * strength * pulse)))
        x = round(rx * canvas.width - rotated.width / 2)
        y = round(ry * canvas.height - rotated.height / 2)
        canvas.alpha_composite(glow(rotated, spec.accent, 10, 0.48), (x, y))
        canvas.alpha_composite(rotated, (x, y))

    scan = scans["cyan"] if spec.slug == "mini-boss" else scans["red"] if spec.slug == "boss-incoming" else scans["violet"]
    travel = (phase / math.tau) % 1.0
    top_x = round(240 + travel * 430)
    bottom_x = round(670 - travel * 430)
    scan_layer = scan.copy()
    scan_layer.putalpha(scan_layer.getchannel("A").point(lambda value: round(value * strength)))
    canvas.alpha_composite(scan_layer, (top_x, spec.scan_rows[0]))
    canvas.alpha_composite(scan_layer, (bottom_x, spec.scan_rows[1]))

    # A restrained symmetric warning blink reinforces alert timing without
    # baking a separate UI indicator into the source frame.
    blink = clamp((math.sin(phase * 3.0) - 0.35) * 1.4) * strength
    if blink > 0:
        overlay = Image.new("RGBA", canvas.size, (*spec.accent, 0))
        overlay.putalpha(canvas.getchannel("A").point(lambda value: round(value * blink * 0.10)))
        canvas.alpha_composite(overlay)


def render_local(
    base: Image.Image,
    spec: AlertSpec,
    rings: dict[str, Image.Image],
    scans: dict[str, Image.Image],
    open_amount: float,
    phase: float,
    text_amount: float,
    live_amount: float,
    glitch: int,
) -> Image.Image:
    local = base.copy()
    add_effects(local, spec, rings, scans, phase, live_amount)
    draw_live_text(local, spec, round(255 * clamp(text_amount)), glitch)
    width = max(24, round(local.width * (0.08 + 0.92 * open_amount)))
    return local.resize((width, local.height), Image.Resampling.LANCZOS)


def place_preview(source: Image.Image, scale: float, offset_y: float) -> Image.Image:
    width = max(1, round(source.width * scale))
    height = max(1, round(source.height * scale))
    resized = source.resize((width, height), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", PREVIEW_CANVAS, (0, 0, 0, 0))
    canvas.alpha_composite(resized, ((canvas.width - width) // 2, (canvas.height - height) // 2 + round(offset_y)))
    return canvas


def build_frames(base: Image.Image, spec: AlertSpec, rings: dict[str, Image.Image], scans: dict[str, Image.Image]) -> list[Image.Image]:
    frames: list[Image.Image] = []
    total = 44
    entrance = 16
    settle = 6
    for index in range(total):
        if index < entrance:
            t = index / max(1, entrance - 1)
            open_amount = ease_out_cubic(clamp((t - 0.10) / 0.74))
            arrival = ease_out_back(t, 1.15)
            scale = 0.42 + 0.58 * arrival
            offset_y = -86 * (1.0 - ease_out_cubic(t))
            text_amount = clamp((open_amount - 0.46) / 0.32)
            live_amount = clamp((t - 0.68) / 0.22)
            phase = 0.0
            glitch = 5 if index in (10, 12) else -4 if index == 11 else 0
        elif index < entrance + settle:
            t = (index - entrance) / max(1, settle - 1)
            open_amount = 1.0
            phase = t * math.pi
            scale = 1.0 + math.sin(t * math.pi) * 0.016
            offset_y = math.sin(t * math.pi * 2.0) * 2.0
            text_amount = 1.0
            live_amount = 0.70 + t * 0.30
            glitch = 0
        else:
            t = (index - entrance - settle) / max(1, total - entrance - settle - 1)
            phase = t * math.tau
            open_amount = 1.0
            scale = 1.0 + math.sin(phase) * 0.0025
            offset_y = math.sin(phase) * 1.8
            text_amount = 1.0
            live_amount = 1.0
            glitch = 0
        local = render_local(base, spec, rings, scans, open_amount, phase, text_amount, live_amount, glitch)
        frames.append(place_preview(local, scale, offset_y))
    return frames


def gif_frame(source: Image.Image) -> Image.Image:
    alpha = source.getchannel("A")
    quantized = source.convert("RGB").quantize(colors=255, method=Image.Quantize.MEDIANCUT)
    mask = alpha.point(lambda value: 255 if value <= 12 else 0)
    quantized.paste(255, mask=mask)
    quantized.info["transparency"] = 255
    quantized.info["disposal"] = 2
    return quantized


def save_gif(frames: list[Image.Image], path: Path) -> None:
    gif_frames = [gif_frame(frame) for frame in frames]
    gif_frames[0].save(
        path,
        save_all=True,
        append_images=gif_frames[1:],
        duration=50,
        loop=0,
        transparency=255,
        disposal=2,
        optimize=False,
    )


def build_sequence(rows: dict[str, list[Image.Image]], path: Path) -> None:
    picks = (0, 6, 12, 18, 31)
    thumb = (360, 150)
    sheet = Image.new("RGB", (thumb[0] * len(picks), thumb[1] * len(SPECS)), "#050a18")
    for row, spec in enumerate(SPECS):
        for column, index in enumerate(picks):
            frame = rows[spec.slug][index].resize(thumb, Image.Resampling.LANCZOS)
            sheet.paste(frame, (column * thumb[0], row * thumb[1]), frame)
    sheet.save(path, optimize=True)


def build_overview(finals: dict[str, Image.Image], path: Path) -> None:
    canvas = Image.new("RGB", (1800, 1500), "#050a18")
    draw = ImageDraw.Draw(canvas)
    draw.text((55, 35), "SCICON BOSS ALERT BANNERS V1", font=font(48), fill="#eefaff")
    draw.text((55, 96), "Three escalating encounter tiers · live text · animated alert overlays", font=font(25, False), fill="#69d9ff")
    card_y = 170
    for spec in SPECS:
        draw.rounded_rectangle((55, card_y, 1745, card_y + 390), radius=22, fill="#09152d", outline=spec.accent, width=3)
        preview = finals[spec.slug].resize((1056, 440), Image.Resampling.LANCZOS)
        canvas.paste(preview, (620, card_y - 25), preview)
        draw.text((90, card_y + 72), spec.title, font=font(35), fill=spec.accent)
        draw.text((90, card_y + 126), spec.example_boss, font=font(29), fill="#e9f8ff")
        draw.text((90, card_y + 190), f"{REGISTERED_SIZE[0]} × {REGISTERED_SIZE[1]} REGISTERED FRAME", font=font(18), fill="#7aa9c5")
        draw.text((90, card_y + 226), "Intro reveal · warning-core rotation", font=font(19, False), fill="#9bc4da")
        draw.text((90, card_y + 258), "rail scans · alert flicker · quiet hold", font=font(19, False), fill="#9bc4da")
        card_y += 420
    canvas.save(path, optimize=True)


def write_manifest(path: Path, assets: list[dict[str, object]], overview: Path, sequence: Path) -> None:
    manifest = {
        "id": "scicon-boss-alert-banners-v1",
        "version": 1,
        "generated": date.today().isoformat(),
        "productionFormat": "registered-layered-png",
        "previewFormat": "animated-gif",
        "registeredSize": list(REGISTERED_SIZE),
        "overview": public_path(overview),
        "sequencePreview": public_path(sequence),
        "tiers": assets,
        "timeline": {
            "arrivalReveal": {"startMs": 0, "durationMs": 800, "motion": ["translateY", "group.scale", "frame.scaleX", "text.glitchFade"]},
            "alertLock": {"startMs": 800, "durationMs": 300, "motion": ["scaleOvershoot", "warningCore.powerUp"]},
            "warningHold": {"startMs": 1100, "durationMs": 1100, "loop": True, "motion": ["warningCore.rotation", "railScan.translateX", "alert.flicker", "translateY.sine"]},
        },
        "runtimeProtocol": {
            "text": "Render the tier label and boss name as live text. Do not bake either string into the production frame PNG.",
            "handoff": "Play the encounter alert once, then transition to the existing compact boss-name plaque and boss-integrity frame for combat.",
            "registration": "Every tier uses a 1024 x 360 transparent canvas and center anchor. Swap tiers without changing layout geometry.",
            "effects": "Use the supplied ring and scan particles as optional overlays. Keep the hold loop subtle and stop it when the alert exits.",
            "accessibility": "Reduced-motion mode should show the labeled final pose for 900 ms with no scale reveal, flicker, or rotation.",
        },
        "audio": {
            "status": "not-authored",
            "recommendedEvents": ["alertArrival", "warningCoreLock", "bossNameReveal", "alertExit"],
            "implementation": "Use one restrained mechanical alert family with intensity/gain increasing by tier. Do not bake audio into GIF previews.",
        },
        "productionNotes": [
            "GIFs and labeled final PNGs are approval/gallery previews only.",
            "Keep the boss health bar separate; these banners announce an encounter and then exit.",
            "Mini-Boss uses amber/cyan, Boss Incoming uses crimson/cyan, and Apex uses violet/emerald/gold with cyan research energy.",
        ],
    }
    path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def build() -> None:
    frames_dir = OUT / "frames"
    effects_dir = OUT / "effects"
    previews_dir = OUT / "previews"
    source_dir = OUT / "source"
    for directory in (frames_dir, effects_dir, previews_dir, source_dir):
        directory.mkdir(parents=True, exist_ok=True)

    rings = {
        "amber": make_ring((255, 174, 49)),
        "red": make_ring((255, 56, 66)),
        "violet": make_ring((187, 92, 255)),
    }
    scans = {
        "cyan": make_scan((70, 226, 255)),
        "red": make_scan((255, 56, 66)),
        "violet": make_scan((187, 92, 255)),
    }
    for name, image in rings.items():
        image.save(effects_dir / f"warning-ring-{name}.png", optimize=True)
    for name, image in scans.items():
        image.save(effects_dir / f"rail-scan-{name}.png", optimize=True)

    frame_sets: dict[str, list[Image.Image]] = {}
    finals: dict[str, Image.Image] = {}
    assets: list[dict[str, object]] = []
    for spec in SPECS:
        source_path = SOURCE / spec.source
        registered = register_source(source_path)
        source_copy = source_dir / f"{spec.slug}-open-master.png"
        registered.save(source_copy, optimize=True)
        frame_path = frames_dir / f"{spec.slug}-alert-frame.png"
        registered.save(frame_path, optimize=True)

        frames = build_frames(registered, spec, rings, scans)
        frame_sets[spec.slug] = frames
        gif_path = previews_dir / f"{spec.slug}-alert-animation.gif"
        save_gif(frames, gif_path)
        final_path = previews_dir / f"{spec.slug}-alert-final.png"
        frames[-5].save(final_path, optimize=True)
        finals[spec.slug] = frames[-5]
        assets.append(
            {
                "id": spec.slug,
                "tierLabel": spec.title,
                "exampleBoss": spec.example_boss,
                "frame": public_path(frame_path),
                "previewGif": public_path(gif_path),
                "labeledFinalPreview": public_path(final_path),
                "size": list(REGISTERED_SIZE),
                "anchor": [0.5, 0.5],
                "accent": "#" + "".join(f"{value:02x}" for value in spec.accent),
            }
        )

    sequence_path = previews_dir / "boss-alert-banners-sequence.png"
    build_sequence(frame_sets, sequence_path)
    overview_path = OUT / "scicon-boss-alert-banners-v1-overview.png"
    build_overview(finals, overview_path)
    write_manifest(OUT / "pack-manifest.json", assets, overview_path, sequence_path)

    readme = """# Scicon Boss Alert Banners v1

This encounter-intro family contains Mini-Boss, Boss Incoming, and Apex/Final
Boss tiers. All production frames share a registered 1024 x 360 transparent
canvas. Render tier labels and boss names as live text.

Use the GIF and labeled final PNG files only for gallery/approval previews. At
runtime, animate the blank frame plus optional warning-ring and rail-scan effect
sprites according to `pack-manifest.json`, then hand off to the compact boss HUD.
"""
    (OUT / "README.md").write_text(readme, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    build()
    print(f"Built {len(SPECS)} boss alert tiers at {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
