"""Split an evenly spaced sprite sheet into numbered frame PNGs."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--columns", required=True, type=int)
    parser.add_argument("--rows", required=True, type=int)
    parser.add_argument("--prefix", default="frame-")
    parser.add_argument("--start", default=1, type=int)
    args = parser.parse_args()

    if args.columns < 1 or args.rows < 1:
        raise ValueError("rows and columns must be positive")

    sheet = Image.open(args.input).convert("RGBA")
    if sheet.width % args.columns or sheet.height % args.rows:
        raise ValueError(
            f"Sheet size {sheet.size} is not divisible by "
            f"{args.columns} columns and {args.rows} rows"
        )

    frame_width = sheet.width // args.columns
    frame_height = sheet.height // args.rows
    args.output_dir.mkdir(parents=True, exist_ok=True)

    frame_number = args.start
    for row in range(args.rows):
        for column in range(args.columns):
            box = (
                column * frame_width,
                row * frame_height,
                (column + 1) * frame_width,
                (row + 1) * frame_height,
            )
            frame = sheet.crop(box)
            frame.save(
                args.output_dir / f"{args.prefix}{frame_number:02d}.png",
                optimize=True,
            )
            frame_number += 1


if __name__ == "__main__":
    main()
