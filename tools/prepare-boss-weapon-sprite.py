"""Crop, scale, and mirror a transparent boss-weapon sprite onto game-ready canvases."""

from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

from PIL import Image


def parse_canvas(value: str) -> tuple[int, int]:
    try:
        width, height = (int(part) for part in value.lower().split("x", 1))
    except (TypeError, ValueError) as exc:
        raise argparse.ArgumentTypeError("canvas must look like 256x320") from exc
    if width < 1 or height < 1:
        raise argparse.ArgumentTypeError("canvas dimensions must be positive")
    return width, height


def keep_largest_component(image: Image.Image) -> Image.Image:
    """Remove disconnected generation debris while preserving the main sprite."""
    alpha = image.getchannel("A")
    pixels = alpha.load()
    width, height = image.size
    visited = bytearray(width * height)
    largest: list[tuple[int, int]] = []

    for y in range(height):
        for x in range(width):
            index = y * width + x
            if visited[index] or pixels[x, y] == 0:
                continue
            visited[index] = 1
            queue = deque([(x, y)])
            component: list[tuple[int, int]] = []
            while queue:
                current_x, current_y = queue.popleft()
                component.append((current_x, current_y))
                for next_x, next_y in (
                    (current_x - 1, current_y),
                    (current_x + 1, current_y),
                    (current_x, current_y - 1),
                    (current_x, current_y + 1),
                ):
                    if not (0 <= next_x < width and 0 <= next_y < height):
                        continue
                    next_index = next_y * width + next_x
                    if visited[next_index] or pixels[next_x, next_y] == 0:
                        continue
                    visited[next_index] = 1
                    queue.append((next_x, next_y))
            if len(component) > len(largest):
                largest = component

    if not largest:
        return image
    keep = Image.new("L", image.size, 0)
    keep_pixels = keep.load()
    for x, y in largest:
        keep_pixels[x, y] = pixels[x, y]
    cleaned = image.copy()
    cleaned.putalpha(keep)
    return cleaned


def prepare(
    source: Path,
    canvas_size: tuple[int, int],
    padding: int,
    largest_component: bool,
) -> Image.Image:
    image = Image.open(source).convert("RGBA")
    if largest_component:
        image = keep_largest_component(image)
    alpha_box = image.getchannel("A").getbbox()
    if alpha_box is None:
        raise ValueError(f"No visible pixels found in {source}")

    image = image.crop(alpha_box)
    max_width = canvas_size[0] - 2 * padding
    max_height = canvas_size[1] - 2 * padding
    scale = min(max_width / image.width, max_height / image.height, 1.0)
    new_size = (
        max(1, round(image.width * scale)),
        max(1, round(image.height * scale)),
    )
    if new_size != image.size:
        image = image.resize(new_size, Image.Resampling.NEAREST)

    canvas = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
    position = (
        (canvas_size[0] - image.width) // 2,
        (canvas_size[1] - image.height) // 2,
    )
    canvas.alpha_composite(image, position)
    return canvas


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output-right", required=True, type=Path)
    parser.add_argument("--output-left", type=Path)
    parser.add_argument("--canvas", default="256x320", type=parse_canvas)
    parser.add_argument("--padding", default=8, type=int)
    parser.add_argument("--largest-component", action="store_true")
    args = parser.parse_args()

    right = prepare(
        args.input,
        args.canvas,
        args.padding,
        args.largest_component,
    )
    args.output_right.parent.mkdir(parents=True, exist_ok=True)
    right.save(args.output_right, optimize=True)
    if args.output_left:
        left = right.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        args.output_left.parent.mkdir(parents=True, exist_ok=True)
        left.save(args.output_left, optimize=True)


if __name__ == "__main__":
    main()
