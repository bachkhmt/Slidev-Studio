#!/usr/bin/env python3
"""Render a Beamer PDF and Slidev deck, pair pages, and inspect HCMUT color bands."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

try:
    from PIL import Image, ImageDraw, ImageFont, ImageOps
except ImportError:
    print("Missing Pillow. Install it with: python3 -m pip install Pillow", file=sys.stderr)
    raise SystemExit(2)


COLORS = {
    "nav/footer-dark": (3, 43, 145),
    "title/footer-light": (20, 136, 219),
}


def natural_key(path: Path) -> list[Any]:
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", path.name)]


def run(command: list[str], cwd: Path | None = None) -> None:
    print("$", " ".join(command))
    subprocess.run(command, cwd=cwd, check=True)


def export_slidev(project: Path, entry: Path, output_prefix: Path) -> list[Path]:
    cli = project / "node_modules" / ".bin" / "slidev"
    if not cli.exists():
        raise FileNotFoundError(f"Slidev CLI not found at {cli}; run npm install in {project}")
    run([
        str(cli), "export", str(entry), "--format", "png", "--output", str(output_prefix),
    ], cwd=project)
    images = sorted(output_prefix.rglob("*.png"), key=natural_key)
    if not images:
        raise RuntimeError(f"Slidev export completed but no PNGs were found near {output_prefix}")
    return images


def color_bands(image: Image.Image, tolerance: int, min_coverage: float) -> dict[str, list[dict[str, float]]]:
    rgb = image.convert("RGB")
    width, height = rgb.size
    pixels = rgb.load()
    results: dict[str, list[dict[str, float]]] = {}

    for name, color in COLORS.items():
        row_coverages: list[float] = []
        for y in range(height):
            matched = 0
            for x in range(width):
                pixel = pixels[x, y]
                if sum((pixel[channel] - color[channel]) ** 2 for channel in range(3)) <= tolerance**2:
                    matched += 1
            row_coverages.append(matched / width)

        ranges: list[tuple[int, int]] = []
        start: int | None = None
        last: int | None = None
        for y, coverage in enumerate(row_coverages):
            if coverage >= min_coverage:
                if start is None:
                    start = y
                last = y
            elif start is not None and last is not None and y - last > 2:
                ranges.append((start, last + 1))
                start = last = None
        if start is not None and last is not None:
            ranges.append((start, last + 1))

        results[name] = [
            {
                "top_pct": round(start / height * 100, 2),
                "bottom_pct": round(end / height * 100, 2),
                "height_pct": round((end - start) / height * 100, 2),
                "mean_coverage_pct": round(
                    sum(row_coverages[start:end]) / max(1, end - start) * 100, 1
                ),
            }
            for start, end in ranges
            if end - start >= max(2, round(height * 0.003))
        ]
    dark = results["nav/footer-dark"]
    light = results["title/footer-light"]
    results["nav"] = [band for band in dark if band["top_pct"] < 12]
    results["title"] = [band for band in light if band["top_pct"] < 35]
    results["footer-meta"] = [band for band in light if band["bottom_pct"] > 85]
    results["footer-title"] = [band for band in dark if band["bottom_pct"] > 85]
    return results


def read_font(size: int) -> ImageFont.ImageFont:
    for candidate in (
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ):
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


def make_pair(beamer: Path, slidev: Path, output: Path, page: int) -> None:
    left = Image.open(beamer).convert("RGB")
    right = Image.open(slidev).convert("RGB")
    width, height = left.size
    fit = ImageOps.contain(right, (width, height), method=Image.Resampling.LANCZOS)
    fitted = Image.new("RGB", (width, height), "#eeeeee")
    fitted.paste(fit, ((width - fit.width) // 2, (height - fit.height) // 2))

    label_height = max(40, round(height * 0.055))
    gap = max(6, round(width * 0.008))
    canvas = Image.new("RGB", (width * 2 + gap, height + label_height), "white")
    draw = ImageDraw.Draw(canvas)
    font = read_font(max(14, round(height * 0.022)))
    draw.text((12, 8), f"Beamer · trang {page}", fill="#111111", font=font)
    draw.text((width + gap + 12, 8), f"Slidev · trang {page}", fill="#111111", font=font)
    canvas.paste(left, (0, label_height))
    canvas.paste(fitted, (width + gap, label_height))
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output)


def parse_pages(value: str | None, count: int) -> list[int]:
    if not value:
        return list(range(1, count + 1))
    pages: set[int] = set()
    for part in value.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            first, last = (int(value) for value in part.split("-", 1))
            pages.update(range(first, last + 1))
        else:
            pages.add(int(part))
    invalid = sorted(page for page in pages if page < 1 or page > count)
    if invalid:
        raise ValueError(f"Page number(s) outside 1..{count}: {invalid}")
    return sorted(pages)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--beamer-pdf", required=True, type=Path)
    parser.add_argument("--project", type=Path, default=Path.cwd(), help="Slidev project directory")
    parser.add_argument("--entry", default="slides.md", help="Slidev entry file, relative to --project")
    parser.add_argument("--pages", help="Pages to pair, e.g. 1,2,5,7-9 (default: all)")
    parser.add_argument("--out", type=Path, default=Path("comparison"), help="Output directory")
    parser.add_argument("--dpi", type=int, default=120, help="PDF render resolution")
    parser.add_argument("--tolerance", type=int, default=70, help="RGB distance tolerance for theme colors")
    parser.add_argument("--min-band-coverage", type=float, default=0.2, help="Minimum row width covered by a color")
    args = parser.parse_args()

    project = args.project.expanduser().resolve()
    entry = (project / args.entry).resolve()
    pdf = args.beamer_pdf.expanduser().resolve()
    output_dir = args.out.expanduser().resolve()
    if not pdf.is_file():
        parser.error(f"Beamer PDF not found: {pdf}")
    if not entry.is_file():
        parser.error(f"Slidev entry not found: {entry}")
    if not shutil.which("pdftoppm"):
        parser.error("pdftoppm is required (install Poppler)")

    with tempfile.TemporaryDirectory(prefix="hcmut-bach-compare-") as temp_name:
        temp = Path(temp_name)
        beamer_prefix = temp / "beamer"
        run(["pdftoppm", "-png", "-r", str(args.dpi), str(pdf), str(beamer_prefix)])
        beamer_images = sorted(temp.glob("beamer-*.png"), key=natural_key)
        slidev_root = temp / "slidev"
        slidev_root.mkdir()
        slidev_images = export_slidev(project, entry, slidev_root / "slidev-export")

        if len(beamer_images) != len(slidev_images):
            print(
                f"Warning: PDF has {len(beamer_images)} pages; Slidev exported {len(slidev_images)} PNGs.",
                file=sys.stderr,
            )
        count = min(len(beamer_images), len(slidev_images))
        pages = parse_pages(args.pages, count)
        pairs_dir = output_dir / "pairs"
        records: list[dict[str, Any]] = []
        for page in pages:
            beamer = beamer_images[page - 1]
            slidev = slidev_images[page - 1]
            pair = pairs_dir / f"page-{page:03}.png"
            make_pair(beamer, slidev, pair, page)
            with Image.open(beamer) as image:
                beamer_size = image.size
                beamer_bands = color_bands(image, args.tolerance, args.min_band_coverage)
            with Image.open(slidev) as image:
                slidev_size = image.size
                slidev_bands = color_bands(image, args.tolerance, args.min_band_coverage)
            records.append({
                "page": page,
                "beamer_png": beamer.name,
                "slidev_png": slidev.name,
                "pair_png": str(pair),
                "beamer_size": beamer_size,
                "slidev_size": slidev_size,
                "beamer_bands": beamer_bands,
                "slidev_bands": slidev_bands,
            })
            print(f"page {page:03}: {pair}")

    output_dir.mkdir(parents=True, exist_ok=True)
    report = output_dir / "report.json"
    report.write_text(json.dumps({
        "beamer_pdf": str(pdf),
        "project": str(project),
        "entry": str(entry),
        "pdf_page_count": len(beamer_images),
        "slidev_page_count": len(slidev_images),
        "paired_pages": records,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Compared {len(records)} page(s). Color-band measurements: {report}")
    return 0 if len(beamer_images) == len(slidev_images) else 1


if __name__ == "__main__":
    raise SystemExit(main())
