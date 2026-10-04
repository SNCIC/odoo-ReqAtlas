# 只读复核清单

| 项目 | 内容 |
| --- | --- |
| 用途 | 总指挥对每个里程碑执行只读复核 |
| 依据 | 实施方案 §9.2、§10；开发方案 §8.7、附录 E |
| 原则 | 只读，不修改代码；结论只归入四类清单；阻断项关闭才可进入下一里程碑 |

> 使用方式：逐项核对下表，把结论写入验收证据模板第 12 节。命令中的路径以当前仓库为准；
> 若仓库结构调整，以实际存在的脚本（`package.json` 的 `scripts`）为准，并在报告中注明。

---

## 0. 本项目红线（最先检查）

以下 6 条红线任一不通过即为"必须改"，阻断里程碑。

| 编号 | 红线 | 检查命令 / 文件定位 | 典型不通过症状 |
| --- | --- | --- | --- |
| R-1 | 无绕过统一 Command/ChangeSet 直接写业务表的路径 | `rg -n "model_object\|model_relation" packages apps --glob '!**/migrations/**'`；重点看 `packages/db` 的写方法调用方 | 画布 / Agent / 导入 / 模板模块直接 `db.insert(model_object)` |
| R-2 | 2D/3D/文档没有各自另存一套业务事实 | `rg -n "createTable\|CREATE TABLE" packages apps`；`pnpm arch` | `packages/canvas` / `presentation-3d` / `document-ir` 中出现业务表或持久化业务对象的代码 |
| R-3 | Agent 无直接写数据库或写基线能力 | `rg -n "insert\|update\|baseline" apps/worker/src apps/api/src --glob '*agent*'`；检查 `change_draft` 是唯一 Agent 产出 | Agent 直接调用 repository 写入，或能创建 `baseline` |
| R-4 | 无来源（`sourceRefs` 为空）的事实进入基线 | `rg -n "sourceRefs\|source_refs\|confidenceState\|confidence_state" packages apps`；检查基线应用校验 | 事实型操作缺少 `sourceRefs` 仍能应用；假设（assumption）进入基线 |
| R-5 | 布局坐标未被当作业务语义持久化 | `rg -n "view_layout\|ViewLayout\|position\|x:\|y:" packages/domain packages/canvas packages/db` | React Flow 节点/边 JSON 被直接持久化为事实；拖动产生 revision |
| R-6 | 测试无被跳过 / 被伪造 / 只测实现细节 | `rg -n "\.skip\|\.todo\|it\.only\|describe\.only\|xit\(\|xdescribe\(" apps packages`；人工审阅断言语义 | 存在 `.skip`/`.only`；断言只校验 mock 调用次数而非业务行为 |

---

## 1. 维度一：范围

| 检查点 | 判定依据 | 检查命令 / 文件定位 | 典型不通过症状 |
| --- | --- | --- | --- |
| 提交仅包含当前里程碑内容 | 对照里程碑任务清单，逐条映射 | 验收证据模板第 2 节；`git diff <上里程碑tag>..<HEAD> --stat` | 混入后续里程碑功能或无关重构 |
| 无未批准功能 | 新增范围已有变更单 | 变更单编号；ADR 索引 | 出现未走变更单的对象/页面/接口 |
| 无未批准依赖 | 新增依赖有变更单与许可证审查 | `git diff <上里程碑tag>..<HEAD> -- pnpm-lock.yaml package.json`；SBOM | 偷偷引入新库，未做许可证审查 |
| 不做范围外的事 | 对照实施方案 §1.2"首版不做" | 功能清单 | 出现 3D 精确编辑、通用富文本编辑器等被排除功能 |

---

## 2. 维度二：架构边界

| 检查点 | 判定依据 | 检查命令 / 文件定位 | 典型不通过症状 |
| --- | --- | --- | --- |
| 模块不绕过统一 Command/ChangeSet（见 R-1） | 语义写入单一入口（P2） | `pnpm arch`；`rg -n "insert\(\|\.insert\b" packages apps` | 任何模块直接写事实表 |
| `domain` 保持零框架依赖 | 不依赖 NestJS / React / Drizzle / pg | `pnpm arch`（规则 `domain-no-frameworks`）；`cat dependency-cruiser.cjs` | `packages/domain` 引入框架导入 |
| `web` 不导入服务端实现 | `web` 只用生成的 API client / ui / canvas / 3d | `pnpm arch`（规则 `web-no-server-impl`） | 前端直接导入 `packages/db` 或 `@nestjs/*` |
| 无循环依赖 | 全仓无环 | `pnpm arch`（规则 `no-circular`） | dependency-cruiser 报环 |
| 模块间不直接访问对方数据表 | 跨模块经 application service 或 query port | 审阅 `packages/db` 的调用方；跨模块 import | A 模块直接查询 B 模块的表 |
| Agent/文档/3D 不另存事实（见 R-2） | 只读 Snapshot 或 API | `pnpm arch`；`rg -n "createTable" packages` | 各子系统自建业务表 |
| API/Worker 依赖方向正确 | `api`/`worker` 依赖 `domain` 与 `db` | `pnpm arch`；读取各 `package.json` 依赖 | `domain` 反向依赖 `db` 或 `api` |
| 产物不对上游结构做硬编码假设 | 类型与校验**唯一**来自权威源（如 `@reqatlas/testkit` 导出的 zod Schema 与类型）；消费侧不得复制一份结构定义 | `rg -n "interface\s+\w*(Bundle\|Model\|Evidence)\b\|type\s+ObjectKind\b\|ObjectKind\s*=" spike apps packages`；对照权威源导出清单 `rg -n "^export" packages/testkit/src`；检索消费侧是否转发 `rg -n "@reqatlas/testkit" spike apps packages` | 上游 schema 增删字段后消费方**不报编译错误**却运行期跑偏。已知失效模式：消费侧自建 `interface ModelBundle` 或 `ObjectKind` 字面量联合，未转发权威源已导出的 `Evidence` / `EvidenceLink`，导致 `TS2305` 编译失败而未被单元测试捕获 |

---

## 3. 维度三：数据与迁移

| 检查点 | 判定依据 | 检查命令 / 文件定位 | 典型不通过症状 |
| --- | --- | --- | --- |
| migration 可复现 | 空库迁移成功；上一版本可升级 | 干净环境执行迁移命令；`packages/db` 下 migration 文件 | 只有"最终态 Schema"，无增量 migration |
| 每个 Schema 变化附迁移与回滚说明 | 与 §4.5 一致 | `packages/db` 迁移目录 + 回滚说明文件 | 改了表结构但无 migration |
| `tenant_id` 约束 | 所有业务表 `tenant_id NOT NULL` | `rg -n "tenant_id\|tenantId" packages/db` | 业务表缺租户列或可为空 |
| 同租户 / 跨项目约束 | 复合外键或策略校验；跨项目引用被阻断 | `rg -n "CROSS_PROJECT\|crossProject\|tenantId" packages/db packages/domain` | 允许跨项目/跨租户引用 |
| 快照哈希正确 | 同一 revision 重复生成哈希一致；创建后不可变 | 快照相关测试；`rg -n "sha256\|snapshot" packages` | 同 revision 两次哈希不同 |
| 确认失效机制正确 | 语义变化后旧确认失效 | `rg -n "object_rev\|objectRev\|confirmation" packages/domain` | 对象改了，确认仍显示有效 |
| 删除策略正确 | 已入基线对象只能废止并记录替代 | `rg -n "deprecated\|replaced_by\|replacedBy" packages` | 基线对象被硬删除 |
| 无秘密 / 无本地绝对路径入库 | 仓库与 seed 不含敏感数据 | `rg -n "C:\\\\\|/Users/\|/home/" apps packages docs/engineering`；secret scan | seed 或配置含本机路径、密钥 |

---

## 4. 维度四：接口契约

| 检查点 | 判定依据 | 检查命令 / 文件定位 | 典型不通过症状 |
| --- | --- | --- | --- |
| OpenAPI 与实现一致 | 契约先行，客户端由契约生成 | `pnpm --filter @reqatlas/contracts ...`（按实际脚本）；生成后 `git diff` 应为空 | 手写请求类型；生成客户端有 diff |
| 幂等键一致 | POST / 命令必须带 `Idempotency-Key` | `rg -n "Idempotency-Key\|idempotency" packages/contracts apps/api` | 命令接口缺少幂等键 |
| `If-Match` 一致 | 语义写入必须带 `If-Match: "rev-{n}"` | `rg -n "If-Match\|if-match\|etag" packages/contracts apps/api` | 语义写无版本校验 |
| 错误模型一致 | `application/problem+json` + 稳定 error code | `rg -n "problem\+json\|errorCode\|error_code" packages/contracts apps/api` | 各接口错误体格式不一 |
| 响应包装一致 | `{ data, meta: { requestId, projectRevision } }` | `rg -n "projectRevision\|requestId" packages/contracts` | 返回结构不统一 |
| 分页为 cursor | 不使用 offset | `rg -n "cursor\|offset" packages/contracts apps/api` | 出现 offset 分页 |
| 路由与 §5.2 总表一致 | 方法/路径/规则匹配 | 对照实施方案 §5.2 逐条核对 | 路径或语义偏离契约 |

---

## 5. 维度五：安全

| 检查点 | 判定依据 | 检查命令 / 文件定位 | 典型不通过症状 |
| --- | --- | --- | --- |
| 会话由 BFF 管理，token 不入 localStorage（ADR-007） | 浏览器只持 HttpOnly Cookie | `rg -n "localStorage\|sessionStorage" apps/web` | 前端存储 access token |
| OIDC 校验 issuer/audience/nonce/state | 伪造与错受众被拒 | 安全测试用例；`rg -n "issuer\|audience\|nonce\|state" apps/api` | 未校验受众或状态 |
| CSRF 防护 | SameSite + CSRF token | `rg -n "csrf\|SameSite\|sameSite" apps/api apps/web` | 无 CSRF 防护 |
| 授权显式 | 每个命令显式 permission；越权矩阵测试 | `rg -n "permission\|authorize\|can\(" apps/api packages/domain` | 命令无权限校验 |
| 租户隔离 | repository 默认带 tenant context | `rg -n "tenantContext\|tenant_context" packages/db` | 调用方需自拼 tenant 条件 |
| 上传安全 | 类型白名单 + 服务端 MIME 复核 + 大小上限 + 预签名短时有效 | `rg -n "mime\|whitelist\|presign" apps/api apps/worker` | 仅前端校验类型 |
| 解析隔离 | 受限容器，限制 CPU/内存/超时 | `rg -n "timeout\|maxMemory\|cpu" apps/worker` | 直接在主进程解析不可信文件 |
| 提示注入防护 | 提取文本标记 `untrusted_content`，工具权限服务器固定 | `rg -n "untrusted_content\|untrustedContent" apps/worker packages/domain` | 外部文本直接进入指令 |
| 导出脱敏 | 分类策略 + 水印/脱敏；签名时再次判权 | `rg -n "redact\|desensit\|watermark\|export" apps/api apps/worker` | 导出不判权 |
| 审计 | 成功与拒绝均记录；不写敏感全文 | `rg -n "audit_event\|auditEvent" packages apps` | 拒绝未记录 |
| AI 数据策略 | 项目级可关闭；只传必要片段；记录 provider/model/版本 | `rg -n "provider\|prompt_version\|promptVersion" apps/worker` | 无法关闭外发 |

---

## 6. 维度六：体验

| 检查点 | 判定依据 | 检查命令 / 文件定位 | 典型不通过症状 |
| --- | --- | --- | --- |
| 新手主路径无需外部说明 | NU-01~NU-04 可用性目标 | 手工任务记录；新手向导实现 | 首次使用者卡在第一步 |
| 错误有下一步 | 错误态给出可执行动作 | 前端错误边界；`rg -n "errorBoundary\|ErrorBoundary" apps/web` | 只显示"出错了" |
| 冲突可解释 | revision 冲突对话框说明基准与建议 | `rg -n "REVISION_CONFLICT\|revisionConflict" apps/web` | 静默覆盖或纯技术报错 |
| 状态不只靠颜色 | 非颜色状态标识 | 可访问性清单；关键页面 | 仅用颜色区分状态 |
| 键盘可达、焦点可见 | 可访问性清单 | RTL / 手工清单 | 键盘不可操作画布 |
| 3D 有文本等价内容 | WebGL 不可用可降级 | 降级演练记录（M7-05） | 降级后信息丢失 |
| 客户视图与专业视图同源 | 同一对象 ID | 对象 ID 一致性测试（M3-07） | 两视图各自生成 ID |

---

## 7. 维度七：质量

| 检查点 | 判定依据 | 检查命令 / 文件定位 | 典型不通过症状 |
| --- | --- | --- | --- |
| 测试验证业务行为（见 R-6） | 断言业务结果，非实现细节 | 人工审阅测试文件断言 | 只断言 mock 被调用 |
| 无被跳过的用例 | 无 `.skip` / `.only` / `todo` | `rg -n "\.skip\|\.todo\|\.only\|xit\(\|xdescribe\(" apps packages` | 存在跳过的关键用例 |
| 无伪造通过 | 结果来自真实执行 | `pnpm ci` 输出；CI 运行链接 | 声称通过但无输出/链接 |
| 规则单测全覆盖 | 12 条领域规则各有稳定 code 的测试 | `rg -n "test\(\|it\(" packages/domain` | 规则无对应测试 |
| 并发/幂等/回滚测试存在 | 覆盖 §6.3 验收标准 | 集成测试文件；`rg -n "REVISION_CONFLICT\|IDEMPOTENCY_MISMATCH" apps packages` | 无并发冲突测试 |
| 金样例回归存在 | Agent / 文档金样例 | `rg -n "agent-golden\|document-golden\|security-fixture" apps packages` | 无金样例回归 |
| 端到端路径存在 | 新手核心路径 + fake provider | Playwright 用例 | 只有单元测试，无端到端 |
| 架构测试有效 | 违反红线会失败 | 临时注入违规导入，`pnpm arch` 必须失败 | 架构测试形同虚设 |
| 无依赖"总数/魔数"的脆弱断言 | 断言由被测数据结构**派生**（计数由过滤推导），而非写死常量或基线哈希 | `rg -n "\.length\)\.toBe\([0-9]{2,}\|toHaveLength\([0-9]{2,}" apps packages spike`；`rg -n "toBe\([\"'][0-9a-f]{32,}\|baselineHash\|frozenHash" apps packages spike` | 上游数据合法演进后测试变红，或更坏地恒真（永远锁定旧值）。已知失效模式：把对象总数写死（如 `expect(x.length).toBe(33)`）、或写死基线哈希，而不是按 schema / 过滤派生，导致契约冻结后断言脆弱 |
| 无"为变绿而弱化门禁"的配置 | 不使用 `--passWithNoTests`、`\|\| true`、`exit 0` 之类静默兜底；被跳过的用例须有对应跟踪项 | `rg -n "passWithNoTests\|\-\-bail\|exit 0\|\-\-if-present" package.json apps packages spike .github`；`rg -n "\.skip\|\.todo\|xdescribe\|xit\(\|it\.only\|describe\.only" apps packages spike` | 测试被删空或被跳过时 CI 仍然绿。已知失效模式：包级测试脚本曾带 `--passWithNoTests`，使"零测试"也能通过；同一标准适用于所有包与 spike 包 |
| 检索结论须在当前工作树复现，且区分注释与活代码 | (1) 任何"某处/某物存在或不存在"的结论，必须在**作出结论的时点**重新检索，不得引用此前某一轮的观测或他人的结论；(2) 命中字符串必须区分**注释与可执行代码**——注释、文档、示例中的字符串**不构成实现存在**；(3) 命中为零**不等于**未实现：须换一种检索口径（缩进、命名、导出名、引用方 `import`、生成物）复检后再下结论；(4) **命名/归属类检索**（如"是否指名某人"）必须区分**人名**与**路径、包名、目录名、文件名占位符**——子串命中须逐条查看上下文后再判定，不得仅凭命中计数下结论 | 排除注释后检索活代码：`rg -n --glob '!*.md' "<模式>" apps packages spike`，再对命中逐条**人工确认**是否为注释（`rg -n '^\s*(//\|\*\|#)' -A0` 仅辅助，最终须人眼确认）；对"不存在"的结论要求**换口径二次检索**：同时检索字符串、导出名、引用方 `import`；产物类结论须**重算而非引用**（`Get-FileHash`、`git status --porcelain`、重新执行一次命令） | 复核报告基于上一轮或他人的观测；把注释/文档里的字符串当成实现；用"grep 未命中"直接下"未实现"结论。已知失效模式：转达已失效的旧快照、把注释命中当作活代码兜底、因缩进/命名假设错误而误判"未落地" |
| 写入文档/注释的约束性前提须在落笔时点复验 | 文档或注释中以"因为/因此/必须"表述的**因果前提**，必须在**写下的时点**用当前工作树复验一次，并区分"事实仍成立"与"仅当时成立"：不得保留已失效的前提，也不得删除仍成立的前提 | 对每个因果前提在当下重跑其依据：`rg -n "<被引用的报错/符号/常量>" <相关目录>`；对照权威源确认前提是否仍成立（如 `packages/testkit/src/index.ts` 的 `export *` 链是否仍把 Node-only 模块带进入口）；产物类前提须**重算**（`Get-FileHash`）而非引用旧值 | 文档里把**已被修复**的旧报错当作"必须这样做"的理由继续保留；或反之把**依然成立**的约束说明误判为过期而删除。已知失效模式：注释以旧的 cwd 行为断言"某加载器不可用"（前提已消失却仍被引用），而"包入口会把 Node-only 模块带进浏览器图"这类前提仍在的说明被误判过期 |
| 阴性结果必须配阳性对照 | 任何"某物不存在"的结论，必须同时证明所用检索方式在**同一输入**上能检出确实存在的东西；只有阴性结果、没有阳性对照的检查，**不构成证据** | 选**字符串字面量 / 模块说明符**做探针（不要选会被压缩改名的标识符）：`$raw=[System.IO.File]::ReadAllText(<file>); [regex]::Matches($raw,[regex]::Escape('<字面量>')).Count`；先跑一组**阳性对照**（确信存在的枚举字面量，如 `pending_confirmation`），再跑**阴性目标**（如 `node:fs`、`REQATLAS_FIXTURE_ROOT`）；**禁用** `@((Select-String ...).Matches).Count` 口径（零命中时 `.Matches` 为 `$null`，`@($null).Count == 1`，会把 0 报成 1） | 阳性对照与阴性目标**同为 0**，探针实际无效却被当作"不存在"的证据；把 0 命中误报为 1；用压缩会改名的标识符（函数/常量名）做探针导致假阴性；用 `Select-String` 读压缩后的超长单行文件而全 0 |

---

## 8. 维度八：交付完整度

| 检查点 | 判定依据 | 检查命令 / 文件定位 | 典型不通过症状 |
| --- | --- | --- | --- |
| README 与一条启动命令 | 干净环境可启动 | `apps/*/README.md`、根 `README.md` | 需口头传授启动步骤 |
| seed 可重建 | 命名与重建方法明确 | 证据模板第 8 节；seed 脚本 | seed 无法在干净环境重建 |
| 产物源自冻结基线（M0 一次性锚点） | 产物元数据记录的 snapshot sha256 等于证据模板 §8.1 登记的冻结值；复核人**须自行重算**而非信任声明 | `(Get-FileHash -Algorithm SHA256 -Path packages/testkit/fixtures/demo-trade/model-bundle.json).Hash.ToLower()`；并对照产物元数据 `rg -n "sha256\|snapshotHash\|bundleHash" spike apps packages` | 产物基于被改动过的 bundle 生成，图文不一致却无法察觉。注意：该哈希为 **M0 一次性锚点**，M0 关闭后随 bundle 演进作废并须重新登记，**不得**写死为永久常量 |
| ADR 齐全 | 新增技术决策有 ADR | `docs/adr/` 索引 | 决策无 ADR |
| 已知问题写明影响与归属 | 不隐瞒问题 | 证据模板第 9 节 | 已知问题未登记 |
| 验收证据齐全 | 第 1~11 节无空项 | 验收证据模板 | 关键字段留空 |
| 未验证项已显式列出 | 第 11 节不为空 | 验收证据模板第 11 节 | 未验证项留空或写"待补充" |
| 无未提交文件 | 工作树干净 | `git status --porcelain` | 提交包与代码不一致 |
| 契约与示例齐备 | OpenAPI + 示例请求/响应 | `packages/contracts` | 只有实现，无契约 |

---

## 9. 常用命令汇总

| 目的 | 命令 |
| --- | --- |
| 依赖安装（干净环境） | `pnpm install --frozen-lockfile` |
| 架构边界检查 | `pnpm arch` |
| 全量质量门禁 | `pnpm ci` |
| 格式化 / 静态检查 / 类型 | `pnpm format:check` / `pnpm lint` / `pnpm typecheck` |
| 单元与集成测试 | `pnpm test` |
| 工作树是否干净 | `git status --porcelain` |
| 与上里程碑差异 | `git diff <上里程碑tag>..<HEAD> --stat` |
| 红线检索 | `rg -n "<关键字>" apps packages`（见第 0 节） |

> 上述脚本名以根 `package.json` 的 `scripts` 为准；如仓库调整，复核报告中须注明实际命令。
