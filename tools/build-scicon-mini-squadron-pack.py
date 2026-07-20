"""Build the Scicon mini-squadron three-frame sprite pack.

Each ImageGen source is a horizontal three-pose chroma-key strip. This builder
extracts the poses, gives every pose a stable 256x256 center anchor, emits a
three-frame PNG sheet plus a lightweight GIF preview, and composes a master
sheet for quick inspection in the Sprite Gallery.
"""

from __future__ import annotations

import hashlib
import json
from datetime import date
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "tools" / "imagegen-sources" / "scicon-mini-squadron-pack-v1"
OUTPUT_DIR = (
    ROOT
    / "public"
    / "game-art"
    / "generated"
    / "ships"
    / "scicon-mini-squadron-pack-v1"
)

CELL_SIZE = 256
CONTENT_SIZE = 212
FRAME_IDS = ("neutral", "flex-in", "flex-out")
GIF_SEQUENCE = (0, 1, 2, 1)
GIF_DURATIONS_MS = (240, 150, 240, 150)

SHIPS: tuple[tuple[str, str, str], ...] = (
    ("citation-dart", "Citation Dart", "01-citation-dart-rgba.png"),
    ("helix-wasp", "Helix Wasp", "02-helix-wasp-rgba.png"),
    ("photon-manta", "Photon Manta", "03-photon-manta-rgba.png"),
    ("quorum-crab", "Quorum Crab", "04-quorum-crab-rgba.png"),
    ("axiom-orbiter", "Axiom Orbiter", "05-axiom-orbiter-rgba.png"),
    ("archive-beetle", "Archive Beetle", "06-archive-beetle-rgba.png"),
    ("beacon-kite", "Beacon Kite", "07-beacon-kite-rgba.png"),
    ("prism-skimmer", "Prism Skimmer", "08-prism-skimmer-rgba.png"),
    ("ledger-hammer", "Ledger Hammer", "09-ledger-hammer-rgba.png"),
    ("nebula-tern", "Nebula Tern", "10-nebula-tern-rgba.png"),
)


def public_path(path: Path) -> str:
    return "/" + path.relative_to(ROOT / "public").as_posix()


def digest(image: Image.Image) -> str:
    return hashlib.sha256(image.tobytes()).hexdigest()


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("Mini-ship frame is fully transparent")
    return bbox


def split_strip(atlas: Image.Image) -> list[Image.Image]:
    """Split into equal visual thirds even when ImageGen used odd dimensions."""
    edges = [round(atlas.width * index / 3) for index in range(4)]
    return [
        atlas.crop((edges[index], 0, edges[index + 1], atlas.height))
        for index in range(3)
    ]


def normalize_frames(raw_frames: list[Image.Image]) -> list[Image.Image]:
    """Use one common scale and one center anchor for all three animation poses."""
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


def build_ship(ship_id: str, display_name: str, source_name: str) -> dict[str, object]:
    source_path = SOURCE_DIR / source_name
    if not source_path.exists():
        raise FileNotFoundError(source_path)

    raw_frames = split_strip(Image.open(source_path).convert("RGBA"))
    frames = normalize_frames(raw_frames)
    hashes = [digest(frame) for frame in frames]
    if len(set(hashes)) != 3:
        raise ValueError(f"{ship_id} contains duplicate animation frames")

    ship_dir = OUTPUT_DIR / ship_id
    frame_dir = ship_dir / "frames"
    frame_dir.mkdir(parents=True, exist_ok=True)
    frame_paths: list[Path] = []
    sheet = Image.new("RGBA", (CELL_SIZE * 3, CELL_SIZE), (0, 0, 0, 0))

    for index, (frame_id, frame) in enumerate(zip(FRAME_IDS, frames, strict=True), start=1):
        frame_path = frame_dir / f"{ship_id}-{index:02d}-{frame_id}.png"
        frame.save(frame_path, optimize=True)
        frame_paths.append(frame_path)
        sheet.alpha_composite(frame, ((index - 1) * CELL_SIZE, 0))

    sheet_path = ship_dir / f"{ship_id}-3-frame-sprite-sheet.png"
    gif_path = ship_dir / f"{ship_id}-idle-preview.gif"
    sheet.save(sheet_path, optimize=True)
    save_preview_gif(frames, gif_path)

    return {
        "id": ship_id,
        "name": display_name,
        "source": f"tools/imagegen-sources/scicon-mini-squadron-pack-v1/{source_name}",
        "frames": [public_path(path) for path in frame_paths],
        "frameHashes": dict(zip(FRAME_IDS, hashes, strict=True)),
        "sheet": public_path(sheet_path),
        "previewGif": public_path(gif_path),
    }


def write_readme() -> None:
    (OUTPUT_DIR / "README.md").write_text(
        """# Scicon Mini Squadron Pack v1

Ten original miniature companion ships for squad-selection and escort UI.

Each ship includes three transparent 256x256 PNG frames, a 768x256 horizontal
sprite sheet, and a ping-pong GIF preview. Frame order is `neutral`, `flex-in`,
`flex-out`. The hull stays centered and fixed; only small side mechanisms and
core lighting change. Runtime animation should use the PNG frames, not the GIF.
""",
        encoding="utf-8",
    )


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    ships = [build_ship(*ship) for ship in SHIPS]

    master = Image.new("RGBA", (CELL_SIZE * 3, CELL_SIZE * len(ships)), (0, 0, 0, 0))
    for row, ship in enumerate(ships):
        sheet_path = ROOT / "public" / str(ship["sheet"]).lstrip("/")
        master.alpha_composite(Image.open(sheet_path).convert("RGBA"), (0, row * CELL_SIZE))
    master_path = OUTPUT_DIR / "scicon-mini-squadron-master-3x10.png"
    master.save(master_path, optimize=True)

    manifest = {
        "id": "scicon-mini-squadron-pack-v1",
        "version": 1,
        "generated": date.today().isoformat(),
        "sourceMode": "OpenAI built-in image generation with chroma-key removal",
        "productionFormat": "Three-frame transparent PNG sprite sheets",
        "frame": {"width": CELL_SIZE, "height": CELL_SIZE},
        "frameOrder": list(FRAME_IDS),
        "animation": {
            "sequence": [FRAME_IDS[index] for index in GIF_SEQUENCE],
            "durationsMs": list(GIF_DURATIONS_MS),
            "loop": True,
            "protocol": "Animate PNG frames in runtime; GIF is gallery preview only.",
            "invariant": "Hull center and scale remain fixed; only side mechanisms and core light change.",
        },
        "masterSheet": public_path(master_path),
        "masterSize": [master.width, master.height],
        "ships": ships,
    }
    (OUTPUT_DIR / "pack-manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n",
        encoding="utf-8",
    )
    write_readme()
    print(f"Built {len(ships)} mini-ship animation sheets in {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
