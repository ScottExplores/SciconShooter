"""Build spatial perspective sheets for Scicon Shooter's surface props.

The ImageGen source atlases contain one 3x3 grid for each spatial view. This
builder removes layout variation between those atlases, anchors every view to
the same ground-contact line, and emits:

* one 768x256 three-state sheet per prop; and
* one 768x2304 runtime master sheet per terrain family.

The frames are spatial states (ahead, overhead, behind), not an animation.
"""

from __future__ import annotations

import hashlib
import json
from datetime import date
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "tools" / "imagegen-sources" / "scicon-ground-prop-perspective-v1"
OUTPUT_DIR = (
    ROOT
    / "public"
    / "game-art"
    / "generated"
    / "backgrounds"
    / "scicon-ground-prop-perspective-v1"
)

CELL_SIZE = 256
CONTENT_SIZE = 220
GROUND_LINE_Y = 238
STATE_ORDER = ("ahead", "overhead", "behind")

PROP_IDS: dict[str, tuple[str, ...]] = {
    "desert": (
        "sandstone-boulder-cluster",
        "sandstone-rock-spire",
        "cracked-sandstone-slab",
        "fossil-rib-cage",
        "dry-thorn-bush",
        "desert-research-beacon",
        "broken-desert-pipeline",
        "amber-crystal-cluster",
        "dust-impact-crater",
    ),
    "river": (
        "mossy-river-boulders",
        "river-reed-clump",
        "river-lily-pads",
        "mossy-fallen-log",
        "river-stepping-stones",
        "river-research-buoy",
        "ancient-river-stone-ring",
        "cyan-river-crystals",
        "broken-mossy-arch",
    ),
}


def public_path(path: Path) -> str:
    return "/" + path.relative_to(ROOT / "public").as_posix()


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("Perspective atlas cell is fully transparent")
    return bbox


def crop_grid_cell(atlas: Image.Image, row: int, column: int) -> Image.Image:
    if atlas.width % 3 != 0 or atlas.height % 3 != 0:
        raise ValueError(f"Expected a divisible 3x3 atlas, got {atlas.size}")
    cell_width = atlas.width // 3
    cell_height = atlas.height // 3
    return atlas.crop(
        (
            column * cell_width,
            row * cell_height,
            (column + 1) * cell_width,
            (row + 1) * cell_height,
        )
    )


def normalize_views(views: list[Image.Image]) -> list[Image.Image]:
    bboxes = [alpha_bbox(view) for view in views]
    max_width = max(right - left for left, _, right, _ in bboxes)
    max_height = max(bottom - top for _, top, _, bottom in bboxes)
    scale = min(CONTENT_SIZE / max_width, CONTENT_SIZE / max_height)

    normalized: list[Image.Image] = []
    for view, bbox in zip(views, bboxes, strict=True):
        subject = view.crop(bbox)
        width = max(1, round(subject.width * scale))
        height = max(1, round(subject.height * scale))
        subject = subject.resize((width, height), Image.Resampling.NEAREST)
        frame = Image.new("RGBA", (CELL_SIZE, CELL_SIZE), (0, 0, 0, 0))
        x = (CELL_SIZE - width) // 2
        y = GROUND_LINE_Y - height
        frame.alpha_composite(subject, (x, y))
        normalized.append(frame)
    return normalized


def digest(image: Image.Image) -> str:
    return hashlib.sha256(image.tobytes()).hexdigest()


def load_state_atlases(terrain: str) -> dict[str, Image.Image]:
    atlases: dict[str, Image.Image] = {}
    for state in STATE_ORDER:
        path = SOURCE_DIR / f"{terrain}-{state}-rgba.png"
        if not path.exists():
            raise FileNotFoundError(path)
        atlases[state] = Image.open(path).convert("RGBA")
    return atlases


def build_terrain(terrain: str, prop_ids: tuple[str, ...]) -> dict[str, object]:
    terrain_dir = OUTPUT_DIR / terrain
    sheet_dir = terrain_dir / "sheets"
    sheet_dir.mkdir(parents=True, exist_ok=True)
    atlases = load_state_atlases(terrain)
    master = Image.new("RGBA", (CELL_SIZE * 3, CELL_SIZE * len(prop_ids)), (0, 0, 0, 0))
    manifest_props: list[dict[str, object]] = []

    for row, prop_id in enumerate(prop_ids):
        raw_views = [crop_grid_cell(atlases[state], row // 3, row % 3) for state in STATE_ORDER]
        views = normalize_views(raw_views)
        sheet = Image.new("RGBA", (CELL_SIZE * 3, CELL_SIZE), (0, 0, 0, 0))
        hashes: list[str] = []
        for column, view in enumerate(views):
            sheet.alpha_composite(view, (column * CELL_SIZE, 0))
            master.alpha_composite(view, (column * CELL_SIZE, row * CELL_SIZE))
            hashes.append(digest(view))

        if len(set(hashes)) != len(STATE_ORDER):
            raise ValueError(f"{terrain}/{prop_id} has duplicate perspective states")

        number = row + 1
        sheet_path = sheet_dir / f"{terrain}-prop-{number:02d}-{prop_id}-perspective-sheet.png"
        sheet.save(sheet_path, optimize=True)
        manifest_props.append(
            {
                "id": prop_id,
                "row": row,
                "sheet": public_path(sheet_path),
                "frameHashes": dict(zip(STATE_ORDER, hashes, strict=True)),
            }
        )

    master_path = terrain_dir / f"{terrain}-ground-props-perspective-master-3x9.png"
    master.save(master_path, optimize=True)
    return {
        "id": terrain,
        "masterSheet": public_path(master_path),
        "masterSize": [master.width, master.height],
        "props": manifest_props,
    }


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    terrains = [build_terrain(terrain, prop_ids) for terrain, prop_ids in PROP_IDS.items()]
    manifest = {
        "id": "scicon-ground-prop-perspective-v1",
        "version": 1,
        "generated": date.today().isoformat(),
        "productionFormat": "Spatial three-view PNG sheets; not timed animation",
        "frame": {"width": CELL_SIZE, "height": CELL_SIZE},
        "stateOrder": list(STATE_ORDER),
        "stateMeaning": {
            "ahead": "prop is north/ahead of the player; show its south/front face",
            "overhead": "prop is crossing the player's flight line; show true top-down view",
            "behind": "prop is south/behind the player; show its north/rear face",
        },
        "runtimeProtocol": (
            "Select by prop center Y relative to player center Y. Do not advance these frames "
            "with a timer, GIF, AnimatedSprite, weapon level, or simulation state."
        ),
        "sourceMode": "OpenAI built-in image generation with flat #ff00ff chroma-key removal",
        "terrains": terrains,
    }
    (OUTPUT_DIR / "pack-manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Built {sum(len(ids) for ids in PROP_IDS.values())} perspective sheets in {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
