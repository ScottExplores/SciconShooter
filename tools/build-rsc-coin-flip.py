#!/usr/bin/env python3
"""Build upright vertical-axis RSC coin-flip frames from the generated pixel face."""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageEnhance, ImageOps


PROJECT_ROOT = Path(__file__).resolve().parents[1]
PACK_ROOT = PROJECT_ROOT / "public" / "game-art" / "generated" / "rsc-coin-flip-v1"
SOURCE = PACK_ROOT / "rsc-coin-pixel-front.png"
THREE_QUARTER_SOURCE = PACK_ROOT / "rsc-coin-three-quarter-right.png"
FRAMES_ROOT = PACK_ROOT / "frames"
PREVIEWS_ROOT = PACK_ROOT / "previews"
FRAME_SIZE = 128
COIN_SIZE = 108
ANGLES = tuple(range(0, 360, 30))


def prepare_front() -> Image.Image:
    source = Image.open(SOURCE).convert("RGBA")
    alpha_bbox = source.getchannel("A").getbbox()
    if not alpha_bbox:
        raise RuntimeError(f"No visible coin pixels found in {SOURCE}")
    source = source.crop(alpha_bbox)
    source.thumbnail((COIN_SIZE, COIN_SIZE), Image.Resampling.NEAREST)
    normalized = Image.new("RGBA", (COIN_SIZE, COIN_SIZE), (0, 0, 0, 0))
    normalized.alpha_composite(
        source,
        ((COIN_SIZE - source.width) // 2, (COIN_SIZE - source.height) // 2),
    )
    return normalized


def prepare_three_quarter() -> Image.Image:
    source = Image.open(THREE_QUARTER_SOURCE).convert("RGBA")
    alpha_bbox = source.getchannel("A").getbbox()
    if not alpha_bbox:
        raise RuntimeError(f"No visible three-quarter coin pixels found in {THREE_QUARTER_SOURCE}")
    source = source.crop(alpha_bbox)
    source.thumbnail((116, COIN_SIZE), Image.Resampling.NEAREST)
    return source


def colorize_alpha(alpha: Image.Image, color: tuple[int, int, int, int]) -> Image.Image:
    layer = Image.new("RGBA", alpha.size, color)
    layer.putalpha(alpha)
    return layer


def build_frame(front: Image.Image, three_quarter: Image.Image, angle: int) -> Image.Image:
    radians = math.radians(angle)
    facing = math.cos(radians)

    # Use the generated solid three-quarter key art while the front/back face
    # is visible. This preserves a real rear rim and milled side wall rather
    # than making the animation look like a flat image being squeezed.
    three_quarter_angles = {30, 60, 120, 150, 210, 240, 300, 330}
    if angle in three_quarter_angles:
        keyframe = three_quarter
        if angle in {120, 150, 300, 330}:
            keyframe = ImageOps.mirror(keyframe)
        if angle in {60, 120, 240, 300}:
            keyframe = keyframe.resize(
                (max(18, int(round(keyframe.width * 0.66))), keyframe.height),
                Image.Resampling.NEAREST,
            )
        frame = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
        frame.alpha_composite(
            keyframe,
            ((FRAME_SIZE - keyframe.width) // 2, (FRAME_SIZE - keyframe.height) // 2),
        )
        return frame

    face = front if facing >= 0 else ImageOps.mirror(front)
    width = max(14, int(round(abs(facing) * COIN_SIZE)))
    compressed = face.resize((width, COIN_SIZE), Image.Resampling.NEAREST)

    # A dark amber silhouette offset behind the face supplies visible coin thickness.
    side_alpha = compressed.getchannel("A")
    side = colorize_alpha(side_alpha, (132, 67, 5, 255))
    side = ImageEnhance.Brightness(side).enhance(0.94)
    direction = 1 if math.sin(radians) >= 0 else -1
    thickness = max(2, int(round(7 * abs(math.sin(radians)))))
    center_x = (FRAME_SIZE - width) // 2
    center_y = (FRAME_SIZE - COIN_SIZE) // 2

    frame = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
    frame.alpha_composite(side, (center_x + direction * thickness, center_y))

    # At the two edge-on frames, show the milled golden edge instead of a crushed logo.
    if width <= 14:
        edge = Image.new("RGBA", (14, COIN_SIZE), (0, 0, 0, 0))
        pixels = edge.load()
        for y in range(COIN_SIZE):
            inset = 4 if y < 5 or y >= COIN_SIZE - 5 else 0
            for x in range(inset, 14 - inset):
                if x < 3:
                    color = (91, 45, 3, 255)
                elif x < 7:
                    color = (198, 111, 4, 255)
                elif x < 11:
                    color = (255, 202, 29, 255)
                else:
                    color = (126, 62, 4, 255)
                if (y // 8) % 2 and 3 <= x < 11:
                    color = (229, 143, 5, 255)
                pixels[x, y] = color
        frame.alpha_composite(edge, ((FRAME_SIZE - edge.width) // 2, center_y))
    else:
        # A one-pixel warm tint on the receding half helps the flip read as 3D.
        if abs(facing) < 0.72:
            tint = Image.new("RGBA", compressed.size, (240, 145, 0, 34))
            tint.putalpha(compressed.getchannel("A").point(lambda value: min(value, 34)))
            compressed = Image.alpha_composite(compressed, tint)
        frame.alpha_composite(compressed, (center_x, center_y))

    return frame


def save_gif(frames: list[Image.Image], destination: Path) -> None:
    key = (255, 0, 255)
    palette_source = Image.new("RGB", (FRAME_SIZE * 6, FRAME_SIZE * 2), key)
    for index, frame in enumerate(frames):
        background = Image.new("RGB", frame.size, key)
        background.paste(frame.convert("RGB"), mask=frame.getchannel("A"))
        palette_source.paste(background, ((index % 6) * FRAME_SIZE, (index // 6) * FRAME_SIZE))
    palette = palette_source.quantize(colors=255, method=Image.Quantize.FASTOCTREE)
    colors = palette.getpalette()
    transparency_index = min(
        range(255),
        key=lambda index: sum((colors[index * 3 + channel] - key[channel]) ** 2 for channel in range(3)),
    )

    gif_frames: list[Image.Image] = []
    for frame in frames:
        background = Image.new("RGB", frame.size, key)
        background.paste(frame.convert("RGB"), mask=frame.getchannel("A"))
        quantized = background.quantize(palette=palette)
        alpha = frame.getchannel("A")
        output = quantized.load()
        alpha_pixels = alpha.load()
        for y in range(FRAME_SIZE):
            for x in range(FRAME_SIZE):
                if alpha_pixels[x, y] < 128:
                    output[x, y] = transparency_index
        gif_frames.append(quantized)

    gif_frames[0].save(
        destination,
        save_all=True,
        append_images=gif_frames[1:],
        duration=80,
        loop=0,
        optimize=False,
        disposal=2,
        transparency=transparency_index,
    )


def main() -> None:
    FRAMES_ROOT.mkdir(parents=True, exist_ok=True)
    PREVIEWS_ROOT.mkdir(parents=True, exist_ok=True)
    front = prepare_front()
    three_quarter = prepare_three_quarter()
    front_canvas = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
    front_canvas.alpha_composite(
        front,
        ((FRAME_SIZE - front.width) // 2, (FRAME_SIZE - front.height) // 2),
    )
    front_canvas.save(PACK_ROOT / "rsc-coin-pixel-front-128.png")

    frames = [build_frame(front, three_quarter, angle) for angle in ANGLES]
    for index, (angle, frame) in enumerate(zip(ANGLES, frames), start=1):
        frame.save(FRAMES_ROOT / f"rsc-coin-flip-{index:02d}-{angle:03d}deg.png")

    sheet = Image.new("RGBA", (FRAME_SIZE * 6, FRAME_SIZE * 2), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        sheet.alpha_composite(frame, ((index % 6) * FRAME_SIZE, (index // 6) * FRAME_SIZE))
    sheet.save(PACK_ROOT / "rsc-coin-flip-spritesheet-6x2.png")
    save_gif(frames, PREVIEWS_ROOT / "rsc-coin-upright-flip-preview.gif")

    print(f"Built {len(frames)} upright flip frames in {PACK_ROOT}")


if __name__ == "__main__":
    main()
