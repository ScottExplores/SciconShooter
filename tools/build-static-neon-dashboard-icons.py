from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PACK_ROOT = ROOT / "public" / "game-art" / "generated" / "ui" / "scicon-neon-frame-v1"
SOURCE = PACK_ROOT / "dashboard-nav-icons-spritesheet.png"
OUTPUT = PACK_ROOT / "dashboard-nav-icons-static.png"
MANIFEST = PACK_ROOT / "pack-manifest.json"
WEEKLY_PANEL = (
    ROOT
    / "public"
    / "game-art"
    / "generated"
    / "ui"
    / "scicon-pixel-action-buttons-v1"
    / "start-mission-panel.png"
)
CELL_SIZE = 256

# The generated source sheet has attractive artwork, but several silhouettes cross
# its nominal animation-cell boundaries. These boxes isolate the approved idle-row
# artwork before it is registered onto equal, safely padded production cells.
CROP_BOXES: tuple[tuple[str, tuple[int, int, int, int]], ...] = (
    ("proposals", (56, 42, 306, 304)),
    ("trophies", (330, 38, 620, 304)),
    ("home", (625, 28, 895, 306)),
    ("hangar", (890, 28, 1195, 306)),
    ("more", (1180, 92, 1460, 270)),
)


def normalize_icon(source: Image.Image, crop_box: tuple[int, int, int, int]) -> Image.Image:
    cropped = source.crop(crop_box)
    alpha_bounds = cropped.getchannel("A").getbbox()
    if alpha_bounds is None:
        raise ValueError(f"No visible artwork found in crop {crop_box}")

    artwork = cropped.crop(alpha_bounds)
    maximum_width = 220
    maximum_height = 218
    scale = min(maximum_width / artwork.width, maximum_height / artwork.height, 1)
    if scale < 1:
        artwork = artwork.resize(
            (max(1, round(artwork.width * scale)), max(1, round(artwork.height * scale))),
            Image.Resampling.LANCZOS,
        )

    cell = Image.new("RGBA", (CELL_SIZE, CELL_SIZE), (0, 0, 0, 0))
    cell.alpha_composite(
        artwork,
        ((CELL_SIZE - artwork.width) // 2, (CELL_SIZE - artwork.height) // 2),
    )
    return cell


def update_manifest() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    weekly_panel = Image.open(WEEKLY_PANEL)
    manifest["version"] = 2
    manifest["assets"]["weeklyFundingFrame"] = {
        "path": "/game-art/generated/ui/scicon-pixel-action-buttons-v1/start-mission-panel.png",
        "sheetSize": [weekly_panel.width, weekly_panel.height],
        "grid": [1, 1],
        "frameSize": [weekly_panel.width, weekly_panel.height],
        "frameCount": 1,
        "rows": ["static"],
        "sha256": hashlib.sha256(WEEKLY_PANEL.read_bytes()).hexdigest(),
    }
    manifest["assets"]["dashboardNavIcons"] = {
        "path": "/game-art/generated/ui/scicon-neon-frame-v1/dashboard-nav-icons-static.png",
        "sheetSize": [CELL_SIZE * len(CROP_BOXES), CELL_SIZE],
        "grid": [len(CROP_BOXES), 1],
        "frameSize": [CELL_SIZE, CELL_SIZE],
        "columns": [name for name, _ in CROP_BOXES],
        "rows": ["static"],
        "sha256": hashlib.sha256(OUTPUT.read_bytes()).hexdigest(),
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def build() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    strip = Image.new("RGBA", (CELL_SIZE * len(CROP_BOXES), CELL_SIZE), (0, 0, 0, 0))
    for index, (_, crop_box) in enumerate(CROP_BOXES):
        strip.alpha_composite(normalize_icon(source, crop_box), (index * CELL_SIZE, 0))

    strip.save(OUTPUT, optimize=True)
    update_manifest()
    print(f"Wrote {OUTPUT.relative_to(ROOT)} ({strip.width}x{strip.height})")


if __name__ == "__main__":
    build()
