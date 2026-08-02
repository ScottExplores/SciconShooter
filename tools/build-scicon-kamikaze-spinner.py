from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = (
    ROOT
    / "tools"
    / "imagegen-sources"
    / "scicon-kamikaze-spinner-v1"
    / "kamikaze-spinner-sheet-alpha.png"
)
OUTPUT = (
    ROOT
    / "public"
    / "game-art"
    / "generated"
    / "scicon-kamikaze-spinner-v1"
    / "enemies"
    / "kamikaze-spinner"
)

STATES = (
    "forward-dive",
    "front-three-quarter-right",
    "right-profile",
    "rear",
    "left-profile",
    "front-three-quarter-left",
)
SOURCE_COLUMNS = 3
SOURCE_ROWS = 2
PREVIEW_SIZE = 192


def split_cells(sheet: Image.Image) -> list[Image.Image]:
    if sheet.width % SOURCE_COLUMNS or sheet.height % SOURCE_ROWS:
        raise ValueError(
            f"Source size {sheet.size} is not divisible by "
            f"{SOURCE_COLUMNS} columns and {SOURCE_ROWS} rows"
        )

    frame_width = sheet.width // SOURCE_COLUMNS
    frame_height = sheet.height // SOURCE_ROWS
    frames: list[Image.Image] = []
    for row in range(SOURCE_ROWS):
        for column in range(SOURCE_COLUMNS):
            frames.append(
                sheet.crop(
                    (
                        column * frame_width,
                        row * frame_height,
                        (column + 1) * frame_width,
                        (row + 1) * frame_height,
                    )
                )
            )
    return frames


def recenter(frame: Image.Image) -> Image.Image:
    bbox = frame.getchannel("A").getbbox()
    if not bbox:
        raise ValueError("Generated frame is fully transparent")
    subject = frame.crop(bbox)
    centered = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    centered.alpha_composite(
        subject,
        (
            (frame.width - subject.width) // 2,
            (frame.height - subject.height) // 2,
        ),
    )
    return centered


def preview_frame(frame: Image.Image) -> Image.Image:
    background = Image.new("RGBA", (PREVIEW_SIZE, PREVIEW_SIZE), (2, 10, 24, 255))
    sprite = frame.resize((PREVIEW_SIZE, PREVIEW_SIZE), Image.Resampling.NEAREST)
    background.alpha_composite(sprite)
    return background.convert("P", palette=Image.Palette.ADAPTIVE)


def public_url(path: Path) -> str:
    return "/" + path.relative_to(ROOT / "public").as_posix()


def build() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    frames = [recenter(frame) for frame in split_cells(source)]
    if len(frames) != len(STATES):
        raise ValueError(f"Expected {len(STATES)} frames, found {len(frames)}")

    frames_dir = OUTPUT / "frames"
    preview_dir = OUTPUT / "previews"
    frames_dir.mkdir(parents=True, exist_ok=True)
    preview_dir.mkdir(parents=True, exist_ok=True)

    frame_paths: list[Path] = []
    for index, (state, frame) in enumerate(zip(STATES, frames), start=1):
        path = frames_dir / f"kamikaze-spinner-{index:02d}-{state}.png"
        frame.save(path, optimize=True)
        frame_paths.append(path)

    frame_width, frame_height = frames[0].size
    sheet = Image.new(
        "RGBA",
        (frame_width * SOURCE_COLUMNS, frame_height * SOURCE_ROWS),
        (0, 0, 0, 0),
    )
    for index, frame in enumerate(frames):
        sheet.alpha_composite(
            frame,
            ((index % SOURCE_COLUMNS) * frame_width, (index // SOURCE_COLUMNS) * frame_height),
        )
    sheet_path = OUTPUT / "kamikaze-spinner-sprite-sheet.png"
    sheet.save(sheet_path, optimize=True)

    preview_frames = [preview_frame(frame) for frame in frames]
    preview_path = preview_dir / "kamikaze-spinner-animation-preview.gif"
    preview_frames[0].save(
        preview_path,
        save_all=True,
        append_images=preview_frames[1:],
        duration=110,
        loop=0,
        disposal=2,
        optimize=False,
    )

    manifest = {
        "id": "kamikaze-spinner",
        "title": "Kamikaze Spinner",
        "version": 1,
        "states": list(STATES),
        "forwardDiveFrame": public_url(frame_paths[0]),
        "spinLoopFrames": [public_url(path) for path in frame_paths],
        "sheet": public_url(sheet_path),
        "previewGif": public_url(preview_path),
        "fps": 9,
        "productionNote": "Hold frame 1 during committed dives; loop all six frames while assembled or traveling.",
    }
    (OUTPUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    build()
