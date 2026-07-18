from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ALPHA_DIR = ROOT / "tmp" / "imagegen" / "flight-motion-pack" / "alpha"
ALPHA_DIR_V3 = ROOT / "tmp" / "imagegen" / "flight-motion-pack-v3" / "alpha"
OUT = ROOT / "public" / "game-art" / "generated" / "scicon-flight-motion-pack-v1"
PRIMARY_COMPONENT_CLEANUP_SLUGS = frozenset({"bio", "btc-token-ship"})


@dataclass(frozen=True)
class SheetSpec:
    slug: str
    title: str
    role: str
    source: str
    states: tuple[str, ...]
    canvas: int
    fps: int
    preview_order: tuple[int, ...]


SPECS = (
    SheetSpec("researchhub", "ResearchHub Five-View Steering", "ships", "researchhub-steering-source-alpha.png", ("hard-left", "bank-left", "neutral", "bank-right", "hard-right"), 256, 10, (2, 1, 0, 1, 2, 3, 4, 3)),
    SheetSpec("bio", "BIO Five-View Steering", "ships", "bio-steering-source-alpha.png", ("hard-left", "bank-left", "neutral", "bank-right", "hard-right"), 256, 10, (2, 1, 0, 1, 2, 3, 4, 3)),
    SheetSpec("eth", "ETH Five-View Steering", "ships", "eth-steering-source-alpha.png", ("hard-left", "bank-left", "neutral", "bank-right", "hard-right"), 256, 10, (2, 1, 0, 1, 2, 3, 4, 3)),
    SheetSpec("btc-token-ship", "BTC Token Five-View Steering", "ships", "btc-steering-source-alpha.png", ("hard-left", "bank-left", "neutral", "bank-right", "hard-right"), 256, 10, (2, 1, 0, 1, 2, 3, 4, 3)),
    SheetSpec("researchhub-selection-idle", "ResearchHub Selection Pulse", "ships", "researchhub-selection-idle-source-alpha.png", ("rest", "flask-pulse", "top-antenna-pulse", "side-sensors-pulse", "rest-hold", "settle"), 256, 5, (0, 1, 2, 3, 4, 5)),
    SheetSpec("bio-selection-idle", "BIO Selection Pulse", "ships", "bio-selection-idle-source-alpha.png", ("rest", "gene-core-pulse", "upper-channel-pulse", "sensor-pod-pulse", "rest-hold", "settle"), 256, 5, (0, 1, 2, 3, 4, 5)),
    SheetSpec("eth-selection-idle", "ETH Selection Pulse", "ships", "eth-selection-idle-source-alpha.png", ("rest", "reactor-pulse", "crystal-pulse", "wing-conduit-pulse", "rest-hold", "settle"), 256, 5, (0, 1, 2, 3, 4, 5)),
    SheetSpec("btc-token-ship-selection-idle", "BTC Token Selection Pulse", "ships", "btc-token-ship-selection-idle-source-alpha.png", ("rest", "hash-rail-pulse", "upper-rail-pulse", "token-rim-pulse", "rest-hold", "settle"), 256, 5, (0, 1, 2, 3, 4, 5)),
    SheetSpec("paywall-interceptor", "Paywall Interceptor Motion", "enemies", "paywall-interceptor-motion-source-alpha.png", ("contracted", "neutral", "charged"), 256, 8, (0, 1, 2, 1)),
    SheetSpec("citation-wraith", "Citation Wraith Motion", "enemies", "citation-wraith-motion-source-alpha.png", ("contracted", "neutral", "charged"), 256, 8, (0, 1, 2, 1)),
    SheetSpec("peer-review-bulwark", "Peer Review Bulwark Motion", "enemies", "peer-review-bulwark-motion-source-alpha.png", ("guard-low", "neutral", "guard-high"), 256, 7, (0, 1, 2, 1)),
    SheetSpec("predatory-journal-raider", "Predatory Journal Raider Motion", "enemies", "predatory-journal-raider-motion-source-alpha.png", ("wings-in", "neutral", "wings-out"), 256, 9, (0, 1, 2, 1)),
    SheetSpec("bottleneck-harvester", "Bottleneck Harvester Mini-Boss", "bosses", "bottleneck-harvester-sheet-source-alpha.png", ("idle", "neutral", "attack", "damage-50", "critical-15"), 512, 7, (0, 1, 2, 1, 0, 3, 4, 4, 3)),
    SheetSpec("paywall-bastion", "Paywall Bastion Mini-Boss", "bosses", "paywall-bastion-sheet-source-alpha.png", ("idle", "neutral", "attack", "damage-50", "critical-15"), 512, 7, (0, 1, 2, 1, 0, 3, 4, 4, 3)),
)


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").getbbox()
    if not bbox:
        raise ValueError("Frame is fully transparent")
    return bbox


def normalize(cell: Image.Image, canvas: int) -> Image.Image:
    cropped = cell.crop(alpha_bbox(cell))
    usable = int(canvas * 0.86)
    scale = min(usable / cropped.width, usable / cropped.height)
    resized = cropped.resize(
        (max(1, round(cropped.width * scale)), max(1, round(cropped.height * scale))),
        Image.Resampling.LANCZOS,
    )
    result = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    result.alpha_composite(resized, ((canvas - resized.width) // 2, (canvas - resized.height) // 2))
    return result


def primary_component_crop(cell: Image.Image, padding: int = 8) -> Image.Image:
    """Remove isolated neighboring-frame debris without changing the ship silhouette."""
    alpha = cell.getchannel("A")
    width, height = alpha.size
    pixels = alpha.load()
    remaining = {
        (x, y)
        for y in range(height)
        for x in range(width)
        if pixels[x, y] >= 16
    }
    components: list[list[tuple[int, int]]] = []

    while remaining:
        seed = remaining.pop()
        pending = [seed]
        component = [seed]
        while pending:
            x, y = pending.pop()
            for neighbor_x in range(max(0, x - 1), min(width, x + 2)):
                for neighbor_y in range(max(0, y - 1), min(height, y + 2)):
                    neighbor = (neighbor_x, neighbor_y)
                    if neighbor in remaining:
                        remaining.remove(neighbor)
                        pending.append(neighbor)
                        component.append(neighbor)
        components.append(component)

    if not components:
        raise ValueError("Frame is fully transparent")

    primary = max(components, key=len)
    xs = [point[0] for point in primary]
    ys = [point[1] for point in primary]
    left = max(0, min(xs) - padding)
    top = max(0, min(ys) - padding)
    right = min(width, max(xs) + padding + 1)
    bottom = min(height, max(ys) + padding + 1)
    return cell.crop((left, top, right, bottom))


def split_equal(
    source: Image.Image,
    count: int,
    canvas: int,
    retain_primary_component: bool = False,
) -> list[Image.Image]:
    frames = []
    for index in range(count):
        left = round(index * source.width / count)
        right = round((index + 1) * source.width / count)
        cell = source.crop((left, 0, right, source.height))
        if retain_primary_component:
            cell = primary_component_crop(cell)
        frames.append(normalize(cell, canvas))
    return frames


def split_registered_selection_idle(source: Image.Image, count: int, canvas: int) -> list[Image.Image]:
    """Keep every selection-idle frame at one scale and move the full ship as one unit."""
    cells = []
    for index in range(count):
        left = round(index * source.width / count)
        right = round((index + 1) * source.width / count)
        cells.append(source.crop((left, 0, right, source.height)))

    reference_bbox = alpha_bbox(cells[0])
    reference_width = reference_bbox[2] - reference_bbox[0]
    reference_height = reference_bbox[3] - reference_bbox[1]
    usable = int(canvas * 0.86)
    scale = min(usable / reference_width, usable / reference_height)
    resized_size = (max(1, round(reference_width * scale)), max(1, round(reference_height * scale)))

    frames = []
    for cell in cells:
        bbox = alpha_bbox(cell)
        center_x = (bbox[0] + bbox[2]) / 2
        crop_left = round(center_x - reference_width / 2)
        crop_top = bbox[1]
        fixed_crop = cell.crop((crop_left, crop_top, crop_left + reference_width, crop_top + reference_height))
        resized = fixed_crop.resize(resized_size, Image.Resampling.LANCZOS)
        frame = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
        frame.alpha_composite(resized, ((canvas - resized.width) // 2, (canvas - resized.height) // 2))
        frames.append(frame)

    return frames


def preview_background(size: int) -> Image.Image:
    background = Image.new("RGBA", (size, size), "#071126")
    draw = ImageDraw.Draw(background)
    for x, y, color in ((29, 38, "#1fd1ff"), (77, 91, "#7357ff"), (151, 46, "#ffffff"), (208, 167, "#20e3b2"), (231, 28, "#f5b942"), (44, 211, "#d56aff")):
        draw.rectangle((x * size // 256, y * size // 256, x * size // 256 + max(1, size // 160), y * size // 256 + max(1, size // 160)), fill=color)
    return background


def composite_preview(frame: Image.Image) -> Image.Image:
    size = frame.width
    background = preview_background(size)
    glow = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    alpha = frame.getchannel("A")
    tint = Image.new("RGBA", frame.size, (35, 211, 255, 90))
    glow.paste(tint, mask=alpha)
    background.alpha_composite(glow)
    background.alpha_composite(frame)
    return background.convert("P", palette=Image.Palette.ADAPTIVE, colors=255)


def font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    candidates = (
        Path("C:/Windows/Fonts/arialbd.ttf") if bold else Path("C:/Windows/Fonts/arial.ttf"),
        Path("C:/Windows/Fonts/segoeuib.ttf") if bold else Path("C:/Windows/Fonts/segoeui.ttf"),
    )
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


def relative(path: Path) -> str:
    return "/" + path.relative_to(ROOT / "public").as_posix()


def build() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    manifest_assets = []
    overview_cards: list[tuple[SheetSpec, Image.Image]] = []

    for spec in SPECS:
        source_path = (ALPHA_DIR_V3 if spec.role == "ships" else ALPHA_DIR) / spec.source
        if not source_path.exists():
            raise FileNotFoundError(source_path)
        source = Image.open(source_path).convert("RGBA")
        frames = (
            split_registered_selection_idle(source, len(spec.states), spec.canvas)
            if spec.slug.endswith("-selection-idle")
            else split_equal(
                source,
                len(spec.states),
                spec.canvas,
                retain_primary_component=spec.slug in PRIMARY_COMPONENT_CLEANUP_SLUGS,
            )
        )
        if spec.slug == "researchhub":
            # Keep the two hard-bank silhouettes perfectly matched. The live
            # motion map intentionally reads these filenames in reverse because
            # the original ResearchHub perspective reads opposite in gameplay.
            frames[-1] = frames[0].transpose(Image.Transpose.FLIP_LEFT_RIGHT)

        base = OUT / spec.role / spec.slug
        frames_dir = base / "frames"
        previews_dir = base / "previews"
        frames_dir.mkdir(parents=True, exist_ok=True)
        previews_dir.mkdir(parents=True, exist_ok=True)

        frame_paths = []
        for index, (state, frame) in enumerate(zip(spec.states, frames), start=1):
            path = frames_dir / f"{spec.slug}-{index:02d}-{state}.png"
            frame.save(path, optimize=True)
            frame_paths.append(path)

        sheet = Image.new("RGBA", (spec.canvas * len(frames), spec.canvas), (0, 0, 0, 0))
        for index, frame in enumerate(frames):
            sheet.alpha_composite(frame, (index * spec.canvas, 0))
        sheet_path = base / f"{spec.slug}-sprite-sheet.png"
        sheet.save(sheet_path, optimize=True)

        preview_frames = [composite_preview(frames[index]) for index in spec.preview_order]
        preview_path = previews_dir / f"{spec.slug}-animation-preview.gif"
        preview_frames[0].save(
            preview_path,
            save_all=True,
            append_images=preview_frames[1:],
            duration=max(70, round(1000 / spec.fps)),
            loop=0,
            disposal=2,
            optimize=False,
        )

        overview_index = spec.states.index("neutral") if "neutral" in spec.states else 0
        overview_cards.append((spec, composite_preview(frames[overview_index]).convert("RGBA")))
        manifest_assets.append(
            {
                "id": spec.slug,
                "title": spec.title,
                "role": spec.role,
                "fps": spec.fps,
                "loop": "selection-idle" if spec.slug.endswith("-selection-idle") else ("ping-pong" if spec.role != "ships" else "input-driven"),
                "states": list(spec.states),
                "frames": [relative(path) for path in frame_paths],
                "sheet": relative(sheet_path),
                "previewGif": relative(preview_path),
                "productionNote": "Use PNG frames in Pixi; GIF is gallery preview only.",
            }
        )

    manifest = {
        "id": "scicon-flight-motion-pack-v1",
        "version": 1,
        "created": "2026-07-17",
        "style": "premium semi-pixel Scicon arcade",
        "assets": manifest_assets,
        "steeringContract": {
            "recommendedDeadzone": 0.12,
            "recommendedBlendMs": 90,
            "stateThresholds": {
                "hard-left": "normalized horizontal input/velocity <= -0.95",
                "bank-left": "-0.95 < normalized horizontal input/velocity < -0.42",
                "neutral": "-0.42 <= normalized horizontal input/velocity <= 0.42",
                "bank-right": "0.42 < normalized horizontal input/velocity < 0.95",
                "hard-right": "normalized horizontal input/velocity >= 0.95",
            },
            "bankingRule": "Use full redrawn views: broad neutral, 3/4 bank, then a narrow nearly edge-on hard-bank profile. The nose still points toward 12 o'clock; never rotate one flat texture in the image plane.",
            "hitboxInvariant": "Changing steering frames must never change collision geometry.",
        },
        "selectionIdleContract": {
            "targetShips": ["researchhub", "bio", "eth", "btc-token-ship"],
            "fps": 5,
            "productionUse": "ship selection screen only",
            "fixedRegistration": True,
            "animatedComponents": {
                "researchhub": ["central flask/core", "top antenna node", "side sensors/canisters"],
                "bio": ["gene membrane/core", "upper seed channel", "outer sensor pods"],
                "eth": ["central diamond reactor", "upper crystal facets", "wing conduits"],
                "btc-token-ship": ["central hash rails", "upper token rails", "outer token rim/side nodes"],
            },
            "rule": "Keep identical scale and registration in every frame. Treat the hull and boosters as one composited ship so they never separate while the named components pulse.",
        },
        "enemyAnimationContract": {
            "mode": "ping-pong",
            "recommendedFpsRange": [7, 9],
            "desynchronize": True,
        },
        "bossDamageContract": {
            "idleFrames": [0, 1, 2],
            "damage50Frame": 3,
            "critical15Frame": 4,
            "damageFramesArePresentationOnly": True,
        },
    }
    (OUT / "pack-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    card_w, card_h = 360, 430
    columns = 5
    rows = (len(overview_cards) + columns - 1) // columns
    overview = Image.new("RGB", (columns * card_w, rows * card_h + 90), "#050b1d")
    draw = ImageDraw.Draw(overview)
    draw.text((34, 20), "SCICON FLIGHT MOTION PACK v1", font=font(34, True), fill="#eaf7ff")
    draw.text((35, 59), "4 steering sets | 4 selection idles | 4 enemy loops | 2 mini-boss damage rigs", font=font(19), fill="#6fe7ff")
    for index, (spec, art) in enumerate(overview_cards):
        col = index % columns
        row = index // columns
        x = col * card_w
        y = 90 + row * card_h
        draw.rounded_rectangle((x + 12, y + 12, x + card_w - 12, y + card_h - 12), radius=20, fill="#0a1834", outline="#1b75a5", width=3)
        target = art.resize((300, 300), Image.Resampling.LANCZOS)
        overview.paste(target.convert("RGB"), (x + 30, y + 36))
        draw.text((x + 28, y + 350), spec.title, font=font(18, True), fill="#f5fbff")
        draw.text((x + 28, y + 380), f"{len(spec.states)} PNG frames | {spec.role}", font=font(15), fill="#88b9d4")
    overview.save(OUT / "scicon-flight-motion-pack-overview.png", optimize=True)


if __name__ == "__main__":
    build()
