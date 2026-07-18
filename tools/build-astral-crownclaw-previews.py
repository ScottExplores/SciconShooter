"""Build transparent GIF previews for the Astral Crownclaw cutout rig."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


CANVAS_SIZE = (1024, 704)
BODY_OFFSET = (192, 32)

LEG_SOCKETS = {
    "front": {"left": (172, 146), "right": (468, 146)},
    "middle": {"left": (159, 207), "right": (481, 207)},
    "rear": {"left": (74, 261), "right": (566, 261)},
}
LEG_PIVOTS = {
    "front": {"left": (231, 128), "right": (25, 128)},
    "middle": {"left": (216, 105), "right": (40, 105)},
    "rear": {"left": (207, 64), "right": (49, 64)},
}
WEAPON_SOCKETS = {"left": (94, 354), "right": (546, 354)}
WEAPON_PIVOTS = {"left": (164, 67), "right": (92, 67)}


def load_rgba(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def paste_at_pivot(
    canvas: Image.Image,
    part: Image.Image,
    socket: tuple[int, int],
    pivot: tuple[int, int],
    angle: float = 0,
    offset: tuple[int, int] = (0, 0),
) -> None:
    if angle:
        part = part.rotate(
            angle,
            resample=Image.Resampling.NEAREST,
            center=pivot,
            expand=False,
        )
    x = BODY_OFFSET[0] + socket[0] - pivot[0] + offset[0]
    y = BODY_OFFSET[1] + socket[1] - pivot[1] + offset[1]
    canvas.alpha_composite(part, (round(x), round(y)))


def gif_frame(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A")
    rgb = Image.new("RGB", image.size, (0, 0, 0))
    rgb.paste(image, mask=alpha)
    indexed = rgb.quantize(colors=255, method=Image.Quantize.MEDIANCUT)
    transparent = alpha.point(lambda value: 255 if value < 16 else 0)
    indexed.paste(255, mask=transparent)
    indexed.info["transparency"] = 255
    indexed.info["disposal"] = 2
    return indexed


def save_gif(
    frames: list[Image.Image],
    path: Path,
    durations: int | list[int],
) -> None:
    converted = [gif_frame(frame) for frame in frames]
    path.parent.mkdir(parents=True, exist_ok=True)
    converted[0].save(
        path,
        save_all=True,
        append_images=converted[1:],
        duration=durations,
        loop=0,
        optimize=True,
        transparency=255,
        disposal=2,
    )


class CrownclawRig:
    def __init__(self, root: Path) -> None:
        rig = root / "rig"
        self.body = load_rgba(rig / "astral-crownclaw-core-chassis.png")
        self.legs = {
            name: {
                side: load_rgba(
                    rig
                    / "legs"
                    / f"astral-crownclaw-leg-{name}-{side}.png"
                )
                for side in ("left", "right")
            }
            for name in ("front", "middle", "rear")
        }
        self.guns = {
            side: load_rgba(
                rig
                / "weapons"
                / f"astral-crownclaw-underclaw-gun-{side}.png"
            )
            for side in ("left", "right")
        }
        self.claws = {
            side: load_rgba(
                rig
                / "weapons"
                / f"astral-crownclaw-sharp-claw-projectile-{side}.png"
            )
            for side in ("left", "right")
        }

    def compose(
        self,
        leg_angles: dict[str, float] | None = None,
        right_claw_offset: tuple[int, int] = (0, 0),
        right_claw_angle: float = 0,
        canvas_size: tuple[int, int] = CANVAS_SIZE,
    ) -> Image.Image:
        leg_angles = leg_angles or {"front": 0, "middle": 0, "rear": 0}
        canvas = Image.new("RGBA", canvas_size, (0, 0, 0, 0))

        for name in ("rear", "middle", "front"):
            angle = leg_angles[name]
            paste_at_pivot(
                canvas,
                self.legs[name]["left"],
                LEG_SOCKETS[name]["left"],
                LEG_PIVOTS[name]["left"],
                -angle,
            )
            paste_at_pivot(
                canvas,
                self.legs[name]["right"],
                LEG_SOCKETS[name]["right"],
                LEG_PIVOTS[name]["right"],
                angle,
            )

        for side in ("left", "right"):
            paste_at_pivot(
                canvas,
                self.guns[side],
                WEAPON_SOCKETS[side],
                WEAPON_PIVOTS[side],
            )

        paste_at_pivot(
            canvas,
            self.claws["left"],
            WEAPON_SOCKETS["left"],
            WEAPON_PIVOTS["left"],
        )
        paste_at_pivot(
            canvas,
            self.claws["right"],
            WEAPON_SOCKETS["right"],
            WEAPON_PIVOTS["right"],
            right_claw_angle,
            right_claw_offset,
        )

        canvas.alpha_composite(self.body, BODY_OFFSET)
        return canvas


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--asset-root", required=True, type=Path)
    args = parser.parse_args()

    preview_dir = args.asset_root / "previews"
    rig = CrownclawRig(args.asset_root)

    wave = [0, 4, 8, 4, 0, -4, -8, -4]
    leg_frames = [
        rig.compose(
            {
                "front": angle,
                "middle": -angle * 0.75,
                "rear": angle * 0.5,
            }
        )
        for angle in wave
    ]
    save_gif(
        leg_frames,
        preview_dir / "astral-crownclaw-leg-motion-preview.gif",
        110,
    )
    leg_frames[0].save(
        preview_dir / "astral-crownclaw-rig-assembly-preview.png",
        optimize=True,
    )

    launch_offsets = [0, 10, 28, 54, 88, 132, 186, 246, 186, 132, 88, 54, 28, 10]
    launch_frames = [
        rig.compose(
            {"front": 2, "middle": -1.5, "rear": 1},
            right_claw_offset=(round(distance * 0.12), distance),
            right_claw_angle=distance * 0.035,
            canvas_size=(1024, 896),
        )
        for distance in launch_offsets
    ]
    save_gif(
        launch_frames,
        preview_dir / "astral-crownclaw-claw-launch-preview.gif",
        90,
    )

    decay_paths = sorted(
        (args.asset_root / "animations" / "decay" / "frames").glob("*.png")
    )
    decay_frames = [load_rgba(path) for path in decay_paths]
    save_gif(
        decay_frames,
        preview_dir / "astral-crownclaw-decay-preview.gif",
        [180, 180, 180, 190, 220, 700],
    )


if __name__ == "__main__":
    main()
