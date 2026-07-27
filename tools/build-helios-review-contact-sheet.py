"""Build the canonical Helios Clawcarrier V0.18 attack review sheet."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
REVIEW_DIR = ROOT / "director-data" / "prototype-assets" / "helios-clawcarrier-v2" / "review"
OUTPUT = REVIEW_DIR / "helios-clawcarrier-v2-key-pose-contact-sheet.png"

CELL_WIDTH = 300
CELL_HEIGHT = 565
IMAGE_HEIGHT = 520
HEADER_HEIGHT = 82
COLUMNS = 4

POSES = (
    ("Neutral / guns settled", "v016-mobile-neutral-mounted-settled.png", (340, 0, 783, 958)),
    ("Attack 1 / rapid burst", "v016-mobile-attack1-rapid-fire.png", (340, 0, 783, 958)),
    ("Attack 1 / angled twin volley", "v016-mobile-attack1-angled-fire-beat2.png", (340, 0, 783, 958)),
    ("Attack 1 / exact neutral return", "v016-mobile-attack1-post-burst-neutral.png", (340, 0, 783, 958)),
    ("Attack 2 / protected warning", "v018-mobile-attack2-channel-protected-warning.png", (474, 0, 807, 720)),
    ("Attack 2 / right-edge start", "v018-mobile-attack2-channel-protected-right-edge.png", (474, 0, 807, 720)),
    ("Attack 2 / wider left edge", "v018-mobile-attack2-channel-protected-left-edge.png", (474, 0, 807, 720)),
    ("Attack 2 / alternating replay", "v018-mobile-attack2-channel-protected-alternating-replay.png", (474, 0, 807, 720)),
    ("Attack 2 / recovery", "v016-mobile-attack2-channel-recovery.png", (340, 0, 783, 958)),
    ("Attack 3 / mine seed A", "v016-mobile-attack3-mines-seed-a.png", (340, 0, 783, 958)),
    ("Attack 3 / mine seed B", "v016-mobile-attack3-mines-seed-b.png", (340, 0, 783, 958)),
    ("Attack 3 / mine seed C", "v016-mobile-attack3-mines-seed-c.png", (340, 0, 783, 958)),
    ("Attack 4 / committed clamp dive", "v016-mobile-attack4-clamp-dive.png", (340, 0, 783, 958)),
)


def load_font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    candidates = (
        Path("C:/Windows/Fonts/consolab.ttf" if bold else "C:/Windows/Fonts/consola.ttf"),
        Path("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"),
    )
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


def main() -> None:
    rows = (len(POSES) + COLUMNS - 1) // COLUMNS
    sheet = Image.new(
        "RGB",
        (CELL_WIDTH * COLUMNS, HEADER_HEIGHT + CELL_HEIGHT * rows),
        "#020914",
    )
    draw = ImageDraw.Draw(sheet)
    title_font = load_font(28, bold=True)
    subtitle_font = load_font(14)
    label_font = load_font(15, bold=True)

    draw.text((22, 13), "HELIOS CLAWCARRIER V0.18 — ATTACK REVIEW", fill="#83e9ff", font=title_font)
    draw.text(
        (24, 49),
        "Canonical Boss Sandbox captures • mobile canvas • fixed review seeds",
        fill="#8eaabd",
        font=subtitle_font,
    )

    for index, (label, filename, crop_box) in enumerate(POSES):
        source_path = REVIEW_DIR / filename
        if not source_path.exists():
            raise FileNotFoundError(source_path)
        source = Image.open(source_path).convert("RGB").crop(crop_box)
        fitted = ImageOps.contain(
            source,
            (CELL_WIDTH - 12, IMAGE_HEIGHT - 12),
            method=Image.Resampling.NEAREST,
        )
        column = index % COLUMNS
        row = index // COLUMNS
        left = column * CELL_WIDTH
        top = HEADER_HEIGHT + row * CELL_HEIGHT

        draw.rectangle(
            (left + 4, top + 4, left + CELL_WIDTH - 4, top + CELL_HEIGHT - 4),
            fill="#06121f",
            outline="#17445a",
            width=2,
        )
        image_left = left + (CELL_WIDTH - fitted.width) // 2
        image_top = top + 6 + (IMAGE_HEIGHT - 12 - fitted.height) // 2
        sheet.paste(fitted, (image_left, image_top))
        draw.rectangle(
            (left + 6, top + IMAGE_HEIGHT - 4, left + CELL_WIDTH - 6, top + CELL_HEIGHT - 6),
            fill="#071827",
        )
        draw.text(
            (left + 16, top + IMAGE_HEIGHT + 7),
            f"{index + 1:02d}  {label}",
            fill="#e6f7ff",
            font=label_font,
        )

    sheet.save(OUTPUT, optimize=True)
    print(OUTPUT)


if __name__ == "__main__":
    main()
