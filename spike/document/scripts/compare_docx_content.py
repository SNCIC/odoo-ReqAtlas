#!/usr/bin/env python3
"""比较两个 DOCX 的部件内容（忽略 zip 容器时间戳）。

DOCX 是 zip 容器；两个“内容相同”的文件其 zip 本地头会写入不同时间戳，
导致整文件 sha256 不一致。本脚本用 zipfile 解包，逐部件比较内容哈希，
并以 `word/document.xml` 为准给出内容是否一致 —— 说明我们比较的是**解包内容**，
而不是 zip 二进制。

Usage: python compare_docx_content.py <a.docx> <b.docx>
"""
import argparse
import hashlib
import sys
import zipfile

DOC_PART = "word/document.xml"


def part_map(path):
    with zipfile.ZipFile(path) as zf:
        return {name: zf.read(name) for name in zf.namelist()}


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("a")
    parser.add_argument("b")
    args = parser.parse_args()

    a = part_map(args.a)
    b = part_map(args.b)
    names_a, names_b = set(a), set(b)

    print(f"  parts_a={len(names_a)} parts_b={len(names_b)}")
    if names_a != names_b:
        print(f"  ONLY_IN_A={sorted(names_a - names_b)}")
        print(f"  ONLY_IN_B={sorted(names_b - names_a)}")

    da, db = a.get(DOC_PART), b.get(DOC_PART)
    if da is None or db is None:
        print("  ERROR: word/document.xml missing")
        return 1

    print(f"  document_xml_sha256_a={sha256(da)}")
    print(f"  document_xml_sha256_b={sha256(db)}")
    print(f"  document_xml_bytes_a={len(da)} document_xml_bytes_b={len(db)}")
    print(f"  document_xml_identical={da == db}")

    diffs = [
        name
        for name in sorted(names_a & names_b)
        if name != DOC_PART and a[name] != b[name]
    ]
    print(f"  other_differing_parts={diffs if diffs else '[]'}")
    print(f"  all_unzipped_parts_identical={not diffs and names_a == names_b}")

    return 0 if da == db else 1


if __name__ == "__main__":
    sys.exit(main())
