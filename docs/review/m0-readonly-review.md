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
dist/assets/index-CaGiYfY_.js 499.03 kB (map 2,194.27 kB)   # 快照：第二次提交前；当前值为 index-CsiZu05R.js 499.04 kB（见 §12.10）
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
| 建议改-1 | 三个 Spike 的**机器可读产物未记录源 bundle 的 sha256**；canvas 的锚点只写在手写文档里，3D 目录内完全无锚点字符串 | `spike/canvas/perf/adapter-results.json`（无 hash 字段）；`spike/presentation-3d/scene-projection.sample.json`（仅 projectRevision）；`spike/agent/out/*.json`（仅 basedOnRevision） | 产物无法自证"源自冻结基线"，只能靠旁证（counts 33/54/15、revision 1、手写文档）→ 图文若不一致难被机器发现 | 在产物元数据中写入 `sourceBundleSha256`（与 `spike/document/out/current-state-report.ir.json` 的 `snapshotSha256` 一致做法）；不阻断 M0。**已关闭**（delta 复核：5 处产物均记录重算值，见第 11 节） |
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
| 待确认-1 | canvas 待变更 **3 个文件**：`src/load-node.ts`、`README.md`、`scripts/perf-adapter.ts` | `spike/canvas/src/load-node.ts`（原 `REPO_ROOT` 消费者）、`spike/canvas/scripts/perf-adapter.ts`（L15/L18 定位）、`spike/canvas/README.md`（L26 / L45） | 待 lead 裁定落地；本报告按当时树取证。**已关闭**（delta：`load-node.ts` 已改用 `@reqatlas/testkit/fixtures`，`REPO_ROOT` 已移除，见第 11 节） |
| 待确认-2 | **canvas README 入口层说明是否仍成立**（见第 7 节详证） | `spike/canvas/README.md` L30-36；`spike/canvas/src/domain.ts` L7-8；`spike/canvas/src/schema.ts` L4-11 | **仍成立，应保留**。改写/删除 `load-node.ts` 不改变"包入口拉入 node:fs"这一事实。**已核实保留**（delta 复核确认 README L30-36 仍在，见第 11 节） |
| 待确认-3 | lead 的 `m0-trade-audit.ps1` 可达性口径未遍历 `has_exception`，将 `EXC-001`/`EXC-002` 列为 `unreachable` | `.codebuddy/audit/m0-trade-audit.ps1` L72-90 | 属**脚本口径问题**，非 fixture 缺陷：两异常 `triggeredBy=1`、`outgoingFlowTo=1`，仅因 BFS 只走 `flow_to` 而未被访问。**已关闭**（lead 已修正脚本，我重跑确认 `unreachable` 消失、`reachableNodes` 13/33→15/33，见第 11 节） |
| 待确认-4 | 是否新增第 5 / 第 6 条复核检查项（见第 9 节） | `docs/review/readonly-review-checklist.md` | 我倾向**加**，理由见第 9 节。**已关闭**（第 5 条「写入文档的约束性前提须在落笔时点复验」与第 6 条「阴性结果必须配阳性对照」均已落盘，见第 11 节） |

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

---

## 11. Delta 复核（首次提交 `dc06bb2` 之后）

> 只复验本轮变更及其影响面；结论仍来自当前工作树实测。本节状态更新**取代**第 6 节的待办状态。
>
> **口径限定（重要）**：本节是**首次提交 `dc06bb2` 之后、第二次提交之前的 interim delta**。
> `dc06bb2` 捕获的是批次中途状态（canvas/agent 的代码已入库、产物未刷新），故**一次提交 ≠ 一个一致状态**。
> 最终 delta 以**第二次提交**为终点；届时复核范围还会新增 `spike/canvas/perf/s*.json`（10 个浏览器测量报告）
> 与 agent `artifacts.ts`/`index.ts`/`golden-run.ts` 等，本节的"五产物"清单将在那时扩展。
> `spike/presentation-3d/**` 已在 `dc06bb2` 内，不在第二次 delta 范围。
>
> **作废声明（canvas 部分）**：本节中一切与 `spike/canvas/**` 有关的结论（§11.1 的 canvas 行、§11.2 的
> `perf/adapter-results.json` 比对、§11.6 对 `spike/canvas/dist/**` 的 bundle 探针）**均在被并发写入的工作树上取得，已作废**。
> 原因：取得时 `spike/canvas` 有 11 个文件在改动，并存在未跟踪新文件 `scripts/source-bundle.ts`；被读到的树不一致，
> 故其文件清单与产物状态必然残缺。这些条目将在**冻结后**重做，且采用下述可验证的冻结窗口规程。
>
> **复核窗口规程（新增，防止再次读到"正在被写的树"）**：
> 1. 复核开始时，对**全部待复核文件**取一次 `git status --porcelain` + 逐文件 `sha256`，形成**冻结清单**；
> 2. 复核结束时再取一次；
> 3. 两次不一致 → **声明本次复核无效并回报**，不解释、不重新解读中间差异。
> "复核当时的工作树"由此成为**可验证**的定义，而非依赖复核人的记忆或观察窗口。

### 11.1 变更落地核对（以当前工作树为准）

| 变更 | 落地位置 | 状态 |
| --- | --- | --- |
| canvas 产物补 `sourceBundleSha256` | `spike/canvas/perf/adapter-results.json:2` | 已落地 |
| 3D 产物补 `sourceBundleSha256` | `spike/presentation-3d/scene-projection.sample.json:5` | 已落地 |
| agent 产物补 `sourceBundleSha256` | `spike/agent/out/change-draft.discount-approval.json:7`、`change-draft.role-conflict.json:7`、`change-set.discount-approval.json:7` | 已落地 |
| canvas `load-node.ts` 改用权威加载器 | `spike/canvas/src/load-node.ts`（`import { loadFixtureBundle } from '@reqatlas/testkit/fixtures'`，`REPO_ROOT` 已移除） | 已落地（改为**改写**而非删除） |
| canvas README 同步 | `spike/canvas/README.md:26`（新行为）、`:28`（溯源说明） | 已落地 |
| canvas 输出目录自定位 | `spike/canvas/scripts/perf-adapter.ts:26-27`（`PERF_DIR` 由 `import.meta.url` 推导） | 已落地 |

### 11.2 冻结基线重算 + 五产物比对（自行重算，不采信声明值）

```
RECOMPUTED = 1a54c6e3158fb2d7a079fad244e30fd774c6b453e06d3859785978a184e03c62
spike/canvas/perf/adapter-results.json                          MATCH=True
spike/presentation-3d/scene-projection.sample.json              MATCH=True
spike/agent/out/change-draft.discount-approval.json             MATCH=True
spike/agent/out/change-draft.role-conflict.json                 MATCH=True
spike/agent/out/change-set.discount-approval.json               MATCH=True
```

命令：`(Get-FileHash -Algorithm SHA256 -Path packages/testkit/fixtures/demo-trade/model-bundle.json).Hash.ToLower()`
与各产物 `sourceBundleSha256` 逐字符比对。

### 11.3 生成器是"重算"而非"抄常量"，且断言非恒真

| 生成器 | 证据 |
| --- | --- |
| canvas `scripts/perf-adapter.ts:33-40` | `createHash('sha256').update(readFileSync(fixturePath))` 重算，并与冻结锚点比对，不一致直接抛错 |
| agent `src/artifacts.ts:43` | `const sourceBundleSha256 = sha256File(params.bundlePath)` 重算 |
| 3D `src/presentation/load-fixture.ts:61-67` | `readDemoTradeSource()` 对读入字节 `createHash('sha256').update(bytes)` 重算；注释明写"每次重算，非常量""禁止抄常量" |
| 断言（防恒真） | agent `src/__tests__/artifact.test.ts:18/30/31`、3D `src/__tests__/sample.test.ts:20/24` 均断言"产物值 == 重算值 == 冻结锚点" |

**非恒真论证**：断言比较的是**两个独立来源**（产物文件中登记的值 vs 测试现场从字节重算的值）。
若 bundle 字节被改动，重算值随之变化、而登记值不变 → 断言失败。**注意**：本复核只读，未改动 bundle，
故"改动后断言会失败"为代码级论证，**未做破坏性实机反证**（如实标注）。

### 11.4 门禁复跑（delta 影响面）

| 门禁 | 结果 |
| --- | --- |
| `pnpm format:check` | `EXIT=0` |
| `pnpm lint` | `EXIT=0` |
| `pnpm -r typecheck` | `EXIT=0` |
| `pnpm test` | **160 passed**（testkit 40 / worker 4 / canvas 13 / agent 47 / api 26 / 3d 30），`EXIT=0`（较上轮 156 增 4，来自 agent/3d 溯源用例） |
| `pnpm arch` | `no dependency violations found (52 modules, 77 dependencies)`，`EXIT=0` |

### 11.5 修正后的审计脚本重跑

`.codebuddy/audit/m0-trade-audit.ps1` → `EXIT=0`，`ends=1 reachableFromStart=1 reachableNodes=15/33`，
**不再出现任何 `unreachable:` 行**（此前报的 EXC-001 / EXC-002 消失）。可达性 13/33 → 15/33，与"新增遍历
`has_exception` 边"一致。→ lead 的脚本修正**有效**。

### 11.6 探针有效性：阴性结果配阳性对照（清单第 6 条的首次实战）

| 探针 | 结果 | 判定 |
| --- | --- | --- |
| `Select-String -SimpleMatch`（错误口径） | 阳性对照亦全为 0 | **探针无效**，其"0 命中"不构成证据 |
| `[System.IO.File]::ReadAllText` + `[regex]::Matches` | 阳性对照 `pending_confirmation=4 / accountable_A=12 / interview_segment=3 / highly_sensitive=1 / model_object=2`（与 lead 数值一致）；阴性 `node:fs=0`、`REQATLAS_FIXTURE_ROOT=0` | 探针有效，阴性结果有意义 |

结论：`fixtures.ts` 的 Node-only 代码未进入 canvas 浏览器 bundle；而包入口 `@reqatlas/testkit`
（经 `index.ts` 的 `export *` → `fixtures.ts` 顶层 `node:fs` / `fileURLToPath`）**仍会把 `node:fs` 拉入模块图**
→ `spike/canvas/README.md:30-36` 的入口层说明**保留正确**。

### 11.7 清单状态更新

| 原条目 | 新状态 |
| --- | --- |
| 建议改-1（产物未记录源哈希） | **已关闭**（五产物均记录重算值且 MATCH） |
| 建议改-2（根 ci 不含 build / 无生产构建） | 仍开放（ADR-011 阻断，属 M1 前关闭项） |
| 待确认-1（canvas 3 文件） | **已关闭** |
| 待确认-2（README 入口层说明保留） | **已关闭**（核实保留） |
| 待确认-3（审计脚本 has_exception 口径） | **已关闭**（lead 修正，重跑无 unreachable） |
| 待确认-4（新增第 5 条） | **已关闭**；已落第 5、第 6 条 |

另：本次复核顺带修正了 `readonly-review-checklist.md` 中 3 处**遗留的未转义竖线**（原 L25 / L121 / L123），
它们会让对应表格渲染出多余列；修正后全表列数一致（`NO_ANOMALY`）。

### 11.8 未执行项（保持，如实）

document `generate`/`verify`（会写出 `out/*.docx`；本阶段改用只读 py 审计核对现成产物）、
`perf:browser`（需 chromium + 真实 GPU）、真实模型 provider 联网（无凭据）、Docker / Redis / PostgreSQL（环境不可用）、
"改 bundle 后溯源断言会失败"的破坏性反证（只读约束）。**（注：该项已在 §12.4 于冻结窗口内用"仓库外副本"执行；§11 的 canvas 结论仍以 §12 为准。）**

---

## 12. Canvas delta 复核（第二次提交前 · 冻结窗口内）

> 本节**取代**第 11 节中一切与 `spike/canvas/**` 相关的结论。本节的成立前提是：**被复核对象自 start→end 逐字节不变**。

### 12.1 冻结窗口规程（可验证的"复核当时"定义）

| 步骤 | 命令 | 结果 |
| --- | --- | --- |
| 冻结清单自算 | `(Get-FileHash .codebuddy/audit/freeze-second-commit.txt).Hash` | `8cbc9b03a77aca43b74546fc17e0f9ca8da9b230185094696405f5ddeb65ec92`，与 lead 值 **MATCH** |
| start 核对 | 清单 24 项，除 `docs/review/**` 外逐文件 sha256 比对 | `CHECKED=22`，`ALL_MATCH` |
| end 核对 | 同 start | `END_CHECKED=22`，`END_ALL_MATCH`；冻结文件 sha 与 bundle sha 均未变 |

**我的写入仅限 `docs/review/**`**（本报告与清单）；被复核对象 22 项全程未变，故本节结论有效。

### 12.2 复核范围（canvas 16 个文件）

`PERF.md`、`README.md`、`scripts/{browser-perf.ts, perf-adapter.ts, source-bundle.ts}`、
`perf/adapter-results.json`、`perf/s{1-idle,1-pan,1-panzoom,6-pan,6-panzoom,15-pan,15-panzoom,30-idle,30-pan,30-panzoom}.json`。

### 12.3 全仓扫描枚举产物（枚举来自扫描，非记忆/转述）

全仓扫描 `sourceBundleSha256` → 29 个命中文件；其中**产物类** 15 个：3D `scene-projection.sample.json`(1) + canvas `perf/**`(11) + agent `out/*.json`(3)。
逐一与我**自行重算**的锚点比对：**15/15 OK，FAIL=0**（canvas 11 个子集亦全 OK）。

### 12.4 破坏性反证："重算"而非"抄常量"（§11.8 遗留项，本节执行）

方法：整份复制 `packages/testkit/fixtures/` 到**仓库外**临时目录 → 副本 `demo-trade/model-bundle.json` 追加 1 字节；
**只调用纯函数** `resolveFrozenSourceBundle()`，**未触发** `perf-adapter.ts` / `browser-perf.ts`（避免用错误基线覆盖待复核产物）。

| 条件 | 期望 | 实测输出 |
| --- | --- | --- |
| 阳性（不设 `REQATLAS_FIXTURE_ROOT`） | 不抛错、返回锚点 | `NO-THROW 1a54c6e3158fb2d7a079fad244e30fd774c6b453e06d3859785978a184e03c62` |
| 阴性（`REQATLAS_FIXTURE_ROOT`=改字节副本，副本 sha=`dd6aa875030c74db722dd7964adfb4a9fa29b61172dc32165971eee91c9d0e1d`） | 抛错、报文含"源 bundle 哈希与冻结基线不一致" | `THREW: 源 bundle 哈希与冻结基线不一致（fixture 可能已被改动）：实际=dd6aa875… 冻结=1a54c6e3…` |

结论：函数**读真实字节重算**并比对，不等即抛错；"重算非抄常量"**已被证伪过一次**，非仅凭注释。临时副本已清理（`CLEANUP_DONE=True`）。

### 12.5 PERF.md 数字可追溯性（独立复现 canvas 的 `CHECK_FAILURES=0`）

未采信 canvas 自述，自写断言脚本，对 §2 八行（`project.p50/p95` 与 `layoutCalc.p50/p95`）与
§3 十行（`frames.fpsMean/frameMsP50/P95/max`、`longTasks.count/totalMs/maxMs`、`memoryAfter.usedMb`）逐单元格做**等价比较**：

```
PASS=18 FAIL=0        # 8(§2 行) + 10(§3 行)
```

即 §2/§3 表格**每个数字都能在证据 JSON 中命中**——canvas 的 `CHECK_FAILURES=0` 被**独立复现**。

### 12.6 两个只判定、不改动项

**(a) `metadata.sourceBundleFrozenAnchorSha256` 的判别力 —— 记为「已知限制」，非缺陷**：`browser-perf.ts:71`
直接写入常量 `FROZEN_SOURCE_BUNDLE_SHA256`；且 `resolveFrozenSourceBundle()` 在"重算≠常量"时已先抛错，故产物
只在两者**必然相等**时才写出。

**我自行核证的"是否被过度宣称"（读原文，不采信转述）**：

| 位置 | 我读到的原文 | 是否宣称两字段互校 |
| --- | --- | --- |
| `README.md:28` | "记录 `sourceBundleSha256`（由真实字节**重算**并与冻结锚点比对），可自证源自冻结基线" | 否（写入时重算） |
| `README.md:102` | "`metadata` 记录**重算**的源 bundle sha256（自证基线）" | 否 |
| `PERF.md:67` | "下表数值**逐字取自** `perf/adapter-results.json`…可直接交叉核对" | 否（指表格↔JSON） |
| `PERF.md:102` | "`metadata.sourceBundleSha256` 为**重算值**（= 冻结锚点，自证基线）" | 否 |
| 检索 | `search_content "交叉校验\|双来源\|独立校验\|交叉验证\|双源"` 于 `spike/canvas/*.md` → **0 命中** | — |

→ 四处均为"写入时重算 + 断言"，**无**"两字段互相校验"的宣称。唯一歧义在代码注释 `browser-perf.ts:17`
"二者结构分离，便于独立校验"——主语是 metadata / payload **两层**的结构分离，非两哈希字段互校。

**结论（已知限制，写入本报告并存档）**：
> 产物中 `metadata.sourceBundleSha256` 与 `metadata.sourceBundleFrozenAnchorSha256` **必然相等**——因为
> `resolveFrozenSourceBundle()` 在不相等时会抛错，产物**根本写不出来**。因此这一对字段**是标签、不是校验**，无判别力。

该项**不列入四类清单缺陷**；`browser-perf.ts:17` 原样保留。

**(b) §2/§3 是单次采样还是分布**：`PERF.md:56` 明写"每个配置**单次运行 5 s**；P50/P95 为**单次运行内分布**，
未做多次重复的方差研究"；`PERF.md:69` 明写"运行间抖动约 0–15%，引用请以 JSON 为准"。→ **报告已自述**，不记缺陷。

### 12.7 第 5 条前提判定（README/PERF）

| 前提 | 判定 | 依据 |
| --- | --- | --- |
| README L30-36"包入口拉入 `node:fs`、`./schema` 不会" | **仍成立、应保留** | `index.ts` 的 `export *` → `fixtures.ts` 顶层 `node:fs`/`fileURLToPath` |
| README L25"浏览器直接 import JSON + testkit schema" | 成立 | `src/bundle.ts:7` 直连 JSON，`modelBundleSchema` 来自 `./schema`（`testkit/schema` 子路径） |
| README L26"Node 走 `loadFixtureBundle`、以模块位置解析" | 成立 | `src/load-node.ts` 已改为 `loadFixtureBundle('demo-trade')` |
| README L28 溯源说明 | 成立 | `perf/adapter-results.json` 顶层确有 `sourceBundleSha256` |

### 12.8 四类清单（canvas delta）

- **必须改：0**
- **建议改：1（低）**
  1. `spike/canvas/README.md:56` → 引用"（ADR-003 §3.4）"**不精确**：`docs/adr/ADR-003.md` 经检索**无 `§3.4`/`§3` 编号**（`search_content "3\.4|§3"` = **0 命中**）；对应内容为 ADR-003「决策」第 4 条（布局补丁不 bump revision、语义变更 bump）。建议改为 `ADR-003 决策第 4 条`。
  > **范围外补充（防止误读）**：同一悬空引用 `ADR-003 §3.4` **另有 2 处位于本 delta 范围之外**——`spike/canvas/src/changeset.ts:7`（基线遗留，`git status --porcelain -- spike/canvas/src` 为空）与 `spike/canvas/src/App.tsx:168`（同属 `dc06bb2` 基线遗留，且该值**会写入 ChangeSet `reason`，随产物输出**）。二者**已移交第三次小提交**（详见 §13.4 第 1 组 #2/#3）。**本 delta 复核不覆盖它们**；切勿据本节判断"该问题仅 1 处 / 已清"。
- **历史遗留：0（本 delta 未新增）**
- **待确认：0**
- **已知限制（非缺陷，记录存档）：1** —— `metadata.sourceBundleFrozenAnchorSha256` 是**标签而非校验**、无判别力（详见 §12.6a；按 lead 裁定不打码不改）。

### 12.8.1 过程结论：跨切面缺陷在 delta 范围内**不可见**

> 同一个缺陷族可能**同时横跨基线与本轮 delta**。任何**按 delta 划范围**的复核都**看不见**这类跨切面缺陷——
> **这不是能力问题，是范围定义的必然结果**（本例：`ADR-003 §3.4` 全仓 3 处中，只有 1 处落在 canvas delta 内，
> 另 2 处属基线，delta 复审**一次也没扫到它们**；而其中一处在**用户可见产物**里）。
> 因此"引用真实性"这类**跨切面检查不能挂在 delta 复核下**，必须独立为 **全仓扫描** + **里程碑收尾检查项**。
> 落地：本报告 §13（全仓引用完整性扫描）+ `readonly-review-checklist.md` 维度八「引用真实性（cross-ref 可解析）」。
>
> **可复用判据（补记）**：**反向证明与"不可变性"断言都是 delta 作用域的**——记录必须写明**成立前提**，否则后人会把它当成普遍不变量。
> 例：§12.10"构建产物逐字节不变"只在"该 delta 改动全部位于浏览器依赖图之外"时成立；当后续批次改了一个**产物值**（如 `App.tsx:168` 的 `reason`），
> bundle 名/大小/sha256 **必然变化**——那**不构成行为变更的证据**，只是"图内有改动"的必然结果。
>
> **门禁范围也是"被检查属性"（补记）**：**新增文件时，"它落在哪个门禁范围内"本身是一个需要被检查的属性。**
> 实测：三个 spike 各自包级门禁全绿、`foundation` 改 `apps/api` 后也自测全绿，**只有根 `pnpm lint`** 看见"新增的 `.mjs` 落在一个**没有任何 Node 环境声明**的目录里"（34 个 `no-undef`）。
> **局部全绿 ≠ 整体全绿**——这不是谁不认真，是**范围**决定了看不见。

### 12.9 未执行项（如实）

`pnpm --filter @reqatlas/spike-canvas perf` / `perf:browser`：**未运行**——二者会写 `perf/**`，且 lead 警告覆盖生效时运行会用错误基线**覆盖待复核产物**；真实 GPU 桌面浏览器未验证（`PERF.md:33/173` 已标注）。`build` 已在 §12.10 单独运行（只写 `dist/**`，非被复核对象）。

### 12.10 反向证明复现：浏览器产物逐字节不变

> **成立前提（delta 作用域）**：本节的反向证明是 **delta 作用域**的——其成立前提是"**该 delta 的改动全部位于浏览器依赖图之外**"。因此它
> **不可**被推广为"canvas 的浏览器产物永不变"，也**不可**用来推断后续批次（如第三次提交把 `spike/canvas/src/App.tsx:168` 的 ChangeSet `reason` 产物值改文案）"同样在图外"——
> 那时 bundle 名/大小/sha256 **必然变化**（实测：`index-CaGiYfY_.js` 499.03 kB → `index-CsiZu05R.js` 499.04 kB；`contains` 双向验证该变化即这处字符串替换）。

`canvas-spike` 声称"新增代码不进浏览器依赖图，构建产物同名同大小"。**自行复现**（`build` = `tsc --noEmit && vite build`，只写 `dist/**`）。

**快照时刻：第二次提交前（2026-10-04）** —— 下列数值是该时刻的实测事实，**非永久常量**：

| 资产 | PRE（构建前） | POST（构建后） | 判定 |
| --- | --- | --- | --- |
| `dist/assets/index-CaGiYfY_.js` | 499028 B / `c3755173…6bf2` | 499028 B / `c3755173…6bf2` | 名、大小、sha256 **完全一致** |
| `dist/assets/index-CaGiYfY_.js.map` | 2194270 B / `b163565a…9372` | 2194270 B / `b163565a…9372` | 一致 |
| `dist/assets/index-CLGCPShy.css` | 21343 B / `e3d65ba7…1bb6` | 21343 B / `e3d65ba7…1bb6` | 一致 |

> **当前值对照（第三次提交后，我自核 `Get-ChildItem spike/canvas/dist/assets/*`）**：`index-CsiZu05R.js` = **499038 B**、`index-CsiZu05R.js.map` = **2194352 B**；CSS 未变（`index-CLGCPShy.css` 21343 B）。变化来源 = `spike/canvas/src/App.tsx:168` 的 `reason` 文案（**产物值**，在图内）。

`BUILD_EXIT=0`；重建前后**逐字节一致**（**在该 delta 作用域内**）→ 证明 `scripts/source-bundle.ts` 等新增 Node-only 代码**确在浏览器依赖图之外**。
构建后再次核对被复核对象：`POST_BUILD_ALL_MATCH`（22/22），故 §12 结论仍有效。

---

## 13. 全仓引用完整性扫描（citation integrity sweep）

> 目的：悬空引用（指向不存在的章节/编号）会让读者以为"是自己没找到"，比错别字隐蔽；且已证明它能**逃进产物**（见 §13.4 第 2 组）。**本轮只读，不修任何文件。**

### 13.1 范围与方法

- 范围：`apps/`、`packages/`、`spike/`、`docs/` 下 `.md` / `.ts` / `.tsx`，排除 `node_modules` / `dist` / `out` → **174 个文件**（lead 基线写 173，差异为口径/时点）。
- 方法：先建**有效集**（ADR 文件名 11 个；`open-questions.md` 定义 `OQ-1..6`；实施方案任务号 72 个；实施方案/开发方案/产品设计文档/`docs/*.md` 的小节号集），再对每条引用核目标是否存在。
- `§x.y` 的目标判定：**仅在同行明确指名目标文档时**才核（"紧邻锚点"：`ADR-nnn|实施方案|开发方案|产品设计文档|<path>.md`，其后 ≤30 字符内的 `§`），**自引用不算**；`见 §x` 视为跳转自引用，不配对。

### 13.2 规模（**每组计数附运行参数与时刻**；命令见 §13.8）

> **运行参数与时刻**：第 2 列 = `node .codebuddy/audit/citation-check.mjs`（**全仓**）；第 3 列 = 同命令加 **`--exclude-review`**。两条均于 **2026-10-04** 运行。
> **全仓列含本报告自身**（故随报告增长而变：`ADR-nnn` 曾为 139 → 172 → 181）；`--exclude-review` 列**稳定**（只取决于复核目录以外的文件）。

| 类别 | 全仓（含 `docs/review`） | `--exclude-review` |
| --- | ---: | ---: |
| 文件数 | **174** | 174 |
| `ADR-nnn` | 181 | 127 |
| `OQ-n` | 50 | 40 |
| `M\d-\d\d` | 265 | 250 |
| `§x.y`（显式指名目标） | 115 | 60 |
| `附录 X`（显式指名目标） | 34 | 28 |
| `P\d` | （以 `P1..P7` 正则限定，均有效；python 快照 40 次） | — |

未显式指名目标（按规则**不判定**）：`§` 264（全仓）/ 185（排除复核）；`附录` 21。

> **口径与漂移（更正先前猜测，已与 lead 核实）**：lead 的基线（文件 173、`ADR` 107、`§x.y` 173、`OQ` 32、`M` 207）差异**主因**是 lead 用 `Select-String` **默认按行计数**（报**行数**），本工具报**出现次数**；次因是**时点**。**计数含本报告自身**（大量引用 ADR/§ 编号），会随报告增长而变（例：python 快照 `ADR-nnn` 139 → 写入 §13 后工具输出 172）。故**一律以工具当前输出为准并注明运行时刻**；两组数字**不等价**，勿混用。

### 13.3 各类别 已核 / 悬空 计数（工具当前输出，见 §13.7）

| 类别 | 已核（引用数） | 悬空 | 结论 |
| --- | ---: | ---: | --- |
| `ADR-nnn`（文件存在性） | 172 | **0** | 全部指向存在的 ADR 文件 |
| `OQ-n`（定义存在性） | 44 | **0** | 全部落在 `OQ-1..6` |
| `M\d-\d\d`（任务号存在性） | 263 | **0** | 全部是实施方案既有任务号 |
| `P\d`（产品原则） | — | **0** | 正则限定 `P1..P7` |
| `§x.y`（显式指名目标） | 115 | **33** → 排除复核 **0**（修复后） | 见 §13.4；全仓悬空**全部来自本报告/清单的刻意引用**；12 处真实缺陷已修复 |
| `附录 X`（显式指名目标：产品设计文档 / 开发方案 / 实施方案） | 32 | **0** | 附录字母均在目标文档 `A–G`（实施方案 `A–C`）内 |

> `§x.y` 另有 264 处未显式指名目标，`附录` 另有 21 处，按规则**不判定**。

### 13.4 悬空引用清单

**第 1 组：真实悬空（12 处引用点 / 14 个 § 记号）**

| # | 文件:行 | 悬空引用 | 原文（节选） | 应指向 |
| --- | --- | --- | --- | --- |
| 1 | `spike/canvas/README.md:56` | `ADR-003 §3.4` | "布局补丁 bumpsRevision=false…（ADR-003 §3.4）" | ADR-003「决策」**第 4 条**（ADR 章节为 `## 2..9`，无 `3.4`） |
| 2 | `spike/canvas/src/App.tsx:168` | `ADR-003 §3.4` | `'画布拖动产生的布局补丁（不落 revision，ADR-003 §3.4）'` | 同上（**此值会写进 ChangeSet `reason`，逃进产物**） |
| 3 | `spike/canvas/src/changeset.ts:7` | `ADR-003 §3.4` | "…**不产生 revision**（ADR-003 §3.4）" | 同上 |
| 4 | `spike/presentation-3d/README.md:26` | `ADR-004 §3.6` | "不写回任何业务对象（ADR-004 §3.6）" | ADR-004「决策」对应条第 6 条 |
| 5 | `spike/presentation-3d/src/components/Scene3D.tsx:17` | `ADR-004 §3.3` | "低多边形 3D 导览（ADR-004 §3.3）" | ADR-004「决策」第 3 条 |
| 6 | `spike/presentation-3d/src/presentation/render-mode.ts:2` | `ADR-004 §3.4` | "渲染模式决策（ADR-004 §3.4 / 实施方案 §7.5）" | ADR-004「决策」第 4 条（右侧 `实施方案 §7.5` **有效**） |
| 7 | `spike/presentation-3d/src/presentation/text-equivalent.ts:4` | `ADR-004 §3.3` | "文本等价表达（实施方案 §7.1 / ADR-004 §3.3）" | ADR-004「决策」第 3 条（`实施方案 §7.1` **有效**） |
| 8 | `spike/presentation-3d/src/presentation/webgl.ts:2` | `ADR-004 §3.4` | "WebGL 可用性探测（ADR-004 §3.4）" | ADR-004「决策」第 4 条 |
| 9 | `spike/presentation-3d/src/projection/project-scene.ts:25` | `ADR-004 §3.5` | "确定性保证（ADR-004 §3.5）" | ADR-004「决策」第 5 条 |
| 10 | `packages/testkit/src/model-bundle.schema.ts:130` | `实施方案 §5.5`、`§14` | "evidence：独立实体（实施方案 §5.5 / §14）" | 实施方案无 §5.5 / §14；疑应指**产品设计文档 §14** 等，待作者确认 |
| 11 | `docs/pilot/pilot-scenario.md:55` | `实施方案 §5.5`、`§14` | "证据为独立实体（…实施方案 §5.5 / §14）" | 同上 |
| 12 | `docs/pilot/template-sample-mapping.md:23` | `实施方案 §8.5` | "实施方案 §8.5 金样例清单…" | 实施方案金样例在 **§8.2**（§8 只有 8.1–8.4） |

**第 2 组：描述性提及（不是引用，不计缺陷，2 处）**

| 文件:行 | 说明 |
| --- | --- |
| `docs/engineering/submission-m0m1.md:324` | 文中在**描述**该缺陷本身（"同一悬空引用（ADR-003 §3.4），已知 ≥3 处"） |
| `docs/review/m0-readonly-review.md:406` | 本报告在**记录**该缺陷（§12.8 建议改 1） |

### 13.5 已排除的假阳性（供复跑者核对）

- `docs/engineering/README.md` 内部 `§6.1/§6.3/§6.4/§6.5/§6.6`：该文件**确有** `6.1–6.6` 子节，属**自引用**，有效。
- `docs/knowledge/{manufacturing,trade}/template-package.md:7` 的 "`README.md` §3"：目标为**就近祖先** `docs/knowledge/README.md`（有 `## 3.`），有效。
- 实施方案内 `§2.1/§2.4/§8.1`、`spike/presentation-3d` 的 `实施方案 §7.5/§7.1`：均为实施方案**既有**小节，有效。
- 教训：`§` 的目标判定必须**就近配对**（`见 §x` 是跳转、自引用不算），否则会产生"他处 ADR 劫持本处 §"的假阳性。

### 13.6 结论与局限

- **必须改（引用真实性）**：`spike/canvas/**`（3 处 `ADR-003 §3.4`，含 1 处**进入产物**）、`spike/presentation-3d/**`（6 处 `ADR-004 §3.x`）、`packages/testkit`/`docs/pilot`（5 处 `实施方案 §5.5/§14/§8.5`）。共 **12 处**。
- **已修复（第三批）**：本轮收尾复跑，`spike/**` 等 **12 处已全部修复**（`search_content` 命中 **0**）；工具 `--exclude-review` 现已 **DANGLING=0（EXIT=0）**——修复前仅剩的 1 条描述性提及（`docs/engineering/submission-m0m1.md:324`）**亦已消除**（见 §13.8）。
- **根因（已与 lead 核实）**：本轮 12 处悬空中**至少 6 处可直接追溯到 team-lead 的派单文案**——`§5.5` / `§14` / `§8.5` **首次出现在派单里**，**不是** `spike`/`sample` 的自发错误。制度意义：**"谁来核验指令里的引用"与核验实现同等重要**。
- **正确目标（lead 已定）**：`§5.5 / §14`（`packages/testkit/src/model-bundle.schema.ts:130`、`docs/pilot/pilot-scenario.md:55`）→ **`§4.1`（表清单含 `evidence` / `evidence_link`）＋ `§7.4`（安全与权限：分类与脱敏）**；`§8.5`（`docs/pilot/template-sample-mapping.md:23`）→ **`§8.2 金样例与 fixture`**。
- **共同形态**：把"ADR「决策」第 N 条"误写成 `§3.N`——`ADR-001..010` 章节为 `## 2..9`、**无 `3.x`**（`ADR-011` 例外：有 `3.1–3.3`）。属**系统性**误引用，非孤例。
- **类级结论（可先验判定，不必逐条核验）**：`ADR-001..010` 的合法小节里**没有任何 `3.x`**，故**任何** `ADR-00N §3.N`（N=1..10）**无需逐条核验即可先验判为悬空**；仅 `ADR-011`（有 `3.1–3.3`）需逐条核。→ 这不是 12 个孤立错误，而是**一类必然错误**的写法；已在清单维度八写明，使下一个写 ADR 引用的人不再造出此形态。
- **修法分三类（本轮实测，`viz3d-spike` 第 6 处暴露了第③类）**：① **编号写错** → 改对编号（`ADR-003 §3.4` → 「决策第 4 条」）；② **无此内容** → 上报（`实施方案 §5.5 / §14` 不存在）；③ **主张确实存在、但不在预期位置** → **指向它真正所在的位置，即使那是「上下文」而非「决策」**（"3D 不承载独占信息"逐字出自 `ADR-004 §2 上下文`，不在「决策」6 条内 → 改为 `ADR-004 §2 上下文：3D 不承载独占信息`）。**第③类不得用"去掉引用"来简化**——`ADR-004：3D 不承载独占信息` 读起来像是**决策**，去掉锚点等于把"性质"（它是前提/上下文）也一起丢了，**比指错更难发现**。
- **局限（改为"可复核的公开披露"，不再是"可能有偏差"）**：① 仅配"同行紧邻"目标；邻行指名与未指名目标的 `§`/`附录` 未核（工具报告其未判定数）；② `.docx` 目标的**抽取规则与抽取结果均已公开**（见 §13.7），偏差**可被发现**；③ 计数口径差异原因已查明（见 §13.2），两组数字**不等价**。

### 13.7 有效集与抽取规则（公开，供独立复核）

> 扫描结论**完全依赖有效集**——有效集错了，扫描就错了（会把真实引用误判悬空，或把悬空误判有效）。故在此**显式公开**"我认为存在的东西"与"如何抽出它们"。
> 生成命令：`node .codebuddy/audit/citation-check.mjs --valid-sets`（2026-10-04 运行）。

**抽取规则**
- `.md`：逐行取 `^\s*#{0,6}\s*(\d+(?:\.\d+)*)`（行首编号）→ 小节集；`附录\s*([A-Z])` → 附录集。
- `.docx`：内置极简 ZIP 读取（`EOCD → 中心目录 → inflateRawSync`，思路同 `.codebuddy/audit/docx-code-trace-audit.py`）取出 `word/document.xml` → 按 `</w:p>` 切段去标签 → 同一套编号/附录规则。
- **去噪**：编号各段必须 **≤2 位**（排除 `400/404/...` 等 HTTP 码被当成章节）。

**已知偏差（公开，可被发现）**
1. 仅识别**行首**编号；正文/表格**行内**出现的编号不计；
2. docx 中**未编号**的标题不计；
3. 中文顶层编号（"十三、"）**未**纳入 `§` 核验（引用多以阿拉伯数字 `§x.y` 出现）；
4. `≤2 位`去噪是**启发式**，仍可能残留噪声——实测 `ADR-002` 多出 `12`、`ADR-010` 多出 `10.32.1 11.6.2`（版本号行首），`spike/canvas/PERF.md` 多出 `8 14 39 49 60`。这些噪声只会让判定**偏宽**（少报悬空），不会误报悬空；已如实列出。

**有效集（`--valid-sets` 原样输出）**
- **ADR 文件（11）**：`ADR-001`～`ADR-011`。各 ADR 章节号：
  - `ADR-001..009`：`1 2 3 4 5 6 7 8 9`（`ADR-002` 噪声多 `12`）
  - `ADR-010`：`1 2 3 4 5 6 7 8 9 10`（噪声 `10.32.1 11.6.2`）
  - `ADR-011`：`1 2 3 3.1 3.2 3.3 4 5 6 7 7.1 7.2 7.3 7.4 8 9`
  - **关键推论**：ADR 均**无 `3.x`**（`ADR-011` 的 `3.1–3.3` 除外），故 `ADR-001..010 §3.N` **必然悬空**——这正是 §13.4 A/B 两组的系统误引用。
- **`OQ` 定义（6）**：`OQ-1 OQ-2 OQ-3 OQ-4 OQ-5 OQ-6`（来源 `docs/api/open-questions.md`）。
- **实施方案（`.md`）** 小节：`0 0.1 0.2 0.3 1 1.1–1.6 2 2.1–2.5 3 3.1–3.4 4 4.1–4.5 5 5.1–5.4 6 6.1–6.9 7 7.1–7.5 8 8.1–8.4 9 9.1–9.4 10 11 11.1–11.3 12`；附录 `A B C`；任务号 **72**（`M0-01`～`M8-08`，正则 `M\d-\d\d` 抽取）。
- **产品设计文档（`.docx`）** 小节：`1 1.1–1.6 2 2.1–2.4 3 3.1–3.3 4 4.1–4.4 5 5.1–5.7 6.1–6.8 7.1–7.6 8.1–8.7 9.1–9.8 10.1–10.5 11.1–11.7 12.1–12.5 13.1–13.8 14.1–14.6 15.1–15.5 16.1–16.6 17.1–17.3`；附录 `A B C D E F G`。
  → `产品设计文档 §9.3` 与 `附录 F` **均有效**：`docs/pilot/model-bundle-open-questions.md:61` 的引用**成立**。
- **开发方案（`.docx`）** 小节：`1.1–1.3 2.1–2.5 3.1–3.4 4.1–4.5 5.1–5.7 6.1–6.7 7.1–7.7 8.1–8.7 9.1–9.10 10.1–10.9 11.1–11.3`；附录 `A B C D E F G`。
- **`.md` 目标（按需加载）**：`docs/api/domain-rules.md`(`1–5`)、`docs/api/README.md`(`1–8`)、`docs/engineering/README.md`(`1–7`，含 `6.1–6.6`)、`docs/knowledge/README.md`(`1–9`，含 `3.1–3.3`)、`spike/canvas/PERF.md`(`0–4`，噪声 `8 14 39 49 60`)。

### 13.8 收尾

已落地三点：

1. `docs/review/readonly-review-checklist.md` 维度八新增检查项 **「引用真实性（cross-ref 可解析）」**；命令指向下述工具，使里程碑收尾只需**一条命令**。
2. **可复跑工具**：`.codebuddy/audit/citation-check.mjs`（Node ESM，**零新增依赖**，内置极简 ZIP 读取以解析 `.docx` 目标与**附录**；支持 `--exclude-review`、`--valid-sets`、行内 `citation-check:allow` 豁免）。
3. 有效集与抽取规则见 §13.7（公开）。

**真实运行（验证凭据，2026-10-04；`--exclude-review`）**：

```
node .codebuddy/audit/citation-check.mjs --exclude-review
files=174
ADR-nnn 127已核/0悬空   OQ-n 40/0   M\d-\d\d 250/0
§x.y(显式) 60/0（另有186未判定）   附录 X(显式) 28/0（另有21未判定）
DANGLING = 0
EXIT=0
```

- **`--exclude-review` 下已全绿**：`DANGLING=0`，即**排除复核文档后全仓无悬空引用**。修复前该模式仅剩 1 条描述性提及（`docs/engineering/submission-m0m1.md:324`），**现已消除**。
- 不加 `--exclude-review` 时为 34 条，**全部来自 `docs/review/**`**（本报告与清单**刻意引用**缺陷原文以做记录），属预期噪声。
- **结论**：原 **12 处真实悬空已在第三批修复**（`spike/**` 检索命中 **0**）；工具修复后复跑确认 **0**。
- 附：`--valid-sets` 打印 §13.7 的完整有效集与抽取结果。

**本轮未修任何被引用文件**（仅写 `docs/review/**` 与 `.codebuddy/audit/**`）。

### 13.9 第三方复核：`spike/presentation-3d` 6 文件的语义差异（判据：prettier 归一）

> 背景：`viz3d-spike` 除改 6 处引用外，对自己 6 个文件跑了 `prettier --write`（EOL + 换行 + 尾逗号 + 表格分隔符归一），diff 因此混入整文件重排版。
> **判据**：滤掉格式噪声，确认**唯一语义差异恰好等于预测的 6 条**——**不是"看差异合理不合理"，而是"实际差异是否恰好等于这份预测"**（多一条、少一条、内容不同都要报）。

- **判据演进（记一次"错误判据"的教训）**：
  1. `git diff --ignore-all-space` —— **不够**：它忽略**行内空白**，但**不忽略**换行重排、`trailingComma:"all"` 的尾逗号、markdown 表格分隔符（实测仍报 6 文件、+39/−30 行）。
  2. "去除全部空白后比较" —— 能定位语义差异，但会把格式残留一起展平，不适合作为终态判据。
  3. **本报告采用的判据**：`prettier.format(git show HEAD:<f>, resolveConfig(f))` **归一旧内容** → 与工作树**逐字符比较**（EOL 归一为 LF）。
- **实测结果（6/6，逐条与预测一致，无多无少）**：

| 文件 | 归一后 `-`（旧+prettier） | 工作树 `+`（现） | 与预测 |
| --- | --- | --- | --- |
| `README.md` | `§3.6` | `决策第 6 条` | 一致 |
| `src/components/Scene3D.tsx` | `§3.3` | `决策第 3 条` | 一致 |
| `src/presentation/render-mode.ts` | `§3.4` | `决策第 4 条` | 一致 |
| `src/presentation/text-equivalent.ts` | `3.3` | `2 上下文：3D 不承载独占信息` | 一致 |
| `src/presentation/webgl.ts` | `§3.4` | `决策第 4 条` | 一致 |
| `src/projection/project-scene.ts` | `§3.5` | `决策第 5 条` | 一致 |

`SUMMARY exact=0 diff=6 total=6` —— **每个文件恰好 1 处差异 = 引用字符串**。

- **结论**：6 文件的**语义差异恰好等于预测的 6 条**；`prettier --write` 的格式改动被归一后**无害化**，**无超出 6 处的语义变更**。
- **教训**：**一个错误的判据比没有判据更糟**——错判据提供"虚假的确定性"，会**把真信号与噪声一起忽略**（或产生假警报）。复核者在一堆格式噪声里找语义变更，正确解法是**换一把能滤掉噪声的尺子**，而不是要求作者回退格式改动。

### 13.10 已知且刻意的范围排除：`spike/presentation-3d` 的 `prettier --check`

- **现象**：`spike/presentation-3d` 的包级 `prettier --check` 对 **25 个未在本批清单内的文件**仍红，根因 `core.autocrlf=true`（`i/lf w/crlf`）。
- **定性**：**已知且刻意的范围排除**——`spike/**` **不在根 format 门禁内**；若强行归一，会把批次扩到 **42 个文件**并**动到他人已冻结的目录**。
- **触发条件**：**`spike/**` 退役、或被纳入根门禁时，一次性归一**。本批**不回退**、不归一。
