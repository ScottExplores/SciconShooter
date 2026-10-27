"""Rebuild the 1200x630 social card on the existing space plate.

The Bio and RSC ships are lifted off with a ship-shaped fill taken from the
surrounding art. NIH v2 and the Bitcoin ship are the game sprites, kept near
the old ships' size, with their own alpha and angled engine trails.
The left title column, including SHOOTER and the Built on Base pill, stays
pixel-identical. The 25K badge sits on its own line under that pill.
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
SAFE_LEFT = 24
SAFE_TOP = 20
SAFE_RIGHT = 1172
SAFE_BOTTOM = 528
# Extended-canvas coordinates (the 628px source is pasted at y=1).
# SHOOTER's R ends at x=591. PLAY GAMES / FUND SCIENCE ends at x=593.
# The Built on Base pill occupies y=356..414, x=146..504.
# The old blue flame continues down-left to about x=520, so the plate
# repair is allowed there. The title block itself stays pixel-identical.
TEXT_RIGHT = 620
PILL_BOTTOM = 422
KEEP_LEFT = 490
BADGE_LEFT = 146
BADGE_TOP = 424
SHIP_LEFT = 618


def load_font(size: int) -> ImageFont.FreeTypeFont:
    font = TTFont(FONT_PATH)
    instancer.instantiateVariableFont(font, {"wght": 800}, inplace=True)
    blob = Path("/tmp/orbitron-800.ttf")
    font.save(blob)
    return ImageFont.truetype(blob, size)


def extend_canvas(source: Image.Image) -> np.ndarray:
    plate = np.zeros((HEIGHT, WIDTH, 3), np.uint8)
    plate[:] = (3, 8, 28)
    plate[1:629] = np.array(source.convert("RGB"))
    return plate


def protect_plate(image: np.ndarray, plate: np.ndarray) -> np.ndarray:
    """Put the title, the pill, the moon, and the far-left art back."""
    image = image.copy()
    image[:, :KEEP_LEFT] = plate[:, :KEEP_LEFT]
    image[:292, :TEXT_RIGHT] = plate[:292, :TEXT_RIGHT]
    image[292:352, :640] = plate[292:352, :640]
    image[346:PILL_BOTTOM, :540] = plate[346:PILL_BOTTOM, :540]
    return image


def old_ship_mask(plate: np.ndarray) -> np.ndarray:
    """Full Bio and RSC hulls, including the yellow-green body and the blue flame."""
    red = plate[:, :, 0].astype(np.int16)
    green = plate[:, :, 1].astype(np.int16)
    blue = plate[:, :, 2].astype(np.int16)
    xs = np.arange(WIDTH)[None, :]
    ys = np.arange(HEIGHT)[:, None]
    blue_ship = (blue > 72) & (blue > red + 24) & (blue + 40 > green) & (ys > 175) & (xs > 500)
    # The RSC hull is bright yellow-green, so red is high and the old red<175 test missed it.
    green_ship = (green > 78) & (green + 14 >= red) & (green > blue + 12) & (green > red * 0.72) & (xs > 760) & (ys > 175)
    hot = (red > 170) & (green > 170) & (blue > 145) & (xs > 500) & (ys > 340) & (xs < 900)
    raw = (blue_ship | green_ship | hot).astype(np.uint8) * 255
    raw = cv2.morphologyEx(raw, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (19, 19)))
    raw = cv2.dilate(raw, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
    # Far-right planets and asteroids stay. They read red/purple, not ship green.
    planet = (red > green + 8) & (red > 55) & (xs > 1060)
    raw[planet] = 0
    sentinel = np.zeros_like(plate)
    sentinel[raw > 0] = 255
    sentinel = protect_plate(sentinel, np.zeros_like(plate))
    return sentinel[:, :, 0]


def cover_old_ships(plate: np.ndarray) -> np.ndarray:
    """Replace the old ships by cloning clean space from the plate. No rectangle of noise."""
    mask = old_ship_mask(plate)
    painted = cv2.inpaint(cv2.cvtColor(plate, cv2.COLOR_RGB2BGR), mask, 12, cv2.INPAINT_TELEA)
    painted = cv2.cvtColor(painted, cv2.COLOR_BGR2RGB).astype(np.float32)
    # Stars and nebula grain taken from empty space under the title, left of the flame.
    donor = plate[470:620, 220:460].astype(np.float32)
    detail = donor - cv2.GaussianBlur(donor, (0, 0), 4.5)
    tiled = np.zeros_like(painted)
    th, tw = detail.shape[:2]
    for y in range(0, HEIGHT, th):
        for x in range(0, WIDTH, tw):
            tiled[y : y + th, x : x + tw] = detail[: min(th, HEIGHT - y), : min(tw, WIDTH - x)]
    distance = cv2.distanceTransform((mask > 0).astype(np.uint8), cv2.DIST_L2, 3)
    alpha = np.clip((distance - 2.0) / 8.0, 0, 1)[..., None]
    mixed = plate.astype(np.float32) * (1 - alpha) + (painted + tiled * 0.8) * alpha
    result = protect_plate(np.clip(mixed, 0, 255).astype(np.uint8), plate)
    assert_old_ships_gone(plate, result)
    return result


def assert_old_ships_gone(source: np.ndarray, repaired: np.ndarray) -> None:
    """Ship-colored pixels from the original plate must not survive outside the title."""
    red = source[:, :, 0].astype(np.int16)
    green = source[:, :, 1].astype(np.int16)
    blue = source[:, :, 2].astype(np.int16)
    xs = np.arange(WIDTH)[None, :]
    ys = np.arange(HEIGHT)[:, None]
    unchanged = np.abs(repaired.astype(np.int16) - source.astype(np.int16)).max(axis=2) < 10
    zone = (ys > 175) & (xs > 500) & (xs < 1060)
    zone[:292, :TEXT_RIGHT] = False
    zone[292:352, :640] = False
    zone[346:PILL_BOTTOM, :540] = False
    zone[:, :KEEP_LEFT] = False
    blue_ship = zone & (blue > 110) & (blue > red + 35) & (blue > green)
    green_ship = zone & (green > 130) & (green + 10 >= red) & (green > blue + 18) & (xs > 760)
    still = unchanged & (blue_ship | green_ship)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(still.astype(np.uint8), 8)
    leftovers = []
    for index in range(1, count):
        if stats[index, cv2.CC_STAT_AREA] > 120:
            x, y, w, h, area = stats[index]
            leftovers.append((int(area), int(x), int(y), int(w), int(h)))
    if leftovers:
        raise SystemExit(f"old ship pixels remain: {leftovers[:8]}")
    print(f"old ships cleared, mask leftovers under 120px")


def trim_sprite(path: Path, target_h: int) -> Image.Image:
    sprite = Image.open(path).convert("RGBA")
    alpha = np.array(sprite.getchannel("A"))
    if alpha[0, 0] != 0 or alpha[-1, -1] != 0:
        raise SystemExit(f"{path.name} corners are not transparent")
    ys, xs = np.where(alpha > 16)
    if len(xs) == 0:
        raise SystemExit(f"{path} has no pixels")
    pad = 2
    crop = (
        max(0, int(xs.min()) - pad),
        max(0, int(ys.min()) - pad),
        min(sprite.width, int(xs.max()) + 1 + pad),
        min(sprite.height, int(ys.max()) + 1 + pad),
    )
    trimmed = sprite.crop(crop)
    target_w = max(1, round(trimmed.width * target_h / trimmed.height))
    return trimmed.resize((target_w, target_h), Image.NEAREST)


def engine_columns(sprite: Image.Image) -> list[int]:
    alpha = np.array(sprite.getchannel("A"))
    height, width = alpha.shape
    band = alpha[int(height * 0.78) :, :]
    columns = np.where(band.max(axis=0) > 24)[0]
    if len(columns) == 0:
        return [width // 2]
    groups: list[list[int]] = [[int(columns[0])]]
    for value in columns[1:]:
        if int(value) - groups[-1][-1] > 6:
            groups.append([int(value)])
        else:
            groups[-1].append(int(value))
    centers = [int(round(float(np.mean(group)))) for group in groups if len(group) > 2]
    return centers or [width // 2]


def with_trails(sprite: Image.Image, color: tuple[int, int, int], length: int = 168) -> Image.Image:
    canvas = Image.new("RGBA", (sprite.width + 16, sprite.height + length), (0, 0, 0, 0))
    canvas.paste(sprite, (8, 0), sprite)
    draw = ImageDraw.Draw(canvas)
    bottom = sprite.height - 2
    for column in engine_columns(sprite):
        x = 8 + column
        for step in range(length):
            fade = 1 - step / length
            if fade < 0.08:
                break
            width = 4 if step < 24 else 3 if step < 70 else 2
            ink = tuple(int(channel * (0.35 + 0.65 * fade)) for channel in color) + (int(200 * fade),)
            core = (255, 255, 255, int(170 * fade))
            y = bottom + step
            draw.line((x - width, y, x + width, y), fill=ink)
            draw.point((x, y), fill=core)
    # Halo follows the sprite and the trails. It is not a filled rectangle.
    glow = canvas.getchannel("A").filter(ImageFilter.GaussianBlur(2))
    haze = Image.new("RGBA", canvas.size, color + (0,))
    haze.putalpha(glow.point(lambda value: min(70, int(value * 0.28))))
    return Image.alpha_composite(haze, canvas)


def placed_sprite(sprite: Image.Image, origin: tuple[int, int], angle: float, canvas_size: tuple[int, int]) -> Image.Image:
    turned = sprite.rotate(angle, resample=Image.NEAREST, expand=True)
    layer = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
    layer.paste(turned, origin, turned)
    return layer


def shift_into_frame(sprite: Image.Image, origin: tuple[int, int], angle: float) -> tuple[Image.Image, tuple[int, int, int, int]]:
    layer = placed_sprite(sprite, origin, angle, (WIDTH, HEIGHT))
    alpha = np.array(layer.getchannel("A"))
    ys, xs = np.where(alpha > 12)
    if len(xs) == 0:
        raise SystemExit("ship placed with no pixels")
    box = (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()))
    dx = max(0, SHIP_LEFT - box[0])
    dy = max(0, 168 - box[1])
    if box[2] + dx > WIDTH - 8:
        dx -= box[2] + dx - (WIDTH - 8)
    if box[3] + dy > HEIGHT - 6:
        dy -= box[3] + dy - (HEIGHT - 6)
    if dx or dy:
        layer = placed_sprite(sprite, (origin[0] + dx, origin[1] + dy), angle, (WIDTH, HEIGHT))
        alpha = np.array(layer.getchannel("A"))
        ys, xs = np.where(alpha > 12)
        box = (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()))
    if box[0] < SHIP_LEFT:
        raise SystemExit(f"ship still covers the title column: {box}")
    return layer, box


def text_width(font: ImageFont.FreeTypeFont, text: str, tracking: int) -> int:
    width = 0.0
    for character in text:
        width += font.getlength(character) + tracking
    return int(round(width - tracking))


def draw_badge(base: Image.Image) -> tuple[Image.Image, tuple[int, int, int, int]]:
    font = load_font(14)
    label = "25K RSC HIGH SCORE EVENT • ENDS NOV 29"
    tracking = 1
    text_w = text_width(font, label, tracking)
    pad_x, pad_y = 14, 8
    left, top = BADGE_LEFT, BADGE_TOP
    right, bottom = left + text_w + pad_x * 2, top + font.size + pad_y * 2
    if top < PILL_BOTTOM:
        raise SystemExit(f"badge overlaps the Built on Base pill: top {top}")
    if right > SHIP_LEFT - 8:
        raise SystemExit(f"badge runs into the ships: right {right}")
    if left < SAFE_LEFT or top < SAFE_TOP or right > SAFE_RIGHT or bottom > SAFE_BOTTOM:
        raise SystemExit(f"badge leaves the X safe area: {(left, top, right, bottom)}")
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.rounded_rectangle((left, top, right, bottom), radius=8, fill=(4, 12, 30, 225), outline=(103, 232, 249, 255), width=3)
    cursor = left + pad_x
    for character in label:
        draw.text((cursor, top + pad_y - 1), character, font=font, fill=(236, 250, 255, 255))
        cursor += font.getlength(character) + tracking
    return Image.alpha_composite(base, overlay), (left, top, right, bottom)


def assert_layout(
    image: Image.Image,
    source: np.ndarray,
    ship_boxes: list[tuple[int, int, int, int]],
    badge_box: tuple[int, int, int, int] | None,
) -> None:
    pixels = np.array(image.convert("RGB"))
    protected = [
        (0, 0, KEEP_LEFT, BADGE_TOP, "left-art"),
        (0, BADGE_TOP, BADGE_LEFT - 4, HEIGHT, "below-left"),
        (0, 0, TEXT_RIGHT, 292, "title"),
        (0, 292, 640, 352, "subtitle"),
        (0, 346, 540, PILL_BOTTOM, "pill"),
    ]
    if badge_box is None:
        protected.append((BADGE_LEFT - 4, BADGE_TOP, KEEP_LEFT, HEIGHT, "under-pill"))
    for x0, y0, x1, y1, name in protected:
        delta = np.abs(pixels[y0:y1, x0:x1].astype(int) - source[y0:y1, x0:x1].astype(int)).max()
        if delta != 0:
            raise SystemExit(f"{name} pixels changed (max delta {delta})")
        print(f"{name} unchanged")
    for box in ship_boxes:
        if box[0] < SHIP_LEFT or box[2] >= WIDTH or box[3] >= HEIGHT:
            raise SystemExit(f"ship outside the right-hand frame: {box}")
        if box[3] - box[1] > 520:
            raise SystemExit(f"ship is too tall: {box}")
        print(f"ship {box}")
    if badge_box is not None:
        left, top, right, bottom = badge_box
        gap = np.abs(pixels[PILL_BOTTOM:top, :540].astype(int) - source[PILL_BOTTOM:top, :540].astype(int)).max()
        if gap != 0:
            raise SystemExit("badge overlaps the Built on Base pill")
        if top < PILL_BOTTOM or left < BADGE_LEFT:
            raise SystemExit("badge overlaps Built on Base")
        region = pixels[top:bottom, left:right]
        bright = (region[:, :, 0] > 200) & (region[:, :, 1] > 220) & (region[:, :, 2] > 230)
        by, bx = np.where(bright)
        if len(bx) < 40:
            raise SystemExit("badge text missing")
        text_box = (left + int(bx.min()), top + int(by.min()), left + int(bx.max()), top + int(by.max()))
        if text_box[0] < SAFE_LEFT or text_box[1] < SAFE_TOP or text_box[2] > SAFE_RIGHT or text_box[3] > SAFE_BOTTOM:
            raise SystemExit(f"badge leaves the X safe area: {text_box}")
        print(f"badge {text_box}")
    # The repaired ship area stays blue space, not a grey rectangle.
    hole = pixels[300:560, 640:860].astype(int)
    if hole[:, :, 2].mean() < hole[:, :, 0].mean() + 12:
        raise SystemExit("ship area collapsed to grey")


def composite(plate: np.ndarray, layers: list[Image.Image]) -> Image.Image:
    base = Image.fromarray(plate).convert("RGBA")
    for layer in layers:
        base = Image.alpha_composite(base, layer)
    return base


def main() -> None:
    source_image = Image.open(SOURCE)
    if source_image.size != (1200, 628):
        raise SystemExit(f"unexpected source size {source_image.size}")
    source = extend_canvas(source_image)
    plate = cover_old_ships(source)
    nih = with_trails(trim_sprite(NIH_PATH, 204), (34, 211, 238))
    btc = with_trails(trim_sprite(BTC_PATH, 196), (251, 191, 36))
    nih_layer, nih_box = shift_into_frame(nih, (640, 230), -14)
    btc_layer, btc_box = shift_into_frame(btc, (900, 188), 16)
    plain = composite(plate, [nih_layer, btc_layer])
    event, badge_box = draw_badge(plain)
    assert_layout(event, source, [nih_box, btc_box], badge_box)
    assert_layout(plain, source, [nih_box, btc_box], None)
    if event.size != (WIDTH, HEIGHT):
        raise SystemExit("card is not 1200x630")
    # Pixels outside each sprite's alpha match the repaired plate, so no box was pasted behind them.
    plate_rgb = plate
    for layer, name in ((nih_layer, "nih"), (btc_layer, "btc")):
        alpha = np.array(layer.getchannel("A"))
        ys, xs = np.where(alpha > 12)
        x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
        opaque = alpha[y0:y1, x0:x1] > 12
        near = cv2.dilate(opaque.astype(np.uint8), np.ones((5, 5), np.uint8), iterations=1) > 0
        event_rgb = np.array(plain.convert("RGB"))
        delta = np.abs(event_rgb[y0:y1, x0:x1].astype(int) - plate_rgb[y0:y1, x0:x1].astype(int)).max(axis=2)
        leaked = int(((delta > 2) & ~near).sum())
        if leaked:
            raise SystemExit(f"{name} has a plate behind the sprite ({leaked} pixels)")
        print(f"{name} alpha clean, box {(x0, y0, x1, y1)}")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    event.convert("RGB").save(OUT_DIR / EVENT_NAME, "PNG", optimize=True)
    plain.convert("RGB").save(OUT_DIR / BASE_NAME, "PNG", optimize=True)
    print(f"nih {nih.size} btc {btc.size} badge {badge_box}")


if __name__ == "__main__":
    sys.exit(main() or 0)
