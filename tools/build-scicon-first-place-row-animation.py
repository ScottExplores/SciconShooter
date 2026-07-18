#!/usr/bin/env python3
"""Build the component-driven first-place leaderboard idle animation.

The original row stays registered at its native size. Generated semi-pixel
mechanical parts replace the two side cores, crown crystal, and selected rail
lamps so the motion comes from real sprite components instead of a full-row
lighting overlay. The GIF is a gallery preview; runtime uses the PNG parts and
the animation manifest.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

from PIL import Image, ImageChops, ImageEnhance


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "game-art" / "generated" / "ui" / "scicon-ui-system-v2" / "base" / "leaderboard-podium" / "first-place-row.png"
OUT = ROOT / "public" / "game-art" / "generated" / "ui" / "scicon-ui-system-v2" / "animations" / "first-place-row-idle"
ATLAS = OUT / "parts" / "first-place-generated-components-atlas.png"
CORE_CENTERS = ((127, 159), (665, 159))
CROWN_DIAMOND_POS = (376, 24)
CROWN_DIAMOND_SIZE = (34, 62)
LOOP_FRAMES = 48
FRAME_MS = 80

# Small physical lamp sockets on the upper and lower rails. Each position gets
# an actual generated lamp-state sprite; the blank center remains available for
# live leaderboard text.
TOP_LAMPS = ((167, 88), (224, 88), (281, 88), (443, 88), (500, 88), (557, 88))
BOTTOM_LAMPS = ((177, 229), (234, 229), (291, 229), (433, 229), (490, 229), (547, 229))


def load_rgba(path: Path) -> Image.Image:
    with Image.open(path) as image:
        return image.convert("RGBA")


def crop_component(atlas: Image.Image, box: tuple[int, int, int, int], size: tuple[int, int]) -> Image.Image:
    component = atlas.crop(box)
    bbox = component.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError(f"Atlas crop {box} contains no visible pixels")
    component = component.crop(bbox)
    return component.resize(size, Image.Resampling.NEAREST)


def circular_alpha(source: Image.Image) -> Image.Image:
    mask = Image.new("L", source.size, 0)
    from PIL import ImageDraw

    draw = ImageDraw.Draw(mask)
    draw.ellipse((1, 1, source.width - 2, source.height - 2), fill=255)
    result = source.copy()
    result.putalpha(ImageChops.multiply(result.getchannel("A"), mask))
    return result


def alpha_scaled(source: Image.Image, strength: float) -> Image.Image:
    strength = max(0.0, min(1.0, strength))
    result = source.copy()
    result.putalpha(result.getchannel("A").point(lambda value: round(value * strength)))
    return result


def extract_parts(atlas: Image.Image) -> dict[str, Image.Image | list[Image.Image]]:
    # The atlas is a deliberately separated chroma-key component sheet created
    # from the exact row as its visual reference.
    turbine = crop_component(atlas, (70, 45, 470, 445), (82, 82))
    rotor = circular_alpha(turbine.crop((15, 15, 67, 67)))

    diamond_boxes = (
        (585, 90, 760, 350),
        (890, 90, 1070, 350),
        (1205, 88, 1385, 350),
        (1500, 80, 1700, 355),
    )
    diamonds = [crop_component(atlas, box, CROWN_DIAMOND_SIZE) for box in diamond_boxes]

    lamp_boxes = (
        (445, 455, 600, 530),
        (635, 455, 795, 530),
        (825, 455, 990, 530),
        (1025, 455, 1188, 530),
        (1225, 455, 1390, 530),
        (1415, 455, 1585, 530),
    )
    lamps = [crop_component(atlas, box, (34, 10)) for box in lamp_boxes]

    pixel_spark = crop_component(atlas, (1240, 600, 1375, 720), (32, 32))
    gold_pixels = crop_component(atlas, (915, 600, 1075, 720), (44, 30))
    short_beam = crop_component(atlas, (945, 700, 1090, 795), (54, 10))
    medium_beam = crop_component(atlas, (1110, 700, 1285, 795), (72, 10))

    return {
        "turbine": turbine,
        "rotor": rotor,
        "diamonds": diamonds,
        "lamps": lamps,
        "pixelSpark": pixel_spark,
        "goldPixels": gold_pixels,
        "shortBeam": short_beam,
        "mediumBeam": medium_beam,
    }


def save_parts(parts: dict[str, Image.Image | list[Image.Image]], directory: Path) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    filenames = {
        "turbine": "first-place-turbine-housing.png",
        "rotor": "first-place-turbine-blades.png",
        "pixelSpark": "first-place-pixel-spark.png",
        "goldPixels": "first-place-gold-pixels.png",
        "shortBeam": "first-place-short-pixel-beam.png",
        "mediumBeam": "first-place-medium-pixel-beam.png",
    }
    for name, filename in filenames.items():
        image = parts[name]
        assert isinstance(image, Image.Image)
        image.save(directory / filename, optimize=True)
    for index, image in enumerate(parts["diamonds"]):
        image.save(directory / f"first-place-crown-diamond-{index}.png", optimize=True)
    for index, image in enumerate(parts["lamps"]):
        image.save(directory / f"first-place-rail-lamp-{index}.png", optimize=True)


def paste_center(destination: Image.Image, sprite: Image.Image, center: tuple[int, int]) -> None:
    destination.alpha_composite(sprite, (center[0] - sprite.width // 2, center[1] - sprite.height // 2))


def render_frame(base: Image.Image, parts: dict[str, Image.Image | list[Image.Image]], index: int) -> Image.Image:
    frame = base.copy()
    phase = index / LOOP_FRAMES * math.tau

    turbine = parts["turbine"]
    rotor = parts["rotor"]
    assert isinstance(turbine, Image.Image) and isinstance(rotor, Image.Image)

    # Replace the original core faces with physical turbine assemblies. The
    # outer housing remains locked while only the inner blade disk rotates.
    for side, center in enumerate(CORE_CENTERS):
        paste_center(frame, turbine, center)
        angle = index / LOOP_FRAMES * (360 if side == 0 else -360)
        rotated = rotor.rotate(angle, resample=Image.Resampling.BICUBIC, expand=False)
        rotor_breath = 0.92 + 0.08 * (0.5 + 0.5 * math.sin(phase * 2 + side * math.pi))
        rotated = ImageEnhance.Brightness(rotated).enhance(rotor_breath)
        paste_center(frame, rotated, center)

    # Swap among four separately drawn energy states. The diamond remains in
    # one registered position; its internal pixels and facets are what change.
    diamond_cycle = (0, 0, 1, 1, 2, 3, 3, 2, 1, 1, 0, 0)
    diamond_index = diamond_cycle[(index * len(diamond_cycle) // LOOP_FRAMES) % len(diamond_cycle)]
    diamond = parts["diamonds"][diamond_index]
    frame.alpha_composite(diamond, CROWN_DIAMOND_POS)

    # Individual lamp modules illuminate in a staggered breathing/chase rhythm.
    lamps = parts["lamps"]
    for row_index, positions in enumerate((TOP_LAMPS, BOTTOM_LAMPS)):
        for lamp_index, position in enumerate(positions):
            wave = 0.5 + 0.5 * math.sin(phase * 2 + lamp_index * 0.82 + row_index * 1.7)
            state = min(5, max(0, int(wave * 5.99)))
            frame.alpha_composite(lamps[state], position)

    # Short pixel-energy packets fire only between nearby rail sockets. They
    # read as mechanical energy transfer, not a full-row overlay sweep.
    short_beam = parts["shortBeam"]
    medium_beam = parts["mediumBeam"]
    assert isinstance(short_beam, Image.Image) and isinstance(medium_beam, Image.Image)
    packet = (index * 8 // LOOP_FRAMES) % 8
    packet_strength = math.sin((index % 6) / 5 * math.pi) ** 2
    beam = short_beam if packet % 2 == 0 else medium_beam
    beam_positions = ((195, 88), (253, 88), (470, 88), (528, 88), (205, 229), (263, 229), (460, 229), (518, 229))
    frame.alpha_composite(alpha_scaled(beam, packet_strength), beam_positions[packet])

    # A sparse block-pixel discharge accompanies the crown's strongest state.
    if diamond_index == 3:
        spark = parts["pixelSpark"]
        gold = parts["goldPixels"]
        assert isinstance(spark, Image.Image) and isinstance(gold, Image.Image)
        strength = math.sin(phase * 4) ** 2
        frame.alpha_composite(alpha_scaled(spark, strength), (414, 20))
        frame.alpha_composite(alpha_scaled(gold, strength * 0.72), (328, 37))

    return frame


def gif_frame(source: Image.Image) -> Image.Image:
    alpha = source.getchannel("A")
    quantized = source.convert("RGB").quantize(colors=255, method=Image.Quantize.MEDIANCUT)
    transparent = alpha.point(lambda value: 255 if value <= 12 else 0)
    quantized.paste(255, mask=transparent)
    quantized.info["transparency"] = 255
    quantized.info["disposal"] = 2
    return quantized


def save_sequence(frames: list[Image.Image], path: Path) -> None:
    picks = (0, 8, 16, 24, 32, 40)
    thumb_size = (564, 230)
    sheet = Image.new("RGB", (thumb_size[0] * len(picks), thumb_size[1]), "#050a18")
    for column, frame_index in enumerate(picks):
        thumb = frames[frame_index].resize(thumb_size, Image.Resampling.LANCZOS)
        sheet.paste(thumb, (column * thumb_size[0], 0), thumb)
    sheet.save(path, optimize=True)


def write_manifest(path: Path, source: Image.Image) -> None:
    manifest = {
        "id": "scicon-first-place-row-component-idle-v2",
        "displayName": "Scicon First Place Row Living Machinery Idle",
        "source": "../../base/leaderboard-podium/first-place-row.png",
        "productionFormat": "fixed-base-plus-registered-component-sprites",
        "previewFormat": "animated-gif",
        "registeredSize": [source.width, source.height],
        "anchor": [0.5, 0.5],
        "durationMs": LOOP_FRAMES * FRAME_MS,
        "loop": True,
        "parts": {
            "turbineHousing": {"path": "parts/first-place-turbine-housing.png", "displaySize": [82, 82]},
            "turbineBlades": {"path": "parts/first-place-turbine-blades.png", "displaySize": [52, 52]},
            "crownDiamondStates": {"pathPattern": "parts/first-place-crown-diamond-{state}.png", "states": 4, "displaySize": list(CROWN_DIAMOND_SIZE)},
            "railLampStates": {"pathPattern": "parts/first-place-rail-lamp-{state}.png", "states": 6, "displaySize": [34, 10]},
            "shortPixelBeam": {"path": "parts/first-place-short-pixel-beam.png", "displaySize": [54, 10]},
            "mediumPixelBeam": {"path": "parts/first-place-medium-pixel-beam.png", "displaySize": [72, 10]},
            "crownPixelSpark": {"path": "parts/first-place-pixel-spark.png", "displaySize": [32, 32]},
            "crownGoldPixels": {"path": "parts/first-place-gold-pixels.png", "displaySize": [44, 30]},
        },
        "componentMotion": {
            "sideTurbines": {"positions": [list(center) for center in CORE_CENTERS], "leftDegrees": 360, "rightDegrees": -360, "outerHousingFixed": True},
            "crownDiamond": {"position": list(CROWN_DIAMOND_POS), "states": 4, "mode": "registered-frame-swap"},
            "railLamps": {"topPositions": [list(position) for position in TOP_LAMPS], "bottomPositions": [list(position) for position in BOTTOM_LAMPS], "states": 6, "mode": "staggered-frame-swap"},
            "pixelEnergyPackets": {"count": 8, "mode": "short-local-bursts-between-lamps"},
            "crownPixelDischarge": {"trigger": "diamond-state-3", "mode": "sparse-block-pixels"},
        },
        "runtimeNotes": [
            f"Keep the original {source.width} x {source.height} row registration fixed; never translate, rotate, or rescale the complete row.",
            "This is a component animation, not a full-row overlay: rotate the turbine blade sprites, swap the diamond and lamp PNG states, and show only short local pixel-energy packets.",
            "Keep rank, player name, score, reward, and other row values as live UI above the blank center.",
            "The GIF and sequence PNG are gallery previews only; runtime consumes the registered PNG component parts.",
            "Reduced motion uses the untouched base row with the dim diamond and dim lamp states.",
        ],
        "audio": {"status": "silent-idle", "implementation": "Use a restrained champion arrival cue only when first place is awarded; do not loop turbine or electrical audio."},
    }
    path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def build() -> None:
    parts_dir = OUT / "parts"
    previews = OUT / "previews"
    previews.mkdir(parents=True, exist_ok=True)
    if not ATLAS.exists():
        raise FileNotFoundError(f"Missing generated component atlas: {ATLAS}")

    base = load_rgba(SOURCE)
    atlas = load_rgba(ATLAS)
    parts = extract_parts(atlas)
    save_parts(parts, parts_dir)
    frames = [render_frame(base, parts, index) for index in range(LOOP_FRAMES)]

    gif_frames = [gif_frame(frame) for frame in frames]
    gif_path = previews / "first-place-row-living-machinery-idle.gif"
    gif_frames[0].save(gif_path, save_all=True, append_images=gif_frames[1:], duration=FRAME_MS, loop=0, transparency=255, disposal=2, optimize=False)
    frames[15].save(previews / "first-place-row-living-machinery-final.png", optimize=True)
    save_sequence(frames, previews / "first-place-row-living-machinery-sequence.png")
    write_manifest(OUT / "animation-manifest.json", base)
    (OUT / "README.md").write_text(
        "# First Place Row Living Machinery Idle\n\n"
        "A true registered component animation: two physical turbine blade disks rotate, the crown diamond swaps among four generated energy states, twelve rail lamps swap among six illumination states, and short block-pixel energy packets fire locally between sockets. The complete row never moves. Use the GIF only as a gallery preview.\n",
        encoding="utf-8",
    )
    print(f"Built {LOOP_FRAMES} component-driven frames at {source_size(base)}")
    print(gif_path)


def source_size(image: Image.Image) -> str:
    return f"{image.width}x{image.height}"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    build()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
