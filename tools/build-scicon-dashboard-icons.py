from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "tmp" / "imagegen" / "dashboard-icons-v1" / "alpha"
OUT = ROOT / "public" / "game-art" / "generated" / "ui" / "scicon-dashboard-icons-v1"
CANVAS = 256


@dataclass(frozen=True)
class IconSpec:
    slug: str
    title: str
    family: str
    source: str
    cell: int
    role: str


SPECS = (
    IconSpec("home", "Home", "primary-navigation", "primary", 0, "Dashboard home and command center"),
    IconSpec("science", "Science", "primary-navigation", "addon", 0, "Science laboratory and research activity"),
    IconSpec("proposals", "Proposals", "primary-navigation", "addon", 1, "Science proposals and approvals"),
    IconSpec("missions", "Missions", "primary-navigation", "primary", 1, "Quick play and mission launch"),
    IconSpec("map-sectors", "Map", "primary-navigation", "primary", 2, "Sector map and stage selection"),
    IconSpec("hangar-ships", "Hangar", "primary-navigation", "primary", 3, "Player ships and hangar"),
    IconSpec("research-proposals", "Research", "primary-navigation", "primary", 4, "Research proposals and experiments"),
    IconSpec("trophies-leaderboard", "Trophies", "primary-navigation", "primary", 5, "Achievements and leaderboard"),
    IconSpec("funding-wallet", "Funding", "primary-navigation", "primary", 6, "Funding credits and wallet"),
    IconSpec("inventory-upgrades", "Upgrades", "primary-navigation", "primary", 7, "Inventory and upgrade systems"),
    IconSpec("more", "More", "primary-navigation", "addon", 2, "Additional navigation options"),
    IconSpec("profile-squad", "Profile", "dashboard-system", "secondary", 0, "Player profile and squad identity"),
    IconSpec("notifications-inbox", "Inbox", "dashboard-system", "secondary", 1, "Notifications and messages"),
    IconSpec("settings", "Settings", "dashboard-system", "secondary", 2, "Game and account settings"),
    IconSpec("weekly-calendar", "Weekly", "dashboard-system", "secondary", 3, "Weekly program and calendar"),
    IconSpec("market-store", "Market", "dashboard-system", "secondary", 4, "Marketplace and supply store"),
    IconSpec("stats-records", "Records", "dashboard-system", "secondary", 5, "Statistics, high scores, and records"),
    IconSpec("multiplayer-network", "Multiplayer", "dashboard-system", "secondary", 6, "Multiplayer and connected squads"),
    IconSpec("help-feedback", "Help", "dashboard-system", "secondary", 7, "Help, support, and feedback"),
    IconSpec("security-lock", "Security", "dashboard-system", "secondary", 8, "Locked, protected, or secured features"),
)


def font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    candidates = (
        Path("C:/Windows/Fonts/arialbd.ttf") if bold else Path("C:/Windows/Fonts/arial.ttf"),
        Path("C:/Windows/Fonts/segoeuib.ttf") if bold else Path("C:/Windows/Fonts/segoeui.ttf"),
    )
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


def public_path(path: Path) -> str:
    return "/" + path.relative_to(ROOT / "public").as_posix()


def split_grid(source: Image.Image, columns: int = 3, rows: int = 3) -> list[Image.Image]:
    cells = []
    for row in range(rows):
        top = round(row * source.height / rows)
        bottom = round((row + 1) * source.height / rows)
        for column in range(columns):
            left = round(column * source.width / columns)
            right = round((column + 1) * source.width / columns)
            cells.append(source.crop((left, top, right, bottom)))
    return cells


def normalize(cell: Image.Image) -> Image.Image:
    bbox = cell.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("Icon cell is fully transparent")
    cropped = cell.crop(bbox)
    usable = round(CANVAS * 0.78)
    scale = min(usable / cropped.width, usable / cropped.height)
    resized = cropped.resize(
        (max(1, round(cropped.width * scale)), max(1, round(cropped.height * scale))),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    canvas.alpha_composite(resized, ((CANVAS - resized.width) // 2, (CANVAS - resized.height) // 2))
    return canvas


def selected_variant(icon: Image.Image) -> Image.Image:
    alpha = icon.getchannel("A")
    wide = alpha.filter(ImageFilter.GaussianBlur(12))
    tight = alpha.filter(ImageFilter.GaussianBlur(5))
    wide = wide.point(lambda value: round(value * 0.38))
    tight = tight.point(lambda value: round(value * 0.52))
    canvas = Image.new("RGBA", icon.size, (0, 0, 0, 0))
    cyan_glow = Image.new("RGBA", icon.size, (17, 211, 255, 0))
    cyan_glow.putalpha(wide)
    canvas.alpha_composite(cyan_glow)
    white_glow = Image.new("RGBA", icon.size, (170, 246, 255, 0))
    white_glow.putalpha(tight)
    canvas.alpha_composite(white_glow)
    canvas.alpha_composite(icon)
    return canvas


def build_atlas(icons: list[Image.Image]) -> Image.Image:
    columns, rows = 5, 4
    atlas = Image.new("RGBA", (columns * CANVAS, rows * CANVAS), (0, 0, 0, 0))
    for index, icon in enumerate(icons):
        atlas.alpha_composite(icon, ((index % columns) * CANVAS, (index // columns) * CANVAS))
    return atlas


def dashboard_strip(specs: tuple[IconSpec, ...], states: dict[str, dict[str, Image.Image]], active: int, size: tuple[int, int]) -> Image.Image:
    width, height = size
    canvas = Image.new("RGB", size, "#050a18")
    draw = ImageDraw.Draw(canvas)
    cell_width = width // len(specs)
    for index, spec in enumerate(specs):
        left = index * cell_width
        right = width if index == len(specs) - 1 else left + cell_width
        selected = index == active
        fill = "#0b3150" if selected else "#07152b"
        outline = "#25d8ff" if selected else "#2a5274"
        draw.rectangle((left + 3, 3, right - 3, height - 3), fill=fill, outline=outline, width=3)
        icon = states[spec.slug]["selected" if selected else "normal"].resize((126, 126), Image.Resampling.LANCZOS)
        canvas.paste(icon, (left + (cell_width - 126) // 2, 22), icon)
        label_font = font(28, True)
        box = draw.textbbox((0, 0), spec.title, font=label_font)
        draw.text((left + (cell_width - (box[2] - box[0])) // 2, 158), spec.title, font=label_font, fill="#f2fbff" if selected else "#91acc3")
        if selected:
            marker_x = left + cell_width // 2
            draw.ellipse((marker_x - 6, height - 23, marker_x + 6, height - 11), fill="#f5c542")
    return canvas


def build_overview(states: dict[str, dict[str, Image.Image]], nav_preview: Image.Image) -> Image.Image:
    canvas = Image.new("RGB", (1800, 1780), "#050a18")
    draw = ImageDraw.Draw(canvas)
    draw.text((55, 30), "SCICON DASHBOARD ICONS V1", font=font(44, True), fill="#e8f7ff")
    draw.text((55, 84), "20 original semi-pixel dashboard pictograms + normal and selected states", font=font(24), fill="#69d9ff")
    canvas.paste(nav_preview.resize((1690, 312), Image.Resampling.LANCZOS), (55, 135))

    card_width, card_height = 320, 285
    start_x, start_y, gap_x, gap_y = 55, 500, 20, 22
    for index, spec in enumerate(SPECS):
        column = index % 5
        row = index // 5
        x = start_x + column * (card_width + gap_x)
        y = start_y + row * (card_height + gap_y)
        draw.rounded_rectangle((x, y, x + card_width, y + card_height), radius=18, fill="#0b1730", outline="#238dbc", width=2)
        icon = states[spec.slug]["normal"].resize((190, 190), Image.Resampling.LANCZOS)
        canvas.paste(icon, (x + 65, y + 18), icon)
        title_font = font(22, True)
        box = draw.textbbox((0, 0), spec.title, font=title_font)
        draw.text((x + (card_width - (box[2] - box[0])) // 2, y + 220), spec.title, font=title_font, fill="#f5c75a")
        draw.text((x + 18, y + 255), spec.family.replace("-", " ").upper(), font=font(13, True), fill="#75a7c7")
    return canvas


def build_selection_gif(specs: tuple[IconSpec, ...], states: dict[str, dict[str, Image.Image]], path: Path) -> None:
    frames = []
    for active in range(len(specs)):
        frame = dashboard_strip(specs, states, active, (1200, 245))
        frames.append(frame.convert("P", palette=Image.Palette.ADAPTIVE, colors=255))
    frames[0].save(path, save_all=True, append_images=frames[1:], duration=650, loop=0, disposal=2, optimize=False)


def build() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    cells = {
        "primary": split_grid(Image.open(SOURCE / "dashboard-primary-icons-alpha.png").convert("RGBA")),
        "secondary": split_grid(Image.open(SOURCE / "dashboard-secondary-icons-alpha.png").convert("RGBA")),
        "addon": split_grid(Image.open(SOURCE / "dashboard-science-proposals-more-alpha.png").convert("RGBA"), 3, 1),
    }
    states: dict[str, dict[str, Image.Image]] = {}
    assets = []
    normal_icons = []
    selected_icons = []

    for spec in SPECS:
        normal = normalize(cells[spec.source][spec.cell])
        selected = selected_variant(normal)
        states[spec.slug] = {"normal": normal, "selected": selected}
        normal_dir = OUT / "normal"
        selected_dir = OUT / "selected"
        normal_dir.mkdir(exist_ok=True)
        selected_dir.mkdir(exist_ok=True)
        normal_path = normal_dir / f"{spec.slug}.png"
        selected_path = selected_dir / f"{spec.slug}-selected.png"
        normal.save(normal_path, optimize=True)
        selected.save(selected_path, optimize=True)
        normal_icons.append(normal)
        selected_icons.append(selected)
        assets.append(
            {
                "id": spec.slug,
                "title": spec.title,
                "family": spec.family,
                "role": spec.role,
                "size": [CANVAS, CANVAS],
                "normal": public_path(normal_path),
                "selected": public_path(selected_path),
                "anchor": [0.5, 0.5],
            }
        )

    atlas_dir = OUT / "atlases"
    atlas_dir.mkdir(exist_ok=True)
    normal_atlas_path = atlas_dir / "dashboard-icons-normal-atlas-5x4.png"
    selected_atlas_path = atlas_dir / "dashboard-icons-selected-atlas-5x4.png"
    build_atlas(normal_icons).save(normal_atlas_path, optimize=True)
    build_atlas(selected_icons).save(selected_atlas_path, optimize=True)
    for legacy_atlas in (
        atlas_dir / "dashboard-icons-normal-atlas-6x3.png",
        atlas_dir / "dashboard-icons-selected-atlas-6x3.png",
    ):
        legacy_atlas.unlink(missing_ok=True)

    preview_dir = OUT / "previews"
    preview_dir.mkdir(exist_ok=True)
    spec_by_slug = {spec.slug: spec for spec in SPECS}
    nav_specs = tuple(spec_by_slug[slug] for slug in ("home", "science", "proposals", "trophies-leaderboard", "more"))
    nav_preview = dashboard_strip(nav_specs, states, 0, (1500, 275))
    nav_preview_path = preview_dir / "dashboard-navigation-preview.png"
    nav_preview.save(nav_preview_path, optimize=True)
    selection_gif_path = preview_dir / "dashboard-navigation-selection-preview.gif"
    build_selection_gif(nav_specs, states, selection_gif_path)

    overview_path = OUT / "scicon-dashboard-icons-v1-overview.png"
    build_overview(states, nav_preview).save(overview_path, optimize=True)

    manifest = {
        "id": "scicon-dashboard-icons-v1",
        "version": 2,
        "generated": date.today().isoformat(),
        "overview": public_path(overview_path),
        "navigationPreview": public_path(nav_preview_path),
        "selectionPreviewGif": public_path(selection_gif_path),
        "normalAtlas": public_path(normal_atlas_path),
        "selectedAtlas": public_path(selected_atlas_path),
        "assets": assets,
        "runtimeProtocol": {
            "labels": "Render navigation labels as live text below the icon; labels are intentionally absent from PNG files.",
            "state": "Use normal in inactive cards/tabs and selected while active, hovered, or keyboard-focused.",
            "notifications": "Notification counts and orange/red attention dots are separate overlays, never baked into an icon.",
            "sizing": "All production icons share a 256 x 256 transparent canvas and center anchor, so they can be swapped without layout drift.",
        },
        "productionNotes": [
            "Use the individual PNG files for UI implementation; atlas and GIF files are gallery/integration conveniences.",
            "Keep labels, lock state, counts, and notification dots independent from icon artwork.",
            "Use the separate science and proposals icons for dashboard navigation. The combined research-proposals identity remains available for backward compatibility.",
            "The supplied app screenshots were used only for functional inspiration; every Scicon icon was newly designed.",
        ],
    }
    (OUT / "pack-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    readme = """# Scicon Dashboard Icons v1

This pack contains 20 original dashboard pictograms. Every identity has a normal
and selected PNG on the same 256 x 256 transparent canvas.

Science and Proposals are separate navigation identities. The earlier combined
Research icon remains in the pack for backward compatibility.

Render dashboard labels, notification counts, attention dots, and lock overlays
as live UI above these icons. Use the normal state for inactive navigation and
the selected state for active, hover, or keyboard-focus presentation.

The atlas PNGs and animated navigation preview are implementation/gallery aids.
Production may import individual state files from `normal/` and `selected/`.
"""
    (OUT / "README.md").write_text(readme, encoding="utf-8")


if __name__ == "__main__":
    build()
