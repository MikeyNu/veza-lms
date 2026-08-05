from __future__ import annotations

import json
import os
from pathlib import Path

import fitz
from PIL import Image
from weasyprint import HTML

PACKAGE_ROOT = Path(__file__).resolve().parent.parent
FIXTURE = PACKAGE_ROOT / "visual-fixtures" / "catalogue.html"
BASELINES = Path(__file__).resolve().parent / "visual-baselines.json"


def render(width: int, height: int) -> Image.Image:
    source = FIXTURE.read_text(encoding="utf-8")
    page_style = (
        f"<style>@page{{size:{width}px {height}px;margin:0}}"
        f"html,body{{width:{width}px;min-height:{height}px}}</style>"
    )
    source = source.replace("</head>", f"{page_style}</head>")
    pdf = HTML(string=source, base_url=str(FIXTURE.parent)).write_pdf()
    document = fitz.open(stream=pdf, filetype="pdf")
    page = document[0]
    pixmap = page.get_pixmap(matrix=fitz.Matrix(96 / 72, 96 / 72), alpha=False)
    image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
    return image.crop((0, 0, min(width, image.width), min(height, image.height)))


def fingerprint(image: Image.Image) -> dict[str, object]:
    sample = image.resize((32, 32), Image.Resampling.LANCZOS).convert("L")
    luminance = list(sample.get_flattened_data())
    bits: list[str] = []
    for y in range(32):
        for x in range(31):
            bits.append("1" if luminance[y * 32 + x] < luminance[y * 32 + x + 1] else "0")

    histogram = [0] * 64
    pixels = image.convert("RGB")
    for y in range(0, pixels.height, 4):
        for x in range(0, pixels.width, 4):
            red, green, blue = pixels.getpixel((x, y))
            histogram[(red // 64) * 16 + (green // 64) * 4 + blue // 64] += 1
    total = sum(histogram)
    return {
        "width": image.width,
        "height": image.height,
        "differenceHash": "".join(bits),
        "histogram": [round(value / total, 6) for value in histogram],
    }


def capture_all() -> dict[str, dict[str, object]]:
    return {
        "desktop": fingerprint(render(1280, 1800)),
        "mobile": fingerprint(render(390, 2400)),
    }


def compare(name: str, expected: dict[str, object], actual: dict[str, object]) -> None:
    assert actual["width"] == expected["width"], f"{name} width changed"
    assert actual["height"] == expected["height"], f"{name} height changed"
    expected_hash = str(expected["differenceHash"])
    actual_hash = str(actual["differenceHash"])
    changes = sum(left != right for left, right in zip(expected_hash, actual_hash, strict=True))
    hash_ratio = changes / len(expected_hash)
    expected_histogram = list(expected["histogram"])
    actual_histogram = list(actual["histogram"])
    histogram_delta = sum(abs(float(left) - float(right)) for left, right in zip(expected_histogram, actual_histogram, strict=True))
    assert hash_ratio <= 0.08, f"{name} edge signature changed {hash_ratio * 100:.2f}%"
    assert histogram_delta <= 0.08, f"{name} colour distribution changed {histogram_delta:.4f}"


def main() -> None:
    actual = capture_all()
    if os.environ.get("UPDATE_VISUAL_BASELINES") == "true":
        BASELINES.write_text(json.dumps(actual, indent=2) + "\n", encoding="utf-8")
        print(f"Updated {BASELINES}")
        return
    expected = json.loads(BASELINES.read_text(encoding="utf-8"))
    for name in ("desktop", "mobile"):
        compare(name, expected[name], actual[name])
        print(f"{name} visual signature passed")


if __name__ == "__main__":
    main()
