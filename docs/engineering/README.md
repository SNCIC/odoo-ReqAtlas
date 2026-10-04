# ReqAtlas 工程说明（M0-02 / M1-01 / M1-04 / M1-07）

本文件描述单仓工作区的目录结构、依赖方向规则、全部命令清单，以及当前环境的**已知偏差**。

---

## 1. 目录结构

```text
odoo-ReqAtlas/
├─ apps/
│  ├─ web/                    # @reqatlas/web      React 19 + Vite SPA（长驻编辑器）
│  ├─ api/                    # @reqatlas/api      NestJS + Fastify 模块化单体
│  └─ worker/                 # @reqatlas/worker   BullMQ worker 运行时
├─ packages/
│  ├─ contracts/              # @reqatlas/contracts       前后端共享 API 契约
│  ├─ domain/                 # @reqatlas/domain          领域层（零框架依赖）
│  ├─ db/                     # @reqatlas/db              Drizzle schema / repositories
│  ├─ ui/                     # @reqatlas/ui              共享企业组件
│  ├─ canvas/                 # @reqatlas/canvas           React Flow 适配层
│  ├─ presentation-3d/        # @reqatlas/presentation-3d  SceneProjection 渲染器
│  ├─ document-ir/            # @reqatlas/document-ir     格式无关文档内容模型
│  ├─ observability/          # @reqatlas/observability   trace / log / metric 辅助
│  └─ testkit/                # @reqatlas/testkit         factories / fixtures / fake providers
├─ spike/                     # 技术验证（M0 各 Spike，独立于产品代码）
├─ docs/
│  ├─ 需求调研工作台-具体实施方案.md
│  ├─ engineering/            # 本文件
│  ├─ adr/                    # ADR-001 ~ ADR-009
│  └─ knowledge/              # 领域知识
├─ infra/
│  └─ compose/                # 本地 / 私有试点编排（未验证，见其 README）
├─ .github/workflows/ci.yml   # CI 门禁
├─ tsconfig.base.json         # 全仓 strict TS 基线
├─ eslint.config.js           # ESLint 9 flat config
├─ dependency-cruiser.cjs     # 依赖边界规则
├─ pnpm-workspace.yaml        # apps/*, packages/*, spike/*
└─ .env.example               # 环境变量样例（无真实密钥）
```

> `packages/testkit/src/**` 由 sample 工作流负责创建；本工作流只提供其 `package.json` 与 `tsconfig.json`。

---

## 2. 依赖方向规则（由 `pnpm arch` 强制，不靠自觉）

规则定义在 [`dependency-cruiser.cjs`](../../dependency-cruiser.cjs)，CI 门禁 `pnpm arch` 为 **error 级**，违反即以非 0 退出。

| 规则名                 | 含义                                                                 |
| ---------------------- | -------------------------------------------------------------------- |
| `no-circular`          | 全仓禁止循环依赖                                                     |
| `domain-no-frameworks` | `packages/domain` 不得依赖 `@nestjs/*`、`react`、`drizzle-orm`、`pg` |
| `web-no-server-impl`   | `apps/web` 不得依赖 `packages/db`、`@nestjs/*`                       |
| `no-orphans-unused`    | 报告无引用也无依赖的孤立模块（warn 级）                              |

**验证规则真的会拦人**（本地实操，非推测）：

```powershell
# 在 packages/domain/src/index.ts 临时加入 import ... from 'pg'
pnpm arch   # → 非 0 退出，报 domain-no-frameworks
# 撤销后
pnpm arch   # → 0 退出，no violations
```

---

## 3. 全部命令清单

在仓库根目录执行（Windows PowerShell）。

| 命令                | 作用                                                                        |
| ------------------- | --------------------------------------------------------------------------- |
| `pnpm install`      | 安装全部工作区依赖（`pnpm-lock.yaml` 冻结版本）                             |
| `pnpm dev`          | 并行启动 web / api / worker 开发进程                                        |
| `pnpm build`        | 递归构建（web 走 `vite build`）                                             |
| `pnpm typecheck`    | 递归 `tsc --noEmit`（strict）                                               |
| `pnpm lint`         | ESLint 9 flat config 全仓扫描                                               |
| `pnpm format`       | Prettier 写入（仅限本工作区所属路径）                                       |
| `pnpm format:check` | Prettier 校验（CI 用）                                                      |
| `pnpm test`         | 递归运行 vitest 单测                                                        |
| `pnpm arch`         | dependency-cruiser 依赖边界检查                                             |
| `pnpm run ci`       | 本地串跑：format:check → lint → typecheck → test → arch（**必须带 `run`**） |

单包命令示例：

```powershell
pnpm --filter @reqatlas/api test
pnpm --filter @reqatlas/web build
pnpm --filter @reqatlas/worker typecheck
```

---

## 4. API 契约（M1-04）

- `GET /api/v1/health` → `200 { data: { status, service, version, uptimeSeconds }, meta: { requestId } }`
- 全局请求 ID：生成态固定 `req_<32 位小写 hex>`（匹配契约 `^req_[A-Za-z0-9_-]+$`）；入站 `X-Request-Id` **仅在合规时复用**（`^req_[A-Za-z0-9_-]{1,64}$`），否则替换为新 `req_*`，并把被拒原值记入结构化日志字段 `inboundRequestId`（**绝不**进入响应）。响应头 `X-Request-Id` 与 `body.requestId` / `meta.requestId` **始终同值**。
- 统一错误：`application/problem+json`，含稳定 `code`（如 `TENANT_CONTEXT_REQUIRED`）。
- 结构化日志：每行一个 JSON 对象，含 `requestId / method / url / statusCode / durationMs`；
  `@reqatlas/observability` 的 `redact()` 会对 `password / token / authorization / cookie / secret / apikey / credential / session` 等键脱敏，**日志不含密钥/token**。
- 租户上下文（M1-04 占位）：从请求头 `x-tenant-id` 提取；缺失时守卫直接拒绝
  400 `TENANT_CONTEXT_REQUIRED`。本阶段**不做真实鉴权**，仅留好接口。
- 测试：`apps/api` 用 `@nestjs/testing` + Fastify `app.inject()`，**不绑定端口、不启动长驻进程**。

Worker：BullMQ 连接逻辑封装在可注入的 `QueueAdapter` 之后；`WorkerRuntime` 与 Redis 解耦，
单测使用 `FakeQueueAdapter`，**无需连接 Redis**。

---

## 5. CI（M1-07）

[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) 在 `ubuntu-latest` + Node 22 上：

1. `pnpm install --frozen-lockfile`
2. `pnpm format:check`
3. `pnpm lint`
4. `pnpm typecheck`
5. `pnpm test`
6. `pnpm arch`
7. 独立 `secret-scan` 占位 job（基础私钥/AWS/GitHub token 模式扫描）

`pnpm run ci` 在本地串跑同样的检查（不含 secret scan 占位 job）。
注意：脚本名虽为 `ci`，但 pnpm 保留了同名子命令（直接执行会报
`ERR_PNPM_CI_NOT_IMPLEMENTED`），**必须用 `pnpm run ci` 调用**。

---

## 6. 已知偏差（Known deviations）

> 本节是**置信度限制**的集中记录。凡标注"未验证"的项，均未在本机实际跑通。

| #   | 偏差                                                                                    | 影响                                                                                                                                                    | 状态 / 置信度                                                                  |
| --- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | **本机 Node v25.2.1，方案基线为 Node 22 LTS**（`.nvmrc` 写 `22`，`engines.node >= 22`） | 依赖解析与运行时行为可能与 CI（Node 22）存在差异；Node 25 非 LTS，部分原生依赖的预编译产物矩阵可能不覆盖                                                | 实际开发用 25.2.1（实测值）；CI 固定 22。**跨版本一致性未验证**                |
| 2   | **Docker 不可用**                                                                       | M1-02 / M1-03 / M1-05 **均无法在本机验证**，相关里程碑**不得凭本机结果判定通过**（详见 §6.2）                                                           | `infra/compose/**` 标注**未验证**；CI 亦不引用容器                             |
| 3   | `emitDecoratorMetadata` 未启用                                                          | NestJS 依赖注入不使用构造器参数元数据（esbuild/vitest 不支持 `emitDecoratorMetadata`）。当前所有 provider 无构造器依赖故可用；**上限与候选处置见 §6.1** | 当前测试全绿；处置**待裁定（ADR-011 起草中）**，本工作流不实现                 |
| 4   | `pnpm-lock.yaml` 在本机生成                                                             | 若 CI 与本机解析版本不一致会触发 `--frozen-lockfile` 失败                                                                                               | install 后生成；需保证锁文件被提交                                             |
| 5   | 本机下游 `.docx` 无 pandoc                                                              | 上游产品/开发方案通过 `python zipfile` 读 `word/document.xml`                                                                                           | 不影响本工作流交付                                                             |
| 6   | **LibreOffice 本机实测可用**（版本 26.2.3.2）                                           | ADR-008 的 PDF 路径**本机可验证**；仍需 M8 的「隔离 Worker + 资源限制」治理，与「能否转换」是两回事（详见 §6.3）                                        | 版本号 26.2.3.2（实测）；DOCX→PDF 由 doc-spike 实测成功                        |
| 7   | **本机 PostgreSQL 17 + pgvector 存在，但无可用凭据**                                    | M1-05 仍未验证；是否接入本地库待产品负责人裁定（详见 §6.4）                                                                                             | pgvector `vector.control` 存在、5432 监听；`pg_hba` 全 `scram-sha-256`、无凭据 |
| 8   | **500 响应使用非契约码 `INTERNAL_ERROR`**                                               | `docs/api/schemas/error-code.json` 的严格枚举（10 个）**不含 500 码**，而 problem 过滤器对 500 返回 `INTERNAL_ERROR`，构成**当前已知的契约违约**        | 待 **OQ-4** 裁定；本工作流不自行增补契约（见 §6.5）                            |

### 6.1 `emitDecoratorMetadata` 与 NestJS 构造器注入（偏差 #3 详解）

当前 `tsconfig` **未启用 `emitDecoratorMetadata`**——因为 vitest/esbuild 不支持该编译选项。

- 当前 `apps/api` / `apps/worker` 的所有 provider **均无构造器依赖**（控制器用参数装饰器 `@Req()`；日志、租户守卫等为无状态类或纯函数），DI 不依赖参数类型元数据，因此**测试通过**。
- **这是有上限的**：一旦引入带构造器注入的 service（M2 必然出现），在 esbuild/vitest 下缺失元数据会使依赖被解析为 `undefined`，且**不会抛错**——即**静默失败**。

候选处置（**待裁定**，本工作流**不实现**；已由 `adr` 起草 **ADR-011：构建链路与依赖注入元数据策略**，并标注为**阻断性**——**`apps/api` 无可运行生产构建前，M1 不得判定"可启动"**）：

- **(a) 构建/测试分治**：`apps/api` 的生产构建走 `tsc`（开启 `emitDecoratorMetadata`）；测试侧对需要注入的 provider 一律显式 `@Inject(TOKEN)`，不依赖参数元数据。
- **(b) 统一换 SWC**：测试与构建统一改为 SWC（如 `unplugin-swc` + `@swc/core`），完整支持 legacy 装饰器与 `emitDecoratorMetadata`。

### 6.2 未验证范围与后果（偏差 #2 详解）

本机**没有 Docker、未运行任何容器**，因此以下里程碑**未在本机验证**，其验收结论**不得凭本机结果判定通过**：

- **M1-02**：Docker Compose（PostgreSQL 16 + pgvector / Redis 7 / MinIO / Keycloak / ClamAV）"干净环境一条命令可复现"。
- **M1-03**：OIDC / BFF 登录、退出、会话轮换、CSRF、防开放重定向、禁用用户。
- **M1-05**：Drizzle Schema、migration runner、空库/升级测试、demo seed。

`infra/compose/**` 仅为后续骨架，标注**未经验证**，CI 亦不引用容器。

### 6.3 LibreOffice / ADR-008 的 PDF 路径（偏差 #6）

- 本机 Windows 上**实测存在 LibreOffice 26.2.3.2**（可执行 `soffice.com`，位于 LibreOffice 默认安装目录）。
- `doc-spike` 已实测：用它把 DOCX 成功转为 PDF（5 页），**SimSun / SimHei 中文字体已嵌入**。
- 结论：**ADR-008 的 PDF 路径在本机可验证**（此前「本机很可能没有 LibreOffice」的预期已更正，以实测为准）。
- 但**仍需「隔离 Worker + 资源限制」**：这属于 M8 的治理要求（处理不可信输入、超时、内存/CPU 限额），与「能不能转换」是两个独立问题，不因本机可转而免除。

### 6.4 本机 PostgreSQL 17 + pgvector（偏差 #7）

- 本机实测：**PostgreSQL 17 已安装**，其 `share/extension` 下存在 pgvector 的 `vector.control`；**5432 端口在监听**。
- 但 `pg_hba.conf` 全部为 `scram-sha-256`，**目前没有可用凭据**（无 `pgpass`、无相关环境变量；`.env.example` 中的 `reqatlas/reqatlas_dev_only` 是 Compose 栈的占位，本机并无该角色）。
- 因此 **M1-05（Drizzle Schema / migration runner / 空库迁移 / seed）仍未验证**；「是否接入本地库」已作为决策项上报产品负责人，**在其裁定前不实现 M1-05**。

### 6.5 500 与非契约码 `INTERNAL_ERROR`（偏差 #8）

- 权威 `docs/api/schemas/error-code.json` 的稳定错误码严格枚举共 **10 个**，其中**没有 500 专用码**。
- 但 `apps/api` 的 problem 过滤器对未捕获异常（500）返回 **`INTERNAL_ERROR`**（`packages/contracts` 的 `NON_CONTRACT_FALLBACK.INTERNAL_ERROR`，**不属于** `ERROR_CODES`；命名刻意区分，使违约一眼可辨）。
- 因此这是**当前已知的契约违约**：`code` 取值落在权威 enum 之外。过滤器已移除 `HTTP_${status}` 之类的任意造码，改为**显式 `status → code` 映射表 + 未映射即显式失败**（见 `apps/api/src/common/status-code-map.ts`）。
- 处置：作为 **OQ-4** 上报总指挥裁定（新增第 11 个码 / 放宽 500 的 `required` / 其他）。**裁定前保持行为不变，不自行增补契约。**

---

## 7. 无法验证 / 待补

- `infra/compose/**` 全部内容：**未验证**。
- `.github/workflows/ci.yml`：**未在本机实际触发 Actions**（无非本地 runner），仅通过本地等价命令 `pnpm run ci` 间接验证步骤有效性。
- pnpm 保留同名子命令 `ci`：直接执行会报 `ERR_PNPM_CI_NOT_IMPLEMENTED`（实测），脚本须用 `pnpm run ci` 调用。
- M1-02 / M1-03 / M1-05 相关能力：**未实现或未验证**（M1-05 另见 §6.4：本机 PG17 + pgvector 存在但无可用凭据，等裁定）。
- ADR-008 的 PDF 路径：本机可验证（LibreOffice **26.2.3.2**，见 §6.3）；但「隔离 Worker + 资源限制」属 M8，未实现。
- ADR-011（构建链路与依赖注入元数据策略）：**阻断性**，未实现，等总指挥裁定（见 §6.1）。
- 500 的稳定码（`INTERNAL_ERROR`）：**已知契约违约**，待 **OQ-4** 裁定（见 §6.5）。
