# /// script
# requires-python = ">=3.12"
# dependencies = [
#   "fonttools==4.68.0",
#   "uharfbuzz==0.57.0",
# ]
# ///
"""Convert brand text into SVG outline paths.

The brand assets must not depend on an installed font, so every piece of text in a logo or a
social preview is shaped with HarfBuzz (kerning and ligatures from the font) and converted into
path data with fontTools. The font itself is not part of the repository; see docs/brand.md for
the font, its version and its licence.

Usage:
    uv run tools/brand/outline-text.py <font.ttf> <output.json> <id>=<text> [<id>=<text> ...]

The output maps each id to its path data in font units (y axis pointing down, baseline at y = 0,
pen starting at x = 0) together with the advance width, the ink bounding box
(x_min, y_min, x_max, y_max in the same coordinates) and the font's vertical metrics.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import uharfbuzz as hb
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont


def outline(font_path: Path, text: str) -> dict[str, object]:
    blob = hb.Blob.from_file_path(str(font_path))
    face = hb.Face(blob)
    font = hb.Font(face)
    buffer = hb.Buffer()
    buffer.add_str(text)
    buffer.guess_segment_properties()
    hb.shape(font, buffer, {"kern": True, "liga": True})

    tt = TTFont(str(font_path))
    glyph_set = tt.getGlyphSet()
    order = tt.getGlyphOrder()

    parts: list[str] = []
    bounds = BoundsPen(glyph_set)
    pen_x = 0
    for info, pos in zip(buffer.glyph_infos, buffer.glyph_positions, strict=True):
        name = order[info.codepoint]
        svg_pen = SVGPathPen(glyph_set, ntos=lambda v: f"{v:.1f}".rstrip("0").rstrip("."))
        # Flip y so that the path matches SVG coordinates (baseline at y = 0).
        moved = TransformPen(svg_pen, (1, 0, 0, -1, pen_x + pos.x_offset, -pos.y_offset))
        glyph_set[name].draw(moved)
        glyph_set[name].draw(TransformPen(bounds, (1, 0, 0, -1, pen_x + pos.x_offset, -pos.y_offset)))
        parts.append(svg_pen.getCommands())
        pen_x += pos.x_advance

    os2 = tt["OS/2"]
    return {
        "text": text,
        "d": "".join(parts),
        "advance": pen_x,
        "bbox": [round(v, 1) for v in bounds.bounds] if bounds.bounds else None,
        "unitsPerEm": tt["head"].unitsPerEm,
        "capHeight": os2.sCapHeight,
        "xHeight": os2.sxHeight,
        "ascender": os2.sTypoAscender,
        "descender": os2.sTypoDescender,
        "font": tt["name"].getDebugName(4),
        "fontVersion": tt["name"].getDebugName(5),
    }


def main(argv: list[str]) -> int:
    if len(argv) < 4:
        print(__doc__, file=sys.stderr)
        return 2
    font_path = Path(argv[1])
    output = Path(argv[2])
    result: dict[str, object] = {}
    for item in argv[3:]:
        key, sep, text = item.partition("=")
        if not sep or not key or not text:
            print(f"expected <id>=<text>, got {item!r}", file=sys.stderr)
            return 2
        result[key] = outline(font_path, text)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8", newline="\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
