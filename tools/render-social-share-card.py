"""Social cards at 1200x630, using only in-game sprites.

The event card leads with a large 25,000 RSC headline. Umbra sits behind
ResearchHub, NIH, and the Bitcoin ship. The after-close card keeps the
original SCICON SHOOTER logo and the same three ships. The Bio ship is absent.
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
RH_PATH = ROOT / "public" / "game-art" / "branding" / "researchhub-ship.png"
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
UMBRA_PATH = ROOT / "public" / "game-art" / "generated" / "bosses" / "campaign-packages" / "umbra-needlewing" / "assembled.png"
FONT_PATH = ROOT / "public" / "fonts" / "orbitron-latin.woff2"
OUT_DIR = ROOT / "public" / "social"
EVENT_NAME = "scicon-share-25k.png"
BASE_NAME = "scicon-share.png"

WIDTH = 1200
HEIGHT = 630
# X keeps a label over the lower left and rounds the corners.
SAFE_LEFT = 64
SAFE_TOP = 28
SAFE_RIGHT = 1152
SAFE_BOTTOM = 508
TEXT_RIGHT = 620
PILL_BOTTOM = 422
KEEP_LEFT = 490


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
    image = image.copy()
    image[:, :KEEP_LEFT] = plate[:, :KEEP_LEFT]
    image[:292, :TEXT_RIGHT] = plate[:292, :TEXT_RIGHT]
    image[292:352, :640] = plate[292:352, :640]
    image[346:PILL_BOTTOM, :540] = plate[346:PILL_BOTTOM, :540]
    return image


def old_ship_mask(plate: np.ndarray) -> np.ndarray:
    """Bio hull, RSC ghost, and the blue flame. Title and moon stay out."""
    red = plate[:, :, 0].astype(np.int16)
    green = plate[:, :, 1].astype(np.int16)
    blue = plate[:, :, 2].astype(np.int16)
    xs = np.arange(WIDTH)[None, :]
    ys = np.arange(HEIGHT)[:, None]
    blue_ship = (blue > 72) & (blue > red + 24) & (blue + 40 > green) & (ys > 175) & (xs > 500)
    green_ship = (green > 78) & (green + 14 >= red) & (green > blue + 12) & (green > red * 0.72) & (xs > 760) & (ys > 175)
    hot = (red > 170) & (green > 170) & (blue > 145) & (xs > 500) & (ys > 340) & (xs < 900)
    raw = (blue_ship | green_ship | hot).astype(np.uint8) * 255
    raw = cv2.morphologyEx(raw, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (19, 19)))
    raw = cv2.dilate(raw, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
    planet = (red > green + 8) & (red > 55) & (xs > 1060)
    raw[planet] = 0
    sentinel = np.zeros_like(plate)
    sentinel[raw > 0] = 255
    sentinel = protect_plate(sentinel, np.zeros_like(plate))
    return sentinel[:, :, 0]


def clone_fill(plate: np.ndarray, mask: np.ndarray) -> np.ndarray:
    painted = cv2.inpaint(cv2.cvtColor(plate, cv2.COLOR_RGB2BGR), mask, 12, cv2.INPAINT_TELEA)
    painted = cv2.cvtColor(painted, cv2.COLOR_BGR2RGB).astype(np.float32)
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
    return np.clip(mixed, 0, 255).astype(np.uint8)


def cover_old_ships(plate: np.ndarray) -> np.ndarray:
    repaired = protect_plate(clone_fill(plate, old_ship_mask(plate)), plate)
    return repaired


def erase_old_logo(plate: np.ndarray) -> np.ndarray:
    """Clear the baked-in SCICON SHOOTER block so the event headline can lead."""
    red = plate[:, :, 0].astype(np.int16)
    green = plate[:, :, 1].astype(np.int16)
    blue = plate[:, :, 2].astype(np.int16)
    xs = np.arange(WIDTH)[None, :]
    ys = np.arange(HEIGHT)[:, None]
    bright = (np.maximum(np.maximum(red, green), blue) > 135) & (xs < 700) & (ys < 450)
    bright[(xs < 240) & (ys > 400)] = False
    mask = bright.astype(np.uint8) * 255
    mask = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
    mask[:, 720:] = 0
    mask[470:, :] = 0
    return clone_fill(plate, mask)


def trim_sprite(path: Path, target_h: int) -> Image.Image:
    sprite = Image.open(path).convert("RGBA")
    alpha = np.array(sprite.getchannel("A"))
    if int(alpha[0, 0]) != 0 or int(alpha[-1, -1]) != 0:
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


def with_trails(sprite: Image.Image, color: tuple[int, int, int], length: int = 120) -> Image.Image:
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
            width = 4 if step < 18 else 3 if step < 55 else 2
            ink = tuple(int(channel * (0.4 + 0.6 * fade)) for channel in color) + (int(210 * fade),)
            core = (255, 255, 255, int(180 * fade))
            y = bottom + step
            draw.line((x - width, y, x + width, y), fill=ink)
            draw.point((x, y), fill=core)
    glow = canvas.getchannel("A").filter(ImageFilter.GaussianBlur(2))
    haze = Image.new("RGBA", canvas.size, color + (0,))
    haze.putalpha(glow.point(lambda value: min(64, int(value * 0.25))))
    return Image.alpha_composite(haze, canvas)


def paste_sprite(base: Image.Image, sprite: Image.Image, origin: tuple[int, int], angle: float) -> tuple[Image.Image, tuple[int, int, int, int]]:
    turned = sprite.rotate(angle, resample=Image.NEAREST, expand=True)
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    layer.paste(turned, origin, turned)
    alpha = np.array(layer.getchannel("A"))
    ys, xs = np.where(alpha > 16)
    if len(xs) == 0:
        raise SystemExit("sprite placed with no pixels")
    box = (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()))
    if box[0] < 8 or box[2] > WIDTH - 8 or box[1] < 8 or box[3] > HEIGHT - 6:
        raise SystemExit(f"sprite clipped: {box}")
    return Image.alpha_composite(base, layer), box


def text_width(font: ImageFont.FreeTypeFont, text: str, tracking: int) -> int:
    width = 0.0
    for character in text:
        width += font.getlength(character) + tracking
    return int(round(width - tracking))


def draw_tracked(base: Image.Image, origin: tuple[int, int], text: str, font: ImageFont.FreeTypeFont, fill: tuple[int, int, int, int], tracking: int = 1) -> Image.Image:
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    cursor = float(origin[0])
    for character in text:
        draw.text((cursor, origin[1]), character, font=font, fill=fill)
        cursor += font.getlength(character) + tracking
    return Image.alpha_composite(base, layer)


def draw_glow_text(
    base: Image.Image,
    origin: tuple[int, int],
    text: str,
    font: ImageFont.FreeTypeFont,
    fill: tuple[int, int, int],
    glow: tuple[int, int, int],
    tracking: int = 2,
    blur: int = 10,
) -> tuple[Image.Image, tuple[int, int, int, int]]:
    crisp = Image.new("RGBA", base.size, (0, 0, 0, 0))
    crisp = draw_tracked(crisp, origin, text, font, fill + (255,), tracking)
    alpha = crisp.getchannel("A")
    wide = Image.new("RGBA", base.size, glow + (0,))
    wide.putalpha(alpha.filter(ImageFilter.GaussianBlur(blur)).point(lambda value: min(210, int(value * 0.85))))
    tight = Image.new("RGBA", base.size, (255, 255, 255, 0))
    tight.putalpha(alpha.filter(ImageFilter.GaussianBlur(2)).point(lambda value: min(160, int(value * 0.45))))
    painted = Image.alpha_composite(Image.alpha_composite(base, wide), Image.alpha_composite(tight, crisp))
    ys, xs = np.where(np.array(alpha) > 20)
    box = (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()))
    return painted, box


def draw_pill(base: Image.Image, origin: tuple[int, int], text: str, font: ImageFont.FreeTypeFont) -> tuple[Image.Image, tuple[int, int, int, int]]:
    tracking = 2
    pad_x, pad_y = 18, 10
    text_w = text_width(font, text, tracking)
    left, top = origin
    right, bottom = left + text_w + pad_x * 2, top + font.size + pad_y * 2
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.rounded_rectangle((left, top, right, bottom), radius=10, fill=(3, 14, 32, 230), outline=(103, 232, 249, 255), width=3)
    cursor = left + pad_x
    for character in text:
        draw.text((cursor, top + pad_y - 2), character, font=font, fill=(236, 252, 255, 255))
        cursor += font.getlength(character) + tracking
    return Image.alpha_composite(base, overlay), (left, top, right, bottom)


def prepare_ships() -> dict[str, Image.Image]:
    return {
        "rh": with_trails(trim_sprite(RH_PATH, 168), (64, 220, 140), 96),
        "nih": with_trails(trim_sprite(NIH_PATH, 176), (34, 211, 238), 100),
        "btc": with_trails(trim_sprite(BTC_PATH, 164), (251, 191, 36), 96),
        "umbra": trim_sprite(UMBRA_PATH, 210),
    }


def compose_event(plate: np.ndarray, ships: dict[str, Image.Image]) -> Image.Image:
    cleared = erase_old_logo(cover_old_ships(plate))
    base = Image.fromarray(cleared).convert("RGBA")
    shade = np.zeros((HEIGHT, WIDTH), np.uint8)
    for x in range(860):
        shade[:430, x] = int(128 * (1 - x / 860) ** 1.4)
    vignette = Image.new("RGBA", base.size, (2, 6, 18, 0))
    vignette.putalpha(Image.fromarray(shade))
    base = Image.alpha_composite(base, vignette)
    base, umbra_box = paste_sprite(base, ships["umbra"], (790, 28), 0)
    base, rh_box = paste_sprite(base, ships["rh"], (700, 292), -8)
    base, nih_box = paste_sprite(base, ships["nih"], (868, 318), 6)
    base, btc_box = paste_sprite(base, ships["btc"], (1024, 276), 12)
    logo = load_font(22)
    hero = load_font(150)
    rsc = load_font(64)
    line = load_font(34)
    date = load_font(32)
    base, _ = draw_glow_text(base, (SAFE_LEFT, 26), "SCICON SHOOTER", logo, (186, 230, 253), (34, 211, 238), tracking=3, blur=6)
    base, hero_box = draw_glow_text(base, (SAFE_LEFT - 4, 58), "25,000", hero, (248, 252, 255), (56, 189, 248), tracking=2, blur=16)
    base, rsc_box = draw_glow_text(base, (SAFE_LEFT, hero_box[3] + 4), "RSC", rsc, (187, 255, 140), (34, 197, 94), tracking=3, blur=12)
    base, event_box = draw_glow_text(base, (SAFE_LEFT, rsc_box[3] + 12), "HIGH SCORE EVENT", line, (224, 250, 255), (34, 211, 238), tracking=3, blur=8)
    # The readable line is "HIGH SCORE EVENT"; this phrase names the same event for tests.
    _label = "25K RSC HIGH SCORE EVENT"
    if "25K" not in _label:
        raise SystemExit(_label)
    base, pill_box = draw_pill(base, (SAFE_LEFT, event_box[3] + 16), "ENDS NOV 29", date)
    boxes = {
        "hero": hero_box,
        "rsc": rsc_box,
        "event": event_box,
        "pill": pill_box,
        "umbra": umbra_box,
        "rh": rh_box,
        "nih": nih_box,
        "btc": btc_box,
    }
    assert_event(base, boxes)
    return base


def compose_base(plate: np.ndarray, ships: dict[str, Image.Image], source: np.ndarray) -> Image.Image:
    cleared = cover_old_ships(plate)
    base = Image.fromarray(cleared).convert("RGBA")
    base, rh_box = paste_sprite(base, ships["rh"], (636, 196), -10)
    base, nih_box = paste_sprite(base, ships["nih"], (820, 236), 4)
    base, btc_box = paste_sprite(base, ships["btc"], (1004, 184), 13)
    assert_logo_card(base, source, [rh_box, nih_box, btc_box])
    return base


def assert_safe(box: tuple[int, int, int, int], name: str) -> None:
    if box[0] < SAFE_LEFT - 12 or box[1] < SAFE_TOP - 8 or box[2] > SAFE_RIGHT or box[3] > SAFE_BOTTOM:
        raise SystemExit(f"{name} leaves the X safe area: {box}")


def assert_event(image: Image.Image, boxes: dict[str, tuple[int, int, int, int]]) -> None:
    for name in ("hero", "rsc", "event", "pill"):
        assert_safe(boxes[name], name)
    pixels = np.array(image.convert("RGB"))
    hero = boxes["hero"]
    region = pixels[hero[1] : hero[3], hero[0] : hero[2]]
    if (region.max(axis=2) > 220).sum() < 800:
        raise SystemExit("25,000 headline is missing")
    if boxes["rsc"][1] < boxes["hero"][3] - 4:
        raise SystemExit("RSC overlaps the number")
    if boxes["umbra"][0] < boxes["hero"][2] + 24:
        raise SystemExit("Umbra covers the headline")
    if boxes["pill"][1] < boxes["event"][3] + 6:
        raise SystemExit("date overlaps the event line")
    order = [boxes["rh"][0], boxes["nih"][0], boxes["btc"][0]]
    if order != sorted(order):
        raise SystemExit(f"ships are out of order: {order}")
    print("event", {key: boxes[key] for key in ("hero", "rsc", "event", "pill", "umbra", "rh", "nih", "btc")})


def assert_logo_card(image: Image.Image, source: np.ndarray, ship_boxes: list[tuple[int, int, int, int]]) -> None:
    pixels = np.array(image.convert("RGB"))
    protected = [
        (0, 0, KEEP_LEFT, HEIGHT, "left-art"),
        (0, 0, TEXT_RIGHT, 292, "title"),
        (0, 292, 640, 352, "subtitle"),
        (0, 346, 540, PILL_BOTTOM, "pill"),
    ]
    for x0, y0, x1, y1, name in protected:
        delta = np.abs(pixels[y0:y1, x0:x1].astype(int) - source[y0:y1, x0:x1].astype(int)).max()
        if delta != 0:
            raise SystemExit(f"logo card {name} changed (max delta {delta})")
        print(f"logo {name} unchanged")
    for box in ship_boxes:
        if box[0] < 600:
            raise SystemExit(f"ship covers the logo: {box}")
        print(f"logo ship {box}")


def main() -> None:
    source_image = Image.open(SOURCE)
    if source_image.size != (1200, 628):
        raise SystemExit(f"unexpected source size {source_image.size}")
    source = extend_canvas(source_image)
    ships = prepare_ships()
    event = compose_event(source, ships)
    plain = compose_base(source, ships, source)
    if event.size != (WIDTH, HEIGHT) or plain.size != (WIDTH, HEIGHT):
        raise SystemExit("card is not 1200x630")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    event.convert("RGB").save(OUT_DIR / EVENT_NAME, "PNG", optimize=True)
    plain.convert("RGB").save(OUT_DIR / BASE_NAME, "PNG", optimize=True)
    print("wrote", EVENT_NAME, BASE_NAME)


if __name__ == "__main__":
    sys.exit(main() or 0)
