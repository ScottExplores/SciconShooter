#!/usr/bin/env python3
"""Build fixed-registration animated pixel power-ups from generated alpha masters."""

from __future__ import annotations

import argparse
import colorsys
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE_DIR = ROOT / "tmp" / "imagegen" / "powerups"
STATIC_DIR = ROOT / "public" / "game-art" / "powerups"
PACK_DIR = ROOT / "public" / "game-art" / "generated" / "powerups" / "scicon-powerup-idle-pack-v1"

POWERUPS = {
    "magnet": (64, 232, 255),
    "overdrive-spread": (255, 210, 56),
    "research-beam": (167, 104, 255),
    "shield": (77, 219, 255),
}

FRAME_SPECS = (
    ("01-rest", 0.00, 0.00, False),
    ("02-core-rise", 0.22, 0.04, False),
    ("03-energy-pulse", 0.42, 0.14, False),
    ("04-peak-glint", 0.66, 0.34, True),
    ("05-rim-travel", 0.26, 0.48, False),
    ("06-settle", 0.10, 0.14, False),
)


def normalize_master(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    if image.size != (256, 256):
        image = image.resize((256, 256), Image.Resampling.NEAREST)
    return image


def is_accent_pixel(red: int, green: int, blue: int, alpha: int) -> tuple[bool, float]:
    if alpha < 48:
        return False, 0.0
    _, saturation, value = colorsys.rgb_to_hsv(red / 255, green / 255, blue / 255)
    active = saturation >= 0.34 and value >= 0.34
    return active, max(0.0, min(1.0, (saturation * 0.62) + (value * 0.38)))


def build_frame(
    base: Image.Image,
    accent_color: tuple[int, int, int],
    core_strength: float,
    rim_strength: float,
    add_glints: bool,
) -> Image.Image:
    frame = base.copy()
    source = base.load()
    target = frame.load()
    center_x = center_y = 127.5

    for y in range(256):
        for x in range(256):
            red, green, blue, alpha = source[x, y]
            active, accent_weight = is_accent_pixel(red, green, blue, alpha)
            if not active:
                continue

            dx = (x - center_x) / 128
            dy = (y - center_y) / 128
            distance = (dx * dx + dy * dy) ** 0.5
            strength = core_strength if distance <= 0.53 else rim_strength
            strength *= accent_weight
            if strength <= 0:
                continue

            tint_mix = strength * 0.28
            white_mix = strength * 0.62
            tinted = (
                int(red + (accent_color[0] - red) * tint_mix),
                int(green + (accent_color[1] - green) * tint_mix),
                int(blue + (accent_color[2] - blue) * tint_mix),
            )
            target[x, y] = (
                min(255, int(tinted[0] + (255 - tinted[0]) * white_mix)),
                min(255, int(tinted[1] + (255 - tinted[1]) * white_mix)),
                min(255, int(tinted[2] + (255 - tinted[2]) * white_mix)),
                alpha,
            )

    if add_glints:
        glint_points = ((128, 48), (70, 128), (186, 128), (128, 204))
        for center in glint_points:
            cx, cy = center
            for ox, oy, intensity in (
                (0, 0, 1.0), (-2, 0, 0.82), (2, 0, 0.82),
                (0, -2, 0.82), (0, 2, 0.82), (-1, 0, 1.0), (1, 0, 1.0),
            ):
                px, py = cx + ox, cy + oy
                base_alpha = source[px, py][3]
                if base_alpha < 48:
                    continue
                target[px, py] = (
                    int(210 + 45 * intensity),
                    int(245 + 10 * intensity),
                    255,
                    base_alpha,
                )

    frame.putalpha(base.getchannel("A"))
    return frame


def save_gif(frames: list[Image.Image], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    durations = [190, 120, 110, 150, 130, 230]
    frames[0].save(
        path,
        save_all=True,
        append_images=frames[1:],
        duration=durations,
        loop=0,
        disposal=2,
        optimize=False,
    )


def build_powerup(name: str, accent_color: tuple[int, int, int], source_dir: Path) -> dict:
    source_path = source_dir / f"{name}-alpha.png"
    if not source_path.exists():
        raise FileNotFoundError(f"Missing alpha master: {source_path}")

    base = normalize_master(source_path)
    static_path = STATIC_DIR / f"{name}.png"
    static_path.parent.mkdir(parents=True, exist_ok=True)
    base.save(static_path, optimize=True)

    powerup_dir = PACK_DIR / name
    frame_dir = powerup_dir / "frames"
    preview_dir = powerup_dir / "previews"
    frame_dir.mkdir(parents=True, exist_ok=True)

    frames: list[Image.Image] = []
    frame_paths: list[str] = []
    for frame_name, core_strength, rim_strength, add_glints in FRAME_SPECS:
        frame = build_frame(base, accent_color, core_strength, rim_strength, add_glints)
        frame_path = frame_dir / f"{name}-{frame_name}.png"
        frame.save(frame_path, optimize=True)
        frames.append(frame)
        frame_paths.append(frame_path.relative_to(ROOT / "public").as_posix())

    sheet = Image.new("RGBA", (256 * len(frames), 256), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        sheet.alpha_composite(frame, (index * 256, 0))
    sheet_path = powerup_dir / f"{name}-idle-sprite-sheet.png"
    sheet.save(sheet_path, optimize=True)

    preview_path = preview_dir / f"{name}-idle-preview.gif"
    save_gif(frames, preview_path)

    return {
        "id": name,
        "static": static_path.relative_to(ROOT / "public").as_posix(),
        "frames": frame_paths,
        "frameSize": [256, 256],
        "registration": "fixed-center",
        "runtimeFps": 8,
        "spriteSheet": sheet_path.relative_to(ROOT / "public").as_posix(),
        "previewGif": preview_path.relative_to(ROOT / "public").as_posix(),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=Path, default=DEFAULT_SOURCE_DIR)
    args = parser.parse_args()

    PACK_DIR.mkdir(parents=True, exist_ok=True)
    entries = [build_powerup(name, accent, args.source_dir) for name, accent in POWERUPS.items()]
    manifest = {
        "id": "scicon-powerup-idle-pack-v1",
        "description": "Fixed-registration six-frame pixel power-ups with internal light pulses.",
        "powerups": entries,
    }
    (PACK_DIR / "pack-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"pack": str(PACK_DIR), "powerups": len(entries), "frames": len(entries) * len(FRAME_SPECS)}))


if __name__ == "__main__":
    main()
