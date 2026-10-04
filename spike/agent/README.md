# M0-05 / M0-06 Agent 草案 Spike（`@reqatlas/spike-agent`）

受控 Agent 的结构化差异草案闭环：**中文输入 → Context Builder（最小上下文）→ Retriever（对象复用）
→ Provider Adapter → Schema Guard → Domain Guard → ChangeDraft → 逐项接受 → ChangeSet**。

裁定依据：`docs/adr/ADR-005.md`（自研编排 + Provider Adapter + JSON Schema，**Agent 无数据库写权限**）。
实施方案：§5.3（Agent 链路时序）、§6.1（M0-05/M0-06）、§6.6（M5）、§7.2（Agent 专项）。

## 目录

| 路径 | 说明 |
| --- | --- |
| `src/provider/` | `ProviderAdapter` 接口、确定性 `FakeProvider`、默认禁用的 `OpenAICompatibleProvider` |
| `src/context/` | Context Builder（scope 限定 + 检索排序 + 权限过滤 + token 预算裁剪） |
| `src/retriever/` | 名称/编号/术语检索，命中既有对象时**引用其稳定 ID**（复用而非重复创建） |
| `src/guard/schema-guard.ts` | ajv（draft 2020-12）**直接以 `docs/api/schemas/*.json` 为验证源** |
| `src/guard/project-bundle.ts` | 把草案变更投影到 bundle **深拷贝**（不动原 bundle），产出结构性 finding |
| `src/guard/domain-guard.ts` | 结构门禁 + 复用 `@reqatlas/testkit#validateBundle` 的语义规则 |
| `src/draft/` | 内存 DraftStore + `applyDraft`（逐项选择 → ChangeSet，无写库） |
| `src/artifacts.ts` | 机器可读产物的来源信封（**重算**并记录 `sourceBundleSha256`，不抄常量） |
| `src/orchestrator.ts` | AgentRun 状态机、超时/取消、一次修复、有界追问、预算阻断 |
| `src/golden/` | 四个中文金样例与确定性规划器 |
| `scripts/golden-run.ts` | 一条命令跑金样例端到端 |

**类型来源**：`ModelBundle` / `ModelObject` / `Evidence` / `EvidenceLink` / `SourceStatus` 等全部来自
`@reqatlas/testkit`（`export *`），本包**不自建结构定义**；`confidenceState` 直接复用 testkit 的
`sourceStatusSchema` 派生类型。

## 一条命令跑金样例

```bash
pnpm --filter @reqatlas/spike-agent golden
# 指定样例：
pnpm --filter @reqatlas/spike-agent golden -- --scenario=role-conflict
```

可选样例 id：`discount-approval`（折扣审批）、`credit-exception`（信用异常）、
`purchase-qc`（采购质检）、`role-conflict`（职责冲突）。
产物写入 `spike/agent/out/`（`change-draft.<id>.json` / `change-set.<id>.json`，仅文件，不写数据库）。

产物为**来源信封**：`{ metadata, payload }`。`metadata.sourceBundleSha256` **重算**自源 bundle 字节
（`src/artifacts.ts` 的 `buildArtifactEnvelope`，非从 `anchor.ts` 常量抄写），与 `basedOnRevision` 并列，
使产物**自证源自冻结基线**；`payload` 保持契约原样、可被 Schema Guard 直接校验。元数据只记录相对路径
（`sourceBundlePath = demo-trade/model-bundle.json`），不写本机绝对路径。
`artifact.test.ts` 与 `integrity.test.ts` 断言「产物记录哈希 == 重算值 == 冻结锚点」三者一致。

四门禁：

```bash
pnpm --filter @reqatlas/spike-agent typecheck
pnpm --filter @reqatlas/spike-agent build      # tsc --noEmit
pnpm --filter @reqatlas/spike-agent test       # 45 个用例，无 --passWithNoTests
pnpm --filter @reqatlas/spike-agent lint
```

## 如何切换 / 关闭 Provider

配置全部来自环境变量，**缺省即禁用外部模型**（安全默认）：

| 变量 | 作用 |
| --- | --- |
| `REQATLAS_AGENT_PROVIDER` | `openai` 才启用外部 provider；其它值/未设置 → 默认禁用 |
| `REQATLAS_AGENT_BASE_URL` | OpenAI 兼容端点（不含尾部 `/chat/completions`） |
| `REQATLAS_AGENT_API_KEY` | 凭据 |
| `REQATLAS_AGENT_MODEL` | 模型名（默认 `gpt-4o-mini`） |
| `REQATLAS_AGENT_TIMEOUT_MS` | 超时（默认 30000） |

- `createDefaultProvider()`：未设置 `REQATLAS_AGENT_PROVIDER=openai` 时返回 `enabled=false` 的实现，
  `complete()` 直接返回 `PROVIDER_DISABLED`，**不发起任何网络请求**（测试用 `fetch` spy 断言未被调用）。
- 测试与金样例一律使用 `FakeProvider`（确定性，可注入畸形 JSON、可延迟/取消）。
- **本机无外网模型凭据**：真实 provider 的联网路径**未验证**，测试中绝不调用联网分支，也**不伪造**模型响应。

## 如何证明「模型无写权限」

1. 结构上：Agent 的唯一产出是内存中的 `ChangeDraft`；`applyDraft` 只**返回** ChangeSet JSON，
   既不写数据库也不写 `model-bundle.json`。`src/guard/project-bundle.ts` 的所有改动都作用在
   `JSON.parse(JSON.stringify(bundle))` 的**深拷贝**上。
2. 证据上（`src/__tests__/integrity.test.ts`）：跑完全部金样例（草案 → 双校验 → 逐项 apply → ChangeSet）
   后，重算 `packages/testkit/fixtures/demo-trade/model-bundle.json` 的 sha256，仍未：
   `1a54c6e3158fb2d7a079fad244e30fd774c6b453e06d3859785978a184e03c62`。
   主断言是「链路前后哈希相等」（由被测数据派生），并列核对冻结锚点（见 `src/anchor.ts` 的一次性锚点说明）。

## 两次校验（§5.3）

- **Schema Guard**：ajv draft 2020-12，`-r` 语义通过 `addSchema` 注册全部契约 schema，
  以 `change-draft.json` / `change-set.json` / `problem.json` 为验证源；**不把 JSON Schema 抄成 zod**。
- **Domain Guard**：
  - 契约 12 条中与草案相关的语义规则：把草案投影到 bundle 深拷贝，复用 testkit `validateBundle`
    得到 findings（`ACTIVITY_NO_R`、`ACTIVITY_MULTI_A`、`FLOW_NO_END`、`REQUIREMENT_NO_SOURCE`、
    `OBJECT_NO_EVIDENCE`、`HANDOFF_NO_OBJECT`、`CROSS_PROJECT_REFERENCE` 等）。
  - `AGENT_ASSUMPTION`：草案 `assumptions` 非空即 `block`。
  - 结构性前置门禁（**不在 12 条契约规则码内**，沿用仓库既有先例，如需进契约须走变更单）：
    `SOURCE_REQUIRED`（事实型操作缺 `sourceRefs`）、`DANGLING_REFERENCE`（悬空 `targetId`/端点）、
    `UNKNOWN_ENUM`（未知 `kind`/`state`/`sourceStatus`/关系 `kind`）、`INVALID_OPERATION`。
  - `severity ∈ {block,error}` → `validation.blocking`（非空不可 apply）；`warn` → `validation.warnings`。

## `TEMPLATE_CANDIDATE_CONFIRMED` 待裁定（OQ-3）

本 Spike **未实现** `TEMPLATE_CANDIDATE_CONFIRMED`——它是 12 条之后的第 13 条候选规则，
状态见 `docs/api/open-questions.md#OQ-3`（**待裁定**）。裁定后再按契约变更流程登记与实现。

## 安全用例覆盖（全绿）

| 用例 | 位置 |
| --- | --- |
| `assumptions` 非空草案不可应用 | `security.test.ts`（AGENT_ASSUMPTION） |
| 无 `sourceRefs` 的事实型操作不可应用 | `security.test.ts`（SOURCE_REQUIRED） |
| 未知枚举 / 悬空 `targetId` 被拒 | `security.test.ts` + `domain-guard.test.ts` |
| 跨项目引用被阻断 | `domain-guard.test.ts`（CROSS_PROJECT_REFERENCE） |
| 追问超过 `options.maxQuestions` 截断，不无限追问 | `security.test.ts` |
| 超时/取消中断并保留已产出草案（`cancelled`） | `security.test.ts` |
| 预算超限阻断且不调用模型、不重试 | `security.test.ts` |
| 格式失败最多自动修复一次，仍失败则拒绝 | `schema-guard.test.ts` |

## 未验证 / 假设

- **真实 provider 联网调用未验证**（本机无外网模型凭据）；测试仅断言「配置可用」与「默认禁用不发请求」。
- **基于 `sourceStatus`/`confidenceState` 的基线门禁**（如 `agent_inference` 直接入基线）未实现：
  本 Spike 的基线门禁是 `sourceRefs` 必填 + `assumptions` 阻断，与 M5-09「无来源事实」一致；
  来源状态门禁与 OQ-1 相关，待裁定。
- 结构性门禁码（`SOURCE_REQUIRED` / `DANGLING_REFERENCE` / `UNKNOWN_ENUM` / `INVALID_OPERATION`）
  为本 Spike 的结构性前置门禁，**尚未登记进契约 12 条**。
