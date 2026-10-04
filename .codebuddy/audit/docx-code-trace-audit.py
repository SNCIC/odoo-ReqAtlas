"""独立图文一致性审计。

目的：不复用 doc-spike 的校验脚本，用我自己的实现验证
  「ModelBundle 中每个对象编号是否都出现在生成的 DOCX 正文文本中」
这是产品设计文档 §10.3「图文一致性 / 对象引用」与实施方案 §6.9 M8-06 的核心验收点。

用法：python .codebuddy/audit/docx-code-trace-audit.py
"""
import json
import re
import sys
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parents[2]
bundle_path = root / "packages/testkit/fixtures/demo-trade/model-bundle.json"
docx_path = root / "spike/document/out/current-state-report.docx"
pdf_path = root / "spike/document/out/current-state-report.pdf"

if not bundle_path.exists():
    sys.exit(f"bundle not found: {bundle_path}")
if not docx_path.exists():
    sys.exit(f"docx not found: {docx_path} (doc-spike 必须先跑 generate)")

bundle = json.loads(bundle_path.read_text(encoding="utf-8"))
codes = [o["code"] for o in bundle.get("modelObject", [])]

print(f"bundle.path          = {bundle_path.relative_to(root)}")
print(f"bundle.topLevelKeys  = {sorted(bundle.keys())}")
print(f"bundle.modelObject   = {len(codes)}")
print(f"bundle.evidence      = {len(bundle.get('evidence', []))}")
print(f"bundle.evidenceLink  = {len(bundle.get('evidenceLink', []))}")
print(f"bundle.relation      = {len(bundle.get('modelRelation', []))}")
print(f"bundle.viewLayout    = {len(bundle.get('viewLayout', []))}")

with zipfile.ZipFile(docx_path) as z:
    parts = z.namelist()
    xml = z.read("word/document.xml").decode("utf-8", "replace")

# 去掉所有 XML 标签，得到纯文本；再反转 XML 实体
text = re.sub(r"<[^>]*>", " ", xml)
for entity, char in (("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"), ("&quot;", '"'), ("&apos;", "'")):
    text = text.replace(entity, char)

missing = [c for c in codes if c not in text]
unique = sorted(set(codes))

print(f"docx.path            = {docx_path.relative_to(root)}")
print(f"docx.bytes           = {docx_path.stat().st_size}")
print(f"docx.zipParts        = {len(parts)}")
print(f"docx.hasWatermark    = {'DRAFT' in text}")
print(f"docx.eastAsiaRuns    = {xml.count('w:eastAsia')}")
print(f"docx.isA4            = {'w:w=\"11906\"' in xml}")
print(f"codes.total          = {len(codes)}")
print(f"codes.unique         = {len(unique)}")
print(f"codes.missingInDocx  = {len(missing)}")
if missing:
    print(f"codes.MISSING_LIST   = {missing}")
print(f"ALL_CODES_PRESENT    = {len(missing) == 0}")

if pdf_path.exists():
    raw = pdf_path.read_bytes()
    pages = len(re.findall(rb"/Type\s*/Page[^s]", raw))
    print(f"pdf.bytes            = {len(raw)}")
    print(f"pdf.pageObjects      = {pages} (粗略正则计数)")
else:
    print("pdf.path             = (缺失)")

sys.exit(0 if not missing else 1)
