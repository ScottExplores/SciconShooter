"""Build the canonical Helios Clawcarrier V2 key-pose review sheet."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
REVIEW_DIR = ROOT / "director-data" / "prototype-assets" / "helios-clawcarrier-v2" / "review"
OUTPUT = REVIEW_DIR / "helios-clawcarrier-v2-key-pose-contact-sheet.png"

CELL_WIDTH = 400
CELL_HEIGHT = 330
IMAGE_HEIGHT = 286
HEADER_HEIGHT = 76
COLUMNS = 4

POSES = (
    ("Neutral / connected rig", "neutral-mobile-clean.png", (340, 62, 783, 440)),
    ("Armor Shear / body open", "armor-shear-transition.png", (340, 62, 783, 440)),
    ("Overdrive / persistent damage", "reactor-overdrive-damage.png", (340, 62, 783, 440)),
    ("Rotaries / anatomy-owned fire", "twin-rotary-crossfire-first-beat.png", (340, 72, 783, 480)),
    ("Port claw / maximum reach", "claw-sweep-pincer-telegraph.png", (340, 92, 783, 520)),
    ("Pincer / maximum closure", "claw-sweep-pincer-peak-danger.png", (340, 92, 783, 520)),
    ("Reactor / aperture charge", "reactor-maze-telegraph.png", (340, 92, 783, 520)),
    ("Reactor / first pulse", "reactor-maze-first-beat.png", (340, 92, 783, 520)),
    ("Crush / committed dive", "clawcarrier-crush-peak-danger.png", (340, 510, 783, 958)),
    ("Stagger / significant hit", "stagger-heavy-hit.png", (340, 92, 783, 520)),
    ("Destruction / combat cleared", "destruction-peak.png", (340, 80, 783, 650)),
    ("Reference / aligned overlay", "neutral-reference-over.png", (340, 62, 783, 440)),
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

    draw.text((22, 13), "HELIOS CLAWCARRIER V2 — KEY POSE REVIEW", fill="#83e9ff", font=title_font)
    draw.text(
        (24, 49),
        "Canonical gameplay captures • mobile canvas • fixed review seed",
        fill="#8eaabd",
        font=subtitle_font,
    )

    for index, (label, filename, crop_box) in enumerate(POSES):
        source_path = REVIEW_DIR / filename
        if not source_path.exists():
            raise FileNotFoundError(source_path)
        source = Image.open(source_path).convert("RGB").crop(crop_box)
        fitted = ImageOps.fit(
            source,
            (CELL_WIDTH - 12, IMAGE_HEIGHT - 12),
            method=Image.Resampling.NEAREST,
            centering=(0.5, 0.5),
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
        sheet.paste(fitted, (left + 6, top + 6))
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
