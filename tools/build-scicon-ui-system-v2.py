#!/usr/bin/env python3
"""Package the Orbital Research Command UI system from generated master sheets.

The generator outputs flat-magenta sheets. This builder consumes the locally
chroma-removed versions, groups each sheet into eight semantic objects, exports
transparent production PNGs and interaction states, and renders gallery proofs.
Runtime text stays separate from every production asset.
"""

from __future__ import annotations

import json
import math
import shutil
from collections import deque
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = PROJECT_ROOT / "tmp/imagegen/scicon-ui-system-v2/transparent"
OUTPUT_ROOT = PROJECT_ROOT / "public/game-art/generated/ui/scicon-ui-system-v2"


@dataclass(frozen=True)
class SheetSpec:
    filename: str
    family: str
    names: tuple[str, ...]
    animation_id: str | None = None
    layout: str = "grid"


SHEETS = (
    SheetSpec("01-app-shell.png", "shell", ("app-shell-mobile", "top-status-rail", "bottom-navigation-rail", "modal-full", "modal-compact", "scrolling-list", "content-card", "tooltip-callout")),
    SheetSpec("02-hud-primary.png", "hud-primary", ("lives-health-capsule", "flask-charge-meter", "score-counter", "high-score-plaque", "wave-sector-badge", "pause-control", "boss-integrity-bar", "sector-progress-rail")),
    SheetSpec("03-hud-actions.png", "hud-actions", ("bomb-ability-slot", "rapid-fire-upgrade-slot", "speed-upgrade-slot", "extra-life-upgrade-slot", "locked-ability-slot", "ready-glow-ring", "max-status-badge", "cost-count-badge")),
    SheetSpec("04-leaderboard-podium.png", "leaderboard-podium", ("first-place-row", "second-place-row", "third-place-row", "standard-leaderboard-row", "first-place-medal", "second-place-medal", "third-place-medal", "champion-divider"), None, "components"),
    SheetSpec("05-weekly-competition.png", "weekly-competition", ("weekly-winner-feature", "weekly-countdown-plaque", "funding-allocation-plaque", "season-week-badge", "live-status-beacon", "weekly-score-chip", "weekly-wave-chip", "archived-winner-card")),
    SheetSpec("06-funding-proposals.png", "funding-proposals", ("proposal-card", "proposal-card-selected", "proposal-card-confirmed", "funding-progress-bar", "allocation-amount-badge", "treasury-address-field", "copy-action", "external-send-action")),
    SheetSpec("07-records-wallet.png", "records-wallet", ("mission-record-frame", "mint-preview-frame", "server-verified-seal", "review-seal", "local-unverified-seal", "wallet-connect-button", "wallet-connected-plaque", "transaction-status-frame")),
    SheetSpec("08-home-navigation.png", "home-navigation", ("hero-ship-carousel", "launch-primary-button", "previous-arrow", "next-arrow", "navigation-tab-active", "navigation-tab-inactive", "market-action-card", "notification-count-chip")),
    SheetSpec("09-pause-settings.png", "pause-settings", ("pause-menu-frame", "settings-menu-frame", "settings-slider", "settings-toggle", "audio-settings-row", "controls-settings-row", "resume-button", "quit-button")),
    SheetSpec("10-mission-results.png", "mission-results", ("game-over-result-frame", "mission-result-plaque", "weekly-lead-plaque", "pilot-name-input", "submit-confirm-button", "skip-later-button", "retry-button", "main-menu-button")),
    SheetSpec("11-tutorial-story.png", "tutorial-story", ("tutorial-frame", "tutorial-instruction-row", "transmission-portrait-frame", "transmission-dialogue-frame", "receiving-signal-indicator", "continue-deploy-button", "input-method-badge", "hazard-warning-plaque")),
    SheetSpec("12-hangar-upgrades.png", "hangar-upgrades", ("ship-selector-showcase", "locked-ship-card", "unlocked-ship-card", "upgrade-card", "maxed-upgrade-card", "segmented-stat-bar", "upgrade-cost-plaque", "equip-select-button")),
    SheetSpec("13-notifications-status.png", "notifications-status", ("success-strip", "warning-strip", "error-strip", "information-strip", "loading-placeholder", "empty-state-frame", "offline-status-plaque", "maintenance-status-plaque")),
    SheetSpec("14-achievements-more.png", "achievements-more", ("trophy-showcase-card", "achievement-locked-card", "achievement-unlocked-card", "season-rank-card", "referral-reward-card", "feedback-action-card", "treasury-funding-card", "external-ecosystem-card")),
    SheetSpec("15-form-controls.png", "form-controls", ("search-input", "multiline-text-area", "dropdown-select", "checkbox-control", "radio-control", "segmented-tabs", "scroll-track", "scroll-thumb")),
    SheetSpec("16-general-borders.png", "general-borders", ("avatar-frame", "square-image-frame", "portrait-frame", "cinematic-banner-frame", "stat-tile", "icon-tile", "information-card", "section-divider")),
    SheetSpec("17-champion-rig.png", "champion-rig", ("plaque-body", "crown-cap", "wing-left", "wing-right", "scan-bar", "first-medal", "energy-flare", "energy-glow"), "weekly-champion-reveal"),
    SheetSpec("18-funding-vault-rig.png", "funding-vault-rig", ("vault-frame-body", "shutter-left", "shutter-right", "research-core", "energy-ring", "mechanical-seal", "energy-beam", "energy-glow"), "funding-vault-unseal"),
    # This sheet arranged the first four requested objects as top clamp, card,
    # seal, bottom clamp rather than strict prompt order; names follow the
    # observed layout so production semantics remain correct.
    SheetSpec("19-record-verify-rig.png", "record-verify-rig", ("scanner-clamp-top", "record-card-body", "verified-seal", "scanner-clamp-bottom", "scan-strip", "status-lamp", "pulse-ring", "energy-glow"), "mission-record-verification"),
    SheetSpec("20-alert-rig.png", "alert-rig", ("alert-banner-body", "shutter-left", "shutter-right", "hazard-beacon", "caution-rail", "warning-crystal", "pulse-ring", "energy-glow"), "alert-banner-deploy"),
)


INTERACTIVE = {
    "content-card", "tooltip-callout", "pause-control", "bomb-ability-slot",
    "rapid-fire-upgrade-slot", "speed-upgrade-slot", "extra-life-upgrade-slot",
    "first-place-row", "second-place-row", "third-place-row", "standard-leaderboard-row",
    "weekly-winner-feature", "archived-winner-card", "proposal-card",
    "proposal-card-selected", "proposal-card-confirmed", "copy-action",
    "external-send-action", "wallet-connect-button", "hero-ship-carousel",
    "launch-primary-button", "previous-arrow", "next-arrow", "navigation-tab-active",
    "navigation-tab-inactive", "market-action-card", "settings-slider",
    "settings-toggle", "audio-settings-row", "controls-settings-row", "resume-button",
    "quit-button", "pilot-name-input", "submit-confirm-button", "skip-later-button",
    "retry-button", "main-menu-button", "tutorial-instruction-row", "continue-deploy-button",
    "locked-ship-card", "unlocked-ship-card", "upgrade-card", "maxed-upgrade-card",
    "equip-select-button", "trophy-showcase-card", "achievement-locked-card",
    "achievement-unlocked-card", "season-rank-card", "referral-reward-card",
    "feedback-action-card", "treasury-funding-card", "external-ecosystem-card",
    "search-input", "multiline-text-area", "dropdown-select", "checkbox-control",
    "radio-control", "segmented-tabs",
}

STATE_NAMES = ("hover", "pressed", "selected", "disabled")


def load_font(size: int) -> ImageFont.ImageFont:
    for path in (Path(r"C:\Windows\Fonts\segoeuib.ttf"), Path(r"C:\Windows\Fonts\arialbd.ttf")):
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def ease_out_back(value: float) -> float:
    c1, c3 = 1.70158, 2.70158
    x = value - 1
    return 1 + c3 * x * x * x + c1 * x * x


def alpha_trim(image: Image.Image, margin: int = 4) -> Image.Image:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("Asset contains no visible pixels")
    return image.crop((max(0, bbox[0] - margin), max(0, bbox[1] - margin), min(image.width, bbox[2] + margin), min(image.height, bbox[3] + margin)))


def extract_eight_objects(sheet: Image.Image) -> list[Image.Image]:
    """Group disconnected alpha components around the expected 4x2 layout."""
    alpha = sheet.getchannel("A")
    width, height = sheet.size
    # A higher connectivity threshold prevents soft chroma-matte halos from
    # joining neighboring cells into one giant component. The final crop still
    # restores the original antialiased alpha around each assigned object.
    active = bytearray(1 if value > 200 else 0 for value in alpha.get_flattened_data())
    labels = bytearray(width * height)
    seeds = [((column + 0.5) * width / 4, (row + 0.5) * height / 2) for row in range(2) for column in range(4)]
    group_bboxes: list[list[int] | None] = [None] * 8

    for start in range(width * height):
        if not active[start] or labels[start]:
            continue
        labels[start] = 255
        queue = deque([start])
        points: list[int] = []
        sum_x = sum_y = 0
        while queue:
            index = queue.popleft()
            points.append(index)
            x, y = index % width, index // width
            sum_x += x
            sum_y += y
            if x and active[index - 1] and not labels[index - 1]:
                labels[index - 1] = 255
                queue.append(index - 1)
            if x + 1 < width and active[index + 1] and not labels[index + 1]:
                labels[index + 1] = 255
                queue.append(index + 1)
            if y and active[index - width] and not labels[index - width]:
                labels[index - width] = 255
                queue.append(index - width)
            if y + 1 < height and active[index + width] and not labels[index + width]:
                labels[index + width] = 255
                queue.append(index + width)

        center_x, center_y = sum_x / len(points), sum_y / len(points)
        group = min(range(8), key=lambda candidate: (center_x - seeds[candidate][0]) ** 2 + (center_y - seeds[candidate][1]) ** 2)
        xs = [point % width for point in points]
        ys = [point // width for point in points]
        component_bbox = [min(xs), min(ys), max(xs) + 1, max(ys) + 1]
        current = group_bboxes[group]
        group_bboxes[group] = component_bbox if current is None else [min(current[0], component_bbox[0]), min(current[1], component_bbox[1]), max(current[2], component_bbox[2]), max(current[3], component_bbox[3])]
        for point in points:
            labels[point] = group + 1

    outputs: list[Image.Image] = []
    for group, bbox in enumerate(group_bboxes):
        if bbox is None:
            raise ValueError(f"Layout group {group + 1} was empty")
        margin = 5
        left, top = max(0, bbox[0] - margin), max(0, bbox[1] - margin)
        right, bottom = min(width, bbox[2] + margin), min(height, bbox[3] + margin)
        crop = sheet.crop((left, top, right, bottom))
        mask_bytes = bytes(255 if labels[y * width + x] == group + 1 else 0 for y in range(top, bottom) for x in range(left, right))
        mask = Image.frombytes("L", crop.size, mask_bytes).filter(ImageFilter.MaxFilter(5))
        crop_alpha = ImageChops.multiply(crop.getchannel("A"), mask)
        crop.putalpha(crop_alpha)
        outputs.append(alpha_trim(crop))
    return outputs


def extract_component_layout(sheet: Image.Image) -> list[Image.Image]:
    """Extract eight free-layout objects using component NMS and row ordering."""
    alpha = sheet.getchannel("A")
    width, height = sheet.size
    active = bytearray(1 if value > 200 else 0 for value in alpha.get_flattened_data())
    visited = bytearray(width * height)
    components: list[dict] = []
    for start in range(width * height):
        if not active[start] or visited[start]:
            continue
        visited[start] = 1
        queue = deque([start])
        points: list[int] = []
        sum_x = sum_y = 0
        min_x = min_y = 1 << 30
        max_x = max_y = 0
        while queue:
            index = queue.popleft()
            points.append(index)
            x, y = index % width, index // width
            sum_x += x
            sum_y += y
            min_x, min_y = min(min_x, x), min(min_y, y)
            max_x, max_y = max(max_x, x), max(max_y, y)
            if x and active[index - 1] and not visited[index - 1]:
                visited[index - 1] = 1
                queue.append(index - 1)
            if x + 1 < width and active[index + 1] and not visited[index + 1]:
                visited[index + 1] = 1
                queue.append(index + 1)
            if y and active[index - width] and not visited[index - width]:
                visited[index - width] = 1
                queue.append(index - width)
            if y + 1 < height and active[index + width] and not visited[index + width]:
                visited[index + width] = 1
                queue.append(index + width)
        if len(points) < 6:
            continue
        components.append({
            "points": points,
            "area": len(points),
            "center": (sum_x / len(points), sum_y / len(points)),
            "bbox": (min_x, min_y, max_x + 1, max_y + 1),
        })

    candidates: list[dict] = []
    for component in sorted(components, key=lambda item: item["area"], reverse=True):
        center_x, center_y = component["center"]
        is_child = False
        for selected in candidates:
            left, top, right, bottom = selected["bbox"]
            if left - 12 <= center_x <= right + 12 and top - 12 <= center_y <= bottom + 12:
                is_child = True
                break
            selected_x, selected_y = selected["center"]
            if (center_x - selected_x) ** 2 + (center_y - selected_y) ** 2 < 72 ** 2:
                is_child = True
                break
        if not is_child:
            candidates.append(component)
        if len(candidates) == 8:
            break
    if len(candidates) != 8:
        raise ValueError(f"Expected eight free-layout objects, found {len(candidates)}")

    assignments: list[list[dict]] = [[] for _ in candidates]
    for component in components:
        center_x, center_y = component["center"]
        containing = []
        for index, candidate in enumerate(candidates):
            left, top, right, bottom = candidate["bbox"]
            if left - 14 <= center_x <= right + 14 and top - 14 <= center_y <= bottom + 14:
                containing.append(index)
        if containing:
            group = min(containing, key=lambda index: candidates[index]["area"])
        else:
            group = min(range(8), key=lambda index: (center_x - candidates[index]["center"][0]) ** 2 + (center_y - candidates[index]["center"][1]) ** 2)
        assignments[group].append(component)

    labels = bytearray(width * height)
    group_bboxes: list[list[int]] = []
    group_centers: list[tuple[float, float]] = []
    for group, assigned in enumerate(assignments):
        left = min(component["bbox"][0] for component in assigned)
        top = min(component["bbox"][1] for component in assigned)
        right = max(component["bbox"][2] for component in assigned)
        bottom = max(component["bbox"][3] for component in assigned)
        group_bboxes.append([left, top, right, bottom])
        group_centers.append(((left + right) / 2, (top + bottom) / 2))
        for component in assigned:
            for point in component["points"]:
                labels[point] = group + 1

    by_y = sorted(range(8), key=lambda index: group_centers[index][1])
    rows: list[list[int]] = []
    for group in by_y:
        if not rows:
            rows.append([group])
            continue
        row_mean = sum(group_centers[index][1] for index in rows[-1]) / len(rows[-1])
        if abs(group_centers[group][1] - row_mean) <= 150:
            rows[-1].append(group)
        else:
            rows.append([group])
    order = [group for row in rows for group in sorted(row, key=lambda index: group_centers[index][0])]

    outputs: list[Image.Image] = []
    for group in order:
        bbox = group_bboxes[group]
        margin = 5
        left, top = max(0, bbox[0] - margin), max(0, bbox[1] - margin)
        right, bottom = min(width, bbox[2] + margin), min(height, bbox[3] + margin)
        crop = sheet.crop((left, top, right, bottom))
        mask_bytes = bytes(255 if labels[y * width + x] == group + 1 else 0 for y in range(top, bottom) for x in range(left, right))
        mask = Image.frombytes("L", crop.size, mask_bytes).filter(ImageFilter.MaxFilter(5))
        crop.putalpha(ImageChops.multiply(crop.getchannel("A"), mask))
        outputs.append(alpha_trim(crop))
    return outputs


def glow_under(image: Image.Image, color: tuple[int, int, int], strength: int = 95) -> Image.Image:
    alpha = image.getchannel("A").filter(ImageFilter.GaussianBlur(8))
    alpha = alpha.point(lambda value: min(255, value * strength // 255))
    glow = Image.new("RGBA", image.size, (*color, 0))
    glow.putalpha(alpha)
    glow.alpha_composite(image)
    return glow


def make_state(image: Image.Image, state: str) -> Image.Image:
    if state == "hover":
        enhanced = ImageEnhance.Brightness(ImageEnhance.Color(image).enhance(1.12)).enhance(1.10)
        return glow_under(enhanced, (34, 211, 238), 125)
    if state == "selected":
        enhanced = ImageEnhance.Brightness(ImageEnhance.Color(image).enhance(1.18)).enhance(1.08)
        return glow_under(enhanced, (52, 211, 153), 145)
    if state == "disabled":
        gray = ImageOps.grayscale(image.convert("RGB"))
        muted = ImageOps.colorize(gray, (4, 10, 24), (96, 122, 152)).convert("RGBA")
        muted.putalpha(image.getchannel("A").point(lambda value: value * 58 // 100))
        return muted
    if state == "pressed":
        dim = ImageEnhance.Brightness(image).enhance(0.84)
        scaled = dim.resize((max(1, round(image.width * 0.96)), max(1, round(image.height * 0.96))), Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", image.size, (0, 0, 0, 0))
        canvas.alpha_composite(scaled, ((image.width - scaled.width) // 2, min(image.height - scaled.height, (image.height - scaled.height) // 2 + 2)))
        return canvas
    raise ValueError(state)


def clear_edge_alpha(image: Image.Image, border: int = 2) -> Image.Image:
    """Guarantee transparent canvas corners after glow/state processing."""
    alpha = image.getchannel("A")
    draw = ImageDraw.Draw(alpha)
    draw.rectangle((0, 0, image.width - 1, border - 1), fill=0)
    draw.rectangle((0, image.height - border, image.width - 1, image.height - 1), fill=0)
    draw.rectangle((0, 0, border - 1, image.height - 1), fill=0)
    draw.rectangle((image.width - border, 0, image.width - 1, image.height - 1), fill=0)
    result = image.copy()
    result.putalpha(alpha)
    return result


def export_assets() -> tuple[list[dict], dict[str, Path]]:
    assets: list[dict] = []
    lookup: dict[str, Path] = {}
    sheets_output = OUTPUT_ROOT / "sprite-sheets"
    sheets_output.mkdir(parents=True, exist_ok=True)

    for sheet_spec in SHEETS:
        source_path = SOURCE_ROOT / sheet_spec.filename
        if not source_path.exists():
            raise FileNotFoundError(source_path)
        shutil.copy2(source_path, sheets_output / sheet_spec.filename)
        with Image.open(source_path) as source:
            try:
                sheet_image = source.convert("RGBA")
                if sheet_spec.layout == "components":
                    extracted = extract_component_layout(sheet_image)
                else:
                    try:
                        extracted = extract_eight_objects(sheet_image)
                    except ValueError:
                        extracted = extract_component_layout(sheet_image)
            except Exception as error:
                raise RuntimeError(f"Could not split {sheet_spec.filename}: {error}") from error
        for name, image in zip(sheet_spec.names, extracted, strict=True):
            if sheet_spec.animation_id:
                relative_path = Path("animations") / sheet_spec.animation_id / "parts" / f"{name}.png"
            else:
                relative_path = Path("base") / sheet_spec.family / f"{name}.png"
            output_path = OUTPUT_ROOT / relative_path
            output_path.parent.mkdir(parents=True, exist_ok=True)
            image.save(output_path, optimize=True)
            lookup[f"{sheet_spec.family}:{name}"] = output_path
            state_paths: dict[str, str] = {}
            if not sheet_spec.animation_id and name in INTERACTIVE:
                for state in STATE_NAMES:
                    state_path = OUTPUT_ROOT / "states" / sheet_spec.family / name / f"{state}.png"
                    state_path.parent.mkdir(parents=True, exist_ok=True)
                    clear_edge_alpha(make_state(image, state)).save(state_path, optimize=True)
                    state_paths[state] = state_path.relative_to(OUTPUT_ROOT).as_posix()
            assets.append({
                "id": f"{sheet_spec.family}:{name}",
                "family": sheet_spec.family,
                "name": name,
                "path": relative_path.as_posix(),
                "nativeSize": {"width": image.width, "height": image.height},
                "runtimeText": not sheet_spec.animation_id or name.endswith(("body", "frame")),
                "states": state_paths,
                "productionRole": "animation-part" if sheet_spec.animation_id else "ui-component",
            })
    return assets, lookup


def fit_image(image: Image.Image, max_width: int, max_height: int) -> Image.Image:
    scale = min(max_width / image.width, max_height / image.height, 1.0)
    return image if scale >= 1 else image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))), Image.Resampling.LANCZOS)


def draw_centered(canvas: Image.Image, image: Image.Image, center: tuple[int, int], scale: float = 1.0, offset: tuple[int, int] = (0, 0)) -> None:
    if scale != 1:
        image = image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))), Image.Resampling.LANCZOS)
    canvas.alpha_composite(image, (round(center[0] - image.width / 2 + offset[0]), round(center[1] - image.height / 2 + offset[1])))


def animation_background(size: tuple[int, int]) -> Image.Image:
    image = Image.new("RGBA", size, (3, 9, 25, 255))
    draw = ImageDraw.Draw(image)
    for x in range(0, size[0], 32):
        draw.line((x, 0, x, size[1]), fill=(22, 78, 112, 22))
    for y in range(0, size[1], 32):
        draw.line((0, y, size[0], y), fill=(22, 78, 112, 22))
    return image


def load_part(lookup: dict[str, Path], family: str, name: str, maximum: tuple[int, int]) -> Image.Image:
    with Image.open(lookup[f"{family}:{name}"]) as source:
        return fit_image(source.convert("RGBA"), *maximum)


def save_animation(animation_id: str, frames: list[Image.Image], manifest: dict) -> None:
    preview_root = OUTPUT_ROOT / "animations" / animation_id / "previews"
    preview_root.mkdir(parents=True, exist_ok=True)
    gif_path = preview_root / f"{animation_id}.gif"
    frames[0].save(gif_path, save_all=True, append_images=frames[1:], duration=42, loop=0, disposal=2, optimize=False)
    frames[-1].save(preview_root / f"{animation_id}-poster.png", optimize=True)
    (OUTPUT_ROOT / "animations" / animation_id / "animation-manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")


def build_champion_animation(lookup: dict[str, Path]) -> None:
    family = "champion-rig"
    plaque = load_part(lookup, family, "plaque-body", (540, 190))
    crown = load_part(lookup, family, "crown-cap", (180, 105))
    left = load_part(lookup, family, "wing-left", (180, 220))
    right = load_part(lookup, family, "wing-right", (180, 220))
    scan = load_part(lookup, family, "scan-bar", (430, 28))
    medal = load_part(lookup, family, "first-medal", (92, 92))
    flare = load_part(lookup, family, "energy-flare", (120, 120))
    glow = load_part(lookup, family, "energy-glow", (420, 90))
    frames = []
    for index in range(48):
        t = index / 47
        enter = ease_out_back(min(1, t / 0.42))
        hover = math.sin(max(0, t - 0.42) * math.pi * 5) * 3 if t > 0.42 else 0
        canvas = animation_background((760, 430))
        center = (380, round(220 + hover))
        draw_centered(canvas, glow, (380, 320), 0.82 + 0.05 * math.sin(t * math.pi * 6))
        draw_centered(canvas, left, center, 0.75 + 0.25 * enter, (round(-250 * enter), 10))
        draw_centered(canvas, right, center, 0.75 + 0.25 * enter, (round(250 * enter), 10))
        draw_centered(canvas, plaque, center, max(0.08, enter))
        draw_centered(canvas, crown, center, max(0.08, enter), (0, round(-125 * enter)))
        draw_centered(canvas, medal, center, max(0.08, enter), (-215, 0))
        if t > 0.28:
            scan_y = -60 + round(((t - 0.28) / 0.72) * 120)
            draw_centered(canvas, scan, center, 1, (30, scan_y))
        if 0.34 < t < 0.62:
            draw_centered(canvas, flare, center, 0.55 + (0.62 - t))
        if t > 0.44:
            draw = ImageDraw.Draw(canvas)
            draw.text((410, 184), "WEEKLY CHAMPION", font=load_font(22), fill=(250, 204, 21), anchor="mm")
            draw.text((410, 216), "PILOT // 1,245,000", font=load_font(18), fill=(224, 247, 255), anchor="mm")
            draw.text((410, 246), "LIVE REACT DATA", font=load_font(11), fill=(110, 231, 183), anchor="mm")
        frames.append(canvas.convert("P", palette=Image.Palette.ADAPTIVE, colors=255))
    save_animation("weekly-champion-reveal", frames, {"id": "weekly-champion-reveal", "runtimeText": True, "durationMs": 2016, "events": [{"atMs": 0, "name": "ui.champion.open"}, {"atMs": 760, "name": "ui.champion.lock"}], "loop": "subtle-hover-after-reveal", "production": "layered-png"})


def build_funding_animation(lookup: dict[str, Path]) -> None:
    family = "funding-vault-rig"
    body = load_part(lookup, family, "vault-frame-body", (610, 320))
    left = load_part(lookup, family, "shutter-left", (185, 310))
    right = load_part(lookup, family, "shutter-right", (185, 310))
    core = load_part(lookup, family, "research-core", (105, 180))
    ring = load_part(lookup, family, "energy-ring", (220, 220))
    seal = load_part(lookup, family, "mechanical-seal", (100, 100))
    beam = load_part(lookup, family, "energy-beam", (42, 260))
    glow = load_part(lookup, family, "energy-glow", (430, 90))
    frames = []
    for index in range(52):
        t = index / 51
        opened = min(1, max(0, (t - 0.18) / 0.42))
        pulse = 0.92 + 0.08 * math.sin(t * math.pi * 8)
        canvas = animation_background((760, 470))
        draw_centered(canvas, glow, (380, 382), pulse)
        draw_centered(canvas, body, (380, 235))
        draw_centered(canvas, ring, (380, 235), 0.7 + 0.3 * opened)
        draw_centered(canvas, core, (380, 230), max(0.12, opened))
        draw_centered(canvas, beam, (380, 250), max(0.1, opened))
        draw_centered(canvas, left, (380, 235), 1, (round(-90 - 150 * opened), 0))
        draw_centered(canvas, right, (380, 235), 1, (round(90 + 150 * opened), 0))
        draw_centered(canvas, seal, (380, 235), max(0.15, 1 - opened))
        if t > 0.55:
            draw = ImageDraw.Draw(canvas)
            draw.rounded_rectangle((225, 180, 535, 292), radius=10, fill=(2, 10, 24, 205), outline=(52, 211, 153, 120), width=1)
            draw.text((380, 210), "100 RSC ALLOCATION", font=load_font(23), fill=(110, 231, 183), anchor="mm", stroke_width=1, stroke_fill=(2, 8, 18))
            draw.text((380, 245), "PROPOSAL TITLE FROM REACT", font=load_font(14), fill=(225, 245, 255), anchor="mm")
            draw.text((380, 274), "CONFIRMATION STATE: READY", font=load_font(10), fill=(250, 204, 21), anchor="mm")
        frames.append(canvas.convert("P", palette=Image.Palette.ADAPTIVE, colors=255))
    save_animation("funding-vault-unseal", frames, {"id": "funding-vault-unseal", "runtimeText": True, "durationMs": 2184, "events": [{"atMs": 0, "name": "ui.vault.pressure"}, {"atMs": 760, "name": "ui.vault.unseal"}, {"atMs": 1320, "name": "ui.vault.power"}], "production": "layered-png"})


def build_record_animation(lookup: dict[str, Path]) -> None:
    family = "record-verify-rig"
    body = load_part(lookup, family, "record-card-body", (330, 410))
    top = load_part(lookup, family, "scanner-clamp-top", (330, 75))
    bottom = load_part(lookup, family, "scanner-clamp-bottom", (330, 75))
    seal = load_part(lookup, family, "verified-seal", (120, 120))
    scan = load_part(lookup, family, "scan-strip", (290, 24))
    lamp = load_part(lookup, family, "status-lamp", (55, 55))
    ring = load_part(lookup, family, "pulse-ring", (170, 170))
    glow = load_part(lookup, family, "energy-glow", (330, 160))
    frames = []
    for index in range(48):
        t = index / 47
        lock = ease_out_back(min(1, t / 0.32))
        verified = min(1, max(0, (t - 0.58) / 0.2))
        canvas = animation_background((620, 560))
        draw_centered(canvas, glow, (310, 320), 0.75 + 0.08 * math.sin(t * math.pi * 6))
        draw_centered(canvas, body, (310, 290), max(0.1, lock))
        draw_centered(canvas, top, (310, 100 + round(70 * lock)))
        draw_centered(canvas, bottom, (310, 480 - round(70 * lock)))
        draw_centered(canvas, lamp, (448, 160))
        if t > 0.28:
            y = 150 + round(((t - 0.28) / 0.5 % 1) * 270)
            draw_centered(canvas, scan, (310, y))
        if verified > 0:
            draw_centered(canvas, ring, (310, 380), 0.6 + 0.5 * verified)
            draw_centered(canvas, seal, (310, 380), verified)
        if t > 0.36:
            draw = ImageDraw.Draw(canvas)
            draw.text((310, 185), "MISSION RECORD", font=load_font(21), fill=(224, 247, 255), anchor="mm")
            draw.text((310, 219), "PILOT // 936,000", font=load_font(16), fill=(103, 232, 249), anchor="mm")
            draw.text((310, 246), "WAVE 12 // VERIFIED", font=load_font(10), fill=(110, 231, 183), anchor="mm")
        frames.append(canvas.convert("P", palette=Image.Palette.ADAPTIVE, colors=255))
    save_animation("mission-record-verification", frames, {"id": "mission-record-verification", "runtimeText": True, "durationMs": 2016, "events": [{"atMs": 0, "name": "ui.record.clamp"}, {"atMs": 1170, "name": "ui.record.verify"}], "production": "layered-png"})


def build_alert_animation(lookup: dict[str, Path]) -> None:
    family = "alert-rig"
    body = load_part(lookup, family, "alert-banner-body", (550, 180))
    left = load_part(lookup, family, "shutter-left", (170, 110))
    right = load_part(lookup, family, "shutter-right", (170, 110))
    beacon = load_part(lookup, family, "hazard-beacon", (70, 105))
    rail = load_part(lookup, family, "caution-rail", (390, 50))
    crystal = load_part(lookup, family, "warning-crystal", (90, 90))
    ring = load_part(lookup, family, "pulse-ring", (160, 160))
    glow = load_part(lookup, family, "energy-glow", (520, 150))
    frames = []
    for index in range(48):
        t = index / 47
        deploy = ease_out_back(min(1, t / 0.38))
        pulse = 0.9 + 0.12 * math.sin(t * math.pi * 8)
        canvas = animation_background((760, 350))
        draw_centered(canvas, glow, (380, 185), pulse)
        draw_centered(canvas, left, (380, 175), 1, (round(-265 * deploy), 0))
        draw_centered(canvas, right, (380, 175), 1, (round(265 * deploy), 0))
        draw_centered(canvas, body, (380, 175), max(0.08, deploy))
        draw_centered(canvas, rail, (380, 255), max(0.08, deploy))
        draw_centered(canvas, ring, (135, 175), pulse)
        draw_centered(canvas, beacon, (135, 175), pulse)
        draw_centered(canvas, crystal, (625, 175), pulse)
        if t > 0.35:
            draw = ImageDraw.Draw(canvas)
            draw.text((390, 152), "BOSS INTEGRITY CRITICAL", font=load_font(22), fill=(254, 202, 202), anchor="mm")
            draw.text((390, 188), "LIVE GAME STATE", font=load_font(11), fill=(253, 230, 138), anchor="mm")
        frames.append(canvas.convert("P", palette=Image.Palette.ADAPTIVE, colors=255))
    save_animation("alert-banner-deploy", frames, {"id": "alert-banner-deploy", "runtimeText": True, "durationMs": 2016, "events": [{"atMs": 0, "name": "ui.alert.deploy"}, {"atMs": 680, "name": "ui.alert.lock"}], "production": "layered-png"})


def build_catalog_pages(assets: list[dict]) -> list[str]:
    entries: list[tuple[str, Path]] = []
    for asset in assets:
        entries.append((asset["id"], OUTPUT_ROOT / asset["path"]))
        for state, relative_path in asset["states"].items():
            entries.append((f"{asset['id']} [{state}]", OUTPUT_ROOT / relative_path))
    per_page, columns = 30, 6
    tile_width, tile_height, header = 250, 220, 86
    page_paths: list[str] = []
    pages_root = OUTPUT_ROOT / "catalog-pages"
    pages_root.mkdir(parents=True, exist_ok=True)
    for page_index in range(math.ceil(len(entries) / per_page)):
        page_entries = entries[page_index * per_page:(page_index + 1) * per_page]
        rows = math.ceil(len(page_entries) / columns)
        page = Image.new("RGBA", (columns * tile_width, header + rows * tile_height), (3, 9, 25, 255))
        draw = ImageDraw.Draw(page)
        draw.text((18, 14), f"SCICON UI SYSTEM V2 // CATALOG {page_index + 1:02d}", font=load_font(28), fill=(237, 248, 255))
        draw.text((18, 52), "Runtime text stays separate - base components and interaction states", font=load_font(13), fill=(61, 220, 245))
        for index, (label, path) in enumerate(page_entries):
            column, row = index % columns, index // columns
            x, y = column * tile_width, header + row * tile_height
            draw.rectangle((x + 4, y + 4, x + tile_width - 4, y + tile_height - 4), outline=(38, 82, 112, 255), width=1)
            with Image.open(path) as source:
                preview = fit_image(source.convert("RGBA"), tile_width - 28, tile_height - 58)
            page.alpha_composite(preview, (x + (tile_width - preview.width) // 2, y + 10 + (tile_height - 58 - preview.height) // 2))
            draw.text((x + tile_width // 2, y + tile_height - 34), label.replace(":", " / "), font=load_font(10), fill=(222, 235, 245), anchor="mm")
        output_path = pages_root / f"scicon-ui-system-v2-catalog-{page_index + 1:02d}.png"
        page.save(output_path, optimize=True)
        page_paths.append(output_path.relative_to(OUTPUT_ROOT).as_posix())
    return page_paths


def write_manifests(assets: list[dict], catalog_pages: list[str]) -> None:
    state_count = sum(len(asset["states"]) for asset in assets)
    manifest = {
        "id": "scicon-ui-system-v2",
        "displayName": "Scicon UI System v2 - Orbital Research Command",
        "theme": "Orbital Research Command",
        "productionFormat": "transparent layered PNG with runtime text",
        "baseAssetCount": len(assets),
        "stateVariantCount": state_count,
        "productionPngCount": len(assets) + state_count,
        "masterSheetCount": len(SHEETS),
        "catalogPageCount": len(catalog_pages),
        "animationIds": [spec.animation_id for spec in SHEETS if spec.animation_id],
        "catalogPages": catalog_pages,
        "assets": assets,
        "implementationRules": [
            "React owns text, values, localization, focus, semantics, and application state.",
            "Pixi owns frame-driven HUD presentation and must not change simulation or hitboxes.",
            "GIF files are gallery proofs only; production animation uses layered PNG parts and manifests.",
            "Use CSS object-fit contain for fixed controls and nine-slice/corner composition for resizable panels.",
        ],
    }
    (OUTPUT_ROOT / "pack-manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    implementation = {
        "surfaces": {
            "StartScreen": ["shell", "home-navigation", "weekly-competition", "leaderboard-podium", "funding-proposals", "achievements-more", "form-controls"],
            "UIOverlay": ["hud-primary", "hud-actions", "notifications-status"],
            "Paused": ["pause-settings", "hud-primary"],
            "GameOver": ["mission-results", "records-wallet", "notifications-status"],
            "WeeklyProposalSelection": ["funding-proposals", "form-controls", "weekly-competition"],
            "MissionRecord": ["records-wallet", "record-verify-rig"],
            "StoryTransmission": ["tutorial-story", "general-borders"],
            "Tutorial": ["tutorial-story", "hud-actions"],
        },
        "runtimeText": "Place live HTML/React or Pixi BitmapText above the blank interior region; never rasterize user-specific data into a production frame.",
    }
    (OUTPUT_ROOT / "implementation-map.json").write_text(json.dumps(implementation, indent=2), encoding="utf-8")


def main() -> None:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    assets, lookup = export_assets()
    build_champion_animation(lookup)
    build_funding_animation(lookup)
    build_record_animation(lookup)
    build_alert_animation(lookup)
    catalog_pages = build_catalog_pages(assets)
    write_manifests(assets, catalog_pages)
    print(json.dumps({
        "baseAssets": len(assets),
        "stateVariants": sum(len(asset["states"]) for asset in assets),
        "productionPngs": len(assets) + sum(len(asset["states"]) for asset in assets),
        "masterSheets": len(SHEETS),
        "catalogPages": len(catalog_pages),
        "animations": 4,
        "output": str(OUTPUT_ROOT),
    }))


if __name__ == "__main__":
    main()
