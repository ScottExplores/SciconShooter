#!/usr/bin/env python3
"""Validate the production outputs for Scicon UI System v2."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1] / "public/game-art/generated/ui/scicon-ui-system-v2"


def main() -> None:
    manifest = json.loads((ROOT / "pack-manifest.json").read_text(encoding="utf-8"))
    assert manifest["baseAssetCount"] == 160
    assert manifest["stateVariantCount"] == 232
    assert manifest["productionPngCount"] == 392
    assert manifest["masterSheetCount"] == 20
    assert manifest["catalogPageCount"] == 14
    assert len(manifest["assets"]) == 160

    production_paths: list[Path] = []
    transparent_corners = 0
    opaque_corner_paths: list[str] = []
    magenta_pixels = 0
    state_dimensions_match = True
    for asset in manifest["assets"]:
        base_path = ROOT / asset["path"]
        production_paths.append(base_path)
        with Image.open(base_path) as source:
            base = source.convert("RGBA")
            base_size = base.size
        for relative_path in asset["states"].values():
            state_path = ROOT / relative_path
            production_paths.append(state_path)
            with Image.open(state_path) as source:
                state_dimensions_match &= source.size == base_size

    assert len(production_paths) == 392
    assert not [path for path in production_paths if not path.is_file()]
    for path in production_paths:
        with Image.open(path) as source:
            image = source.convert("RGBA")
            corners = (
                image.getpixel((0, 0))[3],
                image.getpixel((image.width - 1, 0))[3],
                image.getpixel((0, image.height - 1))[3],
                image.getpixel((image.width - 1, image.height - 1))[3],
            )
            transparent_corners += int(all(alpha == 0 for alpha in corners))
            if not all(alpha == 0 for alpha in corners):
                opaque_corner_paths.append(path.relative_to(ROOT).as_posix())
            magenta_pixels += sum(
                1
                for red, green, blue, alpha in image.get_flattened_data()
                if alpha > 20 and red > 250 and blue > 250 and green < 8
            )

    assert state_dimensions_match
    if opaque_corner_paths:
        raise AssertionError(f"Opaque corners: {opaque_corner_paths[:20]}")
    assert magenta_pixels == 0
    assert len(list((ROOT / "sprite-sheets").glob("*.png"))) == 20
    assert len(list((ROOT / "catalog-pages").glob("*.png"))) == 14

    animation_frames: dict[str, int] = {}
    for animation_id in manifest["animationIds"]:
        preview_path = ROOT / "animations" / animation_id / "previews" / f"{animation_id}.gif"
        with Image.open(preview_path) as preview:
            animation_frames[animation_id] = getattr(preview, "n_frames", 1)
        assert animation_frames[animation_id] >= 48
        animation_manifest = json.loads((ROOT / "animations" / animation_id / "animation-manifest.json").read_text(encoding="utf-8"))
        assert animation_manifest["runtimeText"] is True
        assert animation_manifest["production"] == "layered-png"

    print(json.dumps({
        "productionPngs": len(production_paths),
        "transparentCorners": transparent_corners,
        "magentaPixels": magenta_pixels,
        "stateDimensionsMatch": state_dimensions_match,
        "masterSheets": 20,
        "catalogPages": 14,
        "animationFrames": animation_frames,
    }))


if __name__ == "__main__":
    main()
