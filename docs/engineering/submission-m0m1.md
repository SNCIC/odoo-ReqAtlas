# M0 / M1 里程碑提交包（第二次提交）

| 项目     | 内容                                                                   |
| -------- | ---------------------------------------------------------------------- |
| 里程碑   | M0（技术验证）+ M1（工程底座与身份，部分）                             |
| 编制日期 | 2026-10-04                                                             |
| 编制人   | foundation（工程底座工作流）                                           |
| 依据     | 《需求调研工作台-具体实施方案》v1.0 §9.1                               |
| 状态     | **待提交**；本文件对应第二次提交，SHA 由总指挥提交后回填               |
| 说明     | 本文件如实记录交付事实与**未验证项**，不做美化；未跑通的项一律显式标注 |

---

## 1. 基线（本提交包所属批次）

| 项                                 | 内容                                                                                      |
| ---------------------------------- | ----------------------------------------------------------------------------------------- |
| **基线 commit（首次提交 / HEAD）** | `dc06bb258513a75f760357db56c2978a8ae9fde5`（short `dc06bb2`）                             |
| 基线提交信息                       | `chore(m0): 需求调研工作台 M0 技术验证基线首次入库`（270 files）                          |
| 本提交包所属提交                   | **第二次提交**：`<第二次提交 SHA 待回填>`（由总指挥提交并推送后回填）                     |
| remote / branch                    | `https://github.com/SNCIC/odoo-ReqAtlas.git`（origin） / `main`（tracking `origin/main`） |
| 本轮被复核并冻结的改动集           | **24 个文件**，见 `.codebuddy/audit/freeze-second-commit.txt`（含逐文件 sha256）——详见 §9 |
| 本提交说明自身的状态               | `docs/engineering/**` 于**冻结之后**撰写，**不在复核范围内**（见 §10）                    |
| 提交动作                           | 由总指挥执行；本工作流**不 commit / 不 push**                                             |

---

## 2. 启动（一条命令）

前置：Node **>= 22**（本机实测 25.2.1，见 §8）、pnpm **10**（`packageManager: pnpm@10.32.1`）。**无需 Docker**（除下述注明项）。

| 目标                  | 一条命令                                            | 说明                                                                                                                 |
| --------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 全量并行              | `pnpm install && pnpm dev`                          | 并行启动所有含 `dev` 的包：web / api / worker / spike-canvas / spike-presentation-3d                                 |
| web                   | `pnpm --filter @reqatlas/web dev`                   | http://localhost:5173，`/api` 代理到 `http://localhost:3000`                                                         |
| api                   | `pnpm --filter @reqatlas/api dev`                   | http://localhost:3000；探针 `GET /api/v1/health`；`GET /api/v1/tenant-context`（需头 `x-tenant-id`）                 |
| worker                | `pnpm --filter @reqatlas/worker dev`                | ⚠️ 启动时 `new Worker(...)` 会**连接 Redis**；本机无 Redis，**运行未验证**。单测以 `FakeQueueAdapter` 覆盖（4 用例） |
| spike-canvas          | `pnpm --filter @reqatlas/spike-canvas dev`          | 2D 画布（React Flow）                                                                                                |
| spike-presentation-3d | `pnpm --filter @reqatlas/spike-presentation-3d dev` | 3D 导览 + 2D 降级                                                                                                    |
| spike-document        | 无 dev server                                       | 用 `generate` / `verify`，见 §6                                                                                      |
| spike-agent           | 无 dev server                                       | 用 `golden`，见 §6                                                                                                   |

API 关键行为（M1-04）：全局 `X-Request-Id`（生成态 `req_<32hex>`；入站仅合规 `^req_[A-Za-z0-9_-]{1,64}$` 复用，否则替换并记日志 `inboundRequestId`）；统一 `application/problem+json` + 稳定 `code`；结构化 JSON 行日志（含 `requestId`/耗时/状态码，敏感键脱敏）。

---

## 3. 迁移

- **M1-05 未实现**：Drizzle Schema、migration runner、空库/升级测试、demo seed **均未实现**。
- 原因：本机 PostgreSQL 17 + pgvector 虽存在，但 `pg_hba.conf` 全为 `scram-sha-256` 且**无可用凭据**；"是否接入本地库"作为决策项上报产品负责人，**裁定前不实现**（见 `docs/engineering/README.md` §6.4）。
- 当前仓库**不含任何数据库迁移脚本**。
- 结论：**本提交包不得被判定为"迁移已完成"**。

---

## 4. 契约

目录 `docs/api/**`（由 `contracts` 工作流产出，契约先行草案）：

| 文件                                      | 内容                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------- |
| `openapi.yaml`                            | OpenAPI 3.1，M0/M2 起始端点 + 通用协议                                                |
| `schemas/error-code.json`                 | 稳定错误码枚举（附录 A，**10 个**）                                                   |
| `schemas/problem.json`                    | RFC 9457 `application/problem+json` 错误体（`code` 对 `error-code.json` 严格 `$ref`） |
| `schemas/change-set.json`                 | ChangeSet / ChangeOperation                                                           |
| `schemas/change-draft.json`               | Agent 结构化输出契约                                                                  |
| `schemas/agent-run.json`                  | AgentRun 请求与状态机                                                                 |
| `schemas/common-defs.json`                | 共享枚举 `$defs`（`OperationKind` / `TargetType` / `ScopeType`）                      |
| `schemas/model-bundle.ref.json`           | ModelBundle 引用说明（不重复定义）                                                    |
| `examples/change-set-request.json`        | 手工建模链路示例                                                                      |
| `examples/change-draft-response.json`     | Agent 链路示例                                                                        |
| `examples/problem-revision-conflict.json` | 409 `REVISION_CONFLICT` 示例                                                          |
| `events.md`                               | SSE 事件契约                                                                          |
| `domain-rules.md`                         | 12 条领域校验规则的接口级表达                                                         |
| `open-questions.md`                       | 契约开放问题登记（OQ-1~OQ-5）                                                         |

验证命令（出自 `docs/api/README.md` §7，JSON Schema 2020-12）：

```powershell
# 1) OpenAPI lint（要求 0 error 0 warning）
npx --yes @redocly/cli@latest lint docs/api/openapi.yaml

# 2) 示例对 Schema 校验
npx --yes ajv-cli@latest validate --spec=draft2020 -s docs/api/schemas/change-set.json -d docs/api/examples/change-set-request.json
npx --yes ajv-cli@latest validate --spec=draft2020 -s docs/api/schemas/change-draft.json -r docs/api/schemas/change-set.json -d docs/api/examples/change-draft-response.json
npx --yes ajv-cli@latest validate --spec=draft2020 -s docs/api/schemas/problem.json -r docs/api/schemas/error-code.json -d docs/api/examples/problem-revision-conflict.json
```

> 验证状态：上述命令由 `contracts` 工作流执行并通过（见 `docs/api/open-questions.md` 附注）。
> **本工作流未复跑**以上 `npx` 命令（`@redocly/cli` / `ajv-cli` 非本工作流安装项），此处如实标注。

`packages/contracts`（TS 侧）：`ERROR_CODES`（权威 10 个）+ `ERROR_CODE_HTTP_STATUS`；并由 `apps/api/src/common/contract-consistency.spec.ts` 断言其与 `docs/api/schemas/error-code.json` 的 `enum` 集合相等、HTTP 映射逐项一致、且非契约兜底常量与 `ERROR_CODES` 无交集（**该 spec 只读契约文件，不修改 `docs/api/**`**）。

---

## 5. 测试口径

**`apps/api`（本工作流实测，与总指挥独立测量一致）：`5 files / 26 tests`**

| spec                                           | 用例                   |
| ---------------------------------------------- | ---------------------- |
| `src/health/health.controller.spec.ts`         | 2                      |
| `src/tenant/tenant-context.controller.spec.ts` | 2                      |
| `src/common/problem-details.filter.spec.ts`    | 8                      |
| `src/common/contract-consistency.spec.ts`      | 3                      |
| `src/common/request-id.spec.ts`                | 11                     |
| **合计**                                       | **26**（`2+2+8+3+11`） |

- `tenant-context.controller.spec.ts` 断言 **`code === 'VALIDATION_FAILED'`** 且 **`context.field === 'x-tenant-id'`**，依据总指挥对 **OQ-5** 的裁定（**选项 B**：缺租户头属"请求不完整"，不误用 401）。
- **不保留**旧证据"缺 `x-tenant-id` → `TENANT_CONTEXT_REQUIRED`"：那是**改动前**的实测，已被上述裁定取代；保留它会让本批同时携带**已作废的证据**。

全仓门禁（**首次提交前**由总指挥实测；本工作流此前实测一致）：

| 命令                              | 结果                                                                                                |
| --------------------------------- | --------------------------------------------------------------------------------------------------- |
| `pnpm -r typecheck`               | exit 0；16 个项目全 `Done`                                                                          |
| `pnpm test`                       | exit 0；合计 156 用例（testkit 40 / agent 45 / presentation-3d 28 / api 26 / canvas 13 / worker 4） |
| `pnpm arch`                       | exit 0；`no dependency violations found (52 modules, 77 dependencies cruised)`                      |
| `pnpm format:check` / `pnpm lint` | exit 0                                                                                              |

> **本轮未复跑**上述任何测试 / 构建 / perf：冻结窗口内运行可能写入 `perf/**`、`dist/**`、`out/**` 并**覆盖待复核产物**（见 §8）。故上表为**冻结前**口径。`adr` 的复核结论见 §9。

---

## 6. 演示

**固定 seed**（`packages/testkit/fixtures/`）：

| seed                 | 用途                                                                   |
| -------------------- | ---------------------------------------------------------------------- |
| `demo-trade`         | M0 四个 Spike 的**共同**输入（唯一事实源，经 testkit zod Schema 校验） |
| `demo-manufacturing` | testkit 校验用例使用                                                   |

**重建 / 校验 seed**：

```powershell
pnpm --filter @reqatlas/testkit test   # valid-bundle / consistency / negative-sample 等校验 demo-* bundle
```

**四个 Spike 复现命令**：

```powershell
# M0-03 2D 画布（React Flow）：13 用例；性能测量
pnpm --filter @reqatlas/spike-canvas typecheck
pnpm --filter @reqatlas/spike-canvas test
pnpm --filter @reqatlas/spike-canvas build
pnpm --filter @reqatlas/spike-canvas perf
pnpm --filter @reqatlas/spike-canvas exec playwright install chromium   # 首次
pnpm --filter @reqatlas/spike-canvas perf:browser

# M0-04 3D 导览 + 2D 降级：28 用例
pnpm --filter @reqatlas/spike-presentation-3d test
pnpm --filter @reqatlas/spike-presentation-3d build
pnpm --filter @reqatlas/spike-presentation-3d emit:sample
pnpm --filter @reqatlas/spike-presentation-3d exec tsx scripts/measure-projection.ts

# M0-07 文档生成（DOCX/PDF）
pnpm --filter @reqatlas/spike-document generate
pnpm --filter @reqatlas/spike-document generate -- --pdf   # 需本机 LibreOffice（26.2.3.2）
pnpm --filter @reqatlas/spike-document verify

# M0-05/M0-06 Agent 结构化草案（Provider Adapter + 双校验 + 无写权限 apply）：45 用例
pnpm --filter @reqatlas/spike-agent golden
pnpm --filter @reqatlas/spike-agent golden -- --scenario=role-conflict
```

> 截图 / 短录屏：**本轮未附**。证据以可复现命令、测试输出与各 Spike 的 `README.md` / `PERF.md` 为准。

---

## 7. 决策

**ADR（`docs/adr/`）：全部 `Proposed`，等待总指挥裁定。**

| 编号    | 标题                         | 状态                   |
| ------- | ---------------------------- | ---------------------- |
| ADR-001 | 首版架构形态                 | Proposed               |
| ADR-002 | 事实与版本                   | Proposed               |
| ADR-003 | 2D 画布                      | Proposed               |
| ADR-004 | 3D 呈现                      | Proposed               |
| ADR-005 | Agent                        | Proposed               |
| ADR-006 | 多人协作                     | Proposed               |
| ADR-007 | 身份与会话                   | Proposed               |
| ADR-008 | 文档生成                     | Proposed               |
| ADR-009 | 检索                         | Proposed               |
| ADR-010 | 本地运行时版本偏差           | Proposed               |
| ADR-011 | 构建链路与依赖注入元数据策略 | Proposed（**阻断性**） |

**待确认项（OQ，`docs/api/open-questions.md`）：全部待裁定。**

| 编号 | 问题                                            | 状态   |
| ---- | ----------------------------------------------- | ------ |
| OQ-1 | `sourceStatus` 缺"模板预置"来源                 | 待裁定 |
| OQ-2 | 跨包 `templateOrigin` 结构化引用语义未定义      | 待裁定 |
| OQ-3 | `templateCandidate` 与 `state` 一致性是否进契约 | 待裁定 |
| OQ-4 | 附录 A 缺 500/未预期错误的稳定错误码            | 待裁定 |
| OQ-5 | 租户上下文的最终来源（400 vs 401 语义）         | 待裁定 |

**已裁定（追溯，非开放问题）**：`meta.requestId` 约束对齐；`Project.code` pattern；共享枚举抽取（`common-defs.json`）；ChangeSet 视图关系；错误码漂移根治（命名对齐 `RESOURCE_NOT_FOUND`、租户改判 `VALIDATION_FAILED`、删除 `HTTP_${status}` 兜底、新增跨产物一致性测试）。

---

## 8. 已知问题与未验证项（如实）

| #   | 问题                                                              | 影响                                                                                            | 临时规避                                                           | 后续                                                                       |
| --- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| 1   | 本机 Node **v25.2.1**，基线 Node 22 LTS                           | 依赖解析/运行时可能与 CI 不一致                                                                 | `.nvmrc`=22、`engines>=22`、CI 固定 22                             | M0 退出前在 22 复跑                                                        |
| 2   | **Docker 不可用**                                                 | M1-02（Compose）/ M1-03（OIDC+BFF）/ M1-05（迁移+seed）**均未验证**，**不得据本机结果判定通过** | `infra/compose/**` 标注未验证、CI 不引用容器                       | 具备容器环境后补验                                                         |
| 3   | **无 Redis**                                                      | worker **运行**未验证（`new Worker` 需连 Redis）                                                | 连接逻辑置于 `QueueAdapter` 之后，单测用 `FakeQueueAdapter`        | M1-02 起真实验证                                                           |
| 4   | PG17 + pgvector 存在但**无凭据**                                  | M1-05 阻塞                                                                                      | 等产品负责人裁定"是否接入本地库"                                   | 裁定后实现 M1-05                                                           |
| 5   | **ADR-011 阻断性**：`apps/api` 无生产构建                         | M1 不得判定"可启动"；`emitDecoratorMetadata` 未启用，构造器注入在 esbuild/vitest 下会静默失败   | provider 无构造器依赖                                              | 等总指挥裁定（tsc 分治 / SWC）                                             |
| 6   | **门禁不含 build**（`pnpm run ci` 无 build 步骤；后端也无 build） | "能构建"在门禁中**无人验证**                                                                    | `spike/canvas` / `spike/agent` 的 build 已单独跑绿（非门禁一部分） | 挂 **M1-07**，与 **ADR-011** 一起关闭（`docs/engineering/README.md` §6.6） |
| 7   | 真实模型 provider **未验证**                                      | Agent 链路仅在 fake/确定性 provider 下验证                                                      | —                                                                  | 接入真实 provider 的里程碑                                                 |
| 8   | **真实 GPU 桌面浏览器未验证**                                     | 2D/3D 的真实帧率与长任务数据未在目标设备确认                                                    | 已有 `perf` / `perf:browser` 脚本与记录                            | 目标设备门禁                                                               |
| 9   | 复核窗口内**未运行** `perf` / `perf:browser` / `build`            | 这些命令会写 `perf/**`、`dist/**`；在冻结窗口运行会用错误基线**覆盖待复核产物**                 | 冻结期内刻意不运行                                                 | 复核/提交完成后可跑                                                        |
| 10  | `spike/*` 是否保留**待定**                                        | 影响仓库结构与门禁                                                                              | 暂列在 workspace + 根门禁内                                        | M0 关闭时由总指挥定                                                        |
| 11  | 500 使用**非契约码** `INTERNAL_ERROR`                             | `problem.json` 严格枚举（10）不含 500 码 → 契约违约                                             | `NON_CONTRACT_FALLBACK` 显式隔离；过滤器未映射即显式失败           | **OQ-4** 裁定（`docs/engineering/README.md` §6.5）                         |
| 12  | `infra/compose/**` **未验证**                                     | 本地/试点编排未跑通                                                                             | 仅作骨架                                                           | M1-02                                                                      |
| 13  | `.env.example` 的凭据为 **Compose 栈占位**                        | 本机无 `reqatlas` 角色                                                                          | 不用于本地连接                                                     | M1-02/05                                                                   |

---

## 9. 冻结与复核证据

**冻结清单**：`.codebuddy/audit/freeze-second-commit.txt`

- 内容：**24 个文件 + 逐文件 sha256**（每行 `sha256<2 空格>相对路径`）。
- 清单自身 sha256（`SHA256`）：`8cbc9b03a77aca43b74546fc17e0f9ca8da9b230185094696405f5ddeb65ec92`
  —— 本工作流用 `Get-FileHash -Algorithm SHA256` **独立重算并逐字符匹配**。
- 与实测 `git status --porcelain` 的冻结项**一一对应（24 条）**（另有 `?? .codebuddy/audit/freeze-second-commit.txt` 为清单本体）。

**`adr` 独立复核结论**（本工作流未复跑其脚本，均引自 `adr` 报告）：

- 冻结窗口 start→end：**22/22 逐文件一致**（`docs/review/**` 为 `adr` 自身输出，按约定排除）。
- **扫描**全仓带 `sourceBundleSha256` 的产物并逐一重算比对：**15/15 OK**。
- **破坏性证伪跑通**：阳性 `NO-THROW` 返回锚点；阴性 `THREW` 且报文为"源 bundle 哈希与冻结基线不一致"。
- `CHECK_FAILURES` 独立复现：**PASS=18 FAIL=0**。

**复核文档行数**（**截至 `2026-10-04T18:04:20+08:00`**；命令 `(Get-Content <file> -Encoding UTF8).Count`）：

| 文件                                       | 行数    |
| ------------------------------------------ | ------- |
| `docs/review/m0-readonly-review.md`        | **426** |
| `docs/review/readonly-review-checklist.md` | **165** |

> 说明：`m0-readonly-review.md` 在冻结基准取走**之后**被 `adr` 更新（**397 → 426** 行）。本表为**写下时刻**的实测值；若未来与冻结清单比对不一致，见 §9.1（属**约定排除**，非冻结破损）。

### 9.1 冻结清单的匹配口径（"清单失效行"说明）

- 冻结清单 **24 行**中，**23 行**与当前工作树**逐字节一致**；
- **唯一不匹配**的是 `docs/review/m0-readonly-review.md`；
  原因：该文件是**复核者自身输出**，`adr` 在冻结基准取走**之后**更新了它（**397 → 426** 行）；
- 按既定约定，**`docs/review/**` 不属于被复核对象**（`adr` 的冻结判定 **22/22** 正是排除了这两个文件）；
- 因此该行记录的是**冻结时刻值**，未来比对**必然不匹配**——**这是约定排除，不是冻结破损**；
- **应逐项匹配的是以下 22 项**（= 清单 24 项中除 `docs/review/**` 两文件外的全部）：

```text
docs/api/open-questions.md
spike/agent/README.md
spike/agent/out/change-draft.discount-approval.json
spike/agent/out/change-draft.role-conflict.json
spike/agent/out/change-set.discount-approval.json
spike/agent/src/__tests__/integrity.test.ts
spike/canvas/PERF.md
spike/canvas/README.md
spike/canvas/perf/adapter-results.json
spike/canvas/perf/s1-idle.json
spike/canvas/perf/s1-pan.json
spike/canvas/perf/s1-panzoom.json
spike/canvas/perf/s15-pan.json
spike/canvas/perf/s15-panzoom.json
spike/canvas/perf/s30-idle.json
spike/canvas/perf/s30-pan.json
spike/canvas/perf/s30-panzoom.json
spike/canvas/perf/s6-pan.json
spike/canvas/perf/s6-panzoom.json
spike/canvas/scripts/browser-perf.ts
spike/canvas/scripts/perf-adapter.ts
spike/canvas/scripts/source-bundle.ts
```

### 9.2 提交内容 与 复核范围 的映射

```text
冻结基准 24  +  docs/engineering/README.md  +  docs/engineering/submission-m0m1.md  +  清单本体 .codebuddy/audit/freeze-second-commit.txt
= 27 个文件（24 × `M` + 3 × `??`）
```

- **被复核的范围**：冻结基准中的 **22 项**（不含 `docs/review/**`，见 §9.1）。
- **不在 `adr` 复核范围内**：`docs/engineering/README.md`、`docs/engineering/submission-m0m1.md`（均于冻结**之后**撰写）、`.codebuddy/audit/freeze-second-commit.txt`（清单本体，非被复核代码）。
- **清单本体入库**：按仓库既有约定，`.codebuddy/agents/**` 与 `.codebuddy/audit/**` **属版本化的项目工具**（见 `.gitignore` 的 NOTE）；`dc06bb2` 已入库 4 个 `.codebuddy` 文件（`agents/dev-engineer.md`、`audit/docx-code-trace-audit.py`、`audit/m0-commit-msg.txt`、`audit/m0-trade-audit.ps1`）。故 `.codebuddy/audit/freeze-second-commit.txt` **应入库**。
- 读者须区分「**被复核的范围**」（22 项）与「**本次提交的内容**」（27 文件），避免误以为 `docs/engineering/**` 也经过 `adr` 复核（另见 §10）。

---

## 10. 复核边界（勿误读）

> `adr` 的复核覆盖**被复核对象**（canvas delta 等）；**不含本提交说明自身**——`docs/engineering/**` 是在冻结之后撰写的。即：本文件中的数字与结论，其"被复核"程度仅限于其中引自 `adr` 报告的部分；本文件本身的文字不构成复核证据。

---

## 11. 四类清单（`adr` 复核结论）

| 类别             | 数量  |
| ---------------- | ----- |
| **必须改**       | **0** |
| **建议改（低）** | **2** |
| **历史遗留**     | **0** |
| **待确认**       | **0** |

> 具体条目见 `docs/review/m0-readonly-review.md`；其中与本工作流相关的延后项见 §12。

---

## 12. 延后项（本批不含；第三次小提交）

**第三次小提交的范围：文档与产物引用真实性修正 + 一处测试失败信息改进。**

**具体清单待全仓引用完整性扫描结论出来后冻结，本文件不写死文件数。** `adr` 正在做该扫描（173 文件 / `§x.y` 173 处 / `ADR-nnn` 107 处 / `OQ-n` 32 处 / `M-nn` 207 处），**只出清单不修**，故第三次的范围可能继续变化。

**已确认的示例（仅示类别，非最终清单）：**

1. **测试失败信息改进（1 处）**：`apps/api/src/common/contract-consistency.spec.ts` 的断言失败信息应指向对齐位置——`docs/api/schemas/error-code.json` 的 `$comment`（机器可读 HTTP 映射）与 `packages/contracts/src/index.ts` 的 `ERROR_CODE_HTTP_STATUS`。当前 `$comment` 解析依赖约定格式，`contracts` 重排版会使其变红（该红合理），但失败信息未指路。
2. **文档 / 产物引用真实性修正（同一悬空引用 `（ADR-003 §3.4）`，已知 ≥3 处）**：
   - `spike/canvas/README.md:56`（文档）；
   - `spike/canvas/src/changeset.ts`；
   - `spike/canvas/src/App.tsx`——其中 `App.tsx:168` 位于 **ChangeSet `reason` 字段**上，**会随产物输出到页面与控制台**，已从"文档卫生"升级为**产物缺陷**。
   - 正确指向应为 ADR-003「决策」**第 4 条**（`ADR-003.md` L28："布局与语义分离……"）。
3. **`spike/canvas/scripts/browser-perf.ts:71`**：`sourceBundleFrozenAnchorSha256: FROZEN_SOURCE_BUNDLE_SHA256` 为**常量回显、无判别力**（与 `metadata.sourceBundleSha256` 必然相等），应加注说明或删除。

> 上列条目均为**非阻断**（不改变既有正确性）；最终归属与清单以 `docs/review/**` 的全仓扫描结论为准，由总指挥冻结后执行。
