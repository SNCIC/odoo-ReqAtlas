# M0-07 文档 Spike（`@reqatlas/spike-document`）

从**同一份不可变 ModelBundle** 驱动生成《现状调研报告》骨架：

```
ModelBundle（快照，只读）
  → Document IR（格式无关内容树，zod 定义，可序列化 JSON）
    → DOCX（docx 库渲染器）
      → PDF（LibreOffice soffice，隔离 profile）
```

核心裁定依据：`docs/adr/ADR-008.md`（Document IR + docx 库 + 隔离 LibreOffice Worker 转 PDF）。
本 Spike **不实现**容器隔离与权限脱敏，只验证「同源驱动 + 中文渲染 + 可重复生成 + 编号回链」。

## 目录

| 路径 | 说明 |
| --- | --- |
| `src/document-ir.ts` | 最小 Document IR（zod schema）：`heading` / `paragraph` / `table` / `objectRef` / `pageBreak` |
| `src/model-to-ir.ts` | 模型 → IR 转换器（章节、编号、证据、`derived_from` 回链） |
| `src/render-docx.ts` | IR → `docx` `Document`；显式中文字体、页眉水印、页脚页码 |
| `src/soffice.ts` | `soffice` 探测与 DOCX → PDF 转换（隔离 `-env:UserInstallation` profile） |
| `src/snapshot.ts` | 快照 sha256（源 bundle 文件字节）+ 生成前后一致性校验 |
| `src/pipeline.ts` | 快照 → IR → DOCX 流水线（生成器与校验器共用） |
| `scripts/generate.ts` | 一条命令生成（可选 `--pdf`） |
| `scripts/verify.ts` | 确定性 + 回链校验编排 |
| `scripts/compare_docx_content.py` | 解包 DOCX 逐部件比对（python zipfile） |
| `scripts/traceability_check.py` | 反向校验：所有对象 `code` 必须出现在文档文本中 |
| `scripts/pdf_check.py` | PDF 页数 / 文本 / 编号回链 / 字体检查（pypdf） |
| `out/` | 产物（`current-state-report.docx` / `.pdf` / `.ir.json` 与 `verify/`） |

## 前置环境

- Node >= 22、pnpm 10（仓库已 `pnpm install`）。
- 校验脚本需要 **Python 3**（标准库 `zipfile`；PDF 检查另需可选包 `pypdf`）。
- PDF 转换需要 **LibreOffice**（`soffice`）；**缺失时 PDF 会被如实标注为「未验证/受阻」，不会伪造产物**。

## 一条命令生成

```bash
pnpm --filter @reqatlas/spike-document typecheck
pnpm --filter @reqatlas/spike-document generate
pnpm --filter @reqatlas/spike-document generate -- --pdf   # 附带 LibreOffice 转 PDF
```

产物默认写入 `spike/document/out/`：

- `current-state-report.docx`
- `current-state-report.ir.json`（IR 序列化，用于审查内容/格式解耦）
- `current-state-report.pdf`（仅 `--pdf` 且探测到 soffice 时）

可用 `--generated-at <ISO8601>` 固定生成时间（确定性复现，类似 `SOURCE_DATE_EPOCH`）。

## Document IR 结构

IR 是**格式无关**的：转换器不关心 Word，渲染器不读取模型。节点类型（`src/document-ir.ts`）：

- `heading`：`{ level: 1..4, text, number? }` —— 章节编号由转换器预先算好，渲染器只拼装。
- `paragraph`：`{ text, role: 'body' | 'note' | 'watermark' }` —— `watermark` 渲染为红色草稿横幅。
- `table`：`{ caption?, header[], rows[][], rowRefs?[] }` —— `rowRefs` 记录该行对象稳定编号，作为回链锚点。
- `objectRef`：`{ code, kind, title, state?, note? }` —— 稳定编号对象引用。
- `pageBreak`：分页符。

`metadata` 携带：`projectId`、`projectRevision`、`snapshotSha256`、`generatedAt`、`templateVersion`、
`documentStatus`、`watermark`、`dataSource`。其中 `documentStatus='draft'` 与 `watermark` 即
「草稿/未确认」水印标识。

报告骨架章节：封面/元数据 → `1 组织与岗位职责`（含 RACI 矩阵）→ `2 核心业务场景总览`
（活动 / 决策出口 / 异常 / 边界对象表）→ `3 问题与证据`（`evidenceLink` 回链）→
`4 目标需求与追溯`（`derived_from` 回链）→ `附录 A 对象编号索引`（全量对象，保证编号齐全、可反向校验）。

**编号一致性**：所有 `objectRef.code` 与表格中的编号**直接取自 bundle 的 `code`，不做重编号**。

**证据双路径（应对 bundle 结构演进）**：「问题与证据」章节优先读 `evidenceLink`（承载原
`supported_by` 语义，经 `evidenceId` 回链 `evidence` 表）；若某对象没有 `evidenceLink`，则回退到
`modelRelation(supported_by)` 并在表标题标注「待 evidence 拆分后切换」。两条路径都不硬编码对象数量或结构，
类型与校验一律来自 `@reqatlas/testkit` 导出的 zod Schema。

## 中文字体设置方式

`docx` 的 run 级 `font` 支持按字符集分别指定。渲染器为每次 run 显式传入：

```ts
// 正文：宋体 + Times New Roman
{ ascii: 'Times New Roman', hAnsi: 'Times New Roman', eastAsia: 'SimSun', cs: 'SimSun' }
// 标题：黑体 + Arial
{ ascii: 'Arial', hAnsi: 'Arial', eastAsia: 'SimHei', cs: 'SimHei' }
```

同时写入 `styles.default.document.run.font` 与标题样式。产物 `word/document.xml` 中可见
`w:eastAsia="SimSun"` / `w:eastAsia="SimHei"`；PDF 中字体已嵌入（见下）。

## 确定性验证（复现）

```bash
pnpm --filter @reqatlas/spike-document verify
```

流程：固定 `generatedAt`，对同一快照连续生成两次 → 比较

1. **IR 序列化哈希**（内容模型是否一致）；
2. **原始 DOCX 字节 sha256**（会因 zip 时间戳不同而不同）；
3. **解包后 `word/document.xml` 内容哈希**（python `zipfile`，避免自证）；
4. **反向校验**：解包提取全部文本，断言 bundle 中每个 `code` 都出现。

**我们比较的是什么（诚实口径）**：`word/document.xml`（文档正文）在两个产物中**字节完全一致**，
其 sha256 相同。原始 `.docx` 字节**不一致**，差异仅来自：

- zip 本地文件头的写入时间戳；
- `docProps/core.xml` 的 `dcterms:created` / `dcterms:modified`（docx 库取 wall-clock）；
- `word/header1.xml` 中 VML 水印 shape 的随机 `id`（`docx` 的 `TextWatermark` 生成随机对象名）。

因此**正文内容确定性成立**；容器级字节确定性与水印 shape id 未做归一化（已列为 M8 建议项）。

## 反向校验（复现）

```bash
python scripts/traceability_check.py \
  --bundle ../../packages/testkit/fixtures/demo-trade/model-bundle.json \
  --docx out/current-state-report.docx
```

期望输出以 `ALL_CODES_PRESENT=true` 为准；`codes_total_unique` 由 bundle 动态统计，
**不写死对象总数**（快照新增/删除对象时应随之变化）。校验器从 `bundle.modelObject` 逐条取 `code`，
并用 testkit 的 zod Schema 校验模型契约。

## PDF 当前状态

- 本机探测到 **LibreOffice 26.2.3.2**，`soffice.com` 可用；`generate --pdf` 转换成功（`exit_code=0`）。
  实测探测输出（证据）：
  ```
  found   = true
  path    = C:\Program Files\LibreOffice\program\soffice.com
  source  = windows-default
  version = LibreOffice 26.2.3.2 70e089b17412e4cb7773e41413306b17a2328c34
  ```
- 转换使用独立 `-env:UserInstallation` 临时 profile（系统临时目录），不污染 `out/`。
- `scripts/pdf_check.py` 可复现检查：页数、文本、编号回链、字体。
- **若目标机器没有 soffice**：`generate --pdf` 会打印 `found=false` 并跳过，README/报告中 PDF 标注为
  **未验证/受阻**（需要安装 LibreOffice，或按 ADR-008 使用隔离 Worker 容器）。**不会生成假 PDF。**

## 已知问题与建议

1. ~~testkit fixture 解析依赖 cwd~~ —— **已解决**（`sample`，`packages/testkit/src/fixtures.ts`）。
   `resolveFixturePath` / `loadFixtureBundle` 现以**模块位置**（`import.meta.url` → `<packages/testkit>/fixtures`）
   为主基准，另支持 `REQATLAS_FIXTURE_ROOT` 覆盖；包内脚本不再依赖 `process.cwd()`。
   本 Spike 已撤掉手工上溯仓库根的 workaround，直接使用官方 `resolveFixturePath` + `parseModelBundle`
   （对同一份读入字节取哈希并校验，避免 TOCTOU）。
2. **容器级字节确定性**未实现：建议 M8 用 `Packer` 的 overrides 固定 `docProps/core.xml` 时间戳，
   并去除/固定水印 VML shape id，使 `.docx` 整文件也可哈希。
3. 本 Spike 未实现 ADR-008 的**预检**（未确认/敏感/权限/模板兼容）与**隔离 Worker 资源限制**，
   属于 M8 范畴；本 Spike 只证明生成链路与可复现性。
