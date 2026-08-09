#!/usr/bin/env python
"""Render a 256x256 RGBA Windows Terminal profile icon: a rounded colour plate with a
white motif on it.

The motif is either a text glyph (--glyph) or a Python file (--motif) defining
draw_motif(draw, size, ink, plate), which lets a caller draw shapes no font supplies.
Everything is drawn at 4x and downscaled with LANCZOS, so edges stay clean at the 16px
the tab strip actually renders."""

import argparse
import os
import runpy
import sys

from PIL import Image, ImageDraw, ImageFont

SIZE = 256
SUPERSAMPLE = 4
INK = (255, 255, 255, 255)


def plate_colour(value):
    text = value.lstrip("#")
    if len(text) != 6:
        raise argparse.ArgumentTypeError(f"colour must be #RRGGBB, got: {value}")
    return tuple(int(text[offset:offset + 2], 16) for offset in (0, 2, 4)) + (255,)


def font_path(name):
    """Resolve a font by filename against the system font directory."""
    if os.path.isfile(name):
        return name
    root = os.environ.get("SystemRoot") or os.environ.get("WINDIR")
    if not root:
        raise SystemExit("SystemRoot is not set - pass --font as a full path to a .ttf")
    candidate = os.path.join(root, "Fonts", name)
    if not os.path.isfile(candidate):
        raise SystemExit(f"font not found: {candidate}")
    return candidate


def draw_glyph(draw, size, glyph, font_file, scale):
    font = ImageFont.truetype(font_path(font_file), int(size * scale))
    left, top, right, bottom = draw.textbbox((0, 0), glyph, font=font)
    draw.text(
        ((size - (right - left)) / 2 - left, (size - (bottom - top)) / 2 - top),
        glyph,
        font=font,
        fill=INK,
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--color", required=True, type=plate_colour, help="plate colour, #RRGGBB")
    parser.add_argument("--out", required=True, help="destination .png")
    parser.add_argument("--glyph", help="a character to centre on the plate")
    parser.add_argument("--font", default="seguisb.ttf", help="font filename for --glyph")
    parser.add_argument("--glyph-scale", type=float, default=0.62, help="glyph height as a fraction of the plate")
    parser.add_argument("--motif", help="Python file defining draw_motif(draw, size, ink, plate)")
    parser.add_argument("--radius", type=float, default=0.22, help="corner radius as a fraction of the plate")
    arguments = parser.parse_args()

    if bool(arguments.glyph) == bool(arguments.motif):
        parser.error("pass exactly one of --glyph or --motif")

    if os.path.exists(arguments.out):
        raise SystemExit(f"refusing to overwrite an existing icon: {arguments.out}")

    size = SIZE * SUPERSAMPLE
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * arguments.radius), fill=arguments.color)

    if arguments.glyph:
        draw_glyph(draw, size, arguments.glyph, arguments.font, arguments.glyph_scale)
    else:
        namespace = runpy.run_path(arguments.motif)
        if "draw_motif" not in namespace:
            raise SystemExit(f"{arguments.motif} defines no draw_motif(draw, size, ink, plate)")
        namespace["draw_motif"](draw, size, INK, arguments.color)

    image.resize((SIZE, SIZE), Image.LANCZOS).save(arguments.out, "PNG")
    print(arguments.out)


if __name__ == "__main__":
    sys.exit(main())
