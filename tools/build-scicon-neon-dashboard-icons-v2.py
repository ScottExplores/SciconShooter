from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PACK_ROOT = (
    ROOT
    / "public"
    / "game-art"
    / "generated"
    / "ui"
    / "scicon-neon-dashboard-icons-v2"
)
SOURCE = (
    ROOT
    / "tools"
    / "generated-image-sources"
    / "scicon-neon-dashboard-icons-v2"
    / "dashboard-nav-icons-transparent-source.png"
)
OUTPUT = PACK_ROOT / "dashboard-nav-icons-static.png"
MANIFEST = PACK_ROOT / "pack-manifest.json"
CELL_SIZE = 256

# The source is a generated five-icon study. These non-overlapping bounds isolate
# its five approved silhouettes before normalizing them into equal runtime cells.
CROP_BOXES: tuple[tuple[str, tuple[int, int, int, int]], ...] = (
    ("proposals", (58, 145, 405, 605)),
    ("trophies", (454, 145, 839, 605)),
    ("home", (916, 145, 1255, 605)),
    ("hangar", (1301, 145, 1736, 605)),
    ("more", (1757, 145, 2140, 605)),
)


def normalize_icon(source: Image.Image, crop_box: tuple[int, int, int, int]) -> Image.Image:
    cropped = source.crop(crop_box)
    alpha_bounds = cropped.getchannel("A").getbbox()
    if alpha_bounds is None:
        raise ValueError(f"No visible artwork found in crop {crop_box}")

    artwork = cropped.crop(alpha_bounds)
    maximum_width = 222
    maximum_height = 220
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


def build() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    strip = Image.new("RGBA", (CELL_SIZE * len(CROP_BOXES), CELL_SIZE), (0, 0, 0, 0))
    for index, (_, crop_box) in enumerate(CROP_BOXES):
        strip.alpha_composite(normalize_icon(source, crop_box), (index * CELL_SIZE, 0))

    strip.save(OUTPUT, optimize=True)
    manifest = {
        "id": "scicon-neon-dashboard-icons-v2",
        "version": 1,
        "source": "built-in image generation plus local chroma-key removal",
        "assets": {
            "dashboardNavIcons": {
                "path": "/game-art/generated/ui/scicon-neon-dashboard-icons-v2/dashboard-nav-icons-static.png",
                "sheetSize": [strip.width, strip.height],
                "grid": [len(CROP_BOXES), 1],
                "frameSize": [CELL_SIZE, CELL_SIZE],
                "columns": [name for name, _ in CROP_BOXES],
                "rows": ["static"],
                "sha256": hashlib.sha256(OUTPUT.read_bytes()).hexdigest(),
            }
        },
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT.relative_to(ROOT)} ({strip.width}x{strip.height})")


if __name__ == "__main__":
    build()
