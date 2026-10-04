#!/usr/bin/env python3
"""PDF 冒烟检查：页数、文本、对象编号回链、字体。

用 pypdf 读取 LibreOffice 产出的 PDF，打印页数、提取文本长度、
bundle 中每个 code 是否出现，以及每页声明的字体（用于判断中文字体是否嵌入）。

Usage: python pdf_check.py --pdf <report.pdf> --bundle <model-bundle.json>
"""
import argparse
import json
import sys

try:
    from pypdf import PdfReader
except ImportError:  # pragma: no cover
    print("  ERROR: pypdf not installed")
    sys.exit(2)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", required=True)
    parser.add_argument("--bundle", required=True)
    args = parser.parse_args()

    reader = PdfReader(args.pdf)
    with open(args.bundle, encoding="utf-8") as fh:
        bundle = json.load(fh)

    pages = reader.pages
    text = "\n".join((page.extract_text() or "") for page in pages)
    codes = sorted({obj["code"] for obj in bundle["modelObject"]})
    missing = [c for c in codes if c not in text]

    fonts = set()
    for page in pages:
        resources = page.get("/Resources")
        if resources is None:
            continue
        font_dict = resources.get("/Font")
        if font_dict is None:
            continue
        for key in font_dict:
            font = font_dict[key]
            base = font.get("/BaseFont") if hasattr(font, "get") else None
            if base:
                fonts.add(str(base))

    print(f"  pdf_pages={len(pages)}")
    print(f"  pdf_text_chars={len(text)}")
    print(f"  codes_total_unique={len(codes)}")
    print(f"  codes_missing={len(missing)}")
    print(f"  fonts_used={sorted(fonts)}")
    if missing:
        print(f"  MISSING_CODES={missing}")
        return 1
    print("  ALL_CODES_PRESENT_IN_PDF=true")
    return 0


if __name__ == "__main__":
    sys.exit(main())
