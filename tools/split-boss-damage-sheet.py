"""Normalize a horizontal boss damage sheet into aligned transparent frames."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int] | None:
    return image.getchannel("A").getbbox()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--out-dir", required=True, type=Path)
    parser.add_argument("--frames", type=int, default=5)
    parser.add_argument("--width", type=int, default=512)
    parser.add_argument("--height", type=int, default=640)
    parser.add_argument("--margin", type=int, default=24)
    args = parser.parse_args()

    sheet = Image.open(args.input).convert("RGBA")
    frame_bounds = [
        (round(index * sheet.width / args.frames), round((index + 1) * sheet.width / args.frames))
        for index in range(args.frames)
    ]
    crops: list[Image.Image] = []
    boxes: list[tuple[int, int, int, int]] = []
    for left, right in frame_bounds:
        frame = sheet.crop((left, 0, right, sheet.height))
        bounds = alpha_bbox(frame)
        if bounds is None:
            raise ValueError(f"No visible sprite found between x={left} and x={right}")
        crops.append(frame.crop(bounds))
        boxes.append(bounds)

    max_width = max(crop.width for crop in crops)
    max_height = max(crop.height for crop in crops)
    scale = min(
        (args.width - args.margin * 2) / max_width,
        (args.height - args.margin * 2) / max_height,
    )

    args.out_dir.mkdir(parents=True, exist_ok=True)
    for index, crop in enumerate(crops, start=1):
        size = (max(1, round(crop.width * scale)), max(1, round(crop.height * scale)))
        resized = crop.resize(size, Image.Resampling.NEAREST)
        output = Image.new("RGBA", (args.width, args.height), (0, 0, 0, 0))
        x = (args.width - resized.width) // 2
        y = args.height - args.margin - resized.height
        output.alpha_composite(resized, (x, y))
        output.save(args.out_dir / f"frame-{index}.png", optimize=True)


if __name__ == "__main__":
    main()
