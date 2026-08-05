"""Build the five-family Scicon advanced enemy sprite pack.

Each tracked ImageGen source is a horizontal three-pose chroma-key strip. The
builder extracts the poses, normalizes them to a fixed 256x256 registration,
emits runtime PNG frames and sprite sheets, and builds deterministic manifests
and previews for visual QA.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "tools" / "imagegen-sources" / "scicon-advanced-enemy-pack-v1"
OUTPUT_DIR = ROOT / "public" / "game-art" / "generated" / "scicon-advanced-enemy-pack-v1"

CELL_SIZE = 256
CONTENT_SIZE = 212
FRAME_IDS = ("neutral", "charge", "fire")
GIF_SEQUENCE = (0, 1, 2, 1)
GIF_DURATIONS_MS = (180, 120, 180, 120)
PACK_SOURCE_DATE = "2026-08-04"

ENEMIES: tuple[tuple[str, str, str, str, tuple[str, ...]], ...] = (
    (
        "quasar-lancer",
        "Quasar Lancer",
        "01-quasar-lancer-rgba.png",
        "SCICON_ENEMY_QUASAR_LANCER_FRAMES",
        ("role-quasar-lancer",),
    ),
    (
        "null-bastion",
        "Null Bastion",
        "02-null-bastion-rgba.png",
        "SCICON_ENEMY_NULL_BASTION_FRAMES",
        ("role-null-bastion",),
    ),
    (
        "vector-reaver",
        "Vector Reaver",
        "03-vector-reaver-rgba.png",
        "SCICON_ENEMY_VECTOR_REAVER_FRAMES",
        ("role-vector-reaver",),
    ),
    (
        "rift-weaver",
        "Rift Weaver",
        "04-rift-weaver-rgba.png",
        "SCICON_ENEMY_RIFT_WEAVER_FRAMES",
        ("role-rift-weaver",),
    ),
    (
        "pulse-herald",
        "Pulse Herald",
        "05-pulse-herald-rgba.png",
        "SCICON_ENEMY_PULSE_HERALD_FRAMES",
        ("role-pulse-herald",),
    ),
)


def public_path(path: Path) -> str:
    return "/" + path.relative_to(ROOT / "public").as_posix()


def pixel_digest(image: Image.Image) -> str:
    return hashlib.sha256(image.tobytes()).hexdigest()


def file_digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("Advanced enemy frame is fully transparent")
    return bbox


def split_strip(atlas: Image.Image) -> list[Image.Image]:
    """Split into equal visual thirds even when ImageGen used odd dimensions."""
    edges = [round(atlas.width * index / 3) for index in range(4)]
    return [
        atlas.crop((edges[index], 0, edges[index + 1], atlas.height))
        for index in range(3)
    ]


def normalize_frames(raw_frames: list[Image.Image]) -> list[Image.Image]:
    """Apply one common scale and a fixed center anchor to every pose."""
    bboxes = [alpha_bbox(frame) for frame in raw_frames]
    max_width = max(right - left for left, _, right, _ in bboxes)
    max_height = max(bottom - top for _, top, _, bottom in bboxes)
    scale = min(CONTENT_SIZE / max_width, CONTENT_SIZE / max_height)

    normalized: list[Image.Image] = []
    for raw, bbox in zip(raw_frames, bboxes, strict=True):
        subject = raw.crop(bbox)
        width = max(1, round(subject.width * scale))
        height = max(1, round(subject.height * scale))
        subject = subject.resize((width, height), Image.Resampling.NEAREST)
        frame = Image.new("RGBA", (CELL_SIZE, CELL_SIZE), (0, 0, 0, 0))
        frame.alpha_composite(subject, ((CELL_SIZE - width) // 2, (CELL_SIZE - height) // 2))
        normalized.append(frame)
    return normalized


def save_preview_gif(frames: list[Image.Image], path: Path) -> None:
    sequence = [frames[index] for index in GIF_SEQUENCE]
    sequence[0].save(
        path,
        save_all=True,
        append_images=sequence[1:],
        duration=GIF_DURATIONS_MS,
        loop=0,
        disposal=2,
        transparency=0,
        optimize=False,
    )


def build_enemy(
    enemy_id: str,
    display_name: str,
    source_name: str,
    asset_key: str,
    role_ids: tuple[str, ...],
) -> dict[str, object]:
    source_path = SOURCE_DIR / source_name
    if not source_path.exists():
        raise FileNotFoundError(source_path)

    raw_frames = split_strip(Image.open(source_path).convert("RGBA"))
    frames = normalize_frames(raw_frames)
    pixel_hashes = [pixel_digest(frame) for frame in frames]
    if len(set(pixel_hashes)) != 3:
        raise ValueError(f"{enemy_id} contains duplicate animation frames")

    enemy_dir = OUTPUT_DIR / "enemies" / enemy_id
    frame_dir = enemy_dir / "frames"
    preview_dir = OUTPUT_DIR / "previews"
    frame_dir.mkdir(parents=True, exist_ok=True)
    preview_dir.mkdir(parents=True, exist_ok=True)
    frame_paths: list[Path] = []
    sheet = Image.new("RGBA", (CELL_SIZE * 3, CELL_SIZE), (0, 0, 0, 0))

    for index, (frame_id, frame) in enumerate(zip(FRAME_IDS, frames, strict=True), start=1):
        frame_path = frame_dir / f"{enemy_id}-{index:02d}-{frame_id}.png"
        frame.save(frame_path, optimize=True)
        frame_paths.append(frame_path)
        sheet.alpha_composite(frame, ((index - 1) * CELL_SIZE, 0))

    sheet_path = enemy_dir / f"{enemy_id}-sprite-sheet.png"
    preview_path = preview_dir / f"{enemy_id}-animation-preview.gif"
    sheet.save(sheet_path, optimize=True)
    save_preview_gif(frames, preview_path)

    return {
        "id": enemy_id,
        "name": display_name,
        "assetKey": asset_key,
        "roleIds": list(role_ids),
        "source": f"tools/imagegen-sources/scicon-advanced-enemy-pack-v1/{source_name}",
        "states": list(FRAME_IDS),
        "frames": [public_path(path) for path in frame_paths],
        "framePixelHashes": dict(zip(FRAME_IDS, pixel_hashes, strict=True)),
        "frameFileHashes": {
            state: file_digest(path)
            for state, path in zip(FRAME_IDS, frame_paths, strict=True)
        },
        "sheet": public_path(sheet_path),
        "previewGif": public_path(preview_path),
    }


def write_readme() -> None:
    (OUTPUT_DIR / "README.md").write_text(
        """# Scicon Advanced Enemy Pack v1

Five original late-game enemy families for Campaign sectors 6-10 and the
corresponding Weekly Run depths. Each family includes three transparent
256x256 PNG frames, a 768x256 horizontal sprite sheet, and a ping-pong GIF QA
preview. Runtime frame order is `neutral`, `charge`, `fire`; GIFs and sprite
sheets are reference artifacts only.

All frames use fixed center registration. Gameplay collision continues to use
the existing enemy chassis hitboxes rather than visible sprite bounds.
""",
        encoding="utf-8",
    )


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    enemies = [build_enemy(*enemy) for enemy in ENEMIES]

    overview = Image.new("RGBA", (CELL_SIZE * 3, CELL_SIZE * len(enemies)), (0, 0, 0, 0))
    for row, enemy in enumerate(enemies):
        sheet_path = ROOT / "public" / str(enemy["sheet"]).lstrip("/")
        overview.alpha_composite(Image.open(sheet_path).convert("RGBA"), (0, row * CELL_SIZE))
    overview_path = OUTPUT_DIR / "scicon-advanced-enemy-overview.png"
    overview.save(overview_path, optimize=True)

    manifest = {
        "id": "scicon-advanced-enemy-pack-v1",
        "version": 1,
        # This is the tracked source-art publication date, not the build date,
        # so rebuilding identical inputs produces a byte-identical manifest.
        "generated": PACK_SOURCE_DATE,
        "sourceMode": "OpenAI built-in image generation with chroma-key removal",
        "productionFormat": "Three-frame transparent PNG sprite sheets",
        "style": "Scicon late-game semi-pixel-art enemy craft",
        "frame": {"width": CELL_SIZE, "height": CELL_SIZE, "colorMode": "RGBA"},
        "frameCount": 3,
        "frameOrder": list(FRAME_IDS),
        "fps": 8,
        "fixedRegistration": True,
        "hitboxInvariant": "Runtime collision is defined by the assigned enemy chassis, not sprite alpha bounds.",
        "animation": {
            "sequence": [FRAME_IDS[index] for index in GIF_SEQUENCE],
            "durationsMs": list(GIF_DURATIONS_MS),
            "loop": True,
            "protocol": "Animate individual PNG frames in runtime; sheets and GIFs are QA/reference only.",
        },
        "overview": public_path(overview_path),
        "overviewSize": [overview.width, overview.height],
        "enemies": enemies,
    }
    (OUTPUT_DIR / "pack-manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n",
        encoding="utf-8",
    )
    write_readme()
    print(f"Built {len(enemies)} advanced enemy animation sheets in {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
