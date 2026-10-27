"""Rebuild the 1200x630 social card on the existing space plate.

The ships are the game sprites (NIH v2 and the Bitcoin ship), scaled with
nearest-neighbor. The title and background stay from public/preview-dsci-v2.png.
"""

from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "preview-dsci-v2.png"
NIH_PATH = ROOT / "public" / "game-art" / "branding" / "nih-ship.png"
BTC_PATH = (
    ROOT
    / "public"
    / "game-art"
    / "generated"
    / "scicon-flight-motion-pack-v1"
    / "ships"
    / "btc-token-ship"
    / "frames"
    / "btc-token-ship-03-neutral.png"
)
FONT_PATH = ROOT / "public" / "fonts" / "orbitron-latin.woff2"
OUT_DIR = ROOT / "public" / "social"
EVENT_NAME = "scicon-share-25k.png"
BASE_NAME = "scicon-share.png"

WIDTH = 1200
HEIGHT = 630
# X draws a site-name pill over the lower left and rounds the corners.
SAFE_LEFT = 24
SAFE_TOP = 20
SAFE_RIGHT = 1172
SAFE_BOTTOM = 528


def load_font(size: int) -> ImageFont.FreeTypeFont:
    font = TTFont(FONT_PATH)
    instancer.instantiateVariableFont(font, {"wght": 800}, inplace=True)
    blob = Path("/tmp/orbitron-800.ttf")
    font.save(blob)
    return ImageFont.truetype(blob, size)


def extend_canvas(source: Image.Image) -> Image.Image:
    plate = Image.new("RGB", (WIDTH, HEIGHT), (3, 8, 28))
    plate.paste(source.convert("RGB"), (0, 1))
    return plate


def cover_old_ships(plate: Image.Image) -> Image.Image:
    """Replace the Bio flask and green RSC ship with the surrounding nebula."""
    original = np.array(plate)
    src = original.astype(np.int16)
    red, green, blue = src[:, :, 0], src[:, :, 1], src[:, :, 2]
    xs = np.arange(WIDTH)[None, :]
    ys = np.arange(HEIGHT)[:, None]
    zones = ((500, 180, 910, HEIGHT - 4), (790, 140, 1160, HEIGHT - 4))
    hole = np.zeros((HEIGHT, WIDTH), np.uint8)
    for x0, y0, x1, y1 in zones:
        hole[y0:y1, x0:x1] = 255
    hole[:, :500] = 0
    hole[:145, :] = 0
    keep = np.zeros_like(hole)
    orange = (red > 150) & (green > 80) & (blue < 80) & (xs > 1000) & (ys < 220)
    enemy = (red > 140) & (green < 70) & (blue < 80) & (ys < 155) & (xs > 700)
    purple = (blue > 90) & (red > 70) & (green < 90) & (blue > green + 20) & (xs > 1000) & (ys > 250) & (ys < 540)
    keep[orange | enemy | purple] = 255
    hole[cv2.dilate(keep, np.ones((5, 5), np.uint8)) > 0] = 0

    missing = hole > 0
    known = ~missing
    color = original.astype(np.float32)
    color[missing] = 0
    for _ in range(36):
        weight = known.astype(np.float32)
        blur_weight = cv2.GaussianBlur(weight, (0, 0), 8)
        blurred = cv2.GaussianBlur(color * weight[..., None], (0, 0), 8)
        update = blurred / np.maximum(blur_weight, 1e-3)[..., None]
        newly = missing & (blur_weight > 0.05)
        color[newly] = update[newly]
        known[newly] = True
        missing[newly] = False
        if not missing.any():
            break
    painted = color
    rng = np.random.default_rng(25)
    hole_bool = hole > 0
    density = float(((original.max(axis=2) > 190) & ~hole_bool).sum()) / float((~hole_bool).sum())
    candidates = np.argwhere(hole_bool)
    for y, x in candidates[rng.random(len(candidates)) < density * 1.15]:
        roll = float(rng.random())
        star = (255, 244, 214) if roll < 0.12 else (150, 230, 255) if roll < 0.28 else (236, 242, 255)
        painted[int(y), int(x)] = star
    return Image.fromarray(np.clip(painted, 0, 255).astype(np.uint8))


def trim_sprite(path: Path, scale: int) -> Image.Image:
    sprite = Image.open(path).convert("RGBA")
    bbox = sprite.getbbox()
    if bbox is None:
        raise SystemExit(f"{path} has no pixels")
    pad = 4
    crop = (
        max(0, bbox[0] - pad),
        max(0, bbox[1] - pad),
        min(sprite.width, bbox[2] + pad),
        min(sprite.height, bbox[3] + pad),
    )
    trimmed = sprite.crop(crop)
    return trimmed.resize((trimmed.width * scale, trimmed.height * scale), Image.NEAREST)


def engine_columns(sprite: Image.Image) -> list[int]:
    alpha = np.array(sprite.split()[-1])
    height, width = alpha.shape
    band = alpha[int(height * 0.82) :, :]
    columns = np.where(band.max(axis=0) > 40)[0]
    if len(columns) == 0:
        return [width // 2]
    groups: list[list[int]] = [[int(columns[0])]]
    for value in columns[1:]:
        if int(value) - groups[-1][-1] > 8:
            groups.append([int(value)])
        else:
            groups[-1].append(int(value))
    centers = [int(np.mean(group)) for group in groups if len(group) > 2]
    return centers or [width // 2]


def paint_trails(base: Image.Image, origin: tuple[int, int], sprite: Image.Image, color: tuple[int, int, int]) -> None:
    draw = ImageDraw.Draw(base)
    left, top = origin
    bottom = top + sprite.height - 6
    for column in engine_columns(sprite):
        x = left + column
        y = bottom
        segment = 0
        while y < HEIGHT - 8:
            length = 18 if segment % 2 == 0 else 10
            fade = max(40, 230 - (y - bottom))
            ink = tuple(max(0, min(255, int(channel * fade / 230))) for channel in color)
            if segment % 2 == 0:
                draw.rectangle((x - 2, y, x + 2, min(HEIGHT - 6, y + length)), fill=ink)
                draw.rectangle((x - 1, y, x + 1, min(HEIGHT - 6, y + length)), fill=(255, 255, 255))
            y += length + 7
            segment += 1


def screen_glow(base: Image.Image, origin: tuple[int, int], sprite: Image.Image, color: tuple[int, int, int]) -> None:
    alpha = sprite.split()[-1].filter(ImageFilter.GaussianBlur(16))
    glow = Image.new("RGBA", sprite.size, color + (0,))
    glow.putalpha(alpha.point(lambda value: min(160, int(value * 0.55))))
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    layer.paste(glow, (origin[0] - 8, origin[1] - 8), glow)
    composed = Image.alpha_composite(base.convert("RGBA"), layer)
    base.paste(composed.convert("RGB"))


def paste_ship(base: Image.Image, sprite: Image.Image, origin: tuple[int, int], trail: tuple[int, int, int]) -> None:
    paint_trails(base, origin, sprite, trail)
    screen_glow(base, origin, sprite, trail)
    base.paste(sprite, origin, sprite)


def text_width(font: ImageFont.FreeTypeFont, text: str, tracking: int) -> int:
    width = 0
    for character in text:
        width += font.getlength(character) + tracking
    return int(round(width - tracking))


def draw_badge(base: Image.Image) -> tuple[int, int, int, int]:
    font = load_font(17)
    label = "25K RSC HIGH SCORE EVENT • ENDS NOV 29"
    tracking = 1
    text_w = text_width(font, label, tracking)
    pad_x = 16
    box_w = text_w + pad_x * 2
    box_h = 46
    left = 34
    top = 352
    right = left + box_w
    bottom = top + box_h
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    fill = (4, 12, 30, 214)
    border = (103, 232, 249, 255)
    draw.rounded_rectangle((left, top, right, bottom), radius=8, fill=fill, outline=border, width=3)
    cursor = left + pad_x
    text_top = top + 12
    for character in label:
        draw.text((cursor, text_top), character, font=font, fill=(236, 250, 255, 255))
        cursor += font.getlength(character) + tracking
    composed = Image.alpha_composite(base.convert("RGBA"), overlay)
    base.paste(composed.convert("RGB"))
    return (left, top, right, bottom)


def assert_text_safe(image: Image.Image, badge_box: tuple[int, int, int, int] | None) -> None:
    pixels = np.array(image)
    red, green, blue = pixels[:, :, 0], pixels[:, :, 1], pixels[:, :, 2]
    title = (red > 210) & (green > 210) & (blue > 210) & (np.arange(HEIGHT)[:, None] < 340) & (np.arange(WIDTH)[None, :] < 680)
    yy, xx = np.where(title)
    if len(xx) == 0:
        raise SystemExit("title pixels missing")
    boxes = [("title", int(xx.min()), int(yy.min()), int(xx.max()), int(yy.max()))]
    if badge_box is not None:
        left, top, right, bottom = badge_box
        region = pixels[top:bottom, left:right]
        bright = (region[:, :, 0] > 200) & (region[:, :, 1] > 220) & (region[:, :, 2] > 230)
        by, bx = np.where(bright)
        if len(bx) < 40:
            raise SystemExit("badge text missing")
        boxes.append(("badge", left + int(bx.min()), top + int(by.min()), left + int(bx.max()), top + int(by.max())))
    for name, x0, y0, x1, y1 in boxes:
        if x0 < SAFE_LEFT or y0 < SAFE_TOP or x1 > SAFE_RIGHT or y1 > SAFE_BOTTOM:
            raise SystemExit(f"{name} leaves the X safe area: {(x0, y0, x1, y1)}")
        print(f"{name} safe {x0},{y0} {x1},{y1}")


def main() -> None:
    source = Image.open(SOURCE)
    if source.size != (1200, 628):
        raise SystemExit(f"unexpected source size {source.size}")
    plate = cover_old_ships(extend_canvas(source))
    nih = trim_sprite(NIH_PATH, 2)
    btc = trim_sprite(BTC_PATH, 2)
    paste_ship(plate, nih, (548, 132), (34, 211, 238))
    paste_ship(plate, btc, (848, 118), (251, 191, 36))
    plain = plate.copy()
    badge_box = draw_badge(plate)
    if plain.size != (WIDTH, HEIGHT) or plate.size != (WIDTH, HEIGHT):
        raise SystemExit("card is not 1200x630")
    assert_text_safe(plate, badge_box)
    assert_text_safe(plain, None)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    plate.save(OUT_DIR / EVENT_NAME, "PNG", optimize=True)
    plain.save(OUT_DIR / BASE_NAME, "PNG", optimize=True)
    print(f"wrote {(OUT_DIR / EVENT_NAME).relative_to(ROOT)} and {(OUT_DIR / BASE_NAME).relative_to(ROOT)}")
    print(f"nih {nih.size} btc {btc.size} badge {badge_box}")


if __name__ == "__main__":
    sys.exit(main())
