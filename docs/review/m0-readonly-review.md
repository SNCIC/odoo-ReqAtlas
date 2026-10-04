# M0 只读复核报告

| 项目 | 内容 |
| --- | --- |
| 复核对象 | M0 技术验证（M0-03 2D / M0-04 3D / M0-05+M0-06 Agent / M0-07 文档） |
| 复核人 | adr |
| 复核日期 | 2026-10-04 |
| 工作树状态 | 冻结（以复核当下为准；canvas 待变更 3 文件尚未改动） |
| 复核方式 | 只读；所有结论来自本次实测，未引用 lead 的数字 |
| 依据 | `docs/review/readonly-review-checklist.md`；实施方案 §6.1 / §8.4 / §9.2 |

> 环境：本机 Node v25.2.1、pnpm 10.32.1、Windows；无 Docker / 无 Redis。上述为已接受的
> 已知偏差，本报告仅在其影响范围内使用，不作为新发现。

---

## 1. 我实测的门禁数字

| 门禁 | 命令 | 我的实测结果 | 与 lead 对照 |
| --- | --- | --- | --- |
| 锁文件自洽 | `pnpm install --frozen-lockfile` | `Lockfile is up to date`，`EXIT=0`（17 workspace projects） | 一致 |
| 格式化 | `pnpm format:check` | `All matched files use Prettier code style!`，`EXIT=0` | 一致 |
| 静态检查 | `pnpm lint` | 无输出（干净），`EXIT=0` | 一致 |
| 类型检查 | `pnpm -r typecheck` | 全部项目 `Done`，`EXIT=0`（16 个带 typecheck 的工作区） | 一致 |
| 测试 | `pnpm test` | 6 个套件：testkit 40 / spike-canvas 13 / apps-worker 4 / spike-agent 45 / apps-api 26 / spike-presentation-3d 28 = **156 passed**，`EXIT=0` | 一致（156） |
| 依赖边界 | `pnpm arch` | `no dependency violations found (52 modules, 77 dependencies cruised)`，`EXIT=0` | 一致 |
| canvas 构建 | `pnpm --filter @reqatlas/spike-canvas build` | `EXIT=0`；**产出 dist**（见第 2 节更正） | **不一致，见更正** |

---

## 2. 对 lead 数字/描述的两处更正（以我的实测为准）

**(1) canvas build 确有 emit 产物。** lead 称"build 脚本是 `tsc --noEmit`，无 emit 产物"，
与实测不符。`spike/canvas/package.json` 的 `build` 实为 `tsc --noEmit && vite build`；
我运行后 `vite v7.3.6` 输出：

```
dist/index.html                 0.42 kB
dist/assets/index-CLGCPShy.css 21.34 kB
dist/assets/index-CaGiYfY_.js 499.03 kB (map 2,194.27 kB)
✓ built in 4.41s
```

即：`tsc` 段确为 `--noEmit`（类型检查，无 JS 产物），但 `vite build` 段**会 emit** 静态产物。
因此"无 emit 产物"的表述应更正为"`tsc` 段不 emit，`vite` 段 emit 前端产物"。
定位：`spike/canvas/package.json`（`build`）、`spike/canvas/dist/**`。

**(2) 根 `ci` 不含 build。** 实测 `pnpm ci`（根 `package.json#scripts.ci`）为
`format:check && lint && typecheck && test && arch`，**不含 build**；故 canvas 构建必须单独跑
（本报告已单独执行），此点与 lead 一致，仅在此登记以备后续纳入 CI 门禁。

---

## 3. 冻结基线对照（自行重算，不采信声明值）

```
(Get-FileHash -Algorithm SHA256 -Path packages/testkit/fixtures/demo-trade/model-bundle.json).Hash.ToLower()
→ 1a54c6e3158fb2d7a079fad244e30fd774c6b453e06d3859785978a184e03c62
§8.1 登记值 → 1a54c6e3158fb2d7a079fad244e30fd774c6b453e06d3859785978a184e03c62
MATCH = True    BYTES = 27549 (MATCH = True)
```

结论：锚点值经我独立重算**逐字符一致**；字节数一致。

**四个 Spike 产物中记录的 snapshot sha256 逐一核对**（复核清单 §8「产物源自冻结基线」）：

| Spike | 机器可读产物 | 是否记录源 bundle 的 sha256 | 判定 |
| --- | --- | --- | --- |
| document | `spike/document/out/current-state-report.ir.json` | **是**，`snapshotSha256` 字段 = 锚点 | 通过 |
| agent | `spike/agent/out/*.json` | 否，仅有 `basedOnRevision: 1`；锚点在 `spike/agent/src/anchor.ts` 常量 + `integrity.test.ts` 断言 | 部分（见 建议改-1） |
| canvas | `spike/canvas/perf/adapter-results.json` | 否；锚点仅出现在手写文档 `PERF.md` / `README.md` | 部分（见 建议改-1） |
| presentation-3d | `spike/presentation-3d/scene-projection.sample.json` | 否；仅 `projectId` / `projectRevision: 1`，整个目录无锚点字符串 | 部分（见 建议改-1） |

---

## 4. 两条核心断言独立复跑

| 断言 | 定位 | 我的复跑结果 |
| --- | --- | --- |
| M0-05 对象复用：`财务` 解析到既有 `ROLE-003` 而非新建 | `spike/agent/src/__tests__/retriever.test.ts:19`（另 `golden/scenarios.ts:42` `forbiddenCreateCodes: ['ROLE-003']`） | `pnpm --filter @reqatlas/spike-agent exec vitest run retriever.test.ts integrity.test.ts` → `retriever 4 passed`，`EXIT=0` |
| M0-06 跑完全链路后 bundle 哈希不变 | `spike/agent/src/__tests__/integrity.test.ts:17`「跑完全部金样例后 sha256 与字节数不变，且等于 M0 冻结锚点」 | 同一命令 → `integrity 1 passed`，合计 `5 passed`，`EXIT=0` |

---

## 5. 交叉印证：lead 的两份独立审计脚本（只运行，未修改）

**`.codebuddy/audit/m0-trade-audit.ps1`**（`PS1_EXIT=0`）：

```
topLevelKeys=projectId,projectRevision,modelObject,modelRelation,evidence,evidenceLink,view,viewLayout
objects=33 relations=54 layouts=15
dupCodes=0  badEndpoints=0  crossProjectRefs=0  objectsOutsideProject=0  layoutsPointingToMissingObject=0
activities=9 missingPerformsR=0 notExactlyOneAccountableA=0 multiRaciOther=0  raciTotals R=9 A=9 C=3 I=2
decisions=2 withoutExit=0 branchesWithoutCondition=0 ; exceptions=2 withoutTarget=0
requirements=3 withoutTraceableSource=0 ; ends=1 reachableFromStart=1 reachableNodes=13/33
supportedByTargets=   evidenceLikeObjects=0
```

`spike/document/scripts/traceability_check.py`：未执行（见第 7 节）。

**`.codebuddy/audit/docx-code-trace-audit.py`**（`PY_EXIT=0`）：

```
bundle.modelObject=33 evidence=3 evidenceLink=17 relation=54 viewLayout=15
docx.path=spike\document\out\current-state-report.docx  docx.bytes=17576  docx.zipParts=26
docx.hasWatermark=True  docx.eastAsiaRuns=496  docx.isA4=True
codes.total=33 codes.unique=33 codes.missingInDocx=0  ALL_CODES_PRESENT=True
pdf.bytes=427054  pdf.pageObjects=5 (粗略正则计数)
```

**交叉印证结论**：图文一致性 `33/33 codes present, missing=0` 与我独立运行 lead 脚本的结果一致；
与 `doc-spike` 的 `ALL_CODES_PRESENT=true` 口径收敛。三方（我的复跑 / lead 脚本 / doc-spike）一致。

---

## 6. 四类清单

### 必须改

**无。** M0 六项门禁 + canvas 构建全部 `EXIT=0`；两条核心断言独立复跑通过；冻结锚点自行重算一致；
四个 Spike 均以同一 ModelBundle 为输入且无硬编码演示数据（红线 R-1/R-2/R-3/R-4/R-5 在 M0 无 DB 场景下
不适用或已通过，见第 8 节）。

### 建议改

| # | 问题 | 定位（文件 / 接口 / 测试） | 影响 | 建议 |
| --- | --- | --- | --- | --- |
| 建议改-1 | 三个 Spike 的**机器可读产物未记录源 bundle 的 sha256**；canvas 的锚点只写在手写文档里，3D 目录内完全无锚点字符串 | `spike/canvas/perf/adapter-results.json`（无 hash 字段）；`spike/presentation-3d/scene-projection.sample.json`（仅 projectRevision）；`spike/agent/out/*.json`（仅 basedOnRevision） | 产物无法自证"源自冻结基线"，只能靠旁证（counts 33/54/15、revision 1、手写文档）→ 图文若不一致难被机器发现 | 在产物元数据中写入 `sourceBundleSha256`（与 `spike/document/out/current-state-report.ir.json` 的 `snapshotSha256` 一致做法）；不阻断 M0 |
| 建议改-2 | 根 `ci` 不含 build，`apps/api`/`worker`/`packages/*` 无生产构建（ADR-011 阻断项） | 根 `package.json#scripts.ci`；`apps/api/package.json`、`apps/worker/package.json` | M1 "可启动"判定受阻（§8.3） | 已在 ADR-011 记录；建议 M1-07 将 `pnpm --filter @reqatlas/api build` 纳入 CI |

### 历史遗留（非本轮新增；登记影响与归属）

| # | 项 | 状态 / 归属 |
| --- | --- | --- |
| 历史遗留-1 | Node v25.2.1（非 LTS，基线 22 LTS） | ADR-010 / `docs/engineering/README.md` 已知偏差；CI 固定 22 |
| 历史遗留-2 | 无 Docker → M1-02/M1-03/M1-05 未验证；无 Redis；本机 PostgreSQL 17+pgvector 无凭据 | `docs/engineering/README.md` §6/§7 |
| 历史遗留-3 | 真实模型 provider 联网调用未验证（无凭据） | `agent-spike` 已如实标注 |
| 历史遗留-4 | OQ-1~OQ-5 契约开放问题待裁定 | `docs/api/**` |

### 待确认

| # | 事项 | 定位 | 我的判断 |
| --- | --- | --- | --- |
| 待确认-1 | canvas 待变更 **3 个文件**：`src/load-node.ts`、`README.md`、`scripts/perf-adapter.ts` | `spike/canvas/src/load-node.ts`（`REPO_ROOT` 消费者）、`spike/canvas/scripts/perf-adapter.ts`（L15 import、L168 输出路径）、`spike/canvas/README.md`（L26 / L44 提及 `load-node.ts`） | 待 lead 裁定落地；本报告按当前树取证 |
| 待确认-2 | **canvas README 入口层说明是否仍成立**（见第 7 节详证） | `spike/canvas/README.md` L29-35；`spike/canvas/src/domain.ts` L7-8；`spike/canvas/src/schema.ts` L4-11 | **仍成立，应保留**。删除 `load-node.ts` 不改变"包入口拉入 node:fs"这一事实 |
| 待确认-3 | lead 的 `m0-trade-audit.ps1` 可达性口径未遍历 `has_exception`，将 `EXC-001`/`EXC-002` 列为 `unreachable` | `.codebuddy/audit/m0-trade-audit.ps1` L72-90 | 属**脚本口径问题**，非 fixture 缺陷：两异常 `triggeredBy=1`、`outgoingFlowTo=1`，仅因 BFS 只走 `flow_to` 而未被访问。建议明确口径或补 `has_exception` 边 |
| 待确认-4 | 是否新增第 5 条复核检查项（见第 9 节） | `docs/review/readonly-review-checklist.md` | 我倾向**加**，理由见第 9 节；等 lead 裁定后再动工具 |

---

## 7. 未执行项（如实标注原因）

| 未执行项 | 原因 |
| --- | --- |
| `spike/document` 的 `generate` / `verify` 脚本 | 二者会写出 `spike/document/out/*.docx`，**工作树冻结期禁止写入**；改用只读的 `docx-code-trace-audit.py` 核对现成产物 |
| `spike/document` 的 vitest | 该包无 `test` 脚本，证据来自 `scripts/*`（`pnpm -r test` 自动跳过） |
| `pnpm --filter @reqatlas/spike-canvas perf:browser` | 需下载 playwright chromium 且 headless 不等价真实 GPU；`PERF.md` 已标注该限制 |
| 真实模型 provider 联网调用 | 本机无凭据（已知偏差，agent-spike 已标注） |
| Docker / Redis / PostgreSQL 相关 | 环境不可用/无凭据（已知偏差） |

---

## 8. 红线检查（`readonly-review-checklist.md` §0）结果

| 红线 | M0 结论 | 证据 |
| --- | --- | --- |
| R-1 绕过 Command/ChangeSet 直写业务表 | 不适用 | M0 无 DB；`rg -n "@reqatlas/db\|drizzle-orm" spike` → **0 命中** |
| R-2 2D/3D/文档另存一套事实 | 通过 | 三视图均消费同一 testkit Schema；canvas/3d 未建业务表 |
| R-3 Agent 具备写库/写基线能力 | 通过 | Agent 仅产出 `change_draft`，`integrity.test.ts` 证明跑完全链路后 bundle 哈希不变 |
| R-4 无来源事实进入基线 | 通过 | agent `sourceRefs` 出现在 guard/apply/contract；金样例 `expectSourceRefsNonEmpty: true` |
| R-5 布局坐标当语义持久化 | 通过 | canvas `changeset.ts`：布局补丁 `bumpsRevision=false`，不持久化 React Flow JSON（README §语义隔离） |
| R-6 跳过/伪造/只测实现细节的用例 | 通过 | `search_content '\b(TODO\|FIXME\|HACK\|TBD\|WIP)\b'`（区分大小写）→ **0 命中**；`.skip/.only/passWithNoTests` 检索的 3 处经逐条查看**均为 `process.exit(` 被 `xit\(` 误匹配**，非跳过用例；脆弱断言检索 `toBe(3X/5X)` → **0 命中**，现有计数断言均由 `expected.*` / `projection.*` 派生 |

补充：canvas/3d 的规模断言为 schema 派生（`toBe(expected.objects)`、`toHaveLength(roles.length)`），
符合"基数由过滤/结构推导"；`security.test.ts` 的 `toBe(2)` 为**澄清问题上限业务规则**常量，非数据总数量，
判定为可接受。

---

## 9. 关于"是否新增第 5 条检查项"的判断

观察到贯穿本轮的方法论失效模式是"把某次观测当作稳定知识"。既有 4 条已覆盖：结论须当下复现（1）、
区分注释与活代码（2）、零命中换口径复检（3）、命名类命中区分人/路径（4）。**未被覆盖的子形态**是：
**写入文档/注释的"约束性前提"未在落笔时点复验**（例如"因 X 报错故必须走 Y"被抄进 README，而 X 已消失，
或反之 X 其实仍在）。

**我的判断：值得新增第 5 条**，建议标题「写入文档的约束性前提，须在落笔时点复验一次」，判定依据：
文档/注释中凡以"因为/因此/必须"表述的因果前提，须在写下的时点用当前工作树复验，并区分"事实仍成立"
与"仅当时成立"。理由：本轮的正面例子（第 7 节 canvas 入口层说明）与反面例子（`load-node.ts` L4-9 的
cwd 假前提）恰好构成一对，说明该模式会**正反两个方向**出错，仅靠既有 4 条不足以拦截"保留本应删除的
前提"或"删除本应保留的前提"。

—— 遵从 lead 指示，**本次不修改清单**，等裁定后再动工具。

---

## 10. 复核结论

| 项 | 结论 |
| --- | --- |
| 必须改 | 0 条 |
| 建议改 | 2 条 |
| 历史遗留 | 4 条（均已登记，非本轮新增） |
| 待确认 | 4 条 |
| 是否放行进入 M1 | **建议：M0 门禁层面可放行**；但 M1 存在 ADR-011 阻断项（`apps/api` 无生产构建），须在 M1 判定"可启动"前关闭 |
| 复验依据 | 本报告第 1~5 节命令与原始输出 |
