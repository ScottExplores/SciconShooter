#!/usr/bin/env python3
"""Validate the generated Scicon Interface Pack v1."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1] / "public/game-art/generated/ui/scicon-interface-pack-v1"


def main() -> None:
    manifest = json.loads((ROOT / "pack-manifest.json").read_text(encoding="utf-8"))
    asset_paths = [ROOT / relative_path for relative_path in manifest["assets"]]
    assert manifest["assetCount"] == len(asset_paths) == 52
    assert not [path for path in asset_paths if not path.is_file()]

    magenta_pixels = 0
    transparent_corner_assets = 0
    for path in asset_paths:
        with Image.open(path) as source:
            image = source.convert("RGBA")
            corners = (
                image.getpixel((0, 0))[3],
                image.getpixel((image.width - 1, 0))[3],
                image.getpixel((0, image.height - 1))[3],
                image.getpixel((image.width - 1, image.height - 1))[3],
            )
            transparent_corner_assets += int(all(alpha == 0 for alpha in corners))
            magenta_pixels += sum(
                1
                for red, green, blue, alpha in image.get_flattened_data()
                if alpha > 20 and red > 245 and blue > 245 and green < 15
            )

    preview_path = ROOT / "animations/floating-window/previews/scicon-floating-window-hover.gif"
    with Image.open(preview_path) as preview:
        gif_frames = getattr(preview, "n_frames", 1)
    assert gif_frames >= 40

    print(
        json.dumps(
            {
                "assets": len(asset_paths),
                "transparentCornerAssets": transparent_corner_assets,
                "magentaPixels": magenta_pixels,
                "gifFrames": gif_frames,
            }
        )
    )


if __name__ == "__main__":
    main()
