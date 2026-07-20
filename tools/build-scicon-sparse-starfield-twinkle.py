from __future__ import annotations

import math
from collections import deque
from pathlib import Path

from PIL import Image, ImageChops, ImageEnhance, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
PACK = ROOT / "public" / "game-art" / "generated" / "backgrounds" / "scicon-sparse-pixel-starfield-v1"
SOURCE = PACK / "scicon-sparse-pixel-starfield-v1.png"
FRAMES = PACK / "twinkle-frames"
GIF = PACK / "scicon-sparse-pixel-starfield-twinkle.gif"
SHEET = PACK / "scicon-sparse-pixel-starfield-twinkle-sheet.png"

FRAME_COUNT = 8
FRAME_DURATION_MS = 150


def star_components(image: Image.Image) -> list[tuple[int, int, int, int]]:
    rgb = image.convert("RGB")
    pixels = rgb.load()
    width, height = rgb.size

    # The generated background is intentionally dark. This threshold isolates
    # the small colored stars while leaving the low-contrast nebula untouched.
    seed = Image.new("L", rgb.size, 0)
    seed_pixels = seed.load()
    for y in range(height):
        for x in range(width):
            red, green, blue = pixels[x, y]
            if max(red, green, blue) >= 92 and red + green + blue >= 155:
                seed_pixels[x, y] = 255

    grouped = seed.filter(ImageFilter.MaxFilter(7))
    grouped_pixels = grouped.load()
    visited = bytearray(width * height)
    boxes: list[tuple[int, int, int, int]] = []

    for y in range(height):
        for x in range(width):
            index = y * width + x
            if visited[index] or grouped_pixels[x, y] == 0:
                continue

            queue = deque([(x, y)])
            visited[index] = 1
            min_x = max_x = x
            min_y = max_y = y
            count = 0

            while queue:
                current_x, current_y = queue.popleft()
                count += 1
                min_x = min(min_x, current_x)
                max_x = max(max_x, current_x)
                min_y = min(min_y, current_y)
                max_y = max(max_y, current_y)
                for next_x, next_y in (
                    (current_x - 1, current_y),
                    (current_x + 1, current_y),
                    (current_x, current_y - 1),
                    (current_x, current_y + 1),
                ):
                    if not (0 <= next_x < width and 0 <= next_y < height):
                        continue
                    next_index = next_y * width + next_x
                    if visited[next_index] or grouped_pixels[next_x, next_y] == 0:
                        continue
                    visited[next_index] = 1
                    queue.append((next_x, next_y))

            box_width = max_x - min_x + 1
            box_height = max_y - min_y + 1
            if count <= 260 and box_width <= 24 and box_height <= 24:
                boxes.append((max(0, min_x - 2), max(0, min_y - 2), min(width, max_x + 3), min(height, max_y + 3)))

    return boxes


def build_frame(source: Image.Image, stars: list[tuple[int, int, int, int]], frame_index: int) -> Image.Image:
    frame = source.copy()

    for star_index, box in enumerate(stars):
        left, top, right, bottom = box
        crop = source.crop(box)
        luminance = crop.convert("L")
        mask = luminance.point(lambda value: max(0, min(255, (value - 34) * 5)))

        phase = ((star_index * 5) + ((left + top) % FRAME_COUNT)) % FRAME_COUNT
        wave = math.sin(((frame_index + phase) / FRAME_COUNT) * math.tau)
        strength = 1.0 + (0.14 * wave)
        adjusted = ImageEnhance.Brightness(crop).enhance(strength)
        frame.paste(adjusted, box, mask)

        # A few larger stars receive a single-pixel cross at peak brightness.
        # This stays staggered and never affects the surrounding background.
        if wave > 0.84 and (right - left >= 8 or bottom - top >= 8):
            star_mask = mask.filter(ImageFilter.MaxFilter(3)).point(lambda value: min(72, value // 3))
            lifted = ImageEnhance.Brightness(crop).enhance(1.18)
            frame.paste(lifted, box, star_mask)

    return frame


def main() -> None:
    if not SOURCE.exists():
        raise FileNotFoundError(SOURCE)

    FRAMES.mkdir(parents=True, exist_ok=True)
    source = Image.open(SOURCE).convert("RGBA")
    stars = star_components(source)
    if len(stars) < 20:
        raise RuntimeError(f"Expected at least 20 isolated stars; found {len(stars)}")

    frames = [build_frame(source, stars, index) for index in range(FRAME_COUNT)]
    for index, frame in enumerate(frames, start=1):
        frame.save(FRAMES / f"scicon-sparse-pixel-starfield-twinkle-{index:02d}.png", optimize=True)

    frames[0].save(
        GIF,
        save_all=True,
        append_images=frames[1:],
        duration=FRAME_DURATION_MS,
        loop=0,
        disposal=1,
        optimize=False,
    )

    sheet = Image.new("RGBA", (source.width * FRAME_COUNT, source.height), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        sheet.paste(frame, (index * source.width, 0))
    sheet.save(SHEET, optimize=True)

    print(
        {
            "source": str(SOURCE),
            "stars": len(stars),
            "frames": FRAME_COUNT,
            "durationMs": FRAME_DURATION_MS,
            "gif": str(GIF),
            "sheet": str(SHEET),
        }
    )


if __name__ == "__main__":
    main()
