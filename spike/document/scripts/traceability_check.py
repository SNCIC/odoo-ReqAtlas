#!/usr/bin/env python3
"""回链（反向）校验：DOCX 文本必须包含 bundle 中每个对象的 code。

用 python 标准库 zipfile + 正则剥标签提取 `word/document.xml` 的全部文本，
断言 `model-bundle.json` 中每个 modelObject.code 都出现。任何缺失都会以非 0 退出。

Usage: python traceability_check.py --bundle <model-bundle.json> --docx <report.docx>
"""
import argparse
import hashlib
import html
import json
import re
import sys
import zipfile


def extract_text(path):
    with zipfile.ZipFile(path) as zf:
        xml = zf.read("word/document.xml").decode("utf-8")
    xml = xml.replace("</w:p>", "\n")
    text = re.sub(r"<[^>]+>", "", xml)
    return html.unescape(text)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--bundle", required=True)
    parser.add_argument("--docx", required=True)
    args = parser.parse_args()

    with open(args.bundle, encoding="utf-8") as fh:
        bundle = json.load(fh)

    codes = sorted({obj["code"] for obj in bundle["modelObject"]})
    text = extract_text(args.docx)
    missing = [code for code in codes if code not in text]

    print(f"  docx_text_chars={len(text)}")
    print(f"  docx_text_sha256={hashlib.sha256(text.encode('utf-8')).hexdigest()}")
    print(f"  codes_total_unique={len(codes)}")
    print(f"  codes_present={len(codes) - len(missing)}")
    print(f"  codes_missing={len(missing)}")
    if missing:
        print(f"  MISSING_CODES={missing}")
        return 1
    print("  ALL_CODES_PRESENT=true")
    return 0


if __name__ == "__main__":
    sys.exit(main())
