# 契约开放问题登记（Open Questions）

本文件登记**必须由总指挥/产品负责人裁定后才能定契约**的缺口。这些是契约/Schema 层的开放问题，
不是实现问题。在裁定前，契约按**现状**表达，不擅自新增枚举值或规则码。

维护规则：

- 未裁定前，`docs/api/**` 按现状引用（不新增枚举、不私自扩展结构）。
- 裁定后，按 `README.md` §5/§6 的破坏性变更流程更新契约与客户端。
- 每条问题的状态栏更新为"已裁定 + 结论 + 生效里程碑"。

## 汇总

| # | 问题 | 建议默认 | 最晚确认点 | 状态 |
| --- | --- | --- | --- | --- |
| OQ-1 | `sourceStatus` 枚举缺"模板预置"来源 | 新增枚举值 `template_seeded` | M2 Schema 冻结前（最晚 M4 前） | 待裁定 |
| OQ-2 | 跨包 `templateOrigin` 结构化引用语义未定义 | `templateOrigin` 增加可选 `crossPackageRefs[]` | M4 开始前（P2 模板治理设计前） | 待裁定 |
| OQ-3 | `templateCandidate` 与 `state` 一致性是否进契约 | 规则码+findings 进契约，判定由服务端 Domain Guard 执行 | M2-05 规则实现前 | 待裁定 |
| OQ-4 | 附录 A 缺 500/未预期错误的稳定错误码 | **(A) 新增 `INTERNAL_ERROR`(500) 进契约**（对附录 A 的补充，总数 10→11，走变更单；team-lead 建议默认） | M1-06 契约代码生成前 | 待裁定 |
| OQ-5 | 租户上下文的最终来源（影响 400/401 语义） | **(B) 保留请求头，缺省 `VALIDATION_FAILED`(400)**（team-lead 临时裁定） | M1-03 开始前 | 待裁定 |

---

## OQ-1 `sourceStatus` 枚举缺少"模板预置"来源

**问题描述**
`sourceStatus` 现有 6 个取值——`user_statement` / `material_extracted` / `consultant_judgment` /
`agent_inference` / `confirmed_fact` / `approved_requirement`——中，**没有任何一个能表达"内容来自行业模板预置"**。
模板实例化（M4-01）产生的是"模板候选"，既非客户陈述、也非客户材料、也非顾问判断，需要一种可表达的来源状态。

**证据（谁在哪发现）**
- 发现者：contracts（本工作流）。核对实施方案 §4.2 `source_status`、产品设计文档 §8.6 来源状态表、
  开发方案附录 C 后确认枚举中无"模板预置"取值。
- 佐证：`packages/testkit/src/model-bundle.schema.ts#sourceStatusSchema` 同为 6 值；
  `docs/api/schemas/change-set.json#/$defs/confidenceState` 依据该来源状态定义，同为 6 值。
- team-lead 协同告警亦指向模板候选语义需要被正确表达。
- 并行登记：sample 已把同一缺口登记在 `docs/pilot/model-bundle-open-questions.md`（来源：sample 知会），
  两处登记应在裁定后一并对齐。

**影响面（Schema / 端点 / 里程碑）**
- Schema：ModelBundle 的 `sourceStatus`（testkit）、`change-set.json#/$defs/confidenceState`。
- 端点：`POST /projects/{id}/change-sets`、`POST /change-drafts/{id}/apply`（来源状态校验）、
  `GET /scenarios/{id}/model`（ModelBundle 展示）。
- 里程碑：M2（Schema 定义）、M4-01（模板实例化为 ChangeDraft）。

**可选项与后果**
| 选项 | 后果 |
| --- | --- |
| (a) 新增枚举值 `template_seeded` | 语义明确、便于规则区分模板候选；需同步 testkit schema + 契约 + 领域规则，属枚举扩展（需变更单）。 |
| (b) 允许模板草稿态 `sourceStatus = null` | 类型变可空，所有消费者需处理 null；与"无来源不得入基线"门禁的边界需另行定义。 |
| (c) 复用 `material_extracted` | 语义错误——模板不是客户材料；会污染"事实 vs 推断"分离（P4），不建议。 |

**建议默认**
选项 (a)：新增 `template_seeded`。理由：来源类型明确，且能让门禁规则区分"模板候选"与其他来源。

**最晚确认点**
M2 Schema 冻结前；最晚不得晚于 M4 模板实例化动工前。

**契约现状**
按现状 6 值引用，**未**新增该枚举值。

---

## OQ-2 跨包 `template_origin` 的结构化引用语义未定义

**问题描述**
行业知识包之间存在交叉引用（`docs/knowledge/manufacturing/` 交叉引用 `docs/knowledge/trade/` 的术语），
但"知识包之间的跨包引用"在数据模型层**没有声明方式**；`template_origin` 目前只能表达"本包内某个 item"。
manufacturing 包对 trade 的引用目前只是**文档层引用**，无法被实例化链路与治理链路结构化识别。

**证据（谁在哪发现）**
- 发现者：knowledge 工作流（知识包交叉引用实践）+ contracts（在模板来源契约评估中确认数据模型缺声明）。
- 佐证：team-lead 协同告警确认 `templateOrigin` 将改为逐对象的 `{ packageId, itemKey }` 结构，
  但该结构仍**只覆盖单包内 item**，未定义跨包引用。

**影响面（Schema / 端点 / 里程碑）**
- Schema：`template_item` 的种子结构；模板来源在 ChangeDraft/ChangeSet 中的引用表示。
- 端点：`POST /projects/{id}/change-sets`（模板实例化落库路径）、模板实例化链路。
- 里程碑：M4（模板机制）、P2 阶段（模板治理，方案 §9.5 / 开发方案附录 E）。

**可选项与后果**
| 选项 | 后果 |
| --- | --- |
| (a) `templateOrigin` 增加可选 `crossPackageRefs: [{ packageId, itemKey }]` | 显式支持跨包引用；结构略复杂，治理端需解析多包。 |
| (b) 实例化时把跨包引用"解析/展平"为本地 item | 结构简单；但来源语义丢失，无法追溯原始知识包，治理困难。 |
| (c) 每个包自带被引用术语的副本 | 无需跨包机制；但内容重复、易漂移，违反模板治理目标。 |

**建议默认**
选项 (a) 的最小扩展：保留 `templateOrigin.{ packageId, itemKey }`，新增可选
`crossPackageRefs: [{ packageId, itemKey }]`，由模板治理负责解析与校验。
说明：该扩展超出当前 M0 契约范围，落地须走变更单。

**最晚确认点**
M4 开始前；最晚 P2 模板治理设计冻结前。

**契约现状**
仅在 `docs/api` 记录该缺口；未新增 `templateOrigin` 结构（M0 契约不含模板种子结构）。

---

## OQ-3 `templateCandidate` 与 `state` 的一致性规则是否要进契约

**问题描述**
teammate `sample` 曾把 36 个对象全标 `templateCandidate=true`，其中 27 个 `state="confirmed"`，
违反产品红线（模板候选 = 尚未经客户核实）。已要求其新增领域规则 `TEMPLATE_CANDIDATE_CONFIRMED`(block)。
待裁定：这条规则**仅存在于领域校验器**，还是**也应作为 `ChangeSet`/`ChangeDraft` 的契约级约束**，
在 `problem+json` 的 `context.findings[]` 中表达？

**证据（谁在哪发现）**
- 发现者：team-lead（协同告警第 3 条）+ sample（demo-trade bundle 返工）。
- 具体：36 个对象全为 `templateCandidate=true`，其中 27 个 `state="confirmed"`，违反"模板候选不得与 confirmed/approved 共存"。
- 产物：`packages/testkit/fixtures/demo-trade/model-bundle.json`。

**影响面（Schema / 端点 / 里程碑）**
- Schema：`change-set.json`、`change-draft.json`（findings 表达）；`domain-rules.md` 规则清单。
- 端点：所有返回 `422 DOMAIN_RULE_BLOCKED` 的写入端点、`POST /change-drafts/{id}/validate` 的 findings。
- 里程碑：M2-05（规则实现）、M4-01（模板实例化）。

**可选项与后果**
| 选项 | 后果 |
| --- | --- |
| (a) 仅领域规则，不进契约 Schema | finding 结构已通用；规则码登记到 `domain-rules.md`；契约层不强制，但实现仍阻断。 |
| (b) 纯 JSON Schema 静态约束 | **不可行**：该规则需先解析对象现有 `state` 且跨字段/跨对象，JSON Schema 无法静态表达。 |
| (c) 契约登记规则码 + findings 表达，判定由服务端 Domain Guard 执行 | 契约可发现、可测；判定仍在服务端，符合 §5.3 两次校验。 |

**建议默认**
选项 (c)。理由：规则码与 finding 表达应进契约（`domain-rules.md` + findings schema），
但实际判定必须在服务端 `Domain Guard` 执行——因为"对象当前 state + templateCandidate"无法用
JSON Schema 静态表达。这与 §5.3「Schema Guard → Domain Guard → 应用时再校验」一致。

**最晚确认点**
M2-05 领域规则实现前。

**契约现状**
`docs/api/domain-rules.md` 保持开发方案附录 C 的 12 条规则不变，**未**擅自新增
`TEMPLATE_CANDIDATE_CONFIRMED`；待裁定后再登记。

---

## OQ-4 附录 A 缺 500/未预期错误的稳定错误码

**问题描述**
权威 10 个错误码中**没有** 500 类。但生产 API 必然存在未预期异常，客户端必须能可靠区分
"服务端故障"与"请求非法"。缺 500 码会导致实现自行发明 code（如 `INTERNAL_ERROR`），破坏严格枚举。

**证据（谁在哪发现）**
- 发现者：team-lead（已实测确认）。`apps/api/src/common/problem-details.filter.ts` 对 `status >= 500`
  返回 `INTERNAL_ERROR`，该值**不在** `docs/api/schemas/error-code.json` 的枚举内。
- 关联：`packages/contracts/src/index.ts#ERROR_CODES` 亦手写了不在权威枚举内的 code。
- 第四处违约（本问题另一证据）：同一过滤器的 `` return `HTTP_${status}` `` 兜底会产出**任意** code
  （如 `HTTP_403`）。team-lead 已要求 `foundation` 删除该兜底，改为**显式映射表 + 覆盖性测试**
  （未映射状态显式失败，而非静默造码）。

**影响面（Schema / 端点 / 里程碑）**
- Schema：`schemas/problem.json`（当前对 `error-code.json` 做**严格 `$ref`**）、OpenAPI 错误响应。
- 代码：生成客户端、`apps/api` 错误处理分支。
- 端点：所有返回 `application/problem+json` 的端点。
- 里程碑：M1-06（契约代码生成前）。

**可选项与后果**
| 选项 | 后果 |
| --- | --- |
| (A) 新增 `INTERNAL_ERROR`(500) 进契约 | 客户端可稳定区分服务端故障；总数 10→11，须走变更单正式登记。**建议默认** |
| (B) 保持 10 个，500 用 `about:blank` + 自由 code | 会破坏严格枚举，需同时放宽 `problem.json`（`code` 不再是封闭枚举）。**不推荐** |
| (C) 保持现状、长期接受违约 | 契约与实现持续漂移，客户端分支不可信。**不推荐** |

**建议默认**（team-lead 建议默认，待总指挥最终裁定）
选项 (A)：新增 `INTERNAL_ERROR`(500)。理由：缺 500 码更像**附录 A 的遗漏**，而非刻意范围决定；
在 README 与 `error-code.json` 显著记录这是对附录 A 的补充。落地须走变更单。

> **与"10 vs 11"事实更正的区分（避免误读为结论翻转）**
> 此前更正的是**事实陈述**：附录 A **实际列了 10 个**码（派单时"11 个"是误述），该项记录**不变**。
> OQ-4 是**另一件事**：附录 A **缺了一类必需的 500 错误语义**，生产 API 必然有未预期异常，
> 客户端必须能区分"服务端故障"与"请求非法"。因此新增 `INTERNAL_ERROR` 属于**变更单**
> （新增一类契约语义），不是对上述事实更正的推翻——一个是"现有码的数量"，一个是"缺失的语义类别"。

（在裁定前，`error-code.json` **保持 10 码不变**。）

**最晚确认点**
M1-06 契约代码生成前。

**契约现状**
`error-code.json` 仍为附录 A 的 10 码，**未**擅自新增 `INTERNAL_ERROR`。

---

## OQ-5 租户上下文的最终来源（影响 400/401 语义）

**问题描述**
实施方案 §7.1 规定：租户隔离由 repository 默认携带 tenant context、身份走 OIDC + BFF 会话。
但 `apps/api` 当前从**请求头 `x-tenant-id`** 取租户。若租户最终应由**会话**派生，
则"缺少租户上下文"的正确语义是 **401**（会话未绑定租户），而非 400。

**证据（谁在哪发现）**
- 发现者：team-lead（协同发现）+ foundation（实现现状）。
- 现状：`apps/api/src/common/tenant-context.ts` 使用 `TENANT_HEADER = 'x-tenant-id'`，缺省抛 400；
  M1-03（OIDC/BFF）因无 Docker 未实现，故当前是占位实现。

**影响面（Schema / 端点 / 里程碑）**
- Schema：错误码语义归属（400 vs 401），`problem.json` 的 code 选择。
- 设计：§7.1 身份与会话设计、生成客户端的认证流程。
- 里程碑：M1-03（OIDC/BFF 会话）。

**可选项与后果**
| 选项 | 后果 |
| --- | --- |
| (A) 租户由会话派生，缺省 `AUTH_REQUIRED`(401) | 与 §7.1 一致；客户端语义清晰（需重新登录） |
| (B) 保留请求头，缺省 `VALIDATION_FAILED`(400) | team-lead 的当前临时裁定；避免误导客户端重新登录；但与目标身份设计偏离 |
| (C) 两者并存，头优先、回退会话 | 兼容期平滑；但双来源易产生歧义与绕过风险 |

**建议默认**（team-lead 的临时裁定）
选项 (B)：保留请求头 `x-tenant-id`，缺省返回 `VALIDATION_FAILED`(400)。
理由：缺一个必需请求头，本质是**请求不完整**，客户端动作"定位字段/规则，不重试原请求"正好匹配；
而 `AUTH_REQUIRED`(401) 的客户端动作是"重新登录"，重新登录**并不能**补上这个头，会把客户端
引到**错误的恢复路径**——这比"码选得不精确"更严重。401 只应在"身份未建立/已失效"时出现。
M1-03 落地后是否切换为 (A) 会话派生（缺省 401）另行评估；届时同步修正契约语义说明。

**最晚确认点**
M1-03 开始前。

**契约现状**
按 team-lead 临时裁定 (B)：缺省 400 `VALIDATION_FAILED`；不影响错误码枚举，仅涉及 400/401 语义归属，
M1-03 后复核。

---

## 已裁定事项（追溯，非开放问题）

- **`meta.requestId` 约束对齐**（team-lead 于 2026-10-04 裁定）：成功响应 `meta.requestId` 与
  `problem.requestId`、`X-Request-Id` 响应头是**同一个逻辑值**，约束统一为 `^req_[A-Za-z0-9_-]+$`。
  已修复 `openapi.yaml` 的 `x-common-protocol.successEnvelope.meta`（原为无约束 `string`）与
  `Meta.requestId`（本就一致）对齐；`problem.json` 的 pattern **未放宽**。
  背景：`apps/api` 曾生成裸 UUID 并原样复用入站头（两条路径均违约），foundation 将改为生成
  `req_<32hex>`、入站仅在匹配 `^req_[A-Za-z0-9_-]{1,64}$` 时复用，否则替换并记入日志字段 `inboundRequestId`。
- **`Project.code` 约束对齐（A）**（team-lead 于 2026-10-04 裁定）：响应体 `Project.code` 加
  `pattern: ^[A-Z][A-Z0-9_-]{1,31}$`，与请求体 `ProjectCreate.code` 一致——同一被持久化值，两个边界都可检查。
  **来源标注**：该 pattern 出自**契约自身**（契约层约定），**不是**上游产品设计文档 / 开发方案规定的
  字符集格式；总指挥有权推翻此约定。
- **共享枚举抽取（B）**（team-lead 于 2026-10-04 裁定）：新建 `docs/api/schemas/common-defs.json`，
  以 `$defs` 提供 `OperationKind` / `TargetType` / `ScopeType`；`change-set.json` /
  `change-draft.json` / `agent-run.json` 改为 `$ref` 引用，消除同一语义枚举的多份副本。
- **ChangeSet 视图关系（C）**（team-lead 于 2026-10-04 确认，非冲突）：`ChangeSetResult.status`（恒 `applied`）
  是持久化 `RecentChangeSet.status`（draft/applied/rejected）的**窄化视图**；已在两个 schema 的
  `description` 显式记录该子集关系。**候选简化项（M2 评估，非待裁定）**：M2 实现这些端点时再评估是否合并为单一类型。
- **contracts ↔ `packages/contracts` 错误码漂移**（team-lead 已裁定）：
  命名对齐 `RESOURCE_NOT_FOUND`；`TENANT_CONTEXT_REQUIRED` → 改判 `VALIDATION_FAILED`(400)；
  删除任意 `HTTP_${status}` 兜底；新增**跨产物一致性测试**（读 `error-code.json` 的 `enum`
  断言 `packages/contracts` 的 TS 常量集合与之相等）以根治漂移。
  contracts 侧结论：`problem.json` 保持对 `error-code.json` 的**严格 `$ref`**，**不放宽**为自由字符串——
  正是该严格枚举暴露了上述违约。

---

## 附：与既有交付的关系

- 上述问题均**不阻塞** M0 契约草案的验证（Redocly lint 与 ajv 示例校验已通过）。
- 裁定前，`openapi.yaml` 与 `schemas/**` 按现状引用；`domain-rules.md` 维持 12 条。
